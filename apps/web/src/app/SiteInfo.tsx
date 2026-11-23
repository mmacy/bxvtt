import { cx, Link } from '@/ui';
import styles from './SiteInfo.module.css';

/** Where the documentation is published. */
export const DOCS_URL = 'https://mmacy.github.io/bxvtt/';

export interface SiteInfoProps {
  /**
   * "page" puts the link and the version on one line in the bottom left corner of a `PageLayout`, whatever the
   * width of its content column. Pass it as the layout's `footer`. "stack" puts them on two short lines, for the
   * bottom of the tool rail on the play screen.
   */
  layout?: 'page' | 'stack';
  className?: string;
}

/**
 * The link to the documentation and the version of this build, in small muted text. Every screen shows it at its
 * bottom left, so a person who reports a problem can read the version off any screen. The version is the root
 * `package.json` version that the build writes into the client, so it shows even when the server is down.
 */
export function SiteInfo({ layout = 'page', className }: SiteInfoProps) {
  return (
    <div className={cx(styles.siteInfo, styles[layout], className)}>
      <Link tone="quiet" external href={DOCS_URL}>
        Docs
      </Link>
      {/* A screen reader says "v0.2.0" letter by letter, so it gets the word instead. */}
      <span aria-hidden="true">v{__BXVTT_VERSION__}</span>
      <span className="visually-hidden">Version {__BXVTT_VERSION__}</span>
    </div>
  );
}
