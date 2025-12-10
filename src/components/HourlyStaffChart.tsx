import React, { useMemo } from 'react';
import { X, Clock, Users } from 'lucide-react';
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

// Check if a time (in minutes) falls within a range
function isTimeInRange(time: number, start: number, end: number): boolean {
    return time >= start && time < end;
}

// Hours to display (7:00 - 19:00)
const HOURS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];

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

    // Calculate hourly staff counts
    const hourlyData = useMemo(() => {
        return HOURS.map(hour => {
            const hourMinutes = hour * 60;
            let qualifiedCount = 0;
            let totalCount = 0;
            const staffAtHour: { name: string; isQualified: boolean; shiftLabel: string }[] = [];

            staff.forEach(s => {
                if (s.shiftType === 'cooking' || s.shiftType === 'no_shift') return;

                // Check if part-timer with time range
                if (s.shiftType === 'part_time') {
                    const timeRange = timeRangeSchedule[dateStr]?.[s.id];
                    if (timeRange) {
                        const start = parseTimeToMinutes(timeRange.start);
                        const end = parseTimeToMinutes(timeRange.end);
                        if (isTimeInRange(hourMinutes, start, end)) {
                            totalCount++;
                            if (s.hasQualification) qualifiedCount++;
                            staffAtHour.push({
                                name: s.name,
                                isQualified: s.hasQualification,
                                shiftLabel: `${timeRange.start}-${timeRange.end}`
                            });
                        }
                    }
                    return;
                }

                // Regular staff - check shift pattern
                const shiftId = schedule[dateStr]?.[s.id];
                if (!shiftId || shiftId === '休' || shiftId === '振' || shiftId === '有') return;

                const pattern = patterns.find(p => p.id === shiftId);
                if (!pattern) return;

                const [startStr, endStr] = pattern.timeRange.split('-');
                const start = parseTimeToMinutes(startStr);
                const end = parseTimeToMinutes(endStr);

                if (isTimeInRange(hourMinutes, start, end)) {
                    totalCount++;
                    if (s.hasQualification) qualifiedCount++;
                    staffAtHour.push({
                        name: s.name,
                        isQualified: s.hasQualification,
                        shiftLabel: shiftId
                    });
                }
            });

            return { hour, qualifiedCount, totalCount, staffAtHour };
        });
    }, [staff, schedule, timeRangeSchedule, patterns, dateStr]);

    // Find peak hours
    const maxCount = Math.max(...hourlyData.map(d => d.totalCount));

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in-up p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden max-h-[90vh] flex flex-col">
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

                {/* Chart */}
                <div className="overflow-y-auto flex-1 p-4">
                    <div className="space-y-2">
                        {hourlyData.map(({ hour, qualifiedCount, totalCount }) => {
                            const isLow = qualifiedCount < 2; // Warning if less than 2 qualified

                            return (
                                <div key={hour} className="flex items-center gap-3">
                                    {/* Hour label */}
                                    <div className="w-12 text-right text-sm font-medium text-gray-600">
                                        {hour}:00
                                    </div>

                                    {/* Bar */}
                                    <div className="flex-1 relative">
                                        <div className="h-8 bg-gray-100 rounded-lg overflow-hidden">
                                            {/* Qualified portion */}
                                            <div
                                                className={`h-full transition-all duration-300 ${isLow ? 'bg-red-400' : 'bg-green-400'}`}
                                                style={{ width: `${(qualifiedCount / maxCount) * 100}%` }}
                                            />
                                            {/* Non-qualified portion */}
                                            <div
                                                className="h-full bg-gray-300 absolute top-0"
                                                style={{
                                                    left: `${(qualifiedCount / maxCount) * 100}%`,
                                                    width: `${((totalCount - qualifiedCount) / maxCount) * 100}%`
                                                }}
                                            />
                                        </div>

                                        {/* Count label */}
                                        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 text-xs">
                                            <span className={`font-bold ${isLow ? 'text-red-700' : 'text-green-700'}`}>
                                                {qualifiedCount}資
                                            </span>
                                            <span className="text-gray-500">/ {totalCount}名</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Legend */}
                    <div className="mt-6 flex gap-4 justify-center text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                            <div className="w-3 h-3 bg-green-400 rounded"></div>
                            資格者
                        </span>
                        <span className="flex items-center gap-1">
                            <div className="w-3 h-3 bg-gray-300 rounded"></div>
                            資格なし
                        </span>
                        <span className="flex items-center gap-1">
                            <div className="w-3 h-3 bg-red-400 rounded"></div>
                            資格者2名未満
                        </span>
                    </div>

                    {/* Staff Detail for peak hour */}
                    <div className="mt-6 p-4 bg-gray-50 rounded-xl">
                        <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                            <Users size={16} />
                            在籍職員一覧（日中帯 9:00-15:00）
                        </h3>
                        <div className="flex flex-wrap gap-2">
                            {hourlyData
                                .filter(d => d.hour >= 9 && d.hour <= 15)
                                .flatMap(d => d.staffAtHour)
                                .filter((v, i, a) => a.findIndex(t => t.name === v.name) === i)
                                .map((s, i) => (
                                    <span
                                        key={i}
                                        className={`text-xs px-2 py-1 rounded-full ${s.isQualified
                                            ? 'bg-green-100 text-green-700 border border-green-200'
                                            : 'bg-gray-100 text-gray-600 border border-gray-200'
                                            }`}
                                    >
                                        {s.name}
                                        <span className="ml-1 opacity-70">({s.shiftLabel})</span>
                                    </span>
                                ))}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 text-center">
                    <button
                        onClick={onClose}
                        className="px-6 py-2 text-sm bg-[#FF6B6B] text-white rounded-xl hover:bg-[#FF5252] transition-colors font-medium"
                    >
                        閉じる
                    </button>
                </div>
            </div>
        </div>
    );
};
