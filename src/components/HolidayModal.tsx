import React from 'react';
import type { Holiday } from '../types';
import { X } from 'lucide-react';
import { getDaysInMonth, getFormattedDate } from '../lib/utils';

interface HolidayModalProps {
    year: number;
    month: number;
    holidays: Holiday[];
    onUpdate: (holidays: Holiday[]) => void;
    onClose: () => void;
}

export const HolidayModal: React.FC<HolidayModalProps> = ({ year, month, holidays, onUpdate, onClose }) => {
    const daysInMonth = getDaysInMonth(year, month);
    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

    const toggleHoliday = (day: number) => {
        const dateStr = getFormattedDate(year, month, day);
        const exists = holidays.some(h => h.date === dateStr);

        if (exists) {
            onUpdate(holidays.filter(h => h.date !== dateStr));
        } else {
            onUpdate([...holidays, { date: dateStr, name: '休日' }]);
        }
    };

    const isHoliday = (day: number) => {
        const dateStr = getFormattedDate(year, month, day);
        return holidays.some(h => h.date === dateStr);
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in-up">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
                <div className="header-gradient p-5 flex justify-between items-center">
                    <h2 className="text-xl font-bold text-white drop-shadow-md">📅 祝日設定 ({year}年{month}月)</h2>
                    <button onClick={onClose} className="p-2 bg-white/20 hover:bg-white/40 rounded-full transition-all duration-300 hover:scale-110">
                        <X size={20} className="text-white" />
                    </button>
                </div>

                <div className="p-6 bg-gradient-to-br from-pink-50 via-white to-yellow-50">
                    <p className="text-sm text-gray-600 mb-4">日付をクリックして祝日を切り替えてください。</p>
                    <div className="grid grid-cols-7 gap-2">
                        {['日', '月', '火', '水', '木', '金', '土'].map((d, i) => (
                            <div key={d} className={`text-center text-xs font-bold ${i === 0 ? 'text-[#FF6B6B]' : i === 6 ? 'text-[#45B7D1]' : 'text-gray-500'}`}>{d}</div>
                        ))}
                        {/* Empty cells for start of month */}
                        {Array.from({ length: new Date(year, month - 1, 1).getDay() }).map((_, i) => (
                            <div key={`empty-${i}`} />
                        ))}
                        {days.map(day => {
                            const isHol = isHoliday(day);
                            const dow = new Date(year, month - 1, day).getDay();
                            const isSun = dow === 0;
                            const isSat = dow === 6;

                            return (
                                <button
                                    key={day}
                                    onClick={() => toggleHoliday(day)}
                                    className={`
                                        h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300 hover:scale-110
                                        ${isHol
                                            ? 'bg-[#FF6B6B] text-white shadow-lg'
                                            : isSun
                                                ? 'text-[#FF6B6B] hover:bg-pink-100'
                                                : isSat
                                                    ? 'text-[#45B7D1] hover:bg-sky-100'
                                                    : 'text-gray-700 hover:bg-pink-50'
                                        }
                                    `}
                                >
                                    {day}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="p-5 border-t bg-gradient-to-r from-pink-50 to-yellow-50 flex justify-end rounded-b-3xl">
                    <button onClick={onClose} className="btn-primary">
                        閉じる
                    </button>
                </div>
            </div>
        </div>
    );
};
