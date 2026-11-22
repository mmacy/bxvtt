import './cleanup';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button } from '../components/Button';
import { ActionBar, ActionBarItem, ActionBarMenu } from '../layout/TableLayout';

function Bar({ onRest = () => {}, onTorch = () => {} }: { onRest?: () => void; onTorch?: () => void }) {
  return (
    <ActionBar aria-label="Party actions" status={<span>Wren is the caller</span>}>
      <ActionBarItem>
        <Button icon="search">Search</Button>
      </ActionBarItem>
      <ActionBarItem>
        <Button icon="rest" onClick={onRest}>
          Rest
        </Button>
      </ActionBarItem>
      <ActionBarMenu
        label="Light"
        icon="torch"
        items={[
          { label: 'Wren lights a torch', onSelect: onTorch },
          { label: 'Osric lights a lantern', onSelect: () => {} },
        ]}
      />
    </ActionBar>
  );
}

/**
 * Gives elements the sizes a browser would: 100 px for a button with its label, 40 px for a button showing only
 * its icon, 32 px for the overflow button, and `available` px for the row of actions.
 */
function fakeLayout(available: number) {
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(() => [{}] as unknown as DOMRectList);
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return this.getAttribute('role') === 'toolbar' ? available : 0;
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const compact = this.closest('[data-density="compact"]') !== null;
    const width = this.hasAttribute('data-action-bar-more') ? 32 : compact ? 40 : 100;
    return { width, height: 28, x: 0, y: 0, top: 0, left: 0, right: width, bottom: 28, toJSON: () => ({}) };
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ActionBarMenu', () => {
  it('joins the bar arrow-key navigation and opens its menu', async () => {
    const user = userEvent.setup();
    const onTorch = vi.fn();
    render(<Bar onTorch={onTorch} />);
    screen.getByRole('button', { name: 'Search' }).focus();
    await user.keyboard('{ArrowRight}{ArrowRight}');
    const light = screen.getByRole('button', { name: 'Light' });
    expect(light).toHaveFocus();
    expect(light).toHaveAttribute('aria-haspopup', 'menu');
    await user.keyboard('{Enter}');
    await user.click(screen.getByRole('menuitem', { name: 'Wren lights a torch' }));
    expect(onTorch).toHaveBeenCalledOnce();
  });
});

describe('ActionBar when room runs out', () => {
  it('shows every label when the actions fit', () => {
    fakeLayout(400);
    render(<Bar />);
    expect(screen.getByRole('toolbar')).not.toHaveAttribute('data-density');
    expect(screen.getByRole('button', { name: 'More actions' })).not.toHaveAttribute('data-active');
  });

  it('hides the labels first, and each button keeps its name', () => {
    fakeLayout(200);
    render(<Bar />);
    expect(screen.getByRole('toolbar')).toHaveAttribute('data-density', 'compact');
    expect(screen.getByRole('button', { name: 'Rest' })).not.toHaveAttribute('data-overflowed');
    expect(screen.getByRole('button', { name: 'More actions' })).not.toHaveAttribute('data-active');
  });

  it('moves the last actions into the "More actions" menu, which presses them', async () => {
    fakeLayout(100);
    const user = userEvent.setup();
    const onRest = vi.fn();
    const onTorch = vi.fn();
    render(<Bar onRest={onRest} onTorch={onTorch} />);
    const toolbar = screen.getByRole('toolbar');
    expect(within(toolbar).getByRole('button', { name: 'Search' })).not.toHaveAttribute('data-overflowed');
    expect(screen.getByText('Rest').closest('button')).toHaveAttribute('data-overflowed');
    expect(screen.getByText('Light').closest('button')).toHaveAttribute('data-overflowed');

    const more = screen.getByRole('button', { name: 'More actions' });
    expect(more).toHaveAttribute('data-active');
    await user.click(more);
    await user.click(screen.getByRole('menuitem', { name: 'Rest' }));
    await waitFor(() => expect(onRest).toHaveBeenCalledOnce());

    // The menu appears as a submenu, with its own entries.
    await user.click(more);
    screen.getByRole('menuitem', { name: 'Light' }).focus();
    await user.keyboard('{ArrowRight}');
    const torch = await screen.findByRole('menuitem', { name: 'Wren lights a torch' });
    await waitFor(() => expect(torch).toHaveFocus());
    await user.keyboard('{Enter}');
    expect(onTorch).toHaveBeenCalledOnce();
  });
});
