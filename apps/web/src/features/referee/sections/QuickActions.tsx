/**
 * Quick actions: the referee commands a referee reaches for during play, each as a small form with pickers.
 * Where a purpose-built form adds nothing, the action reuses the schema-driven `CommandForm`.
 */
import { directionLabel, formatFeet } from '@bxvtt/shared/text';
import { useMemo, useState, type ReactNode } from 'react';
import { useLegalCommands, useParty, type GameCommand } from '@/app';
import {
  Accordion,
  Button,
  Combobox,
  DiceRoll,
  type DieSides,
  Field,
  Icon,
  type IconName,
  NumberInput,
  RadioGroup,
  SectionLabel,
  SegmentedControl,
  Select,
  TextInput,
} from '@/ui';
import { areaAt, areaCenter, findArea, findLevel, type AreaSpec } from '../model/adventure';
import {
  dungeonNumberAppearing,
  MapPickButton,
  MonsterPicker,
  useAreaOptions,
  useFullMonsters,
} from '../pickers';
import { IdMark } from '../details';
import { CommandOutcome, useRefereeCommand } from '../RefereeCommand';
import { CommandForm } from '../schema/CommandForm';
import type { RefereeData } from '../useReferee';
import { EndEncounterForm } from './EncounterNow';
import { ArrivalFollowUps } from './FollowUps';
import { changesEndedStory, useGameEnded } from '../endedGuard';
import { NameComma, UnavailableMark } from '../UnavailableMark';
import styles from './sections.module.css';

type Toggle<T extends string> = { value: T; label: string };

function ModeSwitch<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: ReadonlyArray<Toggle<T>>;
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <SegmentedControl
      aria-label={label}
      value={value}
      onValueChange={(next) => onChange(next as T)}
      options={options.map((o) => ({ value: o.value, label: o.label }))}
    />
  );
}

function ItemsAction() {
  const [mode, setMode] = useState<'give' | 'take'>('give');
  return (
    <div className={styles.form}>
      <ModeSwitch
        label="Give or take"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'give', label: 'Give an item' },
          { value: 'take', label: 'Take an item' },
        ]}
      />
      <CommandForm key={mode} commandType={mode === 'give' ? 'grant_item' : 'remove_item'} />
    </div>
  );
}

function CoinsAction() {
  const [mode, setMode] = useState<'give' | 'take'>('give');
  return (
    <div className={styles.form}>
      <ModeSwitch
        label="Give or take"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'give', label: 'Give coins' },
          { value: 'take', label: 'Take coins' },
        ]}
      />
      <CommandForm key={mode} commandType={mode === 'give' ? 'grant_coins' : 'remove_coins'} />
    </div>
  );
}

function MembersAction() {
  const [mode, setMode] = useState<'add' | 'remove'>('add');
  return (
    <div className={styles.form}>
      <ModeSwitch
        label="Add or remove"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'add', label: 'Add a member' },
          { value: 'remove', label: 'Remove a member' },
        ]}
      />
      <CommandForm key={mode} commandType={mode === 'add' ? 'add_member' : 'remove_member'} />
    </div>
  );
}

const EVERYONE = '__everyone__';

/** Experience for one member or for every living member, one `award_xp` each. */
function AwardXpAction() {
  const party = useParty();
  const [who, setWho] = useState<string | null>(EVERYONE);
  const [amount, setAmount] = useState<number | null>(100);
  const { runAll, busy, outcome, clear } = useRefereeCommand();
  const [error, setError] = useState<string | null>(null);
  const targets =
    who === EVERYONE ? party.filter((m) => m.current_hp > 0).map((m) => m.id) : who ? [who] : [];
  const submit = () => {
    if (amount === null || amount < 0) return setError('Enter an amount of 0 or more.');
    if (targets.length === 0) return setError('Choose who receives it.');
    setError(null);
    void runAll(targets.map((id) => ({ command_type: 'award_xp', character_id: id, amount })));
  };
  return (
    <div className={styles.form}>
      <Field label="Receiver" hint="Each member gets the full amount, before the prime requisite adjustment.">
        <Select
          options={[
            { value: EVERYONE, label: 'Every living member' },
            ...party.map((m) => ({ value: m.id, label: m.name })),
          ]}
          value={who ?? undefined}
          onValueChange={setWho}
        />
      </Field>
      <Field label="Experience points" error={error ?? undefined}>
        <NumberInput value={amount} min={0} step={25} onChange={setAmount} />
      </Field>
      <div className={styles.rowActions}>
        <Button size="sm" variant="primary" loading={busy} onClick={submit}>
          Award XP
        </Button>
      </div>
      <CommandOutcome outcome={outcome} onDismiss={clear} />
    </div>
  );
}

