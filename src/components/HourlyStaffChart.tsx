import React, { useMemo } from 'react';
import { X, Clock } from 'lucide-react';
import type { Staff, ShiftSchedule, TimeRangeSchedule, ShiftPatternDefinition } from '../types';
import { getFormattedDate } from '../lib/utils';

interface HourlyStaffChartProps {
    day: number;
    year: number;
    month: number;
    staff: Staff[];
    schedule: ShiftSchedule;
    timeRangeSchedule: TimeRangeSchedule;
    patterns: ShiftPatternDefinition[];
    onClose: () => void;
}

// Get day of week name
function getDayName(year: number, month: number, day: number): string {
    const date = new Date(year, month - 1, day);
    const names = ['日', '月', '火', '水', '木', '金', '土'];
    return names[date.getDay()];
}

// Parse time string to minutes from midnight
function parseTimeToMinutes(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + (m || 0);
}

// Hours to display (7:00 - 19:00)
const START_HOUR = 7;
const END_HOUR = 19;
const TOTAL_MINUTES = (END_HOUR - START_HOUR) * 60;

interface StaffWorkTime {
    staffId: number;
    name: string;
    isQualified: boolean;
    startMinutes: number;
    endMinutes: number;
    label: string; // e.g., "A" or "9:00-14:00"
    originalIndex: number; // Keep original order from staff array
}

