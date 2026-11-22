/**
 * Sentences for the parts of an adventure document that the text layer doesn't describe: trigger patterns,
 * gate and trigger conditions, consequences and rewards, trap effects, and keyed encounters. Each names things
 * through the text context and the adventure, so the referee reads names instead of IDs.
 */
import {
  areaName,
  capitalizeFirst,
  commandInfo,
  conditionLabel,
  count,
  directionLabel,
  dungeonName,
  formatCoins,
  formatDice,
  formatFeet,
  itemName,
  monsterTemplateLabels,
  prettifyId,
  saveVersus,
  stanceLabel,
  timeUnitNoun,
  withArticle,
  type TextContext,
} from '@bxvtt/shared/text';
import {
  bundledMonsterLabel,
  type Adventure,
  type Condition,
  type Consequence,
  type KeyedEncounter,
  type TrapSpec,
  type TriggerClause,
  type TriggerPattern,
} from './adventure';

/** What to call a monster template, one or several: `goblin`, `goblins`. */
export function templateLabel(templateId: string, adventure: Adventure | null, amount = 1): string {
  const labels = bundledMonsterLabel(adventure, templateId) ?? monsterTemplateLabels(templateId);
  const one = labels?.label ?? prettifyId(templateId);
  const many = labels?.labelPlural ?? `${one}s`;
  return amount === 1 ? one : many;
}

/** What the players see in place of a bundled monster, when the author disguised it, such as `robed corpse`. */
export function templateDisguise(templateId: string, adventure: Adventure | null): string | null {
  return bundledMonsterLabel(adventure, templateId)?.disguise ?? null;
}

/** A number of monsters, given as dice or a fixed number: `2 goblins`, `1d3 giant toads`. */
export function monsterCount(
  templateId: string,
  countFixed: number | null | undefined,
  countDice: string | null | undefined,
  adventure: Adventure | null,
): string {
  if (countFixed === 1 && bundledMonsterLabel(adventure, templateId)?.proper) {
    return templateLabel(templateId, adventure);
  }
  if (countFixed !== null && countFixed !== undefined) {
    return `${countFixed} ${templateLabel(templateId, adventure, countFixed)}`;
  }
  if (countDice) return `${formatDice(countDice)} ${templateLabel(templateId, adventure, 2)}`;
  return templateLabel(templateId, adventure, 2);
}