const DISTANCES = [10, 30, 60, 90, 120];

function CountField({
  mode,
  onModeChange,
  fixed,
  onFixedChange,
  dice,
  onDiceChange,
  error,
  what,
}: {
  mode: 'fixed' | 'dice';
  onModeChange: (mode: 'fixed' | 'dice') => void;
  fixed: number | null;
  onFixedChange: (value: number | null) => void;
  dice: string;
  onDiceChange: (value: string) => void;
  error?: string;
  what: string;
}) {
  return (
    <Field
      label={`How many ${what}`}
      hint={mode === 'dice' ? 'The game rolls the dice, so the roll is logged and seeded.' : undefined}
      error={error}
      aside={
        <SegmentedControl
          size="sm"
          aria-label="Count by"
          value={mode}
          onValueChange={(next) => onModeChange(next as 'fixed' | 'dice')}
          options={[
            { value: 'fixed', label: 'Exactly' },
            { value: 'dice', label: 'Roll' },
          ]}
        />
      }
    >
      {mode === 'fixed' ? (
        <NumberInput value={fixed} min={1} onChange={onFixedChange} />
      ) : (
        <TextInput value={dice} onChange={(e) => onDiceChange(e.target.value)} placeholder="2d4" />
      )}
    </Field>
  );
}

function DistanceField({
  value,
  onChange,
  error,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  error?: string;
}) {
  return (
    <Field label="Distance in feet" hint="A wandering encounter is usually 2d6 × 10 feet away." error={error}>
      <div className={styles.rowActions}>
        <NumberInput value={value} min={0} step={10} onChange={onChange} width={104} />
        {DISTANCES.map((d) => (
          <Button
            key={d}
            size="sm"
            variant="ghost"
            aria-pressed={value === d}
            aria-label={formatFeet(d)}
            onClick={() => onChange(d)}
          >
            {formatFeet(d, 'short')}
          </Button>
        ))}
      </div>
    </Field>
  );
}

/** Spawns monsters, by which, how many, and how far. Also used from the generators. */
export function SpawnMonstersForm({
  data,
  initialMonster = null,
  initialCount = 1,
}: {
  data: RefereeData;
  initialMonster?: string | null;
  initialCount?: number;
}) {
  const [monster, setMonster] = useState<string | null>(initialMonster);
  const [mode, setMode] = useState<'fixed' | 'dice'>('fixed');
  const [fixed, setFixed] = useState<number | null>(initialCount);
  const [dice, setDice] = useState('1d6');
  const [distance, setDistance] = useState<number | null>(30);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const full = useFullMonsters();
  const { run, busy, outcome, clear } = useRefereeCommand();
  // A newly chosen monster rolls its dungeon number appearing by default, as its entry prints it.
  const chooseMonster = (id: string | null) => {
    setMonster(id);
    const appearing = dungeonNumberAppearing(full?.find((m) => m.id === id));
    if (appearing && /d/i.test(appearing)) {
      setMode('dice');
      setDice(appearing);
    }
  };
  const submit = () => {
    const next: Record<string, string> = {};
    if (!monster) next.monster = 'Choose a monster.';
    if (mode === 'fixed' && (fixed === null || fixed < 1)) next.count = 'Enter 1 or more.';
    if (mode === 'dice' && dice.trim() === '') next.count = 'Enter dice, such as 2d4.';
    if (distance === null || distance < 0) next.distance = 'Enter 0 or more.';
    setErrors(next);
    if (Object.keys(next).length > 0 || !monster || distance === null) return;
    const command: GameCommand = {
      command_type: 'spawn_monsters',
      template_id: monster,
      distance_feet: distance,
    };
    if (mode === 'fixed') command.count_fixed = fixed;
    else command.count_dice = dice.trim();
    void run(command);
  };
  return (
    <div className={styles.form}>
      <Field label="Monster" error={errors.monster}>
        <MonsterPicker
          value={monster}
          onChange={chooseMonster}
          adventure={data.adventure}
          invalid={Boolean(errors.monster)}
        />
      </Field>
      <CountField
        what="monsters"
        mode={mode}
        onModeChange={setMode}
        fixed={fixed}
        onFixedChange={setFixed}
        dice={dice}
        onDiceChange={setDice}
        error={errors.count}
      />
      <DistanceField value={distance} onChange={setDistance} error={errors.distance} />
      <div className={styles.rowActions}>
        <Button size="sm" variant="primary" loading={busy} onClick={submit}>
          Spawn
        </Button>
        <span className={styles.secondary}>They join the open encounter, or start a new one.</span>
      </div>
      <CommandOutcome outcome={outcome} onDismiss={clear} />
    </div>
  );
}

