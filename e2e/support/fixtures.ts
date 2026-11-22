/**
 * The suite's `test` and `expect`. Every spec imports them from here.
 *
 * The `crew` fixture creates the people at a table. Each person is a bxvtt user made through the SDK, with an SDK
 * client of their own and a browser context whose local storage already holds their identity, so a spec can set
 * a table up through the SDK and then drive the interface. When the test ends, the fixture scans the feed of every
 * open table page for raw IDs and codes, and fails the test on any browser console error, uncaught page error,
 * failed request, or response with status 500 or more that the test didn't allow.
 */
import { test as base, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { BxvttClient } from '@bxvtt/shared/client';
import type { User } from '@bxvtt/shared/protocol';
import { BASE_URL, SERVER_URL } from './env';
import { findRawText, type RawTextFinding } from './feed-text';

/** Options for a new person. */
export interface PersonOptions {
  /** The browser viewport. Defaults to 1440 by 900. */
  viewport?: { width: number; height: number };
  /** Record every API response body and WebSocket frame the browser receives, for the privacy spec. */
  record?: boolean;
  /** Emulate `prefers-reduced-motion: reduce`. */
  reducedMotion?: 'reduce' | 'no-preference';
  /** Create the user through the SDK and store the identity in the browser. Defaults to `true`. */
  signedIn?: boolean;
}

/** One person at the table: a user, an SDK client, and a browser. */
export interface Actor {
  name: string;
  /** The user, or `null` for a visitor who hasn't picked a name yet. */
  user: User | null;
  token: string | null;
  client: BxvttClient;
  context: BrowserContext;
  /** The first page of the browser context. */
  page: Page;
  /** Problems the browser reported: console errors, page errors, failed requests, and 5xx responses. */
  issues: string[];
  /** Every API response body and WebSocket frame the browser received, when `record` is set. */
  received: string[];
  /** The user ID. Throws for a visitor without a user. */
  readonly id: string;
  /** Opens another tab in the same browser context, with the same identity. */
  newTab(): Promise<Page>;
  /**
   * Adds a seed to each request that rolls ability scores, so the wizard's rolls repeat. Each roll takes the next
   * seed; the last one repeats.
   */
  seedAbilityRolls(seeds: number[]): Promise<void>;
  /** Adds a seed to the request that starts a game, so the session's dice repeat. */
  seedGameStart(seed: number): Promise<void>;
}

/** The fixture that makes people and checks their browsers when the test ends. */
export interface Crew {
  /** Creates a person with a user (unless `signedIn` is false) and a browser. */
  person(name: string, options?: PersonOptions): Promise<Actor>;
  /** Everyone created so far. */
  readonly actors: Actor[];
  /** Allows browser problems that match a pattern for the rest of the test, such as an expected 409. */
  allowIssues(pattern: RegExp): void;
  /** Skips the feed scan at the end of the test, for a test that checks the feed itself. */
  skipFeedScan(): void;
}

/** Creates an SDK client that calls the suite's bxvtt server directly. */
export function sdkClient(token: string | null = null): BxvttClient {
  return new BxvttClient({ baseUrl: SERVER_URL, token });
}

function describeRequest(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
}

/** Watches one page for problems and, when asked, records what it receives. */
function watchPage(page: Page, actor: { issues: string[]; received: string[]; record: boolean }): void {
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const location = message.location();
    actor.issues.push(`console error: ${message.text()} (${describeRequest(location.url)})`);
  });
  page.on('pageerror', (error) => actor.issues.push(`page error: ${error.message}`));
  page.on('requestfailed', (request) => {
    const failure = request.failure()?.errorText ?? 'unknown';
    // A navigation or an unmounting component cancels requests in flight. That isn't a failure.
    if (failure.includes('ERR_ABORTED')) return;
    actor.issues.push(`request failed: ${request.method()} ${describeRequest(request.url())} (${failure})`);
  });
  page.on('response', async (response) => {
    const url = response.url();
    if (response.status() >= 500) {
      actor.issues.push(
        `response ${response.status()}: ${response.request().method()} ${describeRequest(url)}`,
      );
    }
    if (actor.record && url.includes('/api/')) {
      try {
        actor.received.push(await response.text());
      } catch {
        // A redirect or a response that the page abandoned has no body.
      }
    }
  });
  if (actor.record) {
    page.on('websocket', (socket) => {
      socket.on('framereceived', (frame) => {
        actor.received.push(
          typeof frame.payload === 'string' ? frame.payload : frame.payload.toString('utf8'),
        );
      });
    });
  }
}

/**
 * Reads every line of the feed on a table page, scrolling the feed's virtual list from top to bottom so each row
 * renders once. Returns an empty list when the page shows no feed.
 */
