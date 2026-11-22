import type { FastifyInstance } from 'fastify';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { z } from 'zod';
import type { AdventureInfo, AdventureListing, AdventureValidation, User } from '@bxvtt/shared/protocol';
import { AdventureDocument, LIMITS } from '@bxvtt/shared/protocol';
import { BxapiProblem, callBxapi } from './bxapi';
import type { Context } from './context';
import { json, str } from './db';
import { ApiError, notFound, parseBody } from './errors';
import { now } from './ids';

/** The prefix of a sample adventure's ID in the adventure list. */
const SAMPLE_PREFIX = 'sample:';

/** A sample adventure file. */
interface Sample {
  fileName: string;
  hash: string;
  text: string;
  info: AdventureInfo;
}

/** An adventure that a game can start: the bxapi ID and the facts the server keeps about it. */
export interface ResolvedAdventure {
  bxapiId: string;
  info: AdventureInfo;
}

/** The path parameters of an adventure route. */
const AdventureParams = z.object({ tableId: z.string(), adventureId: z.string() });
/** The path parameters of a table route. */
const TableParams = z.object({ tableId: z.string() });

/**
 * The adventures a table can play: bxapi's built-in adventures, the sample documents in the repository's
 * `adventures/` directory, and the documents a table's referees uploaded. The server uploads a sample to bxapi
 * the first time a table plays it and remembers the bxapi ID by the file's content hash.
 */
export class AdventureCatalog {
  private builtins: { items: AdventureInfo[]; at: number } | null = null;
  private readonly validated = new Map<string, AdventureInfo | null>();

  /**
   * @param ctx - The server's services.
   */
  constructor(private readonly ctx: Context) {}

  /**
   * Lists the adventures a table can play.
   *
   * @param tableId - The table ID.
   */
  async list(tableId: string): Promise<AdventureListing[]> {
    const builtins = (await this.builtinInfo()).map((info) => ({
      id: info.id ?? '',
      source: 'builtin' as const,
      info,
      uploaded_by: null,
      uploaded_at: null,
    }));
    const samples = (await this.samples()).map((sample) => ({
      id: SAMPLE_PREFIX + sample.fileName.replace(/\.json$/, ''),
      source: 'sample' as const,
      info: sample.info,
      uploaded_by: null,
      uploaded_at: null,
    }));
    const uploaded = this.ctx.db
      .all('SELECT * FROM adventures WHERE table_id = ? ORDER BY uploaded_at DESC, rowid DESC', tableId)
      .map((row) => ({
        id: str(row, 'id'),
        source: 'uploaded' as const,
        info: json<AdventureInfo>(row, 'info_json'),
        uploaded_by: str(row, 'uploaded_by'),
        uploaded_at: str(row, 'uploaded_at'),
      }));
    return [...builtins, ...samples, ...uploaded];
  }

  /**
   * Finds the bxapi adventure for an ID from a table's list, uploading a sample when needed.
   *
   * @param tableId - The table ID.
   * @param adventureId - An `id` from {@link AdventureCatalog.list}.
   * @param forceUpload - Upload a sample again even when the server remembers it, after bxapi lost it.
   * @throws ApiError `not_found` when the table can't play that adventure.
   */
  async resolve(tableId: string, adventureId: string, forceUpload = false): Promise<ResolvedAdventure> {
    if (adventureId.startsWith(SAMPLE_PREFIX)) {
      const name = `${adventureId.slice(SAMPLE_PREFIX.length)}.json`;
      const sample = (await this.samples()).find((candidate) => candidate.fileName === name);
      if (sample === undefined) notFound('adventure', adventureId);
      const known = this.ctx.db.get(
        'SELECT adventure_id FROM samples WHERE file_name = ? AND content_hash = ?',
        sample.fileName,
        sample.hash,
      );
      if (known !== undefined && !forceUpload)
        return { bxapiId: str(known, 'adventure_id'), info: sample.info };
      const info = await callBxapi(() =>
        this.ctx.bxapi.request<AdventureInfo>('POST', '/v1/adventures', { rawBody: sample.text }),
      );
      this.ctx.db.run(
        `INSERT OR REPLACE INTO samples (file_name, content_hash, adventure_id, info_json, uploaded_at)
         VALUES (?, ?, ?, ?, ?)`,
        sample.fileName,
        sample.hash,
        info.id ?? '',
        JSON.stringify(info),
        now(),
      );
      this.ctx.log.info(
        { sample: sample.fileName, adventure: info.id },
        'sample adventure uploaded to bxapi',
      );
      return { bxapiId: info.id ?? '', info };
    }
    const builtin = (await this.builtinInfo()).find((info) => info.id === adventureId);
    if (builtin !== undefined) return { bxapiId: adventureId, info: builtin };
    const row = this.ctx.db.get(
      'SELECT * FROM adventures WHERE id = ? AND table_id = ?',
      adventureId,
      tableId,
    );
    if (row === undefined) notFound('adventure', adventureId);
    return { bxapiId: adventureId, info: json<AdventureInfo>(row, 'info_json') };
  }