function SpawnNpcPartyForm() {
  const [kind, setKind] = useState('basic');
  const [mode, setMode] = useState<'fixed' | 'dice'>('dice');
  const [fixed, setFixed] = useState<number | null>(4);
  const [dice, setDice] = useState('1d4+3');
  const [distance, setDistance] = useState<number | null>(60);
  const { run, busy, outcome, clear } = useRefereeCommand();
  const submit = () => {
    if (distance === null) return;
    const command: GameCommand = {
      command_type: 'spawn_npc_party',
      party_kind: kind,
      distance_feet: distance,
    };
    if (mode === 'fixed') command.count_fixed = fixed;
    else command.count_dice = dice.trim();
    void run(command);
  };
  return (
    <div className={styles.form}>
      <RadioGroup
        aria-label="Party kind"
        orientation="horizontal"
        value={kind}
        onValueChange={setKind}
        options={[
          { value: 'basic', label: 'Basic', description: 'Low-level adventurers' },
          { value: 'expert', label: 'Expert', description: 'Higher-level adventurers' },
        ]}
      />
      <CountField
        what="adventurers"
        mode={mode}
        onModeChange={setMode}
        fixed={fixed}
        onFixedChange={setFixed}
        dice={dice}
        onDiceChange={setDice}
      />
      <DistanceField value={distance} onChange={setDistance} />
      <div className={styles.rowActions}>
        <Button size="sm" variant="primary" loading={busy} onClick={submit}>
          Spawn the party
        </Button>
        <span className={styles.secondary}>Only while exploring.</span>
      </div>
      <CommandOutcome outcome={outcome} onDismiss={clear} />
    </div>
  );
}

const FACINGS = ['north', 'east', 'south', 'west'] as const;

/** A picked cell in words: `Level 1, Guardroom`, or `Level 2, a corridor`. */
function pickedPlace(
  data: RefereeData,
  cell: { dungeon_id: string; level_number: number; x: number; y: number },
): string {
  const level = data.adventure ? findLevel(data.adventure, cell.dungeon_id, cell.level_number) : null;
  const area = level ? areaAt(level, cell.x, cell.y) : null;
  return `Level ${cell.level_number}, ${area ? area.name : 'a corridor'}`;
}

