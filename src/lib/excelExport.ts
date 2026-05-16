import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import type { Staff, ShiftSchedule, ShiftPatternDefinition, Holiday, TimeRangeSchedule, TimeRange } from '../types';
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
}

// 曜日名
const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'];

// 色定義
const COLORS = {
    saturdayBg: 'CCE5FF',   // 薄い青
    sundayBg: 'FFCCCC',     // 薄いピンク
    headerBg: 'E8E8E8',     // グレー
    legendBg: 'F5F5F5',     // 薄いグレー
    border: 'D9DEE7',
    staffBg: 'F8FAFC',
    fixedBg: 'FDF2F8',
    timeRangeBg: 'F1F5F9',
};

const TAILWIND_BG_COLORS: Record<string, string> = {
    'bg-amber-200': 'FDE68A',
    'bg-sky-200': 'BAE6FD',
    'bg-blue-200': 'BFDBFE',
    'bg-indigo-200': 'C7D2FE',
    'bg-orange-200': 'FED7AA',
    'bg-purple-200': 'E9D5FF',
    'bg-teal-200': '99F6E4',
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

export async function exportToExcel(options: ExportOptions): Promise<void> {
    const { year, month, staff, schedule, timeRangeSchedule, patterns, holidays } = options;
    const daysInMonth = getDaysInMonth(year, month);
    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

    // ワークブック作成
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(`${year}年${month}月`);

    // 列幅設定
    const columns: Partial<ExcelJS.Column>[] = [];
    columns.push({ width: 18 }); // 職員名列
    for (let i = 0; i < daysInMonth; i++) {
        columns.push({ width: 5 }); // 日付列
    }
    // 集計列
    const summaryPatternIds = patterns.filter(p => isWorkShiftId(p.id)).map(p => p.id);
    const summaryFixedIds = HOLIDAY_PATTERNS.map(p => p.id);
    for (let i = 0; i < summaryPatternIds.length + summaryFixedIds.length + 1; i++) {
        columns.push({ width: 4 });
    }
    worksheet.columns = columns;
    worksheet.views = [{ state: 'frozen', xSplit: 1, ySplit: 11 }];
    worksheet.pageSetup = {
        orientation: 'landscape',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        horizontalCentered: true,
        margins: {
            left: 0.25,
            right: 0.25,
            top: 0.5,
            bottom: 0.5,
            header: 0.2,
            footer: 0.2,
        },
    };

    // ========== 行1-7: 凡例テーブル（右上、26日列から開始） ==========
    const legendStartCol = 26; // 26日の列 = 1(職員名) + 25 = 26
    const legendPatterns = patterns.filter(p => isWorkShiftId(p.id));

    // 凡例ヘッダー（行1）
    const legendHeaders = ['シフト', '開始時間', '終了時間', '休憩時間', '勤務時間', '必要人数'];
    legendHeaders.forEach((header, idx) => {
        const cell = worksheet.getCell(1, legendStartCol + idx);
        cell.value = header;
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.headerBg } };
        cell.font = { bold: true, size: 9 };
        cell.alignment = { horizontal: 'center' };
        applyThinBorder(cell);
    });

    // 凡例データ（行2-7）
    legendPatterns.forEach((p, idx) => {
        const rowNum = 2 + idx;
        const [start, end] = p.timeRange.split('-');
        const values = [p.id, start, end, p.breakTime, p.workTime, p.minCount];
        values.forEach((val, colIdx) => {
            const cell = worksheet.getCell(rowNum, legendStartCol + colIdx);
            cell.value = val;
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colIdx === 0 ? getTailwindFill(p.color, COLORS.legendBg) : COLORS.legendBg } };
            cell.font = { size: 9 };
            cell.alignment = { horizontal: 'center' };
            applyThinBorder(cell);
        });
    });

    // 休暇系凡例（行7以降）
    const holidayLegend = HOLIDAY_PATTERNS;
    holidayLegend.forEach((h, idx) => {
        const rowNum = 2 + legendPatterns.length + idx;
        const values = [h.id, h.name, '', '', '', ''];
        values.forEach((val, colIdx) => {
            const cell = worksheet.getCell(rowNum, legendStartCol + colIdx);
            cell.value = val;
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colIdx === 0 ? getTailwindFill(h.color, COLORS.legendBg) : COLORS.legendBg } };
            cell.font = { size: 9 };
            cell.alignment = { horizontal: 'center' };
            applyThinBorder(cell);
        });
    });

    // ========== 行8: タイトル行 ==========
    const titleRow = 8;
    worksheet.getCell(titleRow, 1).value = year;
    worksheet.getCell(titleRow, 2).value = '年';
    worksheet.getCell(titleRow, 3).value = month;
    worksheet.getCell(titleRow, 4).value = '月';
    worksheet.getCell(titleRow, 5).value = '勤務表';
    for (let i = 1; i <= 5; i++) {
        worksheet.getCell(titleRow, i).font = { bold: true, size: 12 };
    }

    // ========== 行9: 日付行 ==========
    const dateRow = 9;
    worksheet.getCell(dateRow, 1).value = '日付';
    worksheet.getCell(dateRow, 1).font = { bold: true };
    days.forEach((day, idx) => {
        const cell = worksheet.getCell(dateRow, 2 + idx);
        cell.value = day;
        cell.alignment = { horizontal: 'center' };
        cell.font = { bold: true };

        const fill = getDayFill(year, month, day, holidays);
        if (fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
        applyThinBorder(cell);
    });
    // 集計ヘッダー
    let summaryCol = 2 + daysInMonth;
    summaryPatternIds.forEach(id => {
        worksheet.getCell(dateRow, summaryCol).value = id;
        worksheet.getCell(dateRow, summaryCol).alignment = { horizontal: 'center' };
        worksheet.getCell(dateRow, summaryCol).font = { bold: true };
        worksheet.getCell(dateRow, summaryCol).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: getShiftFill(id, patterns) || COLORS.headerBg } };
        applyThinBorder(worksheet.getCell(dateRow, summaryCol));
        summaryCol++;
    });
    [...summaryFixedIds, '合計'].forEach(label => {
        worksheet.getCell(dateRow, summaryCol).value = label;
        worksheet.getCell(dateRow, summaryCol).alignment = { horizontal: 'center' };
        worksheet.getCell(dateRow, summaryCol).font = { bold: true };
        const fill = getShiftFill(label, patterns);
        if (fill) worksheet.getCell(dateRow, summaryCol).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
        applyThinBorder(worksheet.getCell(dateRow, summaryCol));
        summaryCol++;
    });

    // ========== 行10: 曜日行 ==========
    const dowRow = 10;
    worksheet.getCell(dowRow, 1).value = '曜日';
    worksheet.getCell(dowRow, 1).font = { bold: true };
    days.forEach((day, idx) => {
        const date = new Date(year, month - 1, day);
        const dow = date.getDay();
        const cell = worksheet.getCell(dowRow, 2 + idx);
        cell.value = DAY_NAMES[dow];
        cell.alignment = { horizontal: 'center' };

        const fill = getDayFill(year, month, day, holidays);
        if (fill) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
        }
        if (dow === 0 || holidays.some(h => h.date === getFormattedDate(year, month, day))) {
            cell.font = { color: { argb: 'FF0000' } };
        } else if (dow === 6) {
            cell.font = { color: { argb: '0000FF' } };
        }
        applyThinBorder(cell);
    });

    // ========== 行11: 備考行 ==========
    const noteRow = 11;
    worksheet.getCell(noteRow, 1).value = '備考';
    worksheet.getCell(noteRow, 1).font = { bold: true };
    applyThinBorder(worksheet.getCell(noteRow, 1));
    days.forEach((day, idx) => {
        const dateStr = getFormattedDate(year, month, day);
        const holidayName = holidays.find(h => h.date === dateStr)?.name || '';
        const cell = worksheet.getCell(noteRow, 2 + idx);
        cell.value = holidayName;
        cell.font = { size: 8, color: { argb: '475569' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        const fill = getDayFill(year, month, day, holidays);
        if (fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
        applyThinBorder(cell);
    });

    // ========== 行12以降: 職員データ ==========
    let currentRow = 12;
    staff.forEach(s => {
        const staffCell = worksheet.getCell(currentRow, 1);
        staffCell.value = `${s.name}\n${s.position}`;
        staffCell.font = { size: 10, bold: true };
        staffCell.alignment = { vertical: 'middle', wrapText: true };
        staffCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.staffBg } };
        applyThinBorder(staffCell);
        worksheet.getRow(currentRow).height = 32;

        // 各日のシフト
        days.forEach((day, idx) => {
            const dateStr = getFormattedDate(year, month, day);
            let shift = schedule[dateStr]?.[s.id] || '';
            const timeRange = getTimeRangeForStaff(timeRangeSchedule, dateStr, s.id);

            // 「休」は空欄で出力
            if (shift === '休') {
                shift = '';
            }

            const cell = worksheet.getCell(currentRow, 2 + idx);
            if (!shift && isTimeRangeStaff(s) && timeRange) {
                cell.value = `${timeRange.start}\n↓\n${timeRange.end}`;
                cell.font = { size: 8 };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.timeRangeBg } };
            } else {
                cell.value = shift;
                const shiftFill = getShiftFill(shift, patterns);
                if (shiftFill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: shiftFill } };
            }
            cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

            const dayFill = getDayFill(year, month, day, holidays);
            if (!cell.value && dayFill) {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: dayFill } };
            }
            applyThinBorder(cell);
        });

        // シフト別集計
        const counts: Record<string, number> = {};
        summaryPatternIds.forEach(id => counts[id] = 0);
        counts['休'] = 0;
        summaryFixedIds.forEach(id => counts[id] = 0);

        let totalWorkDays = 0;
        days.forEach(day => {
            const dateStr = getFormattedDate(year, month, day);
            const shift = schedule[dateStr]?.[s.id];
            const timeRange = getTimeRangeForStaff(timeRangeSchedule, dateStr, s.id);
            if (shift) {
                if (counts[shift] !== undefined) {
                    counts[shift]++;
                }
                if (isWorkShiftId(shift)) {
                    totalWorkDays++;
                }
            } else if (timeRange) {
                totalWorkDays++;
            }
        });

        // 集計列
        let colIdx = 2 + daysInMonth;
        summaryPatternIds.forEach(id => {
            const cell = worksheet.getCell(currentRow, colIdx);
            cell.value = counts[id] || 0;
            cell.alignment = { horizontal: 'center' };
            applyThinBorder(cell);
            colIdx++;
        });
        summaryFixedIds.forEach(id => {
            worksheet.getCell(currentRow, colIdx).value = counts[id] || 0;
            worksheet.getCell(currentRow, colIdx).alignment = { horizontal: 'center' };
            applyThinBorder(worksheet.getCell(currentRow, colIdx));
            colIdx++;
        });
        worksheet.getCell(currentRow, colIdx).value = totalWorkDays;
        worksheet.getCell(currentRow, colIdx).alignment = { horizontal: 'center' };
        applyThinBorder(worksheet.getCell(currentRow, colIdx));

        currentRow++;
    });

    // ========== 空行とフッター ==========
    currentRow += 2;
    worksheet.getCell(currentRow, 1).value = '※ 備考欄は手動で入力してください';

    // ファイル出力
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, `勤務表_${year}年${month}月.xlsx`);
}
