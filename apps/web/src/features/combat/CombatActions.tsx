import { joinList, memberName } from '@bxvtt/shared/text';
import { useMemo } from 'react';
import {
  formatShortcut,
  useAction,
  useCanResolveRound,
  useDeclarations,
  useEncounter,
  useGameMode,
  useParty,
  useSendDeclaration,
  useShortcut,
  useTableSettings,
  useTextContext,
} from '@/app';
import { ActionBarDivider, ActionBarItem, Button } from '@/ui';
import { QUICK_ICONS, quickAction, quickTooltip, repeatTooltip, useRepeatLastRound } from './BattleBoard';
import { useMemberCasts } from './casting';
import { memberGear } from './model';
import { useCombatPeople } from './people';
import { useCombatUi } from './state';
import { useEncounterCommands } from './useEncounterCommands';
import styles from './combat.module.css';

/** Why Talk is unavailable when nobody in the party can act, so nobody can speak. */
const NO_SPEAKER = 'No one in the party can act, so no one can talk to the monsters.';

/** The action bar in `encounter` and `battle` modes: the few primary actions, each with a shortcut. */
export function CombatActions() {
  const mode = useGameMode();
  return mode === 'battle' ? <BattleActions /> : <EncounterActions />;
}

function ActionButton({
  label,
  keys,
  onClick,
  disabled,
  reason,
  icon,
  primary,
  loading,
  tooltip,
}: {
  label: string;
  /** What the action does, for the tooltip, when the label doesn't say it all. */
  tooltip?: string;
  keys: string;
  onClick: () => void;
  disabled?: boolean;
  /** Why the action is unavailable while `disabled`, or `null` while a request is on its way. */
  reason?: string | null;
  icon: Parameters<typeof Button>[0]['icon'];
  primary?: boolean;
  loading?: boolean;
}) {
  return (
    <ActionBarItem>
      <Button
        size="sm"
        variant={primary ? 'secondary' : 'ghost'}
        icon={icon}
        disabled={disabled}
        disabledReason={reason}
        loading={loading}
        tooltip={tooltip}
        shortcut={formatShortcut(keys)}
        aria-keyshortcuts={keys}
        onClick={onClick}
      >
        {label}
      </Button>
    </ActionBarItem>
  );
}

/**
 * Why the battle's "Resolve round" is unavailable, or `null` when it is available or waits for a request.
 *
 * @param facts.canResolve - Whether the user may resolve the round once everyone has declared.
 * @param facts.canResolveEarly - Whether the user may resolve it sooner, which only a referee may.
 * @param facts.auto - Whether the table resolves each round by itself once everyone has declared.
 * @param facts.waiting - The characters who haven't declared yet.
 * @param facts.refused - The names of the characters whose declarations the session would refuse.
 */
export function resolveRoundReason(facts: {
  canResolve: { allowed: boolean; reason: string | null };
  canResolveEarly: { allowed: boolean; reason: string | null };
  auto: boolean;
  waiting: readonly string[];
  refused?: readonly string[];
}): string | null {
  const { canResolve, canResolveEarly, auto, waiting, refused = [] } = facts;
  if (!canResolve.allowed) return canResolve.reason;
  if (refused.length > 0)
    return `${joinList(refused)} ${refused.length === 1 ? 'has' : 'have'} to choose another action first.`;
  if (auto) return 'The round resolves by itself once everyone has declared.';
  if (waiting.length === 0) return null;
  if (!canResolveEarly.allowed) return canResolveEarly.reason;
  return 'Not everyone has declared yet. Choose Resolve now on the battle board to go ahead.';
}

