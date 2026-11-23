import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fixtureSnapshot } from '@/app/testing/fixtures';
import { createFakeApi, renderWithTable } from '@/app/testing/renderWithTable';
import { RejoinPrompt } from './RejoinPrompt';

function request(id: string, userId: string, name: string) {
  return {
    id,
    table_id: 'tbl_x',
    user_id: userId,
    name,
    color: '#3fa7d6' as const,
    role: 'player' as const,
    created_at: '2026-11-22T05:00:00Z',
    expires_at: '2026-11-22T05:05:00Z',
  };
}

describe('RejoinPrompt', () => {
  it('asks the referee to approve a returning member, and approves the request', async () => {
    const snapshot = fixtureSnapshot('lobby', 'referee');
    const api = createFakeApi();
    api.approveRejoin.mockResolvedValue({ items: [] });
    const { user, store } = renderWithTable(<RejoinPrompt />, {
      snapshot,
      api,
      data: { rejoinRequests: [request('rjq_1', 'usr_sam', 'Sam'), request('rjq_2', 'usr_ann', 'Ann')] },
    });
    expect(screen.getByRole('region', { name: 'Rejoin requests' })).toHaveTextContent(
      'Someone asked to rejoin as Sam',
    );
    expect(screen.getByText(/1 more rejoin request is waiting/)).toBeInTheDocument();
    expect(screen.getByText(/confirm by voice or chat that it's really Sam/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Approve' }));
    expect(api.approveRejoin).toHaveBeenCalledWith(store.getState().tableId, 'rjq_1');
    expect(screen.queryByRole('region', { name: 'Rejoin requests' })).not.toBeInTheDocument();
  });

  it("tells a referee they can't approve their own request", () => {
    const snapshot = fixtureSnapshot('lobby', 'referee');
    const me = snapshot.user.id;
    renderWithTable(<RejoinPrompt />, { snapshot, data: { rejoinRequests: [request('rjq_1', me, 'Ruth')] } });
    expect(screen.getByText('Someone asked to rejoin as you')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
  });
});
