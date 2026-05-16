import type { Holiday, Settings, Staff, ShiftPatternDefinition, ShiftPatternId, ShiftSchedule } from '../types';
import { isTimeRangeStaff, isWorkShiftId, SHIFT_PATTERNS } from '../types';
import { checkConstraints, createConstraintContext, type ConstraintViolation } from './constraintChecker';

export interface SwapViolation {
    staffId: number;
    staffName: string;
    type: ConstraintViolation['code'];
    description: string;
    severity: 'error' | 'warning';
}

function getFormattedDate(year: number, month: number, day: number): string {
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function cloneSchedule(schedule: ShiftSchedule): ShiftSchedule {
    return JSON.parse(JSON.stringify(schedule)) as ShiftSchedule;
}

function toSwapViolation(staff: Staff, violation: ConstraintViolation): SwapViolation {
    return {
        staffId: staff.id,
        staffName: staff.name,
        type: violation.code,
        description: `${staff.name}: ${violation.message}`,
        severity: violation.type === 'hard' ? 'error' : 'warning',
    };
}

/**
 * Check all constraint violations that would occur if two staff swap their shifts.
 */
export function checkSwapViolations(
    sourceStaff: Staff,
    targetStaff: Staff,
    day: number,
    schedule: ShiftSchedule,
    allStaff: Staff[],
    holidays: Holiday[],
    settings: Settings,
    year: number,
    month: number,
    patterns: ShiftPatternDefinition[] = SHIFT_PATTERNS
): SwapViolation[] {
    const dateStr = getFormattedDate(year, month, day);
    const sourceShift = (schedule[dateStr]?.[sourceStaff.id] || '') as ShiftPatternId;
    const targetShift = (schedule[dateStr]?.[targetStaff.id] || '') as ShiftPatternId;

    const tempSchedule = cloneSchedule(schedule);
    if (!tempSchedule[dateStr]) tempSchedule[dateStr] = {};
    tempSchedule[dateStr][sourceStaff.id] = targetShift;
    tempSchedule[dateStr][targetStaff.id] = sourceShift;

    const ctx = createConstraintContext(tempSchedule, allStaff, holidays, settings, year, month, patterns);

    return [
        ...checkConstraints(ctx, day, sourceStaff.id, targetShift, { includeSoft: true })
            .map(violation => toSwapViolation(sourceStaff, violation)),
        ...checkConstraints(ctx, day, targetStaff.id, sourceShift, { includeSoft: true })
            .map(violation => toSwapViolation(targetStaff, violation)),
    ];
}

/**
 * Get all potential swap candidates for a staff on a specific day.
 */
export function getSwapCandidates(
    sourceStaff: Staff,
    day: number,
    schedule: ShiftSchedule,
    allStaff: Staff[],
    holidays: Holiday[],
    settings: Settings,
    year: number,
    month: number,
    patterns: ShiftPatternDefinition[] = SHIFT_PATTERNS
): { staff: Staff; currentShift: ShiftPatternId; violations: SwapViolation[] }[] {
    const dateStr = getFormattedDate(year, month, day);
    const sourceShift = (schedule[dateStr]?.[sourceStaff.id] || '') as ShiftPatternId;

    return allStaff
        .filter(s => {
            if (s.id === sourceStaff.id) return false;
            const shift = schedule[dateStr]?.[s.id];
            if (!isWorkShiftId(shift)) return false;
            if (shift === sourceShift) return false;
            if (isTimeRangeStaff(s) || s.shiftType === 'cooking' || s.shiftType === 'no_shift') return false;
            return true;
        })
        .map(targetStaff => ({
            staff: targetStaff,
            currentShift: (schedule[dateStr]?.[targetStaff.id] || '') as ShiftPatternId,
            violations: checkSwapViolations(sourceStaff, targetStaff, day, schedule, allStaff, holidays, settings, year, month, patterns)
        }))
        .sort((a, b) => {
            const aErrors = a.violations.filter(v => v.severity === 'error').length;
            const bErrors = b.violations.filter(v => v.severity === 'error').length;
            if (aErrors !== bErrors) return aErrors - bErrors;
            return a.violations.length - b.violations.length;
        });
}
