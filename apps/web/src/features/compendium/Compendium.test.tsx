import { BxvttProblemError } from '@bxvtt/shared/client';
import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CompendiumEntry } from '@/app';
import { fixtureSnapshot } from '@/app/testing/fixtures';
import { createFakeApi, renderWithTable, type FakeApi } from '@/app/testing/renderWithTable';
import { resetBookStore } from './bookStore';
import { resetFullCatalogs } from './catalogs';
import { Compendium } from './Compendium';
import rules from './fixtures/rules.json';
import { useIndexState } from './indexState';

type Lists = Record<string, unknown[]>;
type Entries = Record<string, Record<string, unknown>>;

const lists: Lists = {
  classes: rules.classes,
  spells: rules.spells,
  monsters: rules.monsters,
  equipment: rules.equipment,
  'magic-items': rules.magicItems,
  languages: rules.languages,
  tables: rules.tableNames,
  commands: [
    { command_type: 'search', kind: 'play', allowed_modes: ['exploring'], summary: 'Search.' },
    { command_type: 'enter_dungeon', kind: 'play', allowed_modes: ['town'], summary: 'Enter.' },
    { command_type: 'move_party', kind: 'play', allowed_modes: ['exploring'], summary: 'Move.' },
    { command_type: 'grant_coins', kind: 'referee', allowed_modes: ['town', 'exploring'], summary: 'Grant.' },
  ],
};
const fullCatalogs: Record<string, unknown[]> = {
  classes: Object.values(rules.classDetails),
  spells: Object.values(rules.spellDetails),
  monsters: Object.values(rules.monsterDetails),
  equipment: Object.values(rules.equipmentDetails),
  'magic-items': Object.values(rules.magicItemDetails),
};
const entries: Entries = {
  classes: rules.classDetails,
  spells: rules.spellDetails,
  monsters: rules.monsterDetails,
  equipment: rules.equipmentDetails,
  'magic-items': rules.magicItemDetails,
  tables: rules.tables,
};

/** Answers the rules routes from the captured catalogs, like the server does. */
function stubRules(api: FakeApi, overrides: Record<string, () => unknown> = {}) {
  api.fullCatalog.mockImplementation(((name: string) => {
    const items = fullCatalogs[name] ?? [];
    return Promise.resolve({ catalog: name, total: items.length, items });
  }) as never);
  api.rules.mockImplementation((path: string, query?: Record<string, string | number | undefined>) => {
    const override = overrides[path];
    if (override) return Promise.resolve(override()) as never;
    if (path === 'license') return Promise.resolve(rules.license) as never;
    const [section, id] = path.split('/');
    if (section === undefined) return Promise.reject(new Error('No path.'));
    if (id === undefined) {
      const items = lists[section];
      if (!items) return Promise.reject(new Error(`No list ${section}.`));
      const offset = Number(query?.['offset'] ?? 0);
      const limit = Number(query?.['limit'] ?? 50);
      return Promise.resolve({
        items: items.slice(offset, offset + limit),
        total: items.length,
        limit,
        offset,
      }) as never;
    }
    const entry = entries[section]?.[id];
    return entry
      ? (Promise.resolve(entry) as never)
      : (Promise.reject(new Error(`No entry ${path}.`)) as never);
  });
}

function setup(options: { role?: 'player' | 'referee'; entry?: CompendiumEntry | null; api?: FakeApi } = {}) {
  const api = options.api ?? createFakeApi();
  if (!options.api) stubRules(api);
  const onOpenChange = vi.fn();
  const snapshot = fixtureSnapshot('exploring', options.role ?? 'referee');
  const view = renderWithTable(
    <Compendium open onOpenChange={onOpenChange} entry={options.entry ?? null} />,
    { snapshot, api },
  );
  return { ...view, onOpenChange };
}

const search = () => screen.getByRole('combobox', { name: 'Search the rules' });

beforeEach(() => {
  localStorage.clear();
  resetBookStore();
  resetFullCatalogs();
  useIndexState.getState().reset();
});

