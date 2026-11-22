/**
 * Sums up a whole fight from the feed: how it ended, what the party defeated and what that's worth, what the
 * slain left behind, and who fell. Every number comes from the events bxapi reported.
 */
import type { FeedEntry } from '@bxvtt/shared/protocol';
import {
  encounterOutcomeLabel,
  encounterOutcomeSentence,
  extendContextWithEntryNames,
  extendContextWithEvents,
  idKind,
  itemList,
  joinList,
  memberName,
  pluralize,
  prettifyId,
  type TextContext,
} from '@bxvtt/shared/text';
import type { AnyEvent } from './playback';

export interface FightSummary {
  /** `victory`, `fled`, `defeat`, or an encounter outcome such as `parley` or `evaded`. */
  outcome: string | null;
  title: string;
  sentence: string;
  rounds: number;
  /** "3 goblins slain", "2 skeletons fled", by kind and how each was defeated. */
  defeated: Array<{ text: string; xp: number }>;
  xpTotal: number;
  /** Experience bxapi awarded each member now, when the ruleset awards it at once. */
  awards: Array<{ memberId: string; name: string; xp: number; levelAfter: number | null }>;
  /** What the slain left on the floor, as phrases. */
  loot: string[];
  fallen: string[];
}

function str(event: AnyEvent, key: string): string | null {
  const value = event[key];
  return typeof value === 'string' ? value : null;
}

function num(event: AnyEvent, key: string): number | null {
  const value = event[key];
  return typeof value === 'number' ? value : null;
}

const DEFEAT_VERB: Record<string, string> = {
  slain: 'slain',
  fled: 'fled',
  turned: 'turned',
  destroyed: 'destroyed',
  routed: 'routed',
};

/**
 * The events of the fight that ends with the newest game entry: everything since the encounter opened.
 *
 * @param feed - The feed, oldest first.
 * @param endSeq - The `seq` of the entry that ended the fight.
 */
export function fightEntries(
  feed: readonly FeedEntry[],
  endSeq: number,
): Array<Extract<FeedEntry, { kind: 'game' }>> {
  const games = feed.filter(
    (e): e is Extract<FeedEntry, { kind: 'game' }> => e.kind === 'game' && e.seq <= endSeq,
  );
  let start = 0;
  for (let i = games.length - 1; i >= 0; i -= 1) {
    const events = games[i]?.events ?? [];
    if (events.some((e) => e.event_type === 'encounter_started')) {
      start = i;
      break;
    }
  }
  return games.slice(start);
}

/**
 * The events of the fight and a text context that knows every name its entries recorded, so a summary names
 * monsters by their group after the encounter has closed or the page has reloaded.
 */
export function fightEvents(
  feed: readonly FeedEntry[],
  endSeq: number,
  ctx: TextContext,
): { events: AnyEvent[]; ctx: TextContext } {
  const entries = fightEntries(feed, endSeq);
  let named = ctx;
  for (const entry of entries) named = extendContextWithEntryNames(named, entry.names);
  return { events: entries.flatMap((entry) => entry.events as AnyEvent[]), ctx: named };
}

