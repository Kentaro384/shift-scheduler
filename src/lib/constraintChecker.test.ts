import { describe, expect, it } from 'vitest';
import { checkConstraints, createConstraintContext } from './constraintChecker';
import type { ShiftSchedule } from '../types';
import { SHIFT_PATTERNS } from '../types';
import { createTestStaff, testSettings } from '../test/factories';

describe('constraintChecker', () => {
    it('flags opening after a previous closing shift', () => {
        const staff = [createTestStaff({ id: 1 })];
        const schedule: ShiftSchedule = {
            '2026-05-04': { 1: 'F' },
        };
        const ctx = createConstraintContext(schedule, staff, [], testSettings, 2026, 5, SHIFT_PATTERNS);

        const violations = checkConstraints(ctx, 5, 1, 'A');

        expect(violations.map(v => v.code)).toContain('J_TO_A');
    });

    it('rejects work shifts on unavailable weekdays', () => {
        const staff = [createTestStaff({ id: 1, availableWeekdays: [1] })];
        const ctx = createConstraintContext({}, staff, [], testSettings, 2026, 5, SHIFT_PATTERNS);

        const violations = checkConstraints(ctx, 5, 1, 'C');

        expect(violations).toEqual(expect.arrayContaining([
            expect.objectContaining({ code: 'STAFF_CONDITION', type: 'hard' }),
        ]));
    });

    it('rejects summer leave outside June through August', () => {
        const staff = [createTestStaff({ id: 1 })];
        const ctx = createConstraintContext({}, staff, [], testSettings, 2026, 5, SHIFT_PATTERNS);

        const violations = checkConstraints(ctx, 5, 1, '夏休');

        expect(violations).toEqual(expect.arrayContaining([
            expect.objectContaining({ code: 'SUMMER_LEAVE_MONTH', type: 'hard' }),
        ]));
    });

    it('rejects a fourth summer leave day in the fiscal year', () => {
        const staff = [createTestStaff({ id: 1 })];
        const schedule: ShiftSchedule = {
            '2026-06-01': { 1: '夏休' },
            '2026-06-02': { 1: '夏休' },
            '2026-06-03': { 1: '夏休' },
        };
        const ctx = createConstraintContext(schedule, staff, [], testSettings, 2026, 6, SHIFT_PATTERNS);

        const violations = checkConstraints(ctx, 4, 1, '夏休');

        expect(violations).toEqual(expect.arrayContaining([
            expect.objectContaining({ code: 'SUMMER_LEAVE_LIMIT', type: 'hard' }),
        ]));
    });
});
