# bxvtt design system (`apps/web/src/ui`)

`src/ui` defines the design tokens, fonts, icons, and accessible React components used across bxvtt screens. Build every interface from these exports rather than introducing parallel button, dialog, or input primitives.

To inspect every token, surface, and interactive state live, start the Vite dev server and open `/kit` (component gallery) or `/kit/table` (full-screen play layout mock):

```sh
npm run dev -w @bxvtt/web
# Component gallery: http://localhost:5180/kit
# Table layout mock: http://localhost:5180/kit/table
```

Both `/kit` and `/kit/table` are lazy routes (`KitGallery` and `KitTableMock` from `@/ui/gallery`), so gallery code stays out of the main application bundle.

## Application setup

`src/main.tsx` and `src/App.tsx` wire the global styles and root provider once:

1. Import `./ui/styles` before rendering so variable fonts, `tokens.css`, and `base.css` load first:

   ```ts
   import './ui/styles';
   ```

2. Wrap the application tree in `KitProvider` (or `AppKitProvider` from `@/app`, which forwards the user's motion preference as `reducedMotion` and provides tooltip timing and the toast stack):

   ```tsx
   import { KitProvider } from '@/ui';

   root.render(
     <KitProvider reducedMotion={userWantsLessMotion}>
       <App />
     </KitProvider>,
   );
   ```

Import components, hooks, and JavaScript token constants from `@/ui`, and style feature CSS Modules with custom properties from `tokens.css`:

```tsx
import { Button, Dialog, Field, TextInput, chromeColors, fonts, playerColorHex, toast } from '@/ui';
```

```css
.roster {
  display: flex;
  gap: var(--space-3);
  padding: var(--space-4);
  border: var(--border-hair) solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface-1);
}
```

## Visual direction and principles

The aesthetic evokes a candlelit table at night with an adventure module open beside the map:

- **Fraunces** sets display headings (`--font-display-plain`) and the wordmark (`--font-display-soft`).
- **Atkinson Hyperlegible Next** sets body copy, controls, and stat blocks so `Il1`, `O0`, and `rn`/`m` stay distinct at small sizes.
- **Rokkitt** (`--font-numeric`) sets numbers read at a glance: dice, ability scores, hit points, armour class, coin counts, and the game clock.

Follow seven rules when composing screens:

1. **Keep the map brightest.** Chrome uses low-chroma lampblack and umber (`--color-surface-*`). Avoid large saturated fills adjacent to the map stage.
2. **Reserve brass for primary focus and selection.** `--color-accent` marks the primary button, selected state, and focus ring; render at most one primary button per view.
3. **Reserve `Parchment` for paper artifacts.** Apply `Parchment` (`data-surface="paper"`) only to character sheets, handouts, and journal pages, never to chrome panels, menus, or top bars.
4. **Set game numbers in `--font-numeric`** with tabular numerals whenever values align in columns.
5. **Keep type readable.** Interface copy runs at `14px` (`--text-md`) and stat blocks go no smaller than `13px` (`--text-sm`).
6. **Tie motion to user actions** and honor reduced motion everywhere.
7. **Display server values directly.** `HpBar`, `StatBox`, and `DiceRoll` render values supplied by `bxapi` without computing rules locally.

## Token tiers, stacking, motion, and themes

Components and features consume **Roles** and **Scales** only; never reference raw `--palette-*` variables outside `tokens.css`.

| Tier | Pattern | Examples | Scope |
| --- | --- | --- | --- |
| Palette | `--palette-{pigment}-{step}` | `--palette-ink-900`, `--palette-brass-500`, `--palette-vellum-100` | Internal to `tokens.css` only. |
| Roles | `--color-{role}[-{variant}]` | `--color-surface-2`, `--color-text-muted`, `--color-accent`, `--color-danger-subtle`, `--color-paper-ink` | Semantic colors consumed by components and features. |
| Scales | `--{scale}-{step}` | `--space-3`, `--text-sm`, `--radius-md`, `--shadow-2`, `--duration-base`, `--ease-out`, `--z-layer` | Spacing, type size, elevation, motion, and z-index steps. |

Additional token groups cover player colors (`--player-{pigment}` and `playerColors` in `tokens.ts`), coins (`--coin-pp` through `--coin-cp`), dice (`--color-die-*`), and layout dimensions (`--control-sm|md|lg`, `--topbar-height`, `--rail-width`, `--actionbar-height`, `--dock-min|default|max`).

- **Portal z-index (`--z-layer`, `1200`):** Every portaled overlay (dialogs, drawers, menus, context menus, selects, comboboxes, and popovers) shares `--z-layer` and stacks in DOM open order so menus inside dialogs or nested dialogs layer properly without custom `z-index` values. Toasts (`--z-toast`, `1400`) and tooltips (`--z-tooltip`, `1500`) sit above all portals.
- **Reduced motion:** `KitProvider` sets `data-motion="reduce"` or `data-motion="full"` on `:root` and exposes `useKitReducedMotion()`. Pair `@media (prefers-reduced-motion: reduce)` (`:root:not([data-motion='full'])`) with `:root[data-motion='reduce']` in CSS animations.
- **Themes and paper scope:** Default chrome uses dark candlelight; `data-theme="daylight"` switches semantic roles to daylight (experimental), and `data-surface="paper"` (applied automatically by `Parchment`) switches controls and tables inside it to ink on vellum.

## Accessibility and key hints

- Wrap form inputs in `Field` so labels, hints, validation errors, and ARIA attributes connect automatically.
- Provide an accessible `label` on every `IconButton` and standalone `Icon`. An `IconButton` also shows its label as its tooltip (see [Hover help](#hover-help)).
- Never strip `:focus-visible` outlines (`base.css` renders a `2px` `--color-focus` ring).
- Keep shortcut keycaps out of accessible control names so controls satisfy WCAG 2.5.3 (Label in Name): pass `shortcut="G"` on `Button` (or `ActionBarMenu`, `ToolRailButton`, menu items, and palette actions), which renders visual keys via `KbdControlScope` while setting `aria-keyshortcuts`.
- Pass `animate={false}` to `DiceRoll` for historical feed entries so only newly rolled dice animate.

## Hover help

Hover help is the tooltip that appears when someone hovers over a control or moves keyboard focus to it. Kit controls draw their own hover help from props, so you don't wrap a control in `Tooltip`, and you never use the native `title` attribute.

### Give a control its hover help

| Case | Props | Example |
| --- | --- | --- |
| The label doesn't say what happens | `tooltip` | `<Button icon="search" tooltip="Search the room for secret doors and traps">Search</Button>` |
| Icon-only control | `label` (the tooltip shows it) | `<IconButton icon="settings" label="Table settings" />` |
| Icon-only control that needs more than its name | `label` and `tooltip` | `<IconButton icon="hourglass" label="Advance time" tooltip="Advance time by 1 turn (10 minutes)" />` |
| Unavailable control | `disabled` and `disabledReason` | `<Button disabled={!permission.allowed} disabledReason={permission.reason}>Start game</Button>` |
| Keyboard shortcut | `shortcut` | `<ToolRailButton icon="ping" label="Ping" shortcut="P" />` |
| Unavailable menu item | `disabled` and `disabledReason` on the `MenuEntry` | `{ label: 'Make player', disabled: true, disabledReason: 'Make another member a referee first.' }` |
| Unavailable list item | `disabled` and `disabledReason` on the `ListItem` | `<ListItem value={id} title="Osric" disabled disabledReason={permission.reason} />` |
| Tooltip on another side | `tooltipSide` | `<IconButton icon="dock-close" label="Hide table panels" tooltipSide="bottom" />` |

These controls take the props:

- `Button`, `IconButton`, and `LinkButton`: `tooltip`, `disabledReason`, and `tooltipSide`. `Button` and `IconButton` also take `shortcut`.
- `ToolRailButton` and `ActionBarMenu`: `tooltip`, `disabledReason`, and `shortcut`.
- `TabsTrigger` and `SegmentedControl` options: `tooltip`. With `iconOnly`, the tooltip shows the label.
- `MenuEntry` items and submenus: `disabledReason`, which the menu shows as text under the label instead of in a tooltip.
- `ListItem`: `disabledReason`, which the list shows as text under the label instead of in a tooltip. In a selectable list the item stays reachable with the arrow keys, and choosing it does nothing.
- `CommandPalette` actions (and `useAction` definitions in `@/app`): `disabledReason`, which the palette shows under the label.

Form controls (`TextInput`, `NumberInput`, `Select`, `Combobox`, `Switch`, `Checkbox`, `RadioGroup`, and `Slider`) take their help as visible text: the `hint` of their `Field`, or their own `description`. A `NumberInput` also takes `minReason` and `maxReason`, which say why the value can't go further, such as `maxReason="All 2 first-level slots are full."`. While the value sits at that limit, the reason joins the field's description, and the step button shows it on hover.

These parts take no hover help, because their visible text already names them:

- `Combobox` list toggles and `NumberInput` step buttons stay out of the tab order (the arrow keys work in the field), and their icons are the standard chevron, minus, and plus.
- `DataTable` sort buttons are the column headings. The arrow beside a heading shows the order, and `aria-sort` gives it to screen readers. A tooltip such as "Sort by price" would repeat the heading.
- `Accordion` and collapsible `Panel` triggers are the section headings. When a section is unavailable, say why in visible text inside the section or beside its heading.

The kit handles the rest:

- **Hover and focus:** A tooltip opens 350 ms after the pointer rests on the control, and at once when someone moves focus to it with Tab or an arrow key. It stays closed when a script moves focus, such as into a dialog that just opened or back to the button of a menu that just closed, so the first Escape still closes the dialog.
- **Accessible names:** The tooltip never changes the control's accessible name. A `tooltip` or a `disabledReason` becomes the control's description (`aria-describedby`), which screen readers read after the name. An icon button's label tooltip repeats its name, so it isn't a description.
- **Cut-off labels:** A `Button` shows its label as a tooltip when the label doesn't fit, such as when a crowded action bar hides labels and keeps only icons, or when the label ends in an ellipsis.
- **Shortcuts:** Pass the keys once, in `shortcut`. A `Button` shows them after its label and in its tooltip. An `IconButton`, a `ToolRailButton`, and an `ActionBarMenu` show them in the tooltip. Each sets `aria-keyshortcuts`.
- **Unavailable controls:** With `disabled` and a `disabledReason`, a control stays in the tab order and sets `aria-disabled="true"` instead of the native `disabled` attribute. It ignores clicks, Enter, and Space, so a submit button doesn't submit its form, and a menu, popover, or dialog trigger stays shut. Its tooltip shows the reason, and an icon-only control shows its name above the reason. Pressing it opens the tooltip too. With `disabled` and no reason, the control is natively disabled: it leaves the tab order and shows no tooltip.
- **One tooltip per control:** A kit control inside a `Tooltip` shows only the outer tooltip. A control that has a native `title` gets no label tooltip from the kit, so it never shows two. The lint guard rejects that `title` in feature code, so neither case should appear in a new control.

Use `Tooltip` directly only for a focusable element that isn't a kit control, such as the color swatches in the profile form. Pass `describe={false}` when its text repeats the element's accessible name.

### Touch and narrow screens

A touch screen has no hover, and a tap moves focus without opening a tooltip. The one exception is an unavailable control, which opens its reason when tapped. Treat hover help as a convenience for mouse and keyboard users, and put anything a player needs in visible text.

### Write hover help

Follow the writing rules in `AGENTS.md`: sentence case, no em dashes or en dashes, the game's vocabulary (referee, party, caller, marching order, turn, round, hit points, armour class), and no raw IDs, codes, or catalog names.

1. **Say what the control does or what happens next, in the game's terms.** Write a tooltip as a phrase that starts with a verb, with no period at the end: "Search the room for secret doors and traps", "Show the full map, hidden monsters, and referee tools".
2. **Don't repeat the visible label.** A text button whose label says everything, such as "Cancel", "Create table", or "Save profile", needs no tooltip. A tooltip that repeats its label is a defect.
3. **Name an icon-only control in its `label`.** The label is the tooltip, so write it as the control's name in sentence case: "Table settings", "Actions for Wren". When you add a `tooltip`, start it with the label's words ("Zoom in on the map" for "Zoom in"), so a voice control user can say what they see.
4. **Say why a control is unavailable and what would make it available.** Write a disabled reason as one or two full sentences that end with a period: "Add at least one character to the party to start the game." or "Only the caller can rest the party. Wren is the caller." Never write "Disabled", "Not allowed", or "You can't do that right now."
5. **Use the reason the app already has.** The permission helpers in `@/app` (`useCanSend`, `useCanControlMember`, and the others) return `{ allowed, reason }` with the reason written for the player: it names the action, the caller, or the player in the seat, and says what would make the action available. Pass `reason` straight to `disabledReason`. When a command doesn't work in the current mode, `commandModesSentence(type, allowedModes, mode)` from `@bxvtt/shared/text` builds the sentence from the `allowed_modes` in bxapi's command catalog (`useCommandCatalog()`), such as "You can search only while exploring. The party is in town now." If a reason breaks these rules, report it instead of rewording it in a feature.
6. **Pass keys in `shortcut`, never in text.** Write "Search the room", not "Search the room (S)".
7. **State a cost only when bxapi states it.** Write "(1 turn)" or a price in a tooltip only when a catalog field supplies it. Never compute or remember a rule in the client.
8. **Keep it to one line.** A tooltip is at most 260 px wide, which fits about 80 characters on two short lines. Text longer than that belongs on the screen.
9. **Leave a control without a reason only while it waits for a request.** Show `loading` on the control that sent the request. Other controls can stay natively disabled for that moment without a reason.

Put help in visible text instead of a tooltip when any of these is true:

- A player needs it to decide, such as what an action costs, what it spends, or who it affects. Show it next to the choice, or in the confirm dialog of a destructive action.
- It takes more than one sentence.
- A touch user must be able to read it, such as the only explanation of why a screen is empty or why the game is waiting.

| Control | Weak | Better |
| --- | --- | --- |
| "Search" button in the action bar | "Search" | "Search the room for secret doors and traps" |
| Icon button that opens the dock | "Click to toggle" | Label "Hide table panels", no `tooltip` |
| "Start game" while the party is empty | (none) | `disabledReason`: "Add at least one character to the party to start the game." |
| "Move up" on the first character | (none) | `disabledReason`: "Wren is already first in the marching order." |
| "Rest" when another player is caller | "Not allowed" | `disabledReason`: "Only the caller can rest the party. Wren is the caller." |
| "Create table" | "Create table" | No tooltip. The label says it. |

### The lint guard

`npm run lint` fails when a `.tsx` file under `apps/web/src` puts a native `title` on an interactive element: a kit control, a native `button`, `a`, or `input`, a Radix part, or any element with a click handler, a key handler, `tabIndex`, or an interactive `role`. A `title` that is a heading, such as on `Banner`, `Dialog`, `Card`, or `Panel`, passes. The rules live in `eslint.config.js`.

## Export catalog (`@/ui`)

### Foundations and actions

| Export | Description | Source |
| --- | --- | --- |
| `tokens.css`, `base.css`, `styles` | CSS tokens, reset/focus rules, and font + stylesheet loader. | `tokens.css`, `base.css`, `styles.ts`, `fonts.ts` |
| Token objects | `playerColors`, `eventColors`, `coinColors`, `chromeColors`, `fonts`, `durations`, `zIndex`, `breakpoints`, `layout`. | `tokens.ts` |
| `Icon`, `iconNames`, `classIconNames` | Typed icon component combining Lucide UI icons and custom B/X game icons. | `icons/Icon.tsx`, `icons/gameIcons.tsx` |
| `cx`, `useMediaQuery`, `useReducedMotion`, `useControllableState`, `useKitReducedMotion` | Class joiner and state/media/motion hooks. | `lib/` |
| `colorIdForName`, `initialsForName`, `hashString` | Deterministic color ID and avatar initials from a display name. | `lib/identity.ts` |
| `KitProvider` | Root provider for motion preference, tooltip timing, and `Toaster`. | `components/KitProvider.tsx` |
| `Button`, `IconButton` | Primary, secondary, ghost, and danger buttons in `sm`/`md`/`lg` with `loading`, `asChild`, `shortcut`, and hover help (`tooltip`, `disabledReason`, `tooltipSide`). | `components/Button.tsx` |
| `Link`, `LinkButton` | Anchor link and button-styled-as-link (`inline` or `quiet` tone) for opening drawers such as compendium entries. | `components/Link.tsx` |
| `Kbd`, `ariaKeyShortcuts`, `KbdControlScope` | Keycap badge and `aria-keyshortcuts` formatter. | `components/Kbd.tsx` |

### Form controls

| Export | Description | Source |
| --- | --- | --- |
| `Field` | Label, hint, and error wrapper wired to its child control. | `components/Field.tsx` |
| `TextInput`, `SearchInput`, `Textarea` | Single-line input, clearable search field (`Esc` clears), and multi-line input (`minRows`, `autoGrow`, `maxRows`). | `components/TextInput.tsx` |
| `NumberInput` | Stepper input with arrow-key stepping, clamping, and accessible step button names. | `components/NumberInput.tsx` |
| `Select`, `Combobox` | Short-list picker and searchable portal combobox for long catalogs. | `components/Select.tsx`, `components/Combobox.tsx` |
| `Checkbox`, `Switch`, `RadioGroup`, `SegmentedControl`, `Slider` | Selection and range controls. | `components/Choice.tsx` |

### Navigation, overlays, surfaces, feedback, game pieces, dice, and layout

| Export | Description | Source |
| --- | --- | --- |
| `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` | Line or enclosed tabs with icons, unread badges, and `keepMounted` state preservation. | `components/Tabs.tsx` |
| `Dialog`, `DialogClose`, `ConfirmDialog`, `Drawer` | Modal dialogs (pass `dismissOnOutsideClick={false}` so an outside click doesn't close one), async confirmation dialog, and side/bottom sheet (`dimmed={false}` optional) with focus restoration. | `components/Dialog.tsx` |
| `Popover`, `Tooltip`, `TooltipProvider` | Anchored non-modal popover (requires `title` or `label`) and hover/focus tooltip for a trigger that isn't a kit control. | `components/Popover.tsx` |
| `DropdownMenu`, `ContextMenu` | Button menu and right-click / long-press / `Shift+F10` menu. | `components/Menu.tsx` |
| `toast`, `ToastProvider`, `Toaster` | Polite and assertive live-region toast notifications. | `components/toastStore.ts`, `components/Toast.tsx` |
| `CommandPalette`, `useCommandPaletteShortcut` | Searchable action launcher (`Ctrl+K` / `Cmd+K`). | `components/CommandPalette.tsx` |
| `Accordion`, `Stepper` | Collapsible sections and multi-step wizard progress bar. | `components/Accordion.tsx`, `components/Stepper.tsx` |
| `Badge`, `Tag`, `Avatar`, `AvatarStack`, `resolveColor` | Status badges, removable filter tags, and user presence avatars. | `components/Badge.tsx`, `components/Avatar.tsx` |
| `Card`, `Panel`, `Parchment`, `ScrollArea`, `DataTable`, `List`, `ListItem`, `Divider`, `SectionLabel`, `ResizablePanels`, `Splitter` | Structural containers, paper surface, sortable table, listbox rows, and drag-resizable panes. | `components/Surfaces.tsx`, `DataTable.tsx`, `List.tsx`, `Divider.tsx`, `SectionLabel.tsx`, `ResizablePanels.tsx` |
| `Spinner`, `Skeleton`, `ProgressBar`, `Banner`, `EmptyState`, `ErrorBoundary`, `ErrorFallback` | Loading states, callouts (including referee tone), empty placeholders, and stack-trace-free crash boundary. A warning or danger `Banner` is an alert by default. Pass `announce="status"` or `announce="none"` for one that appears each time a view opens, such as a forecast. | `components/Spinner.tsx`, `Feedback.tsx`, `ErrorBoundary.tsx` |
| `TokenPortrait`, `tokenIdentity`, `StatBox`, `formatModifier`, `HpBar`, `AcShield`, `CoinPurse`, `ConditionChip` | Round character / square monster tokens, ability boxes, trailing-damage HP bar, AC shield, copy-clean coin display, and condition chips. | `game/` |
| `Die`, `DiceRoll`, `formatDiceFormula`, `DICE_ROLL_MAX_MS` | SVG polyhedral faces (`d4`-`d100`) and `<1.2s` server-result roll playback. | `dice/` |
| `TableLayout`, `TableTopBar`, `ModeBadge`, `GameClock`, `ToolRail`, `ToolRailButton`, `ToolRailDivider`, `ActionBar`, `ActionBarItem`, `ActionBarDivider`, `ActionBarMenu`, `Dock`, `PageLayout`, `Wordmark`, `WordmarkMark` | Play screen frame (collapsing dock to drawer below `1100px`, progressive overflow on `ActionBar`), page frame, and wordmark. | `layout/` |

## Tests

Component tests live in `src/ui/__tests__` and run with `npx vitest run --project web`. Import `./cleanup` in each test file (Vitest runs without globals in `@bxvtt/web`), and rely on `src/test-setup.ts` for Radix jsdom polyfills (`ResizeObserver`, pointer capture, `scrollIntoView`, and `matchMedia`).
