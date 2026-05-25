import {
    addDoc,
    collection,
    deleteField,
    doc,
    getDoc,
    onSnapshot,
    serverTimestamp,
    setDoc,
    updateDoc,
} from 'firebase/firestore';
import type { FirestoreError, Unsubscribe } from 'firebase/firestore';
import { db } from './firebase';
import { getCurrentUser } from './auth';
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
    updatedBy?: AuditActor;
    lastOperation?: LastOperation;
}

export type AuditActor = {
    uid: string | null;
    email: string | null;
    displayName: string | null;
};

type AuditDetailValue = string | number | boolean | null | string[] | number[];

export type SaveAuditContext = {
    action: string;
    label: string;
    monthKey?: string;
    targetDate?: string;
    targetStaffId?: number;
    affectedFields?: string[];
    affectedDateCount?: number;
    detail?: Record<string, AuditDetailValue>;
};

export type LastOperation = Omit<SaveAuditContext, 'detail'> & {
    at: number;
};

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
const getAuditLogCollectionRef = () => collection(getDocRef(), 'auditLogs');

const getCurrentAuditActor = (): AuditActor => {
    const currentUser = getCurrentUser();

    return {
        uid: currentUser?.uid ?? null,
        email: currentUser?.email ?? null,
        displayName: currentUser?.displayName ?? null,
    };
};

const buildLastOperation = (audit: SaveAuditContext, updatedAt: number): LastOperation => {
    const operation: LastOperation = {
        action: audit.action,
        label: audit.label,
        at: updatedAt,
    };

    if (audit.monthKey) operation.monthKey = audit.monthKey;
    if (audit.targetDate) operation.targetDate = audit.targetDate;
    if (typeof audit.targetStaffId === 'number') operation.targetStaffId = audit.targetStaffId;
    if (audit.affectedFields?.length) operation.affectedFields = audit.affectedFields;
    if (typeof audit.affectedDateCount === 'number') operation.affectedDateCount = audit.affectedDateCount;

    return operation;
};

export const buildAuditMetadata = (
    audit: SaveAuditContext | undefined,
    updatedAt: number,
    actor: AuditActor,
): Partial<OrganizationData> => {
    if (!audit) return {};

    return {
        updatedBy: actor,
        lastOperation: buildLastOperation(audit, updatedAt),
    };
};

const buildAuditLogPayload = (
    audit: SaveAuditContext,
    updatedAt: number,
    actor: AuditActor,
): Record<string, unknown> => {
    const payload: Record<string, unknown> = {
        schemaVersion: 1,
        source: 'web-app',
        action: audit.action,
        label: audit.label,
        actor,
        clientAt: updatedAt,
        at: serverTimestamp(),
    };

    if (audit.monthKey) payload.monthKey = audit.monthKey;
    if (audit.targetDate) payload.targetDate = audit.targetDate;
    if (typeof audit.targetStaffId === 'number') payload.targetStaffId = audit.targetStaffId;
    if (audit.affectedFields?.length) payload.affectedFields = audit.affectedFields;
    if (typeof audit.affectedDateCount === 'number') payload.affectedDateCount = audit.affectedDateCount;
    if (audit.detail && Object.keys(audit.detail).length > 0) payload.detail = audit.detail;

    return payload;
};

const writeAuditLog = async (
    audit: SaveAuditContext | undefined,
    updatedAt: number,
    actor: AuditActor,
): Promise<void> => {
    if (!audit) return;

    try {
        await addDoc(getAuditLogCollectionRef(), buildAuditLogPayload(audit, updatedAt, actor));
    } catch (error) {
        console.warn('Failed to write audit log:', error);
    }
};

export const buildClearMonthUpdates = (
    dateStrings: string[],
    updatedAt: number = Date.now(),
    deleteValue: unknown = deleteField(),
): Record<string, unknown> => {
    const updates: Record<string, unknown> = { updatedAt };

    dateStrings.forEach(dateStr => {
        updates[`schedule.${dateStr}`] = deleteValue;
        updates[`timeRangeSchedule.${dateStr}`] = deleteValue;
        updates[`manualShifts.${dateStr}`] = deleteValue;
        updates[`notes.${dateStr}`] = deleteValue;
    });

    return updates;
};

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
    async saveAll(data: Partial<OrganizationData>, audit?: SaveAuditContext): Promise<void> {
        const updatedAt = Date.now();
        const actor = getCurrentAuditActor();
        const payload = {
            ...data,
            ...buildAuditMetadata(audit, updatedAt, actor),
            updatedAt,
        };

        try {
            await updateDoc(getDocRef(), payload);
            await writeAuditLog(audit, updatedAt, actor);
        } catch (error) {
            if ((error as FirestoreError).code === 'not-found') {
                await setDoc(getDocRef(), payload, { merge: true });
                await writeAuditLog(audit, updatedAt, actor);
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
    async saveStaff(staff: Staff[], audit?: SaveAuditContext): Promise<void> {
        await this.saveAll({ staff }, audit);
    },

    async saveSchedule(schedule: ShiftSchedule, audit?: SaveAuditContext): Promise<void> {
        await this.saveAll({ schedule }, audit);
    },

    async saveScheduleAndManualShifts(schedule: ShiftSchedule, manualShifts: ShiftSchedule, audit?: SaveAuditContext): Promise<void> {
        await this.saveAll({ schedule, manualShifts }, audit);
    },

    async saveSettings(settings: Settings, audit?: SaveAuditContext): Promise<void> {
        await this.saveAll({ settings }, audit);
    },

    async saveHolidays(holidays: Holiday[], audit?: SaveAuditContext): Promise<void> {
        await this.saveAll({ holidays }, audit);
    },

    async savePatterns(patterns: ShiftPatternDefinition[], audit?: SaveAuditContext): Promise<void> {
        await this.saveAll({ patterns: normalizeShiftPatterns(patterns) }, audit);
    },

    async saveManualShifts(manualShifts: ShiftSchedule, audit?: SaveAuditContext): Promise<void> {
        await this.saveAll({ manualShifts }, audit);
    },

    async saveTimeRangeSchedule(timeRangeSchedule: TimeRangeSchedule, audit?: SaveAuditContext): Promise<void> {
        await this.saveAll({ timeRangeSchedule }, audit);
    },

    async saveScheduleTimeRangesAndManualShifts(
        schedule: ShiftSchedule,
        timeRangeSchedule: TimeRangeSchedule,
        manualShifts: ShiftSchedule,
        audit?: SaveAuditContext,
    ): Promise<void> {
        await this.saveAll({ schedule, timeRangeSchedule, manualShifts }, audit);
    },

    async saveNotes(notes: DailyNotes, audit?: SaveAuditContext): Promise<void> {
        await this.saveAll({ notes }, audit);
    },

    async saveExcelExportLog(excelExportLog: Record<string, string>, audit?: SaveAuditContext): Promise<void> {
        await this.saveAll({ excelExportLog }, audit);
    },

    async clearMonthData(dateStrings: string[], audit?: SaveAuditContext): Promise<void> {
        const updatedAt = Date.now();
        const actor = getCurrentAuditActor();
        const updates = {
            ...buildClearMonthUpdates(dateStrings, updatedAt),
            ...buildAuditMetadata(audit, updatedAt, actor),
        };

        try {
            await updateDoc(getDocRef(), updates);
            await writeAuditLog(audit, updatedAt, actor);
        } catch (error) {
            if ((error as FirestoreError).code === 'not-found') return;
            throw error;
        }
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
