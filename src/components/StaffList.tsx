import React, { useState } from 'react';
import type { Staff, StaffPosition, StaffShiftType, StaffRole, ShiftPatternDefinition, ShiftPatternId, FloorType, StaffWeekday, TimeRange } from '../types';
import { getStaffAvailableWeekdays, getStaffRoleLabel, isStaffActiveInMonth, normalizeStaffRole, STAFF_ROLE_LABELS, STAFF_WEEKDAY_LABELS, STAFF_WEEKDAYS } from '../types';
import { X, Plus, Edit2, Trash2, Save, Users, ArrowUp, ArrowDown, UserPlus } from 'lucide-react';

interface StaffListProps {
    staff: Staff[];
    patterns: ShiftPatternDefinition[];
    year: number;
    month: number;
    onUpdate: (staff: Staff[]) => void;
    onClose: () => void;
}

const POSITIONS: StaffPosition[] = ['園長', '主任', '保育士', 'パート', '看護師', '調理'];
const SHIFT_TYPES: StaffShiftType[] = ['no_shift', 'backup', 'regular', 'part_time', 'cooking'];
const ROLES: (Exclude<StaffRole, null> | 'null')[] = ['age1', 'age2', 'age3', 'free', 'cooking', 'null'];
const FLOORS: FloorType[] = ['1F', '2F', '3F', 'free', 'none'];

