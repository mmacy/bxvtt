import { BxvttProblemError } from '@bxvtt/shared/client';
import type { CommandResult, GameState } from '@bxvtt/shared/protocol';
import { describeRejection } from '@bxvtt/shared/text';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { QUEUED_COMMAND_MAX_WAIT_MS, useSendCommand, type GameCommand, type SendResult } from './commands';
import { fixtureSnapshot } from './testing/fixtures';
import { renderWithTable } from './testing/renderWithTable';

function SearchButton({ display }: { display?: 'toast' | 'inline' }) {
  const { send, pending } = useSendCommand();
  const [result, setResult] = useState<SendResult | null>(null);
  return (
    <>
      <button
        type="button"
        onClick={() =>
          void send({ command_type: 'search', kind: 'secret_doors' }, { display }).then(setResult)
        }
      >
        Search
      </button>
      <output aria-label="status">{result?.status ?? (pending ? 'pending' : 'idle')}</output>
      {result?.status === 'refused' && <p>{result.message}</p>}
    </>
  );
}

function outcome(game: GameState, accepted: boolean): CommandResult {
  return {
    accepted,
    rejections: accepted ? [] : [{ code: 'session.command.wrong_mode', params: { mode: 'exploring' } }],
    events: [],
    messages: [],
    mode: game.mode,
    ended: false,
    revision: accepted ? game.revision + 1 : game.revision,
    game: accepted ? { ...game, revision: game.revision + 1 } : game,
  };
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe('useSendCommand', () => {
  it('sends the current revision and applies the new game state', async () => {
    const { api, store, user } = renderWithTable(<SearchButton />);
    const game = store.getState().game as GameState;
    api.sendCommand.mockResolvedValue(outcome(game, true));
    await user.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => expect(screen.getByLabelText('status')).toHaveTextContent('accepted'));
    expect(api.sendCommand).toHaveBeenCalledWith(
      store.getState().tableId,
      { command_type: 'search', kind: 'secret_doors' },
      game.revision,
    );
    expect(store.getState().game?.revision).toBe(game.revision + 1);
  });

  it("shows a refusal in the game's terms as a toast", async () => {
    const { api, store, user } = renderWithTable(<SearchButton />);
    const game = store.getState().game as GameState;
    api.sendCommand.mockResolvedValue(outcome(game, false));
    await user.click(screen.getByRole('button', { name: 'Search' }));
    const text = describeRejection({ code: 'session.command.wrong_mode', params: { mode: 'exploring' } });
    expect((await screen.findAllByText(text)).length).toBeGreaterThan(0);
    expect(screen.getByLabelText('status')).toHaveTextContent('refused');
  });

  it('returns the refusal for inline display without a toast', async () => {
    const { api, store, user } = renderWithTable(<SearchButton display="inline" />);
    api.sendCommand.mockResolvedValue(outcome(store.getState().game as GameState, false));
    await user.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => expect(screen.getByLabelText('status')).toHaveTextContent('refused'));
    expect(screen.queryByRole('region', { name: 'Notifications' })?.textContent ?? '').toBe('');
  });

  it('handles a revision conflict with a calm notice and the new state', async () => {
    const { api, store, user } = renderWithTable(<SearchButton />);
    const game = store.getState().game as GameState;
    api.sendCommand.mockRejectedValue(
      new BxvttProblemError({
        type: 'about:blank',
        title: 'Conflict',
        status: 409,
        code: 'revision_conflict',
        detail: 'The game moved on.',
        revision: game.revision + 2,
      }),
    );
    api.getGame.mockResolvedValue({ ...game, revision: game.revision + 2 });
    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect((await screen.findAllByText('The table changed')).length).toBeGreaterThan(0);
    await waitFor(() => expect(store.getState().game?.revision).toBe(game.revision + 2));
    expect(screen.getByLabelText('status')).toHaveTextContent('conflict');
  });

  it('sends once on a double click', async () => {
    const { api, store, user } = renderWithTable(<SearchButton />);
    const reply = deferred<CommandResult>();
    api.sendCommand.mockReturnValue(reply.promise);
    await user.dblClick(screen.getByRole('button', { name: 'Search' }));
    expect(api.sendCommand).toHaveBeenCalledTimes(1);
    expect(store.getState().pendingCommand).toBe('search');
    await act(async () => reply.resolve(outcome(store.getState().game as GameState, true)));
    expect(store.getState().pendingCommand).toBeNull();
  });

  it('paces a held key to four commands a second and drops the rest without a word', async () => {
    const { api, store, user } = renderWithTable(<Controls />, {
      snapshot: fixtureSnapshot('exploring', 'player'),
    });
    api.sendCommand.mockImplementation(async () => outcome(store.getState().game as GameState, true));
    for (let i = 0; i < 6; i += 1) await user.click(screen.getByRole('button', { name: 'Hold east' }));
    expect(api.sendCommand).toHaveBeenCalledTimes(4);
    expect(notifications()).toBe('');
  });
});

