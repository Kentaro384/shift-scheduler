import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import type { Staff, ShiftSchedule, ShiftPatternDefinition, Holiday, TimeRangeSchedule, TimeRange, DailyNotes } from '../types';
import { HOLIDAY_PATTERNS, isTimeRangeStaff, isWorkShiftId } from '../types';
import { getDaysInMonth, getFormattedDate } from './utils';

interface ExportOptions {
    year: number;
    month: number;
    staff: Staff[];
    schedule: ShiftSchedule;
    timeRangeSchedule: TimeRangeSchedule;
    patterns: ShiftPatternDefinition[];
    holidays: Holiday[];
    notes: DailyNotes;
}

// 曜日名
const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'];

// 色定義
const COLORS = {
    saturdayBg: 'CCE5FF',   // 薄い青
    sundayBg: 'FFCCCC',     // 薄いピンク
    headerBg: 'E8E8E8',     // グレー
    legendBg: 'F5F5F5',     // 薄いグレー
    border: '000000',
    staffBg: 'F8FAFC',
    fixedBg: 'FDF2F8',
    timeRangeBg: 'F1F5F9',
    titleBg: 'FFD966',
    titleAccentBg: 'F4B183',
    noteBg: 'FFF2CC',
};

const TAILWIND_BG_COLORS: Record<string, string> = {
    'bg-amber-200': 'FDE68A',
    'bg-sky-200': 'BAE6FD',
    'bg-blue-200': 'BFDBFE',
    'bg-indigo-200': 'C7D2FE',
    'bg-orange-200': 'FED7AA',
    'bg-purple-200': 'E9D5FF',
    'bg-teal-200': '99F6E4',
    'bg-emerald-100': 'D1FAE5',
    'bg-pink-200': 'FBCFE8',
    'bg-rose-100': 'FFE4E6',
    'bg-sky-100': 'E0F2FE',
    'bg-slate-100': 'F1F5F9',
    'bg-gray-100': 'F3F4F6',
};

function getTailwindFill(colorClass: string | undefined, fallback: string): string {
    return colorClass ? (TAILWIND_BG_COLORS[colorClass] || fallback) : fallback;
}

function getDayFill(year: number, month: number, day: number, holidays: Holiday[]): string | null {
    const date = new Date(year, month - 1, day);
    const dow = date.getDay();
    const dateStr = getFormattedDate(year, month, day);
    if (dow === 0 || holidays.some(h => h.date === dateStr)) return COLORS.sundayBg;
    if (dow === 6) return COLORS.saturdayBg;
    return null;
}

function getTimeRangeForStaff(
    timeRangeSchedule: TimeRangeSchedule,
    dateStr: string,
    staffId: number
): TimeRange | undefined {
    const dateRanges = (timeRangeSchedule[dateStr] || {}) as Record<string | number, TimeRange>;
    return dateRanges[staffId] || dateRanges[String(staffId)];
}

function getShiftFill(shift: string, patterns: ShiftPatternDefinition[]): string | null {
    const pattern = patterns.find(p => p.id === shift);
    if (pattern) return getTailwindFill(pattern.color, COLORS.legendBg);
    const fixed = HOLIDAY_PATTERNS.find(p => p.id === shift);
    if (fixed && shift !== '休') return getTailwindFill(fixed.color, COLORS.fixedBg);
    return null;
}

function applyThinBorder(cell: ExcelJS.Cell): void {
    cell.border = {
        top: { style: 'thin', color: { argb: COLORS.border } },
        left: { style: 'thin', color: { argb: COLORS.border } },
        bottom: { style: 'thin', color: { argb: COLORS.border } },
        right: { style: 'thin', color: { argb: COLORS.border } },
    };
}

function applyMediumBorder(cell: ExcelJS.Cell): void {
    cell.border = {
        top: { style: 'medium', color: { argb: COLORS.border } },
        left: { style: 'medium', color: { argb: COLORS.border } },
        bottom: { style: 'medium', color: { argb: COLORS.border } },
        right: { style: 'medium', color: { argb: COLORS.border } },
    };
}

function setSolidFill(cell: ExcelJS.Cell, color: string): void {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
}

