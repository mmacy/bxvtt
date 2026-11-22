/** Rest, spell preparation through the character sheet, and a generic form for any other town command. */
import type { MemberView, PlayerView } from '@bxvtt/shared/bxapi';
import {
  describeEvents,
  formatDuration,
  formatGameClock,
  restKindDescription,
  restKindLabel,
} from '@bxvtt/shared/text';
import { useCallback, useMemo } from 'react';
import {
  useCommandSchema,
  useLegalCommands,
  useParty,
  usePlayerView,
  useSendCommand,
  useTableUi,
  useTextContext,
} from '@/app';
import { Accordion, Banner, Button, EmptyState, Icon, Panel, type IconName } from '@/ui';
import { commandInfo } from '@bxvtt/shared/text';
import { CommandForm } from './CommandForm';
import { usePartyAccess } from './hooks';
import { MemberToken, PlaceHeader, classLine } from './parts';
import { placeName } from './services';
import { readFields } from './schemaForm';
import { useTownUi } from './townUi';
import styles from './RestAndPrepare.module.css';

const REST_ICONS: Record<string, IconName> = { turn: 'hourglass', night: 'moon', day: 'sun' };
const REST_LENGTH: Record<string, string> = {
  turn: formatDuration(1, 'turn'),
  night: formatDuration(48, 'turn'),
  day: formatDuration(144, 'turn'),
};

/** The game time that passed and the hit points each member recovered, from the views before and after. */
export function describeChanges(before: PlayerView | null, after: PlayerView): string[] {
  const changes: string[] = [];
  if (before !== null && after.clock_rounds > before.clock_rounds) {
    changes.push(
      `Game time moved from ${formatGameClock(before.clock_rounds)} to ${formatGameClock(after.clock_rounds)}.`,
    );
  }
  for (const member of after.party) {
    const was = before?.party.find((candidate) => candidate.id === member.id);
    if (was !== undefined && member.current_hp > was.current_hp) {
      changes.push(
        `${member.name} recovered ${member.current_hp - was.current_hp} hit points and has ${member.current_hp} of ${member.max_hp}.`,
      );
    }
  }
  return changes;
}

/**
 * Sends `rest` and records what happened for the rest page.
 *
 * @returns `rest(kind)`, and whether a command is in flight.
 */
export function useRest(): { rest: (kind: string) => Promise<void>; pending: boolean } {
  const { send, pending } = useSendCommand();
  const ctx = useTextContext();
  const before = usePlayerView();
  const setReport = useTownUi((s) => s.setRestReport);
  const rest = useCallback(
    async (kind: string) => {
      const result = await send({ command_type: 'rest', kind }, { display: 'inline' });
      if (result.status === 'accepted') {
        const lines = describeEvents(result.result.events, ctx, {
          messages: result.result.messages,
          only: 'player',
        }).map((line) => line.text);
        setReport({ kind, changes: describeChanges(before, result.result.game.view), lines, error: null });
      } else if (result.status === 'refused' || result.status === 'error' || result.status === 'skipped') {
        setReport({ kind, changes: [], lines: [], error: result.message });
      }
    },
    [send, ctx, setReport, before],
  );
  return { rest, pending };
}

function spellCounts(member: MemberView): { book: number; prepared: number } {
  const book = (member as unknown as { spell_book?: unknown }).spell_book;
  return {
    book: Array.isArray(book) ? book.length : 0,
    prepared: Array.isArray(member.memorized_spells) ? member.memorized_spells.length : 0,
  };
}

/** Commands this page has a control for elsewhere in town. */
const HANDLED = new Set([
  'rest',
  'enter_dungeon',
  'purchase_equipment',
  'sell_treasure',
  'purchase_healing',
  // Preparing, learning, and casting spells have proper controls on the character sheet.
  'prepare_spells',
  'learn_spell',
  'cast_spell',
]);

