import type { Dispatch, SetStateAction } from 'react';
import type { Holiday, Settings, ShiftPatternDefinition, ShiftPatternId, ShiftSchedule, Staff, TimeRange, TimeRangeSchedule } from '../types';
import { checkConstraints, createConstraintContext } from '../lib/constraintChecker';
import { alertBlockingLeaveViolation } from '../lib/blockingLeaveViolation';
import { firestoreStorage } from '../lib/firestoreStorage';
import { getFormattedDate } from '../lib/utils';
import {
  clearManualShiftMarkerState,
  clearScheduleCell,
  clearTimeRangeCell,
  setManualShiftMarkerState,
  setScheduleCell,
  setTimeRangeCell,
} from '../lib/scheduleState';
import type { SaveWithToast } from './useScheduleActions';

type ToastApi = {
  success: (message: string, description?: string) => void;
};

export type EditingPartTimeCell = {
  staffId: number;
  day: number;
};

type UseTimeRangeActionsArgs = {
  editingPartTime: EditingPartTimeCell | null;
  setEditingPartTime: Dispatch<SetStateAction<EditingPartTimeCell | null>>;
  schedule: ShiftSchedule;
  setSchedule: Dispatch<SetStateAction<ShiftSchedule>>;
  timeRangeSchedule: TimeRangeSchedule;
  setTimeRangeSchedule: Dispatch<SetStateAction<TimeRangeSchedule>>;
  manualShifts: ShiftSchedule;
  setManualShifts: Dispatch<SetStateAction<ShiftSchedule>>;
  staff: Staff[];
  setStaff: Dispatch<SetStateAction<Staff[]>>;
  getActiveStaffForDay: (day: number) => Staff[];
  holidays: Holiday[];
  settings: Settings;
  year: number;
  month: number;
  patterns: ShiftPatternDefinition[];
  toast: ToastApi;
  saveWithToast: SaveWithToast;
};

