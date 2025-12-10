import React, { useMemo } from 'react';
import { ArrowLeftRight, AlertTriangle, CheckCircle, XCircle, ArrowRightLeft } from 'lucide-react';
import type { ShiftSchedule, Staff, ShiftPatternId } from '../types';
import { getSwapCandidates, type SwapViolation } from '../lib/swapConstraintChecker';

interface SwapSuggestionsProps {
    day: number;
    year: number;
    month: number;
    schedule: ShiftSchedule;
    staff: Staff[];
    currentStaff: Staff; // The staff whose cell was clicked
    onApplySwap: (staffAId: number, staffBId: number) => void;
    onClose: () => void;
}

const getShiftColor = (shift: ShiftPatternId): string => {
    const colors: Record<string, string> = {
        'A': 'bg-blue-100 text-blue-700 border-blue-300',
        'B': 'bg-green-100 text-green-700 border-green-300',
        'C': 'bg-teal-100 text-teal-700 border-teal-300',
        'D': 'bg-orange-100 text-orange-700 border-orange-300',
        'E': 'bg-purple-100 text-purple-700 border-purple-300',
        'J': 'bg-pink-100 text-pink-700 border-pink-300',
    };
    return colors[shift] || 'bg-gray-100 text-gray-700 border-gray-300';
};

export const SwapSuggestions: React.FC<SwapSuggestionsProps> = ({
    day,
    year,
    month,
    schedule,
    staff,
    currentStaff,
    onApplySwap,
}) => {
    // Get the current staff's shift
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const currentShift = (schedule[dateStr]?.[currentStaff.id] || '') as ShiftPatternId;

    // Get all swap candidates with violations
    const candidates = useMemo(() =>
        getSwapCandidates(currentStaff, day, schedule, staff, year, month),
        [currentStaff, day, schedule, staff, year, month]
    );

    const getSeverityIcon = (violations: SwapViolation[]) => {
        const hasError = violations.some(v => v.severity === 'error');
        const hasWarning = violations.some(v => v.severity === 'warning');

        if (hasError) {
            return <XCircle className="w-5 h-5 text-red-500" />;
        } else if (hasWarning) {
            return <AlertTriangle className="w-5 h-5 text-amber-500" />;
        } else {
            return <CheckCircle className="w-5 h-5 text-green-500" />;
        }
    };

    const workShifts = ['A', 'B', 'C', 'D', 'E', 'J'];
    const isWorkShift = workShifts.includes(currentShift);

    if (!isWorkShift) {
        return (
            <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
                <div className="flex items-center gap-2 text-gray-500">
                    <ArrowRightLeft className="w-5 h-5" />
                    <span>入替シミュレーションは勤務シフトでのみ利用可能です</span>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="p-3 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200">
                <div className="flex items-center gap-2">
                    <ArrowRightLeft className="w-5 h-5 text-blue-500" />
                    <span className="font-bold text-gray-800">入替シミュレーター</span>
                </div>
                <p className="text-sm text-gray-600 mt-1">
                    <span className="font-medium">{currentStaff.name}</span>
                    <span className={`mx-1 px-2 py-0.5 rounded text-xs font-bold ${getShiftColor(currentShift)}`}>
                        {currentShift}
                    </span>
                    と入替えた場合の影響を確認できます
                </p>
            </div>

            {/* Candidates */}
            {candidates.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                    <ArrowLeftRight className="w-10 h-10 mx-auto mb-2 opacity-50" />
                    <p>入替候補がいません</p>
                    <p className="text-xs mt-1">同じ日に勤務している他のスタッフがいません</p>
                </div>
            ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                    {candidates.map(({ staff: targetStaff, currentShift: targetShift, violations }) => (
                        <div
                            key={targetStaff.id}
                            className={`p-3 rounded-xl border transition-all ${violations.length === 0
                                ? 'bg-green-50 border-green-200 hover:border-green-400'
                                : violations.some(v => v.severity === 'error')
                                    ? 'bg-red-50 border-red-200 hover:border-red-400'
                                    : 'bg-amber-50 border-amber-200 hover:border-amber-400'
                                }`}
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    {getSeverityIcon(violations)}
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium text-gray-800">{targetStaff.name}</span>
                                            <span className={`px-2 py-0.5 rounded text-xs font-bold ${getShiftColor(targetShift)}`}>
                                                {targetShift}
                                            </span>
                                            <ArrowLeftRight className="w-3 h-3 text-gray-400" />
                                            <span className={`px-2 py-0.5 rounded text-xs font-bold ${getShiftColor(currentShift)}`}>
                                                {currentShift}
                                            </span>
                                        </div>
                                        {targetStaff.floor && targetStaff.floor !== 'none' && (
                                            <span className="text-xs text-gray-500">
                                                {targetStaff.floor === 'free' ? 'フリー' : targetStaff.floor}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <button
                                    onClick={() => onApplySwap(currentStaff.id, targetStaff.id)}
                                    className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${violations.some(v => v.severity === 'error')
                                        ? 'bg-red-100 text-red-600 hover:bg-red-200'
                                        : violations.length > 0
                                            ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                                            : 'bg-green-500 text-white hover:bg-green-600'
                                        }`}
                                >
                                    入替え
                                </button>
                            </div>

                            {/* Violations */}
                            {violations.length > 0 && (
                                <div className="mt-2 pl-8 space-y-1">
                                    {violations.map((v, i) => (
                                        <div
                                            key={i}
                                            className={`text-xs flex items-center gap-1 ${v.severity === 'error' ? 'text-red-600' : 'text-amber-600'
                                                }`}
                                        >
                                            {v.severity === 'error' ? '❌' : '⚠️'} {v.description}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {violations.length === 0 && (
                                <div className="mt-2 pl-8 text-xs text-green-600">
                                    ✅ 制約違反なし
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Legend */}
            <div className="flex gap-4 text-xs text-gray-500 pt-2 border-t border-gray-200">
                <div className="flex items-center gap-1">
                    <CheckCircle className="w-3 h-3 text-green-500" />
                    <span>制約OK</span>
                </div>
                <div className="flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 text-amber-500" />
                    <span>警告あり</span>
                </div>
                <div className="flex items-center gap-1">
                    <XCircle className="w-3 h-3 text-red-500" />
                    <span>エラーあり</span>
                </div>
            </div>
        </div>
    );
};