/** Buttons for each kind of send, and the outcome of each, in order. */
function Controls() {
  const { send, pendingType } = useSendCommand();
  const [log, setLog] = useState<string[]>([]);
  const record = (label: string) => (result: SendResult) =>
    setLog((lines) => [
      ...lines,
      `${label}: ${result.status}${result.status === 'skipped' ? ` ${result.reason}` : ''}`,
    ]);
  return (
    <>
      <button
        type="button"
        onClick={() =>
          void send({ command_type: 'move_party', direction: 'east' }, { repeatable: true }).then(
            record('hold'),
          )
        }
      >
        Hold east
      </button>
      <button
        type="button"
        onClick={() => void send({ command_type: 'rest', kind: 'turn' }).then(record('rest'))}
      >
        Rest
      </button>
      <button
        type="button"
        onClick={() => void send({ command_type: 'open_door', direction: 'east' }).then(record('door'))}
      >
        Open the east door
      </button>
      <output aria-label="pending">{pendingType ?? 'none'}</output>
      <ol aria-label="log">
        {log.map((line, index) => (
          <li key={index}>{line}</li>
        ))}
      </ol>
    </>
  );
}

function notifications(): string {
  return screen.queryByRole('region', { name: 'Notifications' })?.textContent ?? '';
}

function sentTypes(api: { sendCommand: { mock: { calls: unknown[][] } } }): string[] {
  return api.sendCommand.mock.calls.map((call) => (call[1] as GameCommand).command_type);
}

/** A game state after the party stepped east, with a new revision. */
function stepped(game: GameState, mode = game.mode): GameState {
  const position = game.view.location.position ?? [0, 0];
  return {
    ...game,
    mode,
    revision: game.revision + 1,
    view: { ...game.view, location: { ...game.view.location, position: [position[0] + 1, position[1]] } },
  };
}

