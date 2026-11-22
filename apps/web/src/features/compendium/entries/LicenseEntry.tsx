import { useRulesLicense } from '@/app';
import { CatalogProblem, PageSkeleton } from '../Frame';
import { EntryPage } from '../Parts';
import styles from '../book.module.css';

/** The license of the rules content, with its name and text exactly as the server sends them. */
export function LicenseEntry() {
  const license = useRulesLicense();
  if (license.data === null) {
    return license.error ? (
      <CatalogProblem title="Couldn't load the license" result={license} />
    ) : (
      <PageSkeleton label="Loading the license" />
    );
  }
  return (
    <EntryPage kicker="Legal" title={license.data.name}>
      <pre className={styles.license} tabIndex={0} aria-label="License text">
        {license.data.text}
      </pre>
    </EntryPage>
  );
}
