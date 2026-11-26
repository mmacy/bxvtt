import { capitalizeFirst, conditionLabel, formatFeet, isProperLabel, joinList } from '@bxvtt/shared/text';
import { useMemo, type CSSProperties } from 'react';
import { tokenClass, useTableId } from '@/app';
import { cx, Icon, TokenPortrait } from '@/ui';
import { useCombatMemory } from './memory';
import { countBadge, countedGroup, groupHeading, theGroup, type GroupLabels } from './names';
import type { Pop, TrackGroup, TrackMember, TrackState } from './playback';
import styles from './track.module.css';

export interface RangeTrackProps {
  track: TrackState;
  /** The color of each member's seat owner, by member ID. */
  colors: Record<string, string>;
  /** Tokens the playback is about now. */
  focus?: readonly string[];
  /** Numbers and words to float over tokens now, keyed so a new beat restarts them. */
  pops?: readonly Pop[];
  popKey?: string | number;
  /** The member whose composer is open. */
  selected?: string | null;
  /** Whether to animate movement. */
  animate: boolean;
  /** Shorter, for the collapsed board and the encounter panel. */
  compact?: boolean;
  /**
   * Where each member would stand once the round's declared moves are made, by member ID, from bxapi's preview.
   * The track marks each place that differs from where the member stands now.
   */
  planned?: Readonly<Record<string, number>> | null;
}

const TOKEN = 32;
const STACK = 3;
/** Vertical room for one stacked token with its hit point bar. */
const ROW = 42;
/** Vertical room for one group's token and labels, for groups that stand at the same distance. */
/** A group's token, its name, its distance, and a condition line, with a small gap below. */
const GROUP_HEIGHT = 86;
const GROUP_HEIGHT_COMPACT = 76;

/** A tick spacing that gives four to eight ticks across the span. */
function tickStep(span: number): number {
  for (const step of [5, 10, 20, 30, 50, 100, 200]) if (span / step <= 8) return step;
  return 500;
}

function trackLabels(group: TrackGroup): GroupLabels {
  return { label: group.label, plural: group.labelPlural, count: group.count };
}

/** The group's label as the track prints it under the token, in lower case unless it is a name. */
function lowerHeading(group: GroupLabels): string {
  return group.count === 1 ? group.label : (group.plural ?? group.label);
}

function memberLabel(
  member: TrackMember,
  meleeWith: readonly string[] = [],
  planned: number | null = null,
): string {
  const parts = [member.name, `${member.hp} of ${member.maxHp} hit points`];
  if (meleeWith.length > 0) parts.push(`in melee with ${joinList(meleeWith)}`);
  if (member.down) parts.push(member.conditions.includes('dead') ? 'dead' : 'unconscious');
  else if (member.advance !== null && member.advance !== 0)
    parts.push(
      member.advance > 0 ? `${formatFeet(member.advance)} forward` : `${formatFeet(-member.advance)} back`,
    );
  for (const condition of member.conditions)
    if (condition !== 'dead') parts.push(conditionLabel(condition).toLowerCase());
  if (planned !== null)
    parts.push(
      planned === 0
        ? 'will move to the party line'
        : planned > 0
          ? `will move to ${formatFeet(planned)} past the party line`
          : `will fall back to ${formatFeet(-planned)} behind the party line`,
    );
  return parts.join(', ');
}

function groupLabel(group: TrackGroup, nearest: number | null): string {
  const parts = [countedGroup(trackLabels(group))];
  if (group.fled) parts.push('escaped');
  else if (nearest !== null) parts.push(`${formatFeet(nearest)} from the nearest party member`);
  if (group.fleeing && !group.fled) parts.push('fleeing');
  for (const [condition, count] of Object.entries(group.conditions))
    parts.push(`${count} ${conditionLabel(condition).toLowerCase()}`);
  return parts.join(', ');
}

/**
 * The battlefield as a range track: the party on the left at each member's advance, the monster groups to the
 * right at their distance, members in a group's front rank joined to it, and the fallen and the fled set aside.
 */
