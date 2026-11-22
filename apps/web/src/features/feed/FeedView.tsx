import type { Member } from '@bxvtt/shared/protocol';
import type { TextContext } from '@bxvtt/shared/text';
import { createContext, useContext, type ReactNode } from 'react';
import type { MarkupNode } from './model/markup';
import styles from './feed.module.css';

/** What every feed row needs to know about the reader and the table. */
export interface FeedView {
  selfId: string | null;
  /** A referee with the lens on. */
  lens: boolean;
  ctx: TextContext;
  /** The search text, to highlight. */
  query: string;
  /** Show only what players can't see. */
  hiddenOnly: boolean;
  nameOf: (userId: string | null | undefined) => string;
  memberOf: (userId: string | null | undefined) => Member | null;
  /** Whether a roll arrived while the reader watched, so it should tumble. */
  animate: (seq: number) => boolean;
}

const FeedViewContext = createContext<FeedView | null>(null);

export function FeedViewProvider({ value, children }: { value: FeedView; children: ReactNode }) {
  return <FeedViewContext.Provider value={value}>{children}</FeedViewContext.Provider>;
}

export function useFeedView(): FeedView {
  const value = useContext(FeedViewContext);
  if (value === null) throw new Error('A feed row rendered outside the feed.');
  return value;
}

/** Text with each match of the search marked. */
export function Highlight({ text, query }: { text: string; query: string }) {
  const needle = query.trim().toLowerCase();
  if (needle === '') return <>{text}</>;
  const lower = text.toLowerCase();
  const parts: ReactNode[] = [];
  let from = 0;
  let index = lower.indexOf(needle, from);
  while (index !== -1) {
    if (index > from) parts.push(text.slice(from, index));
    parts.push(
      <mark key={index} className={styles.mark}>
        {text.slice(index, index + needle.length)}
      </mark>,
    );
    from = index + needle.length;
    index = lower.indexOf(needle, from);
  }
  if (from < text.length) parts.push(text.slice(from));
  return <>{parts}</>;
}

/** A parsed chat message as React elements. */
export function Markup({ nodes, query }: { nodes: readonly MarkupNode[]; query: string }) {
  return (
    <>
      {nodes.map((node, index) => {
        switch (node.type) {
          case 'text':
            return <Highlight key={index} text={node.text} query={query} />;
          case 'code':
            return (
              <code key={index} className={styles.code}>
                <Highlight text={node.text} query={query} />
              </code>
            );
          case 'strong':
            return (
              <strong key={index}>
                <Markup nodes={node.children} query={query} />
              </strong>
            );
          case 'em':
            return (
              <em key={index}>
                <Markup nodes={node.children} query={query} />
              </em>
            );
          case 'del':
            return (
              <del key={index}>
                <Markup nodes={node.children} query={query} />
              </del>
            );
        }
      })}
    </>
  );
}
