# Dungeon map

`apps/web/src/map` draws a bxapi dungeon level on a canvas and reports what the user does on it. You build a `LevelMap` from a bxapi view, pass it to `<DungeonMap>`, and handle the callbacks. The map never sends a request and never decides whether an action is legal: it reports which cell, door, or feature the user picked, and bxapi decides the rest.

The module has no dependencies beyond React and doesn't use the design system in `src/ui`, so you can place it inside any screen layout.

## Integrate the map

1. Build a `LevelMap` from the view your store holds. A player builds from the player view, and a referee with the referee lens on builds from the referee view:

   ```tsx
   import { fromPlayerView, fromReferee } from '@/map';

   const map = refereeLens ? fromReferee(refereeView) : fromPlayerView(playerView);
   ```

   Both builders take an optional level key such as `"crypt:2"` and default to the level the party stands on. They return `null` when the party is in town or the view knows no such level.

2. Render `<DungeonMap>` in a sized container, and send commands from the callbacks:

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

3. Rebuild the map when a new view arrives. The map compares the new level with the last one: when only the party moved, it animates the token and repaints nothing else, and when doors or cells changed, it repaints only the tiles around them.

Memoize the `LevelMap` and the overlay arrays (`pings`, `strokes`, `pins`, `pointers`). A new array or a new theme object on every render makes the map redo work it could skip.

## What bxapi reports and what players can see

Read this before you add a feature to the map, because the player view leaves out most of the level.

- **Grid and scale:** A cell `(x, y)` is 10 feet on a side. `x` grows east and `y` grows south from `(0, 0)` in the north-west corner. World coordinates in this module are cells, so `(2.5, 3.5)` is the centre of cell `(2, 3)`.
- **Edge keys:** osrlib names each edge once, by the cell on its south or east side: `"2,0:west"` is the edge between `(1, 0)` and `(2, 0)`, and `"2,4:north"` is the edge between `(2, 3)` and `(2, 4)`. A key never ends in `south` or `east`. Use `edgeKey(x, y, direction)` to get a key from either side, and `parseEdgeKey` to read one. Door state in `DungeonState.doors` is keyed by `"{dungeon}:{level}:{edge key}"`.
- **Player view (`PlayerView.explored`):** It lists the known cells for each level the party knows. The list combines the cells the party walked, the cells it remembers seeing, and the cells its light shows right now, and it doesn't say which is which. It also lists every edge around those cells as `wall`, `open`, or `door`. A door reports only `door_open` and `door_wedged`.
- **What players can't see:** The player view has no level size, no areas or room names, no stairs or other transitions, no features or traps, and no locked, stuck, or gated state on a door. A secret door the party hasn't found reads as `wall`. A passage through a wall reads as `open`. The player view lists emptied caches by reference only, with no position, so the map can't draw them. The map draws a pile only when it lies on a cell the party walked.
- **Player light:** The player view lists `light` effects but not their radius. `fromPlayerView` assumes 30 feet (a torch) unless you pass `lightRadiusFeet`.
- **Referee view:** `RefereeView.adventure` holds the whole level (`LevelSpec`), and `RefereeView.dungeon_state` holds what play changed: door state, `explored` (walked) and `seen` (lit) cells, found and sprung traps, emptied caches, piles, rolled caches, and resolved encounters. An edge with no entry in `LevelSpec.edges` is a wall.
- **Door states:** A door in the adventure is `normal` or `secret`, and can be `locked`, `stuck`, `starts_open`, or gated by a condition. In play it can be `open`, `wedged` (spiked open), `discovered` (a found secret door), and `unlocked`. A door with no entry in `dungeon_state.doors` starts open only if `starts_open` is set. `MapDoor` combines both: `locked` means locked in the adventure and not yet unlocked.

### Add what the party learned from events

Because the player view has no stairs, a player map shows none until you add them. When an event tells the party about stairs or a feature, such as a `LocationEnteredEvent` for stairs it used, pass it as an extra:

