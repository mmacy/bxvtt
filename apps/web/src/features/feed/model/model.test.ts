import type { ChatEntry, FeedEntry, GameEntry, RollEntry, SystemEntry } from '@bxvtt/shared/protocol';
import { emptyContext, type TextContext } from '@bxvtt/shared/text';
import { describe, expect, it } from 'vitest';
import { parseComposer, matchSlashCommands, type Recipient } from './commands';
import { addDie, EMPTY_TRAY, parseDiceExpression, rollSentence, rollView, trayExpression } from './dice';
import { markupText, parseMarkup } from './markup';
import { movementRunText, movementSteps, narrateEntry } from './narrate';
import { buildRows, isEntryVisible, type FeedRow, type RowOptions } from './rows';
import { systemSentence } from './text';
import { soundFor } from '../sounds';

const RUTH = 'usr_ruthruthruthruthruthr';
const SAM = 'usr_samsamsamsamsamsamsam';
const ADA = 'usr_adaadaadaadaadaadaada';

let seq = 0;
function base(userId: string | null, minute = 0) {
  seq += 1;
  return {
    seq,
    created_at: `2026-11-21T20:${String(minute).padStart(2, '0')}:00Z`,
    user_id: userId,
    visibility: 'everyone' as const,
    to: [] as string[],
  };
}

function chat(userId: string, text: string, extra: Partial<ChatEntry> = {}, minute = 0): ChatEntry {
  return { ...base(userId, minute), kind: 'chat', text, ...extra };
}

function roll(
  userId: string,
  expression: string,
  values: number[],
  modifier = 0,
  extra: Partial<RollEntry> = {},
): RollEntry {
  const total = values.reduce((a, b) => a + b, 0) + modifier;
  return {
    ...base(userId),
    kind: 'roll',
    expression,
    comment: '',
    total,
    rolls: [{ rolls: values, modifier, multiplier: 1, total }],
    seed: 1,
    secret: false,
    ...extra,
  };
}

function game(
  userId: string,
  commandType: string | null,
  events: Array<Record<string, unknown>>,
  extra: Partial<GameEntry> = {},
): GameEntry {
  return {
    ...base(userId),
    kind: 'game',
    command_type: commandType,
    revision: seq,
    session_id: 'ses_one',
    events: events as GameEntry['events'],
    messages: events.map(() => 'message'),
    ...extra,
  };
}

function step(facing: string, code = 'exploration.party.moved') {
  return { event_type: 'party_moved', code, visibility: 'player', x: 1, y: 1, facing };
}

function system(code: SystemEntry['code'], params: SystemEntry['params'] = {}): SystemEntry {
  return { ...base(RUTH), kind: 'system', code, params };
}

const ctx: TextContext = { ...emptyContext(), members: { 'character-0001': { name: 'Brenna' } } };

function rows(entries: FeedEntry[], options: Partial<RowOptions> = {}): FeedRow[] {
  return buildRows(entries, {
    selfId: SAM,
    lens: false,
    filter: 'all',
    query: '',
    textOf: (entry) => (entry.kind === 'chat' ? entry.text : ''),
    unreadAfter: null,
    now: new Date('2026-11-21T21:00:00Z'),
    timeZone: 'UTC',
    ...options,
  });
}

const types = (list: FeedRow[]) => list.map((row) => row.type);

