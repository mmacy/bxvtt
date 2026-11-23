import type { ChatEntry, GameEntry, SystemEntry } from '@bxvtt/shared/protocol';
import { formatGameClock, joinList } from '@bxvtt/shared/text';
import { memo, useId, useMemo, useState } from 'react';
import { Avatar, Icon, Parchment, cx } from '@/ui';
import { parseMarkup } from './model/markup';
import { movementRunText, narrateEntry, type NarratedLine, type NarrationItem } from './model/narrate';
import {
  commandLabel,
  isRefereeCommand,
  type CommandPart,
  type FeedRow,
  type MessageEntry,
} from './model/rows';
import { formatDateTime, formatTime, systemSentence } from './model/text';
import { directionArrow, eventIcon, systemIcon } from './icons';
import { Highlight, Markup, useFeedView } from './FeedView';
import { RollCard } from './RollCard';
import styles from './feed.module.css';

/** The time of an entry, with the full date in a tooltip. */
function Time({ iso }: { iso: string }) {
  return (
    <time className={styles.time} dateTime={iso} title={formatDateTime(iso)}>
      {formatTime(iso)}
    </time>
  );
}

/** The game time after a game entry's command. Entries stored before the server recorded it have none. */
function GameClock({ entry }: { entry: GameEntry }) {
  const rounds = entry.clock_rounds;
  if (rounds === null || rounds === undefined) return null;
  const text = formatGameClock(rounds);
  return (
    <span className={styles.clock} title={`Game time: ${text}`}>
      <Icon name="hourglass" size={12} />
      <span className="visually-hidden">Game time </span>
      {text}
    </span>
  );
}

// Dividers -------------------------------------------------------------------------------------------------------

function DayDivider({ label }: { label: string }) {
  return (
    <div className={styles.day} role="separator" aria-label={label}>
      <span aria-hidden="true">{label}</span>
    </div>
  );
}

function UnreadDivider() {
  return (
    <div className={styles.unread} role="separator" aria-label="New entries">
      <span aria-hidden="true">New entries</span>
    </div>
  );
}

function SessionDivider({ entry }: { entry: SystemEntry | null }) {
  const view = useFeedView();
  let title = 'New session';
  let icon: 'play' | 'undo' | 'flag' = 'play';
  if (entry?.code === 'game_started') {
    const name = entry.params.adventure_name;
    title = typeof name === 'string' && name !== '' ? name : 'Game started';
  } else if (entry?.code === 'save_restored') {
    title = 'Save restored';
    icon = 'undo';
  } else if (entry?.code === 'game_ended') {
    title = 'Game ended';
    icon = 'flag';
  }
  return (
    <div className={styles.session}>
      <div className={styles.sessionRule} aria-hidden="true">
        <Icon name={icon} size={14} />
      </div>
      <p className={styles.sessionTitle}>{title}</p>
      {entry !== null && (
        <p className={styles.sessionMeta}>
          {systemSentence(entry, view.nameOf, view.ctx)} <Time iso={entry.created_at} />
        </p>
      )}
    </div>
  );
}

function SystemRow({ entry }: { entry: SystemEntry }) {
  const view = useFeedView();
  return (
    <div className={styles.system}>
      <Icon name={systemIcon(entry.code)} size={14} className={styles.systemIcon} />
      <span className={styles.systemText}>
        <Highlight text={systemSentence(entry, view.nameOf, view.ctx)} query={view.query} />
      </span>
      <Time iso={entry.created_at} />
    </div>
  );
}

// Messages -------------------------------------------------------------------------------------------------------

function audience(entry: MessageEntry, selfId: string | null, nameOf: (id: string) => string): string | null {
  if (entry.visibility === 'users') {
    const others = [...entry.to, entry.user_id ?? ''].filter((id) => id !== '' && id !== selfId);
    const names = others.map((id) => nameOf(id));
    return names.length === 0 ? 'Only you can see this.' : `Only you and ${joinList(names)} can see this.`;
  }
  if (entry.visibility === 'referees') return 'Only referees can see this.';
  return null;
}

