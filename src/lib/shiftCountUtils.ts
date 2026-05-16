/**
 * Shift Counting Utilities
 * 
 * Unified counting logic for shift patterns, including:
 * - Regular staff shifts from schedule
 * - Part-time workers with countAsShifts
 */

import type { Staff, ShiftSchedule, TimeRangeSchedule, ShiftPatternId } from '../types';
import { SHIFT_PATTERNS, isWorkShiftId } from '../types';

/**
 * Count effective staff for a specific shift pattern on a given date.
 * Includes both:
 * - Regular staff assigned to the pattern in schedule
 * - Qualified part-timers whose countAsShifts includes the pattern
 */
export function countEffectiveShift(
    staff: Staff[],
    schedule: ShiftSchedule,
    timeRangeSchedule: TimeRangeSchedule,
    dateStr: string,
    pattern: ShiftPatternId,
    qualifiedOnly: boolean = false
): number {
    let count = 0;

    staff.forEach(s => {
        // Part-time workers: check countAsShifts
        if (s.shiftType === 'part_time') {
            if (qualifiedOnly && !s.hasQualification) return;

            const timeRange = timeRangeSchedule[dateStr]?.[s.id];
            if (timeRange?.countAsShifts?.includes(pattern)) {
                count++;
            }
            return;
        }

        // Regular staff: check schedule
        if (qualifiedOnly && !s.hasQualification) return;

        if (schedule[dateStr]?.[s.id] === pattern) {
            count++;
        }
    });

    return count;
}

/**
 * Count all staff per shift pattern on a given date.
 * Returns an object with counts for each pattern (A-J).
 */
export function countAllPatterns(
    staff: Staff[],
    schedule: ShiftSchedule,
    timeRangeSchedule: TimeRangeSchedule,
    dateStr: string,
    qualifiedOnly: boolean = false,
    patternIds: ShiftPatternId[] = SHIFT_PATTERNS.map(p => p.id)
): Record<string, number> {
    const counts: Record<string, number> = {};

    patternIds.forEach(pattern => {
        counts[pattern] = countEffectiveShift(staff, schedule, timeRangeSchedule, dateStr, pattern, qualifiedOnly);
    });

    return counts;
}

/**
 * Count qualified part-timers assigned to a specific shift pattern.
 * Only counts part-timers with hasQualification=true and countAsShifts set.
 */
export function countQualifiedPartTimers(
    staff: Staff[],
    timeRangeSchedule: TimeRangeSchedule,
    dateStr: string,
    pattern: ShiftPatternId
): number {
    let count = 0;

    staff.forEach(s => {
        if (s.shiftType !== 'part_time' || !s.hasQualification) return;

        const timeRange = timeRangeSchedule[dateStr]?.[s.id];
        if (timeRange?.countAsShifts?.includes(pattern)) {
            count++;
        }
    });

    return count;
}

/**
 * Count total working staff on a given date (excluding cooking staff).
 * Includes part-timers with time ranges set.
 */
export function countWorkingStaff(
    staff: Staff[],
    schedule: ShiftSchedule,
    timeRangeSchedule: TimeRangeSchedule,
    dateStr: string
): number {
    let count = 0;

    staff.forEach(s => {
        if (s.shiftType === 'cooking') return;

        // Part-time: check if they have a time range
        if (s.shiftType === 'part_time') {
            if (timeRangeSchedule[dateStr]?.[s.id]) {
                count++;
            }
            return;
        }

        // Regular staff: check for work shift
        const shift = schedule[dateStr]?.[s.id];
        if (isWorkShiftId(shift)) {
            count++;
        }
    });

    return count;
}
