/**
 * Pickers for the things referee commands name: party members, catalog items, carried items, monsters, spells,
 * quests, objectives, triggers, flags, dungeons, areas, and places on the map. Each one offers names, and hands
 * the command the ID it needs.
 */
import type { MemberView } from '@bxvtt/shared/bxapi';
import {
  classLabel,
  itemTypeLabel,
  magicItemTemplateName,
  prettifyId,
  type TextContext,
} from '@bxvtt/shared/text';
import { useMemo } from 'react';
import {
  useEquipmentCatalog,
  useMagicItemCatalog,
  useMapBus,
  useMonsterCatalog,
  useParty,
  useSpellCatalog,
  type CellPick,
  type EdgePick,
} from '@/app';
import { Button, Combobox, Select, type ComboboxOption, type SelectOption } from '@/ui';
import { allLevels, type Adventure, type CharacterSheet } from './model/adventure';
import { templateLabel } from './model/describe';

/** A sentence-case name from catalog text such as `Torches (6)`. */
function capital(text: string): string {
  return text.length === 0 ? text : text[0]?.toUpperCase() + text.slice(1);
}

function memberDescription(member: MemberView): string {
  const parts = [`Level ${member.level} ${classLabel(member.class_id).toLowerCase()}`];
  if (member.current_hp <= 0) parts.push('down');
  return parts.join(', ');
}

/** The party as select options, in marching order. */
export function useMemberOptions(): SelectOption[] {
  const party = useParty();
  return useMemo(
    () => party.map((m) => ({ value: m.id, label: m.name, description: memberDescription(m) })),
    [party],
  );
}

const NONE = '__none__';

/** Picks a party member. With `noneLabel`, the first option means "nobody" and reads as `null`. */
export function MemberPicker({
  value,
  onChange,
  noneLabel,
  exclude,
  id,
  invalid,
  'aria-label': ariaLabel,
}: {
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  noneLabel?: string;
  exclude?: string | null;
  id?: string;
  invalid?: boolean;
  'aria-label'?: string;
}) {
  const members = useMemberOptions();
  const options = [
    ...(noneLabel ? [{ value: NONE, label: noneLabel }] : []),
    ...members.filter((m) => m.value !== exclude),
  ];
  return (
    <Select
      id={id}
      aria-label={ariaLabel}
      invalid={invalid}
      options={options}
      value={value ?? (noneLabel ? NONE : undefined)}
      placeholder="Choose a member"
      onValueChange={(next) => onChange(next === NONE ? null : next)}
    />
  );
}

/** Every item a referee can grant: equipment, magic items, and the adventure's own items. */
export function useItemOptions(adventure: Adventure | null): { options: ComboboxOption[]; loading: boolean } {
  const equipment = useEquipmentCatalog();
  const magic = useMagicItemCatalog();
  const options = useMemo(() => {
    const out: ComboboxOption[] = [];
    for (const item of adventure?.items ?? []) {
      out.push({ value: item.id, label: item.name, description: 'From this adventure', icon: 'key' });
    }
    for (const item of equipment.data ?? []) {
      out.push({
        value: item.id,
        label: capital(item.name),
        description: `${itemTypeLabel(item.item_type)}, ${item.cost_gp} gp`,
        keywords: [item.item_type],
      });
    }
    for (const item of magic.data ?? []) {
      out.push({
        value: item.id,
        label: capital(item.name),
        description: `Magic item, ${prettifyId(String(item.category))}`,
        icon: 'spell',
        keywords: ['magic', String(item.category)],
      });
    }
    return out;
  }, [adventure, equipment.data, magic.data]);
  return { options, loading: equipment.loading || magic.loading };
}

/** Picks any item from the catalogs and the adventure. */
export function CatalogItemPicker({
  value,
  onChange,
  adventure,
  id,
  invalid,
}: {
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  adventure: Adventure | null;
  id?: string;
  invalid?: boolean;
}) {
  const { options, loading } = useItemOptions(adventure);
  return (
    <Combobox
      id={id}
      invalid={invalid}
      options={options}
      value={value ?? null}
      onChange={onChange}
      placeholder={loading ? 'Loading the catalogs' : 'Search items'}
      emptyText="No item has that name"
    />
  );
}

/** One thing a member carries, with the ID that `remove_item` and `identify_item` take. */
export interface CarriedItem {
  /** A mundane item's catalog ID, or a magic item's or valuable's instance ID. */
  id: string;
  label: string;
  quantity: number;
  kind: 'item' | 'magic' | 'valuable';
  identified: boolean;
  where: 'pack' | 'equipped';
}

type Inventory = NonNullable<CharacterSheet['inventory']>;
type InventoryEntry = Inventory['items'][number];

