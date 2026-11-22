/**
 * What the feed remembers in this browser: the composer draft, how far the reader has read, and the game clock
 * at each revision. Storage can fail (private windows, full quota), so every function here falls back to memory.
 */

const memory = new Map<string, string>();

function read(storage: 'local' | 'session', key: string): string | null {
  try {
    const store = storage === 'local' ? globalThis.localStorage : globalThis.sessionStorage;
    if (store) return store.getItem(key);
  } catch {
    // Storage is blocked. Use the copy in memory.
  }
  return memory.get(`${storage}:${key}`) ?? null;
}

function write(storage: 'local' | 'session', key: string, value: string | null): void {
  const memoryKey = `${storage}:${key}`;
  if (value === null) memory.delete(memoryKey);
  else memory.set(memoryKey, value);
  try {
    const store = storage === 'local' ? globalThis.localStorage : globalThis.sessionStorage;
    if (value === null) store?.removeItem(key);
    else store?.setItem(key, value);
  } catch {
    // Storage is full or blocked. The value lives in memory for this page.
  }
}

function parse(text: string | null): unknown {
  if (text === null) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

// Draft --------------------------------------------------------------------------------------------------------

/** The composer's unsent state. */
export interface Draft {
  text: string;
  /** Whisper recipients by user ID. */
  to: string[];
}

const EMPTY_DRAFT: Draft = { text: '', to: [] };

/** The unsent draft for a table, kept for this tab so it survives a tab switch, a reconnect, and a reload. */
export function readDraft(tableId: string): Draft {
  const value = parse(read('session', `bxvtt.feed.draft.${tableId}`));
  if (typeof value !== 'object' || value === null) return EMPTY_DRAFT;
  const record = value as Record<string, unknown>;
  const text = typeof record.text === 'string' ? record.text : '';
  const to = Array.isArray(record.to) ? record.to.filter((id): id is string => typeof id === 'string') : [];
  return { text, to };
}

/** Stores the draft, or clears it when it is empty. */
export function writeDraft(tableId: string, draft: Draft): void {
  const empty = draft.text === '' && draft.to.length === 0;
  write('session', `bxvtt.feed.draft.${tableId}`, empty ? null : JSON.stringify(draft));
}

// Read marker --------------------------------------------------------------------------------------------------

/** The newest `seq` the reader has seen at a table, or `null` the first time. */
export function readLastSeen(tableId: string): number | null {
  const value = Number(read('local', `bxvtt.feed.seen.${tableId}`));
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** Remembers the newest `seq` the reader has seen. It never moves backward. */
export function writeLastSeen(tableId: string, seq: number): void {
  const current = readLastSeen(tableId);
  if (current !== null && current >= seq) return;
  write('local', `bxvtt.feed.seen.${tableId}`, String(seq));
}

// Game clock ---------------------------------------------------------------------------------------------------

const CLOCK_LIMIT = 4000;
const clockCache = new Map<string, Record<string, number>>();

function clockKey(sessionId: string): string {
  return `bxvtt.feed.clock.${sessionId}`;
}

/** The clocks this browser has seen for a session, by revision. */
export function readClocks(sessionId: string): Record<string, number> {
  const cached = clockCache.get(sessionId);
  if (cached) return cached;
  const value = parse(read('local', clockKey(sessionId)));
  const clocks: Record<string, number> = {};
  if (typeof value === 'object' && value !== null) {
    for (const [revision, rounds] of Object.entries(value)) {
      if (typeof rounds === 'number' && Number.isFinite(rounds)) clocks[revision] = rounds;
    }
  }
  clockCache.set(sessionId, clocks);
  return clocks;
}

/**
 * Records the game clock at a revision. A game entry has the revision after its command but not the clock, so the
 * feed matches the two up to show the game time of each entry.
 */
export function recordClock(sessionId: string, revision: number, rounds: number): boolean {
  const clocks = readClocks(sessionId);
  if (clocks[String(revision)] === rounds) return false;
  const next: Record<string, number> = { ...clocks, [String(revision)]: rounds };
  const keys = Object.keys(next);
  if (keys.length > CLOCK_LIMIT) {
    for (const key of keys
      .map(Number)
      .sort((a, b) => a - b)
      .slice(0, keys.length - CLOCK_LIMIT)) {
      delete next[String(key)];
    }
  }
  clockCache.set(sessionId, next);
  write('local', clockKey(sessionId), JSON.stringify(next));
  return true;
}
