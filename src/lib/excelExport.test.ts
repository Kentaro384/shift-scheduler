import { describe, expect, it } from 'vitest';
import { getExcelStaffDayValue } from './excelExport';
import type { ShiftSchedule, TimeRangeSchedule } from '../types';
import { createHalfDayLeaveShiftId } from '../types';
import { createTestStaff } from '../test/factories';

describe('getExcelStaffDayValue', () => {
    const dateStr = '2026-06-01';

    it('lets an explicit off day hide stale time-range data', () => {
        const staff = createTestStaff({ id: 1, position: 'パート', shiftType: 'part_time' });
        const schedule: ShiftSchedule = { [dateStr]: { 1: '休' } };
        const timeRangeSchedule: TimeRangeSchedule = {
            [dateStr]: {
                1: { start: '09:00', end: '16:00', countAsShifts: ['B'] },
            },
        };

        expect(getExcelStaffDayValue(staff, dateStr, schedule, timeRangeSchedule)).toBe('');
    });

    it('prints time ranges for time-range staff when no shift is set', () => {
        const staff = createTestStaff({ id: 1, position: 'パート', shiftType: 'part_time' });
        const timeRangeSchedule: TimeRangeSchedule = {
            [dateStr]: {
                1: { start: '08:00', end: '11:00', countAsShifts: [] },
            },
        };

        expect(getExcelStaffDayValue(staff, dateStr, {}, timeRangeSchedule)).toBe('08:00\n11:00');
    });

    it('prints half-day leave labels from their base shift', () => {
        const staff = createTestStaff({ id: 1 });
        const schedule: ShiftSchedule = {
            [dateStr]: {
                1: createHalfDayLeaveShiftId('A', 'afternoon'),
            },
        };

        expect(getExcelStaffDayValue(staff, dateStr, schedule, {})).toBe('A\n午後休');
    });

    it('prints nothing outside employment range', () => {
        const staff = createTestStaff({ id: 1, employmentEndDate: '2026-05-31' });
        const schedule: ShiftSchedule = { [dateStr]: { 1: 'A' } };

        expect(getExcelStaffDayValue(staff, dateStr, schedule, {})).toBe('');
    });
});
