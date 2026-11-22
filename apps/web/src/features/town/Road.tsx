/** Leaving town: the dungeons the party can set out for, and the dialog that confirms the trip. */
import { useState } from 'react';
import { useParty, useSendCommand } from '@/app';
import { Banner, Button, Dialog, EmptyState, Icon, RadioGroup, Skeleton } from '@/ui';
import { gaps, readinessChecklist } from './checklist';
import { useDungeons, useLeaveAccess, useTownServices, type Dungeon } from './hooks';
import { useTownUi } from './townUi';
import styles from './Road.module.css';

/** The card on the town square: where the party can go, and who may lead it there. */
export function RoadPanel() {
  const { dungeons, failed, retry } = useDungeons();
  const access = useLeaveAccess();
  const services = useTownServices();
  const setLeaveOpen = useTownUi((s) => s.setLeaveOpen);
  return (
    <section className={styles.road} aria-labelledby="road-title">
      <div className={styles.roadHead}>
        <span className={styles.roadIcon}>
          <Icon name="footprints" size={20} />
        </span>
        <h2 id="road-title" className={styles.roadTitle}>
          The road out of town
        </h2>
      </div>
      {dungeons === null && !failed && <Skeleton lines={2} />}
      {failed && (
        <Banner
          tone="warning"
          title="The road list didn't load"
          actions={
            <Button size="sm" variant="secondary" onClick={retry}>
              Try again
            </Button>
          }
        >
          The table couldn't read where the party can go.
        </Banner>
      )}
      {dungeons !== null && dungeons.length === 0 && (
        <EmptyState
          size="compact"
          icon="map"
          title="No road leads out"
          description="The adventure lists no dungeon."
        />
      )}
      {dungeons !== null && dungeons.length > 0 && (
        <ul className={styles.destinations}>
          {dungeons.map((dungeon) => (
            <li key={dungeon.id} className={styles.destination}>
              <span className={styles.destinationName}>{dungeon.name || 'The dungeon'}</span>
              <Button
                variant="secondary"
                icon="door"
                disabled={!access.allowed || !services.leave}
                onClick={() => setLeaveOpen(true)}
              >
                Set out
              </Button>
            </li>
          ))}
        </ul>
      )}
      {!access.allowed && <p className={styles.explain}>{access.explanation}</p>}
    </section>
  );
}

/**
 * The dialog that confirms leaving. It lists the checklist's gaps as advice and names the dungeon, then sends
 * `enter_dungeon`. A refusal appears inside the dialog.
 */
export function LeaveDialog() {
  const open = useTownUi((s) => s.leaveOpen);
  const setOpen = useTownUi((s) => s.setLeaveOpen);
  const setSection = useTownUi((s) => s.setSection);
  const { dungeons } = useDungeons();
  const access = useLeaveAccess();
  const party = useParty();
  const { send, pending } = useSendCommand();
  const [choice, setChoice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const list: Dungeon[] = dungeons ?? [];
  const chosen = list.find((dungeon) => dungeon.id === choice) ?? list[0] ?? null;
  const missing = gaps(readinessChecklist(party));

  const close = (next: boolean) => {
    setOpen(next);
    if (!next) setError(null);
  };

  const go = async () => {
    if (chosen === null) return;
    setError(null);
    const result = await send(
      { command_type: 'enter_dungeon', dungeon_id: chosen.id },
      { display: 'inline' },
    );
    if (result.status === 'accepted') close(false);
    else if (result.status === 'refused' || result.status === 'error') setError(result.message);
    else if (result.status === 'skipped') setError(result.message);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={close}
      title={chosen ? `Set out for ${chosen.name || 'the dungeon'}?` : 'Set out?'}
      description="The party leaves town together and arrives at the entrance."
      footer={
        <>
          <Button variant="secondary" onClick={() => close(false)}>
            Stay in town
          </Button>
          <Button
            variant="primary"
            icon="door"
            loading={pending}
            disabled={chosen === null || !access.allowed}
            onClick={go}
          >
            Set out
          </Button>
        </>
      }
    >
      <div className={styles.dialogBody}>
        {list.length > 1 && (
          <RadioGroup
            aria-label="Dungeon"
            value={chosen?.id ?? ''}
            onValueChange={setChoice}
            options={list.map((dungeon) => ({ value: dungeon.id, label: dungeon.name || 'The dungeon' }))}
          />
        )}
        {missing.length > 0 ? (
          <div className={styles.gaps}>
            <p className={styles.gapsTitle}>Before you go, the party might want:</p>
            <ul className={styles.gapList}>
              {missing.map((line) => (
                <li key={line.key}>{line.title}</li>
              ))}
            </ul>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSection('outfitter');
                close(false);
              }}
            >
              Back to the outfitter
            </Button>
          </div>
        ) : (
          <p className={styles.ready}>The party carries a light, a tinder box, rations, and rope.</p>
        )}
        {!access.allowed && <Banner tone="info">{access.explanation}</Banner>}
        {error !== null && (
          <Banner tone="warning" title="The party can't set out">
            {error}
          </Banner>
        )}
      </div>
    </Dialog>
  );
}
