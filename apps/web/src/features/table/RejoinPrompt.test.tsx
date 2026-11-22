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
    color: '#cc79a7' as const,
    role: 'player' as const,
    created_at: '2026-11-22T05:00:00Z',
    expires_at: '2026-11-22T05:05:00Z',
  };
}

describe('RejoinPrompt', () => {
  it('asks the referee to let a returning member in, and lets them in', async () => {
    const snapshot = fixtureSnapshot('lobby', 'referee');
    const api = createFakeApi();
    api.approveRejoin.mockResolvedValue({ items: [] });
    const { user, store } = renderWithTable(<RejoinPrompt />, {
      snapshot,
      api,
      data: { rejoinRequests: [request('rjq_1', 'usr_sam', 'Sam'), request('rjq_2', 'usr_ann', 'Ann')] },
    });
    expect(screen.getByRole('region', { name: 'Requests to come back in' })).toHaveTextContent(
      'Someone is asking to come back in as Sam',
    );
    expect(screen.getByText(/One more request is waiting/)).toBeInTheDocument();
    expect(screen.getByText(/Let them in only if you know it's Sam/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Let them in' }));
    expect(api.approveRejoin).toHaveBeenCalledWith(store.getState().tableId, 'rjq_1');
    expect(screen.queryByRole('region', { name: 'Requests to come back in' })).not.toBeInTheDocument();
  });

  it("tells a referee they can't let themselves in", () => {
    const snapshot = fixtureSnapshot('lobby', 'referee');
    const me = snapshot.user.id;
    renderWithTable(<RejoinPrompt />, { snapshot, data: { rejoinRequests: [request('rjq_1', me, 'Ruth')] } });
    expect(screen.getByText('Someone is asking to come back in as you')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Let them in' })).not.toBeInTheDocument();
  });
});
