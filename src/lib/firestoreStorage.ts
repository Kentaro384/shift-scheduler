import {
    deleteField,
    doc,
    getDoc,
    onSnapshot,
    setDoc,
    updateDoc,
} from 'firebase/firestore';
import type { FirestoreError, Unsubscribe } from 'firebase/firestore';
import { db } from './firebase';
import type { Staff, ShiftSchedule, Settings, Holiday, ShiftPatternDefinition, TimeRangeSchedule, DailyNotes } from '../types';
import { SHIFT_PATTERNS, normalizeShiftPatterns } from '../types';

// Collection paths
const COLLECTION = 'organizations';
const DOC_ID = 'default'; // For single organization, use 'default'

// Document structure
interface OrganizationData {
    staff: Staff[];
    schedule: ShiftSchedule;
    settings: Settings;
    holidays: Holiday[];
    patterns: ShiftPatternDefinition[];
    manualShifts: ShiftSchedule;
    timeRangeSchedule: TimeRangeSchedule;  // Part-time worker time ranges
    notes: DailyNotes;
    excelExportLog?: Record<string, string>;
    updatedAt: number;
}

// Default values matching types.ts
const defaultSettings: Settings = {
    profileName: 'デフォルト園',
    fiscalYear: new Date().getFullYear(),
    weekdayStaffCount: 8,
    saturdayStaffCount: 3,
    saturdayShiftPattern: 'B',
    chiefBackupLimit: 8,
};

// Get document reference
const getDocRef = () => doc(db, COLLECTION, DOC_ID);

// Firestore Storage Service
export const firestoreStorage = {
    // Load all data
    async loadAll(): Promise<OrganizationData | null> {
        try {
            const docSnap = await getDoc(getDocRef());
            if (docSnap.exists()) {
                return docSnap.data() as OrganizationData;
            }
            return null;
        } catch (error) {
            console.error('Error loading from Firestore:', error);
            return null;
        }
    },

    // Save all data
    async saveAll(data: Partial<OrganizationData>): Promise<void> {
        const payload = {
            ...data,
            updatedAt: Date.now()
        };

        try {
            await updateDoc(getDocRef(), payload);
        } catch (error) {
            if ((error as FirestoreError).code === 'not-found') {
                await setDoc(getDocRef(), payload, { merge: true });
                return;
            }

            console.error('Error saving to Firestore:', error);
            throw error;
        }
    },

    // Subscribe to real-time updates
    subscribe(callback: (data: OrganizationData | null, error?: FirestoreError) => void): Unsubscribe {
        return onSnapshot(getDocRef(), (docSnap) => {
            if (docSnap.exists()) {
                callback(docSnap.data() as OrganizationData);
            } else {
                callback(null);
            }
        }, (error) => {
            console.error('Firestore subscription error:', error);
            callback(null, error);
        });
    },

    // Individual save methods
    async saveStaff(staff: Staff[]): Promise<void> {
        await this.saveAll({ staff });
    },

    async saveSchedule(schedule: ShiftSchedule): Promise<void> {
        await this.saveAll({ schedule });
    },

    async saveScheduleAndManualShifts(schedule: ShiftSchedule, manualShifts: ShiftSchedule): Promise<void> {
        await this.saveAll({ schedule, manualShifts });
    },

    async saveSettings(settings: Settings): Promise<void> {
        await this.saveAll({ settings });
    },

    async saveHolidays(holidays: Holiday[]): Promise<void> {
        await this.saveAll({ holidays });
    },

    async savePatterns(patterns: ShiftPatternDefinition[]): Promise<void> {
        await this.saveAll({ patterns: normalizeShiftPatterns(patterns) });
    },

    async saveManualShifts(manualShifts: ShiftSchedule): Promise<void> {
        await this.saveAll({ manualShifts });
    },

    async saveTimeRangeSchedule(timeRangeSchedule: TimeRangeSchedule): Promise<void> {
        await this.saveAll({ timeRangeSchedule });
    },

    async saveScheduleTimeRangesAndManualShifts(
        schedule: ShiftSchedule,
        timeRangeSchedule: TimeRangeSchedule,
        manualShifts: ShiftSchedule,
    ): Promise<void> {
        await this.saveAll({ schedule, timeRangeSchedule, manualShifts });
    },

    async saveNotes(notes: DailyNotes): Promise<void> {
        await this.saveAll({ notes });
    },

    async saveExcelExportLog(excelExportLog: Record<string, string>): Promise<void> {
        await this.saveAll({ excelExportLog });
    },

    async clearMonthData(dateStrings: string[], currentStaff: Staff[]): Promise<void> {
        const updates: Record<string, unknown> = {
            staff: currentStaff,
            updatedAt: Date.now(),
        };

        dateStrings.forEach(dateStr => {
            updates[`schedule.${dateStr}`] = deleteField();
            updates[`timeRangeSchedule.${dateStr}`] = deleteField();
            updates[`manualShifts.${dateStr}`] = deleteField();
            updates[`notes.${dateStr}`] = deleteField();
        });

        await updateDoc(getDocRef(), updates);
    },

    // Get default values
    getDefaultSettings(): Settings {
        return defaultSettings;
    },

    normalizeSettings(settings?: Partial<Settings> | null): Settings {
        return { ...defaultSettings, ...(settings || {}) };
    },

    getDefaultPatterns(): ShiftPatternDefinition[] {
        return SHIFT_PATTERNS;
    },

    normalizePatterns(patterns?: ShiftPatternDefinition[] | null): ShiftPatternDefinition[] {
        return normalizeShiftPatterns(patterns?.length ? patterns : SHIFT_PATTERNS);
    }
};

export type { OrganizationData };
