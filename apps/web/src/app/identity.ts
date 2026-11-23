/**
 * Who the person at this browser is: their bxvtt user and secret token, kept in `localStorage`.
 *
 * bxvtt has no passwords. The first time someone opens the app, they pick a display name, the server creates a
 * user, and the browser stores the token. {@link useIdentity} exposes the user and the actions that change it.
 */
import { isProblem } from '@bxvtt/shared/client';
import type { UpdateUserRequest, User } from '@bxvtt/shared/protocol';
import { create } from 'zustand';
import { getApi } from './api';
import { STORAGE_KEYS, readStored, writeStored } from './storage';

/**
 * - `unknown`: the stored token hasn't been read yet.
 * - `anonymous`: no user yet. Show the first-run name form.
 * - `ready`: a user and token are stored. `user` is set.
 */
export type IdentityStatus = 'unknown' | 'anonymous' | 'ready';

/**
 * Why the app asks for a name again, when it does.
 *
 * - `forgotten`: the server no longer knows the stored token, for example after its data was reset.
 * - `retired`: a referee let this user back in from another browser, which retired this browser's token. The
 *   user still exists, so the app must not offer to make a second one with the same name as if nothing happened.
 */
export type IdentityNotice = 'forgotten' | 'retired' | null;

/**
 * Whether an error says the token was retired: a referee let its user back in from another browser, and that
 * browser now holds the user's token. The server answers 401 with the `token_retired` code.
 */
export function isRetiredToken(error: unknown): boolean {
  return isProblem(error, 'token_retired');
}

export interface IdentityState {
  status: IdentityStatus;
  user: User | null;
  token: string | null;
  /** Why the stored user was dropped, when it was, so the name form can explain it. */
  notice: IdentityNotice;
  /** The last display name, to prefill the name form after the server forgot the user. */
  lastName: string | null;
  /** Reads the stored identity and checks it with the server. Call once at startup. */
  load: () => Promise<void>;
  /**
   * Creates a user with a display name and stores the token.
   *
   * @throws The API error, for the form to show.
   */
  create: (name: string) => Promise<User>;
  /**
   * Changes the display name, the color, or both.
   *
   * @throws The API error, for the form to show.
   */
  update: (body: UpdateUserRequest) => Promise<User>;
  /** Forgets the stored user, for example after the server answers 401 to the stored token. */
  forget: (notice?: IdentityNotice) => void;
  /**
   * Signs this browser out. The browser forgets the user at once, so the app shows the first-run name form, and the
   * server stops accepting the token. The user stays at their tables. If the server can't be reached, the browser
   * forgets the user anyway.
   */
  signOut: () => Promise<void>;
  /**
   * Deletes the user on the server, and then forgets them here, so the app shows the first-run name form.
   *
   * @throws The API error, such as `last_referee`, for the caller to show. The user stays signed in then.
   */
  deleteUser: () => Promise<void>;
  /**
   * Signs this browser in as an existing user with a token the server issued, such as the token a referee's
   * approval of a rejoin request returns. Stores it like a new user's token.
   */
  adopt: (token: string, user: User) => void;
}

interface StoredIdentity {
  token: string;
  user: User;
}

function readIdentity(): StoredIdentity | null {
  const value = readStored(STORAGE_KEYS.identity);
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Partial<StoredIdentity>;
  if (typeof record.token !== 'string' || typeof record.user !== 'object' || record.user === null)
    return null;
  return { token: record.token, user: record.user };
}

let followingOtherTabs = false;

/**
 * Follows the identity in this browser's other tabs, which share `localStorage`: when another tab signs out,
 * deletes the user, or signs in as someone, this tab does the same, instead of acting for a user the browser has
 * forgotten.
 */
