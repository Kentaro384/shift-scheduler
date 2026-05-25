import type { ShiftPatternId, ShiftSchedule, TimeRange, TimeRangeSchedule } from '../types';
import { isWorkShiftId } from '../types';

export const setScheduleCell = (
  source: ShiftSchedule,
  dateStr: string,
  staffId: number,
  shiftId: ShiftPatternId,
): ShiftSchedule => ({
  ...source,
  [dateStr]: {
    ...(source[dateStr] || {}),
    [staffId]: shiftId,
  },
});

export const clearScheduleCell = (source: ShiftSchedule, dateStr: string, staffId: number): ShiftSchedule => {
  if (!source[dateStr]?.[staffId]) return source;
  const next: ShiftSchedule = { ...source, [dateStr]: { ...source[dateStr] } };
  delete next[dateStr][staffId];
  if (Object.keys(next[dateStr]).length === 0) {
    delete next[dateStr];
  }
  return next;
};

export const setManualShiftMarkerState = (
  source: ShiftSchedule,
  dateStr: string,
  staffId: number,
  shiftId: ShiftPatternId,
): ShiftSchedule => {
  if (!shiftId) return clearManualShiftMarkerState(source, dateStr, staffId);
  return {
    ...source,
    [dateStr]: {
      ...(source[dateStr] || {}),
      [staffId]: shiftId,
    },
  };
};

export type ScheduleManualState = {
  schedule: ShiftSchedule;
  manualShifts: ShiftSchedule;
};

export const hydrateScheduleFromManualShifts = (
  schedule: ShiftSchedule,
  manualShifts: ShiftSchedule,
): ShiftSchedule => {
  let nextSchedule = schedule;
  const clonedDates = new Set<string>();

  Object.entries(manualShifts).forEach(([dateStr, manualDay]) => {
    Object.entries(manualDay || {}).forEach(([staffId, shiftId]) => {
      if (!shiftId) return;
      const currentShift = nextSchedule[dateStr]?.[Number(staffId)];
      if (currentShift) return;

      if (nextSchedule === schedule) {
        nextSchedule = { ...schedule };
      }
      if (!clonedDates.has(dateStr)) {
        nextSchedule[dateStr] = { ...(nextSchedule[dateStr] || {}) };
        clonedDates.add(dateStr);
      }
      nextSchedule[dateStr][Number(staffId)] = shiftId;
    });
  });

  return nextSchedule;
};

export const swapScheduleAndManualMarkers = (
  schedule: ShiftSchedule,
  manualShifts: ShiftSchedule,
  dateStr: string,
  staffAId: number,
  staffBId: number,
): ScheduleManualState => {
  const shiftA = schedule[dateStr]?.[staffAId] || '';
  const shiftB = schedule[dateStr]?.[staffBId] || '';

  if (!isWorkShiftId(shiftA) || !isWorkShiftId(shiftB)) {
    return { schedule, manualShifts };
  }

  const nextSchedule = setScheduleCell(
    setScheduleCell(schedule, dateStr, staffAId, shiftB),
    dateStr,
    staffBId,
    shiftA,
  );

  const nextManualShifts = setManualShiftMarkerState(
    setManualShiftMarkerState(manualShifts, dateStr, staffAId, shiftB),
    dateStr,
    staffBId,
    shiftA,
  );

  return {
    schedule: nextSchedule,
    manualShifts: nextManualShifts,
  };
};

export const clearManualShiftMarkerState = (source: ShiftSchedule, dateStr: string, staffId: number): ShiftSchedule => {
  if (!source[dateStr]?.[staffId]) return source;
  const next: ShiftSchedule = { ...source, [dateStr]: { ...source[dateStr] } };
  delete next[dateStr][staffId];
  if (Object.keys(next[dateStr]).length === 0) {
    delete next[dateStr];
  }
  return next;
};

export const setTimeRangeCell = (
  source: TimeRangeSchedule,
  dateStr: string,
  staffId: number,
  timeRange: TimeRange,
): TimeRangeSchedule => ({
  ...source,
  [dateStr]: {
    ...(source[dateStr] || {}),
    [staffId]: timeRange,
  },
});

export const clearTimeRangeCell = (source: TimeRangeSchedule, dateStr: string, staffId: number): TimeRangeSchedule => {
  if (!source[dateStr]?.[staffId]) return source;
  const next: TimeRangeSchedule = { ...source, [dateStr]: { ...source[dateStr] } };
  delete next[dateStr][staffId];
  if (Object.keys(next[dateStr]).length === 0) {
    delete next[dateStr];
  }
  return next;
};
