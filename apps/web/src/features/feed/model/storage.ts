/**
 * What the feed remembers in this browser: the composer draft for this tab, and how far the reader has read.
 */
import { scopedStorage } from '@/app';

const drafts = scopedStorage('feed', 'session');
const seen = scopedStorage('feed', 'local');

/** The composer's unsent state. */
export interface Draft {
  text: string;
  /** Whisper recipients by user ID. */
  to: string[];
}

/** The unsent draft for a table, kept for this tab so it survives a reconnect and a reload. */
export function readDraft(tableId: string): Draft {
  const value = drafts.read(`draft.${tableId}`);
  if (typeof value !== 'object' || value === null) return { text: '', to: [] };
  const record = value as Record<string, unknown>;
  const text = typeof record.text === 'string' ? record.text : '';
  const to = Array.isArray(record.to) ? record.to.filter((id): id is string => typeof id === 'string') : [];
  return { text, to };
}

/** Stores the draft, or clears it when it is empty. */
export function writeDraft(tableId: string, draft: Draft): void {
  if (draft.text === '' && draft.to.length === 0) drafts.remove(`draft.${tableId}`);
  else drafts.write(`draft.${tableId}`, draft);
}

/** The newest `seq` the reader has seen at a table, or `null` the first time. */
export function readLastSeen(tableId: string): number | null {
  const value = seen.read(`seen.${tableId}`);
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

/** Remembers the newest `seq` the reader has seen. It never moves backward. */
export function writeLastSeen(tableId: string, seq: number): void {
  const current = readLastSeen(tableId);
  if (current !== null && current >= seq) return;
  seen.write(`seen.${tableId}`, seq);
}
