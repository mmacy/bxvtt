import { afterEach, describe, expect, it } from 'vitest';
import { useTableUi } from './ui';

afterEach(() => useTableUi.getState().reset());

describe('the compendium', () => {
  it('toggles closed when open and open at its first page when closed', () => {
    const ui = useTableUi.getState();
    ui.openCompendium({ kind: 'spells', id: 'sleep' });
    useTableUi.getState().toggleCompendium();
    expect(useTableUi.getState()).toMatchObject({ compendiumOpen: false, compendiumEntry: null });
    useTableUi.getState().toggleCompendium();
    expect(useTableUi.getState()).toMatchObject({ compendiumOpen: true, compendiumEntry: null });
  });

  it('stays on its page when something opens it without an entry', () => {
    useTableUi.getState().openCompendium({ kind: 'monsters', id: 'goblin' });
    useTableUi.getState().openCompendium();
    expect(useTableUi.getState().compendiumEntry).toEqual({ kind: 'monsters', id: 'goblin' });
  });
});

describe('the character sheet', () => {
  it('opens at a tab, and at its first tab otherwise', () => {
    useTableUi.getState().openCharacterSheet('character-0001', 'spells');
    expect(useTableUi.getState()).toMatchObject({ sheetMemberId: 'character-0001', sheetTab: 'spells' });
    useTableUi.getState().openCharacterSheet('character-0002');
    expect(useTableUi.getState()).toMatchObject({ sheetMemberId: 'character-0002', sheetTab: null });
    useTableUi.getState().closeCharacterSheet();
    expect(useTableUi.getState()).toMatchObject({ sheetMemberId: null, sheetTab: null });
  });
});
