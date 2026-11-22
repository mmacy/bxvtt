import type { CSSProperties, ReactNode } from 'react';
import { classIconNames, Icon, type CharacterClassKey, type IconName } from '../icons/Icon';
import { cx } from '../lib/cx';
import { colorIdForName, hashString, initialsForName } from '../lib/identity';
import { isPlayerColorId, playerColorHex } from '../tokens';
import styles from './TokenPortrait.module.css';

export type TokenSize = 24 | 32 | 40 | 48 | 64 | 96;
export type TokenState = 'normal' | 'unconscious' | 'dead';

export interface TokenPortraitProps {
  /** Character or monster name. Supplies initials, the field pattern, and the default color. */
  name: string;
  /** "character" tokens are round; "monster" tokens are square, so the two read apart on the map. */
  kind?: 'character' | 'monster';
  /** B/X class. Draws the class icon in the center. */
  characterClass?: CharacterClassKey;
  /** Draws a specific icon in the center instead of the class icon or initials. */
  icon?: IconName;
  /** Player color id, such as "azurite", or a CSS color. Defaults to a color derived from the name. */
  color?: string;
  size?: TokenSize;
  state?: TokenState;
  selected?: boolean;
  /** Shows initials under the icon at 64 px and larger. Defaults to true. */
  showInitials?: boolean;
  /** Hides the portrait from assistive technology when a visible name sits next to it. */
  decorative?: boolean;
  className?: string;
}

/** The six field divisions a portrait can use, picked from the name. */
export const tokenPatterns = ['plain', 'pale', 'bend', 'fess', 'quarterly', 'chevron'] as const;
export type TokenPattern = (typeof tokenPatterns)[number];

export interface TokenIdentity {
  color: string;
  initials: string;
  pattern: TokenPattern;
}

/**
 * The procedural parts of a portrait: color, initials, and field division. The same name and
 * color always produce the same result.
 */
export function tokenIdentity(name: string, color?: string): TokenIdentity {
  const resolved = color
    ? isPlayerColorId(color)
      ? playerColorHex(color)
      : color
    : playerColorHex(colorIdForName(name));
  const pattern =
    tokenPatterns[(hashString(`${name.trim().toLowerCase()}#field`) >>> 3) % tokenPatterns.length] ?? 'plain';
  return { color: resolved, initials: initialsForName(name), pattern };
}

function fieldPath(pattern: TokenPattern): string | null {
  switch (pattern) {
    case 'pale':
      return 'M50 0H100V100H50Z';
    case 'bend':
      return 'M0 0H100V100Z';
    case 'fess':
      return 'M0 50H100V100H0Z';
    case 'quarterly':
      return 'M50 0H100V50H50ZM0 50H50V100H0Z';
    case 'chevron':
      return 'M0 100L50 52L100 100V72L50 24L0 72Z';
    default:
      return null;
  }
}

const stateLabel: Record<TokenState, string | null> = {
  normal: null,
  unconscious: 'unconscious',
  dead: 'dead',
};

/**
 * A character or monster token: a colored ring, a heraldic field from the name, and the class
 * icon or initials in the center. Use it on the map, in the party list, and in battle.
 */
export function TokenPortrait({
  name,
  kind = 'character',
  characterClass,
  icon,
  color,
  size = 48,
  state = 'normal',
  selected = false,
  showInitials = true,
  decorative = false,
  className,
}: TokenPortraitProps) {
  const identity = tokenIdentity(name, color);
  const division = fieldPath(identity.pattern);
  const round = kind === 'character';
  const clipId = `token-clip-${round ? 'c' : 'm'}`;
  const centerIcon: IconName | undefined =
    state === 'dead' ? 'skull' : (icon ?? (characterClass ? classIconNames[characterClass] : undefined));
  const initialsBelow = showInitials && size >= 64 && centerIcon !== undefined;
  const iconBox = initialsBelow ? 42 : 50;
  const iconX = (100 - iconBox) / 2;
  const iconY = iconX - (initialsBelow ? 8 : 0);
  // Stroke widths in view box units, chosen so lines stay crisp from 24 to 96 px.
  const ringPx = size <= 32 ? 2 : size >= 64 ? 3.5 : 2.5;
  const iconPx = size <= 32 ? 1.35 : size >= 64 ? 2 : 1.6;
  const ringWidth = (ringPx * 100) / size;
  const iconStroke = (iconPx * 100) / size;

  const label = [
    name,
    characterClass?.replace('-', ' '),
    kind === 'monster' ? 'monster' : null,
    stateLabel[state],
  ]
    .filter(Boolean)
    .join(', ');

  const shape = round ? (
    <circle cx="50" cy="50" r="46" />
  ) : (
    <rect x="5" y="5" width="90" height="90" rx="16" />
  );

  let center: ReactNode;
  if (centerIcon) {
    // The icon renders as a nested <svg> sized in view box units.
    center = (
      <g transform={`translate(${iconX} ${iconY})`} className={styles.icon}>
        <Icon name={centerIcon} size={iconBox} strokeWidth={iconStroke} />
      </g>
    );
  } else {
    center = (
      <text
        x="50"
        y="51"
        textAnchor="middle"
        dominantBaseline="central"
        className={styles.initials}
        fontSize={identity.initials.length > 1 ? 38 : 46}
      >
        {identity.initials}
      </text>
    );
  }

  return (
    <span
      className={cx(
        styles.token,
        round ? styles.round : styles.square,
        styles[state],
        selected && styles.selected,
        className,
      )}
      style={{ width: size, height: size, '--token-color': identity.color } as CSSProperties}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : `${label}${selected ? ', selected' : ''}`}
      aria-hidden={decorative || undefined}
      data-pattern={identity.pattern}
    >
      <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true" focusable="false">
        <defs>
          <clipPath id={clipId}>{shape}</clipPath>
          <radialGradient id="token-vignette" cx="50%" cy="38%" r="62%">
            <stop offset="55%" stopColor="#000" stopOpacity="0" />
            <stop offset="100%" stopColor="#000" stopOpacity="0.45" />
          </radialGradient>
        </defs>
        <g clipPath={`url(#${clipId})`}>
          <rect width="100" height="100" className={styles.field} />
          <rect width="100" height="100" className={styles.tint} />
          {division && <path d={division} className={styles.division} />}
          <rect width="100" height="100" fill="url(#token-vignette)" />
        </g>
        {center}
        {initialsBelow && (
          <text x="50" y="78" textAnchor="middle" className={styles.initialsSmall}>
            {identity.initials}
          </text>
        )}
        <g className={styles.ring} strokeWidth={ringWidth}>
          {shape}
        </g>
      </svg>
      {state === 'unconscious' && (
        <span className={styles.badge} aria-hidden="true">
          <Icon name="moon" size={Math.max(8, Math.round(size * 0.22))} strokeWidth={2} />
        </span>
      )}
    </span>
  );
}
