/**
 * Constraint Checker Module
 * 
 * Provides reusable constraint checking logic for shift scheduling.
 * Used for both validation and candidate evaluation.
 */

import type { Staff, ShiftSchedule, Holiday, ShiftPatternId, Settings, ShiftPatternDefinition } from '../types';
import { countsAsStaffingShift, getEffectiveWorkShiftId, getShiftPatternKind, isStaffActiveOnDate, isStaffAvailableOnWeekday, isTimeRangeStaff, isWorkShiftId, normalizeShiftPatterns, SHIFT_PATTERNS, staffAllowsShift } from '../types';
import { getDaysInMonth, getFormattedDate, isHoliday as checkIsHoliday } from './utils';
import { countFiscalYearLeave } from './leaveUtils';

// ============================================
// Types
// ============================================

export interface ConstraintViolation {
    type: 'hard' | 'soft';
    code: ConstraintCode;
    message: string;
}

export type ConstraintCode =
    // Hard constraints
    | 'J_TO_A'           // J翌日にA
    | 'CONSECUTIVE_A'    // A連続
    | 'CONSECUTIVE_J'    // J連続
    | 'INCOMPATIBLE'     // 相性NG
    | 'SAME_FLOOR'       // 同一フロア同一シフト
    | 'WEEKLY_AJ_LIMIT'  // 週2回目のA/J
    | 'SIX_CONSECUTIVE'  // 6連勤以上
    | 'MIN_COUNT_A'      // A枠減少
    | 'MIN_COUNT_J'      // J枠減少
    | 'STAFF_CONDITION'  // 職員ごとの勤務条件
    | 'MIN_TOTAL'        // 総人数不足
    | 'SUMMER_LEAVE_LIMIT' // 夏休の年度上限
    | 'SUMMER_LEAVE_MONTH' // 夏休の取得月制限
    // Soft constraints
    | 'EARLY_LIMIT'      // 早番制限超過
    | 'FAIRNESS_A'       // A回数偏り
    | 'FAIRNESS_J'       // J回数偏り
    | 'FAIRNESS_SAT';    // 土曜回数偏り

export interface CandidateEvaluation {
    staffId: number;
    staffName: string;
    violations: ConstraintViolation[];
    isAssignable: boolean; // No hard constraint violations
    currentShift: ShiftPatternId;
}

export interface ConstraintContext {
    schedule: ShiftSchedule;
    staff: Staff[];
    holidays: Holiday[];
    settings: Settings;
    year: number;
    month: number;
    patterns: ShiftPatternDefinition[];
}

export interface ConstraintCheckOptions {
    includeSoft?: boolean;
    ignoreCodes?: ConstraintCode[];
    previousShift?: ShiftPatternId;
}

// ============================================
// Helper Functions
// ============================================

function getShift(ctx: ConstraintContext, day: number, staffId: number): ShiftPatternId {
    const dateStr = getFormattedDate(ctx.year, ctx.month, day);
    return ctx.schedule[dateStr]?.[staffId] || '';
}

function getShiftKind(ctx: ConstraintContext, shift: ShiftPatternId | undefined | null) {
    return getShiftPatternKind(shift, ctx.patterns);
}

function isOpeningShift(ctx: ConstraintContext, shift: ShiftPatternId | undefined | null): boolean {
    return getShiftKind(ctx, shift) === 'opening';
}

function isEarlyLimitedShift(ctx: ConstraintContext, shift: ShiftPatternId | undefined | null): boolean {
    const kind = getShiftKind(ctx, shift);
    return kind === 'opening' || kind === 'early';
}

function isClosingShift(ctx: ConstraintContext, shift: ShiftPatternId | undefined | null): boolean {
    return getShiftKind(ctx, shift) === 'closing';
}

function isHoliday(ctx: ConstraintContext, day: number): boolean {
    const dateStr = getFormattedDate(ctx.year, ctx.month, day);
    return checkIsHoliday(dateStr, ctx.holidays);
}

function isSunday(ctx: ConstraintContext, day: number): boolean {
    const date = new Date(ctx.year, ctx.month - 1, day);
    return date.getDay() === 0;
}

