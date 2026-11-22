# bxvtt design system

`src/ui` holds every token, font, icon, and component that bxvtt screens use. Build each screen from these parts. If the kit lacks something, add it here (when your instructions give you `src/ui`) or build it in your feature directory from the tokens and report it.

To see every token and component in its states, run the web client and open the root page, which shows the kit gallery until the app router lands. The gallery component is `KitGallery` from `@/ui/gallery`, and `KitTableMock` shows the table layout filled with placeholder content.

```sh
BXVTT_WEB_PORT=5181 npm run dev -w @bxvtt/web   # then open http://localhost:5181/
```

## Set up

`main.tsx` already does both steps. Keep them when you replace `App.tsx`.

1. Import the global styles once, before anything renders. The module loads the fonts, `tokens.css`, and `base.css`.

   ```ts
   import './ui/styles';
   ```

2. Wrap the app in `KitProvider`. It shares tooltip timing, renders the toast stack, and passes the app's motion choice to kit components. The app renders `AppKitProvider` from `@/app`, which passes the user's motion preference as `reducedMotion`.

   ```tsx
   import { KitProvider } from '@/ui';

   root.render(
     <KitProvider reducedMotion={userWantsLessMotion}>
       <App />
     </KitProvider>,
   );
   ```

   Leave `reducedMotion` out to follow the system's `prefers-reduced-motion` setting.

Import components, hooks, and token values from `@/ui`:

```tsx
import { Button, Dialog, Field, TextInput, toast } from '@/ui';
```

Style your own markup with CSS Modules and the custom properties in `tokens.css`. JavaScript that needs a token value, such as the canvas map renderer, imports it from `tokens.ts`.

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

```ts
import { chromeColors, eventColors, fonts, playerColorHex } from '@/ui';
```

## The look

The interface is a candlelit table late at night with a module open on it. The chrome is lampblack and umber with brass accents, and it steps back so the map stays the brightest thing on screen. Vellum and iron-gall ink appear only on things that are paper at a real table: character sheets, handouts, and the journal.

Three typefaces divide the work:

- **Fraunces** sets headings and the wordmark. Its soft and wonky axes recall the Windsor and Souvenir faces on 1980s modules. Headings use `--font-display-plain`, and the wordmark uses `--font-display-soft`.
- **Atkinson Hyperlegible Next** sets all interface text and stat blocks. Its letterforms keep `Il1`, `O0`, and `rn`/`m` apart in dense text.
- **Rokkitt** sets numbers that a player reads at a glance: dice, ability scores, hit points, armour class, coin counts, and the clock.

## Design principles

1. **The map is the hero.** Chrome uses low-chroma warm darks. Don't put a large saturated fill next to the stage.
2. **Brass marks what you can press.** The accent is for the primary action, the selected item, and focus. Use at most one primary button per view.
3. **Paper is for paper.** Use `Parchment` for sheets, handouts, and the journal, and nowhere else.
4. **Numbers are first-class.** Put game numbers in `--font-numeric`, and use tabular figures where numbers line up in columns.
5. **Dense, but readable.** Interface text is 14 px (`--text-md`), and stat blocks go no smaller than 13 px (`--text-sm`). Use the spacing scale to separate groups instead of borders.
6. **Motion answers an action.** Opening, closing, rolling, and taking damage animate. Nothing moves on its own. Every animation respects `prefers-reduced-motion`.
7. **Display, never decide.** Game components show what bxapi reports. `HpBar` takes hit points, `StatBox` takes the modifier, and `DiceRoll` takes the results the server rolled.

## Token naming

Tokens come in three layers. Components and features use the second and third layers only.

| Layer | Pattern | Examples | Use |
| --- | --- | --- | --- |
| Palette | `--palette-{pigment}-{step}` | `--palette-ink-900`, `--palette-brass-500`, `--palette-vellum-100` | Raw values. Only `tokens.css` reads these. |
| Roles | `--color-{role}[-{variant}]` | `--color-surface-2`, `--color-text-muted`, `--color-accent`, `--color-danger-subtle`, `--color-damage`, `--color-paper-ink` | What a color is for. Themes redefine roles only. |
| Scales | `--{scale}-{step}` | `--space-3`, `--text-sm`, `--radius-md`, `--shadow-2`, `--duration-base`, `--ease-out`, `--z-modal` | Fixed steps for size, depth, motion, and stacking. |

