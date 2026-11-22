# Features

Each directory under `src/features` is one part of the browser client. A feature reads state from the hooks in `@/app`, renders with the kit in `@/ui`, and sends intent through the helpers in `@/app`. It never opens a WebSocket, never calls `fetch`, and never computes a game rule.

The shell (`features/table`) already renders every feature in its place on the play screen, and the lobby (`features/lobby`) renders the lobby features. You own one directory. Replace its placeholders with the real thing and keep the exported names and props, so the shell keeps working without a change.

## The contract

| Directory | Exports and props | Where the shell renders it |
| --- | --- | --- |
| `wizard` | `CharacterWizard({ open, onClose, onCreated(character: StoredCharacter) })` | A dialog from the lobby's "Create a character" button. `onCreated` adds the character to the roster and refreshes the list. |
| `sheet` | `PartyPanel()` | The Party tab of the dock. |
| `sheet` | `CharacterSheet({ memberId: string \| null, onClose, tab? })` | A drawer the shell opens with `useTableUi().openCharacterSheet(memberId, tab?)`. `tab` is `sheet`, `inventory`, or `spells`. |
| `sheet` | `StoredCharacterCard({ characterId, summary: { name, class_id, level }, owner?, actions? })` | Each roster entry and each of the user's characters in the lobby. The lobby passes its reorder, remove, and add buttons as `actions`. |
| `explore` | `MapStage()` | The stage whenever the party is in a dungeon, in every mode. |
| `explore` | `ExploreActions()` | The action bar in `exploring` mode. Render `ActionBarItem` buttons. |
| `explore` | `ScenePanel()` | The top corner of the stage in `exploring` mode. |
| `town` | `TownStage()` | The stage while the party is in town. |
| `town` | `TownActions()` | The action bar in `town` mode. |
| `combat` | `EncounterPanel()` | The bottom center of the stage, over the map, in `encounter` mode. |
| `combat` | `BattleBoard()` | The bottom center of the stage, over the map, in `battle` mode. |
| `combat` | `CombatActions()` | The action bar in `encounter` and `battle` modes. |
| `combat` | Any content, through `useCombatStage().showAftermath(node)` | The after-fight slot: the bottom center of the stage, over the map, in `exploring` and `town` modes. See "After a fight and at the end of a game". |
| `feed` | `FeedPanel()` | The Feed tab of the dock. The shell shows the unread count on the tab, and keeps the panel mounted while another tab is active, so it keeps its scroll position and loaded history. |
| `journal` | `JournalPanel()` | The Journal tab of the dock. |
| `compendium` | `Compendium({ open, onOpenChange, entry: CompendiumEntry \| null })` | A drawer from the table menu, the rail's book button (on every screen of play, town included), the `B` key, and `useTableUi().openCompendium(entry)`. `B` closes it again when focus is outside a text field. The lobby and the home page render it too, from the "Rules reference" button in the page header, so `openCompendium` works there. |
| `referee` | `RefereePanel()` | The Referee tab of the dock, shown only to a referee with the lens on. |
| `referee` | `SavesDialog({ open, onOpenChange })` | A dialog from the table menu. |

The shell owns the rest of the play screen: the top bar (name, mode badge, clock, referee lens switch, presence, and the table menu), the map tool rail, the action bar's caller status, the connection banner, the map pick prompt, the end screen for `game_over` and `victory`, the table settings dialog, and the seats dialog. Other directories you may read but not edit: `features/home`, `features/lobby`, and `features/table`.

Stage overlay slots size nothing. A feature in a slot sets its own width, up to 380 px in the corner and 760 px at the bottom center. Each dock tab and the stage sit inside an `ErrorBoundary`, so a crash in one feature leaves the rest of the table running.

The play screen works from 820 px wide. Below 1100 px the dock moves into a drawer. When the actions don't fit the action bar, it first shows only the icons of buttons that have one, and then moves actions from the end into a "More actions" menu. Give every action bar button an `icon`, so it stays recognizable without its label, and use `ActionBarMenu` for a button that opens a menu, so the overflow menu can list its entries.

## Rules

