import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Vitest doesn't load CSS, so the test reads the file itself, from the repository root or the web workspace.
const tokensPath = ['apps/web/src/ui/tokens.css', 'src/ui/tokens.css']
  .map((path) => resolve(process.cwd(), path))
  .find((path) => existsSync(path));
if (!tokensPath) throw new Error('tokens.css not found from the working directory');
const tokensCss = readFileSync(tokensPath, 'utf8');

/** The declarations of the first rule whose selector starts with `selector`. */
function declarations(selector: string): Map<string, string> {
  const start = tokensCss.indexOf(selector);
  if (start < 0) throw new Error(`tokens.css has no rule for ${selector}`);
  const open = tokensCss.indexOf('{', start);
  const close = tokensCss.indexOf('}', open);
  const body = tokensCss.slice(open + 1, close).replace(/\/\*[\s\S]*?\*\//g, '');
  const map = new Map<string, string>();
  for (const match of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    const [, name, value] = match;
    if (name && value) map.set(name, value.trim());
  }
  return map;
}

const palette = declarations(':root {');
const scopes = {
  candlelight: declarations(":root,\n[data-theme='candlelight']"),
  daylight: declarations("[data-theme='daylight']"),
  paper: declarations("[data-surface='paper']"),
} as const;

type Rgb = [number, number, number];

/** Resolves a token in a scope to a hex color, following `var()` into the scope, then the palette. */
function color(scope: Map<string, string>, name: string): Rgb {
  let value = scope.get(name) ?? scopes.candlelight.get(name) ?? palette.get(name);
  for (let depth = 0; value?.startsWith('var(') && depth < 5; depth += 1) {
    const ref = /var\((--[\w-]+)/.exec(value)?.[1] ?? '';
    value = scope.get(ref) ?? palette.get(ref);
  }
  const hex = /^#([0-9a-f]{6})$/i.exec(value ?? '')?.[1];
  if (!hex) throw new Error(`${name} doesn't resolve to a hex color (got ${String(value)})`);
  return [0, 2, 4].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)) as Rgb;
}

function luminance([r, g, b]: Rgb): number {
  const channel = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** A color drawn at `opacity` over `under`. */
function over(color: Rgb, under: Rgb, opacity: number): Rgb {
  return color.map((c, i) => c * opacity + (under[i] ?? 0) * (1 - opacity)) as Rgb;
}

const chipTones = ['harm', 'boon', 'magic', 'neutral'] as const;

describe('token contrast', () => {
  for (const [scopeName, scope] of Object.entries(scopes)) {
    describe(scopeName, () => {
      it.each(chipTones)('the %s condition chip reads at 4.5:1, even in a row dimmed to 70%%', (tone) => {
        const text = color(scope, `--color-chip-${tone}-text`);
        const bg = color(scope, `--color-chip-${tone}-bg`);
        const surface = color(scope, '--color-surface-1');
        expect(contrast(text, bg)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(over(text, surface, 0.7), over(bg, surface, 0.7))).toBeGreaterThanOrEqual(4.5);
      });

      it.each(['--color-text', '--color-text-muted', '--color-text-subtle'])(
        '%s reads at 4.5:1 on surface 1',
        (role) => {
          expect(contrast(color(scope, role), color(scope, '--color-surface-1'))).toBeGreaterThanOrEqual(4.5);
        },
      );
    });
  }
});
