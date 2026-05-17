export type ShiftPatternId = string;
export type ShiftPatternKind = 'opening' | 'early' | 'standard' | 'late' | 'closing';
export type HalfDayLeavePeriod = 'morning' | 'afternoon';

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
export type StaffAgeRole = 'age1' | 'age2' | 'age3';
export type StaffRole = StaffAgeRole | 'infant' | 'toddler' | 'free' | 'cooking' | null;
export type FloorType = '1F' | '2F' | '3F' | 'free' | 'none';
export type StaffWeekday = 1 | 2 | 3 | 4 | 5 | 6;

export const STAFF_WEEKDAY_LABELS: Record<StaffWeekday, string> = {
    1: '月',
    2: '火',
    3: '水',
    4: '木',
    5: '金',
    6: '土',
};

export const STAFF_WEEKDAYS: StaffWeekday[] = [1, 2, 3, 4, 5, 6];

export const STAFF_ROLE_LABELS: Record<Exclude<StaffRole, null>, string> = {
    age1: '1歳',
    age2: '2歳',
    age3: '3歳',
    infant: '1歳',
    toddler: '2歳',
    free: 'フリー',
    cooking: '調理',
};

export function normalizeStaffRole(role: StaffRole): StaffRole {
    if (role === 'infant') return 'age1';
    if (role === 'toddler') return 'age2';
    return role;
}

export function getStaffRoleLabel(role: StaffRole): string {
    return role ? STAFF_ROLE_LABELS[role] : '指定なし';
}

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
    availableWeekdays?: StaffWeekday[]; // 勤務可能曜日。未設定なら月〜土すべて可
    defaultTimeRange?: TimeRange; // Default work hours for part-time workers
    weeklyTimeRanges?: Partial<Record<StaffWeekday, TimeRange>>; // Optional per-weekday default work hours
    floor?: FloorType; // フロア担当（同一フロアのスタッフはシフトを分ける）
}

export function isTimeRangeStaff(staff: Staff): boolean {
    return staff.shiftType === 'part_time' || staff.position === '看護師' || staff.position === '園長';
}

export function isCookingStaff(staff: Staff): boolean {
    return staff.shiftType === 'cooking' || staff.position === '調理' || staff.role === 'cooking';
}

export function getStaffAgeGroup(staff: Staff): StaffAgeRole | null {
    const role = normalizeStaffRole(staff.role);
    return role === 'age1' || role === 'age2' || role === 'age3' ? role : null;
}

export function countsForStaffing(staff: Staff): boolean {
    return staff.position !== '園長' && !isCookingStaff(staff);
}

export function getStaffAvailableWeekdays(staff: Staff): StaffWeekday[] {
    if (staff.saturdayOnly) return [6];
    return staff.availableWeekdays?.length ? staff.availableWeekdays : STAFF_WEEKDAYS;
}

export function isStaffAvailableOnWeekday(staff: Staff, weekday: number): boolean {
    return getStaffAvailableWeekdays(staff).includes(weekday as StaffWeekday);
}

export function getStaffTimeRangeForWeekday(staff: Staff, weekday: number): TimeRange | undefined {
    const weeklyRanges = staff.weeklyTimeRanges as Record<string | number, TimeRange | undefined> | undefined;
    return weeklyRanges?.[weekday] || weeklyRanges?.[String(weekday)] || staff.defaultTimeRange;
}

export function createHalfDayLeaveShiftId(baseShift: ShiftPatternId, leavePeriod: HalfDayLeavePeriod): ShiftPatternId {
    return `${baseShift}${leavePeriod === 'morning' ? '午前休' : '午後休'}`;
}

export function parseHalfDayLeaveShiftId(
    shift: ShiftPatternId | undefined | null
): { baseShift: ShiftPatternId; leavePeriod: HalfDayLeavePeriod } | null {
    if (!shift) return null;
    if (shift.endsWith('午前休')) {
        return { baseShift: shift.slice(0, -3), leavePeriod: 'morning' };
    }
    if (shift.endsWith('午後休')) {
        return { baseShift: shift.slice(0, -3), leavePeriod: 'afternoon' };
    }
    return null;
}

export function getEffectiveWorkShiftId(shift: ShiftPatternId | undefined | null): ShiftPatternId | null {
    const halfDayLeave = parseHalfDayLeaveShiftId(shift);
    return halfDayLeave?.baseShift || (isWorkShiftId(shift) ? shift : null);
}

