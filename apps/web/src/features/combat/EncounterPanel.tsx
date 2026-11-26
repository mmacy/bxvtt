import type { EncounterGroupView, EncounterView, MemberView } from '@bxvtt/shared/bxapi';
import {
  conditionLabel,
  formatFeet,
  joinList,
  memberName,
  signed,
  stanceDescription,
  stanceLabel,
  capitalizeFirst,
  type TextContext,
} from '@bxvtt/shared/text';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  useEncounter,
  useParty,
  useRefereeLens,
  useRevision,
  useSendCommand,
  useTableId,
  useTableStoreApi,
  useTextContext,
} from '@/app';
import {
  Badge,
  Banner,
  Button,
  Checkbox,
  ConditionChip,
  cx,
  Field,
  Icon,
  List,
  ListItem,
  NumberInput,
  Popover,
  SectionLabel,
  Select,
  TokenPortrait,
  type IconName,
} from '@/ui';
import { showAftermath } from './Aftermath';
import { recordSnapshot } from './memory';
import { memberGear, type CarriedItem } from './model';
import { PlaybackStrip } from './PlaybackStrip';
import type { AnyEvent } from './playback';
import { MonsterRoster, RefereeActions } from './RefereeTools';
import {
  useEncounterCommands,
  useEncounterOpening,
  useTurnerClasses,
  type EncounterCommands,
} from './useEncounterCommands';
import { ACCEPT_ALL, usePlayback } from './usePlayback';
import styles from './combat.module.css';
import { useEncounterCreatures } from './text';
import { countBadge, countedGroup, groupHeading, theGroup, viewLabels } from './names';

/** What each bearing means for the party's choices, from the `wait` and `parley` command documentation. */
const STANCE_IMPLICATIONS: Record<string, string> = {
  attacks: 'Fight, or flee before battle begins.',
  hostile: 'If you wait, they will attack once their patience runs out.',
  uncertain: 'Wait to see what they do, or talk to roll their reaction again.',
  indifferent: 'Talk if you want to test their reaction.',
  friendly: 'They mean the party no harm.',
};

const STANCE_TONE: Record<string, 'danger' | 'warning' | 'neutral' | 'success'> = {
  attacks: 'danger',
  hostile: 'danger',
  uncertain: 'warning',
  indifferent: 'neutral',
  friendly: 'success',
};

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * The encounter overlay: who the party has met, how they bear themselves, any surprise or pursuit, and the
 * party's choices, each explained in a line.
 */
