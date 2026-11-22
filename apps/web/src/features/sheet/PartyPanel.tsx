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
  SectionLabel,
  Icon,
  IconButton,
  TokenPortrait,
  cx,
} from '@/ui';
import { effectLabel, effectRemaining, lightNoun, lightPhrase } from './actions';
import { conditionTone } from './SheetSections';
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
  const party = playing ? held.party : liveParty;
  const view = playing ? held.view : liveView;
  const ended = shownMode === 'game_over' || shownMode === 'victory';
  const showLight = location?.kind === 'dungeon' && !ended;
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

  // One light for each member, the one that lasts longest, as the map counts them.
  const lights = (view?.effects ?? [])
    .filter((e) => e.kind === 'light' || e.kind === 'continual_light')
    .reduce<Array<{ character_id: string; remaining_rounds: number | null }>>((all, effect) => {
      const existing = all.find((l) => l.character_id === effect.character_id);
      if (!existing)
        return [...all, { character_id: effect.character_id, remaining_rounds: effect.remaining_rounds }];
      if (
        existing.remaining_rounds !== null &&
        (effect.remaining_rounds === null || effect.remaining_rounds > existing.remaining_rounds)
      )
        existing.remaining_rounds = effect.remaining_rounds;
      return all;
    }, []);
  const nameOf = (id: string) => party.find((m) => m.id === id)?.name ?? 'Someone';
  const deprived = Object.entries(view?.deprivation ?? {});

  return (
    <div className={styles.panel}>
      {(showLight || view?.fatigued || view?.exhausted || deprived.length > 0) && (
        <section className={styles.partyState} aria-label="The party">
          {showLight && (
            <div className={styles.stateRow}>
              <Icon name="torch" size={16} />
              {lights.length === 0 ? (
                <span className={styles.dark}>The party has no light.</span>
              ) : (
                <span>
                  {lights
                    .map((l) =>
                      lightPhrase(
                        nameOf(l.character_id),
                        l.remaining_rounds,
                        lightNoun(party.find((m) => m.id === l.character_id)),
                      ),
                    )
                    .join(' · ')}
                </span>
              )}
            </div>
          )}
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
                  {nameOf(id)}: {(d.food_days ?? 0) > 0 ? `${d.food_days} days unfed` : ''}
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
              title={reorderPermission.reason ?? undefined}
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
          Drag a character, or focus a handle and press the up and down arrow keys. The front rank leads.
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
                  <button
                    type="button"
                    className={styles.handle}
                    aria-label={`${member.name}, place ${index + 1} of ${ordered.length}. Press the up or down arrow to move.`}
                    onKeyDown={(event) => onHandleKey(event, index)}
                  >
                    <Icon name="grip" size={16} />
                  </button>
                  <IconButton
                    icon="arrow-up"
                    label={`Move ${member.name} forward`}
                    size="sm"
                    variant="ghost"
                    disabled={index === 0 || pending}
                    onClick={() => move(index, index - 1)}
                  />
                  <IconButton
                    icon="arrow-down"
                    label={`Move ${member.name} back`}
                    size="sm"
                    variant="ghost"
                    disabled={index === ordered.length - 1 || pending}
                    onClick={() => move(index, index + 1)}
                  />
                </div>
              )}
              <MemberRow
                member={member}
                rank={index + 1}
                color={owner?.color}
                controller={
                  owner ? { name: owner.name, label: owner.user_id === me?.id ? 'You' : owner.name } : null
                }
                lit={lights.some((l) => l.character_id === member.id)}
                effects={(view?.effects ?? []).filter(
                  (e) => e.character_id === member.id && e.kind !== 'light',
                )}
                onOpen={() => openSheet(member.id)}
              />
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
  lit: boolean;
  effects: Array<{ kind: string; remaining_rounds: number | null }>;
  onOpen: () => void;
}

function MemberRow({ member, rank, color, controller, lit, effects, onOpen }: MemberRowProps) {
  const dead = member.conditions.includes('dead');
  const down = member.current_hp <= 0;
  const conditions = member.conditions.filter((c) => c !== 'dead');
  const detailId = useId();
  const details = [
    `${member.current_hp} of ${member.max_hp} hit points`,
    `armour class ${member.armour_class}`,
    ...(dead ? ['dead'] : []),
    ...conditions.map((c) => conditionLabel(c).toLowerCase()),
    ...(lit ? ['carries a light'] : []),
    ...effects.map((e) => effectLabel(e.kind).toLowerCase()),
  ];
  return (
    <>
      <span id={detailId} className="visually-hidden">
        {`${details.join(', ')}. Opens the character sheet.`}
      </span>
      <button
        type="button"
        className={cx(styles.row, dead && styles.deadRow)}
        onClick={onOpen}
        aria-describedby={detailId}
      >
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
            <span className={styles.name}>{member.name}</span>
            <span className="visually-hidden">{', '}</span>
            {lit && <Icon name="torch" size={14} className={styles.lit} aria-hidden />}
            {controller ? (
              <span className={styles.controller}>
                <Avatar name={controller.name} color={color} size="xs" decorative />
                <span className={styles.controllerName}>{controller.label}</span>
              </span>
            ) : (
              <span className={styles.empty}>Empty seat</span>
            )}
          </span>
          <span className="visually-hidden">{', '}</span>
          <span className={styles.meta}>
            Level {member.level} {classLabel(member.class_id).toLowerCase()}
          </span>
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
      </button>
    </>
  );
}