describe('dice expressions', () => {
  it('reads what bxapi accepts', () => {
    expect(parseDiceExpression('2d6+1')).toEqual({ count: 2, sides: 6, modifier: 1, multiplier: 1 });
    expect(parseDiceExpression('d%')).toEqual({ count: 1, sides: 100, modifier: 0, multiplier: 1 });
    expect(parseDiceExpression('3d6x10')?.multiplier).toBe(10);
    expect(parseDiceExpression('1d4-1')?.modifier).toBe(-1);
  });

  it('turns down what bxapi refuses', () => {
    expect(parseDiceExpression('2d6+1d4')).toBeNull();
    expect(parseDiceExpression('banana')).toBeNull();
    expect(parseDiceExpression('0d6')).toBeNull();
  });

  it('marks a natural 20 or 1 only on a single d20', () => {
    expect(rollView(roll(SAM, '1d20+2', [20], 2)).natural).toBe(20);
    expect(rollView(roll(SAM, 'd20', [1])).natural).toBe(1);
    expect(rollView(roll(SAM, '2d20', [20, 3])).natural).toBeNull();
    expect(rollView(roll(SAM, '1d6', [1])).natural).toBeNull();
  });

  it('draws dice the kit has and lists the rest', () => {
    expect(rollView(roll(SAM, '2d6', [3, 4])).drawn).toEqual([
      { sides: 6, value: 3 },
      { sides: 6, value: 4 },
    ]);
    expect(rollView(roll(SAM, '1d3', [2])).drawn).toBeNull();
    expect(
      rollView(
        roll(
          SAM,
          '20d6',
          Array.from({ length: 20 }, () => 3),
        ),
      ).drawn,
    ).toBeNull();
  });

  it('says the roll in a sentence', () => {
    const entry = roll(SAM, '2d6+1', [4, 3], 1, { comment: 'for damage' });
    expect(rollSentence('Sam', entry)).toBe('Sam rolled 2d6+1 for damage: 4 and 3, plus 1, total 8.');
  });

  it('builds a tray roll of one kind of die', () => {
    let tray = addDie(EMPTY_TRAY, 6);
    tray = addDie(tray, 6);
    expect(trayExpression({ ...tray, modifier: -1 })).toBe('2d6-1');
    expect(trayExpression(addDie(tray, 20))).toBe('1d20');
    expect(trayExpression(EMPTY_TRAY)).toBeNull();
  });
});

describe('the composer', () => {
  const recipients: Recipient[] = [
    { user_id: RUTH, name: 'Ruth', role: 'referee' },
    { user_id: ADA, name: 'Ada Lovelace', role: 'player' },
    { user_id: 'usr_ada2', name: 'Ada', role: 'player' },
  ];
  const parse = (text: string, referee = false) => parseComposer(text, { recipients, selfId: SAM, referee });

  it('sends plain text as chat', () => {
    expect(parse('  Hello there  ')).toEqual({ kind: 'chat', text: 'Hello there' });
  });

  it('checks a roll before it goes out', () => {
    expect(parse('/r 2d6+1 for damage')).toMatchObject({ kind: 'roll', expression: '2d6+1', secret: false });
    expect(parse('/roll 2x6').kind).toBe('error');
    expect(parse('/roll')).toMatchObject({ kind: 'error' });
  });

  it('lets only a referee roll in secret', () => {
    expect(parse('/roll secret 1d20').kind).toBe('error');
    expect(parse('/roll secret 1d20', true)).toMatchObject({ kind: 'roll', secret: true });
  });

  it('whispers to the member with the longest matching name', () => {
    expect(parse('/w Ada Lovelace meet me at the door')).toMatchObject({
      kind: 'whisper',
      to: [ADA],
      text: 'meet me at the door',
    });
    expect(parse('/w ada hi')).toMatchObject({ kind: 'whisper', to: ['usr_ada2'], text: 'hi' });
    expect(parse('/whisper referees is the door trapped?')).toMatchObject({ kind: 'whisper', to: [RUTH] });
    expect(parse('/w Nobody hi').kind).toBe('error');
    expect(parse('/w Ruth').kind).toBe('error');
  });

  it('explains an unknown command', () => {
    expect(parse('/dance')).toEqual({
      kind: 'error',
      message: "There's no /dance command. Type / to see the commands.",
    });
    expect(parse('/help')).toEqual({ kind: 'help' });
  });

  it('suggests commands as you type a slash', () => {
    expect(matchSlashCommands('/', false).map((c) => c.usage)).not.toContain('/roll secret 1d20');
    expect(matchSlashCommands('/', true).map((c) => c.usage)).toContain('/roll secret 1d20');
    expect(matchSlashCommands('/w', false).map((c) => c.insert)).toEqual(['/w ']);
    expect(matchSlashCommands('/roll 1d20', false)).toEqual([]);
    expect(matchSlashCommands('hello', false)).toEqual([]);
  });
});

