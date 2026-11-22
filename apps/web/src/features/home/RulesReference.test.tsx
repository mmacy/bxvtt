import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { setApi, ShortcutLayer, useTableUi } from '@/app';
import { createFakeApi } from '@/app/testing/renderWithTable';
import { KitProvider } from '@/ui';
import { RulesReference } from './RulesReference';

afterEach(() => useTableUi.getState().reset());

describe('RulesReference', () => {
  it('opens the compendium on a page outside any table, and B toggles it', async () => {
    setApi(createFakeApi());
    const user = userEvent.setup();
    render(
      <KitProvider>
        <RulesReference away />
        <ShortcutLayer />
      </KitProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'Rules reference' }));
    expect(await screen.findByRole('dialog', { name: 'Rules reference' })).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: 'b', code: 'KeyB' });
    expect(useTableUi.getState().compendiumOpen).toBe(false);
    fireEvent.keyDown(document.body, { key: 'b', code: 'KeyB' });
    expect(useTableUi.getState().compendiumOpen).toBe(true);
  });
});
