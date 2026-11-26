/**
 * The "spells to prepare" advice. A new caster has spells in the book (or a divine caster's slots) and nothing
 * memorized, and bxapi refuses a preparation until the party has slept. This module finds those members, says
 * whether each has to sleep first or can prepare now, and offers the short path: rest for a night, then open
 * the caster's Spells tab.
 *
 * Everything comes from the view: who has spells to prepare (`preparable_spells`), who has to sleep first
 * (`needs_sleep_to_prepare`), and who can prepare now (`can_prepare_now`). Nothing here decides whether a
 * preparation is legal. bxapi refuses one that isn't, and the sheet shows the reason.
 */
import type { MemberView } from '@bxvtt/shared/bxapi';
import { joinList } from '@bxvtt/shared/text';
import { useMemo } from 'react';
import { useParty, useTableUi } from '@/app';
import { Banner, Button } from '@/ui';
import { usePartyAccess, useTownServices } from './hooks';
import { memberStatus } from './members';
import { useRest } from './RestAndPrepare';

/** Members with spells to prepare, split by whether each has to sleep first or can prepare now. */
export interface SpellAdvice {
  /** Casters with nothing memorized who must wait for a night's sleep. */
  needRest: MemberView[];
  /** Casters with nothing memorized who may prepare now. */
  canPrepare: MemberView[];
}

/**
 * Finds the living members who have nothing memorized and spells that bxapi would let them prepare. A 1st-level
 * cleric and a magic-user with an empty book have none to prepare, so they're left out. A member who has to sleep
 * first needs a rest, and one whom bxapi would let prepare now can. A member who can do neither, such as one who
 * can't act, is left out.
 *
 * @param party - The party in marching order.
 */
export function spellAdvice(party: readonly MemberView[]): SpellAdvice {
  const needRest: MemberView[] = [];
  const canPrepare: MemberView[] = [];
  for (const member of party) {
    if (memberStatus(member).dead) continue;
    if (member.memorized_spells.length > 0 || member.preparable_spells.length === 0) continue;
    if (member.needs_sleep_to_prepare) needRest.push(member);
    else if (member.can_prepare_now) canPrepare.push(member);
  }
  return { needRest, canPrepare };
}

/** Whether the advice has anything to say. */
export function hasSpellAdvice(advice: SpellAdvice): boolean {
  return advice.needRest.length + advice.canPrepare.length > 0;
}

/** The advice as sentences, such as "Tamsin needs a night's rest before preparing spells." */
export function spellAdviceText(advice: SpellAdvice): string {
  const sentences: string[] = [];
  if (advice.needRest.length > 0) {
    const names = joinList(advice.needRest.map((member) => member.name));
    sentences.push(
      `${names} ${advice.needRest.length === 1 ? 'needs' : 'need'} a night's rest before preparing spells.`,
    );
  }
  if (advice.canPrepare.length > 0) {
    sentences.push(`${joinList(advice.canPrepare.map((member) => member.name))} can prepare spells now.`);
  }
  return sentences.join(' ');
}

/** What a screen reader hears after "Spells to prepare", such as "Tamsin needs a night's rest". */
export function spellAdviceStatus(advice: SpellAdvice): string {
  const parts: string[] = [];
  if (advice.needRest.length > 0) {
    parts.push(
      `${joinList(advice.needRest.map((member) => member.name))} ${advice.needRest.length === 1 ? 'needs' : 'need'} a night's rest`,
    );
  }
  if (advice.canPrepare.length > 0) {
    parts.push(`${joinList(advice.canPrepare.map((member) => member.name))} can prepare now`);
  }
  return parts.join(', and ');
}

/** The advice for the readiness card, or `undefined` when there is none. */
export function spellsForChecklist(advice: SpellAdvice): { detail: string; status: string } | undefined {
  return hasSpellAdvice(advice)
    ? { detail: spellAdviceText(advice), status: spellAdviceStatus(advice) }
    : undefined;
}

/** The spells-to-prepare advice for the open table. */
export function useSpellAdvice(): SpellAdvice {
  const party = useParty();
  return useMemo(() => spellAdvice(party), [party]);
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
          disabledReason={access.explanation}
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
    <Banner tone="warning" title="Spells to prepare" actions={<SpellActions advice={advice} />}>
      {spellAdviceText(advice)}
    </Banner>
  );
}
