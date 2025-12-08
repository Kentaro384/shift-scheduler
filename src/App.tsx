import { useState, useEffect } from 'react';
import { storage } from './lib/storage';
import type { Staff, ShiftSchedule, Settings, Holiday, ShiftPatternDefinition, ShiftPatternId } from './types';
import { ShiftGenerator } from './lib/generator';
import { getDaysInMonth, getFormattedDate } from './lib/utils';
import { exportToExcel } from './lib/excelExport';
import { ChevronLeft, ChevronRight, Settings as SettingsIcon, Users, Calendar, RefreshCw, Download, RotateCcw, ChevronDown, Menu } from 'lucide-react';
import { StaffList } from './components/StaffList';
import { SettingsModal } from './components/SettingsModal';
import { HolidayModal } from './components/HolidayModal';
import { ShiftEditModal } from './components/ShiftEditModal';

function App() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [staff, setStaff] = useState<Staff[]>([]);
  const [schedule, setSchedule] = useState<ShiftSchedule>({});
  const [settings, setSettings] = useState<Settings>(storage.getSettings());
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

  useEffect(() => {
    setStaff(storage.getStaff());
    setSchedule(storage.getSchedule());
    setSettings(storage.getSettings());
    setHolidays(storage.getHolidays());
    setPatterns(storage.getPatterns());
  }, []);

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
    storage.saveSchedule(newSchedule);
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
    storage.saveSchedule(newSchedule);
  };

  const handleUpdateStaff = (newStaff: Staff[]) => {
    setStaff(newStaff);
    storage.saveStaff(newStaff);
  };

  const handleUpdateSettings = (newSettings: Settings) => {
    setSettings(newSettings);
    storage.saveSettings(newSettings);
  };

  const handleUpdateHolidays = (newHolidays: Holiday[]) => {
    setHolidays(newHolidays);
    storage.saveHolidays(newHolidays);
  };

  const handleUpdatePatterns = (newPatterns: ShiftPatternDefinition[]) => {
    setPatterns(newPatterns);
    storage.savePatterns(newPatterns);
  };

  const handleCellClick = (staffId: number, day: number) => {
    setEditingCell({ staffId, day });
  };

  const handleShiftUpdate = (shiftId: ShiftPatternId) => {
    if (!editingCell) return;
    const { staffId, day } = editingCell;
    const dateStr = getFormattedDate(year, month, day);

    const newSchedule = { ...schedule };
    if (!newSchedule[dateStr]) newSchedule[dateStr] = {};
    newSchedule[dateStr][staffId] = shiftId;

    setSchedule(newSchedule);
    storage.saveSchedule(newSchedule);
    setEditingCell(null);
  };

  const isHoliday = (day: number) => {
    const dateStr = getFormattedDate(year, month, day);
    return holidays.some(h => h.date === dateStr);
  };

  const getShiftColor = (shiftId: string) => {
    // Colorful Pop Theme
    if (shiftId === '振') return 'bg-[#4ECDC4] text-[#0D6B66] border-[#4ECDC4] font-medium'; // Mint Green
    if (shiftId === '有') return 'bg-[#F9A8D4] text-[#9D174D] border-[#F9A8D4] font-medium'; // Soft Pink
    if (shiftId === '休') return 'bg-gray-100 text-gray-400 border-gray-200 font-medium'; // Light Gray

    const pattern = patterns.find(p => p.id === shiftId);
    if (pattern) {
      if (shiftId === 'A') return 'bg-[#FFE66D] text-[#7C5800] border-[#FFE66D] font-bold'; // Sunshine Yellow
      if (shiftId === 'B') return 'bg-[#45B7D1] text-white border-[#45B7D1] font-bold'; // Sky Blue
      if (shiftId === 'C') return 'bg-[#38A3C0] text-white border-[#38A3C0] font-bold'; // Deep Sky
      if (shiftId === 'D') return 'bg-[#A78BFA] text-white border-[#A78BFA] font-bold'; // Lavender
      if (shiftId === 'E') return 'bg-[#8B5CF6] text-white border-[#8B5CF6] font-bold'; // Deep Lavender
      if (shiftId === 'J') return 'bg-[#FF6B6B] text-white border-[#FF6B6B] font-bold'; // Coral Pink
      return 'bg-blue-50 text-blue-700 border-blue-100';
    }

    return 'bg-gray-50 text-gray-300'; // Empty/Unknown
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

  // Summary columns to show
  const summaryColumns = ['A', 'B', 'C', 'D', 'E', 'J', '休', '振', '有'];

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 via-white to-yellow-50 flex flex-col font-sans text-gray-800">
      <header className="header-gradient text-white shadow-lg p-2 landscape:p-1.5 md:p-4 sticky top-0 z-30">
        <div className="max-w-[1920px] mx-auto">
          {/* Mobile portrait: 2-row, Mobile landscape & Desktop: 1-row */}
          <div className="flex flex-col landscape:flex-row landscape:justify-between landscape:items-center md:flex-row md:justify-between md:items-center gap-2 landscape:gap-0 md:gap-0">
            {/* Row 1: Logo + Month Navigation */}
            <div className="flex items-center justify-between landscape:justify-start md:justify-start landscape:space-x-4 md:space-x-6">
              <h1 className="text-lg landscape:text-base md:text-2xl font-bold tracking-tight flex items-center gap-1.5 landscape:gap-1 md:gap-2 drop-shadow-md">
                <span className="text-xl landscape:text-lg md:text-4xl animate-pulse-soft">🌟</span>
                <span className="bg-white/20 px-2 landscape:px-1.5 md:px-3 py-0.5 landscape:py-0.5 md:py-1 rounded-full text-xs landscape:text-xs md:text-base">保育園シフト</span>
              </h1>
              <div className="flex items-center bg-white/25 backdrop-blur-sm rounded-full p-0.5 landscape:p-0.5 md:p-1.5 shadow-inner">
                <button onClick={() => changeMonth(-1)} className="p-1 landscape:p-1 md:p-2 hover:bg-white/30 rounded-full transition-all duration-300 hover:scale-110">
                  <ChevronLeft size={18} className="landscape:w-4 landscape:h-4 md:w-6 md:h-6" />
                </button>
                <span className="text-sm landscape:text-xs md:text-xl font-bold mx-1.5 landscape:mx-1 md:mx-4 min-w-[80px] landscape:min-w-[70px] md:min-w-[140px] text-center">
                  {year}年 {month}月
                </span>
                <button onClick={() => changeMonth(1)} className="p-1 landscape:p-1 md:p-2 hover:bg-white/30 rounded-full transition-all duration-300 hover:scale-110">
                  <ChevronRight size={18} className="landscape:w-4 landscape:h-4 md:w-6 md:h-6" />
                </button>
              </div>
            </div>

            {/* Row 2: Action Buttons */}
            <div className="flex items-center justify-end space-x-1.5 landscape:space-x-1 md:space-x-3">
              {/* Settings Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setShowSettingsMenu(!showSettingsMenu)}
                  className="flex items-center space-x-1 md:space-x-2 px-2 landscape:px-2 md:px-5 py-1.5 landscape:py-1 md:py-2.5 bg-white/90 backdrop-blur-sm text-[#FF6B6B] rounded-full hover:bg-white hover:scale-105 transition-all duration-300 shadow-md font-semibold text-xs landscape:text-xs md:text-base"
                >
                  <Menu size={16} className="md:w-[18px] md:h-[18px]" />
                  <span className="hidden sm:inline">設定</span>
                  <ChevronDown size={14} className={`hidden sm:block transition-transform duration-300 ${showSettingsMenu ? 'rotate-180' : ''}`} />
                </button>

                {/* Dropdown Menu */}
                {showSettingsMenu && (
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden animate-fade-in-up z-50">
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
                  </div>
                )}
              </div>

              {/* Main Actions */}
              <button
                onClick={handleReset}
                className="flex items-center space-x-1 md:space-x-2 px-2 landscape:px-2 md:px-5 py-1.5 landscape:py-1 md:py-2.5 bg-white text-[#FF6B6B] border-2 border-[#FF6B6B] rounded-full hover:bg-[#FFF5F5] hover:scale-105 transition-all duration-300 font-bold active:scale-95 text-xs landscape:text-xs md:text-base"
              >
                <RotateCcw size={16} className="md:w-[18px] md:h-[18px]" />
                <span className="hidden sm:inline">リセット</span>
              </button>
              <button
                onClick={handleGenerate}
                disabled={isGenerating}
                className={`btn-primary text-xs landscape:text-xs md:text-base px-3 landscape:px-2 md:px-6 py-1.5 landscape:py-1 md:py-2.5 ${isGenerating ? 'opacity-80 cursor-wait' : 'active:scale-95'}`}
              >
                <RefreshCw size={16} className={`md:w-[18px] md:h-[18px] ${isGenerating ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">{isGenerating ? '生成中...' : '自動生成'}</span>
                <span className="sm:hidden">{isGenerating ? '...' : '生成'}</span>
              </button>
              <button
                onClick={handleDownloadExcel}
                className="flex items-center space-x-1 px-2 landscape:px-2 md:px-5 py-1.5 landscape:py-1 md:py-2.5 bg-white/90 backdrop-blur-sm text-[#45B7D1] rounded-full hover:bg-white hover:scale-105 transition-all duration-300 shadow-md font-semibold active:scale-95 text-xs landscape:text-xs md:text-base"
              >
                <Download size={16} className="md:w-[18px] md:h-[18px]" />
                <span className="hidden sm:inline">Excel</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-auto p-1.5 landscape:p-1 md:p-4">
        <div className="max-w-[1920px] mx-auto bg-white rounded-xl landscape:rounded-lg md:rounded-3xl shadow-xl overflow-hidden border border-pink-100">
          <div className="overflow-x-auto max-h-[calc(100vh-160px)] landscape:max-h-[calc(100vh-60px)] md:max-h-[calc(100vh-140px)]">
            <table className="w-full border-collapse text-xs md:text-sm relative">
              <thead className="bg-gradient-to-r from-pink-50 via-white to-yellow-50 text-gray-700 sticky top-0 z-20 shadow-sm">
                <tr>
                  <th className="border-b border-r border-pink-100 p-2 md:p-3 min-w-[100px] md:min-w-[180px] sticky left-0 z-20 bg-gradient-to-r from-pink-50 to-white font-bold text-sm md:text-base">職員</th>
                  {days.map(day => {
                    const date = new Date(year, month - 1, day);
                    const dayOfWeek = date.getDay();
                    const isSat = dayOfWeek === 6;
                    const isSun = dayOfWeek === 0;
                    const isHol = isHoliday(day);

                    let textColor = 'text-gray-700';
                    if (isSun || isHol) textColor = 'text-[#FF6B6B] font-bold';
                    else if (isSat) textColor = 'text-[#45B7D1] font-bold';

                    return (
                      <th key={day} className={`border-b border-r border-pink-100 p-1 md:p-2 min-w-[32px] md:min-w-[45px] text-center ${textColor}`}>
                        <div className="font-bold text-sm md:text-lg">{day}</div>
                        <div className="text-[10px] md:text-xs opacity-80">({['日', '月', '火', '水', '木', '金', '土'][dayOfWeek]})</div>
                      </th>
                    );
                  })}
                  <th className="border-b border-l border-pink-100 p-2 min-w-[60px] bg-gradient-to-r from-white to-yellow-50 font-bold">出勤</th>
                  {summaryColumns.map(pid => (
                    <th key={pid} className="border-b border-l border-pink-100 p-2 min-w-[40px] bg-gradient-to-r from-white to-yellow-50 font-bold text-gray-700">{pid}</th>
                  ))}
                  <th className="border-b border-l border-pink-100 p-2 min-w-[40px] bg-gradient-to-r from-white to-yellow-50 font-bold">残</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {staff.map(s => {
                  // Calculate summaries for this staff
                  const counts: Record<string, number> = {};
                  summaryColumns.forEach(pid => counts[pid] = 0);

                  days.forEach(day => {
                    const dateStr = getFormattedDate(year, month, day);
                    const shift = schedule[dateStr]?.[s.id];
                    if (shift && summaryColumns.includes(shift)) {
                      counts[shift]++;
                    }
                  });

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
                            className="px-0.5 md:px-1 py-0.5 md:py-1 text-center border-r border-pink-50 relative group cursor-pointer hover:bg-pink-50/50 transition-all duration-200"
                            onClick={() => handleCellClick(s.id, day)}
                          >
                            {shiftId === '休' ? (
                              <div className="w-6 h-6 md:w-8 md:h-8 mx-auto flex items-center justify-center text-gray-300 font-bold text-base md:text-lg">
                                -
                              </div>
                            ) : shiftId ? (
                              <div className={`
                                  w-6 h-6 md:w-8 md:h-8 mx-auto flex items-center justify-center rounded-lg md:rounded-xl text-xs md:text-sm border shadow-sm transition-all duration-200 hover:scale-125 hover:shadow-lg active:scale-95
                                  ${getShiftColor(shiftId)}
                                `}>
                                {shiftId}
                              </div>
                            ) : (
                              <div className="w-6 h-6 md:w-8 md:h-8 mx-auto rounded-lg md:rounded-xl hover:bg-pink-100/50 transition-colors"></div>
                            )}
                          </td>
                        );
                      })}
                      {/* Summary Cells */}
                      <td className="px-2 py-2 text-center text-sm font-medium text-gray-700 border-r border-gray-100">
                        {/* Total Attendance (excluding holidays) */}
                        {days.filter(d => {
                          const shift = schedule[getFormattedDate(year, month, d)]?.[s.id];
                          return shift && !['休', '振', '有'].includes(shift);
                        }).length}
                      </td>
                      {summaryColumns.map(pid => (
                        <td key={pid} className="px-2 py-2 text-center text-sm font-medium text-gray-700 border-r border-gray-100">
                          {counts[pid] > 0 ? counts[pid] : '-'}
                        </td>
                      ))}
                      <td className="px-2 py-2 text-center text-sm font-medium text-gray-700 border-r border-gray-100">
                        {/* Remaining (Placeholder) */}
                        -
                      </td>
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
                  <td colSpan={summaryColumns.length + 2} className="bg-gray-50 border-r"></td>
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
                      <td colSpan={summaryColumns.length + 2} className="bg-white border-r"></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
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
          staffName={staff.find(s => s.id === editingCell.staffId)?.name || ''}
          date={`${month}月${editingCell.day}日`}
          currentShift={schedule[getFormattedDate(year, month, editingCell.day)]?.[editingCell.staffId] || ''}
          onSelect={handleShiftUpdate}
          onClose={() => setEditingCell(null)}
        />
      )}
    </div>
  );
}

export default App;
