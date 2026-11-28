import type { TableSettings } from '@bxvtt/shared/protocol';
import { Fragment, type ReactNode } from 'react';
import { useTableDetail } from '@/app';
import { Badge, LinkButton, Popover, SectionLabel } from '@/ui';
import { RULES_FOR_PLAY, STARTING_RULESET_NAMES, matchStartingRuleset } from './rules';
import { useStartingRulesets } from './startingRulesets';
import styles from './lobby.module.css';

/** How many rerolls a character gets, as the summary says it. */
function rerollsText(rerolls: TableSettings['ability_score_rerolls']): string {
  if (rerolls === null) return 'Unlimited';
  if (rerolls === 0) return 'None';
  return `${rerolls} per character`;
}

/** How a first-level character gets hit points, as the summary says it. */
function hitPointsText(ruleset: TableSettings['ruleset']): string {
  if (ruleset.max_hp_at_first_level) return 'Maximum';
  return ruleset.hp_reroll_at_first_level ? 'Roll, and reroll a 1 or 2' : 'Roll the hit die';
}

/** A row of the summary: the label and its value. */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.summaryRow}>
      <dt className={styles.summaryLabel}>{label}</dt>
      <dd className={styles.summaryValue}>{children}</dd>
    </div>
  );
}

/**
 * The name of the starting rules the table uses, for a badge: "Standard B/X", "Creation house rules", or
 * "Custom". It is `null` while the starting rules load, so the badge appears with its text.
 */
export function useStartingRulesName(): string | null {
  const table = useTableDetail();
  const starting = useStartingRulesets();
  if (table === null || starting.items === null) return null;
  const matched = matchStartingRuleset(table.settings.ruleset, starting.items);
  return matched === null ? 'Custom' : STARTING_RULESET_NAMES[matched];
}

/** The badge that names the table's starting rules, or nothing while they load. */
export function StartingRulesBadge() {
  const name = useStartingRulesName();
  return name === null ? null : <Badge tone="neutral">{name}</Badge>;
}

/**
 * A read-only summary of the table's rules in the game's terms, with the rules for creating a character first.
 * Every member can read it, and it has no control that changes a rule. A referee changes the rules in
 * `TableRulesForm`.
 */
export function RulesSummary() {
  const table = useTableDetail();
  if (table === null) return null;
  const { ruleset } = table.settings;
  const on = RULES_FOR_PLAY.filter((rule) => rule.kind === 'boolean' && ruleset[rule.key]);
  const option = (key: 'encumbrance' | 'xp_award_timing') => {
    const rule = RULES_FOR_PLAY.find((candidate) => candidate.kind === 'select' && candidate.key === key);
    return rule?.kind === 'select'
      ? (rule.options.find((candidate) => candidate.value === ruleset[key])?.label ?? null)
      : null;
  };

  return (
    <div className={styles.summary}>
      <section className={styles.summaryGroup} aria-label="Creating a character">
        <SectionLabel>Creating a character</SectionLabel>
        <dl className={styles.summaryList}>
          <Row label="Ability scores">
            {ruleset.ability_score_method === '4d6_drop_lowest' ? 'Roll 4d6, drop the lowest' : 'Roll 3d6'}
          </Row>
          <Row label="Rerolls">{rerollsText(table.settings.ability_score_rerolls)}</Row>
          <Row label="First-level hit points">{hitPointsText(ruleset)}</Row>
          <Row label="Poor ability scores">
            {table.settings.sub_par_restart ? 'Can start over' : 'Keep the character'}
          </Row>
        </dl>
      </section>
      <section className={styles.summaryGroup} aria-label="Playing">
        <SectionLabel>Playing</SectionLabel>
        <dl className={styles.summaryList}>
          <Row label="Moving the party">
            {table.settings.party_control === 'caller' ? 'The caller' : 'Anyone with a character'}
          </Row>
          <Row label="Encumbrance">{option('encumbrance')}</Row>
          <Row label="Experience">{option('xp_award_timing')}</Row>
          <Row label="Optional rules">
            {on.length === 0
              ? 'None'
              : on.map((rule, index) => (
                  <Fragment key={rule.key}>
                    {/* The comma stays with the name before it when the list wraps. */}
                    <span className={styles.summaryRule}>
                      <Popover
                        title={rule.label}
                        trigger={<LinkButton tone="inline">{rule.label}</LinkButton>}
                        align="start"
                      >
                        <p className={styles.summaryRuleText}>{rule.description}</p>
                      </Popover>
                      {index < on.length - 1 && ','}
                    </span>
                    {index < on.length - 1 && ' '}
                  </Fragment>
                ))}
          </Row>
        </dl>
      </section>
    </div>
  );
}
