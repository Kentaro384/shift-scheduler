import React, { useState } from 'react';
import type { Staff, StaffPosition, StaffShiftType, StaffRole, ShiftPatternId } from '../types';
import { X, Plus, Edit2, Trash2, Save } from 'lucide-react';

interface StaffListProps {
    staff: Staff[];
    onUpdate: (staff: Staff[]) => void;
    onClose: () => void;
}

const POSITIONS: StaffPosition[] = ['園長', '主任', '保育士', 'パート', '調理'];
const SHIFT_TYPES: StaffShiftType[] = ['no_shift', 'backup', 'regular', 'part_time', 'cooking'];
const ROLES: (StaffRole | 'null')[] = ['infant', 'toddler', 'free', 'cooking', 'null'];
const SHIFT_PATTERNS: ShiftPatternId[] = ['A', 'B', 'C', 'D', 'E', 'J'];

export const StaffList: React.FC<StaffListProps> = ({ staff, onUpdate, onClose }) => {
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editForm, setEditForm] = useState<Partial<Staff>>({});

    const handleEdit = (s: Staff) => {
        setEditingId(s.id);
        setEditForm({ ...s });
    };

    const handleSave = () => {
        if (!editForm.name) return;

        const newStaff = staff.map(s =>
            s.id === editingId ? { ...s, ...editForm } as Staff : s
        );
        onUpdate(newStaff);
        setEditingId(null);
        setEditForm({});
    };

    const handleAdd = () => {
        const newId = Math.max(...staff.map(s => s.id), 0) + 1;
        const newStaffMember: Staff = {
            id: newId,
            name: '新規職員',
            position: '保育士',
            shiftType: 'regular',
            preferredShifts: [],
            weeklyDays: 5,
            role: 'infant',
            incompatibleWith: [],
            earlyShiftLimit: null,
            saturdayOnly: false,
            hasQualification: true,
        };
        onUpdate([...staff, newStaffMember]);
        handleEdit(newStaffMember);
    };

    const handleDelete = (id: number) => {
        if (confirm('本当に削除しますか？')) {
            onUpdate(staff.filter(s => s.id !== id));
        }
    };

    const handleChange = (field: keyof Staff, value: any) => {
        setEditForm(prev => ({ ...prev, [field]: value }));
    };

    const togglePreferredShift = (shiftId: ShiftPatternId) => {
        const current = editForm.preferredShifts || [];
        const updated = current.includes(shiftId)
            ? current.filter(id => id !== shiftId)
            : [...current, shiftId];
        handleChange('preferredShifts', updated);
    };

    const toggleIncompatibleStaff = (staffId: number) => {
        const current = editForm.incompatibleWith || [];
        const updated = current.includes(staffId)
            ? current.filter(id => id !== staffId)
            : [...current, staffId];
        handleChange('incompatibleWith', updated);
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in-up">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
                <div className="header-gradient p-5 flex justify-between items-center">
                    <h2 className="text-xl font-bold text-white drop-shadow-md">👥 職員設定</h2>
                    <button onClick={onClose} className="p-2 bg-white/20 hover:bg-white/40 rounded-full transition-all duration-300 hover:scale-110">
                        <X size={20} className="text-white" />
                    </button>
                </div>

                <div className="flex-1 overflow-auto p-5 bg-gradient-to-br from-pink-50 via-white to-yellow-50">
                    <div className="space-y-4">
                        {staff.map(s => (
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
                                                <select className="w-full border rounded p-2" value={editForm.position} onChange={e => handleChange('position', e.target.value)}>
                                                    {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
                                                </select>
                                            </div>
                                            <div className="col-span-3">
                                                <label className="block text-xs text-gray-500 mb-1">職員タイプ</label>
                                                <select className="w-full border rounded p-2" value={editForm.shiftType} onChange={e => handleChange('shiftType', e.target.value)}>
                                                    {SHIFT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                                </select>
                                            </div>
                                            <div className="col-span-2">
                                                <label className="block text-xs text-gray-500 mb-1">担当</label>
                                                <select className="w-full border rounded p-2" value={editForm.role || 'null'} onChange={e => handleChange('role', e.target.value === 'null' ? null : e.target.value)}>
                                                    {ROLES.map(r => <option key={r} value={String(r)}>{r === 'null' ? '指定なし' : r}</option>)}
                                                </select>
                                            </div>
                                            <div className="col-span-2">
                                                <label className="block text-xs text-gray-500 mb-1">週勤務日</label>
                                                <input type="number" className="w-full border rounded p-2" value={editForm.weeklyDays} onChange={e => handleChange('weeklyDays', parseInt(e.target.value))} />
                                            </div>
                                        </div>

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
                                            <label className="block text-xs text-gray-500 mb-2">希望シフト (選択したシフトのみ割り当てられます)</label>
                                            <div className="flex flex-wrap gap-2">
                                                {SHIFT_PATTERNS.map(p => (
                                                    <button
                                                        key={p}
                                                        onClick={() => togglePreferredShift(p)}
                                                        className={`px-4 py-1.5 rounded-full text-sm font-semibold border-2 transition-all duration-300 hover:scale-105 ${(editForm.preferredShifts || []).includes(p)
                                                            ? 'bg-[#45B7D1] text-white border-[#45B7D1]'
                                                            : 'bg-white text-gray-600 border-gray-200 hover:border-[#FF6B6B] hover:text-[#FF6B6B]'
                                                            }`}
                                                    >
                                                        {p}
                                                    </button>
                                                ))}
                                            </div>
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
                                            <button onClick={handleSave} className="btn-primary">
                                                <Save size={18} />
                                                <span>保存</span>
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex justify-between items-start">
                                        <div className="space-y-1">
                                            <div className="flex items-center space-x-3">
                                                <h3 className="font-bold text-lg">{s.name}</h3>
                                                <span className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-600">{s.position}</span>
                                                {s.hasQualification && <span className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded border border-blue-100">資格有</span>}
                                                {s.saturdayOnly && <span className="text-xs bg-orange-50 text-orange-600 px-2 py-1 rounded border border-orange-100">土曜専門</span>}
                                            </div>
                                            <div className="text-sm text-gray-500 flex space-x-4">
                                                <span>タイプ: {s.shiftType}</span>
                                                <span>担当: {s.role || 'なし'}</span>
                                                <span>週: {s.weeklyDays}日</span>
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
                                        <button onClick={() => handleEdit(s)} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors">
                                            <Edit2 size={20} />
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                <div className="p-5 border-t bg-gradient-to-r from-pink-50 to-yellow-50 flex justify-end rounded-b-3xl">
                    <button onClick={handleAdd} className="btn-primary">
                        <Plus size={18} />
                        <span>職員を追加</span>
                    </button>
                </div>
            </div>
        </div>
    );
};
