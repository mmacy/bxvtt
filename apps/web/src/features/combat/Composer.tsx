import type { EncounterGroupView, EncounterView, MemberView } from '@bxvtt/shared/bxapi';
import type { DeclarationBody } from '@bxvtt/shared/protocol';
import {
  conditionLabel,
  formatFeet,
  joinList,
  memberName,
  monsterName,
  spellName,
  type TextContext,
} from '@bxvtt/shared/text';
import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import {
  getApi,
  loadCatalog,
  useMonsterCatalog,
  useRulesEntry,
  useSendDeclaration,
  useTableUi,
  useTextContext,
  type ClassDetail,
  type SpellDetail,
} from '@/app';
import { Banner, Button, Card, Checkbox, cx, Icon, SegmentedControl, Select, type IconName } from '@/ui';
import {
  attackDeclaration,
  carries,
  liveGroups,
  memberDistance,
  memberGap,
  membersInReach,
  memorizedSpells,
  planAttack,
  spellModeLabel,
  spellRangeFeet,
  usableItems,
  type CarriedItem,
  type MemberGear,
} from './model';
import styles from './combat.module.css';
import { useEncounterCreatures } from './text';
import { useCasting } from './casting';
import { countBadge, groupHeading, theGroup, viewLabels } from './names';

export type ComposerTab = 'attack' | 'cast' | 'move' | 'item' | 'give' | 'turn' | 'hide' | 'hold';

const TAB_LABELS: Record<ComposerTab, { label: string; icon: IconName }> = {
  attack: { label: 'Attack', icon: 'weapon-sword' },
  cast: { label: 'Cast', icon: 'spell' },
  move: { label: 'Move', icon: 'footprints' },
  item: { label: 'Item', icon: 'potion' },
  give: { label: 'Give', icon: 'hand' },
  turn: { label: 'Turn undead', icon: 'class-cleric' },
  hide: { label: 'Hide', icon: 'eye-off' },
  hold: { label: 'Hold', icon: 'pause' },
};

/** The class abilities that offer a choice in battle, read from the class catalog. */
export function useClassAbilities(classId: string | null): { turnUndead: boolean; backStab: boolean } {
  const entry = useRulesEntry<ClassDetail>(classId === null ? null : `classes/${classId}`);
  return useMemo(() => {
    const tags = new Set((entry.data?.abilities ?? []).map((ability) => ability.tag));
    return { turnUndead: tags.has('turn_undead'), backStab: tags.has('back_stab') };
  }, [entry.data]);
}

interface MonsterEntry {
  abilities?: Array<{ tag: string; params?: Record<string, unknown> | null }>;
}

/**
 * The groups whose creatures have a petrifying gaze, from each family's catalog entry, so the composer offers a
 * guard only when one is in the fight.
 */
export function useGazeGroups(encounter: EncounterView | null): string[] {
  // A family isn't always a monster ID: `veteran` covers `veteran_1` to `veteran_3`. Read the entry of a monster
  // that the catalog lists for the family, and skip a family it lists nothing for, so no request fails.
  const catalog = useMonsterCatalog().data;
  const ids = catalog?.map((m) => m.id) ?? [];
  const entryFor = (family: string) =>
    ids.includes(family) ? family : ids.find((id) => id.startsWith(`${family}_`));
  // A string key, so the effect runs when the groups change and not on every new view object.
  const key = liveGroups(encounter)
    .flatMap((g) => {
      const entry = g.family_id ? entryFor(g.family_id) : undefined;
      return entry ? [`${g.id}=${entry}`] : [];
    })
    .join(',');
  const [gazers, setGazers] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    const families = key === '' ? [] : key.split(',').map((pair) => pair.split('='));
    Promise.all(
      families.map(async ([groupId, family]) => {
        if (!groupId || !family) return null;
        try {
          const path = `monsters/${family}`;
          const entry = await loadCatalog<MonsterEntry>(`entry:${path}`, () =>
            getApi().rules<MonsterEntry>(path),
          );
          const gaze = (entry.abilities ?? []).some(
            (a) => a.tag === 'petrification' && a.params?.vector === 'gaze',
          );
          return gaze ? groupId : null;
        } catch {
          return null;
        }
      }),
    ).then((ids) => {
      if (!cancelled) setGazers(ids.filter((id): id is string => id !== null));
    });
    return () => {
      cancelled = true;
    };
  }, [key]);
  return gazers;
}

