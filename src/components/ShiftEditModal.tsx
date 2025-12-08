import React from 'react';
import { X } from 'lucide-react';
import type { ShiftPatternId } from '../types';

interface ShiftEditModalProps {
    staffName: string;
    date: string;
    currentShift: ShiftPatternId;
    onSelect: (shift: ShiftPatternId) => void;
    onClose: () => void;
}

export const ShiftEditModal: React.FC<ShiftEditModalProps> = ({ staffName, date, currentShift, onSelect, onClose }) => {
    // Colorful Pop Theme Colors
    const shiftOptions: { id: ShiftPatternId; label: string; color: string }[] = [
        { id: 'A', label: '早番', color: 'bg-[#FFE66D] text-[#7C5800]' },      // Sunshine Yellow
        { id: 'B', label: '標準', color: 'bg-[#45B7D1] text-white' },          // Sky Blue
        { id: 'C', label: '標準+', color: 'bg-[#38A3C0] text-white' },         // Deep Sky
        { id: 'D', label: '遅番', color: 'bg-[#A78BFA] text-white' },          // Lavender
        { id: 'E', label: '遅番+', color: 'bg-[#8B5CF6] text-white' },         // Deep Lavender
        { id: 'J', label: '最遅番', color: 'bg-[#FF6B6B] text-white' },        // Coral Pink
        { id: '振', label: '振休', color: 'bg-[#4ECDC4] text-[#0D6B66]' },     // Mint Green
        { id: '有', label: '有給', color: 'bg-[#F9A8D4] text-[#9D174D]' },     // Soft Pink
        { id: '休', label: '休み', color: 'bg-gray-100 text-gray-400' },        // Light Gray
    ];

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in-up">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
                <div className="header-gradient p-5 flex justify-between items-center">
                    <h2 className="text-xl font-bold text-white drop-shadow-md">
                        ✨ シフト選択 - {staffName}
                        <span className="text-sm font-normal ml-2 opacity-90">({date})</span>
                    </h2>
                    <button onClick={onClose} className="p-2 bg-white/20 hover:bg-white/40 rounded-full transition-all duration-300 hover:scale-110">
                        <X size={20} className="text-white" />
                    </button>
                </div>

                <div className="p-6 grid grid-cols-3 gap-4">
                    {shiftOptions.map((option) => (
                        <button
                            key={option.id}
                            onClick={() => onSelect(option.id)}
                            className={`
                                flex flex-col items-center justify-center p-4 rounded-2xl transition-all duration-300 transform hover:scale-110 hover:shadow-lg
                                ${option.color}
                                ${currentShift === option.id ? 'ring-4 ring-[#FF6B6B] ring-offset-2 shadow-xl scale-105' : 'shadow-md'}
                            `}
                        >
                            <span className="text-2xl font-bold mb-1">{option.id || '-'}</span>
                            <span className="text-xs font-semibold opacity-90">{option.label}</span>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};
