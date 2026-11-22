import type { FeedEntry } from '@bxvtt/shared/protocol';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  usePreferences,
  useFeed,
  useMembers,
  useOlderFeed,
  useRefereeLens,
  useTableId,
  useTableStoreApi,
  useTableUser,
  useTextContext,
} from '@/app';
import {
  Button,
  EmptyState,
  Icon,
  IconButton,
  SearchInput,
  SegmentedControl,
  Spinner,
  breakpoints,
  cx,
  useMediaQuery,
  type SegmentedOption,
} from '@/ui';
import { buildRows, estimateRowHeight, RowCache, type FeedFilter, type FeedRow } from './model/rows';
import { readLastSeen, writeLastSeen } from './model/storage';
import { announcementFor } from './announce';
import { usePageVisible } from './usePageVisible';
import { useFeedSounds } from './sounds';
import { searchText } from './search';
import { FeedRowView } from './FeedRows';
import { FeedViewProvider, type FeedView } from './FeedView';
import { Composer } from './Composer';
import { VirtualList, type ScrollState, type VirtualListHandle } from './VirtualList';
import styles from './feed.module.css';

/** How close to the top, in pixels, starts loading older entries. */
const LOAD_OLDER_WITHIN = 600;
/** How long after it was written a roll still tumbles when it arrives. */
const FRESH_MS = 15_000;

const FILTER_EMPTY: Record<FeedFilter, { title: string; description: string }> = {
  all: { title: '', description: '' },
  chat: { title: 'No chat yet', description: 'Messages and whispers show here.' },
  rolls: { title: 'No dice rolls yet', description: 'Open the dice tray, or type /roll 1d20 to roll.' },
  game: {
    title: 'Nothing has happened in the game yet',
    description: 'Each action the party takes shows here as it happens.',
  },
  hidden: {
    title: 'Nothing hidden yet',
    description: 'Secret rolls and the events players never see show here.',
  },
};

const getKey = (row: FeedRow) => row.key;
const renderRow = (row: FeedRow) => <FeedRowView row={row} />;

