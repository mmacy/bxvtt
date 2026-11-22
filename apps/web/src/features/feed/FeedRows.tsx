import type { ChatEntry, GameEntry, SystemEntry } from '@bxvtt/shared/protocol';
import { formatGameClock, joinList } from '@bxvtt/shared/text';
import { memo, useId, useMemo, useState, type CSSProperties } from 'react';
import { Avatar, Badge, Icon, cx } from '@/ui';
import { parseMarkup } from './model/markup';
import {
  movementRunText,
  narrateEntry,
  type NarratedLine,
  type NarrationItem,
  type PartyStep,
} from './model/narrate';
import { commandLabel, isRefereeCommand, type FeedRow, type MessageEntry } from './model/rows';
import { formatDateTime, formatTime, systemSentence } from './model/text';
import { directionArrow, eventIcon, systemIcon } from './icons';
import { Highlight, Markup, useFeedView } from './FeedView';
import { RollCard } from './RollCard';
import styles from './feed.module.css';

/** Tints a name with the user's color, mixed toward the text color so every color stays readable. */
function authorStyle(color: string | undefined): CSSProperties | undefined {
  return color ? ({ '--author': color } as CSSProperties) : undefined;
}

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
    <div className={styles.unread} role="separator" aria-label="New since you last looked">
      <span aria-hidden="true">New since you last looked</span>
    </div>
  );
}

function SessionDivider({ entry }: { entry: SystemEntry | null }) {
  const view = useFeedView();
  let title = 'A new session begins';
  let icon: 'play' | 'undo' | 'flag' = 'play';
  if (entry?.code === 'game_started') {
    const name = entry.params.adventure_name;
    title = typeof name === 'string' && name !== '' ? name : 'The game begins';
  } else if (entry?.code === 'save_restored') {
    title = 'The game goes back to a save';
    icon = 'undo';
  } else if (entry?.code === 'game_ended') {
    title = 'The game ends';
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
            <span id={headingId} className={styles.author} style={authorStyle(color)}>
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
    journal && styles.journalLine,
  );
  const hasDetail = line.detail !== undefined || line.refereeDetail !== undefined;
  const body = (
    <>
      <span className={styles.lineIcon} aria-hidden="true">
        <Icon name={eventIcon(line.icon)} size={line.weight === 'critical' ? 16 : 14} />
      </span>
      <span className={styles.lineText}>
        {hidden && <span className="visually-hidden">Hidden from players. </span>}
        {journal && <span className={styles.journalLabel}>Journal</span>}
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
        <span className={styles.actor} style={authorStyle(member?.color)}>
          {name}
        </span>
        {label !== null && <span className={styles.commandLabel}>{label}</span>}
      </span>
      <span className={styles.gameMeta}>
        <GameClock entry={entry} />
        <Time iso={entry.created_at} />
      </span>
    </header>
  );
}

