/**
 * The text context for the combat views: the table's context with each monster target of the scene named by its
 * label, so a declaration or a refusal that names a monster by handle reads "Goblin 2".
 */
import type { SceneTarget } from '@bxvtt/shared/protocol';
import { isProperLabel, type TextContext } from '@bxvtt/shared/text';
import { useMemo } from 'react';
import { useScene, useTextContext } from '@/app';

const NO_TARGETS: readonly SceneTarget[] = [];

/**
 * What to call a target: its label, such as "Goblin 2", or the bare name of a named individual who is the only
 * one of that name, such as "Mag Corrie" rather than "Mag Corrie 1".
 */
export function targetLabel(
  target: SceneTarget,
  targets: readonly SceneTarget[],
  groupLabel: string | undefined,
): string {
  // The target's label always starts with a capital, so the group's label says whether it is a name.
  if (groupLabel === undefined || !isProperLabel(groupLabel)) return target.label;
  const base = target.label.replace(/\s+\d+$/, '');
  const same = targets.filter((t) => t.label.replace(/\s+\d+$/, '') === base);
  return same.length <= 1 ? base : target.label;
}

/** Names each target handle by its label, such as "Goblin 2" or "Mag Corrie". */
export function withTargetLabels(ctx: TextContext, targets: readonly SceneTarget[]): TextContext {
  if (targets.length === 0) return ctx;
  const monsters = { ...ctx.monsters };
  for (const target of targets) {
    const group = ctx.groups[target.group_id];
    monsters[target.handle] = {
      label: group?.label ?? target.label.replace(/\s+\d+$/, '').toLowerCase(),
      labelPlural: group?.labelPlural,
      name: targetLabel(target, targets, group?.label),
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
