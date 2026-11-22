import { useState } from 'react';
import { Avatar, AvatarStack } from '../components/Avatar';
import { Badge, Tag } from '../components/Badge';
import { Button, IconButton } from '../components/Button';
import { DataTable, type DataColumn } from '../components/DataTable';
import { Divider } from '../components/Divider';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { Banner, EmptyState, ProgressBar, Skeleton } from '../components/Feedback';
import { List, ListItem } from '../components/List';
import { ResizablePanels } from '../components/ResizablePanels';
import { Spinner } from '../components/Spinner';
import { Card, Panel, ScrollArea } from '../components/Surfaces';
import { Icon } from '../icons/Icon';
import { AcShield, HpBar } from '../game/StatBlock';
import { TokenPortrait } from '../game/TokenPortrait';
import { Caption, Grid, Row, Section, Specimen, Stack } from './parts';
import { monsters, party, people, type SampleMonster } from './sampleData';
import styles from './Gallery.module.css';

const monsterColumns: DataColumn<SampleMonster>[] = [
  { key: 'name', header: 'Monster', sortValue: (m) => m.name, cell: (m) => <strong>{m.name}</strong> },
  { key: 'ac', header: 'AC', numeric: true, sortValue: (m) => m.ac, width: '56px' },
  { key: 'hd', header: 'HD', numeric: true, width: '64px' },
  { key: 'hp', header: 'hp', numeric: true, sortValue: (m) => m.hp, width: '56px' },
  { key: 'morale', header: 'Morale', numeric: true, sortValue: (m) => m.morale, width: '72px' },
  { key: 'xp', header: 'XP', numeric: true, sortValue: (m) => m.xp, width: '64px' },
];

function Broken(): never {
  throw new Error('The journal failed to load its pages.');
}