```ts
fromPlayerView(view, undefined, {
  extras: { transitions: [{ kind: 'stairs_down', x: 10, y: 34 }] },
  lightRadiusFeet: 30,
});
```

The player view also names no areas. Pass the areas the party has entered, such as the scene's `levels[].areas`, and the map names them:

```ts
fromPlayerView(view, key, {
  extras: { areas: sceneLevel.areas.map(({ id, name, cells }) => ({ id, name, cells })) },
});
```

Each area keeps only the cells on the party's map and gets no key number, because players don't see the key. Its name goes on the cell deepest inside the area that holds no stairs or feature, from a zoom of 16 pixels a cell, and moves above or below the party token when the token would cover it. The hover tooltip names the area under the pointer. If you draw your own labels, pass `areaLabels={false}` to `DungeonMap` and keep the areas for the tooltip.

Keep extras on the server's player projection or in the player's own store, never from referee data.

## Model builders

| Function | What it returns |
| --- | --- |
| `fromPlayerView(view, levelKey?, options?)` | A player map of one level, or `null`. `options.lightRadiusFeet` sets the light hint, and `options.extras` adds transitions, features, and areas. |
| `fromReferee(refereeView, levelKey?)` | A referee map of one level, with the party light read from the effects ledger, or `null`. |
| `fromRefereeView(levelSpec, dungeonState, { dungeonId, light })` | A referee map from the parts, for when you hold the level and the state separately. |
| `refereeLight(refereeView)` | `{ radiusFeet }` from the largest light effect on a party member, or `null` when the party has no light or darkness puts it out. |
| `playerLevelKeys(view)`, `refereeLevelKeys(refereeView)` | Every level key the view knows, the party's level first. Use them for a level picker. |
| `currentLevelKey(view)` | The party's level key, or `null` in town. |

A `LevelMap` contains:

