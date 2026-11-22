import type { CompendiumEntry } from '@/app';
import { Drawer, EmptyState } from '@/ui';

export interface CompendiumProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The entry to open at, such as `{ kind: 'spells', id: 'sleep' }`, or `null` for the first page. */
  entry: CompendiumEntry | null;
}

/**
 * The rules reference: classes, equipment, spells, monsters, magic items, languages, tables, and commands, from
 * the cached catalog hooks. The shell renders it, and any feature opens it with `useTableUi().openCompendium()`.
 */
export function Compendium({ open, onOpenChange }: CompendiumProps) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange} title="Rules reference" width="min(560px, 94vw)">
      <EmptyState
        icon="book"
        title="Rules reference"
        description="Spells, monsters, equipment, classes, and the rules tables show here."
      />
    </Drawer>
  );
}
