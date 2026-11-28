import type { EquipmentSummary } from '@bxvtt/shared/bxapi';
import { screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFakeApi, renderWithTable } from '@/app/testing/renderWithTable';
import type { CartLine } from './kits';
import { OutfitStep, addBlock } from './OutfitStep';

const ITEMS: EquipmentSummary[] = [
  { id: 'mace', name: 'Mace', item_type: 'weapon', cost_gp: 5 },
  { id: 'rope', name: 'Rope', item_type: 'gear', cost_gp: 0 },
  { id: 'torches', name: 'Torches (6)', item_type: 'gear', cost_gp: 1 },
  { id: 'holy_symbol', name: 'Holy symbol', item_type: 'gear', cost_gp: 25 },
  { id: 'waterskin', name: 'Waterskin', item_type: 'gear', cost_gp: 0 },
];

/** The full entries behind the rows: weight shows only when an entry lists one. */
const DETAILS = [
  { ...ITEMS[0], damage: '1d6', qualities: ['blunt', 'melee'], weight_coins: 30 },
  { ...ITEMS[1] },
  { ...ITEMS[2], lot_size: 6 },
  { ...ITEMS[3], weight_coins: 0 },
  { ...ITEMS[4], weight_coins: 10 },
];

/** Makes the `max-width` media queries match as they would on a screen this wide. */
function stubWidth(width: number) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: Number(/max-width: (\d+)px/.exec(query)?.[1] ?? 0) >= width,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

/** The step with a cart of its own, as the wizard holds it. */
function Harness({ gp = 100, start = [] }: { gp?: number; start?: CartLine[] }) {
  const [cart, setCart] = useState<CartLine[]>(start);
  return (
    <OutfitStep
      equipment={ITEMS}
      cart={cart}
      equip={[]}
      onCart={setCart}
      onEquip={() => {}}
      gold={{ status: 'known', gp }}
      classId="fighter"
      onKit={() => {}}
      kitNote={null}
      check={{ status: 'ok' }}
    />
  );
}