export function EncounterPanel() {
  const encounter = useEncounter();
  const party = useParty();
  const revision = useRevision();
  const tableId = useTableId();
  const ctx = useTextContext();
  const lens = useRefereeLens();
  const store = useTableStoreApi();
  const opening = useEncounterOpening();
  const commands = useEncounterCommands();
  // Entries since the encounter began on this client are news, so a result that arrives while the panel's code
  // loads still plays (#29). `usePlayback` reads `afterSeq` once, when the panel mounts.
  const playback = usePlayback({ accept: ACCEPT_ALL, afterSeq: store.getState().modeStartSeq });

  useEffect(() => {
    if (revision !== null) recordSnapshot({ tableId, revision, encounter, party });
  }, [tableId, revision, encounter, party]);

  useEffect(
    () => () => {
      const mode = store.getState().game?.mode;
      if (mode === 'exploring' || mode === 'town') showAftermath(store);
    },
    [store],
  );

  if (encounter === null) return null;
  const present = encounter.groups.filter((g) => !g.fled && g.count > 0);
  const gap = encounter.pursuit_gap_feet;
  const stance = encounter.stance;
  const title = commands.pursuit
    ? `${capitalizeFirst(joinList(present.map((g) => theGroup(viewLabels(g)))))} ${present.length === 1 && present[0]?.count === 1 ? 'gives' : 'give'} chase`
    : `The party meets ${joinList(present.map((g) => countedGroup(viewLabels(g))))}`;

  return (
    <div className={styles.board} role="region" aria-label="Encounter">
      <header className={styles.boardHead}>
        <div className={styles.boardTitle}>
          <Icon name={commands.pursuit ? 'footprints' : 'eye'} size={18} />
          <h2 className={styles.heading}>{title}</h2>
          {lens && (
            <Badge tone="referee" appearance="outline">
              Referee lens
            </Badge>
          )}
        </div>
      </header>

      <ul className={styles.groupCards} aria-label="Monster groups">
        {encounter.groups.map((group) => (
          <GroupCard key={group.id} group={group} />
        ))}
      </ul>

      {stance && !commands.pursuit && (
        <div className={cx(styles.bearing, styles[`bearing-${STANCE_TONE[stance] ?? 'neutral'}`])}>
          <SectionLabel level="none" className={styles.bearingLabel}>
            Bearing
          </SectionLabel>
          <Badge tone={STANCE_TONE[stance] ?? 'neutral'}>{stanceLabel(stance)}</Badge>
          <span className={styles.bearingText}>
            {stanceDescription(stance)} {STANCE_IMPLICATIONS[stance] ?? ''}
          </span>
        </div>
      )}

      {commands.pursuit && gap !== null && gap !== undefined && (
        <Banner tone="warning" title={`The pursuers are ${formatFeet(gap)} behind`} icon="footprints">
          Each round of running is one round of the chase. Drop coins to tempt clever pursuers or food to
          tempt hungry ones, or turn and fight.
        </Banner>
      )}
      {!commands.pursuit && opening.monstersSurprised && opening.partySurprised && (
        <Banner tone="info" title="Both sides are caught off guard">
          The party and the monsters surprised each other, so neither side gets a free round.
        </Banner>
      )}
      {!commands.pursuit && opening.monstersSurprised && !opening.partySurprised && (
        <Banner tone="success" title="The monsters are surprised">
          Engage now to take a free round before the monsters can act.
        </Banner>
      )}
      {!commands.pursuit && opening.partySurprised && !opening.monstersSurprised && (
        <Banner tone="warning" title="The party is caught off guard">
          The monsters surprised the party.
        </Banner>
      )}

      <PartyOptions encounter={encounter} party={party} commands={commands} ctx={ctx} />

      <PlaybackStrip
        playback={playback}
        ctx={ctx}
        summaryTitle="Result"
        idle={null}
        quietText={(item) => quietRound(item.commandType, encounter)}
      />

      {lens && (
        <details className={styles.refereeBlock}>
          <summary className={styles.refereeSummary}>
            <Icon name="referee" size={14} /> Monsters and referee tools
          </summary>
          <RefereeFacts events={opening.refereeEvents} />
          <MonsterRoster encounter={encounter} />
          <RefereeActions />
        </details>
      )}
    </div>
  );
}

/** What the monsters' bearing looks like after a quiet round, as a verb phrase for one or several. */
const QUIET_BEARING: Record<string, { one: string; many: string }> = {
  indifferent: { one: 'pays the party no mind', many: 'pay the party no mind' },
  friendly: { one: 'seems friendly', many: 'seem friendly' },
  uncertain: { one: "hasn't decided what to do yet", many: "haven't decided what to do yet" },
  hostile: { one: 'glares but holds back for now', many: 'glare but hold back for now' },
};

/**
 * What a round said when bxapi reported no events for it, such as a wait while the monsters ignore the party:
 * "The party waits a round. The clerk and the bandit pay the party no mind."
 */
export function quietRound(commandType: string | null, encounter: EncounterView): string {
  const lead = commandType === 'wait' ? 'The party waits a round.' : 'The round passes.';
  const present = encounter.groups.filter((g) => !g.fled && g.count > 0);
  const bearing = encounter.stance ? QUIET_BEARING[encounter.stance] : undefined;
  if (present.length === 0 || !bearing) return lead;
  const names = capitalizeFirst(joinList(present.map((g) => theGroup(viewLabels(g)))));
  const one = present.length === 1 && present[0]?.count === 1;
  return `${lead} ${names} ${one ? bearing.one : bearing.many}.`;
}

