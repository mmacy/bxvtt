import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { USER_COLORS } from '@bxvtt/shared/protocol';
import { Database, SCHEMA_VERSION } from './db';

describe('the database layout', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'bxvtt-db-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('upgrades a version 1 database and keeps its rows', () => {
    new Database(dir).close();
    const raw = new DatabaseSync(join(dir, 'bxvtt.db'));
    raw.exec(`DROP TABLE target_handles; DROP TABLE retired_tokens; DROP TABLE bxapi_garbage; PRAGMA user_version = 1;
      DROP TABLE ability_rolls;
      CREATE TABLE ability_rolls (
        id TEXT PRIMARY KEY,
        owner_user_id TEXT NOT NULL REFERENCES users(id),
        created_at TEXT NOT NULL
      );
      INSERT INTO users (id, name, color, token_hash, created_at) VALUES ('usr_1', 'Rhea', '#e69f00', 'h', 'now');
      INSERT INTO users (id, name, color, token_hash, created_at) VALUES ('usr_2', 'Wine', '#882255', 'h2', 'now');
      INSERT INTO ability_rolls (id, owner_user_id, created_at) VALUES ('rol_1', 'usr_1', 'now');`);
    raw.close();
    const db = new Database(dir);
    expect(db.get('PRAGMA user_version')).toEqual({ user_version: SCHEMA_VERSION });
    expect(db.get("SELECT name FROM users WHERE id = 'usr_1'")).toEqual({ name: 'Rhea' });
    expect(db.get('SELECT count(*) AS n FROM target_handles')).toEqual({ n: 0 });
    // The unreadable old colors moved to the new palette, position by position (R-002).
    expect(db.get("SELECT color FROM users WHERE id = 'usr_1'")).toEqual({ color: USER_COLORS[0] });
    expect(db.get("SELECT color FROM users WHERE id = 'usr_2'")).toEqual({ color: USER_COLORS[7] });
    // An ability roll from before version 6 has no starting rolls yet.
    expect(
      db.get(
        "SELECT owner_user_id, hp_class_id, hp_reroll, gold_rolled_at FROM ability_rolls WHERE id = 'rol_1'",
      ),
    ).toEqual({ owner_user_id: 'usr_1', hp_class_id: null, hp_reroll: null, gold_rolled_at: null });
    db.close();
  });

  it('refuses a database from a newer server', () => {
    new Database(dir).close();
    const raw = new DatabaseSync(join(dir, 'bxvtt.db'));
    raw.exec(`PRAGMA user_version = ${SCHEMA_VERSION + 1}`);
    raw.close();
    expect(() => new Database(dir)).toThrow(/layout version/);
  });
});
