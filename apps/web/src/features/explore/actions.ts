/**
 * The exploration actions, as menu entries. The context menu on the map, the scene panel, and the action bar
 * build their menus here, so a door or a cache offers the same choices wherever the player meets it.
 *
 * An action appears only when bxapi lists its command as legal now and the viewer may send it: a party command
 * needs the caller or a referee, and a member command lists only the members the viewer controls. Whether the
 * action works is bxapi's decision, and its refusal explains why.
 */
import type { MemberView } from '@bxvtt/shared/bxapi';
import type { PlayerView, Scene, SceneCache, SceneTransition } from '@bxvtt/shared/protocol';
import {
  directionLabel,
  itemPhrase,
  resolveItemNoun,
  restKindLabel,
  searchKindLabel,
  type TextContext,
} from '@bxvtt/shared/text';
import type { GameCommand } from '@/app';
import type { Direction } from '@/map';
import type { IconName, MenuEntry } from '@/ui';
import type { ExploreSendOptions } from './useExploreSend';
import type { DoorLore } from './lore';
import { carriedLights, hasThiefSkill, livingMembers, oilOnCell, partyLight } from './party';

export const DIRECTIONS: readonly Direction[] = ['north', 'east', 'south', 'west'];

/** What the builders read. */
export interface ActionContext {
  view: PlayerView;
  scene: Scene | null;
  /** Whether the viewer may send the command now, for the member when it names one. */
  can: (commandType: string, memberId?: string) => boolean;
  /** Sends a command. */
  run: (command: GameCommand, options?: ExploreSendOptions) => void;
  /** Names for items and members, from `useTextContext`. */
  text: TextContext;
}

/** A party member's name for a menu. */
function memberLabel(member: MemberView): string {
  return member.name;
}

/** The members the viewer may name in a member command. */
function actors(
  ctx: ActionContext,
  commandType: string,
  filter?: (member: MemberView) => boolean,
): MemberView[] {
  return livingMembers(ctx.view.party).filter(
    (member) => (filter === undefined || filter(member)) && ctx.can(commandType, member.id),
  );
}

/**
 * One entry for each member, as a submenu, or a single item that names the member when only one can act.
 *
 * @param label - The action, such as "Force it open".
 * @param members - Who can do it.
 * @param command - The command for one member.
 * @param detail - Extra text after a member's name, such as their chance.
 */
function perMember(
  ctx: ActionContext,
  label: string,
  icon: IconName,
  members: readonly MemberView[],
  command: (member: MemberView) => GameCommand,
  options?: (member: MemberView) => ExploreSendOptions,
  detail?: (member: MemberView) => string | null,
): MenuEntry[] {
  if (members.length === 0) return [];
  const name = (member: MemberView) => {
    const extra = detail?.(member);
    return extra ? `${memberLabel(member)} (${extra})` : memberLabel(member);
  };
  const only = members.length === 1 ? members[0] : undefined;
  if (only !== undefined) {
    return [
      { label: `${label}: ${name(only)}`, icon, onSelect: () => ctx.run(command(only), options?.(only)) },
    ];
  }
  return [
    {
      type: 'submenu',
      label,
      icon,
      items: members.map((member) => ({
        label: name(member),
        onSelect: () => ctx.run(command(member), options?.(member)),
      })),
    },
  ];
}

/** The player view's edge on one side of the party's cell, or `null`. */
export function partyEdge(
  view: PlayerView,
  direction: Direction,
): { kind: string; door_open?: boolean | null; door_wedged?: boolean | null } | null {
  const location = view.location;
  if (location.kind !== 'dungeon' || !location.position) return null;
  const [x, y] = location.position;
  const level = view.explored.find(
    (entry) => entry.dungeon_id === location.dungeon_id && entry.level_number === location.level_number,
  );
  if (!level) return null;
  const key =
    direction === 'south'
      ? `${x},${y + 1}:north`
      : direction === 'east'
        ? `${x + 1},${y}:west`
        : `${x},${y}:${direction}`;
  return level.edges[key] ?? null;
}

/** The sides of the party's cell that have a door the party knows. */
export function doorsHere(view: PlayerView): Array<{ direction: Direction; open: boolean; wedged: boolean }> {
  return DIRECTIONS.flatMap((direction) => {
    const edge = partyEdge(view, direction);
    if (edge?.kind !== 'door') return [];
    return [{ direction, open: edge.door_open === true, wedged: edge.door_wedged === true }];
  });
}

