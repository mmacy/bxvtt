import type { MemberView, SpellSummary } from '@bxvtt/shared/bxapi';
import { capitalizeFirst, ordinal, prettifyId, spellCatalogName } from '@bxvtt/shared/text';
import { useMemo, useState } from 'react';
import { useParty, usePartyLocation, useSendCommand, useSpellCatalog } from '@/app';
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
import { classMagic, spellSlotsAt } from '../wizard/tables';
import { useMemberCommand } from './actions';
import { spellDuration, spellRange } from './spellText';
import { RuleLink } from './RuleLink';
import type { SheetModel } from './model';
import styles from './sheet.module.css';
import { useClassDetail, useSpellDetail } from './catalogs';

/** A spell's name from the catalog, or the built-in name. */
function nameOf(id: string, catalog: readonly SpellSummary[] | null): string {
  return catalog?.find((s) => s.id === id)?.name ?? spellCatalogName(id) ?? capitalizeFirst(prettifyId(id));
}

/** A spell's full text: the introduction and each way to cast it. */
export function SpellDetailBody({ spellId }: { spellId: string }) {
  const entry = useSpellDetail(spellId);
  if (entry.loading) return <Skeleton lines={4} />;
  if (!entry.data) return <p className={styles.detailProse}>The rules reference doesn't have this spell.</p>;
  const spell = entry.data;
  return (
    <div className={styles.detail}>
      <dl className={styles.detailFacts}>
        <dt>Level</dt>
        <dd>{spell.level}</dd>
        <dt>Range</dt>
        <dd>{spell.range}</dd>
        <dt>Duration</dt>
        <dd>{spell.duration}</dd>
        {spell.reversed_form && (
          <>
            <dt>Reversed</dt>
            <dd>{spell.reversed_form.name}</dd>
          </>
        )}
      </dl>
      {spell.intro && <p className={styles.detailProse}>{spell.intro}</p>}
      {spell.modes.map((mode) => (
        <p key={mode.key} className={styles.detailProse}>
          {mode.prose}
        </p>
      ))}
    </div>
  );
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

/**
 * The spells tab: the spell book, the memorized spells with a cast button for each, and preparing and learning
 * spells when bxapi offers those commands.
 */
export function SpellsTab({ member, model }: { member: MemberView; model: SheetModel }) {
  const classEntry = useClassDetail(model.classId);
  const catalog = useSpellCatalog();
  const magic = classMagic(classEntry.data);
  const slots = spellSlotsAt(classEntry.data, model.level);
  const prepare = useMemberCommand('prepare_spells', member.id);
  const learn = useMemberCommand('learn_spell', member.id);
  const cast = useMemberCommand('cast_spell', member.id);
  const [preparing, setPreparing] = useState(false);
  const [casting, setCasting] = useState<{ spellId: string; reversed: boolean } | null>(null);
  const [learning, setLearning] = useState(false);
  const spells = catalog.data;

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

  const blocked = [prepare, learn, cast].find((c) => c.legal !== null && !c.permission.allowed);

  return (
    <div className={styles.tabPanel}>
      {blocked && !blocked.permission.allowed && (
        <Banner tone="neutral" icon="lock">
          {blocked.permission.reason}
        </Banner>
      )}
      <section className={styles.section} aria-labelledby="spells-memorized">
        <div className={styles.sectionHeader}>
          <h3 id="spells-memorized" className={styles.sectionTitle}>
            Memorized spells
          </h3>
          {prepare.legal && (
            <Button
              size="sm"
              variant="secondary"
              icon="book"
              disabled={!prepare.permission.allowed}
              title={prepare.permission.reason ?? undefined}
              onClick={() => setPreparing(true)}
            >
              Prepare spells
            </Button>
          )}
        </div>
        <div className={styles.slotsLine} aria-label="Spell slots">
          {slots.some((n) => n > 0) ? (
            slots.map((n, i) =>
              n > 0 ? (
                <Badge key={i} tone="magic" appearance="outline">
                  {ordinal(i + 1)} level: {n} {n === 1 ? 'slot' : 'slots'}
                </Badge>
              ) : null,
            )
          ) : (
            <span className={styles.muted}>No spell slots at level {model.level}.</span>
          )}
        </div>
        <p className={styles.note}>
          Preparing takes six turns, and the caster must have slept since the last time they prepared.
        </p>
        {memorized.length === 0 ? (
          <p className={styles.muted}>Nothing memorized.</p>
        ) : (
          <div className={styles.spellGrid}>
            {memorized.map((copy) => {
              const name = nameOf(copy.spellId, spells);
              const summary = spells?.find((s) => s.id === copy.spellId);
              return (
                <div key={`${copy.spellId}:${copy.reversed}`} className={styles.spellCard}>
                  <div className={styles.spellTop}>
                    <span className={styles.spellName}>
                      <RuleLink entry={{ kind: 'spells', id: copy.spellId }}>{name}</RuleLink>
                      {copy.reversed && ' (reversed)'}
                    </span>
                    {copy.count > 1 && <Badge tone="magic">×{copy.count}</Badge>}
                  </div>
                  {summary && (
                    <span className={styles.spellMeta}>
                      {ordinal(summary.level)} level · {spellRange(summary.range)} ·{' '}
                      {spellDuration(summary.duration)}
                    </span>
                  )}
                  <div className={styles.spellActions}>
                    {cast.legal && (
                      <Button
                        size="sm"
                        variant="secondary"
                        icon="spell"
                        disabled={!cast.permission.allowed}
                        title={cast.permission.reason ?? undefined}
                        onClick={() => setCasting({ spellId: copy.spellId, reversed: copy.reversed })}
                      >
                        Cast
                      </Button>
                    )}
                    <SpellInfo spellId={copy.spellId} name={name} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {(magic?.kind === 'arcane' || model.spellBook.length > 0) && (
        <section className={styles.section} aria-labelledby="spells-book">
          <div className={styles.sectionHeader}>
            <h3 id="spells-book" className={styles.sectionTitle}>
              Spell book
            </h3>
            {learn.legal && magic?.kind === 'arcane' && (
              <Button
                size="sm"
                variant="ghost"
                icon="plus"
                disabled={!learn.permission.allowed}
                title={learn.permission.reason ?? undefined}
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
                const summary = spells?.find((s) => s.id === id);
                const name = nameOf(id, spells);
                return (
                  <div key={id} className={styles.spellCard}>
                    <div className={styles.spellTop}>
                      <span className={styles.spellName}>
                        <RuleLink entry={{ kind: 'spells', id }}>{name}</RuleLink>
                      </span>
                      <SpellInfo spellId={id} name={name} />
                    </div>
                    {summary && (
                      <span className={styles.spellMeta}>
                        {ordinal(summary.level)} level · {spellRange(summary.range)} ·{' '}
                        {spellDuration(summary.duration)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {preparing && magic && (
        <PrepareDialog
          member={member}
          model={model}
          spellList={magic.spellList}
          arcane={magic.kind === 'arcane'}
          slots={slots}
          onClose={() => setPreparing(false)}
        />
      )}
      {casting && (
        <CastDialog
          member={member}
          copy={casting}
          arcane={magic?.kind === 'arcane'}
          onClose={() => setCasting(null)}
        />
      )}
      {learning && magic && (
        <LearnDialog
          member={member}
          model={model}
          spellList={magic.spellList}
          onClose={() => setLearning(false)}
        />
      )}
    </div>
  );
}

/** Whether a member has any magic to show a spells tab for. */
export function useHasSpells(model: Pick<SheetModel, 'classId' | 'spellBook' | 'memorized'> | null): boolean {
  const classEntry = useClassDetail(model ? model.classId : null);
  if (!model) return false;
  return model.spellBook.length > 0 || model.memorized.length > 0 || classMagic(classEntry.data) !== null;
}

interface PrepareProps {
  member: MemberView;
  model: SheetModel;
  spellList: string;
  arcane: boolean;
  slots: number[];
  onClose: () => void;
}

function PrepareRow({
  spell,
  arcane,
  counts,
  setCount,
}: {
  spell: SpellSummary;
  arcane: boolean;
  counts: Record<string, number>;
  setCount: (key: string, value: number) => void;
}) {
  const detail = useSpellDetail(arcane ? spell.id : null);
  const reversible = arcane && detail.data?.reversed_form;
  return (
    <li className={styles.pickRow}>
      <span className={styles.pickName}>
        {spell.name}
        <span className={styles.spellMeta}> · {spell.range}</span>
      </span>
      <NumberInput
        aria-label={`Copies of ${spell.name}`}
        incrementLabel={`More copies of ${spell.name}`}
        decrementLabel={`Fewer copies of ${spell.name}`}
        value={counts[`${spell.id}:false`] ?? 0}
        min={0}
        max={9}
        onChange={(v) => setCount(`${spell.id}:false`, v ?? 0)}
      />
      {reversible && (
        <NumberInput
          aria-label={`Copies of ${detail.data?.reversed_form?.name ?? 'the reversed form'}`}
          incrementLabel={`More copies of ${detail.data?.reversed_form?.name ?? 'the reversed form'}`}
          decrementLabel={`Fewer copies of ${detail.data?.reversed_form?.name ?? 'the reversed form'}`}
          value={counts[`${spell.id}:true`] ?? 0}
          min={0}
          max={9}
          onChange={(v) => setCount(`${spell.id}:true`, v ?? 0)}
        />
      )}
    </li>
  );
}

/** Chooses the spells to memorize, level by level, within the slots the class table lists. */
function PrepareDialog({ member, model, spellList, arcane, slots, onClose }: PrepareProps) {
  const catalog = useSpellCatalog();
  const { send, pending } = useSendCommand();
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    for (const copy of model.memorized) {
      const key = `${copy.spellId}:${copy.reversed}`;
      initial[key] = (initial[key] ?? 0) + 1;
    }
    return initial;
  });
  const candidates = (catalog.data ?? []).filter((s) =>
    arcane ? model.spellBook.includes(s.id) : s.spell_list === spellList,
  );
  const levels = slots.map((n, i) => ({ level: i + 1, slots: n })).filter((l) => l.slots > 0);
  const chosenAt = (level: number) =>
    candidates
      .filter((s) => s.level === level)
      .reduce((sum, s) => sum + (counts[`${s.id}:false`] ?? 0) + (counts[`${s.id}:true`] ?? 0), 0);

  const submit = async () => {
    setError(null);
    const selections = Object.entries(counts).flatMap(([key, n]) => {
      const [spellId, reversed] = key.split(':');
      if (!spellId) return [];
      return Array.from({ length: n }, () =>
        reversed === 'true' ? { spell_id: spellId, reversed: true } : { spell_id: spellId },
      );
    });
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
      description="The new list replaces what is memorized now. Preparing takes six turns."
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" icon="book" loading={pending} onClick={() => void submit()}>
            Prepare spells
          </Button>
        </>
      }
    >
      <div className={styles.form}>
        {error && (
          <Banner tone="warning" title="The spells weren't prepared">
            {error}
          </Banner>
        )}
        {levels.length === 0 && (
          <EmptyState
            icon="book"
            size="compact"
            title="No spell slots yet"
            description={`${member.name} gains spell slots at a higher level.`}
          />
        )}
        {catalog.loading && <Skeleton lines={4} />}
        {levels.map(({ level, slots: n }) => {
          const list = candidates.filter((s) => s.level === level);
          return (
            <section
              key={level}
              className={styles.prepareLevel}
              aria-label={`${ordinal(level)}-level spells`}
            >
              <div className={styles.sectionHeader}>
                <h3 className={styles.sectionTitle}>{ordinal(level)}-level spells</h3>
                <Badge tone={chosenAt(level) > n ? 'warning' : 'neutral'}>
                  Slots used: {chosenAt(level)} of {n}
                </Badge>
              </div>
              {list.length === 0 ? (
                <p className={styles.muted}>
                  {arcane
                    ? `The spell book has no ${ordinal(level)}-level spells.`
                    : 'No spells at this level.'}
                </p>
              ) : (
                <ul className={styles.pickList}>
                  {list.map((spell) => (
                    <PrepareRow
                      key={spell.id}
                      spell={spell}
                      arcane={arcane}
                      counts={counts}
                      setCount={(key, value) => setCounts((c) => ({ ...c, [key]: value }))}
                    />
                  ))}
                </ul>
              )}
            </section>
          );
        })}
        {arcane && (
          <p className={styles.note}>
            An arcane caster chooses the reversed form of a spell now, when they memorize it.
          </p>
        )}
      </div>
    </Dialog>
  );
}

/** A label for one way to cast a spell: its prose when each way has its own, or its key in words. */
function modeLabel(
  mode: { key: string; prose: string },
  modes: ReadonlyArray<{ key: string; prose: string }>,
): string {
  const distinct = new Set(modes.map((m) => m.prose)).size === modes.length;
  return distinct && mode.prose ? mode.prose : capitalizeFirst(mode.key.replaceAll('_', ' '));
}

/** Casts a memorized spell outside battle, with its usage and targets. */
function CastDialog({
  member,
  copy,
  arcane,
  onClose,
}: {
  member: MemberView;
  copy: { spellId: string; reversed: boolean };
  arcane: boolean;
  onClose: () => void;
}) {
  const entry = useSpellDetail(copy.spellId);
  const party = useParty();
  const location = usePartyLocation();
  const { send, pending } = useSendCommand();
  const [reversed, setReversed] = useState(copy.reversed);
  const [modeKey, setModeKey] = useState<string | null>(null);
  const [targets, setTargets] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const spell = entry.data;
  const form = reversed && spell?.reversed_form ? spell.reversed_form : spell;
  const modes = form?.modes ?? [];
  const mode = modes.find((m) => m.key === modeKey) ?? modes[0];
  const targeting = mode?.targeting?.mode ?? 'single';
  const cell =
    location?.kind === 'dungeon' && location.position
      ? `cell:${location.dungeon_id}:${location.level_number}:${location.position[0]},${location.position[1]}`
      : null;
  const options = [
    ...party.map((m) => ({ value: m.id, label: m.id === member.id ? `${m.name} (the caster)` : m.name })),
    ...(cell ? [{ value: cell, label: 'The place where the party stands' }] : []),
  ];
  const name = spell
    ? reversed && spell.reversed_form
      ? spell.reversed_form.name
      : spell.name
    : 'the spell';

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
      description="Casting outside a battle takes a round and uses up one memorized copy."
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon="spell"
            loading={pending}
            disabled={!mode}
            onClick={() => void submit()}
          >
            Cast
          </Button>
        </>
      }
    >
      <div className={styles.form}>
        {error && (
          <Banner tone="warning" title="The spell wasn't cast">
            {error}
          </Banner>
        )}
        {entry.loading && <Skeleton lines={3} />}
        {spell?.reversed_form && (
          <Checkbox
            label={`Cast the reversed form, ${spell.reversed_form.name}`}
            description={
              arcane
                ? 'An arcane caster fixes the form when memorizing, so this follows the memorized copy.'
                : 'A divine caster chooses the form when casting.'
            }
            checked={reversed}
            disabled={arcane}
            onCheckedChange={(checked) => {
              setReversed(checked);
              setModeKey(null);
            }}
          />
        )}
        {modes.length > 1 && (
          <Field label="How to cast it">
            <RadioGroup
              aria-label="How to cast it"
              value={mode?.key}
              onValueChange={setModeKey}
              options={modes.map((m) => ({ value: m.key, label: modeLabel(m, modes) }))}
            />
          </Field>
        )}
        {modes.length === 1 && mode && <p className={styles.detailProse}>{mode.prose}</p>}
        {mode && targeting === 'self' && <p className={styles.note}>The spell affects {member.name}.</p>}
        {mode && targeting === 'single' && (
          <Field label="Target">
            <Select
              value={targets[0] ?? ''}
              onValueChange={(value) => setTargets([value])}
              options={options}
              placeholder="Choose the target"
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

/** Writes a new spell into an arcane caster's book. */
function LearnDialog({
  member,
  model,
  spellList,
  onClose,
}: {
  member: MemberView;
  model: SheetModel;
  spellList: string;
  onClose: () => void;
}) {
  const catalog = useSpellCatalog();
  const { send, pending } = useSendCommand();
  const [spellId, setSpellId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const options = (catalog.data ?? [])
    .filter((s) => s.spell_list === spellList && !model.spellBook.includes(s.id))
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))
    .map((s) => ({ value: s.id, label: s.name, description: `${ordinal(s.level)} level` }));

  const submit = async () => {
    if (!spellId) return;
    setError(null);
    const result = await send(
      { command_type: 'learn_spell', character_id: member.id, spell_id: spellId },
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
      title={`Teach ${member.name} a spell`}
      description="Use it when the character gains a level or a mentor or scroll teaches them. The book holds as many spells of each level as the caster has slots."
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
            disabled={!spellId}
            onClick={() => void submit()}
          >
            Write it in the book
          </Button>
        </>
      }
    >
      <div className={styles.form}>
        {error && (
          <Banner tone="warning" title="The spell wasn't learned">
            {error}
          </Banner>
        )}
        <Field label="Spell">
          <Combobox value={spellId} onChange={setSpellId} options={options} placeholder="Search spells" />
        </Field>
        {spellId && <SpellDetailBody spellId={spellId} />}
      </div>
    </Dialog>
  );
}