export async function readFeedLines(page: Page): Promise<string[]> {
  if (page.isClosed()) return [];
  const feed = page.getByRole('region', { name: 'Feed entries' });
  if ((await feed.count()) === 0) return [];
  return feed.first().evaluate(async (element) => {
    const lines = new Set<string>();
    const collect = () => {
      for (const line of (element as HTMLElement).innerText.split('\n')) {
        const trimmed = line.trim();
        if (trimmed !== '') lines.add(trimmed);
      }
    };
    const frame = () => new Promise((resolveFrame) => requestAnimationFrame(() => resolveFrame(null)));
    const start = element.scrollTop;
    const step = Math.max(200, element.clientHeight / 2);
    for (let top = 0; top <= element.scrollHeight; top += step) {
      element.scrollTop = top;
      await frame();
      await frame();
      collect();
    }
    element.scrollTop = start;
    collect();
    return [...lines];
  });
}

/** Fails with a readable message when feed lines read like code. */
export function expectNoRawText(lines: string[], where: string): void {
  const findings: RawTextFinding[] = findRawText(lines);
  expect(
    findings.map((finding) => `${finding.kind} "${finding.match}" in: ${finding.line}`),
    `Feed text in ${where} should read as sentences`,
  ).toEqual([]);
}

async function newActor(browser: Browser, name: string, options: PersonOptions): Promise<Actor> {
  const signedIn = options.signedIn ?? true;
  const client = sdkClient();
  let user: User | null = null;
  let token: string | null = null;
  if (signedIn) {
    const created = await client.createUser(name);
    user = created.user;
    token = created.token;
  }
  const context = await browser.newContext({
    baseURL: BASE_URL,
    viewport: options.viewport ?? { width: 1440, height: 900 },
    reducedMotion: options.reducedMotion ?? 'no-preference',
    storageState: {
      cookies: [],
      origins:
        user !== null && token !== null
          ? [
              {
                origin: BASE_URL,
                localStorage: [{ name: 'bxvtt.identity', value: JSON.stringify({ token, user }) }],
              },
            ]
          : [],
    },
  });
  const state = { issues: [] as string[], received: [] as string[], record: options.record ?? false };
  context.on('page', (page) => watchPage(page, state));
  const page = await context.newPage();
  const actor: Actor = {
    name,
    user,
    token,
    client,
    context,
    page,
    issues: state.issues,
    received: state.received,
    get id() {
      if (actor.user === null) throw new Error(`${name} has no user yet.`);
      return actor.user.id;
    },
    newTab: () => context.newPage(),
    seedAbilityRolls: async (seeds) => {
      let index = 0;
      await context.route('**/api/ability-rolls', async (route) => {
        const request = route.request();
        if (request.method() !== 'POST') return route.continue();
        const body = (request.postDataJSON() as Record<string, unknown> | null) ?? {};
        const seed = seeds[Math.min(index, seeds.length - 1)];
        index += 1;
        await route.continue({ postData: JSON.stringify({ ...body, seed }) });
      });
    },
    seedGameStart: async (seed) => {
      await context.route(/\/api\/tables\/[^/]+\/game$/, async (route) => {
        const request = route.request();
        if (request.method() !== 'POST') return route.continue();
        const body = (request.postDataJSON() as Record<string, unknown> | null) ?? {};
        await route.continue({ postData: JSON.stringify({ ...body, seed }) });
      });
    },
  };
  return actor;
}

export const test = base.extend<{ crew: Crew }>({
  crew: async ({ browser }, use, testInfo) => {
    const actors: Actor[] = [];
    const allowed: RegExp[] = [];
    let scanFeed = true;
    const crew: Crew = {
      actors,
      person: async (name, options = {}) => {
        const actor = await newActor(browser, name, options);
        actors.push(actor);
        return actor;
      },
      allowIssues: (pattern) => {
        allowed.push(pattern);
      },
      skipFeedScan: () => {
        scanFeed = false;
      },
    };
    await use(crew);

    const failures: string[] = [];
    const passed = testInfo.status === testInfo.expectedStatus;
    for (const actor of actors) {
      if (passed && scanFeed) {
        for (const page of actor.context.pages()) {
          if (page.isClosed() || !/\/tables\//.test(page.url())) continue;
          const lines = await readFeedLines(page).catch(() => []);
          for (const finding of findRawText(lines)) {
            failures.push(`${actor.name}'s feed shows a ${finding.kind} "${finding.match}": ${finding.line}`);
          }
        }
      }
      const unexpected = actor.issues.filter((issue) => !allowed.some((pattern) => pattern.test(issue)));
      for (const issue of unexpected) failures.push(`${actor.name}'s browser: ${issue}`);
    }
    for (const actor of actors) await actor.context.close().catch(() => undefined);
    if (passed && failures.length > 0) {
      throw new Error(`The test passed its own checks, but:\n- ${[...new Set(failures)].join('\n- ')}`);
    }
  },
});

export { expect };