function getPreviousWorkDay(ctx: ConstraintContext, day: number): number {
    let d = day - 1;
    while (d >= 1) {
        if (!isSunday(ctx, d) && !isHoliday(ctx, d)) return d;
        d--;
    }
    return 0;
}

function getNextWorkDay(ctx: ConstraintContext, day: number): number {
    let d = day + 1;
    const daysInMonth = getDaysInMonth(ctx.year, ctx.month);
    while (d <= daysInMonth) {
        if (!isSunday(ctx, d) && !isHoliday(ctx, d)) return d;
        d++;
    }
    return 0;
}

// Count pattern for a staff member in the entire month
function countMonthlyPattern(ctx: ConstraintContext, staffId: number, pattern: ShiftPatternId): number {
    const daysInMonth = getDaysInMonth(ctx.year, ctx.month);
    let count = 0;
    for (let d = 1; d <= daysInMonth; d++) {
        if (getEffectiveWorkShiftId(getShift(ctx, d, staffId)) === pattern) count++;
    }
    return count;
}

function countWeeklyWorkDays(ctx: ConstraintContext, staffId: number, day: number): number {
    const date = new Date(ctx.year, ctx.month - 1, day);
    const dayOfWeek = date.getDay();
    if (dayOfWeek === 0) return 0;

    const startOfWeek = day - (dayOfWeek - 1);
    const endOfWeek = startOfWeek + 5;
    const daysInMonth = getDaysInMonth(ctx.year, ctx.month);
    let count = 0;

    for (let d = startOfWeek; d <= endOfWeek; d++) {
        if (d < 1 || d > daysInMonth || d === day) continue;
        if (countsAsStaffingShift(getShift(ctx, d, staffId), getFormattedDate(ctx.year, ctx.month, d))) count++;
    }

    return count;
}

function countConsecutiveWorkDays(ctx: ConstraintContext, staffId: number, day: number): number {
    let count = 1;

    let d = day - 1;
    while (d >= 1) {
        if (!countsAsStaffingShift(getShift(ctx, d, staffId), getFormattedDate(ctx.year, ctx.month, d))) break;
        count++;
        d--;
    }

    const daysInMonth = getDaysInMonth(ctx.year, ctx.month);
    d = day + 1;
    while (d <= daysInMonth) {
        if (!countsAsStaffingShift(getShift(ctx, d, staffId), getFormattedDate(ctx.year, ctx.month, d))) break;
        count++;
        d++;
    }

    return count;
}

// Count early-limited shifts for a staff member
function countEarlyShifts(ctx: ConstraintContext, staffId: number): number {
    const daysInMonth = getDaysInMonth(ctx.year, ctx.month);
    let count = 0;
    for (let d = 1; d <= daysInMonth; d++) {
        const shift = getShift(ctx, d, staffId);
        if (isEarlyLimitedShift(ctx, shift)) count++;
    }
    return count;
}

// Count total pattern on a specific day
function countDayPattern(ctx: ConstraintContext, day: number, pattern: ShiftPatternId): number {
    const dateStr = getFormattedDate(ctx.year, ctx.month, day);
    let count = 0;
    for (const staffId in ctx.schedule[dateStr] || {}) {
        if (getEffectiveWorkShiftId(ctx.schedule[dateStr][Number(staffId)]) === pattern) count++;
    }
    return count;
}

// ============================================
// Constraint Check Functions
// ============================================

/**
 * Check closing->opening violation (インターバル確保)
 * Cannot assign an opening shift if previous day was closing
 */
function checkJToAViolation(ctx: ConstraintContext, day: number, staffId: number, shift: ShiftPatternId): ConstraintViolation | null {
    if (!isOpeningShift(ctx, shift)) return null;

    const prevDay = getPreviousWorkDay(ctx, day);
    if (prevDay === 0) return null;

    const prevShift = getShift(ctx, prevDay, staffId);
    if (isClosingShift(ctx, prevShift)) {
        return {
            type: 'hard',
            code: 'J_TO_A',
            message: '閉園→開園シフト違反（前日が閉園シフト）'
        };
    }
    return null;
}

/**
 * Check opening after closing violation (reverse check for when assigning closing)
 * Cannot assign a closing shift if next work day is already opening
 */
