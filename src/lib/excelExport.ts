import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import type { Staff, ShiftSchedule, ShiftPatternDefinition, Holiday } from '../types';
import { getDaysInMonth, getFormattedDate } from './utils';

interface ExportOptions {
    year: number;
    month: number;
    staff: Staff[];
    schedule: ShiftSchedule;
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
};

export async function exportToExcel(options: ExportOptions): Promise<void> {
    const { year, month, staff, schedule, patterns, holidays: _holidays } = options;
    const daysInMonth = getDaysInMonth(year, month);
    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

    // ワークブック作成
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(`${year}年${month}月`);

    // 列幅設定
    const columns: Partial<ExcelJS.Column>[] = [];
    columns.push({ width: 12 }); // 職員名列
    for (let i = 0; i < daysInMonth; i++) {
        columns.push({ width: 4 }); // 日付列
    }
    // 集計列
    const summaryPatternIds = patterns.filter(p => !['休', '振', '有'].includes(p.id)).map(p => p.id);
    for (let i = 0; i < summaryPatternIds.length + 4; i++) { // +4 for 休/振/有/合計
        columns.push({ width: 4 });
    }
    worksheet.columns = columns;

    // ========== 行1-7: 凡例テーブル（右上、26日列から開始） ==========
    const legendStartCol = 26; // 26日の列 = 1(職員名) + 25 = 26
    const legendPatterns = patterns.filter(p => !['休', '振', '有'].includes(p.id));

    // 凡例ヘッダー（行1）
    const legendHeaders = ['シフト', '開始時間', '終了時間', '休憩時間', '勤務時間', '必要人数'];
    legendHeaders.forEach((header, idx) => {
        const cell = worksheet.getCell(1, legendStartCol + idx);
        cell.value = header;
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.headerBg } };
        cell.font = { bold: true, size: 9 };
        cell.alignment = { horizontal: 'center' };
        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });

    // 凡例データ（行2-7）
    legendPatterns.forEach((p, idx) => {
        const rowNum = 2 + idx;
        const [start, end] = p.timeRange.split('-');
        const values = [p.id, start, end, p.breakTime, p.workTime, p.minCount];
        values.forEach((val, colIdx) => {
            const cell = worksheet.getCell(rowNum, legendStartCol + colIdx);
            cell.value = val;
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.legendBg } };
            cell.font = { size: 9 };
            cell.alignment = { horizontal: 'center' };
            cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        });
    });

    // 休暇系凡例（行7以降）
    const holidayLegend = [
        { id: '有', name: '有給休暇' },
        { id: '振', name: '振替休日' },
    ];
    holidayLegend.forEach((h, idx) => {
        const rowNum = 2 + legendPatterns.length + idx;
        const values = [h.id, h.name, '', '', '', ''];
        values.forEach((val, colIdx) => {
            const cell = worksheet.getCell(rowNum, legendStartCol + colIdx);
            cell.value = val;
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.legendBg } };
            cell.font = { size: 9 };
            cell.alignment = { horizontal: 'center' };
            cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
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

        // 土日の背景色
        const date = new Date(year, month - 1, day);
        const dow = date.getDay();
        if (dow === 0) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.sundayBg } };
        } else if (dow === 6) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.saturdayBg } };
        }
    });
    // 集計ヘッダー
    let summaryCol = 2 + daysInMonth;
    summaryPatternIds.forEach(id => {
        worksheet.getCell(dateRow, summaryCol).value = id;
        worksheet.getCell(dateRow, summaryCol).alignment = { horizontal: 'center' };
        worksheet.getCell(dateRow, summaryCol).font = { bold: true };
        summaryCol++;
    });
    ['休', '振', '有', '合計'].forEach(label => {
        worksheet.getCell(dateRow, summaryCol).value = label;
        worksheet.getCell(dateRow, summaryCol).alignment = { horizontal: 'center' };
        worksheet.getCell(dateRow, summaryCol).font = { bold: true };
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

        // 土日の背景色
        if (dow === 0) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.sundayBg } };
            cell.font = { color: { argb: 'FF0000' } };
        } else if (dow === 6) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.saturdayBg } };
            cell.font = { color: { argb: '0000FF' } };
        }
    });

    // ========== 行11: 備考行（空欄） ==========
    const noteRow = 11;
    worksheet.getCell(noteRow, 1).value = '備考';
    // 空欄で出力

    // ========== 行12以降: 職員データ ==========
    let currentRow = 12;
    staff.forEach(s => {
        worksheet.getCell(currentRow, 1).value = s.name;
        worksheet.getCell(currentRow, 1).font = { size: 10 };

        // 各日のシフト
        days.forEach((day, idx) => {
            const dateStr = getFormattedDate(year, month, day);
            let shift = schedule[dateStr]?.[s.id] || '';

            // 「休」は空欄で出力
            if (shift === '休') {
                shift = '';
            }

            const cell = worksheet.getCell(currentRow, 2 + idx);
            cell.value = shift;
            cell.alignment = { horizontal: 'center' };

            // 土日の背景色
            const date = new Date(year, month - 1, day);
            const dow = date.getDay();
            if (dow === 0) {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.sundayBg } };
            } else if (dow === 6) {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.saturdayBg } };
            }
        });

        // シフト別集計
        const counts: Record<string, number> = {};
        summaryPatternIds.forEach(id => counts[id] = 0);
        counts['休'] = 0;
        counts['振'] = 0;
        counts['有'] = 0;

        let totalWorkDays = 0;
        days.forEach(day => {
            const dateStr = getFormattedDate(year, month, day);
            const shift = schedule[dateStr]?.[s.id];
            if (shift) {
                if (counts[shift] !== undefined) {
                    counts[shift]++;
                }
                if (!['休', '振', '有'].includes(shift)) {
                    totalWorkDays++;
                }
            }
        });

        // 集計列
        let colIdx = 2 + daysInMonth;
        summaryPatternIds.forEach(id => {
            const cell = worksheet.getCell(currentRow, colIdx);
            cell.value = counts[id] || 0;
            cell.alignment = { horizontal: 'center' };
            colIdx++;
        });
        // 休/振/有/合計
        worksheet.getCell(currentRow, colIdx).value = counts['休'] || 0;
        worksheet.getCell(currentRow, colIdx).alignment = { horizontal: 'center' };
        colIdx++;
        worksheet.getCell(currentRow, colIdx).value = counts['振'] || 0;
        worksheet.getCell(currentRow, colIdx).alignment = { horizontal: 'center' };
        colIdx++;
        worksheet.getCell(currentRow, colIdx).value = counts['有'] || 0;
        worksheet.getCell(currentRow, colIdx).alignment = { horizontal: 'center' };
        colIdx++;
        worksheet.getCell(currentRow, colIdx).value = totalWorkDays;
        worksheet.getCell(currentRow, colIdx).alignment = { horizontal: 'center' };

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
