import type { AdventureListing, AdventureValidation } from '@bxvtt/shared/protocol';
import { LIMITS } from '@bxvtt/shared/protocol';
import { useRef, useState, type ChangeEvent } from 'react';
import { describeProblem, getApi, useApiAction } from '@/app';
import { Badge, Banner, Button, ConfirmDialog, EmptyState, IconButton, Skeleton, cx } from '@/ui';
import styles from './lobby.module.css';

/** "For 3 to 6 characters of level 1", from an adventure's party recommendation. */
export function partyRecommendation(info: AdventureListing['info']): string | null {
  const party = info.party;
  if (party === null) return null;
  const levels =
    party.min_level === party.max_level
      ? `level ${party.min_level}`
      : `levels ${party.min_level} to ${party.max_level}`;
  const min = party.min_size ?? null;
  const max = party.max_size ?? null;
  let size = 'characters';
  if (min !== null && max !== null) size = min === max ? `${min} characters` : `${min} to ${max} characters`;
  else if (min !== null) size = `${min} or more characters`;
  else if (max !== null) size = `up to ${max} characters`;
  return `For ${size} of ${levels}`;
}

const SOURCE_LABEL: Record<AdventureListing['source'], string> = {
  builtin: 'Built-in',
  sample: 'Sample',
  uploaded: 'Uploaded',
};

type UploadState =
  | { kind: 'idle' }
  | { kind: 'checking'; fileName: string }
  | { kind: 'invalid'; fileName: string; title: string; detail: string }
  | {
      kind: 'valid';
      fileName: string;
      document: { kind: string } & Record<string, unknown>;
      info: Extract<AdventureValidation, { valid: true }>['adventure'];
    };

export interface AdventurePickerProps {
  tableId: string;
  adventures: AdventureListing[] | null;
  error: string | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Reloads the list, after an upload or a delete. */
  onChanged: () => Promise<void>;
}

/**
 * The referee's adventure picker: the adventures that come with bxapi, the samples, and the table's uploads,
 * each with its description, hooks, and party recommendation, and an upload that checks a document first.
 */
