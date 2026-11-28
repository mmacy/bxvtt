import type { EncounterView, MemberView } from '@bxvtt/shared/bxapi';
import type { DeclarationBody, DeclarationsState, GameEntry } from '@bxvtt/shared/protocol';
import { conditionLabel, joinList, memberName, type TextContext } from '@bxvtt/shared/text';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  battleRound,
  tokenClass,
  useCaller,
  useCanDeclare,
  useCanResolveRound,
  useDeclarations,
  useEncounter,
  useFeed,
  useParty,
  useReduceMotion,
  useRefereeLens,
  useRevision,
  useSendDeclaration,
  useTableId,
  useTableSettings,
  useTableStoreApi,
  useTextContext,
} from '@/app';
import {
  Avatar,
  Badge,
  Banner,
  breakpoints,
  Button,
  ConfirmDialog,
  cx,
  HpBar,
  Icon,
  IconButton,
  TokenPortrait,
  useMediaQuery,
  type IconName,
} from '@/ui';
import { showAftermath } from './Aftermath';
import { memberCasts } from './casting';
import { Composer } from './Composer';
import { previousDeclaration, recordSnapshot, rememberDeclarations, useCombatMemory } from './memory';
import {
  declarationBody,
  describeDeclaration,
  memberGear,
  blockedNote,
  blockedReason,
  blockingMembers,
  ROUND_REFUSED_REASON,
  refusalTexts,
  repeatProblem,
  stealthLists,
  currentProjection,
  type MemberGear,
} from './model';
import { useCombatPeople, type CombatPeople } from './people';
import { PlaybackStrip } from './PlaybackStrip';
import { trackFromView, type TrackMember } from './playback';
import { quickCandidates, useQuickActions, type QuickAction, type QuickAnswer } from './quick';
import { RangeTrack } from './RangeTrack';
import { MonsterRoster, RefereeActions } from './RefereeTools';
import { useCombatUi } from './state';
import { usePlayback, usePublishPlayback } from './usePlayback';
import styles from './combat.module.css';

const BATTLE_EVENTS = new Set([
  'battle_round',
  'attack_rolled',
  'damage_dealt',
  'monster_fled',
  'encounter_group_joined',
]);

/** A resolved round, or anything else that happens in the fight, such as the monsters' free round. */
function isRound(entry: GameEntry): boolean {
  return (
    entry.command_type === 'resolve_battle_round' || entry.events.some((e) => BATTLE_EVENTS.has(e.event_type))
  );
}

export type { QuickAction } from './quick';

/**
 * Each quick action for the members this user declares for and who haven't declared, and whether bxapi's answer
 * for the current state is still out. The board and the action bar build the same lists, so they share one set of
 * preview requests.
 *
 * @param enabled - Whether to ask, such as not once the battle has ended.
 */
export function useBattleQuickActions(enabled: boolean): QuickAnswer {
  const encounter = useEncounter();
  const party = useParty();
  const declarations = useDeclarations();
  const revision = useRevision();
  const ctx = useTextContext();
  const people = useCombatPeople();
  const projection = currentProjection(declarations, revision);
  const lists = useMemo(() => {
    const result: Record<string, QuickAction[]> = {};
    if (encounter === null) return result;
    const declared = declarations?.declared ?? [];
    const backStab = stealthLists(encounter, projection).canBackStab;
    for (const member of party) {
      if (
        !encounter.declarers.includes(member.id) ||
        declared.includes(member.id) ||
        !people.isMine(member.id)
      )
        continue;
      result[member.id] = quickCandidates(member, encounter, memberGear(member, ctx), ctx, {
        casts: memberCasts(member),
        canBackStab: backStab.includes(member.id),
      });
    }
    return result;
  }, [encounter, party, declarations, projection, people, ctx]);
  const state = `${revision ?? ''}|${JSON.stringify(declarations?.declarations ?? {})}`;
  return useQuickActions(lists, state, enabled && encounter !== null);
}

