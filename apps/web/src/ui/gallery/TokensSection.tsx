import { useState } from 'react';
import { Button } from '../components/Button';
import { cx } from '../lib/cx';
import { playerColors } from '../tokens';
import { Caption, Grid, Row, Section, Specimen, Stack } from './parts';
import styles from './Gallery.module.css';

interface Swatch {
  token: string;
  label: string;
  /** Text color to test on the swatch. */
  on?: string;
}

const colorGroups: Array<{ title: string; note?: string; swatches: Swatch[] }> = [
  {
    title: 'Surfaces',
    note: 'Lampblack and umber. Each step up is a little warmer and lighter.',
    swatches: [
      { token: '--color-bg-stage', label: 'Stage' },
      { token: '--color-bg-app', label: 'App' },
      { token: '--color-surface-1', label: 'Surface 1' },
      { token: '--color-surface-2', label: 'Surface 2' },
      { token: '--color-surface-3', label: 'Surface 3' },
      { token: '--color-surface-sunken', label: 'Sunken' },
    ],
  },
  {
    title: 'Text and lines',
    swatches: [
      { token: '--color-text-strong', label: 'Text strong' },
      { token: '--color-text', label: 'Text' },
      { token: '--color-text-muted', label: 'Text muted' },
      { token: '--color-text-subtle', label: 'Text subtle' },
      { token: '--color-border', label: 'Border' },
      { token: '--color-border-input', label: 'Input border' },
    ],
  },
  {
    title: 'Accent',
    note: 'Brass marks the primary action, selection, and focus. Use it sparingly.',
    swatches: [
      { token: '--color-accent', label: 'Accent', on: '--color-on-accent' },
      { token: '--color-accent-hover', label: 'Accent hover', on: '--color-on-accent' },
      { token: '--color-accent-text', label: 'Accent text' },
      { token: '--color-accent-subtle', label: 'Accent subtle' },
      { token: '--color-focus', label: 'Focus' },
    ],
  },
  {
    title: 'States',
    swatches: [
      { token: '--color-success', label: 'Success' },
      { token: '--color-warning', label: 'Warning' },
      { token: '--color-danger', label: 'Danger' },
      { token: '--color-info', label: 'Info' },
      { token: '--color-danger-strong', label: 'Danger strong' },
    ],
  },
  {
    title: 'Game events',
    note: 'For floating numbers, feed entries, and map effects.',
    swatches: [
      { token: '--color-damage', label: 'Damage' },
      { token: '--color-heal', label: 'Heal' },
      { token: '--color-magic', label: 'Magic' },
      { token: '--color-gold', label: 'Gold' },
      { token: '--color-referee', label: 'Referee only' },
    ],
  },
  {
    title: 'Paper',
    note: 'Vellum and iron-gall ink, for sheets, handouts, and the journal.',
    swatches: [
      { token: '--color-paper', label: 'Paper', on: '--color-paper-ink' },
      { token: '--color-paper-raised', label: 'Paper raised', on: '--color-paper-ink' },
      { token: '--color-paper-sunken', label: 'Paper sunken', on: '--color-paper-ink' },
      { token: '--color-paper-ink', label: 'Ink' },
      { token: '--color-paper-rubric', label: 'Rubric' },
    ],
  },
];

function SwatchChip({ token, label, on }: Swatch) {
  return (
    <div className={styles.swatch}>
      <span
        className={styles.swatchColor}
        style={{ background: `var(${token})`, color: on ? `var(${on})` : undefined }}
      >
        {on ? 'Aa' : null}
      </span>
      <span className={styles.swatchLabel}>{label}</span>
      <code className={styles.swatchToken}>{token}</code>
    </div>
  );
}

const typeScale = [
  { token: '--text-6xl', px: 60 },
  { token: '--text-5xl', px: 48 },
  { token: '--text-4xl', px: 36 },
  { token: '--text-3xl', px: 24 },
  { token: '--text-2xl', px: 21 },
  { token: '--text-xl', px: 18 },
  { token: '--text-lg', px: 16 },
  { token: '--text-md', px: 14 },
  { token: '--text-sm', px: 13 },
  { token: '--text-xs', px: 12 },
  { token: '--text-2xs', px: 11 },
];

const spaces = [
  '--space-0-5',
  '--space-1',
  '--space-1-5',
  '--space-2',
  '--space-2-5',
  '--space-3',
  '--space-4',
  '--space-5',
  '--space-6',
  '--space-8',
  '--space-10',
  '--space-12',
  '--space-16',
];

