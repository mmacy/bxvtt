/**
 * Test helpers for the referee tools: a fake API that serves The Drowned Bell's adventure document, the real
 * referee command schemas captured from bxapi, and empty catalogs, and a command result built from a snapshot.
 */
import type { CommandResult, Rejection } from '@bxvtt/shared/protocol';
import bell from '../../../../../../adventures/the-drowned-bell.json';
import type { Snapshot } from '@/app/testing/fixtures';
import { createFakeApi, type FakeApi } from '@/app/testing/renderWithTable';
import schemas from './commandSchemas.json';

/** A fake API with the adventure, the command schemas, and empty catalogs stubbed. */
export function refereeApi(): FakeApi {
  const api = createFakeApi();
  api.getAdventureDocument.mockResolvedValue(
    structuredClone(bell.payload) as unknown as Record<string, unknown>,
  );
  api.rules.mockImplementation((path: string) => {
    const match = /^commands\/(.+)$/.exec(path);
    if (match) {
      const schema = (schemas as Record<string, unknown>)[match[1] ?? ''];
      return schema
        ? Promise.resolve(structuredClone(schema))
        : Promise.reject(new Error(`no schema ${path}`));
    }
    if (path === 'commands') {
      return Promise.resolve({
        items: Object.values(schemas),
        total: Object.keys(schemas).length,
        limit: 200,
        offset: 0,
      });
    }
    return Promise.resolve({ items: [], total: 0, limit: 200, offset: 0 });
  });
  return api;
}

/** An accepted or refused command result for a snapshot's game. */
export function commandResult(
  snapshot: Snapshot,
  options: { accepted?: boolean; rejections?: Rejection[]; events?: CommandResult['events'] } = {},
): CommandResult {
  const game = snapshot.game;
  if (!game) throw new Error('The snapshot has no game.');
  return {
    accepted: options.accepted ?? true,
    rejections: options.rejections ?? [],
    events: options.events ?? [],
    messages: [],
    mode: game.mode,
    ended: false,
    revision: game.revision + 1,
    game: { ...game, revision: game.revision + 1 },
  };
}

/**
 * jsdom lacks the pointer capture and scrolling methods that Radix Select calls when it opens. The shared test
 * setup doesn't stub them, so the referee tests do.
 */
export function installDomShims(): void {
  const proto = Element.prototype as unknown as Record<string, unknown>;
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => {};
  proto.releasePointerCapture ??= () => {};
  proto.scrollIntoView ??= () => {};
}
