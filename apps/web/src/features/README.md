# Browser client features and `@/app` hooks

Each directory under `src/features` implements one part of the browser client. Features read state from hooks in `@/app`, render with components and tokens from `@/ui`, and send actions through `@/app` helpers. A feature module never opens a WebSocket, never calls `fetch` directly, and never computes a B/X game rule.

## Feature directories and exports

`features/home` renders `/` and `/join/:code`, `features/lobby` renders the pre-game lobby, and `features/table` renders the play shell (`PlayShell`, `TopBar`, `MapToolRail`, `Stage`, `EndScreen`, `TableSettingsDialog`, `SeatsDialog`, and `RejoinPrompt`), lazy-loading heavy screens via `lazyPart` (`features/table/parts.ts`). Import cross-feature exports only through their public barrel (`@/features/<name>`).

| Directory | Public exports | Rendered location |
| --- | --- | --- |
| `home` | `HomePage`, `JoinPage`, `NotFoundPage`, `RulesReference`, `ProfileMenu` | `/`, `/join/:code`, `*`, and shared page headers. |
| `lobby` | `LobbyPage`, `TableSettingsForm` | Table page while `phase === 'lobby'`, and inside `TableSettingsDialog`. |
| `table` | `TablePage`, `PlayShell` | `/tables/:tableId` route and active game frame (wrapped in `ErrorBoundary` per slot). |
| `wizard` | `CharacterWizard({ open, onClose, onCreated })`, `hasDraft(userId, tableId)` | Modal dialog opened from the lobby's **Create a character** button, which reads **Resume character** while the user has an unfinished character at the table. The wizard closes once it stores the character, and the lobby adds the character to the party. |
| `sheet` | `PartyPanel()`, `CharacterSheet({ memberId, onClose, tab? })`, `StoredCharacterCard(...)` | Dock **Party** tab, character sheet drawer (`sheet` / `inventory` / `spells`), and lobby character rows. |
| `town` | `TownStage()`, `TownActions()` | Stage and action bar when `mode === 'town'`. |
| `explore` | `MapStage()`, `ExploreActions()`, `ScenePanel()` | Dungeon canvas stage, `exploring` action bar, and top-left room card. |
| `combat` | `EncounterPanel()`, `BattleBoard()`, `CombatActions()`, aftermath via `useCombatStage()` | Stage overlays and action bar in `encounter` and `battle` modes, plus post-fight summary in `exploring`/`town`. |
| `feed` | `FeedPanel()` | Dock **Feed** tab (`keepMounted` preserves scroll position and loaded pages). |
| `journal` | `JournalPanel()` | Dock **Journal** tab (**Quests**, **Journal**, and **Notes**). |
| `compendium` | `Compendium({ open, onOpenChange, entry })` | Rules reference drawer (`B` shortcut) on home, lobby, and play screens. |
| `referee` | `RefereePanel()`, `SavesDialog({ open, onOpenChange })` | Dock **Referee** tab (referee with lens on) and saves dialog (in-game and lobby). |

The play layout targets viewports from `820px` wide upward; below `1100px`, the right-hand dock switches into a slide-over drawer, and `ActionBar` collapses labels to icons before moving excess items into **More actions** (give every action-bar button an `icon` and use `ActionBarMenu` for dropdown menus).

## Rules for feature code

- Build all controls and surfaces from `@/ui` and tokens from `tokens.css` (`src/ui/README.md`).
- Offer choices strictly from `game.commands`, `PlayerView` (which states item names, room traps, emptied caches, and the caches in reach), rules catalogs, and command JSON schemas, and display `bxapi` refusals in game terms via `@bxvtt/shared/text`.
- Render user-entered strings (names, chat, notes, pin text, save labels) as React text nodes; never use `dangerouslySetInnerHTML`.
- Read referee state only from the referee hooks (`useRefereeState()`, `useAdventureDocument()`, `useRefereeNotes()`), which return `null` whenever the user is a player or has turned off `refereeLens`.

## `@/app` reference

### Identity, preferences, storage, and errors

| Export | Description |
| --- | --- |
| `useIdentity(selector)`, `useCurrentUser()` | Current user and bearer token (`create`, `update`, `adopt` after rejoin approval, and `forget`). |
| `usePreferences(selector)`, `useReduceMotion()` | Per-browser preferences (`mapTheme`, `dockWidth`, `dockCollapsed`, `dockTab`, `refereeLens`, `sound`, `motion`, `playbackSpeed`) and resolved motion setting. |
| `scopedStorage(scope, area?)`, `readStored`, `writeStored`, `STORAGE_KEYS` | Namespaced JSON `localStorage` / `sessionStorage` with in-memory fallback when browser storage is blocked. |
| `getApi()` | Shared `BxvttClient` configured with the active token. |
| `describeProblem(error)`, `reportError(error, opts?)`, `isRetiredToken(error)`, `isTransientFailure(error)` | Maps every `PROBLEM_CODES` entry to user-facing `{ title, detail }`, triggers error toasts, and classifies retired-token or transient network failures. |
| `displayStringProblem(text, max)`, `toParamMap(params)`, `tokenClass(classId)`, `lazyPart(load)` | Client-side name validation matching server rules, rejection param narrowing, class icon lookup, and preloadable lazy components. |

