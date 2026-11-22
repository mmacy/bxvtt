import { afterEach, describe, expect, it, vi } from 'vitest';
import { readStored, scopedStorage, writeStored } from './storage';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

describe('scopedStorage', () => {
  it("keeps a feature's values under its own prefix, in the storage it names", () => {
    const drafts = scopedStorage('feed', 'session');
    drafts.write('draft.tbl_1', { text: 'Hello', to: [] });
    expect(drafts.key('draft.tbl_1')).toBe('bxvtt.feed.draft.tbl_1');
    expect(sessionStorage.getItem('bxvtt.feed.draft.tbl_1')).toBe('{"text":"Hello","to":[]}');
    expect(localStorage.getItem('bxvtt.feed.draft.tbl_1')).toBeNull();
    expect(drafts.read('draft.tbl_1')).toEqual({ text: 'Hello', to: [] });
    drafts.remove('draft.tbl_1');
    expect(drafts.read('draft.tbl_1')).toBeNull();
  });

  it('keeps a value in memory for the page when the browser refuses to store it', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Site data is blocked.', 'SecurityError');
    });
    writeStored('bxvtt.journal.order', 'newest');
    expect(readStored('bxvtt.journal.order')).toBe('newest');
  });

  it("reads anything that isn't JSON as nothing", () => {
    localStorage.setItem('bxvtt.journal.order', '{not json');
    expect(readStored('bxvtt.journal.order')).toBeNull();
  });
});
