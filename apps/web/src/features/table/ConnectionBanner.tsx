import { useConnectionError, useConnectionStatus } from '@/app';
import { Banner, Spinner } from '@/ui';
import styles from './table.module.css';

/**
 * Says so when the table's connection drops after it opened. The page keeps everything the user typed, and the
 * table catches up by itself when the connection returns.
 *
 * @param props.floating - Draws the banner over the stage instead of in the page flow.
 */
export function ConnectionBanner({ floating = false }: { floating?: boolean }) {
  const status = useConnectionStatus();
  const error = useConnectionError();
  if (status !== 'reconnecting' && status !== 'connecting' && status !== 'authenticating') return null;
  // The server's rate limit details are written for a person, such as "Close a tab and try again."
  const limited = error?.code === 'rate_limited';
  const banner = (
    <Banner
      tone="warning"
      icon="refresh"
      title={limited ? 'The server paused this connection' : 'Connection lost. Reconnecting to the table.'}
    >
      <span className={styles.bannerRow}>
        <Spinner size={14} label="" />
        {limited
          ? `${error.detail} The page reconnects by itself.`
          : 'Nothing you typed is lost. The table catches up when the connection returns.'}
      </span>
    </Banner>
  );
  return floating ? <div className={styles.floatingBanner}>{banner}</div> : banner;
}
