import type { Language, SpellSummary } from '@bxvtt/shared/bxapi';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithTable } from '@/app/testing/renderWithTable';
import { IdentityStep } from './IdentityStep';
import type { ClassMagic } from './tables';

const LANGUAGES = [
  { id: 'dwarvish', name: 'Dwarvish', choosable: true },
  { id: 'elvish', name: 'Elvish', choosable: true },
  { id: 'gnomish', name: 'Gnomish', choosable: true },
] as unknown as Language[];

const SPELLS = [
  { id: 'sleep', name: 'Sleep', level: 1, spell_list: 'magic_user', range: '240', duration: '4d4 turns' },
  { id: 'light', name: 'Light', level: 1, spell_list: 'magic_user', range: '120', duration: '6 turns' },
] as unknown as SpellSummary[];

function step(languages: string[], spells: string[]) {
  return renderWithTable(
    <IdentityStep
      alignment="lawful"
      onAlignment={() => {}}
      detail={null}
      extraLanguages={2}
      languages={languages}
      onLanguages={() => {}}
      languageCatalog={LANGUAGES}
      magic={{ kind: 'arcane', spellList: 'magic_user' } as unknown as ClassMagic}
      bookSize={2}
      spells={spells}
      onSpells={() => {}}
      spellCatalog={SPELLS}
      showErrors={false}
    />,
  );
}

describe('the limits on languages and spells', () => {
  it('describes the language group and the spell group by their count, and disables what is over the limit', () => {
    step(['dwarvish', 'elvish'], ['sleep', 'light']);
    const languages = screen.getByRole('group', { name: 'Extra languages' });
    expect(languages).toHaveAccessibleDescription('2 of 2 chosen');
    expect(screen.getByRole('checkbox', { name: 'Gnomish' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Elvish' })).toBeEnabled();
    const book = screen.getByRole('group', { name: /First spells/ });
    expect(book).toHaveAccessibleDescription('2 of 2 chosen');
  });

  it('follows the count as it changes', () => {
    step(['dwarvish'], ['sleep']);
    expect(screen.getByRole('group', { name: 'Extra languages' })).toHaveAccessibleDescription(
      '1 of 2 chosen',
    );
    expect(screen.getByRole('checkbox', { name: 'Gnomish' })).toBeEnabled();
  });
});
