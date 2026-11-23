import { useMyRole } from '@/app';
import { Banner, Button, Card } from '@/ui';
import type { ReactNode } from 'react';
import { useBookStore } from './bookStore';
import styles from './book.module.css';

/** Whether this reader must accept the magic item notice before seeing a magic item. Referees never do. */
export function useSpoilerLocked(): boolean {
  const role = useMyRole();
  const accepted = useBookStore((s) => s.spoilersAccepted);
  return role === 'player' && !accepted;
}

/**
 * Magic item pages say what an unidentified item really does, and what a cursed one costs. A player sees this
 * notice once, then the pages. The server sends the same catalog to every role, so this notice is a courtesy
 * to the reader, not access control.
 */
export function SpoilerGate({ children }: { children: ReactNode; what?: 'section' | 'entry' }) {
  const locked = useSpoilerLocked();
  const accept = useBookStore((s) => s.acceptSpoilers);
  if (!locked) return <>{children}</>;
  return (
    <Card padding="lg" className={styles.spoilerCard}>
      <Banner tone="warning" title="Magic item spoilers">
        Magic item entries reveal full effects and curses that characters normally discover only through play.
        Continue only if you don&rsquo;t mind spoilers.
      </Banner>
      <div className={styles.spoilerActions}>
        <Button variant="primary" icon="eye" onClick={accept}>
          Show magic items
        </Button>
      </div>
    </Card>
  );
}
