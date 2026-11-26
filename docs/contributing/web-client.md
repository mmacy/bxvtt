---
title: Web client, UI kit, and map
sidebar_label: Web client, UI kit, and map
description: Architecture of apps/web and @bxvtt/shared/text, including the /kit component gallery, @/app hooks, canvas dungeon renderer, and event prose.
sidebar_position: 2
---

# Web client, UI kit, and map

`apps/web` is split into four layers with one-way dependencies, paired with `@bxvtt/shared/text` for human-readable game prose:

- **`src/ui` (`@/ui`):** Design tokens, self-hosted variable fonts, icons, and accessible React + Radix primitives.
- **`src/map` (`@/map`):** Standalone HTML canvas dungeon renderer, minimap, themes, and keyboard cursor.
- **`src/app` (`@/app`):** Router, `BxvttClient` + `TableConnection` wiring, Zustand table stores, permission helpers, command queue, and shortcut/palette registries.
- **`src/features` (`@/features/*`):** Screen modules (`home`, `lobby`, `table`, `wizard`, `sheet`, `town`, `explore`, `combat`, `feed`, `journal`, `compendium`, and `referee`).

## Design system and UI kit (`apps/web/src/ui`)

While `npm run dev` is running, inspect every design token, surface, and component specimen live in the browser:

