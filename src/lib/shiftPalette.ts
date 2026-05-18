import type { ShiftPatternDefinition, ShiftPatternId } from '../types';
import { getEffectiveWorkShiftId, parseHalfDayLeaveShiftId } from '../types';

type PaletteEntry = {
  accent: string;
  card: string;
  chip: string;
  solid: string;
};

const WORK_SHIFT_PALETTE: PaletteEntry[] = [
  {
    accent: '#FF6B6B',
    card: 'bg-[rgba(255,107,107,0.14)] border border-[#FFD0D0] border-l-[5px] border-l-[#FF6B6B] text-[#2B2F38]',
    chip: 'bg-[rgba(255,107,107,0.16)] text-[#9F2B2B] border border-[#FFB8B8]',
    solid: 'bg-[#FF6B6B] text-white',
  },
  {
    accent: '#F6C343',
    card: 'bg-[rgba(246,195,67,0.18)] border border-[#FBE3A4] border-l-[5px] border-l-[#F6C343] text-[#2B2F38]',
    chip: 'bg-[rgba(246,195,67,0.22)] text-[#7A5600] border border-[#F4D276]',
    solid: 'bg-[#F6C343] text-[#3A2A00]',
  },
  {
    accent: '#45B7D1',
    card: 'bg-[rgba(69,183,209,0.14)] border border-[#BCE9F2] border-l-[5px] border-l-[#45B7D1] text-[#2B2F38]',
    chip: 'bg-[rgba(69,183,209,0.16)] text-[#0F6678] border border-[#9DDBE8]',
    solid: 'bg-[#45B7D1] text-white',
  },
  {
    accent: '#FF8A3D',
    card: 'bg-[rgba(255,138,61,0.16)] border border-[#FFD2B6] border-l-[5px] border-l-[#FF8A3D] text-[#2B2F38]',
    chip: 'bg-[rgba(255,138,61,0.18)] text-[#9A4211] border border-[#FFBE91]',
    solid: 'bg-[#FF8A3D] text-white',
  },
  {
    accent: '#F472B6',
    card: 'bg-[rgba(244,114,182,0.14)] border border-[#FBCFE8] border-l-[5px] border-l-[#F472B6] text-[#2B2F38]',
    chip: 'bg-[rgba(244,114,182,0.16)] text-[#9D174D] border border-[#F9A8D4]',
    solid: 'bg-[#F472B6] text-white',
  },
  {
    accent: '#2EC4B6',
    card: 'bg-[rgba(46,196,182,0.13)] border border-[#B2F5EA] border-l-[5px] border-l-[#2EC4B6] text-[#2B2F38]',
    chip: 'bg-[rgba(46,196,182,0.16)] text-[#0F766E] border border-[#8EE8DD]',
    solid: 'bg-[#2EC4B6] text-white',
  },
  {
    accent: '#9B7EDE',
    card: 'bg-[rgba(155,126,222,0.14)] border border-[#DDD6FE] border-l-[5px] border-l-[#9B7EDE] text-[#2B2F38]',
    chip: 'bg-[rgba(155,126,222,0.16)] text-[#5B3EA8] border border-[#C4B5FD]',
    solid: 'bg-[#9B7EDE] text-white',
  },
  {
    accent: '#B8D94F',
    card: 'bg-[rgba(184,217,79,0.16)] border border-[#E6F5A8] border-l-[5px] border-l-[#B8D94F] text-[#2B2F38]',
    chip: 'bg-[rgba(184,217,79,0.18)] text-[#587000] border border-[#D7EE75]',
    solid: 'bg-[#B8D94F] text-[#293400]',
  },
  {
    accent: '#EF476F',
    card: 'bg-[rgba(239,71,111,0.13)] border border-[#FFC2D1] border-l-[5px] border-l-[#EF476F] text-[#2B2F38]',
    chip: 'bg-[rgba(239,71,111,0.16)] text-[#9F1239] border border-[#FDA4AF]',
    solid: 'bg-[#EF476F] text-white',
  },
  {
    accent: '#118AB2',
    card: 'bg-[rgba(17,138,178,0.12)] border border-[#BAE6FD] border-l-[5px] border-l-[#118AB2] text-[#2B2F38]',
    chip: 'bg-[rgba(17,138,178,0.16)] text-[#075985] border border-[#7DD3FC]',
    solid: 'bg-[#118AB2] text-white',
  },
];

const NAMED_SHIFT_INDEX: Record<string, number> = {
  A: 0,
  B: 1,
  C: 2,
  D: 3,
  E: 4,
  F: 5,
  "C'": 6,
  J: 8,
};

