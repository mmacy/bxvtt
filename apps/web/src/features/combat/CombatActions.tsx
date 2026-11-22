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
import { ActionBarDivider, ActionBarItem, Button, Kbd } from '@/ui';
import { quickAction, useRepeatLastRound } from './BattleBoard';
import { memberGear } from './model';
import { useCombatPeople } from './people';
import { useCombatUi } from './state';
import { useEncounterCommands } from './useEncounterCommands';
import styles from './combat.module.css';

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
}: {
  label: string;
  keys: string;
  onClick: () => void;
  disabled?: boolean;
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
        loading={loading}
        title={disabled ? (reason ?? undefined) : `${label} (${formatShortcut(keys)})`}
        aria-keyshortcuts={keys}
        onClick={onClick}
      >
        {label}
        <Kbd className={styles.barKey} keys={formatShortcut(keys)} />
      </Button>
    </ActionBarItem>
  );
}

function EncounterActions() {
  const commands = useEncounterCommands();
  const speaker = commands.speaker;
  const allowed = (type: string) => commands.legal(type) && commands.can(type).allowed && !commands.pending;
  const reason = (type: string) =>
    commands.legal(type) ? commands.can(type).reason : "The party can't do that now.";
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
  });
  useAction({
    id: 'combat.wait',
    label: commands.pursuit ? 'Keep running' : 'Wait a round',
    group,
    icon: 'hourglass',
    shortcut: 'w',
    run: wait,
    disabled: !allowed('wait'),
  });

  return (
    <>
      {!commands.pursuit && (
        <ActionButton
          label={speaker ? `Talk (${speaker.name})` : 'Talk'}
          keys="t"
          icon="message"
          onClick={talk}
          disabled={!allowed('parley') || speaker === null}
          reason={reason('parley')}
          loading={commands.pendingType === 'parley'}
        />
      )}
      <ActionButton
        label={commands.pursuit ? 'Keep running' : 'Wait'}
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
  const { declare, resolve, pending } = useSendDeclaration();
  const repeat = useRepeatLastRound();
  const playing = useCombatUi((s) => s.playing);
  const skip = useCombatUi((s) => s.skip);
  const setComposing = useCombatUi((s) => s.setComposing);
  const setCollapsed = useCombatUi((s) => s.setCollapsed);
  const declarers = declarations?.declarers ?? encounter?.declarers ?? [];
  const declared = declarations?.declared ?? [];
  const mine = declarers.filter((id) => people.isMine(id));
  const next = mine.find((id) => !declared.includes(id)) ?? null;
  const nextMember = party.find((m) => m.id === next) ?? null;
  const quick = useMemo(
    () => (nextMember ? quickAction(nextMember, encounter, memberGear(nextMember, ctx), ctx) : null),
    [nextMember, encounter, ctx],
  );
  const repeatable = repeat.candidates(mine.filter((id) => !declared.includes(id)));
  const everyone = declarers.length > 0 && declarers.every((id) => declared.includes(id));
  const auto = settings?.auto_resolve ?? true;
  const showResolve = canResolve.allowed && !auto;

  const attack = () => {
    if (next && quick?.body) void declare(next, quick.body);
  };
  const again = () => {
    if (repeatable.length > 0) void repeat.run(mine);
  };
  const resolveRound = () => {
    if (showResolve && everyone) void resolve();
  };
  const group = 'Battle';
  useShortcut({ id: 'combat.quick', keys: 'a', label: 'Attack the nearest monsters', group, run: attack });
  useShortcut({
    id: 'combat.repeat',
    keys: 'shift+a',
    label: 'Same as last round for all your characters',
    group,
    run: again,
  });
  useShortcut({
    id: 'combat.resolve',
    keys: 'mod+enter',
    label: 'Resolve the round',
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
    label: 'Resolve the round',
    group,
    icon: 'play',
    shortcut: 'mod+enter',
    run: resolveRound,
    disabled: !(showResolve && everyone),
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
      {nextMember && quick && (
        <ActionButton
          label={quick.body ? `${nextMember.name}: ${quick.label}` : `${nextMember.name} can't reach anyone`}
          keys="a"
          icon={quick.body?.action === 'move' ? 'footprints' : 'weapon-sword'}
          onClick={attack}
          disabled={quick.body === null || pending}
          reason={quick.reason}
        />
      )}
      {repeatable.length > 0 && (
        <ActionButton
          label={repeatable.length > 1 ? 'Same as last round for all' : 'Same as last round'}
          keys="shift+a"
          icon="rotate"
          onClick={again}
          disabled={pending}
        />
      )}
      {playing && skip && (
        <ActionButton label="Skip the playback" keys="escape" icon="chevron-right" onClick={skip} />
      )}
      {showResolve && (
        <>
          <ActionBarDivider />
          <ActionButton
            label="Resolve the round"
            keys="mod+enter"
            icon="play"
            primary
            onClick={resolveRound}
            disabled={!everyone || pending}
            reason="Everyone declares first."
          />
        </>
      )}
      {!showResolve && mine.length === 0 && <span className={styles.barNote}>The party is declaring.</span>}
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
