import { commandInfo } from '@bxvtt/shared/text';
import { forwardRef, useMemo, useState } from 'react';
import {
  formatShortcut,
  useAction,
  useCanSend,
  useLegalCommands,
  useShortcut,
  useTableUi,
  type ActionDefinition,
} from '@/app';
import {
  ActionBarDivider,
  ActionBarItem,
  Button,
  DropdownMenu,
  Tooltip,
  type ButtonProps,
  type IconName,
  type MenuEntry,
} from '@/ui';
import {
  doorEntries,
  entryLabel,
  doorsHere,
  lightEntries,
  restEntries,
  searchEntries,
  stairsEntries,
  stairsHere,
  transitionAction,
  treasureEntries,
  turnEntries,
  type ActionContext,
} from './actions';
import { CommandFormDialog } from './CommandForm';
import { useActionContext, useAtEntrance, useSessionLore } from './hooks';
import { doorLoreKey } from './levels';
import { livingMembers } from './party';
import { levelKey } from '@/map';
import { useExploreSend } from './useExploreSend';

/** The commands this bar, the map, and the scene panel give their own controls. */
export const CUSTOM_COMMANDS: ReadonlySet<string> = new Set([
  'move_party',
  'turn_party',
  'open_door',
  'close_door',
  'force_door',
  'wedge_door',
  'listen_at_door',
  'pick_lock',
  'search',
  'inspect_treasure',
  'remove_treasure_trap',
  'take_treasure',
  'light_source',
  'extinguish_source',
  'rest',
  'use_stairs',
  'travel_to_town',
]);

/** Commands the character sheet handles, which the More menu opens the sheet for. */
export const SHEET_COMMANDS: ReadonlySet<string> = new Set([
  'drop_items',
  'give_items',
  'equip_item',
  'unequip_item',
]);

/** The listen actions for every closed door beside the party. */
function listenEntries(
  ctx: ActionContext,
  doorLore: (direction: string) => ReturnType<typeof useSessionLore>['doors'][string] | undefined,
): MenuEntry[] {
  const closed = doorsHere(ctx.view).filter((door) => !door.open);
  const groups = closed.map((door) => {
    const entries = doorEntries(ctx, door.direction, door, doorLore(door.direction));
    const listen = entries.filter((entry) => entryLabel(entry).startsWith('Listen'));
    return { door, listen };
  });
  const usable = groups.filter((group) => group.listen.length > 0);
  if (usable.length === 1) {
    const [only] = usable;
    if (!only) return [];
    return [{ type: 'label', label: `The door to the ${only.door.direction}` }, ...unwrap(only.listen)];
  }
  return usable.map((group) => ({
    type: 'submenu' as const,
    label: `The door to the ${group.door.direction}`,
    icon: 'door' as const,
    items: unwrap(group.listen),
  }));
}

/** Opens a single submenu into its items, so a short menu doesn't nest. */
function unwrap(entries: MenuEntry[]): MenuEntry[] {
  const [only] = entries;
  if (entries.length === 1 && only?.type === 'submenu') return only.items;
  return entries;
}

/** A bar button with a tooltip that passes the props of the toolbar and the menu trigger through to the button. */
const TipButton = forwardRef<HTMLButtonElement, ButtonProps & { tip: string; keys?: string }>(
  function TipButton({ tip, keys, ...props }, ref) {
    return (
      <Tooltip content={tip} shortcut={keys ? formatShortcut(keys) : undefined}>
        <Button ref={ref} size="sm" variant="secondary" {...props} />
      </Tooltip>
    );
  },
);

interface MenuActionProps {
  id: string;
  label: string;
  icon: IconName;
  keys: string;
  items: MenuEntry[];
  /** Why the action is off, for its tooltip. */
  reason: string | null;
  loading?: boolean;
}

/**
 * A menu button that joins the action bar's arrow-key navigation. `ActionBarItem` passes the toolbar's props to
 * this component, and it passes them on through the menu trigger to the button.
 */
