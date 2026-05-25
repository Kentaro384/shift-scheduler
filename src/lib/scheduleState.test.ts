import { describe, expect, it } from 'vitest';
import type { ShiftSchedule } from '../types';
import { swapScheduleAndManualMarkers } from './scheduleState';

describe('swapScheduleAndManualMarkers', () => {
    const dateStr = '2026-06-01';

    it('swaps schedule cells and marks both swapped cells as manual', () => {
        const schedule: ShiftSchedule = { [dateStr]: { 1: 'A', 2: 'C' } };
        const manualShifts: ShiftSchedule = {};

        const result = swapScheduleAndManualMarkers(schedule, manualShifts, dateStr, 1, 2);

        expect(result.schedule[dateStr]).toMatchObject({ 1: 'C', 2: 'A' });
        expect(result.manualShifts[dateStr]).toMatchObject({ 1: 'C', 2: 'A' });
    });

    it('overwrites old manual markers with the swapped values', () => {
        const schedule: ShiftSchedule = { [dateStr]: { 1: 'A', 2: 'C' } };
        const manualShifts: ShiftSchedule = { [dateStr]: { 1: 'A' } };

        const result = swapScheduleAndManualMarkers(schedule, manualShifts, dateStr, 1, 2);

        expect(result.schedule[dateStr]).toMatchObject({ 1: 'C', 2: 'A' });
        expect(result.manualShifts[dateStr]).toMatchObject({ 1: 'C', 2: 'A' });
    });

    it('preserves half-day leave shift ids when they are swapped', () => {
        const schedule: ShiftSchedule = { [dateStr]: { 1: 'A午後休', 2: 'F' } };
        const manualShifts: ShiftSchedule = {};

        const result = swapScheduleAndManualMarkers(schedule, manualShifts, dateStr, 1, 2);

        expect(result.schedule[dateStr]).toMatchObject({ 1: 'F', 2: 'A午後休' });
        expect(result.manualShifts[dateStr]).toMatchObject({ 1: 'F', 2: 'A午後休' });
    });

    it('does not swap when either cell is not a work shift', () => {
        const schedule: ShiftSchedule = { [dateStr]: { 1: 'A', 2: '有' } };
        const manualShifts: ShiftSchedule = { [dateStr]: { 1: 'A' } };

        const result = swapScheduleAndManualMarkers(schedule, manualShifts, dateStr, 1, 2);

        expect(result.schedule).toBe(schedule);
        expect(result.manualShifts).toBe(manualShifts);
    });
});
