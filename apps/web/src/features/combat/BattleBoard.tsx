import type { EncounterView, MemberView } from '@bxvtt/shared/bxapi';
import type { DeclarationBody, DeclarationsState, GameEntry } from '@bxvtt/shared/protocol';
import { conditionLabel, groupName, joinList, memberName, type TextContext } from '@bxvtt/shared/text';
import { useEffect, useMemo, useState } from 'react';
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
  Button,
  ConfirmDialog,
  cx,
  HpBar,
  Icon,
  IconButton,
  TokenPortrait,
  type IconName,
} from '@/ui';
import { showAftermath } from './Aftermath';
import { useMemberCasts } from './casting';
import { Composer } from './Composer';
import { previousDeclaration, recordSnapshot, rememberDeclarations, useCombatMemory } from './memory';
import {
  declarationBody,
  describeDeclaration,
  memberGear,
  suggestAction,
  type Suggestion,
  type SuggestionFacts,
  refusalTexts,
  repeatProblem,
  type MemberGear,
} from './model';
import { useCombatPeople, type CombatPeople } from './people';
import { PlaybackStrip } from './PlaybackStrip';
import { trackFromView, type TrackMember } from './playback';
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

/** The row's highlighted choice, from {@link suggestAction}, in words for its button. */
export interface QuickAction {
  kind: Suggestion['kind'];
  label: string;
  /** What the button declares, or `null` for a choice that opens the composer (a spell). */
  body: DeclarationBody | null;
  /** Why the suggestion is to hold, shown under the member's name. */
  reason: string | null;
}

/**
 * The quick action for a member: a melee attack for a member already in melee, a missile attack in range, the
 * Cast tab for a member with a spell ready, closing in only for a front-line fighter, and otherwise holding.
 */