export function staffAllowsShift(staff: Staff, shift: ShiftPatternId): boolean {
    const preferredShifts = staff.preferredShifts || [];
    const effectiveShift = getEffectiveWorkShiftId(shift) || shift;
    return preferredShifts.length === 0 || preferredShifts.includes(effectiveShift);
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

// Map of YYYY-MM-DD -> note text for the printed monthly schedule
export type DailyNotes = Record<string, string>;

// Time range for part-time workers
export interface TimeRange {
    start: string;  // "HH:MM" format (e.g., "09:00")
    end: string;    // "HH:MM" format (e.g., "14:00")
    countAsShifts?: ShiftPatternId[];  // Which shift patterns this time range counts toward
}

// Map of YYYY-MM-DD -> StaffId -> TimeRange (for part-time workers)
export type TimeRangeSchedule = Record<string, Record<number, TimeRange>>;

export const SHIFT_PATTERNS: ShiftPatternDefinition[] = [
    { id: 'A', name: '早番', timeRange: '7:15-16:15', minCount: 0, kind: 'opening', breakTime: '1:00', workTime: '9:00', color: 'bg-amber-200' },
    { id: 'B', name: '早番+', timeRange: '7:30-16:30', minCount: 0, kind: 'early', breakTime: '1:00', workTime: '9:00', color: 'bg-sky-200' },
    { id: 'C', name: '標準', timeRange: '8:00-17:00', minCount: 0, kind: 'standard', breakTime: '1:00', workTime: '9:00', color: 'bg-blue-200' },
    { id: "C'", name: '標準+', timeRange: '8:15-17:15', minCount: 0, kind: 'standard', breakTime: '1:00', workTime: '9:00', color: 'bg-indigo-200' },
    { id: 'D', name: '中番', timeRange: '8:30-17:30', minCount: 0, kind: 'standard', breakTime: '1:00', workTime: '9:00', color: 'bg-orange-200' },
    { id: 'E', name: '遅番', timeRange: '9:00-18:00', minCount: 0, kind: 'late', breakTime: '1:00', workTime: '9:00', color: 'bg-purple-200' },
    { id: 'F', name: '延長対応', timeRange: '9:30-18:30', minCount: 0, kind: 'closing', breakTime: '1:00', workTime: '9:00', color: 'bg-teal-200' },
];

export const REAL_WORLD_SHIFT_PATTERNS: ShiftPatternDefinition[] = SHIFT_PATTERNS;

export const HOLIDAY_PATTERNS = [
    { id: '振', name: '振休', color: 'bg-purple-200' },
    { id: '有', name: '有給', color: 'bg-pink-200' },
    { id: '半有', name: '半日有給', color: 'bg-rose-100' },
    { id: '研', name: '研修', color: 'bg-emerald-100' },
    { id: '出', name: '出張・外出', color: 'bg-sky-100' },
    { id: '保', name: '保留・その他', color: 'bg-slate-100' },
    { id: '休', name: '公休', color: 'bg-gray-100' },
];

export const PROTECTED_SHIFT_IDS: ShiftPatternId[] = ['振', '有', '半有', '研', '出', '保'];
export const HOLIDAY_SHIFT_IDS: ShiftPatternId[] = [...PROTECTED_SHIFT_IDS, '休', ''];

export function isProtectedShiftId(shift: ShiftPatternId | undefined | null): boolean {
    return !!shift && (PROTECTED_SHIFT_IDS.includes(shift) || parseHalfDayLeaveShiftId(shift) !== null);
}

export function isWorkShiftId(shift: ShiftPatternId | undefined | null): shift is ShiftPatternId {
    return !!shift && !HOLIDAY_SHIFT_IDS.includes(shift);
}

export function countsAsFullDayStaffingShift(shift: ShiftPatternId | undefined | null): boolean {
    return shift === '保';
}

export function countsAsStaffingShift(shift: ShiftPatternId | undefined | null): boolean {
    return countsAsFullDayStaffingShift(shift) || isWorkShiftId(shift);
}

export function getDefaultPatternKind(id: ShiftPatternId): ShiftPatternKind {
    if (id === 'A') return 'opening';
    if (id === 'B') return 'early';
    if (id === 'E') return 'late';
    if (id === 'F' || id === 'J') return 'closing';
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
    const effectiveShift = getEffectiveWorkShiftId(shift);
    if (!effectiveShift) return null;
    const pattern = patterns.find(p => p.id === effectiveShift);
    return pattern?.kind ?? getDefaultPatternKind(effectiveShift);
}
