/**
 * The referee's private notes. Edits save a moment after the referee stops typing, each against the version
 * it started from. When another referee saved first, the notes keep both texts and let the referee choose.
 */
import { LIMITS, type Notes } from '@bxvtt/shared/protocol';
import { isProblem } from '@bxvtt/shared/client';
import { useEffect, useRef, useState } from 'react';
import {
  describeProblem,
  formatShortcut,
  getApi,
  useMember,
  useRefereeNotes,
  useTableId,
  useTableUser,
} from '@/app';
import { Banner, Button, Kbd, Skeleton, Textarea } from '@/ui';
import styles from './sections.module.css';

/** How long after the last keystroke the notes save. */
const SAVE_DELAY_MS = 1200;

function relativeTime(iso: string | null): string {
  if (!iso) return '';
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return minutes === 1 ? 'a minute ago' : `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? 'an hour ago' : `${hours} hours ago`;
  return new Date(iso).toLocaleDateString();
}

export function RefereeNotes() {
  const notes = useRefereeNotes();
  const tableId = useTableId();
  const me = useTableUser();
  const author = useMember(notes?.updated_by);
  /** The referee's unsaved text, or `null` while the box shows the saved notes. */
  const [draft, setDraft] = useState<string | null>(null);
  /** The version the draft started from. */
  const [base, setBase] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTheirs, setShowTheirs] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<{ draft: string | null; base: number }>({ draft: null, base: 0 });
  useEffect(() => {
    latest.current = { draft, base };
  }, [draft, base]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  if (notes === null) return <Skeleton lines={6} />;

  const conflict = draft !== null && notes.version > base;
  const dirty = draft !== null && draft !== notes.text;
  const value = draft ?? notes.text;

  const save = async (text: string, version: number) => {
    setSaving(true);
    try {
      const saved: Notes = await getApi().updateNotes(tableId, 'referee', text, version);
      setError(null);
      // Keep typing that arrived during the save; otherwise show the saved notes.
      if (latest.current.draft === text) setDraft(null);
      setBase(saved.version);
    } catch (err) {
      if (isProblem(err, 'stale_version')) {
        // Another referee saved first. The store has their version from the server's push, and the banner
        // below offers the choice.
        setError(null);
      } else {
        const problem = describeProblem(err);
        setError(`${problem.title}. ${problem.detail}`);
      }
    } finally {
      setSaving(false);
    }
  };

  const schedule = (text: string, version: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      void save(text, version);
    }, SAVE_DELAY_MS);
  };

  const onChange = (text: string) => {
    const startVersion = draft === null ? notes.version : base;
    if (draft === null) setBase(notes.version);
    setDraft(text);
    if (!conflict) schedule(text, startVersion);
  };

  const keepMine = () => {
    if (draft === null) return;
    setBase(notes.version);
    void save(draft, notes.version);
  };
  const useTheirs = () => {
    if (timer.current) clearTimeout(timer.current);
    setDraft(null);
    setShowTheirs(false);
  };

  const status = saving
    ? 'Saving…'
    : conflict
      ? 'Not saved'
      : dirty
        ? 'Unsaved changes'
        : notes.updated_at
          ? `Saved ${relativeTime(notes.updated_at)}${author && author.user_id !== me?.id ? ` by ${author.name}` : ''}`
          : 'Nothing saved yet';

  return (
    <div className={styles.section}>
      <p className={styles.secondaryLine}>
        Only referees can see these notes. Changes save automatically and persist between games. Press{' '}
        <Kbd keys={formatShortcut('mod+enter')} /> to save now.
      </p>
      {conflict && (
        <Banner
          tone="info"
          title={
            author?.user_id === me?.id
              ? 'You saved these notes in another window while editing'
              : `${author?.name ?? 'Another referee'} updated these notes while you were editing`
          }
        >
          <p className={styles.bannerText}>
            Your edits are still in the box below. Keep yours to overwrite theirs, or take theirs after
            copying anything you want to keep.
          </p>
          <div className={styles.rowActions}>
            <Button size="sm" variant="secondary" onClick={keepMine}>
              Keep mine
            </Button>
            <Button size="sm" variant="ghost" onClick={useTheirs}>
              Take theirs
            </Button>
            <Button
              size="sm"
              variant="ghost"
              aria-expanded={showTheirs}
              onClick={() => setShowTheirs(!showTheirs)}
            >
              {showTheirs ? 'Hide theirs' : 'See both'}
            </Button>
          </div>
        </Banner>
      )}
      {conflict && showTheirs && (
        <figure className={styles.offer}>
          <figcaption className={styles.minorHead}>Their version</figcaption>
          <pre className={styles.theirs}>{notes.text || 'Empty'}</pre>
        </figure>
      )}
      {conflict && <h4 className={styles.minorHead}>Your version</h4>}
      <Textarea
        aria-label="Private notes"
        className={styles.notes}
        rows={16}
        maxLength={LIMITS.notesText}
        value={value}
        placeholder="Gashnak trades stolen cargo to the ferryman on new moons. Party plans to rest at the chapel next."
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && draft !== null && !conflict) {
            e.preventDefault();
            if (timer.current) clearTimeout(timer.current);
            void save(draft, base);
          }
        }}
      />
      <div className={styles.notesFoot}>
        <span className={styles.secondary} role="status">
          {status}
        </span>
        <span className={styles.secondary}>
          {value.length.toLocaleString()} of {LIMITS.notesText.toLocaleString()} characters
        </span>
      </div>
      {error && (
        <Banner
          tone="danger"
          title="Couldn't save notes"
          actions={
            draft !== null && (
              <Button size="sm" variant="secondary" onClick={() => void save(draft, base)}>
                Try again
              </Button>
            )
          }
        >
          {error}
        </Banner>
      )}
    </div>
  );
}
