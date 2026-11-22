import { Suspense, useEffect } from 'react';
import { useCombatStage, useMapBus, usePartyLocation, useShortcut, useShownMode } from '@/app';
import { Button } from '@/ui';
import { BattleBoard, EncounterPanel } from '@/features/combat';
import { ScenePanel } from '@/features/explore';
import { TownStage } from '@/features/town';
import { ConnectionBanner } from './ConnectionBanner';
import { EndScreen } from './EndScreen';
import { LoadingScreen } from './LoadingScreen';
import { MapStagePart } from './parts';
import { RejoinPrompt } from './RejoinPrompt';
import styles from './table.module.css';

// The map and its renderer load as a part of their own, when the party first enters a dungeon.
const MapStage = MapStagePart;

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
 * The after-fight slot: what the combat feature put in `useCombatStage().aftermath`, such as the summary of a
 * finished fight. It shows at the bottom center in every mode that follows a fight, and a new fight clears it.
 */
function AftermathSlot({ mode }: { mode: string | null }) {
  const aftermath = useCombatStage((s) => s.aftermath);
  const close = useCombatStage((s) => s.closeAftermath);
  const fighting = mode === 'encounter' || mode === 'battle';
  useEffect(() => {
    if (fighting && aftermath !== null) close();
  }, [fighting, aftermath, close]);
  if (fighting || aftermath === null) return null;
  return (
    <div className={styles.overlayBottom} data-slot="aftermath">
      {aftermath}
    </div>
  );
}

/**
 * The stage: the town in town, the map in a dungeon in every mode, with the scene, encounter, and battle overlays
 * over it, and the end screen after the game ends.
 *
 * Overlay slots: the scene panel sits in the top corner, and the encounter panel, the battle board, and the
 * after-fight slot sit at the bottom center, above the action bar. Each slot positions its feature, and the
 * feature sizes itself.
 *
 * The stage follows the shown mode, which holds a fight on screen while the round that ended the game plays back.
 */
export function Stage() {
  const mode = useShownMode();
  const location = usePartyLocation();
  if (mode === 'game_over' || mode === 'victory') {
    return (
      <div className={styles.stageRoot}>
        <EndScreen />
        <div className={styles.endRejoin}>
          <RejoinPrompt />
        </div>
      </div>
    );
  }
  const inTown = location?.kind !== 'dungeon';
  return (
    <div className={styles.stageRoot}>
      <div className={styles.stageBase}>
        {inTown ? (
          <TownStage />
        ) : (
          <Suspense fallback={<LoadingScreen label="Drawing the map" compact />}>
            <MapStage />
          </Suspense>
        )}
      </div>
      <div className={styles.overlays}>
        {/* On a map, the prompts sit below the map's toolbar, so its level switcher stays usable during a pick. */}
        <div className={inTown ? styles.overlayTop : `${styles.overlayTop} ${styles.overlayBelowChrome}`}>
          <ConnectionBanner floating />
          <RejoinPrompt />
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
        <AftermathSlot mode={mode} />
      </div>
    </div>
  );
}