function whisperTitle(entry: MessageEntry, selfId: string | null, nameOf: (id: string) => string): string {
  if (entry.user_id === selfId) return `Whisper to ${joinList(entry.to.map((id) => nameOf(id)))}`;
  const others = entry.to.filter((id) => id !== selfId);
  return others.length === 0
    ? 'Whisper to you'
    : `Whisper to you and ${joinList(others.map((id) => nameOf(id)))}`;
}

function ChatText({ entry }: { entry: ChatEntry }) {
  const view = useFeedView();
  const nodes = useMemo(() => parseMarkup(entry.text), [entry.text]);
  return (
    <p className={styles.chatText}>
      <Markup nodes={nodes} query={view.query} />
    </p>
  );
}

const MessageGroup = memo(function MessageGroup({ entries }: { entries: MessageEntry[] }) {
  const view = useFeedView();
  const first = entries[0];
  const member = view.memberOf(first?.user_id);
  if (first === undefined) return null;
  const name = view.nameOf(first.user_id);
  const color = member?.color;
  const whisper = first.visibility === 'users';
  const secret = first.kind === 'roll' && (first.secret || first.visibility === 'referees');
  const note = audience(first, view.selfId, view.nameOf);
  const headingId = `feed-${first.seq}`;
  return (
    <article
      className={cx(styles.group, whisper && styles.whisper, secret && styles.secret)}
      aria-labelledby={headingId}
    >
      {(whisper || secret) && (
        <p className={styles.privacy}>
          <Icon name={whisper ? 'whisper' : 'eye-off'} size={13} />
          <span>{whisper ? whisperTitle(first, view.selfId, view.nameOf) : 'Secret roll'}</span>
          {note !== null && <span className={styles.privacyNote}>{note}</span>}
        </p>
      )}
      <div className={styles.groupBody}>
        <Avatar
          name={name}
          color={color}
          size="sm"
          referee={member?.role === 'referee'}
          decorative
          className={styles.avatar}
        />
        <div className={styles.groupMain}>
          <header className={styles.groupHeader}>
            <span id={headingId} className={styles.author}>
              {name}
            </span>
            {member?.role === 'referee' && <span className={styles.roleTag}>Referee</span>}
            <Time iso={first.created_at} />
          </header>
          {entries.map((entry) =>
            entry.kind === 'chat' ? (
              <ChatText key={entry.seq} entry={entry} />
            ) : (
              <RollCard key={entry.seq} entry={entry} color={color} />
            ),
          )}
        </div>
      </div>
    </article>
  );
});

// Game entries -------------------------------------------------------------------------------------------------

function LineView({ line }: { line: NarratedLine }) {
  const view = useFeedView();
  const [open, setOpen] = useState(false);
  const detailId = useId();
  const hidden = line.visibility === 'referee';
  const journal = line.eventType === 'journal_entry_added';
  const text = journal ? line.text.replace(/^Journal entry:\s*/, '') : line.text;
  const className = cx(
    styles.line,
    styles[`weight-${line.weight}`],
    styles[`cat-${line.category}`],
    styles[`tone-${line.tone}`],
    hidden && styles.hiddenLine,
  );
  if (journal) {
    // A journal entry is a handout the party reads, so it sits on a scrap of paper.
    return (
      <li className={styles.line}>
        <Parchment variant="plain" className={styles.handout}>
          <p className={styles.handoutLabel}>
            <Icon name="journal" size={12} />
            <span className={styles.handoutKind}>Journal</span>
            {line.detail !== undefined && <span>{line.detail}</span>}
          </p>
          <p className={styles.handoutText}>
            <Highlight text={text} query={view.query} />
          </p>
        </Parchment>
      </li>
    );
  }
  const hasDetail = line.detail !== undefined || line.refereeDetail !== undefined;
  const body = (
    <>
      <span className={styles.lineIcon} aria-hidden="true">
        <Icon
          name={eventIcon(line.icon)}
          size={line.weight === 'critical' || line.weight === 'milestone' ? 16 : 14}
        />
      </span>
      <span className={styles.lineText}>
        {hidden && <span className="visually-hidden">Hidden from players. </span>}
        <Highlight text={text} query={view.query} />
      </span>
      {hidden && (
        <span className={styles.hiddenMark} aria-hidden="true" title="Hidden from players">
          <Icon name="eye-off" size={12} />
        </span>
      )}
      {hasDetail && (
        <span className={styles.detailCue} aria-hidden="true">
          <Icon name={open ? 'chevron-up' : 'dice'} size={12} />
        </span>
      )}
    </>
  );
  if (!hasDetail) {
    return (
      <li className={className}>
        <div className={styles.lineRow}>{body}</div>
      </li>
    );
  }
  return (
    <li className={className}>
      <button
        type="button"
        className={cx(styles.lineRow, styles.lineButton)}
        aria-expanded={open}
        aria-controls={detailId}
        onClick={() => setOpen((value) => !value)}
      >
        {body}
      </button>
      <div id={detailId} className={styles.detail} hidden={!open}>
        {line.detail !== undefined && <p>{line.detail}</p>}
        {line.refereeDetail !== undefined && (
          <p className={styles.refereeDetail}>
            <Icon name="eye-off" size={12} />
            <span className="visually-hidden">Hidden from players. </span>
            {line.refereeDetail}
          </p>
        )}
      </div>
    </li>
  );
}

