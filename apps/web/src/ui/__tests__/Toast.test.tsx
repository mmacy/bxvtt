import './cleanup';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '../components/Toast';
import { TOAST_EXIT_MS, TOAST_LIMIT, toast } from '../components/toastStore';

function liveRegion(politeness: 'polite' | 'assertive'): HTMLElement {
  const region = document.querySelector<HTMLElement>(`[data-toast-live="${politeness}"]`);
  if (!region) throw new Error(`No ${politeness} live region`);
  return region;
}

/** The visible toasts, as list items of the notifications list. */
function items(): HTMLElement[] {
  const list = screen.queryByRole('list');
  return list ? within(list).queryAllByRole('listitem') : [];
}

describe('toast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    act(() => toast.clear());
    vi.useRealTimers();
  });

  it('shows a toast, then removes it after its duration and exit animation', () => {
    render(<Toaster />);
    act(() => {
      toast.success('Game saved', { description: 'Turn 14.', duration: 3000 });
    });
    expect(items()).toHaveLength(1);
    expect(items()[0]).toHaveTextContent('Game saved');
    expect(items()[0]).toHaveTextContent('Turn 14.');

    act(() => vi.advanceTimersByTime(2999));
    expect(items()).toHaveLength(1);

    act(() => vi.advanceTimersByTime(1 + TOAST_EXIT_MS));
    expect(items()).toHaveLength(0);
    expect(screen.queryByText(/Game saved/)).not.toBeInTheDocument();
  });

  it('keeps every child of the list a list item', () => {
    render(<Toaster />);
    act(() => {
      toast.success('Game saved');
      toast.error("Wren can't attack in melee");
    });
    const list = screen.getByRole('list');
    for (const child of Array.from(list.children)) {
      expect(child.tagName).toBe('LI');
      expect(child).not.toHaveAttribute('role');
    }
  });

  it('announces a status politely and an error assertively, each once', () => {
    render(<Toaster />);
    const polite = liveRegion('polite');
    const assertive = liveRegion('assertive');
    // An empty region is never exposed as a status or an alert.
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(polite).toHaveAttribute('aria-live', 'polite');
    expect(assertive).toHaveAttribute('aria-live', 'assertive');
    expect(polite).toBeEmptyDOMElement();

    act(() => {
      toast.success('Game saved', { description: 'Turn 14.' });
    });
    expect(polite).toHaveTextContent('Game saved. Turn 14.');
    expect(assertive).toBeEmptyDOMElement();
    const spoken = polite.firstElementChild;

    act(() => {
      toast.error("Wren can't attack in melee");
    });
    expect(assertive).toHaveTextContent("Wren can't attack in melee");
    // The polite message isn't written again, so a screen reader doesn't repeat it.
    expect(polite.firstElementChild).toBe(spoken);

    act(() => vi.advanceTimersByTime(10_000));
    expect(polite).toBeEmptyDOMElement();
    expect(assertive).toBeEmptyDOMElement();
  });

  it('closes from the dismiss button', () => {
    render(<Toaster />);
    act(() => {
      toast.error("Wren can't attack in melee");
    });
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));
    act(() => vi.advanceTimersByTime(TOAST_EXIT_MS));
    expect(items()).toHaveLength(0);
    expect(liveRegion('assertive')).toBeEmptyDOMElement();
  });

  it('pauses while the pointer is over the toast', () => {
    render(<Toaster />);
    act(() => {
      toast.info('Marta joined the table', { duration: 1000 });
    });
    const [item] = items();
    if (!item) throw new Error('No toast');
    fireEvent.mouseEnter(item);
    act(() => vi.advanceTimersByTime(5000));
    expect(items()).toHaveLength(1);
    fireEvent.mouseLeave(item);
    act(() => vi.advanceTimersByTime(1000 + TOAST_EXIT_MS));
    expect(items()).toHaveLength(0);
  });

  it('runs an action and closes the toast', () => {
    const onClick = vi.fn();
    render(<Toaster />);
    act(() => {
      toast.info('Marta joined the table', { action: { label: 'Give a seat', onClick } });
    });
    fireEvent.click(screen.getByRole('button', { name: 'Give a seat' }));
    expect(onClick).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(TOAST_EXIT_MS));
    expect(items()).toHaveLength(0);
  });

  it(`keeps at most ${TOAST_LIMIT} toasts, closing the oldest first`, () => {
    render(<Toaster />);
    act(() => {
      for (let i = 1; i <= TOAST_LIMIT + 1; i += 1) toast.info(`Notice ${i}`);
    });
    act(() => vi.advanceTimersByTime(TOAST_EXIT_MS));
    expect(items().map((item) => item.textContent)).not.toContain('Notice 1');
    expect(items()).toHaveLength(TOAST_LIMIT);
  });

  it('replaces a toast that reuses an id, and announces the new message', () => {
    render(<Toaster />);
    act(() => {
      toast.info('Connecting', { id: 'connection' });
      toast.success('Connected', { id: 'connection' });
    });
    expect(items()).toHaveLength(1);
    expect(items()[0]).toHaveTextContent('Connected');
    expect(liveRegion('polite')).toHaveTextContent('Connected');
  });
});