- Stay in your directory. If you need something in `app/`, `ui/`, or another feature, describe it in your report instead of changing it.
- Use the kit for every control and surface, and the tokens for every color, size, and duration. `src/ui/README.md` lists both.
- Never compute a rule. Offer the choices that `game.commands`, the player view, the scene, and the command schemas offer, and show bxapi's refusal when a choice is wrong.
- Show text, never raw codes or IDs. Name things with `useTextContext()` and the functions of `@bxvtt/shared/text`.
- Render every stored string (names, chat, notes, pin text, save labels) as React text. Never use `dangerouslySetInnerHTML`.
- Referee data comes only from the referee hooks below, which return `null` for a player and for a referee with the lens off. Never hide referee data with CSS.
- Write UI text in sentence case and in B/X vocabulary: referee, party, marching order, caller, turn, round, hit points, armour class.

## The app layer

Import everything from `@/app`.

### Identity, preferences, and API access

| Export | What it does |
| --- | --- |
| `useIdentity(selector)` | The signed-in user and token, with `create(name)`, `update({ name, color })`, and `forget()`. |
| `useCurrentUser()` | The signed-in user, or `null`. |
| `usePreferences(selector)` | Display preferences kept in this browser: `mapTheme`, `dockWidth`, `dockCollapsed`, `dockTab`, `refereeLens`, `sound` (off until the user turns it on), and `motion`, with `set(key, value)`. |
| `useReduceMotion()` | Whether to reduce motion: the user's choice, or the system setting. Kit components such as `DiceRoll` already follow it, because the app root renders `AppKitProvider`. |
| `scopedStorage(scope, area?)` | Browser storage for one feature, under the prefix `bxvtt.<scope>.`, in `local` (the default) or `session` storage. It returns `{ key(name), read(name), write(name, value), remove(name) }`, reads and writes JSON, and keeps a copy in memory when the browser refuses storage. |
| `readStored(key, area?)`, `writeStored(key, value, area?)`, `STORAGE_KEYS` | The same, for a full key. `STORAGE_KEYS` lists the app layer's own keys. |
| `toParamMap(params)` | Keeps the params of a rejection that the text layer can read, for `describeRejection`. |
| `getApi()` | The one `BxvttClient`, with the user's token. Prefer the hooks below. |
| `describeProblem(error)` | Turns any API error into `{ title, detail }` for the player. |
| `reportError(error, { title })` | Shows an error toast for an API error. |
| `displayStringProblem(text, max)` | Checks a name or label the way the server does, so a form can stop it first. |
| `tokenClass(classId)` | The kit's class icon key for a bxapi class ID, for `TokenPortrait`. |

```tsx
const theme = usePreferences((s) => s.mapTheme);
const setPreference = usePreferences((s) => s.set);
setPreference('mapTheme', 'torchlit');

const drafts = scopedStorage('feed', 'session');
drafts.write(`draft.${tableId}`, { text, to });
const draft = drafts.read(`draft.${tableId}`); // unknown: validate it before use
```

### The table

Every hook below reads the table of the surrounding `TableProvider`. Each server message replaces one part of the state wholesale, and a hook returns the same object until that part changes.

