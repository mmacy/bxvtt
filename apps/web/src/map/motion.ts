/**
 * Animates the party token between the positions the views report. Each new position joins a
 * queue, so a fast series of steps still plays in order. When the queue backs up, each step plays
 * faster, so the token never lags far behind the game.
 */
import { FACING_ANGLE, type Direction } from './geometry';

export interface PartyTarget {
  x: number;
  y: number;
  facing: Direction;
}

export interface PartyPose {
  /** The token's centre in world coordinates. */
  x: number;
  y: number;
  /** The facing angle in radians, clockwise from east. */
  angle: number;
  /** Opacity, from 0 to 1. A jump to a far cell fades out and back in. */
  alpha: number;
  /** Whether the token is between cells. */
  moving: boolean;
}

export interface PartyMotionOptions {
  /** How long one step takes, in milliseconds. */
  stepMs?: number;
  /** How long a turn in place takes. */
  turnMs?: number;
  /** How long a jump (stairs, a referee placing the party, a level change) takes. */
  jumpMs?: number;
  /** The most a backed-up queue speeds a step up. */
  maxSpeedup?: number;
}

type SegmentKind = 'step' | 'turn' | 'jump';

interface Segment {
  kind: SegmentKind;
  from: PartyPose;
  to: PartyTarget;
  start: number;
  duration: number;
}

interface Queued {
  target: PartyTarget;
  at: number;
}

export class PartyMotion {
  private readonly stepMs: number;
  private readonly turnMs: number;
  private readonly jumpMs: number;
  private readonly maxSpeedup: number;
  private queue: Queued[] = [];
  private segment: Segment | null = null;
  private rest: PartyPose | null = null;
  private last: PartyTarget | null = null;
  private lastEnd = -Infinity;

  constructor(options: PartyMotionOptions = {}) {
    this.stepMs = options.stepMs ?? 190;
    this.turnMs = options.turnMs ?? 130;
    this.jumpMs = options.jumpMs ?? 320;
    this.maxSpeedup = options.maxSpeedup ?? 4;
  }

  /** Places the token with no animation and clears the queue. */
  reset(target: PartyTarget | null): void {
    this.queue = [];
    this.segment = null;
    this.last = target;
    this.rest = target ? restPose(target) : null;
    this.lastEnd = -Infinity;
  }

  /** Queues a new position. A position equal to the last one queued is ignored. */
  push(target: PartyTarget | null, now: number): void {
    if (!target) {
      this.reset(null);
      return;
    }
    if (!this.last) {
      this.reset(target);
      return;
    }
    if (sameTarget(this.last, target)) return;
    this.last = target;
    this.queue.push({ target, at: now });
  }

  /** How many positions are waiting to play, counting the one playing now. */
  get pending(): number {
    return this.queue.length + (this.segment ? 1 : 0);
  }

  /** The final position queued, which the camera follows. */
  get destination(): PartyTarget | null {
    return this.last;
  }

  /** Whether the token is still moving at `now`. */
  isAnimating(now: number): boolean {
    this.advance(now);
    return this.segment !== null || this.queue.length > 0;
  }

  /** The token's pose at `now`, or `null` when the party isn't on the level. */
  sample(now: number): PartyPose | null {
    this.advance(now);
    const segment = this.segment;
    if (!segment) return this.rest;
    const t = Math.min(1, Math.max(0, (now - segment.start) / segment.duration));
    return interpolate(segment, t);
  }

  private advance(now: number): void {
    for (;;) {
      if (this.segment) {
        if (now < this.segment.start + this.segment.duration) return;
        this.rest = restPose(this.segment.to);
        this.lastEnd = this.segment.start + this.segment.duration;
        this.segment = null;
      }
      const next = this.queue.shift();
      if (!next || !this.rest) return;
      const kind = classify(this.rest, next.target);
      const backlog = this.queue.length + 1;
      const speedup = Math.min(this.maxSpeedup, Math.max(1, backlog));
      const base = kind === 'step' ? this.stepMs : kind === 'turn' ? this.turnMs : this.jumpMs;
      const start = Math.max(this.lastEnd, next.at);
      this.segment = { kind, from: this.rest, to: next.target, start, duration: base / speedup };
      if (now < start) return;
    }
  }
}

function sameTarget(a: PartyTarget, b: PartyTarget): boolean {
  return a.x === b.x && a.y === b.y && a.facing === b.facing;
}

function restPose(target: PartyTarget): PartyPose {
  return {
    x: target.x + 0.5,
    y: target.y + 0.5,
    angle: FACING_ANGLE[target.facing],
    alpha: 1,
    moving: false,
  };
}

function classify(from: PartyPose, to: PartyTarget): SegmentKind {
  const dx = Math.abs(to.x + 0.5 - from.x);
  const dy = Math.abs(to.y + 0.5 - from.y);
  if (dx < 1e-6 && dy < 1e-6) return 'turn';
  if (dx + dy <= 1 + 1e-6) return 'step';
  return 'jump';
}

/** The signed shortest rotation from `a` to `b`, in radians. */
export function angleDelta(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function interpolate(segment: Segment, t: number): PartyPose {
  const to = restPose(segment.to);
  const from = segment.from;
  if (segment.kind === 'jump') {
    // Fade out where the party was, then fade in where it lands.
    if (t < 0.5) return { ...from, alpha: 1 - t * 2, moving: true };
    return { ...to, alpha: (t - 0.5) * 2, moving: true };
  }
  const e = easeInOut(t);
  // Turn quickly at the start of a step, so the token faces where it walks.
  const turnT = segment.kind === 'turn' ? e : Math.min(1, t * 2.5);
  return {
    x: from.x + (to.x - from.x) * e,
    y: from.y + (to.y - from.y) * e,
    angle: from.angle + angleDelta(from.angle, to.angle) * easeInOut(turnT),
    alpha: 1,
    moving: true,
  };
}
