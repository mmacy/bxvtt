import { describe, expect, it } from 'vitest';
import { battleRound } from './battle';

describe('battleRound', () => {
  it('names the round being declared, one past the rounds already resolved', () => {
    expect(battleRound({ battle_round: 0 })).toBe(1);
    expect(battleRound({ battle_round: 2 })).toBe(3);
  });

  it('is null outside a battle', () => {
    expect(battleRound(null)).toBeNull();
    expect(battleRound({ battle_round: null })).toBeNull();
  });
});
