import { describe, expect, it } from 'vitest';
import { buildAuditMetadata, buildClearMonthUpdates } from './firestoreStorage';

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

describe('buildAuditMetadata', () => {
    it('adds actor and last operation metadata without embedding details', () => {
        const actor = {
            uid: 'user-1',
            email: 'user@example.com',
            displayName: 'User One',
        };

        expect(buildAuditMetadata({
            action: 'reset_generated_shifts',
            label: 'リセット',
            monthKey: '2026-06',
            affectedFields: ['schedule'],
            affectedDateCount: 30,
            detail: { ignoredInDocument: true },
        }, 12345, actor)).toEqual({
            updatedBy: actor,
            lastOperation: {
                action: 'reset_generated_shifts',
                label: 'リセット',
                at: 12345,
                monthKey: '2026-06',
                affectedFields: ['schedule'],
                affectedDateCount: 30,
            },
        });
    });

    it('returns no metadata when no audit context is provided', () => {
        expect(buildAuditMetadata(undefined, 12345, {
            uid: null,
            email: null,
            displayName: null,
        })).toEqual({});
    });
});
