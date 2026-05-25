import React, { useMemo } from 'react';
import { X, Clock } from 'lucide-react';
import type { Staff, ShiftSchedule, TimeRangeSchedule, ShiftPatternDefinition } from '../types';
import { countsAsFullDayStaffingShift, countsForStaffing, getEffectiveWorkShiftId, isCookingStaff, isTimeRangeStaff, isWorkShiftId, parseHalfDayLeaveShiftId } from '../types';
import { getFormattedDate } from '../lib/utils';
import { getShiftAccentColor } from '../lib/shiftPalette';

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

// Show one hour before/after business hours so off-hours are visible.
const DISPLAY_START_HOUR = 6;
const DISPLAY_END_HOUR = 20;
const BUSINESS_START_HOUR = 7;
const BUSINESS_END_HOUR = 19;
const TOTAL_MINUTES = (DISPLAY_END_HOUR - DISPLAY_START_HOUR) * 60;
const HALF_DAY_BOUNDARY_MINUTES = parseTimeToMinutes('12:00');

interface StaffWorkTime {
    staffId: number;
    name: string;
    isQualified: boolean;
    isPartTime: boolean;
    startMinutes: number;
    endMinutes: number;
    label: string; // Visible text inside the bar.
    title: string; // Full detail for hover/title.
    shiftId?: string;
    isUnassigned: boolean;
    originalIndex: number; // Keep original order from staff array
}

const hours = Array.from({ length: DISPLAY_END_HOUR - DISPLAY_START_HOUR + 1 }, (_, i) => DISPLAY_START_HOUR + i);