export const useTimeRangeActions = ({
  editingPartTime,
  setEditingPartTime,
  schedule,
  setSchedule,
  timeRangeSchedule,
  setTimeRangeSchedule,
  manualShifts,
  setManualShifts,
  staff,
  setStaff,
  getActiveStaffForDay,
  holidays,
  settings,
  year,
  month,
  patterns,
  toast,
  saveWithToast,
}: UseTimeRangeActionsArgs) => {
  const monthKey = `${year}-${String(month).padStart(2, '0')}`;

  const handleSaveTimeRange = async (timeRange: TimeRange) => {
    if (!editingPartTime) return;
    const { staffId, day } = editingPartTime;
    const staffMember = staff.find(s => s.id === staffId);
    const dateStr = getFormattedDate(year, month, day);

    const previousSchedule = schedule;
    const previousTimeRangeSchedule = timeRangeSchedule;
    const previousManualShifts = manualShifts;
    const newTimeRangeSchedule = setTimeRangeCell(timeRangeSchedule, dateStr, staffId, timeRange);
    const newSchedule = setScheduleCell(schedule, dateStr, staffId, '');
    const newManualShifts = clearManualShiftMarkerState(manualShifts, dateStr, staffId);
    setTimeRangeSchedule(newTimeRangeSchedule);
    setSchedule(newSchedule);
    setManualShifts(newManualShifts);
    const saved = await saveWithToast(
      '時間指定勤務',
      () => firestoreStorage.saveScheduleTimeRangeManualShiftDates(newSchedule, newTimeRangeSchedule, newManualShifts, [dateStr], {
        action: 'edit_time_range',
        label: '時間指定勤務',
        monthKey,
        targetDate: dateStr,
        targetStaffId: staffId,
        affectedFields: ['schedule', 'timeRangeSchedule', 'manualShifts'],
        detail: { start: timeRange.start, end: timeRange.end },
      }),
      {
        rollback: () => {
          setSchedule(previousSchedule);
          setTimeRangeSchedule(previousTimeRangeSchedule);
          setManualShifts(previousManualShifts);
        },
      },
    );
    if (!saved) return;

    setEditingPartTime(null);
    toast.success(`${staffMember?.name}`, `${timeRange.start}-${timeRange.end} に設定しました`);
  };

  const handleSaveShift = async (shiftId: ShiftPatternId) => {
    if (!editingPartTime) return;
    const { staffId, day } = editingPartTime;
    const staffMember = staff.find(s => s.id === staffId);
    const dateStr = getFormattedDate(year, month, day);

    const previousSchedule = schedule;
    const previousTimeRangeSchedule = timeRangeSchedule;
    const previousManualShifts = manualShifts;
    const newSchedule = setScheduleCell(schedule, dateStr, staffId, shiftId);
    const prevShift = schedule[dateStr]?.[staffId] || '休';
    const ctx = createConstraintContext(newSchedule, getActiveStaffForDay(day), holidays, settings, year, month, patterns);
    const violations = checkConstraints(ctx, day, staffId, shiftId, { previousShift: prevShift });
    if (alertBlockingLeaveViolation(violations)) return;

    const newTimeRangeSchedule = clearTimeRangeCell(timeRangeSchedule, dateStr, staffId);
    const newManualShifts = setManualShiftMarkerState(manualShifts, dateStr, staffId, shiftId);
    setSchedule(newSchedule);
    setTimeRangeSchedule(newTimeRangeSchedule);
    setManualShifts(newManualShifts);
    const saved = await saveWithToast(
      'シフト',
      () => firestoreStorage.saveScheduleTimeRangeManualShiftDates(newSchedule, newTimeRangeSchedule, newManualShifts, [dateStr], {
        action: 'time_range_staff_shift_update',
        label: '時間指定職員のシフト変更',
        monthKey,
        targetDate: dateStr,
        targetStaffId: staffId,
        affectedFields: ['schedule', 'timeRangeSchedule', 'manualShifts'],
        detail: { shiftId },
      }),
      {
        rollback: () => {
          setSchedule(previousSchedule);
          setTimeRangeSchedule(previousTimeRangeSchedule);
          setManualShifts(previousManualShifts);
        },
      },
    );
    if (!saved) return;

    setEditingPartTime(null);
    toast.success(`${staffMember?.name}`, `${shiftId} に変更しました`);
  };

  const handleSaveAsDefault = async (timeRange: TimeRange) => {
    if (!editingPartTime) return;
    const { staffId } = editingPartTime;
    const staffMember = staff.find(s => s.id === staffId);
    const newStaff = staff.map(s =>
      s.id === staffId
        ? { ...s, defaultTimeRange: timeRange }
        : s,
    );
    const previousStaff = staff;
    setStaff(newStaff);
    const saved = await saveWithToast('職員設定', () => firestoreStorage.saveStaff(newStaff, {
      action: 'save_default_time_range',
      label: 'デフォルト時間指定勤務',
      monthKey,
      targetStaffId: staffId,
      affectedFields: ['staff'],
      detail: { start: timeRange.start, end: timeRange.end },
    }), {
      rollback: () => setStaff(previousStaff),
    });
    if (!saved) return;
    toast.success(`${staffMember?.name}`, `${timeRange.start}-${timeRange.end} をデフォルトに設定しました`);
  };

  const handleClearTimeRange = async () => {
    if (!editingPartTime) return;
    const { staffId, day } = editingPartTime;
    const dateStr = getFormattedDate(year, month, day);

    const previousSchedule = schedule;
    const previousTimeRangeSchedule = timeRangeSchedule;
    const previousManualShifts = manualShifts;
    const newSchedule = clearScheduleCell(schedule, dateStr, staffId);
    const newTimeRangeSchedule = clearTimeRangeCell(timeRangeSchedule, dateStr, staffId);
    const newManualShifts = clearManualShiftMarkerState(manualShifts, dateStr, staffId);
    setSchedule(newSchedule);
    setTimeRangeSchedule(newTimeRangeSchedule);
    setManualShifts(newManualShifts);
    const saved = await saveWithToast(
      '時間指定勤務',
      () => firestoreStorage.saveScheduleTimeRangeManualShiftDates(newSchedule, newTimeRangeSchedule, newManualShifts, [dateStr], {
        action: 'clear_time_range',
        label: '時間指定勤務クリア',
        monthKey,
        targetDate: dateStr,
        targetStaffId: staffId,
        affectedFields: ['schedule', 'timeRangeSchedule', 'manualShifts'],
      }),
      {
        rollback: () => {
          setSchedule(previousSchedule);
          setTimeRangeSchedule(previousTimeRangeSchedule);
          setManualShifts(previousManualShifts);
        },
      },
    );
    if (!saved) return;
    setEditingPartTime(null);
  };

  return {
    handleSaveTimeRange,
    handleSaveShift,
    handleSaveAsDefault,
    handleClearTimeRange,
  };
};
