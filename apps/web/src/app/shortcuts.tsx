/**
 * Keyboard shortcuts and command palette actions. A feature registers a shortcut with {@link useShortcut} and an
 * action with {@link useAction} while it is mounted. One listener handles every shortcut, the help dialog
 * (`?`) lists them, and the command palette (Ctrl+K or Cmd+K) lists the actions.
 *
 * ```tsx
 * useShortcut({ id: 'explore.search', keys: 's', label: 'Search the area', group: 'Party', run: search });
 * useAction({ id: 'explore.search', label: 'Search the area', group: 'Party', icon: 'search', run: search, shortcut: 's' });
 * ```
 *
 * A key spec is a key with optional modifiers joined by `+`: `s`, `shift+r`, `mod+k` (Ctrl, or Cmd on a Mac),
 * `alt+1`, `?`, `escape`, `arrowup`. Shortcuts don't fire while focus is in a text field, unless
 * `allowInInputs` is set.
 */
import { useEffect, useMemo, useRef } from 'react';
import { create } from 'zustand';
import { CommandPalette, Dialog, Kbd, type CommandAction, type IconName } from '@/ui';
import styles from './shortcuts.module.css';
import { useTableUi } from './ui';

export interface ShortcutDefinition {
  /** A unique ID, such as `explore.search`. A second registration with the same ID replaces the first. */
  id: string;
  /** The key spec, such as `s` or `mod+k`. */
  keys: string;
  /** What it does, in sentence case: "Search the area". The help dialog lists it. */
  label: string;
  /** The heading it appears under in the help dialog, such as "Map" or "Party". Defaults to "General". */
  group?: string;
  /** Turns the shortcut off without unregistering it. */
  enabled?: boolean;
  /** Fires even while focus is in a text field. */
  allowInInputs?: boolean;
  run: (event: KeyboardEvent) => void;
}

export interface ActionDefinition {
  id: string;
  label: string;
  group?: string;
  icon?: IconName;
  /** A key spec to show beside the action. Register the shortcut itself with `useShortcut`. */
  shortcut?: string;
  keywords?: string[];
  disabled?: boolean;
  run: () => void;
}

interface Registry {
  shortcuts: Record<string, ShortcutDefinition>;
  actions: Record<string, ActionDefinition>;
}

const useRegistry = create<Registry>()(() => ({ shortcuts: {}, actions: {} }));

/** Whether the page runs on a Mac, where `mod` means Cmd. */
export function isMac(): boolean {
  return (
    typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
  );
}

interface ParsedKeys {
  key: string;
  mod: boolean;
  ctrl: boolean;
  meta: boolean;
  alt: boolean;
  shift: boolean;
}

function parseKeys(spec: string): ParsedKeys {
  const parts = spec.toLowerCase().split('+');
  // `+` itself is written as `shift+=` or the last empty part of `mod++`.
  const key = parts.at(-1) === '' ? '+' : (parts.at(-1) ?? '');
  const mods = new Set(parts.slice(0, -1));
  return {
    key,
    mod: mods.has('mod'),
    ctrl: mods.has('ctrl'),
    meta: mods.has('meta') || mods.has('cmd'),
    alt: mods.has('alt') || mods.has('option'),
    shift: mods.has('shift'),
  };
}

/** The key an event names, from its code for letters and digits so Alt and Shift layouts still match. */
function eventKeys(event: KeyboardEvent): string[] {
  const keys = [event.key.toLowerCase()];
  if (event.code.startsWith('Key')) keys.push(event.code.slice(3).toLowerCase());
  if (event.code.startsWith('Digit')) keys.push(event.code.slice(5));
  return keys;
}

/**
 * Whether a keyboard event matches a key spec. A symbol key such as `?` matches whatever Shift state types it.
 *
 * @param spec - A key spec, such as `mod+k`.
 * @param event - The event.
 * @param mac - Whether `mod` means Cmd. Defaults to the current platform.
 */