  /**
   * Validates an adventure document with bxapi, storing nothing.
   *
   * @param document - The document.
   */
  validate(document: unknown): Promise<AdventureValidation> {
    return callBxapi(() => this.ctx.bxapi.post<AdventureValidation>('/v1/adventures/validate', document));
  }

  /**
   * Uploads an adventure document for a table.
   *
   * @param tableId - The table ID.
   * @param user - The referee who uploads it.
   * @param document - The document.
   */
  async upload(tableId: string, user: User, document: unknown): Promise<AdventureListing> {
    const info = await callBxapi(() => this.ctx.bxapi.post<AdventureInfo>('/v1/adventures', document));
    const uploadedAt = now();
    this.ctx.db.run(
      'INSERT INTO adventures (id, table_id, info_json, uploaded_by, uploaded_at) VALUES (?, ?, ?, ?, ?)',
      info.id ?? '',
      tableId,
      JSON.stringify(info),
      user.id,
      uploadedAt,
    );
    return { id: info.id ?? '', source: 'uploaded', info, uploaded_by: user.id, uploaded_at: uploadedAt };
  }

  /**
   * Deletes an adventure a table uploaded, from bxapi and from the table.
   *
   * @param tableId - The table ID.
   * @param adventureId - The bxapi adventure ID.
   */
  async remove(tableId: string, adventureId: string): Promise<void> {
    const row = this.ctx.db.get(
      'SELECT id FROM adventures WHERE id = ? AND table_id = ?',
      adventureId,
      tableId,
    );
    if (row === undefined) {
      if (adventureId.startsWith(SAMPLE_PREFIX) || adventureId.startsWith('builtin-')) {
        throw new ApiError('adventure_read_only', 'Only an adventure the table uploaded can be deleted.');
      }
      notFound('adventure', adventureId);
    }
    await this.deleteFromBxapi(adventureId);
    this.ctx.db.run('DELETE FROM adventures WHERE id = ?', adventureId);
  }

  /**
   * Deletes every adventure a table uploaded from bxapi. The rows go with the table.
   *
   * @param tableId - The table ID.
   */
  async removeAll(tableId: string): Promise<void> {
    for (const row of this.ctx.db.all('SELECT id FROM adventures WHERE table_id = ?', tableId)) {
      await this.deleteFromBxapi(str(row, 'id')).catch((error: unknown) => {
        this.ctx.log.warn(
          { err: error, adventure: str(row, 'id') },
          'could not delete an adventure from bxapi',
        );
      });
    }
  }

  private async deleteFromBxapi(adventureId: string): Promise<void> {
    try {
      await this.ctx.bxapi.request('DELETE', `/v1/adventures/${encodeURIComponent(adventureId)}`);
    } catch (error) {
      if (!(error instanceof BxapiProblem && error.code === 'not_found')) {
        await callBxapi(() => Promise.reject(error));
      }
    }
  }

  private async builtinInfo(): Promise<AdventureInfo[]> {
    if (this.builtins !== null && Date.now() - this.builtins.at < 5 * 60_000) return this.builtins.items;
    const page = await callBxapi(() =>
      this.ctx.bxapi.get<{ items: AdventureInfo[] }>('/v1/adventures', { limit: 200 }),
    );
    const items = page.items.filter((info) => info.builtin);
    this.builtins = { items, at: Date.now() };
    return items;
  }

