import { isIP } from 'node:net';
import type { IncomingHttpHeaders } from 'node:http';
import type { RateLimit } from './config';

/**
 * Serializes async work by key, so the commands for one table run one at a time in arrival order.
 */
export class KeyedMutex {
  private readonly tails = new Map<string, Promise<unknown>>();

  /**
   * Runs a function after every earlier function for the same key has finished.
   *
   * @param key - The key, such as a table ID.
   * @param fn - The work.
   * @returns What the function returns.
   */
  run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    const result = previous.then(fn, fn);
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    this.tails.set(key, tail);
    void tail.then(() => {
      if (this.tails.get(key) === tail) this.tails.delete(key);
    });
    return result;
  }
}

/**
 * Token buckets by key, for per-address rate limits. Each bucket holds `capacity` requests and refills at
 * `capacity` per `windowMs`.
 */
export class RateLimiter {
  private readonly buckets = new Map<string, { tokens: number; at: number }>();

  /**
   * @param limit - The capacity and window.
   */
  constructor(private readonly limit: RateLimit) {}

  /**
   * Takes one request from a key's bucket.
   *
   * @param key - The key, such as a network address.
   * @returns 0 when the request may proceed, or the whole seconds until the bucket has a request.
   */
  take(key: string): number {
    const bucket = this.refill(key);
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return 0;
    }
    return this.secondsUntilToken(bucket);
  }

  /**
   * Reports whether a key's bucket is empty, without taking a request.
   *
   * @param key - The key.
   * @returns 0 when the bucket has a request, or the whole seconds until it has one.
   */
  peek(key: string): number {
    const bucket = this.refill(key);
    return bucket.tokens >= 1 ? 0 : this.secondsUntilToken(bucket);
  }

  private refill(key: string): { tokens: number; at: number } {
    const nowMs = Date.now();
    const rate = this.limit.capacity / this.limit.windowMs;
    let bucket = this.buckets.get(key);
    if (bucket === undefined) {
      bucket = { tokens: this.limit.capacity, at: nowMs };
      this.buckets.set(key, bucket);
      if (this.buckets.size > 50_000) this.prune(nowMs);
    } else {
      bucket.tokens = Math.min(this.limit.capacity, bucket.tokens + (nowMs - bucket.at) * rate);
      bucket.at = nowMs;
    }
    return bucket;
  }

  private secondsUntilToken(bucket: { tokens: number }): number {
    const rate = this.limit.capacity / this.limit.windowMs;
    return Math.max(1, Math.ceil((1 - bucket.tokens) / rate / 1000));
  }

  private prune(nowMs: number): void {
    for (const [key, bucket] of this.buckets) {
      if (nowMs - bucket.at > this.limit.windowMs) this.buckets.delete(key);
    }
  }
}

/**
 * The path a request addresses, as the router sees it: the matched route's pattern, such as
 * `/api/tables/:tableId`, or the percent-decoded path when no route matched. Checks that depend on the path use
 * this, so `/%61pi/users/me` counts as an API path, as it does for the router.
 *
 * @param request - The request's URL and the matched route's pattern.
 */
export function requestPath(request: { url: string; routeOptions: { url?: string } }): string {
  const route = request.routeOptions.url;
  if (route !== undefined && route !== '') return route;
  const raw = request.url.split('?')[0] ?? '';
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/**
 * Whether a request came through a proxy on this machine that received it over HTTPS, such as `cloudflared`.
 *
 * @param peer - The socket's remote address.
 * @param headers - The request headers.
 */
export function viaHttpsProxy(peer: string | undefined, headers: IncomingHttpHeaders): boolean {
  if (peer === undefined || !isLoopback(peer)) return false;
  const proto = headers['x-forwarded-proto'];
  const value = Array.isArray(proto) ? proto[0] : proto;
  if (value?.split(',')[0]?.trim().toLowerCase() === 'https') return true;
  const visitor = headers['cf-visitor'];
  return typeof visitor === 'string' && visitor.includes('"https"');
}

/** Whether an address is a loopback address. */
function isLoopback(address: string): boolean {
  return address === '::1' || address.startsWith('127.') || address.startsWith('::ffff:127.');
}

/**
 * Finds the address of the person behind a request. When the direct peer is a loopback address, such as
 * `cloudflared` or the Vite proxy on the same machine, the server trusts `CF-Connecting-IP`, and then the last
 * entry of `X-Forwarded-For`. It ignores both headers from any other peer, so a client can't choose its own
 * address.
 *
 * @param peer - The socket's remote address.
 * @param headers - The request headers.
 * @returns The client's address.
 */
export function clientAddress(peer: string | undefined, headers: IncomingHttpHeaders): string {
  const direct = peer ?? 'unknown';
  if (!isLoopback(direct)) return direct;
  const cf = headers['cf-connecting-ip'];
  if (typeof cf === 'string' && isIP(cf.trim()) !== 0) return cf.trim();
  const forwarded = headers['x-forwarded-for'];
  const value = Array.isArray(forwarded) ? forwarded.join(',') : forwarded;
  if (typeof value === 'string') {
    const last = value.split(',').at(-1)?.trim();
    if (last !== undefined && isIP(last) !== 0) return last;
  }
  return direct;
}

/**
 * The key a per-address rate limit counts an address under. An IPv4 address counts by itself. An IPv6 address
 * counts by its /64 prefix, because one home or cloud host usually gets a whole /64 and could otherwise rotate
 * through its addresses to escape a limit.
 *
 * @param address - The client's address, from {@link clientAddress}.
 * @returns The key, such as `203.0.113.7` or `2001:db8:0:1::/64`.
 */
export function addressKey(address: string): string {
  const plain = (address.split('%')[0] ?? address).toLowerCase();
  if (isIP(plain) !== 6) return address;
  if (plain.startsWith('::ffff:') && isIP(plain.slice(7)) === 4) return plain.slice(7);
  const halves = plain.split('::');
  const groups = (part: string | undefined) =>
    part === undefined || part === ''
      ? []
      : part.split(':').flatMap((group) => (group.includes('.') ? ['0', '0'] : [group]));
  const head = groups(halves[0]);
  const tail = groups(halves[1]);
  const fill =
    halves.length > 1 ? new Array<string>(Math.max(0, 8 - head.length - tail.length)).fill('0') : [];
  const all = [...head, ...fill, ...tail];
  return `${all
    .slice(0, 4)
    .map((group) => Number.parseInt(group, 16).toString(16))
    .join(':')}::/64`;
}

/**
 * Waits.
 *
 * @param ms - Milliseconds.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