export const HourlyStaffChart: React.FC<HourlyStaffChartProps> = ({
    day,
    year,
    month,
    staff,
    schedule,
    timeRangeSchedule,
    patterns,
    onClose
}) => {
    const dateStr = getFormattedDate(year, month, day);
    const dateDisplay = `${month}/${day}(${getDayName(year, month, day)})`;

    // Calculate staff work times for Gantt chart
    const staffWorkTimes = useMemo(() => {
        const result: StaffWorkTime[] = [];

        staff.forEach((s, index) => {
            if (s.shiftType === 'cooking' || s.shiftType === 'no_shift') return;

            // Part-time workers with time range
            if (s.shiftType === 'part_time') {
                const timeRange = timeRangeSchedule[dateStr]?.[s.id];
                if (timeRange) {
                    result.push({
                        staffId: s.id,
                        name: s.name,
                        isQualified: s.hasQualification,
                        startMinutes: parseTimeToMinutes(timeRange.start),
                        endMinutes: parseTimeToMinutes(timeRange.end),
                        label: `${timeRange.start}-${timeRange.end}`,
                        originalIndex: index
                    });
                }
                return;
            }

            // Regular staff with shift pattern
            const shiftId = schedule[dateStr]?.[s.id];
            if (!shiftId || shiftId === '休' || shiftId === '振' || shiftId === '有') return;

            const pattern = patterns.find(p => p.id === shiftId);
            if (!pattern) return;

            const [startStr, endStr] = pattern.timeRange.split('-');
            result.push({
                staffId: s.id,
                name: s.name,
                isQualified: s.hasQualification,
                startMinutes: parseTimeToMinutes(startStr),
                endMinutes: parseTimeToMinutes(endStr),
                label: shiftId,
                originalIndex: index
            });
        });

        // Sort by original staff array order (same as monthly view)
        return result.sort((a, b) => a.originalIndex - b.originalIndex);
    }, [staff, schedule, timeRangeSchedule, patterns, dateStr]);

    // Count by hour for summary
    const hourlyCounts = useMemo(() => {
        const counts: { qualified: number; total: number }[] = [];
        for (let hour = START_HOUR; hour <= END_HOUR; hour++) {
            const hourMinutes = hour * 60;
            let qualified = 0;
            let total = 0;
            staffWorkTimes.forEach(sw => {
                if (hourMinutes >= sw.startMinutes && hourMinutes < sw.endMinutes) {
                    total++;
                    if (sw.isQualified) qualified++;
                }
            });
            counts.push({ qualified, total });
        }
        return counts;
    }, [staffWorkTimes]);

    // Convert minutes to position percentage
    const getPosition = (minutes: number) => {
        const startMinutes = START_HOUR * 60;
        return ((minutes - startMinutes) / TOTAL_MINUTES) * 100;
    };

    const getWidth = (start: number, end: number) => {
        return ((end - start) / TOTAL_MINUTES) * 100;
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in-up p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl overflow-hidden max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="header-gradient p-4 flex justify-between items-center flex-shrink-0">
                    <h2 className="text-lg font-bold text-white drop-shadow-md flex items-center gap-2">
                        <Clock size={20} />
                        時間帯別人員
                        <span className="text-sm font-normal ml-2 opacity-90">{dateDisplay}</span>
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-2 bg-white/20 hover:bg-white/40 rounded-full transition-all"
                    >
                        <X size={18} className="text-white" />
                    </button>
                </div>

                {/* Time axis header + Hourly counts (moved below time labels) */}
                <div className="px-4 pt-3 pb-2 bg-gray-50 border-b">
                    {/* Time labels */}
                    <div className="flex">
                        <div className="w-24 flex-shrink-0"></div>
                        <div className="flex-1 relative h-5">
                            {Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i).map(hour => (
                                <div
                                    key={hour}
                                    className="absolute text-[10px] text-gray-500 font-medium"
                                    style={{ left: `${getPosition(hour * 60)}%`, transform: 'translateX(-50%)' }}
                                >
                                    {hour}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Hourly counts - directly below time labels */}
                    <div className="flex mt-1">
                        <div className="w-24 flex-shrink-0 text-[9px] text-gray-400 pr-1 text-right">人数</div>
                        <div className="flex-1 flex">
                            {hourlyCounts.map((count, i) => (
                                <div
                                    key={i}
                                    className={`flex-1 text-center text-[10px] py-0.5 border-r border-gray-200 last:border-r-0 rounded-sm ${count.qualified < 2 ? 'bg-red-100 text-red-700 font-bold' : 'text-gray-600'
                                        }`}
                                >
                                    <span className="font-bold">{count.qualified}</span>
                                    <span className="text-gray-400">/{count.total}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Gantt Chart */}
                <div className="overflow-y-auto flex-1 p-4">
                    <div className="space-y-1">
                        {staffWorkTimes.map(sw => (
                            <div key={sw.staffId} className="flex items-center h-8">
                                {/* Staff name - no checkmark */}
                                <div className="w-24 flex-shrink-0 pr-2">
                                    <span className={`text-xs font-medium truncate block ${sw.isQualified ? 'text-gray-700' : 'text-gray-500'}`}>
                                        {sw.name}
                                    </span>
                                </div>

                                {/* Time bar */}
                                <div className="flex-1 relative h-6 bg-gray-100 rounded">
                                    {/* Grid lines */}
                                    {Array.from({ length: END_HOUR - START_HOUR }, (_, i) => (
                                        <div
                                            key={i}
                                            className="absolute top-0 bottom-0 w-px bg-gray-200"
                                            style={{ left: `${((i + 1) / (END_HOUR - START_HOUR)) * 100}%` }}
                                        />
                                    ))}

                                    {/* Work time bar - coral pink for qualified, gray for unqualified */}
                                    <div
                                        className={`absolute top-1 bottom-1 rounded-md flex items-center justify-center text-[10px] font-bold text-white shadow-sm ${sw.isQualified
                                                ? 'bg-gradient-to-r from-[#FFA8A8] to-[#FF8A8A]' // Light coral pink
                                                : 'bg-gradient-to-r from-gray-400 to-gray-500'
                                            }`}
                                        style={{
                                            left: `${getPosition(sw.startMinutes)}%`,
                                            width: `${getWidth(sw.startMinutes, sw.endMinutes)}%`
                                        }}
                                        title={`${sw.name}: ${sw.label}`}
                                    >
                                        <span className="truncate px-1">{sw.label}</span>
                                    </div>
                                </div>
                            </div>
                        ))}

                        {staffWorkTimes.length === 0 && (
                            <div className="text-center py-8 text-gray-400">
                                <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                <p>この日の勤務者はいません</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Legend & Footer */}
                <div className="px-4 py-3 bg-gray-50 border-t border-gray-100">
                    <div className="flex justify-center gap-6 text-xs text-gray-500 mb-3">
                        <span className="flex items-center gap-1">
                            <div className="w-4 h-3 bg-gradient-to-r from-[#FFA8A8] to-[#FF8A8A] rounded"></div>
                            有資格者
                        </span>
                        <span className="flex items-center gap-1">
                            <div className="w-4 h-3 bg-gradient-to-r from-gray-400 to-gray-500 rounded"></div>
                            無資格者
                        </span>
                    </div>
                    <div className="text-center">
                        <button
                            onClick={onClose}
                            className="px-6 py-2 text-sm bg-[#FF6B6B] text-white rounded-xl hover:bg-[#FF5252] transition-colors font-medium"
                        >
                            閉じる
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
