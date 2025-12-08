import React, { useState } from 'react';
import type { Settings, ShiftPatternDefinition } from '../types';
import { X, Save } from 'lucide-react';

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
        onSave(form);
        onUpdatePatterns(patternsForm);
        onClose();
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
                    <h2 className="text-xl font-bold text-white drop-shadow-md">⚙️ 設定</h2>
                    <button onClick={onClose} className="p-2 bg-white/20 hover:bg-white/40 rounded-full transition-all duration-300 hover:scale-110">
                        <X size={20} className="text-white" />
                    </button>
                </div>

                <div className="flex-1 overflow-auto p-6 space-y-8">
                    {/* General Settings */}
                    <section>
                        <h3 className="text-lg font-bold text-gray-800 mb-4 border-b pb-2">基本設定</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">土曜保育の必要人数</label>
                                <input
                                    type="number"
                                    className="w-full border rounded p-2"
                                    value={form.saturdayStaffCount}
                                    onChange={e => setForm({ ...form, saturdayStaffCount: parseInt(e.target.value) })}
                                    min={1}
                                />
                                <p className="text-xs text-gray-500 mt-1">土曜日に出勤する必要がある職員の人数です。</p>
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