function followOtherTabs(): void {
  if (followingOtherTabs || typeof window === 'undefined') return;
  followingOtherTabs = true;
  window.addEventListener('storage', (event) => {
    // A `null` key means the other tab cleared all of the site's storage.
    if (event.key !== STORAGE_KEYS.identity && event.key !== null) return;
    const stored = readIdentity();
    const state = useIdentity.getState();
    if (stored === null) {
      if (state.status !== 'ready') return;
      getApi().setToken(null);
      useIdentity.setState({ status: 'anonymous', user: null, token: null, notice: null, lastName: null });
    } else if (stored.token !== state.token) {
      getApi().setToken(stored.token);
      useIdentity.setState({
        status: 'ready',
        user: stored.user,
        token: stored.token,
        notice: null,
        lastName: stored.user.name,
      });
    }
  });
}

/**
 * The identity store. Read it with a selector, such as `useIdentity((s) => s.user)`.
 *
 * ```tsx
 * const user = useIdentity((s) => s.user);
 * const update = useIdentity((s) => s.update);
 * await update({ color: '#f29e2e' });
 * ```
 */
export const useIdentity = create<IdentityState>()((set, get) => ({
  status: 'unknown',
  user: null,
  token: null,
  notice: null,
  lastName: null,

  load: async () => {
    followOtherTabs();
    const stored = readIdentity();
    if (stored === null) {
      getApi().setToken(null);
      set({ status: 'anonymous', user: null, token: null });
      return;
    }
    getApi().setToken(stored.token);
    // Show the stored user at once and confirm it in the background, so a slow server never blocks the page.
    set({ status: 'ready', user: stored.user, token: stored.token, lastName: stored.user.name });
    try {
      const user = await getApi().me();
      if (get().token !== stored.token) return;
      writeStored(STORAGE_KEYS.identity, { token: stored.token, user });
      set({ user });
    } catch (error) {
      if (get().token !== stored.token) return;
      // Any other failure keeps the stored user, and the next request reports the problem.
      if (isRetiredToken(error)) get().forget('retired');
      else if (isProblem(error, 'unauthorized')) get().forget('forgotten');
    }
  },

  create: async (name) => {
    const { user, token } = await getApi().createUser(name.trim());
    getApi().setToken(token);
    writeStored(STORAGE_KEYS.identity, { token, user });
    set({ status: 'ready', user, token, notice: null, lastName: user.name });
    return user;
  },

  update: async (body) => {
    const user = await getApi().updateMe(body);
    const token = get().token;
    if (token !== null) writeStored(STORAGE_KEYS.identity, { token, user });
    set({ user, lastName: user.name });
    return user;
  },

  adopt: (token, user) => {
    getApi().setToken(token);
    writeStored(STORAGE_KEYS.identity, { token, user });
    set({ status: 'ready', user, token, notice: null, lastName: user.name });
  },

  forget: (notice = null) => {
    writeStored(STORAGE_KEYS.identity, null);
    getApi().setToken(null);
    set((state) => ({
      status: 'anonymous',
      user: null,
      token: null,
      notice,
      lastName: state.user?.name ?? state.lastName,
    }));
  },

  signOut: async () => {
    // The client forgets its token before the request leaves, so nothing else this page sends uses it.
    const signingOut = getApi().signOut();
    clear(set);
    try {
      await signingOut;
    } catch {
      // The browser has forgotten the token either way, and nothing else holds it.
    }
  },

  deleteUser: async () => {
    await getApi().deleteMe();
    clear(set);
  },
}));

/**
 * Forgets the stored user without a notice or a name to prefill, so the name form looks as it does on a first
 * visit. The person chose to leave, so the app doesn't offer their old name back.
 */
function clear(set: (state: Partial<IdentityState>) => void): void {
  writeStored(STORAGE_KEYS.identity, null);
  getApi().setToken(null);
  set({ status: 'anonymous', user: null, token: null, notice: null, lastName: null });
}

/** The signed-in user, or `null` before the first-run name form. */
export function useCurrentUser(): User | null {
  return useIdentity((state) => state.user);
}
