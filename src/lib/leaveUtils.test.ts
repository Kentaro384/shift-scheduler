import { describe, expect, it } from 'vitest';
import { countFiscalYearLeave, getShiftDisplayLabel } from './leaveUtils';
import type { ShiftSchedule } from '../types';

describe('leaveUtils', () => {
    const schedule: ShiftSchedule = {
        '2026-04-10': { 1: '夏休' },
        '2026-08-20': { 1: '夏休' },
        '2027-03-31': { 1: '夏休' },
        '2027-04-01': { 1: '夏休' },
    };

    it('counts leave within the fiscal year of the target date', () => {
        expect(countFiscalYearLeave(schedule, 1, '夏休', '2027-03-31')).toBe(3);
        expect(countFiscalYearLeave(schedule, 1, '夏休', '2027-04-01')).toBe(1);
    });

    it('adds an ordinal to summer leave display labels', () => {
        expect(getShiftDisplayLabel('夏休', schedule, 1, '2026-08-20')).toBe('夏休②');
        expect(getShiftDisplayLabel('誕生日休', schedule, 1, '2026-08-20')).toBe('誕');
    });
});
