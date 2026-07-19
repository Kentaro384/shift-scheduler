import React, { useEffect } from 'react';
import {
    X, BookOpen, ChevronLeft, ChevronRight, Menu, ChevronDown, Undo2, RotateCcw,
    CalendarCheck, Calendar, Trash2, RefreshCw, AlertTriangle, Download, CheckCircle2,
    Search, ArrowLeftRight, Sparkles, CloudUpload, ShieldCheck, LifeBuoy, HelpCircle,
} from 'lucide-react';
import type { ShiftPatternDefinition } from '../types';
import { SHIFT_PATTERNS, HOLIDAY_PATTERNS } from '../types';
import { getShiftCardClass, getShiftChipClass, getShiftMarker } from '../lib/shiftPalette';

interface HelpPageProps {
    patterns?: ShiftPatternDefinition[];
    onClose: () => void;
}

const NAV_SECTIONS = [
    { id: 'help-can', label: 'できること' },
    { id: 'help-safe', label: 'さわる前に' },
    { id: 'help-screen', label: '画面の見かた' },
    { id: 'help-monthly', label: '毎月の流れ' },
    { id: 'help-edit', label: 'マスの編集' },
    { id: 'help-symbols', label: '記号のいみ' },
    { id: 'help-faq', label: 'こんなときは' },
];

// 固定予定の「使いどころ」説明。UI上の名称と実運用の意味を橋渡しする。
const HOLIDAY_GUIDE: Record<string, string> = {
    '振': '土曜日に出勤した週の、代わりのお休み(振替休日)。土曜出勤の人には自動生成が同じ週に自動でつけてくれます。',
    '有': '有給休暇です。',
    '半有': '半日だけの有給です。「午前だけ休み・午後だけ休み」は、マスの編集画面で勤務の記号と組み合わせて選べます。',
    '夏休': '夏のお休みです(6〜8月、ひとり年度3日まで)。',
    '誕生日休': 'お誕生日のお休みです。表では「誕」と表示されます。',
    '研': '研修に行く日です。',
    '出': '会議などに出席するための出勤です。土曜日につけると、その日の出勤人数にも数えられます(平日は数えません)。',
    '保': 'シフト記号を使わずに「保育に入る」ことを表します。土曜日に会議がある日などに使い、出勤人数にも数えられます。',
    '休': 'ふつうのお休み(公休)です。表では「－」、印刷用のExcelでは空欄になります。',
};

/* ---------- 小さな部品 ---------- */

const SectionTitle: React.FC<{ id: string; num: number; title: string; sub?: string }> = ({ id, num, title, sub }) => (
    <div id={id} className="scroll-mt-32 mb-5">
        <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#FF6B6B] text-lg font-bold text-white shadow-sm">
                {num}
            </span>
            <h2 className="text-xl md:text-2xl font-bold text-gray-800">{title}</h2>
        </div>
        {sub && <p className="mt-2 ml-12 text-[15px] text-gray-500">{sub}</p>}
    </div>
);

const NumBadge: React.FC<{ n: number }> = ({ n }) => (
    <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#FF6B6B] text-[13px] font-bold text-white align-middle">
        {n}
    </span>
);

// 「スクショ風」の枠。ブラウザ窓のような見た目で、中身はアプリ本体と同じスタイルで再現する。
const Figure: React.FC<{ caption?: string; children: React.ReactNode }> = ({ caption, children }) => (
    <div className="my-4">
        <div className="overflow-hidden rounded-xl border border-gray-200 shadow-[0_4px_16px_rgba(0,0,0,0.08)]">
            <div className="flex items-center gap-1.5 border-b border-gray-200 bg-gray-100 px-3 py-2">
                <span className="h-2.5 w-2.5 rounded-full bg-[#FF6B6B] opacity-70" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#F6C343] opacity-70" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#2EC4B6] opacity-70" />
                <span className="ml-2 text-[11px] text-gray-400">画面イメージ</span>
            </div>
            <div className="overflow-x-auto bg-[#F7F8FA] p-3 md:p-4">{children}</div>
        </div>
        {caption && <p className="mt-2 text-[13px] leading-relaxed text-gray-500">{caption}</p>}
    </div>
);

const Callout: React.FC<{ tone?: 'safe' | 'warn' | 'info'; icon?: React.ReactNode; title: string; children: React.ReactNode }> = ({ tone = 'info', icon, title, children }) => {
    const toneClass = tone === 'safe'
        ? 'border-emerald-200 bg-emerald-50'
        : tone === 'warn'
            ? 'border-amber-200 bg-amber-50'
            : 'border-sky-200 bg-sky-50';
    return (
        <div className={`my-4 rounded-xl border p-4 ${toneClass}`}>
            <div className="flex items-center gap-2 font-bold text-gray-800">
                {icon}
                <span>{title}</span>
            </div>
            <div className="mt-1.5 text-[15px] leading-relaxed text-gray-700">{children}</div>
        </div>
    );
};

