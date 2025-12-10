import React, { useMemo } from 'react';
import { X, Users } from 'lucide-react';
import type { ShiftPatternId, Staff, ShiftSchedule, Holiday, Settings } from '../types';
import {
    evaluateCandidates,
    createConstraintContext,
    type ConstraintViolation
} from '../lib/constraintChecker';

interface CandidateSearchModalProps {
    day: number;
    year: number;
    month: number;
    shiftPattern: ShiftPatternId;
    schedule: ShiftSchedule;
    staff: Staff[];
    holidays: Holiday[];
    settings: Settings;
    onSelectCandidate: (staffId: number, shift: ShiftPatternId) => void;
    onClose: () => void;
}

// Constraint badge component - flat design
function ConstraintBadge({ violation }: { violation: ConstraintViolation }) {
    const isHard = violation.type === 'hard';
    return (
        <span className={`inline-flex items-center text-xs px-1.5 py-0.5 rounded ${isHard ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
            }`}>
            {isHard ? '✕' : '△'} {violation.message}
        </span>
    );
}

// Shift color function - consistent with App.tsx getShiftColor and Rev5 spec
function getShiftColor(shiftId: ShiftPatternId): string {
    const colors: Record<string, string> = {
        // Rev5: 時間帯カラー（サンライズ → モーニング → ミッドデイ → サンセット → トワイライト → ナイト）
        'A': 'bg-[rgba(245,158,11,0.20)] text-[#1F2937] border-l-4 border-l-[#F59E0B]',   // Sunrise Amber
        'B': 'bg-[rgba(56,189,248,0.15)] text-[#1F2937] border-l-4 border-l-[#38BDF8]',   // Morning Sky Blue
        'C': 'bg-[rgba(59,130,246,0.15)] text-[#1F2937] border-l-4 border-l-[#3B82F6]',   // Midday Blue
        'D': 'bg-[rgba(249,115,22,0.20)] text-[#1F2937] border-l-4 border-l-[#F97316]',   // Sunset Orange ← Fixed!
        'E': 'bg-[rgba(168,85,247,0.15)] text-[#1F2937] border-l-4 border-l-[#A855F7]',   // Twilight Purple
        'J': 'bg-[rgba(220,38,38,0.15)] text-[#1F2937] border-l-4 border-l-[#DC2626]',    // Night Crimson
        '振': 'bg-[#F3F4F6] text-[#10B981] border border-[#10B981]',
        '有': 'bg-[#F3F4F6] text-[#F472B6] border border-[#F472B6]',
        '休': 'bg-gray-100 text-gray-400',
    };
    return colors[shiftId] || 'bg-gray-100 text-gray-500';
}

// Get day of week name
function getDayName(year: number, month: number, day: number): string {
    const date = new Date(year, month - 1, day);
    const names = ['日', '月', '火', '水', '木', '金', '土'];
    return names[date.getDay()];
}

// Get shift label
function getShiftLabel(shiftId: ShiftPatternId): string {
    const labels: Record<string, string> = {
        'A': '早番', 'B': '標準', 'C': '標準+', 'D': '遅番', 'E': '遅番+', 'J': '最遅番',
        '振': '振休', '有': '有給', '休': '休み'
    };
    return labels[shiftId] || shiftId || '休';
}

