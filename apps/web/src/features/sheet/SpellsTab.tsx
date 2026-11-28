import type { MemberView, PlayerView } from '@bxvtt/shared/bxapi';
import { capitalizeFirst, ordinal, spellFormName, type TextContext } from '@bxvtt/shared/text';
import { useMemo, useRef, useState, type RefObject } from 'react';
import {
  useParty,
  usePartyLocation,
  usePlayerView,
  useSendCommand,
  useSpellDetail,
  useTextContext,
} from '@/app';
import {
  Badge,
  Banner,
  Button,
  Checkbox,
  Combobox,
  Dialog,
  EmptyState,
  Field,
  IconButton,
  NumberInput,
  Popover,
  RadioGroup,
  Select,
  Skeleton,
} from '@/ui';
import { spellModeOptions, spellRangeText } from '../combat/model';
import { useMemberCommand } from './actions';
import { spellDuration, spellRange, withoutPointers } from './spellText';
import { RuleLink } from './RuleLink';
import type { SheetModel } from './model';
import styles from './sheet.module.css';

/** The view's spell levels, by spell ID. */
type SpellLevels = PlayerView['spell_levels'];

const NO_LEVELS: SpellLevels = {};

/**
 * A spell's name in the form a member has it: the name the player view states, including a spell the adventure
 * bundles, and for a reversed copy the name of the reverse.
 */
function nameOf(id: string, reversed: boolean, ctx: TextContext): string {
  return capitalizeFirst(spellFormName(id, reversed, ctx));
}

function useSpellLevels(): SpellLevels {
  return usePlayerView()?.spell_levels ?? NO_LEVELS;
}

/** The text a spell's details show when they failed to load. */
const DETAILS_FAILED = "This spell's details didn't load. Try again in a moment.";

/** A spell's full text: the introduction and each way to cast it. */
export function SpellDetailBody({ spellId }: { spellId: string }) {
  const entry = useSpellDetail(spellId);
  const levels = useSpellLevels();
  if (entry.loading) return <Skeleton lines={4} />;
  if (!entry.data) return <p className={styles.detailProse}>{DETAILS_FAILED}</p>;
  const spell = entry.data;
  return (
    <div className={styles.detail}>
      <dl className={styles.detailFacts}>
        <dt>Level</dt>
        <dd>{ordinal(levels[spellId] ?? spell.level)}</dd>
        <dt>Range</dt>
        <dd>{spellRangeText(spell)}</dd>
        <dt>Duration</dt>
        <dd>{spell.duration}</dd>
        {spell.reversed_form && (
          <>
            <dt>Reversed</dt>
            <dd>{spell.reversed_form.name}</dd>
          </>
        )}
      </dl>
      {showIntro(spell) && <p className={styles.detailProse}>{withoutPointers(spell.intro)}</p>}
      {spell.modes.map((mode) => (
        <p key={mode.key} className={styles.detailProse}>
          {withoutPointers(mode.prose)}
        </p>
      ))}
    </div>
  );
}

/**
 * Whether a spell's details show its summary: it has one, and no mode's text starts with the same words, as an
 * adventure's own spell often does.
 */
function showIntro(spell: { intro: string; modes: ReadonlyArray<{ prose: string }> }): boolean {
  const summary = withoutPointers(spell.intro)
    .replace(/[.!?]+$/, '')
    .trim();
  if (summary === '') return false;
  return !spell.modes.some((mode) => withoutPointers(mode.prose).startsWith(summary));
}

function SpellInfo({ spellId, name }: { spellId: string; name: string }) {
  return (
    <Popover
      title={name}
      width="320px"
      trigger={<IconButton icon="info" label={`About ${name}`} variant="ghost" size="sm" />}
    >
      <SpellDetailBody spellId={spellId} />
    </Popover>
  );
}

/** A spell's name on a card, linked to the rules reference only when the rules catalog has the spell. */
function SpellCardName({ spellId, name }: { spellId: string; name: string }) {
  const detail = useSpellDetail(spellId);
  return (
    <span className={styles.spellName}>
      <RuleLink entry={detail.inCatalog ? { kind: 'spells', id: spellId } : null}>{name}</RuleLink>
    </span>
  );
}

/**
 * "1st level · Range: 120’ · 2 turns". The level comes from the view, and the range and duration join it once
 * the spell's details load.
 */
