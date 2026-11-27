import { describe, expect, it } from 'vitest';
import { fixtureSnapshot } from '@/app/testing/fixtures';
import { memberDescription } from './pickers';

describe('memberDescription', () => {
  it('names the class the view states, and marks a member who is down', () => {
    const brenna = structuredClone(fixtureSnapshot('exploring', 'referee').game?.view.party[0]);
    if (!brenna) throw new Error('No Brenna.');
    expect(memberDescription({ ...brenna, level: 2, class_name: 'Hollow knight', current_hp: 4 })).toBe(
      'Level 2 Hollow knight',
    );
    expect(
      memberDescription({ ...brenna, level: 2, class_id: 'fighter', class_name: '', current_hp: 0 }),
    ).toBe('Level 2 Fighter, down');
  });
});
