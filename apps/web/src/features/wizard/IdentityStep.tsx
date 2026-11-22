import type { Language, SpellSummary } from '@bxvtt/shared/bxapi';
import { alignmentDescription, alignmentLabel, classLabel, languageLabel } from '@bxvtt/shared/text';
import { useState } from 'react';
import { displayStringProblem, useRulesEntry, type ClassDetail, type SpellDetail } from '@/app';
import {
  Badge,
  Button,
  Checkbox,
  Field,
  IconButton,
  Popover,
  RadioGroup,
  Skeleton,
  TextInput,
  cx,
} from '@/ui';
import { ALIGNMENTS, type Alignment } from './draft';
import { suggestName } from './names';
import type { ClassMagic } from './tables';
import styles from './wizard.module.css';

export interface IdentityStepProps {
  name: string;
  onName: (name: string) => void;
  alignment: Alignment | null;
  onAlignment: (alignment: Alignment) => void;
  detail: ClassDetail | null;
  /** How many extra languages the intelligence table lists for the character's INT. */
  extraLanguages: number;
  intelligence: number;
  languages: string[];
  onLanguages: (ids: string[]) => void;
  languageCatalog: Language[] | null;
  magic: ClassMagic | null;
  /** How many first-level spells the book starts with, from the class's progression table. */
  bookSize: number;
  spells: string[];
  onSpells: (ids: string[]) => void;
  spellCatalog: SpellSummary[] | null;
  /** Shows the name's problem after the player tried to continue. */
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
  const detail = useRulesEntry<SpellDetail>(open ? `spells/${spell.id}` : null);
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
          Range {spell.range} · {spell.duration}
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
            {detail.data.intro && <p>{detail.data.intro}</p>}
            {detail.data.modes.map((mode) => (
              <p key={mode.key}>{mode.prose}</p>
            ))}
          </div>
        )}
      </Popover>
    </div>
  );
}

/** Step 4: the name, the alignment, extra languages, and an arcane caster's first spell. */
export function IdentityStep(props: IdentityStepProps) {
  const {
    name,
    onName,
    alignment,
    onAlignment,
    detail,
    extraLanguages,
    intelligence,
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
  const nameProblem = displayStringProblem(name, 100);
  const native = detail?.languages ?? [];
  const choosable = (languageCatalog ?? []).filter((l) => l.choosable && !native.includes(l.id));
  const firstSpells =
    magic?.kind === 'arcane'
      ? (spellCatalog ?? []).filter((s) => s.spell_list === magic.spellList && s.level === 1)
      : [];
  const className = detail ? classLabel(detail.id).toLowerCase() : 'character';

  return (
    <div className={styles.identityGrid}>
      <div className={styles.identityColumn}>
        <Field
          label="Name"
          hint="Up to 100 characters."
          error={showErrors && nameProblem ? nameProblem : undefined}
          required
        >
          <TextInput
            value={name}
            maxLength={100}
            autoComplete="off"
            onChange={(event) => onName(event.target.value)}
            end={
              <Button
                size="sm"
                variant="ghost"
                icon="dice"
                onClick={() => onName(suggestName(detail?.race, name, Math.random()))}
              >
                Suggest a name
              </Button>
            }
          />
        </Field>

        <fieldset className={styles.fieldset}>
          <legend className={styles.subTitle}>Alignment</legend>
          <RadioGroup
            aria-label="Alignment"
            value={alignment ?? undefined}
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
          <p className={styles.muted}>Each alignment has a secret tongue that its followers speak.</p>
        </fieldset>
      </div>

      <div className={styles.identityColumn}>
        <section className={styles.fieldset} aria-labelledby="wizard-languages">
          <h3 id="wizard-languages" className={styles.subTitle}>
            Languages
          </h3>
          <p className={styles.prose}>
            A {className} speaks{' '}
            {native.length > 0 ? native.map((id) => languageLabel(id)).join(', ') : 'Common'}, and the tongue
            of their alignment.
          </p>
          {extraLanguages > 0 ? (
            <>
              <p className={styles.muted}>
                An Intelligence of {intelligence} lets you learn {extraLanguages} more{' '}
                {extraLanguages === 1 ? 'language' : 'languages'}. Chosen: {languages.length} of{' '}
                {extraLanguages}.
              </p>
              <div className={styles.languageGrid}>
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
          ) : (
            <p className={styles.muted}>An Intelligence of {intelligence} allows no extra languages.</p>
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
            <p className={styles.muted}>
              Your spell book starts with{' '}
              {bookSize === 1 ? 'one first-level spell' : `${bookSize} first-level spells`}. Many referees
              choose it for you, so ask yours.
            </p>
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
        {magic?.kind === 'divine' && (
          <section className={styles.fieldset} aria-labelledby="wizard-divine">
            <h3 id="wizard-divine" className={styles.subTitle}>
              Spells
            </h3>
            <p className={styles.muted}>
              A {className} prays for spells each day instead of keeping a spell book, once their level gives
              them spell slots.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
