import type { ShiftPatternId, ShiftSchedule, TimeRange, TimeRangeSchedule } from '../types';

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
