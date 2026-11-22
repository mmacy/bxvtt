/**
 * The pins of the level the map shows, as a list that keyboard and screen reader users can reach: each pin's
 * number, note, and author, with buttons to show it on the map or open it, and a button to pin the party's
 * square. The canvas draws the same pins.
 */
import type { PinAnnotation } from '@bxvtt/shared/protocol';
import { useId, useRef, useState } from 'react';
import { useMembers } from '@/app';
import type { MapPin } from '@/map';
import { Badge, Button } from '@/ui';
import styles from './explore.module.css';

export interface PinsPanelProps {
  pins: readonly MapPin[];
  records: ReadonlyMap<string, PinAnnotation>;
  /** Whether the party stands on the level shown, so a pin can go on its square. */
  partyHere: boolean;
  onShow: (pin: MapPin) => void;
  onOpen: (pin: MapPin) => void;
  onAddAtParty: () => void;
}

export function PinsPanel({ pins, records, partyHere, onShow, onOpen, onAddAtParty }: PinsPanelProps) {
  const [open, setOpen] = useState(false);
  const members = useMembers();
  const panelId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const authorName = (pin: MapPin) => {
    const record = records.get(pin.id);
    return members.find((member) => member.user_id === record?.author_id)?.name ?? 'Someone';
  };
  // Each action closes the list first. A disclosure moves no focus by itself, so the dialog an action opens, or
  // the map, keeps the focus it takes.
  const act = (action: () => void) => {
    setOpen(false);
    action();
  };
  return (
    <div className={styles.pinsRoot}>
      <Button
        ref={toggleRef}
        size="sm"
        variant="ghost"
        icon="flag"
        iconEnd={open ? 'chevron-up' : 'chevron-down'}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={pins.length === 1 ? 'Pins: 1 on this level' : `Pins: ${pins.length} on this level`}
        onClick={() => setOpen(!open)}
      >
        {pins.length > 0 ? `Pins ${pins.length}` : 'Pins'}
      </Button>
      {open && (
        <section
          id={panelId}
          className={styles.pinsPanel}
          aria-label="Pins on this level"
          onKeyDown={(event) => {
            if (event.key !== 'Escape') return;
            event.stopPropagation();
            setOpen(false);
            toggleRef.current?.focus();
          }}
        >
          <h2 className={styles.pinsTitle}>Pins on this level</h2>
          {pins.length === 0 ? (
            <p className={styles.formHint}>No pins on this level yet.</p>
          ) : (
            <ul className={styles.pinsList} aria-label="Pins on this level">
              {pins.map((pin) => (
                <li key={pin.id} className={styles.pinsItem}>
                  <span className={styles.pinsLabel} aria-hidden="true">
                    {pin.label}
                  </span>
                  <div className={styles.pinsText}>
                    <span className={styles.pinsNote}>{pin.note ?? 'No note'}</span>
                    <span className={styles.pinsMeta}>
                      Pin {pin.label}, placed by {authorName(pin)}
                      {pin.refereeOnly && (
                        <>
                          {' '}
                          <Badge tone="referee">Referees only</Badge>
                        </>
                      )}
                    </span>
                  </div>
                  <div className={styles.pinsActions}>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Show pin ${pin.label} on the map`}
                      onClick={() => act(() => onShow(pin))}
                    >
                      Show
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Open pin ${pin.label}`}
                      onClick={() => act(() => onOpen(pin))}
                    >
                      Open
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <Button
            size="sm"
            variant="secondary"
            icon="plus"
            disabled={!partyHere}
            title={partyHere ? undefined : 'The party isn’t on this level.'}
            onClick={() => act(onAddAtParty)}
          >
            Add a pin where the party stands
          </Button>
        </section>
      )}
    </div>
  );
}