describe('useSendCommand while a command is on its way', () => {
  it('sends a click after the move in flight lands, with the new revision', async () => {
    const { api, store, user } = renderWithTable(<Controls />);
    const game = store.getState().game as GameState;
    const move = deferred<CommandResult>();
    api.sendCommand.mockReturnValueOnce(move.promise);
    api.sendCommand.mockImplementation(async () => outcome(store.getState().game as GameState, true));
    await user.click(screen.getByRole('button', { name: 'Hold east' }));
    await user.click(screen.getByRole('button', { name: 'Rest' }));
    expect(sentTypes(api)).toEqual(['move_party']);
    expect(screen.getByLabelText('pending')).toHaveTextContent('rest');
    const after = stepped(game);
    await act(async () => move.resolve({ ...outcome(game, true), game: after, revision: after.revision }));
    await waitFor(() => expect(sentTypes(api)).toEqual(['move_party', 'rest']));
    expect(api.sendCommand).toHaveBeenLastCalledWith(
      store.getState().tableId,
      { command_type: 'rest', kind: 'turn' },
      after.revision,
    );
    await waitFor(() =>
      expect(screen.getByRole('list', { name: 'log' })).toHaveTextContent('rest: accepted'),
    );
  });

  it('drops a held key while a command is in flight, without a word', async () => {
    const { api, store, user } = renderWithTable(<Controls />);
    const rest = deferred<CommandResult>();
    api.sendCommand.mockReturnValueOnce(rest.promise);
    await user.click(screen.getByRole('button', { name: 'Rest' }));
    await user.click(screen.getByRole('button', { name: 'Hold east' }));
    expect(screen.getByRole('list', { name: 'log' })).toHaveTextContent('hold: skipped busy');
    await act(async () => rest.resolve(outcome(store.getState().game as GameState, true)));
    expect(sentTypes(api)).toEqual(['rest']);
    expect(notifications()).toBe('');
  });

  it('queues a double click once', async () => {
    const { api, store, user } = renderWithTable(<Controls />);
    const game = store.getState().game as GameState;
    const move = deferred<CommandResult>();
    api.sendCommand.mockReturnValueOnce(move.promise);
    api.sendCommand.mockImplementation(async () => outcome(store.getState().game as GameState, true));
    await user.click(screen.getByRole('button', { name: 'Hold east' }));
    await user.dblClick(screen.getByRole('button', { name: 'Rest' }));
    await act(async () => move.resolve(outcome(game, true)));
    await waitFor(() => expect(sentTypes(api)).toEqual(['move_party', 'rest']));
    await waitFor(() => expect(screen.getAllByText('rest: accepted')).toHaveLength(2));
  });

  it('drops a waiting action with one calm line when the mode changes', async () => {
    const { api, store, user } = renderWithTable(<Controls />);
    const game = store.getState().game as GameState;
    const move = deferred<CommandResult>();
    api.sendCommand.mockReturnValueOnce(move.promise);
    await user.click(screen.getByRole('button', { name: 'Hold east' }));
    await user.click(screen.getByRole('button', { name: 'Rest' }));
    const after = stepped(game, 'encounter');
    await act(async () => move.resolve({ ...outcome(game, true), game: after, revision: after.revision }));
    await waitFor(() =>
      expect(screen.getByRole('list', { name: 'log' })).toHaveTextContent('rest: skipped stale'),
    );
    expect(sentTypes(api)).toEqual(['move_party']);
    expect(notifications()).toMatch(/Couldn't .* because monsters appeared/);
  });

  it('drops a waiting action that names a direction once the party has moved', async () => {
    const { api, store, user } = renderWithTable(<Controls />);
    const game = store.getState().game as GameState;
    const move = deferred<CommandResult>();
    api.sendCommand.mockReturnValueOnce(move.promise);
    await user.click(screen.getByRole('button', { name: 'Hold east' }));
    await user.click(screen.getByRole('button', { name: 'Open the east door' }));
    const after = stepped(game);
    await act(async () => move.resolve({ ...outcome(game, true), game: after, revision: after.revision }));
    await waitFor(() =>
      expect(screen.getByRole('list', { name: 'log' })).toHaveTextContent('door: skipped stale'),
    );
    expect(notifications()).toMatch(/the party moved first/);
  });

  it('sends a click that arrives while commands are paced as soon as the pacing allows', async () => {
    const { api, store, user } = renderWithTable(<Controls />);
    api.sendCommand.mockImplementation(async () => outcome(store.getState().game as GameState, true));
    for (let i = 0; i < 4; i += 1) await user.click(screen.getByRole('button', { name: 'Hold east' }));
    await user.click(screen.getByRole('button', { name: 'Rest' }));
    expect(sentTypes(api)).toEqual(['move_party', 'move_party', 'move_party', 'move_party']);
    await waitFor(() => expect(sentTypes(api)).toContain('rest'), { timeout: 2000 });
  });

  it('drops a waiting action that waited too long, and says so', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    try {
      const { api } = renderWithTable(<Controls />);
      api.sendCommand.mockReturnValueOnce(new Promise<CommandResult>(() => {}));
      fireEvent.click(screen.getByRole('button', { name: 'Hold east' }));
      fireEvent.click(screen.getByRole('button', { name: 'Rest' }));
      await act(async () => vi.advanceTimersByTime(QUEUED_COMMAND_MAX_WAIT_MS));
      expect(screen.getByRole('list', { name: 'log' })).toHaveTextContent('rest: skipped expired');
      expect(notifications()).toMatch(/took too long/);
      expect(sentTypes(api)).toEqual(['move_party']);
    } finally {
      vi.useRealTimers();
    }
  });
});
