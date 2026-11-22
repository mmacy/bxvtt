import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { SQLInputValue, StatementSync } from 'node:sqlite';
import { RETIRED_USER_COLORS, USER_COLORS } from '@bxvtt/shared/protocol';

/**
 * The version of the table layout. The server upgrades a database of an older version at startup with the
 * steps in {@link MIGRATIONS}, and refuses one of a newer version.
 */
export const SCHEMA_VERSION = 4;

/** The table of monster target handles, which layout version 2 added. */
const TARGET_HANDLES = `
CREATE TABLE target_handles (
  table_id TEXT NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  encounter_key TEXT NOT NULL,
  monster_id TEXT NOT NULL,
  handle TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  number INTEGER NOT NULL,
  PRIMARY KEY (session_id, monster_id)
);
CREATE INDEX target_handles_by_encounter ON target_handles(session_id, encounter_key, label);
`;

/** The table of retired token hashes, which layout version 3 added. */
const RETIRED_TOKENS = `
CREATE TABLE retired_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  retired_at TEXT NOT NULL
);
`;

/** The SQL that upgrades a database from the version before each key to that version. */
const MIGRATIONS: Record<number, string> = {
  2: TARGET_HANDLES,
  3: RETIRED_TOKENS,
  // The palette changed to colors that read on the dark chrome. Each stored color moves to the new color at its
  // position, so nobody keeps an unreadable color.
  4: RETIRED_USER_COLORS.map(
    (old, index) =>
      `UPDATE users SET color = '${USER_COLORS[index] ?? USER_COLORS[0]}' WHERE color = '${old}';`,
  ).join('\n'),
};

const SCHEMA = `
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);
CREATE TABLE tables (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  invite_code TEXT NOT NULL UNIQUE,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  party_control TEXT NOT NULL,
  caller_user_id TEXT,
  auto_resolve INTEGER NOT NULL,
  autosave INTEGER NOT NULL,
  session_id TEXT,
  game_json TEXT
);
CREATE TABLE members (
  table_id TEXT NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL,
  joined_at TEXT NOT NULL,
  PRIMARY KEY (table_id, user_id)
);
CREATE INDEX members_by_user ON members(user_id);
CREATE TABLE characters (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  class_id TEXT NOT NULL,
  level INTEGER NOT NULL,
  max_hp INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX characters_by_owner ON characters(owner_user_id);
CREATE TABLE ability_rolls (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE TABLE roster (
  id TEXT PRIMARY KEY,
  table_id TEXT NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
  character_id TEXT NOT NULL,
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  position INTEGER NOT NULL,
  added_at TEXT NOT NULL,
  UNIQUE (table_id, character_id)
);
CREATE TABLE table_sessions (
  table_id TEXT NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  restored_from TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (table_id, session_id)
);
CREATE TABLE seats (
  table_id TEXT NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  user_id TEXT,
  name TEXT NOT NULL,
  position INTEGER NOT NULL,
  PRIMARY KEY (table_id, session_id, member_id)
);
CREATE TABLE declarations (
  table_id TEXT NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  round INTEGER NOT NULL,
  declaration_json TEXT NOT NULL,
  user_id TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (table_id, session_id, member_id)
);
CREATE TABLE battle_refusals (
  table_id TEXT PRIMARY KEY REFERENCES tables(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  refusals_json TEXT NOT NULL
);
CREATE TABLE saves (
  id TEXT PRIMARY KEY,
  table_id TEXT NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  label TEXT,
  autosave INTEGER NOT NULL,
  mode TEXT NOT NULL,
  clock_json TEXT NOT NULL,
  adventure_name TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL,
  seq INTEGER NOT NULL
);
CREATE INDEX saves_by_table ON saves(table_id, seq);
CREATE TABLE feed (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  table_id TEXT NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  user_id TEXT,
  visibility TEXT NOT NULL,
  to_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  data_json TEXT NOT NULL,
  referee_json TEXT
);
CREATE INDEX feed_by_table ON feed(table_id, seq);
CREATE TABLE annotations (
  id TEXT PRIMARY KEY,
  table_id TEXT NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
  dungeon_id TEXT NOT NULL,
  level_number INTEGER NOT NULL,
  kind TEXT NOT NULL,
  author_id TEXT NOT NULL,
  visibility TEXT NOT NULL,
  data_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  seq INTEGER NOT NULL
);
CREATE INDEX annotations_by_level ON annotations(table_id, dungeon_id, level_number, seq);
CREATE TABLE notes (
  table_id TEXT NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  text TEXT NOT NULL,
  version INTEGER NOT NULL,
  updated_by TEXT,
  updated_at TEXT,
  PRIMARY KEY (table_id, kind)
);
CREATE TABLE adventures (
  id TEXT PRIMARY KEY,
  table_id TEXT NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
  info_json TEXT NOT NULL,
  uploaded_by TEXT NOT NULL,
  uploaded_at TEXT NOT NULL
);
CREATE TABLE samples (
  file_name TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  adventure_id TEXT NOT NULL,
  info_json TEXT NOT NULL,
  uploaded_at TEXT NOT NULL,
  PRIMARY KEY (file_name, content_hash)
);
${TARGET_HANDLES}${RETIRED_TOKENS}`;

