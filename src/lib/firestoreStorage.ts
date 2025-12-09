import {
    doc,
    getDoc,
    setDoc,
    onSnapshot,
} from 'firebase/firestore';
import type { Unsubscribe } from 'firebase/firestore';
import { db } from './firebase';
import type { Staff, ShiftSchedule, Settings, Holiday, ShiftPatternDefinition } from '../types';
import { SHIFT_PATTERNS } from '../types';

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
    updatedAt: number;
}

// Default values matching types.ts
const defaultSettings: Settings = {
    saturdayStaffCount: 3,
    saturdayShiftPattern: 'B',
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
        try {
            await setDoc(getDocRef(), {
                ...data,
                updatedAt: Date.now()
            }, { merge: true });
        } catch (error) {
            console.error('Error saving to Firestore:', error);
            throw error;
        }
    },

    // Subscribe to real-time updates
    subscribe(callback: (data: OrganizationData | null) => void): Unsubscribe {
        return onSnapshot(getDocRef(), (docSnap) => {
            if (docSnap.exists()) {
                callback(docSnap.data() as OrganizationData);
            } else {
                callback(null);
            }
        }, (error) => {
            console.error('Firestore subscription error:', error);
            callback(null);
        });
    },

    // Individual save methods
    async saveStaff(staff: Staff[]): Promise<void> {
        await this.saveAll({ staff });
    },

    async saveSchedule(schedule: ShiftSchedule): Promise<void> {
        await this.saveAll({ schedule });
    },

    async saveSettings(settings: Settings): Promise<void> {
        await this.saveAll({ settings });
    },

    async saveHolidays(holidays: Holiday[]): Promise<void> {
        await this.saveAll({ holidays });
    },

    async savePatterns(patterns: ShiftPatternDefinition[]): Promise<void> {
        await this.saveAll({ patterns });
    },

    async saveManualShifts(manualShifts: ShiftSchedule): Promise<void> {
        await this.saveAll({ manualShifts });
    },

    // Get default values
    getDefaultSettings(): Settings {
        return defaultSettings;
    },

    getDefaultPatterns(): ShiftPatternDefinition[] {
        return SHIFT_PATTERNS;
    }
};

export type { OrganizationData };