function checkAToJViolation(ctx: ConstraintContext, day: number, staffId: number, shift: ShiftPatternId): ConstraintViolation | null {
    if (!isClosingShift(ctx, shift)) return null;

    const nextDay = getNextWorkDay(ctx, day);
    if (nextDay === 0) return null;

    const nextShift = getShift(ctx, nextDay, staffId);
    if (isOpeningShift(ctx, nextShift)) {
        return {
            type: 'hard',
            code: 'J_TO_A',
            message: '閉園→開園シフト違反（翌日が開園シフト）'
        };
    }
    return null;
}

/**
 * Check consecutive opening or closing violation
 */
function checkConsecutiveViolation(ctx: ConstraintContext, day: number, staffId: number, shift: ShiftPatternId): ConstraintViolation | null {
    if (!isOpeningShift(ctx, shift) && !isClosingShift(ctx, shift)) return null;

    // Check previous day
    const prevDay = getPreviousWorkDay(ctx, day);
    if (prevDay > 0) {
        const prevShift = getShift(ctx, prevDay, staffId);
        if ((isOpeningShift(ctx, shift) && isOpeningShift(ctx, prevShift)) || (isClosingShift(ctx, shift) && isClosingShift(ctx, prevShift))) {
            return {
                type: 'hard',
                code: isOpeningShift(ctx, shift) ? 'CONSECUTIVE_A' : 'CONSECUTIVE_J',
                message: `${shift}系統の連続勤務`
            };
        }
    }

    // Check next day
    const nextDay = getNextWorkDay(ctx, day);
    if (nextDay > 0) {
        const nextShift = getShift(ctx, nextDay, staffId);
        if ((isOpeningShift(ctx, shift) && isOpeningShift(ctx, nextShift)) || (isClosingShift(ctx, shift) && isClosingShift(ctx, nextShift))) {
            return {
                type: 'hard',
                code: isOpeningShift(ctx, shift) ? 'CONSECUTIVE_A' : 'CONSECUTIVE_J',
                message: `${shift}系統の連続勤務`
            };
        }
    }

    return null;
}

/**
 * Check incompatible staff conflict
 */
function checkIncompatibleViolation(ctx: ConstraintContext, day: number, staffId: number, shift: ShiftPatternId): ConstraintViolation | null {
    const targetStaff = ctx.staff.find(s => s.id === staffId);
    if (!targetStaff || !targetStaff.incompatibleWith?.length) return null;

    const dateStr = getFormattedDate(ctx.year, ctx.month, day);
    for (const incompatibleId of targetStaff.incompatibleWith) {
        const incompatibleShift = ctx.schedule[dateStr]?.[incompatibleId];
        if (incompatibleShift === shift) {
            const incompatibleStaff = ctx.staff.find(s => s.id === incompatibleId);
            return {
                type: 'hard',
                code: 'INCOMPATIBLE',
                message: `相性NG（${incompatibleStaff?.name || '不明'}さんと同じシフト）`
            };
        }
    }
    return null;
}

function checkSameFloorViolation(ctx: ConstraintContext, day: number, staffId: number, shift: ShiftPatternId): ConstraintViolation | null {
    const targetStaff = ctx.staff.find(s => s.id === staffId);
    if (!targetStaff?.floor || targetStaff.floor === 'free' || targetStaff.floor === 'none') return null;
    if (!isWorkShiftId(shift)) return null;

    const dateStr = getFormattedDate(ctx.year, ctx.month, day);
    const sameFloorStaff = ctx.staff.filter(s =>
        s.id !== staffId &&
        s.floor === targetStaff.floor &&
        s.floor !== 'free' &&
        s.floor !== 'none'
    );

    const effectiveShift = getEffectiveWorkShiftId(shift);
    const conflictStaff = sameFloorStaff.find(s => getEffectiveWorkShiftId(ctx.schedule[dateStr]?.[s.id]) === effectiveShift);
    if (!conflictStaff) return null;

    return {
        type: 'soft',
        code: 'SAME_FLOOR',
        message: `同一フロアで同じシフト（${conflictStaff.name}さん）`
    };
}