Other groups:

- **Player colors** are `--player-{pigment}`: vermilion, saffron, orpiment, weld, malachite, verdigris, cerulean, azurite, ultramarine, tyrian, madder, and slate. `playerColors` in `tokens.ts` lists them with labels and hex values. Components that take a `color` prop accept a player color id or any CSS color.
- **Coins** are `--coin-pp`, `--coin-gp`, `--coin-ep`, `--coin-sp`, and `--coin-cp`.
- **Dice** are `--color-die-*`.
- **Layout measures** are `--control-sm|md|lg` (28, 32, and 40 px), `--topbar-height`, `--rail-width`, `--actionbar-height`, and `--dock-min|default|max`.
- **Layers** are `--z-base`, `--z-raised`, `--z-rail`, `--z-dock`, `--z-topbar`, `--z-layer`, `--z-toast`, and `--z-tooltip`. See [Layers](#layers).

### Layers

Everything that opens over the page in a portal shares one level, `--z-layer` (1200): dialogs, drawers, their overlays, menus, context menus, selects, comboboxes, and popovers. Layers on one level stack in the order they open, so a menu opened inside a dialog appears above that dialog, and a nested dialog dims the dialog beneath it. Toasts (`--z-toast`, 1400) and tooltips (`--z-tooltip`, 1500) stay above every layer.

`--z-dropdown`, `--z-overlay`, `--z-modal`, and `--z-popover` remain as names for `--z-layer`. Use them for a custom popup, and render it in a portal, as Radix does, so it stacks in open order.

### Motion

Kit components that animate read `useKitReducedMotion()`: the `reducedMotion` value that `KitProvider` received, or the system setting when it received none. `KitProvider` also sets `data-motion="reduce"` or `data-motion="full"` on the root element, and the kit's CSS honors it as well as the media query:

```css
@media (prefers-reduced-motion: reduce) {
  :root:not([data-motion='full']) .shimmer {
    animation: none;
  }
}

:root[data-motion='reduce'] .shimmer {
  animation: none;
}
```

Use the same pair of rules in a feature's CSS when the feature should follow the app's choice instead of the system setting alone.

### Themes and the paper scope

- The default theme is candlelight (dark). Set `data-theme="daylight"` on the root element, or on any element, to switch its roles to the light theme. The daylight values are a starting point and haven't had a full design review.
- `data-surface="paper"` switches roles to ink on vellum. `Parchment` sets it, so a `Field`, `DataTable`, or `StatBox` inside a character sheet needs no paper variant.

## Do and don't

Do:

- Use a kit component when one exists. There is one button (`Button` and `IconButton`), one dialog (`Dialog`, `ConfirmDialog`, and `Drawer`), and one toast system.
- Put every form control in a `Field`. The field supplies the label, the hint, the error, and the ARIA wiring.
- Give every `IconButton` a `label`, and give a standalone `Icon` a `label`. An icon next to visible text needs no label.
- Write UI text in sentence case and in the game's vocabulary: referee, party, caller, turn, round, hit points, armour class.
- Tell the player what happened and what to do next. Put a refused command's reason in a `Banner` or an error toast, in the game's terms.
- Pass `animate={false}` to `DiceRoll` for rolls loaded from history, so only new rolls tumble. A list that announces rolls itself, such as the feed, passes `announce={false}`, `hideHeader`, and `hideSkip`.
- Use `toast` for short confirmations and `Banner` for anything the player must read before acting.

Don't:

- Don't add a color, font size, spacing value, radius, shadow, duration, or z-index that isn't a token. Kit components may use fixed pixel sizes for their own internal parts.
- Don't raise a popup's z-index to get it above a dialog. Every portaled layer shares `--z-layer` and stacks in open order.
- Don't use a palette token (`--palette-*`) in a component or feature.
- Don't put parchment on chrome, such as panels, the top bar, or menus.
- Don't use more than one primary button in a view.
- Don't compute a game rule to decide what a component shows. Pass bxapi's values in.
- Don't show raw codes, IDs such as `character-0003`, or stack traces. `ErrorBoundary` keeps error details off the screen.
- Don't hide referee data with CSS. The server never sends it to a player.
- Don't remove focus outlines. `base.css` draws a 2 px outline in `--color-focus` on `:focus-visible`.

## Components

Every component below is exported from `@/ui`. The path column names the source file under `src/ui`.

### Foundations

| Export | Description | Source |
| --- | --- | --- |
| `tokens.css`, `base.css`, `styles` | Design tokens, the reset and global styles, and the module that loads both with the fonts. | `tokens.css`, `base.css`, `styles.ts`, `fonts.ts` |
| Token values | Typed values for JavaScript: `playerColors`, `eventColors`, `coinColors`, `chromeColors`, `fonts`, `durations`, `zIndex`, `breakpoints`, `layout`. | `tokens.ts` |
| `Icon`, `iconNames`, `classIconNames` | One icon component with a typed name, covering interface icons from lucide and original game icons. | `icons/Icon.tsx`, `icons/gameIcons.tsx` |
| `cx`, `useMediaQuery`, `useReducedMotion`, `useControllableState` | Class name joining and shared hooks. `useReducedMotion` reads the system setting only. | `lib/` |
| `useKitReducedMotion`, `MotionProvider` | Whether to reduce motion: the app's choice from `KitProvider`, or the system setting. `KitProvider` renders `MotionProvider` for you. | `lib/motion.tsx` |
| `colorIdForName`, `initialsForName`, `hashString` | Stable color and initials from a name. | `lib/identity.ts` |
| `KitProvider` | Motion, tooltip timing, and the toast stack. Render it once at the root. `reducedMotion` passes the app's motion choice to kit components. | `components/KitProvider.tsx` |

### Actions

| Export | Description | Source |
| --- | --- | --- |
| `Button` | The kit's button, in primary, secondary, ghost, and danger variants, three sizes, with icons and a loading state. `asChild` styles a link as a button. | `components/Button.tsx` |
| `IconButton` | A square button with an icon and a required accessible label. `pressed` marks an active tool. | `components/Button.tsx` |
| `Link` | A text link, inline or quiet, with an external variant. | `components/Link.tsx` |
| `LinkButton` | A button styled as a text link, for an in-app cross-link that opens something instead of going to a URL, such as a spell name that opens the rules reference. It takes `tone` (`inline` or `quiet`) and every button attribute. | `components/Link.tsx` |
| `Kbd` | A keyboard key or chord hint. | `components/Kbd.tsx` |

### Form controls

| Export | Description | Source |
| --- | --- | --- |
| `Field` | Label, hint, and error for one control, wired to the control automatically. | `components/Field.tsx` |
| `TextInput` | A single-line text input with optional leading icon and trailing content. | `components/TextInput.tsx` |
| `SearchInput` | A search field with a clear button. Escape clears it. The browser's own clear button is hidden. | `components/TextInput.tsx` |
| `Textarea` | A multi-line text input, at least 72 px tall by default. `minRows` (or the native `rows`) sets its height in lines instead, and `autoGrow` grows it with its text up to `maxRows` lines (8 by default) before it scrolls. A chat composer uses `minRows={1} autoGrow`. | `components/TextInput.tsx` |
| `NumberInput` | A number field with step buttons, arrow-key stepping, and clamping. The step buttons take their names from the field: "Increase Strength" and "Decrease Strength" in a Field labelled "Strength", or from `aria-label` outside a Field. `incrementLabel` and `decrementLabel` replace them. | `components/NumberInput.tsx` |
| `Select` | Picks one value from a short list, with optional groups. A `value` that starts undefined and later becomes a string doesn't switch it from uncontrolled to controlled. | `components/Select.tsx` |
| `Combobox` | A text input that filters a long list, such as monsters or spells. The list opens in a portal, so a scrolling dialog or drawer body doesn't clip it. | `components/Combobox.tsx` |
| `Checkbox` | A checkbox with a label, a description, and an indeterminate state. | `components/Choice.tsx` |
| `Switch` | An on and off setting that applies at once. | `components/Choice.tsx` |
| `RadioGroup` | Picks one of a few visible options. | `components/Choice.tsx` |
| `SegmentedControl` | Switches between a few views or modes. One segment is always on. | `components/Choice.tsx` |
| `Slider` | Picks a number from a range, with a formatted value. | `components/Choice.tsx` |

### Navigation and overlays

| Export | Description | Source |
| --- | --- | --- |
| `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` | Tabbed panels in line or enclosed style, with icons and unread counts. `TabsContent keepMounted` keeps a panel mounted while another tab is active, hidden from view and from assistive technology, with its scroll position and state intact. A tab shows its focus ring for keyboard focus only. | `components/Tabs.tsx` |
| `Dialog`, `DialogClose` | A modal window with a title, description, body, and footer. | `components/Dialog.tsx` |
| `ConfirmDialog` | Asks the user to confirm an action, with a spinner while an async action runs. `children` render below the description and can hold block content, such as a checkbox. | `components/Dialog.tsx` |
| `Drawer` | A side or bottom sheet over the page. `dimmed={false}` keeps the page in view behind it (the overlay still catches the click that closes it). `initialFocus` takes a ref to the element that gets focus on open, or `'content'` for the drawer itself. `Dialog` takes `initialFocus` too. | `components/Dialog.tsx` |
| `Popover` | Non-modal content anchored to a trigger. | `components/Popover.tsx` |
| `Tooltip`, `TooltipProvider` | A short hint on hover and focus, with an optional shortcut. | `components/Popover.tsx` |
| `DropdownMenu` | A menu of actions from a button, with checkbox items, labels, separators, and submenus. | `components/Menu.tsx` |
| `ContextMenu` | The same menu on right-click, long press, or Shift+F10. | `components/Menu.tsx` |
| `toast`, `ToastProvider`, `Toaster` | Imperative notices: `toast.success`, `toast.error`, `toast.info`, `toast.warning`, and `toast.dismiss`. | `components/toastStore.ts`, `components/Toast.tsx` |
| `CommandPalette`, `useCommandPaletteShortcut` | A searchable list of actions that opens with Ctrl+K or Cmd+K. | `components/CommandPalette.tsx` |
| `Accordion` | Stacked sections that expand in place. | `components/Accordion.tsx` |
| `Stepper` | Progress through a wizard. Completed steps can be buttons. | `components/Stepper.tsx` |

### Display and surfaces

| Export | Description | Source |
| --- | --- | --- |
| `Badge` | A short status label in nine tones. | `components/Badge.tsx` |
| `Tag` | A removable label for filters and chosen options. | `components/Badge.tsx` |
| `Avatar`, `AvatarStack`, `resolveColor` | A user as initials on their color, with presence and a referee mark, and a row of them for the top bar. | `components/Avatar.tsx` |
| `Card` | A raised container for one item, with interactive and selected states. | `components/Surfaces.tsx` |
| `Panel` | A titled section of the chrome with actions and an optional collapse. | `components/Surfaces.tsx` |
| `Parchment` | A paper surface for sheets, handouts, and the journal. | `components/Surfaces.tsx` |
| `ScrollArea` | A scrolling region with slim scrollbars. | `components/Surfaces.tsx` |
| `DataTable` | A dense, sortable table. | `components/DataTable.tsx` |
| `List`, `ListItem` | A vertical list of rows that becomes a keyboard-operable listbox with `onValueChange`. | `components/List.tsx` |
| `Divider` | A hairline rule, horizontal or vertical, with an optional label. | `components/Divider.tsx` |
| `ResizablePanels`, `Splitter` | Two panes with a drag splitter, and the splitter on its own. | `components/ResizablePanels.tsx` |

### Feedback

| Export | Description | Source |
| --- | --- | --- |
| `Spinner` | An indeterminate progress ring. | `components/Spinner.tsx` |
| `Skeleton` | A placeholder for loading content: text lines, blocks, or circles. | `components/Feedback.tsx` |
| `ProgressBar` | A determinate or indeterminate bar. | `components/Feedback.tsx` |
| `Banner` | A callout in the page flow, including a referee-only tone. | `components/Feedback.tsx` |
| `EmptyState` | Fills an empty list or panel with what to do next. | `components/Feedback.tsx` |
| `ErrorBoundary`, `ErrorFallback` | Catches a render error and shows a recovery message with no stack trace. | `components/ErrorBoundary.tsx` |

### Game pieces

| Export | Description | Source |
| --- | --- | --- |
| `TokenPortrait`, `tokenIdentity` | A character (round) or monster (square) token from a name, class icon, and color, from 24 to 96 px, with selected, unconscious, and dead states. | `game/TokenPortrait.tsx` |
| `StatBox`, `formatModifier` | An ability score with its modifier, with a prime requisite mark. | `game/StatBlock.tsx` |
| `HpBar` | Hit points as a bar that changes color as they fall and trails the last hit. | `game/StatBlock.tsx` |
| `AcShield` | Armour class on a shield. | `game/StatBlock.tsx` |
| `CoinPurse` | Coins by metal, platinum to copper. | `game/StatBlock.tsx` |
| `ConditionChip` | A condition with a tone, an icon, and the duration bxapi reports. | `game/StatBlock.tsx` |

### Dice

| Export | Description | Source |
| --- | --- | --- |
| `Die` | A d4, d6, d8, d10, d12, d20, or d100 face drawn in SVG, with crayon-colored numerals. | `dice/Die.tsx`, `dice/geometry.ts` |
| `DiceRoll`, `formatDiceFormula`, `DICE_ROLL_MAX_MS` | Plays a roll of server-supplied results in under 1.2 s. Clicking skips it, and reduced motion shows the result at once. `announce={false}` turns off its live-region announcement, `hideHeader` hides the label and formula, and `hideSkip` hides the Skip button. `reducedMotion` overrides the value from `KitProvider`. | `dice/DiceRoll.tsx` |

### Layout

| Export | Description | Source |
| --- | --- | --- |
| `TableLayout` | The play screen: top bar, tool rail, stage, resizable and collapsible dock, and action bar. Below 1100 px the dock moves into a drawer. | `layout/TableLayout.tsx` |
| `TableTopBar`, `ModeBadge`, `GameClock` | The top bar contents: table name, session mode, and game time in turns and rounds. | `layout/TableLayout.tsx` |
| `ToolRail`, `ToolRailButton`, `ToolRailDivider` | The vertical tool strip, with arrow-key navigation and tooltips. | `layout/TableLayout.tsx` |
| `ActionBar`, `ActionBarItem`, `ActionBarDivider`, `ActionBarMenu` | Contextual actions under the stage, with a status slot. See [The action bar](#the-action-bar). | `layout/ActionBar.tsx` |
| `Dock` | Tabbed panels for the right side of the table screen. A tab with `keepMounted: true` stays mounted while hidden, so it keeps its scroll position. | `layout/TableLayout.tsx` |
| `PageLayout` | The frame for home, lobby, and settings pages. | `layout/PageLayout.tsx` |
| `Wordmark`, `WordmarkMark` | The bxvtt wordmark and its d20 mark. | `layout/Wordmark.tsx` |

### The action bar

Wrap each button in `ActionBarItem`, so it joins the bar's arrow-key navigation. Use `ActionBarMenu` for a button that opens a menu:

```tsx
<ActionBar aria-label="Party actions" status={<CallerStatus />}>
  <ActionBarItem>
    <Button size="sm" icon="search" onClick={search}>
      Search
    </Button>
  </ActionBarItem>
  <ActionBarMenu label="Light" icon="torch" shortcut={['T']} items={lightEntries} open={open} onOpenChange={setOpen} />
</ActionBar>
```

`ActionBarMenu` takes `label`, `icon`, `items` (the `MenuEntry` list that `DropdownMenu` takes), `tooltip` (the label by default, `null` for none), `shortcut`, `disabled`, `loading`, `variant`, `side` (`top` by default), `align`, and `open` with `onOpenChange` for a shortcut that opens the menu.

When the actions don't fit, the bar degrades in steps:

1. A long status truncates at 45% of the bar.
2. Buttons with an icon show only the icon. Each keeps its label as its accessible name.
3. Actions move from the end into a "More actions" menu. Picking an action there presses its button, and an `ActionBarMenu` appears there as a submenu with its own entries.

## Tests

Component tests live in `src/ui/__tests__` and run with `npx vitest run --project web`. Each test file imports `./cleanup`, because the web project runs Vitest without globals and Testing Library can't register its own cleanup.

`src/test-setup.ts` adds stand-ins for the browser APIs that jsdom lacks and Radix calls when a component opens: `ResizeObserver`, `hasPointerCapture`, `setPointerCapture`, `releasePointerCapture`, `scrollIntoView`, and `matchMedia`. Any kit component, including `Select`, `Combobox`, `Popover`, and menus, opens in a test without extra setup.

The gallery's "Popups inside overlays" specimen opens every popup kind inside a dialog, a nested dialog, a drawer that keeps the page in view, and a confirmation with a checkbox.