const MenuButton = forwardRef<
  HTMLButtonElement,
  ButtonProps & MenuActionProps & { open: boolean; onOpenChange: (open: boolean) => void }
>(function MenuButton(
  { id: _id, label, icon, keys, items, reason, loading, open, onOpenChange, ...rest },
  ref,
) {
  const disabled = reason !== null || items.length === 0;
  return (
    <DropdownMenu
      open={open && !disabled}
      onOpenChange={onOpenChange}
      side="top"
      items={items}
      trigger={
        <TipButton
          ref={ref}
          {...rest}
          tip={reason ?? label}
          keys={keys}
          icon={icon}
          iconEnd="chevron-up"
          disabled={disabled}
          loading={loading}
        >
          {label}
        </TipButton>
      }
    />
  );
});

/** An action bar button that opens a menu, with a shortcut that opens it too. */
function MenuAction(props: MenuActionProps) {
  const { id, label, icon, keys, items, reason } = props;
  const [open, setOpen] = useState(false);
  const disabled = reason !== null || items.length === 0;
  useShortcut({ id, keys, label, group: 'Party', enabled: !disabled, run: () => setOpen(true) });
  useAction({ id, label, group: 'Party', icon, shortcut: keys, disabled, run: () => setOpen(true) });
  return (
    <ActionBarItem>
      <MenuButton {...props} open={open} onOpenChange={setOpen} />
    </ActionBarItem>
  );
}

interface DirectActionProps {
  id: string;
  label: string;
  icon: IconName;
  keys?: string;
  run: () => void;
  loading?: boolean;
}

/** An action bar button that acts at once. */
function DirectAction({ id, label, icon, keys, run, loading }: DirectActionProps) {
  useShortcut({ id, keys: keys ?? '', label, group: 'Party', enabled: keys !== undefined, run });
  const definition: ActionDefinition = { id, label, group: 'Party', icon, shortcut: keys, run };
  useAction(definition);
  return (
    <ActionBarItem>
      <TipButton tip={label} keys={keys} icon={icon} loading={loading} onClick={run}>
        {label}
      </TipButton>
    </ActionBarItem>
  );
}

/**
 * The action bar in `exploring` mode: search, listen, light, rest, and, when they apply here, treasure, stairs,
 * and the way back to town. "More" lists every other legal command, each with a form built from its schema.
 */
