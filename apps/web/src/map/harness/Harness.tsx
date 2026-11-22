import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { DungeonMap, type DungeonMapHandle } from '../DungeonMap';
import { Minimap } from '../Minimap';
import type { Direction } from '../geometry';
import type { MapTarget } from '../hit';
import {
  fromPlayerView,
  fromRefereeView,
  refereeLevelKeys,
  type DungeonSpec,
  type DungeonState,
  type LevelMap,
  type LevelSpec,
  type PlayerView,
} from '../model';
import {
  measurementLabel,
  type MapPin,
  type MapPing,
  type MapPointer,
  type MapStroke,
  type MapTool,
  type Measurement,
} from '../overlays';
import { THEMES, type ThemeName } from '../themes';
import { fixture as loadFixture, type Fixture } from '../fixtures/fixtures';
import { placeParty, playerViewFrom, setDoor, tryMove } from './sim';
import { stressLevel } from './stress';

const FIXTURES: Record<string, { label: string; load: () => Fixture | 'stress' }> = {
  'showcase-explored': { label: 'Showcase, explored', load: () => loadFixture('showcase-explored') },
  'showcase-level2': { label: 'Showcase, level 2', load: () => loadFixture('showcase-level2') },
  'showcase-dark': { label: 'Showcase, just entered', load: () => loadFixture('showcase-dark') },
  hills: { label: 'The Hills Are Alive', load: () => loadFixture('hills') },
  barrow: { label: 'Barrow (built-in)', load: () => loadFixture('barrow') },
  stress: { label: 'Stress, 100 by 100', load: () => 'stress' },
};

interface World {
  dungeons: DungeonSpec[];
  key: string;
  state: DungeonState;
  /** The captured player view, until the harness moves the party and fakes its own. */
  view: PlayerView | null;
  lit: boolean;
}

function loadWorld(name: string): World {
  const loaded = (FIXTURES[name] ?? FIXTURES['showcase-explored'])?.load();
  if (loaded === 'stress' || !loaded) {
    const { level, state, dungeonId } = stressLevel();
    return {
      dungeons: [{ id: dungeonId, name: 'Stress', levels: [level] }],
      key: `${dungeonId}:1`,
      state,
      view: null,
      lit: true,
    };
  }
  const keys = refereeLevelKeys({
    adventure: loaded.referee.adventure,
    dungeon_state: loaded.referee.dungeon_state,
  });
  return {
    dungeons: loaded.referee.adventure.dungeons,
    key: keys[0] ?? '',
    state: loaded.referee.dungeon_state,
    view: loaded.view,
    lit: loaded.view.effects.some((e) => e.kind === 'light'),
  };
}

function levelOf(world: World): { level: LevelSpec; dungeonId: string } | null {
  const at = world.key.lastIndexOf(':');
  const dungeonId = world.key.slice(0, at);
  const number = Number(world.key.slice(at + 1));
  const level = world.dungeons.find((d) => d.id === dungeonId)?.levels.find((l) => l.number === number);
  return level ? { level, dungeonId } : null;
}

const params = new URLSearchParams(window.location.search);
const TOOLS: { tool: MapTool; label: string }[] = [
  { tool: 'select', label: 'Select' },
  { tool: 'pan', label: 'Pan' },
  { tool: 'draw', label: 'Draw' },
  { tool: 'erase', label: 'Erase' },
  { tool: 'ruler', label: 'Ruler' },
  { tool: 'ping', label: 'Ping' },
  { tool: 'pin', label: 'Pin' },
  { tool: 'pick-cell', label: 'Pick a cell' },
  { tool: 'pick-edge', label: 'Pick an edge' },
];
const NO_POINTERS: MapPointer[] = [];
const COLORS = ['#e4572e', '#2e86de', '#27ae60', '#8e44ad', '#f39c12'];

