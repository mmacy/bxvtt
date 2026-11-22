import type { CSSProperties } from 'react';
import { colorIdForName, initialsForName } from '../lib/identity';
import { cx } from '../lib/cx';
import { isPlayerColorId, playerColorHex } from '../tokens';
import { Icon } from '../icons/Icon';
import styles from './Avatar.module.css';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg';
export type Presence = 'online' | 'away' | 'offline';

export interface AvatarProps {
  /** The user's display name. Supplies the initials and the accessible name. */
  name: string;
  /** A player color id, such as "azurite", or any CSS color. Defaults to a color derived from the name. */
  color?: string;
  size?: AvatarSize;
  presence?: Presence;
  /** Marks the user as a referee with a small crown. */
  referee?: boolean;
  /** Hides the avatar from assistive technology when a visible name sits next to it. */
  decorative?: boolean;
  className?: string;
}

/** Resolves a player color id or CSS color to a CSS color value. */
export function resolveColor(color: string | undefined, name: string): string {
  if (!color) return playerColorHex(colorIdForName(name));
  return isPlayerColorId(color) ? playerColorHex(color) : color;
}

const presenceLabel: Record<Presence, string> = { online: 'online', away: 'away', offline: 'offline' };

/** A user at the table: initials on their chosen color. For characters and monsters, use TokenPortrait. */
export function Avatar({
  name,
  color,
  size = 'md',
  presence,
  referee = false,
  decorative = false,
  className,
}: AvatarProps) {
  const fill = resolveColor(color, name);
  const label = [name, referee ? 'referee' : null, presence ? presenceLabel[presence] : null]
    .filter(Boolean)
    .join(', ');
  return (
    <span
      className={cx(styles.avatar, styles[size], presence === 'offline' && styles.offline, className)}
      style={{ '--avatar-color': fill } as CSSProperties}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : label}
      aria-hidden={decorative || undefined}
      title={decorative ? undefined : label}
    >
      <span className={styles.initials} aria-hidden="true">
        {initialsForName(name)}
      </span>
      {presence && <span className={cx(styles.presence, styles[presence])} aria-hidden="true" />}
      {referee && (
        <span className={styles.referee} aria-hidden="true">
          <Icon name="referee" size={10} strokeWidth={2} />
        </span>
      )}
    </span>
  );
}

export interface AvatarStackProps {
  users: Array<Pick<AvatarProps, 'name' | 'color' | 'presence' | 'referee'> & { id: string }>;
  /** Most avatars to show before "+N". Defaults to 5. */
  max?: number;
  size?: AvatarSize;
  className?: string;
}

/** Overlapping avatars for the people at the table, with a count for the rest. */
export function AvatarStack({ users, max = 5, size = 'sm', className }: AvatarStackProps) {
  const shown = users.slice(0, max);
  const rest = users.length - shown.length;
  return (
    <span className={cx(styles.stack, className)} role="group" aria-label={`${users.length} at the table`}>
      {shown.map((user) => (
        <Avatar key={user.id} {...user} size={size} className={styles.stacked} />
      ))}
      {rest > 0 && (
        <span
          className={cx(styles.avatar, styles[size], styles.more, styles.stacked)}
          aria-label={`${rest} more`}
          role="img"
        >
          <span className={styles.initials}>+{rest}</span>
        </span>
      )}
    </span>
  );
}
