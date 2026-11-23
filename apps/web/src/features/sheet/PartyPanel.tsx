import type { MemberView } from '@bxvtt/shared/bxapi';
import { classLabel, conditionLabel } from '@bxvtt/shared/text';
import { useId, useMemo, useState, type DragEvent, type KeyboardEvent } from 'react';
import {
  tokenClass,
  useCanSend,
  useCombatStage,
  usePartyLocation,
  useShownMode,
  useLegalCommand,
  useMembers,
  useParty,
  lightTimeLeft,
  usePartyLight,
  type MemberLight,
  usePlayerView,
  useSeats,
  useSendCommand,
  useTableUi,
  useTableUser,
} from '@/app';
import {
  AcShield,
  Avatar,
  Badge,
  Button,
  ConditionChip,
  EmptyState,
  HpBar,
  LinkButton,
  SectionLabel,
  Icon,
  IconButton,
  TokenPortrait,
  Tooltip,
  cx,
} from '@/ui';
import { effectLabel, effectRemaining } from './actions';
import { conditionTone } from './SheetSections';
import { useFullCatalog } from './catalogs';
import { classMagic, spellSlotsAt } from '../wizard/tables';
import styles from './party.module.css';

/**
 * Moves one entry of a list to another index.
 *
 * @param ids - The list.
 * @param from - The index of the entry to move.
 * @param to - The index it ends up at.
 */
export function moveTo<T>(ids: readonly T[], from: number, to: number): T[] {
  const next = [...ids];
  if (from < 0 || from >= next.length || to < 0 || to >= next.length) return next;
  const [entry] = next.splice(from, 1);
  if (entry !== undefined) next.splice(to, 0, entry);
  return next;
}

