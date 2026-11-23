import { BxvttProblemError } from '@bxvtt/shared/client';
import type { Member, TableDetail, TableSummary, User } from '@bxvtt/shared/protocol';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { setApi, STORAGE_KEYS, useIdentity } from '@/app';
import { createFakeApi, resetAppState, type FakeApi } from '@/app/testing/renderWithTable';
import { fixtureSnapshot } from '@/app/testing/fixtures';
import { KitProvider } from '@/ui';
import { ProfileMenu } from './ProfileMenu';

const sam: User = {
  id: 'usr_bbbbbbbbbbbbbbbbbbbbbb',
  name: 'Sam',
  color: '#3fa7d6',
  created_at: '2026-11-22T05:00:00Z',
};

function summary(name: string, fields: Partial<TableSummary>): TableSummary {
  return {
    id: `tbl_${name.padEnd(22, 'x').slice(0, 22)}`,
    name,
    role: 'player',
    phase: 'lobby',
    member_count: 3,
    game: null,
    created_at: '2026-11-22T05:00:00Z',
    ...fields,
  };
}

/** A table's description with Sam and the members given. */
function detail(table: TableSummary, others: Member[]): TableDetail {
  const base = fixtureSnapshot('lobby', 'referee').table;
  const me: Member = { user_id: sam.id, name: sam.name, color: sam.color, role: table.role, joined_at: '' };
  return { ...base, id: table.id, name: table.name, members: [me, ...others] };
}

function member(name: string, role: Member['role']): Member {
  return { user_id: `usr_${name.padEnd(22, 'y').slice(0, 22)}`, name, color: '#e76742', role, joined_at: '' };
}

function problem(code: string, detailText: string): BxvttProblemError {
  return new BxvttProblemError({
    type: 'about:blank',
    title: 'Conflict',
    status: 409,
    code,
    detail: detailText,
  });
}

function renderMenu(api: FakeApi) {
  setApi(api);
  return render(
    <KitProvider>
      <MemoryRouter initialEntries={['/tables/tbl_somewhere']}>
        <Routes>
          <Route path="/" element={<p>Home page</p>} />
          <Route path="/tables/:tableId" element={<ProfileMenu />} />
        </Routes>
      </MemoryRouter>
    </KitProvider>,
  );
}

const user = () => userEvent.setup();

async function openMenuItem(name: string): Promise<void> {
  await userEvent.click(screen.getByRole('button', { name: 'Sam, your profile' }));
  await userEvent.click(await screen.findByRole('button', { name }));
}