function getNoteText(dateStr: string, notes: DailyNotes, holidays: Holiday[]): string {
    const note = (notes[dateStr] || '').trim();
    const holidayName = holidays.find(h => h.date === dateStr)?.name || '';
    if (note && holidayName && note !== holidayName) return `${holidayName}\n${note}`;
    return note || holidayName;
}

function getColumnLetter(col: number): string {
    let letter = '';
    let current = col;
    while (current > 0) {
        const rem = (current - 1) % 26;
        letter = String.fromCharCode(65 + rem) + letter;
        current = Math.floor((current - 1) / 26);
    }
    return letter;
}

export async function exportToExcel(options: ExportOptions): Promise<void> {
    const { year, month, staff, schedule, timeRangeSchedule, patterns, holidays, notes } = options;
    const daysInMonth = getDaysInMonth(year, month);
    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
    const summaryPatternIds = patterns.filter(p => isWorkShiftId(p.id)).map(p => p.id);
    const summaryFixedIds = HOLIDAY_PATTERNS.map(p => p.id);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(`${year}年${month}月`);
    const printLastCol = daysInMonth + 1;
    const summaryStartCol = printLastCol + 2;
    const legendPatterns = patterns.filter(p => isWorkShiftId(p.id));

    worksheet.columns = [
        { width: 18 },
        ...Array.from({ length: daysInMonth }, () => ({ width: 4.8 })),
        { width: 2 },
        ...Array.from({ length: summaryPatternIds.length + summaryFixedIds.length + 1 }, () => ({ width: 4 })),
    ];
    worksheet.views = [{ state: 'frozen', xSplit: 1, ySplit: 5 }];
    worksheet.pageSetup = {
        orientation: 'landscape',
        paperSize: 9,
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 1,
        horizontalCentered: true,
        verticalCentered: false,
        margins: {
            left: 0.15,
            right: 0.15,
            top: 0.25,
            bottom: 0.25,
            header: 0.1,
            footer: 0.1,
        },
    };

    worksheet.mergeCells(1, 1, 1, 2);
    const yearCell = worksheet.getCell(1, 1);
    yearCell.value = year;
    yearCell.font = { bold: true, size: 22 };
    yearCell.alignment = { horizontal: 'center', vertical: 'middle' };
    setSolidFill(yearCell, COLORS.titleBg);

    worksheet.getCell(1, 3).value = '年';
    worksheet.getCell(1, 3).font = { bold: true, size: 18 };
    worksheet.getCell(1, 3).alignment = { horizontal: 'center', vertical: 'middle' };

    worksheet.mergeCells(1, 4, 1, 5);
    const monthCell = worksheet.getCell(1, 4);
    monthCell.value = month;
    monthCell.font = { bold: true, size: 22 };
    monthCell.alignment = { horizontal: 'center', vertical: 'middle' };
    setSolidFill(monthCell, COLORS.titleAccentBg);

    worksheet.getCell(1, 6).value = '月';
    worksheet.getCell(1, 6).font = { bold: true, size: 18 };
    worksheet.getCell(1, 6).alignment = { horizontal: 'center', vertical: 'middle' };

    worksheet.mergeCells(1, 7, 1, Math.min(printLastCol, 11));
    const titleCell = worksheet.getCell(1, 7);
    titleCell.value = '勤務表';
    titleCell.font = { bold: true, size: 20 };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    setSolidFill(titleCell, COLORS.titleBg);
    worksheet.getRow(1).height = 28;

    for (let col = 1; col <= printLastCol; col++) {
        applyMediumBorder(worksheet.getCell(1, col));
    }

    const dateRow = 3;
    const weekdayRow = 4;
    const noteRow = 5;

    [
        { row: dateRow, label: '日付', height: 22 },
        { row: weekdayRow, label: '曜日', height: 22 },
        { row: noteRow, label: '備考', height: 82 },
    ].forEach(({ row, label, height }) => {
        const labelCell = worksheet.getCell(row, 1);
        labelCell.value = label;
        labelCell.font = { bold: true, size: 11 };
        labelCell.alignment = { horizontal: 'center', vertical: 'middle' };
        setSolidFill(labelCell, row === noteRow ? COLORS.noteBg : COLORS.headerBg);
        applyMediumBorder(labelCell);
        worksheet.getRow(row).height = height;
    });

    const summaryHeaders = [...summaryPatternIds, ...summaryFixedIds, '合計'];
    worksheet.getCell(dateRow, summaryStartCol - 1).value = '集計';
    worksheet.getCell(dateRow, summaryStartCol - 1).font = { bold: true, size: 10 };
    worksheet.getCell(dateRow, summaryStartCol - 1).alignment = { horizontal: 'center', vertical: 'middle' };
    setSolidFill(worksheet.getCell(dateRow, summaryStartCol - 1), COLORS.headerBg);
    applyThinBorder(worksheet.getCell(dateRow, summaryStartCol - 1));
    summaryHeaders.forEach((label, idx) => {
        const cell = worksheet.getCell(dateRow, summaryStartCol + idx);
        cell.value = label;
        cell.font = { bold: true, size: 9 };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        setSolidFill(cell, getShiftFill(label, patterns) || COLORS.headerBg);
        applyThinBorder(cell);
    });

    days.forEach((day, idx) => {
        const col = 2 + idx;
        const date = new Date(year, month - 1, day);
        const dow = date.getDay();
        const dateStr = getFormattedDate(year, month, day);
        const holidayName = holidays.find(h => h.date === dateStr)?.name || '';
        const dayFill = getDayFill(year, month, day, holidays);
        const dayFontColor = dow === 0 || holidayName ? 'C00000' : dow === 6 ? '0070C0' : '000000';

        const dateCell = worksheet.getCell(dateRow, col);
        dateCell.value = day;
        dateCell.font = { bold: true, size: 12, color: { argb: dayFontColor } };
        dateCell.alignment = { horizontal: 'center', vertical: 'middle' };

        const weekdayCell = worksheet.getCell(weekdayRow, col);
        weekdayCell.value = DAY_NAMES[dow];
        weekdayCell.font = { bold: true, size: 11, color: { argb: dayFontColor } };
        weekdayCell.alignment = { horizontal: 'center', vertical: 'middle' };

        const noteCell = worksheet.getCell(noteRow, col);
        noteCell.value = getNoteText(dateStr, notes, holidays);
        noteCell.font = { size: 8, color: { argb: '000000' } };
        noteCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true, textRotation: 255 };

        [dateCell, weekdayCell, noteCell].forEach(cell => {
            setSolidFill(cell, dayFill || (cell === noteCell ? COLORS.noteBg : 'FFFFFF'));
            applyMediumBorder(cell);
        });
    });

    let currentRow = 6;
    staff.forEach(s => {
        const row = worksheet.getRow(currentRow);
        row.height = 30;

        const staffCell = worksheet.getCell(currentRow, 1);
        staffCell.value = s.name;
        staffCell.font = { bold: true, size: 11 };
        staffCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        setSolidFill(staffCell, 'FFFFFF');
        applyMediumBorder(staffCell);

        days.forEach((day, idx) => {
            const col = 2 + idx;
            const dateStr = getFormattedDate(year, month, day);
            let shift = schedule[dateStr]?.[s.id] || '';
            const timeRange = getTimeRangeForStaff(timeRangeSchedule, dateStr, s.id);
            const cell = worksheet.getCell(currentRow, col);
            const dayFill = getDayFill(year, month, day, holidays);

            if (shift === '休') shift = '';

            if (!shift && isTimeRangeStaff(s) && timeRange) {
                cell.value = `${timeRange.start}\n${timeRange.end}`;
                cell.font = { size: 8 };
                setSolidFill(cell, COLORS.timeRangeBg);
            } else if (shift) {
                cell.value = shift;
                cell.font = { bold: true, size: shift.length > 1 ? 9 : 11 };
                setSolidFill(cell, getShiftFill(shift, patterns) || 'FFFFFF');
            } else {
                cell.value = '';
                setSolidFill(cell, dayFill || 'FFFFFF');
            }

            cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
            applyMediumBorder(cell);
        });

        const counts: Record<string, number> = {};
        summaryHeaders.forEach(id => counts[id] = 0);
        let totalWorkDays = 0;
        days.forEach(day => {
            const dateStr = getFormattedDate(year, month, day);
            const shift = schedule[dateStr]?.[s.id];
            const timeRange = getTimeRangeForStaff(timeRangeSchedule, dateStr, s.id);
            if (shift) {
                if (counts[shift] !== undefined) counts[shift]++;
                if (isWorkShiftId(shift)) totalWorkDays++;
            } else if (timeRange) {
                totalWorkDays++;
            }
        });

        [...summaryPatternIds, ...summaryFixedIds].forEach((id, idx) => {
            const cell = worksheet.getCell(currentRow, summaryStartCol + idx);
            cell.value = counts[id] || '';
            cell.font = { size: 9 };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            applyThinBorder(cell);
        });
        const totalCell = worksheet.getCell(currentRow, summaryStartCol + summaryPatternIds.length + summaryFixedIds.length);
        totalCell.value = totalWorkDays || '';
        totalCell.font = { bold: true, size: 9 };
        totalCell.alignment = { horizontal: 'center', vertical: 'middle' };
        applyThinBorder(totalCell);

        currentRow++;
    });

    currentRow += 1;
    const patternTitleRow = currentRow;
    worksheet.getCell(patternTitleRow, 1).value = 'シフトパターン';
    worksheet.getCell(patternTitleRow, 1).font = { bold: true, size: 11 };
    worksheet.getCell(patternTitleRow, 1).alignment = { horizontal: 'center', vertical: 'middle' };
    setSolidFill(worksheet.getCell(patternTitleRow, 1), COLORS.headerBg);
    applyMediumBorder(worksheet.getCell(patternTitleRow, 1));

    let legendCol = 2;
    legendPatterns.forEach(pattern => {
        if (legendCol > printLastCol) return;
        const mergeEnd = Math.min(legendCol + 3, printLastCol);
        worksheet.mergeCells(patternTitleRow, legendCol, patternTitleRow, mergeEnd);
        const cell = worksheet.getCell(patternTitleRow, legendCol);
        cell.value = `${pattern.id} ${pattern.timeRange}`;
        cell.font = { bold: true, size: 9 };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        setSolidFill(cell, getTailwindFill(pattern.color, COLORS.legendBg));
        for (let col = legendCol; col <= mergeEnd; col++) {
            applyMediumBorder(worksheet.getCell(patternTitleRow, col));
        }
        legendCol = mergeEnd + 1;
    });
    worksheet.getRow(patternTitleRow).height = 24;

    currentRow++;
    worksheet.mergeCells(currentRow, 1, currentRow, printLastCol);
    const messageCell = worksheet.getCell(currentRow, 1);
    messageCell.value = 'お互いにサポートし合いながら保育していきましょうね！！';
    messageCell.font = { bold: true, size: 11 };
    messageCell.alignment = { horizontal: 'center', vertical: 'middle' };
    setSolidFill(messageCell, COLORS.noteBg);
    for (let col = 1; col <= printLastCol; col++) {
        applyMediumBorder(worksheet.getCell(currentRow, col));
    }
    worksheet.getRow(currentRow).height = 24;

    currentRow++;
    const holidayLegend = HOLIDAY_PATTERNS.filter(pattern => pattern.id !== '休');
    worksheet.getCell(currentRow, 1).value = '固定予定';
    worksheet.getCell(currentRow, 1).font = { bold: true, size: 10 };
    worksheet.getCell(currentRow, 1).alignment = { horizontal: 'center', vertical: 'middle' };
    setSolidFill(worksheet.getCell(currentRow, 1), COLORS.headerBg);
    applyMediumBorder(worksheet.getCell(currentRow, 1));

    legendCol = 2;
    holidayLegend.forEach(pattern => {
        if (legendCol > printLastCol) return;
        const mergeEnd = Math.min(legendCol + 2, printLastCol);
        worksheet.mergeCells(currentRow, legendCol, currentRow, mergeEnd);
        const cell = worksheet.getCell(currentRow, legendCol);
        cell.value = `${pattern.id}: ${pattern.name}`;
        cell.font = { size: 9 };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        setSolidFill(cell, getTailwindFill(pattern.color, COLORS.legendBg));
        for (let col = legendCol; col <= mergeEnd; col++) {
            applyMediumBorder(worksheet.getCell(currentRow, col));
        }
        legendCol = mergeEnd + 1;
    });
    worksheet.getRow(currentRow).height = 22;
    worksheet.pageSetup.printArea = `A1:${getColumnLetter(printLastCol)}${currentRow}`;

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, `勤務表_${year}年${month}月.xlsx`);
}