/** Moves the party to town, to an area of the key, or to a cell picked on the map. */
function PlacePartyForm({ data }: { data: RefereeData }) {
  const [where, setWhere] = useState<'area' | 'cell' | 'town'>('area');
  const [area, setArea] = useState<string | null>(null);
  const [cell, setCell] = useState<{ dungeon_id: string; level_number: number; x: number; y: number } | null>(
    null,
  );
  const [facing, setFacing] = useState<string>('north');
  const [error, setError] = useState<string | null>(null);
  const areas = useAreaOptions(data.adventure);
  const { run, busy, outcome, clear } = useRefereeCommand();
  const [placed, setPlaced] = useState<{ dungeonId: string; levelNumber: number; area: AreaSpec } | null>(
    null,
  );
  const submit = async () => {
    setPlaced(null);
    if (where === 'town') return void run({ command_type: 'place_party', location: { kind: 'town' } });
    let target = cell;
    if (where === 'area') {
      const [, , areaId] = (area ?? '').split(':');
      const found = areaId && data.adventure ? findArea(data.adventure, areaId) : null;
      if (!found) return setError('Choose an area.');
      const [x, y] = areaCenter(found.area);
      target = { dungeon_id: found.dungeon.id, level_number: found.level.number, x, y };
    }
    if (!target) return setError('Pick a cell on the map.');
    setError(null);
    const ok = await run({
      command_type: 'place_party',
      location: {
        kind: 'dungeon',
        dungeon_id: target.dungeon_id,
        level_number: target.level_number,
        position: [target.x, target.y],
        facing,
      },
    });
    const level = data.adventure ? findLevel(data.adventure, target.dungeon_id, target.level_number) : null;
    const landed = level ? areaAt(level, target.x, target.y) : null;
    if (ok && landed)
      setPlaced({ dungeonId: target.dungeon_id, levelNumber: target.level_number, area: landed });
  };
  return (
    <div className={styles.form}>
      <SegmentedControl
        aria-label="Where to"
        value={where}
        onValueChange={(next) => setWhere(next as typeof where)}
        options={[
          { value: 'area', label: 'An area' },
          { value: 'cell', label: 'A cell' },
          { value: 'town', label: 'Town' },
        ]}
      />
      {where === 'area' && (
        <Field
          label="Area"
          hint="The party lands on the cell nearest the middle of the area."
          error={error ?? undefined}
        >
          <Combobox options={areas} value={area} onChange={setArea} placeholder="Search areas" />
        </Field>
      )}
      {where === 'cell' && (
        <div className={styles.form}>
          <div className={styles.rowActions}>
            <MapPickButton
              kind="cell"
              prompt="Pick the cell to place the party on. Click it, or use the arrow keys and press Enter."
              onPick={(t) => setCell(t)}
            />
            {cell && (
              <span className={styles.secondary}>
                {pickedPlace(data, cell)}
                <IdMark className={styles.idMark}>
                  {' · '}cell {cell.x}, {cell.y}
                </IdMark>
              </span>
            )}
          </div>
          {error && !cell && <p className={styles.secondaryLine}>{error}</p>}
        </div>
      )}
      {where !== 'town' && (
        <Field label="Facing">
          <Select
            options={FACINGS.map((f) => ({ value: f, label: directionLabel(f) }))}
            value={facing}
            onValueChange={setFacing}
          />
        </Field>
      )}
      <div className={styles.rowActions}>
        <Button size="sm" variant="primary" loading={busy} onClick={() => void submit()}>
          Place the party
        </Button>
      </div>
      {where !== 'town' && (
        <p className={styles.secondaryLine}>
          Placing the party doesn't start an area's monsters or fire its triggers, as walking in would. The
          panel offers to start them once the party is there.
        </p>
      )}
      <CommandOutcome outcome={outcome} onDismiss={clear} />
      {placed && (
        <ArrivalFollowUps
          data={data}
          dungeonId={placed.dungeonId}
          levelNumber={placed.levelNumber}
          area={placed.area}
        />
      )}
    </div>
  );
}

const TIME_STEPS: ReadonlyArray<{ label: string; n: number; unit: string }> = [
  { label: '1 round', n: 1, unit: 'round' },
  { label: '1 turn', n: 1, unit: 'turn' },
  { label: '1 hour', n: 6, unit: 'turn' },
  { label: '8 hours', n: 48, unit: 'turn' },
  { label: '1 day', n: 1, unit: 'day' },
];