const GameBlock = memo(function GameBlock({ entry, compact }: { entry: GameEntry; compact: boolean }) {
  const view = useFeedView();
  const narration = useMemo(
    () => narrateEntry(entry, view.ctx, { lens: view.lens }),
    [entry, view.ctx, view.lens],
  );
  const headingId = `feed-${entry.seq}`;
  const refereeCommand = isRefereeCommand(entry);
  let label = narration.headline ?? commandLabel(entry);
  if (label === null && refereeCommand) label = 'Referee action';
  const items = view.hiddenOnly
    ? narration.items.filter((item) => item.kind === 'line' && item.line.visibility === 'referee')
    : narration.items;
  if (items.length === 0) return null;
  return (
    <article
      className={cx(
        styles.game,
        compact && styles.gameCompact,
        styles[`entry-${narration.weight}`],
        narration.refereeOnly && styles.gameHidden,
      )}
      aria-labelledby={headingId}
    >
      {narration.headline !== null && entry.command_type === 'resolve_battle_round' ? (
        <header className={styles.roundHeader}>
          <span className={styles.roundIcon} aria-hidden="true">
            <Icon name="battle" size={12} />
          </span>
          <span id={headingId} className={styles.roundTitle}>
            {narration.headline}
          </span>
          <span className={styles.gameMeta}>
            <GameClock entry={entry} />
            <Time iso={entry.created_at} />
          </span>
        </header>
      ) : compact ? (
        <header className={styles.gameHeaderCompact}>
          <span id={headingId} className={styles.commandLabel}>
            <span className="visually-hidden">{view.nameOf(entry.user_id)}, </span>
            {label}
          </span>
          {narration.refereeOnly && (
            <Badge tone="referee" appearance="outline">
              Hidden
            </Badge>
          )}
          <span className={styles.gameMeta}>
            <GameClock entry={entry} />
            <Time iso={entry.created_at} />
          </span>
        </header>
      ) : (
        <ActorHeading userId={entry.user_id} label={label} entry={entry} id={headingId} />
      )}
      <ul className={styles.lines}>
        {items.map((item) =>
          item.kind === 'line' ? (
            <LineView key={item.line.key} line={item.line} />
          ) : (
            <Cluster key={item.key} item={item} />
          ),
        )}
      </ul>
    </article>
  );
});

const MovesRow = memo(function MovesRow({
  entries,
  steps,
  checks,
  userId,
}: {
  entries: GameEntry[];
  steps: PartyStep[];
  checks: number;
  userId: string | null;
}) {
  const view = useFeedView();
  const [open, setOpen] = useState(false);
  const pathId = useId();
  const last = entries.at(-1);
  const member = view.memberOf(userId);
  const name = view.nameOf(userId);
  if (last === undefined) return null;
  const text = movementRunText(steps);
  const path = steps.map((step) => (step.turned ? `turn ${step.facing}` : step.facing)).join(', ');
  return (
    <article className={styles.moves} aria-label={`${name}: ${text}`}>
      <button
        type="button"
        className={styles.movesButton}
        aria-expanded={open}
        aria-controls={pathId}
        onClick={() => setOpen((value) => !value)}
        disabled={steps.length === 0}
      >
        <Icon name="footprints" size={14} className={styles.movesIcon} />
        <span className={styles.movesText}>
          <Highlight text={text} query={view.query} />
        </span>
        <Avatar name={name} color={member?.color} size="xs" decorative className={styles.movesAvatar} />
        <span className={styles.gameMeta}>
          <GameClock entry={last} />
          <Time iso={last.created_at} />
        </span>
      </button>
      <div id={pathId} className={styles.path} hidden={!open}>
        <p className="visually-hidden">The party went {path}.</p>
        <ol className={styles.pathSteps} aria-hidden="true">
          {steps.map((step, index) => (
            <li
              key={index}
              className={cx(styles.pathStep, step.turned && styles.pathTurn)}
              title={step.turned ? `Turns to face ${step.facing}` : `Moves ${step.facing}`}
            >
              {directionArrow(step.facing)}
            </li>
          ))}
        </ol>
        {view.lens && checks > 0 && (
          <div className={cx(styles.line, styles.hiddenLine, styles['weight-minor'])}>
            <p className={styles.lineRow}>
              <span className={styles.lineIcon} aria-hidden="true">
                <Icon name="dice" size={14} />
              </span>
              <span className={styles.lineText}>
                <span className="visually-hidden">Hidden from players. </span>
                {checks === 1
                  ? 'No wandering monsters come.'
                  : `No wandering monsters come in ${checks} checks.`}
              </span>
            </p>
          </div>
        )}
      </div>
    </article>
  );
});

/** Renders one row of the feed list. */
export function FeedRowView({ row }: { row: FeedRow }) {
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
    case 'game':
      return <GameBlock entry={row.entry} compact={row.compact} />;
    case 'moves':
      return <MovesRow entries={row.entries} steps={row.steps} checks={row.checks} userId={row.userId} />;
  }
}
