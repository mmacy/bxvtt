import { Dialog, EmptyState } from '@/ui';

export interface SavesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * The table's saves. Any member can save, and relabel or delete their own saves. A referee can restore a save,
 * export it, and relabel or delete any save. The shell opens it from the table menu.
 */
export function SavesDialog({ open, onOpenChange }: SavesDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Saves" size="md">
      <EmptyState
        icon="save"
        title="Saves"
        description="The table's saved games show here, with a way to save now and, for a referee, to restore."
      />
    </Dialog>
  );
}