function RestPanel() {
  const access = usePartyAccess('rest');
  const schema = useCommandSchema('rest');
  const { rest, pending } = useRest();
  const report = useTownUi((s) => s.restReport);
  const kinds = useMemo(() => {
    const options = schema.data
      ? readFields(schema.data.json_schema).find((f) => f.name === 'kind')?.options
      : null;
    return options && options.length > 0 ? options : ['turn', 'night', 'day'];
  }, [schema.data]);
  return (
    <Panel title="Rest">
      <p className={styles.lead}>
        A night of sleep lets casters prepare spells. A full day of rest also heals everyone who is alive.
      </p>
      <div className={styles.restOptions}>
        {kinds.map((kind) => (
          <div key={kind} className={styles.restOption}>
            <span className={styles.restIcon}>
              <Icon name={REST_ICONS[kind] ?? 'rest'} size={20} />
            </span>
            <div className={styles.restText}>
              <h3 className={styles.restName}>{restKindLabel(kind)}</h3>
              <p className={styles.restDetail}>{restKindDescription(kind)}</p>
              {REST_LENGTH[kind] && <p className={styles.restLength}>{REST_LENGTH[kind]} of game time</p>}
            </div>
            <Button
              variant="secondary"
              loading={pending}
              disabled={!access.allowed}
              onClick={() => void rest(kind)}
            >
              {`Rest ${restKindLabel(kind).toLowerCase()}`}
            </Button>
          </div>
        ))}
      </div>
      {!access.allowed && <p className={styles.explain}>{access.explanation}</p>}
      {report !== null && report.error !== null && (
        <Banner tone="warning" title="The party can't rest">
          {report.error}
        </Banner>
      )}
      {report !== null && report.error === null && (
        <div className={styles.report} role="status" aria-label="What the rest did">
          <h3 className={styles.reportTitle}>{`${restKindLabel(report.kind)} passed`}</h3>
          {report.changes.length + report.lines.length === 0 ? (
            <p className={styles.reportLine}>Nothing else happened.</p>
          ) : (
            <ul className={styles.reportLines}>
              {[...report.changes, ...report.lines].map((line, index) => (
                <li key={`${index}-${line}`} className={styles.reportLine}>
                  {line}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Panel>
  );
}

function SheetPanel() {
  const party = useParty();
  const openSheet = useTableUi((s) => s.openCharacterSheet);
  return (
    <Panel title="Prepare and manage gear" meta="On the character sheet">
      <p className={styles.lead}>
        Open a sheet and choose its Spells tab to prepare, learn, or cast spells. The Inventory tab wields and
        wears gear and moves items between packs.
      </p>
      <ul className={styles.members}>
        {party.map((member) => {
          const counts = spellCounts(member);
          return (
            <li key={member.id} className={styles.member}>
              <MemberToken member={member} size={32} />
              <div className={styles.memberText}>
                <span className={styles.memberName}>{member.name}</span>
                <span className={styles.memberMeta}>
                  {classLine(member)}
                  {counts.book + counts.prepared > 0 &&
                    `, ${counts.book} in the spell book, ${counts.prepared} prepared`}
                </span>
              </div>
              <Button size="sm" variant="secondary" icon="book" onClick={() => openSheet(member.id)}>
                {`Open ${member.name}'s sheet`}
              </Button>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function OtherPanel() {
  const commands = useLegalCommands();
  const others = commands.filter((command) => !HANDLED.has(command.command_type));
  return (
    <Panel title="Other things the party can do" meta={`${others.length} actions`}>
      {others.length === 0 ? (
        <EmptyState size="compact" icon="check" title="Nothing else is open" />
      ) : (
        <Accordion
          type="single"
          items={others.map((command) => ({
            value: command.command_type,
            title: commandInfo(command.command_type).label,
            content: <CommandForm commandType={command.command_type} />,
          }))}
        />
      )}
    </Panel>
  );
}

/** Rest, the character sheet links, and the commands that have no custom control. */
export function RestAndPrepare() {
  const view = usePlayerView();
  return (
    <div className={styles.wrap}>
      <PlaceHeader
        icon="rest"
        title={placeName('rest', view?.town_services ?? []) ?? 'A place to rest'}
        lead="Sleep, recover, and get ready. Spells are prepared on the character sheet."
      />
      <div className={styles.page}>
        <div className={styles.column}>
          <RestPanel />
          <SheetPanel />
        </div>
        <div className={styles.column}>
          <OtherPanel />
        </div>
      </div>
    </div>
  );
}
