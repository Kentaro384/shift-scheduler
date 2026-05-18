import type { ShiftPatternId, ShiftSchedule } from '../types';

const CIRCLED_NUMBERS = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨'];

export function getFiscalYear(dateStr: string): number | null {
    const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(dateStr);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    return month >= 4 ? year : year - 1;
}

export function getScheduledShiftForStaff(schedule: ShiftSchedule, dateStr: string, staffId: number): ShiftPatternId {
    const daySchedule = (schedule[dateStr] || {}) as Record<string | number, ShiftPatternId>;
    return daySchedule[staffId] || daySchedule[String(staffId)] || '';
}

export function countFiscalYearLeave(
    schedule: ShiftSchedule,
    staffId: number,
    leaveShift: ShiftPatternId,
    targetDateStr: string,
    excludeDateStr?: string
): number {
    const fiscalYear = getFiscalYear(targetDateStr);
    if (fiscalYear === null) return 0;

    return Object.keys(schedule).reduce((count, dateStr) => {
        if (dateStr === excludeDateStr || getFiscalYear(dateStr) !== fiscalYear) return count;
        return getScheduledShiftForStaff(schedule, dateStr, staffId) === leaveShift ? count + 1 : count;
    }, 0);
}

export function getSummerLeaveOrdinal(schedule: ShiftSchedule, staffId: number, dateStr: string): number | null {
    if (getScheduledShiftForStaff(schedule, dateStr, staffId) !== '夏休') return null;

    const fiscalYear = getFiscalYear(dateStr);
    if (fiscalYear === null) return null;

    const summerLeaveDates = Object.keys(schedule)
        .filter(candidateDate =>
            candidateDate <= dateStr &&
            getFiscalYear(candidateDate) === fiscalYear &&
            getScheduledShiftForStaff(schedule, candidateDate, staffId) === '夏休'
        )
        .sort();

    return summerLeaveDates.length || null;
}

export function formatSummerLeaveOrdinal(ordinal: number | null): string {
    if (!ordinal) return '夏休';
    return `夏休${CIRCLED_NUMBERS[ordinal - 1] || ordinal}`;
}

export function getShiftDisplayLabel(
    shift: ShiftPatternId | undefined | null,
    schedule: ShiftSchedule,
    staffId: number,
    dateStr: string
): string {
    if (shift === '夏休') return formatSummerLeaveOrdinal(getSummerLeaveOrdinal(schedule, staffId, dateStr));
    return shift || '';
}
