import { useState } from 'react';
import { AvatarStack } from '../components/Avatar';
import { Badge } from '../components/Badge';
import { Button, IconButton } from '../components/Button';
import { Switch } from '../components/Choice';
import { Avatar } from '../components/Avatar';
import { DropdownMenu } from '../components/Menu';
import { List, ListItem } from '../components/List';
import { Parchment } from '../components/Surfaces';
import { TextInput } from '../components/TextInput';
import { toast } from '../components/toastStore';
import { DiceRoll } from '../dice/DiceRoll';
import { AcShield, HpBar } from '../game/StatBlock';
import { TokenPortrait } from '../game/TokenPortrait';
import { Icon } from '../icons/Icon';
import {
  ActionBar,
  ActionBarDivider,
  ActionBarItem,
  ActionBarMenu,
  Dock,
  GameClock,
  TableLayout,
  TableTopBar,
  ToolRail,
  ToolRailButton,
  ToolRailDivider,
} from '../layout/TableLayout';
import { cx } from '../lib/cx';
import { party, people } from './sampleData';
import styles from './TableMock.module.css';

const tools = [
  { id: 'select', icon: 'pointer', label: 'Select and move', shortcut: 'V' },
  { id: 'ruler', icon: 'ruler', label: 'Measure', shortcut: 'R' },
  { id: 'draw', icon: 'draw', label: 'Draw', shortcut: 'D' },
  { id: 'ping', icon: 'ping', label: 'Ping', shortcut: 'P' },
] as const;

function PartyTab() {
  const [selected, setSelected] = useState<string | null>('kael');
  return (
    <div className={styles.tabBody}>
      <List
        aria-label="Party in marching order"
        value={selected}
        onValueChange={setSelected}
        density="comfortable"
      >
        {party.map((c, index) => (
          <ListItem
            key={c.id}
            value={c.id}
            leading={
              <span className={styles.rank}>
                <span className={styles.rankNumber} aria-hidden="true">
                  {index + 1}
                </span>
                <TokenPortrait
                  name={c.name}
                  characterClass={c.characterClass}
                  color={c.color}
                  size={40}
                  state={c.hp <= 0 ? 'unconscious' : 'normal'}
                  decorative
                />
              </span>
            }
            title={
              <span className={styles.nameRow}>
                {c.name}
                {c.id === 'wren' && (
                  <Badge tone="accent" icon="flag">
                    Caller
                  </Badge>
                )}
              </span>
            }
            description={
              <span className={styles.hpRow}>
                <HpBar current={c.hp} max={c.maxHp} size="sm" />
              </span>
            }
            trailing={<AcShield value={c.ac} size="sm" />}
          />
        ))}
      </List>
    </div>
  );
}

function FeedTab() {
  return (
    <div className={styles.feed}>
      <ol className={styles.feedList}>
        <li className={styles.feedSystem}>
          <Icon name="compass" size={14} />
          The party enters room 7, a guard room. Two goblins look up from their dice.
        </li>
        <li className={styles.feedMessage}>
          <Avatar name="Sam Hale" color="saffron" size="sm" decorative />
          <div>
            <p className={styles.feedAuthor}>
              Sam <span className={styles.feedAs}>as Wren</span>
            </p>
            <p>I sling a stone at the one nearest the door.</p>
          </div>
        </li>
        <li className={styles.feedRoll}>
          <DiceRoll
            dice={[{ sides: 20, value: 14 }]}
            modifier={2}
            label="Wren attacks Goblin 1"
            size={40}
            color="saffron"
            animate={false}
          />
          <p className={styles.feedResult}>
            Hit. Goblin 1 takes <span className={styles.damage}>3 damage</span> and falls.
          </p>
        </li>
        <li className={styles.feedWhisper}>
          <Icon name="whisper" size={14} />
          <span>
            <strong>Ruth</strong> whispers to you: the second goblin drops a brass key as it flees.
          </span>
        </li>
        <li className={styles.feedMessage}>
          <Avatar name="Ruth Cole" color="slate" size="sm" referee decorative />
          <div>
            <p className={styles.feedAuthor}>
              Ruth <Badge tone="referee">Referee</Badge>
            </p>
            <p>Goblin 2 bolts for the east door. Anyone want to stop it?</p>
          </div>
        </li>
      </ol>
      <form
        className={styles.composer}
        onSubmit={(event) => {
          event.preventDefault();
        }}
      >
        <TextInput placeholder="Say something, or type /roll 1d20" aria-label="Message" />
        <IconButton icon="dice" label="Roll dice" />
        <IconButton icon="send" label="Send" variant="primary" type="submit" />
      </form>
    </div>
  );
}

function JournalTab() {
  return (
    <div className={styles.tabBody}>
      <Parchment variant="note" ruled className={styles.journal}>
        <h3 className={styles.journalTitle}>The Drowned Bell, day 2</h3>
        <p>
          The goblins in the guardroom answer to someone in the crypts below. Their chief wears a brass key on
          a chain.
        </p>
        <p>Wren thinks the key opens the iron door in room 9.</p>
      </Parchment>
    </div>
  );
}

