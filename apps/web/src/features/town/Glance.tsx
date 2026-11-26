/**
 * The town square's small panels: what the town offers, the party at a glance, the ready checklist, the party's
 * business (quests and journal), and what the table just did.
 */
import { count, describeEvents, formatGameClock } from '@bxvtt/shared/text';
import type { FeedEntry } from '@bxvtt/shared/protocol';
import { useMemo, useState } from 'react';
import { useFeed, useMember, useParty, usePlayerView, useTextContext } from '@/app';
import { Badge, Button, EmptyState, Icon, Panel, type IconName } from '@/ui';
import { gaps, readinessChecklist, type Suggestion } from './checklist';
import { MemberToken, PurseOf, SeatOwner } from './parts';
import { memberStatus } from './members';
import { useTownServices } from './hooks';
import { SpellActions, spellsForChecklist, useSpellAdvice } from './SpellAdvice';
import { parseService, sectionOf } from './services';
import { useTownUi, type TownSection } from './townUi';
import styles from './Glance.module.css';

interface ServiceLine {
  name: string;
  offer: string;
  section: TownSection | null;
  icon: IconName;
}

const SECTION_ICON: Record<TownSection, IconName> = {
  square: 'town',
  outfitter: 'chest',
  temple: 'heart',
  treasure: 'gem',
  rest: 'rest',
};

const SECTION_VERB: Record<TownSection, string> = {
  square: 'Visit',
  outfitter: 'Shop',
  temple: 'Visit temple',
  treasure: 'Sell treasure',
  rest: 'Rest and prepare',
};

/** What each "Shop" button on the checklist does, since the label is the same on every line. */
const SHOP_HELP: Record<Exclude<Suggestion['key'], 'spells'>, string> = {
  light: 'Find a light source at the outfitter',
  tinder: 'Find a tinder box at the outfitter',
  rations: 'Find rations at the outfitter',
  rope: 'Find rope at the outfitter',
};

