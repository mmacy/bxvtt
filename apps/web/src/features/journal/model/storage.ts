/**
 * What the journal remembers in this browser: which quest changes the reader has seen, and the reader's choice of
 * section and order. Storage can fail, so each function falls back quietly.
 */
import type { SeenQuests } from './quests';

function read(key: string): unknown {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    return raw === null || raw === undefined ? null : (JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value));
  } catch {
    // Storage is full or blocked. The journal marks changes again next time.
  }
}

/** The quests and objectives the reader saw last time in this session, or `null` the first time. */
export function readSeenQuests(sessionId: string): SeenQuests | null {
  const value = read(`bxvtt.journal.quests.${sessionId}`);
  if (typeof value !== 'object' || value === null) return null;
  const seen: SeenQuests = {};
  for (const [questId, objectives] of Object.entries(value)) {
    if (typeof objectives !== 'object' || objectives === null) continue;
    seen[questId] = {};
    for (const [id, complete] of Object.entries(objectives)) {
      if (typeof complete === 'boolean') seen[questId][id] = complete;
    }
  }
  return seen;
}

export function writeSeenQuests(sessionId: string, seen: SeenQuests): void {
  write(`bxvtt.journal.quests.${sessionId}`, seen);
}

/** The journal's sections. */
export type JournalSection = 'quests' | 'journal' | 'notes';

export type ChronicleOrder = 'chronicle' | 'newest';

const choices = new Map<string, { section: JournalSection; order: ChronicleOrder }>();

/** The section and order the reader chose at a table, kept while the dock shows another tab. */
export function readChoices(tableId: string): { section: JournalSection; order: ChronicleOrder } {
  const stored = choices.get(tableId);
  if (stored) return stored;
  const value = read('bxvtt.journal.choices') as { section?: unknown; order?: unknown } | null;
  const section = value?.section === 'journal' || value?.section === 'notes' ? value.section : 'quests';
  const order = value?.order === 'newest' ? 'newest' : 'chronicle';
  return { section, order };
}

export function writeChoices(
  tableId: string,
  value: { section: JournalSection; order: ChronicleOrder },
): void {
  choices.set(tableId, value);
  write('bxvtt.journal.choices', value);
}