describe('ProfileMenu', () => {
  let api: FakeApi;
  beforeEach(() => {
    resetAppState();
    localStorage.clear();
    localStorage.setItem(STORAGE_KEYS.identity, JSON.stringify({ token: 'bxt_sam', user: sam }));
    api = createFakeApi();
    api.setToken('bxt_sam');
    useIdentity.setState({ status: 'ready', user: sam, token: 'bxt_sam', notice: null, lastName: 'Sam' });
  });

  describe('sign out', () => {
    it('says which tables Sam can come back to, then forgets him and goes home', async () => {
      const moor = summary('Moor', {});
      const ford = summary('Ford', { role: 'referee', member_count: 2 });
      api.listTables.mockResolvedValue({ items: [moor, ford] });
      api.getTable.mockResolvedValue(detail(ford, [member('Pip', 'player')]));
      api.signOut.mockResolvedValue(undefined);
      renderMenu(api);
      await openMenuItem('Sign out');

      const dialog = await screen.findByRole('alertdialog', { name: 'Sign out of this browser?' });
      const back = await within(dialog).findByRole('list', { name: 'Tables you can come back to' });
      expect(within(back).getByText('Moor')).toBeInTheDocument();
      const stuck = within(dialog).getByRole('list', { name: "Tables you can't come back to" });
      expect(within(stuck).getByText('Ford')).toBeInTheDocument();
      expect(
        within(dialog).getByText(/make another member a referee .+ or delete the table from its table menu/),
      ).toBeInTheDocument();

      await userEvent.click(within(dialog).getByRole('button', { name: 'Sign out' }));
      expect(await screen.findByText('Home page')).toBeInTheDocument();
      expect(api.signOut).toHaveBeenCalledTimes(1);
      expect(useIdentity.getState()).toMatchObject({ status: 'anonymous', notice: null, lastName: null });
      expect(localStorage.getItem(STORAGE_KEYS.identity)).toBeNull();
    });

    it('says there is no way back for a user at no table, and works from the keyboard', async () => {
      api.listTables.mockResolvedValue({ items: [] });
      renderMenu(api);
      const keys = user();
      await keys.tab();
      await keys.keyboard('{Enter}');
      await screen.findByRole('dialog', { name: 'Your profile' });
      screen.getByRole('button', { name: 'Sign out' }).focus();
      await keys.keyboard('{Enter}');
      const dialog = await screen.findByRole('alertdialog', { name: 'Sign out of this browser?' });
      const text = await within(dialog).findByText(/You aren't at any table/);
      // Nobody can reach the profile after this, so the dialog points to the way to remove it.
      expect(text).toHaveTextContent(/cancel and choose Delete profile instead/);
      // Focus starts on Cancel, so Enter there keeps Sam signed in.
      expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
      await keys.keyboard('{Enter}');
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(useIdentity.getState().status).toBe('ready');
      expect(api.signOut).not.toHaveBeenCalled();
    });
  });

  describe('delete profile', () => {
    it('names the tables that are deleted and left, then deletes the profile and goes home', async () => {
      const solitaire = summary('Solitaire', { role: 'referee', member_count: 1 });
      const moor = summary('Moor', { phase: 'playing' });
      api.listTables.mockResolvedValue({ items: [solitaire, moor] });
      api.deleteMe.mockResolvedValue(undefined);
      renderMenu(api);
      await openMenuItem('Delete profile');

      const dialog = await screen.findByRole('alertdialog', { name: 'Delete your profile?' });
      expect(within(dialog).getByText(/This deletes Sam and every character you made/)).toBeInTheDocument();
      const deleted = await within(dialog).findByRole('list', { name: 'Tables that are deleted' });
      expect(within(deleted).getByText('Solitaire')).toBeInTheDocument();
      const left = within(dialog).getByRole('list', { name: 'Tables you leave' });
      expect(within(left).getByText('Moor')).toBeInTheDocument();
      expect(within(dialog).getByText(/stays in that game, and the referee controls it/)).toBeInTheDocument();

      await userEvent.click(within(dialog).getByRole('button', { name: 'Delete profile' }));
      expect(await screen.findByText('Home page')).toBeInTheDocument();
      expect(api.deleteMe).toHaveBeenCalledTimes(1);
      expect(await screen.findAllByText('Profile deleted')).not.toHaveLength(0);
      expect(useIdentity.getState()).toMatchObject({ status: 'anonymous', notice: null, lastName: null });
    });

    it('explains why the only referee of a table with players has to wait, with no delete button', async () => {
      const ford = summary('Ford', { role: 'referee', member_count: 2 });
      api.listTables.mockResolvedValue({ items: [ford] });
      api.getTable.mockResolvedValue(detail(ford, [member('Pip', 'player')]));
      renderMenu(api);
      await openMenuItem('Delete profile');

      const dialog = await screen.findByRole('dialog', { name: "You can't delete your profile yet" });
      const tables = within(dialog).getByRole('list', { name: "Tables where you're the only referee" });
      expect(within(tables).getByText('Ford')).toBeInTheDocument();
      expect(
        within(dialog).getByText(/make another member a referee, or delete the table from its table menu/),
      ).toBeInTheDocument();
      expect(within(dialog).queryByRole('button', { name: 'Delete profile' })).not.toBeInTheDocument();
      await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
      expect(
        screen.queryByRole('dialog', { name: "You can't delete your profile yet" }),
      ).not.toBeInTheDocument();
      expect(api.deleteMe).not.toHaveBeenCalled();
    });

    it('keeps Sam signed in and shows the reason when the server refuses', async () => {
      // A co-referee stepped down after the dialog opened.
      const ford = summary('Ford', { role: 'referee', member_count: 2 });
      api.listTables.mockResolvedValue({ items: [ford] });
      api.getTable.mockResolvedValue(detail(ford, [member('Pip', 'referee')]));
      api.deleteMe.mockRejectedValue(
        problem(
          'last_referee',
          'You are the only referee of Ford. Make another member a referee there first.',
        ),
      );
      renderMenu(api);
      await openMenuItem('Delete profile');
      const dialog = await screen.findByRole('alertdialog', { name: 'Delete your profile?' });
      await within(dialog).findByRole('list', { name: 'Tables you leave' });
      await userEvent.click(within(dialog).getByRole('button', { name: 'Delete profile' }));
      expect(await screen.findAllByText("You can't delete your profile yet")).not.toHaveLength(0);
      expect(screen.getAllByText(/You are the only referee of Ford/)).not.toHaveLength(0);
      expect(useIdentity.getState().status).toBe('ready');
      expect(screen.queryByText('Home page')).not.toBeInTheDocument();
    });
  });
});
