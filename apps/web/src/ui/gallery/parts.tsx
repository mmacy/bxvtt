import type { ReactNode } from 'react';
import { cx } from '../lib/cx';
import styles from './Gallery.module.css';

export function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className={styles.section} aria-labelledby={`${id}-title`}>
      <header className={styles.sectionHeader}>
        <h2 id={`${id}-title`} className={styles.sectionTitle}>
          {title}
        </h2>
        {description && <p className={styles.sectionDescription}>{description}</p>}
      </header>
      <div className={styles.sectionBody}>{children}</div>
    </section>
  );
}

export function Specimen({
  title,
  note,
  children,
  wide = false,
  plain = false,
  className,
}: {
  title: string;
  note?: ReactNode;
  children: ReactNode;
  wide?: boolean;
  plain?: boolean;
  className?: string;
}) {
  return (
    <div className={cx(styles.specimen, wide && styles.specimenWide, className)}>
      <div className={styles.specimenHead}>
        <h3 className={styles.specimenTitle}>{title}</h3>
        {note && <p className={styles.specimenNote}>{note}</p>}
      </div>
      <div className={cx(styles.bench, plain && styles.benchPlain)}>{children}</div>
    </div>
  );
}

export function Row({
  children,
  gap = 'md',
  align = 'center',
  wrap = true,
}: {
  children: ReactNode;
  gap?: 'sm' | 'md' | 'lg';
  align?: 'center' | 'start' | 'end';
  wrap?: boolean;
}) {
  return (
    <div className={cx(styles.row, styles[`gap-${gap}`], styles[`align-${align}`], !wrap && styles.nowrap)}>
      {children}
    </div>
  );
}

export function Stack({ children, gap = 'md' }: { children: ReactNode; gap?: 'sm' | 'md' | 'lg' }) {
  return <div className={cx(styles.stack, styles[`gap-${gap}`])}>{children}</div>;
}

export function Caption({ children }: { children: ReactNode }) {
  return <span className={styles.caption}>{children}</span>;
}

export function Grid({ children, min = 220 }: { children: ReactNode; min?: number }) {
  return (
    <div
      className={styles.grid}
      style={{ gridTemplateColumns: `repeat(auto-fill, minmax(min(${min}px, 100%), 1fr))` }}
    >
      {children}
    </div>
  );
}
