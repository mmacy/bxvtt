import { describe, expect, it } from 'vitest';
import creation from './fixtures/creation.json' with { type: 'json' };
import outcomes from './fixtures/outcomes.json' with { type: 'json' };
import {
  contextFromPlayerView,
  describeEvents,
  describeRejection,
  extendContextWithReferee,
  humanizeMessage,
  type PlayerViewLike,
  type RefereeViewLike,
  type TextContext,
} from './index';

interface FixtureStep {
  id: string;
  label: string;
  outcome: {
    accepted: boolean;
    rejections: Array<{ code: string; params: Record<string, string | number | Array<string | number>> }>;
    events: Array<{ event_type: string; code: string; visibility: string; [key: string]: unknown }>;
    messages: string[];
  };
  view: PlayerViewLike;
  referee: {
    monsters: Array<{ id: string; template_id: string; name: string; label: string | null }>;
    npcs: Array<{ id: string; name: string; class_id: string }>;
  } | null;
}

const steps = outcomes as unknown as FixtureStep[];

function contextFor(step: FixtureStep, withReferee: boolean): TextContext {
  let ctx = contextFromPlayerView(step.view);
  if (withReferee && step.referee) {
    const refereeView: RefereeViewLike = {
      monsters: step.referee.monsters.map((monster) => ({
        id: monster.id,
        template: {
          id: monster.template_id,
          name: monster.name,
          ...(monster.label ? { display_name: monster.label } : {}),
        },
      })),
      npcs: step.referee.npcs,
    };
    ctx = extendContextWithReferee(ctx, refereeView);
  }
  return ctx;
}

const RAW_ID = /\b(?:character|monster|group|npc|effect|magic-item|valuable|cache)-\d+\b|\btown-cleric\b/;
const SNAKE_CASE = /\b[a-z]+(?:_[a-z]+)+\b/;
const DASH = new RegExp('[\\u2013\\u2014]');

function expectClean(text: string, where: string): void {
  expect(text, where).not.toMatch(RAW_ID);
  expect(text, where).not.toMatch(SNAKE_CASE);
  expect(text, where).not.toMatch(DASH);
  expect(text, where).not.toMatch(/undefined|NaN|\[object|\{|\}/);
}

describe('captured bxapi outcomes', () => {
  it('has fixtures that span the game', () => {
    expect(steps.length).toBeGreaterThan(100);
    const codes = new Set(steps.flatMap((step) => step.outcome.events.map((event) => event.code)));
    expect(codes.size).toBeGreaterThan(90);
    const rejectionCodes = new Set(
      steps.flatMap((step) => step.outcome.rejections.map((rejection) => rejection.code)),
    );
    expect(rejectionCodes.size).toBeGreaterThan(60);
  });

  it.each(steps.map((step) => [step.id, step] as const))(
    'describes %s without a raw ID or a dash',
    (_id, step) => {
      for (const withReferee of [false, true]) {
        const ctx = contextFor(step, withReferee);
        for (const rejection of step.outcome.rejections) {
          const text = describeRejection(rejection, ctx);
          expectClean(text, `${step.id} rejection ${rejection.code}`);
          expect(text, step.id).toMatch(/^[A-Z0-9]/);
        }
        const lines = describeEvents(step.outcome.events, ctx, { messages: step.outcome.messages });
        expect(lines.length).toBeLessThanOrEqual(step.outcome.events.length);
        for (const line of lines) {
          expectClean(line.text, `${step.id} ${line.code}`);
          if (line.detail) expectClean(line.detail, `${step.id} ${line.code} detail`);
          expect(line.text, `${step.id} ${line.code}`).toMatch(/^[A-Z0-9]/);
          expect(line.text, `${step.id} ${line.code}`).toMatch(/[.!?)"']$/);
          for (const id of line.actorIds)
            expect(id, `${step.id} ${line.code}`).toMatch(/^(character|monster|group|npc)-\d+$/);
        }
        for (const message of step.outcome.messages)
          expectClean(humanizeMessage(message, ctx), `${step.id} message "${message}"`);
      }
    },
  );

  it('keeps the visibility of each event on its line', () => {
    for (const step of steps) {
      const ctx = contextFor(step, true);
      const lines = describeEvents(step.outcome.events, ctx, {
        mergeAttacks: false,
        dropRedundant: false,
        collapseChecks: false,
      });
      expect(lines.map((line) => line.visibility)).toEqual(
        step.outcome.events.map((event) => (event.visibility === 'referee' ? 'referee' : 'player')),
      );
    }
  });

  it('uses an exclamation mark only when a character dies or the party wins', () => {
    const allowed = new Set([
      'combat.death.died',
      'combat.death.permanent',
      'combat.drain.slain',
      'effects.condition.gained',
      'battle.ended.victory',
      'session.adventure.completed',
    ]);
    for (const step of steps) {
      const ctx = contextFor(step, true);
      for (const line of describeEvents(step.outcome.events, ctx, {
        mergeAttacks: false,
        dropRedundant: false,
      })) {
        if (line.text.includes('!')) expect(allowed.has(line.code), `${step.id}: ${line.text}`).toBe(true);
      }
    }
  });

  it('never names a member that the party does not have', () => {
    const step = steps.find((candidate) =>
      candidate.outcome.events.some((event) => event.code === 'combat.attack.hit'),
    );
    expect(step).toBeDefined();
    if (!step) return;
    const lines = describeEvents(step.outcome.events, contextFromPlayerView({ party: [] }));
    expect(lines.map((line) => line.text).join(' ')).toContain('A party member');
  });
});

describe('captured character creation problems', () => {
  const problems = creation as unknown as Array<{
    label: string;
    status: number;
    response: { rejections: Array<{ code: string; params: Record<string, string | number> }> | null };
  }>;

  it('describes every creation rejection', () => {
    const withRejections = problems.filter((problem) => problem.response.rejections);
    expect(withRejections.length).toBeGreaterThan(8);
    for (const problem of withRejections) {
      for (const rejection of problem.response.rejections ?? []) {
        const text = describeRejection(rejection);
        expectClean(text, `${problem.label} ${rejection.code}`);
        expect(text).toMatch(/[.]$/);
      }
    }
  });
});