- **Component gallery:** [http://localhost:5180/kit](http://localhost:5180/kit)
- **Full-screen table layout mock:** [http://localhost:5180/kit/table](http://localhost:5180/kit/table)

Both routes load lazily (`lazyPart`) so gallery code stays out of the main bundle.

### Visual language and token rules

- **Candlelight chrome and vellum paper:** Chrome uses warm lampblack and umber (`--color-surface-*`) with brass accents (`--color-accent`) so the dungeon map remains the brightest surface on screen. `Parchment` (`data-surface="paper"`) applies vellum and iron-gall ink strictly to character sheets, handouts, and the journal.
- **Three typefaces:** **Fraunces** for display headings and wordmark, **Atkinson Hyperlegible Next** for UI copy and stat blocks, and **Rokkitt** (`--font-numeric`) for dice, ability scores, hit points, armour class, coins, and the game clock.
- **Three token tiers:** Raw `--palette-*` values are referenced only inside `tokens.css`; components and features consume semantic role tokens (`--color-*`) and scale tokens (`--space-*`, `--text-*`, `--radius-*`, `--duration-*`, `--z-*`).
- **Single portal layer:** Dialogs, drawers, menus, selects, comboboxes, and popovers all share `--z-layer` (`1200`) and render in portals so nested popups stack naturally in open order without custom `z-index` overrides.
- **WCAG label-in-name key hints:** Pass keyboard hints via `<Button shortcut="G">Set out</Button>` (or `ActionBarMenu` / `ToolRailButton`), which renders visual keycaps outside the accessible label and sets `aria-keyshortcuts`.
- **Hover help:** Pass `tooltip` for help the label doesn't give, and `disabledReason` with `disabled` so an unavailable control stays focusable and says why. Never use the native `title` attribute on a control, because `npm run lint` rejects it. See "Hover help" in the kit README for the props and the writing rules.

See [`apps/web/src/ui/README.md`](https://github.com/mmacy/bxvtt/blob/main/apps/web/src/ui/README.md) for the complete export catalog.

## App hooks, command pacing, and feature testing (`apps/web/src/app`)

Feature components never call `fetch` or open sockets directly; they import hooks from `@/app`:

- **What the party perceives:** The player view states the entered areas, visible features, known transitions, and the entrance, and `game.scene` adds item names, room traps, and emptied caches. `partyHere(view, scene)` and `useHere()` pick out what is at the party's cell (the area, caches, features, transitions, the known room trap, a dropped pile, and whether the party stands on the entrance), so a screen lists them without deriving them. Name a monster in a command by the ID in `view.encounter.groups[].members`, and show its name from `creatureNames` in `@bxvtt/shared/text`.
- **State and permissions:** Narrow selectors (`useParty()`, `useScene()`, `useGameMode()`, `useShownMode()`, `useRefereeLens()`, `useMySeats()`, `useCaller()`) subscribe to slices of `TableProvider`, while `useCanSend(commandType, memberId?)`, `useCanControlMember`, `useCanActForParty`, and `useCanDeclare` return `{ allowed, reason }` matching server rules for disabled button tooltips.
- **Deliberate vs. repeatable command queueing (`useSendCommand`):**
  - Default calls (`send(cmd)`) represent deliberate clicks or form submissions: up to 3 commands queue in order while a request is in flight, paced to 4 commands per second, deduplicating double-clicks and dropping stale queued moves with a toast if the mode or party square changed.
  - Auto-repeating movement keys pass `{ repeatable: true, display: 'inline' }`, dropping extra keystrokes silently while a command is in flight so pressing and holding arrow keys never stacks up steps.
- **Map interaction bus (`useMapBus`):** Decouples `features/referee` and `features/table` from `features/explore` for active rail tools, camera focus requests, and interactive cell/edge picking (`requestPick({ kind: 'cell' | 'edge', prompt })`).
- **Documentation link and version (`SiteInfo`):** Every screen shows a link to the published documentation and the bxvtt version in its bottom left corner. Pass `<SiteInfo />` as the `footer` of a `PageLayout`, or `layout="stack"` under the play screen's tool rail. The version is the root `package.json` version, which `apps/web/vite.config.ts` writes into the build as `__BXVTT_VERSION__` (declared in `src/build-info.d.ts`), so the client shows its own build's version without asking the server.
- **Component tests (`renderWithTable`):** Mount any feature inside a populated table store, `KitProvider`, router, and spy-backed `createFakeApi()` using snapshots captured from a real server (`fixtureSnapshot(stage, role)` for `lobby`, `town`, `exploring`, `encounter`, and `battle`). See [`apps/web/src/features/README.md`](https://github.com/mmacy/bxvtt/blob/main/apps/web/src/features/README.md).

## Canvas dungeon map (`apps/web/src/map`)

`DungeonMap` and `Minimap` render a `LevelMap` built via `fromPlayerView(playerView, levelKey, { extras, lightRadiusFeet })` or `fromReferee(refereeView, levelKey)`:

- **Tile-cached 60 fps rendering:** Static geometry (rock, floor, grid, merged wall runs, doors, transitions, and fog veil) paints into cached 512-pixel offscreen tiles at the active zoom level, while labels, flickering torchlight, tokens, strokes, pins, pings, remote pointers, and the ruler draw in screen space only when dirty or animating.
- **Accessible keyboard cursor:** In `pick-cell`, `pick-edge`, `pin`, `ping`, and `ruler` tools, focusing the canvas activates a keyboard cell/edge cursor (`Arrow` keys to step, `E` / `Shift+E` to rotate edges, `Enter` to confirm, `Esc` to cancel) paired with a polite ARIA live region announcing rooms, doors, and relative coordinates.
- **Standalone development harness:** Start `@bxvtt/web` (`npm run dev -w @bxvtt/web`) and open [http://localhost:5180/map-harness.html](http://localhost:5180/map-harness.html) (supports `?fixture=hills&layer=player&theme=parchment`) to test themes, tools, overlays, and frame timing in isolation. See [`apps/web/src/map/README.md`](https://github.com/mmacy/bxvtt/blob/main/apps/web/src/map/README.md).

## Game text humanization (`packages/shared/src/text`)

`@bxvtt/shared/text` converts `bxapi` events, rejection codes, and command schemas into natural B/X sentences so players never see raw IDs (`character-0001`), catalog lot names (`Torches (6)`), or dotted codes (`combat.attack.out_of_reach`):

- Build and carry forward a `TextContext` across revisions (`contextFromPlayerView`, `extendContextWithScene`, `extendContextWithCatalog`, and `extendContextWithReferee` when the referee lens is on) so names of consumed potions and defeated monster groups survive after leaving the live view. The context also names each creature of the open encounter from the player view, such as `Goblin 2`, so a combat line reads "Brenna hits Goblin 2" and not "a goblin".
- Call `describeEvents` / `describeGameEntry` for feed and playback lines (emitting `line.refereeDetail` separately for referee coordinates) and `describeRejections` for refused commands.
- Unit tests in `packages/shared` verify 100% template coverage against `packages/shared/src/text/data/codes.json`, failing whenever `osrlib` introduces an unhandled event code, rejection code, command, or field. See [`packages/shared/src/text/README.md`](https://github.com/mmacy/bxvtt/blob/main/packages/shared/src/text/README.md).