export function DisplaySection() {
  const [selected, setSelected] = useState<string | null>('wren');
  const [tags, setTags] = useState(['Torch', 'Rope, 50 ft', 'Iron spikes']);
  const [chosen, setChosen] = useState('b2');
  const [showBroken, setShowBroken] = useState(false);
  return (
    <Section
      id="display"
      title="Display and surfaces"
      description="Panels hold the chrome, cards hold one item, and parchment holds anything that would be paper at a real table."
    >
      <Grid min={320}>
        <Specimen title="Badges and tags">
          <Stack gap="md">
            <Row gap="sm">
              <Badge tone="referee" icon="referee">
                Referee
              </Badge>
              <Badge tone="accent" icon="flag">
                Caller
              </Badge>
              <Badge tone="success">Ready</Badge>
              <Badge tone="warning">Away</Badge>
              <Badge tone="danger">Refused</Badge>
              <Badge tone="info">Exploring</Badge>
              <Badge tone="magic" icon="spell">
                Magical
              </Badge>
              <Badge tone="gold" icon="coins">
                Treasure
              </Badge>
              <Badge>Retainer</Badge>
            </Row>
            <Row gap="sm">
              <Badge tone="accent" appearance="outline">
                Level 3
              </Badge>
              <Badge tone="danger" appearance="outline">
                Cursed
              </Badge>
              <Badge tone="accent" appearance="solid">
                3
              </Badge>
              <Badge tone="danger" appearance="solid">
                12
              </Badge>
            </Row>
            <Row gap="sm">
              {tags.map((tag) => (
                <Tag
                  key={tag}
                  removeLabel={`Remove ${tag}`}
                  onRemove={() => setTags(tags.filter((t) => t !== tag))}
                >
                  {tag}
                </Tag>
              ))}
              <Tag color="var(--player-saffron)">Sam</Tag>
            </Row>
          </Stack>
        </Specimen>
        <Specimen
          title="Avatars"
          note="A user is initials on their color. Characters and monsters use TokenPortrait."
        >
          <Stack gap="md">
            <Row gap="md">
              <Avatar name="Ruth Cole" color="slate" size="lg" presence="online" referee />
              <Avatar name="Marta Vey" color="vermilion" size="lg" presence="online" />
              <Avatar name="Sam Hale" color="saffron" size="md" presence="away" />
              <Avatar name="Jo Park" color="ultramarine" size="md" presence="offline" />
              <Avatar name="Dev Okafor" color="azurite" size="sm" />
              <Avatar name="Lee" size="xs" />
            </Row>
            <Row>
              <AvatarStack users={people} max={5} />
              <Caption>Presence in the top bar</Caption>
            </Row>
          </Stack>
        </Specimen>
        <Specimen title="Feedback">
          <Stack gap="md">
            <Row gap="lg">
              <Spinner size={16} />
              <Spinner size={24} />
              <span className={styles.accentText}>
                <Spinner size={32} label="Starting the game" />
              </span>
              <Caption>Spinner</Caption>
            </Row>
            <ProgressBar label="Uploading adventure" value={64} showLabel />
            <ProgressBar label="Connecting to the table" />
            <ProgressBar label="Torch" value={25} tone="gold" size="sm" showLabel />
            <Stack gap="sm">
              <Row gap="sm">
                <Skeleton shape="circle" width={40} height={40} />
                <div style={{ flex: 1 }}>
                  <Skeleton lines={2} />
                </div>
              </Row>
              <Skeleton shape="block" height={48} />
            </Stack>
          </Stack>
        </Specimen>
      </Grid>
      <Specimen title="Banners" wide>
        <Stack gap="sm">
          <Banner tone="danger" title="bxapi refused the round" onDismiss={() => {}}>
            Wren can&apos;t attack the ogre in melee because she isn&apos;t in the front rank. Change her
            declaration and resolve the round again.
          </Banner>
          <Banner tone="referee" title="Only referees see this">
            The ogre in room 14 is asleep. A successful listen check hears it snore.
          </Banner>
          <Banner
            tone="warning"
            actions={
              <Button size="sm" variant="secondary">
                Reconnect
              </Button>
            }
          >
            The connection to the table dropped. Your last command didn't reach the server.
          </Banner>
          <Banner tone="success">The party returned to town with 1,240 gp of treasure.</Banner>
          <Banner tone="info">
            Ruth is choosing the adventure. You can create a character while you wait.
          </Banner>
        </Stack>
      </Specimen>
      <Grid min={340}>
        <Specimen title="Cards" note="Choose an adventure. Cards are selectable with the radio inside.">
          <Stack gap="sm">
            {[
              {
                id: 'b2',
                title: 'The Keep on the Borderlands',
                meta: 'Levels 1 to 3, included with bxapi',
                icon: 'town' as const,
              },
              {
                id: 'b1',
                title: 'In Search of the Unknown',
                meta: 'Levels 1 to 3, included with bxapi',
                icon: 'map' as const,
              },
            ].map((adventure) => (
              <Card
                key={adventure.id}
                interactive
                selected={chosen === adventure.id}
                padding="sm"
                onClick={() => setChosen(adventure.id)}
              >
                <label className={styles.cardChoice}>
                  <input
                    type="radio"
                    name="adventure"
                    className="visually-hidden"
                    checked={chosen === adventure.id}
                    onChange={() => setChosen(adventure.id)}
                  />
                  <span className={styles.cardIcon}>
                    <Icon name={adventure.icon} size={24} />
                  </span>
                  <span>
                    <span className={styles.cardTitle}>{adventure.title}</span>
                    <span className={styles.cardMeta}>{adventure.meta}</span>
                  </span>
                </label>
              </Card>
            ))}
          </Stack>
        </Specimen>
        <Specimen title="Panels" plain>
          <Stack gap="sm">
            <Panel
              title="Marching order"
              meta="7"
              actions={
                <>
                  <IconButton icon="sort" label="Reorder" size="sm" />
                  <IconButton icon="more" label="More" size="sm" />
                </>
              }
              bodyPadding="sm"
            >
              <Row gap="sm">
                {party.slice(0, 5).map((c) => (
                  <TokenPortrait
                    key={c.id}
                    name={c.name}
                    characterClass={c.characterClass}
                    color={c.color}
                    size={32}
                  />
                ))}
              </Row>
            </Panel>
            <Panel title="Wandering monsters" collapsible defaultOpen={false} bodyPadding="sm">
              <p className={styles.muted}>Check every two turns. A roll of 1 on 1d6 means an encounter.</p>
            </Panel>
          </Stack>
        </Specimen>
        <Specimen title="Empty states">
          <Stack gap="sm">
            <EmptyState
              size="compact"
              icon="journal"
              title="The journal is empty"
              description="Write down clues, names, and maps as you find them. Everyone at the table can read the journal."
              action={
                <Button size="sm" variant="secondary" icon="plus">
                  Add an entry
                </Button>
              }
            />
          </Stack>
        </Specimen>
      </Grid>
      <Grid min={420}>
        <Specimen
          title="Data table"
          note="Click a header to sort. Numbers use the numeric face with tabular figures."
        >
          <DataTable
            caption="Monsters in the caves"
            hideCaption
            columns={monsterColumns}
            rows={monsters}
            rowKey={(m) => m.id}
            defaultSort={{ key: 'name', direction: 'ascending' }}
            selectedKey="hobgoblin"
          />
        </Specimen>
        <Specimen title="List" note="A listbox: arrow keys move, Enter selects.">
          <List aria-label="Party" value={selected} onValueChange={setSelected} divided>
            {party.slice(0, 5).map((c) => (
              <ListItem
                key={c.id}
                value={c.id}
                leading={
                  <TokenPortrait
                    name={c.name}
                    characterClass={c.characterClass}
                    color={c.color}
                    size={32}
                    state={c.hp <= 0 ? 'unconscious' : 'normal'}
                    decorative
                  />
                }
                title={c.name}
                description={`${c.characterClass.replace('-', ' ')} ${c.level}, played by ${c.player}`}
                trailing={
                  <>
                    <HpBar current={c.hp} max={c.maxHp} size="sm" className={styles.listHp} />
                    <AcShield value={c.ac} size="sm" />
                  </>
                }
              />
            ))}
          </List>
        </Specimen>
      </Grid>
      <Grid min={340}>
        <Specimen title="Resizable panels" note="Drag the line, or focus it and use the arrow keys.">
          <div className={styles.resizeDemo}>
            <ResizablePanels
              defaultSize={160}
              minSize={100}
              maxSize={300}
              label="Resize the room list"
              start={<div className={styles.paneDemo}>Rooms</div>}
              end={<div className={styles.paneDemo}>Room 14: the ogre&apos;s den</div>}
            />
          </div>
        </Specimen>
        <Specimen title="Scroll area and divider">
          <ScrollArea maxHeight={160} label="Equipment">
            <ul className={styles.scrollList}>
              {[
                'Backpack',
                'Torches (6)',
                'Tinder box',
                'Waterskin',
                'Iron rations (7 days)',
                'Rope, 50 ft',
                'Iron spikes (12)',
                'Hammer',
                'Wolfsbane',
                'Mirror, small',
                'Holy water',
                'Lantern',
                'Oil flasks (3)',
              ].map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </ScrollArea>
          <Divider>or</Divider>
          <Row>
            <span>Left</span>
            <Divider orientation="vertical" />
            <span>Right</span>
          </Row>
        </Specimen>
        <Specimen
          title="Error boundary"
          note="One failed panel never takes down the table. No stack trace on screen."
        >
          {showBroken ? (
            <ErrorBoundary area="The journal" size="compact">
              <Broken />
            </ErrorBoundary>
          ) : (
            <Row>
              <Button variant="secondary" icon="warning" onClick={() => setShowBroken(true)}>
                Break the journal
              </Button>
            </Row>
          )}
        </Specimen>
      </Grid>
    </Section>
  );
}