const StepCard: React.FC<{ num: string; title: string; children: React.ReactNode }> = ({ num, title, children }) => (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 md:p-5 shadow-sm">
        <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#FF6B6B] to-[#FF8A3D] text-lg font-bold text-white shadow">
                {num}
            </span>
            <h3 className="text-lg font-bold text-gray-800">{title}</h3>
        </div>
        <div className="mt-3 text-[15px] leading-relaxed text-gray-700">{children}</div>
    </div>
);

/* ---------- アプリ画面の再現部品 ---------- */

// ヘッダーの月切りかえ
const MockMonthNav: React.FC = () => (
    <div className="inline-flex items-center rounded-full bg-gray-100 p-1">
        <span className="rounded-full p-2 text-gray-600"><ChevronLeft size={18} /></span>
        <span className="mx-3 min-w-[100px] text-center text-base font-bold text-gray-800">2026年 8月</span>
        <span className="rounded-full p-2 text-gray-600"><ChevronRight size={18} /></span>
    </div>
);

// ヘッダー右側のボタン
const MockHeaderPill: React.FC<{ icon: React.ReactNode; label: string; highlight?: boolean }> = ({ icon, label, highlight }) => (
    <span className={`inline-flex items-center gap-1.5 rounded-full border bg-white px-3.5 py-1.5 text-sm font-medium text-gray-600 ${highlight ? 'border-[#FF6B6B] ring-2 ring-[#FF6B6B]/40 text-[#FF6B6B]' : 'border-gray-200'}`}>
        {icon}
        <span>{label}</span>
    </span>
);

const MockHeaderButtons: React.FC<{ highlight?: string }> = ({ highlight }) => (
    <div className="flex flex-wrap items-center gap-2">
        <MockHeaderPill icon={<Menu size={15} />} label="設定" highlight={highlight === '設定'} />
        <MockHeaderPill icon={<Undo2 size={15} />} label="戻す" highlight={highlight === '戻す'} />
        <MockHeaderPill icon={<RotateCcw size={15} />} label="リセット" highlight={highlight === 'リセット'} />
        <MockHeaderPill icon={<HelpCircle size={15} />} label="使い方" highlight={highlight === '使い方'} />
        <span className="ml-1 text-gray-300"><ChevronDown size={14} /></span>
    </div>
);

// 「今月の準備」のボタン1個ぶんの再現
const MockStepButton: React.FC<{
    icon: React.ReactNode;
    label: string;
    note: string;
    state?: 'todo' | 'done' | 'warn' | 'muted';
    highlight?: boolean;
}> = ({ icon, label, note, state = 'todo', highlight }) => {
    const stateClass = state === 'done'
        ? 'border-emerald-100 bg-emerald-50 text-emerald-800'
        : state === 'warn'
            ? 'border-amber-200 bg-amber-50 text-amber-800'
            : state === 'muted'
                ? 'border-gray-200 bg-gray-50 text-gray-400'
                : 'border-gray-200 bg-white text-gray-600';
    return (
        <span className={`inline-flex min-h-[44px] min-w-[104px] max-w-[200px] items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left ${stateClass} ${highlight ? 'ring-2 ring-[#FF6B6B] ring-offset-1' : ''}`}>
            {state === 'done' ? <CheckCircle2 size={16} className="shrink-0 text-emerald-600" /> : icon}
            <span className="min-w-0">
                <span className="block truncate text-xs font-bold">{label}</span>
                <span className="block truncate text-[10px] opacity-75">{note}</span>
            </span>
        </span>
    );
};

// 「今月の準備」パネル全体の再現
const MockSetupPanel: React.FC<{ highlight?: string; numbered?: boolean }> = ({ highlight, numbered }) => {
    const steps = [
        { label: '初期化', note: '入力中', icon: <Trash2 size={16} className="shrink-0" />, state: 'todo' as const },
        { label: '祝日設定', note: '2件', icon: <Calendar size={16} className="shrink-0" />, state: 'done' as const },
        { label: '固定勤務', note: '反映済み', icon: <CalendarCheck size={16} className="shrink-0" />, state: 'done' as const },
        { label: '固定予定', note: '5件', icon: <Calendar size={16} className="shrink-0" />, state: 'muted' as const },
        { label: '自動生成', note: '未生成', icon: <RefreshCw size={16} className="shrink-0" />, state: 'todo' as const },
        { label: '不足確認', note: '2件 要修正', icon: <AlertTriangle size={16} className="shrink-0 text-amber-600" />, state: 'warn' as const },
        { label: 'Excel', note: '未出力', icon: <Download size={16} className="shrink-0" />, state: 'todo' as const },
    ];
    return (
        <div className="rounded-xl border border-[#E5E7EB] bg-[#FDFDFD] p-2.5 shadow-sm">
            <div className="mb-2 flex items-center gap-2">
                <CalendarCheck size={17} className="text-[#10B981]" />
                <span className="text-sm font-bold text-gray-800">今月の準備</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
                {steps.map((step, i) => (
                    <span key={step.label} className="relative inline-flex">
                        <MockStepButton {...step} highlight={highlight === step.label} />
                        {numbered && (
                            <span className="absolute -top-2 -left-2"><NumBadge n={i + 1} /></span>
                        )}
                    </span>
                ))}
            </div>
        </div>
    );
};

