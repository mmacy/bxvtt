import { useEffect, useState } from 'react';
import { Spinner } from '@/ui';
import styles from './table.module.css';

/** How long a part of the client may take to load before the loading screen shows, in milliseconds. */
const QUIET_MS = 300;

/**
 * The fallback while a part of the client loads, such as the play screen. It shows nothing for the first 300 ms,
 * so a fast connection never flashes a spinner, and then a centered spinner with a line of text. `compact` fits it
 * in a panel, such as a dock tab.
 */
export function LoadingScreen({ label = 'Loading', compact = false }: { label?: string; compact?: boolean }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setShown(true), QUIET_MS);
    return () => clearTimeout(timer);
  }, []);
  if (!shown) return null;
  return (
    <div className={compact ? styles.loadingPanel : styles.loadingScreen} role="status">
      <Spinner size={compact ? 20 : 32} label="" />
      <p>{label}</p>
    </div>
  );
}
