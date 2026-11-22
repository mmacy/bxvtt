import { useMonsterCatalog, type SpellDetail } from '@/app';
import type { SpellMode } from '@bxvtt/shared/bxapi';
import { ordinal } from '@bxvtt/shared/text';
import { Button } from '@/ui';
import { useEntry, useFullCatalog } from '../catalogs';
import { EntryFrame } from '../Frame';
import { useIndexState } from '../indexState';
import { Block, EntryLink, EntryPage, Inline, Prose, Stat } from '../Parts';
import { useNavigation } from '../navigation';
import { spellListLabel } from '../search';
import styles from '../book.module.css';
import { proseLines, stripMarkup } from '../typeset';
import { MonsterBody } from './MonsterEntry';

function Modes({ modes }: { modes: readonly SpellMode[] }) {
  return (
    <ol className={styles.modeList}>
      {modes.map((mode, index) => (
        <li key={`${mode.key}-${index}`}>
          <Prose text={mode.prose} />
        </li>
      ))}
    </ol>
  );
}

/** Which of the page's lines to show, given that a one-usage page repeats its opening in the usage. */
function bodyFor(spell: SpellDetail): { intro: string[]; modes: SpellMode[] } {
  const intro = proseLines(spell.intro);
  const [only] = spell.modes;
  if (spell.modes.length === 1 && only) {
    const text = stripMarkup(only.prose);
    const first = intro.join(' ');
    return { intro: first !== '' && text.startsWith(first) ? [] : intro, modes: [only] };
  }
  return { intro, modes: [...spell.modes] };
}

/** A spell with its list and level, range, duration, usages, and reversed form. */
export function SpellEntry({ id }: { id: string }) {
  const result = useEntry('spells', id);
  const monsters = useMonsterCatalog();
  const classes = useFullCatalog('classes');
  const { go } = useNavigation();
  const setIndex = useIndexState((s) => s.set);

  return (
    <EntryFrame result={result} label="this spell" section="spells">
      {(spell) => {
        const body = bodyFor(spell);
        const reversed = spell.reversed_form;
        const casters = (classes.data ?? []).filter((definition) =>
          definition.abilities.some((ability) => ability.params['spell_list'] === spell.spell_list),
        );
        const listName = spellListLabel(spell.spell_list);
        return (
          <EntryPage
            kicker={`${listName} spell, ${ordinal(spell.level)} level`}
            title={spell.name}
            badges={null}
          >
            <section className={styles.factSheet} aria-label="Spell facts">
              <dl className={styles.statGrid}>
                <Stat label="Spell list">
                  <Button
                    variant="secondary"
                    size="sm"
                    icon="spell"
                    className={styles.listButton}
                    onClick={() => {
                      setIndex({ spells: { list: spell.spell_list, level: String(spell.level), query: '' } });
                      go({ page: 'section', section: 'spells' });
                    }}
                  >
                    {listName} spells
                  </Button>
                </Stat>
                <Stat label="Level">
                  <span className={styles.big}>{spell.level}</span>
                </Stat>
                <Stat label="Range">{spell.range}</Stat>
                <Stat label="Duration">{spell.duration}</Stat>
                {casters.length > 0 && (
                  <Stat label="Cast by" span="full">
                    <Inline
                      items={casters.map((definition) => (
                        <EntryLink key={definition.id} kind="classes" id={definition.id}>
                          {definition.name}
                        </EntryLink>
                      ))}
                    />
                  </Stat>
                )}
                {reversed && (
                  <Stat label="Reversed form" span="full">
                    {reversed.name}
                  </Stat>
                )}
              </dl>
            </section>

            <div className={styles.spellText}>
              {body.intro.length > 0 && <Prose lines={body.intro} />}
              {body.modes.length === 1 && body.modes[0] ? (
                <Prose text={body.modes[0].prose} />
              ) : (
                <Modes modes={body.modes} />
              )}
            </div>

            {reversed && (
              <Block title={`Reversed: ${reversed.name}`}>
                {reversed.modes.length > 1 ? (
                  <Modes modes={reversed.modes} />
                ) : (
                  <Prose text={reversed.prose} />
                )}
                {reversed.duration && (
                  <Prose lines={[`Duration: ${reversed.duration}`]} className={styles.afterProse} />
                )}
              </Block>
            )}

            {spell.conjured_monster_ids.length > 0 && (
              <Block title="Creatures it conjures">
                <ul className={styles.plainList}>
                  {spell.conjured_monster_ids.map((monsterId) => {
                    const name = monsters.data?.find((m) => m.id === monsterId)?.name;
                    return (
                      <li key={monsterId}>
                        <EntryLink kind="monsters" id={monsterId}>
                          {name ?? 'Monster'}
                        </EntryLink>
                      </li>
                    );
                  })}
                </ul>
              </Block>
            )}

            {spell.conjured_monsters.map((monster) => (
              <Block key={monster.id} title={monster.name}>
                <MonsterBody monster={monster} />
              </Block>
            ))}
          </EntryPage>
        );
      }}
    </EntryFrame>
  );
}
