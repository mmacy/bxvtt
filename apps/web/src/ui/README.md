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
- Provide an accessible `label` on every `IconButton` and standalone `Icon`.
- Never strip `:focus-visible` outlines (`base.css` renders a `2px` `--color-focus` ring).
- Keep shortcut keycaps out of accessible control names so controls satisfy WCAG 2.5.3 (Label in Name): pass `shortcut="G"` on `Button` (or `ActionBarMenu`, `ToolRailButton`, menu items, and palette actions), which renders visual keys via `KbdControlScope` while setting `aria-keyshortcuts`.
- Pass `animate={false}` to `DiceRoll` for historical feed entries so only newly rolled dice animate.

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
| `Button`, `IconButton` | Primary, secondary, ghost, and danger buttons in `sm`/`md`/`lg` with `loading`, `asChild`, and `shortcut`. | `components/Button.tsx` |
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
| `Dialog`, `DialogClose`, `ConfirmDialog`, `Drawer` | Modal dialogs, async confirmation dialog, and side/bottom sheet (`dimmed={false}` optional) with focus restoration. | `components/Dialog.tsx` |
| `Popover`, `Tooltip`, `TooltipProvider` | Anchored non-modal popover (requires `title` or `label`) and hover/focus tooltip. | `components/Popover.tsx` |
| `DropdownMenu`, `ContextMenu` | Button menu and right-click / long-press / `Shift+F10` menu. | `components/Menu.tsx` |
| `toast`, `ToastProvider`, `Toaster` | Polite and assertive live-region toast notifications. | `components/toastStore.ts`, `components/Toast.tsx` |
| `CommandPalette`, `useCommandPaletteShortcut` | Searchable action launcher (`Ctrl+K` / `Cmd+K`). | `components/CommandPalette.tsx` |
| `Accordion`, `Stepper` | Collapsible sections and multi-step wizard progress bar. | `components/Accordion.tsx`, `components/Stepper.tsx` |
| `Badge`, `Tag`, `Avatar`, `AvatarStack`, `resolveColor` | Status badges, removable filter tags, and user presence avatars. | `components/Badge.tsx`, `components/Avatar.tsx` |
| `Card`, `Panel`, `Parchment`, `ScrollArea`, `DataTable`, `List`, `ListItem`, `Divider`, `SectionLabel`, `ResizablePanels`, `Splitter` | Structural containers, paper surface, sortable table, listbox rows, and drag-resizable panes. | `components/Surfaces.tsx`, `DataTable.tsx`, `List.tsx`, `Divider.tsx`, `SectionLabel.tsx`, `ResizablePanels.tsx` |
| `Spinner`, `Skeleton`, `ProgressBar`, `Banner`, `EmptyState`, `ErrorBoundary`, `ErrorFallback` | Loading states, callouts (including referee tone), empty placeholders, and stack-trace-free crash boundary. | `components/Spinner.tsx`, `Feedback.tsx`, `ErrorBoundary.tsx` |
| `TokenPortrait`, `tokenIdentity`, `StatBox`, `formatModifier`, `HpBar`, `AcShield`, `CoinPurse`, `ConditionChip` | Round character / square monster tokens, ability boxes, trailing-damage HP bar, AC shield, copy-clean coin display, and condition chips. | `game/` |
| `Die`, `DiceRoll`, `formatDiceFormula`, `DICE_ROLL_MAX_MS` | SVG polyhedral faces (`d4`-`d100`) and `<1.2s` server-result roll playback. | `dice/` |
| `TableLayout`, `TableTopBar`, `ModeBadge`, `GameClock`, `ToolRail`, `ToolRailButton`, `ToolRailDivider`, `ActionBar`, `ActionBarItem`, `ActionBarDivider`, `ActionBarMenu`, `Dock`, `PageLayout`, `Wordmark`, `WordmarkMark` | Play screen frame (collapsing dock to drawer below `1100px`, progressive overflow on `ActionBar`), page frame, and wordmark. | `layout/` |

## Tests

Component tests live in `src/ui/__tests__` and run with `npx vitest run --project web`. Import `./cleanup` in each test file (Vitest runs without globals in `@bxvtt/web`), and rely on `src/test-setup.ts` for Radix jsdom polyfills (`ResizeObserver`, pointer capture, `scrollIntoView`, and `matchMedia`).
