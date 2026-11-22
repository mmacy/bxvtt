/**
 * Turns raw pointer samples into gestures: taps, drags, pinches, and long presses. It holds no
 * DOM references and takes the time with each sample, so tests can drive it directly.
 */
import { VelocityTracker, type Velocity } from './camera';

export interface PointerSample {
  id: number;
  x: number;
  y: number;
  /** Milliseconds, from any monotonic clock. */
  t: number;
  button: number;
  pointerType: string;
  altKey: boolean;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}

export type Gesture =
  | { type: 'tap'; x: number; y: number; pointer: PointerSample }
  | { type: 'drag-start'; x: number; y: number; pointer: PointerSample }
  | { type: 'drag'; x: number; y: number; dx: number; dy: number }
  | { type: 'drag-end'; x: number; y: number; velocity: Velocity }
  | { type: 'pinch-start'; x: number; y: number }
  | { type: 'pinch'; x: number; y: number; scale: number; dx: number; dy: number }
  | { type: 'pinch-end' }
  | { type: 'long-press'; x: number; y: number; pointer: PointerSample }
  | { type: 'cancel' };

export interface GestureOptions {
  /** How far a pointer moves before a press becomes a drag, in CSS pixels. */
  mouseSlop?: number;
  touchSlop?: number;
  /** How long a still press lasts before it counts as a long press, in milliseconds. */
  longPressMs?: number;
}

type State = 'idle' | 'pressed' | 'dragging' | 'pinching' | 'held' | 'settling';

interface Tracked {
  start: PointerSample;
  last: PointerSample;
}

export class GestureRecognizer {
  private readonly mouseSlop: number;
  private readonly touchSlop: number;
  private readonly longPressMs: number;
  private readonly pointers = new Map<number, Tracked>();
  private state: State = 'idle';
  private primary: number | null = null;
  private longPressAllowed = true;
  private pinchDistance = 0;
  private pinchCenter = { x: 0, y: 0 };
  private readonly velocity = new VelocityTracker();

  constructor(options: GestureOptions = {}) {
    this.mouseSlop = options.mouseSlop ?? 4;
    this.touchSlop = options.touchSlop ?? 9;
    this.longPressMs = options.longPressMs ?? 520;
  }

  /** Whether a press, drag, or pinch is under way. */
  get active(): boolean {
    return this.state !== 'idle';
  }

  get dragging(): boolean {
    return this.state === 'dragging';
  }

  /** When a long press will fire for the current press, or `null` when none can. */
  get longPressDue(): number | null {
    if (this.state !== 'pressed' || !this.longPressAllowed || this.primary === null) return null;
    const tracked = this.pointers.get(this.primary);
    return tracked ? tracked.start.t + this.longPressMs : null;
  }

  /** A pointer went down. `longPress` says whether holding it still may fire a long press. */
  down(sample: PointerSample, longPress = true): Gesture[] {
    this.pointers.set(sample.id, { start: sample, last: sample });
    if (this.pointers.size === 1) {
      this.state = 'pressed';
      this.primary = sample.id;
      this.longPressAllowed = longPress;
      this.velocity.reset();
      this.velocity.add(sample.x, sample.y, sample.t);
      return [];
    }
    if (this.pointers.size === 2) {
      const out: Gesture[] = [];
      if (this.state === 'dragging') out.push({ type: 'cancel' });
      this.state = 'pinching';
      const [a, b] = [...this.pointers.values()].map((p) => p.last);
      if (a && b) {
        this.pinchDistance = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
        this.pinchCenter = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        out.push({ type: 'pinch-start', x: this.pinchCenter.x, y: this.pinchCenter.y });
      }
      return out;
    }
    return [];
  }

