/**
 * The "spells to prepare" advice. A new caster has spells in the book (or a divine caster's slots) and nothing
 * memorized, and bxapi refuses a preparation until the party has slept. This module finds those members, says
 * whether the party has slept since each last prepared, and offers the short path: rest for a night, then open
 * the caster's Spells tab.
 *
 * Who can cast comes from the class catalog (the class's magic ability and its slots at the member's level), and
 * whether a member has slept comes from the feed's rest and preparation events. Nothing here decides whether a
 * preparation is legal. bxapi refuses one that isn't, and the sheet shows the reason.
 */
import type { MemberView } from '@bxvtt/shared/bxapi';
import type { FeedEntry } from '@bxvtt/shared/protocol';
import { joinList } from '@bxvtt/shared/text';
import { useEffect, useMemo, useState } from 'react';
import { getApi, loadCatalog, useFeed, useParty, useTableUi, type ClassDetail } from '@/app';
import { Banner, Button } from '@/ui';
import { classMagic, spellSlotsAt } from '../wizard/tables';
import { usePartyAccess, useTownServices } from './hooks';
import { memberStatus } from './members';
import { useRest } from './RestAndPrepare';

/** Members with spells to prepare, split by whether the party has slept since each last prepared. */
export interface SpellAdvice {
  /** Casters with nothing memorized who must wait for a night's sleep. */
  needRest: MemberView[];
  /** Casters with nothing memorized who may prepare now. */
  canPrepare: MemberView[];
}

const NONE: SpellAdvice = { needRest: [], canPrepare: [] };

function bookSize(member: MemberView): number {
  const book = (member as unknown as { spell_book?: unknown }).spell_book;
  return Array.isArray(book) ? book.length : 0;
}

/**
 * Whether the party has slept since a member last prepared spells, from the feed's events: a rest of a night or a
 * day that ran to its end, and a preparation by that member.
 *
 * @param feed - The feed entries, oldest first.
 * @param memberId - The caster.
 */
export function hasSleptSincePreparing(feed: readonly FeedEntry[], memberId: string): boolean {
  let sleptAt = -1;
  let preparedAt = -1;
  for (const entry of feed) {
    if (entry.kind !== 'game') continue;
    for (const event of entry.events) {
      if (
        event.event_type === 'rested' &&
        event.code !== 'exploration.rest.interrupted' &&
        (event.kind === 'night' || event.kind === 'day')
      ) {
        sleptAt = entry.seq;
      } else if (event.event_type === 'spells_memorized' && event.caster_id === memberId) {
        preparedAt = entry.seq;
      }
    }
  }
  return sleptAt > preparedAt;
}

/**
 * Finds the members who can cast, have spells to prepare, and have none memorized.
 *
 * @param party - The party in marching order.
 * @param classes - Class entries by ID.
 * @param feed - The feed entries, oldest first.
 */
export function spellAdvice(
  party: readonly MemberView[],
  classes: Readonly<Record<string, ClassDetail>>,
  feed: readonly FeedEntry[],
): SpellAdvice {
  const needRest: MemberView[] = [];
  const canPrepare: MemberView[] = [];
  for (const member of party) {
    const detail = classes[member.class_id];
    const magic = classMagic(detail);
    if (magic === null || memberStatus(member).dead) continue;
    if (!spellSlotsAt(detail, member.level).some((slots) => slots > 0)) continue;
    if (member.memorized_spells.length > 0) continue;
    // An arcane caster prepares from the spell book, so an empty book has nothing to prepare yet.
    if (magic.kind === 'arcane' && bookSize(member) === 0) continue;
    (hasSleptSincePreparing(feed, member.id) ? canPrepare : needRest).push(member);
  }
  return { needRest, canPrepare };
}

/** Whether the advice has anything to say. */
export function hasSpellAdvice(advice: SpellAdvice): boolean {
  return advice.needRest.length + advice.canPrepare.length > 0;
}

