import React, { useState, useMemo } from 'react';
import { X, Clock, Star } from 'lucide-react';
import type { TimeRange, ShiftPatternId } from '../types';
import { SHIFT_PATTERNS } from '../types';

interface TimeRangeModalProps {
    staffId: number;
    staffName: string;
    day: number;
    year: number;
    month: number;
    currentTimeRange: TimeRange | null;
    currentShift: ShiftPatternId;
    defaultTimeRange?: TimeRange;  // Staff's default work hours (includes countAsShifts)
    onSaveTimeRange: (timeRange: TimeRange) => void;
    onSaveShift: (shift: ShiftPatternId) => void;
    onSaveAsDefault: (timeRange: TimeRange) => void;
    onClear: () => void;
    onClose: () => void;
}

// Generate time options in 15-minute intervals (7:00 - 19:45)
function generateTimeOptions(): string[] {
    const options: string[] = [];
    for (let hour = 7; hour <= 19; hour++) {
        for (let minute = 0; minute < 60; minute += 15) {
            const h = hour.toString().padStart(2, '0');
            const m = minute.toString().padStart(2, '0');
            options.push(`${h}:${m}`);
        }
    }
    return options;
}

const TIME_OPTIONS = generateTimeOptions();

// Get day of week name
function getDayName(year: number, month: number, day: number): string {
    const date = new Date(year, month - 1, day);
    const names = ['日', '月', '火', '水', '木', '金', '土'];
    return names[date.getDay()];
}

// Parse time to minutes
function parseTime(t: string): number {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + (m || 0);
}

// Check if time range overlaps with shift pattern (for auto-suggestion)
function doesOverlap(start: string, end: string, shiftPatternId: string): boolean {
    const pattern = SHIFT_PATTERNS.find(p => p.id === shiftPatternId);
    if (!pattern) return false;

    const [shiftStart, shiftEnd] = pattern.timeRange.split('-');
    const partStart = parseTime(start);
    const partEnd = parseTime(end);
    const shiftStartMin = parseTime(shiftStart);
    const shiftEndMin = parseTime(shiftEnd);

    const overlapStart = Math.max(partStart, shiftStartMin);
    const overlapEnd = Math.min(partEnd, shiftEndMin);
    const overlap = overlapEnd - overlapStart;

    return overlap >= 120; // At least 2 hours overlap
}