/** A flag value inside a sentence, in words: `“laid to rest”` for the authored value `laid_to_rest`. */
function flagValue(value: unknown): string {
  if (typeof value === 'string') return `“${value.replace(/_/g, ' ')}”`;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

/**
 * A sentence fragment that starts with a capital, made fit to follow another word: a leading `The`, `A`, or
 * `An` becomes lower case, and a name such as `Gashnak One-Ear` keeps its capitals.
 */
function asClause(text: string): string {
  return /^(The|A|An)\s/.test(text) ? `${text[0]?.toLowerCase() ?? ''}${text.slice(1)}` : text;
}

/** A dungeon's name inside a sentence: a leading `The` becomes `the`. */
function dungeonInSentence(id: string, ctx: TextContext): string {
  return dungeonName(id, ctx).replace(/^The\s/, 'the ');
}

/** What makes a trigger, objective, or quest activation fire, as a sentence fragment starting with a capital. */
export function patternText(pattern: TriggerPattern, ctx: TextContext, adventure?: Adventure | null): string {
  switch (pattern.pattern_type) {
    case 'area_entered':
      return `The party enters ${areaName(pattern.area_id, ctx, pattern.dungeon_id, pattern.level_number)}`;
    case 'level_entered':
      return `The party reaches level ${pattern.level_number} of ${dungeonInSentence(pattern.dungeon_id, ctx)}`;
    case 'dungeon_entered':
      return `The party enters ${dungeonInSentence(pattern.dungeon_id, ctx)}`;
    case 'town_entered':
      return ctx.townName ? `The party returns to ${ctx.townName}` : 'The party returns to town';
    case 'item_acquired':
      return `A member gains ${itemName(pattern.item_id, ctx)}`;
    case 'monster_defeated': {
      const bundled = bundledMonsterLabel(adventure ?? null, pattern.template_id);
      if (bundled?.proper) return `${bundled.label} is slain or routed`;
      const label = bundled?.label ?? withArticleLabel(pattern.template_id);
      return `${capitalizeFirst(bundled ? withArticle(label) : label)} is slain or routed`;
    }
    case 'flag_set': {
      const flag = capitalizeFirst(flagPhrase(pattern.key, ctx, adventure ?? null));
      return pattern.value === null || pattern.value === undefined
        ? `${flag} is written`
        : `${flag} is set to ${flagValue(pattern.value)}`;
    }
    default:
      return 'Something happens in play';
  }
}

function withArticleLabel(templateId: string): string {
  const label = monsterTemplateLabels(templateId)?.label ?? prettifyId(templateId);
  return /^[aeiou]/i.test(label) ? `an ${label}` : `a ${label}`;
}

/** A gate, trigger, or quest condition, as a sentence fragment: `a member carries holy water, which is used up`. */
export function conditionText(condition: Condition, ctx: TextContext, adventure?: Adventure | null): string {
  switch (condition.condition_type) {
    case 'has_item':
      return `a member carries ${itemName(condition.item_id, ctx)}${condition.consumes ? ', which is used up' : ''}`;
    case 'flag_equals':
      return `${flagPhrase(condition.key, ctx, adventure ?? null)} reads ${flagValue(condition.value)}`;
    case 'effect_active':
      return `a member is under the effect ${prettifyId(condition.kind)}`;
    default:
      return 'a condition holds';
  }
}

/** A trigger clause: its pattern, with its conditions when it has any. */
export function clauseText(clause: TriggerClause, ctx: TextContext, adventure?: Adventure | null): string {
  const base = patternText(clause.pattern, ctx, adventure);
  const conditions = clause.conditions ?? [];
  if (conditions.length === 0) return `${base}.`;
  return `${base}, while ${conditions.map((c) => conditionText(c, ctx, adventure)).join(' and ')}.`;
}

/**
 * A flag named by what the adventure does to set it, since a flag has a key but no name: `the flag set when a
 * hobgoblin is slain or routed`, `the flag set as a reward for Break the Red Thumbs`, or `a story flag` when
 * nothing in the adventure sets it.
 */
export function flagPhrase(key: string, ctx: TextContext, adventure: Adventure | null): string {
  if (!adventure) return 'a story flag';
  for (const trigger of adventure.triggers) {
    for (const c of trigger.consequences) {
      const command = c as unknown as Record<string, unknown>;
      if (
        command.command_type === 'set_flag' &&
        command.key === key &&
        trigger.when.pattern_type !== 'flag_set'
      ) {
        const when = patternText(trigger.when, ctx, adventure);
        return `the flag set when ${asClause(when)}`;
      }
    }
  }
  for (const quest of adventure.quests) {
    for (const reward of quest.rewards) {
      const command = reward as unknown as Record<string, unknown>;
      if (command.command_type === 'set_flag' && command.key === key) {
        return `the flag set as a reward for ${quest.name}`;
      }
    }
  }
  return 'a story flag';
}

/** What reads a flag, as a sentence: `It opens a way out on level 2.`, or `null` when nothing reads it. */
function flagReader(key: string, ctx: TextContext, adventure: Adventure | null): string | null {
  if (!adventure) return null;
  const reads = (flagUses(adventure, ctx).get(key) ?? []).filter((use) => !use.startsWith('Set to'));
  const first = reads[0];
  if (!first) return null;
  return `It ${first[0]?.toLowerCase() ?? ''}${first.slice(1)}`.replace(
    /^It checked by/,
    'The game checks it for',
  );
}

function selectorText(selector: unknown, ctx: TextContext): string {
  if (selector === '@party') return 'each living member';
  if (selector === '@first') return 'the first living member';
  if (selector === '@carrier') return 'whoever carries it';
  if (typeof selector === 'string') return ctx.members[selector]?.name ?? 'a member';
  return 'a member';
}

function doorChanges(c: Record<string, unknown>): string {
  const parts: string[] = [];
  if (c.open === true) parts.push('open');
  if (c.open === false) parts.push('close');
  if (c.unlocked === true) parts.push('unlock');
  if (c.unlocked === false) parts.push('lock');
  if (c.discovered === true) parts.push('reveal');
  if (c.discovered === false) parts.push('hide');
  if (c.wedged === true) parts.push('wedge');
  if (c.wedged === false) parts.push('free');
  return parts.length === 0 ? 'Change' : capitalizeFirst(parts.join(' and '));
}

/** What one consequence or reward does, as a sentence. */
export function consequenceText(
  consequence: Consequence,
  ctx: TextContext,
  adventure: Adventure | null,
): string {
  const c = consequence as unknown as Record<string, unknown> & { command_type: string };
  switch (c.command_type) {
    case 'set_flag': {
      const reader = flagReader(String(c.key), ctx, adventure);
      return `Set a story flag to ${flagValue(c.value)}.${reader ? ` ${reader}` : ''}`;
    }
    case 'grant_coins':
      return `Give ${formatCoins((c.coins ?? {}) as Record<string, number>, 'long')} to ${selectorText(c.character_id, ctx)}.`;
    case 'remove_coins':
      return `Take ${formatCoins((c.coins ?? {}) as Record<string, number>, 'long')} from ${selectorText(c.character_id, ctx)}.`;
    case 'grant_item':
      return `Give ${itemName(String(c.item_id), ctx)} to ${selectorText(c.character_id, ctx)}.`;
    case 'remove_item':
      return `Take ${itemName(String(c.item_id), ctx)} from ${selectorText(c.character_id, ctx)}.`;
    case 'award_xp':
      return `Award ${count(Number(c.amount ?? 0), 'experience point')} to ${selectorText(c.character_id, ctx)}.`;
    case 'spawn_monsters':
      return `Spawn ${monsterCount(String(c.template_id), c.count_fixed as number | null, c.count_dice as string | null, adventure)} ${formatFeet(Number(c.distance_feet ?? 0))} away.`;
    case 'spawn_npc_party':
      return `Spawn a party of NPC adventurers ${formatFeet(Number(c.distance_feet ?? 0))} away.`;
    case 'set_door_state':
      return `${doorChanges(c)} the door on the ${directionLabel(String(c.direction)).toLowerCase()} side of cell ${String(c.x)}, ${String(c.y)} on level ${String(c.level_number)}.`;
    case 'place_party': {
      const location = (c.location ?? {}) as Record<string, unknown>;
      if (location.kind === 'town') return 'Move the party to town.';
      return `Move the party to level ${String(location.level_number)} of ${dungeonInSentence(String(location.dungeon_id), ctx)}.`;
    }
    case 'advance_time': {
      const n = Number(c.n ?? 0);
      return `Advance the clock ${n} ${timeUnitNoun(String(c.unit ?? 'turn'), n)}.`;
    }
    case 'end_encounter':
      return 'End the encounter.';
    default:
      return `${commandInfo(c.command_type).label}.`;
  }
}

/** What a trap does when it springs, as one or two sentences. */
export function trapText(trap: TrapSpec): string {
  const effect = trap.effect;
  const parts: string[] = [];
  if (effect.manual) parts.push(effect.manual);
  if (effect.kills) parts.push('It kills.');
  if (effect.damage_dice) parts.push(`It deals ${formatDice(effect.damage_dice)} damage.`);
  if (effect.volley_dice) parts.push(`It fires ${formatDice(effect.volley_dice)} times.`);
  if (effect.fall_feet) parts.push(`It drops its victim ${formatFeet(effect.fall_feet)}.`);
  if (effect.condition) {
    const unit = effect.condition_duration_unit ?? 'round';
    const duration = effect.condition_duration_dice
      ? ` for ${formatDice(effect.condition_duration_dice)} ${timeUnitNoun(unit, 2)}`
      : effect.condition_duration_amount
        ? ` for ${effect.condition_duration_amount} ${timeUnitNoun(unit, effect.condition_duration_amount)}`
        : '';
    parts.push(`It leaves its victim ${conditionLabel(effect.condition).toLowerCase()}${duration}.`);
  }
  if (effect.transition) parts.push(`It drops the party to level ${effect.transition.to_level_number}.`);
  if (effect.save) {
    const outcome = effect.save.on_save === 'half' ? 'halves the damage' : 'avoids it';
    const modifier = effect.save.modifier
      ? ` at ${effect.save.modifier > 0 ? '+' : ''}${effect.save.modifier}`
      : '';
    parts.push(`A save versus ${saveVersus(effect.save.category)}${modifier} ${outcome}.`);
  }
  if (parts.length === 0) parts.push('It has no automatic effect. Describe what happens.');
  return parts.join(' ');
}

/** When a trap springs and whom it hits: `Springs on entering. Hits whoever sets it off.` */
export function trapTriggerText(trap: TrapSpec): string {
  const when =
    trap.trigger === 'enter'
      ? trap.kind === 'room'
        ? 'Springs when someone enters.'
        : 'Springs when someone reaches it.'
      : 'Springs when someone opens it.';
  const who = trap.affects === 'party' ? 'It hits the whole party.' : 'It hits whoever sets it off.';
  return `${when} ${who}`;
}

/** A keyed encounter's monsters: `2 goblins and 1 hobgoblin`. */
export function encounterText(encounter: KeyedEncounter, adventure: Adventure | null): string {
  const parts = encounter.monsters.map((m) => {
    const text = monsterCount(m.template_id, m.count_fixed, m.count_dice, adventure);
    const disguise = templateDisguise(m.template_id, adventure);
    return disguise ? `${text} (seen as ${withArticle(disguise)})` : text;
  });
  if (parts.length <= 1) return parts[0] ?? 'No monsters';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** The facts of a keyed encounter that aren't its monsters, as short labels. */
export function encounterTags(encounter: KeyedEncounter): string[] {
  const tags: string[] = [];
  if (encounter.aware) tags.push('Aware of the party');
  if (encounter.stance) tags.push(stanceLabel(encounter.stance));
  if (encounter.hoard) tags.push('Lair hoard');
  return tags;
}

/**
 * What the adventure does with each flag, as short sentences keyed by flag name: what sets it ("Set to “dead”
 * when a hobgoblin is slain or routed.") and what reads it ("Checked by the objective Report to Reeve Tamsin
 * Hale.").
 */
export function flagUses(adventure: Adventure, ctx: TextContext): Map<string, string[]> {
  const uses = new Map<string, string[]>();
  const add = (key: string, text: string) => {
    const list = uses.get(key) ?? [];
    if (!list.includes(text)) list.push(text);
    uses.set(key, list);
  };
  const readBy = (conditions: readonly Condition[] | undefined, what: string) => {
    for (const condition of conditions ?? []) {
      if (condition.condition_type === 'flag_equals') add(condition.key, `Checked by ${what}.`);
    }
  };
  const lowerFirst = asClause;
  for (const trigger of adventure.triggers) {
    const when = lowerFirst(patternText(trigger.when, ctx, adventure));
    for (const c of trigger.consequences) {
      const command = c as unknown as Record<string, unknown>;
      if (command.command_type === 'set_flag' && typeof command.key === 'string') {
        add(command.key, `Set to ${flagValue(command.value)} when ${when}.`);
      }
    }
    readBy(trigger.conditions, `the trigger for when ${when}`);
    if (trigger.when.pattern_type === 'flag_set') add(trigger.when.key, 'Setting it fires a trigger.');
  }
  for (const quest of adventure.quests) {
    for (const reward of quest.rewards) {
      const command = reward as unknown as Record<string, unknown>;
      if (command.command_type === 'set_flag' && typeof command.key === 'string') {
        add(command.key, `Set to ${flagValue(command.value)} as a reward for ${quest.name}.`);
      }
    }
    if (quest.activation) readBy(quest.activation.conditions, `the start of the quest ${quest.name}`);
    for (const objective of quest.objectives) {
      readBy(objective.when.conditions, `the objective ${objective.name}`);
      if (objective.reveal_when)
        readBy(objective.reveal_when.conditions, `the reveal of the objective ${objective.name}`);
    }
  }
  for (const dungeon of adventure.dungeons) {
    for (const level of dungeon.levels) {
      for (const edge of Object.values(level.edges)) {
        const condition = edge.door?.requires?.condition;
        if (condition?.condition_type === 'flag_equals')
          add(condition.key, `Opens a gated door on level ${level.number}.`);
      }
      for (const transition of level.transitions) {
        const condition = transition.requires?.condition;
        if (condition?.condition_type === 'flag_equals')
          add(condition.key, `Opens a way out on level ${level.number}.`);
      }
    }
  }
  return uses;
}
