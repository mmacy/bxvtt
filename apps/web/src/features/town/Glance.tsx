/**
 * The town square's small panels: what the town offers, the party at a glance, the ready checklist, the party's
 * business (quests and journal), and what the table just did.
 */
import { count, describeEvents, formatGameClock } from '@bxvtt/shared/text';
import type { FeedEntry } from '@bxvtt/shared/protocol';
import { useMemo } from 'react';
import { useFeed, useMember, useParty, usePlayerView, useTextContext } from '@/app';
import { Badge, Button, EmptyState, Icon, Panel, type IconName } from '@/ui';
import { gaps, readinessChecklist } from './checklist';
import { MemberToken, PurseOf, SeatOwner } from './parts';
import { memberStatus } from './members';
import { useTownServices } from './hooks';
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
  outfitter: 'Go shopping',
  temple: 'Visit the temple',
  treasure: 'Sell treasure',
  rest: 'Rest and prepare',
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
    <Panel title="What the town offers" meta={lines.length > 0 ? count(lines.length, 'place') : undefined}>
      {lines.length === 0 ? (
        <EmptyState
          size="compact"
          icon="town"
          title="Nothing is listed"
          description="This town lists no services."
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
    <Panel title="Purses and players" meta={count(party.length, 'adventurer')}>
      <ul className={styles.party}>
        {party.map((member) => {
          const status = memberStatus(member);
          return (
            <li key={member.id} className={styles.member}>
              <MemberToken member={member} size={32} />
              <div className={styles.memberBody}>
                <div className={styles.memberHead}>
                  <h3 className={styles.memberName}>{member.name}</h3>
                  {buyerId === member.id && <Badge tone="neutral">You are shopping</Badge>}
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

/** The "ready for the dungeon?" advice, with a button that sends you shopping for what is missing. */
export function ChecklistPanel({ onShop }: { onShop?: (search: string) => void }) {
  const party = useParty();
  const services = useTownServices();
  const setSection = useTownUi((s) => s.setSection);
  const setSearch = useTownUi((s) => s.setOutfitterSearch);
  const checklist = useMemo(() => readinessChecklist(party), [party]);
  const missing = gaps(checklist).length;
  const shop = (search: string) => {
    if (onShop) onShop(search);
    else {
      setSearch(search);
      setSection('outfitter');
    }
  };
  return (
    <Panel title="Ready for the dungeon?" meta={missing === 0 ? 'Looks ready' : `${missing} to think about`}>
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
                  {line.covered ? ': the party has it' : ': nobody has it yet'}
                </span>
              </span>
              <span className={styles.checkDetail}>{line.detail}</span>
            </div>
            {!line.covered && services.outfitter && (
              <Button size="sm" variant="ghost" onClick={() => shop(line.search)}>
                Find it
              </Button>
            )}
          </li>
        ))}
      </ul>
      <p className={styles.advice}>This is a suggestion. Nothing here stops the party from leaving.</p>
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
    <Panel title="The party's business">
      {quests.length === 0 && recent.length === 0 ? (
        <EmptyState
          size="compact"
          icon="journal"
          title="Nothing written yet"
          description="Quests and journal lines appear here as the party learns of them."
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
                        {current ? `Now: ${current.name}` : 'Every objective is done.'}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {recent.length > 0 && (
            <ul className={styles.journal} aria-label="Latest journal lines">
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

/** One feed row: who sent the command, and what happened. */
function ActivityRow({
  entry,
  text,
  more,
}: {
  entry: Extract<FeedEntry, { kind: 'game' }>;
  text: string;
  more: number;
}) {
  const sender = useMember(entry.user_id);
  return (
    <li className={styles.activityRow}>
      <span className={styles.activityWho}>{sender?.name ?? 'The table'}</span>
      <span>
        {text}
        {more > 0 && <span className={styles.activityMore}>{` +${more} more`}</span>}
      </span>
    </li>
  );
}

/** What the table just bought, sold, healed, and rested, so every screen shows the same story. */
export function ActivityPanel() {
  const feed = useFeed();
  const ctx = useTextContext();
  const rows = useMemo(() => {
    const out: Array<{ entry: Extract<FeedEntry, { kind: 'game' }>; text: string; more: number }> = [];
    for (const entry of [...feed].reverse()) {
      if (entry.kind !== 'game' || entry.command_type === null || !TOWN_COMMANDS.has(entry.command_type))
        continue;
      const lines = describeEvents(entry.events, ctx, { messages: entry.messages, only: 'player' });
      const first = lines[0];
      if (first === undefined) continue;
      out.push({
        entry,
        text: first.text,
        more: lines.length - 1,
      });
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
          title="A quiet street"
          description="Purchases, sales, and rests show here for the whole table."
        />
      ) : (
        <ul className={styles.activity}>
          {rows.map(({ entry, text, more }) => (
            <ActivityRow key={entry.seq} entry={entry} text={text} more={more} />
          ))}
        </ul>
      )}
    </Panel>
  );
}
