/**
 * Constraint Checker Module
 * 
 * Provides reusable constraint checking logic for shift scheduling.
 * Used for both validation and candidate evaluation.
 */

import type { Staff, ShiftSchedule, Holiday, ShiftPatternId, Settings } from '../types';
import { getDaysInMonth, getFormattedDate, isHoliday as checkIsHoliday } from './utils';

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
    | 'WEEKLY_AJ_LIMIT'  // 週2回目のA/J
    | 'MIN_COUNT_A'      // A枠減少
    | 'MIN_COUNT_J'      // J枠減少
    | 'MIN_TOTAL'        // 総人数不足
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
}

// ============================================
// Helper Functions
// ============================================

function getShift(ctx: ConstraintContext, day: number, staffId: number): ShiftPatternId {
    const dateStr = getFormattedDate(ctx.year, ctx.month, day);
    return ctx.schedule[dateStr]?.[staffId] || '';
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
        if (getShift(ctx, d, staffId) === pattern) count++;
    }
    return count;
}

// Count early shifts (A + B) for a staff member
function countEarlyShifts(ctx: ConstraintContext, staffId: number): number {
    const daysInMonth = getDaysInMonth(ctx.year, ctx.month);
    let count = 0;
    for (let d = 1; d <= daysInMonth; d++) {
        const shift = getShift(ctx, d, staffId);
        if (shift === 'A' || shift === 'B') count++;
    }
    return count;
}

// Count total pattern on a specific day
function countDayPattern(ctx: ConstraintContext, day: number, pattern: ShiftPatternId): number {
    const dateStr = getFormattedDate(ctx.year, ctx.month, day);
    let count = 0;
    for (const staffId in ctx.schedule[dateStr] || {}) {
        if (ctx.schedule[dateStr][Number(staffId)] === pattern) count++;
    }
    return count;
}

// ============================================
// Constraint Check Functions
// ============================================

/**
 * Check J->A violation (インターバル確保)
 * Cannot assign A shift if previous day was J
 */
function checkJToAViolation(ctx: ConstraintContext, day: number, staffId: number, shift: ShiftPatternId): ConstraintViolation | null {
    if (shift !== 'A') return null;

    const prevDay = getPreviousWorkDay(ctx, day);
    if (prevDay === 0) return null;

    const prevShift = getShift(ctx, prevDay, staffId);
    if (prevShift === 'J') {
        return {
            type: 'hard',
            code: 'J_TO_A',
            message: 'J→A違反（前日が最遅番）'
        };
    }
    return null;
}

/**
 * Check A->J violation (reverse check for when assigning J)
 * Cannot assign J if next day is already A
 */
function checkAToJViolation(ctx: ConstraintContext, day: number, staffId: number, shift: ShiftPatternId): ConstraintViolation | null {
    if (shift !== 'J') return null;

    const nextDay = getNextWorkDay(ctx, day);
    if (nextDay === 0) return null;

    const nextShift = getShift(ctx, nextDay, staffId);
    if (nextShift === 'A') {
        return {
            type: 'hard',
            code: 'J_TO_A',
            message: 'J→A違反（翌日が早番）'
        };
    }
    return null;
}

/**
 * Check consecutive A or J violation
 */
