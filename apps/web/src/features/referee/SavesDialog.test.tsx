import type { SaveEntry } from '@bxvtt/shared/protocol';
import { act, screen, waitFor, within } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';
import { fixtureSnapshot } from '@/app/testing/fixtures';
import { createFakeApi, renderWithTable } from '@/app/testing/renderWithTable';
import { exportFileName, saveCountText, SavesDialog, saveTitle } from './SavesDialog';
import { RefereeNotes } from './sections/RefereeNotes';
import { installDomShims } from './testing/helpers';

beforeAll(installDomShims);

function saves(sessionId: string, refereeId: string): SaveEntry[] {
  return [
    {
      id: 'sav_named',
      session_id: sessionId,
      label: 'Before the bell pit',
      autosave: false,
      mode: 'exploring',
      clock: { rounds: 4320, turns: 72, days: 0 },
      adventure_name: 'The Drowned Bell',
      created_by: refereeId,
      created_at: new Date(Date.now() - 120_000).toISOString(),
    },
    {
      id: 'sav_auto',
      session_id: sessionId,
      label: 'Autosave: Entered the priory',
      autosave: true,
      mode: 'exploring',
      clock: { rounds: 180, turns: 3, days: 0 },
      adventure_name: 'The Drowned Bell',
      created_by: null,
      created_at: new Date(Date.now() - 3_600_000).toISOString(),
    },
  ];
}

describe('saveTitle and exportFileName', () => {
  it('drops the autosave prefix and names the file after the save', () => {
    const [named, auto] = saves('ses', 'usr');
    if (!named || !auto) throw new Error('missing fixture');
    expect(saveTitle(auto)).toBe('Entered the priory');
    expect(exportFileName(named)).toBe('before-the-bell-pit.bxsave.json');
    expect(saveCountText(2, 2)).toBe('2 autosaves');
    expect(saveCountText(5, 1)).toBe('5 saves, 1 of them an autosave');
  });
});

describe('SavesDialog', () => {
  it('lists saves newest first, marks autosaves, and offers a player no restore', async () => {
    const snapshot = fixtureSnapshot('exploring', 'player');
    const referee = snapshot.table.members.find((m) => m.role === 'referee');
    const api = createFakeApi();
    api.listSaves.mockResolvedValue({
      items: saves(snapshot.game?.session_id ?? '', referee?.user_id ?? ''),
    });
    renderWithTable(<SavesDialog open onOpenChange={() => {}} />, { snapshot, api });
    const list = await screen.findByRole('list', { name: 'Saves, newest first' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('Before the bell pit');
    expect(rows[1]).toHaveTextContent('Entered the priory');
    expect(within(rows[1] as HTMLElement).getByText('Autosave')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Restore' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Delete/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Autosave is on/)).toBeInTheDocument();
  });

  it('makes a named save', async () => {
    const snapshot = fixtureSnapshot('exploring', 'player');
    const api = createFakeApi();
    api.listSaves.mockResolvedValue({ items: [] });
    const [named] = saves(snapshot.game?.session_id ?? '', snapshot.user.id);
    if (!named) throw new Error('missing fixture');
    api.createSave.mockResolvedValue({ ...named, label: 'At the font' });
    const { user, store } = renderWithTable(<SavesDialog open onOpenChange={() => {}} />, { snapshot, api });
    await user.type(await screen.findByRole('textbox', { name: /Save the game now/ }), 'At the font');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.createSave).toHaveBeenCalledWith(store.getState().tableId, 'At the font'));
    expect(await screen.findByText('At the font')).toBeInTheDocument();
  });

  it('saves the current game first, then restores, when a referee confirms', async () => {
    const snapshot = fixtureSnapshot('exploring', 'referee');
    const api = createFakeApi();
    const list = saves(snapshot.game?.session_id ?? '', snapshot.user.id);
    api.listSaves.mockResolvedValue({ items: list });
    api.createSave.mockResolvedValue({ ...(list[0] as SaveEntry), id: 'sav_before' });
    api.restoreSave.mockResolvedValue(snapshot.game as never);
    const { user, store } = renderWithTable(<SavesDialog open onOpenChange={() => {}} />, { snapshot, api });
    const restoreButtons = await screen.findAllByRole('button', { name: 'Restore' });
    await user.click(restoreButtons[0] as HTMLElement);
    const confirm = await screen.findByRole('dialog', { name: /Restore “Before the bell pit”/ });
    expect(within(confirm).getByText(/continues from this save/)).toBeInTheDocument();
    expect(within(confirm).getByRole('checkbox', { name: /Save the current game first/ })).toBeChecked();
    await user.click(within(confirm).getByRole('button', { name: 'Restore' }));
    const tableId = store.getState().tableId;
    await waitFor(() => expect(api.restoreSave).toHaveBeenCalledWith(tableId, 'sav_named'));
    expect(api.createSave).toHaveBeenCalledWith(tableId, 'Before restoring Before the bell pit');
  });
});

describe('RefereeNotes', () => {
  it('saves after typing, and offers a choice when another referee saved first', async () => {
    const snapshot = fixtureSnapshot('exploring', 'referee');
    const api = createFakeApi();
    const other = snapshot.table.members.find((m) => m.user_id !== snapshot.user.id);
    api.updateNotes.mockImplementation((_t, kind, text, version) =>
      Promise.resolve({
        kind,
        text,
        version: version + 1,
        updated_by: snapshot.user.id,
        updated_at: new Date().toISOString(),
      }),
    );
    const { user, store } = renderWithTable(<RefereeNotes />, { snapshot, api });
    const box = screen.getByRole('textbox', { name: 'Private notes' });
    await user.type(box, 'Ippa');
    await waitFor(
      () => expect(api.updateNotes).toHaveBeenCalledWith(store.getState().tableId, 'referee', 'Ippa', 0),
      {
        timeout: 3000,
      },
    );
    act(() =>
      store.getState().receiveNotes({
        kind: 'referee',
        text: 'Ippa',
        version: 1,
        updated_by: snapshot.user.id,
        updated_at: null,
      }),
    );

    await user.type(box, ' wants the goblins gone');
    act(() =>
      store.getState().receiveNotes({
        kind: 'referee',
        text: 'Ippa\nTheir line.',
        version: 2,
        updated_by: other?.user_id ?? null,
        updated_at: new Date().toISOString(),
      }),
    );
    expect(await screen.findByText(/changed these notes while you were writing/)).toBeInTheDocument();
    expect(box).toHaveValue('Ippa wants the goblins gone');
    await user.click(screen.getByRole('button', { name: 'Keep my version' }));
    await waitFor(() =>
      expect(api.updateNotes).toHaveBeenLastCalledWith(
        expect.any(String),
        'referee',
        'Ippa wants the goblins gone',
        2,
      ),
    );
  });
});
