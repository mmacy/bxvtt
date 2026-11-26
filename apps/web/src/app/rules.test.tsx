import { screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { fixtureSnapshot } from './testing/fixtures';
import { createFakeApi, renderWithTable } from './testing/renderWithTable';
import { useSpellDetail } from './rules';

function SleepDetail() {
  const detail = useSpellDetail('sleep');
  if (detail.loading) return <p>Loading</p>;
  return <p>{detail.data ? detail.data.name : 'Failed'}</p>;
}

/** Shows Sleep's details while open, so closing and opening mounts the details again. */
function Reopenable() {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setOpen(!open)}>
        Toggle
      </button>
      {open && <SleepDetail />}
    </>
  );
}

describe('useSpellDetail', () => {
  it('loads the spell catalog again outside a game when the details mount after a failed load', async () => {
    const api = createFakeApi();
    api.fullCatalog.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({
      catalog: 'spells',
      total: 1,
      items: [{ id: 'sleep', name: 'Sleep', level: 1, modes: [] }],
    } as never);
    const { user } = renderWithTable(<Reopenable />, { api, snapshot: fixtureSnapshot('lobby', 'player') });
    expect(await screen.findByText('Failed')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Toggle' }));
    await user.click(screen.getByRole('button', { name: 'Toggle' }));
    expect(await screen.findByText('Sleep')).toBeInTheDocument();
    expect(api.fullCatalog).toHaveBeenCalledTimes(2);
  });
});
