/**
 * The text context for the combat views: the table's context with each monster target of the scene named by its
 * label, so a declaration or a refusal that names a monster by handle reads "Goblin 2".
 */
import type { SceneTarget } from '@bxvtt/shared/protocol';
import type { TextContext } from '@bxvtt/shared/text';
import { useMemo } from 'react';
import { useScene, useTextContext } from '@/app';

const NO_TARGETS: readonly SceneTarget[] = [];

/** Names each target handle by its label, such as "Goblin 2". */
export function withTargetLabels(ctx: TextContext, targets: readonly SceneTarget[]): TextContext {
  if (targets.length === 0) return ctx;
  const monsters = { ...ctx.monsters };
  for (const target of targets) {
    const group = ctx.groups[target.group_id];
    monsters[target.handle] = {
      label: group?.label ?? target.label.replace(/\s+\d+$/, '').toLowerCase(),
      labelPlural: group?.labelPlural,
      name: target.label,
    };
  }
  return { ...ctx, monsters };
}

/** The scene's monster targets, or an empty list. */
export function useSceneTargets(): readonly SceneTarget[] {
  return useScene()?.targets ?? NO_TARGETS;
}

/** The text context with the scene's monster targets named. */
export function useCombatText(): TextContext {
  const ctx = useTextContext();
  const targets = useSceneTargets();
  return useMemo(() => withTargetLabels(ctx, targets), [ctx, targets]);
}
