/** Small pieces that several parts of the town share: seat owners, member choosers, and the purse line. */
import type { MemberView } from '@bxvtt/shared/bxapi';
import { classLabel } from '@bxvtt/shared/text';
import type { ReactNode } from 'react';
import { tokenClass, useMembers, useSeats } from '@/app';
import { Avatar, CoinPurse, Icon, TokenPortrait, cx, type IconName, type TokenSize } from '@/ui';
import { readPurse } from './inventory';
import { memberStatus } from './members';
import styles from './parts.module.css';

/** The player at a member's seat, with whether they are online. */
export function SeatOwner({ memberId, className }: { memberId: string; className?: string }) {
  const seats = useSeats();
  const members = useMembers();
  const seat = seats.find((candidate) => candidate.member_id === memberId);
  const owner = seat?.user_id ? members.find((member) => member.user_id === seat.user_id) : undefined;
  if (owner === undefined) {
    return <span className={cx(styles.owner, className)}>The referee plays this character</span>;
  }
  return (
    <span className={cx(styles.owner, className)}>
      <Avatar
        name={owner.name}
        color={owner.color}
        size="xs"
        presence={owner.online ? 'online' : 'offline'}
        decorative
      />
      <span>
        {owner.name}
        <span className="visually-hidden">{owner.online ? ' (online)' : ' (offline)'}</span>
      </span>
    </span>
  );
}

/** A member's token, from their class, ringed in the color of the player who plays them. */
export function MemberToken({ member, size = 40 }: { member: MemberView; size?: TokenSize }) {
  const status = memberStatus(member);
  const seats = useSeats();
  const members = useMembers();
  const ownerId = seats.find((seat) => seat.member_id === member.id)?.user_id;
  const color = ownerId ? members.find((candidate) => candidate.user_id === ownerId)?.color : undefined;
  return (
    <TokenPortrait
      name={member.name}
      characterClass={tokenClass(member.class_id)}
      color={color}
      size={size}
      state={status.dead ? 'dead' : 'normal'}
      decorative
    />
  );
}

/** The class and level line under a name: "Fighter 1". */
export function classLine(member: MemberView): string {
  return `${classLabel(member.class_id)} ${member.level}`;
}

/** A member's purse as coins. */
export function PurseOf({ member, layout = 'row' }: { member: MemberView; layout?: 'row' | 'stack' }) {
  return <CoinPurse coins={readPurse(member)} layout={layout} />;
}

export interface MemberChooserProps {
  members: readonly MemberView[];
  value: string | null;
  onChange: (memberId: string) => void;
  /** The group's accessible name, such as "Shopping for". */
  label: string;
  /** Extra content under each member's name, such as a purse. */
  meta?: (member: MemberView) => ReactNode;
  /** A badge or count on the trailing edge of each button. */
  badge?: (member: MemberView) => ReactNode;
  /**
   * The words after the name in the button's accessible name, such as "7 of 10 hp, hurt", so it reads "Brenna,
   * 7 of 10 hp, hurt". Include the text of `meta` and `badge`.
   */
  description?: (member: MemberView) => string;
  className?: string;
}

/**
 * A row of buttons that picks one member. Each button shows the member's token and name, and `aria-pressed`
 * marks the chosen one.
 */
export function MemberChooser({
  members,
  value,
  onChange,
  label,
  meta,
  badge,
  description,
  className,
}: MemberChooserProps) {
  return (
    <div role="group" aria-label={label} className={cx(styles.chooser, className)}>
      {members.map((member) => {
        const status = memberStatus(member);
        return (
          <button
            key={member.id}
            type="button"
            className={cx(styles.choice, value === member.id && styles.chosen)}
            aria-pressed={value === member.id}
            aria-label={`${member.name}, ${description ? description(member) : status.dead ? 'dead' : classLine(member)}`}
            onClick={() => onChange(member.id)}
          >
            <MemberToken member={member} size={32} />
            <span className={styles.choiceText}>
              <span className={styles.choiceName}>{member.name}</span>{' '}
              <span className={styles.choiceMeta}>
                {meta ? meta(member) : status.dead ? 'Dead' : classLine(member)}
              </span>
            </span>{' '}
            {badge?.(member)}
          </button>
        );
      })}
    </div>
  );
}

/** The heading of a part of town: an emblem, the place's name in the display face, and one line about it. */
export function PlaceHeader({
  icon,
  title,
  lead,
  dense = false,
}: {
  icon: IconName;
  title: string;
  lead: string;
  /** A smaller heading without the lead line, for pages that need the room. */
  dense?: boolean;
}) {
  return (
    <header className={cx(styles.place, dense && styles.dense)}>
      <span className={styles.emblem}>
        <Icon name={icon} size={dense ? 20 : 24} />
      </span>
      <div>
        <h2 className={styles.placeTitle}>{title}</h2>
        {dense ? <span className="visually-hidden">{lead}</span> : <p className={styles.placeLead}>{lead}</p>}
      </div>
    </header>
  );
}
