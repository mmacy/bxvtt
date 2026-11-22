import { useEquipmentCatalog, useRulesEntry, type ClassDetail } from '@/app';
import type { ClassDefinition } from '@bxvtt/shared/bxapi';
import { abilityLabel, formatInteger, languageLabel, ordinal, saveLabel } from '@bxvtt/shared/text';
import { Button, Icon, classIconNames } from '@/ui';
import { EntryFrame } from '../Frame';
import { useIndexState } from '../indexState';
import { Block, EntryLink, EntryPage, Inline, Nothing, Prose, ScrollTable, Stat } from '../Parts';
import { useNavigation } from '../navigation';
import { spellListLabel } from '../search';
import { TurningTable } from '../tables/CombatTables';
import styles from '../book.module.css';
import { titleFromId } from '../model';
import { formatPercentModifier, stripMarkup } from '../typeset';

const SAVE_ORDER = ['death', 'wands', 'paralysis', 'breath', 'spells'] as const;
const SAVE_LETTERS = { death: 'D', wands: 'W', paralysis: 'P', breath: 'B', spells: 'S' } as const;

export function classIcon(classId: string) {
  const key = classId.replace(/_/g, '-') as keyof typeof classIconNames;
  return classIconNames[key] ?? 'shield';
}

export function formatRequirements(
  requirements: Partial<Record<string, number>>,
  style: 'full' | 'short' = 'full',
): string {
  const parts = Object.entries(requirements)
    .filter((entry): entry is [string, number] => typeof entry[1] === 'number')
    .map(([ability, score]) => `${abilityLabel(ability, style)} ${score}`);
  return parts.length === 0 ? 'None' : parts.join(', ');
}

function armourText(policy: ClassDefinition['armour']): string {
  const shields = policy.shields_allowed ? 'shields allowed' : 'no shields';
  switch (policy.kind) {
    case 'any':
      return `Any armour, ${shields}`;
    case 'none':
      return 'No armour and no shields';
    case 'leather_only':
      return `Leather armour only, ${shields}`;
    default:
      return `${titleFromId(policy.kind)}, ${shields}`;
  }
}

const SKILL_LABELS: Record<string, string> = {
  climb_sheer_surfaces: 'Climb sheer surfaces',
  find_remove_treasure_traps: 'Find or remove treasure traps',
  hear_noise: 'Hear noise',
  hide_in_shadows: 'Hide in shadows',
  move_silently: 'Move silently',
  open_locks: 'Open locks',
  pick_pockets: 'Pick pockets',
};

