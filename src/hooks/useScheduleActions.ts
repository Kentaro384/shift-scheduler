import type { Dispatch, SetStateAction } from 'react';
import type { Holiday, Settings, ShiftPatternDefinition, ShiftPatternId, ShiftSchedule, Staff } from '../types';
import { isWorkShiftId } from '../types';
import { checkConstraints, createConstraintContext } from '../lib/constraintChecker';
import { alertBlockingLeaveViolation } from '../lib/blockingLeaveViolation';
import { buildScopedStaffCellUndoPatch, firestoreStorage } from '../lib/firestoreStorage';
import { getFormattedDate } from '../lib/utils';
import { clearManualShiftMarkerState, clearScheduleCell, setManualShiftMarkerState, setScheduleCell, swapScheduleAndManualMarkers } from '../lib/scheduleState';

export type SaveWithToastOptions = {
  rollback?: () => void;
};

export type SaveWithToast = (
  label: string,
  save: () => Promise<void>,
  options?: SaveWithToastOptions,
) => Promise<boolean>;

type ToastApi = {
  success: (message: string, description?: string) => void;
  warning: (message: string, description?: string, onUndo?: () => void) => void;
  info: (message: string, description?: string) => void;
};

export type EditingCell = {
  staffId: number;
  day: number;
};

export type CandidateSearchState = {
  day: number;
  shiftPattern: ShiftPatternId;
};

type UseScheduleActionsArgs = {
  editingCell: EditingCell | null;
  setEditingCell: Dispatch<SetStateAction<EditingCell | null>>;
  candidateSearch: CandidateSearchState | null;
  setCandidateSearch: Dispatch<SetStateAction<CandidateSearchState | null>>;
  schedule: ShiftSchedule;
  setSchedule: Dispatch<SetStateAction<ShiftSchedule>>;
  manualShifts: ShiftSchedule;
  setManualShifts: Dispatch<SetStateAction<ShiftSchedule>>;
  staff: Staff[];
  getActiveStaffForDay: (day: number) => Staff[];
  holidays: Holiday[];
  settings: Settings;
  year: number;
  month: number;
  patterns: ShiftPatternDefinition[];
  toast: ToastApi;
  saveWithToast: SaveWithToast;
};