function SpellMeta({ spellId, levels }: { spellId: string; levels: SpellLevels }) {
  const detail = useSpellDetail(spellId);
  const level = levels[spellId] ?? detail.data?.level;
  if (level === undefined) return null;
  return (
    <span className={styles.spellMeta}>
      {ordinal(level)} level
      {detail.data &&
        ` · ${spellRange(spellRangeText(detail.data))} · ${spellDuration(detail.data.duration)}`}
    </span>
  );
}

/**
 * The slots at each spell level that has any, with how many copies are memorized there. When a memorized copy has
 * no level in the view, the counts can't be placed, so each level shows its slots alone.
 */
function SlotDisplay({
  slots,
  model,
  levels,
}: {
  slots: readonly number[];
  model: SheetModel;
  levels: SpellLevels;
}) {
  const placed = model.memorized.every((copy) => levels[copy.spellId] !== undefined);
  return (
    <div className={styles.slotsLine}>
      <span className={styles.muted} aria-hidden="true">
        Slots
      </span>
      <dl className={styles.slotPairs} aria-label="Spell slots">
        {slots.map((n, index) => {
          if (n <= 0) return null;
          const level = index + 1;
          const memorized = model.memorized.filter((copy) => levels[copy.spellId] === level).length;
          return (
            <div key={level} className={styles.slotPair}>
              <dt>{ordinal(level)} level</dt>
              <dd>
                {placed ? (
                  <>
                    {memorized} of {n}
                    <span className="visually-hidden-inline"> memorized</span>
                  </>
                ) : (
                  `${n} ${n === 1 ? 'slot' : 'slots'}`
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

/** Whether a member has any magic to show a spells tab for: spell slots, a spell book, or a memorized spell. */
export function hasSpells(member: MemberView | null): boolean {
  if (!member) return false;
  return member.spell_slots.length > 0 || member.spell_book.length > 0 || member.memorized_spells.length > 0;
}

/**
 * The spells tab: the spell slots, the memorized spells with a cast button for each, the spell book, and
 * preparing and learning spells when bxapi offers those commands. Every fact comes from the member's view.
 */
export function SpellsTab({ member, model }: { member: MemberView; model: SheetModel }) {
  const ctx = useTextContext();
  const levels = useSpellLevels();
  const prepare = useMemberCommand('prepare_spells', member.id);
  const learn = useMemberCommand('learn_spell', member.id);
  const cast = useMemberCommand('cast_spell', member.id);
  const [preparing, setPreparing] = useState(false);
  const [casting, setCasting] = useState<{ spellId: string; reversed: boolean } | null>(null);
  const [learning, setLearning] = useState(false);
  // Preparing the first spells, or casting the last copy of one, removes the button that opened the dialog, so
  // focus returns to the section's heading.
  const heading = useRef<HTMLHeadingElement>(null);

  const memorized = useMemo(() => {
    const groups = new Map<string, { spellId: string; reversed: boolean; count: number }>();
    for (const copy of model.memorized) {
      const key = `${copy.spellId}:${copy.reversed}`;
      const group = groups.get(key);
      if (group) group.count += 1;
      else groups.set(key, { ...copy, count: 1 });
    }
    return [...groups.values()];
  }, [model.memorized]);

  const slots = member.spell_slots;
  const hasSlots = slots.some((n) => n > 0);
  const canPrepare = prepare.legal !== null && member.preparable_spells.length > 0;
  const blocked = [prepare, learn, cast].find((c) => c.legal !== null && !c.permission.allowed);
  const showBook = member.spell_book.length > 0 || member.learnable_spells.length > 0;
  const prepareButton = (
    <Button
      size="sm"
      variant="secondary"
      icon="book"
      disabled={!prepare.permission.allowed}
      disabledReason={prepare.permission.reason}
      onClick={() => setPreparing(true)}
    >
      Prepare spells
    </Button>
  );

  return (
    <div className={styles.tabPanel}>
      {blocked && !blocked.permission.allowed && (
        <Banner tone="neutral" icon="lock">
          {blocked.permission.reason}
        </Banner>
      )}
      <section className={styles.section} aria-labelledby="spells-memorized">
        <div className={styles.sectionHeader}>
          <h3 id="spells-memorized" ref={heading} tabIndex={-1} className={styles.sectionTitle}>
            Memorized spells
          </h3>
          {canPrepare && memorized.length > 0 && prepareButton}
        </div>
        {hasSlots && <SlotDisplay slots={slots} model={model} levels={levels} />}
        {memorized.length === 0 ? (
          hasSlots ? (
            <EmptyState
              size="compact"
              icon="book"
              title="No spells memorized"
              action={canPrepare ? prepareButton : undefined}
            />
          ) : (
            <EmptyState size="compact" icon="book" title="No spell slots yet" />
          )
        ) : (
          <div className={styles.spellGrid}>
            {memorized.map((copy) => {
              const name = nameOf(copy.spellId, copy.reversed, ctx);
              return (
                <div key={`${copy.spellId}:${copy.reversed}`} className={styles.spellCard}>
                  <div className={styles.spellTop}>
                    <SpellCardName spellId={copy.spellId} name={name} />
                    <span className={styles.spellTopEnd}>
                      {copy.count > 1 && <Badge tone="magic">×{copy.count}</Badge>}
                      <SpellInfo spellId={copy.spellId} name={name} />
                    </span>
                  </div>
                  <SpellMeta spellId={copy.spellId} levels={levels} />
                  {cast.legal && (
                    <div className={styles.spellActions}>
                      <Button
                        size="sm"
                        variant="secondary"
                        icon="spell"
                        disabled={!cast.permission.allowed}
                        disabledReason={cast.permission.reason}
                        onClick={() => setCasting({ spellId: copy.spellId, reversed: copy.reversed })}
                      >
                        Cast
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {showBook && (
        <section className={styles.section} aria-labelledby="spells-book">
          <div className={styles.sectionHeader}>
            <h3 id="spells-book" className={styles.sectionTitle}>
              Spell book
            </h3>
            {learn.legal && (
              <Button
                size="sm"
                variant="ghost"
                icon="plus"
                disabled={member.learnable_spells.length === 0 || !learn.permission.allowed}
                disabledReason={
                  member.learnable_spells.length === 0
                    ? `${member.name} can't learn a new spell now.`
                    : learn.permission.reason
                }
                onClick={() => setLearning(true)}
              >
                Learn a spell
              </Button>
            )}
          </div>
          {model.spellBook.length === 0 ? (
            <p className={styles.muted}>The spell book is empty.</p>
          ) : (
            <div className={styles.spellGrid}>
              {model.spellBook.map((id) => {
                const name = nameOf(id, false, ctx);
                return (
                  <div key={id} className={styles.spellCard}>
                    <div className={styles.spellTop}>
                      <SpellCardName spellId={id} name={name} />
                      <span className={styles.spellTopEnd}>
                        <SpellInfo spellId={id} name={name} />
                      </span>
                    </div>
                    <SpellMeta spellId={id} levels={levels} />
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {preparing && (
        <PrepareDialog
          member={member}
          model={model}
          levels={levels}
          returnFocus={heading}
          onClose={() => setPreparing(false)}
        />
      )}
      {casting && (
        <CastDialog member={member} copy={casting} returnFocus={heading} onClose={() => setCasting(null)} />
      )}
      {learning && <LearnDialog member={member} levels={levels} onClose={() => setLearning(false)} />}
    </div>
  );
}

/** One count control in the prepare dialog: a spell in one form. */
function PrepareCount({
  name,
  value,
  free,
  level,
  onChange,
}: {
  name: string;
  value: number;
  /** Slots still open at the spell's level, so a count can't go past the slots. */
  free: number;
  level: number;
  onChange: (value: number) => void;
}) {
  return (
    <NumberInput
      aria-label={`Copies of ${name}`}
      incrementLabel={`More copies of ${name}`}
      decrementLabel={`Fewer copies of ${name}`}
      value={value}
      min={0}
      max={value + free}
      maxReason={`No ${ordinal(level)}-level slots left.`}
      onChange={(v) => onChange(v ?? 0)}
    />
  );
}

/** The key of one form of a spell in the prepare dialog's counts. */
function formKey(spellId: string, reversed: boolean): string {
  return `${spellId}:${reversed}`;
}

/**
 * Chooses the spells to memorize, level by level: the spells bxapi lists in `preparable_spells`, grouped by the
 * view's spell levels, within the member's `spell_slots`.
 */
function PrepareDialog({
  member,
  model,
  levels,
  returnFocus,
  onClose,
}: {
  member: MemberView;
  model: SheetModel;
  levels: SpellLevels;
  returnFocus: RefObject<HTMLElement | null>;
  onClose: () => void;
}) {
  const ctx = useTextContext();
  const reversedNames = usePlayerView()?.reversed_spell_names ?? {};
  const { send, pending } = useSendCommand();
  const [error, setError] = useState<string | null>(null);
  const [hadMemorized] = useState(() => model.memorized.length > 0);
  const [counts, setCounts] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    // A memorized copy of a spell bxapi doesn't list as preparable has no row here, so it starts uncounted.
    for (const copy of model.memorized) {
      if (!member.preparable_spells.includes(copy.spellId)) continue;
      const key = formKey(copy.spellId, copy.reversed);
      initial[key] = (initial[key] ?? 0) + 1;
    }
    // With nothing memorized, the first choice is one copy of each book spell, as far as each level's slots go.
    // The player changes it before preparing.
    if (model.memorized.length === 0) {
      member.spell_slots.forEach((n, index) => {
        member.preparable_spells
          .filter((id) => levels[id] === index + 1 && member.spell_book.includes(id))
          .slice(0, n)
          .forEach((id) => {
            initial[formKey(id, false)] = 1;
          });
      });
    }
    return initial;
  });
  const groups = member.spell_slots
    .map((n, index) => ({
      level: index + 1,
      slots: n,
      spells: member.preparable_spells.filter((id) => levels[id] === index + 1),
    }))
    .filter((group) => group.slots > 0 && group.spells.length > 0);
  // Only a caster who chooses the form when memorizing has a row for a spell's reverse.
  const reversedNameOf = (id: string) => (member.reverses_at === 'memorize' ? reversedNames[id] : undefined);
  // The forms the dialog has a row for. The counts and the command cover these alone, so a spell that leaves the
  // view while the dialog is open is never sent.
  const shown = groups.flatMap(({ spells }) =>
    spells.flatMap((id) => [
      { spellId: id, reversed: false },
      ...(reversedNameOf(id) === undefined ? [] : [{ spellId: id, reversed: true }]),
    ]),
  );
  const countOf = (id: string, reversed: boolean) => counts[formKey(id, reversed)] ?? 0;
  const chosenIn = (spells: readonly string[]) =>
    shown
      .filter((f) => spells.includes(f.spellId))
      .reduce((sum, f) => sum + countOf(f.spellId, f.reversed), 0);
  const chosenTotal = chosenIn(shown.map((f) => f.spellId));
  const setCount = (key: string, value: number) => setCounts((c) => ({ ...c, [key]: value }));

  const submit = async () => {
    setError(null);
    const selections = shown.flatMap(({ spellId, reversed }) =>
      Array.from({ length: countOf(spellId, reversed) }, () =>
        reversed ? { spell_id: spellId, reversed: true } : { spell_id: spellId },
      ),
    );
    const result = await send(
      { command_type: 'prepare_spells', character_id: member.id, selections },
      { display: 'inline' },
    );
    if (result.status === 'accepted') onClose();
    else if (result.status !== 'conflict') setError(result.message);
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={`Prepare ${member.name}'s spells`}
      returnFocus={returnFocus}
      initialFocus={PREPARE_FOCUS}
      description={
        hadMemorized ? `Your choices replace the spells ${member.name} has memorized now.` : undefined
      }
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon="book"
            loading={pending}
            disabled={chosenTotal === 0}
            disabledReason="Choose a spell to prepare."
            onClick={() => void submit()}
          >
            Prepare spells
          </Button>
        </>
      }
    >
      <div className={styles.form}>
        {error && <Banner tone="warning">{error}</Banner>}
        {groups.length === 0 && <EmptyState icon="book" size="compact" title="Nothing to prepare" />}
        {groups.map(({ level, slots, spells }) => {
          const chosen = chosenIn(spells);
          const free = Math.max(0, slots - chosen);
          const label = `${ordinal(level)}-level spells`;
          return (
            <section key={level} className={styles.prepareLevel} aria-label={label}>
              <div className={styles.sectionHeader}>
                <h3 className={styles.sectionTitle}>{label}</h3>
                <Badge tone={chosen > slots ? 'warning' : 'neutral'}>
                  {chosen} of {slots}
                  <span className="visually-hidden-inline"> slots chosen</span>
                </Badge>
              </div>
              <ul className={styles.pickList}>
                {spells.map((id) => {
                  const name = nameOf(id, false, ctx);
                  const reversedName = reversedNameOf(id);
                  return (
                    <li key={id} className={styles.pickGroup}>
                      <div className={styles.pickRow}>
                        <span className={styles.pickName}>{name}</span>
                        <PrepareCount
                          name={name}
                          value={countOf(id, false)}
                          free={free}
                          level={level}
                          onChange={(v) => setCount(formKey(id, false), v)}
                        />
                        <SpellInfo spellId={id} name={name} />
                      </div>
                      {reversedName !== undefined && (
                        <div className={`${styles.pickRow} ${styles.pickRowReversed}`}>
                          <span className={styles.pickName}>
                            {capitalizeFirst(reversedName)} <Badge tone="neutral">Reversed</Badge>
                          </span>
                          <PrepareCount
                            name={capitalizeFirst(reversedName)}
                            value={countOf(id, true)}
                            free={free}
                            level={level}
                            onChange={(v) => setCount(formKey(id, true), v)}
                          />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </Dialog>
  );
}

/** The dialogs' first controls: a count, a way to cast or a target, and the spell to learn. */
const PREPARE_FOCUS = { selector: '[role="spinbutton"]' };
const CAST_FOCUS = { selector: '[role="radio"][data-state="checked"], [role="combobox"]' };
const LEARN_FOCUS = { selector: '[role="combobox"]' };

/** Casts a memorized spell outside battle, with its usage and targets. */
function CastDialog({
  member,
  copy,
  returnFocus,
  onClose,
}: {
  member: MemberView;
  copy: { spellId: string; reversed: boolean };
  returnFocus: RefObject<HTMLElement | null>;
  onClose: () => void;
}) {
  const entry = useSpellDetail(copy.spellId);
  const party = useParty();
  const ctx = useTextContext();
  const reversedName = usePlayerView()?.reversed_spell_names[copy.spellId];
  const location = usePartyLocation();
  const { send, pending } = useSendCommand();
  const [reversed, setReversed] = useState(copy.reversed);
  const [modeKey, setModeKey] = useState<string | null>(null);
  const [targets, setTargets] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const spell = entry.data;
  // A reversed form has its own ways to cast it, with their own keys.
  const form = reversed && spell?.reversed_form ? spell.reversed_form : spell;
  const modes = form?.modes ?? [];
  const mode = modes.find((m) => m.key === modeKey) ?? modes[0];
  const targeting = mode?.targeting?.mode ?? 'single';
  // A divine caster chooses the form as they cast. An arcane caster chose it when memorizing the copy.
  const choosesForm = member.reverses_at === 'cast' && reversedName !== undefined && !copy.reversed;
  const cell =
    location?.kind === 'dungeon' && location.position
      ? `cell:${location.dungeon_id}:${location.level_number}:${location.position[0]},${location.position[1]}`
      : null;
  const options = [
    ...party.map((m) => ({ value: m.id, label: m.id === member.id ? `${m.name} (self)` : m.name })),
    ...(cell ? [{ value: cell, label: 'Where the party stands' }] : []),
  ];
  // The title names the form being cast, so it follows the "instead" checkbox.
  const name = nameOf(copy.spellId, reversed, ctx);
  const needsTarget = mode !== undefined && targeting !== 'self' && targets.length === 0;

  const submit = async () => {
    if (!mode) return;
    setError(null);
    const chosen = targeting === 'self' ? [member.id] : targets;
    const result = await send(
      {
        command_type: 'cast_spell',
        character_id: member.id,
        spell_id: copy.spellId,
        mode: mode.key,
        reversed,
        targets: chosen,
      },
      { display: 'inline' },
    );
    if (result.status === 'accepted') onClose();
    else if (result.status !== 'conflict') setError(result.message);
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={`Cast ${name}`}
      returnFocus={returnFocus}
      initialFocus={CAST_FOCUS}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon="spell"
            loading={pending || entry.loading}
            disabled={!mode || needsTarget}
            disabledReason={
              entry.failed
                ? `${name}'s details didn't load. Close this and try again.`
                : needsTarget
                  ? 'Choose a target first.'
                  : undefined
            }
            onClick={() => void submit()}
          >
            Cast
          </Button>
        </>
      }
    >
      <div className={styles.form}>
        {error && <Banner tone="warning">{error}</Banner>}
        {entry.loading && <Skeleton lines={3} />}
        {choosesForm && spell?.reversed_form && (
          <Checkbox
            label={`Cast ${capitalizeFirst(reversedName)} instead`}
            checked={reversed}
            onCheckedChange={(checked) => {
              setReversed(checked);
              setModeKey(null);
              setTargets([]);
            }}
          />
        )}
        {modes.length > 1 && (
          <Field label="How to cast">
            <RadioGroup
              aria-label="How to cast"
              value={mode?.key}
              onValueChange={setModeKey}
              options={spellModeOptions(modes, name)}
            />
          </Field>
        )}
        {modes.length === 1 && mode && <p className={styles.detailProse}>{withoutPointers(mode.prose)}</p>}
        {mode && targeting === 'self' && <p className={styles.note}>The spell affects {member.name}.</p>}
        {mode && targeting === 'single' && (
          <Field label="Target">
            <Select
              value={targets[0] ?? ''}
              onValueChange={(value) => setTargets([value])}
              options={options}
              placeholder="Choose a target"
            />
          </Field>
        )}
        {mode && targeting !== 'self' && targeting !== 'single' && (
          <fieldset className={styles.section}>
            <legend className={styles.slotLabel}>Targets</legend>
            {options.map((o) => (
              <Checkbox
                key={o.value}
                label={o.label}
                checked={targets.includes(o.value)}
                onCheckedChange={(checked) =>
                  setTargets((all) => (checked ? [...all, o.value] : all.filter((t) => t !== o.value)))
                }
              />
            ))}
          </fieldset>
        )}
      </div>
    </Dialog>
  );
}

/** Writes a new spell into a caster's book, from the spells bxapi lists in `learnable_spells`. */
function LearnDialog({
  member,
  levels,
  onClose,
}: {
  member: MemberView;
  levels: SpellLevels;
  onClose: () => void;
}) {
  const ctx = useTextContext();
  const { send, pending } = useSendCommand();
  const [spellId, setSpellId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const spells = member.learnable_spells
    .map((id) => ({ id, name: nameOf(id, false, ctx), level: levels[id] }))
    .sort((a, b) => (a.level ?? 0) - (b.level ?? 0) || a.name.localeCompare(b.name));
  // The combobox can't group its options, so each one names its level only when the list spans levels.
  const oneLevel = new Set(spells.map((s) => s.level)).size <= 1;
  const options = spells.map((s) => ({
    value: s.id,
    label: s.name,
    description: oneLevel || s.level === undefined ? undefined : `${ordinal(s.level)} level`,
  }));
  // With one spell to learn, it is the choice.
  const chosen =
    spellId !== null && member.learnable_spells.includes(spellId)
      ? spellId
      : member.learnable_spells.length === 1
        ? (member.learnable_spells[0] ?? null)
        : null;

  const submit = async () => {
    if (!chosen) return;
    setError(null);
    const result = await send(
      { command_type: 'learn_spell', character_id: member.id, spell_id: chosen },
      { display: 'inline' },
    );
    if (result.status === 'accepted') onClose();
    else if (result.status !== 'conflict') setError(result.message);
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Learn a spell"
      initialFocus={LEARN_FOCUS}
      description={`Choose a spell to write into ${member.name}'s spell book.`}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon="book"
            loading={pending}
            disabled={!chosen}
            disabledReason="Choose a spell to learn."
            onClick={() => void submit()}
          >
            {chosen ? `Learn ${nameOf(chosen, false, ctx)}` : 'Learn'}
          </Button>
        </>
      }
    >
      <div className={styles.form}>
        {error && <Banner tone="warning">{error}</Banner>}
        {options.length === 0 ? (
          <EmptyState icon="book" size="compact" title="No spells to learn" />
        ) : (
          <Field label="Spell">
            <Combobox value={chosen} onChange={setSpellId} options={options} placeholder="Search spells" />
          </Field>
        )}
        {chosen && <SpellDetailBody spellId={chosen} />}
      </div>
    </Dialog>
  );
}
