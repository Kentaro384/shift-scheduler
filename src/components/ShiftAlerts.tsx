import React, { useState, useMemo, useRef, useEffect } from 'react';
import { AlertTriangle, CheckCircle, Bell, Calendar, Users, Clock, X } from 'lucide-react';
import type { Staff, ShiftSchedule, ShiftPatternId, Holiday } from '../types';

interface AlertBadgeProps {
    staff: Staff[];
    schedule: ShiftSchedule;
    days: number[];
    year: number;
    month: number;
    holidays: Holiday[];
    minCount: number;
}

type AlertSeverity = 'error' | 'warning' | 'info';

interface Alert {
    id: string;
    type: 'consecutive' | 'understaffed' | 'early_streak' | 'late_streak';
    severity: AlertSeverity;
    title: string;
    description: string;
    icon: React.ReactNode;
}

const WORK_SHIFTS: ShiftPatternId[] = ['A', 'B', 'C', 'D', 'E', 'J'];

// Thresholds
const CONSECUTIVE_DAYS_THRESHOLD = 6; // 6日以上連勤でアラート
const SHIFT_STREAK_THRESHOLD = 2;      // 2日以上連続でアラート

export const AlertBadge: React.FC<AlertBadgeProps> = ({
    staff,
    schedule,
    days,
    year,
    month,
    holidays,
    minCount,
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const alerts = useMemo(() => {
        const alertList: Alert[] = [];
        const getDateStr = (day: number) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

        const targetStaff = staff.filter(s =>
            s.shiftType === 'regular' || s.shiftType === 'backup' || s.shiftType === 'part_time'
        );

        // 1. Check consecutive working days (6+)
        targetStaff.forEach(s => {
            let consecutiveDays = 0;
            let startDay = 0;

            for (let i = 0; i < days.length; i++) {
                const day = days[i];
                const shift = schedule[getDateStr(day)]?.[s.id];
                const isWorking = shift && WORK_SHIFTS.includes(shift as ShiftPatternId);

                if (isWorking) {
                    if (consecutiveDays === 0) startDay = day;
                    consecutiveDays++;
                } else {
                    if (consecutiveDays >= CONSECUTIVE_DAYS_THRESHOLD) {
                        alertList.push({
                            id: `consecutive-${s.id}-${startDay}`,
                            type: 'consecutive',
                            severity: 'error',
                            title: '連勤アラート',
                            description: `${s.name}さんが${consecutiveDays}日連続勤務 (${startDay}日〜${days[i - 1]}日)`,
                            icon: <Clock className="text-red-500" size={16} />,
                        });
                    }
                    consecutiveDays = 0;
                }
            }
            if (consecutiveDays >= CONSECUTIVE_DAYS_THRESHOLD) {
                alertList.push({
                    id: `consecutive-${s.id}-${startDay}-end`,
                    type: 'consecutive',
                    severity: 'error',
                    title: '連勤アラート',
                    description: `${s.name}さんが${consecutiveDays}日連続勤務 (${startDay}日〜${days[days.length - 1]}日)`,
                    icon: <Clock className="text-red-500" size={16} />,
                });
            }
        });

        // 2. Check understaffed days
        days.forEach(day => {
            const dateStr = getDateStr(day);
            const date = new Date(year, month - 1, day);
            const dayOfWeek = date.getDay();
            const isSat = dayOfWeek === 6;
            const isSun = dayOfWeek === 0;
            const isHoliday = holidays.some(h => h.date === dateStr);

            if (!isSat && !isSun && !isHoliday) {
                let count = 0;
                targetStaff.forEach(s => {
                    const shift = schedule[dateStr]?.[s.id];
                    if (shift && WORK_SHIFTS.includes(shift as ShiftPatternId)) {
                        count++;
                    }
                });

                if (count < minCount && count > 0) {
                    alertList.push({
                        id: `understaffed-${day}`,
                        type: 'understaffed',
                        severity: 'warning',
                        title: '人員不足',
                        description: `${month}月${day}日: ${count}人 (必要${minCount}人)`,
                        icon: <Users className="text-amber-500" size={16} />,
                    });
                }
            }
        });

        // 3. Check early shift (A) streaks (2+)
        targetStaff.forEach(s => {
            let streak = 0;
            let startDay = 0;

            for (let i = 0; i < days.length; i++) {
                const day = days[i];
                const shift = schedule[getDateStr(day)]?.[s.id];

                if (shift === 'A') {
                    if (streak === 0) startDay = day;
                    streak++;
                } else {
                    if (streak >= SHIFT_STREAK_THRESHOLD) {
                        alertList.push({
                            id: `early-streak-${s.id}-${startDay}`,
                            type: 'early_streak',
                            severity: 'warning',
                            title: '早番連続',
                            description: `${s.name}さん: A ${streak}日連続`,
                            icon: <Calendar className="text-orange-500" size={16} />,
                        });
                    }
                    streak = 0;
                }
            }
            if (streak >= SHIFT_STREAK_THRESHOLD) {
                alertList.push({
                    id: `early-streak-${s.id}-${startDay}-end`,
                    type: 'early_streak',
                    severity: 'warning',
                    title: '早番連続',
                    description: `${s.name}さん: A ${streak}日連続`,
                    icon: <Calendar className="text-orange-500" size={16} />,
                });
            }
        });

        // 4. Check late shift (J) streaks (2+)
        targetStaff.forEach(s => {
            let streak = 0;
            let startDay = 0;

            for (let i = 0; i < days.length; i++) {
                const day = days[i];
                const shift = schedule[getDateStr(day)]?.[s.id];

                if (shift === 'J') {
                    if (streak === 0) startDay = day;
                    streak++;
                } else {
                    if (streak >= SHIFT_STREAK_THRESHOLD) {
                        alertList.push({
                            id: `late-streak-${s.id}-${startDay}`,
                            type: 'late_streak',
                            severity: 'warning',
                            title: '遅番連続',
                            description: `${s.name}さん: J ${streak}日連続`,
                            icon: <Clock className="text-purple-500" size={16} />,
                        });
                    }
                    streak = 0;
                }
            }
            if (streak >= SHIFT_STREAK_THRESHOLD) {
                alertList.push({
                    id: `late-streak-${s.id}-${startDay}-end`,
                    type: 'late_streak',
                    severity: 'warning',
                    title: '遅番連続',
                    description: `${s.name}さん: J ${streak}日連続`,
                    icon: <Clock className="text-purple-500" size={16} />,
                });
            }
        });

        return alertList;
    }, [staff, schedule, days, year, month, holidays, minCount]);

    const errorCount = alerts.filter(a => a.severity === 'error').length;
    const warningCount = alerts.filter(a => a.severity === 'warning').length;
    const totalCount = alerts.length;
    const hasAlerts = totalCount > 0;

    const getSeverityColor = (severity: AlertSeverity) => {
        switch (severity) {
            case 'error': return 'bg-red-50 border-red-200 text-red-700';
            case 'warning': return 'bg-amber-50 border-amber-200 text-amber-700';
            case 'info': return 'bg-blue-50 border-blue-200 text-blue-700';
        }
    };

    return (
        <div className="relative" ref={dropdownRef}>
            {/* Badge Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`
                    relative flex items-center gap-1 px-3 py-1.5 rounded-full transition-all duration-200
                    ${hasAlerts
                        ? 'bg-red-100 hover:bg-red-200 text-red-700'
                        : 'bg-gray-100 hover:bg-gray-200 text-gray-500'
                    }
                `}
                title={hasAlerts ? `${totalCount}件のアラート` : '問題なし'}
            >
                {hasAlerts ? (
                    <AlertTriangle size={16} className="text-red-500" />
                ) : (
                    <CheckCircle size={16} className="text-green-500" />
                )}
                {hasAlerts && (
                    <span className="text-xs font-bold">{totalCount}</span>
                )}
                {!hasAlerts && (
                    <span className="text-xs font-medium hidden md:inline">OK</span>
                )}
            </button>

            {/* Dropdown */}
            {isOpen && (
                <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-gray-200 z-50 overflow-hidden animate-fade-in-up">
                    {/* Dropdown Header */}
                    <div className={`p-3 flex items-center justify-between ${hasAlerts ? 'bg-red-50' : 'bg-green-50'}`}>
                        <div className="flex items-center gap-2">
                            <Bell size={18} className={hasAlerts ? 'text-red-500' : 'text-green-500'} />
                            <span className="font-bold text-gray-800">
                                {hasAlerts ? (
                                    <>
                                        アラート
                                        {errorCount > 0 && <span className="ml-2 bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">{errorCount}</span>}
                                        {warningCount > 0 && <span className="ml-1 bg-amber-500 text-white text-xs px-2 py-0.5 rounded-full">{warningCount}</span>}
                                    </>
                                ) : (
                                    '✅ 問題なし'
                                )}
                            </span>
                        </div>
                        <button onClick={() => setIsOpen(false)} className="p-1 hover:bg-white/50 rounded-full">
                            <X size={16} />
                        </button>
                    </div>

                    {/* Alert List */}
                    <div className="max-h-64 overflow-y-auto">
                        {hasAlerts ? (
                            <div className="p-2 space-y-1">
                                {alerts.map(alert => (
                                    <div
                                        key={alert.id}
                                        className={`flex items-start gap-2 p-2 rounded-lg border text-sm ${getSeverityColor(alert.severity)}`}
                                    >
                                        {alert.icon}
                                        <div className="flex-1 min-w-0">
                                            <div className="font-bold text-xs">{alert.title}</div>
                                            <div className="text-xs opacity-90 truncate">{alert.description}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="p-4 text-center text-sm text-gray-500">
                                連勤・人員不足・早番/遅番連続などの問題は検出されませんでした。
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

// Re-export with old name for backward compatibility (will be removed)
export const ShiftAlerts = AlertBadge;
