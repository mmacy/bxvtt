import type { StoredCharacter } from '@bxvtt/shared/protocol';
import { act, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetMyCharacters } from '@/app';
import { fixtureSnapshot } from '@/app/testing/fixtures';
import { createFakeApi, renderWithTable } from '@/app/testing/renderWithTable';
import type * as Wizard from '@/features/wizard';
import type { CharacterWizardProps } from '@/features/wizard';
import { draftKey, emptyDraft } from '@/features/wizard/draft';
import stored from '../wizard/__fixtures__/stored.json';
import { RosterPanel } from './RosterPanel';

/** The props the lobby last gave the wizard, so a test can play what the wizard does. */
let wizardProps: CharacterWizardProps | null = null;

// The wizard has its own tests. Here it stands in for the dialog, so the lobby's side of a create can be driven.
vi.mock('@/features/wizard', async (importOriginal) => {
  const actual = await importOriginal<typeof Wizard>();
  return {
    ...actual,
    CharacterWizard: (props: CharacterWizardProps) => {
      wizardProps = props;
      return props.open ? <div role="dialog" aria-label="Create a character" /> : null;
    },
  };
});

const snapshot = fixtureSnapshot('lobby', 'player');
const tableId = snapshot.table.id;

/** An unfinished character at the lobby's table, as the wizard stores it. */
const unfinished = JSON.stringify({
  ...emptyDraft(),
  step: 'review',
  roll: {
    id: 'rol_test',
    scores: { str: 15, int: 9, wis: 10, dex: 12, con: 11, cha: 8 },
    eligible_class_ids: ['fighter'],
    used: false,
    created_at: '2026-11-21T00:00:00Z',
    table_id: tableId,
  },
});

function character(id: string, name: string): StoredCharacter {
  return { ...(stored as unknown as StoredCharacter), id, name };
}

/** Plays the wizard storing a character: it clears the unfinished character, then reports the new one. */
function wizardCreates(created: StoredCharacter, { closeFirst = false } = {}) {
  const props = wizardProps;
  if (props === null) throw new Error('The lobby has not rendered the wizard.');
  act(() => {
    if (closeFirst) props.onClose();
    localStorage.removeItem(draftKey(null, tableId));
    props.onCreated(created);
    if (!closeFirst) props.onClose();
  });
}

function renderRoster() {
  const api = createFakeApi();
  api.listCharacters.mockResolvedValue({ items: [] });
  api.addToRoster.mockResolvedValue(snapshot.table);
  return { ...renderWithTable(<RosterPanel />, { snapshot, api }), api };
}

beforeEach(() => {
  localStorage.clear();
  resetMyCharacters();
  wizardProps = null;
});

describe('the lobby after the wizard creates a character', () => {
  it('announces the new character and offers to create another', async () => {
    localStorage.setItem(draftKey(null, tableId), unfinished);
    const { user, api } = renderRoster();
    await user.click(screen.getByRole('button', { name: 'Resume character' }));
    wizardCreates(character('chr_wren', 'Wren'));
    expect(await screen.findByRole('status')).toHaveTextContent('Wren joined the party.');
    expect(api.addToRoster).toHaveBeenCalledWith(tableId, 'chr_wren');
    expect(screen.getByRole('button', { name: 'Create a character' })).toBeInTheDocument();
  });

  it('announces a second character with the same name again', async () => {
    const { user } = renderRoster();
    await user.click(screen.getByRole('button', { name: 'Create a character' }));
    wizardCreates(character('chr_wren', 'Wren'));
    const status = await screen.findByRole('status');
    await waitFor(() => expect(status).toHaveTextContent('Wren joined the party.'));
    const first = status.firstElementChild;
    await user.click(screen.getByRole('button', { name: 'Create a character' }));
    wizardCreates(character('chr_wren_2', 'Wren'));
    // A live region speaks content that is added, so each add puts a new announcement in it.
    await waitFor(() => expect(status.firstElementChild).not.toBe(first));
    expect(status.firstElementChild).not.toBeNull();
    expect(status).toHaveTextContent('Wren joined the party.');
  });

  it('adds and announces a character the server stored after the player closed the wizard', async () => {
    localStorage.setItem(draftKey(null, tableId), unfinished);
    const { user, api } = renderRoster();
    await user.click(screen.getByRole('button', { name: 'Resume character' }));
    wizardCreates(character('chr_wren', 'Wren'), { closeFirst: true });
    expect(await screen.findByRole('status')).toHaveTextContent('Wren joined the party.');
    expect(api.addToRoster).toHaveBeenCalledWith(tableId, 'chr_wren');
    expect(screen.getByRole('button', { name: 'Create a character' })).toBeInTheDocument();
  });

  it('announces nothing when adding to the party fails', async () => {
    const { user, api } = renderRoster();
    api.addToRoster.mockRejectedValue(new Error('offline'));
    await user.click(screen.getByRole('button', { name: 'Create a character' }));
    wizardCreates(character('chr_wren', 'Wren'));
    await waitFor(() => expect(api.addToRoster).toHaveBeenCalled());
    expect(screen.getByRole('status')).toHaveTextContent('');
  });
});
