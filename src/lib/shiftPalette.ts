import type { ShiftPatternDefinition, ShiftPatternId } from '../types';

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
    card: 'bg-[#FFFDF8] border border-dashed border-[#54D3A2] border-l-[5px] border-l-[#54D3A2] text-[#4B5563]',
    chip: 'bg-[#FFFDF8] text-[#15803D] border border-dashed border-[#54D3A2]',
    solid: 'bg-[#54D3A2] text-white',
  },
  '有': {
    card: 'bg-[#FFF7FB] border border-dashed border-[#F472B6] border-l-[5px] border-l-[#F472B6] text-[#4B5563]',
    chip: 'bg-[#FFF7FB] text-[#BE185D] border border-dashed border-[#F472B6]',
    solid: 'bg-[#F472B6] text-white',
  },
  '半有': {
    card: 'bg-[#FFF1F2] border border-dashed border-[#FB7185] border-l-[5px] border-l-[#FB7185] text-[#4B5563]',
    chip: 'bg-[#FFF1F2] text-[#BE123C] border border-dashed border-[#FB7185]',
    solid: 'bg-[#FB7185] text-white',
  },
  '研': {
    card: 'bg-[#FFFBEB] border border-dashed border-[#F59E0B] border-l-[5px] border-l-[#F59E0B] text-[#4B5563]',
    chip: 'bg-[#FFFBEB] text-[#92400E] border border-dashed border-[#F59E0B]',
    solid: 'bg-[#F59E0B] text-white',
  },
  '出': {
    card: 'bg-[#F4FAFF] border border-dashed border-[#60A5FA] border-l-[5px] border-l-[#60A5FA] text-[#4B5563]',
    chip: 'bg-[#F4FAFF] text-[#1D4ED8] border border-dashed border-[#60A5FA]',
    solid: 'bg-[#60A5FA] text-white',
  },
  '保': {
    card: 'bg-[#FAF5FF] border border-dashed border-[#C084FC] border-l-[5px] border-l-[#C084FC] text-[#4B5563]',
    chip: 'bg-[#FAF5FF] text-[#7E22CE] border border-dashed border-[#C084FC]',
    solid: 'bg-[#C084FC] text-white',
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
  const patternIndex = patterns.findIndex(pattern => pattern.id === shiftId);
  const namedIndex = NAMED_SHIFT_INDEX[shiftId];
  const paletteIndex = patternIndex >= 0 ? patternIndex : namedIndex ?? 0;
  return WORK_SHIFT_PALETTE[paletteIndex % WORK_SHIFT_PALETTE.length];
};

export const getShiftCardClass = (
  shiftId: ShiftPatternId | string,
  patterns: ShiftPatternDefinition[] = []
): string => {
  if (!shiftId) return 'bg-[#FDFDFD] border border-[#E5E7EB] text-[#D1D5DB]';
  const fixed = FIXED_SHIFT_STYLES[shiftId];
  if (fixed) return fixed.card;
  return `${getShiftPaletteEntry(shiftId, patterns).card} font-medium`;
};

export const getShiftChipClass = (
  shiftId: ShiftPatternId | string,
  patterns: ShiftPatternDefinition[] = []
): string => {
  if (!shiftId) return 'bg-[#FAFAFA] text-[#A1A1AA] border border-[#E5E7EB]';
  const fixed = FIXED_SHIFT_STYLES[shiftId];
  if (fixed) return fixed.chip;
  return getShiftPaletteEntry(shiftId, patterns).chip;
};

export const getShiftSolidClass = (
  shiftId: ShiftPatternId | string,
  patterns: ShiftPatternDefinition[] = []
): string => {
  if (!shiftId) return 'bg-[#E5E7EB] text-[#6B7280]';
  const fixed = FIXED_SHIFT_STYLES[shiftId];
  if (fixed) return fixed.solid;
  return getShiftPaletteEntry(shiftId, patterns).solid;
};

export const getShiftAccentColor = (
  shiftId: ShiftPatternId | string,
  patterns: ShiftPatternDefinition[] = []
): string => getShiftPaletteEntry(shiftId, patterns).accent;

export const getShiftMarker = (shiftId: ShiftPatternId | string): string => {
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
    '研': '✎',
    '出': '↗',
    '保': '□',
    '休': '－',
  };
  return markers[shiftId] || '';
};