function GroupCard({ group }: { group: EncounterGroupView }) {
  const conditions = Object.entries(group.condition_counts);
  return (
    <li className={cx(styles.groupCard, group.fled && styles.groupFled)}>
      <TokenPortrait
        name={groupHeading(viewLabels(group))}
        kind="monster"
        size={40}
        state={group.count === 0 ? 'dead' : 'normal'}
        decorative
      />
      <div className={styles.groupInfo}>
        <span className={styles.groupTitle}>
          {groupHeading(viewLabels(group))}
          {countBadge(viewLabels(group)) && (
            <span className={styles.groupCount}>{countBadge(viewLabels(group))}</span>
          )}
        </span>
        <span className={styles.groupMeta}>
          {group.fled ? 'Escaped' : `${formatFeet(group.distance_feet)} away`}
          {group.categories.length > 0 && ` · ${group.categories.map(capitalize).join(', ')}`}
        </span>
        {conditions.length > 0 && (
          <span className={styles.groupConditionsRow}>
            {conditions.map(([condition, count]) => (
              <ConditionChip
                key={condition}
                label={`${count} ${conditionLabel(condition).toLowerCase()}`}
                tone="magic"
              />
            ))}
          </span>
        )}
      </div>
    </li>
  );
}

// The party's options ------------------------------------------------------------------------------------------

interface OptionProps {
  icon: IconName;
  label: string;
  description: ReactNode;
  disabledReason: string | null;
  primary?: boolean;
  loading?: boolean;
  shortcut?: string;
  onClick?: () => void;
  /** Whether `disabledReason` is the one the panel states above every choice, so the explanation stays. */
  sharedReason?: boolean;
  /** A party command, which only the caller or a referee may send, so the panel's sentence covers its refusal. */
  party?: boolean;
  /** A popover with more choices, instead of `onClick`. */
  popover?: { title: string; content: (close: () => void) => ReactNode };
}

function Option({
  icon,
  label,
  description,
  disabledReason,
  primary,
  loading,
  onClick,
  popover,
  sharedReason,
}: OptionProps) {
  const [open, setOpen] = useState(false);
  const button = (
    <Button
      size="sm"
      variant={primary ? 'primary' : 'secondary'}
      icon={icon}
      iconEnd={popover ? 'chevron-down' : undefined}
      disabled={disabledReason !== null}
      disabledReason={disabledReason}
      loading={loading}
      onClick={popover ? undefined : onClick}
    >
      {label}
    </Button>
  );
  return (
    <li className={styles.option}>
      {popover && disabledReason === null ? (
        <Popover
          open={open}
          onOpenChange={setOpen}
          title={popover.title}
          trigger={button}
          width="300px"
          side="top"
        >
          {popover.content(() => setOpen(false))}
        </Popover>
      ) : (
        button
      )}
      <span className={cx(styles.optionText, disabledReason && styles.optionDisabled)}>
        {disabledReason && !sharedReason ? disabledReason : description}
      </span>
    </li>
  );
}

function reasonFor(commands: EncounterCommands, type: string, memberId?: string): string | null {
  if (!commands.legal(type)) return null;
  const permission = commands.can(type, memberId);
  return permission.allowed ? null : permission.reason;
}

