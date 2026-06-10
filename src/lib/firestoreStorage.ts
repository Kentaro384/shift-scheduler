import {
    addDoc,
    collection,
    deleteField,
    doc,
    getDoc,
    getDocs,
    limit,
    onSnapshot,
    orderBy,
    query,
    runTransaction,
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
type AuditPatchScalar = string | number | boolean | null | string[] | number[] | Record<string, unknown>;
type MissingPatchValue = { __missing: true };

export type UndoFieldPatch = {
    path: string;
    before: AuditPatchScalar | MissingPatchValue;
    after: AuditPatchScalar | MissingPatchValue;
};

export type UndoPatch = {
    fields: UndoFieldPatch[];
};

export type SaveAuditContext = {
    action: string;
    label: string;
    monthKey?: string;
    targetDate?: string;
    targetStaffId?: number;
    affectedFields?: string[];
    affectedDateCount?: number;
    detail?: Record<string, AuditDetailValue>;
    undoPatch?: UndoPatch;
};

export type LastOperation = Omit<SaveAuditContext, 'detail'> & {
    at: number;
};

export type AuditLogRecord = {
    id: string;
    action: string;
    label: string;
    monthKey?: string;
    targetDate?: string;
    targetStaffId?: number;
    affectedFields?: string[];
    affectedDateCount?: number;
    detail?: Record<string, unknown>;
    undoPatch?: UndoPatch;
};

export class UndoConflictError extends Error {
    readonly conflictPaths: string[];

    constructor(conflictPaths: string[]) {
        super('Undo target has been changed since the audit log was recorded.');
        this.name = 'UndoConflictError';
        this.conflictPaths = conflictPaths;
    }
}

export class MasterFieldConflictError extends Error {
    readonly conflictFields: string[];

    constructor(conflictFields: string[]) {
        super('Master fields have been changed since the edit started.');
        this.name = 'MasterFieldConflictError';
        this.conflictFields = conflictFields;
    }
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
    if (audit.undoPatch?.fields.length) payload.undoPatch = audit.undoPatch;

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

const missingPatchValue = (): MissingPatchValue => ({ __missing: true });

const encodePatchValue = (value: unknown): AuditPatchScalar | MissingPatchValue => {
    if (typeof value === 'undefined') return missingPatchValue();
    if (
        value === null ||
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean'
    ) {
        return value;
    }
    if (Array.isArray(value)) {
        return value.filter(item => typeof item === 'string' || typeof item === 'number') as string[] | number[];
    }
    if (typeof value === 'object') return value as Record<string, unknown>;
    return missingPatchValue();
};

const isMissingPatchValue = (value: unknown): value is MissingPatchValue =>
    Boolean(value && typeof value === 'object' && !Array.isArray(value) && (value as MissingPatchValue).__missing === true);

const decodePatchValue = (value: AuditPatchScalar | MissingPatchValue, deleteValue: unknown): unknown =>
    isMissingPatchValue(value) ? deleteValue : value;

const normalizePatchValue = (value: unknown): unknown => {
    if (!value || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(normalizePatchValue);

    return Object.keys(value as Record<string, unknown>).sort().reduce<Record<string, unknown>>((normalized, key) => {
        normalized[key] = normalizePatchValue((value as Record<string, unknown>)[key]);
        return normalized;
    }, {});
};

const arePatchValuesEqual = (
    left: AuditPatchScalar | MissingPatchValue,
    right: AuditPatchScalar | MissingPatchValue,
): boolean => JSON.stringify(normalizePatchValue(left)) === JSON.stringify(normalizePatchValue(right));

const pushUndoField = (
    fields: UndoFieldPatch[],
    path: string,
    before: AuditPatchScalar | MissingPatchValue,
    after: AuditPatchScalar | MissingPatchValue,
): void => {
    if (arePatchValuesEqual(before, after)) return;
    fields.push({ path, before, after });
};

export const buildScopedStaffCellUndoPatch = (
    beforeData: Record<string, DateKeyedMap>,
    afterData: Record<string, DateKeyedMap>,
    dateStr: string,
    staffIds: number[],
): UndoPatch => {
    const uniqueStaffIds = Array.from(new Set(staffIds));
    const fields: UndoFieldPatch[] = [];

    Object.entries(afterData).forEach(([fieldName, afterSource]) => {
        const beforeSource = beforeData[fieldName] || {};
        uniqueStaffIds.forEach(staffId => {
            pushUndoField(
                fields,
                `${fieldName}.${dateStr}.${staffId}`,
                encodePatchValue(getDateCellValue(beforeSource, dateStr, staffId)),
                encodePatchValue(getDateCellValue(afterSource, dateStr, staffId)),
            );
        });
    });

    return { fields };
};

export const buildScopedDateUndoPatch = (
    beforeData: Record<string, DateKeyedMap>,
    afterData: Record<string, DateKeyedMap>,
    dateStrings: string[],
): UndoPatch => {
    const fields: UndoFieldPatch[] = [];

    Object.entries(afterData).forEach(([fieldName, afterSource]) => {
        const beforeSource = beforeData[fieldName] || {};
        dateStrings.forEach(dateStr => {
            pushUndoField(
                fields,
                `${fieldName}.${dateStr}`,
                encodePatchValue(beforeSource[dateStr]),
                encodePatchValue(afterSource[dateStr]),
            );
        });
    });

    return { fields };
};

export const buildUndoUpdates = (
    undoPatch: UndoPatch,
    updatedAt: number = Date.now(),
    deleteValue: unknown = deleteField(),
): Record<string, unknown> => {
    const updates: Record<string, unknown> = { updatedAt };

    undoPatch.fields.forEach(field => {
        updates[field.path] = decodePatchValue(field.before, deleteValue);
    });

    return updates;
};

const getValueAtDottedPath = (source: Record<string, unknown>, path: string): unknown => {
    let cursor: unknown = source;

    for (const part of path.split('.')) {
        if (!cursor || typeof cursor !== 'object' || Array.isArray(cursor)) return undefined;
        const record = cursor as Record<string, unknown>;
        if (!Object.prototype.hasOwnProperty.call(record, part)) return undefined;
        cursor = record[part];
    }

    return cursor;
};

export const findUndoConflictPaths = (
    currentData: Record<string, unknown>,
    undoPatch: UndoPatch,
): string[] => undoPatch.fields
    .filter(field => !arePatchValuesEqual(encodePatchValue(getValueAtDottedPath(currentData, field.path)), field.after))
    .map(field => field.path);

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

type MasterDocumentFields = Pick<OrganizationData, 'staff' | 'settings' | 'holidays' | 'patterns'>;
type MasterDocumentField = keyof MasterDocumentFields;

const normalizeComparableValue = (value: unknown): unknown => {
    if (Array.isArray(value)) {
        return value.map(normalizeComparableValue);
    }

    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
                .filter(([, entryValue]) => entryValue !== undefined)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([key, entryValue]) => [key, normalizeComparableValue(entryValue)])
        );
    }

    return value;
};

