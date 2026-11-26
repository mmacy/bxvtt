import { contextFromPlayerView, emptyContext, type EventLine } from '@bxvtt/shared/text';
import { describe, expect, it } from 'vitest';
import { fixtureSnapshot } from '@/app/testing/fixtures';
import { fightEvents, summarizeFight, xpSentence } from './fight';
import {
  applyEvent,
  beatDuration,
  beatText,
  buildBeats,
  PACE,
  digestRound,
  monsterGroupsFromRound,
  sliceBeats,
  trackFromView,
  trackStates,
  type AnyEvent,
} from './playback';

function battle() {
  const game = fixtureSnapshot('battle', 'player').game;
  if (!game) throw new Error('No game in the fixture.');
  return { view: game.view, encounter: game.view.encounter ?? null, party: game.view.party };
}

const p = (event: Record<string, unknown>): AnyEvent => ({ visibility: 'player', ...event }) as AnyEvent;

/** A round as bxapi reported it in a real game, trimmed to the parts that matter here. */
const round: AnyEvent[] = [
  p({ event_type: 'battle_round', code: 'battle.round.started', round: 2 }),
  p({
    event_type: 'initiative_rolled',
    code: 'combat.initiative.rolled',
    mode: 'side',
    entries: [],
    order: ['character-0001', 'group-0001'],
  }),
  p({
    event_type: 'member_moved',
    code: 'battle.member.moved',
    character_id: 'character-0001',
    move: 'close',
    advance_feet: 35,
    group_id: 'group-0001',
    distance_feet: 5,
  }),
  p({
    event_type: 'member_moved',
    code: 'battle.member.moved',
    character_id: 'character-0002',
    move: 'close',
    advance_feet: 20,
    group_id: 'group-0001',
    distance_feet: 20,
  }),
  p({
    event_type: 'attack_rolled',
    code: 'combat.attack.hit',
    attacker_id: 'character-0001',
    defender_id: 'monster-0002',
    attack_name: 'Sword',
    roll: 15,
    modifier: -1,
    total: 14,
    required: 13,
    defender_ac: 6,
  }),
  p({
    event_type: 'damage_dealt',
    code: 'combat.damage.dealt',
    target_id: 'monster-0002',
    attacker_id: 'character-0001',
    amount: 6,
    rolls: [6],
    keys: [],
    non_regenerable: false,
  }),
  p({ event_type: 'death', code: 'combat.death.died', target_id: 'monster-0002' }),
  p({
    event_type: 'attack_rolled',
    code: 'combat.attack.hit',
    attacker_id: 'monster-0001',
    defender_id: 'character-0001',
    attack_name: 'weapon',
    roll: 17,
    modifier: 0,
    total: 17,
    required: 14,
    defender_ac: 4,
  }),
  p({
    event_type: 'damage_dealt',
    code: 'combat.damage.dealt',
    target_id: 'character-0001',
    attacker_id: 'monster-0001',
    amount: 3,
    rolls: [3],
    keys: [],
    non_regenerable: false,
  }),
  p({ event_type: 'monster_fled', code: 'battle.side.fled', group_id: 'group-0001' }),
  {
    event_type: 'morale_checked',
    code: 'combat.morale.broke',
    visibility: 'referee',
    subject: 'group-0001',
    score: 7,
    roll: 9,
    modifier: 0,
    held: false,
  },
  {
    event_type: 'effect_ticked',
    code: 'effects.effect.ticked',
    visibility: 'referee',
    effect_id: 'effect-0001',
    kind: 'x',
    target_ref: 'y',
    round: 2,
  },
];

describe('sliceBeats', () => {
  it('joins an attack with its damage, and moves made together', () => {
    const slices = sliceBeats(round.filter((e) => e.visibility === 'player'));
    expect(slices.map((s) => s.map((e) => e.event_type))).toEqual([
      ['battle_round'],
      ['initiative_rolled'],
      ['member_moved', 'member_moved'],
      ['attack_rolled', 'damage_dealt'],
      ['death'],
      ['attack_rolled', 'damage_dealt'],
      ['monster_fled'],
    ]);
  });
});