/** The advice as sentences, such as "Tamsin has no spells memorized. Rest for a night, then prepare spells." */
export function spellAdviceText(advice: SpellAdvice): string {
  const sentences: string[] = [];
  if (advice.needRest.length > 0) {
    const names = joinList(advice.needRest.map((member) => member.name));
    sentences.push(
      `${names} ${advice.needRest.length === 1 ? 'has' : 'have'} no spells memorized. Rest for a night, then prepare spells.`,
    );
  }
  if (advice.canPrepare.length > 0) {
    sentences.push(`${joinList(advice.canPrepare.map((member) => member.name))} can prepare spells now.`);
  }
  return sentences.join(' ');
}

/** What a screen reader hears after "Spells to prepare", such as "Tamsin has none memorized". */
export function spellAdviceStatus(advice: SpellAdvice): string {
  const parts: string[] = [];
  if (advice.needRest.length > 0) {
    parts.push(
      `${joinList(advice.needRest.map((member) => member.name))} ${advice.needRest.length === 1 ? 'has' : 'have'} none memorized`,
    );
  }
  if (advice.canPrepare.length > 0) {
    parts.push(`${joinList(advice.canPrepare.map((member) => member.name))} can prepare spells now`);
  }
  return parts.join(', while ');
}

/** The advice for the readiness card, or `undefined` when there is none. */
export function spellsForChecklist(advice: SpellAdvice): { detail: string; status: string } | undefined {
  return hasSpellAdvice(advice)
    ? { detail: spellAdviceText(advice), status: spellAdviceStatus(advice) }
    : undefined;
}

const CLASSES_KEY = 'full:classes';

/** Every class entry by ID, from the bulk catalog. Empty until it loads. */
function useClassEntries(): Record<string, ClassDetail> {
  const [classes, setClasses] = useState<Record<string, ClassDetail>>({});
  useEffect(() => {
    let cancelled = false;
    loadCatalog(CLASSES_KEY, () => getApi().fullCatalog('classes')).then(
      (catalog) => {
        if (!cancelled) setClasses(Object.fromEntries(catalog.items.map((entry) => [entry.id, entry])));
      },
      () => {
        // Without the catalog the town can't tell who casts, so it gives no advice.
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);
  return classes;
}

/** The spells-to-prepare advice for the open table. */
export function useSpellAdvice(): SpellAdvice {
  const party = useParty();
  const feed = useFeed();
  const classes = useClassEntries();
  return useMemo(
    () => (Object.keys(classes).length === 0 ? NONE : spellAdvice(party, classes, feed)),
    [party, feed, classes],
  );
}

/** The short path: a button that rests the party for a night, and a button that opens each caster's spells. */
export function SpellActions({ advice }: { advice: SpellAdvice }) {
  const { rest, pending } = useRest();
  const access = usePartyAccess('rest');
  const services = useTownServices();
  const openSheet = useTableUi((s) => s.openCharacterSheet);
  return (
    <>
      {advice.needRest.length > 0 && (
        <Button
          size="sm"
          variant="secondary"
          icon="moon"
          loading={pending}
          disabled={!access.allowed || !services.rest}
          title={access.allowed ? undefined : access.explanation}
          onClick={() => void rest('night')}
        >
          Rest for a night
        </Button>
      )}
      {advice.canPrepare.map((member) => (
        <Button
          key={member.id}
          size="sm"
          variant="secondary"
          icon="spell"
          onClick={() => openSheet(member.id, 'spells')}
        >
          {`Open ${member.name}'s spells`}
        </Button>
      ))}
    </>
  );
}

/** A warning at the top of the town square while a caster has spells to prepare. */
export function SpellBanner() {
  const advice = useSpellAdvice();
  if (!hasSpellAdvice(advice)) return null;
  return (
    <Banner tone="warning" title="Unprepared spells" actions={<SpellActions advice={advice} />}>
      {spellAdviceText(advice)}
    </Banner>
  );
}
