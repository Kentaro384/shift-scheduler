import { describe, expect, it } from 'vitest';
import { createSeededRandom, getFormattedDate } from './utils';

describe('utils', () => {
    it('formats month and day with zero padding', () => {
        expect(getFormattedDate(2026, 5, 4)).toBe('2026-05-04');
    });

    it('creates repeatable pseudo-random sequences for the same seed', () => {
        const first = createSeededRandom(202605);
        const second = createSeededRandom(202605);

        expect([first(), first(), first()]).toEqual([second(), second(), second()]);
    });
});