// シフト表のマス(通常勤務・固定予定)の再現
const MockCell: React.FC<{ shiftId: string; patterns: ShiftPatternDefinition[] }> = ({ shiftId, patterns }) => {
    if (!shiftId || shiftId === '休') {
        return (
            <div className="mx-auto flex h-8 w-8 items-center justify-center text-sm font-medium text-[#9CA3AF] opacity-60">－</div>
        );
    }
    return (
        <div className={`mx-auto flex h-8 w-9 items-center justify-center gap-0.5 rounded-md text-sm shadow-sm ${getShiftCardClass(shiftId, patterns)}`}>
            <span className="text-[10px] opacity-80">{getShiftMarker(shiftId)}</span>
            <span className="font-medium">{shiftId}</span>
        </div>
    );
};

// 時間で働く職員のマスの再現
const MockTimeCell: React.FC<{ start: string; end: string; chips: string[]; patterns: ShiftPatternDefinition[] }> = ({ start, end, chips, patterns }) => (
    <div className="mx-auto flex w-12 min-h-10 flex-col items-center justify-center rounded-md border border-[#E4DBCA] bg-[#FCFBF7] px-0.5 py-1 text-[8px] font-medium leading-tight text-[#5F5A50] shadow-sm">
        <span>{start}</span>
        <span className="text-[#B3945B]">↓</span>
        <span>{end}</span>
        {chips.length > 0 ? (
            <span className="mt-0.5 flex flex-wrap justify-center gap-[1px]">
                {chips.map(chip => (
                    <span key={chip} className={`rounded-sm px-0.5 font-bold leading-none opacity-80 ${getShiftChipClass(chip, patterns)}`}>{chip}</span>
                ))}
            </span>
        ) : (
            <span className="mt-0.5 text-[7px] leading-none text-amber-600">未割当</span>
        )}
    </div>
);

