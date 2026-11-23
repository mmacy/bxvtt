import { useEquipmentCatalog, useMonsterCatalog, type MagicItemDetail } from '@/app';
import { classLabel, formatDice, joinList, signed } from '@bxvtt/shared/text';
import { Badge } from '@/ui';
import { useEntry } from '../catalogs';
import { EntryFrame } from '../Frame';
import { Block, EntryLink, EntryPage, Inline, Prose, Stat } from '../Parts';
import { TreasureLines } from '../tables/TreasureTables';
import styles from '../book.module.css';
import { titleFromId } from '../model';
import { formatArmourClass, formatWeight, isNumber, magicCategoryLabel } from '../typeset';
import { monsterCategoryLabel } from './MonsterEntry';

function UsableBy({ usable }: { usable: MagicItemDetail['usable_by'] }) {
  if (usable.kind === 'classes' && usable.class_ids.length > 0) {
    return (
      <Inline
        items={usable.class_ids.map((classId) => (
          <EntryLink key={classId} kind="classes" id={classId}>
            {classLabel(classId)}
          </EntryLink>
        ))}
      />
    );
  }
  if (usable.kind === 'caster') {
    return (
      <>
        {usable.caster === 'any'
          ? 'Any spell caster'
          : `${titleFromId(usable.caster ?? 'any')} spell casters`}
      </>
    );
  }
  return <>Any character</>;
}

/** A magic item with its bonuses, restrictions, and the full text of its page. */
export function MagicItemEntry({ id }: { id: string }) {
  const result = useEntry('magic-items', id);
  const monsters = useMonsterCatalog();
  const equipment = useEquipmentCatalog();
  const equipmentName = (baseId: string) =>
    equipment.data?.find((entry) => entry.id === baseId)?.name ?? titleFromId(baseId);
  return (
    <EntryFrame result={result} label="this magic item" section="magic-items">
      {(item) => {
        const monsterName = (monsterId: string) =>
          monsters.data?.find((m) => m.id === monsterId)?.name ?? titleFromId(monsterId);
        const bonuses: [string, string][] = [];
        if (item.attack_bonus !== 0) bonuses.push(['Attack bonus', signed(item.attack_bonus)]);
        if (item.damage_bonus !== 0) bonuses.push(['Damage bonus', signed(item.damage_bonus)]);
        if (item.ac_bonus !== 0) bonuses.push(['Armour class bonus', signed(item.ac_bonus)]);
        return (
          <EntryPage
            kicker={`Magic item, ${magicCategoryLabel(item.category).toLowerCase()}`}
            title={item.name}
            badges={
              <>
                {item.cursed && <Badge tone="danger">Cursed</Badge>}
                {item.always_active && <Badge tone="info">Always active</Badge>}
              </>
            }
          >
            <section className={styles.factSheet} aria-label="Item facts">
              <dl className={styles.statGrid}>
                <Stat label="Usable by" span={2}>
                  <UsableBy usable={item.usable_by} />
                </Stat>
                {item.base_item_id && (
                  <Stat label="Made from">
                    <EntryLink kind="equipment" id={item.base_item_id}>
                      {equipmentName(item.base_item_id)}
                    </EntryLink>
                  </Stat>
                )}
                {bonuses.map(([label, value]) => (
                  <Stat key={label} label={label}>
                    <span className={styles.big}>{value}</span>
                  </Stat>
                ))}
                {isNumber(item.ac_set) && (
                  <Stat label="Sets armour class to">
                    <span className={styles.big}>
                      {formatArmourClass(item.ac_set, item.ac_set_ascending)}
                    </span>
                  </Stat>
                )}
                {item.charges_dice && (
                  <Stat label="Charges">
                    <span className={styles.big}>{formatDice(item.charges_dice)}</span>
                    <span className={styles.statNote}>when found</span>
                  </Stat>
                )}
                {item.quantity_dice && (
                  <Stat label="Found in a group of">
                    <span className={styles.big}>{formatDice(item.quantity_dice)}</span>
                  </Stat>
                )}
                {item.weight_coins > 0 && <Stat label="Weight">{formatWeight(item.weight_coins)}</Stat>}
              </dl>
            </section>

            {item.manual.length > 0 && (
              <Block title="Description">
                <Prose lines={item.manual} />
              </Block>
            )}

            {item.versus.length > 0 && (
              <Block title="Bonuses against particular enemies">
                <ul className={styles.plainList}>
                  {item.versus.map((clause) => (
                    <li key={clause.label}>
                      <strong>{signed(clause.bonus)}</strong> against {clause.label.toLowerCase()}
                      {clause.categories.length > 0 && (
                        <span className={styles.statNote}>
                          Any {joinList(clause.categories.map((c) => monsterCategoryLabel(c).toLowerCase()))}{' '}
                          creature
                        </span>
                      )}
                      {clause.template_ids.length > 0 && (
                        <span className={styles.statNote}>
                          <Inline
                            items={clause.template_ids.map((monsterId) => (
                              <EntryLink key={monsterId} kind="monsters" id={monsterId}>
                                {monsterName(monsterId)}
                              </EntryLink>
                            ))}
                          />
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </Block>
            )}

            {item.curses.length > 0 && (
              <Block title="Example curses" count={item.curses.length}>
                <dl className={styles.abilityList}>
                  {item.curses.map((curse) => (
                    <div key={curse.id} className={styles.ability}>
                      <dt>{curse.name}</dt>
                      <dd>
                        <Prose text={curse.prose} />
                      </dd>
                    </div>
                  ))}
                </dl>
              </Block>
            )}

            {item.hoard_recipe.length > 0 && (
              <Block title="Hoard contents">
                <TreasureLines entries={item.hoard_recipe} />
              </Block>
            )}
          </EntryPage>
        );
      }}
    </EntryFrame>
  );
}
