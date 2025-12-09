import React, { useState, useMemo } from 'react';
import { X, Palette, AlertTriangle, CheckCircle, Users } from 'lucide-react';
import type { ShiftPatternId, Staff, ShiftSchedule, Holiday, Settings } from '../types';
import {
    checkConstraints,
    evaluateCandidates,
    createConstraintContext,
    type ConstraintViolation
} from '../lib/constraintChecker';

interface ShiftEditModalProps {
    staffId: number;
    staffName: string;
    day: number;
    year: number;
    month: number;
    currentShift: ShiftPatternId;
    schedule: ShiftSchedule;
    staff: Staff[];
    holidays: Holiday[];
    settings: Settings;
    onSelect: (shift: ShiftPatternId) => void;
    onSelectStaff: (staffId: number, shift: ShiftPatternId) => void;
    onClose: () => void;
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

export const ShiftEditModal: React.FC<ShiftEditModalProps> = ({
    staffId,
    staffName,
    day,
    year,
    month,
    currentShift,
    schedule,
    staff,
    holidays,
    settings,
    onSelect,
    onSelectStaff,
    onClose
}) => {
    const [activeTab, setActiveTab] = useState<'select' | 'candidates'>('select');
    const [selectedShiftForCandidates, setSelectedShiftForCandidates] = useState<ShiftPatternId>('A');

    // Create constraint context
    const ctx = useMemo(() =>
        createConstraintContext(schedule, staff, holidays, settings, year, month),
        [schedule, staff, holidays, settings, year, month]
    );

    const dateStr = `${month}/${day}`;

    // Rev.5 Time-flow Colors
    const shiftOptions: { id: ShiftPatternId; label: string; color: string; marker: string }[] = [
        { id: 'A', label: '早番', color: 'bg-[#F59E0B] text-white', marker: '●' },
        { id: 'B', label: '標準', color: 'bg-[#38BDF8] text-white', marker: '■' },
        { id: 'C', label: '標準+', color: 'bg-[#3B82F6] text-white', marker: '◆' },
        { id: 'D', label: '遅番', color: 'bg-[#F97316] text-white', marker: '▲' },
        { id: 'E', label: '遅番+', color: 'bg-[#A855F7] text-white', marker: '▼' },
        { id: 'J', label: '最遅番', color: 'bg-[#DC2626] text-white', marker: '★' },
        { id: '振', label: '振休', color: 'bg-[#F3F4F6] text-[#10B981] border-2 border-[#10B981]', marker: '○' },
        { id: '有', label: '有給', color: 'bg-[#F3F4F6] text-[#F472B6] border-2 border-[#F472B6]', marker: '◇' },
        { id: '休', label: '休み', color: 'bg-gray-100 text-gray-400', marker: '－' },
    ];

    // Check constraints for each shift option
    const shiftViolations = useMemo(() => {
        const violations: Record<ShiftPatternId, ConstraintViolation[]> = {} as any;
        for (const opt of shiftOptions) {
            violations[opt.id] = checkConstraints(ctx, day, staffId, opt.id);
        }
        return violations;
    }, [ctx, day, staffId]);

    // Get candidates for selected shift
    const candidates = useMemo(() =>
        evaluateCandidates(ctx, day, selectedShiftForCandidates),
        [ctx, day, selectedShiftForCandidates]
    );

    const handleShiftSelect = (shiftId: ShiftPatternId) => {
        onSelect(shiftId);
    };

    const handleCandidateSelect = (candidateStaffId: number) => {
        onSelectStaff(candidateStaffId, selectedShiftForCandidates);
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in-up p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="header-gradient p-4 flex justify-between items-center flex-shrink-0">
                    <h2 className="text-lg font-bold text-white drop-shadow-md flex items-center gap-2">
                        <Palette size={20} /> シフト編集
                        <span className="text-sm font-normal ml-2 opacity-90">
                            {staffName} ({dateStr})
                        </span>
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-2 bg-white/20 hover:bg-white/40 rounded-full transition-all duration-300"
                    >
                        <X size={18} className="text-white" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-gray-200 flex-shrink-0">
                    <button
                        onClick={() => setActiveTab('select')}
                        className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'select'
                            ? 'text-[#FF6B6B] border-b-2 border-[#FF6B6B]'
                            : 'text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        <Palette size={16} className="inline mr-1" />
                        シフト選択
                    </button>
                    <button
                        onClick={() => setActiveTab('candidates')}
                        className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'candidates'
                            ? 'text-[#FF6B6B] border-b-2 border-[#FF6B6B]'
                            : 'text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        <Users size={16} className="inline mr-1" />
                        候補者検索
                    </button>
                </div>

                {/* Content */}
                <div className="overflow-y-auto flex-1">
                    {activeTab === 'select' ? (
                        /* Shift Selection Tab */
                        <div className="p-4">
                            <p className="text-xs text-gray-500 mb-3">
                                シフトを選択してください。制約違反がある場合は表示されます。
                            </p>
                            <div className="grid grid-cols-3 gap-3">
                                {shiftOptions.map((option) => {
                                    const violations = shiftViolations[option.id] || [];
                                    const hasHardViolation = violations.some(v => v.type === 'hard');

                                    return (
                                        <div key={option.id} className="flex flex-col">
                                            <button
                                                onClick={() => handleShiftSelect(option.id)}
                                                className={`
                          relative flex flex-col items-center justify-center p-3 rounded-xl transition-all duration-200 
                          ${option.color}
                          ${currentShift === option.id ? 'ring-2 ring-[#FF6B6B] ring-offset-2 scale-105' : 'shadow-sm hover:shadow-md hover:scale-105'}
                          ${hasHardViolation ? 'opacity-50' : ''}
                        `}
                                            >
                                                {/* Warning badge */}
                                                {violations.length > 0 && (
                                                    <div className={`absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-xs ${hasHardViolation ? 'bg-red-500 text-white' : 'bg-amber-400 text-white'
                                                        }`}>
                                                        {violations.length}
                                                    </div>
                                                )}
                                                <span className="text-xs opacity-80">{option.marker}</span>
                                                <span className="text-xl font-bold">{option.id || '-'}</span>
                                                <span className="text-xs font-medium opacity-90">{option.label}</span>
                                            </button>

                                            {/* Violation summary */}
                                            {violations.length > 0 && (
                                                <div className="mt-1 flex flex-wrap gap-0.5 justify-center">
                                                    {hasHardViolation ? (
                                                        <span className="text-[10px] text-red-600">⚠️ 制約違反</span>
                                                    ) : (
                                                        <span className="text-[10px] text-amber-600">⚡ 推奨外</span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Current shift violations detail */}
                            {shiftViolations[currentShift]?.length > 0 && (
                                <div className="mt-4 p-3 bg-gray-50 rounded-xl">
                                    <p className="text-xs font-medium text-gray-600 mb-2">
                                        現在のシフト「{currentShift}」の制約状況:
                                    </p>
                                    <div className="flex flex-wrap gap-1">
                                        {shiftViolations[currentShift].map((v, i) => (
                                            <ConstraintBadge key={i} violation={v} />
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        /* Candidate Search Tab */
                        <div className="p-4">
                            <p className="text-xs text-gray-500 mb-3">
                                シフトを選んで、配置可能な職員を確認できます。
                            </p>

                            {/* Shift selector for candidates */}
                            <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
                                {['A', 'B', 'C', 'D', 'E', 'J'].map((shift) => {
                                    const opt = shiftOptions.find(o => o.id === shift)!;
                                    return (
                                        <button
                                            key={shift}
                                            onClick={() => setSelectedShiftForCandidates(shift as ShiftPatternId)}
                                            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${selectedShiftForCandidates === shift
                                                ? `${opt.color} shadow-md`
                                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                                }`}
                                        >
                                            {opt.marker} {shift}
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Candidate list */}
                            <div className="space-y-2 max-h-[300px] overflow-y-auto">
                                {candidates.length === 0 ? (
                                    <div className="text-center py-8 text-gray-400">
                                        候補者がいません
                                    </div>
                                ) : (
                                    candidates.map((candidate) => {
                                        const hardViolations = candidate.violations.filter(v => v.type === 'hard');
                                        const softViolations = candidate.violations.filter(v => v.type === 'soft');

                                        return (
                                            <button
                                                key={candidate.staffId}
                                                onClick={() => candidate.isAssignable && handleCandidateSelect(candidate.staffId)}
                                                disabled={!candidate.isAssignable}
                                                className={`w-full p-3 rounded-xl text-left transition-all ${candidate.isAssignable
                                                    ? 'bg-white border border-gray-200 hover:border-green-400 hover:shadow-md'
                                                    : 'bg-gray-50 border border-gray-100 cursor-not-allowed opacity-60'
                                                    }`}
                                            >
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        {candidate.isAssignable ? (
                                                            candidate.violations.length === 0 ? (
                                                                <CheckCircle className="w-5 h-5 text-green-500" />
                                                            ) : (
                                                                <AlertTriangle className="w-5 h-5 text-amber-500" />
                                                            )
                                                        ) : (
                                                            <X className="w-5 h-5 text-gray-400" />
                                                        )}
                                                        <span className={`font-medium ${candidate.isAssignable ? 'text-gray-800' : 'text-gray-400'
                                                            }`}>
                                                            {candidate.staffName}
                                                        </span>
                                                    </div>
                                                    <span className="text-xs text-gray-500">
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
                                    })
                                )}
                            </div>

                            {/* Summary */}
                            <div className="mt-4 pt-3 border-t border-gray-100 text-xs text-gray-500 flex justify-between">
                                <span>✅ 配置可能: {candidates.filter(c => c.isAssignable).length}名</span>
                                <span>❌ 制約違反: {candidates.filter(c => !c.isAssignable).length}名</span>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
