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
    { id: 1, name: '園長 01', position: '園長', shiftType: 'no_shift', preferredShifts: [], weeklyDays: 0, role: null, incompatibleWith: [], earlyShiftLimit: null, saturdayOnly: false, hasQualification: false },
    { id: 2, name: '主任 01', position: '主任', shiftType: 'backup', preferredShifts: [], weeklyDays: 0, role: null, incompatibleWith: [], earlyShiftLimit: null, saturdayOnly: false, hasQualification: true },
    { id: 3, name: '保育士 01', position: '保育士', shiftType: 'regular', preferredShifts: [], weeklyDays: 5, role: 'infant', incompatibleWith: [], earlyShiftLimit: null, saturdayOnly: false, hasQualification: true },
    { id: 4, name: '保育士 02', position: '保育士', shiftType: 'regular', preferredShifts: [], weeklyDays: 5, role: 'infant', incompatibleWith: [6], earlyShiftLimit: null, saturdayOnly: false, hasQualification: true },
    { id: 5, name: '保育士 03', position: '保育士', shiftType: 'regular', preferredShifts: [], weeklyDays: 5, role: 'infant', incompatibleWith: [], earlyShiftLimit: 2, saturdayOnly: false, hasQualification: true },
    { id: 6, name: '保育士 04', position: '保育士', shiftType: 'regular', preferredShifts: [], weeklyDays: 5, role: 'infant', incompatibleWith: [4], earlyShiftLimit: null, saturdayOnly: false, hasQualification: true },
    { id: 7, name: '保育士 05', position: '保育士', shiftType: 'regular', preferredShifts: [], weeklyDays: 5, role: 'toddler', incompatibleWith: [8], earlyShiftLimit: null, saturdayOnly: false, hasQualification: true },
    { id: 8, name: '保育士 06', position: '保育士', shiftType: 'regular', preferredShifts: [], weeklyDays: 5, role: 'toddler', incompatibleWith: [7], earlyShiftLimit: null, saturdayOnly: false, hasQualification: true },
    { id: 9, name: '保育士 07', position: '保育士', shiftType: 'regular', preferredShifts: [], weeklyDays: 5, role: 'toddler', incompatibleWith: [], earlyShiftLimit: null, saturdayOnly: false, hasQualification: true },
    { id: 10, name: '保育士 08', position: '保育士', shiftType: 'regular', preferredShifts: [], weeklyDays: 5, role: 'free', incompatibleWith: [], earlyShiftLimit: null, saturdayOnly: false, hasQualification: true },
    { id: 11, name: '調理 01', position: '調理', shiftType: 'cooking', preferredShifts: [], weeklyDays: 5, role: 'cooking', incompatibleWith: [], earlyShiftLimit: null, saturdayOnly: false, hasQualification: false },
    { id: 12, name: '調理 02', position: '調理', shiftType: 'cooking', preferredShifts: [], weeklyDays: 5, role: 'cooking', incompatibleWith: [], earlyShiftLimit: null, saturdayOnly: false, hasQualification: false },
    { id: 13, name: 'パート 01', position: 'パート', shiftType: 'part_time', preferredShifts: [], weeklyDays: 3, role: null, incompatibleWith: [], earlyShiftLimit: null, saturdayOnly: false, hasQualification: false },
    { id: 14, name: 'パート 02', position: 'パート', shiftType: 'part_time', preferredShifts: [], weeklyDays: 3, role: null, incompatibleWith: [], earlyShiftLimit: null, saturdayOnly: false, hasQualification: true },
    { id: 15, name: 'パート 03', position: 'パート', shiftType: 'part_time', preferredShifts: [], weeklyDays: 1, role: null, incompatibleWith: [], earlyShiftLimit: null, saturdayOnly: false, hasQualification: false },
    { id: 16, name: 'パート 04', position: 'パート', shiftType: 'part_time', preferredShifts: [], weeklyDays: 0, role: null, incompatibleWith: [], earlyShiftLimit: null, saturdayOnly: true, hasQualification: false },
    { id: 17, name: 'パート 05', position: 'パート', shiftType: 'part_time', preferredShifts: [], weeklyDays: 4, role: null, incompatibleWith: [], earlyShiftLimit: null, saturdayOnly: false, hasQualification: false },
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