  move(sample: PointerSample): Gesture[] {
    const tracked = this.pointers.get(sample.id);
    if (!tracked) return [];
    const prev = tracked.last;
    tracked.last = sample;
    switch (this.state) {
      case 'pressed': {
        if (sample.id !== this.primary) return [];
        const slop = sample.pointerType === 'touch' ? this.touchSlop : this.mouseSlop;
        const moved = Math.hypot(sample.x - tracked.start.x, sample.y - tracked.start.y);
        this.velocity.add(sample.x, sample.y, sample.t);
        if (moved < slop) return [];
        this.state = 'dragging';
        return [
          { type: 'drag-start', x: tracked.start.x, y: tracked.start.y, pointer: tracked.start },
          {
            type: 'drag',
            x: sample.x,
            y: sample.y,
            dx: sample.x - tracked.start.x,
            dy: sample.y - tracked.start.y,
          },
        ];
      }
      case 'dragging':
        if (sample.id !== this.primary) return [];
        this.velocity.add(sample.x, sample.y, sample.t);
        return [{ type: 'drag', x: sample.x, y: sample.y, dx: sample.x - prev.x, dy: sample.y - prev.y }];
      case 'pinching': {
        const [a, b] = [...this.pointers.values()].map((p) => p.last);
        if (!a || !b) return [];
        const distance = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
        const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const gesture: Gesture = {
          type: 'pinch',
          x: center.x,
          y: center.y,
          scale: distance / this.pinchDistance,
          dx: center.x - this.pinchCenter.x,
          dy: center.y - this.pinchCenter.y,
        };
        this.pinchDistance = distance;
        this.pinchCenter = center;
        return [gesture];
      }
      default:
        return [];
    }
  }

  up(sample: PointerSample): Gesture[] {
    const tracked = this.pointers.get(sample.id);
    if (!tracked) return [];
    tracked.last = sample;
    this.pointers.delete(sample.id);
    const out: Gesture[] = [];
    switch (this.state) {
      case 'pressed':
        if (sample.id === this.primary)
          out.push({ type: 'tap', x: sample.x, y: sample.y, pointer: tracked.start });
        break;
      case 'dragging':
        if (sample.id === this.primary) {
          this.velocity.add(sample.x, sample.y, sample.t);
          out.push({
            type: 'drag-end',
            x: sample.x,
            y: sample.y,
            velocity: this.velocity.velocity(sample.t),
          });
        }
        break;
      case 'pinching':
        out.push({ type: 'pinch-end' });
        // Wait for the other finger to lift, so it doesn't start a pan with a jump.
        this.state = 'settling';
        break;
      default:
        break;
    }
    if (this.pointers.size === 0) {
      this.state = 'idle';
      this.primary = null;
    } else if (this.state !== 'settling' && sample.id === this.primary) {
      this.state = 'settling';
    }
    return out;
  }

  /** The pointer was cancelled by the browser, or capture was lost. */
  cancel(id: number): Gesture[] {
    if (!this.pointers.has(id)) return [];
    this.pointers.delete(id);
    const out: Gesture[] = [];
    if (this.state === 'dragging') out.push({ type: 'cancel' });
    if (this.state === 'pinching') out.push({ type: 'pinch-end' });
    this.state = this.pointers.size === 0 ? 'idle' : 'settling';
    if (this.state === 'idle') this.primary = null;
    return out;
  }

  /** Fires a long press when a press has been still long enough. Call it from a timer. */
  tick(now: number): Gesture[] {
    const due = this.longPressDue;
    if (due === null || now < due || this.primary === null) return [];
    const tracked = this.pointers.get(this.primary);
    if (!tracked) return [];
    this.state = 'held';
    return [{ type: 'long-press', x: tracked.last.x, y: tracked.last.y, pointer: tracked.start }];
  }

  reset(): void {
    this.pointers.clear();
    this.state = 'idle';
    this.primary = null;
  }
}

/** Converts a wheel event's delta to a zoom factor. Pinch gestures on a trackpad set `ctrlKey`. */
export function wheelZoomFactor(deltaY: number, deltaMode: number, ctrlKey: boolean): number {
  const pixels = deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * 400 : deltaY;
  const k = ctrlKey ? 0.012 : 0.0022;
  const clamped = Math.max(-240, Math.min(240, pixels));
  return Math.exp(-clamped * k);
}
