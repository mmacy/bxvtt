import type { AdventureListing } from '@bxvtt/shared/protocol';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
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
import { Badge, Banner, DropdownMenu, IconButton, Panel, PageLayout, Wordmark } from '@/ui';
import { ProfileMenu, RulesReference } from '@/features/home';
import { AdventurePicker } from './AdventurePicker';
import { InvitePanel } from './InvitePanel';
import { MembersPanel } from './MembersPanel';
import { RosterPanel } from './RosterPanel';
import { LobbySaves } from './LobbySaves';
import { StartGamePanel } from './StartGamePanel';
import { TableRulesForm } from './TableRulesForm';
import { TableSettingsForm } from './TableSettingsForm';
import { STARTING_RULESET_NAMES, matchStartingRuleset } from './rules';
import { useStartingRulesets } from './startingRulesets';
import { useTableExit } from './TableExit';
import styles from './lobby.module.css';

/** The default adventure to suggest: the first sample, or else the first adventure. */
function suggested(adventures: AdventureListing[]): string | null {
  return adventures.find((a) => a.source === 'sample')?.id ?? adventures[0]?.id ?? null;
}

/**
 * The lobby before the game starts: the people at the table, the invite link, the party in marching order, the
 * table's rules and settings, and for the referee, the adventure and the start button. A player sees the same
 * lobby read-only where they lack permission.
 */
export function LobbyPage({ banner }: { banner?: ReactNode }) {
  const table = useTableDetail();
  const referee = useIsReferee();
  const members = useMembers();
  const caller = useCaller();
  const [adventures, setAdventures] = useState<AdventureListing[] | null>(null);
  const [adventureError, setAdventureError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const starting = useStartingRulesets();
  const tableId = table?.id ?? null;
  const exit = useTableExit();

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
  const matched =
    starting.items === null ? undefined : matchStartingRuleset(table.settings.ruleset, starting.items);
  // The open panel's Select names the starting rules, so only the collapsed panel shows them.
  const rulesMeta =
    rulesOpen || matched === undefined
      ? undefined
      : matched === null
        ? 'Custom'
        : STARTING_RULESET_NAMES[matched];

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

        <div className={styles.columns}>
          <div className={styles.main}>
            <Panel title="Party" meta={`${table.roster.length} in marching order`}>
              <RosterPanel />
            </Panel>
            {/* Every member reads the rules early, and a referee sets them before the players create characters. */}
            <Panel title="Rules" meta={rulesMeta} collapsible open={rulesOpen} onOpenChange={setRulesOpen}>
              <TableRulesForm showNote />
            </Panel>
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

          <aside className={styles.side}>
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
            <Panel title="People at the table" meta={`${members.length}`} bodyPadding="sm">
              <MembersPanel />
            </Panel>
            <Panel title="Invite players">
              <InvitePanel />
            </Panel>
            <Panel title="Table settings" collapsible defaultOpen={referee}>
              <TableSettingsForm />
            </Panel>
          </aside>
        </div>
      </div>
      {exit.dialogs}
    </PageLayout>
  );
}