const halfHours = Array.from({ length: (DISPLAY_END_HOUR - DISPLAY_START_HOUR) * 2 - 1 }, (_, i) => {
    const minutes = DISPLAY_START_HOUR * 60 + (i + 1) * 30;
    return minutes % 60 === 0 ? null : minutes;
}).filter((minutes): minutes is number => minutes !== null);

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
            if (isCookingStaff(s) || s.shiftType === 'no_shift') return;

            // Time-range workers with time range
            if (isTimeRangeStaff(s)) {
                const timeRange = timeRangeSchedule[dateStr]?.[s.id];
                if (timeRange) {
                    const assignedShifts = timeRange.countAsShifts || [];
                    const isUnassigned = assignedShifts.length === 0;
                    const shiftLabel = isUnassigned ? '未割当' : assignedShifts.join(',');
                    result.push({
                        staffId: s.id,
                        name: s.name,
                        isQualified: countsForStaffing(s) && s.hasQualification,
                        isPartTime: true,
                        startMinutes: parseTimeToMinutes(timeRange.start),
                        endMinutes: parseTimeToMinutes(timeRange.end),
                        label: shiftLabel,
                        title: `${timeRange.start}-${timeRange.end} [${shiftLabel}]`,
                        shiftId: assignedShifts[0],
                        isUnassigned,
                        originalIndex: index
                    });
                }
                return;
            }

            // Regular staff with shift pattern
            const shiftId = schedule[dateStr]?.[s.id];
            if (countsAsFullDayStaffingShift(shiftId, dateStr)) {
                result.push({
                    staffId: s.id,
                    name: s.name,
                    isQualified: countsForStaffing(s) && s.hasQualification,
                    isPartTime: false,
                    startMinutes: BUSINESS_START_HOUR * 60,
                    endMinutes: BUSINESS_END_HOUR * 60,
                    label: shiftId,
                    title: shiftId,
                    shiftId,
                    isUnassigned: false,
                    originalIndex: index
                });
                return;
            }

            if (!isWorkShiftId(shiftId)) return;

            const effectiveShift = getEffectiveWorkShiftId(shiftId);
            const pattern = patterns.find(p => p.id === effectiveShift);
            if (!pattern) return;

            const halfDayLeave = parseHalfDayLeaveShiftId(shiftId);
            const [startStr, endStr] = pattern.timeRange.split('-');
            const patternStart = parseTimeToMinutes(startStr);
            const patternEnd = parseTimeToMinutes(endStr);
            const startMinutes = halfDayLeave?.leavePeriod === 'morning'
                ? Math.max(patternStart, HALF_DAY_BOUNDARY_MINUTES)
                : patternStart;
            const endMinutes = halfDayLeave?.leavePeriod === 'afternoon'
                ? Math.min(patternEnd, HALF_DAY_BOUNDARY_MINUTES)
                : patternEnd;
            if (startMinutes >= endMinutes) return;

            result.push({
                staffId: s.id,
                name: s.name,
                isQualified: countsForStaffing(s) && s.hasQualification,
                isPartTime: false,
                startMinutes,
                endMinutes,
                label: shiftId,
                title: shiftId,
                shiftId,
                isUnassigned: false,
                originalIndex: index
            });
        });

        // Sort by original staff array order (same as monthly view)
        return result.sort((a, b) => a.originalIndex - b.originalIndex);
    }, [staff, schedule, timeRangeSchedule, patterns, dateStr]);

    // Count by hour for summary
    const hourlyCounts = useMemo(() => {
        const counts: { qualified: number; total: number }[] = [];
        for (let hour = DISPLAY_START_HOUR; hour <= DISPLAY_END_HOUR; hour++) {
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
        const startMinutes = DISPLAY_START_HOUR * 60;
        return ((minutes - startMinutes) / TOTAL_MINUTES) * 100;
    };

    const getWidth = (start: number, end: number) => {
        return ((end - start) / TOTAL_MINUTES) * 100;
    };

    const getClampedMinutes = (minutes: number) => Math.min(
        DISPLAY_END_HOUR * 60,
        Math.max(DISPLAY_START_HOUR * 60, minutes)
    );

    const getBarGeometry = (start: number, end: number) => {
        const clampedStart = getClampedMinutes(start);
        const clampedEnd = getClampedMinutes(end);
        return {
            left: `${getPosition(clampedStart)}%`,
            width: `${Math.max(0, getWidth(clampedStart, clampedEnd))}%`,
        };
    };

    const peakTotal = Math.max(...hourlyCounts.map(count => count.total), 0);

    const offHourZones = [
        { left: 0, width: getWidth(DISPLAY_START_HOUR * 60, BUSINESS_START_HOUR * 60) },
        { left: getPosition(BUSINESS_END_HOUR * 60), width: getWidth(BUSINESS_END_HOUR * 60, DISPLAY_END_HOUR * 60) },
    ];

    const getWorkBarStyle = (sw: StaffWorkTime): React.CSSProperties => {
        const geometry = getBarGeometry(sw.startMinutes, sw.endMinutes);
        if (sw.isUnassigned) {
            return {
                ...geometry,
                backgroundColor: '#FFF7E8',
                border: '2px solid #D8BE8C',
                color: '#C05621',
                boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.75), 0 1px 2px rgba(120, 83, 28, 0.12)',
            };
        }

        return {
            ...geometry,
            backgroundColor: getShiftAccentColor(sw.shiftId || sw.label, patterns),
            color: '#FFFFFF',
            border: '1px solid rgba(255, 255, 255, 0.45)',
        };
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in-up p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl overflow-hidden max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="p-4 flex justify-between items-center flex-shrink-0" style={{ backgroundColor: '#E85D75' }}>
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
                            {hours.map(hour => (
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
                            {hourlyCounts.map((count, i) => {
                                const hour = hours[i];
                                const isOffHour = hour < BUSINESS_START_HOUR || hour >= BUSINESS_END_HOUR;
                                const isShort = !isOffHour && count.qualified < 2;

                                return (
                                    <div
                                        key={hour}
                                        className={`flex-1 text-center text-[10px] py-0.5 border-r border-gray-200 last:border-r-0 rounded-sm ${isShort ? 'bg-[#FEE2E2] text-red-700 font-bold' : 'text-[#1F2937]'
                                            } ${count.total === peakTotal && peakTotal > 0 ? 'font-bold' : ''}`}
                                    >
                                        <span className="font-bold">{count.qualified}</span>
                                        <span className="text-gray-400">/{count.total}</span>
                                    </div>
                                );
                            })}
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
                                <div className="flex-1 relative h-6 overflow-hidden rounded border border-gray-200 bg-white">
                                    {/* Off-hours zones */}
                                    {offHourZones.map((zone, i) => (
                                        <div
                                            key={i}
                                            className="absolute top-0 bottom-0 bg-[#F3F4F6]"
                                            style={{ left: `${zone.left}%`, width: `${zone.width}%` }}
                                        />
                                    ))}

                                    {/* Half-hour grid lines */}
                                    {halfHours.map(minutes => (
                                        <div
                                            key={minutes}
                                            className="absolute top-0 bottom-0 w-px border-l border-dashed border-[#F3F4F6]"
                                            style={{ left: `${getPosition(minutes)}%` }}
                                        />
                                    ))}

                                    {/* Hour grid lines */}
                                    {hours.map(hour => (
                                        <div
                                            key={hour}
                                            className="absolute top-0 bottom-0 w-px bg-[#E5E7EB]"
                                            style={{ left: `${getPosition(hour * 60)}%` }}
                                        />
                                    ))}

                                    {/* Work time bar */}
                                    <div
                                        className="absolute top-1 bottom-1 z-10 rounded-md flex items-center justify-center text-[10px] font-medium shadow-sm"
                                        style={getWorkBarStyle(sw)}
                                        title={`${sw.name}: ${sw.title}`}
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

                {/* Footer */}
                <div className="px-4 py-3 bg-gray-50 border-t border-gray-100">
                    <div className="text-center">
                        <button
                            onClick={onClose}
                            className="px-6 py-2 text-sm bg-[#E85D75] text-white rounded-xl hover:bg-[#D95069] transition-colors font-medium"
                        >
                            閉じる
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