function renderStep(phone: boolean | number, gp?: number, start?: CartLine[]) {
  stubWidth(typeof phone === 'number' ? phone : phone ? 390 : 1440);
  const api = createFakeApi();
  api.fullCatalog.mockImplementation(
    async (name) =>
      ({
        catalog: name,
        total: DETAILS.length,
        items: name === 'equipment' ? DETAILS : [],
      }) as never,
  );
  return renderWithTable(<Harness gp={gp} start={start} />, { api });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('OutfitStep on a phone', () => {
  it('lists the equipment instead of the table, under one accessible name', async () => {
    renderStep(true);
    const list = await screen.findByRole('list', { name: 'Equipment for sale' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(ITEMS.length);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    // One Add button per item, so the accessibility tree holds no second copy.
    expect(screen.getAllByRole('button', { name: /^Add .* to the cart$/ })).toHaveLength(ITEMS.length);
  });

  it('shows the price and weight, only the price without a listed weight, and Free for no cost', async () => {
    renderStep(true);
    const list = await screen.findByRole('list', { name: 'Equipment for sale' });
    const line = (name: string) =>
      within(
        within(list)
          .getByRole('button', { name: new RegExp(`^${name}`) })
          .closest('li')!,
      ).getByText(/gp|Free/).textContent;
    expect(line('Mace')).toBe('5 gp · 30 cn');
    expect(line('Rope')).toBe('Free');
    expect(line('Torches')).toBe('1 gp');
    expect(line('Holy symbol')).toBe('25 gp');
    expect(line('Waterskin')).toBe('Free · 10 cn');
  });

  it('swaps Add for the stepper and moves focus with it, and back again', async () => {
    const { user } = renderStep(true);
    const list = await screen.findByRole('list', { name: 'Equipment for sale' });
    await user.click(within(list).getByRole('button', { name: 'Add Mace to the cart' }));
    await waitFor(() => expect(within(list).getByRole('button', { name: 'Add one mace' })).toHaveFocus());
    expect(within(list).queryByRole('button', { name: 'Add Mace to the cart' })).not.toBeInTheDocument();
    await user.click(within(list).getByRole('button', { name: 'Remove one mace' }));
    await waitFor(() =>
      expect(within(list).getByRole('button', { name: 'Add Mace to the cart' })).toHaveFocus(),
    );
  });
});

describe('OutfitStep on a wider screen', () => {
  it('keeps the table and shows no list', async () => {
    renderStep(false);
    expect(await screen.findByRole('table', { name: 'Equipment for sale' })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Equipment for sale' })).not.toBeInTheDocument();
  });
});

describe('the gold left while the cart sits under the equipment', () => {
  /** The Equipment heading row, where the badge sits beside the kit button. */
  function headingRow() {
    const heading = screen.getByRole('heading', { name: 'Equipment' });
    return within(heading.parentElement as HTMLElement);
  }

  it('shows the gold left on the Equipment heading row, and how far over once the cart costs too much', async () => {
    const { user } = renderStep(820, 28);
    await screen.findByRole('table', { name: 'Equipment for sale' });
    expect(headingRow().getByText('28 gp left')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add Mace to the cart' }));
    expect(headingRow().getByText('23 gp left')).toBeInTheDocument();
    // The purse and the badge read the same amount.
    expect(screen.getByText('5 gp spent, 23 gp left')).toBeInTheDocument();
    // The holy symbol costs more than the 23 gp left, so it can't be added.
    expect(screen.getByRole('button', { name: 'Add Holy symbol to the cart' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('says how far over a cart that already costs too much is', async () => {
    renderStep(820, 28, [
      { itemId: 'mace', quantity: 1 },
      { itemId: 'holy_symbol', quantity: 1 },
    ]);
    await screen.findByRole('table', { name: 'Equipment for sale' });
    expect(headingRow().getByText('Over by 2 gp')).toBeInTheDocument();
    expect(screen.getByText('30 gp spent, over by 2 gp')).toBeInTheDocument();
  });

  it('leaves the gold to the purse when the cart sits beside the equipment', async () => {
    renderStep(1440, 30);
    await screen.findByRole('table', { name: 'Equipment for sale' });
    expect(headingRow().queryByText(/gp left|Over by/)).toBeNull();
  });
});

describe('an item that costs more than the gold left', () => {
  it('says why one more lot is unavailable, and leaves the rest', () => {
    expect(addBlock(5, 3)).toBe('This costs 5 gp, and you have 3 gp left.');
    expect(addBlock(5, -2)).toBe('This costs 5 gp, and you have 0 gp left.');
    expect(addBlock(5, 5)).toBeNull();
    expect(addBlock(0, 0)).toBeNull();
    expect(addBlock(5, null)).toBeNull();
  });

  it('disables Add with the reason and keeps a free item enabled', async () => {
    const { user } = renderStep(false, 3);
    const mace = await screen.findByRole('button', { name: 'Add Mace to the cart' });
    expect(mace).toHaveAttribute('aria-disabled', 'true');
    expect(mace).toHaveAccessibleDescription('This costs 5 gp, and you have 3 gp left.');
    await user.click(mace);
    expect(screen.queryByRole('button', { name: 'Add one mace' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Rope to the cart' })).not.toHaveAttribute('aria-disabled');
    expect(screen.getByRole('button', { name: 'Add Torches (6) to the cart' })).not.toHaveAttribute(
      'aria-disabled',
    );
  });

  it('disables the plus button once the gold left cannot cover another lot', async () => {
    const { user } = renderStep(false, 6);
    await user.click(await screen.findByRole('button', { name: 'Add Mace to the cart' }));
    for (const plus of screen.getAllByRole('button', { name: 'Add one mace' })) {
      expect(plus).toHaveAttribute('aria-disabled', 'true');
      expect(plus).toHaveAccessibleDescription('This costs 5 gp, and you have 1 gp left.');
    }
    for (const minus of screen.getAllByRole('button', { name: 'Remove one mace' })) {
      expect(minus).not.toHaveAttribute('aria-disabled');
    }
  });
});
