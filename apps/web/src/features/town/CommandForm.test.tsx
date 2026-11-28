import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { fixtureSnapshot } from '@/app/testing/fixtures';
import { createFakeApi, renderWithTable } from '@/app/testing/renderWithTable';
import { CommandForm } from './CommandForm';
import { useTownUi } from './townUi';

const REORDER = {
  command_type: 'reorder_party',
  json_schema: {
    required: ['order'],
    properties: {
      command_type: { const: 'reorder_party' },
      order: { type: 'array', items: { type: 'string' } },
    },
  },
};

const GIVE = {
  command_type: 'give_items',
  json_schema: {
    required: ['character_id', 'recipient_id'],
    properties: {
      command_type: { const: 'give_items' },
      character_id: { type: 'string' },
      recipient_id: { type: 'string' },
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

const USE = {
  command_type: 'use_item',
  json_schema: {
    required: ['character_id', 'item_id'],
    properties: {
      command_type: { const: 'use_item' },
      character_id: { type: 'string' },
      item_id: { type: 'string' },
    },
  },
};

const ITEMS = {
  command_type: 'give_items',
  json_schema: {
    required: ['character_id'],
    properties: {
      command_type: { const: 'give_items' },
      character_id: { type: 'string' },
      item_ids: { type: 'array', items: { type: 'string' } },
    },
  },
};

beforeEach(() => useTownUi.getState().reset());

describe('the town command form', () => {
  it('starts the marching order on the order the party is in, so the button is ready', async () => {
    const snapshot = fixtureSnapshot('town', 'referee');
    const { api, user } = renderWithTable(<CommandForm commandType="reorder_party" />, {
      snapshot,
      api: apiFor(REORDER),
    });
    const submit = await screen.findByRole('button', { name: /order/i });
    expect(submit).not.toHaveAttribute('aria-disabled', 'true');
    api.sendCommand.mockResolvedValue({ accepted: false, rejections: [], events: [], messages: [] } as never);
    await user.click(submit);
    expect(api.sendCommand).toHaveBeenCalledWith(
      expect.any(String),
      { command_type: 'reorder_party', order: snapshot.game?.view.party.map((member) => member.id) },
      expect.any(Number),
    );
  });

  it('leaves the giver out of the recipients', async () => {
    const snapshot = fixtureSnapshot('town', 'referee');
    const [first] = snapshot.game?.view.party ?? [];
    if (!first) throw new Error('No party.');
    const { user } = renderWithTable(<CommandForm commandType="give_items" />, {
      snapshot,
      api: apiFor(GIVE),
    });
    const recipient = await screen.findAllByRole('combobox');
    expect(recipient.length).toBe(2);
    await user.click(recipient[0] as HTMLElement);
    await user.click(await screen.findByRole('option', { name: first.name }));
    await user.click(screen.getAllByRole('combobox')[1] as HTMLElement);
    const options = within(await screen.findByRole('listbox')).getAllByRole('option');
    expect(options.map((option) => option.textContent)).not.toContain(first.name);
  });

  it('drops a recipient who becomes the giver, so the form never sends a choice it no longer shows', async () => {
    const snapshot = fixtureSnapshot('town', 'referee');
    const [first, second] = snapshot.game?.view.party ?? [];
    if (!first || !second) throw new Error('No party.');
    const { user } = renderWithTable(<CommandForm commandType="give_items" />, {
      snapshot,
      api: apiFor(GIVE),
    });
    const [giver, recipient] = await screen.findAllByRole('combobox');
    await user.click(giver as HTMLElement);
    await user.click(await screen.findByRole('option', { name: first.name }));
    await user.click(recipient as HTMLElement);
    await user.click(await screen.findByRole('option', { name: second.name }));
    await user.click(giver as HTMLElement);
    await user.click(await screen.findByRole('option', { name: second.name }));
    const submit = screen.getByRole('button', { name: /give/i });
    expect(submit).toHaveAttribute('aria-disabled', 'true');
  });

  it('says to choose a character first once: in the disabled select, or in a note where no select appears', async () => {
    const referee = renderWithTable(<CommandForm commandType="use_item" />, {
      snapshot: fixtureSnapshot('town', 'referee'),
      api: apiFor(USE),
    });
    const [, item] = await screen.findAllByRole('combobox');
    expect(item).toBeDisabled();
    expect(item).toHaveTextContent('Choose a character first');
    expect(screen.queryByText('Choose a character first.')).not.toBeInTheDocument();
    referee.unmount();

    renderWithTable(<CommandForm commandType="give_items" />, {
      snapshot: fixtureSnapshot('town', 'referee'),
      api: apiFor(ITEMS),
    });
    await screen.findByRole('combobox');
    expect(screen.getAllByRole('combobox')).toHaveLength(1);
    expect(screen.getByText('Choose a character first.')).toBeInTheDocument();
  });
});
