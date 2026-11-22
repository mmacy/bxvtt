import type { FeedEntry } from '@bxvtt/shared/protocol';
import type { TextContext } from '@bxvtt/shared/text';
import { rollSentence } from './model/dice';
import { markupText, parseMarkup } from './model/markup';
import { narrateEntry } from './model/narrate';
import { isEntryVisible } from './model/rows';
import { systemSentence } from './model/text';

const MAX_LENGTH = 280;

function clip(text: string): string {
  return text.length <= MAX_LENGTH ? text : `${text.slice(0, MAX_LENGTH - 1).trimEnd()}…`;
}

/**
 * What a screen reader hears when an entry arrives from someone else, or `null` for an entry the reader doesn't
 * see. A game entry reads its important lines, so a run of steps stays quiet.
 */
export function announcementFor(
  entry: FeedEntry,
  options: {
    ctx: TextContext;
    lens: boolean;
    selfId: string | null;
    nameOf: (userId: string | null | undefined) => string;
  },
): string | null {
  if (!isEntryVisible(entry, options.selfId, options.lens)) return null;
  const name = options.nameOf(entry.user_id);
  switch (entry.kind) {
    case 'chat': {
      const text = markupText(parseMarkup(entry.text));
      return clip(entry.visibility === 'users' ? `Whisper from ${name}: ${text}` : `${name}: ${text}`);
    }
    case 'roll':
      return clip(`${entry.secret ? 'Secret roll. ' : ''}${rollSentence(name, entry)}`);
    case 'system':
      return systemSentence(entry, options.nameOf, options.ctx);
    case 'game': {
      const narration = narrateEntry(entry, options.ctx, { lens: options.lens });
      const lines = narration.items
        .flatMap((item) => (item.kind === 'line' ? [item.line] : []))
        .filter((line) => line.weight !== 'minor');
      if (lines.length === 0) return null;
      return clip(lines.map((line) => line.text).join(' '));
    }
  }
}
