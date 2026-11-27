/**
 * The hook that reads the trade limits, against a fake API whose answers the test releases one at a time.
 */
import type { AdjustmentLimits } from '@bxvtt/shared/protocol';
import { BxvttProblemError } from '@bxvtt/shared/client';
import type { Problem } from '@bxvtt/shared/protocol';
import { act, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createFakeApi, renderWithTable, type FakeApi } from '@/app/testing/renderWithTable';
import limitFixtures from './__fixtures__/adjustment-limits.json';
import { useAdjustmentLimits } from './useAdjustmentLimits';

const FIGHTER = limitFixtures.fighter_515.limits as AdjustmentLimits;
const ELF = limitFixtures.elf_1832.limits as AdjustmentLimits;

interface Pending {
  classId: string;
  resolve: (limits: AdjustmentLimits) => void;
  reject: (error: unknown) => void;
}

/** A fake API whose limit reads wait until the test settles them, in the order they were asked. */
function deferredApi(): { api: FakeApi; pending: Pending[] } {
  const api = createFakeApi();
  const pending: Pending[] = [];
  api.getAdjustmentLimits.mockImplementation(
    (_rollId, query) =>
      new Promise<AdjustmentLimits>((resolve, reject) => {
        pending.push({ classId: query.class_id, resolve, reject });
      }),
  );
  return { api, pending };
}

interface ProbeProps {
  classId: string | null;
  enabled: boolean;
  onRefusal?: (error: unknown) => boolean;
}

function Probe({ classId, enabled, onRefusal = () => false }: ProbeProps) {
  const { state, retrying, retry } = useAdjustmentLimits('rol_probe', classId, enabled, onRefusal);
  const text =
    state.status === 'ready'
      ? `ready ${state.limits.max_points}`
      : state.status === 'failed'
        ? `failed${retrying ? ' retrying' : ''}`
        : 'loading';
  const detail = state.status === 'failed' ? state.detail : '';
  return (
    <>
      <p>{text}</p>
      <p>{detail}</p>
      <button type="button" onClick={retry}>
        Retry
      </button>
    </>
  );
}

const settle = () => act(async () => new Promise((resolve) => setTimeout(resolve, 0)));

describe('useAdjustmentLimits', () => {
  it('ignores the answer for a class the player has left while it was in flight', async () => {
    const { api, pending } = deferredApi();
    const { rerender } = renderWithTable(<Probe classId="fighter" enabled />, { api });
    rerender(<Probe classId="elf" enabled />);
    await settle();
    expect(pending.map((p) => p.classId)).toEqual(['fighter', 'elf']);
    pending[0]?.resolve(FIGHTER);
    await settle();
    expect(screen.getByText('loading')).toBeInTheDocument();
    pending[1]?.resolve(ELF);
    expect(await screen.findByText(`ready ${ELF.max_points}`)).toBeInTheDocument();
  });

  it('reads again when the player comes back to the step after leaving it mid-request', async () => {
    const { api, pending } = deferredApi();
    const { rerender } = renderWithTable(<Probe classId="fighter" enabled />, { api });
    rerender(<Probe classId="fighter" enabled={false} />);
    pending[0]?.resolve(FIGHTER);
    await settle();
    expect(screen.getByText('loading')).toBeInTheDocument();
    rerender(<Probe classId="fighter" enabled />);
    await settle();
    expect(pending).toHaveLength(2);
    pending[1]?.resolve(FIGHTER);
    expect(await screen.findByText(`ready ${FIGHTER.max_points}`)).toBeInTheDocument();
  });

  it('keeps a failure without reading again until Try again, and stays failed while the retry runs', async () => {
    const { api, pending } = deferredApi();
    const { user, rerender } = renderWithTable(<Probe classId="fighter" enabled />, { api });
    pending[0]?.reject(new TypeError('Failed to fetch'));
    expect(await screen.findByText('failed')).toBeInTheDocument();
    rerender(<Probe classId="fighter" enabled={false} />);
    rerender(<Probe classId="fighter" enabled />);
    await settle();
    expect(api.getAdjustmentLimits).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('failed retrying')).toBeInTheDocument();
    expect(api.getAdjustmentLimits).toHaveBeenCalledTimes(2);
    pending[1]?.resolve(FIGHTER);
    expect(await screen.findByText(`ready ${FIGHTER.max_points}`)).toBeInTheDocument();
  });

  it('leaves a refusal that ends the roll to onRefusal, and shows no failure for it', async () => {
    const { api, pending } = deferredApi();
    const onRefusal = vi.fn(() => true);
    renderWithTable(<Probe classId="fighter" enabled onRefusal={onRefusal} />, { api });
    const refusal = new Error('ability_roll_superseded');
    pending[0]?.reject(refusal);
    await settle();
    expect(onRefusal).toHaveBeenCalledWith(refusal);
    expect(screen.getByText('loading')).toBeInTheDocument();
    expect(api.getAdjustmentLimits).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      'an unreachable server',
      new BxvttProblemError({
        type: 'about:blank',
        title: 'Service Unavailable',
        status: 503,
        code: 'server_unavailable',
        detail: 'The server is unavailable.',
      } as Problem),
      "The bxvtt server isn't responding. It might be starting or restarting. Wait a few seconds and try again.",
    ],
    [
      'a network error',
      new TypeError('Failed to fetch'),
      "Can't reach the bxvtt server. Check your connection, or ask the server host whether the server is running.",
    ],
    ['a thrown error', new Error('boom'), 'Something went wrong. If it keeps happening, reload the page.'],
    [
      'a server error',
      new BxvttProblemError({
        type: 'about:blank',
        title: 'Internal Server Error',
        status: 500,
        code: 'internal_error',
        detail: 'The server failed.',
      } as Problem),
      'Something went wrong on the server. If it keeps happening, contact the server host.',
    ],
  ])('says what failed for %s, so the reason has its subject', async (_label, error, detail) => {
    const { api, pending } = deferredApi();
    renderWithTable(<Probe classId="fighter" enabled />, { api });
    pending[0]?.reject(error);
    expect(await screen.findByText('failed')).toBeInTheDocument();
    expect(screen.getByText(detail)).toBeInTheDocument();
  });
});