| Hook | Returns |
| --- | --- |
| `useTableId()` | The table ID. |
| `useConnectionStatus()` | `connecting`, `authenticating`, `open`, `reconnecting`, or `closed`. |
| `useConnectionError()` | The last socket error the server sent, such as `rate_limited`, or `null`. |
| `useTableDetail()` | The table: name, invite code, phase, settings, members, roster, and game summary. |
| `useTableSettings()` | `party_control`, `caller_user_id`, `auto_resolve`, and `autosave`. |
| `useTableUser()` | The signed-in user as the table knows them. |
| `useMyMembership()` | The user's member entry, with role and color. |
| `useMyRole()` | `referee` or `player`. |
| `useIsReferee()` | Whether the user is a referee, whatever the lens says. Use it for permissions. |
| `useRefereeLens()` | Whether to show referee interface: a referee with the lens on. |
| `useMembers()` | The members, each with `online`. |
| `useMember(userId)` | One member, to say who did something. |
| `usePresence()` | The set of connected user IDs. |
| `useGame()` | The whole game state. Prefer a narrower hook. |
| `useGameMode()` | `town`, `exploring`, `encounter`, `battle`, `game_over`, or `victory`. |
| `useShownMode()` | The mode the play screen shows. It equals `useGameMode()` except while the shell holds a fight on screen before the end screen, when it stays `encounter` or `battle`. Lay out stage chrome by this mode, so it matches the overlays the shell shows. |
| `useRevision()` | The game's revision. `useSendCommand` sends it for you. |
| `usePlayerView()` | bxapi's player view. |
| `useScene()` | The scene: known areas, features, caches, stairs, traps, and `names`. |
| `usePartyLocation()` | Town, or a dungeon cell with its facing. |
| `useLegalCommands()` | The commands that are legal now and that the user's role may send, each with its `class` and `member_field`. |
| `useLegalCommand(type)` | One legal command, or `null`. |
| `useParty()` | The party's sheets in marching order. |
| `usePartyMember(memberId)` | One member's sheet. |
| `useSeats()` | Which user controls which member. |
| `useMySeats()` | The member IDs in the user's seats. |
| `useControllableMembers()` | The member IDs the user can act for: their seats, or every member for a referee. |
| `useCaller()` | `{ member, isMe }` for the caller. |
| `useEncounter()` | The open encounter or battle from the player view. |
| `useDeclarations()` | The current round's declarations, or `null`. |
| `useRefereeState()` | The dynamic referee state. Referee with the lens on only. |
| `useAdventureDocument()` | The full adventure, loaded once per session. Referee with the lens on only. |
| `useFeed()` | The feed entries, oldest first. |
| `useOlderFeed()` | `{ loadOlder, hasOlder, loading }` to scroll back. |
| `usePartyNotes()` | The party notes. |
| `useRefereeNotes()` | The referee notes. Referee with the lens on only. |
| `useAnnotations(level)` | The annotations of a level, loaded on first use and kept current. A player gets an empty list for a level the party hasn't mapped. |
| `usePings()` | The pings of the last few seconds. Each expires by itself. |
| `useSendPing()` | A function that pings a map point for the table. |
| `useNotices()` | Recent notices. The shell already shows each as a toast. |
| `useTextContext()` | The names to describe events, rejections, and messages. See "Text". |

```tsx
const party = useParty();
const mySeats = useMySeats();
const mode = useGameMode();
```

### Permissions

These mirror the server's rules so a control can be disabled with a reason. The server checks every request again. Each returns `{ allowed, reason }`, and `reason` is a sentence for a tooltip or hint.

| Hook | Asks |
| --- | --- |
| `useCanSend(commandType, memberId?)` | May the user send this command now? It must be in `game.commands`. A member command needs the member's seat or a referee. A party command needs the caller, a referee, or any seated member when `party_control` is `anyone`. A referee command needs a referee with the lens on. `resolve_battle_round` is never allowed (use declarations). |
| `useCanControlMember(memberId)` | Is the user in the member's seat, or a referee? |
| `useCanActForParty()` | May the user act for the whole party? |
| `useCanDeclare(memberId)` | May the user declare for the member this round? |
| `useCanResolveRound({ early })` | May the user resolve the round, or with `early`, resolve before everyone declares? |

The same checks are plain functions (`canSendCommand`, `canControlMember`, and so on) that take `usePermissionContext()`.

```tsx
const permission = useCanSend('cast_spell', member.id);
<Button disabled={!permission.allowed} title={permission.reason ?? undefined}>Cast</Button>
```

### Sending commands and showing refusals

`useSendCommand()` returns `{ send, pending, pendingType }`. `send(command, { display })`:

- Sends the current revision as `expected_revision`.
- Sends one command at a time per table, so a double click sends once, and paces commands to `COMMANDS_PER_SECOND` (4), so holding an arrow key never reaches the server's limit of 100 changes every 20 seconds. Call `send` on every key press and let it drop the extras.
- Applies the new game state to the store, so the next render shows it.
- Explains a refusal with `describeRejection`, as a toast by default.
- On a revision conflict, shows "The table changed" once and loads the new state.

It resolves to one of:

| `status` | Meaning |
| --- | --- |
| `accepted` | bxapi accepted it. `result` holds the events and messages. |
| `refused` | bxapi refused it. `message` and `sentences` explain why in the game's terms, and `rejections` holds the codes. |
| `conflict` | The game moved on first. The store has the new state. Let the user choose again. |
| `skipped` | The client didn't send it. `reason` is `busy`, `throttled`, `no_game`, or `not_allowed`. Pacing is silent. |
| `error` | The request failed. `message` explains it, and a toast already showed it unless `display` is `inline`. |

```tsx
const { send, pending } = useSendCommand();
const [error, setError] = useState<string | null>(null);

// Toast (default): the hook shows the refusal.
<Button loading={pending} onClick={() => send({ command_type: 'search', kind: 'secret_doors' })}>Search</Button>;

// Inline: show the refusal next to the form.
const result = await send({ command_type: 'purchase_equipment', character_id, item_id }, { display: 'inline' });
if (result.status === 'refused' || result.status === 'error') setError(result.message);
```

The other helpers:

- `useSendRefereeCommand()` is `useSendCommand` with a check first: a referee with the lens on, and a legal referee command.
- `useSendDeclaration()` returns `{ declare(memberId, body), clear(memberId), resolve({ fillWithHold }), pending }`. `resolve` returns `refused` with `refusals`, one `{ memberId, text }` for each declaration bxapi refused, so the board can mark the member.
- `useApiAction()` returns `{ run(work, { success, errorTitle, display }), pending }` for any other request, such as a save, a seat, notes, or an annotation. `run` resolves to `{ ok: true, value }` or `{ ok: false, problem }`.

```tsx
const { run } = useApiAction();
const result = await run(() => getApi().createSave(tableId, label), { success: 'Game saved' });
```

A request can fail with a quota (403 `forbidden`, such as 100 saves per table), a full map (413 `content_too_large`), or the server's per-user rate limits (429 `rate_limited`: 100 changes every 20 seconds, 30 feed posts or new annotations every 30 seconds). `describeProblem` turns each into a calm message with the server's reason, and every helper above shows it.

### Text

`useTextContext()` returns the `TextContext` for `describeEvents`, `describeRejection`, and `humanizeMessage`. The store builds it from every game state and carries it forward, so names survive a command that removes them from the view. It holds the party, the encounter groups, the scene's area names, and `scene.names`. The hook adds the names of any catalog that has loaded, and for a referee with the lens on, the referee state and the adventure's names. Every name goes through the text layer's own functions (`contextFromPlayerView`, `extendContextWithNames`, `extendContextWithCatalog`, and `extendContextWithReferee`), which keep its curated nouns, so a catalog lot name such as `Torches (6)` still reads as "a torch". Don't write into a context's `items` yourself.

```tsx
const ctx = useTextContext();
const lines = describeEvents(entry.events, ctx, { messages: entry.messages });
```

### Rules catalogs

Each hook fetches its catalog once per page load, shares it with every component, and returns `{ data, error, loading, retry }`.

| Hook | Catalog |
| --- | --- |
| `useClassCatalog()` | Classes. |
| `useEquipmentCatalog()` | Equipment with costs. |
| `useSpellCatalog()` | Every spell. |
| `useMonsterCatalog()` | Every monster. |
| `useMagicItemCatalog()` | Every magic item. |
| `useLanguageCatalog()` | Languages. |
| `useCommandCatalog()` | Every command with its kind and modes. |
| `useRuleTableNames()` and `useRuleTable(name)` | The rules tables. |
| `useCommandSchema(commandType)` | One command with its JSON schema, to build a form from. |
| `useRulesEntry(path)` | Any one entry, such as `spells/sleep`. Types such as `SpellDetail` and `MonsterDetail` describe the entries. |
| `useRulesLicense()` | The content license. |

### Characters

- `useMyCharacters()` returns `{ items, loading, error, refresh }` for the user's stored characters.
- `useStoredCharacter(characterId)` loads one stored character with its full sheet.

### Shell overlays

`useTableUi(selector)` opens what the shell renders: `openCharacterSheet(memberId, tab?)`, `openCompendium(entry?)`, `toggleCompendium()`, `setSavesOpen`, `setSettingsOpen`, `setSeatsOpen`, `setShortcutsOpen`, and `setPaletteOpen`. `openCompendium()` without an entry opens the compendium at its first page, or leaves it on its current page when it is already open.