/** The services the town lists, each linked to the part of the town that does the job. */
export function ServicesPanel() {
  const view = usePlayerView();
  const services = useTownServices();
  const setSection = useTownUi((s) => s.setSection);
  const lines: ServiceLine[] = (view?.town_services ?? []).map((line) => {
    const found = sectionOf(line);
    const section = found !== null && services[found] ? found : null;
    return { ...parseService(line), section, icon: section ? SECTION_ICON[section] : 'town' };
  });
  return (
    <Panel title="Town services" meta={lines.length > 0 ? count(lines.length, 'place') : undefined}>
      {lines.length === 0 ? (
        <EmptyState
          size="compact"
          icon="town"
          title="No services available"
          description="No shops, temples, or inns are open in this town."
        />
      ) : (
        <ul className={styles.services}>
          {lines.map((line) => (
            <li key={line.name} className={styles.service}>
              <span className={styles.serviceIcon}>
                <Icon name={line.icon} size={20} />
              </span>
              <div className={styles.serviceText}>
                <h3 className={styles.serviceName}>{line.name}</h3>
                {line.offer !== '' && <p className={styles.serviceOffer}>{line.offer}</p>}
              </div>
              {line.section !== null && (
                <Button size="sm" variant="secondary" onClick={() => setSection(line.section ?? 'square')}>
                  {SECTION_VERB[line.section]}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/** What the dock's party list doesn't show: each member's coins, and who plays them. */
export function PartyGlance() {
  const party = useParty();
  const buyerId = useTownUi((s) => s.buyerId);
  return (
    <Panel title="Party purses" meta={count(party.length, 'adventurer')}>
      <ul className={styles.party}>
        {party.map((member) => {
          const status = memberStatus(member);
          return (
            <li key={member.id} className={styles.member}>
              <MemberToken member={member} size={32} />
              <div className={styles.memberBody}>
                <div className={styles.memberHead}>
                  <h3 className={styles.memberName}>{member.name}</h3>
                  {buyerId === member.id && <Badge tone="neutral">Shopping</Badge>}
                  {status.dead && <Badge tone="danger">Dead</Badge>}
                </div>
                <div className={styles.memberFoot}>
                  <PurseOf member={member} />
                  <SeatOwner memberId={member.id} />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

/**
 * The "ready for the dungeon?" advice, with a button that sends you shopping for what is missing. Pass
 * `spellBanner` where the spells banner shows the same advice above, and the spells line keeps only its title and
 * status, so the advice and its buttons appear once.
 */
export function ChecklistPanel({
  onShop,
  spellBanner = false,
}: {
  onShop?: (search: string) => void;
  spellBanner?: boolean;
}) {
  const party = useParty();
  const services = useTownServices();
  const setSection = useTownUi((s) => s.setSection);
  const setSearch = useTownUi((s) => s.setOutfitterSearch);
  const advice = useSpellAdvice();
  const checklist = useMemo(() => readinessChecklist(party, spellsForChecklist(advice)), [party, advice]);
  const missing = gaps(checklist).length;
  const shop = (search: string) => {
    if (onShop) onShop(search);
    else {
      setSearch(search);
      setSection('outfitter');
    }
  };
  return (
    <Panel title="Ready for the dungeon?" meta={missing === 0 ? 'Ready' : `${missing} suggested`}>
      <ul className={styles.checklist}>
        {checklist.map((line) => (
          <li key={line.key} className={styles.check} data-covered={line.covered}>
            <span className={styles.checkMark} aria-hidden="true">
              <Icon name={line.covered ? 'check' : 'minus'} size={14} />
            </span>
            <div className={styles.checkText}>
              <span className={styles.checkTitle}>
                {line.title}
                <span className="visually-hidden">
                  {line.status ? `: ${line.status}` : line.covered ? ': carried' : ': missing'}
                </span>
              </span>
              {!(spellBanner && line.key === 'spells') && (
                <span className={styles.checkDetail}>{line.detail}</span>
              )}
            </div>
            {line.key === 'spells' && !spellBanner && (
              <div className={styles.checkActions}>
                <SpellActions advice={advice} />
              </div>
            )}
            {!line.covered && line.key !== 'spells' && services.outfitter && (
              <Button
                size="sm"
                variant="ghost"
                tooltip={SHOP_HELP[line.key]}
                onClick={() => shop(line.search)}
              >
                Shop
              </Button>
            )}
          </li>
        ))}
      </ul>
      <p className={styles.advice}>These items are optional. You can set out without them.</p>
    </Panel>
  );
}

/** Quests in brief and the latest journal lines. */
export function BusinessPanel() {
  const view = usePlayerView();
  const quests = view?.quests ?? [];
  const journal = view?.journal ?? [];
  const recent = journal.slice(-3).reverse();
  return (
    <Panel title="Quests and journal">
      {quests.length === 0 && recent.length === 0 ? (
        <EmptyState
          size="compact"
          icon="journal"
          title="No quests or journal entries"
          description="Active quests and recent journal entries appear here as you play."
        />
      ) : (
        <div className={styles.business}>
          {quests.length > 0 && (
            <ul className={styles.quests} aria-label="Quests">
              {quests.map((quest) => {
                const current = quest.objectives.find((objective) => objective.state !== 'complete');
                return (
                  <li key={quest.id} className={styles.quest}>
                    <Icon name="flag" size={14} />
                    <div>
                      <span className={styles.questName}>{quest.name}</span>
                      <span className={styles.questGoal}>
                        {current ? `Now: ${current.name}` : 'Completed'}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {recent.length > 0 && (
            <ul className={styles.journal} aria-label="Recent journal entries">
              {recent.map((entry, index) => (
                <li key={`${entry.rounds}-${index}`} className={styles.journalLine}>
                  <span className={styles.journalTime}>{formatGameClock(entry.rounds)}</span>
                  <span>{entry.text}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Panel>
  );
}

const TOWN_COMMANDS = new Set([
  'purchase_equipment',
  'sell_treasure',
  'purchase_healing',
  'rest',
  'equip_item',
]);

/** The event types that headline each town command, in the order they read. Other lines wait behind "more". */
const HEADLINE: Record<string, readonly string[]> = {
  purchase_equipment: ['item_acquired'],
  sell_treasure: ['treasure_sold'],
  purchase_healing: ['healing_purchased'],
  rest: ['rested', 'healing_applied'],
  equip_item: [],
};

interface ActivityItem {
  entry: Extract<FeedEntry, { kind: 'game' }>;
  headline: string;
  rest: string[];
}

/** Splits an entry's lines into the ones that summarize the action and the ones that wait behind "more". */
export function summarizeEntry(
  commandType: string,
  lines: ReadonlyArray<{ text: string; eventType: string; amount?: number }>,
) {
  const types = HEADLINE[commandType] ?? [];
  // A healing line with nothing healed ("Wren regains no hit points") is not news.
  const head = types.flatMap((type) =>
    lines.filter((line) => line.eventType === type && (type !== 'healing_applied' || (line.amount ?? 0) > 0)),
  );
  const chosen = head.length > 0 ? head : lines.slice(0, 1);
  const rest = lines.filter((line) => !chosen.includes(line)).map((line) => line.text);
  return { headline: chosen.map((line) => line.text).join(' '), rest };
}

/** One feed row: who sent the command, and what happened. "More" opens the lines that didn't make the headline. */
function ActivityRow({ item }: { item: ActivityItem }) {
  const sender = useMember(item.entry.user_id);
  const [open, setOpen] = useState(false);
  return (
    <li className={styles.activityRow}>
      <span className={styles.activityWho}>{sender?.name ?? 'Party'}</span>
      <div>
        <span>{item.headline}</span>
        {item.rest.length > 0 && (
          <>
            {' '}
            <button
              type="button"
              className={styles.activityMore}
              aria-expanded={open}
              onClick={() => setOpen((value) => !value)}
            >
              {open ? 'Show less' : `+${item.rest.length} more`}
            </button>
          </>
        )}
        {open && (
          <ul className={styles.activityDetails}>
            {item.rest.map((line, index) => (
              <li key={`${index}-${line}`}>{line}</li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

/** What the table just bought, sold, healed, and rested, so every screen shows the same story. */
export function ActivityPanel() {
  const feed = useFeed();
  const ctx = useTextContext();
  const rows = useMemo(() => {
    const out: ActivityItem[] = [];
    for (const entry of [...feed].reverse()) {
      if (entry.kind !== 'game' || entry.command_type === null || !TOWN_COMMANDS.has(entry.command_type))
        continue;
      const lines = describeEvents(entry.events, ctx, { messages: entry.messages, only: 'player' });
      if (lines.length === 0) continue;
      out.push({ entry, ...summarizeEntry(entry.command_type, lines) });
      if (out.length === 5) break;
    }
    return out;
  }, [feed, ctx]);
  return (
    <Panel title="Recently in town">
      {rows.length === 0 ? (
        <EmptyState
          size="compact"
          icon="coins"
          title="No recent activity"
          description="Purchases, sales, healing, and rests appear here."
        />
      ) : (
        <ul className={styles.activity}>
          {rows.map((item) => (
            <ActivityRow key={item.entry.seq} item={item} />
          ))}
        </ul>
      )}
    </Panel>
  );
}
