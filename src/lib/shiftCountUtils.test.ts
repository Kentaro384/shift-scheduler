import { describe, expect, it } from 'vitest';
import { countAllPatterns, countEffectiveShift, countQualifiedPartTimers, countWorkingStaff } from './shiftCountUtils';
import type { ShiftSchedule, TimeRangeSchedule } from '../types';
import { createTestStaff } from '../test/factories';

describe('shiftCountUtils', () => {
    const dateStr = '2026-05-04';

    it('counts regular staff assigned to the target pattern', () => {
        const staff = [createTestStaff({ id: 1 })];
        const schedule: ShiftSchedule = { [dateStr]: { 1: 'A' } };

        expect(countEffectiveShift(staff, schedule, {}, dateStr, 'A')).toBe(1);
        expect(countEffectiveShift(staff, schedule, {}, dateStr, 'B')).toBe(0);
    });

    it('counts qualified time-range staff only when countAsShifts includes the pattern', () => {
        const staff = [
            createTestStaff({ id: 1, position: 'パート', shiftType: 'part_time', hasQualification: true }),
            createTestStaff({ id: 2, position: 'パート', shiftType: 'part_time', hasQualification: false }),
        ];
        const timeRangeSchedule: TimeRangeSchedule = {
            [dateStr]: {
                1: { start: '08:00', end: '13:00', countAsShifts: ['A'] },
                2: { start: '08:00', end: '13:00', countAsShifts: ['A'] },
            },
        };

        expect(countEffectiveShift(staff, {}, timeRangeSchedule, dateStr, 'A', true)).toBe(1);
        expect(countQualifiedPartTimers(staff, timeRangeSchedule, dateStr, 'A')).toBe(1);
    });

    it('excludes directors and cooking staff from working staff totals', () => {
        const staff = [
            createTestStaff({ id: 1, position: '保育士', shiftType: 'regular' }),
            createTestStaff({ id: 2, position: '園長', shiftType: 'no_shift' }),
            createTestStaff({ id: 3, position: '調理', shiftType: 'cooking', role: 'cooking' }),
        ];
        const schedule: ShiftSchedule = {
            [dateStr]: {
                1: 'A',
                2: 'A',
                3: 'A',
            },
        };

        expect(countWorkingStaff(staff, schedule, {}, dateStr)).toBe(1);
    });

    it('returns counts for every requested pattern', () => {
        const staff = [
            createTestStaff({ id: 1 }),
            createTestStaff({ id: 2 }),
        ];
        const schedule: ShiftSchedule = { [dateStr]: { 1: 'A', 2: 'B' } };

        expect(countAllPatterns(staff, schedule, {}, dateStr, false, ['A', 'B', 'C'])).toEqual({
            A: 1,
            B: 1,
            C: 0,
        });
    });
});