describe('buildBeats', () => {
  const lookup = (id: string) => (id.startsWith('monster-') ? 'group-0001' : null);

  it('keeps referee events out of a player’s playback and bookkeeping out of everyone’s', () => {
    const { view } = battle();
    const ctx = contextFromPlayerView(view);
    const player = buildBeats(round, ctx, { includeReferee: false, lookup });
    const referee = buildBeats(round, ctx, { includeReferee: true, lookup });
    expect(player.some((b) => b.referee)).toBe(false);
    expect(referee.filter((b) => b.referee)).toHaveLength(1);
    expect(referee.flatMap((b) => b.events).some((e) => e.event_type === 'effect_ticked')).toBe(false);
  });

  it('floats damage over the target token and shows the attack roll', () => {
    const { view } = battle();
    const beats = buildBeats(round, contextFromPlayerView(view), { includeReferee: false, lookup });
    const hit = beats.find((b) => b.roll !== null && b.focus[0] === 'character-0001');
    expect(hit?.pops).toEqual([{ tokenId: 'group-0001', kind: 'damage', text: '−6' }]);
    expect(hit?.roll).toEqual({ natural: 15, modifier: -1, total: 14, hit: true });
    expect(hit?.lines[0]?.text).toMatch(/Brenna hits/);
  });
});

describe('the pace of a beat', () => {
  const line = (text: string, detail?: string): EventLine => ({
    text,
    detail,
    category: 'battle',
    tone: 'neutral',
    icon: 'sword',
    actorIds: [],
    code: 'test',
    eventType: 'test',
    visibility: 'player',
  });

  it('gives a line reading time in proportion to its length, between a floor and a ceiling', () => {
    const short = beatDuration([line('Round 2 begins.')], []);
    const attack = line(
      'Mazpar misses a goblin with a dagger.',
      'Rolled 6 +1 = 7, needed 13 against armour class 6.',
    );
    expect(short).toBe(PACE.minMs);
    expect(beatDuration([attack], [])).toBe(PACE.settleMs + beatText([attack]).length * PACE.perCharMs);
    expect(beatDuration([attack], [])).toBeGreaterThan(2000);
    const wall = Array.from({ length: 6 }, () => attack);
    expect(beatDuration(wall, [])).toBe(PACE.maxMs);
  });

  it('counts the text the strip shows: the first line, its numbers, two more lines, and how many it leaves out', () => {
    const lines = [line('One.', '1 + 1'), line('Two.'), line('Three.'), line('Four.'), line('Five.')];
    expect(beatText(lines)).toBe('One. 1 + 1 Two. Three. And 2 more.');
  });

  it('holds a death and a spell longer than a miss of the same length', () => {
    const text = [line('A goblin falls.')];
    const miss = beatDuration(text, [p({ event_type: 'attack_rolled', code: 'combat.attack.missed' })]);
    const death = beatDuration(text, [p({ event_type: 'death', code: 'combat.death.died' })]);
    const spell = beatDuration(text, [p({ event_type: 'spell_cast', code: 'magic.spell.cast' })]);
    const end = beatDuration(text, [p({ event_type: 'battle_ended', code: 'battle.ended.victory' })]);
    expect(death - miss).toBe(PACE.holdMs.death);
    expect(spell - miss).toBe(PACE.holdMs.spell);
    expect(end - miss).toBe(PACE.holdMs.end);
  });

  it('plays a member gaining the dead condition and dying as one beat, held as a death', () => {
    const { view } = battle();
    const events = [
      p({
        event_type: 'condition_gained',
        code: 'effects.condition.gained',
        target_id: 'character-0001',
        condition: 'dead',
      }),
      p({ event_type: 'death', code: 'combat.death.died', target_id: 'character-0001' }),
    ];
    const beats = buildBeats(events, contextFromPlayerView(view), {
      includeReferee: false,
      lookup: () => null,
    });
    expect(beats).toHaveLength(1);
    expect(beats[0]?.events).toHaveLength(2);
    expect(beats[0]?.durationMs).toBe(PACE.minMs + PACE.holdMs.death);
  });

  it('paces a real round so each attack can be read, in about twenty seconds at normal speed', () => {
    const { view } = battle();
    const lookup = (id: string) => (id.startsWith('monster-') ? 'group-0001' : null);
    const beats = buildBeats(round, contextFromPlayerView(view), { includeReferee: false, lookup });
    for (const beat of beats.filter((b) => b.roll !== null))
      expect(beat.durationMs).toBeGreaterThanOrEqual(2000);
    const total = beats.reduce((sum, beat) => sum + beat.durationMs, 0);
    expect(total).toBeGreaterThan(8000);
    expect(total).toBeLessThan(20_000);
  });
});