function applyConstraintOptions(
    violations: ConstraintViolation[],
    options: ConstraintCheckOptions = {}
): ConstraintViolation[] {
    const ignoreCodes = options.ignoreCodes || [];
    return violations.filter(v => {
        if (ignoreCodes.includes(v.code)) return false;
        if (options.includeSoft === false && v.type === 'soft') return false;
        return true;
    });
}

function checkStaffConditionViolation(ctx: ConstraintContext, day: number, staffId: number, shift: ShiftPatternId): ConstraintViolation | null {
    if (!isWorkShiftId(shift)) return null;

    const targetStaff = ctx.staff.find(s => s.id === staffId);
    if (!targetStaff) return null;

    const dateStr = getFormattedDate(ctx.year, ctx.month, day);
    if (!isStaffActiveOnDate(targetStaff, dateStr)) {
        return {
            type: 'hard',
            code: 'STAFF_CONDITION',
            message: '在籍期間外です'
        };
    }

    const weekday = new Date(ctx.year, ctx.month - 1, day).getDay();
    if (!isStaffAvailableOnWeekday(targetStaff, weekday)) {
        return {
            type: 'hard',
            code: 'STAFF_CONDITION',
            message: '勤務不可曜日です'
        };
    }

    if (targetStaff.weeklyDays <= 0) {
        return {
            type: 'hard',
            code: 'STAFF_CONDITION',
            message: '週勤務上限が0日です'
        };
    }

    if (countWeeklyWorkDays(ctx, staffId, day) >= targetStaff.weeklyDays) {
        return {
            type: 'hard',
            code: 'STAFF_CONDITION',
            message: `週勤務上限(${targetStaff.weeklyDays}日)を超えます`
        };
    }

    if (!staffAllowsShift(targetStaff, shift)) {
        return {
            type: 'hard',
            code: 'STAFF_CONDITION',
            message: '勤務可能シフト外です'
        };
    }

    return null;
}

function checkLimitedLeaveViolation(ctx: ConstraintContext, day: number, staffId: number, shift: ShiftPatternId): ConstraintViolation | null {
    if (shift !== '夏休') return null;

    const dateStr = getFormattedDate(ctx.year, ctx.month, day);

    if (ctx.month < 6 || ctx.month > 8) {
        return {
            type: 'hard',
            code: 'SUMMER_LEAVE_MONTH',
            message: '夏休は6月・7月・8月のみ取得できます'
        };
    }

    const usedDays = countFiscalYearLeave(ctx.schedule, staffId, shift, dateStr, dateStr);
    if (usedDays >= 3) {
        return {
            type: 'hard',
            code: 'SUMMER_LEAVE_LIMIT',
            message: `夏休は年度3日までです（使用済み${usedDays}日）`
        };
    }

    return null;
}

function checkSixConsecutiveViolation(ctx: ConstraintContext, day: number, staffId: number, shift: ShiftPatternId): ConstraintViolation | null {
    if (!isWorkShiftId(shift)) return null;

    const consecutiveDays = countConsecutiveWorkDays(ctx, staffId, day);
    if (consecutiveDays < 6) return null;

    return {
        type: 'soft',
        code: 'SIX_CONSECUTIVE',
        message: `${consecutiveDays}日連勤になります`
    };
}

/**
 * Check weekly A/J limit (max 1 per week)
 */
function checkWeeklyAJLimitViolation(ctx: ConstraintContext, day: number, staffId: number, shift: ShiftPatternId): ConstraintViolation | null {
    if (!isOpeningShift(ctx, shift) && !isClosingShift(ctx, shift)) return null;

    const date = new Date(ctx.year, ctx.month - 1, day);
    const dayOfWeek = date.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat

    if (dayOfWeek === 0) return null; // Sunday

    // Calculate week range (Mon-Sat)
    const startOfWeek = day - (dayOfWeek - 1);
    const endOfWeek = startOfWeek + 5;

    let count = 0;
    for (let d = startOfWeek; d <= endOfWeek; d++) {
        if (d < 1 || d === day) continue; // Skip if before month or current day
        const daysInMonth = getDaysInMonth(ctx.year, ctx.month);
        if (d > daysInMonth) continue;

        const existingShift = getShift(ctx, d, staffId);
        if (isOpeningShift(ctx, existingShift) || isClosingShift(ctx, existingShift)) {
            count++;
        }
    }

    if (count >= 1) {
        return {
            type: 'hard',
            code: 'WEEKLY_AJ_LIMIT',
            message: '週2回目の開園・閉園シフト'
        };
    }
    return null;
}

