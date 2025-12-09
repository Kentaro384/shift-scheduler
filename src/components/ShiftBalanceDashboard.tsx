import React, { useState } from 'react';
import { BarChart3, ChevronDown, ChevronUp, AlertTriangle, CheckCircle, RefreshCcw, Heart } from 'lucide-react';
import type { Staff, ShiftSchedule, ShiftPatternId } from '../types';

interface ShiftBalanceDashboardProps {
    staff: Staff[];
    schedule: ShiftSchedule;
    days: number[];
    year: number;
    month: number;
}

// Rev.5 Time-flow Colors
const SHIFT_COLORS: Record<string, string> = {
    'A': '#F59E0B', // Sunrise Yellow
    'B': '#38BDF8', // Morning Sky Blue
    'C': '#3B82F6', // Midday Blue
    'D': '#F97316', // Sunset Orange
    'E': '#A855F7', // Twilight Purple
    'J': '#DC2626', // Night Crimson
};

const SHIFT_ORDER: ShiftPatternId[] = ['A', 'B', 'C', 'D', 'E', 'J'];

export const ShiftBalanceDashboard: React.FC<ShiftBalanceDashboardProps> = ({
    staff,
    schedule,
    days,
    year,
    month,
}) => {
    const [isExpanded, setIsExpanded] = useState(true);

    // Filter to only regular/backup staff (not cooking, not no_shift)
    const targetStaff = staff.filter(s =>
        s.shiftType === 'regular' || s.shiftType === 'backup' || s.shiftType === 'part_time'
    );

    // Calculate shift counts for each staff member (including leave types)
    const getStaffShiftCounts = (staffMember: Staff): Record<string, number> => {
        const counts: Record<string, number> = {};
        SHIFT_ORDER.forEach(shift => counts[shift] = 0);
        counts['振'] = 0;
        counts['有'] = 0;

        days.forEach(day => {
            const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const shift = schedule[dateStr]?.[staffMember.id];
            if (shift) {
                if (SHIFT_ORDER.includes(shift as ShiftPatternId)) {
                    counts[shift] = (counts[shift] || 0) + 1;
                } else if (shift === '振') {
                    counts['振'] = (counts['振'] || 0) + 1;
                } else if (shift === '有') {
                    counts['有'] = (counts['有'] || 0) + 1;
                }
            }
        });

        return counts;
    };

    // Calculate maximum count for scaling bars
    const allCounts = targetStaff.map(s => getStaffShiftCounts(s));
    const maxTotal = Math.max(...allCounts.map(counts =>
        SHIFT_ORDER.reduce((sum, shift) => sum + (counts[shift] || 0), 0)
    ), 1);

    // Calculate fairness scores (standard deviation)
    const calculateFairnessScore = (shiftType: ShiftPatternId): { score: number; isGood: boolean; staffCounts: { name: string; count: number }[] } => {
        const counts = targetStaff
            .filter(s => s.shiftType === 'regular') // Only regular staff for fairness
            .map(s => ({
                name: s.name,
                count: getStaffShiftCounts(s)[shiftType] || 0
            }));

        if (counts.length === 0) return { score: 0, isGood: true, staffCounts: [] };

        const avg = counts.reduce((sum, c) => sum + c.count, 0) / counts.length;
        const variance = counts.reduce((sum, c) => sum + Math.pow(c.count - avg, 2), 0) / counts.length;
        const stdDev = Math.sqrt(variance);

        return {
            score: stdDev,
            isGood: stdDev <= 1.5, // Threshold for "good" balance
            staffCounts: counts.sort((a, b) => b.count - a.count)
        };
    };

    const earlyFairness = calculateFairnessScore('A');
    const lateFairness = calculateFairnessScore('J');

    return (
        <div className="mt-6 bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden">
            {/* Header */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center justify-between p-4 bg-gradient-to-r from-gray-50 to-white hover:from-gray-100 hover:to-gray-50 transition-all duration-200"
            >
                <div className="flex items-center gap-3">
                    <BarChart3 className="text-[#FF6B6B]" size={24} />
                    <h3 className="text-lg font-bold text-gray-800">シフトバランス分析</h3>
                </div>
                {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </button>

            {/* Content */}
            {isExpanded && (
                <div className="p-6 space-y-6">
                    {/* Fairness Scores */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Early Shift (A) Fairness */}
                        <div className={`p-4 rounded-xl border-2 ${earlyFairness.isGood ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}`}>
                            <div className="flex items-center gap-2 mb-2">
                                {earlyFairness.isGood ? (
                                    <CheckCircle className="text-green-500" size={20} />
                                ) : (
                                    <AlertTriangle className="text-amber-500" size={20} />
                                )}
                                <span className="font-bold text-gray-700">早番 (A) バランス</span>
                                <span className={`text-sm px-2 py-0.5 rounded-full ${earlyFairness.isGood ? 'bg-green-200 text-green-700' : 'bg-amber-200 text-amber-700'}`}>
                                    {earlyFairness.isGood ? '良好' : '偏りあり'}
                                </span>
                            </div>
                            <div className="text-sm text-gray-600">
                                偏り指数: <span className="font-mono font-bold">{earlyFairness.score.toFixed(2)}</span>
                                {!earlyFairness.isGood && earlyFairness.staffCounts.length > 0 && (
                                    <span className="ml-2">
                                        (多: {earlyFairness.staffCounts[0]?.name} {earlyFairness.staffCounts[0]?.count}回)
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Late Shift (J) Fairness */}
                        <div className={`p-4 rounded-xl border-2 ${lateFairness.isGood ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}`}>
                            <div className="flex items-center gap-2 mb-2">
                                {lateFairness.isGood ? (
                                    <CheckCircle className="text-green-500" size={20} />
                                ) : (
                                    <AlertTriangle className="text-amber-500" size={20} />
                                )}
                                <span className="font-bold text-gray-700">最遅番 (J) バランス</span>
                                <span className={`text-sm px-2 py-0.5 rounded-full ${lateFairness.isGood ? 'bg-green-200 text-green-700' : 'bg-amber-200 text-amber-700'}`}>
                                    {lateFairness.isGood ? '良好' : '偏りあり'}
                                </span>
                            </div>
                            <div className="text-sm text-gray-600">
                                偏り指数: <span className="font-mono font-bold">{lateFairness.score.toFixed(2)}</span>
                                {!lateFairness.isGood && lateFairness.staffCounts.length > 0 && (
                                    <span className="ml-2">
                                        (多: {lateFairness.staffCounts[0]?.name} {lateFairness.staffCounts[0]?.count}回)
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Staff Distribution Chart */}
                    <div>
                        <h4 className="font-bold text-gray-700 mb-3">職員別シフト分布</h4>
                        <div className="space-y-2">
                            {targetStaff.map(s => {
                                const counts = getStaffShiftCounts(s);
                                const total = SHIFT_ORDER.reduce((sum, shift) => sum + (counts[shift] || 0), 0);
                                const furikyu = counts['振'] || 0;
                                const yukyu = counts['有'] || 0;

                                return (
                                    <div key={s.id} className="flex items-center gap-2">
                                        <div className="w-20 text-sm font-medium text-gray-700 truncate">
                                            {s.name}
                                        </div>
                                        <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden flex">
                                            {SHIFT_ORDER.map(shift => {
                                                const count = counts[shift] || 0;
                                                if (count === 0) return null;
                                                const width = (count / maxTotal) * 100;
                                                return (
                                                    <div
                                                        key={shift}
                                                        className="h-full flex items-center justify-center text-xs font-bold text-white"
                                                        style={{
                                                            width: `${width}%`,
                                                            backgroundColor: SHIFT_COLORS[shift],
                                                            minWidth: count > 0 ? '20px' : '0'
                                                        }}
                                                        title={`${shift}: ${count}回`}
                                                    >
                                                        {count > 0 && count}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        <div className="w-10 text-sm font-bold text-gray-600 text-right">
                                            {total}日
                                        </div>
                                        {/* Leave Badges */}
                                        <div className="flex gap-1 w-16 justify-end">
                                            {furikyu > 0 && (
                                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs font-bold rounded-full bg-emerald-100 text-emerald-700 border border-emerald-300" title="振替休日">
                                                    <RefreshCcw size={10} />
                                                    {furikyu}
                                                </span>
                                            )}
                                            {yukyu > 0 && (
                                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs font-bold rounded-full bg-pink-100 text-pink-700 border border-pink-300" title="有給休暇">
                                                    <Heart size={10} />
                                                    {yukyu}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Legend */}
                        <div className="flex flex-wrap gap-3 mt-4 pt-4 border-t border-gray-200">
                            {SHIFT_ORDER.map(shift => (
                                <div key={shift} className="flex items-center gap-1">
                                    <div
                                        className="w-4 h-4 rounded"
                                        style={{ backgroundColor: SHIFT_COLORS[shift] }}
                                    />
                                    <span className="text-xs text-gray-600">{shift}</span>
                                </div>
                            ))}
                            <div className="flex items-center gap-1">
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs rounded-full bg-emerald-100 text-emerald-700 border border-emerald-300">
                                    <RefreshCcw size={10} />振
                                </span>
                            </div>
                            <div className="flex items-center gap-1">
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs rounded-full bg-pink-100 text-pink-700 border border-pink-300">
                                    <Heart size={10} />有
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