describe('the battlefield during playback', () => {
  it('moves members, lowers hit points, and counts the slain', () => {
    const { encounter, party } = battle();
    const lookup = () => 'group-0001';
    const start = trackFromView(encounter, party);
    const brenna = start.members['character-0001'];
    if (!brenna) throw new Error('No Brenna.');
    let state = start;
    for (const event of round) state = applyEvent(state, event, lookup);
    expect(state.members['character-0001']?.advance).toBe(35);
    expect(state.members['character-0001']?.hp).toBe(brenna.hp - 3);
    expect(state.groups['group-0001']?.count).toBe((start.groups['group-0001']?.count ?? 0) - 1);
    expect(state.groups['group-0001']?.fleeing).toBe(true);
    // The start state is never changed.
    expect(start.members['character-0001']?.advance).toBe(0);
  });

  it('gives a state for every beat', () => {
    const { view, encounter, party } = battle();
    const lookup = () => 'group-0001';
    const beats = buildBeats(round, contextFromPlayerView(view), { includeReferee: false, lookup });
    expect(trackStates(trackFromView(encounter, party), beats, lookup)).toHaveLength(beats.length);
  });
});

describe('fleeing and escaping groups', () => {
  const lookup = () => 'group-0001';
  const fled = p({ event_type: 'monster_fled', code: 'battle.side.fled', group_id: 'group-0001' });
  const escaped = p({ event_type: 'monster_escaped', code: 'battle.side.escaped', group_id: 'group-0001' });

  it('keeps a fleeing group on the track until it escapes', () => {
    const { encounter, party } = battle();
    const start = trackFromView(encounter, party);
    const running = applyEvent(start, fled, lookup);
    expect(running.groups['group-0001']).toMatchObject({ fleeing: true, fled: false });
    expect(applyEvent(running, escaped, lookup).groups['group-0001']).toMatchObject({
      fleeing: true,
      fled: true,
    });
  });

  it('starts a group that the view shows running as fleeing', () => {
    const { encounter, party } = battle();
    if (!encounter) throw new Error('No encounter in the fixture.');
    const running = { ...encounter, groups: encounter.groups.map((group) => ({ ...group, fleeing: true })) };
    expect(trackFromView(running, party).groups['group-0001']?.fleeing).toBe(true);
  });

  it('sums up a group that got away as escaped, not as fleeing', () => {
    expect(digestRound([fled, escaped], lookup)).toMatchObject({ fleeing: [], escaped: ['group-0001'] });
  });
});

describe('a hide attempt', () => {
  it('plays as a beat on the member, and never says whether it worked', () => {
    const { view } = battle();
    const hide = p({
      event_type: 'hide_attempted',
      code: 'battle.hide.attempted',
      character_id: 'character-0002',
    });
    const beats = buildBeats([hide], contextFromPlayerView(view), {
      includeReferee: false,
      lookup: () => null,
    });
    expect(beats).toHaveLength(1);
    expect(beats[0]?.focus).toEqual(['character-0002']);
    expect(beats[0]?.pops).toEqual([{ tokenId: 'character-0002', kind: 'hide', text: 'Hiding' }]);
  });
});

describe('digestRound', () => {
  it('sums up who acted first, the damage, the slain, and who flees', () => {
    const digest = digestRound(round, () => 'group-0001');
    expect(digest).toMatchObject({
      round: 2,
      first: 'party',
      damageDealt: 6,
      damageTaken: 3,
      slain: [{ groupId: 'group-0001', count: 1 }],
      fleeing: ['group-0001'],
    });
  });
});

