import type { Member } from '@bxvtt/shared/protocol';
import { describe, expect, it } from 'vitest';
import { fixtureSnapshot } from '@/app/testing/fixtures';
import { tableDeletedNotice } from './TablePage';

describe('tableDeletedNotice', () => {
  const { table, user } = fixtureSnapshot('lobby', 'player');
  const ruth = table.members.find((m) => m.role === 'referee') as Member;
  const sam = table.members.find((m) => m.user_id === user.id) as Member;

  it('names the referee when the table had one', () => {
    expect(tableDeletedNotice({ table, user }).title).toBe(`Ruth, the referee, deleted ${table.name}`);
  });

  it("doesn't guess which referee it was when the table had several", () => {
    const two = {
      ...table,
      members: [ruth, { ...sam, user_id: 'usr_other', name: 'Ola', role: 'referee' as const }, sam],
    };
    expect(tableDeletedNotice({ table: two, user }).title).toBe(`A referee deleted ${table.name}`);
  });

  it('tells the only referee that they did it in another tab', () => {
    const solo = fixtureSnapshot('lobby', 'referee');
    expect(tableDeletedNotice(solo).title).toBe(`You deleted ${solo.table.name} in another tab`);
  });
});