/** A row as `node:sqlite` returns it. */
export type Row = Record<string, SQLInputValue>;

/**
 * The bxvtt SQLite database. It wraps one `node:sqlite` connection with write-ahead logging, caches prepared
 * statements, and creates the tables in a new file.
 */
export class Database {
  private readonly db: DatabaseSync;
  private readonly statements = new Map<string, StatementSync>();

  /**
   * Opens the database file `bxvtt.db` in a directory, creating both when they don't exist.
   *
   * @param dataDir - The directory, or `:memory:` for a database that lives in memory.
   * @throws Error when the file has a table layout of another version.
   */
  constructor(dataDir: string) {
    let path = ':memory:';
    if (dataDir !== ':memory:') {
      mkdirSync(dataDir, { recursive: true, mode: 0o700 });
      path = join(dataDir, 'bxvtt.db');
    }
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    const version = Number((this.db.prepare('PRAGMA user_version').get() as Row).user_version);
    if (version === 0) {
      const tables = this.db
        .prepare("SELECT count(*) AS n FROM sqlite_master WHERE type = 'table'")
        .get() as Row;
      if (Number(tables.n) > 0) {
        throw new Error(
          `The database ${path} has tables but no layout version. Move it away and start again.`,
        );
      }
      this.db.exec(`BEGIN; ${SCHEMA} PRAGMA user_version = ${SCHEMA_VERSION}; COMMIT;`);
    } else if (version < SCHEMA_VERSION) {
      for (let next = version + 1; next <= SCHEMA_VERSION; next += 1) {
        this.db.exec(`BEGIN; ${MIGRATIONS[next] ?? ''} PRAGMA user_version = ${next}; COMMIT;`);
      }
    } else if (version !== SCHEMA_VERSION) {
      throw new Error(
        `The database ${path} has table layout version ${version}, and this server expects ${SCHEMA_VERSION}.`,
      );
    }
  }

  private statement(sql: string): StatementSync {
    let statement = this.statements.get(sql);
    if (statement === undefined) {
      statement = this.db.prepare(sql);
      this.statements.set(sql, statement);
    }
    return statement;
  }

  /**
   * Runs a statement that changes rows.
   *
   * @param sql - The SQL, with `?` or `:name` parameters.
   * @param params - The parameters.
   * @returns The number of rows changed.
   */
  run(sql: string, ...params: SQLInputValue[]): number {
    return Number(this.statement(sql).run(...params).changes);
  }

  /**
   * Runs a statement with named parameters that changes rows.
   *
   * @param sql - The SQL, with `:name` parameters.
   * @param params - The parameters by name.
   */
  runNamed(sql: string, params: Record<string, SQLInputValue>): number {
    return Number(this.statement(sql).run(params).changes);
  }

  /**
   * Reads one row.
   *
   * @param sql - The SQL.
   * @param params - The parameters.
   * @returns The row, or `undefined`.
   */
  get(sql: string, ...params: SQLInputValue[]): Row | undefined {
    return this.statement(sql).get(...params) as Row | undefined;
  }

  /**
   * Reads every matching row.
   *
   * @param sql - The SQL.
   * @param params - The parameters.
   */
  all(sql: string, ...params: SQLInputValue[]): Row[] {
    return this.statement(sql).all(...params) as Row[];
  }

  /**
   * Reads every matching row, with named parameters.
   *
   * @param sql - The SQL, with `:name` parameters.
   * @param params - The parameters by name.
   */
  allNamed(sql: string, params: Record<string, SQLInputValue>): Row[] {
    return this.statement(sql).all(params) as Row[];
  }

  /**
   * Runs a function in a transaction, committing when it returns and rolling back when it throws.
   *
   * @param fn - The function. It must be synchronous.
   */
  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  /** Closes the connection. */
  close(): void {
    this.statements.clear();
    this.db.close();
  }
}

/**
 * Reads a column as a string.
 *
 * @param row - The row.
 * @param column - The column name.
 */
export function str(row: Row, column: string): string {
  return String(row[column]);
}

/**
 * Reads a column as a string, or `null`.
 *
 * @param row - The row.
 * @param column - The column name.
 */
export function strOrNull(row: Row, column: string): string | null {
  const value = row[column];
  return value === null || value === undefined ? null : String(value);
}

/**
 * Reads a column as a number.
 *
 * @param row - The row.
 * @param column - The column name.
 */
export function num(row: Row, column: string): number {
  return Number(row[column]);
}

/**
 * Parses a JSON column.
 *
 * @param row - The row.
 * @param column - The column name.
 */
export function json<T>(row: Row, column: string): T {
  return JSON.parse(String(row[column])) as T;
}
