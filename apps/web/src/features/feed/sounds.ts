/**
 * Quiet sounds for the feed, synthesized with the Web Audio API: a short clatter for a dice roll and a soft
 * two-note chime for a whisper to you. They play only when the `sound` preference is on.
 */
import type { FeedEntry } from '@bxvtt/shared/protocol';
import { useEffect, useRef } from 'react';
import { usePreferences } from '@/app';

export type FeedSound = 'roll' | 'whisper';

/**
 * The sound for a batch of new entries, or `null`. A whisper to the reader wins over a roll, and the reader's
 * own whispers make no sound.
 */
export function soundFor(entries: readonly FeedEntry[], selfId: string | null): FeedSound | null {
  if (entries.some((entry) => entry.visibility === 'users' && entry.user_id !== selfId)) return 'whisper';
  if (entries.some((entry) => entry.kind === 'roll')) return 'roll';
  return null;
}

let context: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === 'undefined' || typeof window.AudioContext !== 'function') return null;
  context ??= new window.AudioContext();
  if (context.state === 'suspended') void context.resume().catch(() => {});
  return context;
}

/** A few short bursts of filtered noise, like dice on a wooden table. */
function playRoll(ctx: AudioContext): void {
  const length = Math.floor(ctx.sampleRate * 0.03);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  const hits = [0, 0.07, 0.15, 0.26, 0.4];
  hits.forEach((offset, index) => {
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1800 + index * 260;
    filter.Q.value = 3;
    const gain = ctx.createGain();
    gain.gain.value = 0.12 * (1 - index * 0.16);
    source.connect(filter).connect(gain).connect(ctx.destination);
    source.start(ctx.currentTime + offset);
  });
}

/** Two soft sine notes, rising. */
function playWhisper(ctx: AudioContext): void {
  [660, 880].forEach((frequency, index) => {
    const start = ctx.currentTime + index * 0.12;
    const oscillator = ctx.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.05, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.4);
  });
}

/** Plays a sound for entries that arrive after the feed opened, when the reader has sound turned on. */
export function useFeedSounds(feed: readonly FeedEntry[], selfId: string | null): void {
  const enabled = usePreferences((s) => s.sound);
  const last = useRef(feed.at(-1)?.seq ?? 0);
  useEffect(() => {
    const fresh = feed.filter((entry) => entry.seq > last.current);
    last.current = Math.max(last.current, feed.at(-1)?.seq ?? 0);
    if (!enabled || fresh.length === 0) return;
    const sound = soundFor(fresh, selfId);
    if (sound === null) return;
    const ctx = audio();
    if (ctx === null) return;
    if (sound === 'roll') playRoll(ctx);
    else playWhisper(ctx);
  }, [feed, enabled, selfId]);
}
