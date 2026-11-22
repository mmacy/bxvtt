import type { AdventureListing } from '@bxvtt/shared/protocol';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { describeProblem, getApi, useCaller, useIsReferee, useMembers, useTableDetail } from '@/app';
import { Badge, Banner, Panel, PageLayout, Wordmark } from '@/ui';
import { ProfileMenu, RulesReference } from '@/features/home';
import { AdventurePicker } from './AdventurePicker';
import { InvitePanel } from './InvitePanel';
import { MembersPanel } from './MembersPanel';
import { OptionalRules, type RulesetChoices } from './OptionalRules';
import { RosterPanel } from './RosterPanel';
import { StartGamePanel } from './StartGamePanel';
import { TableSettingsForm } from './TableSettingsForm';
import styles from './lobby.module.css';

/** The default adventure to suggest: the first sample, or else the first adventure. */
function suggested(adventures: AdventureListing[]): string | null {
  return adventures.find((a) => a.source === 'sample')?.id ?? adventures[0]?.id ?? null;
}

/**
 * The lobby before the game starts: the people at the table, the invite link, the party in marching order,
 * and for the referee, the adventure, the settings, the optional rules, and the start button. A player sees the
 * same lobby read-only where they lack permission.
 */
export function LobbyPage({ banner }: { banner?: ReactNode }) {
  const table = useTableDetail();
  const referee = useIsReferee();
  const members = useMembers();
  const caller = useCaller();
  const [adventures, setAdventures] = useState<AdventureListing[] | null>(null);
  const [adventureError, setAdventureError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [ruleset, setRuleset] = useState<RulesetChoices>({});
  const tableId = table?.id ?? null;

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
          <ProfileMenu />
        </>
      }
    >
      <div className={styles.page}>
        {banner && <div className={styles.stickyBanner}>{banner}</div>}
        <header className={styles.header}>
          <div>
            <p className={styles.kicker}>Lobby</p>
            <h1 className={styles.title}>{table.name}</h1>
            <p className={styles.lead}>
              {referee
                ? 'Gather the party, choose the adventure, and start the game when everyone is ready.'
                : `${refereeNames.length > 0 ? refereeNames.join(' and ') : 'The referee'} will start the game. Add your characters to the party while you wait.`}
            </p>
          </div>
          <div className={styles.headerMeta}>
            <Badge tone="success" icon="users">
              {online} of {members.length} online
            </Badge>
            {caller.member && (
              <Badge tone="accent" icon="flag">
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
            {referee ? (
              <>
                <Panel title="Adventure" meta="Only you see this choice until the game starts">
                  <AdventurePicker
                    tableId={table.id}
                    adventures={adventures}
                    error={adventureError}
                    selectedId={selected}
                    onSelect={setSelected}
                    onChanged={loadAdventures}
                  />
                </Panel>
                <Panel title="Optional rules" collapsible defaultOpen={false}>
                  <OptionalRules value={ruleset} onChange={setRuleset} />
                </Panel>
              </>
            ) : null}
          </div>

          <aside className={styles.side}>
            {referee ? (
              <Panel title="Start the game">
                <StartGamePanel table={table} adventure={adventure} ruleset={ruleset} />
              </Panel>
            ) : (
              <Banner tone="neutral" icon="hourglass" title="Waiting for the referee to start">
                The game starts for everyone at once. This page switches to the table by itself.
              </Banner>
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
    </PageLayout>
  );
}
