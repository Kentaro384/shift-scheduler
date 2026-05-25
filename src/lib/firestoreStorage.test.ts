import { describe, expect, it } from 'vitest';
import { buildClearMonthUpdates } from './firestoreStorage';

describe('buildClearMonthUpdates', () => {
    it('builds month-delete updates without rewriting staff', () => {
        const deleteValue = Symbol('deleteField');
        const updates = buildClearMonthUpdates(['2026-06-01', '2026-06-02'], 12345, deleteValue);

        expect(updates).toEqual({
            updatedAt: 12345,
            'schedule.2026-06-01': deleteValue,
            'timeRangeSchedule.2026-06-01': deleteValue,
            'manualShifts.2026-06-01': deleteValue,
            'notes.2026-06-01': deleteValue,
            'schedule.2026-06-02': deleteValue,
            'timeRangeSchedule.2026-06-02': deleteValue,
            'manualShifts.2026-06-02': deleteValue,
            'notes.2026-06-02': deleteValue,
        });
        expect(updates).not.toHaveProperty('staff');
    });

    it('keeps empty date input to updatedAt only', () => {
        expect(buildClearMonthUpdates([], 12345, 'delete')).toEqual({ updatedAt: 12345 });
    });
});