export function matchesShortcut(spec: string, event: KeyboardEvent, mac: boolean = isMac()): boolean {
  const parsed = parseKeys(spec);
  if (!eventKeys(event).includes(parsed.key)) return false;
  const wantCtrl = parsed.ctrl || (parsed.mod && !mac);
  const wantMeta = parsed.meta || (parsed.mod && mac);
  if (event.ctrlKey !== wantCtrl || event.metaKey !== wantMeta || event.altKey !== parsed.alt) return false;
  const symbol = parsed.key.length === 1 && !/[a-z0-9]/.test(parsed.key);
  if (!symbol && event.shiftKey !== parsed.shift) return false;
  return true;
}

const KEY_NAMES: Record<string, string> = {
  escape: 'Esc',
  enter: 'Enter',
  space: 'Space',
  ' ': 'Space',
  arrowup: '↑',
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→',
  backspace: 'Backspace',
  delete: 'Delete',
  tab: 'Tab',
};

/**
 * The keys of a spec as `Kbd` shows them, such as `['Ctrl', 'K']` or `['⌘', 'K']`.
 *
 * @param spec - A key spec.
 * @param mac - Whether to show Mac symbols. Defaults to the current platform.
 */
export function formatShortcut(spec: string, mac: boolean = isMac()): string[] {
  const parsed = parseKeys(spec);
  const keys: string[] = [];
  if (parsed.mod) keys.push(mac ? '⌘' : 'Ctrl');
  if (parsed.ctrl) keys.push('Ctrl');
  if (parsed.meta) keys.push(mac ? '⌘' : 'Meta');
  if (parsed.alt) keys.push(mac ? '⌥' : 'Alt');
  if (parsed.shift) keys.push('Shift');
  keys.push(KEY_NAMES[parsed.key] ?? parsed.key.toUpperCase());
  return keys;
}

function isTextTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag !== 'INPUT') return false;
  const type = (target as HTMLInputElement).type;
  return !['checkbox', 'radio', 'button', 'submit', 'range', 'color'].includes(type);
}

/**
 * Registers a keyboard shortcut while the component is mounted. `run` may change on every render.
 *
 * @param definition - The shortcut.
 */
export function useShortcut(definition: ShortcutDefinition): void {
  const runRef = useRef(definition.run);
  useEffect(() => {
    runRef.current = definition.run;
  });
  const { id, keys, label, group, enabled, allowInInputs } = definition;
  useEffect(() => {
    const entry: ShortcutDefinition = {
      id,
      keys,
      label,
      group,
      enabled,
      allowInInputs,
      run: (event) => runRef.current(event),
    };
    useRegistry.setState((state) => ({ shortcuts: { ...state.shortcuts, [id]: entry } }));
    return () => {
      useRegistry.setState((state) => {
        if (state.shortcuts[id] !== entry) return state;
        const { [id]: _removed, ...rest } = state.shortcuts;
        return { shortcuts: rest };
      });
    };
  }, [id, keys, label, group, enabled, allowInInputs]);
}

/**
 * Registers a command palette action while the component is mounted. `run` may change on every render.
 *
 * @param definition - The action.
 */
export function useAction(definition: ActionDefinition): void {
  const runRef = useRef(definition.run);
  useEffect(() => {
    runRef.current = definition.run;
  });
  const { id, label, group, icon, shortcut, disabled } = definition;
  const keywords = definition.keywords?.join(' ');
  useEffect(() => {
    const entry: ActionDefinition = {
      id,
      label,
      group,
      icon,
      shortcut,
      disabled,
      keywords: keywords?.split(' '),
      run: () => runRef.current(),
    };
    useRegistry.setState((state) => ({ actions: { ...state.actions, [id]: entry } }));
    return () => {
      useRegistry.setState((state) => {
        if (state.actions[id] !== entry) return state;
        const { [id]: _removed, ...rest } = state.actions;
        return { actions: rest };
      });
    };
  }, [id, label, group, icon, shortcut, disabled, keywords]);
}