/** The icon of each kind of suggestion. */
export const QUICK_ICONS: Record<QuickAction['kind'], IconName> = {
  melee: 'weapon-sword',
  missile: 'weapon-bow',
  cast: 'spell',
  close: 'footprints',
  hold: 'pause',
};

/** What the quick action's button does, for its tooltip: declare the choice, or open the member's spells. */
export function quickTooltip(quick: QuickAction, name: string): string {
  return quick.body
    ? `Declare this for ${name}, and change it any time before the round resolves`
    : `Open ${name}'s spells to choose one to declare`;
}

/** The tooltip of a control that repeats last round's declarations, naming the members it declares for. */
export function repeatTooltip(repeatable: ReadonlyArray<{ memberId: string }>, ctx: TextContext): string {
  return `Repeat last round's actions for ${joinList(repeatable.map((r) => memberName(r.memberId, ctx)))}`;
}

/** Repeats last round's declaration for each of the given members that has one and still fits. */
export function useRepeatLastRound(): {
  candidates: (memberIds: readonly string[]) => Array<{ memberId: string; body: DeclarationBody }>;
  run: (memberIds: readonly string[]) => Promise<void>;
} {
  const tableId = useTableId();
  const encounter = useEncounter();
  const party = useParty();
  const declarations = useDeclarations();
  const memory = useCombatMemory((s) => s.declarations);
  const ctx = useTextContext();
  const { declare } = useSendDeclaration();
  const round = declarations?.round ?? 0;
  const candidates = (memberIds: readonly string[]) =>
    memberIds.flatMap((memberId) => {
      const member = party.find((m) => m.id === memberId);
      const body = previousDeclaration(memory, tableId, memberId, round);
      if (!member || !body || !encounter?.declarers.includes(memberId)) return [];
      if (repeatProblem(body, member, encounter, memberGear(member, ctx), ctx) !== null) return [];
      return [{ memberId, body }];
    });
  const run = async (memberIds: readonly string[]) => {
    for (const { memberId, body } of candidates(memberIds)) await declare(memberId, body);
  };
  return { candidates, run };
}

/**
 * The battle overlay: the range track, each member's declaration for the round, who the table waits for, the
 * resolve control, and the playback of each resolved round.
 */
