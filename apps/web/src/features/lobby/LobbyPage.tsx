import type { AdventureListing } from '@bxvtt/shared/protocol';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  describeProblem,
  getApi,
  SiteInfo,
  useCaller,
  useIsReferee,
  useMembers,
  useTableDetail,
} from '@/app';
import {
  Badge,
  Banner,
  breakpoints,
  Button,
  DropdownMenu,
  IconButton,
  Panel,
  PageLayout,
  useMediaQuery,
  Wordmark,
} from '@/ui';
import { ProfileMenu, RulesReference } from '@/features/home';
import { AdventurePicker } from './AdventurePicker';
import { InvitePanel } from './InvitePanel';
import { MembersPanel } from './MembersPanel';
import { RosterPanel } from './RosterPanel';
import { LobbySaves } from './LobbySaves';
import { RulesSummary, StartingRulesBadge } from './RulesSummary';
import { StartGamePanel } from './StartGamePanel';
import { TableRulesForm } from './TableRulesForm';
import { TableSettingsForm } from './TableSettingsForm';
import { useTableExit } from './TableExit';
import styles from './lobby.module.css';

/** Below the phone breakpoint the party comes right after the start button. */
const PHONE_QUERY = `(max-width: ${breakpoints.phone - 1}px)`;
/** The width where the lobby becomes one column, the same as in `lobby.module.css`. */
const ONE_COLUMN_QUERY = '(max-width: 860px)';

/** The default adventure to suggest: the first sample, or else the first adventure. */
function suggested(adventures: AdventureListing[]): string | null {
  return adventures.find((a) => a.source === 'sample')?.id ?? adventures[0]?.id ?? null;
}

/**
 * The table's rules for everyone: a read-only summary, with a button that gives a referee the form that changes
 * them. Focus moves to the form's first control when it opens, and back to the button when it closes.
 */
function TableRulesPanel() {
  const referee = useIsReferee();
  const [editing, setEditing] = useState(false);
  const body = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const opened = useRef(false);
  useEffect(() => {
    if (editing) {
      // The starting rules select takes the place of a skeleton once the rulesets load, so keep trying until then.
      const select = body.current?.querySelector<HTMLElement>('[role="combobox"]');
      if (select && !opened.current) {
        select.focus();
        opened.current = true;
      }
    } else if (opened.current) {
      opened.current = false;
      button.current?.focus();
    }
  });
  return (
    <Panel
      title="Table rules"
      meta={<StartingRulesBadge />}
      actions={
        referee ? (
          <Button
            ref={button}
            size="sm"
            variant="secondary"
            icon={editing ? undefined : 'settings'}
            onClick={() => {
              if (editing) opened.current = true;
              setEditing(!editing);
            }}
          >
            {editing ? 'Done' : 'Change rules'}
          </Button>
        ) : undefined
      }
    >
      <div ref={body}>{referee && editing ? <TableRulesForm /> : <RulesSummary />}</div>
    </Panel>
  );
}

/**
 * The lobby before the game starts: the people at the table, the invite link, the party in marching order, the
 * table's rules, and for the referee, the invite link, the table's settings, the adventure, and the start button.
 * A player reads the rules and has none of the referee's controls.
 */