  /** Reads the valid sample files. An invalid file is logged once and left out. */
  private async samples(): Promise<Sample[]> {
    let names: string[];
    try {
      names = (await readdir(this.ctx.config.adventuresDir)).filter((name) => name.endsWith('.json')).sort();
    } catch {
      return [];
    }
    const samples: Sample[] = [];
    for (const name of names) {
      const path = join(this.ctx.config.adventuresDir, name);
      let text: string;
      try {
        text = await readFile(path, 'utf8');
      } catch {
        continue;
      }
      if (Buffer.byteLength(text) > LIMITS.adventureBodyBytes) {
        this.warnOnce(
          `${name}:size`,
          { file: path },
          'sample adventure is larger than the upload limit; skipped',
        );
        continue;
      }
      const hash = createHash('sha256').update(text).digest('hex');
      const stored = this.ctx.db.get(
        'SELECT info_json FROM samples WHERE file_name = ? AND content_hash = ?',
        name,
        hash,
      );
      if (stored !== undefined) {
        samples.push({
          fileName: basename(name),
          hash,
          text,
          info: json<AdventureInfo>(stored, 'info_json'),
        });
        continue;
      }
      let info = this.validated.get(hash);
      if (info === undefined) {
        info = await this.validateSample(path, text);
        this.validated.set(hash, info);
      }
      if (info !== null) samples.push({ fileName: basename(name), hash, text, info });
    }
    return samples;
  }

  private async validateSample(path: string, text: string): Promise<AdventureInfo | null> {
    let document: unknown;
    try {
      document = JSON.parse(text);
    } catch {
      this.ctx.log.warn({ file: path }, 'sample adventure is not valid JSON; skipped');
      return null;
    }
    const result = await this.validate(document);
    if (!result.valid) {
      this.ctx.log.warn(
        { file: path, code: result.code, detail: result.detail },
        'sample adventure is invalid; skipped',
      );
      return null;
    }
    return result.adventure;
  }

  private readonly warned = new Set<string>();

  private warnOnce(key: string, data: Record<string, unknown>, message: string): void {
    if (this.warned.has(key)) return;
    this.warned.add(key);
    this.ctx.log.warn(data, message);
  }
}

/**
 * Registers the adventure routes under `/api/tables/{table_id}/adventures`.
 *
 * @param app - The Fastify instance.
 * @param ctx - The server's services.
 */
export function registerAdventureRoutes(app: FastifyInstance, ctx: Context): void {
  app.get('/api/tables/:tableId/adventures', async (request) => {
    const { tableId } = TableParams.parse(request.params);
    ctx.tables.requireMember(tableId, ctx.auth.user(request));
    return { items: await ctx.adventures.list(tableId) };
  });

  app.post(
    '/api/tables/:tableId/adventures/validate',
    { bodyLimit: LIMITS.adventureBodyBytes },
    async (request) => {
      const { tableId } = TableParams.parse(request.params);
      ctx.tables.requireReferee(tableId, ctx.auth.user(request));
      return ctx.adventures.validate(parseBody(z.record(z.string(), z.unknown()), request));
    },
  );

  app.post(
    '/api/tables/:tableId/adventures',
    { bodyLimit: LIMITS.adventureBodyBytes },
    async (request, reply) => {
      const { tableId } = TableParams.parse(request.params);
      const user = ctx.auth.user(request);
      ctx.tables.requireReferee(tableId, user);
      const listing = await ctx.adventures.upload(tableId, user, parseBody(AdventureDocument, request));
      ctx.feed.system(tableId, user.id, 'adventure_uploaded', {
        adventure_id: listing.id,
        name: listing.info.name,
      });
      return reply.status(201).send(listing);
    },
  );

  app.delete('/api/tables/:tableId/adventures/:adventureId', async (request, reply) => {
    const { tableId, adventureId } = AdventureParams.parse(request.params);
    ctx.tables.requireReferee(tableId, ctx.auth.user(request));
    await ctx.adventures.remove(tableId, adventureId);
    return reply.status(204).send();
  });
}
