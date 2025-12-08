import { getDaysInMonth as getDaysInMonthFns, getDay, format, addDays, subDays, parseISO } from 'date-fns';
import type { Holiday } from '../types';

export const getDaysInMonth = (year: number, month: number): number => {
    return getDaysInMonthFns(new Date(year, month - 1));
};

export const getDayOfWeek = (year: number, month: number, day: number): number => {
    return getDay(new Date(year, month - 1, day));
};

export const getDayName = (dow: number): string => {
    const names = ['日', '月', '火', '水', '木', '金', '土'];
    return names[dow];
};

export const getFormattedDate = (year: number, month: number, day: number): string => {
    return format(new Date(year, month - 1, day), 'yyyy-MM-dd');
};

export const isHoliday = (dateStr: string, holidays: Holiday[]): boolean => {
    return holidays.some(h => h.date === dateStr);
};

export const isWeekend = (year: number, month: number, day: number): boolean => {
    const dow = getDayOfWeek(year, month, day);
    return dow === 0 || dow === 6;
};

export const getPreviousDate = (dateStr: string): string => {
    const date = parseISO(dateStr);
    return format(subDays(date, 1), 'yyyy-MM-dd');
};

export const getNextDate = (dateStr: string): string => {
    const date = parseISO(dateStr);
    return format(addDays(date, 1), 'yyyy-MM-dd');
};
