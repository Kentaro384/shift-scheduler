import { useState, useEffect } from 'react';
import type { Staff, ShiftSchedule, Settings, Holiday, ShiftPatternDefinition, ShiftPatternId, TimeRangeSchedule, TimeRange } from './types';
import { HOLIDAY_PATTERNS, countsForStaffing, getStaffTimeRangeForWeekday, isCookingStaff, isProtectedShiftId, isStaffAvailableOnWeekday, isTimeRangeStaff, isWorkShiftId } from './types';
import { ShiftGenerator } from './lib/generator';
import { getDaysInMonth, getFormattedDate } from './lib/utils';
import { countAllPatterns } from './lib/shiftCountUtils';
import { exportToExcel } from './lib/excelExport';
import { ChevronLeft, ChevronRight, Settings as SettingsIcon, Users, Calendar, CalendarCheck, RefreshCw, Download, RotateCcw, ChevronDown, Menu, LogOut, DatabaseBackup, Trash2 } from 'lucide-react';
import { StaffList } from './components/StaffList';
import { SettingsModal } from './components/SettingsModal';
import { HolidayModal } from './components/HolidayModal';
import { ShiftEditModal } from './components/ShiftEditModal';
import { CandidateSearchModal } from './components/CandidateSearchModal';
import { TimeRangeModal } from './components/TimeRangeModal';
import { HourlyStaffChart } from './components/HourlyStaffChart';
import { ShiftPaletteIcon } from './components/ShiftPaletteIcon';
import { ShiftBalanceDashboard } from './components/ShiftBalanceDashboard';
import { AlertBadge } from './components/ShiftAlerts';
import { LoginScreen } from './components/LoginScreen';
import { onAuthStateChange, signOut } from './lib/auth';
import type { AuthUser } from './lib/auth';
import { firestoreStorage } from './lib/firestoreStorage';
import type { OrganizationData } from './lib/firestoreStorage';
import { storage } from './lib/storage';
import { useToast } from './components/Toast';
import { checkConstraints, createConstraintContext } from './lib/constraintChecker';