describe('chat formatting', () => {
  it('parses bold, italic, struck text, and code', () => {
    expect(parseMarkup('a **big** _quiet_ ~~old~~ `/roll`')).toEqual([
      { type: 'text', text: 'a ' },
      { type: 'strong', children: [{ type: 'text', text: 'big' }] },
      { type: 'text', text: ' ' },
      { type: 'em', children: [{ type: 'text', text: 'quiet' }] },
      { type: 'text', text: ' ' },
      { type: 'del', children: [{ type: 'text', text: 'old' }] },
      { type: 'text', text: ' ' },
      { type: 'code', text: '/roll' },
    ]);
  });

  it('leaves unmatched marks and markup as typed text', () => {
    expect(parseMarkup('2 * 3 = 6 and snake_case_name')).toEqual([
      { type: 'text', text: '2 * 3 = 6 and snake_case_name' },
    ]);
    expect(markupText(parseMarkup('<img src=x onerror=alert(1)> **hi**'))).toBe(
      '<img src=x onerror=alert(1)> hi',
    );
  });
});

describe('game entries', () => {
  const hidden = {
    event_type: 'wandering_check',
    code: 'exploration.wandering.checked',
    visibility: 'referee',
    encounter: false,
    roll: 4,
    chance: 1,
  };

  it('shows referee events only through the lens', () => {
    const entry = game(SAM, 'search', [
      {
        event_type: 'search_completed',
        code: 'exploration.search.nothing',
        visibility: 'player',
        character_id: 'character-0001',
        kind: 'secret_doors',
        found: [],
      },
      hidden,
    ]);
    const open = narrateEntry(entry, ctx, { lens: true });
    const closed = narrateEntry(entry, ctx, { lens: false });
    expect(open.items).toHaveLength(2);
    expect(closed.items).toHaveLength(1);
    expect(closed.text).toContain('Brenna searches');
  });

  it('gives a party member’s death the most weight', () => {
    const entry = game(SAM, 'resolve_battle_round', [
      { event_type: 'battle_round', code: 'battle.round.started', visibility: 'player', round: 2 },
      { event_type: 'death', code: 'combat.death.died', visibility: 'player', target_id: 'character-0001' },
    ]);
    const narration = narrateEntry(entry, ctx, { lens: false });
    expect(narration.headline).toBe('Round 2');
    expect(narration.weight).toBe('critical');
  });

  it('collapses party movement into one line', () => {
    const entry = game(SAM, 'move_party', [step('north')]);
    expect(movementSteps(entry, false)?.steps).toEqual([{ turned: false, facing: 'north' }]);
    expect(
      movementSteps(
        game(SAM, 'move_party', [
          step('north'),
          { event_type: 'location_entered', code: 'x', visibility: 'player' },
        ]),
        false,
      ),
    ).toBeNull();
    expect(
      movementRunText([
        { turned: false, facing: 'north' },
        { turned: false, facing: 'east' },
        { turned: true, facing: 'west' },
      ]),
    ).toBe('The party moves 2 steps and turns once, facing west.');
    expect(movementRunText([{ turned: false, facing: 'north' }])).toBe('The party moves north.');
    expect(
      movementRunText([
        { turned: false, facing: 'north' },
        { turned: false, facing: 'north' },
      ]),
    ).toBe('The party moves 2 steps north.');
    expect(movementRunText([{ turned: true, facing: 'west' }])).toBe('The party turns to face west.');
  });
});

