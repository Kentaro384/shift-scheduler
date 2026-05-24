import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import type { Staff, ShiftSchedule, ShiftPatternDefinition, Holiday, TimeRangeSchedule, TimeRange, DailyNotes } from '../types';
import { HOLIDAY_PATTERNS, countsAsStaffingShift, getEffectiveWorkShiftId, getStaffAgeGroup, isCookingStaff, isStaffActiveOnDate, isTimeRangeStaff, isWorkShiftId, parseHalfDayLeaveShiftId } from '../types';
import { getDaysInMonth, getFormattedDate } from './utils';
import { getShiftDisplayLabel } from './leaveUtils';

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
    saturdayBg: 'FFCCE5FF',   // 薄い青
    sundayBg: 'FFFFCCCC',     // 薄いピンク
    headerBg: 'FFE8E8E8',     // グレー
    legendBg: 'FFF5F5F5',     // 薄いグレー
    fixedBg: 'FFFDF2F8',
    border: 'FF000000',
    titleBg: 'FFFFC000',
    white: 'FFFFFFFF',
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
    'bg-yellow-100': 'FEF9C3',
    'bg-fuchsia-100': 'FAE8FF',
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
    const pattern = patterns.find(p => p.id === (getEffectiveWorkShiftId(shift) || shift));
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

function applyMediumTopBorder(cell: ExcelJS.Cell): void {
    cell.border = {
        ...(cell.border || {}),
        top: { style: 'medium', color: { argb: COLORS.border } },
    };
}

function setSolidFill(cell: ExcelJS.Cell, color: string): void {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
}

function setNoFill(cell: ExcelJS.Cell): void {
    cell.fill = { type: 'pattern', pattern: 'none' };
}

function font(size: number, bold = false, color = 'FF000000'): Partial<ExcelJS.Font> {
    return { name: 'メイリオ', family: 2, charset: 128, size, bold: bold || undefined, color: { argb: color } };
}

