import React from 'react';
import { AlertTriangle, CheckCircle2, X } from 'lucide-react';
import type { ShiftPatternDefinition } from '../types';
import { getShiftChipClass } from '../lib/shiftPalette';

export type ShortageIssue = {
  day: number;
  label: string;
  missingCount: number;
};

interface ShortageModalProps {
  year: number;
  month: number;
  issues: ShortageIssue[];
  patterns: ShiftPatternDefinition[];
  onClose: () => void;
}

export const ShortageModal: React.FC<ShortageModalProps> = ({
  year,
  month,
  issues,
  patterns,
  onClose,
}) => {
  const patternIds = new Set(patterns.map(pattern => pattern.id));
  const groupedIssues = issues.reduce<Record<number, ShortageIssue[]>>((groups, issue) => {
    groups[issue.day] = [...(groups[issue.day] || []), issue];
    return groups;
  }, {});

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg max-h-[82vh] overflow-hidden rounded-2xl bg-white shadow-2xl border border-[#FFE0A3]">
        <div className="flex items-center justify-between px-5 py-4 bg-[#FFF8E7] border-b border-[#F7D98A]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#FFE6AD] text-[#B45309] flex items-center justify-center">
              <AlertTriangle size={22} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#2B2F38]">不足確認</h2>
              <p className="text-sm text-[#8A5A00]">
                {year}年{month}月 / {issues.length}件 要修正
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full border border-[#F3D48D] bg-white text-[#6B7280] hover:bg-[#FFF3D0] transition-colors flex items-center justify-center"
            aria-label="閉じる"
          >
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto max-h-[58vh] p-4 bg-[#FFFDF8]">
          {issues.length === 0 ? (
            <div className="py-10 text-center text-[#16805B]">
              <CheckCircle2 className="w-10 h-10 mx-auto mb-2" />
              <p className="font-bold">不足はありません</p>
            </div>
          ) : (
            <div className="space-y-3">
              {Object.entries(groupedIssues).map(([day, dayIssues]) => (
                <section key={day} className="rounded-xl border border-[#F4E4BE] bg-white overflow-hidden">
                  <div className="px-4 py-2 bg-[#FFF8E7] border-b border-[#F4E4BE] text-sm font-bold text-[#5A4632]">
                    {month}月{day}日
                  </div>
                  <div className="divide-y divide-[#F5E8CE]">
                    {dayIssues.map(issue => {
                      const isPatternIssue = patternIds.has(issue.label);
                      return (
                        <div key={`${issue.day}-${issue.label}`} className="flex items-center justify-between gap-3 px-4 py-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className={`shrink-0 min-w-12 text-center px-2 py-1 rounded-lg text-sm font-bold ${isPatternIssue
                                ? getShiftChipClass(issue.label, patterns)
                                : 'bg-[#FFF4D6] text-[#92400E] border border-[#F2C66D]'
                                }`}
                            >
                              {issue.label}
                            </span>
                            <span className="text-sm text-[#4B5563]">必要人数を下回っています</span>
                          </div>
                          <span className="shrink-0 text-sm font-bold text-[#C2410C]">
                            {issue.missingCount}名不足
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>

        <div className="px-5 py-4 bg-white border-t border-[#F4E4BE] flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-[#FF6B6B] text-white font-bold hover:bg-[#F05252] transition-colors shadow-sm"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
};