/**
 * Check if minimum count would be violated by removing from current shift
 */
function checkMinCountViolation(
    ctx: ConstraintContext,
    day: number,
    staffId: number,
    newShift: ShiftPatternId,
    options: ConstraintCheckOptions = {}
): ConstraintViolation | null {
    const previousShift = options.previousShift ?? getShift(ctx, day, staffId);
    if (!previousShift || previousShift === newShift || !isWorkShiftId(previousShift)) return null;

    const previousEffectiveShift = getEffectiveWorkShiftId(previousShift);
    if (!previousEffectiveShift) return null;

    const pattern = ctx.patterns.find(p => p.id === previousEffectiveShift);
    const minCount = pattern?.minCount || 0;
    if (minCount <= 0) return null;

    const currentCellShift = getShift(ctx, day, staffId);
    const alreadyChanged = currentCellShift === newShift;
    const remainingCount = countDayPattern(ctx, day, previousEffectiveShift) - (alreadyChanged ? 0 : 1);

    if (remainingCount < minCount) {
        return {
            type: 'hard',
            code: isOpeningShift(ctx, previousEffectiveShift) ? 'MIN_COUNT_A' : 'MIN_COUNT_J',
            message: `${previousEffectiveShift}枠が${remainingCount}名に減少`
        };
    }

    return null;
}

/**
 * Check early shift limit (soft constraint)
 */
function checkEarlyLimitViolation(ctx: ConstraintContext, _day: number, staffId: number, shift: ShiftPatternId): ConstraintViolation | null {
    if (!isEarlyLimitedShift(ctx, shift)) return null;

    const targetStaff = ctx.staff.find(s => s.id === staffId);
    if (!targetStaff || targetStaff.earlyShiftLimit === null) return null;

    const currentCount = countEarlyShifts(ctx, staffId);
    if (currentCount >= targetStaff.earlyShiftLimit) {
        return {
            type: 'soft',
            code: 'EARLY_LIMIT',
            message: `月間早番制限超過（${currentCount}/${targetStaff.earlyShiftLimit}回）`
        };
    }
    return null;
}

/**
 * Check fairness violation (soft constraint)
 */
function checkFairnessViolation(ctx: ConstraintContext, _day: number, staffId: number, shift: ShiftPatternId): ConstraintViolation | null {
    if (!isOpeningShift(ctx, shift) && !isClosingShift(ctx, shift)) return null;

    // Calculate average for regular staff
    const regularStaff = ctx.staff.filter(s => s.shiftType === 'regular' && !isTimeRangeStaff(s));
    if (regularStaff.length === 0) return null;

    const counts = regularStaff.map(s => countMonthlyPattern(ctx, s.id, shift));
    const avg = counts.reduce((a, b) => a + b, 0) / counts.length;

    const targetStaff = ctx.staff.find(s => s.id === staffId);
    if (!targetStaff || targetStaff.shiftType !== 'regular' || isTimeRangeStaff(targetStaff)) return null;

    const myCount = countMonthlyPattern(ctx, staffId, shift);
    if (myCount > avg + 1) {
        return {
            type: 'soft',
            code: isOpeningShift(ctx, shift) ? 'FAIRNESS_A' : 'FAIRNESS_J',
            message: `${shift}回数が平均を超過（${myCount}回、平均${avg.toFixed(1)}回）`
        };
    }
    return null;
}

// ============================================
// Main API Functions
// ============================================

/**
 * Check all constraints for a specific cell change
 */
