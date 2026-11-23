import { Divider } from '../components/Divider';
import { Parchment } from '../components/Surfaces';
import { Tabs, TabsList, TabsTrigger } from '../components/Tabs';
import { DataTable } from '../components/DataTable';
import { AcShield, CoinPurse, ConditionChip, HpBar, StatBox } from '../game/StatBlock';
import { TokenPortrait, type TokenSize } from '../game/TokenPortrait';
import { Caption, Grid, Row, Section, Specimen, Stack } from './parts';
import { party } from './sampleData';
import styles from './Gallery.module.css';

const sizes: TokenSize[] = [24, 32, 40, 48, 64, 96];

const abilities = [
  { abbreviation: 'STR', name: 'Strength', score: 8, modifier: -1 },
  { abbreviation: 'INT', name: 'Intelligence', score: 10, modifier: 0 },
  { abbreviation: 'WIS', name: 'Wisdom', score: 9, modifier: 0 },
  { abbreviation: 'DEX', name: 'Dexterity', score: 16, modifier: 2, prime: true },
  { abbreviation: 'CON', name: 'Constitution', score: 13, modifier: 1, prime: true },
  { abbreviation: 'CHA', name: 'Charisma', score: 11, modifier: 0 },
];

const saves = [
  { id: 'death', name: 'Death ray or poison', target: 8 },
  { id: 'wands', name: 'Magic wands', target: 9 },
  { id: 'paralysis', name: 'Paralysis or turn to stone', target: 10 },
  { id: 'breath', name: 'Dragon breath', target: 13 },
  { id: 'spells', name: 'Rods, staves, or spells', target: 12 },
];