function generateTimeOptions(): string[] {
    const options: string[] = [];
    for (let hour = 7; hour <= 19; hour++) {
        for (let minute = 0; minute < 60; minute += 15) {
            options.push(`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
        }
    }
    return options;
}

const TIME_OPTIONS = generateTimeOptions();

const SHIFT_TYPE_LABELS: Record<StaffShiftType, string> = {
    no_shift: 'シフトなし',
    backup: 'バックアップ',
    regular: '通常シフト',
    part_time: '時間帯固定・入力',
    cooking: '調理',
};

const ROLE_LABELS: Record<Exclude<StaffRole, null> | 'null', string> = { ...STAFF_ROLE_LABELS, null: '指定なし' };

const getMonthStartDate = (year: number, month: number): string => `${year}-${String(month).padStart(2, '0')}-01`;

const getDefaultStaffDraft = (year: number, month: number): Partial<Staff> => ({
    name: '',
    position: '保育士',
    shiftType: 'regular',
    preferredShifts: [],
    weeklyDays: 5,
    role: 'age1',
    incompatibleWith: [],
    earlyShiftLimit: null,
    saturdayOnly: false,
    hasQualification: true,
    employmentStartDate: getMonthStartDate(year, month),
});

export const StaffList: React.FC<StaffListProps> = ({ staff, patterns, year, month, onUpdate, onClose }) => {
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editForm, setEditForm] = useState<Partial<Staff>>({});
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [createForm, setCreateForm] = useState<Partial<Staff>>(() => getDefaultStaffDraft(year, month));
    const isTimeRangeEditable = editForm.shiftType === 'part_time' || editForm.position === '看護師' || editForm.position === '園長';
    const canCountAsShift = editForm.position !== '園長';
    const isEditEmploymentRangeInvalid = Boolean(editForm.employmentStartDate && editForm.employmentEndDate && editForm.employmentStartDate > editForm.employmentEndDate);
    const isCreateEmploymentRangeInvalid = Boolean(createForm.employmentStartDate && createForm.employmentEndDate && createForm.employmentStartDate > createForm.employmentEndDate);

    const removeShiftCounts = (timeRange?: TimeRange): TimeRange | undefined => {
        return timeRange ? { ...timeRange, countAsShifts: [] } : undefined;
    };

    const removeWeeklyShiftCounts = (weeklyRanges?: Partial<Record<StaffWeekday, TimeRange>>): Partial<Record<StaffWeekday, TimeRange>> | undefined => {
        if (!weeklyRanges) return undefined;
        return Object.fromEntries(
            Object.entries(weeklyRanges).map(([weekday, timeRange]) => [weekday, removeShiftCounts(timeRange)])
        ) as Partial<Record<StaffWeekday, TimeRange>>;
    };

    const handleEdit = (s: Staff) => {
        setEditingId(s.id);
        setEditForm({ ...s });
    };

    const normalizeStaffForm = (form: Partial<Staff>): Partial<Staff> => {
        const normalizedName = form.name?.trim();
        const normalizedForm = form.position === '看護師'
            ? { ...form, shiftType: 'part_time' as const, role: null }
            : form.position === '園長'
                ? {
                    ...form,
                    shiftType: 'no_shift' as const,
                    role: null,
                    hasQualification: false,
                    defaultTimeRange: removeShiftCounts(form.defaultTimeRange),
                    weeklyTimeRanges: removeWeeklyShiftCounts(form.weeklyTimeRanges),
                }
            : form.position === '調理'
                ? { ...form, shiftType: 'cooking' as const, role: 'cooking' as const, hasQualification: false }
                : { ...form, role: normalizeStaffRole(form.role || null) };

        return {
            ...normalizedForm,
            name: normalizedName,
            employmentStartDate: normalizedForm.employmentStartDate || '',
            employmentEndDate: normalizedForm.employmentEndDate || '',
        };
    };

    const handleSave = () => {
        if (!editForm.name?.trim()) return;
        if (isEditEmploymentRangeInvalid) return;
        const normalizedForm = normalizeStaffForm(editForm);

        const newStaff = staff.map(s =>
            s.id === editingId ? { ...s, ...normalizedForm } as Staff : s
        );
        onUpdate(newStaff);
        setEditingId(null);
        setEditForm({});
    };

    const handleAdd = () => {
        if (isCreateOpen) return;
        setCreateForm(getDefaultStaffDraft(year, month));
        setEditingId(null);
        setEditForm({});
        setIsCreateOpen(true);
    };

    const handleCreateSave = () => {
        if (!createForm.name?.trim()) return;
        if (isCreateEmploymentRangeInvalid) return;
        const newId = Math.max(...staff.map(s => s.id), 0) + 1;
        const normalizedForm = normalizeStaffForm(createForm);
        const newStaffMember: Staff = {
            id: newId,
            name: normalizedForm.name || '',
            position: '保育士',
            shiftType: 'regular',
            preferredShifts: [],
            weeklyDays: 5,
            role: 'age1',
            incompatibleWith: [],
            earlyShiftLimit: null,
            saturdayOnly: false,
            hasQualification: true,
            ...normalizedForm,
        };
        onUpdate([...staff, newStaffMember]);
        setIsCreateOpen(false);
        setCreateForm(getDefaultStaffDraft(year, month));
        handleEdit(newStaffMember);
    };

    const handleDelete = (id: number) => {
        if (confirm('本当に削除しますか？')) {
            onUpdate(staff.filter(s => s.id !== id));
        }
    };

    const moveStaff = (id: number, direction: -1 | 1) => {
        const currentIndex = staff.findIndex(s => s.id === id);
        const nextIndex = currentIndex + direction;
        if (currentIndex < 0 || nextIndex < 0 || nextIndex >= staff.length) return;

        const reorderedStaff = [...staff];
        [reorderedStaff[currentIndex], reorderedStaff[nextIndex]] = [reorderedStaff[nextIndex], reorderedStaff[currentIndex]];
        onUpdate(reorderedStaff);
    };

    const handleChange = <K extends keyof Staff>(field: K, value: Staff[K]) => {
        if (field === 'position' && value === '園長') {
            setEditForm(prev => ({
                ...prev,
                position: value,
                shiftType: 'no_shift',
                role: null,
                hasQualification: false,
                defaultTimeRange: removeShiftCounts(prev.defaultTimeRange),
                weeklyTimeRanges: removeWeeklyShiftCounts(prev.weeklyTimeRanges),
            }));
            return;
        }
        if (field === 'position' && value === '調理') {
            setEditForm(prev => ({ ...prev, position: value, shiftType: 'cooking', role: 'cooking', hasQualification: false }));
            return;
        }
        if (field === 'position' && value === '看護師') {
            setEditForm(prev => ({ ...prev, position: value, shiftType: 'part_time', role: null, hasQualification: true }));
            return;
        }
        setEditForm(prev => ({ ...prev, [field]: value }));
    };

    const handleCreateChange = <K extends keyof Staff>(field: K, value: Staff[K]) => {
        if (field === 'position' && value === '園長') {
            setCreateForm(prev => ({ ...prev, position: value, shiftType: 'no_shift', role: null, hasQualification: false }));
            return;
        }
        if (field === 'position' && value === '調理') {
            setCreateForm(prev => ({ ...prev, position: value, shiftType: 'cooking', role: 'cooking', hasQualification: false }));
            return;
        }
        if (field === 'position' && value === '看護師') {
            setCreateForm(prev => ({ ...prev, position: value, shiftType: 'part_time', role: null, hasQualification: true }));
            return;
        }
        setCreateForm(prev => ({ ...prev, [field]: value }));
    };

    const getEmploymentStatus = (s: Staff): { label: string; className: string } => {
        if (isStaffActiveInMonth(s, year, month)) {
            return { label: '今月在籍', className: 'bg-emerald-50 text-emerald-700 border-emerald-100' };
        }

        const monthStart = getMonthStartDate(year, month);
        if (s.employmentStartDate && s.employmentStartDate > monthStart) {
            return { label: '未来入職', className: 'bg-sky-50 text-sky-700 border-sky-100' };
        }

        return { label: '期間外', className: 'bg-gray-50 text-gray-500 border-gray-100' };
    };

    const togglePreferredShift = (shiftId: ShiftPatternId) => {
        const current = editForm.preferredShifts || [];
        const updated = current.includes(shiftId)
            ? current.filter(id => id !== shiftId)
            : [...current, shiftId];
        handleChange('preferredShifts', updated);
    };

    const toggleAvailableWeekday = (weekday: StaffWeekday) => {
        const current = getStaffAvailableWeekdays(editForm as Staff);
        const updated = current.includes(weekday)
            ? current.filter(day => day !== weekday)
            : [...current, weekday].sort((a, b) => a - b);
        handleChange('availableWeekdays', updated);
    };

    const toggleIncompatibleStaff = (staffId: number) => {
        const current = editForm.incompatibleWith || [];
        const updated = current.includes(staffId)
            ? current.filter(id => id !== staffId)
            : [...current, staffId];
        handleChange('incompatibleWith', updated);
    };

    const getEditTimeRangeForWeekday = (weekday: StaffWeekday): TimeRange | undefined => {
        const weeklyRanges = editForm.weeklyTimeRanges as Record<string | number, TimeRange | undefined> | undefined;
        return weeklyRanges?.[weekday] || weeklyRanges?.[String(weekday)];
    };

    const setEditTimeRangeForWeekday = (weekday: StaffWeekday, timeRange?: TimeRange) => {
        const current = (editForm.weeklyTimeRanges || {}) as Partial<Record<StaffWeekday, TimeRange>>;
        const updated = { ...current };
        if (timeRange) {
            updated[weekday] = canCountAsShift ? timeRange : { ...timeRange, countAsShifts: [] };
        } else {
            delete updated[weekday];
        }
        handleChange('weeklyTimeRanges', updated);
    };

    const updateWeekdayTimeRange = (weekday: StaffWeekday, patch: Partial<TimeRange>) => {
        const current = getEditTimeRangeForWeekday(weekday) || editForm.defaultTimeRange || { start: '09:00', end: '17:00', countAsShifts: [] };
        setEditTimeRangeForWeekday(weekday, { ...current, ...patch });
    };

    const toggleWeekdayShift = (weekday: StaffWeekday, shiftId: ShiftPatternId) => {
        const current = getEditTimeRangeForWeekday(weekday) || editForm.defaultTimeRange || { start: '09:00', end: '17:00', countAsShifts: [] };
        const currentShifts = current.countAsShifts || [];
        const nextShifts = currentShifts.includes(shiftId)
            ? currentShifts.filter(id => id !== shiftId)
            : [...currentShifts, shiftId];
        setEditTimeRangeForWeekday(weekday, { ...current, countAsShifts: nextShifts });
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in-up">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
                <div className="header-gradient p-5 flex justify-between items-center">
                    <h2 className="text-xl font-bold text-white drop-shadow-md flex items-center gap-2"><Users size={22} /> 職員設定</h2>
                    <button onClick={onClose} className="p-2 bg-white/20 hover:bg-white/40 rounded-full transition-all duration-300 hover:scale-110">
                        <X size={20} className="text-white" />
                    </button>
                </div>

                <div className="flex-1 overflow-auto p-5 bg-gradient-to-br from-pink-50 via-white to-yellow-50">
                    <div className="space-y-4">
                        {staff.map((s, index) => (
                            <div key={s.id} className="bg-white p-4 rounded-2xl shadow-md border border-pink-100 hover:shadow-lg transition-all duration-300">
                                {editingId === s.id ? (
                                    <div className="space-y-4">
                                        <div className="grid grid-cols-12 gap-4">
                                            <div className="col-span-3">
                                                <label className="block text-xs text-gray-500 mb-1">氏名</label>
                                                <input className="w-full border rounded p-2" value={editForm.name || ''} onChange={e => handleChange('name', e.target.value)} />
                                            </div>
                                            <div className="col-span-2">
                                                <label className="block text-xs text-gray-500 mb-1">役職</label>
                                                <select className="w-full border rounded p-2" value={editForm.position} onChange={e => handleChange('position', e.target.value as StaffPosition)}>
                                                    {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
                                                </select>
                                            </div>
                                            <div className="col-span-3">
                                                <label className="block text-xs text-gray-500 mb-1">職員タイプ</label>
                                                <select
                                                    className="w-full border rounded p-2 disabled:bg-gray-100 disabled:text-gray-500"
                                                    value={editForm.position === '看護師' ? 'part_time' : editForm.position === '調理' ? 'cooking' : editForm.position === '園長' ? 'no_shift' : editForm.shiftType}
                                                    onChange={e => handleChange('shiftType', e.target.value as StaffShiftType)}
                                                    disabled={editForm.position === '看護師' || editForm.position === '調理' || editForm.position === '園長'}
                                                >
                                                    {SHIFT_TYPES.map(t => <option key={t} value={t}>{SHIFT_TYPE_LABELS[t]}</option>)}
                                                </select>
                                                {editForm.shiftType === 'part_time' && editForm.position !== '看護師' && (
                                                    <p className="mt-1 text-[11px] text-gray-500">パート以外の保育士にも使えます。シフト表のセルから勤務時間帯を入力します。</p>
                                                )}
                                                {editForm.position === '看護師' && (
                                                    <p className="mt-1 text-[11px] text-gray-500">看護師は時間帯固定・入力として扱います。</p>
                                                )}
                                                {editForm.position === '園長' && (
                                                    <p className="mt-1 text-[11px] text-gray-500">園長は時間指定で入力できますが、人員・有資格者数にはカウントしません。</p>
                                                )}
                                                {editForm.shiftType === 'cooking' && (
                                                    <p className="mt-1 text-[11px] text-gray-500">調理担当は自動生成では変更せず、手入力を保持します。</p>
                                                )}
                                            </div>
                                            <div className="col-span-2">
                                                <label className="block text-xs text-gray-500 mb-1">担当</label>
                                                <select className="w-full border rounded p-2" value={normalizeStaffRole(editForm.role || null) || 'null'} onChange={e => handleChange('role', e.target.value === 'null' ? null : e.target.value as Exclude<StaffRole, null>)}>
                                                    {ROLES.map(r => <option key={r} value={String(r)}>{ROLE_LABELS[r]}</option>)}
                                                </select>
                                            </div>
                                            <div className="col-span-2">
                                                <label className="block text-xs text-gray-500 mb-1">フロア</label>
                                                <select className="w-full border rounded p-2" value={editForm.floor || 'none'} onChange={e => handleChange('floor', e.target.value as FloorType)}>
                                                    {FLOORS.map(f => <option key={f} value={f}>{f === 'none' ? '指定なし' : f === 'free' ? 'フリー' : f}</option>)}
                                                </select>
                                            </div>
                                            <div className="col-span-2">
                                                <label className="block text-xs text-gray-500 mb-1">週勤務上限</label>
                                                <input type="number" className="w-full border rounded p-2" value={editForm.weeklyDays} onChange={e => handleChange('weeklyDays', parseInt(e.target.value))} />
                                            </div>
                                            <div className="col-span-3">
                                                <label className="block text-xs text-gray-500 mb-1">在籍開始日</label>
                                                <input
                                                    type="date"
                                                    className="w-full border rounded p-2"
                                                    value={editForm.employmentStartDate || ''}
                                                    onChange={e => handleChange('employmentStartDate', e.target.value as Staff['employmentStartDate'])}
                                                />
                                            </div>
                                            <div className="col-span-3">
                                                <label className="block text-xs text-gray-500 mb-1">在籍終了日</label>
                                                <input
                                                    type="date"
                                                    className="w-full border rounded p-2"
                                                    value={editForm.employmentEndDate || ''}
                                                    onChange={e => handleChange('employmentEndDate', e.target.value as Staff['employmentEndDate'])}
                                                />
                                            </div>
                                        </div>
                                        {isEditEmploymentRangeInvalid && (
                                            <p className="text-xs font-semibold text-red-600">在籍終了日は在籍開始日以降にしてください。</p>
                                        )}

                                        <div className="flex items-center space-x-6">
                                            <label className="flex items-center space-x-2 cursor-pointer">
                                                <input type="checkbox" className="w-4 h-4" checked={editForm.saturdayOnly || false} onChange={e => handleChange('saturdayOnly', e.target.checked)} />
                                                <span className="text-sm font-medium">土曜専門</span>
                                            </label>
                                            <label className="flex items-center space-x-2 cursor-pointer">
                                                <input type="checkbox" className="w-4 h-4" checked={editForm.hasQualification || false} onChange={e => handleChange('hasQualification', e.target.checked)} />
                                                <span className="text-sm font-medium">資格あり</span>
                                            </label>
                                        </div>

                                        <div>
                                            <label className="block text-xs text-gray-500 mb-2">勤務可能曜日</label>
                                            <div className="flex flex-wrap gap-2">
                                                {STAFF_WEEKDAYS.map(day => (
                                                    <button
                                                        key={day}
                                                        onClick={() => toggleAvailableWeekday(day)}
                                                        disabled={editForm.saturdayOnly && day !== 6}
                                                        className={`w-10 h-9 rounded-lg text-sm font-semibold border transition-all ${(getStaffAvailableWeekdays(editForm as Staff)).includes(day)
                                                            ? 'bg-[#45B7D1] text-white border-[#45B7D1]'
                                                            : 'bg-white text-gray-500 border-gray-200 hover:border-[#FF6B6B]'
                                                            } disabled:opacity-40 disabled:cursor-not-allowed`}
                                                    >
                                                        {STAFF_WEEKDAY_LABELS[day]}
                                                    </button>
                                                ))}
                                            </div>
                                            <p className="mt-1 text-[11px] text-gray-500">未選択に戻したい場合は全曜日を選んでください。土曜専門の場合は土曜のみになります。</p>
                                        </div>

                                        {isTimeRangeEditable && (
                                            <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-3">
                                                <div className="flex items-center justify-between gap-3 mb-3">
                                                    <div>
                                                        <label className="block text-xs text-gray-600 font-semibold">固定勤務パターン</label>
                                                        <p className="text-[11px] text-gray-500">
                                                            {canCountAsShift
                                                                ? '曜日ごとの時間帯と、集計にカウントするシフトを設定します。固定勤務ボタンで月次表へ反映されます。'
                                                                : '園長は曜日ごとの時間帯だけを設定します。固定勤務ボタンで月次表へ反映され、人員・有資格者数にはカウントしません。'}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="space-y-2">
                                                    {STAFF_WEEKDAYS.map(day => {
                                                        const isEnabled = getStaffAvailableWeekdays(editForm as Staff).includes(day);
                                                        const range = getEditTimeRangeForWeekday(day) || editForm.defaultTimeRange;
                                                        const weekdayRange = getEditTimeRangeForWeekday(day);
                                                        return (
                                                            <div key={day} className={`rounded-lg border bg-white p-2 ${isEnabled ? 'border-emerald-100' : 'border-gray-100 opacity-50'}`}>
                                                                <div className="flex flex-wrap items-center gap-2">
                                                                    <div className="w-8 text-sm font-bold text-gray-700">{STAFF_WEEKDAY_LABELS[day]}</div>
                                                                    <button
                                                                        type="button"
                                                                        disabled={!isEnabled}
                                                                        onClick={() => weekdayRange ? setEditTimeRangeForWeekday(day, undefined) : setEditTimeRangeForWeekday(day, range || { start: '09:00', end: '17:00', countAsShifts: [] })}
                                                                        className={`px-2 py-1 rounded border text-xs font-semibold ${weekdayRange ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-500 border-gray-200 hover:border-emerald-400'} disabled:cursor-not-allowed`}
                                                                    >
                                                                        {weekdayRange ? '個別' : '共通'}
                                                                    </button>
                                                                    <select
                                                                        disabled={!isEnabled}
                                                                        value={range?.start || '09:00'}
                                                                        onChange={e => updateWeekdayTimeRange(day, { start: e.target.value })}
                                                                        className="border rounded px-2 py-1 text-xs disabled:bg-gray-100"
                                                                    >
                                                                        {TIME_OPTIONS.map(time => <option key={time} value={time}>{time}</option>)}
                                                                    </select>
                                                                    <span className="text-gray-400">-</span>
                                                                    <select
                                                                        disabled={!isEnabled}
                                                                        value={range?.end || '17:00'}
                                                                        onChange={e => updateWeekdayTimeRange(day, { end: e.target.value })}
                                                                        className="border rounded px-2 py-1 text-xs disabled:bg-gray-100"
                                                                    >
                                                                        {TIME_OPTIONS.filter(time => time > (range?.start || '09:00')).map(time => <option key={time} value={time}>{time}</option>)}
                                                                    </select>
                                                                    {canCountAsShift ? (
                                                                        <div className="flex flex-wrap gap-1">
                                                                            <button
                                                                                type="button"
                                                                                disabled={!isEnabled}
                                                                                onClick={() => updateWeekdayTimeRange(day, { countAsShifts: [] })}
                                                                                title="勤務時間だけ反映し、A〜Fなどのシフト枠にはカウントしません"
                                                                                className={`px-1.5 py-1 rounded border text-[11px] font-bold ${!range?.countAsShifts?.length ? 'bg-gray-700 text-white border-gray-700' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-500'} disabled:cursor-not-allowed`}
                                                                            >
                                                                                割当なし
                                                                            </button>
                                                                            {patterns.map(pattern => {
                                                                                const selected = !!range?.countAsShifts?.includes(pattern.id);
                                                                                return (
                                                                                    <button
                                                                                        key={pattern.id}
                                                                                        type="button"
                                                                                        disabled={!isEnabled}
                                                                                        onClick={() => toggleWeekdayShift(day, pattern.id)}
                                                                                        title={pattern.name}
                                                                                        className={`min-w-7 px-1.5 py-1 rounded border text-[11px] font-bold ${selected ? 'bg-[#FF6B6B] text-white border-[#FF6B6B]' : 'bg-gray-50 text-gray-500 border-gray-200 hover:border-[#FF6B6B]'} disabled:cursor-not-allowed`}
                                                                                    >
                                                                                        {pattern.id}
                                                                                    </button>
                                                                                );
                                                                            })}
                                                                        </div>
                                                                    ) : (
                                                                        <span className="rounded border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] font-semibold text-gray-500">
                                                                            集計対象外
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        <div>
                                            <label className="block text-xs text-gray-500 mb-2">勤務可能シフト</label>
                                            <div className="flex flex-wrap gap-2">
                                                {patterns.map(pattern => {
                                                    const p = pattern.id;
                                                    return (
                                                    <button
                                                        key={p}
                                                        onClick={() => togglePreferredShift(p)}
                                                        title={pattern.name}
                                                        className={`px-4 py-1.5 rounded-full text-sm font-semibold border-2 transition-all duration-300 hover:scale-105 ${(editForm.preferredShifts || []).includes(p)
                                                            ? 'bg-[#45B7D1] text-white border-[#45B7D1]'
                                                            : 'bg-white text-gray-600 border-gray-200 hover:border-[#FF6B6B] hover:text-[#FF6B6B]'
                                                            }`}
                                                    >
                                                        {p}
                                                    </button>
                                                    );
                                                })}
                                            </div>
                                            <p className="mt-1 text-[11px] text-gray-500">未選択なら全シフト可。選択すると自動生成・候補検索では選択したシフトだけに制限します。</p>
                                        </div>

                                        <div>
                                            <label className="block text-xs text-gray-500 mb-2">相性NG (同じシフトを避ける)</label>
                                            <div className="flex flex-wrap gap-2">
                                                {staff.filter(other => other.id !== s.id).map(other => (
                                                    <button
                                                        key={other.id}
                                                        onClick={() => toggleIncompatibleStaff(other.id)}
                                                        className={`px-3 py-1 rounded text-xs font-medium border transition-colors ${(editForm.incompatibleWith || []).includes(other.id)
                                                            ? 'bg-red-100 text-red-700 border-red-300'
                                                            : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                                                            }`}
                                                    >
                                                        {other.name}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="flex justify-end space-x-3 pt-3 border-t border-pink-100">
                                            <button onClick={() => handleDelete(s.id)} className="p-2 text-[#FF6B6B] hover:bg-pink-50 rounded-full transition-all duration-300 hover:scale-110">
                                                <Trash2 size={20} />
                                            </button>
                                            <button onClick={handleSave} disabled={isEditEmploymentRangeInvalid} className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed">
                                                <Save size={18} />
                                                <span>保存</span>
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex justify-between items-start gap-3">
                                        <div className="flex-1 space-y-1">
                                            <div className="flex items-center space-x-3">
                                                <span className="w-7 text-center text-xs font-bold text-gray-400 tabular-nums">{index + 1}</span>
                                                <h3 className="font-bold text-lg">{s.name}</h3>
                                                <span className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-600">{s.position}</span>
                                                <span className={`text-xs px-2 py-1 rounded border ${getEmploymentStatus(s).className}`}>{getEmploymentStatus(s).label}</span>
                                                {s.hasQualification && <span className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded border border-blue-100">資格有</span>}
                                                {s.saturdayOnly && <span className="text-xs bg-orange-50 text-orange-600 px-2 py-1 rounded border border-orange-100">土曜専門</span>}
                                            </div>
                                            <div className="text-sm text-gray-500 flex space-x-4">
                                                <span>タイプ: {SHIFT_TYPE_LABELS[s.shiftType]}</span>
                                                <span>担当: {getStaffRoleLabel(s.role)}</span>
                                                <span>週: {s.weeklyDays}日</span>
                                                <span>曜日: {getStaffAvailableWeekdays(s).map(day => STAFF_WEEKDAY_LABELS[day]).join('')}</span>
                                                {(s.employmentStartDate || s.employmentEndDate) && (
                                                    <span>在籍: {s.employmentStartDate || '指定なし'} - {s.employmentEndDate || '終了日なし'}</span>
                                                )}
                                            </div>
                                            {(s.preferredShifts.length > 0 || s.incompatibleWith.length > 0) && (
                                                <div className="flex space-x-4 mt-2">
                                                    {s.preferredShifts.length > 0 && (
                                                        <div className="text-xs text-gray-500">
                                                            <span className="font-medium mr-1">希望:</span>
                                                            {s.preferredShifts.join(', ')}
                                                        </div>
                                                    )}
                                                    {s.incompatibleWith.length > 0 && (
                                                        <div className="text-xs text-gray-500">
                                                            <span className="font-medium mr-1">NG:</span>
                                                            {s.incompatibleWith.map(id => staff.find(st => st.id === id)?.name).join(', ')}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={() => moveStaff(s.id, -1)}
                                                disabled={index === 0}
                                                title="上へ移動"
                                                className="p-2 text-gray-400 hover:text-[#45B7D1] hover:bg-blue-50 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                            >
                                                <ArrowUp size={18} />
                                            </button>
                                            <button
                                                onClick={() => moveStaff(s.id, 1)}
                                                disabled={index === staff.length - 1}
                                                title="下へ移動"
                                                className="p-2 text-gray-400 hover:text-[#45B7D1] hover:bg-blue-50 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                            >
                                                <ArrowDown size={18} />
                                            </button>
                                            <button onClick={() => handleEdit(s)} title="編集" className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors">
                                                <Edit2 size={20} />
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {isCreateOpen && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
                        <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
                            <div className="header-gradient flex items-center justify-between p-4">
                                <h3 className="flex items-center gap-2 text-lg font-bold text-white">
                                    <UserPlus size={20} />
                                    職員を追加
                                </h3>
                                <button
                                    type="button"
                                    onClick={() => setIsCreateOpen(false)}
                                    className="rounded-full bg-white/20 p-2 text-white transition-colors hover:bg-white/40"
                                >
                                    <X size={18} />
                                </button>
                            </div>
                            <div className="space-y-4 p-4">
                                <div>
                                    <label className="mb-1 block text-xs text-gray-500">氏名</label>
                                    <input
                                        className="w-full rounded border p-2 text-base"
                                        value={createForm.name || ''}
                                        onChange={e => handleCreateChange('name', e.target.value)}
                                        autoFocus
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="mb-1 block text-xs text-gray-500">役職</label>
                                        <select
                                            className="w-full rounded border p-2"
                                            value={createForm.position}
                                            onChange={e => handleCreateChange('position', e.target.value as StaffPosition)}
                                        >
                                            {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-xs text-gray-500">職員タイプ</label>
                                        <select
                                            className="w-full rounded border p-2 disabled:bg-gray-100 disabled:text-gray-500"
                                            value={createForm.position === '看護師' ? 'part_time' : createForm.position === '調理' ? 'cooking' : createForm.position === '園長' ? 'no_shift' : createForm.shiftType}
                                            onChange={e => handleCreateChange('shiftType', e.target.value as StaffShiftType)}
                                            disabled={createForm.position === '看護師' || createForm.position === '調理' || createForm.position === '園長'}
                                        >
                                            {SHIFT_TYPES.map(t => <option key={t} value={t}>{SHIFT_TYPE_LABELS[t]}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="mb-1 block text-xs text-gray-500">在籍開始日</label>
                                        <input
                                            type="date"
                                            className="w-full rounded border p-2"
                                            value={createForm.employmentStartDate || ''}
                                            onChange={e => handleCreateChange('employmentStartDate', e.target.value as Staff['employmentStartDate'])}
                                        />
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-xs text-gray-500">在籍終了日</label>
                                        <input
                                            type="date"
                                            className="w-full rounded border p-2"
                                            value={createForm.employmentEndDate || ''}
                                            onChange={e => handleCreateChange('employmentEndDate', e.target.value as Staff['employmentEndDate'])}
                                        />
                                    </div>
                                </div>
                                {isCreateEmploymentRangeInvalid && (
                                    <p className="text-xs font-semibold text-red-600">在籍終了日は在籍開始日以降にしてください。</p>
                                )}
                                <div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-3">
                                    <button
                                        type="button"
                                        onClick={() => setIsCreateOpen(false)}
                                        className="rounded-full border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50"
                                    >
                                        キャンセル
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleCreateSave}
                                        disabled={!createForm.name?.trim() || isCreateEmploymentRangeInvalid}
                                        className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        <Save size={18} />
                                        <span>保存</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                <div className="p-5 border-t bg-gradient-to-r from-pink-50 to-yellow-50 flex justify-end rounded-b-3xl">
                    <button onClick={handleAdd} className="btn-primary">
                        <Plus size={18} />
                        <span>{isCreateOpen ? '職員を入力中' : '職員を追加'}</span>
                    </button>
                </div>
            </div>
        </div>
    );
};
