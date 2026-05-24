import { useCallback, useEffect, useState } from 'react';
import type { DailyNotes, Holiday, Settings, ShiftPatternDefinition, ShiftSchedule, Staff, TimeRangeSchedule } from '../types';
import { onAuthStateChange, signOut, type AuthUser } from '../lib/auth';
import { firestoreStorage, type OrganizationData } from '../lib/firestoreStorage';

export function useFirestoreSync() {
    const [user, setUser] = useState<AuthUser>(null);
    const [authLoading, setAuthLoading] = useState(true);
    const [dataLoading, setDataLoading] = useState(true);
    const [accessDenied, setAccessDenied] = useState(false);

    const [staff, setStaff] = useState<Staff[]>([]);
    const [schedule, setSchedule] = useState<ShiftSchedule>({});
    const [manualShifts, setManualShifts] = useState<ShiftSchedule>({});
    const [settings, setSettings] = useState<Settings>(firestoreStorage.getDefaultSettings());
    const [holidays, setHolidays] = useState<Holiday[]>([]);
    const [patterns, setPatterns] = useState<ShiftPatternDefinition[]>([]);
    const [timeRangeSchedule, setTimeRangeSchedule] = useState<TimeRangeSchedule>({});
    const [notes, setNotes] = useState<DailyNotes>({});
    const [excelExportLog, setExcelExportLog] = useState<Record<string, string>>({});

    const resetData = useCallback(() => {
        setStaff([]);
        setSchedule({});
        setManualShifts({});
        setSettings(firestoreStorage.getDefaultSettings());
        setHolidays([]);
        setPatterns(firestoreStorage.normalizePatterns());
        setTimeRangeSchedule({});
        setNotes({});
        setExcelExportLog({});
    }, []);

    useEffect(() => {
        const unsubscribe = onAuthStateChange((authUser) => {
            if (authUser) {
                setAccessDenied(false);
                setDataLoading(true);
            } else {
                resetData();
                setDataLoading(false);
            }
            setUser(authUser);
            setAuthLoading(false);
        });
        return () => unsubscribe();
    }, [resetData]);

    useEffect(() => {
        if (!user) {
            return;
        }

        const unsubscribe = firestoreStorage.subscribe((data: OrganizationData | null, error) => {
            if (error) {
                if (error.code === 'permission-denied') {
                    setAccessDenied(true);
                    resetData();
                    void signOut();
                }
                setDataLoading(false);
                return;
            }

            if (data) {
                setStaff(data.staff || []);
                setSchedule(data.schedule || {});
                setManualShifts(data.manualShifts || {});
                setSettings(firestoreStorage.normalizeSettings(data.settings));
                setHolidays(data.holidays || []);
                setPatterns(firestoreStorage.normalizePatterns(data.patterns));
                setTimeRangeSchedule(data.timeRangeSchedule || {});
                setNotes(data.notes || {});
                setExcelExportLog(data.excelExportLog || {});
            } else {
                resetData();
            }
            setDataLoading(false);
        });

        return () => unsubscribe();
    }, [resetData, user]);

    return {
        user,
        authLoading,
        dataLoading,
        accessDenied,
        staff,
        setStaff,
        schedule,
        setSchedule,
        manualShifts,
        setManualShifts,
        settings,
        setSettings,
        holidays,
        setHolidays,
        patterns,
        setPatterns,
        timeRangeSchedule,
        setTimeRangeSchedule,
        notes,
        setNotes,
        excelExportLog,
        setExcelExportLog,
    };
}