/** Sums up a fight from its events. */
export function summarizeFight(events: readonly AnyEvent[], ctx: TextContext): FightSummary {
  const learned = extendContextWithEvents(ctx, events as never);
  let outcome: string | null = null;
  let rounds = 0;
  const defeated = new Map<string, { label: string; verb: string; count: number; xp: number }>();
  const awards: FightSummary['awards'] = [];
  const loot: string[] = [];
  const fallen: string[] = [];
  let lootCoins = 0;

  const lootItems: string[] = [];
  for (const event of events) {
    switch (event.event_type) {
      case 'battle_round':
        rounds = Math.max(rounds, num(event, 'round') ?? 0);
        break;
      case 'battle_ended':
        outcome =
          event.code === 'battle.ended.victory'
            ? 'victory'
            : event.code === 'battle.ended.defeat'
              ? 'defeat'
              : 'fled';
        break;
      case 'encounter_ended':
        if (outcome === null || outcome === 'fled') outcome = str(event, 'outcome') ?? outcome;
        break;
      case 'game_over':
        outcome = 'defeat';
        break;
      case 'monster_defeated': {
        const monsterId = str(event, 'monster_id') ?? '';
        const how = str(event, 'outcome') ?? 'slain';
        const template = str(event, 'template_id') ?? '';
        const label = learned.monsters[monsterId]?.label ?? prettifyId(template).toLowerCase();
        const key = `${template}:${how}`;
        const entry = defeated.get(key) ?? { label, verb: DEFEAT_VERB[how] ?? how, count: 0, xp: 0 };
        entry.count += 1;
        entry.xp += num(event, 'xp') ?? 0;
        defeated.set(key, entry);
        break;
      }
      case 'xp_awarded': {
        const memberId = str(event, 'character_id') ?? '';
        awards.push({
          memberId,
          name: memberName(memberId, learned),
          xp: num(event, 'modified_award') ?? num(event, 'award') ?? 0,
          levelAfter: num(event, 'level_after'),
        });
        break;
      }
      case 'loot_dropped': {
        lootCoins += num(event, 'coins_gp_value') ?? 0;
        const ids = Array.isArray(event.item_ids)
          ? event.item_ids.filter((i): i is string => typeof i === 'string')
          : [];
        lootItems.push(...ids);
        break;
      }
      case 'death': {
        const target = str(event, 'target_id') ?? '';
        if (idKind(target) === 'character' && !fallen.includes(target)) fallen.push(target);
        break;
      }
      case 'condition_gained': {
        const target = str(event, 'target_id') ?? '';
        if (
          str(event, 'condition') === 'petrified' &&
          idKind(target) === 'character' &&
          !fallen.includes(target)
        )
          fallen.push(target);
        break;
      }
      default:
        break;
    }
  }
  if (lootCoins > 0) loot.push(`coins worth ${lootCoins} gp`);
  loot.push(...itemList(lootItems, learned));

  const list = [...defeated.values()].map((d) => ({
    text: `${d.count} ${d.count === 1 ? d.label : pluralize(d.label)} ${d.verb}`,
    xp: d.xp,
  }));
  const xpTotal = list.reduce((sum, d) => sum + d.xp, 0);
  let title: string;
  let sentence: string;
  switch (outcome) {
    case 'victory': {
      // Titled for this fight, so it never reads like winning the adventure.
      const kinds = new Map<string, number>();
      for (const d of defeated.values()) kinds.set(d.label, (kinds.get(d.label) ?? 0) + d.count);
      const names = [...kinds.entries()].map(([label, n]) => (n === 1 ? label : pluralize(label)));
      const one = kinds.size === 1 && [...kinds.values()][0] === 1;
      title =
        names.length > 0 ? `The ${joinList(names)} ${one ? 'is' : 'are'} beaten` : 'The monsters are beaten';
      sentence = 'The party won the fight.';
      break;
    }
    case 'defeat':
      title = 'Defeat';
      sentence = 'Nobody in the party is left standing.';
      break;
    case 'fled':
      title = 'The party got away';
      sentence = 'The party retreated, and nothing could follow.';
      break;
    case null:
      title = 'The encounter is over';
      sentence = 'The party can explore again.';
      break;
    default:
      title = encounterOutcomeLabel(outcome);
      sentence = encounterOutcomeSentence(outcome);
  }
  return {
    outcome,
    title,
    sentence,
    rounds,
    defeated: list,
    xpTotal,
    awards,
    loot,
    fallen: fallen.map((id) => memberName(id, learned)),
  };
}

/** One sentence about the experience the defeated monsters are worth. */
export function xpSentence(summary: FightSummary): string | null {
  if (summary.awards.length > 0) {
    const parts = summary.awards.map((a) => `${a.name} ${a.xp} XP`);
    return `Experience awarded: ${joinList(parts)}.`;
  }
  if (summary.xpTotal > 0) return `The defeated monsters are worth ${summary.xpTotal} XP to the party.`;
  return null;
}
