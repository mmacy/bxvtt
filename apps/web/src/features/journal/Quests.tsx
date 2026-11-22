import { useEffect, useMemo, useRef, useState } from 'react';
import { useAdventureDocument, useGame, usePlayerView, useRefereeState } from '@/app';
import { Badge, Button, EmptyState, Icon, cx } from '@/ui';
import {
  adventureQuests,
  buildQuestLog,
  questChange,
  snapshotQuests,
  type QuestCard,
  type SeenQuests,
} from './model/quests';
import { readSeenQuests, writeSeenQuests } from './model/storage';
import { useQuestHistory } from './useQuestHistory';
import styles from './journal.module.css';

const LONG_NARRATIVE = 180;

function QuestItem({ quest, seen }: { quest: QuestCard; seen: SeenQuests | null }) {
  const [expanded, setExpanded] = useState(false);
  const { change, objectives: changed } = questChange(quest, seen);
  const long = quest.narrative.length > LONG_NARRATIVE;
  const headingId = `quest-${quest.id}`;
  const done = quest.objectives.filter((o) => o.complete && !o.hidden).length;
  const shown = quest.objectives.filter((o) => !o.hidden).length;
  return (
    <article
      className={cx(
        styles.quest,
        quest.status === 'completed' && styles.questDone,
        quest.status === 'inactive' && styles.questHidden,
        change !== null && styles.questChanged,
      )}
      aria-labelledby={headingId}
    >
      <header className={styles.questHeader}>
        <span className={styles.questIcon} aria-hidden="true">
          <Icon
            name={quest.status === 'completed' ? 'check' : quest.status === 'inactive' ? 'eye-off' : 'flag'}
            size={14}
          />
        </span>
        <h3 id={headingId} className={styles.questName}>
          {quest.name}
        </h3>
        {change === 'new' && (
          <Badge tone="accent" appearance="solid">
            New
          </Badge>
        )}
        {change === 'updated' && <Badge tone="accent">Updated</Badge>}
        {change === 'completed' && (
          <Badge tone="success" icon="check">
            Completed
          </Badge>
        )}
        {quest.status === 'inactive' && <Badge tone="referee">Not offered</Badge>}
      </header>
      {quest.speaker !== '' && <p className={styles.speaker}>From {quest.speaker}</p>}
      {quest.narrative !== '' && (
        <>
          <p className={cx(styles.narrative, long && !expanded && styles.clamped)}>{quest.narrative}</p>
          {long && (
            <Button
              variant="ghost"
              size="sm"
              className={styles.more}
              onClick={() => setExpanded((value) => !value)}
              aria-expanded={expanded}
            >
              {expanded ? 'Show less' : 'Read more'}
            </Button>
          )}
        </>
      )}
      {quest.objectives.length > 0 && (
        <>
          {quest.status === 'active' && shown > 0 && (
            <p className={styles.progress}>
              {done} of {shown} {shown === 1 ? 'objective' : 'objectives'} done
            </p>
          )}
          <ul className={styles.objectives} aria-label={`Objectives of ${quest.name}`}>
            {quest.objectives.map((objective) => (
              <li
                key={objective.id}
                className={cx(
                  styles.objective,
                  objective.complete && styles.objectiveDone,
                  objective.hidden && styles.objectiveHidden,
                  changed.has(objective.id) && styles.objectiveChanged,
                )}
              >
                <span className={styles.objectiveMark} aria-hidden="true">
                  {(objective.hidden || objective.complete) && (
                    <Icon name={objective.hidden ? 'eye-off' : 'check'} size={12} />
                  )}
                </span>
                <span className={styles.objectiveName}>
                  <span className="visually-hidden">{objective.complete ? 'Done: ' : 'To do: '}</span>
                  {objective.name}
                </span>
                {objective.hidden && <span className={styles.hiddenNote}>Hidden from players</span>}
                {changed.has(objective.id) && !objective.hidden && (
                  <span className={styles.changedNote}>{objective.complete ? 'Just done' : 'New'}</span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      {quest.completion !== null && quest.completion !== '' && (
        <p className={styles.completion}>{quest.completion}</p>
      )}
    </article>
  );
}

/** The quest log: active quests, then finished ones, and for a referee with the lens on, the ones not offered yet. */
export function Quests() {
  const view = usePlayerView();
  const game = useGame();
  const referee = useRefereeState();
  const adventure = useAdventureDocument().data;
  const history = useQuestHistory();
  const log = useMemo(
    () =>
      buildQuestLog({
        quests: view?.quests ?? [],
        history,
        referee,
        adventure: adventureQuests(adventure),
      }),
    [view?.quests, history, referee, adventure],
  );
  const sessionId = game?.session_id ?? null;
  // Changes are marked against what the reader saw last time, or on a first visit, against the log as it opened.
  const [firstVisit] = useState(() => sessionId !== null && readSeenQuests(sessionId) === null);
  const [seen] = useState<SeenQuests | null>(() =>
    sessionId === null ? null : (readSeenQuests(sessionId) ?? snapshotQuests(log.active)),
  );
  const latest = useRef<SeenQuests>({});
  useEffect(() => {
    latest.current = snapshotQuests([...log.active, ...log.completed]);
    // The first visit marks nothing as changed and records what the log shows.
    if (firstVisit && sessionId !== null) writeSeenQuests(sessionId, latest.current);
  }, [log, firstVisit, sessionId]);

  // Remember what the reader saw when they leave, so the next visit marks only what changed since.
  useEffect(() => {
    if (sessionId === null) return;
    const saved = latest;
    return () => writeSeenQuests(sessionId, saved.current);
  }, [sessionId]);

  if (view === null) {
    return (
      <EmptyState
        icon="flag"
        size="compact"
        title="No game yet"
        description="Quests show here once the game starts."
      />
    );
  }
  if (log.active.length === 0 && log.completed.length === 0 && log.notOffered.length === 0) {
    return (
      <EmptyState
        icon="flag"
        size="compact"
        title="No quests yet"
        description="When someone in the adventure gives the party a task, it shows here with its objectives."
      />
    );
  }
  return (
    <div className={styles.questLog}>
      <section aria-labelledby="quests-active">
        <h2 id="quests-active" className={styles.sectionTitle}>
          Active quests <span className={styles.count}>{log.active.length}</span>
        </h2>
        {log.active.length === 0 ? (
          <p className={styles.quiet}>The party has no quest in hand right now.</p>
        ) : (
          log.active.map((quest) => <QuestItem key={quest.id} quest={quest} seen={seen} />)
        )}
      </section>
      {log.completed.length > 0 && (
        <section aria-labelledby="quests-done">
          <h2 id="quests-done" className={styles.sectionTitle}>
            Completed <span className={styles.count}>{log.completed.length}</span>
          </h2>
          {log.completed.map((quest) => (
            <QuestItem key={quest.id} quest={quest} seen={seen} />
          ))}
        </section>
      )}
      {log.notOffered.length > 0 && (
        <section aria-labelledby="quests-hidden" className={styles.refereeSection}>
          <h2 id="quests-hidden" className={styles.sectionTitle}>
            <Icon name="eye-off" size={13} /> Not offered yet{' '}
            <span className={styles.count}>{log.notOffered.length}</span>
          </h2>
          <p className={styles.quiet}>Only referees see these quests until the party takes them on.</p>
          {log.notOffered.map((quest) => (
            <QuestItem key={quest.id} quest={quest} seen={null} />
          ))}
        </section>
      )}
    </div>
  );
}