export interface ComposerProps {
  member: MemberView;
  encounter: EncounterView;
  gear: MemberGear;
  /** The member's saved declaration, to start on its tab. */
  current: DeclarationBody | null;
  /** The row's suggested action, to start on its tab when the member hasn't declared. */
  suggested?: DeclarationBody | null;
  /** bxapi's reasons for refusing this member's declaration in the last attempt. */
  refusals: readonly string[];
  /** Called after a declaration is saved. */
  onDeclared: () => void;
  /** Called when the player closes the composer. */
  onClose: () => void;
}

/**
 * Builds one member's declaration for the round from the choices the view supports, and saves it.
 */
export function Composer({
  member,
  encounter,
  gear,
  current,
  suggested = null,
  refusals,
  onDeclared,
  onClose,
}: ComposerProps) {
  const ctx = useTextContext();
  const { declare, pending } = useSendDeclaration();
  const abilities = useClassAbilities(member.class_id);
  const gazers = useGazeGroups(encounter);
  const spells = memorizedSpells(member);
  const usable = usableItems(gear);
  const others = encounter.declarers.filter((id) => id !== member.id);
  const groups = liveGroups(encounter);

  const tabs: ComposerTab[] = [];
  if (groups.length > 0) tabs.push('attack');
  const casting = useCasting(member);
  // A caster with nothing memorized sees the Cast tab, disabled, with the reason under the tabs.
  if (spells.length > 0 || casting.caster) tabs.push('cast');
  tabs.push('move');
  if (usable.length > 0) tabs.push('item');
  if (gear.items.length > 0 && others.length > 0) tabs.push('give');
  if (abilities.turnUndead) tabs.push('turn');
  // Hide is offered to the members the view lists in `can_hide`, to a member who already declared a hide, and to
  // a member the view gives thief skills. `can_hide` reads the battle as it stands, so a thief in the front rank
  // isn't in it, though another member's declared move can make the hide work. The preview says when it won't.
  const thiefSkills = Object.keys(member.thief_skills).length > 0;
  if (encounter.can_hide.includes(member.id) || current?.action === 'hide' || thiefSkills) tabs.push('hide');
  tabs.push('hold');

  const usableTabs = tabs.filter((t) => t !== 'cast' || spells.length > 0);
  const initial = tabFor(current?.action ?? suggested?.action) ?? usableTabs[0] ?? 'hold';
  const [tab, setTab] = useState<ComposerTab>(
    usableTabs.includes(initial) ? initial : (usableTabs[0] ?? 'hold'),
  );
  const openSheet = useTableUi((s) => s.openCharacterSheet);
  const [gaze, setGaze] = useState<string>(
    typeof current?.gaze_defense === 'string' ? current.gaze_defense : 'none',
  );
  const [error, setError] = useState<string | null>(null);

  const submit = async (body: DeclarationBody) => {
    const full: DeclarationBody = gaze === 'none' ? body : { ...body, gaze_defense: gaze };
    setError(null);
    const result = await declare(member.id, full, { display: 'inline' });
    if (result.status === 'saved') onDeclared();
    else if (result.status === 'error') setError(result.message);
  };

  const hasMirror = carries(gear, 'mirror');
  return (
    <section className={styles.composer} aria-label={`Declare for ${member.name}`}>
      <div className={styles.composerHead}>
        <SegmentedControl
          size="sm"
          aria-label={`What ${member.name} does this round`}
          value={tab}
          onValueChange={(value) => setTab(value as ComposerTab)}
          options={tabs.map((value) => ({
            value,
            label: TAB_LABELS[value].label,
            icon: TAB_LABELS[value].icon,
            disabled: value === 'cast' && spells.length === 0,
          }))}
        />
        <Button
          size="sm"
          variant="ghost"
          icon="close"
          onClick={onClose}
          aria-label={`Close ${member.name}'s actions`}
        >
          Close
        </Button>
      </div>

      {casting.reason && (
        <div className={styles.noSpells}>
          <Icon name="spell" size={14} />
          <span className={styles.noSpellsText}>{casting.reason}</span>
          <Button
            size="sm"
            variant="ghost"
            iconEnd="arrow-right"
            onClick={() => openSheet(member.id, 'spells')}
          >
            Open {member.name}'s spells
          </Button>
        </div>
      )}

      {gazers.length > 0 && (
        <div className={styles.gazeRow}>
          <Icon name="eye" size={14} />
          <span className={styles.gazeText}>A petrifying gaze can turn front-rank characters to stone.</span>
          <Select
            size="sm"
            className={styles.compactSelect}
            aria-label="Guard against gaze"
            value={gaze}
            onValueChange={setGaze}
            options={[
              { value: 'none', label: 'No guard' },
              { value: 'avert_eyes', label: 'Avert eyes (−4 to hit)' },
              {
                value: 'mirror',
                label: hasMirror
                  ? 'Watch in a mirror (−1 to hit)'
                  : `Watch in a mirror (${member.name} has none)`,
                disabled: !hasMirror,
              },
            ]}
          />
        </div>
      )}

      {refusals.length > 0 && <Banner tone="warning">{refusals.join(' ')}</Banner>}
      {error && <Banner tone="danger">{error}</Banner>}

      <div className={styles.composerBody}>
        {tab === 'attack' && (
          <AttackChoices
            member={member}
            encounter={encounter}
            gear={gear}
            backStab={abilities.backStab}
            current={current}
            pending={pending}
            onSubmit={submit}
          />
        )}
        {tab === 'cast' && (
          <CastChoices member={member} encounter={encounter} ctx={ctx} pending={pending} onSubmit={submit} />
        )}
        {tab === 'move' && (
          <MoveChoices
            member={member}
            encounter={encounter}
            ctx={ctx}
            current={current}
            pending={pending}
            onSubmit={submit}
          />
        )}
        {tab === 'item' && (
          <ItemChoices
            member={member}
            encounter={encounter}
            items={usable}
            ctx={ctx}
            pending={pending}
            onSubmit={submit}
          />
        )}
        {tab === 'give' && (
          <GiveChoices
            member={member}
            encounter={encounter}
            gear={gear}
            ctx={ctx}
            pending={pending}
            onSubmit={submit}
          />
        )}
        {tab === 'turn' && (
          <TurnChoice member={member} encounter={encounter} pending={pending} onSubmit={submit} />
        )}
        {tab === 'hide' && (
          <div className={styles.choiceRow}>
            <p className={styles.choiceHint}>
              {member.name} slips into the shadows to set up a back-stab. The referee rolls in secret.
            </p>
            <Button
              size="sm"
              variant="secondary"
              icon="eye-off"
              loading={pending}
              onClick={() => void submit({ action: 'hide' })}
            >
              Hide in shadows
            </Button>
          </div>
        )}
        {tab === 'hold' && (
          <div className={styles.choiceRow}>
            <p className={styles.choiceHint}>{member.name} stays put and does nothing this round.</p>
            <Button
              size="sm"
              variant="secondary"
              icon="pause"
              loading={pending}
              onClick={() => void submit({ action: 'hold' })}
            >
              Hold this round
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}

function tabFor(action: string | undefined): ComposerTab | null {
  switch (action) {
    case 'attack':
      return 'attack';
    case 'cast':
      return 'cast';
    case 'move':
      return 'move';
    case 'use_item':
      return 'item';
    case 'give_item':
      return 'give';
    case 'turn_undead':
      return 'turn';
    case 'hide':
      return 'hide';
    case 'hold':
      return 'hold';
    default:
      return null;
  }
}

// Choice tiles -------------------------------------------------------------------------------------------------

interface TileProps {
  title: ReactNode;
  meta?: ReactNode;
  note?: ReactNode;
  disabledReason?: string | null;
  icon?: IconName;
  label: string;
  onClick: () => void;
  pending?: boolean;
  selected?: boolean;
}

/** One choice, such as a target group. A disabled tile says why. */
function Tile({ title, meta, note, disabledReason, icon, label, onClick, pending, selected }: TileProps) {
  const disabled = Boolean(disabledReason) || pending;
  // The label names the tile, so the note or the reason it shows is its description.
  const detail = useId();
  const described = disabledReason || note ? detail : undefined;
  return (
    <Card
      padding="none"
      interactive={!disabled}
      selected={selected}
      className={cx(styles.tile, disabledReason && styles.tileDisabled)}
    >
      <button
        type="button"
        className={styles.tileButton}
        aria-label={label}
        aria-describedby={described}
        aria-disabled={disabled || undefined}
        aria-pressed={selected}
        onClick={() => {
          if (!disabled) onClick();
        }}
      >
        <span className={styles.tileTitle}>
          {icon && <Icon name={icon} size={14} />}
          {title}
          {meta && <span className={styles.tileMeta}>{meta}</span>}
        </span>
        {disabledReason ? (
          <span id={detail} className={styles.tileReason}>
            {disabledReason}
          </span>
        ) : (
          note && (
            <span id={detail} className={styles.tileNote}>
              {note}
            </span>
          )
        )}
      </button>
    </Card>
  );
}

function groupTitle(group: EncounterGroupView): string {
  return groupHeading(viewLabels(group));
}

/** The tile's meta line: the count, when the group isn't one named individual, and the distance. */
function groupMeta(group: EncounterGroupView, distance: number): string {
  const badge = countBadge(viewLabels(group));
  return badge ? `${badge} · ${formatFeet(distance, 'short')}` : formatFeet(distance, 'short');
}

function groupConditions(group: EncounterGroupView): string | null {
  const parts = Object.entries(group.condition_counts).map(
    ([condition, count]) => `${count} ${conditionLabel(condition).toLowerCase()}`,
  );
  return parts.length > 0 ? parts.join(', ') : null;
}

interface ChoiceProps {
  member: MemberView;
  encounter: EncounterView;
  pending: boolean;
  onSubmit: (body: DeclarationBody) => Promise<void>;
}

// Attack -------------------------------------------------------------------------------------------------------

function AttackChoices({
  member,
  encounter,
  gear,
  backStab,
  current,
  pending,
  onSubmit,
}: ChoiceProps & { gear: MemberGear; backStab: boolean; current: DeclarationBody | null }) {
  const [weaponId, setWeaponId] = useState<string>('auto');
  // The class catalog says who has the back-stab ability, and the view lists who is hiding. Whether a back-stab
  // works this round is bxapi's to say, and the board shows its reason when one won't.
  const hiding = encounter.hiding.includes(member.id);
  const canStab = backStab || hiding;
  // A hiding member starts on a back-stab, the reason to hide, and a saved back-stab starts checked.
  const [stab, setStab] = useState(hiding || current?.back_stab === true);
  // A back-stab is a melee attack, so it takes the wielded melee weapon unless the player chose one.
  const melee = gear.wielded.find((w) => w.melee)?.id ?? null;
  const chosen = weaponId !== 'auto' ? weaponId : stab && canStab ? melee : null;
  return (
    <div className={styles.choiceStack}>
      {(gear.wielded.length > 1 || canStab) && (
        <div className={styles.optionRow}>
          {gear.wielded.length > 1 && (
            <Select
              size="sm"
              className={styles.compactSelect}
              aria-label="Weapon"
              value={weaponId}
              onValueChange={setWeaponId}
              options={[
                { value: 'auto', label: 'The weapon that suits the distance' },
                ...gear.wielded.map((w) => ({
                  value: w.id,
                  label: capitalize(w.name.replace(/^(a|an) /, '')),
                })),
              ]}
            />
          )}
          {canStab && (
            <Checkbox
              label="Back-stab"
              description={`Strike a monster that hasn't noticed ${member.name}.`}
              checked={stab}
              onCheckedChange={setStab}
            />
          )}
        </div>
      )}
      <div className={styles.tiles}>
        {liveGroups(encounter).map((group) => {
          const plan = planAttack(member, encounter, group, gear, chosen);
          const conditions = groupConditions(group);
          const verb =
            plan.kind === 'missile'
              ? plan.weapon?.thrown
                ? 'Throw'
                : 'Shoot'
              : plan.kind === 'close'
                ? 'Close in and attack'
                : 'Attack';
          return (
            <Tile
              key={group.id}
              icon={
                plan.kind === 'missile' ? (plan.weapon?.thrown ? 'target' : 'weapon-bow') : 'weapon-sword'
              }
              title={groupTitle(group)}
              meta={groupMeta(group, plan.distance)}
              note={conditions ? `${plan.note} ${capitalize(conditions)}.` : plan.note}
              disabledReason={plan.reason}
              label={`${verb}: ${theGroup(viewLabels(group))}, ${formatFeet(plan.distance)} away`}
              selected={current?.action === 'attack' && current.target_group_id === group.id}
              pending={pending}
              onClick={() => void onSubmit(attackDeclaration(plan, { weaponId: chosen, backStab: stab }))}
            />
          );
        })}
      </div>
    </div>
  );
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// Cast ---------------------------------------------------------------------------------------------------------

function CastChoices({ member, encounter, ctx, pending, onSubmit }: ChoiceProps & { ctx: TextContext }) {
  const spells = memorizedSpells(member);
  const [choice, setChoice] = useState(0);
  const selected = spells[choice] ?? spells[0];
  return (
    <div className={styles.choiceStack}>
      <div className={styles.optionRow} role="group" aria-label="Memorized spells">
        {spells.map((spell, index) => (
          <Button
            key={`${spell.spellId}-${spell.reversed}`}
            size="sm"
            variant={index === choice ? 'primary' : 'secondary'}
            aria-pressed={index === choice}
            icon="spell"
            onClick={() => setChoice(index)}
          >
            {capitalize(spellName(spell.spellId, ctx))}
            {spell.reversed ? ' (reversed)' : ''}
            {spell.copies > 1 ? ` ×${spell.copies}` : ''}
          </Button>
        ))}
      </div>
      {selected && (
        <SpellTargets
          key={`${selected.spellId}-${selected.reversed}`}
          member={member}
          encounter={encounter}
          spellId={selected.spellId}
          memorizedReversed={selected.reversed}
          ctx={ctx}
          pending={pending}
          onSubmit={onSubmit}
        />
      )}
    </div>
  );
}

function SpellTargets({
  member,
  encounter,
  spellId,
  memorizedReversed,
  ctx,
  pending,
  onSubmit,
}: ChoiceProps & { spellId: string; memorizedReversed: boolean; ctx: TextContext }) {
  const entry = useRulesEntry<SpellDetail>(`spells/${spellId}`);
  const creatures = useEncounterCreatures();
  const spell = entry.data;
  const modes = spell?.modes ?? [];
  const [modeKey, setModeKey] = useState<string | null>(null);
  const [reversed, setReversed] = useState(memorizedReversed);
  const [targets, setTargets] = useState<string[]>([]);
  const mode = modes.find((m) => m.key === modeKey) ?? modes[0];
  if (entry.loading) return <p className={styles.choiceHint}>Loading spell details…</p>;
  if (!spell || !mode)
    return <p className={styles.choiceHint}>Couldn't load this spell's details. Try again in a moment.</p>;

  const range = spellRangeFeet(spell.range_spec);
  const targeting = mode.targeting?.mode ?? null;
  const name = capitalize(spellName(spellId, ctx));
  const base: DeclarationBody = {
    action: 'cast',
    spell_id: spellId,
    spell_mode: mode.key,
    ...(reversed ? { reversed: true } : {}),
  };
  const labels = modes.map((m) => spellModeLabel(m.targeting?.mode));
  const modeOptions = modes.map((m, i) => ({
    value: m.key,
    label: labels.filter((l) => l === labels[i]).length > 1 ? `${labels[i]} ${i + 1}` : (labels[i] ?? m.key),
  }));
  const single = targeting === 'single';
  // A spell that harms or hinders goes at monsters, and any other at the party. The session still checks it.
  const effect = mode.effect?.kind ?? null;
  const atMonsters = effect === 'damage' || effect === 'condition';
  const atParty = !atMonsters || effect === null;
  const toggle = (id: string) =>
    setTargets((list) => (list.includes(id) ? list.filter((t) => t !== id) : single ? [id] : [...list, id]));

  const living = encounter.declarers;
  const groupsById = new Map(liveGroups(encounter).map((g) => [g.id, g]));
  // Every living monster the player view lists, by its ID.
  const monsters = creatures.flatMap((creature) => {
    const group = groupsById.get(creature.group_id);
    return group && creature.status === 'alive' ? [{ creature, group }] : [];
  });

  return (
    <div className={styles.choiceStack}>
      <p className={styles.choiceHint}>
        {spell.range}
        {spell.duration ? ` · ${spell.duration}` : ''} · {firstSentence(mode.prose || spell.intro)}
      </p>
      {(modes.length > 1 || spell.reversed_form) && (
        <div className={styles.optionRow}>
          {modes.length > 1 && (
            <SegmentedControl
              size="sm"
              aria-label={`How to cast ${name}`}
              value={mode.key}
              onValueChange={(value) => {
                setModeKey(value);
                setTargets([]);
              }}
              options={modeOptions}
            />
          )}
          {spell.reversed_form && !memorizedReversed && (
            <Checkbox
              label={`Cast the reverse (${spell.reversed_form.name})`}
              checked={reversed}
              onCheckedChange={setReversed}
            />
          )}
        </div>
      )}

      {(targeting === 'area' || targeting === 'hd_budget') && (
        <div className={styles.tiles}>
          {liveGroups(encounter).map((group) => {
            const distance = memberDistance(group, member.id);
            const reason =
              range !== null && distance > range
                ? `Out of range: ${formatFeet(distance)} away, but ${name} only reaches ${formatFeet(range)}.`
                : null;
            return (
              <Tile
                key={group.id}
                icon="spell"
                title={groupTitle(group)}
                meta={groupMeta(group, distance)}
                note={groupConditions(group) ? capitalize(groupConditions(group) ?? '') : undefined}
                disabledReason={reason}
                label={`Cast ${name} at ${theGroup(viewLabels(group))}`}
                pending={pending}
                onClick={() => void onSubmit({ ...base, target_group_id: group.id })}
              />
            );
          })}
        </div>
      )}

      {(targeting === 'self' || targeting === null || targeting === 'gaze') && (
        <div className={styles.choiceRow}>
          <Button
            size="sm"
            variant="secondary"
            icon="spell"
            loading={pending}
            onClick={() => void onSubmit(base)}
          >
            Cast {name}
          </Button>
        </div>
      )}

      {(targeting === 'single' || targeting === 'up_to_n') && (
        <>
          {atParty && (
            <div className={styles.chipGroup} role="group" aria-label="Party members">
              <span className={styles.chipLabel}>Party</span>
              {living.map((id) => {
                const gap = memberGap(encounter, member.id, id) ?? 0;
                const tooFar = range !== null && gap > range && id !== member.id;
                return (
                  <Button
                    key={id}
                    size="sm"
                    variant={targets.includes(id) ? 'primary' : 'ghost'}
                    aria-pressed={targets.includes(id)}
                    disabled={tooFar}
                    disabledReason={
                      tooFar && range !== null
                        ? `Out of range: ${memberName(id, ctx)} stands ${formatFeet(gap)} away, but ${name} only reaches ${formatFeet(range)}.`
                        : null
                    }
                    onClick={() => toggle(id)}
                  >
                    {id === member.id ? `${memberName(id, ctx)} (self)` : memberName(id, ctx)}
                  </Button>
                );
              })}
            </div>
          )}
          {atMonsters && monsters.length > 0 && (
            <div className={styles.chipGroup} role="group" aria-label="Monsters">
              <span className={styles.chipLabel}>Monsters</span>
              {monsters.map(({ creature, group }) => {
                const distance = memberDistance(group, member.id);
                const tooFar = range !== null && distance > range;
                const chosen = targets.includes(creature.id);
                return (
                  <Button
                    key={creature.id}
                    size="sm"
                    variant={chosen ? 'primary' : 'ghost'}
                    aria-pressed={chosen}
                    disabled={tooFar}
                    disabledReason={
                      tooFar && range !== null
                        ? `Out of range: ${formatFeet(distance)} away, but ${name} only reaches ${formatFeet(range)}.`
                        : null
                    }
                    onClick={() => toggle(creature.id)}
                  >
                    {creature.name}
                  </Button>
                );
              })}
            </div>
          )}
          <div className={styles.choiceRow}>
            <Button
              size="sm"
              variant="secondary"
              icon="spell"
              loading={pending}
              disabled={targets.length === 0}
              disabledReason="Choose a target first."
              onClick={() => void onSubmit({ ...base, targets })}
            >
              Cast {name}
              {targets.length > 0
                ? ` at ${targets.length === 1 ? targetName(targets[0] ?? '', ctx) : `${targets.length} targets`}`
                : ''}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function targetName(id: string, ctx: TextContext): string {
  return id.startsWith('character-') ? memberName(id, ctx) : monsterName(id, ctx);
}

function firstSentence(text: string): string {
  const line = text.split('\n')[0] ?? '';
  const match = /^(.*?[.!?])(\s|$)/.exec(line);
  return (match?.[1] ?? line).trim();
}

// Move ---------------------------------------------------------------------------------------------------------

function MoveChoices({
  member,
  encounter,
  ctx,
  current,
  pending,
  onSubmit,
}: ChoiceProps & { ctx: TextContext; current: DeclarationBody | null }) {
  const moving = current?.action === 'move' ? current.move : null;
  const [replacement, setReplacement] = useState('none');
  const immobile = encounter.immobile.includes(member.id);
  const stuck = immobile ? `${member.name} can't move this round.` : null;
  const others = encounter.declarers.filter((id) => id !== member.id);
  const away = (move: 'fighting_withdrawal' | 'retreat'): DeclarationBody => ({
    action: 'move',
    move,
    ...(replacement !== 'none' ? { replacement_id: replacement } : {}),
  });
  const rate = member.encounter_rate_feet;
  return (
    <div className={styles.choiceStack}>
      <div className={styles.tiles}>
        {liveGroups(encounter).map((group) => {
          const distance = memberDistance(group, member.id);
          return (
            <Tile
              key={group.id}
              icon="footprints"
              title={`Close in on ${theGroup(viewLabels(group))}`}
              meta={formatFeet(distance, 'short')}
              note={
                distance <= 5
                  ? 'Already within 5 feet.'
                  : `Moves up to ${formatFeet(Math.min(rate, Math.max(0, distance - 5)))} without attacking.`
              }
              disabledReason={stuck}
              label={`Close in on ${theGroup(viewLabels(group))}`}
              selected={moving === 'close' && current?.target_group_id === group.id}
              pending={pending}
              onClick={() => void onSubmit({ action: 'move', move: 'close', target_group_id: group.id })}
            />
          );
        })}
        <Tile
          icon="shield"
          title="Fighting withdrawal"
          meta={formatFeet(Math.floor(rate / 2), 'short')}
          note="Back away facing the monsters at half speed without attacking."
          disabledReason={stuck}
          label="Fighting withdrawal"
          selected={moving === 'fighting_withdrawal'}
          pending={pending}
          onClick={() => void onSubmit(away('fighting_withdrawal'))}
        />
        <Tile
          icon="footprints"
          title="Retreat"
          meta={formatFeet(rate, 'short')}
          note="Turn and run at full speed. Attackers gain +2 to hit you this round."
          disabledReason={stuck}
          label="Retreat"
          selected={moving === 'retreat'}
          pending={pending}
          onClick={() => void onSubmit(away('retreat'))}
        />
      </div>
      {others.length > 0 && (
        <div className={styles.optionRow}>
          <Select
            size="sm"
            className={styles.compactSelect}
            aria-label="Trade places with"
            value={replacement}
            onValueChange={setReplacement}
            options={[
              { value: 'none', label: 'Withdraw without trading places' },
              ...others.map((id) => ({ value: id, label: `Trade places with ${memberName(id, ctx)}` })),
            ]}
          />
        </div>
      )}
      <p className={styles.choiceHint}>
        When everyone declares the same withdrawal or retreat, the party moves together. If the whole party
        retreats, the battle ends, but monsters that can follow give chase.
      </p>
    </div>
  );
}

// Items --------------------------------------------------------------------------------------------------------

function ItemChoices({
  member,
  encounter,
  items,
  ctx,
  pending,
  onSubmit,
}: ChoiceProps & { items: CarriedItem[]; ctx: TextContext }) {
  const reach = membersInReach(encounter, member.id);
  const [drinker, setDrinker] = useState<Record<string, string>>({});
  return (
    <div className={styles.itemList}>
      {items.map((item) => {
        const label = capitalize(item.name);
        const quantity = item.quantity > 1 ? ` ×${item.quantity}` : '';
        if (item.kind === 'potion') {
          const who = drinker[item.id] ?? member.id;
          return (
            <div key={item.id} className={styles.itemRow}>
              <span className={styles.itemName}>
                <Icon name="potion" size={14} /> {label}
                {quantity}
              </span>
              <Select
                size="sm"
                aria-label={`Who drinks ${item.name}`}
                value={who}
                onValueChange={(value) => setDrinker((d) => ({ ...d, [item.id]: value }))}
                options={[
                  { value: member.id, label: `${member.name} drinks it` },
                  ...encounter.declarers
                    .filter((id) => id !== member.id)
                    .map((id) => {
                      const gap = memberGap(encounter, member.id, id);
                      const near = reach.includes(id);
                      return {
                        value: id,
                        label: near
                          ? `Give it to ${memberName(id, ctx)}`
                          : `Give it to ${memberName(id, ctx)} (${gap === null ? 'out of reach' : `${formatFeet(gap)} away`})`,
                        disabled: !near,
                      };
                    }),
                ]}
              />
              <Button
                size="sm"
                variant="secondary"
                loading={pending}
                onClick={() =>
                  void onSubmit({
                    action: 'use_item',
                    item_id: item.id,
                    ...(who !== member.id ? { targets: [who] } : {}),
                  })
                }
              >
                Drink
              </Button>
            </div>
          );
        }
        if (item.kind === 'scroll') {
          return (
            <div key={item.id} className={styles.itemRow}>
              <span className={styles.itemName}>
                <Icon name="scroll" size={14} /> {label}
                {quantity}
              </span>
              <span className={styles.itemNote}>Casts the first spell remaining on the scroll.</span>
              <Button
                size="sm"
                variant="secondary"
                loading={pending}
                onClick={() => void onSubmit({ action: 'use_item', item_id: item.id })}
              >
                Read
              </Button>
            </div>
          );
        }
        const thrown = item.kind === 'splash';
        return (
          <div key={item.id} className={styles.itemBlock}>
            <span className={styles.itemName}>
              <Icon name={thrown ? 'target' : 'wand'} size={14} /> {label}
              {quantity}
            </span>
            <div className={styles.tiles}>
              {liveGroups(encounter).map((group) => {
                const distance = memberDistance(group, member.id);
                return (
                  <Tile
                    key={group.id}
                    title={groupTitle(group)}
                    meta={groupMeta(group, distance)}
                    note={
                      thrown
                        ? `Throws it ${formatFeet(distance)}.`
                        : `Aims it at ${theGroup(viewLabels(group))}.`
                    }
                    label={`${thrown ? 'Throw' : 'Use'} ${item.name} at ${theGroup(viewLabels(group))}`}
                    pending={pending}
                    onClick={() =>
                      void onSubmit({ action: 'use_item', item_id: item.id, target_group_id: group.id })
                    }
                  />
                );
              })}
              {!thrown && (
                <Tile
                  title="No target"
                  note="Use an effect that targets no monster group."
                  label={`Use ${item.name} without a target`}
                  pending={pending}
                  onClick={() => void onSubmit({ action: 'use_item', item_id: item.id })}
                />
              )}
              {item.kind === 'staff' &&
                encounter.declarers
                  .filter((id) => id !== member.id)
                  .map((id) => {
                    const gap = memberGap(encounter, member.id, id);
                    const near = reach.includes(id);
                    return (
                      <Tile
                        key={id}
                        title={`Touch ${memberName(id, ctx)}`}
                        note="Touch an ally within 5 feet."
                        disabledReason={
                          near
                            ? null
                            : `Out of reach: ${memberName(id, ctx)} stands ${gap === null ? 'too far' : formatFeet(gap)} away.`
                        }
                        label={`Use ${item.name} on ${memberName(id, ctx)}`}
                        pending={pending}
                        onClick={() => void onSubmit({ action: 'use_item', item_id: item.id, targets: [id] })}
                      />
                    );
                  })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function GiveChoices({
  member,
  encounter,
  gear,
  ctx,
  pending,
  onSubmit,
}: ChoiceProps & { gear: MemberGear; ctx: TextContext }) {
  const [itemId, setItemId] = useState(gear.items[0]?.id ?? '');
  const reach = membersInReach(encounter, member.id);
  const others = encounter.declarers.filter((id) => id !== member.id);
  return (
    <div className={styles.choiceStack}>
      <div className={styles.optionRow}>
        <Select
          size="sm"
          className={styles.compactSelect}
          aria-label="Item to give"
          value={itemId}
          onValueChange={setItemId}
          options={gear.items.map((item) => ({
            value: item.id,
            label: `${capitalize(item.name)}${item.quantity > 1 ? ` (one of ${item.quantity})` : ''}`,
          }))}
        />
      </div>
      <div className={styles.tiles}>
        {others.map((id) => {
          const gap = memberGap(encounter, member.id, id);
          const near = reach.includes(id);
          return (
            <Tile
              key={id}
              icon="hand"
              title={memberName(id, ctx)}
              note={near ? 'Within reach.' : undefined}
              disabledReason={
                near
                  ? null
                  : `Out of reach: ${memberName(id, ctx)} stands ${gap === null ? 'too far' : formatFeet(gap)} away.`
              }
              label={`Give to ${memberName(id, ctx)}`}
              pending={pending}
              onClick={() => void onSubmit({ action: 'give_item', item_id: itemId, targets: [id] })}
            />
          );
        })}
      </div>
    </div>
  );
}

function TurnChoice({ member, encounter, pending, onSubmit }: ChoiceProps) {
  const undead = liveGroups(encounter).filter((g) => g.categories.includes('undead'));
  const reason = undead.length === 0 ? 'None of the monsters here are undead.' : null;
  return (
    <div className={styles.tiles}>
      <Tile
        icon="class-cleric"
        title="Present holy symbol"
        note={`Affects ${joinList(undead.map((g) => theGroup(viewLabels(g))))}. Taking damage doesn't disrupt turning.`}
        disabledReason={reason}
        label={`${member.name} turns undead`}
        pending={pending}
        onClick={() => void onSubmit({ action: 'turn_undead' })}
      />
    </div>
  );
}
