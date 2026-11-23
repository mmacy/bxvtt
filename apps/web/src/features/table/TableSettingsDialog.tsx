import { useIsReferee, useTableUi } from '@/app';
import { Dialog } from '@/ui';
import { TableSettingsForm } from '@/features/lobby';

/** The table settings during play: the lobby's settings form in a dialog. */
export function TableSettingsDialog() {
  const open = useTableUi((s) => s.settingsOpen);
  const setOpen = useTableUi((s) => s.setSettingsOpen);
  const referee = useIsReferee();
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title="Table settings"
      description={
        referee
          ? 'Changes apply immediately for everyone at the table.'
          : 'Only the referee can change these settings.'
      }
      size="md"
    >
      {open && <TableSettingsForm showName />}
    </Dialog>
  );
}
