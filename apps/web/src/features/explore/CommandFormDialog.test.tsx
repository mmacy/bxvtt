import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fixtureSnapshot } from '@/app/testing/fixtures';
import { createFakeApi, renderWithTable } from '@/app/testing/renderWithTable';
import { CommandFormDialog } from './CommandForm';

const USE_ITEM = {
  command_type: 'use_item',
  json_schema: {
    required: ['character_id', 'item_id'],
    properties: {
      command_type: { const: 'use_item' },
      character_id: { type: 'string' },
      item_id: { type: 'string' },
      target_id: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    },
  },
};

function apiFor(schema: { command_type: string }) {
  const api = createFakeApi();
  api.rules.mockImplementation((path: string) =>
    path === `commands/${schema.command_type}`
      ? Promise.resolve(structuredClone(schema))
      : Promise.reject(new Error(`no ${path}`)),
  );
  return api;
}

describe('the exploring command form', () => {
  it('keeps the acting member among the targets, because a member can use an item on themselves', async () => {
    const snapshot = fixtureSnapshot('exploring', 'referee');
    const [first] = snapshot.game?.view.party ?? [];
    if (!first) throw new Error('No party.');
    const { user } = renderWithTable(<CommandFormDialog commandType="use_item" onClose={() => {}} />, {
      snapshot,
      api: apiFor(USE_ITEM),
    });
    const dialog = await screen.findByRole('dialog');
    const [acting, , target] = await within(dialog).findAllByRole('combobox');
    await user.click(acting as HTMLElement);
    await user.click(await screen.findByRole('option', { name: first.name }));
    await user.click(target as HTMLElement);
    const options = within(await screen.findByRole('listbox')).getAllByRole('option');
    expect(options.map((option) => option.textContent)).toContain(first.name);
  });
});
