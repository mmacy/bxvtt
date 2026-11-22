import type { ReactNode } from 'react';
import { cx } from '../lib/cx';
import { Wordmark } from './Wordmark';
import styles from './PageLayout.module.css';

export interface PageLayoutProps {
  children: ReactNode;
  /** Controls at the trailing edge of the header, such as the user's avatar. */
  headerActions?: ReactNode;
  /** Links or breadcrumbs after the wordmark. */
  nav?: ReactNode;
  footer?: ReactNode;
  /** Content width: "narrow" for forms, "default" for the lobby, "wide" for galleries. */
  width?: 'narrow' | 'default' | 'wide';
  /** Replaces the wordmark, for example with a link to home. */
  brand?: ReactNode;
  className?: string;
}

/** The frame for pages outside play: home, lobby, and settings. */
export function PageLayout({
  children,
  headerActions,
  nav,
  footer,
  width = 'default',
  brand,
  className,
}: PageLayoutProps) {
  return (
    <div className={cx(styles.page, className)}>
      <header className={styles.header}>
        <div className={cx(styles.inner, styles.headerInner, styles[width])}>
          {brand ?? <Wordmark size="sm" />}
          {nav && <nav className={styles.nav}>{nav}</nav>}
          <span className={styles.spacer} />
          {headerActions}
        </div>
      </header>
      <main className={cx(styles.inner, styles.main, styles[width])}>{children}</main>
      {footer && (
        <footer className={styles.footer}>
          <div className={cx(styles.inner, styles[width])}>{footer}</div>
        </footer>
      )}
    </div>
  );
}