function Cluster({ item }: { item: Extract<NarrationItem, { kind: 'cluster' }> }) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  return (
    <li className={cx(styles.line, styles['weight-minor'])}>
      <button
        type="button"
        className={cx(styles.lineRow, styles.lineButton)}
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((value) => !value)}
      >
        <span className={styles.lineIcon} aria-hidden="true">
          <Icon name="arrow-right" size={14} />
        </span>
        <span className={styles.lineText}>{item.summary}</span>
        <span className={styles.detailCue} aria-hidden="true">
          <Icon name={open ? 'chevron-up' : 'chevron-down'} size={12} />
        </span>
      </button>
      <ul id={listId} className={styles.clusterList} hidden={!open}>
        {item.lines.map((line) => (
          <LineView key={line.key} line={line} />
        ))}
      </ul>
    </li>
  );
}

function ActorHeading({
  userId,
  label,
  entry,
  id,
}: {
  userId: string | null;
  label: string | null;
  entry: GameEntry;
  id: string;
}) {
  const view = useFeedView();
  const member = view.memberOf(userId);
  const name = userId === null ? 'The table' : view.nameOf(userId);
  return (
    <header className={styles.gameHeader}>
      <Avatar name={name} color={member?.color} size="xs" referee={member?.role === 'referee'} decorative />
      <span id={id} className={styles.gameTitle}>
        <span className={styles.actor}>{name}</span>
        {label !== null && <span className={styles.commandLabel}>{label}</span>}
      </span>
      <span className={styles.gameMeta}>
        <GameClock entry={entry} />
        <Time iso={entry.created_at} />
      </span>
    </header>
  );
}

/** A run of plain party movement, as one line that opens to show the path. */
function StepsLine({ part }: { part: Extract<CommandPart, { kind: 'steps' }> }) {
  const view = useFeedView();
  const [open, setOpen] = useState(false);
  const pathId = useId();
  const text = movementRunText(part.steps);
  const path = part.steps.map((step) => (step.turned ? `turn ${step.facing}` : step.facing)).join(', ');
  const body = (
    <>
      <span className={styles.lineIcon} aria-hidden="true">
        <Icon name="footprints" size={14} />
      </span>
      <span className={styles.lineText}>
        <Highlight text={text} query={view.query} />
      </span>
    </>
  );
  if (part.steps.length < 2 && !(view.lens && part.checks > 0)) {
    return (
      <li className={cx(styles.line, styles['weight-minor'])}>
        <div className={styles.lineRow}>{body}</div>
      </li>
    );
  }
  return (
    <li className={cx(styles.line, styles['weight-minor'])}>
      <button
        type="button"
        className={cx(styles.lineRow, styles.lineButton)}
        aria-expanded={open}
        aria-controls={pathId}
        onClick={() => setOpen((value) => !value)}
      >
        {body}
        <span className={styles.detailCue} aria-hidden="true">
          <Icon name={open ? 'chevron-up' : 'chevron-down'} size={12} />
        </span>
      </button>
      <div id={pathId} className={styles.path} hidden={!open}>
        <p className="visually-hidden">The party went {path}.</p>
        <ol className={styles.pathSteps} aria-hidden="true">
          {part.steps.map((step, index) => (
            <li
              key={index}
              className={cx(styles.pathStep, step.turned && styles.pathTurn)}
              title={step.turned ? `Turns to face ${step.facing}` : `Moves ${step.facing}`}
            >
              {directionArrow(step.facing)}
            </li>
          ))}
        </ol>
        {view.lens && part.checks > 0 && (
          <p className={cx(styles.refereeDetail, styles.pathNote)}>
            <Icon name="eye-off" size={12} />
            <span className="visually-hidden">Hidden from players. </span>
            {part.checks === 1
              ? 'No wandering monsters come.'
              : `No wandering monsters come in ${part.checks} checks.`}
          </p>
        )}
      </div>
    </li>
  );
}