function getNoteText(dateStr: string, notes: DailyNotes): string {
    return (notes[dateStr] || '').trim();
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

function getStaffPrintGroup(staff: Staff): string {
    const ageGroup = getStaffAgeGroup(staff);
    if (ageGroup) return ageGroup;
    if (staff.position === '園長' || staff.position === '主任' || staff.position === '看護師') return 'management';
    if (isCookingStaff(staff)) return 'cooking';
    if (staff.position === 'パート' || isTimeRangeStaff(staff)) return 'part_time';
    return staff.position;
}

export async function exportToExcel(options: ExportOptions): Promise<void> {
    const { year, month, staff, schedule, timeRangeSchedule, patterns, holidays, notes } = options;
    const daysInMonth = getDaysInMonth(year, month);
    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
    const summaryPatternIds = patterns.filter(p => isWorkShiftId(p.id)).map(p => p.id);
    const summaryFixedIds = HOLIDAY_PATTERNS.map(p => p.id).filter(id => id !== '半有');

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(`${year}年${month}月`);
    const printLastCol = daysInMonth + 1;
    const summaryStartCol = printLastCol + 2;
    const legendPatterns = patterns.filter(p => isWorkShiftId(p.id));

    worksheet.columns = [
        { width: 18 },
        ...Array.from({ length: daysInMonth }, () => ({ width: 6.33203125 })),
        { width: 2 },
        ...Array.from({ length: summaryPatternIds.length + summaryFixedIds.length + 1 }, () => ({ width: 4 })),
    ];
    worksheet.views = [{ showGridLines: false }];
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

    const yearCell = worksheet.getCell(1, 1);
    yearCell.value = year;
    yearCell.font = font(24, true);
    yearCell.alignment = { horizontal: 'center', vertical: 'middle' };
    setSolidFill(yearCell, COLORS.titleBg);

    worksheet.getCell(1, 2).value = '年';
    worksheet.getCell(1, 2).font = font(16);
    worksheet.getCell(1, 2).alignment = { horizontal: 'center', vertical: 'middle' };
    setNoFill(worksheet.getCell(1, 2));

    const monthCell = worksheet.getCell(1, 3);
    monthCell.value = month;
    monthCell.font = font(24, true);
    monthCell.alignment = { horizontal: 'center', vertical: 'middle' };
    setSolidFill(monthCell, COLORS.titleBg);

    worksheet.getCell(1, 4).value = '月';
    worksheet.getCell(1, 4).font = font(16);
    worksheet.getCell(1, 4).alignment = { horizontal: 'center', vertical: 'middle' };
    setNoFill(worksheet.getCell(1, 4));

    const titleCell = worksheet.getCell(1, 5);
    titleCell.value = '勤務表';
    titleCell.font = font(16);
    titleCell.alignment = { vertical: 'middle' };
    setNoFill(titleCell);
    worksheet.getRow(1).height = 38;

    const dateRow = 2;
    const weekdayRow = 3;
    const noteRow = 4;

    [
        { row: dateRow, label: '日付', height: 22 },
        { row: weekdayRow, label: '曜日', height: 22 },
        { row: noteRow, label: '備考', height: 82 },
    ].forEach(({ row, label, height }) => {
        const labelCell = worksheet.getCell(row, 1);
        labelCell.value = label;
        labelCell.font = font(11);
        labelCell.alignment = {
            horizontal: 'center',
            vertical: 'middle',
            wrapText: row === noteRow || undefined,
            textRotation: row === noteRow ? 'vertical' : undefined,
        };
        setNoFill(labelCell);
        applyThinBorder(labelCell);
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
        cell.font = font(9, true);
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        setSolidFill(cell, getShiftFill(label, patterns) || COLORS.headerBg);
        applyThinBorder(cell);
    });

    days.forEach((day, idx) => {
        const col = 2 + idx;
        const date = new Date(year, month - 1, day);
        const dow = date.getDay();
        const dateStr = getFormattedDate(year, month, day);
        const isHoliday = holidays.some(h => h.date === dateStr);
        const dayFill = getDayFill(year, month, day, holidays);
        const dayFontColor = dow === 0 || isHoliday ? 'FFC00000' : dow === 6 ? 'FF0070C0' : 'FF000000';

        const dateCell = worksheet.getCell(dateRow, col);
        dateCell.value = day;
        dateCell.font = font(12, false, dayFontColor);
        dateCell.alignment = { horizontal: 'center', vertical: 'middle' };

        const weekdayCell = worksheet.getCell(weekdayRow, col);
        weekdayCell.value = DAY_NAMES[dow];
        weekdayCell.font = font(11, false, dayFontColor);
        weekdayCell.alignment = { horizontal: 'center', vertical: 'middle' };

        const noteCell = worksheet.getCell(noteRow, col);
        noteCell.value = getNoteText(dateStr, notes);
        noteCell.font = font(8);
        noteCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true, textRotation: 'vertical' };

        [dateCell, weekdayCell, noteCell].forEach(cell => {
            if (dayFill) setSolidFill(cell, dayFill);
            else if (cell === noteCell) setNoFill(cell);
            else setSolidFill(cell, COLORS.white);
            applyThinBorder(cell);
        });
    });

    let currentRow = 5;
    staff.forEach((s, index) => {
        const row = worksheet.getRow(currentRow);
        row.height = 30;
        const hasGroupBoundary = index > 0 && getStaffPrintGroup(staff[index - 1]) !== getStaffPrintGroup(s);

        const staffCell = worksheet.getCell(currentRow, 1);
        staffCell.value = s.name;
        staffCell.font = font(14);
        staffCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        setSolidFill(staffCell, COLORS.white);
        applyThinBorder(staffCell);

        days.forEach((day, idx) => {
            const col = 2 + idx;
            const dateStr = getFormattedDate(year, month, day);
            const isActive = isStaffActiveOnDate(s, dateStr);
            const shift = schedule[dateStr]?.[s.id] || '';
            const timeRange = getTimeRangeForStaff(timeRangeSchedule, dateStr, s.id);
            const cell = worksheet.getCell(currentRow, col);
            const dayFill = getDayFill(year, month, day, holidays);

            if (!isActive) {
                cell.value = '';
            } else if (shift === '休') {
                // Match the grid UI: an explicit off day hides any stale time-range entry.
                cell.value = '';
            } else if (!shift && isTimeRangeStaff(s) && timeRange) {
                cell.value = `${timeRange.start}\n${timeRange.end}`;
                cell.font = font(8);
            } else if (shift) {
                const halfDayLeave = parseHalfDayLeaveShiftId(shift);
                cell.value = halfDayLeave
                    ? `${halfDayLeave.baseShift}\n${halfDayLeave.leavePeriod === 'morning' ? '午前休' : '午後休'}`
                    : getShiftDisplayLabel(shift, schedule, s.id, dateStr);
                cell.font = font(halfDayLeave ? 9 : shift === '夏休' ? 11 : 16);
            } else {
                cell.value = '';
            }

            if (dayFill) setSolidFill(cell, dayFill);
            else setNoFill(cell);

            cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
            applyThinBorder(cell);
        });

        const counts: Record<string, number> = {};
        summaryHeaders.forEach(id => counts[id] = 0);
        let totalWorkDays = 0;
        days.forEach(day => {
            const dateStr = getFormattedDate(year, month, day);
            if (!isStaffActiveOnDate(s, dateStr)) return;
            const shift = schedule[dateStr]?.[s.id];
            const timeRange = getTimeRangeForStaff(timeRangeSchedule, dateStr, s.id);
            if (shift) {
                const effectiveShift = getEffectiveWorkShiftId(shift) || shift;
                if (counts[effectiveShift] !== undefined) counts[effectiveShift]++;
                if (parseHalfDayLeaveShiftId(shift) || shift === '半有') {
                    counts['有'] = (counts['有'] || 0) + 0.5;
                }
                if (countsAsStaffingShift(shift, dateStr)) totalWorkDays++;
            } else if (timeRange) {
                timeRange.countAsShifts?.forEach(shiftId => {
                    if (counts[shiftId] !== undefined) counts[shiftId]++;
                });
                totalWorkDays++;
            }
        });

        [...summaryPatternIds, ...summaryFixedIds].forEach((id, idx) => {
            const cell = worksheet.getCell(currentRow, summaryStartCol + idx);
            cell.value = counts[id] || '';
            cell.font = font(9);
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            applyThinBorder(cell);
        });
        const totalCell = worksheet.getCell(currentRow, summaryStartCol + summaryPatternIds.length + summaryFixedIds.length);
        totalCell.value = totalWorkDays || '';
        totalCell.font = font(9, true);
        totalCell.alignment = { horizontal: 'center', vertical: 'middle' };
        applyThinBorder(totalCell);

        if (hasGroupBoundary) {
            for (let col = 1; col <= printLastCol; col++) {
                applyMediumTopBorder(worksheet.getCell(currentRow, col));
            }
        }

        currentRow++;
    });

    currentRow += 1;
    const patternTitleRow = currentRow;
    worksheet.getCell(patternTitleRow, 1).value = 'シフトパターン';
    worksheet.getCell(patternTitleRow, 1).font = font(11);
    worksheet.getCell(patternTitleRow, 1).alignment = { horizontal: 'center', vertical: 'middle' };
    setNoFill(worksheet.getCell(patternTitleRow, 1));
    applyThinBorder(worksheet.getCell(patternTitleRow, 1));

    const topLegendPatterns = legendPatterns.filter(pattern => pattern.id !== "C'");
    let legendCol = 2;
    topLegendPatterns.forEach(pattern => {
        if (legendCol > printLastCol) return;
        const isLast = pattern === topLegendPatterns[topLegendPatterns.length - 1];
        const mergeEnd = Math.min(legendCol + (isLast ? 5 : 4), printLastCol);
        worksheet.mergeCells(patternTitleRow, legendCol, patternTitleRow + (isLast ? 1 : 0), mergeEnd);
        const cell = worksheet.getCell(patternTitleRow, legendCol);
        cell.value = `${pattern.id} ${pattern.timeRange}${pattern.id === 'F' ? '\n（延長保育対応）' : ''}`;
        cell.font = font(11);
        cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: pattern.id === 'F' || undefined };
        setNoFill(cell);
        for (let row = patternTitleRow; row <= patternTitleRow + (isLast ? 1 : 0); row++) {
            for (let col = legendCol; col <= mergeEnd; col++) {
                applyThinBorder(worksheet.getCell(row, col));
            }
        }
        legendCol = mergeEnd + 1;
    });
    worksheet.getRow(patternTitleRow).height = 24;

    currentRow++;
    worksheet.mergeCells(currentRow, 1, currentRow, Math.min(11, printLastCol));
    const messageCell = worksheet.getCell(currentRow, 1);
    messageCell.value = 'お互いにサポートし合いながら保育していきましょうね！';
    messageCell.font = font(11);
    messageCell.alignment = { horizontal: 'left', vertical: 'middle' };
    setNoFill(messageCell);
    for (let col = 1; col <= Math.min(11, printLastCol); col++) {
        applyThinBorder(worksheet.getCell(currentRow, col));
    }

    const standardPlus = legendPatterns.find(pattern => pattern.id === "C'");
    if (standardPlus && printLastCol >= 12) {
        worksheet.mergeCells(currentRow, 12, currentRow, Math.min(16, printLastCol));
        const cell = worksheet.getCell(currentRow, 12);
        cell.value = `${standardPlus.id}  ${standardPlus.timeRange}`;
        cell.font = font(11);
        cell.alignment = { horizontal: 'left', vertical: 'middle' };
        setNoFill(cell);
        for (let col = 12; col <= Math.min(16, printLastCol); col++) {
            applyThinBorder(worksheet.getCell(currentRow, col));
        }
    }

    worksheet.getRow(currentRow).height = 24;
    worksheet.pageSetup.printArea = `A1:${getColumnLetter(printLastCol)}${currentRow}`;

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, `勤務表_${year}年${month}月.xlsx`);
}
