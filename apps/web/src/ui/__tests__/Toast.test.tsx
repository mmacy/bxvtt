import './cleanup';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '../components/Toast';
import { TOAST_EXIT_MS, TOAST_LIMIT, toast } from '../components/toastStore';

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
    const item = screen.getByRole('status');
    expect(item).toHaveTextContent('Game saved');
    expect(item).toHaveTextContent('Turn 14.');

    act(() => vi.advanceTimersByTime(2999));
    expect(screen.getByText('Game saved')).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1 + TOAST_EXIT_MS));
    expect(screen.queryByText('Game saved')).not.toBeInTheDocument();
  });

  it('announces errors as alerts and closes from the dismiss button', () => {
    render(<Toaster />);
    act(() => {
      toast.error("Wren can't attack in melee");
    });
    expect(screen.getByRole('alert')).toHaveTextContent("Wren can't attack in melee");
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));
    act(() => vi.advanceTimersByTime(TOAST_EXIT_MS));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('pauses while the pointer is over the toast', () => {
    render(<Toaster />);
    act(() => {
      toast.info('Marta joined the table', { duration: 1000 });
    });
    fireEvent.mouseEnter(screen.getByRole('status'));
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.getByText('Marta joined the table')).toBeInTheDocument();
    fireEvent.mouseLeave(screen.getByRole('status'));
    act(() => vi.advanceTimersByTime(1000 + TOAST_EXIT_MS));
    expect(screen.queryByText('Marta joined the table')).not.toBeInTheDocument();
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
    expect(screen.queryByText('Marta joined the table')).not.toBeInTheDocument();
  });

  it(`keeps at most ${TOAST_LIMIT} toasts, closing the oldest first`, () => {
    render(<Toaster />);
    act(() => {
      for (let i = 1; i <= TOAST_LIMIT + 1; i += 1) toast.info(`Notice ${i}`);
    });
    act(() => vi.advanceTimersByTime(TOAST_EXIT_MS));
    expect(screen.queryByText('Notice 1')).not.toBeInTheDocument();
    expect(screen.getByText(`Notice ${TOAST_LIMIT + 1}`)).toBeInTheDocument();
  });

  it('replaces a toast that reuses an id', () => {
    render(<Toaster />);
    act(() => {
      toast.info('Connecting', { id: 'connection' });
      toast.success('Connected', { id: 'connection' });
    });
    expect(screen.queryByText('Connecting')).not.toBeInTheDocument();
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });
});