export const CandidateSearchModal: React.FC<CandidateSearchModalProps> = ({
    day,
    year,
    month,
    shiftPattern,
    schedule,
    staff,
    holidays,
    settings,
    onSelectCandidate,
    onClose
}) => {
    const ctx = useMemo(() =>
        createConstraintContext(schedule, staff, holidays, settings, year, month),
        [schedule, staff, holidays, settings, year, month]
    );

    const candidates = useMemo(() =>
        evaluateCandidates(ctx, day, shiftPattern),
        [ctx, day, shiftPattern]
    );

    const dateStr = `${month}/${day}(${getDayName(year, month, day)})`;

    const handleSelect = (staffId: number) => {
        onSelectCandidate(staffId, shiftPattern);
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in-up p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden max-h-[85vh] flex flex-col">
                {/* Header */}
                <div className="header-gradient p-4 flex justify-between items-center flex-shrink-0">
                    <h2 className="text-lg font-bold text-white drop-shadow-md flex items-center gap-2">
                        <Users size={20} />
                        <span className={`px-2 py-0.5 rounded ${getShiftColor(shiftPattern)} text-sm font-bold`}>
                            {shiftPattern}
                        </span>
                        シフト候補者
                        <span className="text-sm font-normal ml-1 opacity-90">{dateStr}</span>
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-2 bg-white/20 hover:bg-white/40 rounded-full transition-all duration-300"
                    >
                        <X size={18} className="text-white" />
                    </button>
                </div>

                {/* Description */}
                <div className="px-4 pt-3 pb-2 bg-gradient-to-r from-pink-50 to-amber-50 border-b border-gray-100">
                    <p className="text-sm text-gray-600">
                        <span className="font-medium">{dateStr}</span>に
                        <span className={`mx-1 px-2 py-0.5 rounded ${getShiftColor(shiftPattern)} font-bold`}>
                            {shiftPattern}
                        </span>
                        ({getShiftLabel(shiftPattern)})を配置できる職員:
                    </p>
                </div>

                {/* Candidate List */}
                <div className="overflow-y-auto flex-1 p-4">
                    {candidates.length === 0 ? (
                        <div className="text-center py-8 text-gray-400">
                            <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
                            <p>配置可能な職員がいません</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {candidates.map((candidate) => {
                                const hardViolations = candidate.violations.filter(v => v.type === 'hard');
                                const softViolations = candidate.violations.filter(v => v.type === 'soft');

                                // Flat design status indicator
                                let statusIcon: React.ReactNode;
                                if (candidate.isAssignable) {
                                    if (candidate.violations.length === 0) {
                                        // Green circle - OK
                                        statusIcon = <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center text-white text-xs font-bold">○</div>;
                                    } else {
                                        // Amber circle - Warning
                                        statusIcon = <div className="w-5 h-5 rounded-full bg-amber-400 flex items-center justify-center text-white text-xs font-bold">△</div>;
                                    }
                                } else {
                                    // Gray circle - Disabled
                                    statusIcon = <div className="w-5 h-5 rounded-full bg-gray-300 flex items-center justify-center text-white text-xs font-bold">✕</div>;
                                }

                                return (
                                    <button
                                        key={candidate.staffId}
                                        onClick={() => candidate.isAssignable && handleSelect(candidate.staffId)}
                                        disabled={!candidate.isAssignable}
                                        className={`w-full p-3 rounded-xl text-left transition-all ${candidate.isAssignable
                                            ? 'bg-white border border-gray-200 hover:border-green-400 hover:shadow-md'
                                            : 'bg-gray-50 border border-gray-100 cursor-not-allowed opacity-60'
                                            }`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                {statusIcon}
                                                <span className={`font-medium ${candidate.isAssignable ? 'text-gray-800' : 'text-gray-400'
                                                    }`}>
                                                    {candidate.staffName}
                                                </span>
                                            </div>
                                            {/* Current shift with A~J notation and consistent colors */}
                                            <span className={`text-xs px-2 py-0.5 rounded font-bold ${getShiftColor(candidate.currentShift)}`}>
                                                現在: {candidate.currentShift || '休'}
                                            </span>
                                        </div>

                                        {candidate.violations.length > 0 && (
                                            <div className="mt-2 flex flex-wrap gap-1">
                                                {hardViolations.map((v, i) => (
                                                    <ConstraintBadge key={i} violation={v} />
                                                ))}
                                                {softViolations.map((v, i) => (
                                                    <ConstraintBadge key={`soft-${i}`} violation={v} />
                                                ))}
                                            </div>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Footer - flat design */}
                <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 text-xs text-gray-500 flex justify-between">
                    <span className="flex items-center gap-1">
                        <div className="w-3 h-3 rounded-full bg-green-500"></div>
                        配置可能: {candidates.filter(c => c.isAssignable).length}名
                    </span>
                    <span className="flex items-center gap-1">
                        <div className="w-3 h-3 rounded-full bg-gray-300"></div>
                        制約違反: {candidates.filter(c => !c.isAssignable).length}名
                    </span>
                </div>
            </div>
        </div>
    );
};
