import type { CommandClass } from '@bxvtt/shared/protocol';
import type { CommandDetail, CommandSummary } from '@bxvtt/shared/bxapi';
import type { RulesCache } from '../rules';
import { TARGET_FIELD_NAMES } from './targets';

/** How the server decides who may send one command type. */
export interface CommandInfo {
  commandType: string;
  kind: 'play' | 'referee';
  class: CommandClass;
  /** The field that names the acting member of a `member` command, or `null`. */
  memberField: string | null;
  /** The fields that can name a monster target, such as `targets`, which the server reads target handles in. */
  targetFields: string[];
}

/**
 * Commands whose schema names a member who acts for the whole party. `search` names the searcher and `parley`
 * the speaker, but each is something the party does together, so the caller sends it.
 */
const PARTY_OVERRIDES: ReadonlySet<string> = new Set(['search', 'parley']);

/** The command that resolves a battle round, which goes through the declarations routes. */
export const RESOLVE_ROUND = 'resolve_battle_round';

/** The property names that name the acting member of a command. */
const MEMBER_FIELDS = ['character_id', 'member_id', 'actor_id'];

/**
 * Classifies one command from its catalog entry and JSON schema.
 *
 * A referee command is `referee`. `resolve_battle_round` is `battle`. A command whose schema requires a string
 * property that names a member, such as `character_id`, is `member`, unless {@link PARTY_OVERRIDES} lists it.
 * Every other command is `party`.
 *
 * @param detail - bxapi's command detail, with `json_schema`.
 */
export function classifyCommand(detail: CommandDetail): CommandInfo {
  const schema = detail.json_schema as {
    required?: unknown;
    properties?: Record<string, { type?: unknown }>;
  };
  const targetFields = TARGET_FIELD_NAMES.filter((name) => schema.properties?.[name] !== undefined);
  const base = { commandType: detail.command_type, kind: detail.kind, targetFields };
  if (detail.kind === 'referee') return { ...base, class: 'referee', memberField: null };
  if (detail.command_type === RESOLVE_ROUND) return { ...base, class: 'battle', memberField: null };
  if (PARTY_OVERRIDES.has(detail.command_type)) return { ...base, class: 'party', memberField: null };
  const required = Array.isArray(schema.required) ? (schema.required as unknown[]) : [];
  const field = MEMBER_FIELDS.find(
    (name) => required.includes(name) && schema.properties?.[name]?.type === 'string',
  );
  if (field !== undefined) return { ...base, class: 'member', memberField: field };
  return { ...base, class: 'party', memberField: null };
}

/**
 * The command classes of every bxapi command, read once from the command catalog and the command schemas. A
 * command type that isn't in the catalog makes it read the catalog again, at most once a minute, so a command
 * bxapi adds later is classified without a code change.
 */
export class CommandClassifier {
  private catalog: Map<string, CommandInfo> | null = null;
  private loading: Promise<Map<string, CommandInfo>> | null = null;
  private loadedAt = 0;

  /**
   * @param rules - The rules cache, which reads bxapi's catalog.
   */
  constructor(private readonly rules: RulesCache) {}

  /**
   * Classifies a command type.
   *
   * @param commandType - The command type.
   * @returns The classification, or `null` for a type bxapi doesn't have.
   */
  async classify(commandType: string): Promise<CommandInfo | null> {
    let catalog = await this.load();
    let info = catalog.get(commandType);
    if (info === undefined && Date.now() - this.loadedAt > 60_000) {
      this.catalog = null;
      catalog = await this.load();
      info = catalog.get(commandType);
    }
    return info ?? null;
  }

  /** Reads the whole catalog. */
  async all(): Promise<Map<string, CommandInfo>> {
    return this.load();
  }

  private load(): Promise<Map<string, CommandInfo>> {
    if (this.catalog !== null) return Promise.resolve(this.catalog);
    if (this.loading === null) {
      this.loading = (async () => {
        const page = await this.rules.json<{ items: CommandSummary[] }>('commands?limit=200');
        const details = await Promise.all(
          page.items.map((item) =>
            this.rules.json<CommandDetail>(`commands/${encodeURIComponent(item.command_type)}`),
          ),
        );
        const catalog = new Map(details.map((detail) => [detail.command_type, classifyCommand(detail)]));
        this.catalog = catalog;
        this.loadedAt = Date.now();
        return catalog;
      })().finally(() => {
        this.loading = null;
      });
    }
    return this.loading;
  }
}