export function Harness() {
  const [fixture, setFixture] = useState(params.get('fixture') ?? 'showcase-explored');
  const [world, setWorld] = useState<World>(() => loadWorld(fixture));
  const [layer, setLayer] = useState<'player' | 'referee'>(
    params.get('layer') === 'player' ? 'player' : 'referee',
  );
  const [themeName, setThemeName] = useState<ThemeName>(
    (params.get('theme') as ThemeName | null) ?? 'blueprint',
  );
  const [tool, setTool] = useState<MapTool>('select');
  const [follow, setFollow] = useState(params.get('follow') === '1');
  const [reducedMotion, setReducedMotion] = useState(false);
  const [color, setColor] = useState(COLORS[0] ?? '#e4572e');
  const [strokes, setStrokes] = useState<MapStroke[]>([]);
  const [pings, setPings] = useState<MapPing[]>([]);
  const [pins, setPins] = useState<MapPin[]>([]);
  const [showPointers, setShowPointers] = useState(params.get('pointers') === '1');
  const [pointers, setPointers] = useState<MapPointer[]>([]);
  const [hover, setHover] = useState<MapTarget | null>(null);
  const [measurement, setMeasurement] = useState<Measurement | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [stats, setStats] = useState({ fps: 0, frameMs: 0, worstMs: 0, tiles: 0 });
  const mapRef = useRef<DungeonMapHandle>(null);
  const counter = useRef(0);

  const note = useCallback((line: string) => setLog((l) => [line, ...l].slice(0, 9)), []);

  const chooseFixture = useCallback((name: string) => {
    setFixture(name);
    setWorld(loadWorld(name));
    setStrokes([]);
    setPings([]);
  }, []);

  const located = useMemo(() => levelOf(world), [world]);
  const map: LevelMap | null = useMemo(() => {
    if (!located) return null;
    const { level, dungeonId } = located;
    if (layer === 'referee') {
      return fromRefereeView(level, world.state, { dungeonId, light: world.lit ? { radiusFeet: 30 } : null });
    }
    const view = world.view ?? playerViewFrom(level, world.state, dungeonId, world.lit);
    return fromPlayerView(view, world.key);
  }, [located, layer, world]);

  // Pins: one for everyone and one for referees, placed near the party when the level changes.
  const [pinsFor, setPinsFor] = useState<string | null>(null);
  if (map && map.key !== pinsFor) {
    setPinsFor(map.key);
    const at = map.party ?? map.cells[0] ?? { x: 0, y: 0 };
    setPins([
      {
        id: 'pin-1',
        x: at.x + 1.5,
        y: at.y + 0.5,
        label: '1',
        note: 'The party heard scratching behind this wall.',
      },
      {
        id: 'pin-2',
        x: at.x - 0.5,
        y: at.y - 1.5,
        label: '2',
        note: 'Referee: the ghoul waits here.',
        refereeOnly: true,
      },
    ]);
  }

  // A remote pointer that circles the party, ten updates a second, as a socket would deliver.
  useEffect(() => {
    if (!showPointers) return;
    const timer = setInterval(() => {
      const t = performance.now() / 1000;
      const party = map?.party ?? { x: 5, y: 5 };
      setPointers([
        {
          id: 'tomas',
          x: party.x + 0.5 + Math.cos(t) * 3,
          y: party.y + 0.5 + Math.sin(t) * 2,
          color: '#2e86de',
          label: 'Tomas',
        },
      ]);
    }, 100);
    return () => clearInterval(timer);
  }, [showPointers, map?.party]);

  useEffect(() => {
    let frames = 0;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      frames += 1;
      if (now - last >= 500) {
        const s = mapRef.current?.getStats();
        setStats({
          fps: Math.round((frames * 1000) / (now - last)),
          frameMs: s?.frameMs ?? 0,
          worstMs: s?.worstMs ?? 0,
          tiles: s?.tilesPainted ?? 0,
        });
        frames = 0;
        last = now;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const move = useCallback((direction: Direction) => {
    setWorld((w) => {
      const found = levelOf(w);
      if (!found) return w;
      const next = tryMove(found.level, w.state, found.dungeonId, direction);
      return next ? { ...w, state: next, view: null } : w;
    });
  }, []);

  // Arrow keys move the party anywhere on the page, except while a form control has focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'CANVAS' || target.tagName === 'SELECT' || target.tagName === 'INPUT')
      )
        return;
      const d: Record<string, Direction> = {
        ArrowUp: 'north',
        ArrowDown: 'south',
        ArrowLeft: 'west',
        ArrowRight: 'east',
      };
      const dir = d[e.key];
      if (dir && !e.shiftKey) {
        e.preventDefault();
        move(dir);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [move]);

  const burst = useCallback(() => {
    const dirs: Direction[] = ['east', 'east', 'south', 'south', 'west', 'west', 'north', 'north'];
    dirs.forEach((d, i) => setTimeout(() => move(d), i * 45));
  }, [move]);

  const ping = useCallback((x: number, y: number, who: string, c: string) => {
    counter.current += 1;
    setPings((p) => [...p.slice(-6), { id: `ping-${counter.current}`, x, y, color: c, label: who }]);
  }, []);

  const remotePing = () => {
    if (!map) return;
    const known = map.cells.filter((c) => c.known);
    const c = known[Math.floor(Math.random() * known.length)] ?? { x: 0, y: 0 };
    ping(c.x + 0.5, c.y + 0.5, 'Wren', '#27ae60');
  };

  const snapshot = () => {
    const url = mapRef.current?.toDataURL({ area: 'level', scale: 32 });
    if (url) window.open()?.document.write(`<img src="${url}" style="max-width:100%">`);
  };

  useEffect(() => {
    (window as unknown as { __map: unknown }).__map = {
      handle: mapRef,
      move,
      setFixture: chooseFixture,
      setLayer,
      setThemeName,
      setTool,
      setFollow,
      setShowPointers,
      ping: (x: number, y: number) => ping(x, y, 'Tomas', '#2e86de'),
      burst,
      addStroke: (s: MapStroke) => setStrokes((all) => [...all, s]),
    };
  }, [move, chooseFixture, ping, burst]);

  const theme = THEMES[themeName];
  const hoverText = hover ? describeHover(hover) : 'Nothing';

  return (
    <div style={shell}>
      <aside style={sidebar}>
        <h1 style={{ fontSize: 16, margin: '0 0 2px' }}>Map harness</h1>
        <p style={muted}>Arrow keys move the party. Shift and the arrows pan.</p>
        <Section title="Fixture">
          <select
            aria-label="Fixture"
            value={fixture}
            onChange={(e) => chooseFixture(e.target.value)}
            style={select}
          >
            {Object.entries(FIXTURES).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
          {world.dungeons.flatMap((d) => d.levels).length > 1 ? (
            <select
              aria-label="Level"
              value={world.key}
              onChange={(e) => setWorld((w) => ({ ...w, key: e.target.value }))}
              style={{ ...select, marginTop: 6 }}
            >
              {world.dungeons.flatMap((d) =>
                d.levels.map((l) => (
                  <option key={`${d.id}:${l.number}`} value={`${d.id}:${l.number}`}>
                    {d.name || d.id}, level {l.number}
                  </option>
                )),
              )}
            </select>
          ) : null}
        </Section>
        <Section title="Layer">
          <Group>
            {(['player', 'referee'] as const).map((l) => (
              <Toggle key={l} on={layer === l} onClick={() => setLayer(l)}>
                {l === 'player' ? 'Player' : 'Referee'}
              </Toggle>
            ))}
          </Group>
        </Section>
        <Section title="Theme">
          <Group>
            {(Object.keys(THEMES) as ThemeName[]).map((t) => (
              <Toggle key={t} on={themeName === t} onClick={() => setThemeName(t)}>
                {THEMES[t].title}
              </Toggle>
            ))}
          </Group>
        </Section>
        <Section title="Tool">
          <Group wrap>
            {TOOLS.map((t) => (
              <Toggle key={t.tool} on={tool === t.tool} onClick={() => setTool(t.tool)}>
                {t.label}
              </Toggle>
            ))}
          </Group>
          <Group>
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Stroke color ${c}`}
                aria-pressed={color === c}
                onClick={() => setColor(c)}
                style={{ ...swatch, background: c, outline: color === c ? '2px solid #fff' : 'none' }}
              />
            ))}
          </Group>
        </Section>
        <Section title="Camera">
          <Group wrap>
            <Button onClick={() => mapRef.current?.zoomIn()}>Zoom in</Button>
            <Button onClick={() => mapRef.current?.zoomOut()}>Zoom out</Button>
            <Button onClick={() => mapRef.current?.fitToExplored()}>Fit</Button>
            <Button onClick={() => mapRef.current?.centerOnParty()}>Center on party</Button>
            <Toggle on={follow} onClick={() => setFollow((f) => !f)}>
              Follow party
            </Toggle>
          </Group>
        </Section>
        <Section title="Simulate">
          <Group wrap>
            <Button onClick={burst}>Eight fast steps</Button>
            <Button onClick={remotePing}>Remote ping</Button>
            <Toggle on={showPointers} onClick={() => setShowPointers((s) => !s)}>
              Remote pointer
            </Toggle>
            <Toggle on={world.lit} onClick={() => setWorld((w) => ({ ...w, lit: !w.lit, view: null }))}>
              Torch lit
            </Toggle>
            <Toggle on={reducedMotion} onClick={() => setReducedMotion((r) => !r)}>
              Reduced motion
            </Toggle>
            <Button onClick={() => setStrokes([])}>Clear drawings</Button>
            <Button onClick={snapshot}>Snapshot</Button>
          </Group>
        </Section>
        <Section title="Performance">
          <div style={statsRow} data-testid="stats">
            <span>{stats.fps} fps</span>
            <span>{stats.frameMs.toFixed(1)} ms a frame</span>
            <span>{stats.worstMs.toFixed(1)} ms worst</span>
            <span>{stats.tiles} tiles</span>
          </div>
        </Section>
        <Section title="Hover">
          <div style={mono}>{hoverText}</div>
          {measurement ? <div style={mono}>Ruler: {measurementLabel(measurement)}</div> : null}
        </Section>
        <Section title="Events">
          <ol style={{ ...mono, margin: 0, paddingLeft: 16 }}>
            {log.map((line, i) => (
              <li key={`${i}-${line}`}>{line}</li>
            ))}
          </ol>
        </Section>
      </aside>
      <main style={{ position: 'relative', flex: 1, minWidth: 0 }}>
        <DungeonMap
          ref={mapRef}
          map={map}
          theme={theme}
          tool={tool}
          strokes={strokes}
          pings={pings}
          pins={layer === 'referee' ? pins : pins.filter((p) => !p.refereeOnly)}
          pointers={showPointers ? pointers : NO_POINTERS}
          strokeColor={color}
          followParty={follow}
          arrowKeys="move"
          reducedMotion={reducedMotion}
          style={{ position: 'absolute', inset: 0 }}
          onFollowPartyChange={setFollow}
          onMoveKey={(d) => move(d)}
          onHover={setHover}
          onCellClick={(t) => {
            note(`cell ${t.x},${t.y}${t.direction ? ` (move ${t.direction})` : ''}`);
            if (t.direction) move(t.direction);
          }}
          onEdgeClick={(t) => {
            note(`edge ${t.edge.key} ${t.edge.kind}${t.direction ? ` (party's ${t.direction})` : ''}`);
            if (t.edge.kind === 'door' && located) {
              const open = !(t.edge.door?.open ?? false);
              setWorld((w) => ({
                ...w,
                view: null,
                state: setDoor(located.level, w.state, located.dungeonId, t.edge.key, { open }),
              }));
            }
          }}
          onFeatureClick={(t) => note(`feature ${t.feature.kind} ${t.feature.id}`)}
          onTransitionClick={(t) => note(`transition ${t.transition.kind}`)}
          onPartyClick={() => note('party')}
          onPinClick={(t) => note(`pin ${t.pin.label}`)}
          onContextMenu={(t, s) =>
            note(`context menu on ${t?.kind ?? 'nothing'} at ${Math.round(s.x)},${Math.round(s.y)}`)
          }
          onPing={(p) => {
            note(`ping ${p.x.toFixed(1)},${p.y.toFixed(1)}`);
            ping(p.x, p.y, 'You', color);
          }}
          onStrokeComplete={(s) => {
            counter.current += 1;
            setStrokes((all) => [...all, { ...s, id: `stroke-${counter.current}` }]);
            note(`stroke with ${s.points.length} points`);
          }}
          onStrokeErase={(ids) => {
            setStrokes((all) => all.filter((s) => !ids.includes(s.id)));
            note(`erased ${ids.length}`);
          }}
          onPinCreate={(p) => {
            counter.current += 1;
            setPins((all) => [
              ...all,
              {
                id: `pin-${counter.current}`,
                x: p.x,
                y: p.y,
                label: String(all.length + 1),
                note: 'A new pin.',
              },
            ]);
          }}
          onPickCell={(t) => {
            note(`picked cell ${t.x},${t.y}`);
            if (located && t.floor) {
              setWorld((w) => ({
                ...w,
                view: null,
                state: placeParty(located.level, w.state, located.dungeonId, t.x, t.y, 'north'),
              }));
            }
          }}
          onPickEdge={(t) => {
            note(`picked edge ${t.edge.key}`);
            if (located && t.edge.kind === 'door') {
              const d = t.edge.door;
              const change =
                d?.secret && d.discovered === false
                  ? { discovered: true }
                  : { wedged: !(d?.wedged ?? false), open: true };
              setWorld((w) => ({
                ...w,
                view: null,
                state: setDoor(located.level, w.state, located.dungeonId, t.edge.key, change),
              }));
            }
          }}
          onMeasure={setMeasurement}
        />
        <div style={{ position: 'absolute', right: 12, bottom: 12, zIndex: 3 }}>
          <Minimap map={map} target={mapRef} theme={theme} width={220} height={170} />
        </div>
      </main>
    </div>
  );
}

function describeHover(t: MapTarget): string {
  switch (t.kind) {
    case 'cell':
      return `cell ${t.x},${t.y}${t.areaId ? ` in ${t.areaId}` : ''}${t.direction ? `, ${t.direction} of the party` : ''}`;
    case 'edge':
      return `edge ${t.edge.key}: ${t.edge.kind}${t.edge.door ? ` ${JSON.stringify(t.edge.door)}` : ''}`;
    case 'feature':
      return `feature ${t.feature.id} (${t.feature.kind})`;
    case 'transition':
      return `transition ${t.transition.id}`;
    case 'party':
      return 'party';
    case 'pin':
      return `pin ${t.pin.label}`;
  }
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ marginTop: 14 }}>
      <h2 style={sectionTitle}>{title}</h2>
      {children}
    </section>
  );
}

function Group({ children, wrap }: { children: ReactNode; wrap?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: wrap ? 'wrap' : 'nowrap', marginTop: 4 }}>
      {children}
    </div>
  );
}

function Button({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} style={button}>
      {children}
    </button>
  );
}

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      style={{ ...button, ...(on ? buttonOn : null) }}
    >
      {children}
    </button>
  );
}

const shell: CSSProperties = {
  display: 'flex',
  height: '100vh',
  background: '#111316',
  color: '#e8e6e1',
  font: '13px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif',
};
const sidebar: CSSProperties = {
  width: 290,
  padding: 16,
  overflowY: 'auto',
  borderRight: '1px solid #2a2e35',
  flexShrink: 0,
};
const muted: CSSProperties = { color: '#9aa0a8', margin: 0 };
const sectionTitle: CSSProperties = {
  fontSize: 11,
  letterSpacing: 0.4,
  color: '#9aa0a8',
  margin: 0,
  fontWeight: 600,
};
const button: CSSProperties = {
  background: '#1d2127',
  color: '#e8e6e1',
  border: '1px solid #343a43',
  borderRadius: 6,
  padding: '5px 9px',
  font: 'inherit',
  cursor: 'pointer',
};
const buttonOn: CSSProperties = { background: '#e8e6e1', color: '#111316', border: '1px solid #e8e6e1' };
const select: CSSProperties = { ...button, width: '100%' };
const swatch: CSSProperties = {
  width: 22,
  height: 22,
  borderRadius: 11,
  border: '1px solid #000',
  cursor: 'pointer',
};
const statsRow: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '4px 12px',
  fontVariantNumeric: 'tabular-nums',
};
const mono: CSSProperties = {
  font: '12px/1.4 ui-monospace, Menlo, monospace',
  color: '#c9ccd1',
  wordBreak: 'break-word',
};
