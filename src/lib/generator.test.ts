import { describe, expect, it } from 'vitest';
import { ShiftGenerator } from './generator';
import type { Settings, Staff } from '../types';

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
});
