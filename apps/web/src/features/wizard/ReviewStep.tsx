import type { AbilityTables, EquipmentSummary, SpellSummary } from '@bxvtt/shared/bxapi';
import { abilityLabel, alignmentLabel, classLabel, languageLabel, saveLabel } from '@bxvtt/shared/text';
import type { ClassDetail } from '@/app';
import { Badge, CoinPurse, Parchment, StatBox, formatModifier } from '@/ui';
import type { WizardDraft } from './draft';
import type { CartLine } from './kits';
import { ABILITIES, headlineModifier, xpModifierFor, type Scores } from './tables';
import styles from './wizard.module.css';

export interface ReviewStepProps {
  draft: WizardDraft;
  scores: Scores;
  detail: ClassDetail | null;
  tables: AbilityTables | null;
  equipment: EquipmentSummary[] | null;
  spells: SpellSummary[] | null;
  goldLeft: number | null;
  onEdit: (step: WizardDraft['step']) => void;
}

function cartNames(cart: CartLine[], equip: string[], equipment: EquipmentSummary[] | null) {
  return cart.map((line) => {
    const item = equipment?.find((e) => e.id === line.itemId);
    return {
      key: line.itemId,
      name: item?.name ?? line.itemId,
      quantity: line.quantity,
      equipped: equip.includes(line.itemId),
      kind: item?.item_type,
    };
  });
}

/** Step 6: the finished sheet on parchment, before the server rolls hit points and stores the character. */
export function ReviewStep({
  draft,
  scores,
  detail,
  tables,
  equipment,
  spells,
  goldLeft,
  onEdit,
}: ReviewStepProps) {
  const first = detail?.progression.find((row) => row.level === 1);
  const title = detail?.level_titles[0] ?? null;
  const primes = detail?.prime_requisites ?? [];
  const xp = detail ? xpModifierFor(detail, scores) : 0;
  const con = tables ? headlineModifier(tables, 'con', scores.con) : undefined;
  const languages = [...(detail?.languages ?? []), ...draft.languages];
  const gear = cartNames(draft.cart, draft.equip, equipment);
  const edit = (step: WizardDraft['step'], label: string) => (
    <button type="button" className={styles.editLink} onClick={() => onEdit(step)}>
      Change<span className="visually-hidden"> {label}</span>
    </button>
  );

  return (
    <Parchment variant="sheet" className={styles.review}>
      <header className={styles.reviewHeader}>
        <div>
          <h3 className={styles.reviewName}>{draft.name.trim() || 'Unnamed adventurer'}</h3>
          <p className={styles.reviewClass}>
            Level 1 {detail ? classLabel(detail.id).toLowerCase() : ''}
            {title ? ` · ${title}` : ''} ·{' '}
            {draft.alignment ? alignmentLabel(draft.alignment) : 'No alignment'}
          </p>
        </div>
        {edit('identity', 'name and alignment')}
      </header>

      <section className={styles.reviewSection} aria-label="Ability scores">
        <div className={styles.rowBetween}>
          <h4 className={styles.reviewHeading}>Ability scores</h4>
          {edit('adjust', 'ability scores')}
        </div>
        <div className={styles.reviewAbilities}>
          {ABILITIES.map((ability) => (
            <StatBox
              key={ability}
              abbreviation={abilityLabel(ability, 'short')}
              name={abilityLabel(ability)}
              score={scores[ability]}
              modifier={tables ? headlineModifier(tables, ability, scores[ability]) : undefined}
              prime={primes.includes(ability)}
            />
          ))}
        </div>
        <p className={styles.reviewNote}>
          {xp === 0 ? 'No change to experience earned.' : `${formatModifier(xp)}% to experience earned.`}
        </p>
      </section>

      <div className={styles.reviewColumns}>
        <section className={styles.reviewSection} aria-label="Combat">
          <h4 className={styles.reviewHeading}>Hit points</h4>
          <p className={styles.reviewText}>
            The rules engine rolls them when you create the character: a d{detail?.hit_die ?? '?'}
            {con !== undefined && con !== 0 ? `, ${formatModifier(con)} for Constitution` : ''}
            {draft.hpReroll ? ', rerolling a 1 or 2' : ''}.
          </p>
          {first && (
            <>
              <h4 className={styles.reviewHeading}>Attack and saves</h4>
              <dl className={styles.reviewFacts}>
                <div>
                  <dt>THAC0</dt>
                  <dd>{first.thac0}</dd>
                </div>
                {Object.entries(first.saves).map(([key, value]) => (
                  <div key={key}>
                    <dt>{saveLabel(key, 'short')}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
              <p className={styles.reviewNote}>
                Armour class depends on what you wear, so it appears once the character exists.
              </p>
            </>
          )}
        </section>

        <section className={styles.reviewSection} aria-label="Languages and spells">
          <h4 className={styles.reviewHeading}>Languages</h4>
          <p className={styles.reviewText}>
            {languages.map((id) => languageLabel(id)).join(', ')}
            {draft.alignment
              ? `, and the ${alignmentLabel(draft.alignment).toLowerCase()} alignment tongue.`
              : '.'}
          </p>
          {draft.spells.length > 0 && (
            <>
              <h4 className={styles.reviewHeading}>Spell book</h4>
              <p className={styles.reviewText}>
                {draft.spells.map((id) => spells?.find((s) => s.id === id)?.name ?? id).join(', ')}
              </p>
            </>
          )}
        </section>
      </div>

      <section className={styles.reviewSection} aria-label="Equipment">
        <div className={styles.rowBetween}>
          <h4 className={styles.reviewHeading}>Equipment</h4>
          {edit('outfit', 'equipment')}
        </div>
        {gear.length === 0 ? (
          <p className={styles.reviewText}>None yet. You keep all your gold to spend in town.</p>
        ) : (
          <ul className={styles.reviewGear}>
            {gear.map((item) => (
              <li key={item.key}>
                {item.quantity > 1 ? `${item.quantity} × ` : ''}
                {item.name}
                {item.equipped && (
                  <Badge tone="neutral" appearance="outline">
                    {item.kind === 'armour' ? 'Worn' : 'Wielded'}
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        )}
        {goldLeft !== null && <CoinPurse coins={{ gp: goldLeft }} showEmpty />}
      </section>
    </Parchment>
  );
}