export function LobbyPage({ banner }: { banner?: ReactNode }) {
  const table = useTableDetail();
  const referee = useIsReferee();
  const members = useMembers();
  const caller = useCaller();
  const [adventures, setAdventures] = useState<AdventureListing[] | null>(null);
  const [adventureError, setAdventureError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const tableId = table?.id ?? null;
  const exit = useTableExit();
  const phone = useMediaQuery(PHONE_QUERY);
  const oneColumn = useMediaQuery(ONE_COLUMN_QUERY);

  const [reload, setReload] = useState(0);
  const loadAdventures = useCallback(async () => setReload((n) => n + 1), []);

  useEffect(() => {
    if (!referee || tableId === null) return;
    let cancelled = false;
    getApi()
      .listAdventures(tableId)
      .then(
        (list) => {
          if (cancelled) return;
          setAdventures(list.items);
          setAdventureError(null);
          setSelected((current) =>
            current !== null && list.items.some((a) => a.id === current) ? current : suggested(list.items),
          );
        },
        (error: unknown) => {
          if (cancelled) return;
          const message = describeProblem(error);
          setAdventureError(`${message.title}. ${message.detail}`);
        },
      );
    return () => {
      cancelled = true;
    };
  }, [referee, tableId, reload]);

  if (table === null) return null;
  const refereeNames = members.filter((m) => m.role === 'referee').map((m) => m.name);
  const adventure = adventures?.find((a) => a.id === selected) ?? null;
  const online = members.filter((m) => m.online).length;

  const blocks = {
    main: (
      <div key="main" className={styles.main}>
        <Panel title="Party" meta={`${table.roster.length} in marching order`}>
          <RosterPanel />
        </Panel>
        {/* Every member reads the rules early, and a referee sets them before the players create characters. */}
        <TableRulesPanel />
        {referee && (
          <Panel title="Adventure" meta="Only referees see this until the game starts">
            <AdventurePicker
              tableId={table.id}
              adventures={adventures}
              error={adventureError}
              selectedId={selected}
              onSelect={setSelected}
              onChanged={loadAdventures}
            />
          </Panel>
        )}
      </div>
    ),
    start: (
      <div key="start" className={styles.start}>
        {referee ? (
          <Panel title="Start game">
            <StartGamePanel table={table} adventure={adventure} />
            <LobbySaves />
          </Panel>
        ) : (
          <>
            <Banner tone="neutral" icon="hourglass" title="Waiting for the referee to start">
              You'll enter the game automatically as soon as the referee starts it.
            </Banner>
            <LobbySaves />
          </>
        )}
      </div>
    ),
    rest: (
      <aside key="rest" className={styles.side}>
        <Panel title="People at the table" meta={`${members.length}`} bodyPadding="sm">
          <MembersPanel />
        </Panel>
        {referee && (
          <>
            <Panel title="Invite players">
              <InvitePanel />
            </Panel>
            <Panel title="Table settings" collapsible defaultOpen>
              <TableSettingsForm />
            </Panel>
          </>
        )}
      </aside>
    ),
  };
  // Two columns put the party on the left. One column puts the start button first, and then on a phone the party,
  // so the referee doesn't scroll past the settings to reach it.
  const order: (keyof typeof blocks)[] = phone
    ? ['start', 'main', 'rest']
    : oneColumn
      ? ['start', 'rest', 'main']
      : ['main', 'start', 'rest'];

  return (
    <PageLayout
      width="default"
      brand={
        <RouterLink to="/" aria-label="bxvtt home" className={styles.brand}>
          <Wordmark size="sm" />
        </RouterLink>
      }
      nav={
        <RouterLink to="/" className={styles.navLink}>
          Your tables
        </RouterLink>
      }
      headerActions={
        <>
          <RulesReference />
          <DropdownMenu
            align="end"
            trigger={<IconButton icon="menu" label="Table menu" size="sm" />}
            items={exit.items}
          />
          <ProfileMenu />
        </>
      }
      footer={<SiteInfo />}
    >
      <div className={styles.page}>
        {banner && <div className={styles.stickyBanner}>{banner}</div>}
        <header className={styles.header}>
          <div>
            <p className={styles.kicker}>Lobby</p>
            <h1 className={styles.title}>{table.name}</h1>
            <p className={styles.lead}>
              {referee
                ? 'Gather the party, choose an adventure, and start the game when everyone is ready.'
                : `${refereeNames.length > 0 ? refereeNames.join(' and ') : 'The referee'} will start the game when everyone is ready. Add your characters to the party while you wait.`}
            </p>
          </div>
          <div className={styles.headerMeta}>
            <Badge tone="success" icon="users">
              {online} of {members.length} online
            </Badge>
            {caller.member && (
              <Badge tone="neutral" icon="flag">
                {caller.isMe ? 'You are the caller' : `${caller.member.name} is the caller`}
              </Badge>
            )}
          </div>
        </header>

        {/* The blocks keep one parent and a key each, so changing their order on a resize moves them and keeps
            their state. Their order in the page is the order on screen, so the tab order follows it. */}
        <div className={styles.columns}>{order.map((block) => blocks[block])}</div>
      </div>
      {exit.dialogs}
    </PageLayout>
  );
}
