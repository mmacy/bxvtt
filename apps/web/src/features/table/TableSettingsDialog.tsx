import { useIsReferee, useTableUi } from '@/app';
import { Dialog, Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui';
import { TableRulesForm, TableSettingsForm } from '@/features/lobby';
import styles from './table.module.css';

/** The table settings during play: the lobby's two settings forms, the table and the rules, on two tabs. */
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
          ? 'Everyone at the table sees each change at once.'
          : 'Only a referee can change these settings.'
      }
      size="lg"
      className={styles.settingsDialog}
    >
      {open && (
        <Tabs defaultValue="table">
          <TabsList aria-label="Table settings" className={styles.settingsTabs}>
            <TabsTrigger value="table">Table</TabsTrigger>
            <TabsTrigger value="rules">Rules</TabsTrigger>
          </TabsList>
          <TabsContent value="table" className={styles.settingsTab}>
            <TableSettingsForm showName />
          </TabsContent>
          <TabsContent value="rules" className={styles.settingsTab}>
            <TableRulesForm />
          </TabsContent>
        </Tabs>
      )}
    </Dialog>
  );
}
