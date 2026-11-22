import { usePlayerView } from '@/app';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui';
import { useTownServices } from './hooks';
import { Masthead } from './Masthead';
import { Outfitter } from './Outfitter';
import { RestAndPrepare } from './RestAndPrepare';
import { LeaveDialog } from './Road';
import { Square } from './Square';
import { Temple } from './Temple';
import { Treasure } from './Treasure';
import { useTownUi, type TownSection } from './townUi';
import styles from './TownStage.module.css';

/**
 * The stage while the party is in town: the town's name and description over a drawn village, with tabs for the
 * square, the outfitter, the temple, the treasure buyers, and rest. Only the services that are legal for the
 * viewer show as tabs.
 */
export function TownStage() {
  const view = usePlayerView();
  const services = useTownServices();
  const stored = useTownUi((s) => s.section);
  const setSection = useTownUi((s) => s.setSection);
  if (view === null) return null;

  const allowed: Record<TownSection, boolean> = {
    square: true,
    outfitter: services.outfitter,
    temple: services.temple,
    treasure: services.treasure,
    rest: services.rest,
  };
  const section = allowed[stored] ? stored : 'square';

  return (
    <div className={styles.stage}>
      <Masthead
        townName={view.town_name}
        townDescription={view.town_description}
        adventureName={view.adventure_name}
        compact={section !== 'square'}
      />
      <Tabs
        value={section}
        onValueChange={(value) => setSection(value as TownSection)}
        variant="line"
        className={styles.tabs}
      >
        <TabsList aria-label="Parts of town" className={styles.tabList}>
          <TabsTrigger value="square" icon="town">
            Town square
          </TabsTrigger>
          {services.outfitter && (
            <TabsTrigger value="outfitter" icon="chest">
              Outfitter
            </TabsTrigger>
          )}
          {services.temple && (
            <TabsTrigger value="temple" icon="heart">
              Temple
            </TabsTrigger>
          )}
          {services.treasure && (
            <TabsTrigger value="treasure" icon="gem">
              Treasure buyers
            </TabsTrigger>
          )}
          {services.rest && (
            <TabsTrigger value="rest" icon="rest">
              Rest and prepare
            </TabsTrigger>
          )}
        </TabsList>
        <TabsContent value="square" className={styles.content}>
          <Square />
        </TabsContent>
        <TabsContent value="outfitter" className={styles.content}>
          <Outfitter />
        </TabsContent>
        <TabsContent value="temple" className={styles.content}>
          <Temple />
        </TabsContent>
        <TabsContent value="treasure" className={styles.content}>
          <Treasure />
        </TabsContent>
        <TabsContent value="rest" className={styles.content}>
          <RestAndPrepare />
        </TabsContent>
      </Tabs>
      <LeaveDialog />
    </div>
  );
}
