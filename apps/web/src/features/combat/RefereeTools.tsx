import type { EncounterView } from '@bxvtt/shared/bxapi';
import { conditionLabel, formatFeet, isProperLabel, joinList } from '@bxvtt/shared/text';
import { useMemo, useState } from 'react';
import { useCanSend, useEncounter, useMonsterCatalog, useRefereeState, useSendRefereeCommand } from '@/app';
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
import { liveGroups } from './model';
import { groupHeading, theGroup, viewLabels } from './names';
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
    <div className={styles.roster} aria-label="Referee monster roster">
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
              <span className={styles.rosterName}>
                {groupHeading({ label: group.label, plural: group.label_plural, count: monsters.length })}
              </span>
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
                      {monsterTitle(group.label, index, monsters.length)}
                    </span>
                    <HpBar
                      size="sm"
                      current={Math.max(0, monster.current_hp)}
                      max={monster.max_hp}
                      label={`${monsterTitle(group.label, index, monsters.length)} hit points`}
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

/** One monster of a group for the referee: "Goblin 2", or "Mag Corrie" for a named individual alone. */
function monsterTitle(label: string, index: number, count: number): string {
  if (isProperLabel(label) && count <= 1) return label;
  return `${capitalize(label)} ${index + 1}`;
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
  const encounter = useEncounter();
  if (referee === null) return null;
  const present = liveGroups(encounter);
  const sides = present.length > 0 ? joinList(present.map((g) => theGroup(viewLabels(g)))) : 'the monsters';
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
        End in parley
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={!canEnd.allowed}
        title={canEnd.reason ?? undefined}
        onClick={() => setEnding('departed')}
      >
        End as departed
      </Button>
      <SpawnMonsters disabled={!canSpawn.allowed} reason={canSpawn.reason} />
      <ConfirmDialog
        open={ending !== null}
        onOpenChange={(open) => {
          if (!open) setEnding(null);
        }}
        title={ending === 'parley' ? `End encounter in parley with ${sides}?` : 'End encounter as departed?'}
        description={`${
          ending === 'parley'
            ? 'The encounter ends peacefully, such as after paying a toll or striking a bargain.'
            : 'The encounter ends because one side walked away or broke off the chase.'
        } Monsters already slain, fled, or turned still count as defeated, while monsters left standing award no experience.`}
        confirmLabel="End encounter"
        onConfirm={end}
      >
        {fromArea && (
          <Checkbox
            label="Mark area encounter resolved"
            description="These monsters won't appear again when the party returns."
            checked={resolveArea}
            onCheckedChange={setResolveArea}
          />
        )}
      </ConfirmDialog>
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
      title="Add monsters"
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
            placeholder={catalog.loading ? 'Loading monsters…' : 'Search monsters'}
          />
        </Field>
        <div className={styles.popoverRow}>
          <Field label="Count">
            <NumberInput value={count} onChange={setCount} min={1} max={50} />
          </Field>
          <Field label="Distance in feet">
            <NumberInput value={distance} onChange={setDistance} min={0} max={500} step={10} width={4} />
          </Field>
        </div>
        <p className={styles.choiceHint}>
          New monsters join as a separate group and act starting next round.
        </p>
        <Button
          variant="primary"
          size="sm"
          loading={pending}
          disabled={templateId === null || count === null || distance === null}
          onClick={() => void spawn()}
        >
          Add monsters
        </Button>
      </div>
    </Popover>
  );
}