describe('feed rows', () => {
  it('groups one author’s messages and starts a new group for a whisper', () => {
    const list = rows([
      chat(SAM, 'one'),
      chat(SAM, 'two'),
      chat(SAM, 'psst', { visibility: 'users', to: [RUTH] }),
      chat(RUTH, 'three'),
    ]);
    expect(types(list)).toEqual(['day', 'messages', 'messages', 'messages']);
    const first = list[1];
    expect(first?.type === 'messages' && first.entries.map((e) => e.kind === 'chat' && e.text)).toEqual([
      'one',
      'two',
    ]);
  });

  it('starts a new group after a pause', () => {
    const list = rows([chat(SAM, 'early', {}, 0), chat(SAM, 'late', {}, 20)]);
    expect(types(list)).toEqual(['day', 'messages', 'messages']);
  });

  it('folds a run of steps into one line under one heading, and gives the next move the same heading', () => {
    const list = rows([
      game(SAM, 'move_party', [step('north')]),
      game(SAM, 'move_party', [step('north')]),
      game(SAM, 'turn_party', [step('east', 'exploration.party.turned')]),
      game(SAM, 'search', [
        {
          event_type: 'search_completed',
          code: 'exploration.search.nothing',
          visibility: 'player',
          character_id: 'character-0001',
          kind: 'secret_doors',
          found: [],
        },
      ]),
    ]);
    expect(types(list)).toEqual(['day', 'command', 'command']);
    const moves = list[1];
    expect(moves?.type === 'command' && moves.parts.map((part) => part.kind)).toEqual(['steps']);
    expect(
      moves?.type === 'command' && moves.parts[0]?.kind === 'steps' && moves.parts[0].steps,
    ).toHaveLength(3);

    const walk = rows([
      game(SAM, 'move_party', [step('east')]),
      game(SAM, 'move_party', [
        step('east'),
        { event_type: 'location_entered', code: 'x', visibility: 'player' },
      ]),
    ]);
    expect(types(walk)).toEqual(['day', 'command']);
    const group = walk[1];
    expect(group?.type === 'command' && group.parts.map((part) => part.kind)).toEqual(['steps', 'entry']);
  });

  it('hides referee-only entries without the lens', () => {
    const secret = roll(RUTH, '1d6', [3], 0, { secret: true, visibility: 'referees' });
    const note = game(
      RUTH,
      'record_note',
      [{ event_type: 'note_recorded', code: 'session.note.recorded', visibility: 'referee', text: 'x' }],
      { visibility: 'referees' },
    );
    expect(isEntryVisible(secret, SAM, false)).toBe(false);
    expect(isEntryVisible(secret, RUTH, false)).toBe(true);
    expect(isEntryVisible(note, RUTH, false)).toBe(false);
    expect(isEntryVisible(note, RUTH, true)).toBe(true);
    expect(types(rows([secret, note], { selfId: RUTH, lens: true, filter: 'hidden' }))).toEqual([
      'day',
      'messages',
      'command',
    ]);
  });

  it('filters and searches', () => {
    const entries = [chat(SAM, 'the door is stuck'), roll(SAM, '1d6', [2]), chat(RUTH, 'push harder')];
    expect(types(rows(entries, { filter: 'rolls' }))).toEqual(['day', 'messages']);
    const found = rows(entries, { query: 'DOOR' });
    expect(found.filter((row) => row.type === 'messages')).toHaveLength(1);
  });

  it('marks where unread entries from others begin', () => {
    const entries = [chat(SAM, 'mine'), chat(RUTH, 'new'), chat(RUTH, 'newer')];
    const firstSeq = entries[0]?.seq ?? 0;
    expect(types(rows(entries, { unreadAfter: firstSeq }))).toEqual([
      'day',
      'messages',
      'unread',
      'messages',
    ]);
  });

  it('marks a new session', () => {
    const list = rows([
      system('game_started', { session_id: 'ses_one', adventure_name: 'The Drowned Bell' }),
      game(SAM, 'search', [
        {
          event_type: 'search_completed',
          code: 'exploration.search.nothing',
          visibility: 'player',
          character_id: 'character-0001',
          kind: 'secret_doors',
          found: [],
        },
      ]),
      game(
        SAM,
        'search',
        [
          {
            event_type: 'search_completed',
            code: 'exploration.search.nothing',
            visibility: 'player',
            character_id: 'character-0001',
            kind: 'secret_doors',
            found: [],
          },
        ],
        { session_id: 'ses_two' },
      ),
    ]);
    expect(types(list)).toEqual(['day', 'session', 'command', 'session', 'command']);
  });
});

