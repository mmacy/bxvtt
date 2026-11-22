import type { EncounterView } from '@bxvtt/shared/bxapi';
import { conditionLabel, formatFeet } from '@bxvtt/shared/text';
import { useMemo, useState } from 'react';
import { useCanSend, useMonsterCatalog, useRefereeState, useSendRefereeCommand } from '@/app';
import {
  Badge,
  Button,
  Checkbox,
  Combobox,
  ConditionChip,
  ConfirmDialog,
  Field,
  HpBar,
  NumberInput,
  Popover,
} from '@/ui';
import styles from './combat.module.css';

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Each monster of each group with its hit points and conditions, from the referee state. It renders nothing for a
 * player or a referee with the lens off, because `useRefereeState` returns `null` for them.
 */
export function MonsterRoster({ encounter }: { encounter: EncounterView | null }) {
  const referee = useRefereeState();
  if (referee === null || referee.encounter === null || referee.encounter === undefined) return null;
  const groups = referee.encounter.groups;
  const morale = asRecord(asRecord(referee.battle)?.morale);
  const passed = asRecord(morale?.passed) ?? {};
  return (
    <div className={styles.roster} aria-label="Monsters, as the referee sees them">
      {groups.map((group) => {
        const view = encounter?.groups.find((g) => g.id === group.id);
        const monsters = group.monster_ids
          .map((id, index) => ({ index, monster: referee.monsters.find((m) => m.id === id) }))
          .filter((m) => m.monster !== undefined);
        const status = group.fled ? 'Fled' : group.fleeing ? 'Fleeing' : null;
        const moraleCount = typeof passed[group.id] === 'number' ? (passed[group.id] as number) : null;
        return (
          <div key={group.id} className={styles.rosterGroup}>
            <div className={styles.rosterHead}>
              <span className={styles.rosterName}>{capitalize(group.label_plural)}</span>
              <span className={styles.rosterMeta}>
                {formatFeet(view?.distance_feet ?? group.distance_feet, 'short')}
              </span>
              {status && <Badge tone="warning">{status}</Badge>}
              {moraleCount !== null && (
                <span className={styles.rosterMeta}>
                  Morale held {moraleCount} {moraleCount === 1 ? 'time' : 'times'}
                </span>
              )}
            </div>
            <ul className={styles.rosterList}>
              {monsters.map(({ index, monster }) =>
                monster ? (
                  <li
                    key={monster.id}
                    className={styles.rosterRow}
                    data-dead={monster.current_hp <= 0 || undefined}
                  >
                    <span className={styles.rosterMonster}>
                      {capitalize(group.label)} {index + 1}
                    </span>
                    <HpBar
                      size="sm"
                      current={Math.max(0, monster.current_hp)}
                      max={monster.max_hp}
                      label={`${capitalize(group.label)} ${index + 1} hit points`}
                    />
                    <span className={styles.rosterConditions}>
                      {monster.conditions.map(({ condition }) => (
                        <ConditionChip
                          key={condition}
                          label={conditionLabel(condition)}
                          tone={condition === 'dead' ? 'harm' : 'magic'}
                        />
                      ))}
                    </span>
                  </li>
                ) : null,
              )}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * The referee's actions that belong in a fight: close the encounter with the outcome that fits, and bring more
 * monsters into it.
 */
export function RefereeActions() {
  const referee = useRefereeState();
  const canEnd = useCanSend('end_encounter');
  const canSpawn = useCanSend('spawn_monsters');
  const { send, pending } = useSendRefereeCommand();
  const [ending, setEnding] = useState<'parley' | 'departed' | null>(null);
  const [resolveArea, setResolveArea] = useState(false);
  if (referee === null) return null;
  const fromArea = referee.encounter?.area_ref !== null && referee.encounter?.area_ref !== undefined;
  const end = async () => {
    if (ending === null) return;
    await send({ command_type: 'end_encounter', outcome: ending, resolve_area: resolveArea });
    setEnding(null);
  };
  return (
    <div className={styles.refereeActions}>
      <Badge tone="referee" icon="referee">
        Referee
      </Badge>
      <Button
        size="sm"
        variant="ghost"
        disabled={!canEnd.allowed}
        title={canEnd.reason ?? undefined}
        onClick={() => setEnding('parley')}
      >
        They came to terms
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={!canEnd.allowed}
        title={canEnd.reason ?? undefined}
        onClick={() => setEnding('departed')}
      >
        One side left
      </Button>
      <SpawnMonsters disabled={!canSpawn.allowed} reason={canSpawn.reason} />
      <ConfirmDialog
        open={ending !== null}
        onOpenChange={(open) => {
          if (!open) setEnding(null);
        }}
        title={ending === 'parley' ? 'The monsters and the party came to terms' : 'One side left the other'}
        description={
          <>
            <p>
              {ending === 'parley'
                ? 'The encounter ends peacefully, as after a toll paid or a bluff believed.'
                : 'The encounter ends because the party walked away or the monsters let it go.'}{' '}
              Monsters already slain, fled, or turned count as defeated. Monsters still standing give no
              experience.
            </p>
            {fromArea && (
              <Checkbox
                label="Keep this area's monsters peaceful"
                description="They won't appear again when the party walks back in."
                checked={resolveArea}
                onCheckedChange={setResolveArea}
              />
            )}
          </>
        }
        confirmLabel="End the encounter"
        onConfirm={end}
      />
      {pending && <span className="visually-hidden">Sending</span>}
    </div>
  );
}

function SpawnMonsters({ disabled, reason }: { disabled: boolean; reason: string | null }) {
  const catalog = useMonsterCatalog();
  const { send, pending } = useSendRefereeCommand();
  const [open, setOpen] = useState(false);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [count, setCount] = useState<number | null>(2);
  const [distance, setDistance] = useState<number | null>(40);
  const options = useMemo(
    () => (catalog.data ?? []).map((m) => ({ value: m.id, label: m.name, keywords: [m.id] })),
    [catalog.data],
  );
  const spawn = async () => {
    if (templateId === null || count === null || distance === null) return;
    const result = await send({
      command_type: 'spawn_monsters',
      template_id: templateId,
      count_fixed: count,
      distance_feet: distance,
    });
    if (result.status === 'accepted') setOpen(false);
  };
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      title="Bring in monsters"
      width="300px"
      trigger={
        <Button size="sm" variant="ghost" icon="plus" disabled={disabled} title={reason ?? undefined}>
          Add monsters
        </Button>
      }
    >
      <div className={styles.popoverForm}>
        <Field label="Monster">
          <Combobox
            options={options}
            value={templateId}
            onChange={setTemplateId}
            placeholder={catalog.loading ? 'Loading the monsters…' : 'Search the monsters'}
          />
        </Field>
        <div className={styles.popoverRow}>
          <Field label="How many">
            <NumberInput value={count} onChange={setCount} min={1} max={50} />
          </Field>
          <Field label="Distance in feet">
            <NumberInput value={distance} onChange={setDistance} min={0} max={500} step={10} width={4} />
          </Field>
        </div>
        <p className={styles.choiceHint}>They join the fight as a new group and act from the next round.</p>
        <Button
          variant="primary"
          size="sm"
          loading={pending}
          disabled={templateId === null || count === null || distance === null}
          onClick={() => void spawn()}
        >
          Add to the fight
        </Button>
      </div>
    </Popover>
  );
}
