import { describe, expect, it } from 'vitest';
import { gameTimeText } from './EndScreen';

describe('gameTimeText', () => {
  it('writes game time in days, hours, and minutes, as a person would', () => {
    // Day 2, 10:20 is 1 day, 10 hours, and 20 minutes after the start: 12,360 rounds of 10 seconds.
    expect(gameTimeText(12_360)).toBe('1 day, 10 hours, and 20 minutes');
    expect(gameTimeText(60)).toBe('10 minutes');
    expect(gameTimeText(4)).toBe('40 seconds');
    expect(gameTimeText(0)).toBe('0 seconds');
  });
});
