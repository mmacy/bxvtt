import { createContext, useContext, type ReactNode } from 'react';
import { useTableUi, type CompendiumEntry } from '@/app';
import { LinkButton } from '@/ui';

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
    <LinkButton tone="quiet" className={className} onClick={() => openCompendium(entry)}>
      {children}
      <span className="visually-hidden"> (open in the rules reference)</span>
    </LinkButton>
  );
}