describe('Compendium search', () => {
  it('focuses the search box, finds an entry by name, and opens it with Enter', async () => {
    const { user } = setup();
    await waitFor(() => expect(search()).toHaveFocus());
    await user.type(search(), 'goblin');
    const option = await screen.findByRole('option', { name: /^Goblin\s*Hit dice/ });
    expect(option).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('heading', { name: 'Goblin' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Goblin stat block' })).toHaveTextContent('6 [13]');
    expect(search()).toHaveValue('');
  });

  it('moves through the results with the arrow keys', async () => {
    const { user } = setup();
    await user.type(search(), 'level 3');
    const first = await screen.findAllByRole('option');
    expect(first[0]).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowDown}');
    expect(screen.getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowUp}{ArrowUp}');
    const options = screen.getAllByRole('option');
    expect(options[options.length - 1]).toHaveAttribute('aria-selected', 'true');
  });

  it('clears the search on Escape before it closes the book', async () => {
    const { user, onOpenChange } = setup();
    await user.type(search(), 'sleep');
    await user.keyboard('{Escape}');
    expect(search()).toHaveValue('');
    expect(onOpenChange).not.toHaveBeenCalled();
    await user.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('shows recent entries when the box is empty', async () => {
    const { user } = setup({ entry: { kind: 'spells', id: 'sleep' } });
    await screen.findByRole('heading', { name: 'Sleep' });
    await user.click(screen.getByRole('tab', { name: 'Contents' }));
    const recent = await screen.findByRole('listbox', { name: 'Recent entries' });
    expect(within(recent).getByRole('option', { name: /Sleep/ })).toBeInTheDocument();
  });

  it('says which catalogs failed and recovers when they load', async () => {
    const api = createFakeApi();
    let fail = true;
    stubRules(api);
    const base = api.rules.getMockImplementation();
    api.rules.mockImplementation((path: string, query?: Record<string, string | number | undefined>) =>
      path === 'monsters' && fail
        ? (Promise.reject(
            new BxvttProblemError({
              type: 'about:blank',
              title: 'Down',
              status: 503,
              code: 'bxapi_unavailable',
              detail: 'down',
            }),
          ) as never)
        : (base?.(path, query) as never),
    );
    const { user } = setup({ api });
    await user.type(search(), 'goblin');
    expect(await screen.findByText(/Couldn’t load monsters/)).toBeInTheDocument();
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('option', { name: /^Goblin\s*Hit dice/ })).toBeInTheDocument();
  });
});

describe('Compendium pages', () => {
  it('opens at the entry it is given, and turns to a new entry when the prop changes', async () => {
    const { rerender } = setup({ entry: { kind: 'spells', id: 'sleep' } });
    expect(await screen.findByRole('heading', { name: 'Sleep' })).toBeInTheDocument();
    rerender(<Compendium open onOpenChange={() => {}} entry={{ kind: 'classes', id: 'cleric' }} />);
    expect(await screen.findByRole('heading', { name: 'Cleric' })).toBeInTheDocument();
  });

  it('links a monster to its treasure type and goes back', async () => {
    const { user } = setup({ entry: { kind: 'monsters', id: 'goblin' } });
    await screen.findByRole('heading', { name: 'Goblin' });
    await user.click(screen.getAllByRole('button', { name: 'R' })[0]!);
    expect(await screen.findByRole('heading', { name: 'Treasure' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByRole('heading', { name: 'Goblin' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Forward' }));
    expect(await screen.findByRole('heading', { name: 'Treasure' })).toBeInTheDocument();
  });

  it('keeps Back and Forward focusable at the ends of the history and explains why they are unavailable', async () => {
    const { user } = setup({ entry: { kind: 'monsters', id: 'goblin' } });
    await screen.findByRole('heading', { name: 'Goblin' });
    const back = screen.getByRole('button', { name: 'Back' });
    const forward = screen.getByRole('button', { name: 'Forward' });
    expect(back).toHaveAttribute('aria-disabled', 'true');
    expect(back).toHaveAccessibleDescription(/first page you opened/);
    expect(forward).toHaveAttribute('aria-disabled', 'true');
    expect(forward).toHaveAccessibleDescription(/haven't gone back/);

    await user.click(screen.getAllByRole('button', { name: 'R' })[0]!);
    await screen.findByRole('heading', { name: 'Treasure' });
    expect(screen.getByRole('button', { name: 'Back' })).not.toHaveAttribute('aria-disabled');
    expect(screen.getByRole('button', { name: 'Forward' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('describes a treasure type letter link by what it opens', async () => {
    setup({ entry: { kind: 'monsters', id: 'goblin' } });
    await screen.findByRole('heading', { name: 'Goblin' });
    expect(screen.getAllByRole('button', { name: 'R' })[0]).toHaveAccessibleDescription(
      'Show treasure type R in the treasure tables',
    );
  });

  it('typesets a class with its progression table and the turning table for a cleric', async () => {
    setup({ entry: { kind: 'classes', id: 'cleric' } });
    const table = await screen.findByRole('table', { name: 'Cleric level progression' });
    expect(within(table).getAllByRole('row').length).toBeGreaterThan(14);
    const turning = await screen.findByRole('table', { name: /Turning undead/ });
    const headers = within(turning)
      .getAllByRole('columnheader')
      .map((cell) => cell.textContent);
    expect(headers.slice(-8)).toEqual(['1', '2', '2*', '3', '4', '5', '6', '7-9']);
  });

  it('never shows an ID or a raw token', async () => {
    setup({ entry: { kind: 'monsters', id: 'goblin' } });
    await screen.findByRole('heading', { name: 'Goblin' });
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/[a-z]+_[a-z]+/);
    expect(text).not.toMatch(/\]\(/);
  });

  it('lists spells by spell list and level and filters them', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('tab', { name: 'Spells' }));
    await screen.findByRole('heading', { name: /Cleric spells, 1st level/ });
    await user.click(screen.getByRole('radio', { name: 'Magic-user' }));
    expect(screen.queryByRole('heading', { name: /Cleric spells/ })).not.toBeInTheDocument();
    await user.type(screen.getByRole('searchbox', { name: 'Filter spells by name' }), 'sleep');
    expect(screen.getByRole('button', { name: 'Sleep' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Fly' })).not.toBeInTheDocument();
  });

  it('shows the license exactly as served', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Open Game License' }));
    expect(await screen.findByRole('heading', { name: rules.license.name })).toBeInTheDocument();
    const text = screen.getByLabelText('License text');
    expect(text.textContent).toBe(rules.license.text);
  });
});

describe('Compendium actions', () => {
  it('lists the party actions and hides the referee actions from a player', async () => {
    const { user } = setup({ role: 'player' });
    await user.click(screen.getByRole('tab', { name: 'Actions' }));
    expect(await screen.findByRole('button', { name: 'Search' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enter the dungeon' })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Referee actions' })).not.toBeInTheDocument();
    expect(screen.queryByText('Grant coins')).not.toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'In town' }));
    expect(screen.queryByRole('button', { name: 'Search' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enter the dungeon' })).toBeInTheDocument();
  });

  it('lets a referee switch to the referee actions', async () => {
    const { user } = setup({ role: 'referee' });
    await user.click(screen.getByRole('tab', { name: 'Actions' }));
    await user.click(await screen.findByRole('radio', { name: 'Referee actions' }));
    expect(await screen.findByRole('button', { name: 'Grant coins' })).toBeInTheDocument();
  });

  it('opens an action by deep link', async () => {
    setup({ entry: { kind: 'commands', id: 'search' } });
    expect(await screen.findByRole('heading', { name: 'Search' })).toBeInTheDocument();
  });
});

describe('magic item notice', () => {
  it('asks a player once before showing magic items', async () => {
    const { user, unmount } = setup({ role: 'player' });
    await user.click(screen.getByRole('tab', { name: 'Magic items' }));
    expect(await screen.findByText('Magic item spoilers')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Potion of Healing' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show magic items' }));
    expect(await screen.findByRole('button', { name: 'Potion of Healing' })).toBeInTheDocument();
    unmount();
    setup({ role: 'player', entry: { kind: 'magic-items', id: 'potion_of_healing' } });
    expect(await screen.findByRole('heading', { name: 'Potion of Healing' })).toBeInTheDocument();
  });

  it('keeps magic items out of a player’s search until they accept the notice', async () => {
    const { user } = setup({ role: 'player' });
    await user.type(search(), 'potion of heal');
    const row = await screen.findByRole('option', { name: /hidden to avoid spoilers/ });
    expect(screen.queryByText('Potion of Healing')).not.toBeInTheDocument();
    await user.click(row);
    expect(await screen.findByRole('option', { name: /Potion of Healing/ })).toBeInTheDocument();
  });

  it('shows a referee the magic items with no notice', async () => {
    const { user } = setup({ role: 'referee' });
    await user.click(screen.getByRole('tab', { name: 'Magic items' }));
    expect(await screen.findByRole('button', { name: 'Potion of Healing' })).toBeInTheDocument();
    expect(screen.queryByText('Magic item spoilers')).not.toBeInTheDocument();
  });
});
