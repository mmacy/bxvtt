# Dungeon map (`apps/web/src/map`)

`apps/web/src/map` renders a `bxapi` dungeon level onto an HTML canvas and reports pointer and keyboard interactions through callbacks. Build a `LevelMap` from a `bxapi` view, pass it to `<DungeonMap>`, and dispatch commands from your callbacks; `<DungeonMap>` never sends network requests or evaluates B/X rules.

The module depends only on React (with no imports from `@/ui`), so it mounts inside any sized container.

## Integrate `<DungeonMap>` and `<Minimap>`

1. Build a `LevelMap` from your store's view (`fromPlayerView` for players or referees with the lens off; `fromReferee` when the referee lens is on):

   ```tsx
   import { fromPlayerView, fromReferee } from '@/map';

   const map = refereeLens ? fromReferee(refereeView) : fromPlayerView(playerView);
   ```

   Both builders accept an optional level key (such as `"crypt:2"`), default to the party's current level, and return `null` when the party is in town or the level is unknown.

2. Render `<DungeonMap>` inside a sized container and handle callbacks:

   ```tsx
   import { useMemo, useRef, useState } from 'react';
   import { DungeonMap, Minimap, fromPlayerView, type DungeonMapHandle, type MapTool } from '@/map';

   export function ExploreMap({ view, send, pings, strokes, onStroke }: Props) {
     const map = useMemo(() => fromPlayerView(view), [view]);
     const ref = useRef<DungeonMapHandle>(null);
     const [tool, setTool] = useState<MapTool>('select');
     const [follow, setFollow] = useState(true);

     return (
       <div style={{ position: 'relative', height: '100%' }}>
         <DungeonMap
           ref={ref}
           map={map}
           theme="torchlit"
           tool={tool}
           followParty={follow}
           onFollowPartyChange={setFollow}
           arrowKeys="move"
           onMoveKey={(direction, repeat) => !repeat && send({ command_type: 'move_party', direction })}
           onCellClick={(cell) => cell.direction && send({ command_type: 'move_party', direction: cell.direction })}
           onEdgeClick={(edge) =>
             edge.direction && edge.edge.door && !edge.edge.door.open
               ? send({ command_type: 'open_door', direction: edge.direction })
               : undefined
           }
           pings={pings}
           strokes={strokes}
           onStrokeComplete={onStroke}
           style={{ position: 'absolute', inset: 0 }}
         />
         <Minimap map={map} target={ref} theme="torchlit" style={{ position: 'absolute', right: 12, bottom: 12 }} />
       </div>
     );
   }
   ```

3. Memoize `LevelMap`, custom theme objects, and overlay arrays (`pings`, `strokes`, `pins`, `pointers`). When a new `LevelMap` arrives, the renderer diffs it against the previous level: party-only moves animate the token without repainting tiles, and door or cell changes invalidate only surrounding tiles.

## Coordinate system, edge keys, and view differences

- **Grid scale:** Each cell `(x, y)` spans 10 feet, with `x` increasing east and `y` increasing south from `(0, 0)` in the north-west corner (`(2.5, 3.5)` is the center of cell `(2, 3)`).
- **Canonical edge keys:** `osrlib` names every edge once from its south or east cell (`"2,0:west"` separates `(1, 0)` and `(2, 0)`; `"2,4:north"` separates `(2, 3)` and `(2, 4)`). Call `edgeKey(x, y, direction)` and `parseEdgeKey(key)` rather than formatting keys manually.
- **`PlayerView.explored`:** Lists known cells per visited level (combining walked, remembered, and currently lit cells without distinguishing them) and classifies boundary edges as `wall`, `open`, or `door` (with `door_open` and `door_wedged` booleans). Unfound secret doors appear as `wall`, passages appear as `open`, and room names, stairs, traps, features, and locked/stuck/gated door flags are omitted. `fromPlayerView` defaults light radius to `30` feet unless `lightRadiusFeet` is supplied.
- **`RefereeView`:** Combines the full `LevelSpec` (`RefereeView.adventure`) with mutable `RefereeView.dungeon_state` (door states, `explored` vs. `seen` cells, trap states, caches, piles, and resolved encounters).
- **Supplementing `PlayerView` with `options.extras`:** Pass the player view's entered areas, known transitions, and visible features via `options.extras` (never referee data). `viewExtras` in `features/explore/levels.ts` builds them, and marks the caches whose `MapFeatureView.emptied` is true as emptied. Area labels render from `16px/cell` zoom upward, wrapping and avoiding tokens, doors, secret-door `S` marks, stairs, features, and earlier labels; pass `areaLabels={false}` if rendering custom labels.

## Model builders

