export type ShiftPatternId = string;
export type ShiftPatternKind = 'opening' | 'early' | 'standard' | 'late' | 'closing';

export const SHIFT_PATTERN_KIND_LABELS: Record<ShiftPatternKind, string> = {
    opening: '開園・早番',
    early: '早め',
    standard: '標準',
    late: '遅番',
    closing: '閉園・最遅番',
};

export interface ShiftPatternDefinition {
    id: ShiftPatternId;
    name: string;
    timeRange: string;
    minCount: number; // 平日最低人数
    kind?: ShiftPatternKind; // 生成ロジック上の役割
    breakTime: string;
    workTime: string;
    color: string;
}

export type StaffPosition = '園長' | '主任' | '保育士' | 'パート' | '看護師' | '調理';
export type StaffShiftType = 'no_shift' | 'backup' | 'regular' | 'part_time' | 'cooking';
export type StaffRole = 'infant' | 'toddler' | 'free' | 'cooking' | null;
export type FloorType = '1F' | '2F' | '3F' | 'free' | 'none';

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
    defaultTimeRange?: TimeRange; // Default work hours for part-time workers
    floor?: FloorType; // フロア担当（同一フロアのスタッフはシフトを分ける）
}

export function isTimeRangeStaff(staff: Staff): boolean {
    return staff.shiftType === 'part_time' || staff.position === '看護師';
}

export interface Settings {
    profileName: string; // 園プロファイル名
    fiscalYear: number; // 年度
    weekdayStaffCount: number; // 平日最低出勤人数
    saturdayStaffCount: number;
    saturdayShiftPattern: ShiftPatternId; // 土曜日のシフトパターン
    chiefBackupLimit: number; // 主任バックアップの月間上限
}

export interface Holiday {
    date: string; // YYYY-MM-DD
    name: string;
}

// Map of YYYY-MM-DD -> StaffId -> ShiftPatternId
export type ShiftSchedule = Record<string, Record<number, ShiftPatternId>>;

// Time range for part-time workers
export interface TimeRange {
    start: string;  // "HH:MM" format (e.g., "09:00")
    end: string;    // "HH:MM" format (e.g., "14:00")
    countAsShifts?: ShiftPatternId[];  // Which shift patterns this time range counts toward
}

// Map of YYYY-MM-DD -> StaffId -> TimeRange (for part-time workers)
export type TimeRangeSchedule = Record<string, Record<number, TimeRange>>;

export const SHIFT_PATTERNS: ShiftPatternDefinition[] = [
    { id: 'A', name: '早番', timeRange: '7:15-16:15', minCount: 2, kind: 'opening', breakTime: '1:00', workTime: '9:00', color: 'bg-blue-200' },
    { id: 'B', name: '標準', timeRange: '8:00-17:00', minCount: 1, kind: 'early', breakTime: '1:00', workTime: '9:00', color: 'bg-green-200' },
    { id: 'C', name: '標準+', timeRange: '8:30-17:30', minCount: 1, kind: 'standard', breakTime: '1:00', workTime: '9:00', color: 'bg-emerald-200' },
    { id: 'D', name: '遅番', timeRange: '9:00-18:00', minCount: 1, kind: 'late', breakTime: '1:00', workTime: '9:00', color: 'bg-yellow-200' },
    { id: 'E', name: '遅番+', timeRange: '9:15-18:15', minCount: 1, kind: 'late', breakTime: '1:00', workTime: '9:00', color: 'bg-amber-200' },
    { id: 'J', name: '最遅番', timeRange: '9:45-18:45', minCount: 2, kind: 'closing', breakTime: '1:00', workTime: '9:00', color: 'bg-orange-200' },
];

export const HOLIDAY_PATTERNS = [
    { id: '振', name: '振休', color: 'bg-purple-200' },
    { id: '有', name: '有給', color: 'bg-pink-200' },
    { id: '休', name: '公休', color: 'bg-gray-100' },
];

export const HOLIDAY_SHIFT_IDS: ShiftPatternId[] = ['振', '有', '休', ''];

export function isWorkShiftId(shift: ShiftPatternId | undefined | null): shift is ShiftPatternId {
    return !!shift && !HOLIDAY_SHIFT_IDS.includes(shift);
}

export function getDefaultPatternKind(id: ShiftPatternId): ShiftPatternKind {
    if (id === 'A') return 'opening';
    if (id === 'B') return 'early';
    if (id === 'D' || id === 'E') return 'late';
    if (id === 'J') return 'closing';
    return 'standard';
}

export function normalizeShiftPattern(pattern: ShiftPatternDefinition): ShiftPatternDefinition {
    return {
        ...pattern,
        kind: pattern.kind ?? getDefaultPatternKind(pattern.id),
    };
}

export function normalizeShiftPatterns(patterns: ShiftPatternDefinition[]): ShiftPatternDefinition[] {
    return patterns.map(normalizeShiftPattern);
}

export function getShiftPatternKind(
    shift: ShiftPatternId | undefined | null,
    patterns: ShiftPatternDefinition[]
): ShiftPatternKind | null {
    if (!isWorkShiftId(shift)) return null;
    const pattern = patterns.find(p => p.id === shift);
    return pattern?.kind ?? getDefaultPatternKind(shift);
}
