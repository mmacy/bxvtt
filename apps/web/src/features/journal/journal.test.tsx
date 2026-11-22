import { BxvttProblemError } from '@bxvtt/shared/client';
import type { Notes } from '@bxvtt/shared/protocol';
import { act, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fixtureSnapshot } from '@/app/testing/fixtures';
import { createFakeApi, renderWithTable } from '@/app/testing/renderWithTable';
import { JournalPanel } from './JournalPanel';
import { initialNotesState, notesReducer, type NotesState } from './model/notes';
import { buildQuestLog, foldQuestEvents, questChange } from './model/quests';

const RUTH = 'usr_ruthruthruthruthruthr';

function notes(text: string, version: number, updatedBy: string | null = null): Notes {
  return { kind: 'party', text, version, updated_by: updatedBy, updated_at: '2026-11-22T05:30:00Z' };
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('the notes editor', () => {
  const start = () => initialNotesState(notes('Gashnak has one ear.', 3));

  it('saves an edit and takes the server’s version', () => {
    let state: NotesState = notesReducer(start(), {
      type: 'edit',
      text: 'Gashnak has one ear. Avoid the dorter.',
    });
    expect(state.status).toBe('dirty');
    state = notesReducer(state, { type: 'save-start' });
    state = notesReducer(state, {
      type: 'save-ok',
      notes: notes('Gashnak has one ear. Avoid the dorter.', 4),
    });
    expect(state.status).toBe('saved');
    expect(state.base.version).toBe(4);
  });

  it('takes someone else’s edit when the reader has no changes', () => {
    const state = notesReducer(start(), { type: 'remote', notes: notes('New text', 4, RUTH) });
    expect(state.draft).toBe('New text');
    expect(state.status).toBe('idle');
  });

  it('asks before replacing unsaved changes, and keeps either version', () => {
    let state = notesReducer(start(), { type: 'edit', text: 'mine' });
    state = notesReducer(state, { type: 'remote', notes: notes('theirs', 4, RUTH) });
    expect(state.status).toBe('conflict');
    const kept = notesReducer(state, { type: 'keep-mine' });
    expect(kept).toMatchObject({ draft: 'mine', status: 'dirty' });
    expect(kept.base.version).toBe(4);
    const taken = notesReducer(state, { type: 'take-theirs' });
    expect(taken).toMatchObject({ draft: 'theirs', status: 'idle' });
  });

  it('keeps typing that happened during a save', () => {
    let state = notesReducer(start(), { type: 'edit', text: 'a' });
    state = notesReducer(state, { type: 'save-start' });
    state = notesReducer(state, { type: 'edit', text: 'ab' });
    state = notesReducer(state, { type: 'save-ok', notes: notes('a', 4) });
    expect(state).toMatchObject({ draft: 'ab', status: 'dirty' });
  });
});

describe('the quest log', () => {
  it('remembers finished quests from the event log', () => {
    const history = foldQuestEvents([
      { event_type: 'quest_activated', quest_id: 'q', name: 'Break the Red Thumbs', narrative: 'A bounty.' },
      {
        event_type: 'objective_completed',
        quest_id: 'q',
        quest_name: 'Break the Red Thumbs',
        objective_id: 'o',
        name: 'Kill Gashnak',
      },
      { event_type: 'quest_completed', quest_id: 'q', name: 'Break the Red Thumbs', narrative: 'Paid.' },
    ]);
    const log = buildQuestLog({ quests: [], history, referee: null, adventure: [] });
    expect(log.completed).toHaveLength(1);
    expect(log.completed[0]).toMatchObject({ name: 'Break the Red Thumbs', completion: 'Paid.' });
    expect(log.completed[0]?.objectives[0]).toMatchObject({ name: 'Kill Gashnak', complete: true });
  });

  it('marks a new quest and a newly finished objective', () => {
    const [quest] = buildQuestLog({
      quests: [
        {
          id: 'q',
          name: 'Q',
          narrative: '',
          speaker: '',
          objectives: [{ id: 'o', name: 'O', state: 'complete' }],
        },
      ],
      history: new Map(),
      referee: null,
      adventure: [],
    }).active;
    if (!quest) throw new Error('missing quest');
    expect(questChange(quest, {}).change).toBe('new');
    expect(questChange(quest, { q: { o: false } })).toMatchObject({ change: 'updated' });
    expect(questChange(quest, { q: { o: true } }).change).toBeNull();
    expect(questChange(quest, null).change).toBeNull();
  });
});

describe('JournalPanel', () => {
  it('shows the active quests with their objectives', () => {
    const api = createFakeApi();
    api.listEvents.mockResolvedValue({ events: [], messages: [], next_after: 0, total: 0 });
    renderWithTable(<JournalPanel />, { api });
    expect(screen.getByRole('heading', { name: 'Break the Red Thumbs' })).toBeInTheDocument();
    expect(screen.getByText('Kill Gashnak One-Ear')).toBeInTheDocument();
    expect(screen.queryByText('Hidden from players')).not.toBeInTheDocument();
  });

  it('shows a referee the hidden objectives, marked as hidden', async () => {
    const api = createFakeApi();
    api.listEvents.mockResolvedValue({ events: [], messages: [], next_after: 0, total: 0 });
    api.getAdventureDocument.mockResolvedValue({
      payload: {
        quests: [
          {
            id: 'saints_hand',
            name: 'The Hand of Saint Corvane',
            objectives: [{ id: 'learn_where', name: 'Learn where the brothers hid the Hand' }],
          },
        ],
      },
    });
    renderWithTable(<JournalPanel />, { api, snapshot: fixtureSnapshot('exploring', 'referee') });
    expect(await screen.findByText('Learn where the brothers hid the Hand')).toBeInTheDocument();
    expect(screen.getAllByText('Hidden from players').length).toBeGreaterThan(0);
  });

  it('opens the chronicle with the adventure and the town', async () => {
    const api = createFakeApi();
    api.listEvents.mockResolvedValue({ events: [], messages: [], next_after: 0, total: 0 });
    const { user } = renderWithTable(<JournalPanel />, { api });
    await user.click(screen.getByRole('radio', { name: 'Journal' }));
    expect(screen.getByRole('heading', { name: 'The Drowned Bell' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Hollin Ferry' })).toBeInTheDocument();
    expect(screen.getByText(/a bell tolls once/)).toBeInTheDocument();
  });

  it('autosaves the notes and offers a choice when someone saved first', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const api = createFakeApi();
      api.listEvents.mockResolvedValue({ events: [], messages: [], next_after: 0, total: 0 });
      const theirs = notes('Ruth wrote this.', 1, RUTH);
      api.updateNotes
        .mockRejectedValueOnce(
          new BxvttProblemError({
            type: 'about:blank',
            title: 'Conflict',
            status: 409,
            code: 'stale_version',
            detail: 'Someone saved first.',
            request_id: 'req_1',
            notes: theirs,
          } as ConstructorParameters<typeof BxvttProblemError>[0]),
        )
        .mockResolvedValueOnce(notes('Mine.', 2));
      const { user, store } = renderWithTable(<JournalPanel />, { api });
      await user.click(screen.getByRole('radio', { name: 'Notes' }));
      await user.type(screen.getByRole('textbox', { name: 'Party notes' }), 'Mine.');
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1500);
      });
      expect(api.updateNotes).toHaveBeenCalledWith(store.getState().tableId, 'party', 'Mine.', 0);
      expect(await screen.findByText(/saved the notes while you were writing/)).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'See both' }));
      expect(screen.getByText('Ruth wrote this.')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Keep mine' }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1500);
      });
      expect(api.updateNotes).toHaveBeenLastCalledWith(store.getState().tableId, 'party', 'Mine.', 1);
    } finally {
      vi.useRealTimers();
    }
  });
});
