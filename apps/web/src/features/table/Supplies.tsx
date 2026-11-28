/**
 * The party's light and food left, as two badges: in the top bar on a wide screen, and at the top of the party panel
 * on a phone. Every number comes from bxapi's `PlayerView.supplies`. The client only converts rounds to hours,
 * turns, or rounds, by the clock's own arithmetic.
 */
import type { MemberView, SuppliesView } from '@bxvtt/shared/bxapi';
import { ROUNDS_PER_TURN, count, joinList } from '@bxvtt/shared/text';
import { usePlayerView } from '@/app';
import { Badge, SectionLabel, Tooltip, type BadgeTone } from '@/ui';
import styles from './table.module.css';

/** Rounds in an hour: six turns of 10 minutes. */
const ROUNDS_PER_HOUR = 6 * ROUNDS_PER_TURN;

/** What one supply badge shows. */
export interface SupplyBadge {
  /** The badge text, such as `6 hours` or `No food`. */
  text: string;
  tone: BadgeTone;
  /** The tooltip, which is also the badge's description. */
  tooltip: string;
}

/**
 * A time of light in the unit the clock uses for it: whole hours from one hour, whole turns from one turn, and
 * rounds below that. Zero is `none`.
 *
 * @param rounds - The rounds of light.
 */
export function lightTime(rounds: number): string {
  if (rounds >= ROUNDS_PER_HOUR) return count(Math.floor(rounds / ROUNDS_PER_HOUR), 'hour');
  if (rounds >= ROUNDS_PER_TURN) return count(Math.floor(rounds / ROUNDS_PER_TURN), 'turn');
  if (rounds > 0) return count(rounds, 'round');
  return 'none';
}

/**
 * The light badge: the light burning now plus the spare torches and oil the party can light now.
 *
 * @param supplies - The player view's `supplies`.
 */
export function lightBadge(supplies: SuppliesView): SupplyBadge {
  if (supplies.light_permanent) {
    return { text: 'Permanent', tone: 'neutral', tooltip: "A light that doesn't burn out is lit" };
  }
  const burning = supplies.light_burning_rounds;
  const reserve = supplies.light_reserve_rounds;
  const total = burning + (supplies.light_reserve_usable ? reserve : 0);
  const text = total > 0 ? lightTime(total) : 'No light';
  const stranded = !supplies.light_reserve_usable && reserve > 0;
  const tone: BadgeTone =
    total === 0 ? 'danger' : stranded || total < ROUNDS_PER_HOUR ? 'warning' : 'neutral';
  const tooltip = stranded
    ? `Burning now: ${lightTime(burning)}. No one can light the spare torches and oil now`
    : `Burning now: ${lightTime(burning)}. Spare torches and oil: ${lightTime(reserve)}`;
  return { text, tone, tooltip };
}

/**
 * The food badge: the days the party eats before its first member goes short, as the packs are now.
 *
 * @param supplies - The player view's `supplies`.
 * @param party - The party, to name the members who run out first.
 */
export function foodBadge(
  supplies: SuppliesView,
  party: readonly Pick<MemberView, 'id' | 'name' | 'conditions'>[],
): SupplyBadge {
  if (supplies.rations === 0) {
    return { text: 'No food', tone: 'danger', tooltip: 'No one in the party carries rations' };
  }
  const days = supplies.food_days;
  const short = supplies.food_short_first_ids;
  const names = joinList(
    short.map((id) => party.find((member) => member.id === id)?.name ?? 'A party member'),
  );
  const one = short.length === 1;
  const living = party.filter((member) => !member.conditions.includes('dead')).length;
  const shared =
    supplies.food_days_shared > days
      ? `. Shared out, the rations last ${count(supplies.food_days_shared, 'day')}`
      : '';
  if (days === 0) {
    return {
      text: '0 days',
      tone: 'danger',
      tooltip: `${names} ${one ? 'carries' : 'carry'} no rations${shared}`,
    };
  }
  const first =
    short.length === living ? 'Everyone runs out together' : `${names} ${one ? 'runs' : 'run'} out first`;
  return {
    text: count(days, 'day'),
    tone: days === 1 ? 'warning' : 'neutral',
    tooltip: `Food for ${count(days, 'day')}. ${first}${shared}`,
  };
}

/** One badge with its tooltip, focusable so a keyboard user reaches the tooltip, as the clock is. */
function SupplyItem({ label, icon, badge }: { label: string; icon: 'torch' | 'food'; badge: SupplyBadge }) {
  return (
    <Tooltip content={badge.tooltip}>
      <span className={styles.supply} tabIndex={0}>
        <Badge tone={badge.tone} icon={icon}>
          <span className={styles.srOnly}>{label}: </span>
          {badge.text}
        </Badge>
      </span>
    </Tooltip>
  );
}

/** The modes with a player view in which the badges show: every one but the end of the game. */
const HIDDEN_MODES: readonly string[] = ['game_over', 'victory'];

/** The two supply badges from the player view, or nothing when the view states no supplies. */
function SupplyBadges() {
  const view = usePlayerView();
  const supplies = view?.supplies;
  if (view === null || supplies === null || supplies === undefined || HIDDEN_MODES.includes(view.mode))
    return null;
  return (
    <>
      <SupplyItem label="Light left" icon="torch" badge={lightBadge(supplies)} />
      <SupplyItem label="Food left" icon="food" badge={foodBadge(supplies, view.party)} />
    </>
  );
}

/** Whether the player view states supplies that the badges show now. */
function useShowsSupplies(): boolean {
  const view = usePlayerView();
  return (
    view !== null &&
    view.supplies !== null &&
    view.supplies !== undefined &&
    !HIDDEN_MODES.includes(view.mode)
  );
}

/** The supply badges in the top bar, after the clock. A phone shows them in the party panel instead. */
export function TopBarSupplies() {
  if (!useShowsSupplies()) return null;
  return (
    <span className={styles.topBarSupplies}>
      <SupplyBadges />
    </span>
  );
}

/** The supply badges as the first row of the party panel, on a phone only, where the top bar has no room. */
export function PartySupplies() {
  if (!useShowsSupplies()) return null;
  return (
    <div className={styles.partySupplies}>
      <SectionLabel level="none">Supplies</SectionLabel>
      <SupplyBadges />
    </div>
  );
}