export const TimeRangeModal: React.FC<TimeRangeModalProps> = ({
    staffName,
    day,
    year,
    month,
    currentTimeRange,
    currentShift,
    defaultTimeRange,
    onSaveTimeRange,
    onSaveShift,
    onSaveAsDefault,
    onClear,
    onClose
}) => {
    // Determine initial values: current > default > fallback
    const initialStart = currentTimeRange?.start || defaultTimeRange?.start || '09:00';
    const initialEnd = currentTimeRange?.end || defaultTimeRange?.end || '17:00';
    const initialShifts = currentTimeRange?.countAsShifts || defaultTimeRange?.countAsShifts || [];

    const [mode, setMode] = useState<'time' | 'holiday'>(
        currentTimeRange ? 'time' : (currentShift === '振' || currentShift === '有' || currentShift === '休') ? 'holiday' : 'time'
    );
    const [startTime, setStartTime] = useState(initialStart);
    const [endTime, setEndTime] = useState(initialEnd);
    const [selectedShifts, setSelectedShifts] = useState<ShiftPatternId[]>(initialShifts);
    const [selectedHoliday, setSelectedHoliday] = useState<ShiftPatternId>(
        (currentShift === '振' || currentShift === '有' || currentShift === '休') ? currentShift : '休'
    );

    const dateStr = `${month}/${day}(${getDayName(year, month, day)})`;

    // Auto-suggest overlapping shifts when time changes (only if no selection yet)
    const suggestedShifts = useMemo(() => {
        return (['A', 'B', 'C', 'D', 'E', 'J'] as ShiftPatternId[]).filter(id =>
            doesOverlap(startTime, endTime, id)
        );
    }, [startTime, endTime]);

    // Check if current selection matches the default
    const isDefaultTime = defaultTimeRange &&
        startTime === defaultTimeRange.start &&
        endTime === defaultTimeRange.end &&
        JSON.stringify(selectedShifts.sort()) === JSON.stringify((defaultTimeRange.countAsShifts || []).sort());

    const handleSave = () => {
        if (mode === 'time') {
            onSaveTimeRange({
                start: startTime,
                end: endTime,
                countAsShifts: selectedShifts.length > 0 ? selectedShifts : undefined
            });
        } else {
            onSaveShift(selectedHoliday);
        }
    };

    const handleSaveAsDefault = () => {
        onSaveAsDefault({
            start: startTime,
            end: endTime,
            countAsShifts: selectedShifts.length > 0 ? selectedShifts : undefined
        });
    };

    const toggleShift = (shiftId: ShiftPatternId) => {
        setSelectedShifts(prev =>
            prev.includes(shiftId)
                ? prev.filter(s => s !== shiftId)
                : [...prev, shiftId]
        );
    };

    const holidayOptions = [
        { id: '振' as ShiftPatternId, name: '振休', color: 'bg-[#F3F4F6] border-[#10B981] text-[#10B981]' },
        { id: '有' as ShiftPatternId, name: '有給', color: 'bg-[#F3F4F6] border-[#F472B6] text-[#F472B6]' },
        { id: '休' as ShiftPatternId, name: '公休', color: 'bg-gray-100 border-gray-300 text-gray-500' },
    ];

    // Shift pattern colors for selection
    const getShiftButtonClass = (shiftId: ShiftPatternId) => {
        const isSelected = selectedShifts.includes(shiftId);
        const isSuggested = suggestedShifts.includes(shiftId);

        if (isSelected) {
            // Selected - coral colors
            return 'bg-[#FF6B6B] text-white border-[#FF6B6B] ring-2 ring-[#FF6B6B] ring-offset-1';
        } else if (isSuggested) {
            // Suggested but not selected - subtle highlight
            return 'bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100';
        } else {
            // Not suggested
            return 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100';
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in-up p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden">
                {/* Header */}
                <div className="header-gradient p-4 flex justify-between items-center">
                    <h2 className="text-lg font-bold text-white drop-shadow-md flex items-center gap-2">
                        <Clock size={20} />
                        {staffName}
                        <span className="text-sm font-normal opacity-90">{dateStr}</span>
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-2 bg-white/20 hover:bg-white/40 rounded-full transition-all"
                    >
                        <X size={18} className="text-white" />
                    </button>
                </div>

                {/* Mode Tabs */}
                <div className="flex border-b border-gray-200">
                    <button
                        onClick={() => setMode('time')}
                        className={`flex-1 py-3 text-sm font-medium transition-colors ${mode === 'time'
                            ? 'text-[#FF6B6B] border-b-2 border-[#FF6B6B]'
                            : 'text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        <Clock size={16} className="inline mr-1" />
                        時間指定
                    </button>
                    <button
                        onClick={() => setMode('holiday')}
                        className={`flex-1 py-3 text-sm font-medium transition-colors ${mode === 'holiday'
                            ? 'text-[#FF6B6B] border-b-2 border-[#FF6B6B]'
                            : 'text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        休暇
                    </button>
                </div>

                {/* Content */}
                <div className="p-4">
                    {mode === 'time' ? (
                        <div className="space-y-3">
                            {/* Default time indicator */}
                            {defaultTimeRange && (
                                <div className="flex items-center justify-center gap-2 text-xs text-amber-600 bg-amber-50 rounded-lg py-2 px-3">
                                    <Star size={14} className="fill-amber-400 text-amber-400" />
                                    <span>デフォルト: {defaultTimeRange.start} - {defaultTimeRange.end}
                                        {defaultTimeRange.countAsShifts?.length ? ` [${defaultTimeRange.countAsShifts.join(',')}]` : ''}
                                    </span>
                                </div>
                            )}

                            <p className="text-xs text-gray-500">
                                勤務時間を15分単位で指定してください
                            </p>

                            {/* Time Selection */}
                            <div className="flex items-center gap-3 justify-center">
                                <div className="flex flex-col items-center">
                                    <label className="text-xs text-gray-500 mb-1">開始</label>
                                    <select
                                        value={startTime}
                                        onChange={(e) => setStartTime(e.target.value)}
                                        className="px-4 py-2 border border-gray-300 rounded-xl text-lg font-medium focus:ring-2 focus:ring-[#FF6B6B] focus:border-transparent"
                                    >
                                        {TIME_OPTIONS.map(t => (
                                            <option key={t} value={t}>{t}</option>
                                        ))}
                                    </select>
                                </div>

                                <span className="text-2xl text-gray-400 mt-5">→</span>

                                <div className="flex flex-col items-center">
                                    <label className="text-xs text-gray-500 mb-1">終了</label>
                                    <select
                                        value={endTime}
                                        onChange={(e) => setEndTime(e.target.value)}
                                        className="px-4 py-2 border border-gray-300 rounded-xl text-lg font-medium focus:ring-2 focus:ring-[#FF6B6B] focus:border-transparent"
                                    >
                                        {TIME_OPTIONS.filter(t => t > startTime).map(t => (
                                            <option key={t} value={t}>{t}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Shift Assignment Selection */}
                            <div className="pt-2">
                                <p className="text-xs text-gray-500 mb-2 text-center">
                                    シフト割当（集計にカウント）
                                </p>
                                <div className="flex justify-center gap-2">
                                    {(['A', 'B', 'C', 'D', 'E', 'J'] as ShiftPatternId[]).map(shiftId => (
                                        <button
                                            key={shiftId}
                                            onClick={() => toggleShift(shiftId)}
                                            className={`w-9 h-9 rounded-lg border-2 font-bold text-sm transition-all ${getShiftButtonClass(shiftId)}`}
                                        >
                                            {shiftId}
                                        </button>
                                    ))}
                                </div>
                                {suggestedShifts.length > 0 && selectedShifts.length === 0 && (
                                    <p className="text-[10px] text-amber-500 text-center mt-1">
                                        推奨: {suggestedShifts.join(', ')}（時間帯が重複）
                                    </p>
                                )}
                            </div>

                            {/* Preview */}
                            <div className="text-center py-3 bg-gray-50 rounded-xl">
                                <span className="text-lg font-bold text-gray-800">
                                    {startTime} - {endTime}
                                </span>
                                {selectedShifts.length > 0 && (
                                    <span className="ml-2 text-sm font-bold text-[#FF6B6B]">
                                        [{selectedShifts.sort().join(',')}]
                                    </span>
                                )}
                                {isDefaultTime && (
                                    <span className="ml-2 text-xs text-amber-600">
                                        <Star size={12} className="inline fill-amber-400 text-amber-400" /> デフォルト
                                    </span>
                                )}
                            </div>

                            {/* Save as default button */}
                            {!isDefaultTime && (
                                <button
                                    onClick={handleSaveAsDefault}
                                    className="w-full py-2 text-xs text-amber-600 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition-colors flex items-center justify-center gap-1"
                                >
                                    <Star size={14} />
                                    この設定をデフォルトに保存
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <p className="text-xs text-gray-500">
                                休暇の種類を選択してください
                            </p>

                            <div className="grid grid-cols-3 gap-3">
                                {holidayOptions.map(opt => (
                                    <button
                                        key={opt.id}
                                        onClick={() => setSelectedHoliday(opt.id)}
                                        className={`p-4 rounded-xl border-2 transition-all ${selectedHoliday === opt.id
                                            ? `${opt.color} border-current ring-2 ring-offset-2`
                                            : 'bg-white border-gray-200 hover:border-gray-300'
                                            }`}
                                    >
                                        <span className="text-xl font-bold">{opt.id}</span>
                                        <p className="text-xs mt-1">{opt.name}</p>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 bg-gray-50 border-t border-gray-100 flex gap-2">
                    <button
                        onClick={onClear}
                        className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
                    >
                        クリア
                    </button>
                    <button
                        onClick={onClose}
                        className="flex-1 px-4 py-2 text-sm border border-gray-300 rounded-xl hover:bg-gray-100 transition-colors"
                    >
                        キャンセル
                    </button>
                    <button
                        onClick={handleSave}
                        className="flex-1 px-4 py-2 text-sm bg-[#FF6B6B] text-white rounded-xl hover:bg-[#FF5252] transition-colors font-medium"
                    >
                        保存
                    </button>
                </div>
            </div>
        </div>
    );
};
