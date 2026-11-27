import type { AbilityTables, EquipmentSummary, SpellSummary } from '@bxvtt/shared/bxapi';
import {
  abilityLabel,
  alignmentLabel,
  classLabel,
  count,
  joinList,
  languageLabel,
  saveLabel,
} from '@bxvtt/shared/text';
import type { StartingRolls } from '@bxvtt/shared/protocol';
import type { ClassDetail } from '@/app';
import { Badge, Banner, CoinPurse, Parchment, StatBox, Tooltip, formatModifier } from '@/ui';
import type { WizardDraft } from './draft';
import { cartLabel, cartPhrase, type CartLine } from './kits';
import { ABILITIES, casterNextStep, headlineModifier, xpModifierFor, type Scores } from './tables';
import { RuleLink } from '../sheet/RuleLink';
import styles from './wizard.module.css';

export interface ReviewStepProps {
  draft: WizardDraft;
  scores: Scores;
  detail: ClassDetail | null;
  tables: AbilityTables | null;
  equipment: EquipmentSummary[] | null;
  spells: SpellSummary[] | null;
  goldLeft: number | null;
  /** The hit points and gold the player rolled, as the server returned them. */
  rolls: StartingRolls | null;
  onEdit: (step: WizardDraft['step']) => void;
}

function cartNames(cart: CartLine[], equip: string[], equipment: EquipmentSummary[] | null) {
  return cart.map((line) => {
    const item = equipment?.find((e) => e.id === line.itemId);
    return {
      key: line.itemId,
      name: cartLabel(line.itemId, line.quantity, item?.name),
      phrase: cartPhrase(line.itemId, line.quantity, item?.name).toLowerCase(),
      quantity: line.quantity,
      equipped: equip.includes(line.itemId),
      kind: item?.item_type,
    };
  });
}

/** The last step: the finished sheet on parchment, with the rolled hit points and gold, before the server stores it. */
export function ReviewStep({
  draft,
  scores,
  detail,
  tables,
  equipment,
  spells,
  goldLeft,
  rolls,
  onEdit,
}: ReviewStepProps) {
  const hp = rolls?.hit_point_roll ?? null;
  const gold = rolls?.gold_roll ?? null;
  const first = detail?.progression.find((row) => row.level === 1);
  const title = detail?.level_titles[0] ?? null;
  const primes = detail?.prime_requisites ?? [];
  const xp = detail ? xpModifierFor(detail, scores) : 0;
  const con = tables ? headlineModifier(tables, 'con', scores.con) : undefined;
  const languages = [...(detail?.languages ?? []), ...draft.languages];
  const gear = cartNames(draft.cart, draft.equip, equipment);
  const nextStep = casterNextStep(
    draft.name.trim() || 'Your character',
    detail,
    draft.spells.map((id) => spells?.find((s) => s.id === id)?.name ?? id),
  );
  const wearing = gear.filter((item) => item.equipped && item.kind === 'armour').map((item) => item.phrase);
  const wielding = gear.filter((item) => item.equipped && item.kind !== 'armour').map((item) => item.phrase);
  const outfit = [
    ...(wearing.length > 0 ? [`wearing ${joinList(wearing)}`] : []),
    ...(wielding.length > 0 ? [`wielding ${joinList(wielding)}`] : []),
  ];
  const unworn = gear.filter((item) => !item.equipped && (item.kind === 'armour' || item.kind === 'weapon'));
  const edit = (step: WizardDraft['step'], label: string, stepName: string) => (
    <Tooltip content={`Go back to the ${stepName} step`}>
      <button type="button" className={styles.editLink} onClick={() => onEdit(step)}>
        Change<span className="visually-hidden"> {label}</span>
      </button>
    </Tooltip>
  );

  return (
    <Parchment variant="sheet" className={styles.review}>
      <header className={styles.reviewHeader}>
        <div>
          <h3 className={styles.reviewName}>{draft.name.trim() || 'Unnamed adventurer'}</h3>
          <p className={styles.reviewClass}>
            Level 1{' '}
            {detail ? (
              <RuleLink entry={{ kind: 'classes', id: detail.id }}>{classLabel(detail.id)}</RuleLink>
            ) : null}
            {title ? ` · ${title}` : ''} ·{' '}
            {draft.alignment ? alignmentLabel(draft.alignment) : 'No alignment'}
          </p>
        </div>
        {edit('identity', 'name and alignment', 'identity')}
      </header>

      <section className={styles.reviewSection} aria-label="Ability scores">
        <div className={styles.rowBetween}>
          <h4 className={styles.reviewHeading}>Ability scores</h4>
          {edit('adjust', 'ability scores', 'adjust scores')}
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
          {hp ? (
            <p className={styles.reviewText}>
              <span className={styles.reviewNumber}>{count(hp.hit_points, 'hit point')}</span>. You rolled{' '}
              {hp.rolls.at(-1)} on 1d{detail?.hit_die ?? '?'}
              {con !== undefined && con !== 0 ? `, ${formatModifier(con)} for Constitution` : ''}
              {hp.rolls.length > 1
                ? `, after setting aside ${joinList(hp.rolls.slice(0, -1).map(String))}`
                : ''}
              .
            </p>
          ) : (
            <p className={styles.reviewText}>Roll your hit points on the hit points and gold step.</p>
          )}
          <h4 className={styles.reviewHeading}>Starting gold</h4>
          <p className={styles.reviewText}>
            {gold ? (
              <>
                <span className={styles.reviewNumber}>{gold.total} gp</span>. You rolled{' '}
                {joinList(gold.rolls.map(String))} on {gold.rolls.length}d6, times {gold.multiplier}.
              </>
            ) : (
              'Roll your starting gold on the hit points and gold step.'
            )}
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
                {outfit.length > 0
                  ? `You set out ${outfit.join(' and ')}. `
                  : 'You set out with nothing worn or wielded. '}
                You get your final armour class when you create your character.
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
                {draft.spells.map((id, index) => (
                  <span key={id}>
                    {index > 0 && ', '}
                    <RuleLink entry={{ kind: 'spells', id }}>
                      {spells?.find((s) => s.id === id)?.name ?? id}
                    </RuleLink>
                  </span>
                ))}
              </p>
            </>
          )}
          {nextStep && <p className={styles.reviewNote}>{nextStep}</p>}
        </section>
      </div>

      <section className={styles.reviewSection} aria-label="Equipment">
        <div className={styles.rowBetween}>
          <h4 className={styles.reviewHeading}>Equipment</h4>
          {edit('outfit', 'equipment', 'outfit')}
        </div>
        {gear.length === 0 ? (
          <p className={styles.reviewText}>None yet. You keep all your gold to spend in town.</p>
        ) : (
          <ul className={styles.reviewGear}>
            {gear.map((item) => (
              <li key={item.key}>
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
        {unworn.length > 0 && (
          <Banner tone="warning" title="Unequipped weapons or armour">
            {`You packed ${joinList(unworn.map((item) => item.phrase))} without equipping ${
              unworn.length === 1 ? 'it' : 'them'
            }. Select Change if you want to wear or wield ${unworn.length === 1 ? 'it' : 'them'}.`}
          </Banner>
        )}
        {goldLeft !== null && <CoinPurse coins={{ gp: goldLeft }} />}
      </section>
    </Parchment>
  );
}
