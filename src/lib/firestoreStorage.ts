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
const getBackupsCollectionRef = () => collection(getDocRef(), 'backups');

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

type DateKeyedMap = Record<string, unknown>;

export type MonthBackupInput = {
    monthKey: string;
    reason: string;
    label: string;
    dateStrings: string[];
    schedule: ShiftSchedule;
    timeRangeSchedule: TimeRangeSchedule;
    manualShifts: ShiftSchedule;
    notes: DailyNotes;
    detail?: Record<string, AuditDetailValue>;
};

const pickDateEntries = <T extends Record<string, unknown>>(source: T, dateStrings: string[]): Partial<T> => {
    const picked: Partial<T> = {};
    dateStrings.forEach(dateStr => {
        if (Object.prototype.hasOwnProperty.call(source, dateStr)) {
            picked[dateStr as keyof T] = source[dateStr] as T[keyof T];
        }
    });
    return picked;
};

const countNestedEntries = (source: Record<string, unknown>): number =>
    Object.values(source).reduce<number>((total, day) => {
        if (!day || typeof day !== 'object' || Array.isArray(day)) return total;
        return total + Object.keys(day).length;
    }, 0);

export const buildMonthBackupPayload = (
    input: MonthBackupInput,
    updatedAt: number,
    actor: AuditActor,
    atValue: unknown = serverTimestamp(),
): Record<string, unknown> => {
    const schedule = pickDateEntries(input.schedule, input.dateStrings);
    const timeRangeSchedule = pickDateEntries(input.timeRangeSchedule, input.dateStrings);
    const manualShifts = pickDateEntries(input.manualShifts, input.dateStrings);
    const notes = pickDateEntries(input.notes, input.dateStrings);

    const payload: Record<string, unknown> = {
        schemaVersion: 1,
        source: 'web-app',
        reason: input.reason,
        label: input.label,
        monthKey: input.monthKey,
        actor,
        clientAt: updatedAt,
        at: atValue,
        affectedDateCount: input.dateStrings.length,
        summary: {
            scheduleDateCount: Object.keys(schedule).length,
            timeRangeDateCount: Object.keys(timeRangeSchedule).length,
            manualShiftDateCount: Object.keys(manualShifts).length,
            notesDateCount: Object.keys(notes).length,
            scheduleCellCount: countNestedEntries(schedule),
            timeRangeCellCount: countNestedEntries(timeRangeSchedule),
            manualShiftCellCount: countNestedEntries(manualShifts),
        },
        data: {
            schedule,
            timeRangeSchedule,
            manualShifts,
            notes,
        },
    };

    if (input.detail && Object.keys(input.detail).length > 0) payload.detail = input.detail;

    return payload;
};

const buildDateFieldUpdates = (
    fieldName: string,
    source: DateKeyedMap,
    dateStrings: string[],
): Record<string, unknown> => {
    const updates: Record<string, unknown> = {};

    dateStrings.forEach(dateStr => {
        updates[`${fieldName}.${dateStr}`] = source[dateStr] ?? {};
    });

    return updates;
};

export const buildScopedSaveUpdates = (
    data: Record<string, DateKeyedMap>,
    dateStrings: string[],
    updatedAt: number = Date.now(),
): Record<string, unknown> => {
    const updates: Record<string, unknown> = { updatedAt };

    Object.entries(data).forEach(([fieldName, source]) => {
        Object.assign(updates, buildDateFieldUpdates(fieldName, source, dateStrings));
    });

    return updates;
};

const getDateCellValue = (source: DateKeyedMap, dateStr: string, staffId: number): unknown => {
    const day = source[dateStr];
    if (!day || typeof day !== 'object' || Array.isArray(day)) return undefined;

    const dayRecord = day as Record<string, unknown>;
    const staffKey = String(staffId);
    if (!Object.prototype.hasOwnProperty.call(dayRecord, staffKey)) return undefined;

    return dayRecord[staffKey];
};

export const buildScopedStaffCellUpdates = (
    data: Record<string, DateKeyedMap>,
    dateStr: string,
    staffIds: number[],
    updatedAt: number = Date.now(),
    deleteValue: unknown = deleteField(),
): Record<string, unknown> => {
    const updates: Record<string, unknown> = { updatedAt };

    Object.entries(data).forEach(([fieldName, source]) => {
        staffIds.forEach(staffId => {
            const value = getDateCellValue(source, dateStr, staffId);
            updates[`${fieldName}.${dateStr}.${staffId}`] = value ?? deleteValue;
        });
    });

    return updates;
};

export const expandDottedUpdates = (updates: Record<string, unknown>): Record<string, unknown> => {
    const expanded: Record<string, unknown> = {};

    Object.entries(updates).forEach(([path, value]) => {
        const parts = path.split('.');
        if (parts.length === 1) {
            expanded[path] = value;
            return;
        }

        let cursor = expanded;
        parts.slice(0, -1).forEach(part => {
            if (!cursor[part] || typeof cursor[part] !== 'object' || Array.isArray(cursor[part])) {
                cursor[part] = {};
            }
            cursor = cursor[part] as Record<string, unknown>;
        });
        cursor[parts[parts.length - 1]] = value;
    });

    return expanded;
};

const hasDottedPath = (updates: Record<string, unknown>): boolean =>
    Object.keys(updates).some(path => path.includes('.'));