function AdvanceTimeForm() {
  const { run, busy, outcome, clear } = useRefereeCommand();
  return (
    <div className={styles.form}>
      <div className={styles.rowActions} role="group" aria-label="Advance the clock by">
        {TIME_STEPS.map((step) => (
          <Button
            key={step.label}
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => run({ command_type: 'advance_time', n: step.n, unit: step.unit })}
          >
            {step.label}
          </Button>
        ))}
      </div>
      <p className={styles.secondaryLine}>
        Effects run out, lights burn down, and the party eats each day as usual. The game makes no wandering
        monster checks for this time, and it doesn't count as rest. Spawn monsters yourself if you roll an
        encounter.
      </p>
      <CommandOutcome outcome={outcome} onDismiss={clear} />
      <details className={styles.details}>
        <summary>Another amount</summary>
        <CommandForm commandType="advance_time" />
      </details>
    </div>
  );
}

const DIE_SIDES: readonly DieSides[] = [4, 6, 8, 10, 12, 20, 100];

function parseDice(expression: string): { count: number; sides: DieSides } | null {
  const match = /^(\d*)d(\d+)/i.exec(expression.trim());
  if (!match) return null;
  const sides = Number(match[2]);
  if (!DIE_SIDES.includes(sides as DieSides)) return null;
  return { count: match[1] ? Number(match[1]) : 1, sides: sides as DieSides };
}

/** Rolls dice through the session, so the roll is seeded, logged, and replayed. */
function RollDiceForm() {
  const [expression, setExpression] = useState('1d20');
  const { run, busy, outcome, clear } = useRefereeCommand();
  const rolled =
    outcome?.status === 'accepted' ? outcome.events.find((e) => e.event_type === 'dice_rolled') : undefined;
  const roll =
    rolled && rolled.event_type === 'dice_rolled'
      ? { expression: rolled.expression, total: rolled.total, rolls: rolled.rolls }
      : null;
  const parsed = roll ? parseDice(roll.expression) : null;
  const roll1 = (text: string) => void run({ command_type: 'roll_dice', expression: text });
  return (
    <div className={styles.form}>
      <div className={styles.rowActions} role="group" aria-label="Roll one die">
        {DIE_SIDES.map((sides) => (
          <Button key={sides} size="sm" variant="ghost" disabled={busy} onClick={() => roll1(`1d${sides}`)}>
            d{sides}
          </Button>
        ))}
      </div>
      <form
        className={styles.inlineForm}
        onSubmit={(e) => {
          e.preventDefault();
          if (expression.trim()) roll1(expression.trim());
        }}
      >
        <Field label="Dice">
          <TextInput value={expression} onChange={(e) => setExpression(e.target.value)} />
        </Field>
        <Button type="submit" variant="primary" loading={busy}>
          Roll
        </Button>
      </form>
      <p className={styles.secondaryLine}>
        Such as 3d6, 2d4+1, or 1d6x10. The game logs the roll for referees only.
      </p>
      {roll && outcome && (
        <div className={styles.rollResult} key={outcome.id}>
          {parsed && roll.rolls.length === parsed.count && parsed.count <= 12 ? (
            <DiceRoll
              dice={roll.rolls.map((value) => ({ sides: parsed.sides, value }))}
              total={roll.total}
              label={`Rolled ${roll.expression}`}
            />
          ) : (
            <span className={styles.bigNumber}>{roll.total}</span>
          )}
          <span className={styles.secondary}>
            {roll.expression}: {roll.rolls.join(', ')}, total {roll.total}.
          </span>
        </div>
      )}
      {!roll && <CommandOutcome outcome={outcome} onDismiss={clear} />}
    </div>
  );
}

interface ActionDef {
  value: string;
  label: string;
  icon: IconName;
  /** The commands the action sends. It is available when any of them is legal now. */
  commands: readonly string[];
  render: () => ReactNode;
}

