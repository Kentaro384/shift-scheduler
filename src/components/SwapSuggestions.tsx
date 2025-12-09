import React, { useMemo } from 'react';
import { ArrowLeftRight, Lightbulb, CheckCircle } from 'lucide-react';
import type { ShiftSchedule, Staff, Holiday, Settings, ShiftPatternId } from '../types';
import {
    findSwapSuggestions,
    findShortages,
    createConstraintContext,
    type SwapSuggestion
} from '../lib/constraintChecker';

interface SwapSuggestionsProps {
    day: number;
    year: number;
    month: number;
    schedule: ShiftSchedule;
    staff: Staff[];
    holidays: Holiday[];
    settings: Settings;
    onApplySwap: (staffAId: number, staffBId: number) => void;
    onClose: () => void;
}

export const SwapSuggestions: React.FC<SwapSuggestionsProps> = ({
    day,
    year,
    month,
    schedule,
    staff,
    holidays,
    settings,
    onApplySwap,
    onClose
}) => {
    const ctx = useMemo(() =>
        createConstraintContext(schedule, staff, holidays, settings, year, month),
        [schedule, staff, holidays, settings, year, month]
    );

    // Find shortages for this day
    const shortages = useMemo(() => findShortages(ctx, day), [ctx, day]);

    // Find swap suggestions for each shortage
    const allSuggestions = useMemo(() => {
        const result: { shortage: { pattern: ShiftPatternId; current: number; required: number }; suggestions: SwapSuggestion[] }[] = [];

        for (const shortage of shortages) {
            const suggestions = findSwapSuggestions(ctx, day, shortage.pattern);
            if (suggestions.length > 0) {
                result.push({ shortage, suggestions });
            }
        }

        return result;
    }, [ctx, day, shortages]);

    const getDayName = (d: number) => {
        const date = new Date(year, month - 1, d);
        const names = ['日', '月', '火', '水', '木', '金', '土'];
        return names[date.getDay()];
    };

    if (shortages.length === 0) {
        return (
            <div className="p-4 bg-green-50 rounded-xl border border-green-200">
                <div className="flex items-center gap-2 text-green-700">
                    <CheckCircle className="w-5 h-5" />
                    <span className="font-medium">人員不足はありません</span>
                </div>
                <p className="text-sm text-green-600 mt-1">
                    {month}/{day}({getDayName(day)}) のシフトは問題ありません。
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Lightbulb className="w-5 h-5 text-amber-500" />
                    <h3 className="font-bold text-gray-800">入れ替え提案</h3>
                    <span className="text-sm text-gray-500">
                        {month}/{day}({getDayName(day)})
                    </span>
                </div>
                <button
                    onClick={onClose}
                    className="text-gray-400 hover:text-gray-600 text-xl leading-none"
                >
                    ×
                </button>
            </div>

            {/* Shortages */}
            <div className="flex gap-2 flex-wrap">
                {shortages.map((shortage, i) => (
                    <div
                        key={i}
                        className="px-3 py-1.5 bg-red-50 border border-red-200 rounded-lg text-sm"
                    >
                        <span className="text-red-600 font-medium">{shortage.pattern}シフト</span>
                        <span className="text-red-500 ml-1">
                            {shortage.current}/{shortage.required}名
                        </span>
                    </div>
                ))}
            </div>

            {/* Suggestions */}
            {allSuggestions.length === 0 ? (
                <div className="text-center py-6 text-gray-400">
                    <ArrowLeftRight className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>入れ替え候補が見つかりませんでした</p>
                    <p className="text-xs mt-1">候補者検索から手動で調整してください</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {allSuggestions.map(({ shortage, suggestions }) => (
                        <div key={shortage.pattern} className="space-y-2">
                            <p className="text-xs text-gray-500 font-medium">
                                {shortage.pattern}枠を確保するには:
                            </p>
                            {suggestions.map((suggestion, i) => (
                                <button
                                    key={i}
                                    onClick={() => onApplySwap(suggestion.staffA.id, suggestion.staffB.id)}
                                    className="w-full p-3 bg-white border border-gray-200 rounded-xl hover:border-blue-400 hover:shadow-md transition-all text-left group"
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <ArrowLeftRight className="w-4 h-4 text-blue-500" />
                                            <span className="font-medium text-gray-800">
                                                {suggestion.description}
                                            </span>
                                        </div>
                                        <span className="text-xs text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity">
                                            実行する →
                                        </span>
                                    </div>
                                    <p className="text-xs text-green-600 mt-1 ml-6">
                                        ✓ {suggestion.benefit}
                                    </p>
                                </button>
                            ))}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