const FIXED_SHIFT_STYLES: Record<string, Pick<PaletteEntry, 'card' | 'chip' | 'solid'>> = {
  '振': {
    card: 'bg-[#FCFDFB] border border-dashed border-[#9DDCBD] border-l-[4px] border-l-[#7BCFA7] text-[#5F6B63]',
    chip: 'bg-[#FCFDFB] text-[#3F7F5B] border border-dashed border-[#9DDCBD]',
    solid: 'bg-[#7BCFA7] text-white',
  },
  '有': {
    card: 'bg-[#FDFBFC] border border-dashed border-[#E8A8C7] border-l-[4px] border-l-[#D98AB4] text-[#6B5F66]',
    chip: 'bg-[#FDFBFC] text-[#96506F] border border-dashed border-[#E8A8C7]',
    solid: 'bg-[#D98AB4] text-white',
  },
  '半有': {
    card: 'bg-[#FDF9FA] border border-dashed border-[#E9A5AD] border-l-[4px] border-l-[#D9828E] text-[#6B5F61]',
    chip: 'bg-[#FDF9FA] text-[#9B4D57] border border-dashed border-[#E9A5AD]',
    solid: 'bg-[#D9828E] text-white',
  },
  '夏休': {
    card: 'bg-[#FFFDF4] border border-dashed border-[#E8D889] border-l-[4px] border-l-[#D7BE4A] text-[#6B6548]',
    chip: 'bg-[#FFFDF4] text-[#806A12] border border-dashed border-[#E8D889]',
    solid: 'bg-[#D7BE4A] text-[#2F2A12]',
  },
  '誕生日休': {
    card: 'bg-[#FDF7FC] border border-dashed border-[#E7A8DE] border-l-[4px] border-l-[#D77BCC] text-[#6B5A68]',
    chip: 'bg-[#FDF7FC] text-[#94508C] border border-dashed border-[#E7A8DE]',
    solid: 'bg-[#D77BCC] text-white',
  },
  '研': {
    card: 'bg-[#FDFBF4] border border-dashed border-[#D9BF76] border-l-[4px] border-l-[#C9A84F] text-[#6B6252]',
    chip: 'bg-[#FDFBF4] text-[#7A6432] border border-dashed border-[#D9BF76]',
    solid: 'bg-[#C9A84F] text-white',
  },
  '出': {
    card: 'bg-[#F8FBFD] border border-dashed border-[#9CC3EA] border-l-[4px] border-l-[#7FAFE0] text-[#5F6770]',
    chip: 'bg-[#F8FBFD] text-[#4C719C] border border-dashed border-[#9CC3EA]',
    solid: 'bg-[#7FAFE0] text-white',
  },
  '保': {
    card: 'bg-[#FBFAFD] border border-dashed border-[#C7B4E6] border-l-[4px] border-l-[#B19AD8] text-[#655F6B]',
    chip: 'bg-[#FBFAFD] text-[#6E5A96] border border-dashed border-[#C7B4E6]',
    solid: 'bg-[#B19AD8] text-white',
  },
  '休': {
    card: 'bg-[#FAFAFA] border border-[#E5E7EB] border-l-[5px] border-l-[#D1D5DB] text-[#A1A1AA] opacity-60',
    chip: 'bg-[#FAFAFA] text-[#A1A1AA] border border-[#E5E7EB]',
    solid: 'bg-[#E5E7EB] text-[#6B7280]',
  },
};

export const getShiftPaletteEntry = (
  shiftId: ShiftPatternId | string,
  patterns: ShiftPatternDefinition[] = []
): PaletteEntry => {
  const effectiveShiftId = getEffectiveWorkShiftId(shiftId) || shiftId;
  const patternIndex = patterns.findIndex(pattern => pattern.id === effectiveShiftId);
  const namedIndex = NAMED_SHIFT_INDEX[effectiveShiftId];
  const paletteIndex = patternIndex >= 0 ? patternIndex : namedIndex ?? 0;
  return WORK_SHIFT_PALETTE[paletteIndex % WORK_SHIFT_PALETTE.length];
};

export const getShiftCardClass = (
  shiftId: ShiftPatternId | string,
  patterns: ShiftPatternDefinition[] = []
): string => {
  if (!shiftId) return 'bg-[#FDFDFD] border border-[#E5E7EB] text-[#D1D5DB]';
  const halfDayLeave = parseHalfDayLeaveShiftId(shiftId);
  if (halfDayLeave) return `${getShiftPaletteEntry(halfDayLeave.baseShift, patterns).card} font-medium`;
  const fixed = FIXED_SHIFT_STYLES[shiftId];
  if (fixed) return fixed.card;
  return `${getShiftPaletteEntry(shiftId, patterns).card} font-medium`;
};

export const getShiftChipClass = (
  shiftId: ShiftPatternId | string,
  patterns: ShiftPatternDefinition[] = []
): string => {
  if (!shiftId) return 'bg-[#FAFAFA] text-[#A1A1AA] border border-[#E5E7EB]';
  const halfDayLeave = parseHalfDayLeaveShiftId(shiftId);
  if (halfDayLeave) return getShiftPaletteEntry(halfDayLeave.baseShift, patterns).chip;
  const fixed = FIXED_SHIFT_STYLES[shiftId];
  if (fixed) return fixed.chip;
  return getShiftPaletteEntry(shiftId, patterns).chip;
};

export const getShiftSolidClass = (
  shiftId: ShiftPatternId | string,
  patterns: ShiftPatternDefinition[] = []
): string => {
  if (!shiftId) return 'bg-[#E5E7EB] text-[#6B7280]';
  const halfDayLeave = parseHalfDayLeaveShiftId(shiftId);
  if (halfDayLeave) return getShiftPaletteEntry(halfDayLeave.baseShift, patterns).solid;
  const fixed = FIXED_SHIFT_STYLES[shiftId];
  if (fixed) return fixed.solid;
  return getShiftPaletteEntry(shiftId, patterns).solid;
};

export const getShiftAccentColor = (
  shiftId: ShiftPatternId | string,
  patterns: ShiftPatternDefinition[] = []
): string => getShiftPaletteEntry(shiftId, patterns).accent;

export const getShiftMarker = (shiftId: ShiftPatternId | string): string => {
  const halfDayLeave = parseHalfDayLeaveShiftId(shiftId);
  if (halfDayLeave) return halfDayLeave.leavePeriod === 'morning' ? 'PM' : 'AM';

  const markers: Record<string, string> = {
    A: '●',
    B: '■',
    C: '◆',
    D: '▲',
    E: '▼',
    F: '⬟',
    "C'": '⬢',
    J: '★',
    '振': '○',
    '有': '◇',
    '半有': '◐',
    '夏休': '夏',
    '誕生日休': '誕',
    '研': '✎',
    '出': '↗',
    '保': '□',
    '休': '－',
  };
  return markers[shiftId] || '';
};