const writeUpdates = async (
    updates: Record<string, unknown>,
    audit: SaveAuditContext | undefined,
    updatedAt: number,
    actor: AuditActor,
): Promise<void> => {
    try {
        await updateDoc(getDocRef(), updates);
        await writeAuditLog(audit, updatedAt, actor);
    } catch (error) {
        if ((error as FirestoreError).code === 'not-found') {
            await setDoc(getDocRef(), hasDottedPath(updates) ? expandDottedUpdates(updates) : updates, { merge: true });
            await writeAuditLog(audit, updatedAt, actor);
            return;
        }

        console.error('Error saving to Firestore:', error);
        throw error;
    }
};

const saveScopedDateFields = async (
    data: Record<string, DateKeyedMap>,
    dateStrings: string[],
    audit?: SaveAuditContext,
): Promise<void> => {
    const updatedAt = Date.now();
    const actor = getCurrentAuditActor();
    const updates = {
        ...buildScopedSaveUpdates(data, dateStrings, updatedAt),
        ...buildAuditMetadata(audit, updatedAt, actor),
    };

    await writeUpdates(updates, audit, updatedAt, actor);
};

const saveScopedStaffCells = async (
    data: Record<string, DateKeyedMap>,
    dateStr: string,
    staffIds: number[],
    audit?: SaveAuditContext,
): Promise<void> => {
    const updatedAt = Date.now();
    const actor = getCurrentAuditActor();
    const uniqueStaffIds = Array.from(new Set(staffIds));
    const updates = {
        ...buildScopedStaffCellUpdates(data, dateStr, uniqueStaffIds, updatedAt),
        ...buildAuditMetadata(audit, updatedAt, actor),
    };

    await writeUpdates(updates, audit, updatedAt, actor);
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

        await writeUpdates(payload, audit, updatedAt, actor);
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

    async saveScheduleDates(schedule: ShiftSchedule, dateStrings: string[], audit?: SaveAuditContext): Promise<void> {
        await saveScopedDateFields({ schedule }, dateStrings, audit);
    },

    async saveScheduleAndManualShifts(schedule: ShiftSchedule, manualShifts: ShiftSchedule, audit?: SaveAuditContext): Promise<void> {
        await this.saveAll({ schedule, manualShifts }, audit);
    },

    async saveScheduleAndManualShiftDates(
        schedule: ShiftSchedule,
        manualShifts: ShiftSchedule,
        dateStrings: string[],
        audit?: SaveAuditContext,
    ): Promise<void> {
        await saveScopedDateFields({ schedule, manualShifts }, dateStrings, audit);
    },

    async saveScheduleAndManualShiftCells(
        schedule: ShiftSchedule,
        manualShifts: ShiftSchedule,
        dateStr: string,
        staffIds: number[],
        audit?: SaveAuditContext,
    ): Promise<void> {
        await saveScopedStaffCells({ schedule, manualShifts }, dateStr, staffIds, audit);
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

    async saveTimeRangeDates(timeRangeSchedule: TimeRangeSchedule, dateStrings: string[], audit?: SaveAuditContext): Promise<void> {
        await saveScopedDateFields({ timeRangeSchedule }, dateStrings, audit);
    },

    async saveScheduleTimeRangesAndManualShifts(
        schedule: ShiftSchedule,
        timeRangeSchedule: TimeRangeSchedule,
        manualShifts: ShiftSchedule,
        audit?: SaveAuditContext,
    ): Promise<void> {
        await this.saveAll({ schedule, timeRangeSchedule, manualShifts }, audit);
    },

    async saveScheduleTimeRangeManualShiftDates(
        schedule: ShiftSchedule,
        timeRangeSchedule: TimeRangeSchedule,
        manualShifts: ShiftSchedule,
        dateStrings: string[],
        audit?: SaveAuditContext,
    ): Promise<void> {
        await saveScopedDateFields({ schedule, timeRangeSchedule, manualShifts }, dateStrings, audit);
    },

    async saveScheduleTimeRangeManualShiftCells(
        schedule: ShiftSchedule,
        timeRangeSchedule: TimeRangeSchedule,
        manualShifts: ShiftSchedule,
        dateStr: string,
        staffIds: number[],
        audit?: SaveAuditContext,
    ): Promise<void> {
        await saveScopedStaffCells({ schedule, timeRangeSchedule, manualShifts }, dateStr, staffIds, audit);
    },

    async saveNotes(notes: DailyNotes, audit?: SaveAuditContext): Promise<void> {
        await this.saveAll({ notes }, audit);
    },

    async saveNoteDate(dateStr: string, note: string, audit?: SaveAuditContext): Promise<void> {
        await saveScopedDateFields({ notes: { [dateStr]: note } }, [dateStr], audit);
    },

    async saveExcelExportLog(excelExportLog: Record<string, string>, audit?: SaveAuditContext): Promise<void> {
        await this.saveAll({ excelExportLog }, audit);
    },

    async saveExcelExportMonth(monthKey: string, exportedAt: string, audit?: SaveAuditContext): Promise<void> {
        const updatedAt = Date.now();
        const actor = getCurrentAuditActor();
        const updates = {
            [`excelExportLog.${monthKey}`]: exportedAt,
            ...buildAuditMetadata(audit, updatedAt, actor),
            updatedAt,
        };

        await writeUpdates(updates, audit, updatedAt, actor);
    },

    async createMonthBackup(input: MonthBackupInput): Promise<string> {
        const updatedAt = Date.now();
        const actor = getCurrentAuditActor();
        const backupRef = await addDoc(
            getBackupsCollectionRef(),
            buildMonthBackupPayload(input, updatedAt, actor),
        );
        return backupRef.id;
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
