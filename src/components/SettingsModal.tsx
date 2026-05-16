import React, { useState } from 'react';
import type { Settings, ShiftPatternDefinition } from '../types';
import { X, Save, Settings2 } from 'lucide-react';

interface SettingsModalProps {
    settings: Settings;
    patterns: ShiftPatternDefinition[];
    onSave: (settings: Settings) => void;
    onUpdatePatterns: (patterns: ShiftPatternDefinition[]) => void;
    onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ settings, patterns, onSave, onUpdatePatterns, onClose }) => {
    const [form, setForm] = useState<Settings>({ ...settings });
    const [patternsForm, setPatternsForm] = useState<ShiftPatternDefinition[]>([...patterns]);

    const handleSave = () => {
        onSave({
            ...form,
            profileName: form.profileName.trim() || 'デフォルト園',
        });
        onUpdatePatterns(patternsForm);
        onClose();
    };

    const handleNumberChange = (field: keyof Settings, value: string, fallback: number) => {
        const parsed = parseInt(value, 10);
        setForm({ ...form, [field]: Number.isFinite(parsed) ? parsed : fallback });
    };

    const handlePatternChange = (id: string, field: keyof ShiftPatternDefinition, value: any) => {
        setPatternsForm(prev => prev.map(p =>
            p.id === id ? { ...p, [field]: value } : p
        ));
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in-up">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
                <div className="header-gradient p-5 flex justify-between items-center">
                    <h2 className="text-xl font-bold text-white drop-shadow-md flex items-center gap-2"><Settings2 size={22} /> 設定</h2>
                    <button onClick={onClose} className="p-2 bg-white/20 hover:bg-white/40 rounded-full transition-all duration-300 hover:scale-110">
                        <X size={20} className="text-white" />
                    </button>
                </div>

                <div className="flex-1 overflow-auto p-6 space-y-8">
                    {/* Profile Settings */}
                    <section>
                        <h3 className="text-lg font-bold text-gray-800 mb-4 border-b pb-2">園プロファイル</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">園名・プロファイル名</label>
                                <input
                                    className="w-full border rounded p-2"
                                    value={form.profileName}
                                    onChange={e => setForm({ ...form, profileName: e.target.value })}
                                    placeholder="例: 〇〇保育園 2026年度"
                                />
                                <p className="text-xs text-gray-500 mt-1">園や年度が変わったときの識別名です。</p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">年度</label>
                                <input
                                    type="number"
                                    className="w-full border rounded p-2"
                                    value={form.fiscalYear}
                                    onChange={e => handleNumberChange('fiscalYear', e.target.value, new Date().getFullYear())}
                                    min={2000}
                                />
                                <p className="text-xs text-gray-500 mt-1">年度ごとの職員・園児数変更を管理するための基準です。</p>
                            </div>
                        </div>
                    </section>

                    {/* General Settings */}
                    <section>
                        <h3 className="text-lg font-bold text-gray-800 mb-4 border-b pb-2">基本設定</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">平日の最低出勤人数</label>
                                <input
                                    type="number"
                                    className="w-full border rounded p-2"
                                    value={form.weekdayStaffCount}
                                    onChange={e => handleNumberChange('weekdayStaffCount', e.target.value, 8)}
                                    min={1}
                                />
                                <p className="text-xs text-gray-500 mt-1">平日に必要な出勤人数です。調理職員は人数集計から除外されます。</p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">土曜保育の必要人数</label>
                                <input
                                    type="number"
                                    className="w-full border rounded p-2"
                                    value={form.saturdayStaffCount}
                                    onChange={e => handleNumberChange('saturdayStaffCount', e.target.value, 3)}
                                    min={1}
                                />
                                <p className="text-xs text-gray-500 mt-1">土曜日に出勤する必要がある職員の人数です。</p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">主任バックアップ上限（月）</label>
                                <input
                                    type="number"
                                    className="w-full border rounded p-2"
                                    value={form.chiefBackupLimit}
                                    onChange={e => handleNumberChange('chiefBackupLimit', e.target.value, 8)}
                                    min={0}
                                />
                                <p className="text-xs text-gray-500 mt-1">不足時に主任が現場シフトへ入る月間上限です。0にすると自動バックアップを使いません。</p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">土曜日のシフトパターン</label>
                                <select
                                    className="w-full border rounded p-2"
                                    value={form.saturdayShiftPattern}
                                    onChange={e => setForm({ ...form, saturdayShiftPattern: e.target.value as 'A' | 'B' | 'C' | 'D' | 'E' | 'J' })}
                                >
                                    {['A', 'B', 'C', 'D', 'E', 'J'].map(id => {
                                        const pattern = patterns.find(p => p.id === id);
                                        return (
                                            <option key={id} value={id}>
                                                {id}: {pattern?.name || ''} ({pattern?.timeRange || ''})
                                            </option>
                                        );
                                    })}
                                </select>
                                <p className="text-xs text-gray-500 mt-1">土曜日に自動で割り当てられるシフトパターンです。</p>
                            </div>
                        </div>
                    </section>

                    {/* Shift Pattern Settings */}
                    <section>
                        <h3 className="text-lg font-bold text-gray-800 mb-4 border-b pb-2">シフトパターン設定</h3>
                        <div className="space-y-4">
                            {patternsForm.map(p => (
                                <div key={p.id} className="grid grid-cols-12 gap-4 items-center bg-gray-50 p-3 rounded-lg">
                                    <div className="col-span-1 font-bold text-center bg-white border rounded py-1">
                                        {p.id}
                                    </div>
                                    <div className="col-span-3">
                                        <label className="block text-xs text-gray-500">名称</label>
                                        <input
                                            className="w-full border rounded p-1 text-sm"
                                            value={p.name}
                                            onChange={e => handlePatternChange(p.id, 'name', e.target.value)}
                                        />
                                    </div>
                                    <div className="col-span-4">
                                        <label className="block text-xs text-gray-500">時間帯</label>
                                        <input
                                            className="w-full border rounded p-1 text-sm"
                                            value={p.timeRange}
                                            onChange={e => handlePatternChange(p.id, 'timeRange', e.target.value)}
                                        />
                                    </div>
                                    <div className="col-span-4">
                                        <label className="block text-xs text-gray-500">平日最低人数</label>
                                        <input
                                            type="number"
                                            className="w-full border rounded p-1 text-sm"
                                            value={p.minCount}
                                            onChange={e => handlePatternChange(p.id, 'minCount', parseInt(e.target.value))}
                                            min={0}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                </div>

                <div className="p-5 border-t bg-gradient-to-r from-pink-50 to-yellow-50 flex justify-end space-x-3 rounded-b-3xl">
                    <button onClick={onClose} className="px-6 py-2.5 border-2 border-[#FF6B6B] text-[#FF6B6B] rounded-full hover:bg-[#FFF5F5] transition-all duration-300 font-semibold">キャンセル</button>
                    <button onClick={handleSave} className="btn-primary">
                        <Save size={18} />
                        <span>保存</span>
                    </button>
                </div>
            </div>
        </div>
    );
};