function checkConsecutiveViolation(ctx: ConstraintContext, day: number, staffId: number, shift: ShiftPatternId): ConstraintViolation | null {
    if (shift !== 'A' && shift !== 'J') return null;

    // Check previous day
    const prevDay = getPreviousWorkDay(ctx, day);
    if (prevDay > 0) {
        const prevShift = getShift(ctx, prevDay, staffId);
        if (prevShift === shift) {
            return {
                type: 'hard',
                code: shift === 'A' ? 'CONSECUTIVE_A' : 'CONSECUTIVE_J',
                message: `${shift}連続勤務`
            };
        }
    }

    // Check next day
    const nextDay = getNextWorkDay(ctx, day);
    if (nextDay > 0) {
        const nextShift = getShift(ctx, nextDay, staffId);
        if (nextShift === shift) {
            return {
                type: 'hard',
                code: shift === 'A' ? 'CONSECUTIVE_A' : 'CONSECUTIVE_J',
                message: `${shift}連続勤務`
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

/**
 * Check weekly A/J limit (max 1 per week)
 */
function checkWeeklyAJLimitViolation(ctx: ConstraintContext, day: number, staffId: number, shift: ShiftPatternId): ConstraintViolation | null {
    if (shift !== 'A' && shift !== 'J') return null;

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
        if (existingShift === 'A' || existingShift === 'J') {
            count++;
        }
    }

    if (count >= 1) {
        return {
            type: 'hard',
            code: 'WEEKLY_AJ_LIMIT',
            message: '週2回目のA/J'
        };
    }
    return null;
}

/**
 * Check if minimum count would be violated by removing from current shift
 */
function checkMinCountViolation(ctx: ConstraintContext, day: number, staffId: number, _newShift: ShiftPatternId): ConstraintViolation | null {
    const currentShift = getShift(ctx, day, staffId);

    // If removing from A or J, check if it would cause shortage
    if (currentShift === 'A' || currentShift === 'J') {
        const currentCount = countDayPattern(ctx, day, currentShift);
        if (currentCount <= 2) { // Min count is 2 for both A and J
            return {
                type: 'hard',
                code: currentShift === 'A' ? 'MIN_COUNT_A' : 'MIN_COUNT_J',
                message: `${currentShift}枠が${currentCount - 1}名に減少`
            };
        }
    }

    return null;
}

/**
 * Check early shift limit (soft constraint)
 */
function checkEarlyLimitViolation(ctx: ConstraintContext, _day: number, staffId: number, shift: ShiftPatternId): ConstraintViolation | null {
    if (shift !== 'A' && shift !== 'B') return null;

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
    if (shift !== 'A' && shift !== 'J') return null;

    // Calculate average for regular staff
    const regularStaff = ctx.staff.filter(s => s.shiftType === 'regular');
    if (regularStaff.length === 0) return null;

    const counts = regularStaff.map(s => countMonthlyPattern(ctx, s.id, shift));
    const avg = counts.reduce((a, b) => a + b, 0) / counts.length;

    const targetStaff = ctx.staff.find(s => s.id === staffId);
    if (!targetStaff || targetStaff.shiftType !== 'regular') return null;

    const myCount = countMonthlyPattern(ctx, staffId, shift);
    if (myCount > avg + 1) {
        return {
            type: 'soft',
            code: shift === 'A' ? 'FAIRNESS_A' : 'FAIRNESS_J',
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
    newShift: ShiftPatternId
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

    const weeklyLimit = checkWeeklyAJLimitViolation(ctx, day, staffId, newShift);
    if (weeklyLimit) violations.push(weeklyLimit);

    const minCount = checkMinCountViolation(ctx, day, staffId, newShift);
    if (minCount) violations.push(minCount);

    // Soft constraints
    const earlyLimit = checkEarlyLimitViolation(ctx, day, staffId, newShift);
    if (earlyLimit) violations.push(earlyLimit);

    const fairness = checkFairnessViolation(ctx, day, staffId, newShift);
    if (fairness) violations.push(fairness);

    return violations;
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

    // Filter eligible staff (regular and backup only for main shifts)
    const eligibleStaff = ctx.staff.filter(s =>
        s.shiftType === 'regular' || s.shiftType === 'backup'
    );

    for (const staff of eligibleStaff) {
        const currentShift = getShift(ctx, day, staff.id);

        // Skip if already assigned to target shift
        if (currentShift === targetShift) continue;

        // Skip if on leave
        if (currentShift === '有' || currentShift === '振') continue;

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
    month: number
): ConstraintContext {
    return { schedule, staff, holidays, settings, year, month };
}
