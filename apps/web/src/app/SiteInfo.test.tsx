import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DOCS_URL, SiteInfo } from './SiteInfo';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SiteInfo', () => {
  it('links to the documentation, opens it in a new tab, and names the link', () => {
    render(<SiteInfo />);
    const link = screen.getByRole('link', { name: /^Docs/ });
    expect(link).toHaveAttribute('href', 'https://mmacy.github.io/bxvtt/');
    expect(DOCS_URL).toBe('https://mmacy.github.io/bxvtt/');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')).toMatch(/noreferrer/);
    expect(link).toHaveAccessibleName(/^Docs\s*\(opens in a new tab\)$/);
  });

  it('shows the version that the build injected', () => {
    vi.stubGlobal('__BXVTT_VERSION__', '9.8.7');
    render(<SiteInfo />);
    expect(screen.getByText('v9.8.7')).toBeInTheDocument();
    // A screen reader gets the word, not the letter.
    expect(screen.getByText('Version 9.8.7')).toBeInTheDocument();
  });

  it('shows the root package version under the test configuration', () => {
    render(<SiteInfo layout="stack" />);
    expect(__BXVTT_VERSION__).toMatch(/^\d+\.\d+\.\d+/);
    expect(screen.getByText(`v${__BXVTT_VERSION__}`)).toBeInTheDocument();
  });
});