function PartyOptions({
  encounter,
  party,
  commands,
  ctx,
}: {
  encounter: EncounterView;
  party: readonly MemberView[];
  commands: EncounterCommands;
  ctx: TextContext;
}) {
  // One sentence above the choices says who chooses for the party, instead of the same refusal beside every
  // choice. Each button still gives its own reason on hover and focus.
  const partyReason = commands.partyPermission.reason;
  const able = party.filter((m) => encounter.declarers.includes(m.id));
  const turnerClasses = useTurnerClasses(able.map((m) => m.class_id));
  const turners = able.filter((m) => turnerClasses.includes(m.class_id));
  const undead = encounter.groups.some((g) => !g.fled && g.count > 0 && g.categories.includes('undead'));
  const busy = (type: string) => commands.pendingType === type;
  const sorted = [...able].sort((a, b) => b.npc_reaction_modifier - a.npc_reaction_modifier);
  const options: OptionProps[] = [];

  if (!commands.pursuit && commands.legal('parley')) {
    options.push({
      icon: 'message',
      label: 'Talk',
      description: `Roll the monsters' reaction again. ${commands.speaker ? `${commands.speaker.name} has the best reaction bonus.` : ''}`,
      disabledReason: reasonFor(commands, 'parley'),
      party: true,
      loading: busy('parley'),
      popover: {
        title: 'Choose a speaker',
        content: (close) => (
          <List
            aria-label="Choose a speaker"
            onValueChange={(id) => {
              commands.talk(id);
              close();
            }}
          >
            {sorted.map((member) => (
              <ListItem
                key={member.id}
                value={member.id}
                title={member.name}
                trailing={
                  <span className={styles.popoverMeta}>Reaction {signed(member.npc_reaction_modifier)}</span>
                }
              />
            ))}
          </List>
        ),
      },
    });
  }
  if (commands.legal('wait')) {
    options.push({
      icon: commands.pursuit ? 'footprints' : 'hourglass',
      label: commands.pursuit ? 'Keep running' : 'Wait',
      description: commands.pursuit
        ? 'Run one more round of the chase.'
        : 'Spend a round and see what the monsters do.',
      disabledReason: reasonFor(commands, 'wait'),
      party: true,
      loading: busy('wait'),
      onClick: commands.wait,
    });
  }
  if (!commands.pursuit && commands.legal('evade')) {
    options.push({
      icon: 'footprints',
      label: 'Flee',
      description: 'Flee before battle begins. Hostile monsters pursue if they can.',
      disabledReason: reasonFor(commands, 'evade'),
      party: true,
      loading: busy('evade'),
      popover: {
        title: 'Flee',
        content: (close) => (
          <List
            aria-label="How to flee"
            onValueChange={(drop) => {
              commands.flee(drop as 'none' | 'treasure' | 'food');
              close();
            }}
          >
            {(
              [
                ['none', 'Run', 'Drop nothing.'],
                ['treasure', 'Scatter coins', "Empty everyone's purse to tempt clever pursuers."],
                ['food', 'Drop food', 'Drop one ration per member to tempt hungry pursuers.'],
              ] as const
            ).map(([drop, label, hint]) => (
              <ListItem key={drop} value={drop} title={label} description={hint} />
            ))}
          </List>
        ),
      },
    });
  }
  if (commands.legal('engage_battle')) {
    options.push({
      icon: 'battle',
      label: commands.pursuit ? 'Turn and fight' : 'Fight',
      description: commands.pursuit
        ? 'Stop running and fight at the current distance.'
        : 'Engage in battle. Everyone declares an action before each round resolves.',
      disabledReason: reasonFor(commands, 'engage_battle'),
      party: true,
      loading: busy('engage_battle'),
      primary: true,
      onClick: commands.fight,
    });
  }
  if (!commands.pursuit && commands.legal('turn_undead') && turners.length > 0) {
    // The button opens for anyone who can act for one of the turners. Only a viewer who can act for none of them
    // sees why, with the first turner's reason.
    const ownTurner = turners.find((member) => commands.can('turn_undead', member.id).allowed);
    options.push({
      icon: 'class-cleric',
      label: 'Turn undead',
      description: undead
        ? `Present a holy symbol. Any undead left standing attack at once.`
        : 'None of these monsters are undead.',
      disabledReason: undead
        ? ownTurner
          ? null
          : reasonFor(commands, 'turn_undead', turners[0]?.id)
        : 'None of these monsters are undead.',
      loading: busy('turn_undead'),
      popover:
        turners.length > 1
          ? {
              title: 'Choose who turns undead',
              content: (close) => (
                <List
                  aria-label="Choose who turns undead"
                  onValueChange={(id) => {
                    commands.turn(id);
                    close();
                  }}
                >
                  {turners.map((member) => (
                    <ListItem
                      key={member.id}
                      value={member.id}
                      title={member.name}
                      disabled={!commands.can('turn_undead', member.id).allowed}
                      disabledReason={commands.can('turn_undead', member.id).reason}
                    />
                  ))}
                </List>
              ),
            }
          : undefined,
      onClick: () => ownTurner && commands.turn(ownTurner.id),
    });
  }

  return (
    <div className={styles.optionsBlock}>
      {partyReason && <p className={styles.partyReason}>{partyReason}</p>}
      <ul className={styles.options} aria-label="Encounter actions">
        {options.map((option) => (
          <Option
            key={option.label}
            {...option}
            sharedReason={
              option.party === true && option.disabledReason !== null && !commands.partyPermission.allowed
            }
          />
        ))}
      </ul>
      <ItemOptions encounter={encounter} party={party} commands={commands} ctx={ctx} />
    </div>
  );
}