/** Every registered shortcut, for the help dialog. */
export function useRegisteredShortcuts(): ShortcutDefinition[] {
  const shortcuts = useRegistry((s) => s.shortcuts);
  return useMemo(() => Object.values(shortcuts), [shortcuts]);
}

/**
 * Handles every registered shortcut, and opens the help dialog with `?` and the command palette with Ctrl+K or
 * Cmd+K. The app renders it once.
 */
export function ShortcutLayer() {
  const setShortcutsOpen = useTableUi((s) => s.setShortcutsOpen);
  const setPaletteOpen = useTableUi((s) => s.setPaletteOpen);
  useShortcut({
    id: 'app.help',
    keys: '?',
    label: 'Show keyboard shortcuts',
    run: () => setShortcutsOpen(true),
  });
  useShortcut({
    id: 'app.palette',
    keys: 'mod+k',
    label: 'Open the command palette',
    allowInInputs: true,
    run: () => setPaletteOpen(true),
  });
  useAction({
    id: 'app.help',
    label: 'Show keyboard shortcuts',
    icon: 'command',
    shortcut: '?',
    run: () => setShortcutsOpen(true),
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) return;
      const typing = isTextTarget(event.target);
      for (const shortcut of Object.values(useRegistry.getState().shortcuts)) {
        if (shortcut.enabled === false) continue;
        if (typing && !shortcut.allowInInputs) continue;
        if (!matchesShortcut(shortcut.keys, event)) continue;
        event.preventDefault();
        shortcut.run(event);
        return;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <>
      <ShortcutHelpDialog />
      <CommandPaletteHost />
    </>
  );
}

/** The keyboard help dialog: every registered shortcut, by group. */
function ShortcutHelpDialog() {
  const open = useTableUi((s) => s.shortcutsOpen);
  const setOpen = useTableUi((s) => s.setShortcutsOpen);
  const shortcuts = useRegisteredShortcuts();
  const groups = useMemo(() => {
    const byGroup = new Map<string, ShortcutDefinition[]>();
    for (const shortcut of shortcuts) {
      if (shortcut.enabled === false) continue;
      const group = shortcut.group ?? 'General';
      byGroup.set(group, [...(byGroup.get(group) ?? []), shortcut]);
    }
    return [...byGroup.entries()].sort(([a], [b]) =>
      a === 'General' ? -1 : b === 'General' ? 1 : a.localeCompare(b),
    );
  }, [shortcuts]);
  return (
    <Dialog open={open} onOpenChange={setOpen} title="Keyboard shortcuts" size="md">
      <div className={styles.groups}>
        {groups.map(([group, items]) => (
          <section key={group} className={styles.group}>
            <h3 className={styles.groupTitle}>{group}</h3>
            <dl className={styles.list}>
              {items.map((item) => (
                <div key={item.id} className={styles.row}>
                  <dt className={styles.label}>{item.label}</dt>
                  <dd className={styles.keys}>
                    <Kbd keys={formatShortcut(item.keys)} />
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Dialog>
  );
}

/** The command palette, listing every registered action. */
function CommandPaletteHost() {
  const open = useTableUi((s) => s.paletteOpen);
  const setOpen = useTableUi((s) => s.setPaletteOpen);
  const registered = useRegistry((s) => s.actions);
  const actions = useMemo<CommandAction[]>(
    () =>
      Object.values(registered)
        .sort((a, b) => (a.group ?? '').localeCompare(b.group ?? '') || a.label.localeCompare(b.label))
        .map((action) => ({
          id: action.id,
          label: action.label,
          group: action.group,
          icon: action.icon,
          shortcut: action.shortcut === undefined ? undefined : formatShortcut(action.shortcut),
          keywords: action.keywords,
          disabled: action.disabled,
          onRun: action.run,
        })),
    [registered],
  );
  return (
    <CommandPalette
      open={open}
      onOpenChange={setOpen}
      actions={actions}
      placeholder="Type an action or search"
      emptyText="No action matches that"
    />
  );
}