/** The quick actions, grouped, with the encounter's ending first while one is open. */
export function QuickActions({ data }: { data: RefereeData }) {
  const legal = useLegalCommands();
  const legalSet = useMemo(() => new Set(legal.map((c) => c.command_type)), [legal]);
  const [open, setOpen] = useState<string>('');
  const inEncounter = data.state?.encounter !== null && data.state?.encounter !== undefined;
  const ended = useGameEnded();

  const groups: Array<{ title: string; actions: ActionDef[] }> = [
    {
      title: 'Monsters',
      actions: [
        {
          value: 'end',
          label: 'End the encounter',
          icon: 'flag',
          commands: ['end_encounter'],
          render: () => <EndEncounterForm />,
        },
        {
          value: 'spawn',
          label: 'Spawn monsters',
          icon: 'skull',
          commands: ['spawn_monsters'],
          render: () => <SpawnMonstersForm data={data} />,
        },
        {
          value: 'npcs',
          label: 'Spawn an NPC party',
          icon: 'users',
          commands: ['spawn_npc_party'],
          render: () => <SpawnNpcPartyForm />,
        },
      ],
    },
    {
      title: 'The party',
      actions: [
        {
          value: 'items',
          label: 'Give or take an item',
          icon: 'chest',
          commands: ['grant_item', 'remove_item'],
          render: () => <ItemsAction />,
        },
        {
          value: 'coins',
          label: 'Give or take coins',
          icon: 'coins',
          commands: ['grant_coins', 'remove_coins'],
          render: () => <CoinsAction />,
        },
        {
          value: 'xp',
          label: 'Award experience',
          icon: 'plus',
          commands: ['award_xp'],
          render: () => <AwardXpAction />,
        },
        {
          value: 'identify',
          label: 'Identify an item',
          icon: 'spell',
          commands: ['identify_item'],
          render: () => <CommandForm commandType="identify_item" />,
        },
        {
          value: 'members',
          label: 'Add or remove a member',
          icon: 'user',
          commands: ['add_member', 'remove_member'],
          render: () => <MembersAction />,
        },
      ],
    },
    {
      title: 'Places and time',
      actions: [
        {
          value: 'place',
          label: 'Place the party',
          icon: 'map',
          commands: ['place_party'],
          render: () => <PlacePartyForm data={data} />,
        },
        {
          value: 'door',
          label: 'Change a door',
          icon: 'door',
          commands: ['set_door_state'],
          render: () => <CommandForm commandType="set_door_state" />,
        },
        {
          value: 'time',
          label: 'Advance time',
          icon: 'hourglass',
          commands: ['advance_time'],
          render: () => <AdvanceTimeForm />,
        },
      ],
    },
    {
      title: 'Dice and records',
      actions: [
        {
          value: 'dice',
          label: 'Roll dice',
          icon: 'dice',
          commands: ['roll_dice'],
          render: () => <RollDiceForm />,
        },
        {
          value: 'journal',
          label: 'Add a journal entry',
          icon: 'journal',
          commands: ['add_journal_entry'],
          render: () => <CommandForm commandType="add_journal_entry" resetOnAccept />,
        },
        {
          value: 'note',
          label: 'Record a note',
          icon: 'edit',
          commands: ['record_note'],
          render: () => <CommandForm commandType="record_note" resetOnAccept />,
        },
      ],
    },
  ];
  if (!inEncounter) {
    const monsters = groups.shift();
    if (monsters) groups.splice(1, 0, monsters);
  }

  return (
    <div className={styles.section}>
      {groups.map((group) => (
        <section key={group.title} aria-label={group.title}>
          <SectionLabel level={3}>{group.title}</SectionLabel>
          <Accordion
            type="single"
            value={open}
            onValueChange={setOpen}
            items={group.actions.map((action) => {
              const available = action.commands.some((c) => legalSet.has(c));
              return {
                value: action.value,
                title: (
                  <span className={styles.actionTitle}>
                    <Icon
                      name={action.icon}
                      size={16}
                      className={available ? styles.actionIcon : styles.actionIconOff}
                    />
                    <span>
                      {action.label}
                      {(!available || (ended && action.commands.every(changesEndedStory))) && <NameComma />}
                    </span>
                  </span>
                ),
                meta: !available ? (
                  <UnavailableMark />
                ) : ended && action.commands.every(changesEndedStory) ? (
                  <UnavailableMark>The game is over</UnavailableMark>
                ) : undefined,
                content: open === action.value ? action.render() : null,
              };
            })}
          />
        </section>
      ))}
    </div>
  );
}