// Items in an encounter ----------------------------------------------------------------------------------------

function ItemOptions({
  encounter,
  party,
  commands,
  ctx,
}: {
  encounter: EncounterView;
  party: readonly MemberView[];
  commands: EncounterCommands;
  ctx: TextContext;
}) {
  const able = party.filter((m) => encounter.declarers.includes(m.id));
  const controllable = able.filter(
    (m) => commands.can('give_items', m.id).allowed || commands.can('use_item', m.id).allowed,
  );
  if (controllable.length === 0) return null;
  return (
    <div className={styles.itemOptions}>
      {commands.legal('use_item') && (
        <UseItemPopover members={controllable} encounter={encounter} ctx={ctx} />
      )}
      {commands.legal('give_items') && able.length > 1 && (
        <GivePopover members={controllable} all={able} ctx={ctx} />
      )}
      {commands.legal('drop_items') && (
        <DropPopover members={controllable} ctx={ctx} pursuit={commands.pursuit} />
      )}
    </div>
  );
}

function useMemberItems(member: MemberView | undefined, ctx: TextContext): CarriedItem[] {
  return useMemo(() => (member ? memberGear(member, ctx).items : []), [member, ctx]);
}

function MemberSelect({
  members,
  value,
  onChange,
  label,
}: {
  members: readonly MemberView[];
  value: string;
  onChange: (id: string) => void;
  label: string;
}) {
  return (
    <Field label={label}>
      <Select
        size="sm"
        value={value}
        onValueChange={onChange}
        options={members.map((m) => ({ value: m.id, label: m.name }))}
      />
    </Field>
  );
}

function UseItemPopover({
  members,
  encounter,
  ctx,
}: {
  members: MemberView[];
  encounter: EncounterView;
  ctx: TextContext;
}) {
  const creatures = useEncounterCreatures();
  const { send, pending } = useSendCommand();
  const [open, setOpen] = useState(false);
  const [memberId, setMemberId] = useState(members[0]?.id ?? '');
  const member = members.find((m) => m.id === memberId);
  const items = useMemberItems(member, ctx).filter((i) => i.magic && i.kind !== 'magic');
  const [itemId, setItemId] = useState('');
  const item = items.find((i) => i.id === itemId) ?? items[0];
  const [target, setTarget] = useState('');
  const [error, setError] = useState<string | null>(null);
  const targets =
    item?.kind === 'potion'
      ? encounter.declarers.map((id) => ({
          value: id,
          label: id === memberId ? `${memberName(id, ctx)} drinks it` : `Give it to ${memberName(id, ctx)}`,
        }))
      : [
          { value: '', label: 'No target' },
          ...encounter.groups
            .filter((g) => !g.fled && g.count > 0)
            .map((g) => ({ value: g.id, label: `At ${theGroup(viewLabels(g))}` })),
          ...creatures
            .filter((creature) => creature.status === 'alive')
            .map((creature) => ({ value: creature.id, label: `At ${creature.name}` })),
          ...encounter.declarers.map((id) => ({ value: id, label: `On ${memberName(id, ctx)}` })),
        ];
  const use = async () => {
    if (!item) return;
    setError(null);
    const result = await send(
      {
        command_type: 'use_item',
        character_id: memberId,
        item_id: item.id,
        target_id: target === '' ? null : target,
      },
      { display: 'inline' },
    );
    if (result.status === 'accepted') setOpen(false);
    else if (result.status === 'refused' || result.status === 'error') setError(result.message);
  };
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      title="Use an item"
      width="300px"
      side="top"
      trigger={
        <Button size="sm" variant="ghost" icon="potion">
          Use an item
        </Button>
      }
    >
      <div className={styles.popoverForm}>
        <MemberSelect
          members={members}
          value={memberId}
          onChange={(id) => {
            setMemberId(id);
            setItemId('');
            setTarget('');
          }}
          label="Who"
        />
        {items.length === 0 ? (
          <p className={styles.choiceHint}>
            {member?.name ?? 'This member'} carries no potion, scroll, wand, staff, or rod.
          </p>
        ) : (
          <>
            <Field label="Item">
              <Select
                size="sm"
                value={item?.id ?? ''}
                onValueChange={setItemId}
                options={items.map((i) => ({ value: i.id, label: capitalize(i.name) }))}
              />
            </Field>
            <Field label={item?.kind === 'potion' ? 'Who drinks it' : 'Target'}>
              <Select
                size="sm"
                value={target || (item?.kind === 'potion' ? memberId : '')}
                onValueChange={setTarget}
                options={targets}
              />
            </Field>
            <p className={styles.choiceHint}>Using an item takes one round, after which the monsters act.</p>
            {error && <Banner tone="danger">{error}</Banner>}
            <Button size="sm" variant="primary" loading={pending} onClick={() => void use()}>
              Use {item?.name ?? 'the item'}
            </Button>
          </>
        )}
      </div>
    </Popover>
  );
}

