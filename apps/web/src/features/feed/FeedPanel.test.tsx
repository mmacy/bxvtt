import type { ChatEntry, FeedEntry, GameEntry, RollEntry } from '@bxvtt/shared/protocol';
import { act, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { fixtureSnapshot } from '@/app/testing/fixtures';
import { renderWithTable } from '@/app/testing/renderWithTable';
import { FeedPanel } from './FeedPanel';

const player = fixtureSnapshot('exploring', 'player');
const SAM = player.user.id;
const RUTH = player.table.members.find((member) => member.role === 'referee')?.user_id ?? '';

function chat(seq: number, userId: string, text: string, extra: Partial<ChatEntry> = {}): ChatEntry {
  return {
    seq,
    created_at: '2026-11-22T05:30:00Z',
    user_id: userId,
    visibility: 'everyone',
    to: [],
    kind: 'chat',
    text,
    ...extra,
  };
}

function posted(text: string, extra: Partial<FeedEntry> = {}): FeedEntry {
  return chat(100, SAM, text, extra as Partial<ChatEntry>);
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

describe('FeedPanel', () => {
  it('narrates the game log from the snapshot', () => {
    renderWithTable(<FeedPanel />);
    expect(screen.getByText(/The party enters the gatehouse stair/)).toBeInTheDocument();
    expect(screen.getByText('The Drowned Bell')).toBeInTheDocument();
  });

  it('sends a message with Enter and adds a line with Shift+Enter', async () => {
    const { api, user, store } = renderWithTable(<FeedPanel />);
    api.postFeed.mockResolvedValue(posted('Hello\nthere'));
    const box = screen.getByRole('textbox', { name: 'Message the table' });
    await user.type(box, 'Hello{Shift>}{Enter}{/Shift}there{Enter}');
    expect(api.postFeed).toHaveBeenCalledWith(store.getState().tableId, { text: 'Hello\nthere' });
    expect(box).toHaveValue('');
    expect(screen.getByText(/Hello\s+there/)).toBeInTheDocument();
  });

  it('whispers with /w', async () => {
    const { api, user, store } = renderWithTable(<FeedPanel />);
    api.postFeed.mockResolvedValue(posted('Is it trapped?', { visibility: 'users', to: [RUTH] }));
    await user.type(
      screen.getByRole('textbox', { name: 'Message the table' }),
      '/w Ruth Is it trapped?{Enter}',
    );
    expect(api.postFeed).toHaveBeenCalledWith(store.getState().tableId, {
      text: 'Is it trapped?',
      to: [RUTH],
    });
    expect(await screen.findByText(/Only you and Ruth can see this/)).toBeInTheDocument();
  });

  it('explains a roll it can’t read without sending it', async () => {
    const { api, user } = renderWithTable(<FeedPanel />);
    await user.type(screen.getByRole('textbox', { name: 'Message the table' }), '/roll 2x6{Enter}');
    expect(api.postFeed).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent("isn't a dice roll");
  });

  it('lists the commands when you type a slash', async () => {
    const { user } = renderWithTable(<FeedPanel />);
    await user.type(screen.getByRole('textbox', { name: 'Message the table' }), '/');
    const list = screen.getByRole('listbox', { name: 'Commands' });
    expect(
      within(list)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(expect.arrayContaining([expect.stringContaining('/roll 2d6+1')]));
    expect(within(list).queryByText(/roll secret/)).not.toBeInTheDocument();
  });

  it('builds a roll in the dice tray', async () => {
    const { api, user, store } = renderWithTable(<FeedPanel />);
    const roll: RollEntry = {
      seq: 100,
      created_at: new Date().toISOString(),
      user_id: SAM,
      visibility: 'everyone',
      to: [],
      kind: 'roll',
      expression: '2d6+1',
      comment: 'to force the door',
      total: 20,
      rolls: [{ rolls: [6, 6], modifier: 1, multiplier: 1, total: 13 }],
      seed: 1,
      secret: false,
    };
    api.postFeed.mockResolvedValue(roll);
    await user.click(screen.getByRole('button', { name: 'Dice tray' }));
    await user.click(screen.getByRole('button', { name: 'Add a d6' }));
    await user.click(screen.getByRole('button', { name: 'Add another d6, 1 chosen' }));
    await user.click(screen.getByRole('button', { name: 'Raise the modifier' }));
    await user.type(screen.getByLabelText('What the roll is for'), 'to force the door');
    await user.click(screen.getByRole('button', { name: 'Roll 2d6+1' }));
    expect(api.postFeed).toHaveBeenCalledWith(store.getState().tableId, {
      text: '/roll 2d6+1 to force the door',
    });
  });

  it('keeps the draft when the panel closes and opens again', async () => {
    const first = renderWithTable(<FeedPanel />);
    await first.user.type(screen.getByRole('textbox', { name: 'Message the table' }), 'half a thought');
    first.unmount();
    renderWithTable(<FeedPanel />);
    expect(screen.getByRole('textbox', { name: 'Message the table' })).toHaveValue('half a thought');
  });

  it('shows referee events only to a referee with the lens on', () => {
    const referee = fixtureSnapshot('exploring', 'referee');
    const hidden = /trigger fires/;
    const lensOn = renderWithTable(<FeedPanel />, { snapshot: referee });
    expect(screen.getByText(hidden)).toBeInTheDocument();
    lensOn.unmount();
    renderWithTable(<FeedPanel />, {
      snapshot: fixtureSnapshot('exploring', 'referee'),
      preferences: { refereeLens: false },
    });
    expect(screen.queryByText(hidden)).not.toBeInTheDocument();
    expect(screen.getByText(/The party enters the gatehouse stair/)).toBeInTheDocument();
  });

  it('shows the dice detail of a line on demand', async () => {
    const snapshot = fixtureSnapshot('exploring', 'player');
    const attack: GameEntry = {
      seq: 50,
      created_at: '2026-11-22T05:40:00Z',
      user_id: SAM,
      visibility: 'everyone',
      to: [],
      kind: 'game',
      command_type: 'resolve_battle_round',
      revision: 30,
      session_id: snapshot.game?.session_id ?? '',
      events: [
        {
          event_type: 'attack_rolled',
          code: 'combat.attack.missed',
          visibility: 'player',
          attacker_id: 'character-0001',
          defender_id: 'group-0001',
          roll: 4,
          modifier: 1,
          total: 5,
          target: 13,
          armour_class: 6,
          attack_name: 'sword',
        } as unknown as GameEntry['events'][number],
      ],
      messages: ['Brenna misses.'],
    };
    snapshot.feed.entries.push(attack);
    const { user } = renderWithTable(<FeedPanel />, { snapshot });
    const line = screen.getByRole('button', { name: /misses/ });
    expect(line).toHaveAttribute('aria-expanded', 'false');
    await user.click(line);
    expect(line).toHaveAttribute('aria-expanded', 'true');
  });

  it('filters to chat', async () => {
    const snapshot = fixtureSnapshot('exploring', 'player');
    snapshot.feed.entries.push(chat(60, RUTH, 'Roll for initiative, please.'));
    const { user } = renderWithTable(<FeedPanel />, { snapshot });
    await user.click(screen.getByRole('radio', { name: 'Chat' }));
    expect(screen.getByText('Roll for initiative, please.')).toBeInTheDocument();
    expect(screen.queryByText(/The party enters the gatehouse stair/)).not.toBeInTheDocument();
  });

  it('marks entries that arrive behind another tab as unread, and stays quiet', () => {
    const { store, container } = renderWithTable(<FeedPanel />, { preferences: { dockTab: 'party' } });
    act(() => {
      store.getState().receive({ type: 'feed', entry: chat(80, RUTH, 'The bell tolls again.') });
    });
    expect(screen.getByRole('separator', { name: 'New since you last looked' })).toBeInTheDocument();
    const live = container.querySelector('[aria-live="polite"][aria-atomic="true"]');
    expect(live?.textContent).toBe('');
  });

  it('announces entries from others while the feed is shown', () => {
    const { store, container } = renderWithTable(<FeedPanel />, { preferences: { dockTab: 'feed' } });
    act(() => {
      store.getState().receive({ type: 'feed', entry: chat(81, RUTH, 'Roll for surprise.') });
    });
    const live = container.querySelector('[aria-live="polite"][aria-atomic="true"]');
    expect(live?.textContent).toBe('Ruth: Roll for surprise.');
  });
});
