import { BxvttProblemError } from '@bxvtt/shared/client';
import type { CommandResult, GameState } from '@bxvtt/shared/protocol';
import { describeRejection } from '@bxvtt/shared/text';
import { act, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { useSendCommand, type SendResult } from './commands';
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

  it('paces rapid commands to four a second', async () => {
    const { api, store, user } = renderWithTable(<SearchButton />, {
      snapshot: fixtureSnapshot('exploring', 'player'),
    });
    api.sendCommand.mockImplementation(async () => outcome(store.getState().game as GameState, true));
    for (let i = 0; i < 6; i += 1) await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(api.sendCommand).toHaveBeenCalledTimes(4);
  });
});
