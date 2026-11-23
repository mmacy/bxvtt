import { isProblem } from '@bxvtt/shared/client';
import { LIMITS, type Notes } from '@bxvtt/shared/protocol';
import { useCallback, useEffect, useId, useReducer, useRef, useState } from 'react';
import {
  describeProblem,
  getApi,
  useMembers,
  usePartyNotes,
  usePreferences,
  useRefereeLens,
  useTableId,
  useTableStoreApi,
  useTableUser,
} from '@/app';
import { Banner, Button, Icon, Textarea, cx } from '@/ui';
import { hasUnsavedChanges, initialNotesState, notesReducer, shouldSave } from './model/notes';
import styles from './journal.module.css';

const AUTOSAVE_MS = 1200;
const COUNT_FROM = LIMITS.notesText - 5000;

const EMPTY: Notes = { kind: 'party', text: '', version: 0, updated_by: null, updated_at: null };

function relativeTime(iso: string, now: number): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return '';
  const seconds = Math.round((now - then) / 1000);
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return minutes === 1 ? 'a minute ago' : `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? 'an hour ago' : `${hours} hours ago`;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(then),
  );
}

/** The party's shared notes: anyone at the table can edit them, and they save as you type. */
export function PartyNotes() {
  const tableId = useTableId();
  const store = useTableStoreApi();
  const server = usePartyNotes() ?? EMPTY;
  const members = useMembers();
  const me = useTableUser();
  const lens = useRefereeLens();
  const setPreference = usePreferences((s) => s.set);
  const [state, dispatch] = useReducer(notesReducer, server, initialNotesState);
  const [now, setNow] = useState(() => Date.now());
  const editorId = useId();
  const statusId = useId();
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // A newer version from the server: take it, or ask the reader what to keep.
  useEffect(() => {
    dispatch({ type: 'remote', notes: server });
  }, [server]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const save = useCallback(async () => {
    const current = stateRef.current;
    if (current.status === 'saving' || current.status === 'conflict') return;
    if (!hasUnsavedChanges(current)) return;
    if (current.draft.length > LIMITS.notesText) return;
    dispatch({ type: 'save-start' });
    try {
      const notes = await getApi().updateNotes(tableId, 'party', current.draft, current.base.version);
      store.getState().receiveNotes(notes);
      dispatch({ type: 'save-ok', notes });
    } catch (error) {
      if (isProblem(error, 'stale_version')) {
        const latest = (error.problem as { notes?: Notes }).notes;
        if (latest) {
          store.getState().receiveNotes(latest);
          dispatch({ type: 'save-conflict', notes: latest });
          return;
        }
      }
      const problem = describeProblem(error);
      dispatch({ type: 'save-error', message: `${problem.title}. ${problem.detail}` });
    }
  }, [tableId, store]);

  // Autosave a moment after the reader stops typing.
  useEffect(() => {
    if (!shouldSave(state)) return;
    const timer = setTimeout(() => void save(), AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [state, save]);

  // Save what's left when the panel closes.
  useEffect(
    () => () => {
      if (shouldSave(stateRef.current)) void save();
    },
    [save],
  );

  const nameOf = (userId: string | null) =>
    userId === null
      ? null
      : userId === me?.id
        ? 'You'
        : (members.find((m) => m.user_id === userId)?.name ?? 'A former member');
  const editor = nameOf(state.base.updated_by);
  const theirName = state.theirs ? (nameOf(state.theirs.updated_by) ?? 'Someone') : 'Someone';
  const over = state.draft.length > LIMITS.notesText;

  let status: string;
  switch (state.status) {
    case 'saving':
      status = 'Saving…';
      break;
    case 'dirty':
      status = over ? 'Too long to save' : 'Unsaved changes';
      break;
    case 'error':
      status = 'Not saved';
      break;
    case 'conflict':
      status = 'Waiting for your choice';
      break;
    default:
      status =
        editor !== null && state.base.updated_at !== null
          ? `${state.status === 'saved' ? 'Saved. ' : ''}${editor === 'You' ? 'You' : editor} edited ${relativeTime(state.base.updated_at, now)}`
          : state.status === 'saved'
            ? 'Saved'
            : 'Anyone at the table can edit these notes.';
  }

  return (
    <div className={styles.notes}>
      {state.status === 'conflict' && state.theirs !== null && (
        <Banner tone="info" icon="users" title={`${theirName} saved the notes while you were writing`}>
          <p className={styles.mergeText}>
            Your version is still here. Keep it to replace theirs, take theirs instead, or compare the two
            first.
          </p>
          <div className={styles.mergeActions}>
            <Button size="sm" variant="primary" onClick={() => dispatch({ type: 'keep-mine' })}>
              Keep mine
            </Button>
            <Button size="sm" onClick={() => dispatch({ type: 'take-theirs' })}>
              Take theirs
            </Button>
            <Button
              size="sm"
              variant="ghost"
              aria-pressed={state.comparing}
              onClick={() => dispatch({ type: 'compare', on: !state.comparing })}
            >
              {state.comparing ? 'Hide theirs' : 'See both'}
            </Button>
          </div>
        </Banner>
      )}
      {state.status === 'conflict' && state.theirs !== null && state.comparing && (
        <section className={styles.theirs} aria-label={`${theirName}'s version`}>
          <p className={styles.theirsTitle}>
            <Icon name="eye" size={13} /> {theirName}&apos;s version
          </p>
          <pre className={styles.theirsText}>{state.theirs.text === '' ? 'Empty' : state.theirs.text}</pre>
          <p className={styles.quiet}>
            Copy anything you want to keep into your version, then choose Keep mine.
          </p>
        </section>
      )}
      <label htmlFor={editorId} className={state.comparing ? styles.theirsTitle : 'visually-hidden'}>
        {state.comparing && <Icon name="edit" size={13} />}
        {state.comparing ? 'Your version' : 'Party notes'}
      </label>
      <Textarea
        id={editorId}
        value={state.draft}
        aria-describedby={statusId}
        invalid={over}
        placeholder="Reeve Tamsin Hale promised 100 gp for Gashnak's ring. Locked iron door on level 1, east wall."
        className={styles.editor}
        wrapperClassName={styles.editorWrap}
        onChange={(event) => dispatch({ type: 'edit', text: event.target.value })}
        onBlur={() => {
          if (shouldSave(stateRef.current)) void save();
        }}
      />
      <div className={styles.notesFooter}>
        <p
          id={statusId}
          className={cx(styles.status, state.status === 'error' && styles.statusError)}
          aria-live="polite"
        >
          {state.status === 'saving' && <Icon name="refresh" size={12} className={styles.spin} />}
          {state.status === 'saved' && <Icon name="check" size={12} />}
          {status}
        </p>
        {state.draft.length >= COUNT_FROM && (
          <p className={cx(styles.status, over && styles.statusError)}>
            {state.draft.length.toLocaleString()} of {LIMITS.notesText.toLocaleString()}
          </p>
        )}
      </div>
      {state.status === 'error' && state.error !== null && (
        <Banner tone="danger" title="Couldn't save notes">
          <p className={styles.mergeText}>{state.error}</p>
          <Button size="sm" onClick={() => void save()}>
            Try again
          </Button>
        </Banner>
      )}
      {lens && (
        <p className={styles.refereeLink}>
          <Icon name="referee" size={14} />
          <span>Your private referee notes are in the Referee tab.</span>
          <Button
            size="sm"
            variant="ghost"
            iconEnd="arrow-right"
            onClick={() => setPreference('dockTab', 'referee')}
          >
            Open
          </Button>
        </p>
      )}
    </div>
  );
}