const areComparableValuesEqual = (left: unknown, right: unknown): boolean =>
    JSON.stringify(normalizeComparableValue(left)) === JSON.stringify(normalizeComparableValue(right));

const normalizeMasterFieldComparableValue = (field: MasterDocumentField, value: unknown): unknown => {
    if (field === 'settings') {
        return { ...defaultSettings, ...((value || {}) as Partial<Settings>) };
    }
    if (field === 'patterns') {
        return normalizeShiftPatterns(Array.isArray(value) && value.length > 0 ? value as ShiftPatternDefinition[] : SHIFT_PATTERNS);
    }
    if (field === 'staff' || field === 'holidays') {
        return Array.isArray(value) ? value : [];
    }

    return value;
};

export const findMasterFieldConflicts = (
    current: Partial<MasterDocumentFields>,
    expected: Partial<MasterDocumentFields>,
    fields: MasterDocumentField[],
): MasterDocumentField[] => fields.filter(field => !areComparableValuesEqual(
    normalizeMasterFieldComparableValue(field, current[field]),
    normalizeMasterFieldComparableValue(field, expected[field]),
));

const isUndoAudit = (audit: AuditLogRecord): boolean => audit.action.startsWith('undo_');

const isAuditUndoneBy = (candidate: AuditLogRecord, undoAudit: AuditLogRecord): boolean => {
    const undoOfLogId = undoAudit.detail?.undoOfLogId;
    if (typeof undoOfLogId === 'string' && undoOfLogId === candidate.id) return true;

    const undoOfAction = undoAudit.detail?.undoOfAction;
    if (typeof undoOfAction !== 'string' || undoOfAction !== candidate.action) return false;
    if (undoAudit.targetDate !== candidate.targetDate) return false;
    if (undoAudit.targetStaffId !== candidate.targetStaffId) return false;

    return true;
};