function EncounterActions() {
  const commands = useEncounterCommands();
  const speaker = commands.speaker;
  const allowed = (type: string) => commands.legal(type) && commands.can(type).allowed && !commands.pending;
  // `canSendCommand` explains a command that isn't legal now too, from the command catalog. While a command is on
  // its way, the buttons wait without a reason.
  const reason = (type: string) => commands.can(type).reason;
  const talkReason = reason('parley') ?? (speaker === null ? NO_SPEAKER : null);
  const talk = () => {
    if (speaker && allowed('parley')) commands.talk(speaker.id);
  };
  const wait = () => {
    if (allowed('wait')) commands.wait();
  };
  const flee = () => {
    if (allowed('evade')) commands.flee('none');
  };
  const fight = () => {
    if (allowed('engage_battle')) commands.fight();
  };
  const group = 'Encounter';
  useShortcut({
    id: 'combat.talk',
    keys: 't',
    label: 'Talk to the monsters',
    group,
    enabled: !commands.pursuit,
    run: talk,
  });
  useShortcut({
    id: 'combat.wait',
    keys: 'w',
    label: commands.pursuit ? 'Keep running' : 'Wait a round',
    group,
    run: wait,
  });
  useShortcut({
    id: 'combat.flee',
    keys: 'shift+f',
    label: 'Flee',
    group,
    enabled: !commands.pursuit,
    run: flee,
  });
  useShortcut({ id: 'combat.fight', keys: 'f', label: 'Fight', group, run: fight });
  useAction({
    id: 'combat.fight',
    label: 'Fight the monsters',
    group,
    icon: 'battle',
    shortcut: 'f',
    run: fight,
    disabled: !allowed('engage_battle'),
    disabledReason: reason('engage_battle'),
  });
  useAction({
    id: 'combat.wait',
    label: commands.pursuit ? 'Keep running' : 'Wait a round',
    group,
    icon: 'hourglass',
    shortcut: 'w',
    run: wait,
    disabled: !allowed('wait'),
    disabledReason: reason('wait'),
  });

  return (
    <>
      {!commands.pursuit && (
        <ActionButton
          label="Talk"
          tooltip={speaker ? `Have ${speaker.name} talk to the monsters` : undefined}
          keys="t"
          icon="message"
          onClick={talk}
          disabled={!allowed('parley') || speaker === null}
          reason={talkReason}
          loading={commands.pendingType === 'parley'}
        />
      )}
      <ActionButton
        label={commands.pursuit ? 'Keep running' : 'Wait'}
        tooltip={
          commands.pursuit ? 'Run one more round of the chase' : 'Spend a round and see what the monsters do'
        }
        keys="w"
        icon={commands.pursuit ? 'footprints' : 'hourglass'}
        onClick={wait}
        disabled={!allowed('wait')}
        reason={reason('wait')}
        loading={commands.pendingType === 'wait'}
      />
      {!commands.pursuit && (
        <ActionButton
          label="Flee"
          tooltip="Run from the monsters without dropping anything"
          keys="shift+f"
          icon="footprints"
          onClick={flee}
          disabled={!allowed('evade')}
          reason={reason('evade')}
          loading={commands.pendingType === 'evade'}
        />
      )}
      <ActionBarDivider />
      <ActionButton
        label={commands.pursuit ? 'Turn and fight' : 'Fight'}
        tooltip={
          commands.pursuit
            ? 'Stop running and fight at the current distance'
            : 'Start a battle with the monsters'
        }
        keys="f"
        icon="battle"
        primary
        onClick={fight}
        disabled={!allowed('engage_battle')}
        reason={reason('engage_battle')}
        loading={commands.pendingType === 'engage_battle'}
      />
    </>
  );
}