export function GameSection() {
  const wren = party[2];
  return (
    <Section
      id="game"
      title="Game pieces"
      description="The components a sheet, the party list, and the battle tracker are built from. They display what bxapi reports and compute nothing."
    >
      <Specimen
        title="Token portraits"
        note="Procedural from the name: color, heraldic field, and initials. Characters are round, monsters square."
        wide
      >
        <Stack gap="lg">
          <Row gap="lg" align="end">
            {sizes.map((size) => (
              <div key={size} className={styles.tokenCell}>
                <TokenPortrait name="Flarg" characterClass="fighter" color="vermilion" size={size} />
                <Caption>{size}</Caption>
              </div>
            ))}
          </Row>
          <Row gap="lg">
            {party.map((c) => (
              <div key={c.id} className={styles.tokenCell}>
                <TokenPortrait name={c.name} characterClass={c.characterClass} color={c.color} size={64} />
                <Caption>{c.name.split(' ')[0]}</Caption>
              </div>
            ))}
          </Row>
          <Row gap="lg">
            <div className={styles.tokenCell}>
              <TokenPortrait
                name="Wren Underbough"
                characterClass="halfling"
                color="saffron"
                size={64}
                selected
              />
              <Caption>Selected</Caption>
            </div>
            <div className={styles.tokenCell}>
              <TokenPortrait
                name="Ilsabet"
                characterClass="magic-user"
                color="ultramarine"
                size={64}
                state="unconscious"
              />
              <Caption>Unconscious</Caption>
            </div>
            <div className={styles.tokenCell}>
              <TokenPortrait
                name="Durgin Coalbeard"
                characterClass="dwarf"
                color="malachite"
                size={64}
                state="dead"
              />
              <Caption>Dead</Caption>
            </div>
            <div className={styles.tokenCell}>
              <TokenPortrait name="Goblin 1" kind="monster" size={64} />
              <Caption>Monster</Caption>
            </div>
            <div className={styles.tokenCell}>
              <TokenPortrait name="Goblin 2" kind="monster" size={64} selected />
              <Caption>Selected</Caption>
            </div>
            <div className={styles.tokenCell}>
              <TokenPortrait name="Hobgoblin chief" kind="monster" icon="skull" color="vermilion" size={64} />
              <Caption>With icon</Caption>
            </div>
            <div className={styles.tokenCell}>
              <TokenPortrait name="Giant rat" kind="monster" size={64} state="dead" />
              <Caption>Dead</Caption>
            </div>
          </Row>
          <Row gap="sm">
            {['Goblin 1', 'Goblin 2', 'Goblin 3', 'Kobold', 'Orc', 'Bugbear', 'Skeleton', 'Ogre'].map(
              (name) => (
                <TokenPortrait key={name} name={name} kind="monster" size={24} />
              ),
            )}
            <Caption>Monsters at 24 px</Caption>
          </Row>
        </Stack>
      </Specimen>
      <Grid min={460}>
        <Specimen
          title="Ability scores"
          note="Prime requisites get a brass edge. The modifier comes from bxapi."
        >
          <Row gap="sm">
            {abilities.map((a) => (
              <StatBox key={a.abbreviation} {...a} />
            ))}
          </Row>
        </Specimen>
        <Specimen title="Hit points and armour class">
          <Stack gap="md">
            <HpBar current={17} max={22} />
            <HpBar current={9} max={18} />
            <HpBar current={3} max={14} />
            <HpBar current={0} max={6} />
            <Row gap="lg" align="end">
              <AcShield value={2} size="lg" />
              <AcShield value={4} />
              <AcShield value={9} size="sm" />
              <AcShield value={-1} />
            </Row>
          </Stack>
        </Specimen>
      </Grid>
      <Grid min={340}>
        <Specimen title="Coins" note="In B/X order, platinum to copper.">
          <Stack gap="md">
            <CoinPurse coins={{ pp: 2, gp: 1240, ep: 15, sp: 88, cp: 302 }} />
            <CoinPurse coins={{ gp: 12, sp: 0 }} showEmpty layout="stack" />
          </Stack>
        </Specimen>
        <Specimen title="Conditions" note="The duration is the text bxapi reports.">
          <Row gap="sm">
            <ConditionChip label="Asleep" tone="harm" icon="moon" duration="4 turns" />
            <ConditionChip label="Paralyzed" tone="harm" duration="2 turns" />
            <ConditionChip label="Blessed" tone="boon" duration="6 rounds" />
            <ConditionChip label="Invisible" tone="magic" icon="eye-off" />
            <ConditionChip label="Surprised" tone="neutral" onRemove={() => {}} />
          </Row>
        </Specimen>
      </Grid>
      <Specimen
        title="Parchment"
        note="A character sheet on vellum. Kit components inside switch to ink colors on their own."
        wide
        plain
      >
        <Parchment className={styles.sheet}>
          <div className={styles.sheetHeader}>
            <TokenPortrait name="Wren Underbough" characterClass="halfling" color="saffron" size={96} />
            <div className={styles.sheetTitle}>
              <h3 className={styles.sheetName}>{wren?.name}</h3>
              <p className={styles.sheetMeta}>Halfling, level 3, neutral. Played by Sam.</p>
              <Row gap="sm">
                <ConditionChip label="Hasted" tone="magic" duration="3 rounds" />
                <ConditionChip label="Poisoned" tone="harm" />
              </Row>
            </div>
            <div className={styles.sheetVitals}>
              <AcShield value={5} size="lg" />
              <div className={styles.sheetHp}>
                <Caption>Hit points</Caption>
                <HpBar current={3} max={14} />
              </div>
            </div>
          </div>
          <Tabs defaultValue="sheet">
            <TabsList aria-label="Wren's sheet">
              <TabsTrigger value="sheet">Abilities and saves</TabsTrigger>
              <TabsTrigger value="gear">Equipment</TabsTrigger>
              <TabsTrigger value="notes">Notes</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className={styles.sheetBody}>
            <div>
              <h4 className={styles.sheetSection}>Abilities</h4>
              <Row gap="sm">
                {abilities.map((a) => (
                  <StatBox key={a.abbreviation} {...a} size="sm" />
                ))}
              </Row>
              <Divider className={styles.sheetDivider} />
              <h4 className={styles.sheetSection}>Purse</h4>
              <CoinPurse coins={{ gp: 47, sp: 12, cp: 5 }} />
            </div>
            <div>
              <h4 className={styles.sheetSection}>Saving throws</h4>
              <DataTable
                caption="Saving throws"
                hideCaption
                rows={saves}
                rowKey={(s) => s.id}
                columns={[
                  { key: 'name', header: 'Save against' },
                  { key: 'target', header: 'Target', numeric: true, width: '64px' },
                ]}
              />
            </div>
          </div>
        </Parchment>
      </Specimen>
    </Section>
  );
}
