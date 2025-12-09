import React from 'react';
import { X, Palette } from 'lucide-react';
import type { ShiftPatternId } from '../types';

interface ShiftEditModalProps {
    staffName: string;
    date: string;
    currentShift: ShiftPatternId;
    onSelect: (shift: ShiftPatternId) => void;
    onClose: () => void;
}

export const ShiftEditModal: React.FC<ShiftEditModalProps> = ({ staffName, date, currentShift, onSelect, onClose }) => {
    // Rev.5 Time-flow Colors
    const shiftOptions: { id: ShiftPatternId; label: string; color: string; marker: string }[] = [
        { id: 'A', label: '早番', color: 'bg-[#F59E0B] text-white', marker: '●' },           // Sunrise Yellow
        { id: 'B', label: '標準', color: 'bg-[#38BDF8] text-white', marker: '■' },           // Morning Sky Blue
        { id: 'C', label: '標準+', color: 'bg-[#3B82F6] text-white', marker: '◆' },          // Midday Blue
        { id: 'D', label: '遅番', color: 'bg-[#F97316] text-white', marker: '▲' },           // Sunset Orange
        { id: 'E', label: '遅番+', color: 'bg-[#A855F7] text-white', marker: '▼' },          // Twilight Purple
        { id: 'J', label: '最遅番', color: 'bg-[#DC2626] text-white', marker: '★' },         // Night Crimson
        { id: '振', label: '振休', color: 'bg-[#F3F4F6] text-[#10B981] border-2 border-[#10B981]', marker: '○' },  // Emerald (休み風)
        { id: '有', label: '有給', color: 'bg-[#F3F4F6] text-[#F472B6] border-2 border-[#F472B6]', marker: '◇' },  // Rose (休み風)
        { id: '休', label: '休み', color: 'bg-gray-100 text-gray-400', marker: '－' },        // Light Gray
    ];

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in-up">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
                <div className="header-gradient p-5 flex justify-between items-center">
                    <h2 className="text-xl font-bold text-white drop-shadow-md flex items-center gap-2">
                        <Palette size={22} /> シフト選択 - {staffName}
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
                            <span className="text-xs mb-1 opacity-80">{option.marker}</span>
                            <span className="text-2xl font-bold">{option.id || '-'}</span>
                            <span className="text-xs font-semibold opacity-90">{option.label}</span>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};