const radii = ['--radius-xs', '--radius-sm', '--radius-md', '--radius-lg', '--radius-pill'];

const motion = [
  { token: '--duration-instant', ms: 80, use: 'Press feedback' },
  { token: '--duration-fast', ms: 120, use: 'Hover, menus, tooltips' },
  { token: '--duration-base', ms: 180, use: 'Toggles, accordions' },
  { token: '--duration-slow', ms: 280, use: 'Dialogs, drawers, toasts' },
  { token: '--duration-slower', ms: 420, use: 'Hit point trails' },
];

const easings = ['--ease-standard', '--ease-out', '--ease-in', '--ease-settle'];

const layers = [
  ['--z-base', 0],
  ['--z-raised', 10],
  ['--z-rail', 20],
  ['--z-dock', 30],
  ['--z-topbar', 40],
  ['--z-dropdown', 1000],
  ['--z-overlay', 1100],
  ['--z-modal', 1200],
  ['--z-popover', 1300],
  ['--z-toast', 1400],
  ['--z-tooltip', 1500],
] as const;

export function TokensSection() {
  const [played, setPlayed] = useState(false);
  return (
    <>
      <Section
        id="color"
        title="Color"
        description="Components use role tokens (--color-*), never the palette directly. A theme redefines roles only, so the daylight theme and the paper scope come for free."
      >
        <Grid min={300}>
          {colorGroups.map((group) => (
            <Specimen key={group.title} title={group.title} note={group.note}>
              <div className={styles.swatches}>
                {group.swatches.map((swatch) => (
                  <SwatchChip key={swatch.token} {...swatch} />
                ))}
              </div>
            </Specimen>
          ))}
        </Grid>
        <Specimen
          title="Player colors"
          note="Twelve pigments that stay apart on the dark chrome, the blue-line map, and the torchlit map. Ink text on each passes AA."
          wide
        >
          <div className={styles.playerColors}>
            {playerColors.map((color) => (
              <div key={color.id} className={styles.playerColor}>
                <span className={styles.playerChip} style={{ background: `var(${color.cssVar})` }}>
                  {color.label.slice(0, 2)}
                </span>
                <span className={styles.swatchLabel}>{color.label}</span>
                <code className={styles.swatchToken}>{color.hex}</code>
              </div>
            ))}
          </div>
          <div className={styles.mapStrips}>
            <div className={cx(styles.mapStrip, styles.mapBlue)}>
              <Caption>On the blue-line map</Caption>
              <Row gap="sm">
                {playerColors.map((color) => (
                  <span key={color.id} className={styles.mapToken} style={{ borderColor: color.hex }} />
                ))}
              </Row>
            </div>
            <div className={cx(styles.mapStrip, styles.mapDark)}>
              <Caption>On the torchlit map</Caption>
              <Row gap="sm">
                {playerColors.map((color) => (
                  <span key={color.id} className={styles.mapToken} style={{ borderColor: color.hex }} />
                ))}
              </Row>
            </div>
          </div>
        </Specimen>
      </Section>

      <Section
        id="type"
        title="Typography"
        description="Fraunces for headings and the wordmark, Atkinson Hyperlegible Next for the interface and stat blocks, and Rokkitt for numbers you read at a glance."
      >
        <Grid min={320}>
          <Specimen
            title="Display: Fraunces"
            note="Soft and wonky axes recall the Windsor and Souvenir faces on 1980s modules."
          >
            <Stack gap="sm">
              <p className={styles.displaySample}>The Keep on the Borderlands</p>
              <p className={styles.displaySampleSm}>The Drowned Bell, level one</p>
              <Caption>
                --font-display, weight 600, SOFT 50 for headings and SOFT 100 with WONK for the wordmark
              </Caption>
            </Stack>
          </Specimen>
          <Specimen
            title="Interface: Atkinson Hyperlegible Next"
            note="Distinct letterforms keep dense stat lines readable."
          >
            <Stack gap="sm">
              <p className={styles.uiSample}>
                Wren moves 30 feet down the corridor. The door is stuck, so someone in the front rank has to
                force it.
              </p>
              <p className={styles.statLine}>
                AC 6, HD 1, hp 5, MV 120′ (40′), #AT 1, D 1d6, Save F1, ML 7, AL Chaotic
              </p>
              <p className={styles.glyphs}>Il1 O0 5S 8B rn m</p>
            </Stack>
          </Specimen>
          <Specimen
            title="Numbers: Rokkitt"
            note="A sturdy slab for dice, scores, hit points, and the clock."
          >
            <Stack gap="sm">
              <p className={styles.numberSample}>
                <span>17</span>
                <span>4</span>
                <span>20</span>
              </p>
              <p className={styles.numberSampleSm}>0123456789 +1 −2 7/12</p>
            </Stack>
          </Specimen>
        </Grid>
        <Specimen
          title="Type scale"
          note="Sizes follow the classical scale, with 13 px added for dense interface text."
          wide
        >
          <div className={styles.scale}>
            {typeScale.map((step) => (
              <div key={step.token} className={styles.scaleRow}>
                <code className={styles.scaleToken}>{step.token}</code>
                <span className={styles.scalePx}>{step.px}</span>
                <span className={styles.scaleSample} style={{ fontSize: `var(${step.token})` }}>
                  {step.px >= 21 ? 'Into the caves' : 'The party enters the caves of chaos'}
                </span>
              </div>
            ))}
          </div>
        </Specimen>
      </Section>

      <Section
        id="space"
        title="Space, radius, and depth"
        description="A 4 px grid. Radii grow with the surface: 4 px for controls, 6 px for panels, 10 px for dialogs."
      >
        <Grid min={320}>
          <Specimen title="Spacing">
            <div className={styles.spaces}>
              {spaces.map((token) => (
                <div key={token} className={styles.spaceRow}>
                  <code className={styles.scaleToken}>{token}</code>
                  <span className={styles.spaceBar} style={{ width: `var(${token})` }} />
                </div>
              ))}
            </div>
          </Specimen>
          <Specimen title="Radius">
            <Row gap="md">
              {radii.map((token) => (
                <div key={token} className={styles.radiusItem}>
                  <span className={styles.radiusBox} style={{ borderRadius: `var(${token})` }} />
                  <code className={styles.swatchToken}>{token.replace('--radius-', '')}</code>
                </div>
              ))}
            </Row>
          </Specimen>
          <Specimen title="Elevation" note="Warm, deep shadows with a faint candlelit top edge.">
            <Row gap="lg">
              {['--shadow-1', '--shadow-2', '--shadow-3'].map((token) => (
                <div
                  key={token}
                  className={styles.elevation}
                  style={{ boxShadow: `var(--edge-highlight), var(${token})` }}
                >
                  <code className={styles.swatchToken}>{token.replace('--', '')}</code>
                </div>
              ))}
              <div className={cx(styles.elevation, styles.elevationPaper)}>
                <code className={styles.swatchToken}>shadow-paper</code>
              </div>
            </Row>
          </Specimen>
        </Grid>
      </Section>

      <Section
        id="motion"
        title="Motion, layers, and focus"
        description="Motion answers an action. With reduced motion, durations drop to 1 ms and the dice land at once."
      >
        <Grid min={320}>
          <Specimen title="Durations">
            <table className={styles.tokenTable}>
              <tbody>
                {motion.map((m) => (
                  <tr key={m.token}>
                    <td>
                      <code className={styles.scaleToken}>{m.token}</code>
                    </td>
                    <td className={styles.num}>{m.ms} ms</td>
                    <td className={styles.muted}>{m.use}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Specimen>
          <Specimen title="Easing">
            <Stack gap="sm">
              {easings.map((token) => (
                <div key={token} className={styles.easeRow}>
                  <code className={styles.scaleToken}>{token}</code>
                  <span className={styles.easeTrack}>
                    <span
                      className={cx(styles.easeDot, played && styles.easeDotEnd)}
                      style={{ transitionTimingFunction: `var(${token})` }}
                    />
                  </span>
                </div>
              ))}
              <Row>
                <Button size="sm" icon="play" onClick={() => setPlayed(!played)}>
                  {played ? 'Play back' : 'Play'}
                </Button>
              </Row>
            </Stack>
          </Specimen>
          <Specimen title="Layers and focus">
            <Stack gap="md">
              <div className={styles.layers}>
                {layers.map(([token, value]) => (
                  <span key={token} className={styles.layer}>
                    <code className={styles.swatchToken}>{token.replace('--z-', '')}</code>
                    <span className={styles.num}>{value}</span>
                  </span>
                ))}
              </div>
              <Row>
                <span className={styles.focusDemo}>--focus-ring</span>
                <Caption>A candle-yellow double ring that reads on chrome, paper, and the map.</Caption>
              </Row>
            </Stack>
          </Specimen>
        </Grid>
      </Section>
    </>
  );
}