function BattleActions() {
  const encounter = useEncounter();
  const party = useParty();
  const declarations = useDeclarations();
  const ctx = useTextContext();
  const people = useCombatPeople();
  const settings = useTableSettings();
  const canResolve = useCanResolveRound();
  const canResolveEarly = useCanResolveRound({ early: true });
  const { declare, resolve, pending } = useSendDeclaration();
  const repeat = useRepeatLastRound();
  const playing = useCombatUi((s) => s.playing);
  const skip = useCombatUi((s) => s.skip);
  const setComposing = useCombatUi((s) => s.setComposing);
  // While a member's choices are open, the bar steps aside, so A never declares something other than what the
  // player is looking at.
  const composing = useCombatUi((s) => s.composing);
  const setCollapsed = useCombatUi((s) => s.setCollapsed);
  const declarers = declarations?.declarers ?? encounter?.declarers ?? [];
  const declared = declarations?.declared ?? [];
  const mine = declarers.filter((id) => people.isMine(id));
  const next = mine.find((id) => !declared.includes(id)) ?? null;
  const nextMember = party.find((m) => m.id === next) ?? null;
  const casts = useMemberCasts(nextMember);
  const quick = useMemo(
    () =>
      nextMember ? quickAction(nextMember, encounter, memberGear(nextMember, ctx), ctx, { casts }) : null,
    [nextMember, encounter, ctx, casts],
  );
  const repeatable = repeat.candidates(mine.filter((id) => !declared.includes(id)));
  const everyone = declarers.length > 0 && declarers.every((id) => declared.includes(id));
  const waiting = declarers.filter((id) => !declared.includes(id));
  const auto = settings?.auto_resolve ?? true;
  const showResolve = canResolve.allowed && !auto;
  const refused = [
    ...new Set((declarations?.refusals ?? []).flatMap((refusal) => refusal.member_id ?? [])),
  ].map((id) => memberName(id, ctx));
  const resolveReason = resolveRoundReason({
    canResolve,
    canResolveEarly,
    auto,
    waiting,
    refused,
  });

  // The bar offers the same highlighted choice as the member's row: it declares it, or opens the Cast tab.
  const attack = () => {
    if (!next || !quick) return;
    if (quick.body) void declare(next, quick.body);
    else openComposer(next);
  };
  const again = () => {
    if (repeatable.length > 0) void repeat.run(mine);
  };
  // The round can't resolve while the session would refuse a declaration, so the bar's button and the command
  // palette's action are unavailable then, with the reason, like the board's button.
  const resolvable = showResolve && everyone && refused.length === 0;
  const resolveRound = () => {
    if (resolvable) void resolve();
  };
  const group = 'Battle';
  useShortcut({
    id: 'combat.quick',
    keys: 'a',
    label: 'Declare the suggested action for your next character',
    group,
    enabled: composing === null,
    run: attack,
  });
  useShortcut({
    id: 'combat.repeat',
    keys: 'shift+a',
    label: 'Declare the same as last round for all your characters',
    group,
    run: again,
  });
  useShortcut({
    id: 'combat.resolve',
    keys: 'mod+enter',
    label: 'Resolve round',
    group,
    enabled: showResolve,
    run: resolveRound,
  });
  const openComposer = (id: string) => {
    setCollapsed(false);
    setComposing(id);
  };
  useAction({
    id: 'combat.resolve',
    label: 'Resolve round',
    group,
    icon: 'play',
    shortcut: 'mod+enter',
    run: resolveRound,
    disabled: !resolvable,
    disabledReason: resolveReason,
  });

  return (
    <>
      {mine.slice(0, 9).map((id, index) => (
        <MemberKey
          key={id}
          slot={index + 1}
          memberId={id}
          name={party.find((m) => m.id === id)?.name ?? ''}
          onOpen={openComposer}
        />
      ))}
      {composing === null && nextMember && quick && (
        <ActionButton
          label={
            quick.body
              ? `Declare for ${nextMember.name}: ${quick.label}`
              : `${nextMember.name}: ${quick.label}`
          }
          keys="a"
          icon={QUICK_ICONS[quick.kind]}
          onClick={attack}
          disabled={pending}
          tooltip={quickTooltip(quick, nextMember.name)}
        />
      )}
      {repeatable.length > 0 && (
        <ActionButton
          label={repeatable.length > 1 ? 'Declare same as last round for all' : 'Declare same as last round'}
          keys="shift+a"
          icon="rotate"
          onClick={again}
          disabled={pending}
          tooltip={repeatTooltip(repeatable, ctx)}
        />
      )}
      {playing && skip && (
        <ActionButton
          label="Skip playback"
          tooltip="Skip to the end of the round"
          keys="escape"
          icon="skip-forward"
          onClick={skip}
        />
      )}
      {showResolve && (
        <>
          <ActionBarDivider />
          <ActionButton
            label="Resolve round"
            keys="mod+enter"
            icon="play"
            primary
            onClick={resolveRound}
            disabled={!resolvable || pending}
            reason={resolveReason}
          />
        </>
      )}
      {!showResolve && next === null && declarers.length > 0 && (
        <span className={styles.barNote}>
          {waiting.length > 0
            ? `Waiting for ${joinList(waiting.map((id) => memberName(id, ctx)))} to declare.`
            : auto
              ? 'Everyone has declared. The round resolves now.'
              : 'Everyone has declared. The caller or the referee resolves the round.'}
        </span>
      )}
    </>
  );
}

/** Registers a number key that opens one of the user's members' composer. Renders nothing. */
function MemberKey({
  slot,
  memberId,
  name,
  onOpen,
}: {
  slot: number;
  memberId: string;
  name: string;
  onOpen: (memberId: string) => void;
}) {
  useShortcut({
    id: `combat.member.${slot}`,
    keys: String(slot),
    label: `Choose ${name}'s action`,
    group: 'Battle',
    run: () => onOpen(memberId),
  });
  return null;
}
