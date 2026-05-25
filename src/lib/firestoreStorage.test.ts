import { describe, expect, it } from 'vitest';
import {
    buildAuditMetadata,
    buildClearMonthUpdates,
    buildMonthBackupPayload,
    buildScopedDateUndoPatch,
    buildScopedSaveUpdates,
    buildScopedStaffCellUndoPatch,
    buildScopedStaffCellUpdates,
    buildUndoUpdates,
    expandDottedUpdates,
    firestoreStorage,
} from './firestoreStorage';

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

describe('firestoreStorage public API', () => {
    it('does not expose whole-map schedule save methods', () => {
        expect(Object.keys(firestoreStorage)).not.toEqual(expect.arrayContaining([
            'saveAll',
            'saveSchedule',
            'saveScheduleAndManualShifts',
            'saveScheduleTimeRangesAndManualShifts',
            'saveManualShifts',
            'saveTimeRangeSchedule',
            'saveNotes',
            'saveExcelExportLog',
        ]));
    });
});

describe('buildMonthBackupPayload', () => {
    it('captures only the requested month data', () => {
        const actor = {
            uid: 'user-1',
            email: 'user@example.com',
            displayName: 'User One',
        };
        const payload = buildMonthBackupPayload({
            monthKey: '2026-06',
            reason: 'before_clear_month',
            label: '当月白紙化前バックアップ',
            dateStrings: ['2026-06-01', '2026-06-02'],
            schedule: {
                '2026-06-01': { 1: 'A', 2: 'B' },
                '2026-07-01': { 1: 'F' },
            },
            timeRangeSchedule: {
                '2026-06-02': { 3: { start: '09:00', end: '16:00' } },
                '2026-07-01': { 3: { start: '10:00', end: '17:00' } },
            },
            manualShifts: {
                '2026-06-01': { 1: 'A' },
                '2026-07-01': { 1: 'F' },
            },
            notes: {
                '2026-06-02': '園外保育',
                '2026-07-01': '翌月メモ',
            },
        }, 12345, actor, 'SERVER_TIME');

        expect(payload).toMatchObject({
            schemaVersion: 1,
            source: 'web-app',
            reason: 'before_clear_month',
            label: '当月白紙化前バックアップ',
            monthKey: '2026-06',
            actor,
            clientAt: 12345,
            at: 'SERVER_TIME',
            affectedDateCount: 2,
            summary: {
                scheduleDateCount: 1,
                timeRangeDateCount: 1,
                manualShiftDateCount: 1,
                notesDateCount: 1,
                scheduleCellCount: 2,
                timeRangeCellCount: 1,
                manualShiftCellCount: 1,
            },
            data: {
                schedule: {
                    '2026-06-01': { 1: 'A', 2: 'B' },
                },
                timeRangeSchedule: {
                    '2026-06-02': { 3: { start: '09:00', end: '16:00' } },
                },
                manualShifts: {
                    '2026-06-01': { 1: 'A' },
                },
                notes: {
                    '2026-06-02': '園外保育',
                },
            },
        });
        expect(JSON.stringify(payload)).not.toContain('2026-07-01');
    });
});

describe('buildScopedSaveUpdates', () => {
    it('builds date-scoped updates without replacing whole map fields', () => {
        const updates = buildScopedSaveUpdates({
            schedule: {
                '2026-06-01': { 1: 'A' },
                '2026-06-02': { 2: 'B' },
                '2026-07-01': { 1: 'F' },
            },
            manualShifts: {
                '2026-06-01': { 1: 'A' },
            },
        }, ['2026-06-01', '2026-06-02'], 12345);

        expect(updates).toEqual({
            updatedAt: 12345,
            'schedule.2026-06-01': { 1: 'A' },
            'schedule.2026-06-02': { 2: 'B' },
            'manualShifts.2026-06-01': { 1: 'A' },
            'manualShifts.2026-06-02': {},
        });
        expect(updates).not.toHaveProperty('schedule');
        expect(updates).not.toHaveProperty('manualShifts');
        expect(updates).not.toHaveProperty('schedule.2026-07-01');
    });
});