export const useScheduleActions = ({
  editingCell,
  setEditingCell,
  candidateSearch,
  setCandidateSearch,
  schedule,
  setSchedule,
  manualShifts,
  setManualShifts,
  staff,
  getActiveStaffForDay,
  holidays,
  settings,
  year,
  month,
  patterns,
  toast,
  saveWithToast,
}: UseScheduleActionsArgs) => {
  const monthKey = `${year}-${String(month).padStart(2, '0')}`;

  const handleShiftUpdate = async (shiftId: ShiftPatternId) => {
    if (!editingCell) return;
    const { staffId, day } = editingCell;
    const dateStr = getFormattedDate(year, month, day);

    const prevSchedule = structuredClone(schedule);
    const prevManualShifts = structuredClone(manualShifts);
    const prevShift = schedule[dateStr]?.[staffId] || '休';

    const newSchedule = setScheduleCell(schedule, dateStr, staffId, shiftId);
    const newManualShifts = setManualShiftMarkerState(manualShifts, dateStr, staffId, shiftId);

    const ctx = createConstraintContext(newSchedule, getActiveStaffForDay(day), holidays, settings, year, month, patterns);
    const violations = checkConstraints(ctx, day, staffId, shiftId, { previousShift: prevShift });
    const hardViolations = violations.filter(v => v.type === 'hard');
    if (alertBlockingLeaveViolation(violations)) return;

    setSchedule(newSchedule);
    setManualShifts(newManualShifts);
    const saved = await saveWithToast('シフト', () => firestoreStorage.saveScheduleAndManualShiftCells(newSchedule, newManualShifts, dateStr, [staffId], {
      action: 'manual_shift_update',
      label: 'シフト手動更新',
      monthKey,
      targetDate: dateStr,
      targetStaffId: staffId,
      affectedFields: ['schedule', 'manualShifts'],
      detail: { shiftId },
      undoPatch: buildScopedStaffCellUndoPatch(
        { schedule: prevSchedule, manualShifts: prevManualShifts },
        { schedule: newSchedule, manualShifts: newManualShifts },
        dateStr,
        [staffId],
      ),
    }), {
      rollback: () => {
        setSchedule(prevSchedule);
        setManualShifts(prevManualShifts);
      },
    });
    if (!saved) return;
    setEditingCell(null);

    const staffMember = staff.find(s => s.id === staffId);
    if (hardViolations.length > 0) {
      toast.warning(
        '制約違反があります',
        hardViolations.map(v => v.message).join('、'),
        () => {
          setSchedule(prevSchedule);
          setManualShifts(prevManualShifts);
          void saveWithToast('取り消し後のシフト', () => firestoreStorage.saveScheduleAndManualShiftCells(prevSchedule, prevManualShifts, dateStr, [staffId], {
            action: 'undo_manual_shift_update',
            label: 'シフト手動更新の取り消し',
            monthKey,
            targetDate: dateStr,
            targetStaffId: staffId,
            affectedFields: ['schedule', 'manualShifts'],
            detail: { undoOfAction: 'manual_shift_update' },
          }), {
            rollback: () => {
              setSchedule(newSchedule);
              setManualShifts(newManualShifts);
            },
          });
        },
      );
    } else if (violations.length > 0) {
      toast.info(
        `${staffMember?.name}: ${prevShift} → ${shiftId}`,
        `推奨外: ${violations.map(v => v.message).join('、')}`,
      );
    }
  };

  const handleShiftDelete = async () => {
    if (!editingCell) return;
    const { staffId, day } = editingCell;
    const dateStr = getFormattedDate(year, month, day);

    const prevSchedule = structuredClone(schedule);
    const prevManualShifts = structuredClone(manualShifts);
    if (!(schedule[dateStr]?.[staffId]) && !(manualShifts[dateStr]?.[staffId])) {
      toast.info('削除するシフトがありません', 'このマスはすでに未入力です');
      setEditingCell(null);
      return;
    }
    const prevShift = schedule[dateStr]?.[staffId] || '';

    const newSchedule = clearScheduleCell(schedule, dateStr, staffId);
    const newManualShifts = clearManualShiftMarkerState(manualShifts, dateStr, staffId);

    setSchedule(newSchedule);
    setManualShifts(newManualShifts);
    const saved = await saveWithToast('シフト削除', () => firestoreStorage.saveScheduleAndManualShiftCells(newSchedule, newManualShifts, dateStr, [staffId], {
      action: 'manual_shift_delete',
      label: '手動シフト削除',
      monthKey,
      targetDate: dateStr,
      targetStaffId: staffId,
      affectedFields: ['schedule', 'manualShifts'],
      detail: { previousShift: prevShift },
      undoPatch: buildScopedStaffCellUndoPatch(
        { schedule: prevSchedule, manualShifts: prevManualShifts },
        { schedule: newSchedule, manualShifts: newManualShifts },
        dateStr,
        [staffId],
      ),
    }), {
      rollback: () => {
        setSchedule(prevSchedule);
        setManualShifts(prevManualShifts);
      },
    });
    if (!saved) return;
    setEditingCell(null);

    const staffMember = staff.find(s => s.id === staffId);
    toast.success(
      'シフトを削除しました',
      `${staffMember?.name}: この日は次回の自動生成で割り当てられます`,
    );
  };

  const handleSelectStaff = async (targetStaffId: number, shiftId: ShiftPatternId) => {
    if (!editingCell) return;
    const { day } = editingCell;
    const dateStr = getFormattedDate(year, month, day);

    const prevSchedule = structuredClone(schedule);
    const prevManualShifts = structuredClone(manualShifts);
    const prevShift = schedule[dateStr]?.[targetStaffId] || '';

    const newSchedule = setScheduleCell(schedule, dateStr, targetStaffId, shiftId);
    const newManualShifts = setManualShiftMarkerState(manualShifts, dateStr, targetStaffId, shiftId);

    const ctx = createConstraintContext(newSchedule, getActiveStaffForDay(day), holidays, settings, year, month, patterns);
    const violations = checkConstraints(ctx, day, targetStaffId, shiftId, { previousShift: prevShift });
    const hardViolations = violations.filter(v => v.type === 'hard');
    if (alertBlockingLeaveViolation(violations)) return;

    setSchedule(newSchedule);
    setManualShifts(newManualShifts);
    const saved = await saveWithToast('シフト', () => firestoreStorage.saveScheduleAndManualShiftCells(newSchedule, newManualShifts, dateStr, [targetStaffId], {
      action: 'candidate_shift_select',
      label: '候補者配置',
      monthKey,
      targetDate: dateStr,
      targetStaffId,
      affectedFields: ['schedule', 'manualShifts'],
      detail: { shiftId },
      undoPatch: buildScopedStaffCellUndoPatch(
        { schedule: prevSchedule, manualShifts: prevManualShifts },
        { schedule: newSchedule, manualShifts: newManualShifts },
        dateStr,
        [targetStaffId],
      ),
    }), {
      rollback: () => {
        setSchedule(prevSchedule);
        setManualShifts(prevManualShifts);
      },
    });
    if (!saved) return;
    setEditingCell(null);

    const staffMember = staff.find(s => s.id === targetStaffId);
    if (hardViolations.length > 0) {
      toast.warning(
        '制約違反があります',
        `${staffMember?.name}: ${hardViolations.map(v => v.message).join('、')}`,
        () => {
          setSchedule(prevSchedule);
          setManualShifts(prevManualShifts);
          void saveWithToast('取り消し後のシフト', () => firestoreStorage.saveScheduleAndManualShiftCells(prevSchedule, prevManualShifts, dateStr, [targetStaffId], {
            action: 'undo_candidate_shift_select',
            label: '候補者配置の取り消し',
            monthKey,
            targetDate: dateStr,
            targetStaffId,
            affectedFields: ['schedule', 'manualShifts'],
            detail: { undoOfAction: 'candidate_shift_select' },
          }), {
            rollback: () => {
              setSchedule(newSchedule);
              setManualShifts(newManualShifts);
            },
          });
        },
      );
    } else {
      toast.success(
        `${staffMember?.name} → ${shiftId}`,
        `${month}/${day} に配置しました`,
      );
    }
  };

  const handleSwap = async (staffAId: number, staffBId: number) => {
    if (!editingCell) return;
    const { day } = editingCell;
    const dateStr = getFormattedDate(year, month, day);

    const prevSchedule = structuredClone(schedule);
    const prevManualShifts = structuredClone(manualShifts);
    const shiftA = schedule[dateStr]?.[staffAId] || '';
    const shiftB = schedule[dateStr]?.[staffBId] || '';
    if (!isWorkShiftId(shiftA) || !isWorkShiftId(shiftB)) {
      toast.info('入替できません', '勤務シフト同士のみ入替できます');
      return;
    }

    const { schedule: newSchedule, manualShifts: newManualShifts } = swapScheduleAndManualMarkers(
      schedule,
      manualShifts,
      dateStr,
      staffAId,
      staffBId,
    );

    setSchedule(newSchedule);
    setManualShifts(newManualShifts);
    const saved = await saveWithToast('シフト入替', () => firestoreStorage.saveScheduleAndManualShiftCells(newSchedule, newManualShifts, dateStr, [staffAId, staffBId], {
      action: 'swap_shifts',
      label: 'シフト入替',
      monthKey,
      targetDate: dateStr,
      affectedFields: ['schedule', 'manualShifts'],
      detail: { staffAId, staffBId, shiftA, shiftB },
      undoPatch: buildScopedStaffCellUndoPatch(
        { schedule: prevSchedule, manualShifts: prevManualShifts },
        { schedule: newSchedule, manualShifts: newManualShifts },
        dateStr,
        [staffAId, staffBId],
      ),
    }), {
      rollback: () => {
        setSchedule(prevSchedule);
        setManualShifts(prevManualShifts);
      },
    });
    if (!saved) return;
    setEditingCell(null);

    const staffMemberA = staff.find(s => s.id === staffAId);
    const staffMemberB = staff.find(s => s.id === staffBId);
    toast.warning(
      'シフト入替完了',
      `${staffMemberA?.name}(${shiftA}→${shiftB}) ⇄ ${staffMemberB?.name}(${shiftB}→${shiftA})`,
      () => {
        setSchedule(prevSchedule);
        setManualShifts(prevManualShifts);
        void saveWithToast('取り消し後のシフト', () => firestoreStorage.saveScheduleAndManualShiftCells(prevSchedule, prevManualShifts, dateStr, [staffAId, staffBId], {
          action: 'undo_swap_shifts',
          label: 'シフト入替の取り消し',
          monthKey,
          targetDate: dateStr,
          affectedFields: ['schedule', 'manualShifts'],
          detail: { staffAId, staffBId, undoOfAction: 'swap_shifts' },
        }), {
          rollback: () => {
            setSchedule(newSchedule);
            setManualShifts(newManualShifts);
          },
        });
      },
    );
  };

  const handleCandidateSelect = async (staffId: number, shiftPattern: ShiftPatternId) => {
    if (!candidateSearch) return;
    const dateStr = getFormattedDate(year, month, candidateSearch.day);

    const previousSchedule = schedule;
    const previousManualShifts = manualShifts;
    const newSchedule = setScheduleCell(schedule, dateStr, staffId, shiftPattern);
    const newManualShifts = setManualShiftMarkerState(manualShifts, dateStr, staffId, shiftPattern);

    setSchedule(newSchedule);
    setManualShifts(newManualShifts);
    const saved = await saveWithToast('シフト', () => firestoreStorage.saveScheduleAndManualShiftCells(newSchedule, newManualShifts, dateStr, [staffId], {
      action: 'summary_candidate_select',
      label: '不足候補から配置',
      monthKey,
      targetDate: dateStr,
      targetStaffId: staffId,
      affectedFields: ['schedule', 'manualShifts'],
      detail: { shiftPattern },
      undoPatch: buildScopedStaffCellUndoPatch(
        { schedule: previousSchedule, manualShifts: previousManualShifts },
        { schedule: newSchedule, manualShifts: newManualShifts },
        dateStr,
        [staffId],
      ),
    }), {
      rollback: () => {
        setSchedule(previousSchedule);
        setManualShifts(previousManualShifts);
      },
    });
    if (!saved) return;
    setCandidateSearch(null);

    const staffMember = staff.find(s => s.id === staffId);
    toast.success(
      `${staffMember?.name} → ${shiftPattern}`,
      `${month}/${candidateSearch.day} に配置しました`,
    );
  };

  return {
    handleShiftUpdate,
    handleShiftDelete,
    handleSelectStaff,
    handleSwap,
    handleCandidateSelect,
  };
};
