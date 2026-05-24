import { describe, expect, it } from 'vitest';
import { ShiftGenerator } from './generator';
import { countWorkingStaff } from './shiftCountUtils';
import type { Settings, Staff } from '../types';
import { isStaffActiveOnDate } from '../types';
import { getFormattedDate } from './utils';
import { createRegularStaff } from '../test/factories';

const settings: Settings = {
    profileName: 'テスト園',
    fiscalYear: 2026,
    weekdayStaffCount: 3,
    saturdayStaffCount: 2,
    saturdayShiftPattern: 'B',
    chiefBackupLimit: 8,
};

const createRegular = (id: number, name: string): Staff => ({
    id,
    name,
    position: '保育士',
    shiftType: 'regular',
    preferredShifts: [],
    weeklyDays: 5,
    role: id % 2 === 0 ? 'age1' : 'age2',
    incompatibleWith: [],
    earlyShiftLimit: null,
    saturdayOnly: false,
    hasQualification: true,
    floor: 'free',
});

describe('ShiftGenerator', () => {
    it('generates the same schedule for the same month and inputs', () => {
        const staff = [
            createRegular(1, 'Aさん'),
            createRegular(2, 'Bさん'),
            createRegular(3, 'Cさん'),
            createRegular(4, 'Dさん'),
            createRegular(5, 'Eさん'),
            createRegular(6, 'Fさん'),
        ];

        const first = new ShiftGenerator(staff, [], 2026, 5, settings).generate();
        const second = new ShiftGenerator(staff, [], 2026, 5, settings).generate();

        expect(second).toEqual(first);
    });

    it('uses an explicit seed for repeatable reshuffle variants', () => {
        const staff = createRegularStaff(8);

        const first = new ShiftGenerator(staff, [], 2026, 5, settings, {}, {}, undefined, {}, { seed: 202605 }).generate();
        const repeat = new ShiftGenerator(staff, [], 2026, 5, settings, {}, {}, undefined, {}, { seed: 202605 }).generate();
        const reshuffled = new ShiftGenerator(staff, [], 2026, 5, settings, {}, {}, undefined, {}, { seed: 202606 }).generate();

        expect(repeat).toEqual(first);
        expect(reshuffled).not.toEqual(first);
    });

    it('preserves protected fixed plans from the current schedule', () => {
        const staff = createRegularStaff(6);
        const schedule = new ShiftGenerator(
            staff,
            [],
            2026,
            5,
            settings,
            { '2026-05-04': { 1: '有' } }
        ).generate();

        expect(schedule['2026-05-04'][1]).toBe('有');
    });

    it('does not assign staff outside their employment range', () => {
        const inactiveStaff = { ...createRegular(99, '開始前'), employmentStartDate: '2026-06-01' };
        const staff = [
            ...createRegularStaff(5),
            inactiveStaff,
        ];
        const schedule = new ShiftGenerator(staff, [], 2026, 5, settings).generate();

        for (let day = 1; day <= 31; day++) {
            const dateStr = getFormattedDate(2026, 5, day);
            expect(isStaffActiveOnDate(inactiveStaff, dateStr)).toBe(false);
            expect(schedule[dateStr]?.[99]).toBeUndefined();
        }
    });

    it('fills weekdays to at least the configured working staff count when enough staff are available', () => {
        const staff = createRegularStaff(8);
        const schedule = new ShiftGenerator(staff, [], 2026, 5, settings).generate();

        for (let day = 1; day <= 31; day++) {
            const date = new Date(2026, 4, day);
            const weekday = date.getDay();
            if (weekday === 0 || weekday === 6) continue;

            const dateStr = getFormattedDate(2026, 5, day);
            expect(countWorkingStaff(staff, schedule, {}, dateStr)).toBeGreaterThanOrEqual(settings.weekdayStaffCount);
        }
    });
});
