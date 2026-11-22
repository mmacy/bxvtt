import { BxvttProblemError } from '@bxvtt/shared/client';
import type { User } from '@bxvtt/shared/protocol';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setApi } from './api';
import { useIdentity } from './identity';
import { STORAGE_KEYS } from './storage';
import { createFakeApi, type FakeApi } from './testing/renderWithTable';

const rhea: User = {
  id: 'usr_aaaaaaaaaaaaaaaaaaaaaa',
  name: 'Rhea',
  color: '#56b4e9',
  created_at: '2026-11-22T05:00:00Z',
};

let api: FakeApi;

beforeEach(() => {
  localStorage.clear();
  api = createFakeApi();
  setApi(api);
  useIdentity.setState({ status: 'unknown', user: null, token: null, notice: null, lastName: null });
});

afterEach(() => localStorage.clear());

describe('identity', () => {
  it('asks for a name when nothing is stored', async () => {
    await useIdentity.getState().load();
    expect(useIdentity.getState().status).toBe('anonymous');
  });

  it('creates a user and stores the token', async () => {
    api.createUser.mockResolvedValue({ user: rhea, token: 'bxt_secret' });
    await useIdentity.getState().create('  Rhea ');
    expect(api.createUser).toHaveBeenCalledWith('Rhea');
    expect(useIdentity.getState()).toMatchObject({ status: 'ready', user: rhea, token: 'bxt_secret' });
    expect(api.getToken()).toBe('bxt_secret');
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.identity) ?? '{}')).toEqual({
      token: 'bxt_secret',
      user: rhea,
    });
  });

  it('shows a stored user at once and refreshes it from the server', async () => {
    localStorage.setItem(STORAGE_KEYS.identity, JSON.stringify({ token: 'bxt_secret', user: rhea }));
    api.me.mockResolvedValue({ ...rhea, name: 'Rhea of Hollin' });
    const loading = useIdentity.getState().load();
    expect(useIdentity.getState().status).toBe('ready');
    await loading;
    expect(useIdentity.getState().user?.name).toBe('Rhea of Hollin');
  });

  it('forgets a token the server no longer knows and keeps the name for the form', async () => {
    localStorage.setItem(STORAGE_KEYS.identity, JSON.stringify({ token: 'bxt_old', user: rhea }));
    api.me.mockRejectedValue(
      new BxvttProblemError({
        type: 'about:blank',
        title: 'Unauthorized',
        status: 401,
        code: 'unauthorized',
        detail: '',
      }),
    );
    await useIdentity.getState().load();
    expect(useIdentity.getState()).toMatchObject({
      status: 'anonymous',
      notice: 'forgotten',
      lastName: 'Rhea',
    });
    expect(localStorage.getItem(STORAGE_KEYS.identity)).toBeNull();
  });

  it('says the sign-in moved to another browser when the server retired the token', async () => {
    localStorage.setItem(STORAGE_KEYS.identity, JSON.stringify({ token: 'bxt_old', user: rhea }));
    api.me.mockRejectedValue(
      new BxvttProblemError({
        type: 'about:blank',
        title: 'Token retired',
        status: 401,
        code: 'token_retired',
        detail: '',
      }),
    );
    await useIdentity.getState().load();
    expect(useIdentity.getState()).toMatchObject({
      status: 'anonymous',
      notice: 'retired',
      lastName: 'Rhea',
    });
    expect(localStorage.getItem(STORAGE_KEYS.identity)).toBeNull();
  });

  it('keeps the stored user when the server is unreachable', async () => {
    localStorage.setItem(STORAGE_KEYS.identity, JSON.stringify({ token: 'bxt_secret', user: rhea }));
    api.me.mockRejectedValue(new TypeError('Failed to fetch'));
    await useIdentity.getState().load();
    expect(useIdentity.getState().status).toBe('ready');
  });

  it('saves a profile change', async () => {
    localStorage.setItem(STORAGE_KEYS.identity, JSON.stringify({ token: 'bxt_secret', user: rhea }));
    api.me.mockResolvedValue(rhea);
    await useIdentity.getState().load();
    api.updateMe.mockResolvedValue({ ...rhea, color: '#d55e00' });
    await useIdentity.getState().update({ color: '#d55e00' });
    expect(useIdentity.getState().user?.color).toBe('#d55e00');
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.identity) ?? '{}').user.color).toBe('#d55e00');
  });
});
