import { BxvttProblemError } from '@bxvtt/shared/client';
import type { User } from '@bxvtt/shared/protocol';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setApi, useIdentity } from '@/app';
import { createFakeApi, type FakeApi } from '@/app/testing/renderWithTable';
import { KitProvider } from '@/ui';
import { JoinPage } from './JoinPage';
import { REJOIN_POLL_MS } from './Rejoin';

const sam: User = { id: 'usr_sam', name: 'Sam', color: '#cc79a7', created_at: '2026-11-22T05:00:00Z' };

function TableStub() {
  const { tableId } = useParams();
  return <p>At table {tableId}</p>;
}

function renderJoin(api: FakeApi) {
  setApi(api);
  useIdentity.setState({ status: 'anonymous', user: null, token: null });
  return render(
    <KitProvider>
      <MemoryRouter initialEntries={['/join/ABCDE-FGHIJ']}>
        <Routes>
          <Route path="/join/:code" element={<JoinPage />} />
          <Route path="/tables/:tableId" element={<TableStub />} />
        </Routes>
      </MemoryRouter>
    </KitProvider>,
  );
}

const ticket = {
  request_id: 'rjq_1',
  secret: 's3cret',
  expires_at: '2026-11-22T05:05:00Z',
  approvers_online: 1,
};
const pending = {
  status: 'pending' as const,
  expires_at: ticket.expires_at,
  table_id: 'tbl_1',
  token: null,
  user: null,
};

describe('coming back in as an existing member', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
    useIdentity.setState({ status: 'unknown', user: null, token: null });
  });

  it('offers both paths, waits for a referee, and lands on the table as that member', async () => {
    const api = createFakeApi();
    api.lookupRejoin.mockResolvedValue({
      table_name: 'Thursday',
      members: [{ user_id: 'usr_sam', name: 'Sam', color: '#cc79a7' }],
    });
    api.requestRejoin.mockResolvedValue(ticket);
    api.rejoinStatus.mockResolvedValueOnce(pending);
    api.rejoinStatus.mockResolvedValueOnce({ ...pending, status: 'approved', token: 'tok_new', user: sam });
    api.joinTable.mockResolvedValue({ id: 'tbl_1' } as never);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderJoin(api);
    expect(
      await screen.findByRole('heading', { name: "I've played at this table before" }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: "I'm new here" })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Come back in as Sam' }));
    expect(
      await screen.findByRole('heading', { name: 'Waiting for a referee to let you in as Sam' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/A referee is at the table now/)).toBeInTheDocument();
    await act(async () => vi.advanceTimersByTime(REJOIN_POLL_MS * 2));
    expect(await screen.findByText('At table tbl_1')).toBeInTheDocument();
    expect(useIdentity.getState()).toMatchObject({ status: 'ready', token: 'tok_new', user: sam });
  });

  it('explains a declined request and what to do next', async () => {
    const api = createFakeApi();
    api.lookupRejoin.mockResolvedValue({
      table_name: 'Thursday',
      members: [{ user_id: 'usr_sam', name: 'Sam', color: '#cc79a7' }],
    });
    api.requestRejoin.mockResolvedValue({ ...ticket, approvers_online: 0 });
    api.rejoinStatus.mockResolvedValue({ ...pending, status: 'declined' });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderJoin(api);
    await user.click(await screen.findByRole('button', { name: 'Come back in as Sam' }));
    expect(await screen.findByText(/No referee is at the table right now/)).toBeInTheDocument();
    await act(async () => vi.advanceTimersByTime(REJOIN_POLL_MS));
    expect(await screen.findByText("The referee didn't let you in as Sam")).toBeInTheDocument();
  });

  it('shows the refusal when the member is online', async () => {
    const api = createFakeApi();
    api.lookupRejoin.mockResolvedValue({
      table_name: 'Thursday',
      members: [{ user_id: 'usr_sam', name: 'Sam', color: '#cc79a7' }],
    });
    api.requestRejoin.mockRejectedValue(
      new BxvttProblemError({
        type: 'about:blank',
        title: 'Online',
        status: 409,
        code: 'rejoin_member_online',
        detail: 'x',
      }),
    );
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderJoin(api);
    await user.click(await screen.findByRole('button', { name: 'Come back in as Sam' }));
    expect(await screen.findByText('That member is at the table right now')).toBeInTheDocument();
  });
});