describe('buildScopedStaffCellUpdates', () => {
    it('builds staff-cell updates without replacing the whole day map', () => {
        const deleteValue = Symbol('deleteField');
        const updates = buildScopedStaffCellUpdates({
            schedule: {
                '2026-06-01': { 1: 'A', 2: 'B', 3: 'C' },
            },
            manualShifts: {
                '2026-06-01': { 1: 'A' },
            },
        }, '2026-06-01', [1, 2], 12345, deleteValue);

        expect(updates).toEqual({
            updatedAt: 12345,
            'schedule.2026-06-01.1': 'A',
            'schedule.2026-06-01.2': 'B',
            'manualShifts.2026-06-01.1': 'A',
            'manualShifts.2026-06-01.2': deleteValue,
        });
        expect(updates).not.toHaveProperty('schedule.2026-06-01');
        expect(updates).not.toHaveProperty('manualShifts.2026-06-01');
        expect(updates).not.toHaveProperty('schedule.2026-06-01.3');
    });

    it('preserves empty string as an intentional cell value', () => {
        const updates = buildScopedStaffCellUpdates({
            schedule: {
                '2026-06-01': { 1: '' },
            },
        }, '2026-06-01', [1], 12345, 'delete');

        expect(updates['schedule.2026-06-01.1']).toBe('');
    });
});

describe('buildScopedStaffCellUndoPatch', () => {
    it('captures only changed staff-cell fields and restores missing cells as deletes', () => {
        const patch = buildScopedStaffCellUndoPatch({
            schedule: {
                '2026-06-01': { 1: 'A', 3: 'C' },
            },
            manualShifts: {
                '2026-06-01': { 1: 'A' },
            },
        }, {
            schedule: {
                '2026-06-01': { 1: 'B', 2: 'C', 3: 'C' },
            },
            manualShifts: {
                '2026-06-01': { 1: 'B' },
            },
        }, '2026-06-01', [1, 2, 3]);

        expect(patch.fields).toEqual([
            { path: 'schedule.2026-06-01.1', before: 'A', after: 'B' },
            { path: 'schedule.2026-06-01.2', before: { __missing: true }, after: 'C' },
            { path: 'manualShifts.2026-06-01.1', before: 'A', after: 'B' },
        ]);
        expect(buildUndoUpdates(patch, 12345, 'delete')).toEqual({
            updatedAt: 12345,
            'schedule.2026-06-01.1': 'A',
            'schedule.2026-06-01.2': 'delete',
            'manualShifts.2026-06-01.1': 'A',
        });
    });
});

describe('buildScopedDateUndoPatch', () => {
    it('captures changed date maps for month-level undo', () => {
        const patch = buildScopedDateUndoPatch({
            schedule: {
                '2026-06-01': { 1: 'A' },
                '2026-06-02': { 1: 'B' },
            },
            notes: {
                '2026-06-01': 'リーダー会',
            },
        }, {
            schedule: {
                '2026-06-01': { 1: 'A' },
                '2026-06-02': {},
            },
            notes: {
                '2026-06-01': '',
            },
        }, ['2026-06-01', '2026-06-02']);

        expect(patch.fields).toEqual([
            { path: 'schedule.2026-06-02', before: { 1: 'B' }, after: {} },
            { path: 'notes.2026-06-01', before: 'リーダー会', after: '' },
        ]);
        expect(buildUndoUpdates(patch, 12345, 'delete')).toEqual({
            updatedAt: 12345,
            'schedule.2026-06-02': { 1: 'B' },
            'notes.2026-06-01': 'リーダー会',
        });
    });
});

describe('expandDottedUpdates', () => {
    it('expands update paths for setDoc fallback', () => {
        expect(expandDottedUpdates({
            updatedAt: 12345,
            'schedule.2026-06-01': { 1: 'A' },
            'excelExportLog.2026-06': '2026-05-25 10:12',
        })).toEqual({
            updatedAt: 12345,
            schedule: {
                '2026-06-01': { 1: 'A' },
            },
            excelExportLog: {
                '2026-06': '2026-05-25 10:12',
            },
        });
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
