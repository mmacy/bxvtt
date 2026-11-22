/**
 * The stateless generators the server runs through bxapi: treasure by type, monsters with rolled hit points,
 * a stocked room, and an NPC party. Each result shows its seed, rolls again, and offers the commands that put
 * it in play.
 */
import type {
  MonstersResponse,
  NpcPartyResponse,
  RoomResponse,
  TreasureResponse,
} from '@bxvtt/shared/protocol';
import {
  alignmentLabel,
  classLabel,
  formatInteger,
  magicItemTemplateName,
  prettifyId,
} from '@bxvtt/shared/text';
import { useState, type ReactNode } from 'react';
import { getApi, useApiAction, useRuleTable, useTableId } from '@/app';
import {
  Badge,
  Banner,
  Button,
  CoinPurse,
  Field,
  NumberInput,
  RadioGroup,
  SegmentedControl,
  Select,
} from '@/ui';
import type { GeneratorKind } from '@bxvtt/shared/protocol';
import { MemberPicker, MonsterPicker } from '../pickers';
import { CommandOutcome, useRefereeCommand } from '../RefereeCommand';
import { monsterCount, templateLabel } from '../model/describe';
import type { RefereeData } from '../useReferee';
import { SpawnMonstersForm } from './QuickActions';
import styles from './sections.module.css';

type Treasure = TreasureResponse['treasure'];