function GivePopover({ members, all, ctx }: { members: MemberView[]; all: MemberView[]; ctx: TextContext }) {
  const { send, pending } = useSendCommand();
  const [open, setOpen] = useState(false);
  const [giverId, setGiverId] = useState(members[0]?.id ?? '');
  const giver = members.find((m) => m.id === giverId);
  const items = useMemberItems(giver, ctx);
  const recipients = all.filter((m) => m.id !== giverId);
  const [recipientId, setRecipientId] = useState('');
  const [itemId, setItemId] = useState('');
  const [gold, setGold] = useState<number | null>(0);
  const [error, setError] = useState<string | null>(null);
  const recipient = recipientId || recipients[0]?.id || '';
  const give = async () => {
    setError(null);
    const result = await send(
      {
        command_type: 'give_items',
        character_id: giverId,
        recipient_id: recipient,
        item_ids: itemId ? [itemId] : [],
        coins: { pp: 0, gp: gold ?? 0, ep: 0, sp: 0, cp: 0 },
      },
      { display: 'inline' },
    );
    if (result.status === 'accepted') setOpen(false);
    else if (result.status === 'refused' || result.status === 'error') setError(result.message);
  };
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      title="Give items"
      width="300px"
      side="top"
      trigger={
        <Button size="sm" variant="ghost" icon="hand">
          Give items
        </Button>
      }
    >
      <div className={styles.popoverForm}>
        <MemberSelect
          members={members}
          value={giverId}
          onChange={(id) => {
            setGiverId(id);
            setItemId('');
            setRecipientId('');
          }}
          label="From"
        />
        <MemberSelect members={recipients} value={recipient} onChange={setRecipientId} label="To" />
        <Field label="Item">
          <Select
            size="sm"
            value={itemId || 'none'}
            onValueChange={(value) => setItemId(value === 'none' ? '' : value)}
            options={[
              { value: 'none', label: 'No item' },
              ...items.map((i) => ({ value: i.id, label: capitalize(i.name) })),
            ]}
          />
        </Field>
        <Field label="Gold pieces">
          <NumberInput value={gold} onChange={setGold} min={0} max={100000} width={6} />
        </Field>
        <p className={styles.choiceHint}>Giving items takes one round.</p>
        {error && <Banner tone="danger">{error}</Banner>}
        <Button
          size="sm"
          variant="primary"
          loading={pending}
          disabled={!itemId && !gold}
          disabledReason="Choose an item or some gold to give."
          onClick={() => void give()}
        >
          Give
        </Button>
      </div>
    </Popover>
  );
}