/** One short sentence of what the table learned about a door, or `null`. */
export function doorLoreText(lore: DoorLore | undefined, party: readonly MemberView[]): string | null {
  if (!lore) return null;
  const name = (id: string) => party.find((member) => member.id === id)?.name ?? 'Someone';
  const parts: string[] = [];
  if (lore.locked === true) parts.push('It is locked.');
  else if (lore.unlocked === true) parts.push('Its lock is open.');
  if (lore.stuck === true) parts.push('It is stuck.');
  if (lore.heard === 'noise') parts.push('Someone heard noise beyond it.');
  if (lore.heard === 'silence') parts.push('It was quiet beyond it.');
  if (lore.pickFailed && lore.pickFailed.length > 0)
    parts.push(`${lore.pickFailed.map(name).join(' and ')} couldn't pick the lock.`);
  return parts.length > 0 ? parts.join(' ') : null;
}

/** The actions for the door on one side of the party's cell. */
export function doorEntries(
  ctx: ActionContext,
  direction: Direction,
  door: { open: boolean; wedged: boolean },
  lore?: DoorLore,
): MenuEntry[] {
  const entries: MenuEntry[] = [];
  const living = livingMembers(ctx.view.party);
  const base = { direction };
  entries.push({ type: 'label', label: `The door to the ${directionLabel(direction).toLowerCase()}` });
  const known = doorLoreText(lore, ctx.view.party);
  if (known) entries.push({ type: 'label', label: known });
  if (!door.open && ctx.can('open_door')) {
    entries.push({
      label: 'Open it',
      icon: 'door-open',
      onSelect: () => ctx.run({ command_type: 'open_door', ...base }),
    });
  }
  if (door.open && !door.wedged && ctx.can('close_door')) {
    entries.push({
      label: 'Close it',
      icon: 'door',
      onSelect: () => ctx.run({ command_type: 'close_door', ...base }),
    });
  }
  if (!door.open) {
    entries.push(
      ...perMember(
        ctx,
        'Force it open',
        'hand',
        actors(ctx, 'force_door'),
        (member) => ({ command_type: 'force_door', ...base, character_id: member.id }),
        undefined,
        (member) =>
          typeof member.open_doors_chance === 'number' ? `${member.open_doors_chance} in 6` : null,
      ),
    );
    entries.push(
      ...perMember(
        ctx,
        'Pick the lock',
        'key',
        actors(ctx, 'pick_lock', (member) => hasThiefSkill(member, 'open_locks')),
        (member) => ({ command_type: 'pick_lock', ...base, character_id: member.id }),
        (member) => ({ nothingText: `${member.name} works at the lock, but nothing seems to happen.` }),
      ),
    );
    entries.push(
      ...perMember(
        ctx,
        'Listen at it',
        'ear',
        actors(ctx, 'listen_at_door'),
        (member) => ({ command_type: 'listen_at_door', ...base, character_id: member.id }),
        (member) => ({ nothingText: `${member.name} listens, but hears nothing.` }),
      ),
    );
  }
  if (!door.wedged && ctx.can('wedge_door') && living.length > 0) {
    entries.push({
      label: door.open ? 'Wedge it open with a spike' : 'Wedge it shut with a spike',
      icon: 'lock',
      onSelect: () => ctx.run({ command_type: 'wedge_door', ...base }),
    });
  }
  return entries;
}

/** The search actions: one submenu for each kind, listing who searches. */
export function searchEntries(ctx: ActionContext): MenuEntry[] {
  if (!ctx.can('search')) return [];
  const members = livingMembers(ctx.view.party);
  if (members.length === 0) return [];
  return (['secret_doors', 'room_traps', 'construction'] as const).map((kind) => ({
    type: 'submenu' as const,
    label: `Search for ${searchKindLabel(kind).toLowerCase()}`,
    icon: 'search' as const,
    items: members.map((member) => ({
      label: member.name,
      onSelect: () =>
        ctx.run(
          { command_type: 'search', kind, character_id: member.id },
          { nothingText: `${member.name} searches, but finds nothing.` },
        ),
    })),
  }));
}