function MapPlaceholder() {
  return (
    <div className={styles.map} role="img" aria-label="Map placeholder">
      <div className={styles.mapGrid} />
      <div className={styles.mapLabel}>
        <Icon name="map" size={24} />
        <span>The map renders here</span>
      </div>
      <div className={styles.mapTokens}>
        {party.slice(0, 4).map((c, i) => (
          <span
            key={c.id}
            className={styles.mapToken}
            style={{ left: `${44 + (i % 2) * 6}%`, top: `${52 + Math.floor(i / 2) * 8}%` }}
          >
            <TokenPortrait
              name={c.name}
              characterClass={c.characterClass}
              color={c.color}
              size={32}
              selected={i === 0}
              decorative
            />
          </span>
        ))}
        <span className={styles.mapToken} style={{ left: '62%', top: '30%' }}>
          <TokenPortrait name="Goblin 2" kind="monster" size={32} decorative />
        </span>
      </div>
    </div>
  );
}

export interface KitTableMockProps {
  /** Fills the viewport instead of sitting in a framed box. */
  fullscreen?: boolean;
}

/** A filled-in TableLayout with placeholder content, for the kit gallery and screenshots. */
export function KitTableMock({ fullscreen = false }: KitTableMockProps) {
  const [tool, setTool] = useState<string>('select');
  const [lens, setLens] = useState(true);
  const [fog, setFog] = useState(false);
  return (
    <div className={cx(styles.frame, fullscreen && styles.fullscreen)}>
      <TableLayout
        topBar={
          <TableTopBar
            tableName="Thursday at the Drowned Bell"
            mode="exploring"
            clock={<GameClock turn={14} />}
            actions={
              <span className={styles.lens}>
                <Switch label="Referee lens" checked={lens} onCheckedChange={setLens} labelPosition="start" />
              </span>
            }
            presence={<AvatarStack users={people} max={5} />}
            menu={
              <DropdownMenu
                align="end"
                trigger={<IconButton icon="menu" label="Table menu" />}
                items={[
                  {
                    label: 'Save game',
                    icon: 'save',
                    shortcut: ['Ctrl', 'S'],
                    onSelect: () => toast.success('Game saved'),
                  },
                  {
                    label: 'Copy invite link',
                    icon: 'link',
                    onSelect: () => toast.success('Invite link copied'),
                  },
                  { label: 'Table settings', icon: 'settings' },
                  { type: 'separator' },
                  { label: 'Leave table', icon: 'log-out', danger: true },
                ]}
              />
            }
          />
        }
        toolRail={
          <ToolRail aria-label="Map tools" footer={<ToolRailButton icon="settings" label="Map settings" />}>
            {tools.map((t) => (
              <ToolRailButton
                key={t.id}
                icon={t.icon}
                label={t.label}
                shortcut={t.shortcut}
                active={tool === t.id}
                onClick={() => setTool(t.id)}
              />
            ))}
            <ToolRailDivider />
            <ToolRailButton
              icon="fog"
              label="Fog of war"
              shortcut="F"
              active={fog}
              onClick={() => setFog(!fog)}
            />
            <ToolRailButton icon="eraser" label="Erase drawings" />
          </ToolRail>
        }
        stage={<MapPlaceholder />}
        dock={
          <Dock
            aria-label="Table panels"
            tabs={[
              { value: 'party', label: 'Party', icon: 'users', content: <PartyTab /> },
              { value: 'feed', label: 'Feed', icon: 'feed', count: 2, content: <FeedTab /> },
              { value: 'journal', label: 'Journal', icon: 'journal', content: <JournalTab /> },
            ]}
          />
        }
        actionBar={
          <ActionBar
            aria-label="Party actions"
            status={
              <>
                <TokenPortrait
                  name="Wren Underbough"
                  characterClass="halfling"
                  color="saffron"
                  size={24}
                  decorative
                />
                <span>Wren is the caller</span>
              </>
            }
          >
            <ActionBarItem>
              <Button variant="secondary" icon="eye">
                Search
              </Button>
            </ActionBarItem>
            <ActionBarItem>
              <Button variant="secondary" icon="ear">
                Listen
              </Button>
            </ActionBarItem>
            <ActionBarItem>
              <Button variant="secondary" icon="door-open">
                Open door
              </Button>
            </ActionBarItem>
            <ActionBarMenu
              label="Light"
              icon="torch"
              shortcut={['T']}
              items={[
                { label: 'Wren lights a torch', onSelect: () => toast.info('Wren lights a torch.') },
                { label: 'Osric lights a lantern', onSelect: () => toast.info('Osric lights a lantern.') },
              ]}
            />
            <ActionBarDivider />
            <ActionBarItem>
              <Button variant="ghost" icon="rest">
                Rest
              </Button>
            </ActionBarItem>
            <ActionBarItem>
              <Button variant="primary" icon="footprints">
                Move party
              </Button>
            </ActionBarItem>
          </ActionBar>
        }
      />
    </div>
  );
}
