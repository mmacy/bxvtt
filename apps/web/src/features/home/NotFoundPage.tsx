import { Link as RouterLink } from 'react-router-dom';
import { SiteInfo } from '@/app';
import { Button, EmptyState, PageLayout } from '@/ui';
import styles from './home.module.css';

/** The page for an address the app doesn't have. */
export function NotFoundPage() {
  return (
    <PageLayout width="narrow" footer={<SiteInfo />}>
      <div className={styles.joinWrap}>
        <EmptyState
          icon="compass"
          title="Page not found"
          description="Check the address, or go back to your tables."
          action={
            <Button asChild variant="primary" icon="home">
              <RouterLink to="/">Go to your tables</RouterLink>
            </Button>
          }
        />
      </div>
    </PageLayout>
  );
}