/** The rest actions: a turn, a night, or a day. */
export function restEntries(ctx: ActionContext): MenuEntry[] {
  if (!ctx.can('rest')) return [];
  return (['turn', 'night', 'day'] as const).map((kind) => ({
    label: `Rest for ${restKindLabel(kind).toLowerCase()}`,
    icon: kind === 'turn' ? ('hourglass' as const) : ('rest' as const),
    onSelect: () => ctx.run({ command_type: 'rest', kind }),
  }));
}

/** Light and put out torches and lanterns. */
export function lightEntries(ctx: ActionContext): MenuEntry[] {
  const entries: MenuEntry[] = [];
  const living = new Set(livingMembers(ctx.view.party).map((member) => member.id));
  const name = (id: string) => ctx.view.party.find((member) => member.id === id)?.name ?? 'Someone';
  for (const light of carriedLights(ctx.view.party)) {
    if (!living.has(light.memberId) || !ctx.can('light_source', light.memberId)) continue;
    entries.push({
      label: `${name(light.memberId)} lights ${itemPhrase(resolveItemNoun(light.itemId, ctx.text, { name: light.name }))}`,
      icon: light.itemId === 'lantern' ? 'lantern' : 'torch',
      onSelect: () =>
        ctx.run(
          { command_type: 'light_source', character_id: light.memberId, item_id: light.itemId },
          { nothingText: `${name(light.memberId)} strikes a light, but it doesn't catch.` },
        ),
    });
  }
  if (oilOnCell(ctx.view)) {
    for (const memberId of living) {
      if (!ctx.can('light_source', memberId)) continue;
      entries.push({
        label: `${name(memberId)} sets fire to the oil`,
        icon: 'potion',
        onSelect: () =>
          ctx.run({ command_type: 'light_source', character_id: memberId, item_id: 'oil_flask' }),
      });
      break;
    }
  }
  const burning = partyLight(ctx.view).lights;
  for (const light of burning) {
    if (!ctx.can('extinguish_source', light.memberId)) continue;
    entries.push({
      label: `${name(light.memberId)} puts out their light`,
      icon: 'moon',
      onSelect: () => ctx.run({ command_type: 'extinguish_source', character_id: light.memberId }),
    });
  }
  return entries;
}

/** A name for a cache in a list of caches. */
export function cacheLabel(cache: SceneCache, caches: readonly SceneCache[]): string {
  if (caches.length <= 1) return 'The treasure';
  return `Treasure ${caches.indexOf(cache) + 1}`;
}

/** The actions for one cache the party can see. */
export function cacheEntries(ctx: ActionContext, cache: SceneCache, label: string): MenuEntry[] {
  const entries: MenuEntry[] = [];
  const living = livingMembers(ctx.view.party);
  if (cache.reachable && ctx.can('take_treasure')) {
    entries.push({
      label: `Take ${label.toLowerCase()}`,
      icon: 'coins',
      onSelect: () => ctx.run({ command_type: 'take_treasure', feature_id: cache.id }),
    });
    if (living.length > 1) {
      entries.push({
        type: 'submenu',
        label: 'Give it all to one member',
        icon: 'user',
        items: living.map((member) => ({
          label: member.name,
          onSelect: () =>
            ctx.run({ command_type: 'take_treasure', feature_id: cache.id, recipient_id: member.id }),
        })),
      });
    }
  }
  const thieves = (command: string) =>
    actors(ctx, command, (member) => hasThiefSkill(member, 'find_remove_treasure_traps'));
  if (cache.trap === null || cache.trap.state === 'found') {
    if (cache.trap === null) {
      entries.push(
        ...perMember(
          ctx,
          'Check it for traps',
          'trap',
          thieves('inspect_treasure'),
          (member) => ({ command_type: 'inspect_treasure', feature_id: cache.id, character_id: member.id }),
          (member) => ({ nothingText: `${member.name} finds no trap.` }),
        ),
      );
    } else {
      entries.push(
        ...perMember(ctx, 'Disarm the trap', 'trap', thieves('remove_treasure_trap'), (member) => ({
          command_type: 'remove_treasure_trap',
          feature_id: cache.id,
          character_id: member.id,
        })),
      );
    }
  }
  return entries;
}

