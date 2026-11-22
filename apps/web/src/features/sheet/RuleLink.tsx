import { createContext, useContext, type ReactNode } from 'react';
import { useTableUi, type CompendiumEntry } from '@/app';
import { LinkButton } from '@/ui';
import { capitalizeFirst } from '@bxvtt/shared/text';

/**
 * Whether names on this sheet open the rules reference. The play screen renders the compendium, so the party
 * member's sheet turns links on. The lobby renders no compendium, so a stored sheet there leaves them off.
 */
export const RuleLinksContext = createContext(false);

export interface RuleLinkProps {
  /** The compendium entry to open, or `null` for a name that must not link, such as an unidentified item. */
  entry: CompendiumEntry | null;
  children: ReactNode;
  className?: string;
}

/** A name that opens its rules entry when the sheet allows links, and plain text otherwise. */
export function RuleLink({ entry, children, className }: RuleLinkProps) {
  const enabled = useContext(RuleLinksContext);
  const openCompendium = useTableUi((s) => s.openCompendium);
  if (!enabled || entry === null) return <span className={className}>{children}</span>;
  return (
    <LinkButton
      tone="quiet"
      className={className}
      aria-label={
        typeof children === 'string' ? `${capitalizeFirst(children)} in the rules reference` : undefined
      }
      onClick={() => openCompendium(entry)}
    >
      {children}
    </LinkButton>
  );
}
