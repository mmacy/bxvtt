import type { CatalogResult } from '@/app';
import { Banner, Button, Parchment, Skeleton } from '@/ui';
import type { ReactNode } from 'react';
import styles from './book.module.css';
import { sectionInfo, type SectionId } from './model';
import { useNavigation } from './navigation';

/** A parchment page that holds its place while an entry loads. */
export function PageSkeleton({ label }: { label: string }) {
  return (
    <Parchment variant="plain" className={styles.page} aria-busy="true" aria-label={label}>
      <Skeleton shape="text" width="40%" height={28} />
      <div className={styles.skeletonGap} />
      <Skeleton shape="block" height={120} />
      <div className={styles.skeletonGap} />
      <Skeleton shape="text" lines={5} />
    </Parchment>
  );
}

/** What to show when a catalog fails or an entry is missing, with a way to retry and a way out. */
export function CatalogProblem({
  title,
  result,
  section,
}: {
  title: string;
  result: Pick<CatalogResult<unknown>, 'error' | 'retry'>;
  section?: SectionId;
}) {
  const { go } = useNavigation();
  return (
    <Banner
      tone="danger"
      title={title}
      actions={
        <>
          <Button size="sm" variant="secondary" icon="refresh" onClick={result.retry}>
            Try again
          </Button>
          {section && (
            <Button size="sm" variant="ghost" onClick={() => go({ page: 'section', section })}>
              Browse {sectionInfo(section).label.toLowerCase()}
            </Button>
          )}
        </>
      }
    >
      {result.error?.detail ?? "Couldn't load this entry. Try again in a moment."}
    </Banner>
  );
}

/** Loads an entry's state into parchment, a skeleton, or a problem message. */
export function EntryFrame<T>({
  result,
  label,
  section,
  children,
}: {
  result: CatalogResult<T>;
  label: string;
  section: SectionId;
  children: (data: T) => ReactNode;
}) {
  if (result.data !== null) return <>{children(result.data)}</>;
  if (result.error !== null)
    return <CatalogProblem title={`Couldn't load ${label}`} result={result} section={section} />;
  return <PageSkeleton label={`Loading ${label}`} />;
}