describe('referee detail', () => {
  it('shows the cell of a step only through the lens', () => {
    const entry = game(SAM, 'move_party', [
      step('north'),
      {
        event_type: 'door',
        code: 'exploration.door.opened',
        visibility: 'player',
        direction: 'north',
        x: 1,
        y: 1,
      },
    ]);
    const open = narrateEntry(entry, ctx, { lens: true });
    const closed = narrateEntry(entry, ctx, { lens: false });
    expect(closed.text).toContain('The party moves north.');
    const lines = (narration: typeof open) =>
      narration.items.flatMap((item) => (item.kind === 'line' ? [item.line] : []));
    expect(lines(open).some((line) => line.refereeDetail !== undefined)).toBe(true);
    expect(lines(closed).every((line) => line.refereeDetail === undefined)).toBe(true);
  });
});

describe('sounds', () => {
  it('chimes for a whisper to you and clatters for a roll', () => {
    expect(soundFor([chat(RUTH, 'psst', { visibility: 'users', to: [SAM] })], SAM)).toBe('whisper');
    expect(soundFor([chat(SAM, 'psst', { visibility: 'users', to: [RUTH] })], SAM)).toBeNull();
    expect(soundFor([roll(SAM, '1d20', [12])], SAM)).toBe('roll');
    expect(soundFor([chat(RUTH, 'hello')], SAM)).toBeNull();
  });
});

describe('recorded names', () => {
  it('names a monster from the names the server recorded with the entry', () => {
    const entry = game(SAM, 'resolve_battle_round', [
      {
        event_type: 'attack_rolled',
        code: 'combat.attack.missed',
        visibility: 'player',
        attacker_id: 'monster-0001',
        defender_id: 'character-0001',
        roll: 3,
        modifier: 0,
        total: 3,
        target: 12,
        armour_class: 7,
        attack_name: 'short sword',
      },
    ]);
    const before = narrateEntry(entry, ctx, { lens: false }).text;
    entry.names = {
      members: {},
      groups: {},
      monsters: { 'monster-0001': { label: 'goblin', label_plural: 'goblins' } },
      items: {},
    };
    const after = narrateEntry(entry, ctx, { lens: false }).text;
    expect(before).toContain('A monster misses Brenna');
    expect(after).toContain('A goblin misses Brenna');
  });
});

describe('save notices', () => {
  it('quotes a save label as a name', () => {
    const nameOf = () => 'Ruth';
    expect(
      systemSentence(
        system('save_created', { label: "Autosave: Entered the priory on Corvane's Holm", autosave: true }),
        nameOf,
        ctx,
      ),
    ).toBe("The server saved the game: entered the priory on Corvane's Holm.");
    expect(
      systemSentence(system('save_created', { label: 'Before the crypt', autosave: false }), nameOf, ctx),
    ).toBe('Ruth saved the game as “Before the crypt”.');
  });
});

describe('talking', () => {
  it('shows players who spoke when the reaction roll is hidden', () => {
    const talk = game(RUTH, 'parley', [
      {
        event_type: 'reaction_rolled',
        code: 'encounter.reaction.rolled',
        visibility: 'referee',
        roll: 7,
        modifier: 0,
        total: 7,
        result: 'indifferent',
      },
    ]);
    talk.actor_id = 'character-0001';
    expect(isEntryVisible(talk, SAM, false)).toBe(true);
    expect(narrateEntry(talk, ctx, { lens: false }).text).toContain('Brenna talks to');
  });
});

describe('milestones', () => {
  it('gives a level gained the weight of a milestone', () => {
    const entry = game(RUTH, 'award_xp', [
      {
        event_type: 'leveled_up',
        code: 'session.level.gained',
        visibility: 'player',
        character_id: 'character-0001',
        new_level: 2,
        hit_points_gained: 3,
        title: 'Warrior',
      },
    ]);
    expect(narrateEntry(entry, ctx, { lens: false }).weight).toBe('milestone');
  });
});
