export type ShiftPatternId = 'A' | 'B' | 'C' | 'D' | 'E' | 'J' | '振' | '有' | '休' | '';

export interface ShiftPatternDefinition {
    id: ShiftPatternId;
    name: string;
    timeRange: string;
    minCount: number; // 平日最低人数
    breakTime: string;
    workTime: string;
    color: string;
}

export type StaffPosition = '園長' | '主任' | '保育士' | 'パート' | '調理';
export type StaffShiftType = 'no_shift' | 'backup' | 'regular' | 'part_time' | 'cooking';
export type StaffRole = 'infant' | 'toddler' | 'free' | 'cooking' | null;

export interface Staff {
    id: number;
    name: string;
    position: StaffPosition;
    shiftType: StaffShiftType;
    preferredShifts: ShiftPatternId[]; // 希望シフト
    weeklyDays: number;
    role: StaffRole;
    incompatibleWith: number[]; // IDs of incompatible staff
    earlyShiftLimit: number | null;
    saturdayOnly: boolean;
    hasQualification: boolean;
}

export interface Settings {
    saturdayStaffCount: number;
    saturdayShiftPattern: 'A' | 'B' | 'C' | 'D' | 'E' | 'J'; // 土曜日のシフトパターン
}

export interface Holiday {
    date: string; // YYYY-MM-DD
    name: string;
}

// Map of YYYY-MM-DD -> StaffId -> ShiftPatternId
export type ShiftSchedule = Record<string, Record<number, ShiftPatternId>>;

export const SHIFT_PATTERNS: ShiftPatternDefinition[] = [
    { id: 'A', name: '早番', timeRange: '7:15-16:15', minCount: 2, breakTime: '1:00', workTime: '9:00', color: 'bg-blue-200' },
    { id: 'B', name: '標準', timeRange: '8:00-17:00', minCount: 1, breakTime: '1:00', workTime: '9:00', color: 'bg-green-200' },
    { id: 'C', name: '標準+', timeRange: '8:30-17:30', minCount: 1, breakTime: '1:00', workTime: '9:00', color: 'bg-emerald-200' },
    { id: 'D', name: '遅番', timeRange: '9:00-18:00', minCount: 1, breakTime: '1:00', workTime: '9:00', color: 'bg-yellow-200' },
    { id: 'E', name: '遅番+', timeRange: '9:15-18:15', minCount: 1, breakTime: '1:00', workTime: '9:00', color: 'bg-amber-200' },
    { id: 'J', name: '最遅番', timeRange: '9:45-18:45', minCount: 2, breakTime: '1:00', workTime: '9:00', color: 'bg-orange-200' },
];

export const HOLIDAY_PATTERNS = [
    { id: '振', name: '振休', color: 'bg-purple-200' },
    { id: '有', name: '有給', color: 'bg-pink-200' },
    { id: '休', name: '公休', color: 'bg-gray-100' },
];