export function checkConstraints(
    ctx: ConstraintContext,
    day: number,
    staffId: number,
    newShift: ShiftPatternId,
    options: ConstraintCheckOptions = {}
): ConstraintViolation[] {
    const violations: ConstraintViolation[] = [];

    // Hard constraints
    const jToA = checkJToAViolation(ctx, day, staffId, newShift);
    if (jToA) violations.push(jToA);

    const aToJ = checkAToJViolation(ctx, day, staffId, newShift);
    if (aToJ) violations.push(aToJ);

    const consecutive = checkConsecutiveViolation(ctx, day, staffId, newShift);
    if (consecutive) violations.push(consecutive);

    const incompatible = checkIncompatibleViolation(ctx, day, staffId, newShift);
    if (incompatible) violations.push(incompatible);

    const sameFloor = checkSameFloorViolation(ctx, day, staffId, newShift);
    if (sameFloor) violations.push(sameFloor);

    const staffCondition = checkStaffConditionViolation(ctx, day, staffId, newShift);
    if (staffCondition) violations.push(staffCondition);

    const limitedLeave = checkLimitedLeaveViolation(ctx, day, staffId, newShift);
    if (limitedLeave) violations.push(limitedLeave);

    const weeklyLimit = checkWeeklyAJLimitViolation(ctx, day, staffId, newShift);
    if (weeklyLimit) violations.push(weeklyLimit);

    const minCount = checkMinCountViolation(ctx, day, staffId, newShift, options);
    if (minCount) violations.push(minCount);

    // Soft constraints
    const sixConsecutive = checkSixConsecutiveViolation(ctx, day, staffId, newShift);
    if (sixConsecutive) violations.push(sixConsecutive);

    const earlyLimit = checkEarlyLimitViolation(ctx, day, staffId, newShift);
    if (earlyLimit) violations.push(earlyLimit);

    const fairness = checkFairnessViolation(ctx, day, staffId, newShift);
    if (fairness) violations.push(fairness);

    return applyConstraintOptions(violations, options);
}

export function canAssignShift(
    ctx: ConstraintContext,
    day: number,
    staffId: number,
    shift: ShiftPatternId,
    options: ConstraintCheckOptions = { includeSoft: false }
): boolean {
    return checkConstraints(ctx, day, staffId, shift, options).length === 0;
}

/**
 * Evaluate all candidates for a specific cell/shift
 */
export function evaluateCandidates(
    ctx: ConstraintContext,
    day: number,
    targetShift: ShiftPatternId
): CandidateEvaluation[] {
    const candidates: CandidateEvaluation[] = [];
    const dateStr = getFormattedDate(ctx.year, ctx.month, day);

    // Filter eligible staff (regular and backup only for main shifts)
    const eligibleStaff = ctx.staff.filter(s =>
        isStaffActiveOnDate(s, dateStr) &&
        (s.shiftType === 'regular' || s.shiftType === 'backup') && !isTimeRangeStaff(s)
    );

    for (const staff of eligibleStaff) {
        const currentShift = getShift(ctx, day, staff.id);

        // Skip if already assigned to target shift
        if (currentShift === targetShift) continue;

        // Skip if on fixed plans or leave
        if (currentShift && !isWorkShiftId(currentShift)) continue;

        const violations = checkConstraints(ctx, day, staff.id, targetShift);
        const hasHardViolation = violations.some(v => v.type === 'hard');

        candidates.push({
            staffId: staff.id,
            staffName: staff.name,
            violations,
            isAssignable: !hasHardViolation,
            currentShift
        });
    }

    // Sort: assignable first, then by violation count
    candidates.sort((a, b) => {
        if (a.isAssignable !== b.isAssignable) {
            return a.isAssignable ? -1 : 1;
        }
        return a.violations.length - b.violations.length;
    });

    return candidates;
}

/**
 * Get impact preview for changing a cell
 * Shows what violations would occur if the cell is changed
 */
export function getImpactPreview(
    ctx: ConstraintContext,
    day: number,
    staffId: number,
    newShift: ShiftPatternId
): {
    violations: ConstraintViolation[];
    isAllowed: boolean;
    summary: string;
} {
    const violations = checkConstraints(ctx, day, staffId, newShift);
    const hardViolations = violations.filter(v => v.type === 'hard');
    const softViolations = violations.filter(v => v.type === 'soft');

    let summary: string;
    if (hardViolations.length > 0) {
        summary = `⚠️ ${hardViolations.length}件のハード制約違反`;
    } else if (softViolations.length > 0) {
        summary = `⚡ ${softViolations.length}件の推奨違反（変更可能）`;
    } else {
        summary = '✓ 変更可能';
    }

    return {
        violations,
        isAllowed: hardViolations.length === 0,
        summary
    };
}

