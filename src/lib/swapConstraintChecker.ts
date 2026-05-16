import type { Staff, ShiftSchedule, ShiftPatternDefinition, ShiftPatternId } from '../types';
import { getShiftPatternKind, isWorkShiftId, normalizeShiftPatterns, SHIFT_PATTERNS } from '../types';

export interface SwapViolation {
    staffId: number;
    staffName: string;
    type: 'consecutive_a' | 'consecutive_j' | 'j_after_a' | 'a_after_j' | 'early_limit' | 'same_floor' | 'incompatible' | 'six_consecutive';
    description: string;
    severity: 'error' | 'warning';
}

// Helper to format date string
function getFormattedDate(year: number, month: number, day: number): string {
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Helper to get the days in month
function getDaysInMonth(year: number, month: number): number {
    return new Date(year, month, 0).getDate();
}

// Helper to check if a day is a holiday
function isHolidayOrWeekend(year: number, month: number, day: number): boolean {
    const date = new Date(year, month - 1, day);
    return date.getDay() === 0; // Sunday only for simplicity
}

// Get previous work day (skipping Sundays)
function getPreviousWorkDay(year: number, month: number, day: number): number {
    let d = day - 1;
    while (d >= 1) {
        if (!isHolidayOrWeekend(year, month, d)) return d;
        d--;
    }
    return 0;
}

// Get next work day (skipping Sundays)
function getNextWorkDay(year: number, month: number, day: number): number {
    const daysInMonth = getDaysInMonth(year, month);
    let d = day + 1;
    while (d <= daysInMonth) {
        if (!isHolidayOrWeekend(year, month, d)) return d;
        d++;
    }
    return 0;
}

// Get shift for a staff on a specific day
function getShift(schedule: ShiftSchedule, year: number, month: number, day: number, staffId: number): ShiftPatternId {
    const dateStr = getFormattedDate(year, month, day);
    return (schedule[dateStr]?.[staffId] || '') as ShiftPatternId;
}

// Count early shifts (A, B) for a staff in the month
function isOpeningShift(shift: ShiftPatternId | undefined | null, patterns: ShiftPatternDefinition[]): boolean {
    return getShiftPatternKind(shift, patterns) === 'opening';
}

function isEarlyLimitedShift(shift: ShiftPatternId | undefined | null, patterns: ShiftPatternDefinition[]): boolean {
    const kind = getShiftPatternKind(shift, patterns);
    return kind === 'opening' || kind === 'early';
}

function isClosingShift(shift: ShiftPatternId | undefined | null, patterns: ShiftPatternDefinition[]): boolean {
    return getShiftPatternKind(shift, patterns) === 'closing';
}

function countEarlyShifts(schedule: ShiftSchedule, year: number, month: number, staffId: number, patterns: ShiftPatternDefinition[]): number {
    let count = 0;
    const daysInMonth = getDaysInMonth(year, month);
    for (let d = 1; d <= daysInMonth; d++) {
        const shift = getShift(schedule, year, month, d, staffId);
        if (isEarlyLimitedShift(shift, patterns)) count++;
    }
    return count;
}

// Count consecutive work days around a specific day
function countConsecutiveWorkDays(schedule: ShiftSchedule, year: number, month: number, day: number, staffId: number): number {
    let count = 1;

    // Count backwards
    let d = day - 1;
    while (d >= 1) {
        const shift = getShift(schedule, year, month, d, staffId);
        if (isWorkShiftId(shift)) {
            count++;
            d--;
        } else break;
    }

    // Count forwards
    const daysInMonth = getDaysInMonth(year, month);
    d = day + 1;
    while (d <= daysInMonth) {
        const shift = getShift(schedule, year, month, d, staffId);
        if (isWorkShiftId(shift)) {
            count++;
            d++;
        } else break;
    }

    return count;
}

// Check if same floor staff have the same shift
function hasSameFloorConflict(
    schedule: ShiftSchedule,
    year: number,
    month: number,
    day: number,
    staffId: number,
    newShift: ShiftPatternId,
    allStaff: Staff[]
): boolean {
    const staff = allStaff.find(s => s.id === staffId);
    if (!staff?.floor || staff.floor === 'free' || staff.floor === 'none') return false;

    const dateStr = getFormattedDate(year, month, day);
    const sameFloorStaff = allStaff.filter(s =>
        s.id !== staffId &&
        s.floor === staff.floor &&
        s.floor !== 'free' &&
        s.floor !== 'none'
    );

    for (const s of sameFloorStaff) {
        const existingShift = schedule[dateStr]?.[s.id];
        if (existingShift === newShift) {
            return true;
        }
    }
    return false;
}

/**
 * Check all constraint violations that would occur if two staff swap their shifts
 */
export function checkSwapViolations(
    sourceStaff: Staff,
    targetStaff: Staff,
    day: number,
    schedule: ShiftSchedule,
    allStaff: Staff[],
    year: number,
    month: number,
    patterns: ShiftPatternDefinition[] = SHIFT_PATTERNS
): SwapViolation[] {
    const violations: SwapViolation[] = [];
    const normalizedPatterns = normalizeShiftPatterns(patterns);

    const dateStr = getFormattedDate(year, month, day);
    const sourceShift = (schedule[dateStr]?.[sourceStaff.id] || '') as ShiftPatternId;
    const targetShift = (schedule[dateStr]?.[targetStaff.id] || '') as ShiftPatternId;

    // After swap: source gets targetShift, target gets sourceShift
    const sourceNewShift = targetShift;
    const targetNewShift = sourceShift;

    // Create a temporary schedule for checking
    const tempSchedule = JSON.parse(JSON.stringify(schedule)) as ShiftSchedule;
    tempSchedule[dateStr][sourceStaff.id] = sourceNewShift;
    tempSchedule[dateStr][targetStaff.id] = targetNewShift;

    // Check constraints for SOURCE staff (getting target's shift)
    checkStaffConstraints(sourceStaff, sourceNewShift, day, tempSchedule, allStaff, year, month, violations, normalizedPatterns);

    // Check constraints for TARGET staff (getting source's shift)
    checkStaffConstraints(targetStaff, targetNewShift, day, tempSchedule, allStaff, year, month, violations, normalizedPatterns);

    return violations;
}

function checkStaffConstraints(
    staff: Staff,
    newShift: ShiftPatternId,
    day: number,
    schedule: ShiftSchedule,
    allStaff: Staff[],
    year: number,
    month: number,
    violations: SwapViolation[],
    patterns: ShiftPatternDefinition[]
) {
    const prevDay = getPreviousWorkDay(year, month, day);
    const nextDay = getNextWorkDay(year, month, day);
    const prevShift = prevDay > 0 ? getShift(schedule, year, month, prevDay, staff.id) : '';
    const nextShift = nextDay > 0 ? getShift(schedule, year, month, nextDay, staff.id) : '';

    // 1. Consecutive A-A
    if (isOpeningShift(newShift, patterns) && isOpeningShift(prevShift, patterns)) {
        violations.push({
            staffId: staff.id,
            staffName: staff.name,
            type: 'consecutive_a',
            description: `${staff.name}: 開園系シフト連続になります`,
            severity: 'warning'
        });
    }
    if (isOpeningShift(newShift, patterns) && isOpeningShift(nextShift, patterns)) {
        violations.push({
            staffId: staff.id,
            staffName: staff.name,
            type: 'consecutive_a',
            description: `${staff.name}: 翌日も開園系シフトで連続になります`,
            severity: 'warning'
        });
    }

    // 2. Consecutive J-J
    if (isClosingShift(newShift, patterns) && isClosingShift(prevShift, patterns)) {
        violations.push({
            staffId: staff.id,
            staffName: staff.name,
            type: 'consecutive_j',
            description: `${staff.name}: 閉園系シフト連続になります`,
            severity: 'warning'
        });
    }
    if (isClosingShift(newShift, patterns) && isClosingShift(nextShift, patterns)) {
        violations.push({
            staffId: staff.id,
            staffName: staff.name,
            type: 'consecutive_j',
            description: `${staff.name}: 翌日も閉園系シフトで連続になります`,
            severity: 'warning'
        });
    }

    // 3. J after A (previous day was J, now getting A)
    if (isOpeningShift(newShift, patterns) && isClosingShift(prevShift, patterns)) {
        violations.push({
            staffId: staff.id,
            staffName: staff.name,
            type: 'a_after_j',
            description: `${staff.name}: 閉園→開園シフトになります`,
            severity: 'warning'
        });
    }

    // 4. A before J (next day is A, now getting J)
    if (isClosingShift(newShift, patterns) && isOpeningShift(nextShift, patterns)) {
        violations.push({
            staffId: staff.id,
            staffName: staff.name,
            type: 'j_after_a',
            description: `${staff.name}: 翌日が開園系シフトで閉園→開園になります`,
            severity: 'warning'
        });
    }

    // 5. Early shift limit
    if (isEarlyLimitedShift(newShift, patterns) && staff.earlyShiftLimit !== null) {
        const currentEarlyCount = countEarlyShifts(schedule, year, month, staff.id, patterns);
        if (currentEarlyCount >= staff.earlyShiftLimit) {
            violations.push({
                staffId: staff.id,
                staffName: staff.name,
                type: 'early_limit',
                description: `${staff.name}: 早番上限(${staff.earlyShiftLimit}回)を超えます`,
                severity: 'warning'
            });
        }
    }

    // 6. Same floor conflict
    if (hasSameFloorConflict(schedule, year, month, day, staff.id, newShift, allStaff)) {
        violations.push({
            staffId: staff.id,
            staffName: staff.name,
            type: 'same_floor',
            description: `${staff.name}: 同一フロアで同じシフトになります`,
            severity: 'warning'
        });
    }

    // 7. Incompatible staff
    if (staff.incompatibleWith && staff.incompatibleWith.length > 0) {
        const dateStr = getFormattedDate(year, month, day);
        for (const incompatibleId of staff.incompatibleWith) {
            const incompatibleShift = schedule[dateStr]?.[incompatibleId];
            if (incompatibleShift === newShift) {
                const incompatibleStaff = allStaff.find(s => s.id === incompatibleId);
                violations.push({
                    staffId: staff.id,
                    staffName: staff.name,
                    type: 'incompatible',
                    description: `${staff.name}: 相性NGの${incompatibleStaff?.name || '職員'}と同じシフトになります`,
                    severity: 'error'
                });
            }
        }
    }

    // 8. Six consecutive work days
    const consecutiveDays = countConsecutiveWorkDays(schedule, year, month, day, staff.id);
    if (consecutiveDays >= 6) {
        violations.push({
            staffId: staff.id,
            staffName: staff.name,
            type: 'six_consecutive',
            description: `${staff.name}: ${consecutiveDays}日連勤になります`,
            severity: 'warning'
        });
    }
}

/**
 * Get all potential swap candidates for a staff on a specific day
 */
export function getSwapCandidates(
    sourceStaff: Staff,
    day: number,
    schedule: ShiftSchedule,
    allStaff: Staff[],
    year: number,
    month: number,
    patterns: ShiftPatternDefinition[] = SHIFT_PATTERNS
): { staff: Staff; currentShift: ShiftPatternId; violations: SwapViolation[] }[] {
    const dateStr = getFormattedDate(year, month, day);
    const sourceShift = (schedule[dateStr]?.[sourceStaff.id] || '') as ShiftPatternId;

    return allStaff
        .filter(s => {
            if (s.id === sourceStaff.id) return false; // Exclude self
            const shift = schedule[dateStr]?.[s.id];
            if (!isWorkShiftId(shift)) return false; // Only working staff
            if (shift === sourceShift) return false; // Same shift = no point swapping
            // Exclude part-time, cooking, and no_shift staff from swap
            if (s.shiftType === 'part_time' || s.shiftType === 'cooking' || s.shiftType === 'no_shift') return false;
            return true;
        })
        .map(targetStaff => ({
            staff: targetStaff,
            currentShift: (schedule[dateStr]?.[targetStaff.id] || '') as ShiftPatternId,
            violations: checkSwapViolations(sourceStaff, targetStaff, day, schedule, allStaff, year, month, patterns)
        }))
        .sort((a, b) => {
            // Sort by violation count (fewer violations first), then severity
            const aErrors = a.violations.filter(v => v.severity === 'error').length;
            const bErrors = b.violations.filter(v => v.severity === 'error').length;
            if (aErrors !== bErrors) return aErrors - bErrors;
            return a.violations.length - b.violations.length;
        });
}
