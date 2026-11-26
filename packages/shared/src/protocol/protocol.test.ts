import { describe, expect, it } from 'vitest';
import openapi from '../bxapi/openapi.json' with { type: 'json' };
import {
  completeRuleset,
  osrlibDefaultRuleset,
  RulesetPatch,
  SpellId,
  ClientMessage,
  CreateUserRequest,
  DeclarationBody,
  parseRollCommand,
  PostFeedRequest,
  USER_COLORS,
} from './index';

describe('parseRollCommand', () => {
  it('reads /roll and /r with a comment', () => {
    expect(parseRollCommand('/roll 2d6+1 for damage')).toEqual({
      expression: '2d6+1',
      comment: 'for damage',
      secret: false,
    });
    expect(parseRollCommand('/r 1d20')).toEqual({ expression: '1d20', comment: '', secret: false });
  });

  it('reads a secret roll', () => {
    expect(parseRollCommand('/roll secret 1d100 wandering')).toEqual({
      expression: '1d100',
      comment: 'wandering',
      secret: true,
    });
  });

  it('treats anything else as chat', () => {
    expect(parseRollCommand('rolling along')).toBeNull();
    expect(parseRollCommand('/roll')).toBeNull();
    expect(parseRollCommand('/rolls 1d6')).toBeNull();
  });
});

describe('request schemas', () => {
  it('trims display names and refuses control characters', () => {
    expect(CreateUserRequest.parse({ name: '  Wren ' }).name).toBe('Wren');
    expect(CreateUserRequest.safeParse({ name: 'W\u001bren' }).success).toBe(false);
    expect(CreateUserRequest.safeParse({ name: 'x'.repeat(41) }).success).toBe(false);
  });

  it('refuses unknown fields in bxvtt bodies', () => {
    expect(PostFeedRequest.safeParse({ text: 'hi', extra: 1 }).success).toBe(false);
  });

  it('parses each client message and refuses an unknown one', () => {
    expect(ClientMessage.parse({ type: 'heartbeat' })).toEqual({ type: 'heartbeat' });
    expect(
      ClientMessage.safeParse({ type: 'ping', dungeon_id: 'barrow', level_number: 1, x: 1.5, y: 0 }).success,
    ).toBe(true);
    expect(
      ClientMessage.safeParse({ type: 'ping', dungeon_id: 'barrow', level_number: 1, x: 1e9, y: 0 }).success,
    ).toBe(false);
    expect(ClientMessage.safeParse({ type: 'shout' }).success).toBe(false);
  });

  it("accepts every action of bxapi's battle declaration, including a thief's hide", () => {
    for (const action of ['attack', 'cast', 'turn_undead', 'move', 'use_item', 'give_item', 'hide', 'hold']) {
      expect(DeclarationBody.safeParse({ action }).success).toBe(true);
    }
    expect(DeclarationBody.safeParse({ action: 'dance' }).success).toBe(false);
  });

  it('keeps only the fields of a declaration that bxapi defines', () => {
    const parsed = DeclarationBody.parse({
      action: 'attack',
      target_group_id: 'group-0001',
      note: 'a secret',
    });
    expect(parsed).toEqual({ action: 'attack', target_group_id: 'group-0001' });
  });

  it('accepts a spell ID of letters, digits, and punctuation, but not a dot segment', () => {
    for (const id of ['magic_missile', 'ember_dart', 'light-c', 'v1.2', '...']) {
      expect(SpellId.safeParse(id).success, id).toBe(true);
    }
    for (const id of ['.', '..', '', 'ember dart', 'a/b', 'x'.repeat(101)]) {
      expect(SpellId.safeParse(id).success, id).toBe(false);
    }
  });
});

/** The relative luminance of a `#rrggbb` color, as WCAG defines it. */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255);
  const [r = 0, g = 0, b = 0] = channels.map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The WCAG contrast ratio of two colors. */
function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
}

/** A color in CIE Lab, for telling colors apart. */
function lab(hex: string): [number, number, number] {
  const linear = [1, 3, 5].map((start) => {
    const c = parseInt(hex.slice(start, start + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const [r = 0, g = 0, b = 0] = linear;
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

describe('user colors (R-002)', () => {
  it('reads as text on every chrome surface, and under dark ink as an avatar', () => {
    for (const color of USER_COLORS) {
      for (const surface of ['#16120f', '#1c1814', '#231e19', '#2b2520']) {
        expect(contrast(color, surface), `${color} on ${surface}`).toBeGreaterThanOrEqual(4.5);
      }
      expect(contrast('#16120f', color), `ink on ${color}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps twelve colors that are easy to tell apart', () => {
    expect(new Set(USER_COLORS).size).toBe(12);
    for (const [i, a] of USER_COLORS.entries()) {
      for (const b of USER_COLORS.slice(i + 1)) {
        const [l1, a1, b1] = lab(a);
        const [l2, a2, b2] = lab(b);
        expect(Math.hypot(l1 - l2, a1 - a2, b1 - b2), `${a} and ${b}`).toBeGreaterThan(15);
      }
    }
  });
});

describe('the ruleset check', () => {
  const properties = openapi.components.schemas.Ruleset.properties;

  it("knows every field of bxapi's Ruleset schema, with its default", () => {
    const defaults = osrlibDefaultRuleset();
    expect(Object.keys(defaults)).toEqual(Object.keys(properties));
    for (const [name, property] of Object.entries(properties)) {
      expect(defaults[name as keyof typeof defaults], name).toEqual(
        (property as { default: unknown }).default,
      );
    }
  });

  it('accepts known rules with allowed values, and refuses anything else by its field', () => {
    expect(RulesetPatch.parse({ encumbrance: 'detailed', thac0_arithmetic: true })).toEqual({
      encumbrance: 'detailed',
      thac0_arithmetic: true,
    });
    for (const [value, field] of [
      [{ critical_hits: true }, 'critical_hits'],
      [{ encumbrance: 'heavy' }, 'encumbrance'],
      [{ ability_score_method: '5d6' }, 'ability_score_method'],
      [{ weapon_reload: 1 }, 'weapon_reload'],
    ] as const) {
      const result = RulesetPatch.safeParse(value);
      expect(result.success, field).toBe(false);
      expect(result.error?.issues.map((issue) => issue.path)).toEqual([[field]]);
    }
    expect(RulesetPatch.safeParse([]).success).toBe(false);
  });

  it('fills a stored ruleset with defaults, and drops a rule or value bxapi no longer has', () => {
    expect(completeRuleset({ encumbrance: 'none', retired_rule: true, weapon_reload: 'sometimes' })).toEqual({
      ...osrlibDefaultRuleset(),
      encumbrance: 'none',
    });
    expect(completeRuleset(null)).toEqual(osrlibDefaultRuleset());
  });
});
