import { Icon, iconNames, type IconName } from '../icons/Icon';
import { Caption, Grid, Row, Section, Specimen } from './parts';
import styles from './Gallery.module.css';

const gameGroups: Array<{ title: string; names: IconName[] }> = [
  {
    title: 'Classes',
    names: [
      'class-cleric',
      'class-dwarf',
      'class-elf',
      'class-fighter',
      'class-halfling',
      'class-magic-user',
      'class-thief',
    ],
  },
  {
    title: 'Weapons and armour',
    names: [
      'weapon-sword',
      'weapon-axe',
      'weapon-mace',
      'weapon-dagger',
      'weapon-spear',
      'weapon-bow',
      'armour-leather',
      'armour-chain',
      'armour-plate',
      'shield',
    ],
  },
  {
    title: 'Dungeon',
    names: [
      'door',
      'door-open',
      'door-locked',
      'door-secret',
      'stairs',
      'trap',
      'chest',
      'torch',
      'lantern',
      'map',
      'key',
      'footprints',
      'eye',
      'ear',
      'rest',
      'town',
    ],
  },
  {
    title: 'Treasure and magic',
    names: ['coins', 'gem', 'potion', 'scroll', 'wand', 'ring', 'spell', 'heart', 'skull', 'battle'],
  },
  { title: 'Dice', names: ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'dice'] },
];

const gameNames = new Set(gameGroups.flatMap((g) => g.names));
const interfaceNames = iconNames.filter((name) => !gameNames.has(name));

function label(name: string) {
  return name.replace(/^(class|weapon|armour)-/, '').replace(/-/g, ' ');
}

export function IconsSection() {
  return (
    <Section
      id="icons"
      title="Icons"
      description="One Icon component with a typed name. Interface icons come from lucide. Game icons are original drawings on the same 24 unit grid, with the same 1.75 px stroke, so the two sets sit together."
    >
      <Specimen
        title="Classes at portrait size"
        note="The seven B/X classes, drawn to read at 16 px on the map and 48 px on a sheet."
        wide
      >
        <Row gap="lg">
          {gameGroups[0]?.names.map((name) => (
            <div key={name} className={styles.classIcon}>
              <Icon name={name} size={40} />
              <Caption>{label(name)}</Caption>
            </div>
          ))}
        </Row>
      </Specimen>
      <Grid min={340}>
        {gameGroups.slice(1).map((group) => (
          <Specimen key={group.title} title={group.title}>
            <div className={styles.iconGrid}>
              {group.names.map((name) => (
                <div key={name} className={styles.iconCell} title={name}>
                  <Icon name={name} size={24} />
                  <span className={styles.iconName}>{label(name)}</span>
                </div>
              ))}
            </div>
          </Specimen>
        ))}
      </Grid>
      <Specimen
        title="Interface"
        note={`${interfaceNames.length} icons. Pass \`label\` when an icon stands alone. Without a label, screen readers skip the icon.`}
        wide
      >
        <div className={styles.iconGridDense}>
          {interfaceNames.map((name) => (
            <div key={name} className={styles.iconCell} title={name}>
              <Icon name={name} size={20} />
              <span className={styles.iconName}>{name}</span>
            </div>
          ))}
        </div>
      </Specimen>
    </Section>
  );
}
