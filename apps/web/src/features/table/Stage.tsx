import { useGameMode, useMapBus, usePartyLocation, useShortcut } from '@/app';
import { Button } from '@/ui';
import { BattleBoard, EncounterPanel } from '@/features/combat';
import { MapStage, ScenePanel } from '@/features/explore';
import { TownStage } from '@/features/town';
import { ConnectionBanner } from './ConnectionBanner';
import { EndScreen } from './EndScreen';
import styles from './table.module.css';

/** The prompt of an open map pick, with a cancel button. Escape cancels it too. */
function PickPrompt() {
  const pick = useMapBus((s) => s.pick);
  const cancel = useMapBus((s) => s.cancelPick);
  useShortcut({
    id: 'table.pick.cancel',
    keys: 'escape',
    label: 'Cancel picking on the map',
    group: 'Map',
    enabled: pick !== null,
    run: cancel,
  });
  if (pick === null) return null;
  return (
    <div className={styles.pickPrompt} role="status">
      <span>{pick.prompt}</span>
      <Button size="sm" variant="secondary" onClick={cancel}>
        Cancel
      </Button>
    </div>
  );
}

/**
 * The stage: the town in town, the map in a dungeon in every mode, with the scene, encounter, and battle overlays
 * over it, and the end screen after the game ends.
 *
 * Overlay slots: the scene panel sits in the top corner, and the encounter panel and the battle board sit at the
 * bottom center, above the action bar. Each slot positions its feature, and the feature sizes itself.
 */
export function Stage() {
  const mode = useGameMode();
  const location = usePartyLocation();
  if (mode === 'game_over' || mode === 'victory') {
    return (
      <div className={styles.stageRoot}>
        <EndScreen />
      </div>
    );
  }
  const inTown = location?.kind !== 'dungeon';
  return (
    <div className={styles.stageRoot}>
      <div className={styles.stageBase}>{inTown ? <TownStage /> : <MapStage />}</div>
      <div className={styles.overlays}>
        <div className={styles.overlayTop}>
          <ConnectionBanner floating />
          <PickPrompt />
        </div>
        {!inTown && mode === 'exploring' && (
          <div className={styles.overlayCorner}>
            <ScenePanel />
          </div>
        )}
        {mode === 'encounter' && (
          <div className={styles.overlayBottom}>
            <EncounterPanel />
          </div>
        )}
        {mode === 'battle' && (
          <div className={styles.overlayBottom}>
            <BattleBoard />
          </div>
        )}
      </div>
    </div>
  );
}