export function ExploreActions() {
  const ctx = useActionContext();
  const lore = useSessionLore();
  const legal = useLegalCommands();
  const atEntrance = useAtEntrance();
  const openSheet = useTableUi((s) => s.openCharacterSheet);
  const { pendingType, send } = useExploreSend();
  const [form, setForm] = useState<string | null>(null);
  const searchPermission = useCanSend('search');
  const restPermission = useCanSend('rest');

  const here = ctx?.scene?.here ?? null;
  const location = ctx?.view.location;
  const doorLore = (direction: string) => {
    if (
      !here ||
      (direction !== 'north' && direction !== 'east' && direction !== 'south' && direction !== 'west')
    )
      return undefined;
    return lore.doors[
      doorLoreKey(levelKey(here.dungeon_id, here.level_number), here.position[0], here.position[1], direction)
    ];
  };

  const more = useMemo<MenuEntry[]>(() => {
    if (ctx === null) return [];
    const entries: MenuEntry[] = [...turnEntries(ctx)];
    if (atEntrance !== true && ctx.can('travel_to_town')) {
      entries.push({
        label: 'Return to town',
        icon: 'town',
        onSelect: () => ctx.run({ command_type: 'travel_to_town' }),
      });
    }
    const living = livingMembers(ctx.view.party);
    const sheet: MenuEntry[] = [];
    for (const command of legal) {
      if (!SHEET_COMMANDS.has(command.command_type)) continue;
      const members = living.filter((member) => ctx.can(command.command_type, member.id));
      if (members.length === 0) continue;
      sheet.push({
        type: 'submenu',
        label: commandInfo(command.command_type).label,
        items: members.map((member) => ({
          label: `Open ${member.name}'s sheet`,
          onSelect: () => openSheet(member.id),
        })),
      });
    }
    if (sheet.length > 0)
      entries.push({ type: 'separator' }, { type: 'label', label: 'In the character sheet' }, ...sheet);
    const others = legal.filter(
      (command) =>
        command.kind === 'play' &&
        !CUSTOM_COMMANDS.has(command.command_type) &&
        !SHEET_COMMANDS.has(command.command_type) &&
        ctx.can(command.command_type),
    );
    if (others.length > 0) {
      entries.push({ type: 'separator' });
      for (const command of others) {
        entries.push({
          label: `${commandInfo(command.command_type).label}…`,
          onSelect: () => setForm(command.command_type),
        });
      }
    }
    return entries;
  }, [ctx, legal, atEntrance, openSheet]);

  if (ctx === null || location?.kind !== 'dungeon') return null;

  const search = searchEntries(ctx);
  const listen = listenEntries(ctx, doorLore);
  const light = lightEntries(ctx);
  const rest = restEntries(ctx);
  const treasure = treasureEntries(ctx);
  const stairs = stairsEntries(ctx);
  const [transition] = stairsHere(ctx.scene);
  const hasDoor = doorsHere(ctx.view).some((door) => !door.open);

  return (
    <>
      <MenuAction
        id="explore.search"
        label="Search"
        icon="search"
        keys="s"
        items={search}
        reason={searchPermission.allowed ? null : searchPermission.reason}
        loading={pendingType === 'search'}
      />
      <MenuAction
        id="explore.listen"
        label="Listen"
        icon="ear"
        keys="l"
        items={listen}
        reason={
          hasDoor
            ? listen.length === 0
              ? 'You have no one who can listen at this door.'
              : null
            : 'There is no closed door beside the party.'
        }
        loading={pendingType === 'listen_at_door'}
      />
      <MenuAction
        id="explore.light"
        label="Light"
        icon="torch"
        keys="t"
        items={light}
        reason={light.length === 0 ? 'Nobody you control carries a torch or a lantern.' : null}
        loading={pendingType === 'light_source' || pendingType === 'extinguish_source'}
      />
      <MenuAction
        id="explore.rest"
        label="Rest"
        icon="rest"
        keys="z"
        items={rest}
        reason={restPermission.allowed ? null : restPermission.reason}
        loading={pendingType === 'rest'}
      />
      {(treasure.length > 0 || stairs.length > 0 || atEntrance === true) && <ActionBarDivider />}
      {treasure.length > 0 && (
        <MenuAction
          id="explore.treasure"
          label="Treasure"
          icon="chest"
          keys="g"
          items={treasure}
          reason={null}
          loading={
            pendingType === 'take_treasure' ||
            pendingType === 'inspect_treasure' ||
            pendingType === 'remove_treasure_trap'
          }
        />
      )}
      {stairs.length > 0 && transition && (
        <DirectAction
          id="explore.stairs"
          label={transitionAction(transition)}
          icon={transition.kind === 'stairs_up' ? 'arrow-up' : 'stairs'}
          keys="u"
          run={() => ctx.run({ command_type: 'use_stairs' })}
          loading={pendingType === 'use_stairs'}
        />
      )}
      {atEntrance === true && ctx.can('travel_to_town') && (
        <DirectAction
          id="explore.town"
          label="Return to town"
          icon="town"
          run={() => void send({ command_type: 'travel_to_town' })}
          loading={pendingType === 'travel_to_town'}
        />
      )}
      <ActionBarDivider />
      <MenuAction id="explore.more" label="More" icon="more" keys="m" items={more} reason={null} />
      <CommandFormDialog commandType={form} onClose={() => setForm(null)} />
    </>
  );
}