### Table state and permissions

Inside `TableProvider` (or `NoTableProvider` on screens outside a table):

- **Table & membership:** `useTableId`, `useConnectionStatus`, `useConnectionError`, `useTableDetail`, `useTableSettings`, `useTableUser`, `useMyMembership`, `useMyRole`, `useIsReferee`, `useRefereeLens`, `useMembers`, `useMember`, `usePresence`, `useRejoinRequests`, `useDecideRejoin`.
- **Active session:** `useGame`, `useGameMode`, `useShownMode` (retains combat mode while final round playback finishes before `EndScreen`), `useRevision`, `usePlayerView`, `useHere` (what the party perceives at its cell and what it can reach, from the player view), `usePartyLocation`, `useLegalCommands`, `useLegalCommand`, `useParty`, `usePartyMember`, `useSeats`, `useMySeats`, `useControllableMembers`, `useCaller`, `useEncounter`, `useBattleRound`, `useDeclarations`, `usePartyLight`.
- **Referee, feed, notes, annotations, text:** `useRefereeState`, `useAdventureDocument`, `useRefereeNotes`, `useFeed`, `useOlderFeed`, `usePartyNotes`, `useAnnotations`, `usePings`, `useSendPing`, `useNotices`, `useTextContext`, `usePlayerTextContext` (the players' names only, for a screen that shows a referee what the players see).
- **Item names and treasure:** `itemStackPhrase(id, quantity, ctx)` names an item and a count ("a torch", "2 vials of holy water"), `itemStackPhrases` names a list and collapses unnamed entries into "something else", and `pileContents` and `pileContentsSentence` name a dropped pile's coins and contents. `cachesToTake(here)` lists the caches in reach that aren't emptied, and `treasureRowText` gives a treasure's row text ("Treasure 2 lies here.").
- **Permission checks (`{ allowed, reason }`):** `useCanSend(commandType, memberId?)`, `useCanControlMember(memberId)`, `useCanActForParty()`, `useCanDeclare(memberId)`, `useCanResolveRound({ early })` (also exported as pure functions taking `usePermissionContext()`).

### Commands, declarations, catalogs, overlays, shortcuts, and map bus

- **`useSendCommand()`:** Returns `{ send, pending, pendingType, pendingTypes }`. Deliberate calls queue up to 3 actions (`MAX_QUEUED_COMMANDS`), pace to 4 commands/second, deduplicate identical clicks, drop stale queued moves if the mode or party cell changed, and display refusals as toasts (or return `result.message` when `{ display: 'inline' }` is passed). Pass `{ repeatable: true, display: 'inline' }` for auto-repeating movement keys so extra presses drop silently while a command is in flight.
- **`useSendRefereeCommand()`, `useSendDeclaration()`, `useApiAction()`:** Referee-guarded command sender, battle declaration/resolution helpers (`declare`, `clear`, `resolve`), and generic async mutation wrapper.
- **Rules & character hooks:** `useClassCatalog`, `useEquipmentCatalog`, `useSpellCatalog`, `useMonsterCatalog`, `useMagicItemCatalog`, `useLanguageCatalog`, `useCommandCatalog`, `useRuleTableNames`, `useRuleTable`, `useCommandSchema`, `useRulesEntry`, `useRulesLicense`, `useMyCharacters`, `useStoredCharacter`.
- **Shell UI, combat stage, shortcuts, and map bus:** `useTableUi` (`openCharacterSheet`, `openCompendium`, `toggleCompendium`, `setSavesOpen`, `setSettingsOpen`, `setSeatsOpen`, `setShortcutsOpen`, `setPaletteOpen`), `useCombatStage` (`showAftermath`, `closeAftermath`, `setMoment`, `setMemberStates`, `setPlaying`), `useShortcut`, `useAction`, and `useMapBus` (`tool`, `setTool`, `requestPick`, `pick`, `fulfilPick`, `cancelPick`, `requestFocus`, `viewedLevel`, `setViewedLevel`).

## Test features (`npx vitest run --project web`)

Mount features with `renderWithTable(ui, { snapshot, data, preferences, api })` from `@/app/testing/renderWithTable` using server-captured snapshots from `fixtureSnapshot(stage, role)` (`@/app/testing/fixtures`). Unstubbed methods on `createFakeApi()` reject immediately with the method name so unit tests never make network calls.

To regenerate the test snapshots against a local server and `bxapi`:

```sh
BXVTT_PORT=8662 BXVTT_DATA_DIR=.data/fixtures BXVTT_ALLOW_CHARACTER_SEEDS=true npm run dev -w @bxvtt/server
BXVTT_SERVER_URL=http://127.0.0.1:8662 npx tsx apps/web/src/app/testing/fixtures/capture-fixtures.mjs
npx prettier --write apps/web/src/app/testing/fixtures
```