/** The actions for goods dropped on the party's cell. */
export function pileEntries(ctx: ActionContext): MenuEntry[] {
  if (!ctx.can('take_treasure')) return [];
  return [
    {
      label: 'Pick up the dropped goods',
      icon: 'coins',
      onSelect: () => ctx.run({ command_type: 'take_treasure', feature_id: 'pile' }),
    },
  ];
}

/** The button text for taking a transition. */
export function transitionAction(transition: Pick<SceneTransition, 'kind' | 'leads'>): string {
  switch (transition.kind) {
    case 'stairs_down':
      return 'Go down the stairs';
    case 'stairs_up':
      return 'Climb the stairs';
    case 'trapdoor':
      return 'Climb through the trapdoor';
    case 'chute':
      return 'Slide down the chute';
    case 'passage':
      return 'Go through the passage';
  }
}

/** A short description of a transition: what it is and which way it leads. */
export function transitionDescription(transition: Pick<SceneTransition, 'kind' | 'leads'>): string {
  const thing =
    transition.kind === 'stairs_down' || transition.kind === 'stairs_up'
      ? 'Stairs'
      : transition.kind === 'trapdoor'
        ? 'A trapdoor'
        : transition.kind === 'chute'
          ? 'A chute'
          : 'A passage';
  const plural = thing === 'Stairs';
  switch (transition.leads) {
    case 'up':
      return `${thing} ${plural ? 'lead' : 'leads'} up.`;
    case 'down':
      return `${thing} ${plural ? 'lead' : 'leads'} down.`;
    case 'same_level':
      return `${thing} ${plural ? 'lead' : 'leads'} elsewhere on this level.`;
    case 'elsewhere':
      return `${thing} ${plural ? 'lead' : 'leads'} out of this place.`;
  }
}

/** The transitions on the party's cell that `use_stairs` takes. */
export function stairsHere(scene: Scene | null): SceneTransition[] {
  return (scene?.here?.transitions ?? []).filter((transition) => transition.kind !== 'passage');
}

/** The action for taking the transition on the party's cell. */
export function stairsEntries(ctx: ActionContext): MenuEntry[] {
  const [transition] = stairsHere(ctx.scene);
  if (!transition || !ctx.can('use_stairs')) return [];
  return [
    {
      label: transitionAction(transition),
      icon: transition.kind === 'stairs_up' ? 'arrow-up' : 'stairs',
      onSelect: () => ctx.run({ command_type: 'use_stairs' }),
    },
  ];
}

/** Turn the party to face another way. */
export function turnEntries(ctx: ActionContext): MenuEntry[] {
  if (!ctx.can('turn_party')) return [];
  const facing = ctx.view.location.kind === 'dungeon' ? ctx.view.location.facing : null;
  return [
    {
      type: 'submenu',
      label: 'Face another way',
      icon: 'compass',
      items: DIRECTIONS.filter((direction) => direction !== facing).map((direction) => ({
        label: `Face ${directionLabel(direction).toLowerCase()}`,
        onSelect: () => ctx.run({ command_type: 'turn_party', facing: direction }, { feedback: 'map' }),
      })),
    },
  ];
}

/** Every treasure action for what lies on or around the party's cell. */
export function treasureEntries(ctx: ActionContext): MenuEntry[] {
  const here = ctx.scene?.here;
  if (!here) return [];
  const entries: MenuEntry[] = [];
  for (const cache of here.caches) {
    const label = cacheLabel(cache, here.caches);
    const items = cacheEntries(ctx, cache, label);
    if (items.length === 0) continue;
    if (here.caches.length > 1) entries.push({ type: 'label', label });
    entries.push(...items);
  }
  if (here.pile) entries.push(...pileEntries(ctx));
  return entries;
}

/** Joins groups of entries with separators, dropping empty groups. */
export function joinGroups(...groups: MenuEntry[][]): MenuEntry[] {
  const out: MenuEntry[] = [];
  for (const group of groups) {
    if (group.length === 0) continue;
    if (out.length > 0) out.push({ type: 'separator' });
    out.push(...group);
  }
  return out;
}

/** The text of a menu entry, or an empty string for a separator. */
export function entryLabel(entry: MenuEntry): string {
  return 'label' in entry ? entry.label : '';
}
