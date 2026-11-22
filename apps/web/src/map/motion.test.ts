import { describe, expect, it } from 'vitest';
import { PartyMotion, angleDelta } from './motion';

const at = (x: number, y: number, facing: 'north' | 'east' | 'south' | 'west' = 'east') => ({ x, y, facing });

describe('PartyMotion', () => {
  it('rests at the first position with no animation', () => {
    const m = new PartyMotion({ stepMs: 100 });
    m.push(at(2, 3), 0);
    expect(m.sample(0)).toMatchObject({ x: 2.5, y: 3.5, alpha: 1, moving: false });
    expect(m.isAnimating(0)).toBe(false);
  });

  it('animates a step and ends on the new cell', () => {
    const m = new PartyMotion({ stepMs: 100 });
    m.reset(at(0, 0));
    m.push(at(1, 0), 1000);
    expect(m.sample(1000)?.x).toBeCloseTo(0.5);
    const mid = m.sample(1050);
    expect(mid?.x).toBeGreaterThan(0.5);
    expect(mid?.x).toBeLessThan(1.5);
    expect(mid?.moving).toBe(true);
    expect(m.sample(1100)).toMatchObject({ x: 1.5, y: 0.5, moving: false });
  });

  it('plays a fast series of steps in order and faster when it backs up', () => {
    const m = new PartyMotion({ stepMs: 100, maxSpeedup: 4 });
    m.reset(at(0, 0));
    m.push(at(1, 0), 0);
    m.push(at(2, 0), 5);
    m.push(at(3, 0), 10);
    m.push(at(4, 0), 15);
    expect(m.pending).toBe(4);
    // The first step plays at four times speed because three more wait behind it.
    expect(m.sample(25)?.x).toBeCloseTo(1.5);
    const xs: number[] = [];
    for (let t = 25; t <= 400; t += 5) xs.push(m.sample(t)?.x ?? NaN);
    for (let i = 1; i < xs.length; i++) expect(xs[i] ?? 0).toBeGreaterThanOrEqual((xs[i - 1] ?? 0) - 1e-9);
    expect(m.sample(400)).toMatchObject({ x: 4.5, moving: false });
    expect(m.isAnimating(400)).toBe(false);
  });

  it('ignores a repeated position and turns in place', () => {
    const m = new PartyMotion({ turnMs: 100 });
    m.reset(at(0, 0, 'east'));
    m.push(at(0, 0, 'east'), 0);
    expect(m.pending).toBe(0);
    m.push(at(0, 0, 'south'), 0);
    const mid = m.sample(50);
    expect(mid?.x).toBeCloseTo(0.5);
    expect(mid?.angle).toBeGreaterThan(0);
    expect(mid?.angle).toBeLessThan(Math.PI / 2);
    expect(m.sample(100)?.angle).toBeCloseTo(Math.PI / 2);
  });

  it('fades out and in for a jump instead of sliding across the map', () => {
    const m = new PartyMotion({ jumpMs: 200 });
    m.reset(at(0, 0));
    m.push(at(10, 10), 0);
    expect(m.sample(50)).toMatchObject({ x: 0.5, y: 0.5 });
    expect(m.sample(50)?.alpha).toBeCloseTo(0.5);
    expect(m.sample(150)).toMatchObject({ x: 10.5, y: 10.5 });
    expect(m.sample(150)?.alpha).toBeCloseTo(0.5);
  });

  it('hides the token when the party leaves the level', () => {
    const m = new PartyMotion();
    m.reset(at(0, 0));
    m.push(null, 0);
    expect(m.sample(0)).toBeNull();
  });
});

describe('angleDelta', () => {
  it('takes the short way round', () => {
    expect(angleDelta(-Math.PI / 2, Math.PI)).toBeCloseTo(-Math.PI / 2);
    expect(angleDelta(Math.PI, -Math.PI / 2)).toBeCloseTo(Math.PI / 2);
  });
});