```tsx
const openSheet = useTableUi((s) => s.openCharacterSheet);
<Button variant="ghost" onClick={() => openSheet(member.id)}>{member.name}</Button>;
<Button onClick={() => openSheet(member.id, 'spells')}>Prepare spells</Button>;
```

`openCharacterSheet(memberId, 'spells')` opens the sheet at its Spells tab, and a member with no spells sees the first tab. `NoTableProvider` gives a screen outside any table an empty table, where the reader counts as a player with no game, so a feature that reads the table, such as the compendium, renders on the home page.

### After a fight and at the end of a game

`useCombatStage` connects the combat feature to the shell's stage:

- `showAftermath(node)` fills the after-fight slot at the bottom center of the stage, and `closeAftermath()` empties it. The slot shows in `exploring` and `town` modes, and the content renders inside the table's providers, so it can use every hook. The shell empties the slot when the next encounter or battle starts and when the user leaves the table.
- `setPlaying(playing)` reports whether combat playback is running. When a fight ends the game (`game_over` or `victory`), the shell keeps the fight on screen, with its overlays and the fight's mode badge, until playback stops. It waits up to 1.5 seconds for playback to start, and never holds the end screen back longer than 20 seconds. During that hold, `useShownMode()` returns the fight's mode.

```tsx
const setPlaying = useCombatStage((s) => s.setPlaying);
useEffect(() => setPlaying(playback.playing), [playback.playing, setPlaying]);
useEffect(() => () => setPlaying(false), [setPlaying]);

// When the board unmounts at the end of a fight:
useCombatStage.getState().showAftermath(<Aftermath endRevision={revision} afterSeq={seq} onClose={close} />);
```

`Aftermath`'s close button calls `useCombatStage.getState().closeAftermath()`.

### Keyboard shortcuts and the command palette

Register a shortcut with `useShortcut` and a palette action with `useAction` while your component is mounted. The help dialog (`?`) and the command palette (Ctrl+K or Cmd+K) list them. A key spec is a key with modifiers joined by `+`: `s`, `shift+r`, `mod+k` (Ctrl, or Cmd on a Mac), `alt+1`, `?`, `escape`, or `arrowup`. Shortcuts don't fire while focus is in a text field unless you set `allowInInputs`, and they ignore key repeats.

```tsx
useShortcut({ id: 'explore.search', keys: 's', label: 'Search the area', group: 'Party', run: search });
useAction({ id: 'explore.search', label: 'Search the area', group: 'Party', icon: 'search', shortcut: 's', run: search });
```

The shell already uses `?`, `mod+k`, `mod+s` (save), `b` (open or close the rules reference), `shift+l` (referee lens), `alt+1` to `alt+4` (dock tabs), `escape` (cancel a map pick), and the map tools: `v` select, `h` pan, `r` measure, `p` ping, `d` draw, `n` pin, and `e` erase. Pick other keys, or tell the client lead.

The focused map handles only its own keys: the arrow keys, plus, minus, zero, Space, and Escape when it has a measurement to clear. Letters reach your shortcuts even after a click on the map. A feature that handles keys on the map itself in the capture phase, as `explore` does for W, A, S, and D, takes those keys from every shortcut while the map has focus.

### The map interaction bus

`useMapBus(selector)` connects the map to the features that need it, without either importing the other.

- `tool` and `setTool(tool)`: the active tool of the rail: `select`, `pan`, `ruler`, `draw`, `erase`, `ping`, or `pin`. The shell's rail sets it, and the map reads it.
- `requestPick({ kind: 'cell' | 'edge', prompt })` returns a promise of the picked `CellPick` (`{ kind: 'cell', dungeon_id, level_number, x, y }`), `EdgePick` (`{ kind: 'edge', dungeon_id, level_number, x, y, direction }`), or `null` when the user cancels. A new request cancels the open one. The shell shows `prompt` with a cancel button, and Escape cancels too.
- `pick`, `fulfilPick(target)`, and `cancelPick()`: the map side. While `pick` is set, the map switches to its matching pick mode and calls `fulfilPick` on a click. A target of the wrong kind is ignored.
- `requestFocus(target)` asks the map to center on `{ kind: 'party' }`, `{ kind: 'member', memberId }`, or `{ kind: 'cell', dungeon_id, level_number, x, y }`. The map reads `focus`, moves the camera, and calls `clearFocus(id)`.
- `viewedLevel` and `setViewedLevel(level)`: the level the map shows when the user looks away from the party's level, or `null` while it follows the party. Pass it to `useAnnotations`.