function readEntry(entry: InventoryEntry, where: CarriedItem['where'], ctx: TextContext): CarriedItem {
  if (entry.instance_type === 'magic_item') {
    const name =
      magicItemTemplateName(entry.template_id) ??
      ctx.items[entry.template_id] ??
      prettifyId(entry.template_id);
    return {
      id: entry.instance_id,
      label: capital(name),
      quantity: entry.quantity,
      kind: 'magic',
      identified: entry.identified,
      where,
    };
  }
  return {
    id: entry.template.id,
    label: capital(entry.template.name),
    quantity: entry.quantity,
    kind: 'item',
    identified: true,
    where,
  };
}

/**
 * Everything a member carries, from the referee state's full sheet: the pack, what is worn and wielded, and
 * valuables. Mundane items of one kind are added together.
 */
export function carriedItems(member: CharacterSheet | undefined, ctx: TextContext): CarriedItem[] {
  const inventory = member?.inventory;
  if (!inventory) return [];
  const entries: Array<[InventoryEntry, CarriedItem['where']]> = [
    ...inventory.items.map((e): [InventoryEntry, CarriedItem['where']] => [e, 'pack']),
    ...inventory.wielded.map((e): [InventoryEntry, CarriedItem['where']] => [e, 'equipped']),
    ...inventory.rings.map((e): [InventoryEntry, CarriedItem['where']] => [e, 'equipped']),
  ];
  if (inventory.worn_armour) entries.push([inventory.worn_armour, 'equipped']);
  if (inventory.shield) entries.push([inventory.shield, 'equipped']);
  const out: CarriedItem[] = [];
  for (const [entry, where] of entries) {
    const item = readEntry(entry, where, ctx);
    const same = item.kind === 'item' ? out.find((o) => o.kind === 'item' && o.id === item.id) : undefined;
    if (same) {
      same.quantity += item.quantity;
      if (where === 'equipped') same.where = 'equipped';
    } else out.push(item);
  }
  for (const valuable of inventory.valuables) {
    out.push({
      id: valuable.instance_id,
      label: `${capital(valuable.name)}, ${valuable.value_gp} gp`,
      quantity: 1,
      kind: 'valuable',
      identified: true,
      where: 'pack',
    });
  }
  return out;
}

/** Picks something a member carries. */
export function CarriedItemPicker({
  items,
  value,
  onChange,
  emptyText,
  id,
  invalid,
}: {
  items: readonly CarriedItem[];
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  emptyText: string;
  id?: string;
  invalid?: boolean;
}) {
  const options: ComboboxOption[] = items.map((item) => ({
    value: item.id,
    label: item.label,
    description: [
      item.quantity > 1 ? `${item.quantity} carried` : null,
      item.where === 'equipped' ? 'Equipped' : null,
      item.kind === 'magic' ? (item.identified ? 'Identified' : 'Not identified') : null,
      item.kind === 'valuable' ? 'Treasure' : null,
    ]
      .filter(Boolean)
      .join(', '),
    icon: item.kind === 'magic' ? 'spell' : item.kind === 'valuable' ? 'gem' : undefined,
  }));
  return (
    <Combobox
      id={id}
      invalid={invalid}
      options={options}
      value={value ?? null}
      onChange={onChange}
      placeholder={items.length === 0 ? emptyText : 'Search what they carry'}
      emptyText={emptyText}
    />
  );
}

/** Picks a monster from the catalog and the adventure's bundled monsters. */
export function MonsterPicker({
  value,
  onChange,
  adventure,
  id,
  invalid,
}: {
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  adventure: Adventure | null;
  id?: string;
  invalid?: boolean;
}) {
  const catalog = useMonsterCatalog();
  const options = useMemo(() => {
    const out: ComboboxOption[] = [];
    for (const monster of adventure?.monsters ?? []) {
      out.push({
        value: monster.id,
        label: capital(templateLabel(monster.id, adventure)),
        description: 'From this adventure',
        icon: 'key',
        keywords: [monster.name],
      });
    }
    for (const monster of catalog.data ?? []) {
      if (out.some((o) => o.value === monster.id)) continue;
      const hd = monster.hit_dice;
      const hdText = `${hd.count}${hd.modifier ? (hd.modifier > 0 ? `+${hd.modifier}` : String(hd.modifier)) : ''} HD`;
      out.push({
        value: monster.id,
        label: monster.name,
        description: `${hdText}, armour class ${monster.ac ?? 'varies'}, ${monster.xp} XP`,
      });
    }
    return out;
  }, [adventure, catalog.data]);
  return (
    <Combobox
      id={id}
      invalid={invalid}
      options={options}
      value={value ?? null}
      onChange={onChange}
      placeholder={catalog.loading ? 'Loading the monsters' : 'Search monsters'}
      emptyText="No monster has that name"
    />
  );
}

/** Picks a spell from the catalog. */
export function SpellPicker({
  value,
  onChange,
  id,
  invalid,
}: {
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  id?: string;
  invalid?: boolean;
}) {
  const catalog = useSpellCatalog();
  const options = useMemo(
    () =>
      (catalog.data ?? []).map((spell) => ({
        value: spell.id,
        label: spell.name,
        description: `${capital(spell.spell_list)} level ${spell.level}`,
      })),
    [catalog.data],
  );
  return (
    <Combobox
      id={id}
      invalid={invalid}
      options={options}
      value={value ?? null}
      onChange={onChange}
      placeholder="Search spells"
    />
  );
}

