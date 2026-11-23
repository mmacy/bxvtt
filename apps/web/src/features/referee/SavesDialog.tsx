import { LIMITS, type SaveEntry } from '@bxvtt/shared/protocol';
import { formatGameClock } from '@bxvtt/shared/text';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  displayStringProblem,
  getApi,
  useApiAction,
  useFeed,
  useGame,
  useIsReferee,
  useMembers,
  useTableId,
  useTableSettings,
  useTableUi,
  useTableUser,
} from '@/app';
import {
  Badge,
  Banner,
  Button,
  Checkbox,
  ConfirmDialog,
  Dialog,
  DropdownMenu,
  EmptyState,
  Field,
  Icon,
  IconButton,
  ModeBadge,
  Skeleton,
  TextInput,
  toast,
  type GameMode,
  type MenuEntry,
} from '@/ui';
import styles from './SavesDialog.module.css';

export interface SavesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MODES: readonly GameMode[] = ['town', 'exploring', 'encounter', 'battle', 'game_over', 'victory'];

function asMode(mode: string): GameMode | null {
  return (MODES as readonly string[]).includes(mode) ? (mode as GameMode) : null;
}

/** A save's name for people: its label without the server's `Autosave:` prefix, or when it was made. */
export function saveTitle(save: SaveEntry): string {
  if (save.label) return save.autosave ? save.label.replace(/^Autosave:\s*/, '') || 'Autosave' : save.label;
  return `Saved ${new Date(save.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}`;
}

