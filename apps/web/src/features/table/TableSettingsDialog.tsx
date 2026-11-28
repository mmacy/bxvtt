import { useIsReferee, useTableUi } from '@/app';
import { Dialog, Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui';
import { RulesSummary, TableRulesForm, TableSettingsForm } from '@/features/lobby';
import styles from './table.module.css';

/**
 * The table settings during play: for a referee, the lobby's two settings forms, the table and the rules, on two
 * tabs. A player reads the table's rules.
 */
export function TableSettingsDialog() {
  const open = useTableUi((s) => s.settingsOpen);
  const setOpen = useTableUi((s) => s.setSettingsOpen);
  const referee = useIsReferee();
  if (!referee) {
    return (
      <Dialog open={open} onOpenChange={setOpen} title="Table rules" size="md">
        {open && <RulesSummary />}
      </Dialog>
    );
  }
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title="Table settings"
      description="Everyone at the table sees each change at once."
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