The referee side asks for a pick, and the explore side fulfils it:

```tsx
// features/referee
const requestPick = useMapBus((s) => s.requestPick);
const target = await requestPick({ kind: 'edge', prompt: 'Pick the door to open.' });
if (target?.kind === 'edge') {
  const { kind: _kind, ...door } = target; // dungeon_id, level_number, x, y, direction
  await send({ command_type: 'set_door_state', ...door, open: true });
}

// features/explore, inside MapStage
const pick = useMapBus((s) => s.pick);
const fulfilPick = useMapBus((s) => s.fulfilPick);
<DungeonMap tool={pick ? (pick.kind === 'cell' ? 'pick-cell' : 'pick-edge') : tool} onCellClick={(t) => pick && fulfilPick({ kind: 'cell', dungeon_id, level_number, x: t.x, y: t.y })} />;
```

## Test a feature

Web tests run with `npx vitest run --project web`. Write a test for behavior, not for markup.

`src/test-setup.ts` already stubs the browser APIs that jsdom lacks and Radix needs (`ResizeObserver`, `hasPointerCapture`, `setPointerCapture`, `releasePointerCapture`, `scrollIntoView`, and `matchMedia`), so any kit component opens in a test. Remove a feature's own copy of these stubs.

`renderWithTable(ui, options)` from `@/app/testing/renderWithTable` mounts a component inside a fake open table: a table store filled from a snapshot, the kit's providers, a router, and a fake API whose methods are spies. It returns Testing Library's result with `store`, `api`, `user` (a `userEvent` instance), and `snapshot`.

| Option | Default |
| --- | --- |
| `snapshot` | `fixtureSnapshot('exploring', 'player')` |
| `data` | Extra store fields, such as `{ status: 'reconnecting' }`. |
| `preferences` | Preferences, such as `{ refereeLens: false }`. |
| `api` | A new `createFakeApi()`. Pass your own to stub a request that runs on mount. |

A method you didn't stub rejects with an error that names the request, so a test never reaches a server.

```tsx
import { screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { fixtureSnapshot } from '@/app/testing/fixtures';
import { createFakeApi, renderWithTable } from '@/app/testing/renderWithTable';

it('saves a declaration', async () => {
  const api = createFakeApi();
  const snapshot = fixtureSnapshot('battle', 'player');
  api.declare.mockResolvedValue(snapshot.declarations!);
  const { user, store } = renderWithTable(<BattleBoard />, { snapshot, api });
  await user.click(screen.getByRole('button', { name: 'Attack' }));
  expect(api.declare).toHaveBeenCalledWith(store.getState().tableId, 'character-0001', expect.anything());
});
```

### Fixtures

`fixtureSnapshot(stage, role)` from `@/app/testing/fixtures` returns a fresh copy of a snapshot captured from a real server, for `stage` `lobby`, `town`, `exploring`, `encounter`, or `battle`, and `role` `referee` or `player`. They come from one short game of The Drowned Bell: Sam (the player and caller) owns Brenna and Wren, and Ruth (the referee) owns Osric and Tamsin. In `encounter`, three goblins have appeared. In `battle`, Brenna has declared an attack.

To regenerate them, start a server that allows character seeds, run the script, and format the output:

```sh
BXVTT_PORT=8662 BXVTT_DATA_DIR=.data/fixtures BXVTT_ALLOW_CHARACTER_SEEDS=true npm run dev -w @bxvtt/server
BXVTT_SERVER_URL=http://127.0.0.1:8662 npx tsx apps/web/src/app/testing/fixtures/capture-fixtures.mjs
npx prettier --write apps/web/src/app/testing/fixtures
```

The server limits each address to 10 new users every 10 minutes, and the script creates 2, so wait between repeated runs.
