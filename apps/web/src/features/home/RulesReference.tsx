import { useState } from 'react';
import { NoTableProvider, formatShortcut, useAction, useShortcut, useTableUi } from '@/app';
import { Button, Tooltip } from '@/ui';
import { Compendium } from '@/features/compendium';

export interface RulesReferenceProps {
  /** Set it on a screen outside any table, such as the home page, so the compendium has a table to read. */
  away?: boolean;
}

/**
 * The page header's "Rules reference" button, with the compendium it opens and the `B` shortcut. The lobby and
 * the home page render it, so the rules reference works wherever a signed-in user can be. The play screen has its
 * own in the tool rail and the table menu.
 */
export function RulesReference({ away = false }: RulesReferenceProps) {
  const open = useTableUi((s) => s.compendiumOpen);
  const entry = useTableUi((s) => s.compendiumEntry);
  const setOpen = useTableUi((s) => s.setCompendiumOpen);
  const openCompendium = useTableUi((s) => s.openCompendium);
  const toggle = useTableUi((s) => s.toggleCompendium);
  // The compendium loads every catalog shortly after it mounts, so it mounts on first use.
  const [used, setUsed] = useState(open);
  if (open && !used) setUsed(true);

  useShortcut({ id: 'page.compendium', keys: 'b', label: 'Open or close the rules reference', run: toggle });
  useAction({
    id: 'page.compendium',
    label: 'Open the rules reference',
    icon: 'book',
    shortcut: 'b',
    run: () => openCompendium(),
  });

  const book = used ? <Compendium open={open} onOpenChange={setOpen} entry={entry} /> : null;
  return (
    <>
      <Tooltip content="Rules reference" shortcut={formatShortcut('b')} side="bottom">
        <Button variant="ghost" size="sm" icon="book" onClick={() => openCompendium()}>
          Rules reference
        </Button>
      </Tooltip>
      {away ? <NoTableProvider>{book}</NoTableProvider> : book}
    </>
  );
}