/** When a save was made: how long ago, with the time of day for a recent save, or the date for an older one. */
function whenText(iso: string): string {
  const then = new Date(iso);
  const seconds = Math.round((Date.now() - then.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const timeOfDay = then.toLocaleTimeString(undefined, { timeStyle: 'short' });
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes === 1 ? '1 minute' : `${minutes} minutes`} ago, ${timeOfDay}`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours === 1 ? '1 hour' : `${hours} hours`} ago, ${timeOfDay}`;
  return then.toLocaleDateString(undefined, { dateStyle: 'medium' });
}

/** How many saves there are, and how many are autosaves: `5 saves (2 autosaves)`. */
export function saveCountText(total: number, autosaves: number): string {
  if (autosaves === total) return total === 1 ? '1 autosave' : `${total} autosaves`;
  const all = total === 1 ? '1 save' : `${total} saves`;
  if (autosaves === 0) return all;
  return `${all} (${autosaves === 1 ? '1 autosave' : `${autosaves} autosaves`})`;
}

/** A file name for an exported save document. */
export function exportFileName(save: SaveEntry): string {
  const base = saveTitle(save)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${base || 'save'}.bxsave.json`;
}

function download(name: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Loads the table's saves and reloads them when the feed reports a save or a restore. */
function useSaves(open: boolean) {
  const tableId = useTableId();
  const feed = useFeed();
  const [saves, setSaves] = useState<SaveEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const lastSaveNotice = useMemo(() => {
    for (let i = feed.length - 1; i >= 0; i -= 1) {
      const entry = feed[i];
      if (entry?.kind === 'system') return entry.seq;
    }
    return 0;
  }, [feed]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getApi()
      .listSaves(tableId)
      .then((list) => {
        if (cancelled) return;
        setSaves(list.items);
        setError(null);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load saves. Check your connection and try again.");
      });
    return () => {
      cancelled = true;
    };
  }, [open, tableId, lastSaveNotice, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { saves, error, reload, setSaves };
}

function SaveRow({
  save,
  current,
  canManage,
  referee,
  author,
  onRestore,
  onDelete,
  onChanged,
}: {
  save: SaveEntry;
  current: boolean;
  canManage: boolean;
  referee: boolean;
  author: string | null;
  onRestore: (save: SaveEntry) => void;
  onDelete: (save: SaveEntry) => void;
  onChanged: (save: SaveEntry) => void;
}) {
  const tableId = useTableId();
  const { run, pending } = useApiAction();
  const [renaming, setRenaming] = useState(false);
  const [label, setLabel] = useState(save.label ?? '');
  const [labelError, setLabelError] = useState<string | null>(null);
  const mode = asMode(save.mode);

  const rename = async (event: FormEvent) => {
    event.preventDefault();
    const text = label.trim();
    const problem = text === '' ? null : displayStringProblem(text, LIMITS.saveLabel);
    if (problem) return setLabelError(problem);
    const result = await run(() => getApi().renameSave(tableId, save.id, text === '' ? null : text), {
      errorTitle: "Couldn't rename the save",
    });
    if (result.ok) {
      onChanged(result.value);
      setRenaming(false);
      setLabelError(null);
    }
  };

  const exportSave = async () => {
    const result = await run(() => getApi().exportSave(tableId, save.id), {
      errorTitle: "Couldn't export the save",
    });
    if (result.ok) {
      download(exportFileName(save), result.value);
      toast.success('Save document downloaded');
    }
  };

  const menu: MenuEntry[] = [];
  if (canManage) menu.push({ label: 'Rename', icon: 'edit', onSelect: () => setRenaming(true) });
  if (referee) menu.push({ label: 'Export save', icon: 'download', onSelect: () => void exportSave() });
  if (canManage) {
    menu.push(
      { type: 'separator' },
      { label: 'Delete', icon: 'trash', danger: true, onSelect: () => onDelete(save) },
    );
  }

  return (
    <li className={styles.entry} data-autosave={save.autosave || undefined}>
      <span className={styles.marker} aria-hidden="true">
        <Icon name={save.autosave ? 'clock' : 'save'} size={14} />
      </span>
      <div className={styles.body}>
        {renaming ? (
          <form className={styles.renameForm} onSubmit={rename}>
            <Field label="Save name" hideLabel error={labelError ?? undefined}>
              <TextInput
                size="sm"
                value={label}
                autoFocus
                maxLength={LIMITS.saveLabel}
                onChange={(e) => setLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.stopPropagation();
                    setRenaming(false);
                  }
                }}
              />
            </Field>
            <Button type="submit" size="sm" variant="secondary" loading={pending}>
              Rename
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setRenaming(false)}>
              Cancel
            </Button>
          </form>
        ) : (
          <div className={styles.titleRow}>
            <span className={styles.title}>{saveTitle(save)}</span>
            {save.autosave && <Badge tone="neutral">Autosave</Badge>}
            {!current && (
              <Badge tone="neutral" appearance="outline">
                Earlier game
              </Badge>
            )}
          </div>
        )}
        <div className={styles.meta}>
          {mode && <ModeBadge mode={mode} />}
          <span className={styles.clock}>{formatGameClock(save.clock.rounds)}</span>
          <span className={styles.sep} aria-hidden="true">
            ·
          </span>
          <time dateTime={save.created_at}>{whenText(save.created_at)}</time>
          {author && <span>by {author}</span>}
        </div>
      </div>
      <div className={styles.actions}>
        {referee && (
          <Button
            size="sm"
            variant="secondary"
            icon="undo"
            aria-label={`Restore ${saveTitle(save)}`}
            onClick={() => onRestore(save)}
          >
            Restore
          </Button>
        )}
        {menu.length > 0 && (
          <DropdownMenu
            align="end"
            items={menu}
            trigger={
              <IconButton
                icon="more"
                label={`More actions for ${saveTitle(save)}`}
                size="sm"
                variant="ghost"
              />
            }
          />
        )}
      </div>
    </li>
  );
}

/**
 * The table's saves, newest first, as a timeline. Any member can make a named save, and rename or delete the
 * saves they made. A referee can restore, export, rename, and delete any save. The shell opens it from the
 * table menu.
 */
export function SavesDialog({ open, onOpenChange }: SavesDialogProps) {
  const tableId = useTableId();
  const game = useGame();
  const referee = useIsReferee();
  const me = useTableUser();
  const members = useMembers();
  const settings = useTableSettings();
  const setSettingsOpen = useTableUi((s) => s.setSettingsOpen);
  const { saves, error, reload, setSaves } = useSaves(open);
  const { run, pending } = useApiAction();
  const [label, setLabel] = useState('');
  const [labelError, setLabelError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<SaveEntry | null>(null);
  const [saveFirst, setSaveFirst] = useState(true);
  const [deleting, setDeleting] = useState<SaveEntry | null>(null);
  const [filter, setFilter] = useState<'all' | 'named'>('all');

  const names = useMemo(() => new Map(members.map((m) => [m.user_id, m.name])), [members]);
  const shown = (saves ?? []).filter((s) => filter === 'all' || !s.autosave);
  const autosaveCount = (saves ?? []).filter((s) => s.autosave).length;

  const create = async (event: FormEvent) => {
    event.preventDefault();
    const text = label.trim();
    const problem = text === '' ? null : displayStringProblem(text, LIMITS.saveLabel);
    if (problem) return setLabelError(problem);
    setLabelError(null);
    const result = await run(() => getApi().createSave(tableId, text === '' ? undefined : text), {
      success: 'Game saved',
      errorTitle: "Couldn't save the game",
    });
    if (result.ok) {
      setLabel('');
      setSaves((list) =>
        list ? [result.value, ...list.filter((s) => s.id !== result.value.id)] : [result.value],
      );
    }
  };

  const restore = async () => {
    const save = restoring;
    if (!save) return;
    if (saveFirst && game && !game.ended) {
      const before = await run(
        () => getApi().createSave(tableId, `Before restoring ${saveTitle(save)}`.slice(0, LIMITS.saveLabel)),
        {
          errorTitle: "Couldn't save the current game first",
        },
      );
      if (!before.ok) return;
    }
    const result = await run(() => getApi().restoreSave(tableId, save.id), {
      errorTitle: "Couldn't restore the save",
    });
    if (result.ok) {
      setRestoring(null);
      onOpenChange(false);
    }
  };

  const remove = async () => {
    const save = deleting;
    if (!save) return;
    const result = await run(() => getApi().deleteSave(tableId, save.id), {
      success: 'Save deleted',
      errorTitle: "Couldn't delete the save",
    });
    if (result.ok) {
      setDeleting(null);
      setSaves((list) => list?.filter((s) => s.id !== save.id) ?? list);
    }
  };

  const autosaveOn = settings?.autosave ?? true;

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={onOpenChange}
        title={game ? 'Saves' : 'Continue from a save'}
        description={
          game
            ? 'Saved snapshots for this table, newest first.'
            : 'Saved snapshots for this table, newest first. Restore a save to continue from that moment.'
        }
        size="lg"
      >
        <div className={styles.dialog}>
          {/* In the lobby no game is running, so there is nothing to save. */}
          {game && (
            <form className={styles.create} onSubmit={create}>
              <Field
                label="Save label"
                hint="Optional. Add a label to find this save later."
                error={labelError ?? undefined}
              >
                <TextInput
                  value={label}
                  maxLength={LIMITS.saveLabel}
                  placeholder="Before the bell pit"
                  onChange={(e) => setLabel(e.target.value)}
                />
              </Field>
              <Button
                type="submit"
                variant="primary"
                icon="save"
                loading={pending && restoring === null && deleting === null}
              >
                Save game
              </Button>
            </form>
          )}

          <div className={styles.autosave}>
            <Icon name="clock" size={14} className={styles.autosaveIcon} />
            <p className={styles.autosaveText}>
              {autosaveOn
                ? 'Autosave is on and keeps the 10 newest milestones: entering a dungeon, changing levels, meeting monsters while exploring, or returning to town.'
                : 'Autosave is off. Only manual saves are kept.'}
              {referee && !game && ' Change this under “Save automatically” in table settings.'}
            </p>
            {/* The table settings dialog belongs to the play screen. In the lobby, the table settings card has the switch. */}
            {referee && game && (
              <Button
                size="sm"
                variant="ghost"
                tooltip={
                  autosaveOn
                    ? 'Open table settings to change autosave'
                    : 'Open table settings to turn on autosave'
                }
                onClick={() => setSettingsOpen(true)}
              >
                {autosaveOn ? 'Settings' : 'Autosave settings'}
              </Button>
            )}
          </div>

          {error && (
            <Banner
              tone="danger"
              actions={
                <Button size="sm" variant="secondary" onClick={reload}>
                  Try again
                </Button>
              }
            >
              {error}
            </Banner>
          )}

          {saves === null && !error ? (
            <Skeleton lines={5} />
          ) : saves && saves.length === 0 ? (
            <EmptyState
              icon="save"
              size="compact"
              title="No saves yet"
              description={
                game
                  ? 'Create a save above, or keep playing if autosave is on.'
                  : 'Start a game to create manual or automatic saves.'
              }
            />
          ) : (
            saves && (
              <>
                <div className={styles.listHead}>
                  <span className={styles.count}>{saveCountText(saves.length, autosaveCount)}</span>
                  {autosaveCount > 0 && (
                    <Checkbox
                      label="Hide autosaves"
                      checked={filter === 'named'}
                      onCheckedChange={(checked) => setFilter(checked ? 'named' : 'all')}
                    />
                  )}
                </div>
                <ol className={styles.timeline} aria-label="Saved games">
                  {shown.map((save) => (
                    <SaveRow
                      key={save.id}
                      save={save}
                      current={game === null || save.session_id === game.session_id}
                      canManage={referee || save.created_by === me?.id}
                      referee={referee}
                      author={save.created_by ? (names.get(save.created_by) ?? null) : null}
                      onRestore={setRestoring}
                      onDelete={setDeleting}
                      onChanged={(next) =>
                        setSaves((list) => list?.map((s) => (s.id === next.id ? next : s)) ?? list)
                      }
                    />
                  ))}
                </ol>
              </>
            )
          )}
        </div>
      </Dialog>

      <ConfirmDialog
        open={restoring !== null}
        onOpenChange={(next) => !next && setRestoring(null)}
        title={restoring ? `Restore “${saveTitle(restoring)}”?` : 'Restore the save?'}
        description={
          game
            ? `Play continues from this save${
                restoring ? ` (${formatGameClock(restoring.clock.rounds)})` : ''
              }. Everyone stays in their current character seats, and you can still return to any earlier save.`
            : `Play continues from this save${
                restoring ? ` (${formatGameClock(restoring.clock.rounds)})` : ''
              } with the saved party rather than the lobby roster. Players keep their saved characters, while the referee controls any character whose player has left.`
        }
        confirmLabel="Restore"
        onConfirm={restore}
      >
        {game && !game.ended && (
          <Checkbox
            label="Save current game first"
            description="Creates a save of this moment before restoring."
            checked={saveFirst}
            onCheckedChange={setSaveFirst}
          />
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(next) => !next && setDeleting(null)}
        title={deleting ? `Delete “${saveTitle(deleting)}”?` : 'Delete the save?'}
        description="This permanently deletes the save without affecting your current game."
        confirmLabel="Delete"
        tone="danger"
        onConfirm={remove}
      />
    </>
  );
}
