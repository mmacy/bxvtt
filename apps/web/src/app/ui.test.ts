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
