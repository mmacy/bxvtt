import { useRulesEntry, type MonsterDetail } from '@/app';
import { alignmentLabel, formatInteger, saveLabel, signed } from '@bxvtt/shared/text';
import { Badge } from '@/ui';
import { EntryFrame } from '../Frame';
import { titleFromId } from '../model';
import { Block, EntryLink, EntryPage, Inline, Prose, Stat } from '../Parts';
import styles from '../book.module.css';
import {
  defenceLines,
  formatAlignmentSpec,
  formatArmourClass,
  formatAttackRoutine,
  formatHitDice,
  formatMovement,
  formatNumberAppearing,
  formatSaveAs,
  formatXpNotes,
  hitPointsNote,
  routineUseLabel,
  stripMarkup,
  treasureLine,
} from '../typeset';

const SAVE_ORDER = ['death', 'wands', 'paralysis', 'breath', 'spells'] as const;

const CATEGORY_LABELS: Record<string, string> = {
  person: 'Person',
  enchanted: 'Enchanted',
  undead: 'Undead',
};

export function monsterCategoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? titleFromId(category);
}

/** The stat block of one monster: the grid of numbers, then abilities and defences. Spell pages reuse it. */
export function MonsterBody({ monster }: { monster: MonsterDetail }) {
  const hp = hitPointsNote(monster.hit_dice);
  const treasure = treasureLine(monster.treasure);
  const dungeon = monster.number_appearing.dungeon;
  const lair = monster.number_appearing.lair;
  const defences = defenceLines(monster.defenses);
  return (
    <>
      <section className={styles.statBlock} aria-label={`${monster.name} stat block`}>
        <dl className={styles.statGrid}>
          <Stat label="Armour class">
            <span className={styles.big}>{formatArmourClass(monster.ac, monster.ac_ascending)}</span>
            {monster.ac_alternates.map((alt, index) => (
              <span key={index} className={styles.statNote}>
                {formatArmourClass(alt.ac, alt.ac_ascending)}
                {alt.condition ? ` ${alt.condition}` : ' for some'}
              </span>
            ))}
          </Stat>
          <Stat label="Hit dice">
            <span className={styles.big}>{formatHitDice(monster.hit_dice)}</span>
            {hp && <span className={styles.statNote}>{hp}</span>}
          </Stat>
          <Stat label="THAC0">
            <span className={styles.big}>{monster.thac0}</span>
            <span className={styles.statNote}>attack bonus {signed(monster.attack_bonus)}</span>
          </Stat>
          <Stat label="Movement">
            {monster.movement.map((mode, index) => (
              <span key={index} className={index === 0 ? styles.big : styles.statNote}>
                {formatMovement(mode)}
              </span>
            ))}
          </Stat>
          <Stat label="Attacks" span="full">
            <ul className={styles.attackList}>
              {monster.attacks.map((routine, index) => (
                <li key={index}>
                  {routine.use !== 'primary' && (
                    <span className={styles.routineUse}>{routineUseLabel(routine.use)}: </span>
                  )}
                  {formatAttackRoutine(routine)}
                </li>
              ))}
              {monster.attacks.length === 0 && <li>None</li>}
            </ul>
          </Stat>
          <Stat label="Saving throws" span="full">
            <div className={styles.saves}>
              {SAVE_ORDER.map((save) => (
                <div key={save} className={styles.save}>
                  <span className={styles.saveLabel} title={saveLabel(save)}>
                    {saveLabel(save, 'short')}
                  </span>
                  <span className={styles.saveValue}>{monster.saves.values[save]}</span>
                </div>
              ))}
            </div>
            <span className={styles.statNote}>Saves as {formatSaveAs(monster.saves.save_as)}</span>
          </Stat>
          <Stat label="Morale">
            <span className={styles.big}>{monster.morale ?? 'None'}</span>
            {monster.morale_alternates.map((alt, index) => (
              <span key={index} className={styles.statNote}>
                {alt.score} ({alt.condition})
              </span>
            ))}
          </Stat>
          <Stat label="Alignment">{formatAlignmentSpec(monster.alignment)}</Stat>
          <Stat label="Experience">
            <span className={styles.big}>{formatInteger(monster.xp)} XP</span>
            {monster.xp_notes.length > 0 && (
              <span className={styles.statNote}>{formatXpNotes(monster.xp_notes)}</span>
            )}
          </Stat>
          <Stat label="Number appearing">
            <span className={styles.big}>{formatNumberAppearing(dungeon)}</span>
            <span className={styles.statNote}>in a dungeon, {formatNumberAppearing(lair)} in a lair</span>
          </Stat>
          <Stat label="Treasure type">
            {treasure.letters.length === 0 && treasure.parenthetical.length === 0 ? (
              <span className={styles.big}>None</span>
            ) : (
              <span className={styles.big}>
                <Inline
                  items={treasure.letters.map((letter) => (
                    <EntryLink
                      key={letter}
                      kind="tables"
                      id="treasure"
                      anchor={`type-${letter}`}
                      title={`Treasure type ${letter}`}
                    >
                      {letter}
                    </EntryLink>
                  ))}
                />
                {treasure.parenthetical.length > 0 && (
                  <>
                    {' ('}
                    <Inline
                      items={treasure.parenthetical.map((letter) => (
                        <EntryLink
                          key={letter}
                          kind="tables"
                          id="treasure"
                          anchor={`type-${letter}`}
                          title={`Treasure type ${letter}`}
                        >
                          {letter}
                        </EntryLink>
                      ))}
                    />
                    {')'}
                  </>
                )}
              </span>
            )}
            {treasure.parenthetical.length > 0 && (
              <span className={styles.statNote}>Letters in brackets are lair treasure</span>
            )}
            {treasure.notes.map((note) => (
              <span key={note} className={styles.statNote}>
                {note}
              </span>
            ))}
          </Stat>
        </dl>
      </section>

      {monster.abilities.length > 0 && (
        <Block title="Abilities">
          <dl className={styles.abilityList}>
            {monster.abilities.map((ability, index) => (
              <div key={`${ability.tag}-${index}`} className={styles.ability}>
                <dt>{stripMarkup(ability.name)}</dt>
                <dd>
                  <Prose text={ability.prose} />
                </dd>
              </div>
            ))}
          </dl>
        </Block>
      )}

      {defences.length > 0 && (
        <Block title="Defences">
          <ul className={styles.plainList}>
            {defences.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </Block>
      )}
    </>
  );
}

/** A monster as a classic B/X stat block, followed by its abilities and description. */
export function MonsterEntry({ id }: { id: string }) {
  const result = useRulesEntry<MonsterDetail>(`monsters/${id}`);
  return (
    <EntryFrame result={result} label="this monster" section="monsters">
      {(monster) => (
        <EntryPage
          kicker="Monster"
          title={monster.name}
          badges={
            <>
              <Badge tone="neutral" appearance="outline">
                {monster.alignment.options.length === 3
                  ? 'Any alignment'
                  : monster.alignment.options.map(alignmentLabel).join(' or ')}
              </Badge>
              {monster.categories.map((category) => (
                <Badge key={category} tone="neutral" appearance="soft">
                  {monsterCategoryLabel(category)}
                </Badge>
              ))}
            </>
          }
          lede={stripMarkup(monster.intro)}
        >
          <MonsterBody monster={monster} />
        </EntryPage>
      )}
    </EntryFrame>
  );
}
