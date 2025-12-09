import React, { useState, useMemo } from 'react';
import { AlertTriangle, CheckCircle, ChevronDown, ChevronUp, Bell, Calendar, Users, Clock } from 'lucide-react';
import type { Staff, ShiftSchedule, ShiftPatternId, Holiday } from '../types';

interface ShiftAlertsProps {
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

export const ShiftAlerts: React.FC<ShiftAlertsProps> = ({
    staff,
    schedule,
    days,
    year,
    month,
    holidays,
    minCount,
}) => {
    const [isExpanded, setIsExpanded] = useState(true);

    const alerts = useMemo(() => {
        const alertList: Alert[] = [];
        const getDateStr = (day: number) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

        // Filter to target staff only
        const targetStaff = staff.filter(s =>
            s.shiftType === 'regular' || s.shiftType === 'backup' || s.shiftType === 'part_time'
        );

        // 1. Check consecutive working days (5+)
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
                    if (consecutiveDays >= 5) {
                        alertList.push({
                            id: `consecutive-${s.id}-${startDay}`,
                            type: 'consecutive',
                            severity: 'error',
                            title: '連勤アラート',
                            description: `${s.name}さんが${consecutiveDays}日連続勤務 (${startDay}日〜${days[i - 1]}日)`,
                            icon: <Clock className="text-red-500" size={18} />,
                        });
                    }
                    consecutiveDays = 0;
                }
            }
            // Check end of month
            if (consecutiveDays >= 5) {
                alertList.push({
                    id: `consecutive-${s.id}-${startDay}-end`,
                    type: 'consecutive',
                    severity: 'error',
                    title: '連勤アラート',
                    description: `${s.name}さんが${consecutiveDays}日連続勤務 (${startDay}日〜${days[days.length - 1]}日)`,
                    icon: <Clock className="text-red-500" size={18} />,
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

            // Only check weekdays that are not holidays
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
                        description: `${month}月${day}日: ${count}人 (必要: ${minCount}人, 不足: ${minCount - count}人)`,
                        icon: <Users className="text-amber-500" size={18} />,
                    });
                }
            }
        });

        // 3. Check early shift (A) streaks (3+)
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
                    if (streak >= 3) {
                        alertList.push({
                            id: `early-streak-${s.id}-${startDay}`,
                            type: 'early_streak',
                            severity: 'warning',
                            title: '早番連続',
                            description: `${s.name}さんが早番(A)${streak}日連続 (${startDay}日〜${days[i - 1]}日)`,
                            icon: <Calendar className="text-orange-500" size={18} />,
                        });
                    }
                    streak = 0;
                }
            }
            if (streak >= 3) {
                alertList.push({
                    id: `early-streak-${s.id}-${startDay}-end`,
                    type: 'early_streak',
                    severity: 'warning',
                    title: '早番連続',
                    description: `${s.name}さんが早番(A)${streak}日連続 (${startDay}日〜${days[days.length - 1]}日)`,
                    icon: <Calendar className="text-orange-500" size={18} />,
                });
            }
        });

        // 4. Check late shift (J) streaks (3+)
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
                    if (streak >= 3) {
                        alertList.push({
                            id: `late-streak-${s.id}-${startDay}`,
                            type: 'late_streak',
                            severity: 'warning',
                            title: '遅番連続',
                            description: `${s.name}さんが最遅番(J)${streak}日連続 (${startDay}日〜${days[i - 1]}日)`,
                            icon: <Clock className="text-purple-500" size={18} />,
                        });
                    }
                    streak = 0;
                }
            }
            if (streak >= 3) {
                alertList.push({
                    id: `late-streak-${s.id}-${startDay}-end`,
                    type: 'late_streak',
                    severity: 'warning',
                    title: '遅番連続',
                    description: `${s.name}さんが最遅番(J)${streak}日連続 (${startDay}日〜${days[days.length - 1]}日)`,
                    icon: <Clock className="text-purple-500" size={18} />,
                });
            }
        });

        return alertList;
    }, [staff, schedule, days, year, month, holidays, minCount]);

    const errorCount = alerts.filter(a => a.severity === 'error').length;
    const warningCount = alerts.filter(a => a.severity === 'warning').length;
    const hasAlerts = alerts.length > 0;

    const getSeverityColor = (severity: AlertSeverity) => {
        switch (severity) {
            case 'error': return 'bg-red-50 border-red-200 text-red-700';
            case 'warning': return 'bg-amber-50 border-amber-200 text-amber-700';
            case 'info': return 'bg-blue-50 border-blue-200 text-blue-700';
        }
    };

    return (
        <div className={`mb-4 rounded-2xl shadow-lg border overflow-hidden ${hasAlerts ? 'border-amber-200 bg-amber-50/50' : 'border-green-200 bg-green-50/50'}`}>
            {/* Header */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className={`w-full flex items-center justify-between p-4 transition-all duration-200 ${hasAlerts ? 'hover:bg-amber-100/50' : 'hover:bg-green-100/50'}`}
            >
                <div className="flex items-center gap-3">
                    {hasAlerts ? (
                        <AlertTriangle className="text-amber-500" size={24} />
                    ) : (
                        <CheckCircle className="text-green-500" size={24} />
                    )}
                    <h3 className="text-lg font-bold text-gray-800">
                        {hasAlerts ? (
                            <>
                                <Bell className="inline mr-2 text-amber-500" size={18} />
                                アラート
                                <span className="ml-2 text-sm font-normal">
                                    {errorCount > 0 && <span className="bg-red-500 text-white px-2 py-0.5 rounded-full mr-1">{errorCount}</span>}
                                    {warningCount > 0 && <span className="bg-amber-500 text-white px-2 py-0.5 rounded-full">{warningCount}</span>}
                                </span>
                            </>
                        ) : (
                            <>✅ 問題なし</>
                        )}
                    </h3>
                </div>
                {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </button>

            {/* Content */}
            {isExpanded && hasAlerts && (
                <div className="p-4 pt-0 space-y-2">
                    {alerts.map(alert => (
                        <div
                            key={alert.id}
                            className={`flex items-start gap-3 p-3 rounded-xl border ${getSeverityColor(alert.severity)}`}
                        >
                            {alert.icon}
                            <div>
                                <div className="font-bold text-sm">{alert.title}</div>
                                <div className="text-sm opacity-90">{alert.description}</div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {isExpanded && !hasAlerts && (
                <div className="p-4 pt-0 text-green-700 text-sm">
                    連勤・人員不足・早番/遅番連続などの問題は検出されませんでした。
                </div>
            )}
        </div>
    );
};
