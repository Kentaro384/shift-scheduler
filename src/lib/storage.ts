import type { Staff, Settings, Holiday, ShiftSchedule, ShiftPatternDefinition } from '../types';
import { SHIFT_PATTERNS } from '../types';

const KEYS = {
    STAFF: 'hoikuen_staff',
    SETTINGS: 'hoikuen_settings',
    HOLIDAYS: 'hoikuen_holidays',
    SCHEDULE: 'hoikuen_schedule',
    PATTERNS: 'hoikuen_shift_patterns',
};

const DEFAULT_STAFF: Staff[] = [
    { id: 1, name: '狐原 夕子', position: '園長', shiftType: 'no_shift', preferredShifts: [], weeklyDays: 0, role: null, incompatibleWith: [], earlyShiftLimit: null, saturdayOnly: false, hasQualification: false },
    { id: 2, name: '宮地 千賀子', position: '主任', shiftType: 'backup', preferredShifts: [], weeklyDays: 0, role: null, incompatibleWith: [], earlyShiftLimit: null, saturdayOnly: false, hasQualification: true },
    { id: 3, name: '円谷 友里', position: '保育士', shiftType: 'regular', preferredShifts: [], weeklyDays: 5, role: 'infant', incompatibleWith: [], earlyShiftLimit: null, saturdayOnly: false, hasQualification: true },
    { id: 4, name: '外崎 佑実', position: '保育士', shiftType: 'regular', preferredShifts: [], weeklyDays: 5, role: 'infant', incompatibleWith: [6], earlyShiftLimit: null, saturdayOnly: false, hasQualification: true },
    { id: 5, name: '佐々木 実代子', position: '保育士', shiftType: 'regular', preferredShifts: [], weeklyDays: 5, role: 'infant', incompatibleWith: [], earlyShiftLimit: 2, saturdayOnly: false, hasQualification: true },
    { id: 6, name: '長野 幸代', position: '保育士', shiftType: 'regular', preferredShifts: [], weeklyDays: 5, role: 'infant', incompatibleWith: [4], earlyShiftLimit: null, saturdayOnly: false, hasQualification: true },
    { id: 7, name: '南雲 奈保子', position: '保育士', shiftType: 'regular', preferredShifts: [], weeklyDays: 5, role: 'toddler', incompatibleWith: [8], earlyShiftLimit: null, saturdayOnly: false, hasQualification: true },
    { id: 8, name: '宮本 弥生', position: '保育士', shiftType: 'regular', preferredShifts: [], weeklyDays: 5, role: 'toddler', incompatibleWith: [7], earlyShiftLimit: null, saturdayOnly: false, hasQualification: true },
    { id: 9, name: '和野 真澄', position: '保育士', shiftType: 'regular', preferredShifts: [], weeklyDays: 5, role: 'toddler', incompatibleWith: [], earlyShiftLimit: null, saturdayOnly: false, hasQualification: true },
    { id: 10, name: '椎名 ゆかり', position: '保育士', shiftType: 'regular', preferredShifts: [], weeklyDays: 5, role: 'free', incompatibleWith: [], earlyShiftLimit: null, saturdayOnly: false, hasQualification: true },
    { id: 11, name: '小田島 彩', position: '調理', shiftType: 'cooking', preferredShifts: [], weeklyDays: 5, role: 'cooking', incompatibleWith: [], earlyShiftLimit: null, saturdayOnly: false, hasQualification: false },
    { id: 12, name: '足立 望愛', position: '調理', shiftType: 'cooking', preferredShifts: [], weeklyDays: 5, role: 'cooking', incompatibleWith: [], earlyShiftLimit: null, saturdayOnly: false, hasQualification: false },
    { id: 13, name: '仲本 陽菜', position: 'パート', shiftType: 'part_time', preferredShifts: [], weeklyDays: 3, role: null, incompatibleWith: [], earlyShiftLimit: null, saturdayOnly: false, hasQualification: false },
    { id: 14, name: '直江 彩', position: 'パート', shiftType: 'part_time', preferredShifts: [], weeklyDays: 3, role: null, incompatibleWith: [], earlyShiftLimit: null, saturdayOnly: false, hasQualification: true },
    { id: 15, name: '宮尾 柚希', position: 'パート', shiftType: 'part_time', preferredShifts: [], weeklyDays: 1, role: null, incompatibleWith: [], earlyShiftLimit: null, saturdayOnly: false, hasQualification: false },
    { id: 16, name: '佐々木 有理果', position: 'パート', shiftType: 'part_time', preferredShifts: [], weeklyDays: 0, role: null, incompatibleWith: [], earlyShiftLimit: null, saturdayOnly: true, hasQualification: false },
    { id: 17, name: '伊與田 睦美', position: 'パート', shiftType: 'part_time', preferredShifts: [], weeklyDays: 4, role: null, incompatibleWith: [], earlyShiftLimit: null, saturdayOnly: false, hasQualification: false },
];

const DEFAULT_SETTINGS: Settings = {
    saturdayStaffCount: 3,
    saturdayShiftPattern: 'B', // デフォルトは標準シフト
};

export const storage = {
    getStaff: (): Staff[] => {
        try {
            const data = localStorage.getItem(KEYS.STAFF);
            const parsed = data ? JSON.parse(data) : DEFAULT_STAFF;
            return Array.isArray(parsed) ? parsed : DEFAULT_STAFF;
        } catch {
            return DEFAULT_STAFF;
        }
    },
    saveStaff: (staff: Staff[]) => {
        localStorage.setItem(KEYS.STAFF, JSON.stringify(staff));
    },
    getSettings: (): Settings => {
        try {
            const data = localStorage.getItem(KEYS.SETTINGS);
            const saved = data ? JSON.parse(data) : {};
            // Merge with defaults to ensure new fields are included
            return { ...DEFAULT_SETTINGS, ...saved };
        } catch {
            return DEFAULT_SETTINGS;
        }
    },
    saveSettings: (settings: Settings) => {
        localStorage.setItem(KEYS.SETTINGS, JSON.stringify(settings));
    },
    getHolidays: (): Holiday[] => {
        try {
            const data = localStorage.getItem(KEYS.HOLIDAYS);
            const parsed = data ? JSON.parse(data) : [];
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    },
    saveHolidays: (holidays: Holiday[]) => {
        localStorage.setItem(KEYS.HOLIDAYS, JSON.stringify(holidays));
    },
    getSchedule: (): ShiftSchedule => {
        try {
            const data = localStorage.getItem(KEYS.SCHEDULE);
            return data ? JSON.parse(data) : {};
        } catch {
            return {};
        }
    },
    saveSchedule: (schedule: ShiftSchedule) => {
        localStorage.setItem(KEYS.SCHEDULE, JSON.stringify(schedule));
    },
    getPatterns: (): ShiftPatternDefinition[] => {
        try {
            const data = localStorage.getItem(KEYS.PATTERNS);
            const parsed = data ? JSON.parse(data) : SHIFT_PATTERNS;
            return Array.isArray(parsed) ? parsed : SHIFT_PATTERNS;
        } catch {
            return SHIFT_PATTERNS;
        }
    },
    savePatterns: (patterns: ShiftPatternDefinition[]) => {
        localStorage.setItem(KEYS.PATTERNS, JSON.stringify(patterns));
    },
};