/** The feed tab of the dock: chat, whispers, dice rolls, and the game log, with a message box. */
export function FeedPanel() {
  const tableId = useTableId();
  const store = useTableStoreApi();
  const feed = useFeed();
  const me = useTableUser();
  const members = useMembers();
  const lens = useRefereeLens();
  const ctx = useTextContext();
  const { loadOlder, hasOlder, loading } = useOlderFeed();
  const selfId = me?.id ?? null;

  const [filter, setFilter] = useState<FeedFilter>('all');
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [atBottom, setAtBottom] = useState(true);
  const [insert, setInsert] = useState<{ text: string; nonce: number } | null>(null);
  const list = useRef<VirtualListHandle | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const activeFilter: FeedFilter = filter === 'hidden' && !lens ? 'all' : filter;

  // The newest entry when the panel opened. Rolls after it tumble, and the unread divider starts from the last
  // entry the reader saw before.
  const [opened] = useState(() => {
    const last = store.getState().feed.at(-1)?.seq ?? 0;
    const seen = readLastSeen(tableId);
    const unread = store
      .getState()
      .feed.some((entry) => seen !== null && entry.seq > seen && entry.user_id !== selfId);
    return { last, unreadAfter: unread ? seen : null };
  });
  const [unreadAfter, setUnreadAfter] = useState<number | null>(opened.unreadAfter);
  const lastSeq = feed.at(-1)?.seq ?? 0;
  // The dock keeps the feed mounted behind other tabs, so the feed counts as read only while someone can see it.
  const compact = useMediaQuery(`(max-width: ${breakpoints.tablet - 1}px)`);
  const tabShown = usePreferences((s) => s.dockTab === 'feed' && (compact || !s.dockCollapsed));
  const pageVisible = usePageVisible();
  const shown = tabShown && pageVisible;
  // The newest entry the reader has had in view at the bottom of the list.
  const [seenSeq, setSeenSeq] = useState(lastSeq);
  if (shown && atBottom && seenSeq !== lastSeq) setSeenSeq(lastSeq);
  // When the feed is hidden, its old divider goes, and entries that arrive meanwhile get a new one.
  const [wasShown, setWasShown] = useState(shown);
  const [jumpToUnread, setJumpToUnread] = useState(0);
  if (shown !== wasShown) {
    setWasShown(shown);
    if (!shown && atBottom) setUnreadAfter(null);
    if (shown && lastSeq > seenSeq) setJumpToUnread((n) => n + 1);
  }
  // A divider for entries that arrive while the reader is scrolled up or looking elsewhere.
  if ((!atBottom || !shown) && unreadAfter === null && lastSeq > seenSeq) {
    if (feed.some((entry) => entry.seq > seenSeq && entry.user_id !== selfId)) setUnreadAfter(seenSeq);
  }

  useEffect(() => writeLastSeen(tableId, seenSeq), [tableId, seenSeq]);

  const memberMap = useMemo(() => new Map(members.map((member) => [member.user_id, member])), [members]);
  const nameOf = useCallback(
    (userId: string | null | undefined) => {
      if (userId === null || userId === undefined) return 'Someone';
      return memberMap.get(userId)?.name ?? 'A former member';
    },
    [memberMap],
  );
  const memberOf = useCallback(
    (userId: string | null | undefined) => (userId ? (memberMap.get(userId) ?? null) : null),
    [memberMap],
  );
  const animate = useCallback(
    (seq: number) => {
      if (seq <= opened.last) return false;
      const entry = store.getState().feed.find((item) => item.seq === seq);
      return entry !== undefined && Date.now() - Date.parse(entry.created_at) < FRESH_MS;
    },
    [opened.last, store],
  );

  const textOf = useCallback(
    (entry: FeedEntry) => searchText(entry, { ctx, lens, nameOf }),
    [ctx, lens, nameOf],
  );
  const [rowCache] = useState(() => new RowCache());
  const rows = useMemo(() => {
    const built = buildRows(feed, {
      selfId,
      lens,
      filter: activeFilter,
      query: searchOpen ? query : '',
      textOf,
      unreadAfter,
      now: new Date(),
    });
    return rowCache.reuse(built);
  }, [rowCache, feed, selfId, lens, activeFilter, searchOpen, query, textOf, unreadAfter]);

  const view: FeedView = useMemo(
    () => ({
      selfId,
      lens,
      ctx,
      query: searchOpen ? query : '',
      hiddenOnly: activeFilter === 'hidden',
      nameOf,
      memberOf,
      animate,
    }),
    [selfId, lens, ctx, searchOpen, query, activeFilter, nameOf, memberOf, animate],
  );

  // Start at the unread divider when there is one, and go back to it when the feed is shown again.
  const startedAtUnread = useRef(false);
  useEffect(() => {
    if (startedAtUnread.current || opened.unreadAfter === null) return;
    startedAtUnread.current = true;
    list.current?.scrollToKey('unread');
  }, [opened.unreadAfter]);
  useEffect(() => {
    if (jumpToUnread > 0) list.current?.scrollToKey('unread');
  }, [jumpToUnread]);

  const onScrollStateChange = useCallback(
    (state: ScrollState) => {
      setAtBottom(state.atBottom);
      if (state.scrollTop < LOAD_OLDER_WITHIN && hasOlder && !loading) void loadOlder();
    },
    [hasOlder, loading, loadOlder],
  );

  // Announce entries from others to screen readers, without moving focus.
  const [announcement, setAnnouncement] = useState('');
  const announced = useRef(lastSeq);
  useEffect(() => {
    const fresh = feed.filter((entry) => entry.seq > announced.current);
    announced.current = Math.max(announced.current, lastSeq);
    // A hidden feed stays quiet. The dock's tab shows the count of new entries instead.
    if (!shown) return;
    const lines = fresh
      .filter((entry) => entry.user_id !== selfId)
      .map((entry) => announcementFor(entry, { ctx, lens, selfId, nameOf }))
      .filter((line): line is string => line !== null);
    if (lines.length > 0) setAnnouncement(lines.slice(-3).join(' '));
  }, [feed, lastSeq, selfId, ctx, lens, nameOf, shown]);

  useFeedSounds(feed, selfId);

  const newCount = atBottom
    ? 0
    : feed.filter((entry) => entry.seq > seenSeq && entry.user_id !== selfId).length;

  const filterOptions: SegmentedOption[] = [
    { value: 'all', label: 'All' },
    { value: 'chat', label: 'Chat' },
    { value: 'rolls', label: 'Rolls' },
    { value: 'game', label: 'Game' },
    ...(lens ? [{ value: 'hidden', label: 'Hidden', icon: 'eye-off' as const, iconOnly: true }] : []),
  ];

  const onPosted = useCallback(() => {
    setUnreadAfter(null);
    requestAnimationFrame(() => list.current?.scrollToBottom());
  }, []);

  const visibleEntries = rows.some((row) => row.type !== 'day' && row.type !== 'unread');
  const searching = searchOpen && query.trim() !== '';
  let empty: { title: string; description: string; action?: { label: string; text: string } } | null = null;
  if (!visibleEntries) {
    if (searching) {
      empty = {
        title: 'No matches',
        description: hasOlder
          ? `Nothing in the loaded entries matches “${query.trim()}”. Load older entries to search further back.`
          : `Nothing in the feed matches “${query.trim()}”.`,
      };
    } else if (activeFilter !== 'all') {
      empty = FILTER_EMPTY[activeFilter];
    } else {
      empty = {
        title: 'The feed is quiet',
        description:
          'Chat, dice rolls, and everything that happens in the game appear here. Say hello, or roll a die to start.',
        action: { label: 'Roll a d20', text: '/roll 1d20 ' },
      };
    }
  }

  const header = (
    <div className={styles.listStart}>
      {hasOlder ? (
        <Button variant="ghost" size="sm" icon="arrow-up" loading={loading} onClick={() => void loadOlder()}>
          Load older entries
        </Button>
      ) : visibleEntries ? (
        <p className={styles.beginning}>
          <Icon name="flag" size={12} /> This is where the table’s feed begins.
        </p>
      ) : null}
    </div>
  );

  return (
    <FeedViewProvider value={view}>
      <div className={styles.panel}>
        <div className={styles.toolbar}>
          <SegmentedControl
            aria-label="Show"
            size="sm"
            options={filterOptions}
            value={activeFilter}
            onValueChange={(value) => setFilter(value as FeedFilter)}
            className={styles.filters}
          />
          <IconButton
            icon="search"
            label={searchOpen ? 'Close the search' : 'Search the feed'}
            pressed={searchOpen}
            size="sm"
            onClick={() => {
              setSearchOpen((open) => !open);
              if (!searchOpen) requestAnimationFrame(() => searchRef.current?.focus());
              else setQuery('');
            }}
          />
        </div>
        {searchOpen && (
          <div className={styles.search}>
            <SearchInput
              ref={searchRef}
              size="sm"
              value={query}
              onValueChange={setQuery}
              aria-label="Search the loaded entries"
              placeholder="Search the loaded entries"
              onKeyDown={(event) => {
                if (event.key === 'Escape' && query === '') {
                  setSearchOpen(false);
                }
              }}
            />
            {searching && countMatches(rows) > 0 && (
              <p className={styles.searchCount} aria-live="polite">
                {countMatches(rows)} {countMatches(rows) === 1 ? 'match' : 'matches'}
                {hasOlder ? ' in the loaded entries' : ''}
              </p>
            )}
          </div>
        )}
        <div className={styles.listWrap}>
          {empty !== null ? (
            <div className={styles.empty}>
              {header}
              <EmptyState
                icon={searching ? 'search' : 'feed'}
                size="compact"
                title={empty.title}
                description={empty.description}
                action={
                  empty.action ? (
                    <Button
                      size="sm"
                      icon="dice"
                      onClick={() => setInsert({ text: empty?.action?.text ?? '', nonce: Date.now() })}
                    >
                      {empty.action.label}
                    </Button>
                  ) : undefined
                }
              />
            </div>
          ) : (
            <VirtualList
              ref={list}
              className={styles.list}
              items={rows}
              getKey={getKey}
              estimateSize={estimateRowHeight}
              renderItem={renderRow}
              followOutput
              onScrollStateChange={onScrollStateChange}
              header={header}
              tabIndex={0}
              aria-label="Feed entries"
              role="region"
              aria-busy={loading}
            />
          )}
          {loading && empty === null && (
            <div className={styles.loadingOlder} aria-hidden="true">
              <Spinner size={14} label="" />
            </div>
          )}
          {newCount > 0 && (
            <button
              type="button"
              className={styles.newPill}
              onClick={() => list.current?.scrollToBottom('smooth')}
            >
              <Icon name="arrow-down" size={14} />
              {newCount === 1 ? '1 new entry' : `${newCount} new entries`}
            </button>
          )}
          {!atBottom && newCount === 0 && empty === null && (
            <button
              type="button"
              className={cx(styles.newPill, styles.jump)}
              onClick={() => list.current?.scrollToBottom('smooth')}
            >
              <Icon name="arrow-down" size={14} />
              Newest
            </button>
          )}
        </div>
        <Composer onPosted={onPosted} insert={insert} />
        <div className="visually-hidden" aria-live="polite" aria-atomic="true">
          {announcement}
        </div>
      </div>
    </FeedViewProvider>
  );
}

function countMatches(rows: readonly FeedRow[]): number {
  return rows.reduce((sum, row) => {
    switch (row.type) {
      case 'messages':
      case 'command':
        return sum + row.entries.length;
      case 'system':
        return sum + 1;
      default:
        return sum;
    }
  }, 0);
}