/** Quests of the adventure, each with its status in play. */
export function QuestPicker({
  value,
  onChange,
  adventure,
  statuses,
  id,
  invalid,
}: {
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  adventure: Adventure | null;
  statuses: Record<string, { status: string }>;
  id?: string;
  invalid?: boolean;
}) {
  const options = (adventure?.quests ?? []).map((quest) => ({
    value: quest.id,
    label: quest.name,
    description: questStatusLabel(statuses[quest.id]?.status ?? 'inactive'),
  }));
  return (
    <Select
      id={id}
      invalid={invalid}
      options={options}
      value={value ?? undefined}
      placeholder="Choose a quest"
      onValueChange={onChange}
    />
  );
}

export function questStatusLabel(status: string): string {
  if (status === 'active') return 'Active';
  if (status === 'completed') return 'Completed';
  return 'Not started';
}

/** The objectives of one quest. */
export function ObjectivePicker({
  questId,
  value,
  onChange,
  adventure,
  objectiveStates,
  id,
  invalid,
}: {
  questId: string | null | undefined;
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  adventure: Adventure | null;
  objectiveStates: Record<string, { revealed: boolean; complete: boolean }>;
  id?: string;
  invalid?: boolean;
}) {
  const quest = adventure?.quests.find((q) => q.id === questId);
  const options = (quest?.objectives ?? []).map((objective) => {
    const state = objectiveStates[objective.id];
    return {
      value: objective.id,
      label: objective.name,
      description: state?.complete ? 'Complete' : state?.revealed ? 'Shown to the players' : 'Hidden',
    };
  });
  return (
    <Select
      id={id}
      invalid={invalid}
      options={options}
      value={value ?? undefined}
      disabled={!quest}
      placeholder={quest ? 'Choose an objective' : 'Choose a quest first'}
      onValueChange={onChange}
    />
  );
}

/** The adventure's triggers, each marked when it has fired. */
export function TriggerPicker({
  value,
  onChange,
  adventure,
  fired,
  id,
  invalid,
}: {
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  adventure: Adventure | null;
  fired: readonly string[];
  id?: string;
  invalid?: boolean;
}) {
  const options = (adventure?.triggers ?? []).map((trigger) => ({
    value: trigger.id,
    label: prettifyId(trigger.id),
    description: fired.includes(trigger.id) ? 'Fired' : 'Not fired',
    keywords: [trigger.id],
  }));
  return (
    <Combobox
      id={id}
      invalid={invalid}
      options={options}
      value={value ?? null}
      onChange={onChange}
      placeholder="Search triggers"
    />
  );
}

/** The adventure's dungeons. */
export function DungeonPicker({
  value,
  onChange,
  adventure,
  id,
  invalid,
}: {
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  adventure: Adventure | null;
  id?: string;
  invalid?: boolean;
}) {
  const options = (adventure?.dungeons ?? []).map((d) => ({ value: d.id, label: d.name }));
  return (
    <Select
      id={id}
      invalid={invalid}
      options={options}
      value={value ?? undefined}
      placeholder="Choose a dungeon"
      onValueChange={onChange}
    />
  );
}

/** Every keyed area on every level, as combobox options valued `{dungeon}:{level}:{area}`. */
export function useAreaOptions(adventure: Adventure | null): ComboboxOption[] {
  return useMemo(() => {
    if (!adventure) return [];
    return allLevels(adventure).flatMap(({ dungeon, level }) =>
      level.areas.map((area) => ({
        value: `${dungeon.id}:${level.number}:${area.id}`,
        label: area.name,
        description: `${dungeon.name}, level ${level.number}`,
        keywords: [area.id],
      })),
    );
  }, [adventure]);
}

/**
 * A button that asks the map for a cell or a door. The shell shows the prompt over the stage, and Escape
 * cancels.
 */
export function MapPickButton({
  kind,
  prompt,
  onPick,
  label,
  size = 'sm',
}: {
  kind: 'cell' | 'edge';
  prompt: string;
  onPick: (target: CellPick | EdgePick) => void;
  label?: string;
  size?: 'sm' | 'md';
}) {
  const requestPick = useMapBus((s) => s.requestPick);
  const picking = useMapBus((s) => s.pick !== null && s.pick.prompt === prompt);
  return (
    <Button
      type="button"
      variant="secondary"
      size={size}
      icon="target"
      aria-pressed={picking}
      onClick={async () => {
        const target = await requestPick({ kind, prompt });
        if (target !== null && target.kind === kind) onPick(target);
      }}
    >
      {picking
        ? 'Picking on the map'
        : (label ?? (kind === 'cell' ? 'Pick a cell on the map' : 'Pick a door on the map'))}
    </Button>
  );
}
