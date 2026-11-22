/**
 * The quest log: the active quests from the player view, the quests the party finished (which leave the player
 * view), and for a referee with the lens on, the hidden objectives and the quests not offered yet.
 */
import type { PlayerView, RefereeState } from '@bxvtt/shared/protocol';

/** One objective as the quest log shows it. */
export interface ObjectiveCard {
  id: string;
  name: string;
  complete: boolean;
  /** Players haven't been told about it yet. Only a referee with the lens on sees these. */
  hidden: boolean;
}

/** One quest as the quest log shows it. */
export interface QuestCard {
  id: string;
  name: string;
  speaker: string;
  /** The offer text. */
  narrative: string;
  /** The completion text, for a finished quest. */
  completion: string | null;
  objectives: ObjectiveCard[];
  status: 'active' | 'completed' | 'inactive';
}

/** What the event log says about one quest. */
export interface QuestHistory {
  id: string;
  name: string;
  offer: string | null;
  completion: string | null;
  completed: boolean;
  objectives: Array<{ id: string; name: string; complete: boolean }>;
}

/** The quest events the log reads. */
interface QuestEvent {
  event_type: string;
  quest_id?: unknown;
  objective_id?: unknown;
  name?: unknown;
  quest_name?: unknown;
  narrative?: unknown;
}

const QUEST_EVENTS = new Set([
  'quest_activated',
  'objective_revealed',
  'objective_completed',
  'quest_completed',
]);