export function AdventurePicker({
  tableId,
  adventures,
  error,
  selectedId,
  onSelect,
  onChanged,
}: AdventurePickerProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [upload, setUpload] = useState<UploadState>({ kind: 'idle' });
  const [toDelete, setToDelete] = useState<AdventureListing | null>(null);
  const { run, pending } = useApiAction();

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file === undefined) return;
    const fileName = file.name;
    if (file.size > LIMITS.adventureBodyBytes) {
      setUpload({
        kind: 'invalid',
        fileName,
        title: 'That file is too large',
        detail: 'Adventure files can be up to 8 MB.',
      });
      return;
    }
    setUpload({ kind: 'checking', fileName });
    let document: unknown;
    try {
      document = JSON.parse(await file.text());
    } catch {
      setUpload({
        kind: 'invalid',
        fileName,
        title: "That file isn't valid JSON",
        detail: 'Choose an adventure JSON file exported from osr-editor or osr-forge.',
      });
      return;
    }
    if (
      typeof document !== 'object' ||
      document === null ||
      typeof (document as { kind?: unknown }).kind !== 'string'
    ) {
      setUpload({
        kind: 'invalid',
        fileName,
        title: "That file isn't an adventure document",
        detail: 'Choose an adventure JSON file exported from osr-editor or osr-forge.',
      });
      return;
    }
    const adventure = document as { kind: string } & Record<string, unknown>;
    try {
      const verdict = await getApi().validateAdventure(tableId, adventure);
      if (verdict.valid) setUpload({ kind: 'valid', fileName, document: adventure, info: verdict.adventure });
      else
        setUpload({
          kind: 'invalid',
          fileName,
          title: 'This adventure has validation errors',
          detail: verdict.detail,
        });
    } catch (problem) {
      const message = describeProblem(problem);
      setUpload({ kind: 'invalid', fileName, title: message.title, detail: message.detail });
    }
  };

  const confirmUpload = async () => {
    if (upload.kind !== 'valid') return;
    const result = await run(() => getApi().uploadAdventure(tableId, upload.document), {
      success: `${upload.info.name} is ready to play`,
      errorTitle: "Couldn't upload the adventure",
    });
    if (result.ok) {
      setUpload({ kind: 'idle' });
      await onChanged();
      onSelect(result.value.id);
    }
  };

  const remove = async () => {
    if (toDelete === null) return;
    const result = await run(() => getApi().deleteAdventure(tableId, toDelete.id), {
      success: `${toDelete.info.name} was deleted`,
      errorTitle: "Couldn't delete the adventure",
    });
    if (result.ok) await onChanged();
  };

  return (
    <div className={styles.adventures}>
      {error !== null && (
        <Banner tone="warning" title="Couldn't load the adventures">
          {error}
        </Banner>
      )}
      {adventures === null && error === null && (
        <div className={styles.adventureList}>
          <Skeleton shape="block" height={96} />
          <Skeleton shape="block" height={96} />
        </div>
      )}
      {adventures !== null && adventures.length === 0 && (
        <EmptyState
          icon="map"
          size="compact"
          title="No adventures"
          description="Upload an adventure document to play."
        />
      )}
      {adventures !== null && adventures.length > 0 && (
        <div className={styles.adventureList} role="radiogroup" aria-label="Adventure">
          {adventures.map((adventure) => {
            const selected = adventure.id === selectedId;
            const recommendation = partyRecommendation(adventure.info);
            return (
              <div key={adventure.id} className={cx(styles.adventure, selected && styles.adventureSelected)}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={styles.adventureButton}
                  onClick={() => onSelect(adventure.id)}
                >
                  <span className={styles.radioDot} aria-hidden="true" />
                  <span className={styles.adventureBody}>
                    <span className={styles.adventureHead}>
                      <span className={styles.adventureName}>{adventure.info.name}</span>
                      <Badge tone={adventure.source === 'uploaded' ? 'info' : 'neutral'}>
                        {SOURCE_LABEL[adventure.source]}
                      </Badge>
                    </span>
                    {recommendation && <span className={styles.adventureMeta}>{recommendation}</span>}
                    {adventure.info.description && (
                      <span className={cx(styles.adventureDescription, !selected && styles.clamp)}>
                        {adventure.info.description}
                      </span>
                    )}
                    {selected && adventure.info.hooks.length > 0 && (
                      <span className={styles.hooks}>
                        <span className={styles.hooksTitle}>Hooks</span>
                        <span className={styles.hookList}>
                          {adventure.info.hooks.map((hook) => (
                            <span key={hook} className={styles.hook}>
                              {hook}
                            </span>
                          ))}
                        </span>
                      </span>
                    )}
                  </span>
                </button>
                {adventure.source === 'uploaded' && (
                  <IconButton
                    icon="trash"
                    label={`Delete ${adventure.info.name}`}
                    variant="ghost"
                    size="sm"
                    className={styles.adventureDelete}
                    onClick={() => setToDelete(adventure)}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        className="visually-hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => void onFile(event)}
      />
      {upload.kind === 'invalid' && (
        <Banner tone="warning" title={upload.title} onDismiss={() => setUpload({ kind: 'idle' })}>
          {upload.fileName}: {upload.detail}
        </Banner>
      )}
      {upload.kind === 'valid' && (
        <Banner
          tone="success"
          title={`${upload.info.name} is a valid adventure`}
          actions={
            <>
              <Button size="sm" variant="ghost" onClick={() => setUpload({ kind: 'idle' })}>
                Cancel
              </Button>
              <Button
                size="sm"
                variant="secondary"
                icon="upload"
                loading={pending}
                onClick={() => void confirmUpload()}
              >
                Upload
              </Button>
            </>
          }
        >
          {partyRecommendation(upload.info) ?? 'No party size or level recommendation.'} Upload it to add it
          to this table.
        </Banner>
      )}
      <div className={styles.uploadRow}>
        <Button
          variant="ghost"
          icon="upload"
          loading={upload.kind === 'checking'}
          onClick={() => fileInput.current?.click()}
        >
          Upload an adventure
        </Button>
        <span className={styles.note}>Upload a JSON file from osr-editor or osr-forge (up to 8 MB).</span>
      </div>

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => {
          if (!open) setToDelete(null);
        }}
        title={`Delete ${toDelete?.info.name ?? 'this adventure'}?`}
        description="This removes the adventure from your table's list. Existing saves from this adventure remain available."
        confirmLabel="Delete adventure"
        tone="danger"
        onConfirm={remove}
      />
    </div>
  );
}