// 月次シフト表の再現(数人×1週間ぶん)
const MockScheduleTable: React.FC<{ patterns: ShiftPatternDefinition[] }> = ({ patterns }) => {
    const workIds = patterns.filter(p => p.id).map(p => p.id);
    const pid = (i: number) => workIds[i % Math.max(workIds.length, 1)] ?? 'A';
    const days = [
        { d: 3, w: '月' }, { d: 4, w: '火' }, { d: 5, w: '水' }, { d: 6, w: '木' }, { d: 7, w: '金' }, { d: 8, w: '土' },
    ];
    const rows: { name: string; position: string; cells: React.ReactNode[] }[] = [
        {
            name: 'さくら先生', position: '保育士',
            cells: [pid(0), pid(2), '有', pid(2), pid(5), '休'].map((id, i) => <MockCell key={i} shiftId={id} patterns={patterns} />),
        },
        {
            name: 'ひまわり先生', position: '主任',
            cells: [pid(4), '振', pid(2), pid(0), pid(3), pid(0)].map((id, i) => <MockCell key={i} shiftId={id} patterns={patterns} />),
        },
        {
            name: 'すみれ先生', position: 'パート',
            cells: [
                <MockTimeCell key={0} start="08:30" end="17:30" chips={[pid(2)]} patterns={patterns} />,
                <MockTimeCell key={1} start="08:30" end="17:30" chips={[pid(2)]} patterns={patterns} />,
                <MockCell key={2} shiftId="" patterns={patterns} />,
                <MockTimeCell key={3} start="09:00" end="16:00" chips={[]} patterns={patterns} />,
                <MockTimeCell key={4} start="08:30" end="17:30" chips={[pid(2)]} patterns={patterns} />,
                <MockCell key={5} shiftId="" patterns={patterns} />,
            ],
        },
    ];
    return (
        <table className="min-w-[480px] border-collapse overflow-hidden rounded-lg bg-white text-center shadow-sm">
            <thead>
                <tr className="bg-gray-50 text-xs text-gray-500">
                    <th className="border-b border-r border-gray-200 px-2 py-1.5 text-left font-medium">職員</th>
                    {days.map(day => (
                        <th key={day.d} className={`border-b border-r border-gray-200 px-2 py-1.5 font-medium ${day.w === '土' ? 'text-sky-600' : ''}`}>
                            {day.d}<br />({day.w})
                        </th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {rows.map(row => (
                    <tr key={row.name}>
                        <td className="border-b border-r border-gray-100 px-2 py-1 text-left">
                            <span className="block text-sm font-semibold text-gray-700">{row.name}</span>
                            <span className="block text-[10px] text-gray-400">{row.position}</span>
                        </td>
                        {row.cells.map((cell, i) => (
                            <td key={i} className="border-b border-r border-gray-100 px-1 py-1">{cell}</td>
                        ))}
                    </tr>
                ))}
                <tr className="bg-gray-50">
                    <td className="border-r border-gray-100 px-2 py-1.5 text-left text-xs font-bold text-gray-500">出勤人数</td>
                    {[9, 9, <span key="red" className="font-bold text-red-500">7</span>, 9, 10, 5].map((v, i) => (
                        <td key={i} className="border-r border-gray-100 px-1 py-1.5 text-sm font-bold text-gray-600">{v}</td>
                    ))}
                </tr>
            </tbody>
        </table>
    );
};

// マスの編集画面(ShiftEditModal)の簡易再現
const MockEditModal: React.FC<{ patterns: ShiftPatternDefinition[] }> = ({ patterns }) => (
    <div className="mx-auto max-w-sm rounded-2xl border border-gray-200 bg-white p-4 shadow-lg">
        <div className="mb-3 text-center">
            <span className="text-sm font-bold text-gray-800">8月5日(水) さくら先生</span>
        </div>
        <p className="mb-1.5 text-xs font-bold text-gray-500">勤務シフト</p>
        <div className="mb-3 grid grid-cols-4 gap-1.5">
            {patterns.slice(0, 8).map(pattern => (
                <span key={pattern.id} className={`flex flex-col items-center rounded-lg px-1 py-1.5 text-xs shadow-sm ${getShiftCardClass(pattern.id, patterns)}`}>
                    <span className="font-bold">{pattern.id}</span>
                    <span className="text-[9px] opacity-75">{pattern.timeRange}</span>
                </span>
            ))}
        </div>
        <p className="mb-1.5 text-xs font-bold text-gray-500">お休み・予定</p>
        <div className="mb-4 flex flex-wrap gap-1.5">
            {['振', '有', '半有', '研', '出', '保', '休'].map(id => (
                <span key={id} className={`rounded-full px-2.5 py-1 text-xs font-bold ${getShiftChipClass(id, patterns)}`}>
                    {getShiftMarker(id)} {id}
                </span>
            ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
            <span className="flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-600">
                <Search size={15} /> 候補者検索
            </span>
            <span className="flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-600">
                <ArrowLeftRight size={15} /> 入替提案
            </span>
        </div>
    </div>
);

/* ---------- ヘルプページ本体 ---------- */

export const HelpPage: React.FC<HelpPageProps> = ({ patterns, onClose }) => {
    const pats = patterns && patterns.length > 0 ? patterns : SHIFT_PATTERNS;

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [onClose]);

    const scrollTo = (id: string) => {
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    return (
        <div className="fixed inset-0 z-[60] overflow-y-auto bg-[#F7F8FA]" role="dialog" aria-label="使い方ガイド">
            {/* ヘッダー */}
            <div className="sticky top-0 z-10 border-b border-[#E5E7EB] bg-[#FDFDFD]/95 shadow-sm backdrop-blur">
                <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
                    <div className="flex min-w-0 items-center gap-2">
                        <BookOpen size={20} className="shrink-0 text-[#FF6B6B]" />
                        <h1 className="truncate text-base md:text-xl font-bold text-gray-800">使い方ガイド</h1>
                    </div>
                    <button
                        onClick={onClose}
                        className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-600 transition-colors hover:border-[#FF6B6B] hover:text-[#FF6B6B]"
                    >
                        <X size={16} />
                        閉じる
                    </button>
                </div>
                {/* もくじ */}
                <div className="mx-auto max-w-3xl overflow-x-auto px-4 pb-2.5">
                    <div className="flex w-max gap-1.5">
                        {NAV_SECTIONS.map((section, i) => (
                            <button
                                key={section.id}
                                onClick={() => scrollTo(section.id)}
                                className="whitespace-nowrap rounded-full border border-gray-200 bg-white px-3 py-1 text-[13px] font-medium text-gray-600 transition-colors hover:border-[#FF6B6B] hover:text-[#FF6B6B]"
                            >
                                {i + 1}. {section.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <main className="mx-auto max-w-3xl px-4 pb-24 pt-8 text-[15px] leading-relaxed text-gray-700">
                {/* イントロ */}
                <div className="mb-10 rounded-2xl bg-gradient-to-br from-pink-50 via-white to-amber-50 p-5 md:p-6 border border-pink-100">
                    <p className="text-base md:text-lg font-bold text-gray-800">
                        このページは、ShiftPalette の使い方をやさしく説明するガイドです。
                    </p>
                    <p className="mt-2">
                        むずかしい操作はありません。<strong>画面の「今月の準備」を左から順に押していく</strong>だけで、1か月分のシフト表ができあがります。
                        じっくり読まなくても大丈夫。困ったときに「<button onClick={() => scrollTo('help-faq')} className="font-bold text-[#FF6B6B] underline underline-offset-2">こんなときは?</button>」だけ見に来る、という使い方でもOKです。
                    </p>
                </div>

                {/* 1. できること */}
                <section className="mb-12">
                    <SectionTitle id="help-can" num={1} title="このアプリでできること" />
                    <div className="grid gap-3 md:grid-cols-3">
                        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                            <Sparkles size={22} className="mb-2 text-[#FF6B6B]" />
                            <p className="font-bold text-gray-800">シフトを自動で作る</p>
                            <p className="mt-1 text-sm">早番・遅番のルールや人数、お休みの予定をぜんぶ考えて、1か月分のたたき台を自動で組みます。</p>
                        </div>
                        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                            <ArrowLeftRight size={22} className="mb-2 text-[#F6A33D]" />
                            <p className="font-bold text-gray-800">かんたんに手直しする</p>
                            <p className="mt-1 text-sm">気になるマスをタップして直すだけ。「この日に入れる人」を探したり、入れかえ案を出したりもできます。</p>
                        </div>
                        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                            <Download size={22} className="mb-2 text-[#2EC4B6]" />
                            <p className="font-bold text-gray-800">Excelにして配る</p>
                            <p className="mt-1 text-sm">いつもの勤務表の形のExcelファイルがワンタッチで出せます。印刷してそのまま掲示できます。</p>
                        </div>
                    </div>
                </section>

                {/* 2. さわる前に */}
                <section className="mb-12">
                    <SectionTitle id="help-safe" num={2} title="さわる前に、これだけ知っていれば安心" sub="この3つを覚えておけば、こわいことは何もありません。" />
                    <div className="space-y-3">
                        <Callout tone="safe" icon={<CloudUpload size={18} className="text-emerald-600" />} title="保存ボタンはありません(ぜんぶ自動保存)">
                            変更はそのつど自動でクラウドに保存されます。アプリを閉じても消えません。スマホでもパソコンでも、いつでも同じ表が見られます。
                        </Callout>
                        <Callout tone="safe" icon={<Undo2 size={18} className="text-emerald-600" />} title="まちがえても「戻す」で取り消せます">
                            画面右上の「戻す」ボタンを押すと、直前の操作をひとつ取り消せます。うっかり変えてしまっても大丈夫。
                            <div className="mt-2"><MockHeaderButtons highlight="戻す" /></div>
                        </Callout>
                        <Callout tone="safe" icon={<ShieldCheck size={18} className="text-emerald-600" />} title="手で入れた予定は、自動生成しても消えません">
                            有給や研修などを手で入力したあとに「自動生成」を押しても、その予定が勝手に消されたり上書きされたりすることはありません。安心して何度でも自動生成できます。
                        </Callout>
                    </div>
                </section>

                {/* 3. 画面の見かた */}
                <section className="mb-12">
                    <SectionTitle id="help-screen" num={3} title="画面の見かた" />

                    <h3 className="mb-1 font-bold text-gray-800">■ 画面のいちばん上(ヘッダー)</h3>
                    <Figure caption="左の「< >」で表示する月を切りかえます。右のボタンは 設定(職員や祝日の登録)/ 戻す(取り消し)/ リセット(自動生成のやり直し)/ 使い方(このページ)です。">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <MockMonthNav />
                            <MockHeaderButtons />
                        </div>
                    </Figure>

                    <h3 className="mb-1 mt-6 font-bold text-gray-800">■ 「今月の準備」パネル</h3>
                    <Figure caption="毎月の作業ボタンが、やる順番に並んでいます。終わったものは緑色✓になり、直したほうがよいものは黄色⚠で件数が出ます。くわしくは次の「毎月の流れ」で説明します。">
                        <MockSetupPanel numbered />
                    </Figure>

                    <h3 className="mb-1 mt-6 font-bold text-gray-800">■ シフト表</h3>
                    <Figure caption="縦が職員、横が日にちです。色つきのマスが勤務、点線のマスがお休みや予定、「－」はお休み(公休)です。パートさんなど時間で働く人のマスには時刻が出ます。いちばん下の「出勤人数」で、赤い数字は人数が足りない日です。">
                        <MockScheduleTable patterns={pats} />
                    </Figure>
                    <p className="text-sm text-gray-500">
                        ※ 表の下にはこのほか、シフトごとの人数の行や「シフトバランス分析」(誰かに早番・遅番がかたよっていないかのグラフ)もあります。
                    </p>
                </section>

                {/* 4. 毎月の流れ */}
                <section className="mb-12">
                    <SectionTitle id="help-monthly" num={4} title="毎月のシフトづくり 7ステップ" sub="「今月の準備」を左から順に。慣れれば15分くらいでできます。" />
                    <div className="space-y-4">
                        <StepCard num="1" title="来月に切りかえる">
                            画面上部まんなかの「＜ ＞」ボタンで、シフトを作りたい月を表示します。
                            <div className="mt-2"><MockMonthNav /></div>
                        </StepCard>

                        <StepCard num="2" title="祝日をたしかめる">
                            「祝日設定」ボタンを押して、その月の祝日が入っているか確認します。祝日の日にはシフトを組みません。
                            <div className="mt-2"><MockStepButton icon={<Calendar size={16} className="shrink-0" />} label="祝日設定" note="2件" state="done" highlight /></div>
                        </StepCard>

                        <StepCard num="3" title="わかっているお休みを先に入れる">
                            有給・研修・出張など、先にわかっている予定を入れます。<strong>職員のマスをタップ → 予定を選ぶ</strong>だけです。
                            <Callout tone="info" icon={<Sparkles size={17} className="text-sky-600" />} title="先に入れるのがコツ">
                                先に入れておくと、自動生成がその予定を<strong>よけて</strong>シフトを組んでくれます。あとから入れ直す手間が減ります。
                            </Callout>
                        </StepCard>

                        <StepCard num="4" title="パートさんたちの時間をまとめて入れる">
                            「固定勤務」ボタンを押すと、職員設定に登録してある「いつもの勤務時間」が、その月のぜんぶの日にまとめて入ります。
                            <div className="mt-2"><MockStepButton icon={<CalendarCheck size={16} className="shrink-0" />} label="固定勤務" note="4人対象" highlight /></div>
                            <p className="mt-2 text-sm text-gray-500">※ すでに入力ずみの日や、お休みを入れた日は上書きされないので、何度押しても安全です。</p>
                        </StepCard>

                        <StepCard num="5" title="「自動生成」を押す">
                            残りの先生たちのシフトが、ルールを守って自動で組まれます。
                            <div className="mt-2"><MockStepButton icon={<RefreshCw size={16} className="shrink-0" />} label="自動生成" note="未生成" highlight /></div>
                            <p className="mt-2 text-sm text-gray-500">※ 結果が気に入らなければ、もう一度押してやり直せます。手で入れた予定は消えません(→ <button onClick={() => scrollTo('help-faq')} className="font-bold text-[#FF6B6B] underline underline-offset-2">こんなときは?</button>)。</p>
                        </StepCard>

                        <StepCard num="6" title="足りないところをたしかめて、直す">
                            「不足確認」ボタンを押すと、人数が足りない日の一覧が出ます。表の下の<span className="font-bold text-red-500">赤い数字</span>も同じ意味です。
                            <div className="mt-2"><MockStepButton icon={<AlertTriangle size={16} className="shrink-0 text-amber-600" />} label="不足確認" note="2件 要修正" state="warn" highlight /></div>
                            <p className="mt-2">
                                足りない日をタップすると「その日に入れる人」の候補が出るので、選ぶだけで埋められます。
                            </p>
                        </StepCard>

                        <StepCard num="7" title="Excelで出力して、印刷する">
                            「Excel」ボタンを押すと、<strong>勤務表_2026年8月.xlsx</strong> のようなファイルがダウンロードされます。いつもの勤務表と同じ見た目なので、印刷してそのまま配れます。
                            <div className="mt-2"><MockStepButton icon={<Download size={16} className="shrink-0" />} label="Excel" note="未出力" highlight /></div>
                        </StepCard>
                    </div>
                    <Callout tone="warn" icon={<AlertTriangle size={17} className="text-amber-600" />} title="いちばん左の「初期化」は、ふだんは使いません">
                        「初期化」はその月の入力をまるごと白紙に戻すボタンです。最初から作り直したいときだけ使ってください(実行前に年月の入力を求められるので、うっかり押してもすぐには消えません)。
                    </Callout>
                </section>

                {/* 5. マスの編集 */}
                <section className="mb-12">
                    <SectionTitle id="help-edit" num={5} title="マスをタップして直す" sub="自動生成のあとの微調整は、ぜんぶマスのタップから始まります。" />

                    <p className="mb-2">先生のマスをタップすると、この画面が開きます。</p>
                    <Figure caption="上の段からシフトを選ぶか、下の段からお休み・予定を選びます。選んだ瞬間に表へ反映され、自動で保存されます。">
                        <MockEditModal patterns={pats} />
                    </Figure>

                    <div className="mt-4 space-y-3">
                        <div className="rounded-xl border border-gray-200 bg-white p-4">
                            <p className="flex items-center gap-2 font-bold text-gray-800"><Search size={17} className="text-[#FF6B6B]" /> 候補者検索 — 「この日に入れる人」を探す</p>
                            <p className="mt-1 text-sm">その日に勤務できる先生を、ルール(連続勤務・相性・回数のかたよりなど)を守れる順に並べて出してくれます。選ぶだけで配置できます。</p>
                        </div>
                        <div className="rounded-xl border border-gray-200 bg-white p-4">
                            <p className="flex items-center gap-2 font-bold text-gray-800"><ArrowLeftRight size={17} className="text-[#FF6B6B]" /> 入替提案 — ふたりのシフトを入れかえる</p>
                            <p className="mt-1 text-sm">「この先生と誰かを入れかえたい」というとき、ルール違反にならない入れかえの組み合わせを提案してくれます。</p>
                        </div>
                        <div className="rounded-xl border border-gray-200 bg-white p-4">
                            <p className="font-bold text-gray-800">🕐 時間で働く先生(パートさんなど)のマス</p>
                            <p className="mt-1 text-sm">タップすると時刻を入力する画面が開きます。マスに出ている小さな記号バッジは「この時間は、どのシフトの人数として数えているか」の印です。</p>
                        </div>
                    </div>

                    <Callout tone="info" icon={<AlertTriangle size={17} className="text-sky-600" />} title="ルールに合わないときは、お知らせが出ます">
                        「閉園当番の翌日に開園当番」のようなルール違反になる変更をすると、画面に注意が表示されます。うっかり保存してしまっても「戻す」で取り消せます。
                    </Callout>
                </section>

                {/* 6. 記号のいみ */}
                <section className="mb-12">
                    <SectionTitle id="help-symbols" num={6} title="記号と色のいみ" />

                    <h3 className="mb-2 font-bold text-gray-800">■ 勤務シフト</h3>
                    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
                        <table className="w-full min-w-[420px] text-left text-sm">
                            <thead>
                                <tr className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500">
                                    <th className="px-3 py-2 font-medium">記号</th>
                                    <th className="px-3 py-2 font-medium">名前</th>
                                    <th className="px-3 py-2 font-medium">時間</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pats.map(pattern => (
                                    <tr key={pattern.id} className="border-b border-gray-100 last:border-b-0">
                                        <td className="px-3 py-2"><MockCell shiftId={pattern.id} patterns={pats} /></td>
                                        <td className="px-3 py-2 font-medium text-gray-700">{pattern.name}</td>
                                        <td className="px-3 py-2 text-gray-500">{pattern.timeRange}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <h3 className="mb-2 mt-6 font-bold text-gray-800">■ お休み・予定</h3>
                    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
                        <table className="w-full min-w-[420px] text-left text-sm">
                            <thead>
                                <tr className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500">
                                    <th className="px-3 py-2 font-medium">記号</th>
                                    <th className="px-3 py-2 font-medium">名前</th>
                                    <th className="px-3 py-2 font-medium">使いどころ</th>
                                </tr>
                            </thead>
                            <tbody>
                                {HOLIDAY_PATTERNS.map(holiday => (
                                    <tr key={holiday.id} className="border-b border-gray-100 last:border-b-0">
                                        <td className="px-3 py-2 whitespace-nowrap">
                                            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${getShiftChipClass(holiday.id, pats)}`}>
                                                {getShiftMarker(holiday.id)} {holiday.id === '誕生日休' ? '誕' : holiday.id}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2 font-medium text-gray-700 whitespace-nowrap">{holiday.name}</td>
                                        <td className="px-3 py-2 text-gray-600">{HOLIDAY_GUIDE[holiday.id] ?? ''}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <p className="mt-2 text-sm text-gray-500">※ 点線のふちどりが「お休み・予定」、色つきのマスが「勤務」の目印です。</p>
                </section>

                {/* 7. こんなときは */}
                <section className="mb-12">
                    <SectionTitle id="help-faq" num={7} title="こんなときは?" sub="タップすると答えがひらきます。" />
                    <div className="space-y-2.5">
                        {[
                            {
                                q: 'まちがえてシフトを変えてしまった',
                                a: <>画面右上の「戻す」ボタンを押してください。直前の操作をひとつ取り消せます。<div className="mt-2"><MockHeaderButtons highlight="戻す" /></div></>,
                            },
                            {
                                q: '自動生成の結果が気に入らない。やり直したい',
                                a: <>もう一度「自動生成」を押せば、組み直されます。いったんまっさらから組み直したいときは、右上の「リセット」を押してから「自動生成」してください。どちらの場合も、<strong>手で入れたお休みや予定、パートさんの時間はちゃんと残ります。</strong></>,
                            },
                            {
                                q: '今月をまるごと最初からやり直したい',
                                a: <>「今月の準備」いちばん左の「初期化」(または設定メニューの「当月を白紙に戻す」)を使います。まちがい防止のため「2026-08」のように年月を入力すると実行されます。実行前に自動でひかえ(バックアップ)が保存されるので、万が一のときも復元できます。</>,
                            },
                            {
                                q: '人数が足りない日がある',
                                a: <>「不足確認」ボタンか、表の下の<span className="font-bold text-red-500">赤い数字</span>から、足りない日を開いてください。「その日に入れる人」の候補が出るので、選ぶだけで埋められます。</>,
                            },
                            {
                                q: 'ふたりの先生のシフトを入れかえたい',
                                a: <>入れかえたい先生のマスをタップして「入替提案」を押すと、ルール違反にならない入れかえ案が出ます。選ぶだけで両方のマスが入れかわります。</>,
                            },
                            {
                                q: '職員が増えた・退職する',
                                a: <>「設定」→「職員設定」で追加・変更できます。<strong>在籍開始日・終了日</strong>を入れておくと、その期間だけシフト表に表示されます(月の途中の入退職にも対応しています)。</>,
                            },
                            {
                                q: 'パートさんの「いつもの時間」が変わった',
                                a: <>「設定」→「職員設定」でその方のデフォルト勤務時間を直してください。次から「固定勤務」ボタンで新しい時間が入ります。今月のすでに入っている分は、各マスをタップして直してください。</>,
                            },
                            {
                                q: '土曜日に出勤した先生のお休みはどうなる?',
                                a: <>自動生成が、同じ週の平日に「振」(振替休日)を自動でつけます。手動で調整したいときは、マスをタップして「振」を選んでください。</>,
                            },
                            {
                                q: '土曜日に会議がある。保育の人と会議の人を分けたい',
                                a: <>保育に入る先生には「<span className={`rounded-full px-2 py-0.5 text-xs font-bold ${getShiftChipClass('保')}`}>□ 保</span>」、会議に出る先生には「<span className={`rounded-full px-2 py-0.5 text-xs font-bold ${getShiftChipClass('出')}`}>↗ 出</span>」をつけてください。マスをタップして「お休み・予定」から選べます。土曜日はどちらも出勤人数に数えられます。</>,
                            },
                            {
                                q: 'スマホだと表が見づらい',
                                a: <>スマホを<strong>横向き</strong>にすると、表が見やすいレイアウトに切りかわります。じっくり編集するときはパソコンやタブレットがおすすめです。</>,
                            },
                            {
                                q: '「未割当」という黄色い文字が出ている',
                                a: <>パートさんの勤務時間は入っているけれど、「どのシフトの人数として数えるか」が決まっていない、という印です。そのままでも勤務時間としては有効です。人数の集計に含めたいときは、そのマスをタップして集計先のシフトを選んでください。</>,
                            },
                        ].map(item => (
                            <details key={item.q} className="group rounded-xl border border-gray-200 bg-white shadow-sm open:shadow-md">
                                <summary className="flex cursor-pointer list-none items-center gap-2.5 px-4 py-3.5 font-bold text-gray-800 [&::-webkit-details-marker]:hidden">
                                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-pink-100 text-sm font-bold text-[#FF6B6B]">Q</span>
                                    <span className="flex-1">{item.q}</span>
                                    <ChevronDown size={17} className="shrink-0 text-gray-400 transition-transform group-open:rotate-180" />
                                </summary>
                                <div className="border-t border-gray-100 px-4 py-3.5 text-[15px] leading-relaxed text-gray-700">{item.a}</div>
                            </details>
                        ))}
                    </div>
                </section>

                {/* 8. 困ったら */}
                <section>
                    <div className="rounded-2xl border border-pink-100 bg-gradient-to-br from-pink-50 via-white to-amber-50 p-5 md:p-6">
                        <div className="flex items-center gap-2.5">
                            <LifeBuoy size={22} className="text-[#FF6B6B]" />
                            <h2 className="text-lg md:text-xl font-bold text-gray-800">それでも困ったら</h2>
                        </div>
                        <ol className="mt-3 space-y-2">
                            <li className="flex items-start gap-2.5"><NumBadge n={1} /><span>まず右上の「戻す」を押してみる。</span></li>
                            <li className="flex items-start gap-2.5"><NumBadge n={2} /><span>ページを開き直す(再読み込みする)。データは自動保存されているので消えません。</span></li>
                            <li className="flex items-start gap-2.5"><NumBadge n={3} /><span>それでもダメなら、開発者に連絡してください。あわてなくて大丈夫です。</span></li>
                        </ol>
                    </div>
                    <div className="mt-8 text-center">
                        <button
                            onClick={onClose}
                            className="rounded-full bg-[#FF6B6B] px-8 py-3 text-base font-bold text-white shadow-lg transition-transform hover:scale-105 active:scale-95"
                        >
                            ガイドを閉じて、シフト表にもどる
                        </button>
                    </div>
                </section>
            </main>
        </div>
    );
};
