import type { CharacterClassKey } from '../icons/Icon';
import type { PlayerColorId } from '../tokens';

export interface SampleCharacter {
  id: string;
  name: string;
  characterClass: CharacterClassKey;
  level: number;
  color: PlayerColorId;
  hp: number;
  maxHp: number;
  ac: number;
  player: string;
}

export const party: SampleCharacter[] = [
  {
    id: 'kael',
    name: 'Kael Ironside',
    characterClass: 'fighter',
    level: 3,
    color: 'vermilion',
    hp: 17,
    maxHp: 22,
    ac: 2,
    player: 'Marta',
  },
  {
    id: 'aldous',
    name: 'Brother Aldous',
    characterClass: 'cleric',
    level: 2,
    color: 'azurite',
    hp: 9,
    maxHp: 11,
    ac: 4,
    player: 'Dev',
  },
  {
    id: 'wren',
    name: 'Wren Underbough',
    characterClass: 'halfling',
    level: 3,
    color: 'saffron',
    hp: 3,
    maxHp: 14,
    ac: 5,
    player: 'Sam',
  },
  {
    id: 'ilsabet',
    name: 'Ilsabet',
    characterClass: 'magic-user',
    level: 2,
    color: 'ultramarine',
    hp: 0,
    maxHp: 6,
    ac: 9,
    player: 'Jo',
  },
  {
    id: 'durgin',
    name: 'Durgin Coalbeard',
    characterClass: 'dwarf',
    level: 2,
    color: 'malachite',
    hp: 12,
    maxHp: 15,
    ac: 3,
    player: 'Marta',
  },
  {
    id: 'sylvaine',
    name: 'Sylvaine',
    characterClass: 'elf',
    level: 1,
    color: 'verdigris',
    hp: 6,
    maxHp: 7,
    ac: 5,
    player: 'Dev',
  },
  {
    id: 'nettle',
    name: 'Nettle',
    characterClass: 'thief',
    level: 3,
    color: 'madder',
    hp: 8,
    maxHp: 10,
    ac: 7,
    player: 'Sam',
  },
];

export const people = [
  { id: 'u1', name: 'Ruth Cole', color: 'slate', presence: 'online' as const, referee: true },
  { id: 'u2', name: 'Marta Vey', color: 'vermilion', presence: 'online' as const },
  { id: 'u3', name: 'Dev Okafor', color: 'azurite', presence: 'online' as const },
  { id: 'u4', name: 'Sam Hale', color: 'saffron', presence: 'away' as const },
  { id: 'u5', name: 'Jo Park', color: 'ultramarine', presence: 'offline' as const },
  { id: 'u6', name: 'Lee Brandt', color: 'weld', presence: 'online' as const },
  { id: 'u7', name: 'Ana Ruiz', color: 'tyrian', presence: 'online' as const },
];

export interface SampleMonster {
  id: string;
  name: string;
  ac: number;
  hd: string;
  hp: number;
  morale: number;
  xp: number;
}

export const monsters: SampleMonster[] = [
  { id: 'goblin', name: 'Goblin', ac: 6, hd: '1−1', hp: 4, morale: 7, xp: 5 },
  { id: 'hobgoblin', name: 'Hobgoblin', ac: 6, hd: '1+1', hp: 6, morale: 8, xp: 15 },
  { id: 'kobold', name: 'Kobold', ac: 7, hd: '½', hp: 2, morale: 6, xp: 5 },
  { id: 'orc', name: 'Orc', ac: 6, hd: '1', hp: 5, morale: 8, xp: 10 },
  { id: 'bugbear', name: 'Bugbear', ac: 5, hd: '3+1', hp: 15, morale: 9, xp: 75 },
  { id: 'ogre', name: 'Ogre', ac: 5, hd: '4+1', hp: 21, morale: 10, xp: 125 },
  { id: 'rat', name: 'Giant rat', ac: 7, hd: '½', hp: 2, morale: 8, xp: 2 },
  { id: 'skeleton', name: 'Skeleton', ac: 7, hd: '1', hp: 4, morale: 12, xp: 10 },
];
