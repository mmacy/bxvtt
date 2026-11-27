import type { Language, SpellSummary } from '@bxvtt/shared/bxapi';
import {
  alignmentDescription,
  alignmentLabel,
  capitalizeFirst,
  classInSentence,
  classLabel,
  joinList,
  languageLabel,
  withArticle,
} from '@bxvtt/shared/text';
import { useState } from 'react';
import type { ClassDetail } from '@/app';
import { Badge, Checkbox, IconButton, Popover, RadioGroup, Skeleton, cx } from '@/ui';
import { spellDuration, spellRange, withoutPointers } from '../sheet/spellText';
import { ALIGNMENTS, type Alignment } from './draft';
import type { ClassMagic } from './tables';
import { RuleLink } from '../sheet/RuleLink';
import styles from './wizard.module.css';
import { useSpellDetail } from '../sheet/catalogs';

export interface IdentityStepProps {
  alignment: Alignment | null;
  onAlignment: (alignment: Alignment) => void;
  detail: ClassDetail | null;
  /** How many extra languages the intelligence table lists for the character's INT. */
  extraLanguages: number;
  languages: string[];
  onLanguages: (ids: string[]) => void;
  languageCatalog: Language[] | null;
  magic: ClassMagic | null;
  /** How many first-level spells the book starts with, from the class's progression table. */
  bookSize: number;
  spells: string[];
  onSpells: (ids: string[]) => void;
  spellCatalog: SpellSummary[] | null;
  /** Shows what is missing after the player tried to continue. */
  showErrors: boolean;
}

const ALIGNMENT_NOTES: Record<Alignment, string> = {
  lawful: 'Keeps their word, protects others, and stands for order and the common good.',
  neutral: 'Looks out for themselves and their friends, and sides with neither law nor chaos.',
  chaotic: 'Follows their own desires, trusts strength over law, and keeps faith only when it suits them.',
};

function SpellCard({
  spell,
  selected,
  disabled,
  onToggle,
}: {
  spell: SpellSummary;
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const [open, setOpen] = useState(false);
  const detail = useSpellDetail(open ? spell.id : null);
  return (
    <div className={cx(styles.spellChoice, selected && styles.spellChoiceSelected)}>
      <button
        type="button"
        className={styles.spellPick}
        aria-pressed={selected}
        disabled={disabled && !selected}
        onClick={onToggle}
      >
        <span className={styles.spellName}>{spell.name}</span>
        <span className={styles.spellMeta}>
          {spellRange(spell.range)} · {spellDuration(spell.duration)}
        </span>
      </button>
      <Popover
        open={open}
        onOpenChange={setOpen}
        title={spell.name}
        width="320px"
        trigger={<IconButton icon="info" label={`About ${spell.name}`} variant="ghost" size="sm" />}
      >
        {detail.loading || !detail.data ? (
          <Skeleton lines={4} />
        ) : (
          <div className={styles.spellProse}>
            {detail.data.intro && <p>{withoutPointers(detail.data.intro)}</p>}
            {detail.data.modes.map((mode) => (
              <p key={mode.key}>{withoutPointers(mode.prose)}</p>
            ))}
            <p>
              <RuleLink entry={{ kind: 'spells', id: spell.id }}>{spell.name}</RuleLink>
            </p>
          </div>
        )}
      </Popover>
    </div>
  );
}

/** Step 4: the alignment, extra languages, and an arcane caster's first spell. */
export function IdentityStep(props: IdentityStepProps) {
  const {
    alignment,
    onAlignment,
    detail,
    extraLanguages,
    languages,
    onLanguages,
    languageCatalog,
    magic,
    bookSize,
    spells,
    onSpells,
    spellCatalog,
    showErrors,
  } = props;
  const native = detail?.languages ?? [];
  const choosable = (languageCatalog ?? []).filter((l) => l.choosable && !native.includes(l.id));
  const firstSpells =
    magic?.kind === 'arcane'
      ? (spellCatalog ?? []).filter((s) => s.spell_list === magic.spellList && s.level === 1)
      : [];
  const className = detail ? classInSentence(classLabel(detail.id)) : 'character';

  return (
    <div className={styles.identityGrid}>
      <div className={styles.identityColumn}>
        <fieldset className={styles.fieldset}>
          <legend className={styles.subTitle}>Alignment</legend>
          <RadioGroup
            aria-label="Alignment"
            value={alignment ?? ''}
            onValueChange={(value) => {
              const next = ALIGNMENTS.find((a) => a === value);
              if (next) onAlignment(next);
            }}
            options={ALIGNMENTS.map((a) => ({
              value: a,
              label: alignmentLabel(a),
              description: ALIGNMENT_NOTES[a] ?? alignmentDescription(a),
            }))}
          />
          {showErrors && alignment === null && <p className={styles.fieldError}>Choose an alignment.</p>}
        </fieldset>
      </div>

      <div className={styles.identityColumn}>
        <section className={styles.fieldset} aria-labelledby="wizard-languages">
          <div className={styles.rowBetween}>
            <h3 id="wizard-languages" className={styles.subTitle}>
              Languages
            </h3>
            {extraLanguages > 0 && (
              <Badge tone={languages.length === extraLanguages ? 'success' : 'neutral'}>
                {languages.length} of {extraLanguages} chosen
              </Badge>
            )}
          </div>
          <p className={styles.prose}>
            {capitalizeFirst(withArticle(className))} speaks{' '}
            {joinList([
              ...(native.length > 0 ? native.map((id) => languageLabel(id)) : ['Common']),
              'the alignment tongue',
            ])}
            .
          </p>
          {extraLanguages > 0 && (
            <>
              <p id="wizard-extra-languages" className={styles.muted}>
                Extra languages
              </p>
              <div className={styles.languageGrid} role="group" aria-labelledby="wizard-extra-languages">
                {choosable.map((language) => {
                  const checked = languages.includes(language.id);
                  return (
                    <Checkbox
                      key={language.id}
                      label={language.name}
                      checked={checked}
                      disabled={!checked && languages.length >= extraLanguages}
                      onCheckedChange={(next) =>
                        onLanguages(
                          next ? [...languages, language.id] : languages.filter((id) => id !== language.id),
                        )
                      }
                    />
                  );
                })}
              </div>
            </>
          )}
        </section>

        {magic?.kind === 'arcane' && (
          <section className={styles.fieldset} aria-labelledby="wizard-spells">
            <div className={styles.rowBetween}>
              <h3 id="wizard-spells" className={styles.subTitle}>
                First {bookSize === 1 ? 'spell' : 'spells'}
              </h3>
              <Badge tone={spells.length === bookSize ? 'success' : 'magic'}>
                {spells.length} of {bookSize} chosen
              </Badge>
            </div>
            {showErrors && spells.length !== bookSize && (
              <p className={styles.fieldError}>
                Choose {bookSize === 1 ? 'a spell' : `${bookSize} spells`} for your spell book.
              </p>
            )}
            {spellCatalog === null ? (
              <Skeleton lines={4} />
            ) : (
              <div className={styles.spellChoices}>
                {firstSpells.map((spell) => {
                  const selected = spells.includes(spell.id);
                  return (
                    <SpellCard
                      key={spell.id}
                      spell={spell}
                      selected={selected}
                      disabled={bookSize > 1 && spells.length >= bookSize}
                      onToggle={() =>
                        onSpells(
                          selected
                            ? spells.filter((id) => id !== spell.id)
                            : bookSize === 1
                              ? [spell.id]
                              : [...spells, spell.id],
                        )
                      }
                    />
                  );
                })}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
