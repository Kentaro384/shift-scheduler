import React from 'react';
import { CheckCircle, AlertTriangle, XCircle, User } from 'lucide-react';
import type { CandidateEvaluation, ConstraintViolation } from '../lib/constraintChecker';
import type { ShiftPatternId } from '../types';
import { SHIFT_PATTERNS, HOLIDAY_PATTERNS } from '../types';

interface CandidatePopoverProps {
    day: number;
    month: number;
    year: number;
    targetShift: ShiftPatternId;
    candidates: CandidateEvaluation[];
    onSelect: (staffId: number) => void;
    onClose: () => void;
    position: { x: number; y: number };
}

// Get shift display info
function getShiftInfo(shiftId: ShiftPatternId) {
    const pattern = SHIFT_PATTERNS.find(p => p.id === shiftId);
    if (pattern) return { name: pattern.name, color: pattern.color };

    const holiday = HOLIDAY_PATTERNS.find(p => p.id === shiftId);
    if (holiday) return { name: holiday.name, color: holiday.color };

    return { name: shiftId || '未設定', color: 'bg-gray-100' };
}

// Get day of week name
function getDayName(year: number, month: number, day: number): string {
    const date = new Date(year, month - 1, day);
    const names = ['日', '月', '火', '水', '木', '金', '土'];
    return names[date.getDay()];
}

// Constraint badge component
function ConstraintBadge({ violation }: { violation: ConstraintViolation }) {
    const isHard = violation.type === 'hard';
    return (
        <span className={`inline-flex items-center text-xs px-1.5 py-0.5 rounded ${isHard ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
            }`}>
            {isHard ? '⚠️' : '⚡'} {violation.message}
        </span>
    );
}

export const CandidatePopover: React.FC<CandidatePopoverProps> = ({
    day,
    month,
    year,
    targetShift,
    candidates,
    onSelect,
    onClose,
    position
}) => {
    const shiftInfo = getShiftInfo(targetShift);
    const dayName = getDayName(year, month, day);

    // Separate candidates by assignability
    const assignable = candidates.filter(c => c.isAssignable);
    const notAssignable = candidates.filter(c => !c.isAssignable);

    // Handle click outside
    React.useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (!target.closest('.candidate-popover')) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    // Calculate position (ensure it stays on screen)
    const style: React.CSSProperties = {
        position: 'fixed',
        left: Math.min(position.x, window.innerWidth - 320),
        top: Math.min(position.y, window.innerHeight - 400),
        zIndex: 1000,
        maxHeight: '400px',
        width: '300px',
    };

    return (
        <div
            className="candidate-popover bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden"
            style={style}
        >
            {/* Header */}
            <div className="bg-gradient-to-r from-pink-50 to-amber-50 px-4 py-3 border-b border-gray-100">
                <div className="flex items-center justify-between">
                    <div>
                        <span className="text-sm text-gray-500">{month}/{day}({dayName})</span>
                        <span className={`ml-2 px-2 py-0.5 rounded text-sm font-medium ${shiftInfo.color}`}>
                            {shiftInfo.name}シフト候補
                        </span>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 text-xl leading-none"
                    >
                        ×
                    </button>
                </div>
            </div>

            {/* Candidate List */}
            <div className="overflow-y-auto max-h-[320px]">
                {candidates.length === 0 ? (
                    <div className="px-4 py-8 text-center text-gray-400">
                        <User className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p>候補者がいません</p>
                    </div>
                ) : (
                    <div className="divide-y divide-gray-50">
                        {candidates.map((candidate) => {
                            const currentShiftInfo = getShiftInfo(candidate.currentShift);
                            const hardViolations = candidate.violations.filter(v => v.type === 'hard');
                            const softViolationsList = candidate.violations.filter(v => v.type === 'soft');

                            return (
                                <button
                                    key={candidate.staffId}
                                    onClick={() => candidate.isAssignable && onSelect(candidate.staffId)}
                                    disabled={!candidate.isAssignable}
                                    className={`w-full px-4 py-3 text-left transition-colors ${candidate.isAssignable
                                        ? 'hover:bg-green-50 cursor-pointer'
                                        : 'bg-gray-50 cursor-not-allowed opacity-60'
                                        }`}
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center space-x-2">
                                            {/* Status Icon */}
                                            {candidate.isAssignable ? (
                                                candidate.violations.length === 0 ? (
                                                    <CheckCircle className="w-5 h-5 text-green-500" />
                                                ) : (
                                                    <AlertTriangle className="w-5 h-5 text-amber-500" />
                                                )
                                            ) : (
                                                <XCircle className="w-5 h-5 text-gray-400" />
                                            )}

                                            {/* Name */}
                                            <span className={`font-medium ${candidate.isAssignable ? 'text-gray-800' : 'text-gray-400'
                                                }`}>
                                                {candidate.staffName}
                                            </span>
                                        </div>

                                        {/* Current Shift */}
                                        <span className={`text-xs px-2 py-0.5 rounded ${currentShiftInfo.color}`}>
                                            現在: {currentShiftInfo.name || '休'}
                                        </span>
                                    </div>

                                    {/* Violations */}
                                    {candidate.violations.length > 0 && (
                                        <div className="mt-2 flex flex-wrap gap-1">
                                            {hardViolations.map((v, i) => (
                                                <ConstraintBadge key={i} violation={v} />
                                            ))}
                                            {softViolationsList.map((v, i) => (
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

            {/* Footer */}
            <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 text-xs text-gray-500">
                <div className="flex items-center justify-between">
                    <span>✅ 配置可能: {assignable.length}名</span>
                    <span>❌ 制約違反: {notAssignable.length}名</span>
                </div>
            </div>
        </div>
    );
};