function App() {
  // Auth state
  const [user, setUser] = useState<AuthUser>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);

  const [currentDate, setCurrentDate] = useState(new Date());
  const [staff, setStaff] = useState<Staff[]>([]);
  const [schedule, setSchedule] = useState<ShiftSchedule>({});
  const [manualShifts, setManualShifts] = useState<ShiftSchedule>({});
  const [settings, setSettings] = useState<Settings>(firestoreStorage.getDefaultSettings());
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [patterns, setPatterns] = useState<ShiftPatternDefinition[]>([]);
  const [timeRangeSchedule, setTimeRangeSchedule] = useState<TimeRangeSchedule>({});

  // Modal States
  const [showStaffList, setShowStaffList] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showHolidayModal, setShowHolidayModal] = useState(false);
  const [editingCell, setEditingCell] = useState<{ staffId: number; day: number } | null>(null);
  // Part-time worker time range editing
  const [editingPartTime, setEditingPartTime] = useState<{ staffId: number; day: number } | null>(null);
  // Candidate search from summary row - opens modal with pre-selected shift
  const [candidateSearch, setCandidateSearch] = useState<{ day: number; shiftPattern: ShiftPatternId } | null>(null);
  // Hourly staff chart - shows time-based workload for selected day
  const [hourlyChartDay, setHourlyChartDay] = useState<number | null>(null);

  // UX States
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  // Toast notifications
  const toast = useToast();

  // Listen for auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChange((authUser) => {
      if (authUser) {
        setAccessDenied(false);
      }
      setUser(authUser);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Load data from Firestore when user is authenticated
  useEffect(() => {
    if (!user) {
      setDataLoading(false);
      return;
    }

    setDataLoading(true);

    // Subscribe to real-time updates
    const unsubscribe = firestoreStorage.subscribe((data: OrganizationData | null, error) => {
      if (error) {
        if (error.code === 'permission-denied') {
          setAccessDenied(true);
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
      } else {
        // Initialize with defaults if no data exists
        setPatterns(firestoreStorage.normalizePatterns());
        setSettings(firestoreStorage.getDefaultSettings());
      }
      setDataLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;
  const daysInMonth = getDaysInMonth(year, month);
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const changeMonth = (offset: number) => {
    setCurrentDate(new Date(year, month - 1 + offset, 1));
  };

  const saveManualShiftMarker = (dateStr: string, staffId: number, shiftId: ShiftPatternId) => {
    const newManualShifts: ShiftSchedule = { ...manualShifts };
    if (isProtectedShiftId(shiftId)) {
      newManualShifts[dateStr] = { ...(newManualShifts[dateStr] || {}), [staffId]: shiftId };
    } else if (newManualShifts[dateStr]?.[staffId]) {
      newManualShifts[dateStr] = { ...newManualShifts[dateStr] };
      delete newManualShifts[dateStr][staffId];
      if (Object.keys(newManualShifts[dateStr]).length === 0) {
        delete newManualShifts[dateStr];
      }
    } else {
      return;
    }

    setManualShifts(newManualShifts);
    firestoreStorage.saveManualShifts(newManualShifts);
  };

  const removeManualShiftMarker = (dateStr: string, staffId: number) => {
    if (!manualShifts[dateStr]?.[staffId]) return;

    const newManualShifts: ShiftSchedule = { ...manualShifts, [dateStr]: { ...manualShifts[dateStr] } };
    delete newManualShifts[dateStr][staffId];
    if (Object.keys(newManualShifts[dateStr]).length === 0) {
      delete newManualShifts[dateStr];
    }

    setManualShifts(newManualShifts);
    firestoreStorage.saveManualShifts(newManualShifts);
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    // Small delay to show loading animation (Doherty threshold - 0.4s)
    await new Promise(resolve => setTimeout(resolve, 400));

    const generator = new ShiftGenerator(staff, holidays, year, month, settings, schedule, timeRangeSchedule, patterns, manualShifts);
    const newSchedule = generator.generate();
    const generationWarnings = generator.getWarnings();
    setSchedule(newSchedule);
    firestoreStorage.saveSchedule(newSchedule);
    setIsGenerating(false);
    if (generationWarnings.length > 0) {
      toast.warning(
        `振休未配置が${generationWarnings.length}件あります`,
        generationWarnings.slice(0, 3).join('、') + (generationWarnings.length > 3 ? ' ほか' : '')
      );
    }
  };

  const handleReset = () => {
    if (!window.confirm('自動生成されたシフトをリセットしますか？\n（手動入力された時間指定・有給・振休・研修・出張などの固定予定は保持されます）')) {
      return;
    }

    const newSchedule = { ...schedule };

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = getFormattedDate(year, month, d);
      if (!newSchedule[dateStr]) continue;

      staff.forEach(s => {
        const currentShift = newSchedule[dateStr][s.id];
        if (!currentShift) return;

        if (isTimeRangeStaff(s) || isCookingStaff(s)) {
          // Keep ALL manual-only staff shifts
          return;
        } else if (s.shiftType === 'regular' || s.position === '主任') {
          const manualDay = (manualShifts[dateStr] || {}) as Record<string | number, ShiftPatternId>;
          const manualShift = manualDay[s.id] || manualDay[String(s.id)];
          const isManualProtectedShift = currentShift === manualShift && isProtectedShiftId(currentShift);
          if (isProtectedShiftId(currentShift) && (currentShift !== '振' || isManualProtectedShift)) {
            return;
          }
          // Clear others
          newSchedule[dateStr][s.id] = '';
        } else {
          // Clear Director and other generated roles
          newSchedule[dateStr][s.id] = '';
        }
      });
    }

    setSchedule(newSchedule);
    firestoreStorage.saveSchedule(newSchedule);
  };

  const handleForceClearMonth = () => {
    const confirmText = `${year}-${String(month).padStart(2, '0')}`;
    const input = window.prompt(
      `${year}年${month}月のシフト・時間指定・手動固定予定をすべて削除します。\n職員設定、シフトパターン、祝日は残ります。\n\n実行するには ${confirmText} と入力してください。`
    );
    if (input !== confirmText) return;

    const newSchedule = { ...schedule };
    const newTimeRangeSchedule = { ...timeRangeSchedule };
    const newManualShifts = { ...manualShifts };

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = getFormattedDate(year, month, d);
      delete newSchedule[dateStr];
      delete newTimeRangeSchedule[dateStr];
      delete newManualShifts[dateStr];
    }

    setSchedule(newSchedule);
    setTimeRangeSchedule(newTimeRangeSchedule);
    setManualShifts(newManualShifts);
    firestoreStorage.saveSchedule(newSchedule);
    firestoreStorage.saveTimeRangeSchedule(newTimeRangeSchedule);
    firestoreStorage.saveManualShifts(newManualShifts);
    setShowSettingsMenu(false);
    toast.success('当月を白紙に戻しました', `${year}年${month}月の入力を削除しました`);
  };

  const handleApplyDefaultTimeRanges = () => {
    const targetStaff = staff.filter(s => isTimeRangeStaff(s) && (s.defaultTimeRange || Object.keys(s.weeklyTimeRanges || {}).length > 0));
    if (targetStaff.length === 0) {
      toast.info('固定勤務を反映できません', 'デフォルト勤務時間が設定された時間指定職員がいません');
      return;
    }

    if (!window.confirm(`${year}年${month}月に、時間指定職員のデフォルト勤務を反映しますか？\n既存の時間入力・休み・有給・研修などの予定は上書きしません。`)) {
      return;
    }

    const newTimeRangeSchedule: TimeRangeSchedule = { ...timeRangeSchedule };
    let appliedCount = 0;
    let skippedCount = 0;

    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month - 1, d);
      const weekday = date.getDay();
      if (weekday === 0) continue;

      const dateStr = getFormattedDate(year, month, d);
      if (holidays.some(h => h.date === dateStr)) continue;

      targetStaff.forEach(s => {
        if (!isStaffAvailableOnWeekday(s, weekday)) return;
        const defaultTimeRange = getStaffTimeRangeForWeekday(s, weekday);
        if (!defaultTimeRange) return;

        const existingShift = schedule[dateStr]?.[s.id];
        if (existingShift) {
          skippedCount++;
          return;
        }

        const existingRanges = (newTimeRangeSchedule[dateStr] || {}) as Record<string | number, TimeRange>;
        if (existingRanges[s.id] || existingRanges[String(s.id)]) {
          skippedCount++;
          return;
        }

        if (!newTimeRangeSchedule[dateStr]) {
          newTimeRangeSchedule[dateStr] = {};
        } else {
          newTimeRangeSchedule[dateStr] = { ...newTimeRangeSchedule[dateStr] };
        }

        newTimeRangeSchedule[dateStr][s.id] = {
          start: defaultTimeRange.start,
          end: defaultTimeRange.end,
          countAsShifts: [...(defaultTimeRange.countAsShifts || [])],
        };
        appliedCount++;
      });
    }

    if (appliedCount === 0) {
      toast.info('固定勤務の反映はありませんでした', skippedCount > 0 ? `${skippedCount}件は既存入力があるため保持しました` : '対象曜日がありません');
      return;
    }

    setTimeRangeSchedule(newTimeRangeSchedule);
    firestoreStorage.saveTimeRangeSchedule(newTimeRangeSchedule);
    toast.success('固定勤務を反映しました', `${appliedCount}件を追加、${skippedCount}件を保持しました`);
  };

  const handleUpdateStaff = (newStaff: Staff[]) => {
    setStaff(newStaff);
    firestoreStorage.saveStaff(newStaff);
  };

  const handleUpdateSettings = (newSettings: Settings) => {
    setSettings(newSettings);
    firestoreStorage.saveSettings(newSettings);
  };

  const handleUpdateHolidays = (newHolidays: Holiday[]) => {
    setHolidays(newHolidays);
    firestoreStorage.saveHolidays(newHolidays);
  };

  const handleUpdatePatterns = (newPatterns: ShiftPatternDefinition[]) => {
    const normalizedPatterns = firestoreStorage.normalizePatterns(newPatterns);
    setPatterns(normalizedPatterns);
    firestoreStorage.savePatterns(normalizedPatterns);
  };

  const handleCellClick = (staffId: number, day: number) => {
    const staffMember = staff.find(s => s.id === staffId);
    // Time-range workers use TimeRangeModal instead of ShiftEditModal
    if (staffMember && isTimeRangeStaff(staffMember)) {
      setEditingPartTime({ staffId, day });
    } else {
      setEditingCell({ staffId, day });
    }
  };

  const handleShiftUpdate = (shiftId: ShiftPatternId) => {
    if (!editingCell) return;
    const { staffId, day } = editingCell;
    const dateStr = getFormattedDate(year, month, day);

    // Save previous state for undo
    const prevSchedule = JSON.parse(JSON.stringify(schedule));
    const prevManualShifts = JSON.parse(JSON.stringify(manualShifts));
    const prevShift = schedule[dateStr]?.[staffId] || '休';

    // Create new schedule
    const newSchedule = { ...schedule };
    if (!newSchedule[dateStr]) newSchedule[dateStr] = {};
    newSchedule[dateStr][staffId] = shiftId;

    // Check for constraint violations
    const ctx = createConstraintContext(newSchedule, staff, holidays, settings, year, month, patterns);
    const violations = checkConstraints(ctx, day, staffId, shiftId);
    const hardViolations = violations.filter(v => v.type === 'hard');

    // Apply changes
    setSchedule(newSchedule);
    firestoreStorage.saveSchedule(newSchedule);
    saveManualShiftMarker(dateStr, staffId, shiftId);
    setEditingCell(null);

    // Show toast with undo option if there are violations
    const staffMember = staff.find(s => s.id === staffId);
    if (hardViolations.length > 0) {
      toast.warning(
        `制約違反があります`,
        hardViolations.map(v => v.message).join('、'),
        () => {
          setSchedule(prevSchedule);
          firestoreStorage.saveSchedule(prevSchedule);
          setManualShifts(prevManualShifts);
          firestoreStorage.saveManualShifts(prevManualShifts);
        }
      );
    } else if (violations.length > 0) {
      toast.info(
        `${staffMember?.name}: ${prevShift} → ${shiftId}`,
        `推奨外: ${violations.map(v => v.message).join('、')}`
      );
    }
  };

  // Handler for assigning a shift to a different staff member (from candidate search)
  const handleSelectStaff = (targetStaffId: number, shiftId: ShiftPatternId) => {
    if (!editingCell) return;
    const { day } = editingCell;
    const dateStr = getFormattedDate(year, month, day);

    // Save previous state for undo
    const prevSchedule = JSON.parse(JSON.stringify(schedule));
    const prevManualShifts = JSON.parse(JSON.stringify(manualShifts));

    // Create new schedule
    const newSchedule = { ...schedule };
    if (!newSchedule[dateStr]) newSchedule[dateStr] = {};
    newSchedule[dateStr][targetStaffId] = shiftId;

    // Check for constraint violations
    const ctx = createConstraintContext(newSchedule, staff, holidays, settings, year, month, patterns);
    const violations = checkConstraints(ctx, day, targetStaffId, shiftId);
    const hardViolations = violations.filter(v => v.type === 'hard');

    // Apply changes
    setSchedule(newSchedule);
    firestoreStorage.saveSchedule(newSchedule);
    saveManualShiftMarker(dateStr, targetStaffId, shiftId);
    setEditingCell(null);

    // Show toast
    const staffMember = staff.find(s => s.id === targetStaffId);
    if (hardViolations.length > 0) {
      toast.warning(
        `制約違反があります`,
        `${staffMember?.name}: ${hardViolations.map(v => v.message).join('、')}`,
        () => {
          setSchedule(prevSchedule);
          firestoreStorage.saveSchedule(prevSchedule);
          setManualShifts(prevManualShifts);
          firestoreStorage.saveManualShifts(prevManualShifts);
        }
      );
    } else {
      toast.success(
        `${staffMember?.name} → ${shiftId}`,
        `${month}/${day} に配置しました`
      );
    }
  };

  // Handler for swapping two staff members' shifts
  const handleSwap = (staffAId: number, staffBId: number) => {
    if (!editingCell) return;
    const { day } = editingCell;
    const dateStr = getFormattedDate(year, month, day);

    // Save previous state for undo
    const prevSchedule = JSON.parse(JSON.stringify(schedule));

    // Get current shifts
    const shiftA = schedule[dateStr]?.[staffAId] || '';
    const shiftB = schedule[dateStr]?.[staffBId] || '';

    // Create new schedule with swapped shifts
    const newSchedule = { ...schedule };
    if (!newSchedule[dateStr]) newSchedule[dateStr] = {};
    newSchedule[dateStr][staffAId] = shiftB;
    newSchedule[dateStr][staffBId] = shiftA;

    // Apply changes
    setSchedule(newSchedule);
    firestoreStorage.saveSchedule(newSchedule);
    setEditingCell(null);

    // Show toast with undo option
    const staffMemberA = staff.find(s => s.id === staffAId);
    const staffMemberB = staff.find(s => s.id === staffBId);
    toast.warning(
      `シフト入替完了`,
      `${staffMemberA?.name}(${shiftA}→${shiftB}) ⇄ ${staffMemberB?.name}(${shiftB}→${shiftA})`,
      () => {
        setSchedule(prevSchedule);
        firestoreStorage.saveSchedule(prevSchedule);
      }
    );
  };

  const isHoliday = (day: number) => {
    const dateStr = getFormattedDate(year, month, day);
    return holidays.some(h => h.date === dateStr);
  };

  const getShiftColor = (shiftId: string) => {
    // Rev.4: New color palette with 30°+ hue separation for better differentiation
    const baseStyle = 'border border-[#D1D5DB] text-[#1F2937] font-medium';

    // 休暇系スタイル（出勤シフトより控えめに）
    const restBaseStyle = 'border-dashed text-[#6B7280]';

    // 振休 - グレー背景 + 緑のアクセント（休み感を強調）
    if (shiftId === '振') return `${restBaseStyle} bg-[#F3F4F6] border border-[#10B981] border-l-[5px] border-l-[#10B981] opacity-75`;
    // 有給 - グレー背景 + ピンクのアクセント（休み感を強調）
    if (shiftId === '有') return `${restBaseStyle} bg-[#F3F4F6] border border-[#F472B6] border-l-[5px] border-l-[#F472B6] opacity-75`;
    if (shiftId === '半有') return `${restBaseStyle} bg-[#FFF1F2] border border-[#FB7185] border-l-[5px] border-l-[#FB7185]`;
    if (shiftId === '研') return `${restBaseStyle} bg-[#ECFDF5] border border-[#34D399] border-l-[5px] border-l-[#34D399]`;
    if (shiftId === '出') return `${restBaseStyle} bg-[#EFF6FF] border border-[#60A5FA] border-l-[5px] border-l-[#60A5FA]`;
    if (shiftId === '保') return `${restBaseStyle} bg-[#F1F5F9] border border-[#64748B] border-l-[5px] border-l-[#64748B]`;
    // 休日 - Cool Gray (最も目立たせない)
    if (shiftId === '休') return `${restBaseStyle} bg-[#F9FAFB] border border-[#D1D5DB] border-l-[5px] border-l-[#9CA3AF] text-[#9CA3AF] opacity-50`;

    const pattern = patterns.find(p => p.id === shiftId);
    if (pattern) {
      // 時間帯カラー：サンライズ → モーニング → ミッドデイ → サンセット → トワイライト → ナイト
      // A - 🌅 Sunrise Amber (早朝・暖色)
      if (shiftId === 'A') return `${baseStyle} bg-[rgba(245,158,11,0.12)] border-l-[5px] border-l-[#F59E0B]`;
      // B - ☀️ Morning Sky Blue (午前・明るい青)
      if (shiftId === 'B') return `${baseStyle} bg-[rgba(56,189,248,0.10)] border-l-[5px] border-l-[#38BDF8]`;
      // C - 🌤️ Midday Blue (日中・深い青)
      if (shiftId === 'C') return `${baseStyle} bg-[rgba(59,130,246,0.10)] border-l-[5px] border-l-[#3B82F6]`;
      // D - 🌇 Sunset Orange (午後・オレンジ)
      if (shiftId === 'D') return `${baseStyle} bg-[rgba(249,115,22,0.12)] border-l-[5px] border-l-[#F97316]`;
      // E - 🌆 Twilight Purple (夕方・紫)
      if (shiftId === 'E') return `${baseStyle} bg-[rgba(168,85,247,0.10)] border-l-[5px] border-l-[#A855F7]`;
      // F - Neutral White (追加標準枠)
      if (shiftId === 'F') return `${baseStyle} bg-[rgba(20,184,166,0.10)] border-l-[5px] border-l-[#14B8A6]`;
      // C' - Deep Blue Variant
      if (shiftId === "C'") return `${baseStyle} bg-[rgba(99,102,241,0.10)] border-l-[5px] border-l-[#6366F1]`;
      // J - 🌙 Night Crimson (夜・深い赤)
      if (shiftId === 'J') return `${baseStyle} bg-[rgba(220,38,38,0.10)] border-l-[5px] border-l-[#DC2626]`;
      return `${baseStyle} bg-[#FDFDFD]`;
    }

    return 'bg-[#FDFDFD] border border-[#E5E7EB] text-[#D1D5DB]'; // Empty/Unknown
  };

  // Rev.5: Shape markers for colorblind accessibility
  const getShiftMarker = (shiftId: string): string => {
    const markers: Record<string, string> = {
      'A': '●', // 塘り丸
      'B': '■', // 塘り四角
      'C': '◆', // 塘り菱形
      'D': '▲', // 三角上
      'E': '▼', // 三角下
      'F': '⬟', // 五角形
      "C'": '⬢', // 六角形
      'J': '★', // 星
      '振': '○', // 白丸
      '有': '◇', // 白菱形
      '半有': '◐',
      '研': '✎',
      '出': '↗',
      '保': '□',
      '休': '－', // 横線
    };
    return markers[shiftId] || '';
  };

  // Calculate daily staff counts (including part-timers with time ranges)
  const dailyCounts = days.map(day => {
    const dateStr = getFormattedDate(year, month, day);
    let count = 0;
    staff.forEach(s => {
      if (!countsForStaffing(s)) return;

      // For time-range workers, check if they have a time range entry
      if (isTimeRangeStaff(s)) {
        const timeRange = timeRangeSchedule[dateStr]?.[s.id];
        if (timeRange) {
          count++; // Time-range staff is working
        }
        return;
      }

      const shift = schedule[dateStr]?.[s.id];
      if (isWorkShiftId(shift)) {
        count++;
      }
    });
    return count;
  });

  // Calculate daily qualified staff counts per shift pattern
  const qualifiedCounts = days.map(day => {
    const dateStr = getFormattedDate(year, month, day);
    return countAllPatterns(staff, schedule, timeRangeSchedule, dateStr, true, patterns.map(p => p.id));
  });

  const handleDownloadExcel = () => {
    exportToExcel({
      year,
      month,
      staff,
      schedule,
      timeRangeSchedule,
      patterns,
      holidays,
    });
  };


  // Show loading screen while checking auth
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-pink-50 via-white to-amber-50 flex items-center justify-center">
        <div className="text-center">
          <ShiftPaletteIcon className="w-16 h-16 mx-auto mb-4 animate-pulse" />
          <p className="text-gray-500">読み込み中...</p>
        </div>
      </div>
    );
  }

  // Show login screen if not authenticated
  if (!user) {
    return <LoginScreen onLogin={() => { }} isLoading={false} accessDenied={accessDenied} />;
  }

  // Show loading while fetching data
  if (dataLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-pink-50 via-white to-amber-50 flex items-center justify-center">
        <div className="text-center">
          <ShiftPaletteIcon className="w-16 h-16 mx-auto mb-4 animate-pulse" />
          <p className="text-gray-500">データを同期中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F7F8FA] flex flex-col font-sans text-[#1F2937]">
      <header className="bg-[#FDFDFD] border-b border-[#E5E7EB] shadow-[0_2px_4px_rgba(0,0,0,0.06)] p-2 landscape:p-1.5 md:p-4 sticky top-0 z-30">
        <div className="max-w-[1920px] mx-auto">
          {/* Mobile portrait: 2-row, Mobile landscape & Desktop: 1-row */}
          <div className="flex flex-col landscape:flex-row landscape:justify-between landscape:items-center md:flex-row md:justify-between md:items-center gap-2 landscape:gap-0 md:gap-0">
            {/* Row 1: Logo + Month Navigation */}
            <div className="flex items-center justify-between landscape:justify-start md:justify-start landscape:space-x-4 md:space-x-6">
              <h1 className="text-lg landscape:text-base md:text-2xl font-bold tracking-tight flex items-center gap-1.5 landscape:gap-1 md:gap-2">
                <ShiftPaletteIcon className="w-6 h-6 landscape:w-5 landscape:h-5 md:w-9 md:h-9" />
                <span className="logo-gradient text-sm landscape:text-xs md:text-xl font-bold">ShiftPalette</span>
              </h1>
              <div className="hidden lg:flex flex-col leading-tight text-xs text-gray-500">
                <span className="font-semibold text-gray-700">{settings.profileName}</span>
                <span>{settings.fiscalYear}年度</span>
              </div>
              <div className="flex items-center bg-gray-100 rounded-full p-0.5 landscape:p-0.5 md:p-1">
                <button onClick={() => changeMonth(-1)} className="p-1.5 landscape:p-1 md:p-2 hover:bg-gray-200 rounded-full transition-all duration-200 text-gray-600">
                  <ChevronLeft size={18} className="landscape:w-4 landscape:h-4 md:w-5 md:h-5" />
                </button>
                <span className="text-sm landscape:text-xs md:text-lg font-bold mx-2 landscape:mx-1 md:mx-4 min-w-[80px] landscape:min-w-[70px] md:min-w-[120px] text-center text-gray-800">
                  {year}年 {month}月
                </span>
                <button onClick={() => changeMonth(1)} className="p-1.5 landscape:p-1 md:p-2 hover:bg-gray-200 rounded-full transition-all duration-200 text-gray-600">
                  <ChevronRight size={18} className="landscape:w-4 landscape:h-4 md:w-5 md:h-5" />
                </button>
              </div>
              {/* Alert Badge */}
              <AlertBadge
                staff={staff}
                schedule={schedule}
                timeRangeSchedule={timeRangeSchedule}
                days={days}
                year={year}
                month={month}
                holidays={holidays}
                minCount={settings.weekdayStaffCount}
                patterns={patterns}
              />
            </div>

            {/* Row 2: Action Buttons */}
            <div className="flex items-center justify-end space-x-1.5 landscape:space-x-1 md:space-x-3">
              {/* Settings Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setShowSettingsMenu(!showSettingsMenu)}
                  className="flex items-center space-x-1 md:space-x-2 px-2.5 landscape:px-2 md:px-4 py-1.5 landscape:py-1 md:py-2 bg-white text-gray-600 border border-gray-200 rounded-full hover:border-[#FF6B6B] hover:text-[#FF6B6B] transition-all duration-200 font-medium text-xs landscape:text-xs md:text-sm"
                >
                  <Menu size={16} className="md:w-[18px] md:h-[18px]" />
                  <span className="hidden sm:inline">設定</span>
                  <ChevronDown size={14} className={`hidden sm:block transition-transform duration-200 ${showSettingsMenu ? 'rotate-180' : ''}`} />
                </button>

                {/* Dropdown Menu */}
                {showSettingsMenu && (
                  <div className="absolute right-0 mt-2 w-48 bg-[#FDFDFD] rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.15)] border border-[#E5E7EB] overflow-hidden animate-fade-in-up z-50">
                    <button
                      onClick={() => { setShowSettings(true); setShowSettingsMenu(false); }}
                      className="w-full flex items-center space-x-3 px-4 py-3 hover:bg-pink-50 transition-colors text-gray-700"
                    >
                      <SettingsIcon size={18} className="text-[#FF6B6B]" />
                      <span className="font-medium">シフト設定</span>
                    </button>
                    <button
                      onClick={() => { setShowStaffList(true); setShowSettingsMenu(false); }}
                      className="w-full flex items-center space-x-3 px-4 py-3 hover:bg-pink-50 transition-colors text-gray-700 border-t border-gray-50"
                    >
                      <Users size={18} className="text-[#FF6B6B]" />
                      <span className="font-medium">職員設定</span>
                    </button>
                    <button
                      onClick={() => { setShowHolidayModal(true); setShowSettingsMenu(false); }}
                      className="w-full flex items-center space-x-3 px-4 py-3 hover:bg-pink-50 transition-colors text-gray-700 border-t border-gray-50"
                    >
                      <Calendar size={18} className="text-[#FF6B6B]" />
                      <span className="font-medium">祝日設定</span>
                    </button>
                    {storage.hasData() && (
                      <button
                        onClick={async () => {
                          if (!window.confirm('LocalStorageのデータをクラウドに移行しますか？\n\n現在のクラウドデータは上書きされます。')) return;
                          const data = storage.getAllForMigration();
                          await firestoreStorage.saveAll(data);
                          setStaff(data.staff);
                          setSchedule(data.schedule);
                          setManualShifts(data.manualShifts || {});
                          setSettings(firestoreStorage.normalizeSettings(data.settings));
                          setHolidays(data.holidays);
                          setPatterns(data.patterns);
                          setShowSettingsMenu(false);
                          alert('データを移行しました！');
                        }}
                        className="w-full flex items-center space-x-3 px-4 py-3 hover:bg-blue-50 transition-colors text-blue-600 border-t border-gray-50"
                      >
                        <DatabaseBackup size={18} />
                        <span className="font-medium">LocalStorageから復元</span>
                      </button>
                    )}
                    <div className="border-t border-gray-100 my-1" />
                    <button
                      onClick={handleForceClearMonth}
                      className="w-full flex items-center space-x-3 px-4 py-3 hover:bg-red-50 transition-colors text-red-600"
                    >
                      <Trash2 size={18} />
                      <span className="font-medium">当月を白紙に戻す</span>
                    </button>
                    <div className="border-t border-gray-100 my-1" />
                    <button
                      onClick={async () => {
                        await signOut();
                        setShowSettingsMenu(false);
                      }}
                      className="w-full flex items-center space-x-3 px-4 py-3 hover:bg-red-50 transition-colors text-red-600"
                    >
                      <LogOut size={18} />
                      <span className="font-medium">ログアウト</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Main Actions */}
              <button
                onClick={handleReset}
                className="flex items-center space-x-1 md:space-x-2 px-2.5 landscape:px-2 md:px-4 py-1.5 landscape:py-1 md:py-2 bg-white text-gray-600 border border-gray-200 rounded-full hover:border-gray-400 transition-all duration-200 font-medium active:scale-95 text-xs landscape:text-xs md:text-sm"
              >
                <RotateCcw size={16} className="md:w-[18px] md:h-[18px]" />
                <span className="hidden sm:inline">リセット</span>
              </button>
              <button
                onClick={handleApplyDefaultTimeRanges}
                className="flex items-center space-x-1 md:space-x-2 px-2.5 landscape:px-2 md:px-4 py-1.5 landscape:py-1 md:py-2 bg-white text-gray-600 border border-gray-200 rounded-full hover:border-[#10B981] hover:text-[#059669] transition-all duration-200 font-medium active:scale-95 text-xs landscape:text-xs md:text-sm"
              >
                <CalendarCheck size={16} className="md:w-[18px] md:h-[18px]" />
                <span className="hidden sm:inline">固定勤務</span>
              </button>
              <button
                onClick={handleGenerate}
                disabled={isGenerating}
                className={`btn-primary text-xs landscape:text-xs md:text-sm px-3 landscape:px-2 md:px-5 py-1.5 landscape:py-1 md:py-2 ${isGenerating ? 'opacity-80 cursor-wait' : 'active:scale-95'}`}
              >
                <RefreshCw size={16} className={`md:w-[18px] md:h-[18px] ${isGenerating ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">{isGenerating ? '生成中...' : '自動生成'}</span>
                <span className="sm:hidden">{isGenerating ? '...' : '生成'}</span>
              </button>
              <button
                onClick={handleDownloadExcel}
                className="flex items-center space-x-1 px-2.5 landscape:px-2 md:px-4 py-1.5 landscape:py-1 md:py-2 bg-white text-gray-600 border border-gray-200 rounded-full hover:border-[#45B7D1] hover:text-[#45B7D1] transition-all duration-200 font-medium active:scale-95 text-xs landscape:text-xs md:text-sm"
              >
                <Download size={16} className="md:w-[18px] md:h-[18px]" />
                <span className="hidden sm:inline">Excel</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-auto p-1.5 landscape:p-1 md:p-4">
        <div className="max-w-[1920px] mx-auto bg-[#FDFDFD] rounded-xl landscape:rounded-lg md:rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.08)] overflow-hidden border border-[#E5E7EB]">
          <div className="overflow-x-auto max-h-[calc(100vh-160px)] landscape:max-h-[calc(100vh-60px)] md:max-h-[calc(100vh-140px)]">
            <table className="w-full border-collapse text-xs md:text-sm relative">
              <thead className="bg-[#FDFDFD] text-[#1F2937] sticky top-0 z-20 shadow-sm">
                <tr>
                  <th className="border-b border-r border-[#D1D5DB] p-2 md:p-3 min-w-[100px] md:min-w-[180px] sticky left-0 z-20 bg-[#FDFDFD] font-bold text-sm md:text-base text-[#1F2937]">職員</th>
                  {days.map(day => {
                    const date = new Date(year, month - 1, day);
                    const dayOfWeek = date.getDay();
                    const isSat = dayOfWeek === 6;
                    const isSun = dayOfWeek === 0;
                    const isHol = isHoliday(day);

                    let textColor = 'text-[#1F2937]';
                    let bgColor = '';
                    if (isSun || isHol) {
                      textColor = 'text-[#FF6B6B] font-bold';
                      bgColor = 'bg-[#FEE2E2]';
                    } else if (isSat) {
                      textColor = 'text-[#45B7D1] font-bold';
                      bgColor = 'bg-[#E0F2FE]';
                    }

                    return (
                      <th
                        key={day}
                        className={`border-b border-r border-[#D1D5DB] p-1 md:p-2 min-w-[32px] md:min-w-[45px] text-center ${textColor} ${bgColor} cursor-pointer hover:opacity-80 transition-opacity`}
                        onClick={() => setHourlyChartDay(day)}
                        title="クリックで時間帯別人員を表示"
                      >
                        <div className="font-bold text-sm md:text-lg">{day}</div>
                        <div className="text-[10px] md:text-xs opacity-80">({['日', '月', '火', '水', '木', '金', '土'][dayOfWeek]})</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {staff.map(s => {
                  return (
                    <tr key={s.id} className="hover:bg-gradient-to-r hover:from-pink-50 hover:via-white hover:to-yellow-50 transition-all duration-200">
                      <td className="border-r border-pink-100 p-1.5 md:p-2 sticky left-0 z-10 bg-white font-medium text-gray-700 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.08)]">
                        <div className="flex items-center justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="text-sm md:text-base font-semibold truncate">{s.name}</div>
                            <div className="text-[10px] md:text-xs text-gray-400 hidden sm:block">{s.position}</div>
                          </div>
                          {isCookingStaff(s) && <span className="text-[10px] md:text-xs bg-[#FFE66D] text-[#7C5800] px-1.5 md:px-2 py-0.5 rounded-full font-medium ml-1">調</span>}
                        </div>
                      </td>
                      {days.map(day => {
                        const dateStr = getFormattedDate(year, month, day);
                        const shiftId = schedule[dateStr]?.[s.id] || '';
                        // Handle potential Firestore key type inconsistency (number vs string)
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const dateRanges = (timeRangeSchedule[dateStr] || {}) as Record<string | number, TimeRange>;
                        const partTimeRange = dateRanges[s.id] || dateRanges[String(s.id)];
                        const isPartTime = isTimeRangeStaff(s);


                        return (
                          <td
                            key={day}
                            className="px-0.5 md:px-1 py-0.5 md:py-1 text-center border-r border-[#E5E7EB] relative group cursor-pointer hover:bg-[#F3F4F6] transition-all duration-150"
                            onClick={() => handleCellClick(s.id, day)}
                          >
                            {/* Display priority: 1) Holiday shifts 2) Part-time time range 3) Other shifts 4) Empty */}
                            {(shiftId && !isWorkShiftId(shiftId)) ? (
                              /* Holiday shifts - show for everyone including part-timers */
                              shiftId === '休' ? (
                                <div className="w-6 h-6 md:w-8 md:h-8 mx-auto flex items-center justify-center text-[#9CA3AF] font-medium text-sm opacity-60">
                                  －
                                </div>
                              ) : (
                                <div className={`w-7 h-6 md:w-9 md:h-8 mx-auto flex items-center justify-center gap-0.5 rounded-md text-xs md:text-sm shadow-sm ${getShiftColor(shiftId)}`}>
                                  <span className="font-medium">{shiftId}</span>
                                </div>
                              )
                            ) : isPartTime && partTimeRange ? (
                              /* Time-range worker with time range - only if no holiday set */
                              <div
                                className="w-9 md:w-12 min-h-10 mx-auto flex flex-col items-center justify-center rounded-md text-[7px] md:text-[8px] shadow-sm transition-all duration-150 hover:scale-105 hover:shadow-md bg-gray-100 border border-gray-300 text-gray-700 font-medium leading-tight px-0.5 py-1"
                                title={`${partTimeRange.start}-${partTimeRange.end}${partTimeRange.countAsShifts?.length ? ` / 集計: ${partTimeRange.countAsShifts.join(', ')}` : ' / 集計なし'}`}
                              >
                                <span>{partTimeRange.start}</span>
                                <span className="text-gray-400">↓</span>
                                <span>{partTimeRange.end}</span>
                                {partTimeRange.countAsShifts?.length ? (
                                  <span className="mt-0.5 flex flex-wrap justify-center gap-[1px] max-w-full">
                                    {partTimeRange.countAsShifts.map(shift => (
                                      <span key={shift} className="px-0.5 rounded-sm bg-white border border-emerald-300 text-emerald-700 font-bold leading-none">
                                        {shift}
                                      </span>
                                    ))}
                                  </span>
                                ) : (
                                  <span className="mt-0.5 text-[6px] md:text-[7px] text-amber-600 leading-none">未割当</span>
                                )}
                              </div>
                            ) : shiftId ? (
                              <div className={`
                                  w-7 h-6 md:w-9 md:h-8 mx-auto flex items-center justify-center gap-0.5 rounded-md text-xs md:text-sm shadow-sm transition-all duration-150 hover:scale-110 hover:shadow-md active:scale-95
                                  ${getShiftColor(shiftId)}
                                `}>
                                <span className="text-[8px] md:text-[10px] opacity-80">{getShiftMarker(shiftId)}</span>
                                <span className="font-medium">{shiftId}</span>
                              </div>
                            ) : isPartTime ? (
                              /* Part-timer with no assignment - show dash */
                              <div className="w-6 h-6 md:w-8 md:h-8 mx-auto flex items-center justify-center text-[#9CA3AF] font-medium text-sm opacity-60">
                                －
                              </div>
                            ) : (
                              <div className="w-7 h-6 md:w-9 md:h-8 mx-auto rounded-md hover:bg-[#F3F4F6] transition-colors border border-dashed border-transparent hover:border-[#D1D5DB]"></div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                {/* Summary Row: Total Staff */}
                <tr className="bg-gray-50 font-bold border-t-2 border-gray-200">
                  <td className="px-4 py-3 text-sm text-gray-700 sticky left-0 bg-gray-50 z-10 border-r shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                    出勤人数
                  </td>
                  {dailyCounts.map((count, idx) => {
                    const day = idx + 1;
                    const date = new Date(year, month - 1, day);
                    const isSat = date.getDay() === 6;
                    const isSun = date.getDay() === 0;
                    const isHol = isHoliday(day);

                    // Low count logic uses profile settings for weekdays and Saturdays.
                    const isLow = !isSun && !isHol && ((!isSat && count < settings.weekdayStaffCount) || (isSat && count < settings.saturdayStaffCount));

                    return (
                      <td key={day} className={`px-1 py-2 text-center text-sm border-r ${isLow ? 'bg-red-200 text-red-800 font-bold' : 'text-gray-700'}`}>
                        {count > 0 ? count : '-'}
                      </td>
                    );
                  })}

                </tr>
                {/* Qualified Staff Counts */}
                {patterns.map(pattern => {
                  const patternId = pattern.id;
                  const minCount = pattern.minCount || 0;

                  return (
                    <tr key={`qual-${patternId}`} className="bg-white border-t border-gray-100">
                      <td className="px-4 py-2 text-xs text-gray-500 sticky left-0 bg-white z-10 border-r shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                        資格者 ({patternId})
                      </td>
                      {qualifiedCounts.map((counts, idx) => {
                        const count = counts[patternId];
                        const day = idx + 1;
                        const date = new Date(year, month - 1, day);
                        const isSat = date.getDay() === 6;
                        const isSun = date.getDay() === 0;
                        const isHol = isHoliday(day);

                        // Check min count (only for weekdays that are not holidays)
                        // Assuming minCount applies to weekdays
                        const isWeekday = !isSat && !isSun && !isHol;
                        const isLow = isWeekday && count < minCount;
                        const isHigh = isWeekday && count > minCount;

                        let cellClass = 'text-gray-600';
                        if (isLow) cellClass = 'bg-red-200 text-red-800 font-bold';
                        else if (isHigh) cellClass = 'bg-blue-100 text-blue-800 font-bold';

                        return (
                          <td
                            key={idx}
                            className={`px-1 py-1 text-center text-xs border-r cursor-pointer hover:ring-2 hover:ring-[#FF6B6B] hover:ring-inset transition-all ${cellClass}`}
                            onClick={() => setCandidateSearch({ day, shiftPattern: patternId })}
                            title={`${patternId}シフトの候補者を検索`}
                          >
                            {count > 0 ? count : '-'}
                          </td>
                        );
                      })}

                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Shift Balance Dashboard */}
        <ShiftBalanceDashboard
          staff={staff}
          schedule={schedule}
          days={days}
          year={year}
          month={month}
          patterns={patterns}
        />
      </main>

      {showStaffList && (
        <StaffList
          staff={staff}
          patterns={patterns}
          onUpdate={handleUpdateStaff}
          onClose={() => setShowStaffList(false)}
        />
      )}

      {showSettings && (
        <SettingsModal
          settings={settings}
          patterns={patterns}
          onSave={handleUpdateSettings}
          onUpdatePatterns={handleUpdatePatterns}
          onClose={() => setShowSettings(false)}
        />
      )}

      {showHolidayModal && (
        <HolidayModal
          year={year}
          month={month}
          holidays={holidays}
          onUpdate={handleUpdateHolidays}
          onClose={() => setShowHolidayModal(false)}
        />
      )}

      {editingCell && (
        <ShiftEditModal
          staffId={editingCell.staffId}
          staffName={staff.find(s => s.id === editingCell.staffId)?.name || ''}
          day={editingCell.day}
          year={year}
          month={month}
          currentShift={schedule[getFormattedDate(year, month, editingCell.day)]?.[editingCell.staffId] || ''}
          schedule={schedule}
          staff={staff}
          holidays={holidays}
          settings={settings}
          patterns={patterns}
          onSelect={handleShiftUpdate}
          onSelectStaff={handleSelectStaff}
          onSwap={handleSwap}
          onClose={() => setEditingCell(null)}
        />
      )}

      {/* Candidate Search Modal - opened from summary row */}
      {candidateSearch && (
        <CandidateSearchModal
          day={candidateSearch.day}
          year={year}
          month={month}
          shiftPattern={candidateSearch.shiftPattern}
          schedule={schedule}
          staff={staff}
          holidays={holidays}
          settings={settings}
          patterns={patterns}
          onSelectCandidate={(staffId, shiftPattern) => {
            const dateStr = getFormattedDate(year, month, candidateSearch.day);

            // Update schedule
            const newSchedule = { ...schedule };
            if (!newSchedule[dateStr]) newSchedule[dateStr] = {};
            newSchedule[dateStr][staffId] = shiftPattern;

            setSchedule(newSchedule);
            firestoreStorage.saveSchedule(newSchedule);
            saveManualShiftMarker(dateStr, staffId, shiftPattern);
            setCandidateSearch(null);

            // Show toast
            const staffMember = staff.find(s => s.id === staffId);
            toast.success(
              `${staffMember?.name} → ${shiftPattern}`,
              `${month}/${candidateSearch.day} に配置しました`
            );
          }}
          onClose={() => setCandidateSearch(null)}
        />
      )}

      {/* TimeRangeModal - for part-time workers */}
      {editingPartTime && (() => {
        const staffMember = staff.find(s => s.id === editingPartTime.staffId);
        const dateStr = getFormattedDate(year, month, editingPartTime.day);
        const currentTimeRange = timeRangeSchedule[dateStr]?.[editingPartTime.staffId] || null;
        const currentShift = schedule[dateStr]?.[editingPartTime.staffId] || '';

        return (
          <TimeRangeModal
            staffId={editingPartTime.staffId}
            staffName={staffMember?.name || ''}
            day={editingPartTime.day}
            year={year}
            month={month}
            currentTimeRange={currentTimeRange}
            currentShift={currentShift}
            defaultTimeRange={staffMember?.defaultTimeRange}
            disableShiftCounting={staffMember ? !countsForStaffing(staffMember) : false}
            holidayOptions={HOLIDAY_PATTERNS}
            patterns={patterns}
            onSaveTimeRange={(timeRange: TimeRange) => {
              // Save time range to timeRangeSchedule with deep copy
              const newTimeRangeSchedule = { ...timeRangeSchedule };
              if (!newTimeRangeSchedule[dateStr]) {
                newTimeRangeSchedule[dateStr] = {};
              } else {
                newTimeRangeSchedule[dateStr] = { ...newTimeRangeSchedule[dateStr] }; // Deep copy
              }
              newTimeRangeSchedule[dateStr][editingPartTime.staffId] = timeRange;
              setTimeRangeSchedule(newTimeRangeSchedule);
              firestoreStorage.saveTimeRangeSchedule(newTimeRangeSchedule);

              // ALWAYS clear schedule entry - set to empty string for Firestore merge
              const newSchedule = { ...schedule };
              if (!newSchedule[dateStr]) newSchedule[dateStr] = {};
              newSchedule[dateStr] = { ...newSchedule[dateStr] }; // Deep copy
              // Use empty string instead of delete - Firestore merge won't remove deleted keys
              newSchedule[dateStr][editingPartTime.staffId] = '' as ShiftPatternId;
              setSchedule(newSchedule);
              firestoreStorage.saveSchedule(newSchedule);
              removeManualShiftMarker(dateStr, editingPartTime.staffId);

              setEditingPartTime(null);
              toast.success(`${staffMember?.name}`, `${timeRange.start}-${timeRange.end} に設定しました`);
            }}
            onSaveShift={(shiftId: ShiftPatternId) => {
              // Save holiday shift  
              const newSchedule = { ...schedule };
              if (!newSchedule[dateStr]) {
                newSchedule[dateStr] = {};
              } else {
                newSchedule[dateStr] = { ...newSchedule[dateStr] }; // Deep copy
              }
              newSchedule[dateStr][editingPartTime.staffId] = shiftId;
              setSchedule(newSchedule);
              firestoreStorage.saveSchedule(newSchedule);
              saveManualShiftMarker(dateStr, editingPartTime.staffId, shiftId);

              // Clear any existing time range
              const newTimeRangeSchedule = { ...timeRangeSchedule };
              if (newTimeRangeSchedule[dateStr]) {
                newTimeRangeSchedule[dateStr] = { ...newTimeRangeSchedule[dateStr] }; // Deep copy!
                delete newTimeRangeSchedule[dateStr][editingPartTime.staffId];
              }
              setTimeRangeSchedule(newTimeRangeSchedule);
              firestoreStorage.saveTimeRangeSchedule(newTimeRangeSchedule);

              setEditingPartTime(null);
              toast.success(`${staffMember?.name}`, `${shiftId} に変更しました`);
            }}
            onSaveAsDefault={(timeRange: TimeRange) => {
              // Save time range as staff's default
              const newStaff = staff.map(s =>
                s.id === editingPartTime.staffId
                  ? { ...s, defaultTimeRange: timeRange }
                  : s
              );
              setStaff(newStaff);
              firestoreStorage.saveStaff(newStaff);
              toast.success(`${staffMember?.name}`, `${timeRange.start}-${timeRange.end} をデフォルトに設定しました`);
            }}
            onClear={() => {
              // Clear both time range and shift
              const newSchedule = { ...schedule };
              if (newSchedule[dateStr]?.[editingPartTime.staffId]) {
                delete newSchedule[dateStr][editingPartTime.staffId];
                setSchedule(newSchedule);
                firestoreStorage.saveSchedule(newSchedule);
                removeManualShiftMarker(dateStr, editingPartTime.staffId);
              }
              const newTimeRangeSchedule = { ...timeRangeSchedule };
              if (newTimeRangeSchedule[dateStr]?.[editingPartTime.staffId]) {
                delete newTimeRangeSchedule[dateStr][editingPartTime.staffId];
                setTimeRangeSchedule(newTimeRangeSchedule);
                firestoreStorage.saveTimeRangeSchedule(newTimeRangeSchedule);
              }
              setEditingPartTime(null);
            }}
            onClose={() => setEditingPartTime(null)}
          />
        );
      })()}

      {/* HourlyStaffChart - time-based workload visualization */}
      {hourlyChartDay && (
        <HourlyStaffChart
          day={hourlyChartDay}
          year={year}
          month={month}
          staff={staff}
          schedule={schedule}
          timeRangeSchedule={timeRangeSchedule}
          patterns={patterns}
          onClose={() => setHourlyChartDay(null)}
        />
      )}
    </div>
  );
}

export default App;
