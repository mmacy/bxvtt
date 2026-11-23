import { BxvttProblemError } from '@bxvtt/shared/client';
import type { TableDetail, User } from '@bxvtt/shared/protocol';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { setApi, useIdentity } from '@/app';
import { createFakeApi, type FakeApi } from '@/app/testing/renderWithTable';
import { fixtureSnapshot } from '@/app/testing/fixtures';
import { KitProvider } from '@/ui';
import { parseInvite } from './HomePage';
import { JoinPage } from './JoinPage';

const sam: User = {
  id: 'usr_bbbbbbbbbbbbbbbbbbbbbb',
  name: 'Sam',
  color: '#3fa7d6',
  created_at: '2026-11-22T05:00:00Z',
};

function TableStub() {
  const { tableId } = useParams();
  return <p>At table {tableId}</p>;
}

function renderJoin(api: FakeApi, code = 'ABCDE-FGHIJ-KLMNO-PQRST') {
  setApi(api);
  return render(
    <KitProvider>
      <MemoryRouter initialEntries={[`/join/${code}`]}>
        <Routes>
          <Route path="/join/:code" element={<JoinPage />} />
          <Route path="/tables/:tableId" element={<TableStub />} />
        </Routes>
      </MemoryRouter>
    </KitProvider>,
  );
}

describe('parseInvite', () => {
  it('reads a code from a pasted link or the code itself', () => {
    expect(parseInvite('https://table.example/join/ABCDE-FGHIJ?x=1')).toBe('ABCDE-FGHIJ');
    expect(parseInvite('  abcde-fghij ')).toBe('abcde-fghij');
    expect(parseInvite('   ')).toBeNull();
  });
});

describe('JoinPage', () => {
  let api: FakeApi;
  beforeEach(() => {
    localStorage.clear();
    api = createFakeApi();
    useIdentity.setState({ status: 'anonymous', user: null, token: null, notice: null, lastName: null });
  });

  it('asks a new visitor for a name, then joins and opens the table', async () => {
    const table: TableDetail = fixtureSnapshot('lobby', 'player').table;
    api.createUser.mockResolvedValue({ user: sam, token: 'bxt_sam' });
    api.joinTable.mockResolvedValue(table);
    renderJoin(api);
    const user = userEvent.setup();
    await user.type(screen.getByRole('textbox', { name: 'Your name' }), 'Sam');
    await user.click(screen.getByRole('button', { name: 'Join table' }));
    expect(await screen.findByText(`At table ${table.id}`)).toBeInTheDocument();
    expect(api.createUser).toHaveBeenCalledWith('Sam');
    expect(api.joinTable).toHaveBeenCalledTimes(1);
    expect(api.joinTable).toHaveBeenCalledWith('ABCDE-FGHIJ-KLMNO-PQRST');
  });

  it('stops a name with a text direction mark before it reaches the server', async () => {
    renderJoin(api);
    const user = userEvent.setup();
    await user.type(screen.getByRole('textbox', { name: 'Your name' }), 'Sam‮');
    await user.click(screen.getByRole('button', { name: 'Join table' }));
    expect(await screen.findByText(/text direction marks/)).toBeInTheDocument();
    expect(api.createUser).not.toHaveBeenCalled();
  });

  it('explains an invite code that matches no table', async () => {
    useIdentity.setState({ status: 'ready', user: sam, token: 'bxt_sam' });
    api.joinTable.mockRejectedValue(
      new BxvttProblemError({
        type: 'about:blank',
        title: 'Not Found',
        status: 404,
        code: 'invite_invalid',
        detail: '',
      }),
    );
    renderJoin(api);
    expect(await screen.findByText("That invite code isn't valid")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to your tables' })).toBeInTheDocument();
  });
});
