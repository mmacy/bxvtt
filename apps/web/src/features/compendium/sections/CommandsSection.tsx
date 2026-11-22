import { useCommandCatalog, useGameMode, useIsReferee, useLegalCommands } from '@/app';
import type { CommandSummary } from '@bxvtt/shared/bxapi';
import { commandInfo, sessionModeLabel } from '@bxvtt/shared/text';
import { Badge, DataTable, SearchInput, SegmentedControl, type DataColumn } from '@/ui';
import { useMemo } from 'react';
import { EntryLink } from '../Parts';
import { useIndexState } from '../indexState';
import { useNavigation } from '../navigation';
import { isPlayCommand, matchesFilter } from '../search';
import styles from '../sections.module.css';
import { CatalogGate, NoMatches, SectionShell, countText } from './common';

/** The modes a person can ask about. A finished game has no actions to look up. */
const MODES = ['town', 'exploring', 'encounter', 'battle'];

/** What the party can do, and in which mode of the game. Read from the command catalog. */
export function CommandsSection() {
  const commands = useCommandCatalog();
  const isReferee = useIsReferee();
  const legal = useLegalCommands();
  const mode = useGameMode();
  const { go } = useNavigation();
  const filter = useIndexState((s) => s.commands);
  const setIndex = useIndexState((s) => s.set);
  const set = (patch: Partial<typeof filter>) => setIndex({ commands: { ...filter, ...patch } });

  const legalNow = useMemo(() => new Set(legal.map((command) => command.command_type)), [legal]);
  const scope = isReferee && filter.scope === 'referee' ? 'referee' : 'play';
  const inScope = useMemo(
    () =>
      (commands.data ?? []).filter((command) =>
        scope === 'referee' ? command.kind === 'referee' : isPlayCommand(command),
      ),
    [commands.data, scope],
  );
  const visible = useMemo(
    () =>
      inScope.filter((command) => {
        const info = commandInfo(command.command_type);
        if (!matchesFilter(`${info.label} ${info.description}`, filter.query)) return false;
        if (filter.when === 'now') return legalNow.has(command.command_type);
        if (filter.when !== 'all') return (command.allowed_modes as readonly string[]).includes(filter.when);
        return true;
      }),
    [inScope, filter.query, filter.when, legalNow],
  );

  const columns: DataColumn<CommandSummary>[] = [
    {
      key: 'action',
      header: 'Action',
      width: '24%',
      cell: (row) => (
        <span className={styles.actionName}>
          <EntryLink kind="commands" id={row.command_type} tone="quiet">
            {commandInfo(row.command_type).label}
          </EntryLink>
          {legalNow.has(row.command_type) && <Badge tone="success">Available now</Badge>}
          <span className={styles.actionWhen}>
            {row.allowed_modes.map((m) => sessionModeLabel(m)).join(', ')}
          </span>
        </span>
      ),
      sortValue: (row) => commandInfo(row.command_type).label,
    },
    {
      key: 'what',
      header: 'What it does',
      width: '46%',
      cell: (row) => commandInfo(row.command_type).description,
    },
    {
      key: 'when',
      header: 'Available when',
      width: '30%',
      cell: (row) => row.allowed_modes.map((m) => sessionModeLabel(m)).join(', '),
    },
  ];

  const toolbar = (
    <>
      {isReferee && (
        <SegmentedControl
          aria-label="Whose actions"
          size="sm"
          value={scope}
          onValueChange={(value) => set({ scope: value })}
          options={[
            { value: 'play', label: 'Party actions' },
            { value: 'referee', label: 'Referee actions' },
          ]}
        />
      )}
      <SegmentedControl
        aria-label="When"
        size="sm"
        value={filter.when}
        onValueChange={(when) => set({ when })}
        options={[
          { value: 'all', label: 'All' },
          { value: 'now', label: 'Available now' },
          ...MODES.map((m) => ({ value: m, label: sessionModeLabel(m) })),
        ]}
      />
      <SearchInput
        size="sm"
        aria-label="Filter actions"
        placeholder="Filter actions"
        value={filter.query}
        onValueChange={(query) => set({ query })}
        wrapperClassName={styles.filterInput}
      />
    </>
  );

  return (
    <SectionShell
      section="commands"
      count={commands.data ? countText(visible.length, inScope.length, 'actions') : undefined}
      toolbar={toolbar}
    >
      <CatalogGate result={commands} label="actions">
        {() =>
          visible.length === 0 ? (
            <NoMatches
              onClear={() => set({ query: '', when: 'all' })}
              message={
                filter.when === 'now' && filter.query === ''
                  ? `Nothing is open to you ${mode ? `in ${sessionModeLabel(mode).toLowerCase()}` : 'now'} right now. Pick a mode to see what its actions are.`
                  : undefined
              }
            />
          ) : (
            <DataTable
              caption="Actions"
              hideCaption
              columns={columns}
              rows={visible}
              rowKey={(row) => row.command_type}
              defaultSort={{ key: 'action', direction: 'ascending' }}
              density="comfortable"
              className={styles.actionsTable}
              onRowClick={(row) => go({ page: 'entry', kind: 'commands', id: row.command_type })}
            />
          )
        }
      </CatalogGate>
    </SectionShell>
  );
}
