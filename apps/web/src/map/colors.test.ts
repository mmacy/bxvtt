import { USER_COLORS } from '@bxvtt/shared/protocol';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from './render/util';
import { THEMES, casingColor } from './themes';

/**
 * A user's color reads on a background when the color itself stands out (3:1), or when the theme's casing
 * outlines it: the casing stands out from the background (3:1) and the color stands out from the casing (2:1).
 */
function reads(color: string, background: string, casing: string): boolean {
  if (contrastRatio(color, background) >= 3) return true;
  return contrastRatio(casing, background) >= 3 && contrastRatio(color, casing) >= 2;
}

describe('user colors on the map', () => {
  for (const theme of Object.values(THEMES)) {
    it(`every user color reads on the ${theme.name} floor and rock`, () => {
      const casing = casingColor(theme);
      const failures: string[] = [];
      for (const color of USER_COLORS) {
        for (const [where, background] of [
          ['floor', theme.floor.color],
          ['rock', theme.rock.color],
        ] as const) {
          if (!reads(color, background, casing)) failures.push(`${color} on ${where} ${background}`);
        }
      }
      expect(failures).toEqual([]);
    });
  }

  it('flags the colors that need the casing on blueprint rock', () => {
    // Cerulean and azurite alone don't stand out from blueprint's blue, which is why the casing exists.
    expect(contrastRatio('#3fa7d6', THEMES.blueprint.rock.color)).toBeLessThan(3);
    expect(contrastRatio('#5c8de5', THEMES.blueprint.rock.color)).toBeLessThan(3);
  });
});
