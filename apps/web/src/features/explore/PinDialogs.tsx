/**
 * The dialogs for map pins: one to write a new pin's note, and one to read a pin and remove it.
 */
import type { PinAnnotation } from '@bxvtt/shared/protocol';
import { LIMITS } from '@bxvtt/shared/protocol';
import { useState } from 'react';
import { useMember } from '@/app';
import { Button, Checkbox, Dialog, Field, Textarea } from '@/ui';
import styles from './explore.module.css';

export interface NewPinDialogProps {
  open: boolean;
  /** Whether to offer a pin that only referees see. */
  referee: boolean;
  onCancel: () => void;
  onSave: (text: string, refereesOnly: boolean) => Promise<boolean>;
}

/** Writes the note of a new pin. */
export function NewPinDialog({ open, referee, onCancel, onSave }: NewPinDialogProps) {
  const [text, setText] = useState('');
  const [refereesOnly, setRefereesOnly] = useState(false);
  const [saving, setSaving] = useState(false);
  const tooLong = text.length > LIMITS.pinText;

  const close = () => {
    setText('');
    setRefereesOnly(false);
    onCancel();
  };

  const save = async () => {
    if (tooLong || saving) return;
    setSaving(true);
    const ok = await onSave(text, refereesOnly);
    setSaving(false);
    if (ok) {
      setText('');
      setRefereesOnly(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
      title="Add a pin"
      description="Everyone at the table sees the pin and its note on this level."
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" loading={saving} disabled={tooLong} onClick={() => void save()}>
            Add the pin
          </Button>
        </>
      }
    >
      <form
        className={styles.dialogForm}
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <Field
          label="Note"
          hint="Optional. Hover over the pin to read it."
          error={tooLong ? `Keep the note to ${LIMITS.pinText} characters.` : undefined}
          aside={`${text.length} of ${LIMITS.pinText}`}
        >
          <Textarea
            value={text}
            rows={3}
            autoFocus
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                void save();
              }
            }}
          />
        </Field>
        {referee && (
          <Checkbox
            label="Only referees see this pin"
            description="Players never receive it."
            checked={refereesOnly}
            onCheckedChange={setRefereesOnly}
          />
        )}
      </form>
    </Dialog>
  );
}

export interface PinDetailDialogProps {
  pin: PinAnnotation | null;
  /** The pin's number on the map. */
  label: string;
  mayRemove: boolean;
  onClose: () => void;
  onRemove: (id: string) => Promise<boolean>;
}

/** Shows a pin's note and who placed it, with a button to remove it. */
export function PinDetailDialog({ pin, label, mayRemove, onClose, onRemove }: PinDetailDialogProps) {
  const author = useMember(pin?.author_id);
  const [removing, setRemoving] = useState(false);
  return (
    <Dialog
      open={pin !== null}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={`Pin ${label}`}
      description={author ? `Placed by ${author.name}.` : undefined}
      size="sm"
      footer={
        <>
          {mayRemove && pin && (
            <Button
              variant="danger"
              icon="trash"
              loading={removing}
              onClick={async () => {
                setRemoving(true);
                const ok = await onRemove(pin.id);
                setRemoving(false);
                if (ok) onClose();
              }}
            >
              Remove the pin
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </>
      }
    >
      <p className={styles.pinNote}>{pin?.text ? pin.text : 'This pin has no note.'}</p>
      {pin?.visibility === 'referees' && <p className={styles.pinMeta}>Only referees see this pin.</p>}
    </Dialog>
  );
}
