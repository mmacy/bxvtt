import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import toll from '../../../../../../adventures/the-toll-bridge.json';
import bell from '../../../../../../adventures/the-drowned-bell.json';
import { fixtureSnapshot } from '@/app/testing/fixtures';
import { renderWithTable } from '@/app/testing/renderWithTable';
import { asAdventure, findArea, findLevel, type Adventure } from '../model/adventure';
import { RefereePanel } from '../RefereePanel';
import { commandResult, refereeApi } from '../testing/helpers';
import { keyedSpawns, triggerCommands } from './FollowUps';
import { groupRows } from './HereNow';

const tollAdventure = asAdventure(toll.payload as unknown as Record<string, unknown>) as Adventure;
const bellAdventure = asAdventure(bell.payload as unknown as Record<string, unknown>) as Adventure;

describe('groupRows', () => {
  it('joins neighbouring die faces with the same entry into one range', () => {
    const level = findLevel(tollAdventure, 'bridge', 1);
    const rows = level?.wandering.table?.rows ?? [];
    const grouped = groupRows(rows);
    expect(grouped.length).toBeLessThan(rows.length);
    expect(grouped[0]).toMatchObject({ from: 1, to: 6 });
    expect(grouped.reduce((sum, g) => sum + (g.to - g.from + 1), 0)).toBe(rows.length);
  });
});

describe('follow-ups for a placed party', () => {
  it('spawns an area’s keyed monsters as the key writes them', () => {
    const warren = findArea(bellAdventure, 'drain_warren')?.area.encounter;
    if (!warren) throw new Error('no keyed encounter');
    expect(keyedSpawns(warren)).toEqual([
      { command_type: 'spawn_monsters', template_id: 'kobold', count_fixed: 6, distance_feet: 20 },
    ]);
  });

  it('fires a trigger by sending what it does, its journal line, and the record that it fired', () => {
    const talk = bellAdventure.triggers.find((t) => t.id === 'drain_folk_talk');
    if (!talk) throw new Error('no trigger');
    const party = fixtureSnapshot('exploring', 'referee').game?.view.party ?? [];
    const commands = triggerCommands(talk, party, [], {
      members: {},
      groups: {},
      monsters: {},
      items: {},
      spells: {},
      areas: {},
      dungeons: {},
    });
    expect(commands.map((c) => c.command_type)).toEqual(['add_journal_entry', 'mark_trigger_fired']);
    expect(commands[1]).toMatchObject({ trigger_id: 'drain_folk_talk' });
  });
});

describe('after the game ends', () => {
  // This test renders the full referee panel and drives a form, which can pass 5 seconds on a busy machine.
  it('asks before a command changes the story, and sends nothing when the referee declines', async () => {
    const api = refereeApi();
    const snapshot = fixtureSnapshot('exploring', 'referee');
    if (!snapshot.game) throw new Error('no game');
    snapshot.game.mode = 'game_over';
    api.sendCommand.mockResolvedValue(commandResult(snapshot));
    const { user } = renderWithTable(<RefereePanel />, { snapshot, api });
    expect(await screen.findByText('The party has fallen, so the game is over.')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Quests, flags, and triggers' }));
    await user.click((await screen.findAllByRole('button', { name: 'Complete quest' }))[0] as HTMLElement);
    expect(await screen.findByRole('alertdialog', { name: 'The game is over' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(api.sendCommand).not.toHaveBeenCalled();
    await user.click((await screen.findAllByRole('button', { name: 'Complete quest' }))[0] as HTMLElement);
    await user.click(await screen.findByRole('button', { name: 'Run anyway' }));
    await waitFor(() => expect(api.sendCommand).toHaveBeenCalledTimes(1));
  }, 15_000);
});
