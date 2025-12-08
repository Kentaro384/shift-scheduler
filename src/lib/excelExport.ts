import * as XLSX from 'xlsx';
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

export function exportToExcel(options: ExportOptions): void {
    const { year, month, staff, schedule, patterns, holidays: _holidays } = options;
    const daysInMonth = getDaysInMonth(year, month);
    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

    // ワークブックとシートを作成
    const wb = XLSX.utils.book_new();
    const wsData: (string | number | null)[][] = [];

    // ========== 行1: タイトル行 ==========
    const row1: (string | number | null)[] = [year, '年', month, '月', '勤務表'];
    // 日付列分の空白
    for (let i = 0; i < daysInMonth; i++) row1.push(null);
    // 集計列ヘッダー用の空白
    for (let i = 0; i < 10; i++) row1.push(null);
    // 凡例ヘッダー
    row1.push('シフト', '開始時間', '終了時間', '休憩時間', '勤務時間', '必要人数');
    wsData.push(row1);

    // ========== 行2-7: 凡例データ（右側） ==========
    const legendPatterns = patterns.filter(p => !['休', '振', '有'].includes(p.id));
    for (let i = 0; i < 6; i++) {
        const row: (string | number | null)[] = [];
        // 左側は空白
        for (let j = 0; j < 5 + daysInMonth + 10; j++) row.push(null);
        // 凡例データ
        if (i < legendPatterns.length) {
            const p = legendPatterns[i];
            const [start, end] = p.timeRange.split('-');
            row.push(p.id, start, end, p.breakTime, p.workTime, p.minCount);
        } else {
            // 休暇系
            const holidayLegend = [
                { id: '有', name: '有給休暇' },
                { id: '振', name: '振替休日' },
                { id: '祝', name: '祝日' },
            ];
            if (i - legendPatterns.length < holidayLegend.length) {
                const h = holidayLegend[i - legendPatterns.length];
                row.push(h.id, h.name, null, null, null, null);
            }
        }
        wsData.push(row);
    }

    // ========== 行8: 空行 ==========
    wsData.push([]);

    // ========== 行9: 日付行 ==========
    const dateRow: (string | number | null)[] = ['日付'];
    days.forEach(day => dateRow.push(day));
    // 集計列ヘッダー（空白）
    for (let i = 0; i < 10; i++) dateRow.push(null);
    dateRow.push('シフト別');
    wsData.push(dateRow);

    // ========== 行10: 曜日行 ==========
    const dowRow: (string | number | null)[] = ['曜日'];
    days.forEach(day => {
        const date = new Date(year, month - 1, day);
        dowRow.push(DAY_NAMES[date.getDay()]);
    });
    // 集計列ヘッダー
    patterns.filter(p => !['休', '振', '有'].includes(p.id)).forEach(p => dowRow.push(p.id));
    dowRow.push('休', '振', '有', '合計');
    wsData.push(dowRow);

    // ========== 行11: 備考行（空欄） ==========
    const noteRow: (string | number | null)[] = ['備考'];
    days.forEach(() => noteRow.push(null));
    noteRow.push('出勤日数', null, null, '有給残');
    wsData.push(noteRow);

    // ========== 行12以降: 職員データ ==========
    staff.forEach(s => {
        const row: (string | number | null)[] = [s.name];

        // 各日のシフト
        days.forEach(day => {
            const dateStr = getFormattedDate(year, month, day);
            const shift = schedule[dateStr]?.[s.id] || '';
            row.push(shift);
        });

        // シフト別集計
        const counts: Record<string, number> = {};
        patterns.forEach(p => counts[p.id] = 0);
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

        // A, B, C, D, E, J, 休, 振, 有, 合計
        const summaryPatterns = patterns.filter(p => !['休', '振', '有'].includes(p.id));
        summaryPatterns.forEach(p => row.push(counts[p.id] || 0));
        row.push(counts['休'] || 0);
        row.push(counts['振'] || 0);
        row.push(counts['有'] || 0);
        row.push(totalWorkDays);

        wsData.push(row);
    });

    // ========== 空行 ==========
    wsData.push([]);
    wsData.push([]);

    // ========== フッター: 注釈（空欄） ==========
    wsData.push(['※ 備考欄は手動で入力してください']);
    wsData.push([]);
    wsData.push([]);

    // ワークシートを作成
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // 列幅設定
    const colWidths: { wch: number }[] = [];
    colWidths.push({ wch: 15 }); // 職員名列
    for (let i = 0; i < daysInMonth; i++) {
        colWidths.push({ wch: 4 }); // 日付列
    }
    for (let i = 0; i < 10; i++) {
        colWidths.push({ wch: 5 }); // 集計列
    }
    for (let i = 0; i < 6; i++) {
        colWidths.push({ wch: 10 }); // 凡例列
    }
    ws['!cols'] = colWidths;

    // ワークブックにシートを追加
    XLSX.utils.book_append_sheet(wb, ws, `${year}年${month}月`);

    // ファイル名
    const fileName = `勤務表_${year}年${month}月.xlsx`;

    // ダウンロード
    XLSX.writeFile(wb, fileName);
}