/** Runs one generator and keeps the last result with its request, for rolling again. */
function useGenerator<T extends { seed: number }>(kind: GeneratorKind) {
  const tableId = useTableId();
  const { run, pending } = useApiAction();
  const [result, setResult] = useState<{ value: T; body: Record<string, unknown>; id: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const generate = async (body: Record<string, unknown>) => {
    const outcome = await run(() => getApi().generate<T>(tableId, kind, body), { display: 'inline' });
    if (outcome.ok) {
      setError(null);
      setResult({ value: outcome.value, body, id: Date.now() });
    } else setError(`${outcome.problem.title}. ${outcome.problem.detail}`);
  };
  return { generate, pending, result, error };
}

function ResultHeader({
  title,
  seed,
  onAgain,
  onRepeat,
  pending,
}: {
  title: ReactNode;
  seed: number;
  onAgain: () => void;
  onRepeat: () => void;
  pending: boolean;
}) {
  return (
    <div className={styles.resultHead}>
      <span className={styles.rowTitle}>{title}</span>
      <span className={styles.secondary}>Seed {seed}</span>
      <span className={styles.resultActions}>
        <Button size="sm" variant="secondary" icon="dice" disabled={pending} onClick={onAgain}>
          Roll again
        </Button>
        <Button size="sm" variant="ghost" icon="redo" disabled={pending} onClick={onRepeat}>
          Same roll
        </Button>
      </span>
    </div>
  );
}

function GiveCoins({ coins }: { coins: Treasure['coins'] }) {
  const [member, setMember] = useState<string | null>(null);
  const { run, busy, outcome, clear } = useRefereeCommand();
  return (
    <div className={styles.form}>
      <div className={styles.inlineForm}>
        <Field label="Give the coins to">
          <MemberPicker value={member} onChange={setMember} />
        </Field>
        <Button
          size="sm"
          variant="secondary"
          disabled={!member || busy}
          onClick={() => member && run({ command_type: 'grant_coins', character_id: member, coins })}
        >
          Give coins
        </Button>
      </div>
      <CommandOutcome outcome={outcome} onDismiss={clear} />
    </div>
  );
}

function GiveItem({ itemId, name }: { itemId: string; name: string }) {
  const [member, setMember] = useState<string | null>(null);
  const { run, busy, outcome, clear } = useRefereeCommand();
  return (
    <div className={styles.form}>
      <div className={styles.inlineForm}>
        <Field label={`Give ${name} to`}>
          <MemberPicker value={member} onChange={setMember} />
        </Field>
        <Button
          size="sm"
          variant="ghost"
          disabled={!member || busy}
          onClick={() => member && run({ command_type: 'grant_item', character_id: member, item_id: itemId })}
        >
          Give
        </Button>
      </div>
      <CommandOutcome outcome={outcome} onDismiss={clear} />
    </div>
  );
}

function capital(text: string): string {
  return text.length === 0 ? text : `${text[0]?.toUpperCase() ?? ''}${text.slice(1)}`;
}

/** Coins, gems and jewellery, and magic items, with the commands that hand them out. */
export function TreasureView({ treasure, actions = true }: { treasure: Treasure; actions?: boolean }) {
  const hasCoins = Object.values(treasure.coins).some((n) => n > 0);
  const empty = !hasCoins && treasure.valuables.length === 0 && treasure.magic_items.length === 0;
  if (empty) return <p className={styles.secondaryLine}>Nothing: the dice came up empty.</p>;
  return (
    <div className={styles.form}>
      {hasCoins && (
        <div className={styles.block}>
          <CoinPurse coins={treasure.coins} />
          {actions && <GiveCoins coins={treasure.coins} />}
        </div>
      )}
      {treasure.valuables.length > 0 && (
        <div className={styles.block}>
          <h5 className={styles.minorHead}>Gems and jewellery</h5>
          <ul className={styles.contents}>
            {treasure.valuables.map((v) => (
              <li key={v.instance_id}>
                {capital(v.name)}, {formatInteger(v.value_gp)} gp
              </li>
            ))}
          </ul>
        </div>
      )}
      {treasure.magic_items.length > 0 && (
        <div className={styles.block}>
          <h5 className={styles.minorHead}>Magic items</h5>
          <ul className={styles.plainList}>
            {treasure.magic_items.map((item) => {
              const name = capital(magicItemTemplateName(item.template_id) ?? prettifyId(item.template_id));
              return (
                <li key={item.instance_id} className={styles.block}>
                  <span className={styles.rowTitle}>
                    {name}
                    {item.quantity > 1 ? ` (${item.quantity})` : ''}
                  </span>
                  {actions && <GiveItem itemId={item.template_id} name={name.toLowerCase()} />}
                </li>
              );
            })}
          </ul>
          {actions && (
            <p className={styles.secondaryLine}>
              A given magic item is a new copy that rolls its own charges. Gems and jewellery can't be given
              by a command, so describe them and let the party take them.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

interface TreasureLetter {
  letter: string;
  kind: string;
  average_gp?: number;
}

function TreasureGenerator() {
  const table = useRuleTable('treasure');
  const letters = ((table.data as { treasure_types?: TreasureLetter[] } | null)?.treasure_types ?? []).map(
    (t) => ({
      value: t.letter,
      label: `Type ${t.letter}`,
      description: `${t.kind === 'hoard' ? 'Lair hoard' : 'Carried'}${t.average_gp ? `, about ${formatInteger(Math.round(t.average_gp))} gp` : ''}`,
    }),
  );
  const [letter, setLetter] = useState('A');
  const [tier, setTier] = useState('basic');
  const { generate, pending, result, error } = useGenerator<TreasureResponse>('treasure');
  const body = { treasure_type: letter, tier };
  return (
    <div className={styles.form}>
      <div className={styles.inlineForm}>
        <Field label="Treasure type">
          <Select
            options={letters.length > 0 ? letters : [{ value: 'A', label: 'Type A' }]}
            value={letter}
            onValueChange={setLetter}
          />
        </Field>
        <Field label="Magic items from">
          <Select
            options={[
              { value: 'basic', label: 'Basic tables' },
              { value: 'expert', label: 'Expert tables' },
            ]}
            value={tier}
            onValueChange={setTier}
          />
        </Field>
      </div>
      <div className={styles.rowActions}>
        <Button size="sm" variant="primary" icon="dice" loading={pending} onClick={() => generate(body)}>
          Roll treasure
        </Button>
      </div>
      {error && <Banner tone="danger">{error}</Banner>}
      {result && (
        <div className={styles.result} key={result.id}>
          <ResultHeader
            title={`Treasure type ${String(result.body.treasure_type)}`}
            seed={result.value.seed}
            pending={pending}
            onAgain={() => generate(result.body)}
            onRepeat={() => generate({ ...result.body, seed: result.value.seed })}
          />
          <TreasureView treasure={result.value.treasure} />
        </div>
      )}
    </div>
  );
}

function MonstersGenerator({ data }: { data: RefereeData }) {
  const [monster, setMonster] = useState<string | null>(null);
  const [count, setCount] = useState<number | null>(4);
  const [spawning, setSpawning] = useState(false);
  const { generate, pending, result, error } = useGenerator<MonstersResponse>('monsters');
  const roll = (body: Record<string, unknown>) => {
    setSpawning(false);
    void generate(body);
  };
  return (
    <div className={styles.form}>
      <Field label="Monster">
        <MonsterPicker value={monster} onChange={setMonster} adventure={data.adventure} />
      </Field>
      <Field label="How many">
        <NumberInput value={count} min={1} max={100} onChange={setCount} />
      </Field>
      <div className={styles.rowActions}>
        <Button
          size="sm"
          variant="primary"
          icon="dice"
          loading={pending}
          disabled={!monster}
          onClick={() => monster && roll({ monster_id: monster, count: count ?? 1 })}
        >
          Roll hit points
        </Button>
      </div>
      {error && <Banner tone="danger">{error}</Banner>}
      {result && (
        <div className={styles.result} key={result.id}>
          <ResultHeader
            title={capital(
              monsterCount(
                String(result.body.monster_id),
                result.value.monsters.length,
                null,
                data.adventure,
              ),
            )}
            seed={result.value.seed}
            pending={pending}
            onAgain={() => roll(result.body)}
            onRepeat={() => roll({ ...result.body, seed: result.value.seed })}
          />
          <ul className={styles.monsterList}>
            {result.value.monsters.map((m, index) => (
              <li key={m.id} className={styles.monster}>
                <div className={styles.monsterHead}>
                  <span className={styles.monsterName}>
                    {capital(templateLabel(m.template.id, data.adventure))} {index + 1}
                  </span>
                  <span className={styles.hpText}>
                    {m.max_hp}
                    <span className={styles.secondary}> hit points</span>
                  </span>
                </div>
              </li>
            ))}
          </ul>
          {spawning ? (
            <SpawnMonstersForm
              data={data}
              initialMonster={String(result.body.monster_id)}
              initialCount={result.value.monsters.length}
            />
          ) : (
            <div className={styles.rowActions}>
              <Button size="sm" variant="secondary" icon="skull" onClick={() => setSpawning(true)}>
                Spawn these
              </Button>
              <span className={styles.secondary}>Spawned monsters roll their own hit points.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const ROOM_CONTENTS: Record<string, string> = {
  empty: 'An empty room',
  monster: 'Monsters',
  special: 'Something special',
  trap: 'A trap',
};

function RoomGenerator({ data }: { data: RefereeData }) {
  const [level, setLevel] = useState<number | null>(data.here?.level.number ?? 1);
  const [spawning, setSpawning] = useState(false);
  const { generate, pending, result, error } = useGenerator<RoomResponse>('room');
  const roll = (body: Record<string, unknown>) => {
    setSpawning(false);
    void generate(body);
  };
  const room = result?.value.room;
  const firstMonster = room?.encounter?.monsters[0];
  return (
    <div className={styles.form}>
      <Field label="Dungeon level" hint="Deeper levels stock tougher monsters.">
        <NumberInput value={level} min={1} max={20} onChange={setLevel} />
      </Field>
      <div className={styles.rowActions}>
        <Button
          size="sm"
          variant="primary"
          icon="dice"
          loading={pending}
          onClick={() => roll({ level_number: level ?? 1 })}
        >
          Stock a room
        </Button>
      </div>
      {error && <Banner tone="danger">{error}</Banner>}
      {result && room && (
        <div className={styles.result} key={result.id}>
          <ResultHeader
            title={ROOM_CONTENTS[room.contents] ?? capital(prettifyId(room.contents))}
            seed={result.value.seed}
            pending={pending}
            onAgain={() => roll(result.body)}
            onRepeat={() => roll({ ...result.body, seed: result.value.seed })}
          />
          <div className={styles.tags}>
            <Badge tone={room.treasure_present ? 'gold' : 'neutral'}>
              {room.treasure_present ? 'Treasure' : 'No treasure'}
            </Badge>
            {room.encounter?.hoard && <Badge tone="gold">Lair hoard</Badge>}
          </div>
          {room.encounter && (
            <p className={styles.prose}>
              {room.encounter.monsters
                .map((m) => capital(monsterCount(m.template_id, m.count_fixed, m.count_dice, data.adventure)))
                .join(', ')}
              .
            </p>
          )}
          {room.contents === 'special' && (
            <p className={styles.secondaryLine}>
              Invent a feature: a statue, a pool, a strange sound, a riddle.
            </p>
          )}
          {room.contents === 'trap' && (
            <p className={styles.secondaryLine}>
              Invent a trap and decide what finds it and what sets it off.
            </p>
          )}
          {room.treasure_present && !room.encounter && (
            <p className={styles.secondaryLine}>Unguarded treasure for this level lies here.</p>
          )}
          {room.npc_party && (
            <p className={styles.secondaryLine}>
              A party of {room.npc_party.count} {room.npc_party.kind} adventurers. Spawn one from Quick
              actions.
            </p>
          )}
          {firstMonster &&
            (spawning ? (
              <SpawnMonstersForm
                data={data}
                initialMonster={firstMonster.template_id}
                initialCount={firstMonster.count_fixed ?? 1}
              />
            ) : (
              <div className={styles.rowActions}>
                <Button size="sm" variant="secondary" icon="skull" onClick={() => setSpawning(true)}>
                  Spawn these monsters
                </Button>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

function NpcPartyGenerator() {
  const [kind, setKind] = useState('basic');
  const [count, setCount] = useState<number | null>(4);
  const { generate, pending, result, error } = useGenerator<NpcPartyResponse>('npc-party');
  const { run, busy, outcome, clear } = useRefereeCommand();
  const party = result?.value.party;
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
      <Field label="How many">
        <NumberInput value={count} min={1} max={100} onChange={setCount} />
      </Field>
      <div className={styles.rowActions}>
        <Button
          size="sm"
          variant="primary"
          icon="dice"
          loading={pending}
          onClick={() => generate({ kind, count: count ?? 1 })}
        >
          Roll a party
        </Button>
      </div>
      {error && <Banner tone="danger">{error}</Banner>}
      {result && party && (
        <div className={styles.result} key={result.id}>
          <ResultHeader
            title={`${party.members.length} ${party.kind} adventurers, ${alignmentLabel(party.alignment).toLowerCase()}`}
            seed={result.value.seed}
            pending={pending}
            onAgain={() => generate(result.body)}
            onRepeat={() => generate({ ...result.body, seed: result.value.seed })}
          />
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Class</th>
                <th scope="col">Hit points</th>
              </tr>
            </thead>
            <tbody>
              {party.members.map((m) => (
                <tr key={m.id ?? m.name}>
                  <td>{m.name}</td>
                  <td>
                    {classLabel(m.class_id)} {m.level}
                  </td>
                  <td className={styles.num}>{m.max_hp}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h5 className={styles.minorHead}>Their treasure</h5>
          <TreasureView treasure={party.treasure} actions={false} />
          <div className={styles.rowActions}>
            <Button
              size="sm"
              variant="secondary"
              icon="users"
              disabled={busy}
              onClick={() =>
                run({
                  command_type: 'spawn_npc_party',
                  party_kind: party.kind,
                  count_fixed: party.members.length,
                  distance_feet: 60,
                })
              }
            >
              Spawn a party like this
            </Button>
          </div>
          <p className={styles.secondaryLine}>
            The game rolls a new party of the same kind and size, 60 feet away. Only while exploring.
          </p>
          <CommandOutcome outcome={outcome} onDismiss={clear} />
        </div>
      )}
    </div>
  );
}

type Kind = 'treasure' | 'monsters' | 'room' | 'npcs';

/** The four generators behind one switch. */
export function Generators({ data }: { data: RefereeData }) {
  const [kind, setKind] = useState<Kind>('treasure');
  return (
    <div className={styles.section}>
      <SegmentedControl
        aria-label="Generator"
        value={kind}
        onValueChange={(next) => setKind(next as Kind)}
        options={[
          { value: 'treasure', label: 'Treasure', icon: 'coins' },
          { value: 'monsters', label: 'Monsters', icon: 'skull' },
          { value: 'room', label: 'Room', icon: 'door' },
          { value: 'npcs', label: 'NPCs', icon: 'users' },
        ]}
      />
      <div hidden={kind !== 'treasure'}>
        <TreasureGenerator />
      </div>
      <div hidden={kind !== 'monsters'}>
        <MonstersGenerator data={data} />
      </div>
      <div hidden={kind !== 'room'}>
        <RoomGenerator data={data} />
      </div>
      <div hidden={kind !== 'npcs'}>
        <NpcPartyGenerator />
      </div>
      <p className={styles.secondaryLine}>
        These rolls stay out of the game and its log until you act on one. The game can repeat any roll from
        its seed.
      </p>
    </div>
  );
}