/**
 * Create constraint context from app state
 */
export function createConstraintContext(
    schedule: ShiftSchedule,
    staff: Staff[],
    holidays: Holiday[],
    settings: Settings,
    year: number,
    month: number,
    patterns: ShiftPatternDefinition[] = SHIFT_PATTERNS
): ConstraintContext {
    return { schedule, staff, holidays, settings, year, month, patterns: normalizeShiftPatterns(patterns) };
}

// ============================================
// Swap Suggestions
// ============================================

export interface SwapSuggestion {
    staffA: { id: number; name: string; currentShift: ShiftPatternId };
    staffB: { id: number; name: string; currentShift: ShiftPatternId };
    description: string;
    benefit: string;
}

/**
 * Find swap suggestions that could resolve a shortage
 * Looks for pairs where swapping their shifts would fill a needed position
 */
export function findSwapSuggestions(
    ctx: ConstraintContext,
    day: number,
    shortagePattern: ShiftPatternId
): SwapSuggestion[] {
    const suggestions: SwapSuggestion[] = [];
    const dateStr = getFormattedDate(ctx.year, ctx.month, day);

    // Get all regular staff
    const regularStaff = ctx.staff.filter(s =>
        (s.shiftType === 'regular' || s.shiftType === 'backup') && !isTimeRangeStaff(s)
    );

    // Find staff who could take the shortage pattern
    for (const candidateA of regularStaff) {
        const currentShiftA = ctx.schedule[dateStr]?.[candidateA.id] || '';

        // Skip if already on the needed shift, on leave, or not working
        if (currentShiftA === shortagePattern ||
            !isWorkShiftId(currentShiftA)) continue;

        // Check if this staff can take the shortage pattern
        const violationsA = checkConstraints(ctx, day, candidateA.id, shortagePattern);
        const canTakeShortage = !violationsA.some(v => v.type === 'hard');

        if (!canTakeShortage) continue;

        // Find someone who can take candidateA's current shift
        for (const candidateB of regularStaff) {
            if (candidateA.id === candidateB.id) continue;

            const currentShiftB = ctx.schedule[dateStr]?.[candidateB.id] || '';

            // Skip if on leave or already has A's current shift
            if (!isWorkShiftId(currentShiftB) ||
                currentShiftB === currentShiftA) continue;

            // Check if B can take A's current shift
            const violationsB = checkConstraints(ctx, day, candidateB.id, currentShiftA);
            const canTakeAShift = !violationsB.some(v => v.type === 'hard');

            if (!canTakeAShift) continue;

            // Valid swap found!
            suggestions.push({
                staffA: {
                    id: candidateA.id,
                    name: candidateA.name,
                    currentShift: currentShiftA
                },
                staffB: {
                    id: candidateB.id,
                    name: candidateB.name,
                    currentShift: currentShiftB
                },
                description: `${candidateA.name}(${currentShiftA}) ⇄ ${candidateB.name}(${currentShiftB || '休'})`,
                benefit: `${shortagePattern}枠が確保されます`
            });

            // Limit suggestions to prevent overwhelming the user
            if (suggestions.length >= 3) return suggestions;
        }
    }

    return suggestions;
}

/**
 * Find shortages on a specific day
 */
export function findShortages(
    ctx: ConstraintContext,
    day: number
): { pattern: ShiftPatternId; current: number; required: number }[] {
    const shortages: { pattern: ShiftPatternId; current: number; required: number }[] = [];
    const dateStr = getFormattedDate(ctx.year, ctx.month, day);

    const minCounts = ctx.patterns
        .filter(pattern => (isOpeningShift(ctx, pattern.id) || isClosingShift(ctx, pattern.id)) && pattern.minCount > 0)
        .map(pattern => ({ pattern: pattern.id, min: pattern.minCount }));

    for (const { pattern, min } of minCounts) {
        let count = 0;
        for (const staffId in ctx.schedule[dateStr] || {}) {
            if (ctx.schedule[dateStr][Number(staffId)] === pattern) count++;
        }

        if (count < min) {
            shortages.push({ pattern, current: count, required: min });
        }
    }

    return shortages;
}