/** Whether an event changes the quest log. */
export function isQuestEvent(event: { event_type: string }): boolean {
  return QUEST_EVENTS.has(event.event_type);
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

/**
 * Folds quest events, oldest first, into what the party knows about each quest.
 *
 * @param events - Events in the order they happened. Other event types are ignored.
 * @param previous - History to add to.
 */
export function foldQuestEvents(
  events: readonly QuestEvent[],
  previous: ReadonlyMap<string, QuestHistory> = new Map(),
): Map<string, QuestHistory> {
  const history = new Map<string, QuestHistory>();
  for (const [id, quest] of previous)
    history.set(id, { ...quest, objectives: quest.objectives.map((o) => ({ ...o })) });
  for (const event of events) {
    if (!isQuestEvent(event)) continue;
    const id = text(event.quest_id);
    if (id === null) continue;
    const name = event.event_type.startsWith('quest_') ? text(event.name) : text(event.quest_name);
    let quest = history.get(id);
    if (!quest) {
      quest = {
        id,
        name: name ?? 'A quest',
        offer: null,
        completion: null,
        completed: false,
        objectives: [],
      };
      history.set(id, quest);
    } else if (name !== null) {
      quest.name = name;
    }
    if (event.event_type === 'quest_activated') quest.offer = text(event.narrative) ?? quest.offer;
    if (event.event_type === 'quest_completed') {
      quest.completed = true;
      quest.completion = text(event.narrative) ?? quest.completion;
    }
    if (event.event_type === 'objective_revealed' || event.event_type === 'objective_completed') {
      const objectiveId = text(event.objective_id);
      if (objectiveId === null) continue;
      let objective = quest.objectives.find((o) => o.id === objectiveId);
      if (!objective) {
        objective = { id: objectiveId, name: text(event.name) ?? 'An objective', complete: false };
        quest.objectives.push(objective);
      }
      if (event.event_type === 'objective_completed') objective.complete = true;
    }
  }
  return history;
}

/** The parts of a quest in the adventure document that the quest log reads. */
interface QuestSpecLike {
  id: string;
  name?: string;
  objectives?: Array<{ id: string; name?: string | null }>;
  narrative?: { offer?: string | null; completion?: string | null; speaker?: string | null } | null;
}

/** The quests of an adventure document, wherever the document keeps them. */
export function adventureQuests(document: Record<string, unknown> | null): QuestSpecLike[] {
  if (document === null) return [];
  const payload = (document.payload as Record<string, unknown> | undefined) ?? document;
  const quests = payload.quests;
  if (!Array.isArray(quests)) return [];
  return quests.filter(
    (quest): quest is QuestSpecLike =>
      typeof quest === 'object' && quest !== null && typeof quest.id === 'string',
  );
}

export interface QuestLog {
  active: QuestCard[];
  completed: QuestCard[];
  /** Quests the party hasn't been offered. Only a referee with the lens on sees these. */
  notOffered: QuestCard[];
}

/**
 * Builds the quest log.
 *
 * @param options - The player view's quests, the history from the event log, and for a referee with the lens on,
 *   the referee state and the adventure's quests.
 */
export function buildQuestLog(options: {
  quests: PlayerView['quests'];
  history: ReadonlyMap<string, QuestHistory>;
  referee: Pick<RefereeState, 'quests'> | null;
  adventure: readonly QuestSpecLike[];
}): QuestLog {
  const specs = new Map(options.adventure.map((spec) => [spec.id, spec]));
  const refereeQuests = (options.referee?.quests ?? {}) as Record<
    string,
    { status?: string; objectives?: Record<string, { revealed?: boolean; complete?: boolean }> }
  >;

  const active: QuestCard[] = options.quests.map((quest) => {
    const objectives: ObjectiveCard[] = quest.objectives.map((objective) => ({
      id: objective.id,
      name: objective.name,
      complete: objective.state === 'complete',
      hidden: false,
    }));
    const state = refereeQuests[quest.id];
    if (state?.objectives) {
      const spec = specs.get(quest.id);
      for (const [id, objective] of Object.entries(state.objectives)) {
        if (objective.revealed !== false || objectives.some((o) => o.id === id)) continue;
        const name = spec?.objectives?.find((o) => o.id === id)?.name;
        objectives.push({
          id,
          name: name || 'An objective the players haven’t learned of',
          complete: objective.complete === true,
          hidden: true,
        });
      }
      // Keep the adventure's order.
      const order = spec?.objectives?.map((o) => o.id) ?? [];
      objectives.sort((a, b) => {
        const ai = order.indexOf(a.id);
        const bi = order.indexOf(b.id);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      });
    }
    return {
      id: quest.id,
      name: quest.name,
      speaker: quest.speaker,
      narrative: quest.narrative,
      completion: null,
      objectives,
      status: 'active',
    };
  });

  const activeIds = new Set(active.map((quest) => quest.id));
  const completed: QuestCard[] = [];
  for (const quest of options.history.values()) {
    if (!quest.completed || activeIds.has(quest.id)) continue;
    const spec = specs.get(quest.id);
    completed.push({
      id: quest.id,
      name: quest.name,
      speaker: spec?.narrative?.speaker ?? '',
      narrative: quest.offer ?? spec?.narrative?.offer ?? '',
      completion: quest.completion ?? spec?.narrative?.completion ?? null,
      objectives: quest.objectives.map((o) => ({ ...o, hidden: false })),
      status: 'completed',
    });
  }

  const notOffered: QuestCard[] = [];
  for (const [id, state] of Object.entries(refereeQuests)) {
    const spec = specs.get(id);
    if (state.status === 'completed' && !activeIds.has(id) && !completed.some((q) => q.id === id)) {
      completed.push({
        id,
        name: spec?.name ?? 'A quest',
        speaker: spec?.narrative?.speaker ?? '',
        narrative: spec?.narrative?.offer ?? '',
        completion: spec?.narrative?.completion ?? null,
        objectives: (spec?.objectives ?? []).map((o) => ({
          id: o.id,
          name: o.name || 'An objective',
          complete: state.objectives?.[o.id]?.complete === true,
          hidden: state.objectives?.[o.id]?.revealed === false,
        })),
        status: 'completed',
      });
    }
    if (state.status === 'inactive') {
      notOffered.push({
        id,
        name: spec?.name ?? 'A quest',
        speaker: spec?.narrative?.speaker ?? '',
        narrative: spec?.narrative?.offer ?? '',
        completion: null,
        objectives: (spec?.objectives ?? []).map((o) => ({
          id: o.id,
          name: o.name || 'An objective',
          complete: false,
          hidden: true,
        })),
        status: 'inactive',
      });
    }
  }
  return { active, completed, notOffered };
}

/** What changed in a quest since the reader last looked. */
export type QuestChange = 'new' | 'updated' | 'completed' | null;

/** A record of what the reader has seen: each quest's objectives and whether each was complete. */
export type SeenQuests = Record<string, Record<string, boolean>>;

const DONE = '__completed';

/** Records what the quest log shows now. */
export function snapshotQuests(cards: readonly QuestCard[]): SeenQuests {
  const seen: SeenQuests = {};
  for (const card of cards) {
    const objectives = Object.fromEntries(
      card.objectives.filter((o) => !o.hidden).map((o) => [o.id, o.complete]),
    );
    seen[card.id] = card.status === 'completed' ? { ...objectives, [DONE]: true } : objectives;
  }
  return seen;
}

/**
 * Compares a quest with what the reader saw last time.
 *
 * @returns `new` for a quest the reader hasn't seen, `updated` with the objectives that appeared or were completed,
 *   or `null` when nothing changed. With no record at all, nothing counts as changed.
 */
export function questChange(
  card: QuestCard,
  seen: SeenQuests | null,
): { change: QuestChange; objectives: Set<string> } {
  const changed = new Set<string>();
  if (seen === null) return { change: null, objectives: changed };
  const before = seen[card.id];
  if (card.status === 'completed') {
    // Only a quest the reader saw while it was active counts as just completed.
    return {
      change: before !== undefined && before[DONE] !== true ? 'completed' : null,
      objectives: changed,
    };
  }
  if (before === undefined) return { change: 'new', objectives: changed };
  for (const objective of card.objectives) {
    if (objective.hidden) continue;
    if (!(objective.id in before) || (objective.complete && before[objective.id] === false))
      changed.add(objective.id);
  }
  return { change: changed.size > 0 ? 'updated' : null, objectives: changed };
}