function DropPopover({
  members,
  ctx,
  pursuit,
}: {
  members: MemberView[];
  ctx: TextContext;
  pursuit: boolean;
}) {
  const { send, pending } = useSendCommand();
  const [open, setOpen] = useState(false);
  const [memberId, setMemberId] = useState(members[0]?.id ?? '');
  const member = members.find((m) => m.id === memberId);
  const items = useMemberItems(member, ctx);
  const [chosen, setChosen] = useState<string[]>([]);
  const [gold, setGold] = useState<number | null>(0);
  const [error, setError] = useState<string | null>(null);
  const drop = async () => {
    setError(null);
    const result = await send(
      {
        command_type: 'drop_items',
        character_id: memberId,
        item_ids: chosen,
        coins: { pp: 0, gp: gold ?? 0, ep: 0, sp: 0, cp: 0 },
      },
      { display: 'inline' },
    );
    if (result.status === 'accepted') {
      setOpen(false);
      setChosen([]);
    } else if (result.status === 'refused' || result.status === 'error') setError(result.message);
  };
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      title={pursuit ? 'Drop bait for pursuers' : 'Drop items'}
      width="300px"
      side="top"
      trigger={
        <Button size="sm" variant={pursuit ? 'secondary' : 'ghost'} icon="coins">
          {pursuit ? 'Drop bait' : 'Drop items'}
        </Button>
      }
    >
      <div className={styles.popoverForm}>
        <MemberSelect
          members={members}
          value={memberId}
          onChange={(id) => {
            setMemberId(id);
            setChosen([]);
          }}
          label="Who"
        />
        <div className={styles.checkList}>
          {items.map((item) => (
            <Checkbox
              key={item.id}
              label={`${capitalize(item.name)}${item.quantity > 1 ? ` (one of ${item.quantity})` : ''}`}
              checked={chosen.includes(item.id)}
              onCheckedChange={(checked) =>
                setChosen((list) => (checked ? [...list, item.id] : list.filter((id) => id !== item.id)))
              }
            />
          ))}
        </div>
        <Field label="Gold pieces">
          <NumberInput value={gold} onChange={setGold} min={0} max={100000} width={6} />
        </Field>
        <p className={styles.choiceHint}>
          {pursuit
            ? 'Items dropped during a chase are lost. Coins tempt clever pursuers, while food tempts hungry ones.'
            : 'Dropped goods stay on the floor here. Dropping items takes one round.'}
        </p>
        {error && <Banner tone="danger">{error}</Banner>}
        <Button
          size="sm"
          variant="primary"
          loading={pending}
          disabled={chosen.length === 0 && !gold}
          disabledReason="Choose an item or some gold to drop."
          onClick={() => void drop()}
        >
          Drop
        </Button>
      </div>
    </Popover>
  );
}

// Referee facts ------------------------------------------------------------------------------------------------

function RefereeFacts({ events }: { events: AnyEvent[] }) {
  const lines: string[] = [];
  for (const event of events) {
    if (event.event_type === 'reaction_rolled') {
      const roll = typeof event.roll === 'number' ? event.roll : 0;
      const modifier = typeof event.modifier === 'number' ? event.modifier : 0;
      const total = typeof event.total === 'number' ? event.total : roll + modifier;
      const result = typeof event.result === 'string' ? stanceLabel(event.result).toLowerCase() : '';
      lines.push(`Reaction roll: ${roll} ${signed(modifier)} = ${total}, ${result}.`);
    } else if (event.event_type === 'surprise_rolled') {
      const side = event.side === 'party' ? 'The party' : 'The monsters';
      const roll = typeof event.roll === 'number' ? event.roll : null;
      const threshold = typeof event.threshold === 'number' ? event.threshold : null;
      lines.push(
        `${side} rolled ${roll ?? 'no die'} for surprise${threshold !== null ? `, surprised on 1-${threshold}` : ''}: ${event.surprised === true ? 'surprised' : 'not surprised'}.`,
      );
    }
  }
  if (lines.length === 0) return null;
  return (
    <ul className={styles.refereeFacts}>
      {lines.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
}
