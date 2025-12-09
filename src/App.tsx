import { useState, useEffect } from 'react';
import type { Staff, ShiftSchedule, Settings, Holiday, ShiftPatternDefinition, ShiftPatternId } from './types';
import { ShiftGenerator } from './lib/generator';
import { getDaysInMonth, getFormattedDate } from './lib/utils';
import { exportToExcel } from './lib/excelExport';
import { ChevronLeft, ChevronRight, Settings as SettingsIcon, Users, Calendar, RefreshCw, Download, RotateCcw, ChevronDown, Menu, LogOut, DatabaseBackup } from 'lucide-react';
import { StaffList } from './components/StaffList';
import { SettingsModal } from './components/SettingsModal';
import { HolidayModal } from './components/HolidayModal';
import { ShiftEditModal } from './components/ShiftEditModal';
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

  const [currentDate, setCurrentDate] = useState(new Date());
  const [staff, setStaff] = useState<Staff[]>([]);
  const [schedule, setSchedule] = useState<ShiftSchedule>({});
  const [settings, setSettings] = useState<Settings>(firestoreStorage.getDefaultSettings());
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [patterns, setPatterns] = useState<ShiftPatternDefinition[]>([]);

  // Modal States
  const [showStaffList, setShowStaffList] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showHolidayModal, setShowHolidayModal] = useState(false);
  const [editingCell, setEditingCell] = useState<{ staffId: number; day: number } | null>(null);

  // UX States
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  // Toast notifications
  const toast = useToast();

  // Listen for auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChange((authUser) => {
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
    const unsubscribe = firestoreStorage.subscribe((data: OrganizationData | null) => {
      if (data) {
        setStaff(data.staff || []);
        setSchedule(data.schedule || {});
        setSettings(data.settings || firestoreStorage.getDefaultSettings());
        setHolidays(data.holidays || []);
        setPatterns(data.patterns || firestoreStorage.getDefaultPatterns());
      } else {
        // Initialize with defaults if no data exists
        setPatterns(firestoreStorage.getDefaultPatterns());
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

  const handleGenerate = async () => {
    setIsGenerating(true);
    // Small delay to show loading animation (Doherty threshold - 0.4s)
    await new Promise(resolve => setTimeout(resolve, 400));

    const generator = new ShiftGenerator(staff, holidays, year, month, settings, schedule);
    const newSchedule = generator.generate();
    setSchedule(newSchedule);
    firestoreStorage.saveSchedule(newSchedule);
    setIsGenerating(false);
  };

  const handleReset = () => {
    if (!window.confirm('自動生成されたシフトをリセットしますか？\n（手動入力されたパートシフト、有給は保持されます）')) {
      return;
    }

    const newSchedule = { ...schedule };

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = getFormattedDate(year, month, d);
      if (!newSchedule[dateStr]) continue;

      staff.forEach(s => {
        const currentShift = newSchedule[dateStr][s.id];
        if (!currentShift) return;

        if (s.shiftType === 'part_time') {
          // Keep ALL part-time shifts (assume manual)
          return;
        } else if (s.shiftType === 'regular' || s.position === '主任') {
          // Keep Paid Leave ONLY (Compensatory Off '振' is now auto-generated, so clear it)
          if (currentShift === '有') {
            return;
          }
          // Clear others
          newSchedule[dateStr][s.id] = '';
        } else {
          // Clear Cooking/Director (will be regenerated or are fixed)
          newSchedule[dateStr][s.id] = '';
        }
      });
    }

    setSchedule(newSchedule);
    firestoreStorage.saveSchedule(newSchedule);
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
    setPatterns(newPatterns);
    firestoreStorage.savePatterns(newPatterns);
  };

  const handleCellClick = (staffId: number, day: number) => {
    setEditingCell({ staffId, day });
  };

  const handleShiftUpdate = (shiftId: ShiftPatternId) => {
    if (!editingCell) return;
    const { staffId, day } = editingCell;
    const dateStr = getFormattedDate(year, month, day);

    // Save previous state for undo
    const prevSchedule = JSON.parse(JSON.stringify(schedule));
    const prevShift = schedule[dateStr]?.[staffId] || '休';

    // Create new schedule
    const newSchedule = { ...schedule };
    if (!newSchedule[dateStr]) newSchedule[dateStr] = {};
    newSchedule[dateStr][staffId] = shiftId;

    // Check for constraint violations
    const ctx = createConstraintContext(newSchedule, staff, holidays, settings, year, month);
    const violations = checkConstraints(ctx, day, staffId, shiftId);
    const hardViolations = violations.filter(v => v.type === 'hard');

    // Apply changes
    setSchedule(newSchedule);
    firestoreStorage.saveSchedule(newSchedule);
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

    // Create new schedule
    const newSchedule = { ...schedule };
    if (!newSchedule[dateStr]) newSchedule[dateStr] = {};
    newSchedule[dateStr][targetStaffId] = shiftId;

    // Check for constraint violations
    const ctx = createConstraintContext(newSchedule, staff, holidays, settings, year, month);
    const violations = checkConstraints(ctx, day, targetStaffId, shiftId);
    const hardViolations = violations.filter(v => v.type === 'hard');

    // Apply changes
    setSchedule(newSchedule);
    firestoreStorage.saveSchedule(newSchedule);
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
        }
      );
    } else {
      toast.success(
        `${staffMember?.name} → ${shiftId}`,
        `${month}/${day} に配置しました`
      );
    }
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
      'J': '★', // 星
      '振': '○', // 白丸
      '有': '◇', // 白菱形
      '休': '－', // 横線
    };
    return markers[shiftId] || '';
  };

  // Calculate daily staff counts
  const dailyCounts = days.map(day => {
    const dateStr = getFormattedDate(year, month, day);
    let count = 0;
    staff.forEach(s => {
      if (s.shiftType === 'cooking') return;
      const shift = schedule[dateStr]?.[s.id];
      if (shift && shift !== '休' && shift !== '振' && shift !== '有') {
        count++;
      }
    });
    return count;
  });

  // Calculate daily qualified staff counts per shift pattern
  const qualifiedCounts = days.map(day => {
    const dateStr = getFormattedDate(year, month, day);
    const counts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, E: 0, J: 0 };

    staff.forEach(s => {
      if (!s.hasQualification) return;
      const shift = schedule[dateStr]?.[s.id];
      if (shift && ['A', 'B', 'C', 'D', 'E', 'J'].includes(shift)) {
        counts[shift]++;
      }
    });
    return counts;
  });

  const handleDownloadExcel = () => {
    exportToExcel({
      year,
      month,
      staff,
      schedule,
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
    return <LoginScreen onLogin={() => { }} isLoading={false} />;
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
                days={days}
                year={year}
                month={month}
                holidays={holidays}
                minCount={8}
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
                          setSettings(data.settings);
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
                      <th key={day} className={`border-b border-r border-[#D1D5DB] p-1 md:p-2 min-w-[32px] md:min-w-[45px] text-center ${textColor} ${bgColor}`}>
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
                          {s.shiftType === 'cooking' && <span className="text-[10px] md:text-xs bg-[#FFE66D] text-[#7C5800] px-1.5 md:px-2 py-0.5 rounded-full font-medium ml-1">調</span>}
                        </div>
                      </td>
                      {days.map(day => {
                        const dateStr = getFormattedDate(year, month, day);
                        const shiftId = schedule[dateStr]?.[s.id] || '';
                        return (
                          <td
                            key={day}
                            className="px-0.5 md:px-1 py-0.5 md:py-1 text-center border-r border-[#E5E7EB] relative group cursor-pointer hover:bg-[#F3F4F6] transition-all duration-150"
                            onClick={() => handleCellClick(s.id, day)}
                          >
                            {shiftId === '休' ? (
                              <div className="w-6 h-6 md:w-8 md:h-8 mx-auto flex items-center justify-center text-[#9CA3AF] font-medium text-sm opacity-60">
                                －
                              </div>
                            ) : shiftId ? (
                              <div className={`
                                  w-7 h-6 md:w-9 md:h-8 mx-auto flex items-center justify-center gap-0.5 rounded-md text-xs md:text-sm shadow-sm transition-all duration-150 hover:scale-110 hover:shadow-md active:scale-95
                                  ${getShiftColor(shiftId)}
                                `}>
                                <span className="text-[8px] md:text-[10px] opacity-80">{getShiftMarker(shiftId)}</span>
                                <span className="font-medium">{shiftId}</span>
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

                    // Low count logic: < 8 for weekdays, < 3 for Saturdays (if configured)
                    const isLow = !isSun && !isHol && ((!isSat && count < 8) || (isSat && count < settings.saturdayStaffCount));

                    return (
                      <td key={day} className={`px-1 py-2 text-center text-sm border-r ${isLow ? 'bg-red-200 text-red-800 font-bold' : 'text-gray-700'}`}>
                        {count > 0 ? count : '-'}
                      </td>
                    );
                  })}

                </tr>
                {/* Qualified Staff Counts */}
                {['A', 'B', 'C', 'D', 'E', 'J'].map(patternId => {
                  const pattern = patterns.find(p => p.id === patternId);
                  const minCount = pattern?.minCount || 0;

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
                          <td key={idx} className={`px-1 py-1 text-center text-xs border-r ${cellClass}`}>
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
        />
      </main>

      {showStaffList && (
        <StaffList
          staff={staff}
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
          onSelect={handleShiftUpdate}
          onSelectStaff={handleSelectStaff}
          onClose={() => setEditingCell(null)}
        />
      )}
    </div>
  );
}

export default App;
