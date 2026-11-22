/**
 * Polite announcements of what other people do on the map: a ping, a new pin, or a new drawing. Screen reader
 * users hear them, because the canvas can't speak.
 */
import type { Annotation } from '@bxvtt/shared/protocol';
import { useState } from 'react';
import { useMembers, usePings, useTableUser } from '@/app';

/** Added to a repeated sentence, so the live region's text changes. */
const NO_BREAK_SPACE = String.fromCharCode(0xa0);

export interface AnnouncementInput {
  /** Every annotation of the level shown, or `null` while they load. */
  items: readonly Annotation[] | null;
  /** The level shown, as `{dungeon}:{level}`, so a level change doesn't announce the new level's marks. */
  levelKey: string | null;
  /** The level number shown, to name another level in a ping's announcement. */
  levelNumber: number | null;
  /** Pin numbers by pin ID, as the map draws them. */
  pinLabels: ReadonlyMap<string, string>;
}

/**
 * The latest announcement. Each new text replaces the last. A repeat of the same sentence gets a trailing
 * no-break space so the live region still changes and speaks again.
 */
export function useMapAnnouncements({ items, levelKey, levelNumber, pinLabels }: AnnouncementInput): string {
  const me = useTableUser();
  const members = useMembers();
  const pings = usePings();
  const [text, setText] = useState('');
  const [seen, setSeen] = useState<{ levelKey: string | null; items: readonly Annotation[] | null }>({
    levelKey,
    items,
  });
  const [seenPings, setSeenPings] = useState(pings);

  const name = (userId: string) => members.find((member) => member.user_id === userId)?.name ?? 'Someone';
  const say = (next: string) => setText((current) => (current === next ? `${next}${NO_BREAK_SPACE}` : next));

  // Changes are checked during render, as React recommends for state that follows the store.
  if (seen.items !== items || seen.levelKey !== levelKey) {
    if (seen.levelKey === levelKey && seen.items !== null && items !== null) {
      const before = new Set(seen.items.map((item) => item.id));
      const added = items.filter((item) => !before.has(item.id) && item.author_id !== me?.id);
      const last = added.at(-1);
      if (last?.kind === 'pin') {
        const label = pinLabels.get(last.id);
        const note = last.text ? `: ${last.text}` : '.';
        say(`${name(last.author_id)} added ${label ? `pin ${label}` : 'a pin'}${note}`);
      } else if (last?.kind === 'stroke') {
        say(`${name(last.author_id)} drew on the map.`);
      }
    }
    setSeen({ levelKey, items });
  }
  if (seenPings !== pings) {
    const before = new Set(seenPings.map((ping) => ping.id));
    const fresh = pings.filter((ping) => !before.has(ping.id) && ping.user_id !== me?.id).at(-1);
    if (fresh) {
      const where =
        levelNumber !== null && fresh.level_number !== levelNumber ? ` on level ${fresh.level_number}` : '';
      say(`${name(fresh.user_id)} pinged the map${where}.`);
    }
    setSeenPings(pings);
  }
  return text;
}
