import type { FeedEntry } from '@bxvtt/shared/protocol';
import type { TextContext } from '@bxvtt/shared/text';
import { markupText, parseMarkup } from './model/markup';
import { narrateEntry } from './model/narrate';
import { commandLabel } from './model/rows';
import { systemSentence } from './model/text';

const cache = new WeakMap<FeedEntry, { ctx: TextContext; lens: boolean; text: string }>();

/**
 * The text an entry matches a search on: the message, the roll, or the narrated game lines, with the author's
 * name. It caches game entries, because describing every event of a long game on each keystroke is slow.
 */
export function searchText(
  entry: FeedEntry,
  options: { ctx: TextContext; lens: boolean; nameOf: (userId: string | null | undefined) => string },
): string {
  const author = options.nameOf(entry.user_id);
  switch (entry.kind) {
    case 'chat':
      return `${author} ${markupText(parseMarkup(entry.text))}`;
    case 'roll':
      return `${author} ${entry.expression} ${entry.comment} ${entry.total}`;
    case 'system':
      return systemSentence(entry, options.nameOf, options.ctx);
    case 'game': {
      const cached = cache.get(entry);
      if (cached && cached.ctx === options.ctx && cached.lens === options.lens) return cached.text;
      const text = `${author} ${commandLabel(entry) ?? ''} ${narrateEntry(entry, options.ctx, { lens: options.lens }).text}`;
      cache.set(entry, { ctx: options.ctx, lens: options.lens, text });
      return text;
    }
  }
}
