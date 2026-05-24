import type { Settings, Staff, StaffPosition, StaffRole, StaffShiftType } from '../types';

export const testSettings: Settings = {
    profileName: 'テスト園',
    fiscalYear: 2026,
    weekdayStaffCount: 3,
    saturdayStaffCount: 2,
    saturdayShiftPattern: 'B',
    chiefBackupLimit: 8,
};

export function createTestStaff(overrides: Partial<Staff> = {}): Staff {
    const id = overrides.id ?? 1;
    const position: StaffPosition = overrides.position ?? '保育士';
    const shiftType: StaffShiftType = overrides.shiftType ?? 'regular';
    const role: StaffRole = overrides.role ?? 'age1';

    return {
        id,
        name: overrides.name ?? `職員${id}`,
        position,
        shiftType,
        preferredShifts: [],
        weeklyDays: 5,
        role,
        incompatibleWith: [],
        earlyShiftLimit: null,
        saturdayOnly: false,
        hasQualification: true,
        floor: 'free',
        ...overrides,
    };
}

export function createRegularStaff(count: number): Staff[] {
    return Array.from({ length: count }, (_, index) => createTestStaff({
        id: index + 1,
        name: `正規${index + 1}`,
        role: index % 3 === 0 ? 'age1' : index % 3 === 1 ? 'age2' : 'age3',
    }));
}