function ThiefSkills({ definition }: { definition: ClassDefinition }) {
  const columns = Object.keys(definition.thief_skills[0] ?? {}).filter((key) => key !== 'level');
  return (
    <Block title="Thief skills" id="thief-skills">
      <ScrollTable label="Thief skills by level">
        <table className={styles.ruleTable}>
          <caption className="visually-hidden">Thief skill chances by level</caption>
          <thead>
            <tr>
              <th scope="col">Level</th>
              {columns.map((column) => (
                <th key={column} scope="col" className={styles.num}>
                  {SKILL_LABELS[column] ?? titleFromId(column)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {definition.thief_skills.map((row) => (
              <tr key={row.level}>
                <th scope="row">{row.level}</th>
                {columns.map((column) => {
                  const value = (row as unknown as Record<string, number>)[column] ?? 0;
                  return (
                    <td key={column} className={styles.num}>
                      {column === 'hear_noise' ? `${value} in 6` : `${value}%`}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollTable>
    </Block>
  );
}

function Progression({ definition }: { definition: ClassDefinition }) {
  const rows = definition.progression;
  const spellColumns = Math.max(0, ...rows.map((row) => row.spell_slots.length));
  const casts = rows.some((row) => row.spell_slots.some((slots) => slots > 0));
  const showSpells = casts && spellColumns > 0;
  const hasTitles = definition.level_titles.length > 0;
  const fixedHp = rows.some((row) => !row.hit_dice.con_applies);
  return (
    <Block title="Level progression" id="progression">
      <ScrollTable label={`${definition.name} level progression`}>
        <table className={styles.ruleTable}>
          <caption className="visually-hidden">{definition.name} level progression</caption>
          <thead>
            <tr>
              <th scope="col" rowSpan={2}>
                Level
              </th>
              {hasTitles && (
                <th scope="col" rowSpan={2}>
                  Title
                </th>
              )}
              <th scope="col" rowSpan={2} className={styles.num}>
                Experience
              </th>
              <th scope="col" rowSpan={2} className={styles.num}>
                Hit dice
              </th>
              <th scope="col" rowSpan={2} className={styles.num}>
                THAC0
              </th>
              <th scope="colgroup" colSpan={5} className={styles.group}>
                Saving throws
              </th>
              {showSpells && (
                <th scope="colgroup" colSpan={spellColumns} className={styles.group}>
                  Spells by spell level
                </th>
              )}
            </tr>
            <tr>
              {SAVE_ORDER.map((save) => (
                <th key={save} scope="col" className={styles.num}>
                  <abbr title={saveLabel(save)}>{SAVE_LETTERS[save]}</abbr>
                </th>
              ))}
              {showSpells &&
                Array.from({ length: spellColumns }, (_, index) => (
                  <th key={index} scope="col" className={styles.num}>
                    {ordinal(index + 1)}
                  </th>
                ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.level}>
                <th scope="row">{row.level}</th>
                {hasTitles && <td>{definition.level_titles[row.level - 1] ?? <Nothing />}</td>}
                <td className={styles.num}>{formatInteger(row.xp)}</td>
                <td className={styles.num}>
                  {row.hit_dice.count}d{row.hit_dice.die}
                  {row.hit_dice.bonus > 0 ? `+${row.hit_dice.bonus}` : ''}
                  {!row.hit_dice.con_applies ? '*' : ''}
                </td>
                <td className={styles.num}>{row.thac0}</td>
                {SAVE_ORDER.map((save) => (
                  <td key={save} className={styles.num}>
                    {row.saves[save]}
                  </td>
                ))}
                {showSpells &&
                  Array.from({ length: spellColumns }, (_, index) => {
                    const slots = row.spell_slots[index] ?? 0;
                    return (
                      <td key={index} className={styles.num}>
                        {slots > 0 ? slots : <Nothing />}
                      </td>
                    );
                  })}
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollTable>
      <p className={styles.footnote}>
        Saving throws:{' '}
        {SAVE_ORDER.map((save) => `${SAVE_LETTERS[save]} for ${saveLabel(save).toLowerCase()}`).join(', ')}.
      </p>
      {fixedHp && (
        <p className={styles.footnote}>
          * Hit points past this level are a fixed number. Constitution modifiers no longer apply.
        </p>
      )}
    </Block>
  );
}

function experienceTable(definition: ClassDefinition) {
  return (
    <Block title="Experience modifiers" id="experience">
      <ScrollTable label="Experience modifiers by prime requisite">
        <table className={styles.ruleTable}>
          <caption className="visually-hidden">Experience modifiers by prime requisite score</caption>
          <thead>
            <tr>
              <th scope="col">Prime requisite scores</th>
              <th scope="col" className={styles.num}>
                Experience modifier
              </th>
            </tr>
          </thead>
          <tbody>
            {definition.xp_tiers.map((tier, index) => (
              <tr key={index}>
                <td>
                  {Object.entries(tier.minimums)
                    .map(([ability, score]) => `${abilityLabel(ability)} ${score} or more`)
                    .join(' and ')}
                </td>
                <td className={styles.num}>{formatPercentModifier(tier.modifier_pct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollTable>
    </Block>
  );
}

/** A class with its requirements, abilities, and level progression. */
export function ClassEntry({ id }: { id: string }) {
  const result = useRulesEntry<ClassDetail>(`classes/${id}`);
  const equipment = useEquipmentCatalog();
  const { go } = useNavigation();
  const setIndex = useIndexState((s) => s.set);
  const weaponLink = (weaponId: string) => (
    <EntryLink key={weaponId} kind="equipment" id={weaponId}>
      {equipment.data?.find((item) => item.id === weaponId)?.name ?? titleFromId(weaponId)}
    </EntryLink>
  );

  return (
    <EntryFrame result={result} label="this class" section="classes">
      {(definition) => {
        const weapons = definition.weapons;
        const turns = definition.abilities.some((ability) => ability.tag === 'turn_undead');
        return (
          <EntryPage
            kicker={definition.race === 'human' ? 'Class' : `${titleFromId(definition.race)} class`}
            title={
              <span className={styles.titleWithIcon}>
                <Icon name={classIcon(definition.id)} size={32} />
                {definition.name}
              </span>
            }
          >
            <section className={styles.factSheet} aria-label="Class facts">
              <dl className={styles.statGrid}>
                <Stat label="Hit die">
                  <span className={styles.big}>d{definition.hit_die}</span>
                </Stat>
                <Stat label="Maximum level">
                  <span className={styles.big}>{definition.max_level}</span>
                </Stat>
                <Stat label="Prime requisites">
                  {definition.prime_requisites.map((ability) => abilityLabel(ability)).join(' and ')}
                </Stat>
                <Stat label="Minimum scores">{formatRequirements(definition.requirements)}</Stat>
                <Stat label="Armour" span={2}>
                  {armourText(definition.armour)}
                </Stat>
                <Stat label="Weapons" span={2}>
                  {weapons.kind === 'any' && 'Any weapon'}
                  {weapons.kind === 'allowed' && (
                    <>
                      Only <Inline items={weapons.weapon_ids.map(weaponLink)} />
                    </>
                  )}
                  {weapons.kind === 'forbidden' && (
                    <>
                      Any weapon except <Inline items={weapons.weapon_ids.map(weaponLink)} />
                    </>
                  )}
                  {weapons.manual_notes.map((note) => (
                    <span key={note} className={styles.statNote}>
                      {stripMarkup(note)}
                    </span>
                  ))}
                </Stat>
                <Stat label="Languages" span="full">
                  <Inline
                    items={definition.languages.map((language) => (
                      <EntryLink key={language} kind="languages" id={language}>
                        {languageLabel(language)}
                      </EntryLink>
                    ))}
                  />
                </Stat>
                {definition.may_not_lower.length > 0 && (
                  <Stat label="Cannot lower" span="full">
                    {definition.may_not_lower.map((ability) => abilityLabel(ability)).join(', ')}
                  </Stat>
                )}
              </dl>
            </section>

            {definition.abilities.length > 0 && (
              <Block title="Abilities">
                <dl className={styles.abilityList}>
                  {definition.abilities.map((ability) => {
                    const list = ability.params['spell_list'];
                    return (
                      <div key={ability.tag} className={styles.ability}>
                        <dt>{stripMarkup(ability.name)}</dt>
                        <dd>
                          <Prose text={ability.prose} />
                          {typeof list === 'string' && (
                            <Button
                              size="sm"
                              variant="secondary"
                              icon="spell"
                              onClick={() => {
                                setIndex({ spells: { list, level: 'all', query: '' } });
                                go({ page: 'section', section: 'spells' });
                              }}
                            >
                              {spellListLabel(list)} spell list
                            </Button>
                          )}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              </Block>
            )}

            <Progression definition={definition} />
            {definition.thief_skills.length > 0 && <ThiefSkills definition={definition} />}
            {turns && (
              <Block title="Turning the undead" id="turning">
                <TurningTable />
              </Block>
            )}
            {experienceTable(definition)}
          </EntryPage>
        );
      }}
    </EntryFrame>
  );
}
