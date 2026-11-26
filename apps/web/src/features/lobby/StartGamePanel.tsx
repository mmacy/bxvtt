import type { AdventureListing, TableDetail } from '@bxvtt/shared/protocol';
import { joinList } from '@bxvtt/shared/text';
import { useState } from 'react';
import { describeProblem, getApi, useTableStoreApi, type ProblemMessage } from '@/app';
import { Banner, Button, Icon } from '@/ui';
import { STARTING_RULESET_NAMES, matchStartingRuleset } from './rules';
import { useStartingRulesets } from './startingRulesets';
import styles from './lobby.module.css';

/** What stops the game from starting, and what the referee should know first. */
export interface StartChecks {
  /** Problems that keep the start button off, one sentence each. */
  blockers: string[];
  /** Things worth a look that don't stop the start, one sentence each. */
  warnings: string[];
}

/**
 * Checks a lobby before the game starts. It reads only the lobby and the adventure's stated recommendation, and
 * leaves every rule to bxapi, which refuses a party that can't play.
 *
 * @param table - The table.
 * @param adventure - The chosen adventure, or `null`.
 */
export function startChecks(table: TableDetail, adventure: AdventureListing | null): StartChecks {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const roster = table.roster;
  if (roster.length === 0) blockers.push('Add at least one character to the party.');
  if (adventure === null) blockers.push('Choose an adventure.');
  const party = adventure?.info.party ?? null;
  if (party !== null && roster.length > 0) {
    const min = party.min_size ?? null;
    const max = party.max_size ?? null;
    const name = adventure?.info.name ?? 'The adventure';
    if (min !== null && roster.length < min) {
      warnings.push(`${name} is written for at least ${min} characters, but the party has ${roster.length}.`);
    }
    if (max !== null && roster.length > max) {
      warnings.push(`${name} is written for at most ${max} characters, but the party has ${roster.length}.`);
    }
    const outside = roster.filter((entry) => entry.level < party.min_level || entry.level > party.max_level);
    if (outside.length > 0) {
      const levels =
        party.min_level === party.max_level
          ? `level ${party.min_level}`
          : `levels ${party.min_level} to ${party.max_level}`;
      warnings.push(
        `${name} is written for ${levels}, while ${joinList(outside.map((e) => `${e.name} is level ${e.level}`))}.`,
      );
    }
  }
  const owners = new Set(roster.map((entry) => entry.owner_user_id));
  const without = table.members
    .filter((m) => m.role === 'player' && !owners.has(m.user_id))
    .map((m) => m.name);
  if (without.length > 0) {
    warnings.push(
      `${joinList(without)} ${without.length === 1 ? "hasn't" : "haven't"} added a character yet. You can seat them later.`,
    );
  }
  return { blockers, warnings };
}

export interface StartGamePanelProps {
  table: TableDetail;
  adventure: AdventureListing | null;
}

/**
 * The referee's start button, with the checks that keep it off and the warnings worth a look. The game plays by
 * the table's stored rules, so the summary names them and the request sends none.
 */
export function StartGamePanel({ table, adventure }: StartGamePanelProps) {
  const store = useTableStoreApi();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ProblemMessage | null>(null);
  const { blockers, warnings } = startChecks(table, adventure);
  const starting = useStartingRulesets();
  const matched =
    starting.items === null ? undefined : matchStartingRuleset(table.settings.ruleset, starting.items);

  const start = async () => {
    if (adventure === null) return;
    setBusy(true);
    setProblem(null);
    try {
      const game = await getApi().startGame(table.id, { adventure_id: adventure.id });
      store.getState().receiveGame(game);
    } catch (error) {
      setProblem(describeProblem(error));
      setBusy(false);
    }
  };

  return (
    <div className={styles.start}>
      <div className={styles.startSummary}>
        <p className={styles.startAdventure}>{adventure?.info.name ?? 'No adventure chosen'}</p>
        <p className={styles.metaLine}>
          <span>
            {table.roster.length === 1 ? '1 character' : `${table.roster.length} characters`}
            {matched !== undefined && <span className="visually-hidden-inline">,</span>}
          </span>
          {matched !== undefined && (
            <span>{matched === null ? 'Custom rules' : STARTING_RULESET_NAMES[matched]}</span>
          )}
        </p>
      </div>
      {blockers.length > 0 && (
        <ul className={styles.checks} aria-label="Before you start">
          {blockers.map((text) => (
            <li key={text} className={styles.check}>
              <Icon name="info" size={16} className={styles.checkIcon} />
              {text}
            </li>
          ))}
        </ul>
      )}
      {warnings.length > 0 && (
        <ul className={styles.checks} aria-label="Worth a look">
          {warnings.map((text) => (
            <li key={text} className={styles.check}>
              <Icon name="warning" size={16} className={styles.warnIcon} />
              {text}
            </li>
          ))}
        </ul>
      )}
      {problem !== null && (
        <Banner tone="danger" title={problem.title}>
          {problem.detail}
        </Banner>
      )}
      <Button
        variant="primary"
        size="lg"
        icon="play"
        block
        loading={busy}
        disabled={blockers.length > 0}
        disabledReason={blockers.join(' ')}
        onClick={() => void start()}
      >
        Start game
      </Button>
    </div>
  );
}