/** The party tab of the dock: every member at a glance, in marching order. Select a member to open their sheet. */
export function PartyPanel() {
  const liveParty = useParty();
  const liveView = usePlayerView();
  const playing = useCombatStage((st) => st.playing);
  const shownMode = useShownMode();
  const location = usePartyLocation();
  // While combat plays a round back, the panel keeps the state from before the round, so nobody shows dead
  // before the blow that kills them lands on the board.
  const [held, setHeld] = useState({ party: liveParty, view: liveView });
  if (!playing && (held.party !== liveParty || held.view !== liveView)) {
    setHeld({ party: liveParty, view: liveView });
  }
  // During playback, the board publishes each member's state at the beat it shows, and the panel follows it.
  const memberStates = useCombatStage((st) => st.memberStates);
  const heldParty = playing ? held.party : liveParty;
  const party = useMemo(
    () =>
      memberStates === null
        ? heldParty
        : heldParty.map((member) => {
            const state = memberStates[member.id];
            return state
              ? { ...member, current_hp: state.hp, max_hp: state.maxHp, conditions: state.conditions }
              : member;
          }),
    [heldParty, memberStates],
  );
  const view = playing ? held.view : liveView;
  const ended = shownMode === 'game_over' || shownMode === 'victory';
  const showLight = location?.kind === 'dungeon' && !ended;
  // The map's toolbar states the party's light. Each row shows the light its member carries, in a dungeon.
  const light = usePartyLight();
  const classes = useFullCatalog('classes');
  const inTown = location?.kind === 'town' && !ended;
  /** A caster whose class table gives slots at their level, with nothing memorized. */
  const unprepared = (member: MemberView) =>
    member.memorized_spells.length === 0 &&
    member.conditions.indexOf('dead') === -1 &&
    classMagic(classes.byId.get(member.class_id)) !== null &&
    spellSlotsAt(classes.byId.get(member.class_id), member.level).some((n) => n > 0);
  const seats = useSeats();
  const members = useMembers();
  const me = useTableUser();
  const openSheet = useTableUi((s) => s.openCharacterSheet);
  const reorderLegal = useLegalCommand('reorder_party');
  const reorderPermission = useCanSend('reorder_party');
  const { send, pending } = useSendCommand();
  const [editingChoice, setEditing] = useState(false);
  const [pendingOrder, setOrder] = useState<{ base: string; ids: string[] } | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState('');

  const partyKey = party.map((m) => m.id).join(' ');
  // A pending order applies only to the party it was made from, so a new game state replaces it.
  const order = pendingOrder !== null && pendingOrder.base === partyKey ? pendingOrder.ids : null;
  const canReorder = reorderLegal !== null && reorderPermission.allowed;
  const editing = editingChoice && canReorder;

  const ordered = useMemo(() => {
    if (order === null) return party;
    const byId = new Map(party.map((m) => [m.id, m]));
    return order.flatMap((id) => {
      const m = byId.get(id);
      return m ? [m] : [];
    });
  }, [party, order]);

  if (party.length === 0) {
    return (
      <div className={styles.panel}>
        <EmptyState
          icon="users"
          size="compact"
          title="No party yet"
          description="The party appears when the game starts."
        />
      </div>
    );
  }

  const commit = async (ids: string[], movedId: string, to: number) => {
    setOrder({ base: partyKey, ids });
    const name = party.find((m) => m.id === movedId)?.name ?? 'The character';
    setAnnouncement(`${name} moves to place ${to + 1} in the marching order.`);
    const result = await send({ command_type: 'reorder_party', order: ids });
    if (result.status !== 'accepted') setOrder(null);
  };

  const move = (from: number, to: number) => {
    const member = ordered[from];
    if (!member || to < 0 || to >= ordered.length || pending) return;
    void commit(
      moveTo(
        ordered.map((m) => m.id),
        from,
        to,
      ),
      member.id,
      to,
    );
  };

  const onHandleKey = (event: KeyboardEvent, index: number) => {
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      move(index, index - 1);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      move(index, index + 1);
    }
  };

  const onDragStart = (event: DragEvent, id: string) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', id);
    setDragging(id);
  };
  const onDrop = (event: DragEvent, index: number) => {
    event.preventDefault();
    const from = ordered.findIndex((m) => m.id === dragging);
    setDragging(null);
    setDropIndex(null);
    if (from !== -1 && from !== index) move(from, index);
  };

  const nameOf = (id: string) => party.find((m) => m.id === id)?.name ?? 'Someone';
  const deprived = Object.entries(view?.deprivation ?? {});

  return (
    <div className={styles.panel}>
      {(view?.fatigued || view?.exhausted || deprived.length > 0) && (
        <section className={styles.partyState} aria-label="Party conditions">
          {(view?.fatigued || view?.exhausted || deprived.length > 0) && (
            <div className={styles.stateRow}>
              {view?.exhausted ? (
                <Badge tone="danger" icon="warning">
                  Exhausted
                </Badge>
              ) : view?.fatigued ? (
                <Badge tone="warning" icon="hourglass">
                  Fatigued: rest a turn
                </Badge>
              ) : null}
              {deprived.map(([id, d]) => (
                <Badge key={id} tone="warning">
                  {nameOf(id)}: {(d.food_days ?? 0) > 0 ? `${d.food_days} days without food` : ''}
                  {(d.food_days ?? 0) > 0 && (d.water_days ?? 0) > 0 ? ', ' : ''}
                  {(d.water_days ?? 0) > 0 ? `${d.water_days} days without water` : ''}
                </Badge>
              ))}
            </div>
          )}
        </section>
      )}

      <SectionLabel
        actions={
          reorderLegal !== null ? (
            <Button
              size="sm"
              variant={editing ? 'secondary' : 'ghost'}
              icon={editing ? 'check' : 'sort'}
              disabled={!reorderPermission.allowed}
              disabledReason={reorderPermission.reason}
              onClick={() => setEditing((e) => !e)}
            >
              {editing ? 'Done' : 'Change order'}
            </Button>
          ) : undefined
        }
      >
        Marching order
      </SectionLabel>
      {editing && (
        <p className={styles.hint}>
          Drag a character, or focus a handle and press the Up or Down arrow key. The front rank leads the
          party.
        </p>
      )}

      <ol className={styles.list} aria-label="Marching order">
        {ordered.map((member, index) => {
          const seat = seats.find((s) => s.member_id === member.id);
          const owner = seat?.user_id ? members.find((m) => m.user_id === seat.user_id) : undefined;
          return (
            <li
              key={member.id}
              className={cx(
                styles.item,
                dragging === member.id && styles.dragging,
                dropIndex === index && dragging !== member.id && styles.dropTarget,
              )}
              draggable={editing}
              onDragStart={(event) => onDragStart(event, member.id)}
              onDragOver={(event) => {
                if (dragging === null) return;
                event.preventDefault();
                setDropIndex(index);
              }}
              onDragLeave={() => setDropIndex(null)}
              onDrop={(event) => onDrop(event, index)}
              onDragEnd={() => {
                setDragging(null);
                setDropIndex(null);
              }}
            >
              {editing && (
                <div className={styles.reorder}>
                  <Tooltip
                    content={`Drag ${member.name} to a new place in the marching order`}
                    describe={false}
                  >
                    <button
                      type="button"
                      className={styles.handle}
                      aria-label={`${member.name}, place ${index + 1} of ${ordered.length}. Press the up or down arrow to move.`}
                      onKeyDown={(event) => onHandleKey(event, index)}
                    >
                      <Icon name="grip" size={16} />
                    </button>
                  </Tooltip>
                  <IconButton
                    icon="arrow-up"
                    label={`Move ${member.name} forward`}
                    size="sm"
                    variant="ghost"
                    disabled={index === 0 || pending}
                    disabledReason={
                      index === 0 ? `${member.name} is already first in the marching order.` : undefined
                    }
                    onClick={() => move(index, index - 1)}
                  />
                  <IconButton
                    icon="arrow-down"
                    label={`Move ${member.name} back`}
                    size="sm"
                    variant="ghost"
                    disabled={index === ordered.length - 1 || pending}
                    disabledReason={
                      index === ordered.length - 1
                        ? `${member.name} is already last in the marching order.`
                        : undefined
                    }
                    onClick={() => move(index, index + 1)}
                  />
                </div>
              )}
              <div className={styles.rowStack}>
                <MemberRow
                  member={member}
                  rank={index + 1}
                  color={owner?.color}
                  controller={
                    owner ? { name: owner.name, label: owner.user_id === me?.id ? 'You' : owner.name } : null
                  }
                  light={showLight ? (light.lights.find((l) => l.memberId === member.id) ?? null) : null}
                  effects={(view?.effects ?? []).filter(
                    (e) => e.character_id === member.id && e.kind !== 'light',
                  )}
                  onOpen={() => openSheet(member.id)}
                />
                {inTown && unprepared(member) && (
                  <LinkButton
                    tone="quiet"
                    className={styles.spellMarker}
                    tooltip="Open the Spells tab to prepare spells"
                    onClick={() => openSheet(member.id, 'spells')}
                    aria-label={`No spells memorized for ${member.name}`}
                  >
                    <Icon name="spell" size={12} />
                    No spells memorized
                  </LinkButton>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      <div className="visually-hidden" aria-live="polite">
        {announcement}
      </div>
    </div>
  );
}

interface MemberRowProps {
  member: MemberView;
  rank: number;
  color: string | undefined;
  controller: { name: string; label: string } | null;
  /** The light the member carries, when one burns. */
  light: MemberLight | null;
  effects: Array<{ kind: string; remaining_rounds: number | null }>;
  onOpen: () => void;
}

/** A member's light on their own row, where the name is already shown: "Torch, about 6 turns left". */
function lightRowText(light: MemberLight): string {
  const left = lightTimeLeft(light.remainingRounds);
  const noun = light.noun.charAt(0).toUpperCase() + light.noun.slice(1);
  return left ? `${noun}, ${left} left` : noun;
}

function MemberRow({ member, rank, color, controller, light, effects, onOpen }: MemberRowProps) {
  const dead = member.conditions.includes('dead');
  const down = member.current_hp <= 0;
  const conditions = member.conditions.filter((c) => c !== 'dead');
  const detailId = useId();
  const details = [
    controller ? controller.label : 'empty seat',
    `level ${member.level} ${classLabel(member.class_id).toLowerCase()}`,
    `${member.current_hp} of ${member.max_hp} hit points`,
    `armour class ${member.armour_class}`,
    ...(dead ? ['dead'] : []),
    ...conditions.map((c) => conditionLabel(c).toLowerCase()),
    ...(light ? [lightRowText(light).toLowerCase()] : []),
    ...effects.map((e) => effectLabel(e.kind).toLowerCase()),
  ];
  // Only the name is inside the button, so its accessible name is exactly the text it shows. The button's
  // hit area stretches over the whole row, and the rest of the row reaches screen readers as its description.
  return (
    <>
      <span id={detailId} className="visually-hidden">
        {`${details.join(', ')}. Opens the character sheet.`}
      </span>
      <div className={cx(styles.row, dead && styles.deadRow)}>
        <span className={styles.rank} aria-hidden="true">
          {rank}
        </span>
        <TokenPortrait
          name={member.name}
          characterClass={tokenClass(member.class_id)}
          color={color}
          size={40}
          state={dead ? 'dead' : down ? 'unconscious' : 'normal'}
          decorative
        />
        <span className={styles.body}>
          <span className={styles.topLine}>
            <Tooltip content="Open the character sheet" describe={false}>
              <button
                type="button"
                className={cx(styles.name, styles.nameButton)}
                onClick={onOpen}
                aria-describedby={detailId}
              >
                {member.name}
              </button>
            </Tooltip>
            {controller ? (
              <span className={styles.controller} aria-hidden="true">
                <Avatar name={controller.name} color={color} size="xs" decorative />
                <span className={styles.controllerName}>{controller.label}</span>
              </span>
            ) : (
              <span className={styles.empty} aria-hidden="true">
                Empty seat
              </span>
            )}
          </span>
          <span className={styles.meta} aria-hidden="true">
            Level {member.level} {classLabel(member.class_id).toLowerCase()}
          </span>
          {light && (
            <span className={styles.lightLine} aria-hidden="true">
              <Icon name="torch" size={12} className={styles.lit} />
              {lightRowText(light)}
            </span>
          )}
          <span className={styles.hpLine} aria-hidden="true">
            <HpBar
              current={member.current_hp}
              max={member.max_hp}
              size="sm"
              label={`${member.name}'s hit points`}
            />
          </span>
          {(conditions.length > 0 || dead || effects.length > 0) && (
            <span className={styles.chips} aria-hidden="true">
              {dead && <ConditionChip label="Dead" tone="harm" icon="skull" />}
              {conditions.map((c) => (
                <ConditionChip key={c} label={conditionLabel(c)} tone={conditionTone(c)} />
              ))}
              {effects.map((e, i) => (
                <ConditionChip
                  key={`${e.kind}-${i}`}
                  label={effectLabel(e.kind)}
                  tone="magic"
                  duration={effectRemaining(e.remaining_rounds)}
                />
              ))}
            </span>
          )}
        </span>
        <span className={styles.ac} aria-hidden="true">
          <AcShield value={member.armour_class} size="sm" />
        </span>
      </div>
    </>
  );
}