const findLatestUndoableAuditLog = async (monthKey: string, queryLimit = 200): Promise<AuditLogRecord | null> => {
    const snapshot = await getDocs(query(
        getAuditLogCollectionRef(),
        orderBy('clientAt', 'desc'),
        limit(queryLimit),
    ));
    const undoAudits: AuditLogRecord[] = [];

    for (const docSnap of snapshot.docs) {
        const audit = { id: docSnap.id, ...docSnap.data() } as AuditLogRecord;
        if (audit.monthKey !== monthKey) continue;

        if (isUndoAudit(audit)) {
            undoAudits.push(audit);
            continue;
        }

        if (!audit.undoPatch?.fields.length) continue;
        if (undoAudits.some(undoAudit => isAuditUndoneBy(audit, undoAudit))) continue;

        return audit;
    }

    return null;
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

const saveDocumentFields = async (
    data: Partial<MasterDocumentFields>,
    audit?: SaveAuditContext,
    expectedPrevious?: Partial<MasterDocumentFields>,
): Promise<void> => {
    const updatedAt = Date.now();
    const actor = getCurrentAuditActor();
    const payload = {
        ...data,
        ...buildAuditMetadata(audit, updatedAt, actor),
        updatedAt,
    };
    const fields = Object.keys(data) as MasterDocumentField[];

    if (expectedPrevious && fields.length > 0) {
        await runTransaction(db, async transaction => {
            const ref = getDocRef();
            const docSnap = await transaction.get(ref);

            if (!docSnap.exists()) {
                transaction.set(ref, payload, { merge: true });
                return;
            }

            const conflicts = findMasterFieldConflicts(docSnap.data() as Partial<MasterDocumentFields>, expectedPrevious, fields);
            if (conflicts.length > 0) {
                throw new MasterFieldConflictError(conflicts);
            }

            transaction.update(ref, payload);
        });
        await writeAuditLog(audit, updatedAt, actor);
        return;
    }

    await writeUpdates(payload, audit, updatedAt, actor);
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
    async saveStaff(staff: Staff[], audit?: SaveAuditContext, expectedPreviousStaff?: Staff[]): Promise<void> {
        await saveDocumentFields({ staff }, audit, expectedPreviousStaff ? { staff: expectedPreviousStaff } : undefined);
    },

    async saveScheduleDates(schedule: ShiftSchedule, dateStrings: string[], audit?: SaveAuditContext): Promise<void> {
        await saveScopedDateFields({ schedule }, dateStrings, audit);
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

    async saveSettings(settings: Settings, audit?: SaveAuditContext, expectedPreviousSettings?: Settings): Promise<void> {
        await saveDocumentFields({ settings }, audit, expectedPreviousSettings ? { settings: expectedPreviousSettings } : undefined);
    },

    async saveHolidays(holidays: Holiday[], audit?: SaveAuditContext, expectedPreviousHolidays?: Holiday[]): Promise<void> {
        await saveDocumentFields({ holidays }, audit, expectedPreviousHolidays ? { holidays: expectedPreviousHolidays } : undefined);
    },

    async savePatterns(patterns: ShiftPatternDefinition[], audit?: SaveAuditContext, expectedPreviousPatterns?: ShiftPatternDefinition[]): Promise<void> {
        await saveDocumentFields(
            { patterns: normalizeShiftPatterns(patterns) },
            audit,
            expectedPreviousPatterns ? { patterns: normalizeShiftPatterns(expectedPreviousPatterns) } : undefined,
        );
    },

    async saveTimeRangeDates(timeRangeSchedule: TimeRangeSchedule, dateStrings: string[], audit?: SaveAuditContext): Promise<void> {
        await saveScopedDateFields({ timeRangeSchedule }, dateStrings, audit);
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

    async saveNoteDate(dateStr: string, note: string, audit?: SaveAuditContext): Promise<void> {
        await saveScopedDateFields({ notes: { [dateStr]: note } }, [dateStr], audit);
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

    async undoLatestChange(monthKey: string): Promise<AuditLogRecord | null> {
        const auditLog = await findLatestUndoableAuditLog(monthKey);
        if (!auditLog?.undoPatch) return null;

        const updatedAt = Date.now();
        const actor = getCurrentAuditActor();
        const audit: SaveAuditContext = {
            action: `undo_${auditLog.action}`,
            label: `${auditLog.label}の取り消し`,
            monthKey: auditLog.monthKey,
            targetDate: auditLog.targetDate,
            targetStaffId: auditLog.targetStaffId,
            affectedFields: auditLog.affectedFields,
            affectedDateCount: auditLog.affectedDateCount,
            detail: {
                undoOfLogId: auditLog.id,
                undoOfAction: auditLog.action,
            },
        };
        const updates = {
            ...buildUndoUpdates(auditLog.undoPatch, updatedAt),
            ...buildAuditMetadata(audit, updatedAt, actor),
        };

        await runTransaction(db, async transaction => {
            const docSnap = await transaction.get(getDocRef());
            if (!docSnap.exists()) {
                throw new UndoConflictError(auditLog.undoPatch?.fields.map(field => field.path) || []);
            }

            const conflictPaths = findUndoConflictPaths(docSnap.data() as Record<string, unknown>, auditLog.undoPatch as UndoPatch);
            if (conflictPaths.length > 0) {
                throw new UndoConflictError(conflictPaths);
            }

            transaction.update(getDocRef(), updates);
        });
        await writeAuditLog(audit, updatedAt, actor);
        return auditLog;
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