- `cells`: floor cells with `known` (the party knows the cell), `walked` (`null` on a player map), and `areaId`.
- `edges`: every edge around the floor cells, with `kind` (`wall`, `open`, `door`, or `passage`) and a `door` with `open`, `wedged`, `locked`, `unlocked`, `stuck`, `secret`, `discovered`, and `gated`. A field the player view doesn't report is `null`.
- `transitions`: stairs up and down, trapdoors, chutes, and passages, with their destination on a referee map.
- `features`: caches (`emptied`, and a treasure `trap` with its state), rolled caches, piles, construction tricks (`found`), and custom features, each with a `contents` list for a tooltip.
- `areas`: on a referee map, each keyed area with its `label` (its position in the list, from 1), name, description, cells, label `anchor`, `encounter` summary, `treasure`, and room `trap`. On a player map, the areas from `extras.areas`, with an empty `label` and no encounter, treasure, or trap.
- `entrance`, `party` (position and facing), `light`, `wandering` (the level's wandering monster check), `bounds`, and `knownBounds`.

## Props

| Prop | Type | Default | Meaning |
| --- | --- | --- | --- |
| `map` | `LevelMap \| null` | required | The level to draw. `null` draws empty rock. |
| `theme` | `'blueprint' \| 'torchlit' \| 'parchment' \| MapTheme` | `'blueprint'` | The look. You can switch it at any time. |
| `tool` | `MapTool` | `'select'` | The active tool. See [Tools](#tools). |
| `pings` | `MapPing[]` | `[]` | Pings to animate. A new id pulses once, for about 2.6 seconds from when the map first receives it. |
| `strokes` | `MapStroke[]` | `[]` | Committed freehand strokes, in cells. |
| `pins` | `MapPin[]` | `[]` | Numbered pins. A pin's `note` shows on hover, and `refereeOnly` draws a dashed referee style. Filter referee pins out of a player's props. |
| `pointers` | `MapPointer[]` | `[]` | Other users' pointers. The map eases each one toward its new position, so 10 updates a second look smooth. |
| `strokeColor` | `string` | `'#e4572e'` | The color of a new stroke. |
| `strokeWidth` | `number` | `0.09` | The width of a new stroke, in cells. |
| `rulerMetric` | `'grid' \| 'diagonal' \| 'straight'` | `'grid'` | How the ruler counts squares. `grid` counts the orthogonal steps the party walks. |
| `followParty` | `boolean` | `false` | Keeps the camera on the party. A pan turns it off and calls `onFollowPartyChange(false)`. |
| `arrowKeys` | `'pan' \| 'move'` | `'pan'` | With `'move'`, the arrow keys call `onMoveKey`, and Shift with the arrows pans. |
| `letterKeys` | `boolean` | `false` | Handles W, A, S, and D (pan), C (centre on the party), and F (follow) on the focused map. Leave it off in the app, so letters reach the app's shortcuts. The harness turns it on. |
| `reducedMotion` | `boolean` | the user's `prefers-reduced-motion` | Turns off easing, inertia, and flicker. |
| `refereeMarkers` | `boolean` | `true` | On a referee map, draws area labels and the encounter, treasure, and trap markers. |
| `areaLabels` | `boolean` | `true` | On a player map, draws the names of the areas from `extras.areas`. |
| `hideErasedStrokes` | `boolean` | `true` | Hides a stroke as soon as the eraser touches it, until the next `strokes` list arrives or you call `restoreErasedStrokes`. With `false`, the map only reports `onStrokeErase`, and a stroke stays until you remove it from `strokes`. |
| `showWandering` | `boolean` | `true` | On a referee map, shows the wandering monster chip in the corner. |
| `zoomLimits` | `{ min, max }` | `{ min: 6, max: 160 }` | Zoom limits in CSS pixels per cell. |
| `initialView` | `'fit' \| 'party'` | `'fit'` | Where the camera starts on a new level. `fit` shows the known cells on a player map and the whole level on a referee map. |
| `ariaLabel` | `string` | `'Dungeon map'` | The accessible name. |
| `className`, `style` | | | Applied to the container. Give the container a size. The map's own defaults (`position: relative`, `overflow: hidden`, and the theme's rock color as the background) sit in a rule with no specificity, so a class or a style can position the map, such as `position: absolute; inset: 0`. |

## Callbacks

Every click callback receives a target and a `MapPointerInfo` with the screen point, the world point, and the modifier keys.

| Callback | When it fires |
| --- | --- |
| `onCellClick(target, info)` | A click on a cell with the select tool. `target.direction` is `'north'`, `'east'`, `'south'`, or `'west'` when the cell is next to the party, and `null` otherwise. Send it as a move and let bxapi refuse it. A click on a feature, a door, or the party also lands here when you don't pass that target's own callback. |
| `onEdgeClick(target, info)` | A click on a door or a passage. `target.edge` is the `MapEdge`. `target.direction` is the edge's side of the party's cell when the party stands beside it, ready for `open_door`, `close_door`, `force_door`, `listen_at_door`, `pick_lock`, or `wedge_door`. |
| `onFeatureClick`, `onTransitionClick`, `onPartyClick`, `onPinClick` | A click on those things. |
| `onContextMenu(target, screen, info)` | A right-click. Passing it suppresses the browser menu. `target` is whatever is under the pointer, or `null`. |
| `onHover(target)` | The hovered target changed. The map already shows a tooltip, so use this for a side panel. |
| `onPing(point)` | Alt and click in any tool, a long press, or a click with the ping tool. Broadcast it and add it to `pings`. |
| `onStrokeComplete(stroke)` | A finished stroke with the draw tool, already simplified. Give it an id and add it to `strokes`. |
| `onStrokeErase(ids)` | The eraser touched these strokes. Remove them from `strokes`. If the server refuses the erase, call `restoreErasedStrokes(ids)` on the handle to show them again. |
| `onPinCreate(point)` | A click on an empty spot with the pin tool. |
| `onPickCell(target)`, `onPickEdge(target)` | A click with the pick-a-cell or pick-an-edge tool, for referee tools such as `place_party` and `set_door_state`. `onPickEdge` reports any edge, walls included. |
| `onMeasure(measurement)` | The ruler finished a measurement, or cleared one with `null`. It also reports the end of a measurement from `startMeasure`. |
| `onFollowPartyChange(follow)` | A pan turned follow mode off, or the F key toggled it. |
| `onMoveKey(direction, repeat)` | An arrow key with `arrowKeys="move"`. `repeat` is true while the key is held. |
| `onCameraChange(camera)` | The camera moved. It fires on every animated frame, so don't set React state from it directly. |

## Imperative handle

Pass a `ref` to get a `DungeonMapHandle`:

- `zoomIn()`, `zoomOut()`, `fitToExplored(animate?)`, `centerOnParty(animate?)`, and `panTo(point, animate?)`.
- `getCamera()` and `setCamera(camera, animate?)`, where a camera is `{ x, y, zoom }`: the world point at the centre and the CSS pixels per cell.
- `onCamera(listener)`, which subscribes to camera changes and returns an unsubscribe function. The minimap uses it.
- `toDataURL({ area, type, quality, scale })`, which returns an image. `area: 'viewport'` (the default) captures the screen. `area: 'level'` paints the known level at `scale` device pixels per cell, with strokes, pins, and the party, up to 4096 pixels on a side.
- `getStats()`, which returns frames per second and frame times, and `focus()`.
- `startMeasure(cell)`, which starts a measurement from a cell (`{ x, y }` in cells) in any tool, such as for "Measure from here" in a context menu. The ruler runs to the cell under the pointer, and the arrow keys move its far end while the map has focus. A click or Enter ends it and reports the measurement through `onMeasure`, and that click reaches no other callback. Escape, a tool change, a level change, or `cancelMeasure()` ends it and reports `null`. `isMeasuring()` says whether one is running.
- `restoreErasedStrokes(ids?)`, which shows strokes the eraser hid again: the given ids, or every hidden stroke.

```tsx
const mapRef = useRef<DungeonMapHandle>(null);
// In a context menu on a cell:
mapRef.current?.startMeasure({ x: target.x, y: target.y });
// After the server refuses an erase:
mapRef.current?.restoreErasedStrokes(ids);
```

## Tools

| Tool | A click | A drag |
| --- | --- | --- |
| `select` | Calls the click callback for the target under the pointer. | Pans. |
| `pan` | Nothing. | Pans. |
| `draw` | Draws a dot. | Draws a stroke. |
| `erase` | Erases strokes under the pointer. | Erases strokes along the path. |
| `ruler` | Clears the measurement. | Measures from cell to cell, in squares and feet. |
| `ping` | Pings. | Pans. |
| `pin` | Creates a pin, or clicks an existing one. | Pans. |
| `pick-cell` | Picks the cell. The hover highlights cells. | Pans. |
| `pick-edge` | Picks the nearest edge of the cell. The hover highlights edges. | Pans. |

In every tool, holding Space and dragging pans, a middle-button drag pans, the wheel or a pinch zooms at the pointer, and two fingers pinch and pan on a touch screen. Alt and click pings, and so does a long press, except that a mouse doesn't long-press in the draw, erase, and ruler tools. A release during a pan keeps the map gliding.

With the map focused, it handles these keys and calls `preventDefault` on each:

- The arrow keys pan. With `arrowKeys="move"`, the arrow keys call `onMoveKey`, and Shift with the arrows pans.
- Plus (or `=`) and minus (or `_`) zoom, and zero fits the known map.
- Space pans while you hold it and drag.
- Escape clears the ruler or a stroke in progress, and ends a measurement from `startMeasure`. With nothing to clear, Escape passes through.
- During a measurement from `startMeasure`, the arrow keys move its far end and Enter ends it.
- With `letterKeys`, W, A, S, and D pan, C centres on the party, and F toggles follow mode.

Every other key, and every key pressed with Ctrl, Cmd, or Alt, passes through untouched, so the app's shortcut registry receives it. For example, A after a click on the map reaches the combat feature's "Attack the nearest monsters" shortcut.

## Themes

Themes are plain data in `themes.ts`: colors, line widths, and a few style switches.

- `blueprint`: blue line work on pale paper with solid blue rock, in the style of the old modules.
- `torchlit`: dark flagstones and stone walls, warm flickering light around the party, and darkness beyond its reach.
- `parchment`: ink on aged paper, with hand-drawn walls and hatching along the rock.

To make a variant, copy a theme, change fields, and pass the object as `theme`. Keep the object stable between renders, because a new theme object repaints every tile.

## Minimap

`<Minimap map={map} target={mapRef} />` draws the level, the party, and the main map's viewport. A click or drag on it moves the main map, and the arrow keys pan by a quarter screen when it has focus. Give it the same `map` and `theme` as the main map.

## How it renders

`MapRenderer` (in `render/renderer.ts`) is a plain class that owns the canvas. The React component creates one and passes props to it, so React doesn't run during a pan or an animation.

- The static map (rock, floor, grid, walls, doors, symbols, and the veil) is painted into 512-pixel tiles at the current zoom and cached. A pan copies the tiles. A zoom stretches the cached tiles until it settles, then repaints them at the new scale over a few frames, so lines stay sharp at every zoom.
- The labels, light, party token, pings, pins, strokes, ruler, and pointers are drawn every frame in screen space.
- The renderer requests frames only while something moves. The torchlit flicker runs at about 30 frames a second.
- Walls are merged into straight runs and stroked in one path with square caps, so corners join without gaps or double-drawn joints.

On the 100 by 100 stress level in GPU-accelerated Chrome at 1440 by 900 and a device pixel ratio of 2, panning holds 60 frames per second at about 0.3 ms of drawing per frame, and zooming at about 0.6 ms per frame, with the slowest frame near 9 ms while tiles repaint. The tile cache holds up to 80 tiles and 48 spare canvases of about 1 MB each.

## Harness and fixtures

Run the development server on a free port and open the harness page:

```sh
BXVTT_WEB_PORT=5182 npm run dev -w @bxvtt/web
# then open http://localhost:5182/map-harness.html
```

The harness loads the fixtures, switches themes and layers, exercises every tool and overlay, and shows frame timing. The arrow keys move the party with a fake rule set in `harness/sim.ts`, which exists only so the harness has something to animate. URL parameters set the starting state, such as `?fixture=hills&layer=player&theme=parchment`.

The fixtures in `fixtures/` are real bxapi responses. `capture-fixtures.mjs` recreates them against a development bxapi (it uploads `showcase-adventure.json`, a two-level test dungeon with every door, transition, and feature kind, and The Hills Are Alive from `~/repos/osr-suite`):

```sh
BXAPI_URL=http://127.0.0.1:8651 node apps/web/src/map/fixtures/capture-fixtures.mjs
npx prettier --write apps/web/src/map/fixtures
```

Search and trap rolls are random, so a new capture can differ from the committed one in which traps and tricks the party found. Update the tests in `model.test.ts` if it does.

## Known limits

- A player map can't show emptied caches, stairs, features, or area names unless you pass them as extras, because the player view doesn't include them.
- The light hint on a player map assumes the radius you pass, because the player view doesn't state it.
- The map doesn't draw a fog-of-war shape for what the party sees right now. Every known cell looks the same, because the player view doesn't separate walked, remembered, and lit cells.
- The hover tooltip describes doors, features, and areas in English from `describe.ts`. Move those strings to `@bxvtt/shared/text` if the app gains translations.