export function BattleBoard() {
  const liveEncounter = useEncounter();
  const tableId = useTableId();
  // When the round that ends the game resolves, the view has no encounter any more, but the shell keeps the board
  // on screen while that round plays back. The board then shows the encounter as it last stood.
  const lastEncounter = useCombatMemory(
    (s) =>
      s.snapshots.filter((snap) => snap.tableId === tableId && snap.encounter !== null).at(-1)?.encounter ??
      null,
  );
  const encounter = liveEncounter ?? lastEncounter;
  const party = useParty();
  const declarations = useDeclarations();
  const revision = useRevision();
  const projection = currentProjection(declarations, revision);
  const ctx = useTextContext();
  const people = useCombatPeople();
  const reduce = useReduceMotion();
  const lens = useRefereeLens();
  const store = useTableStoreApi();
  const composing = useCombatUi((s) => s.composing);
  const setComposing = useCombatUi((s) => s.setComposing);
  const collapsed = useCombatUi((s) => s.collapsed);
  const setCollapsed = useCombatUi((s) => s.setCollapsed);
  const setPlayback = useCombatUi((s) => s.setPlayback);
  const refereeOpen = useCombatUi((s) => s.refereeOpen);
  const setRefereeOpen = useCombatUi((s) => s.setRefereeOpen);
  const listId = useId();
  const phone = useMediaQuery(`(max-width: ${breakpoints.phone - 1}px)`);

  // A composer belongs to the round it was opened in. When that round resolves, it closes, so the next round never
  // opens with a stale composer. One opened during playback is already for the new round, and it stays.
  const declaringRound = useDeclarations()?.round ?? 0;
  const opened = useRef<{ composing: string | null; round: number }>({ composing, round: declaringRound });
  useEffect(() => {
    const before = opened.current;
    if (composing !== null && composing === before.composing && declaringRound > before.round) {
      opened.current = { composing: null, round: declaringRound };
      setComposing(null);
      return;
    }
    if (composing !== before.composing) opened.current = { composing, round: declaringRound };
  }, [composing, declaringRound, setComposing]);

  useEffect(() => {
    if (revision !== null) recordSnapshot({ tableId, revision, encounter: liveEncounter, party });
  }, [tableId, revision, liveEncounter, party]);

  useEffect(() => {
    if (!declarations?.active) return;
    const bodies: Record<string, DeclarationBody> = {};
    for (const [memberId, declaration] of Object.entries(declarations.declarations))
      bodies[memberId] = declarationBody(declaration);
    rememberDeclarations(tableId, declarations.round ?? 0, bodies);
  }, [declarations, tableId]);

  const feed = useFeed();
  const battleStart = useMemo(
    () =>
      feed
        .filter((e) => e.kind === 'game' && e.events.some((ev) => ev.event_type === 'battle_started'))
        .at(-1)?.seq ?? 0,
    [feed],
  );
  const playback = usePlayback({ accept: isRound, history: true, historyFrom: battleStart });
  useEffect(() => {
    setPlayback(playback.playing, playback.playing ? playback.skip : null);
  }, [playback.playing, playback.skip, setPlayback]);
  useEffect(() => () => setPlayback(false, null), [setPlayback]);
  // The shell holds its end screen, the top bar shows the playing round, and the party panel follows the beats.
  usePublishPlayback(playback, party);

  // When the fight ends, the shell unmounts this board. The aftermath plays the last round and sums up the fight
  // in the same place over the map.
  useEffect(
    () => () => {
      useCombatUi.getState().setComposing(null);
      const mode = store.getState().game?.mode;
      if (mode === 'exploring' || mode === 'town') showAftermath(store);
    },
    [store],
  );

  const liveTrack = useMemo(() => trackFromView(encounter, party), [encounter, party]);
  const gears = useMemo(() => {
    const map: Record<string, MemberGear> = {};
    for (const member of party) map[member.id] = memberGear(member, ctx);
    return map;
  }, [party, ctx]);
  const refusals = useMemo(() => refusalTexts(declarations?.refusals ?? [], ctx), [declarations, ctx]);
  // The board asks for the next round's quick actions while a round plays back, so they are ready when it ends. The
  // rows show them only once the playback ends, since until then they show the beat on screen.
  const quicks = useBattleQuickActions(liveEncounter !== null);

  if (encounter === null) return null;
  // The game ended in this round, and the shell keeps the board up while the round plays back.
  const holding = liveEncounter === null;
  // While a round plays back, the heading names that round, as the top bar does. Then it names the next one.
  const playingRound = playback.playing ? (playback.current?.digest.round ?? null) : null;
  const round = playingRound ?? battleRound(encounter) ?? 1;
  const declarers = declarations?.declarers ?? encounter.declarers;
  const declared = declarations?.declared ?? [];
  const mine = declarers.filter((id) => people.isMine(id));
  const waiting = declarers.filter((id) => !declared.includes(id));
  const mineToDeclare = mine.some((id) => !declared.includes(id));
  const track = playback.track ?? liveTrack;
  const nextUndeclared = (after: string) => {
    const order = mine.filter((id) => !declared.includes(id) && id !== after);
    return order[0] ?? null;
  };

  return (
    <div
      className={cx(styles.board, phone && styles.boardPhone)}
      aria-label={`Battle, round ${round}`}
      role="region"
    >
      <header className={cx(styles.boardHead, styles.headKeepClose)}>
        <div className={styles.boardTitle}>
          <Icon name="battle" size={18} />
          <h2 className={styles.heading}>Round {round}</h2>
          {holding && <Badge tone="neutral">Fight over</Badge>}
          {!holding && encounter.party_free_round && (
            <Badge tone="success" icon="flag">
              Free round: the monsters can't act
            </Badge>
          )}
          {lens && (
            <Badge tone="referee" appearance="outline">
              Referee lens
            </Badge>
          )}
        </div>
        {lens && (
          <Button
            size="sm"
            variant={refereeOpen ? 'secondary' : 'ghost'}
            icon="referee"
            aria-expanded={refereeOpen}
            tooltip={
              refereeOpen
                ? 'Collapse the monster roster and referee tools'
                : 'Show the monster roster and referee tools'
            }
            onClick={() => setRefereeOpen(!refereeOpen)}
          >
            Monsters
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          iconEnd={collapsed ? 'chevron-up' : 'chevron-down'}
          aria-label={collapsed ? 'Expand the battle board' : 'Collapse the battle board'}
          aria-expanded={!collapsed}
          // The list is only in the document while the board is expanded, as the kit's disclosures do it.
          aria-controls={collapsed || holding ? undefined : listId}
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? 'Expand' : 'Collapse'}
        </Button>
      </header>

      <RangeTrack
        track={track}
        colors={people.colors}
        focus={playback.beat?.focus}
        pops={playback.beat?.pops}
        popKey={playback.current ? `${playback.current.seq}-${playback.beatIndex}` : undefined}
        selected={composing}
        animate={!reduce}
        // Below the phone breakpoint the compact lane has no room for its stacked tokens, so the track keeps
        // its full height, and Collapse hides the rows.
        compact={collapsed && !phone}
        planned={playback.track ? null : (projection?.advance_feet ?? null)}
      />

      {/* The strip stays while a composer is open, so the last round's result and Replay never leave the board. */}
      <PlaybackStrip
        playback={playback}
        ctx={ctx}
        idle={
          // When everyone has declared, the footer says so and what happens next.
          composing !== null || waiting.length === 0
            ? null
            : mineToDeclare
              ? 'Declare an action for each of your characters.'
              : 'Waiting for the party to declare.'
        }
      />

      {!collapsed && !holding && (
        <>
          {/* While a round plays back, the rows and the footer already show the next round. They dim so the eye
              goes to the playback, but a player can still declare for the next round. */}
          <ul id={listId} className={styles.memberList} aria-label="Actions this round">
            {party.map((member) => (
              <MemberRow
                key={member.id}
                member={member}
                encounter={encounter}
                declarations={declarations}
                gear={gears[member.id] ?? { wielded: [], items: [] }}
                people={people}
                ctx={ctx}
                refusals={refusals.byMember[member.id] ?? []}
                quick={quicks.actions?.[member.id] ?? null}
                quickPending={quicks.pending}
                shown={playback.track?.members[member.id] ?? null}
                playing={playback.track !== null}
                composing={composing === member.id}
                onCompose={(open) => setComposing(open ? member.id : null)}
                onDeclared={() => setComposing(nextUndeclared(member.id))}
              />
            ))}
          </ul>
          {lens && refereeOpen && (
            <section className={styles.refereeBlock} aria-label="Monsters and referee tools">
              <MonsterRoster encounter={encounter} />
              <RefereeActions />
            </section>
          )}
        </>
      )}

      {!holding && (
        <RoundFooter
          round={battleRound(encounter) ?? 1}
          declarers={declarers}
          declared={declared}
          mine={mine}
          general={refusals.general}
          refused={blockingMembers(declarations?.refusals ?? [], declarers)}
          unchecked={declarations?.preview_unavailable === true}
          ctx={ctx}
          waiting={<WaitingSummary waiting={waiting} people={people} ctx={ctx} />}
          playing={playback.playing}
        />
      )}
    </div>
  );
}

/**
 * Why a member doesn't declare, in the words the party panel uses: "Dead" for a dead member, the condition for a
 * member who is alive but can't act, such as "Asleep", and "Unconscious" at 0 hit points with no condition.
 */
export function outOfActionText(member: MemberView): string {
  if (member.conditions.includes('dead')) return conditionLabel('dead');
  const conditions = member.conditions.map((c) => conditionLabel(c));
  if (conditions.length > 0) return `${joinList(conditions)}: can't act this round`;
  if (member.current_hp <= 0) return 'Unconscious';
  return "Can't act this round";
}

function WaitingSummary({
  waiting,
  people,
  ctx,
}: {
  waiting: string[];
  people: CombatPeople;
  ctx: TextContext;
}) {
  // The note under the progress line says when everyone has declared.
  if (waiting.length === 0) return null;
  // Group the members still to declare by the person in their seat.
  const byOwner = new Map<string, { name: string; color: string; members: string[] }>();
  for (const id of waiting) {
    const owner = people.ownerOf(id);
    const key = owner?.user_id ?? 'referee';
    const entry = byOwner.get(key) ?? {
      name: owner?.name ?? 'the referee',
      color: owner?.color ?? people.colors[id] ?? '',
      members: [],
    };
    entry.members.push(memberName(id, ctx));
    byOwner.set(key, entry);
  }
  return (
    <span className={styles.waiting}>
      <span className={styles.waitingLabel}>Waiting for</span>
      {[...byOwner.entries()].map(([key, owner]) => (
        <span key={key} className={styles.waitingOwner}>
          <Avatar name={owner.name} color={owner.color} size="xs" decorative />
          <span>
            {key === people.userId ? 'you' : owner.name}
            <span className={styles.waitingMembers}> ({joinList(owner.members)})</span>
          </span>
        </span>
      ))}
    </span>
  );
}

interface MemberRowProps {
  member: MemberView;
  /** The member as the playback shows them now, or `null` outside playback. */
  shown: TrackMember | null;
  /**
   * Whether a resolved round is playing back, so live state that the beats haven't reached yet waits, and the row
   * dims.
   */
  playing: boolean;
  encounter: EncounterView;
  declarations: DeclarationsState | null;
  gear: MemberGear;
  people: CombatPeople;
  ctx: TextContext;
  refusals: string[];
  /** The member's quick action, from {@link useBattleQuickActions}, or `null` for none. */
  quick: QuickAction | null;
  /** Whether bxapi's answer for the current state is still out, so `quick` is the previous one and waits. */
  quickPending: boolean;
  composing: boolean;
  onCompose: (open: boolean) => void;
  onDeclared: () => void;
}

function MemberRow({
  member,
  shown,
  playing,
  encounter,
  declarations,
  gear,
  people,
  ctx,
  refusals,
  quick: offered,
  quickPending,
  composing,
  onCompose,
  onDeclared,
}: MemberRowProps) {
  const permission = useCanDeclare(member.id);
  const { declare, clear, pending } = useSendDeclaration();
  const repeat = useRepeatLastRound();
  const declarer = encounter.declarers.includes(member.id);
  const declaration = declarations?.declarations[member.id];
  const owner = people.ownerOf(member.id);
  const mine = people.isMine(member.id);
  const canAct = permission.allowed && declarer;
  // During playback the row follows the beat on screen, and lands on the live state when playback ends.
  const hp = shown ? shown.hp : member.current_hp;
  const dead = shown ? shown.down && shown.conditions.includes('dead') : member.conditions.includes('dead');
  const down = shown ? shown.down || shown.hp <= 0 : dead || member.current_hp <= 0;
  // While a round plays back, the row shows the beat on screen, so it offers nothing to declare yet.
  const quick = mine && canAct && !declaration && !playing ? offered : null;
  const again = mine && canAct && !declaration ? repeat.candidates([member.id])[0] : undefined;
  const [error, setError] = useState<string | null>(null);
  const reasonId = useId();
  const showReason = refusals.length > 0 && !composing;
  // When the composer closes with focus inside it, such as when its round resolves, focus returns to the row's
  // Actions button rather than to the page.
  const actionsButton = useRef<HTMLButtonElement>(null);
  const wasComposing = useRef(composing);
  useEffect(() => {
    const active = document.activeElement;
    if (wasComposing.current && !composing && (active === null || active === document.body))
      actionsButton.current?.focus({ preventScroll: true });
    wasComposing.current = composing;
  }, [composing]);

  const send = async (body: DeclarationBody) => {
    setError(null);
    const result = await declare(member.id, body, { display: 'inline' });
    if (result.status === 'saved' && composing) onDeclared();
    else if (result.status === 'error') setError(result.message);
  };

  let status: React.ReactNode;
  if (!declarer) {
    // A member who falls this round shows as standing until the beat where they fall.
    status =
      shown && !shown.down ? null : <span className={styles.statusMuted}>{outOfActionText(member)}</span>;
  } else if (declaration && refusals.length > 0) {
    // The words carry the state, and the reason follows in the line below, in reading order.
    status = (
      <span className={styles.statusRefused}>
        <Icon name="warning" size={14} />
        <span>
          <span className={styles.declaredLabel}>Won't work: </span>
          {describeDeclaration(declaration, ctx, gear)}
        </span>
      </span>
    );
  } else if (declaration) {
    status = (
      <span className={styles.statusDeclared}>
        <Icon name="check" size={14} />
        <span>
          <span className={styles.declaredLabel}>Declared: </span>
          {describeDeclaration(declaration, ctx, gear)}
        </span>
      </span>
    );
  } else if (mine || composing) {
    status = composing ? (
      <span className={styles.statusChoosing}>Choosing…</span>
    ) : quick?.reason ? (
      <span className={styles.statusMuted}>Not declared yet. {quick.reason}</span>
    ) : (
      <span className={styles.statusChoosing}>Not declared yet</span>
    );
  } else {
    status = (
      <span className={styles.statusWaiting}>
        <Avatar
          name={owner?.name ?? 'Referee'}
          color={owner?.color ?? people.colors[member.id]}
          size="xs"
          decorative
        />
        Waiting for {owner?.user_id === people.userId ? 'you' : (owner?.name ?? 'the referee')}
      </span>
    );
  }

  return (
    <li
      className={cx(
        styles.memberRow,
        mine && styles.memberMine,
        refusals.length > 0 && styles.memberRefused,
        !declarer && styles.memberOut,
        playing && styles.dimmedForPlayback,
      )}
    >
      <div className={styles.memberMain}>
        <TokenPortrait
          name={member.name}
          characterClass={tokenClass(member.class_id)}
          color={people.colors[member.id]}
          size={32}
          state={dead ? 'dead' : down ? 'unconscious' : 'normal'}
          selected={composing}
          decorative
        />
        <div className={styles.memberWho}>
          <span className={styles.memberName}>
            {member.name}
            {!mine && owner && <span className={styles.memberOwner}>{owner.name}</span>}
            {/* The view lists who is hiding, never whether the hide worked, and so does the board. During
                playback the badge waits, so it never shows before the hide plays. */}
            {!playing && encounter.hiding.includes(member.id) && (
              <Badge tone="neutral" icon="eye-off">
                Hiding
              </Badge>
            )}
          </span>
          <HpBar
            size="sm"
            current={Math.max(0, hp)}
            max={member.max_hp}
            label={`${member.name}'s hit points`}
          />
        </div>
        <div
          className={cx(
            styles.memberStatus,
            !status && refusals.length === 0 && !error && styles.memberStatusEmpty,
          )}
        >
          {status}
          {/* A polite live region that stays mounted with its text, so a new refusal is announced once. While the
              composer shows the refusal, the line is only hidden visually, so closing the composer announces
              nothing again. */}
          <span
            id={reasonId}
            className={cx(styles.refusalLine, composing && 'visually-hidden')}
            aria-live="polite"
            aria-atomic="true"
          >
            {declaration && refusals.length > 0 ? refusals.join(' ') : ''}
          </span>
          {error && <span className={styles.refusalLine}>{error}</span>}
        </div>
        <div className={styles.memberActions}>
          {canAct && !declaration && !composing && quick && (
            <Button
              size="sm"
              variant="secondary"
              icon={QUICK_ICONS[quick.kind]}
              loading={pending || quickPending}
              tooltip={quickTooltip(quick, member.name)}
              onClick={() => {
                // The previous answer's button stays in place while the new one is out, and can't be used.
                if (quickPending) return;
                if (quick.body) void send(quick.body);
                else onCompose(true);
              }}
            >
              {quick.label}
            </Button>
          )}
          {again && !composing && (
            <IconButton
              icon="rotate"
              size="sm"
              variant="ghost"
              label={`Declare the same as last round: ${describeDeclaration(again.body, ctx, gear)}`}
              onClick={() => void send(again.body)}
            />
          )}
          {canAct && (
            <Button
              ref={actionsButton}
              size="sm"
              variant={composing ? 'secondary' : 'ghost'}
              iconEnd={composing ? 'chevron-up' : 'chevron-down'}
              aria-expanded={composing}
              aria-describedby={showReason && declaration ? reasonId : undefined}
              tooltip={
                composing
                  ? `Close ${member.name}'s actions`
                  : declaration
                    ? `Choose another action for ${member.name}`
                    : mine
                      ? `Choose ${member.name}'s action for this round`
                      : undefined
              }
              onClick={() => onCompose(!composing)}
            >
              {declaration ? 'Change' : mine ? 'Actions' : `Declare for ${member.name}`}
            </Button>
          )}
          {canAct && declaration && !composing && (
            <IconButton
              icon="close"
              size="sm"
              variant="ghost"
              label={`Clear ${member.name}'s action`}
              loading={pending}
              onClick={() => void clear(member.id)}
            />
          )}
        </div>
      </div>
      {composing && canAct && (
        <Composer
          member={member}
          encounter={encounter}
          gear={gear}
          current={declaration ? declarationBody(declaration) : null}
          suggested={
            quick && !quickPending
              ? (quick.body ?? (quick.kind === 'cast' ? { action: 'cast' } : null))
              : null
          }
          refusals={refusals}
          onDeclared={onDeclared}
          onClose={() => onCompose(false)}
        />
      )}
    </li>
  );
}

/**
 * What starts the round, for the board's footer: everyone declaring with automatic resolution, and otherwise the
 * caller or a referee. A referee also learns what "Resolve now" does.
 */
export function roundStartNote(facts: {
  auto: boolean;
  everyone: boolean;
  /**
   * The names of the members whose actions won't work, so the round waits for them to change, or `true` when
   * bxapi refused the round as a whole.
   */
  refused: readonly string[] | boolean;
  /** Whether this user may resolve the round once everyone has declared. */
  canResolve: boolean;
  /** Whether this user may resolve the round now, before everyone has declared. */
  early: boolean;
  /** The caller's name, or `null` when the user is the caller or the table has none. */
  caller: string | null;
}): string {
  const { auto, everyone, refused, canResolve, early, caller } = facts;
  const resolver = caller ? `${caller} (the caller) or the referee` : 'the caller or the referee';
  let note: string;
  const names = Array.isArray(refused) ? refused : [];
  const blocked = blockedNote(names);
  if (blocked !== null) note = blocked;
  else if (everyone && refused === true)
    note = "Everyone has declared, but one action won't work. Change it to go on.";
  else if (auto)
    note = everyone
      ? 'Everyone has declared, so the round resolves now.'
      : 'The round resolves by itself as soon as everyone has declared.';
  else if (everyone)
    note = canResolve
      ? "Everyone has declared. Resolve the round when you're ready."
      : `Everyone has declared. Waiting for ${resolver} to resolve the round.`;
  else
    note = canResolve
      ? 'When everyone has declared, you resolve the round.'
      : `When everyone has declared, ${resolver} resolves the round.`;
  return early && names.length === 0
    ? `${note} Resolve now starts it at once, and anyone who hasn't declared holds.`
    : note;
}

function RoundFooter({
  round,
  declarers,
  declared,
  mine,
  general,
  refused,
  unchecked,
  ctx,
  waiting,
  playing,
}: {
  /** The round being declared. */
  round: number;
  declarers: string[];
  declared: string[];
  mine: string[];
  general: string[];
  /** The members whose actions won't work, from {@link blockingMembers}. */
  refused: string[];
  /** Whether the server couldn't check the declared actions with bxapi, so a refusal may come only on resolve. */
  unchecked: boolean;
  ctx: TextContext;
  waiting: React.ReactNode;
  /** Whether a resolved round is playing back, which dims the footer. */
  playing: boolean;
}) {
  const settings = useTableSettings();
  const canResolve = useCanResolveRound();
  const canResolveEarly = useCanResolveRound({ early: true });
  const { resolve, pending } = useSendDeclaration();
  const repeat = useRepeatLastRound();
  const [confirming, setConfirming] = useState(false);
  const caller = useCaller();
  const missing = declarers.filter((id) => !declared.includes(id));
  const everyone = missing.length === 0 && declarers.length > 0;
  const auto = settings?.auto_resolve ?? true;
  const repeatable = repeat.candidates(mine.filter((id) => !declared.includes(id)));
  const early = !everyone && canResolveEarly.allowed && declarers.length > 0;
  const refusedNames = refused.map((id) => memberName(id, ctx));
  // The round can't resolve while a declared action won't work. A hold for the members who haven't declared
  // never replaces one.
  const blocked = blockedReason(refusedNames);
  // A refusal of the round as a whole stays until someone changes an action, so resolving again would only fail.
  const resolveBlocked = blocked ?? (general.length > 0 ? ROUND_REFUSED_REASON : null);

  return (
    <footer className={cx(styles.boardFoot, playing && styles.dimmedForPlayback)}>
      {general.length > 0 && (
        <Banner tone="danger" title="The round can't resolve" className={styles.footBanner}>
          {general.join(' ')} Change an action and try again.
        </Banner>
      )}
      <div className={styles.footRow}>
        <div className={styles.progressBlock}>
          {/* A status, not an alert: nothing is wrong yet, and the round can still resolve. It stays mounted
              while the flag holds, so it is announced once. */}
          {unchecked && (
            <p role="status" className={cx(styles.progressNote, styles.uncheckedNote)}>
              <Icon name="info" size={14} />
              <span>
                Actions can't be checked right now. If one won't work, you'll find out when the round
                resolves.
              </span>
            </p>
          )}
          {/* The count and the note share one polite live region, so a new count or a blocked round is
              announced once, without interrupting anyone. */}
          <div className={styles.progressLive} aria-live="polite">
            <div className={styles.progressLine}>
              <span className={styles.progress}>
                <span className={styles.progressCount}>
                  {declared.length} of {declarers.length}
                </span>{' '}
                declared for round {round}
              </span>
              {waiting}
            </div>
            <span className={styles.progressNote}>
              {roundStartNote({
                auto,
                everyone,
                refused: refusedNames.length > 0 ? refusedNames : general.length > 0,
                canResolve: canResolve.allowed,
                early,
                caller: caller.isMe ? null : (caller.member?.name ?? null),
              })}
            </span>
          </div>
        </div>
        <div className={styles.footActions}>
          {repeatable.length > 1 && (
            <Button
              size="sm"
              variant="ghost"
              icon="rotate"
              tooltip={repeatTooltip(repeatable, ctx)}
              onClick={() => void repeat.run(mine)}
            >
              Declare same as last round
            </Button>
          )}
          {early && (
            <Button
              size="sm"
              variant="ghost"
              icon="flag"
              tooltip="Resolve the round at once, and anyone who hasn't declared holds"
              disabled={blocked !== null}
              disabledReason={blocked}
              onClick={() => setConfirming(true)}
            >
              Resolve now
            </Button>
          )}
          {everyone &&
            (canResolve.allowed || canResolveEarly.allowed) &&
            (!auto || general.length > 0 || blocked !== null) && (
              <Button
                size="sm"
                variant="primary"
                icon="play"
                loading={pending}
                disabled={resolveBlocked !== null}
                disabledReason={resolveBlocked}
                onClick={() => void resolve()}
              >
                Resolve round
              </Button>
            )}
        </div>
      </div>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Resolve round now?"
        description={`${joinList(missing.map((id) => memberName(id, ctx)))} ${missing.length === 1 ? "hasn't" : "haven't"} declared yet and will hold this round.`}
        confirmLabel="Resolve now"
        onConfirm={async () => {
          await resolve({ fillWithHold: true });
        }}
      />
    </footer>
  );
}