describe('naming monsters for players', () => {
  it('learns a monster’s group from the attack its attacker declared', () => {
    const pairs = monsterGroupsFromRound(round, { 'character-0001': { target_group_id: 'group-0002' } });
    expect(pairs).toEqual([['monster-0002', 'group-0002']]);
  });

  it('names monsters from the entry after the encounter has closed', () => {
    const entry = {
      seq: 1,
      created_at: '2026-11-22T05:20:00Z',
      user_id: null,
      visibility: 'everyone' as const,
      to: [],
      kind: 'game' as const,
      command_type: 'resolve_battle_round',
      revision: 9,
      session_id: 's',
      messages: [],
      events: round as never,
      names: {
        members: { 'character-0001': 'Brenna' },
        groups: {},
        monsters: { 'monster-0002': { label: 'skeleton', label_plural: 'skeletons' } },
        items: {},
      },
    };
    const fight = fightEvents([entry], 1, emptyContext());
    expect(fight.ctx.monsters['monster-0002']?.label).toBe('skeleton');
    const beats = buildBeats(fight.events, fight.ctx, { includeReferee: false, lookup: () => null });
    expect(beats.some((b) => b.lines.some((l) => l.text.startsWith('Brenna hits a skeleton')))).toBe(true);
  });
});

describe('summarizeFight', () => {
  it('reports a victory with the defeated, their experience, the loot, and the fallen', () => {
    const { view } = battle();
    const events: AnyEvent[] = [
      p({ event_type: 'battle_round', code: 'battle.round.started', round: 3 }),
      p({ event_type: 'death', code: 'combat.death.died', target_id: 'character-0002' }),
      p({ event_type: 'battle_ended', code: 'battle.ended.victory' }),
      p({ event_type: 'encounter_ended', code: 'encounter.ended', outcome: 'victory' }),
      p({
        event_type: 'monster_defeated',
        code: 'battle.monster.defeated',
        monster_id: 'monster-0001',
        template_id: 'goblin',
        outcome: 'slain',
        xp: 5,
      }),
      p({
        event_type: 'monster_defeated',
        code: 'battle.monster.defeated',
        monster_id: 'monster-0002',
        template_id: 'goblin',
        outcome: 'slain',
        xp: 5,
      }),
      p({
        event_type: 'monster_defeated',
        code: 'battle.monster.defeated',
        monster_id: 'monster-0003',
        template_id: 'goblin',
        outcome: 'fled',
        xp: 5,
      }),
      p({
        event_type: 'loot_dropped',
        code: 'encounter.loot.dropped',
        item_ids: ['dagger'],
        coins_gp_value: 12,
      }),
    ];
    const summary = summarizeFight(events, contextFromPlayerView(view));
    expect(summary.title).toBe('The goblins are beaten');
    expect(summary.rounds).toBe(3);
    expect(summary.defeated.map((d) => d.text)).toEqual(['2 goblins slain', 'a goblin fled']);
    expect(xpSentence(summary)).toBe('The defeated monsters are worth 15 XP to the party.');
    expect(summary.loot).toEqual(['coins worth 12 gp', 'a dagger']);
    expect(summary.fallen).toEqual(['Wren']);
  });

  it('lists the exact coins of the loot, so copper alone still shows', () => {
    const { view } = battle();
    const loot = (coins: Record<string, number>, gp: number) =>
      p({
        event_type: 'loot_dropped',
        code: 'encounter.loot.dropped',
        item_ids: [],
        coins_gp_value: gp,
        coins,
      });
    const summary = summarizeFight(
      [loot({ pp: 0, gp: 3, ep: 0, sp: 4, cp: 0 }, 3), loot({ pp: 0, gp: 0, ep: 0, sp: 0, cp: 39 }, 0)],
      contextFromPlayerView(view),
    );
    expect(summary.loot).toEqual(['3 gold pieces', '4 silver pieces', '39 copper pieces']);
  });

  it('reports the experience a character gained when the one-level limit cut the award', () => {
    const { view } = battle();
    const summary = summarizeFight(
      [
        p({
          event_type: 'xp_awarded',
          code: 'session.xp.awarded',
          character_id: 'character-0001',
          award: 5000,
          modified_award: 5000,
          gained: 3999,
          clamped: true,
          level_after: 2,
        }),
        p({
          event_type: 'xp_awarded',
          code: 'session.xp.awarded',
          character_id: 'character-0002',
          award: 40,
          modified_award: 44,
          gained: null,
          level_after: 1,
        }),
      ],
      contextFromPlayerView(view),
    );
    expect(summary.awards.map((award) => award.xp)).toEqual([3999, 44]);
  });
});