export function RangeTrack({
  track,
  colors,
  focus = [],
  pops = [],
  popKey,
  selected = null,
  animate,
  compact = false,
  planned = null,
}: RangeTrackProps) {
  // How many each group had at its largest, so a group that was all slain is named in the right number.
  const tableId = useTableId();
  const snapshots = useCombatMemory((s) => s.snapshots);
  const peaks = useMemo(() => {
    const map: Record<string, number> = {};
    for (const snapshot of snapshots) {
      if (snapshot.tableId !== tableId) continue;
      for (const g of snapshot.encounter?.groups ?? []) map[g.id] = Math.max(map[g.id] ?? 0, g.count);
    }
    return map;
  }, [snapshots, tableId]);
  const members = track.memberOrder
    .map((id) => track.members[id])
    .filter((m): m is TrackMember => m !== undefined);
  const standing = members.filter((m) => !m.down && m.advance !== null);
  const fallen = members.filter((m) => m.down || m.advance === null);
  const groups = track.groupOrder
    .map((id) => track.groups[id])
    .filter((g): g is TrackGroup => g !== undefined);
  const present = groups.filter((g) => !g.fled && g.count > 0);
  const gone = groups.filter((g) => g.fled || g.count === 0);

  // A planned place that differs from where the member stands now, or `null`.
  const plannedFor = (member: TrackMember): number | null => {
    const place = planned?.[member.id];
    return place === undefined || place === (member.advance ?? 0) ? null : place;
  };
  const advances = standing.map((m) => m.advance ?? 0);
  const plannedPlaces = standing.flatMap((m) => {
    const place = plannedFor(m);
    return place === null ? [] : [place];
  });
  const front = advances.length > 0 ? Math.max(...advances) : 0;
  const low = Math.min(0, ...advances, ...plannedPlaces);
  const high = Math.max(front + 10, ...plannedPlaces, ...present.map((g) => g.distance), 30);
  const span = Math.max(high - low, 20);
  const step = tickStep(span);
  const min = Math.floor(low / step) * step;
  const max = Math.ceil(high / step) * step + (high % step === 0 ? step / 2 : 0);
  const rows = compact ? 2 : STACK;
  // Stack members who stand at the same advance, up to three high, in columns that spread toward the back.
  const stacks = new Map<number, TrackMember[]>();
  for (const member of standing) {
    const key = member.advance ?? 0;
    stacks.set(key, [...(stacks.get(key) ?? []), member]);
  }
  const columns = Math.max(1, ...[...stacks.values()].map((stack) => Math.ceil(stack.length / rows)));
  // Margins in pixels that leave room for the stacked party, the group labels, and the set-aside trays.
  const leftPx = 8 + columns * (TOKEN + 4) + (fallen.length > 0 ? 64 : 0);
  const stacked = Math.max(
    1,
    ...present.map((g) => present.filter((other) => other.distance === g.distance).length),
  );
  const rightPx = 104 + (gone.length > 0 ? 64 : 0);
  // Groups at the same distance stack one above another at that distance, so the scale stays true. The lane
  // grows to fit the stack.
  const groupHeight = compact ? GROUP_HEIGHT_COMPACT : GROUP_HEIGHT;
  const extra = (stacked - 1) * groupHeight;
  const laneStyle: CSSProperties | undefined =
    extra > 0
      ? ({
          height: `calc(${compact ? 118 : 156}px + ${extra}px)`,
          '--center': `calc(${compact ? 58 : 86}px + ${extra / 2}px)`,
        } as CSSProperties)
      : undefined;
  const fraction = (feet: number) => (feet - min) / (max - min);
  const at = (feet: number, offsetPx = 0) =>
    `calc(${leftPx + offsetPx}px + (100% - ${leftPx + rightPx}px) * ${fraction(feet)})`;
  const between = (a: number, b: number) =>
    `calc((100% - ${leftPx + rightPx}px) * ${fraction(b) - fraction(a)})`;
  const nearestId = present.reduce<TrackGroup | null>(
    (best, g) => (best === null || g.distance < best.distance ? g : best),
    null,
  )?.id;
  const engaged = new Set(present.flatMap((g) => g.frontRank));
  const meleeOf = (id: string) =>
    present.filter((g) => g.frontRank.includes(id)).map((g) => theGroup(trackLabels(g)));
  const ticks: number[] = [];
  for (let feet = min; feet <= max; feet += step) ticks.push(feet);
  // Groups at the same distance stand side by side, so their tokens and labels don't overlap.
  const groupOffset = (group: TrackGroup): CSSProperties => {
    const same = present.filter((g) => g.distance === group.distance);
    if (same.length < 2) return {};
    const index = same.indexOf(group);
    return { transform: `translateY(${(index - (same.length - 1) / 2) * groupHeight}px)` };
  };
  const popsFor = (id: string) => pops.filter((p) => p.tokenId === id);
  const focusSet = new Set(focus);

  const memberLeft = (member: TrackMember, index: number): string =>
    at(member.advance ?? 0, -(TOKEN + Math.floor(index / rows) * (TOKEN + 4)));
  const memberStyle = (member: TrackMember, index: number, count: number): { left: string; top: string } => {
    const column = Math.floor(index / rows);
    const row = index % rows;
    const inColumn = Math.min(rows, count - column * rows);
    return {
      left: memberLeft(member, index),
      top: `calc(var(--center) + ${(row - (inColumn - 1) / 2) * ROW - TOKEN / 2}px)`,
    };
  };

  return (
    <figure
      className={cx(styles.track, compact && styles.compact, !animate && styles.still)}
      aria-label="Battlefield: party on the left, monsters on the right"
    >
      <div className={styles.lane} style={laneStyle}>
        <div className={styles.line} style={{ left: at(0) }} aria-hidden="true"></div>
        {ticks.map((feet) => (
          <span key={feet} className={styles.tick} style={{ left: at(feet) }} aria-hidden="true">
            {feet === 0 ? '0' : formatFeet(feet, 'short')}
          </span>
        ))}

        {present.map((group) => {
          const nearest = standing.length > 0 ? Math.max(0, group.distance - front) : null;
          const lit = focusSet.has(group.id);
          return (
            <div key={group.id}>
              {nearest !== null && nearest > 5 && group.id === nearestId && (
                <div
                  className={styles.gap}
                  style={{ left: at(front), width: between(front, group.distance) }}
                  aria-hidden="true"
                />
              )}
              <div
                className={cx(styles.group, lit && styles.focus, group.fleeing && styles.fleeing)}
                style={{ left: at(group.distance), ...groupOffset(group) }}
              >
                <span className="visually-hidden">{groupLabel(group, nearest)}</span>
                <span className={styles.groupToken} aria-hidden="true">
                  <TokenPortrait
                    name={groupHeading(trackLabels(group))}
                    kind="monster"
                    size={TOKEN}
                    decorative
                  />
                  {countBadge(trackLabels(group)) && (
                    <span className={styles.count}>{countBadge(trackLabels(group))}</span>
                  )}
                </span>
                <span className={styles.groupName} aria-hidden="true">
                  {isProperLabel(group.label) ? group.label : lowerHeading(trackLabels(group))}
                  {group.fleeing && <Icon name="arrow-right" size={12} />}
                </span>
                {nearest !== null && (
                  <span className={styles.groupDistance} aria-hidden="true">
                    {nearest <= 5 ? 'In melee' : `${formatFeet(nearest, 'short')} away`}
                  </span>
                )}
                {Object.keys(group.conditions).length > 0 && (
                  <span className={styles.groupConditions} aria-hidden="true">
                    {Object.entries(group.conditions)
                      .map(([condition, count]) => `${count} ${conditionLabel(condition).toLowerCase()}`)
                      .join(', ')}
                  </span>
                )}
                <Pops pops={popsFor(group.id)} popKey={popKey} />
              </div>
            </div>
          );
        })}

        {[...stacks.entries()].flatMap(([, stack]) =>
          stack.flatMap((member, index) => {
            const place = plannedFor(member);
            if (place === null) return [];
            const style = memberStyle(member, index, stack.length);
            const target = at(place, -TOKEN);
            const color = colors[member.id];
            return [
              <span
                key={`${member.id}-planned`}
                className={styles.planned}
                style={{ ...style, left: target, borderColor: color }}
                aria-hidden="true"
              >
                <TokenPortrait
                  name={member.name}
                  characterClass={tokenClass(member.classId)}
                  color={color}
                  size={TOKEN}
                  decorative
                />
              </span>,
            ];
          }),
        )}

        {[...stacks.entries()].flatMap(([, stack]) =>
          stack.map((member, index) => (
            <div
              key={member.id}
              className={cx(
                styles.member,
                focusSet.has(member.id) && styles.focus,
                selected === member.id && styles.selected,
                engaged.has(member.id) && styles.engaged,
              )}
              style={memberStyle(member, index, stack.length)}
              title={memberLabel(member, meleeOf(member.id), plannedFor(member))}
            >
              <span className="visually-hidden">
                {memberLabel(member, meleeOf(member.id), plannedFor(member))}
              </span>
              <TokenPortrait
                name={member.name}
                characterClass={tokenClass(member.classId)}
                color={colors[member.id]}
                size={TOKEN}
                selected={selected === member.id}
                decorative
              />
              <span className={styles.memberHp} aria-hidden="true">
                <span
                  style={{
                    width: `${Math.max(0, Math.min(100, (member.hp / Math.max(1, member.maxHp)) * 100))}%`,
                  }}
                />
              </span>
              <Pops pops={popsFor(member.id)} popKey={popKey} />
            </div>
          )),
        )}

        {fallen.length > 0 && (
          <div className={styles.fallen}>
            {fallen.map((member) => (
              <div key={member.id} className={styles.fallenToken} title={memberLabel(member)}>
                <span className="visually-hidden">{memberLabel(member)}</span>
                <TokenPortrait
                  name={member.name}
                  characterClass={tokenClass(member.classId)}
                  color={colors[member.id]}
                  size={24}
                  state="dead"
                  decorative
                />
                <Pops pops={popsFor(member.id)} popKey={popKey} />
              </div>
            ))}
          </div>
        )}
        {gone.length > 0 && (
          <div className={styles.gone}>
            {gone.map((group) => (
              <div key={group.id} className={styles.goneToken} title={groupLabel(group, null)}>
                <span className="visually-hidden">
                  {group.count === 0
                    ? `${capitalizeFirst(theGroup({ ...trackLabels(group), count: peaks[group.id] ?? 2 }))}, slain`
                    : `${capitalizeFirst(theGroup(trackLabels(group)))}, escaped`}
                </span>
                <TokenPortrait
                  name={groupHeading(trackLabels(group))}
                  kind="monster"
                  size={24}
                  state={group.count === 0 ? 'dead' : 'normal'}
                  decorative
                />
                <Pops pops={popsFor(group.id)} popKey={popKey} />
              </div>
            ))}
          </div>
        )}
      </div>
      {/* Labels have a row of their own under the lane, so no token or number covers them. */}
      <div className={styles.labels} aria-hidden="true">
        {fallen.length > 0 && <span className={styles.labelStart}>Fallen</span>}
        <span className={styles.lineLabel} style={{ left: at(0) }}>
          Party line
        </span>
        {gone.length > 0 && (
          <span className={styles.labelEnd}>
            {gone.every((g) => g.count === 0) ? 'Slain' : gone.every((g) => g.fled) ? 'Escaped' : 'Gone'}
          </span>
        )}
      </div>
    </figure>
  );
}

function Pops({ pops, popKey }: { pops: readonly Pop[]; popKey?: string | number }) {
  if (pops.length === 0) return null;
  return (
    <span className={styles.pops} aria-hidden="true">
      {pops.slice(0, 3).map((pop, i) => (
        <span
          key={`${popKey ?? ''}-${i}`}
          className={cx(styles.pop, styles[`pop-${pop.kind}`])}
          style={{ animationDelay: `calc(var(--duration-instant) * ${i})` }}
        >
          {pop.text}
        </span>
      ))}
    </span>
  );
}