/** The lines of one entry inside a command group. */
function EntryLines({ entry }: { entry: GameEntry }) {
  const view = useFeedView();
  const narration = useMemo(
    () => narrateEntry(entry, view.ctx, { lens: view.lens }),
    [entry, view.ctx, view.lens],
  );
  const items = view.hiddenOnly
    ? narration.items.filter((item) => item.kind === 'line' && item.line.visibility === 'referee')
    : narration.items;
  return (
    <>
      {items.map((item) =>
        item.kind === 'line' ? (
          <LineView key={item.line.key} line={item.line} />
        ) : (
          <Cluster key={item.key} item={item} />
        ),
      )}
    </>
  );
}

/**
 * One sender's commands of one kind: a heading with who acted and the command, then the lines of each entry,
 * with runs of plain party movement folded into one line. A battle round is headed by its number.
 */
const CommandBlock = memo(function CommandBlock({ row }: { row: Extract<FeedRow, { type: 'command' }> }) {
  const view = useFeedView();
  const first = row.entries[0];
  const last = row.entries.at(-1);
  const round = useMemo(
    () =>
      first !== undefined && row.group === 'round'
        ? narrateEntry(first, view.ctx, { lens: view.lens }).headline
        : null,
    [first, row.group, view.ctx, view.lens],
  );
  const refereeOnly = useMemo(
    () =>
      row.entries.every((entry) => narrateEntry(entry, view.ctx, { lens: view.lens }).refereeOnly) &&
      row.parts.every((part) => part.kind === 'entry'),
    [row, view.ctx, view.lens],
  );
  if (first === undefined || last === undefined) return null;
  const headingId = `feed-${first.seq}`;
  let label = commandLabel(first);
  if (label === null && isRefereeCommand(first)) label = 'Referee action';
  const parts = view.hiddenOnly ? row.parts.filter((part) => part.kind === 'entry') : row.parts;
  if (parts.length === 0) return null;
  return (
    <article className={cx(styles.game, refereeOnly && styles.gameHidden)} aria-labelledby={headingId}>
      {round !== null ? (
        <header className={styles.roundHeader}>
          <span className={styles.roundIcon} aria-hidden="true">
            <Icon name="battle" size={12} />
          </span>
          <span id={headingId} className={styles.roundTitle}>
            {round}
          </span>
          <span className={styles.gameMeta}>
            <GameClock entry={last} />
            <Time iso={last.created_at} />
          </span>
        </header>
      ) : (
        <ActorHeading userId={row.userId} label={label} entry={last} id={headingId} />
      )}
      <ul className={styles.lines}>
        {parts.map((part) =>
          part.kind === 'steps' ? (
            <StepsLine key={part.key} part={part} />
          ) : (
            <EntryLines key={part.key} entry={part.entry} />
          ),
        )}
      </ul>
    </article>
  );
});

/** Renders one row of the feed list. A row object that didn't change skips rendering. */
export const FeedRowView = memo(function FeedRowView({ row }: { row: FeedRow }) {
  switch (row.type) {
    case 'day':
      return <DayDivider label={row.label} />;
    case 'unread':
      return <UnreadDivider />;
    case 'session':
      return <SessionDivider entry={row.entry} />;
    case 'system':
      return <SystemRow entry={row.entry} />;
    case 'messages':
      return <MessageGroup entries={row.entries} />;
    case 'command':
      return <CommandBlock row={row} />;
  }
});