| Function | Return value |
| --- | --- |
| `fromPlayerView(view, levelKey?, options?)` | Player `LevelMap` or `null` (`options.lightRadiusFeet`, `options.extras`, and `options.pileContents`, which names a pile's contents for its tooltip). Every feature's `refereeNotes` is `null`. |
| `fromReferee(refereeView, levelKey?, options?)` | Referee `LevelMap` (reading active light radius from the effects ledger) or `null`. `options.itemPhrase` names the items in caches and piles. Each authored feature carries its `FeatureSpec.referee_notes` in `refereeNotes`. |
| `fromRefereeView(levelSpec, dungeonState, { dungeonId, light, itemPhrase })` | Referee `LevelMap` from separate adventure and dungeon state objects. |
| `refereeLight(refereeView)` | `{ radiusFeet }` from the largest active party light effect, or `null` when unlit or covered by darkness. |
| `playerLevelKeys(view)`, `refereeLevelKeys(refereeView)` | Known `"dungeon:level"` keys, ordered with the party's current level first. |
| `currentLevelKey(view)` | Current `"dungeon:level"` key, or `null` in town. |

## `<DungeonMap>` props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `map` | `LevelMap \| null` | required | Level to render (`null` paints solid rock). |
| `theme` | `'blueprint' \| 'torchlit' \| 'parchment' \| MapTheme` | `'blueprint'` | Visual theme (`blueprint`, `torchlit`, `parchment`, or custom `MapTheme`). |
| `tool` | `MapTool` | `'select'` | Active interaction tool (`select`, `pan`, `draw`, `erase`, `ruler`, `ping`, `pin`, `pick-cell`, `pick-edge`). |
| `pings`, `strokes`, `pins`, `pointers` | Overlay arrays | `[]` | Animated pings (~2.6s pulse), freehand cell strokes, numbered pins (`refereeOnly` dashed style), and smoothed remote cursors. |
| `strokeColor`, `strokeWidth` | `string`, `number` | `'#e76742'`, `0.09` | Color and cell-fraction width for newly drawn strokes. |
| `rulerMetric` | `'grid' \| 'diagonal' \| 'straight'` | `'grid'` | Distance metric (`grid` counts orthogonal steps). |
| `followParty` | `boolean` | `false` | Tracks the party token until manual panning triggers `onFollowPartyChange(false)`. |
| `arrowKeys` | `'pan' \| 'move'` | `'pan'` | `'move'` routes arrow keys to `onMoveKey` while `Shift+Arrow` pans. |
| `letterKeys` | `boolean` | `false` | Enables `WASD` pan, `C` center, and `F` follow on the focused canvas (kept `false` in the main app so single-key shortcuts work globally). |
| `reducedMotion` | `boolean` | `prefers-reduced-motion` | Disables camera easing, inertia, and torch flicker. |
| `refereeMarkers`, `areaLabels`, `showWandering` | `boolean` | `true` | Toggles referee badges, player room labels, and the wandering-monster chip. |
| `hideErasedStrokes` | `boolean` | `true` | Optimistically hides erased strokes until `strokes` updates or `restoreErasedStrokes` runs. |
| `zoomLimits`, `initialView` | `{ min, max }`, `'fit' \| 'party'` | `{ min: 6, max: 160 }`, `'fit'` | CSS-pixels-per-cell bounds and initial camera framing. |
| `ariaLabel`, `className`, `style` | `string`, etc. | `'Dungeon map'` | Accessible canvas name and container styling. |

## Callbacks and imperative `DungeonMapHandle`

- **Target click and hover callbacks:** `onCellClick`, `onEdgeClick`, `onFeatureClick`, `onTransitionClick`, `onPartyClick`, `onPinClick`, `onContextMenu`, `onHover`.
- **Overlay, pick, camera, and cursor callbacks:** `onPing`, `onStrokeComplete`, `onStrokeErase`, `onPinCreate`, `onPickCell`, `onPickEdge`, `onPickCancel`, `onMeasure`, `onMeasureChange`, `onFollowPartyChange`, `onMoveKey`, `onCameraChange`, `onCursorChange`.
- **Imperative ref methods (`DungeonMapHandle`):** `zoomIn()`, `zoomOut()`, `fitToExplored(animate?)`, `centerOnParty(animate?)`, `panTo(point, animate?)`, `getCamera()`, `setCamera(camera, animate?)`, `onCamera(listener)`, `toDataURL(opts?)`, `getStats()`, `focus()`, `startMeasure(cell)`, `cancelMeasure()`, `isMeasuring()`, `restoreErasedStrokes(ids?)`, and `hasKeyboardCursor()`.

### Keyboard cursor and screen-reader announcements

Focusing the canvas in `pick-cell`, `pick-edge`, `pin`, `ping`, or `ruler` displays a cell cursor (`data-map-cursor="on"`), handled in window capture phase so `Arrow` keys move the cursor (`E` / `Shift+E` rotates edges in `pick-edge`, `Enter` confirms, `Esc` clears or cancels) without moving the party. A polite ARIA live region announces each cursor move and measurement (`measurementText(measurement)`) relative to the party's square.

## Rendering architecture and standalone harness

`MapRenderer` (`render/renderer.ts`) owns the `<canvas>` outside React's render loop, caching static geometry into `512px` offscreen tiles (up to 80 tiles) and requesting animation frames only during movement, pings, or ~30 fps torch flicker. Every `USER_COLORS` swatch is verified in `colors.test.ts` for contrast against floor, rock, and overlay casings across all three themes.

Open the standalone map harness in Vite dev mode to inspect fixtures, themes, tools, and frame times:

```sh
BXVTT_WEB_PORT=5182 npm run dev -w @bxvtt/web
# Open http://localhost:5182/map-harness.html?fixture=hills&layer=player&theme=parchment
```

Regenerate map fixtures in `fixtures/` from a running `bxapi` on port 8651 with:

```sh
BXAPI_URL=http://127.0.0.1:8651 node apps/web/src/map/fixtures/capture-fixtures.mjs
npx prettier --write apps/web/src/map/fixtures
```