export function quickAction(
  member: MemberView,
  encounter: EncounterView | null,
  gear: MemberGear,
  ctx: TextContext,
  facts: SuggestionFacts,
): QuickAction | null {
  const suggestion = suggestAction(member, encounter, gear, facts);
  if (suggestion === null) return null;
  if (suggestion.kind === 'cast') return { kind: 'cast', label: 'Choose a spell', body: null, reason: null };
  if (suggestion.kind === 'hold')
    return { kind: 'hold', label: 'Hold', body: suggestion.body, reason: suggestion.reason };
  // A missile attack says how it attacks, so a thrown dagger never reads like a melee attack.
  const weapon = suggestion.plan.weapon;
  const group = groupName(suggestion.plan.group.id, ctx);
  const label =
    suggestion.kind === 'missile' && weapon
      ? weapon.thrown
        ? `Throw ${weapon.name} at ${group}`
        : `Shoot at ${group} with ${weapon.name}`
      : describeDeclaration(suggestion.body, ctx, gear);
  return { kind: suggestion.kind, label, body: suggestion.body, reason: null };
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
  const track = playback.track ?? liveTrack;
  const nextUndeclared = (after: string) => {
    const order = mine.filter((id) => !declared.includes(id) && id !== after);
    return order[0] ?? null;
  };

  return (
    <div className={styles.board} aria-label={`Battle, round ${round}`} role="region">
      <header className={styles.boardHead}>
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
                ? "Hide the monsters' hit points and the referee tools"
                : "Show the monsters' hit points and the referee tools"
            }
            onClick={() => setRefereeOpen(!refereeOpen)}
          >
            Monsters
          </Button>
        )}
        <IconButton
          icon={collapsed ? 'chevron-up' : 'chevron-down'}
          label={collapsed ? 'Show declarations' : 'Hide declarations'}
          size="sm"
          variant="ghost"
          onClick={() => setCollapsed(!collapsed)}
        />
      </header>

      <RangeTrack
        track={track}
        colors={people.colors}
        focus={playback.beat?.focus}
        pops={playback.beat?.pops}
        popKey={playback.current ? `${playback.current.seq}-${playback.beatIndex}` : undefined}
        selected={composing}
        animate={!reduce}
        compact={collapsed || composing !== null}
        planned={playback.track ? null : (declarations?.projection?.advance_feet ?? null)}
      />

      {(composing === null || playback.playing) && (
        <PlaybackStrip
          playback={playback}
          ctx={ctx}
          idle={
            composing !== null
              ? null
              : mine.length > 0
                ? 'Choose an action for each of your characters. Each choice is saved as you make it. Resolved rounds play back here.'
                : 'Waiting for the party to declare. Resolved rounds play back here.'
          }
        />
      )}

      {!collapsed && !holding && (
        <>
          <ul className={styles.memberList} aria-label="Declarations this round">
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
                shown={playback.track?.members[member.id] ?? null}
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
          refused={declarers.filter((id) => (refusals.byMember[id]?.length ?? 0) > 0)}
          ctx={ctx}
          waiting={<WaitingSummary waiting={waiting} people={people} ctx={ctx} />}
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
  if (waiting.length === 0) return <span className={styles.waiting}>Everyone has declared</span>;
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
  encounter: EncounterView;
  declarations: DeclarationsState | null;
  gear: MemberGear;
  people: CombatPeople;
  ctx: TextContext;
  refusals: string[];
  composing: boolean;
  onCompose: (open: boolean) => void;
  onDeclared: () => void;
}

function MemberRow({
  member,
  shown,
  encounter,
  declarations,
  gear,
  people,
  ctx,
  refusals,
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
  const casts = useMemberCasts(member);
  const suggestion = canAct && !declaration ? quickAction(member, encounter, gear, ctx, { casts }) : null;
  const quick = mine ? suggestion : null;
  const again = mine && canAct && !declaration ? repeat.candidates([member.id])[0] : undefined;
  const [error, setError] = useState<string | null>(null);

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
            {/* The view lists who is hiding, never whether the hide worked, and so does the board. */}
            {encounter.hiding.includes(member.id) && (
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
          {refusals.length > 0 && !composing && (
            <span className={styles.refusalLine}>{refusals.join(' ')}</span>
          )}
          {error && <span className={styles.refusalLine}>{error}</span>}
        </div>
        <div className={styles.memberActions}>
          {canAct && !declaration && !composing && quick && (
            <Button
              size="sm"
              variant="secondary"
              icon={QUICK_ICONS[quick.kind]}
              loading={pending}
              tooltip={quickTooltip(quick, member.name)}
              onClick={() => (quick.body ? void send(quick.body) : onCompose(true))}
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
              size="sm"
              variant={composing ? 'secondary' : 'ghost'}
              iconEnd={composing ? 'chevron-up' : 'chevron-down'}
              aria-expanded={composing}
              tooltip={
                composing
                  ? `Hide ${member.name}'s choices`
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
              label={`Clear ${member.name}'s declaration`}
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
            suggestion ? (suggestion.body ?? (suggestion.kind === 'cast' ? { action: 'cast' } : null)) : null
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
   * The names of the members whose declarations the session would refuse, so the round waits for them to
   * change, or `true` when bxapi refused the round as a whole.
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
  if (names.length > 0)
    note = `The round waits for ${joinList(names)} to choose another action, because the session would refuse ${names.length === 1 ? 'that declaration' : 'those declarations'}.`;
  else if (everyone && refused === true)
    note = 'Everyone has declared, but the round waits for a changed declaration.';
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
  ctx,
  waiting,
}: {
  /** The round being declared. */
  round: number;
  declarers: string[];
  declared: string[];
  mine: string[];
  general: string[];
  /** The members whose stored declarations the session would refuse. */
  refused: string[];
  ctx: TextContext;
  waiting: React.ReactNode;
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
  // The round can't resolve while the session would refuse a stored declaration. A hold for the members who
  // haven't declared never replaces one.
  const blocked =
    refusedNames.length > 0
      ? `${joinList(refusedNames)} ${refusedNames.length === 1 ? 'has' : 'have'} to choose another action first.`
      : null;

  return (
    <footer className={styles.boardFoot}>
      {general.length > 0 && (
        <Banner tone="danger" title="Cannot resolve round" className={styles.footBanner}>
          {general.join(' ')} Change a declaration to try again.
        </Banner>
      )}
      <div className={styles.footRow}>
        <div className={styles.progressBlock}>
          <div className={styles.progressLine} aria-live="polite">
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
                disabled={blocked !== null}
                disabledReason={blocked}
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
