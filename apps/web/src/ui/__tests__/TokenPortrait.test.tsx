import './cleanup';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TokenPortrait, tokenIdentity, tokenPatterns } from '../game/TokenPortrait';
import { colorIdForName, initialsForName } from '../lib/identity';
import { playerColorHex, playerColorIds } from '../tokens';

describe('initialsForName', () => {
  it.each([
    ['Wren Underbough', 'WU'],
    ['Goblin 3', 'G3'],
    ['Wren', 'W'],
    ['Brother Aldous of Hale', 'BH'],
    ['  ilsabet  ', 'I'],
    ['Durgin "Coalbeard"', 'DC'],
    ['Éowyn Ashdown', 'ÉA'],
    ['', '?'],
  ])('%s becomes %s', (name, initials) => {
    expect(initialsForName(name)).toBe(initials);
  });
});

describe('colorIdForName', () => {
  it('is stable and ignores case and surrounding space', () => {
    expect(colorIdForName('Wren')).toBe(colorIdForName('  wren '));
  });

  it('spreads a party across the palette', () => {
    const names = [
      'Kael',
      'Aldous',
      'Wren',
      'Ilsabet',
      'Durgin',
      'Sylvaine',
      'Nettle',
      'Goblin 1',
      'Goblin 2',
      'Ogre',
    ];
    const colors = new Set(names.map(colorIdForName));
    expect(colors.size).toBeGreaterThanOrEqual(5);
    for (const color of colors) expect(playerColorIds).toContain(color);
  });
});

describe('tokenIdentity', () => {
  it('uses an explicit player color, a CSS color, or the derived color', () => {
    expect(tokenIdentity('Wren', 'saffron').color).toBe(playerColorHex('saffron'));
    expect(tokenIdentity('Wren', '#123456').color).toBe('#123456');
    expect(tokenIdentity('Wren').color).toBe(playerColorHex(colorIdForName('Wren')));
  });

  it('derives the same field pattern every time', () => {
    const first = tokenIdentity('Hobgoblin chief');
    expect(tokenPatterns).toContain(first.pattern);
    expect(tokenIdentity('Hobgoblin chief').pattern).toBe(first.pattern);
  });
});

describe('TokenPortrait', () => {
  it('names the token, its class, and its state', () => {
    render(<TokenPortrait name="Ilsabet" characterClass="magic-user" state="unconscious" selected />);
    expect(
      screen.getByRole('img', { name: 'Ilsabet, magic user, unconscious, selected' }),
    ).toBeInTheDocument();
  });

  it('shows initials when there is no icon, and marks monsters', () => {
    render(<TokenPortrait name="Goblin 2" kind="monster" size={32} />);
    const token = screen.getByRole('img', { name: 'Goblin 2, monster' });
    expect(token).toHaveTextContent('G2');
    expect(token.style.getPropertyValue('--token-color')).toBe(playerColorHex(colorIdForName('Goblin 2')));
  });

  it('renders nothing for assistive technology when decorative', () => {
    render(<TokenPortrait name="Wren" decorative />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
