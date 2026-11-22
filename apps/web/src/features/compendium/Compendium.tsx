import type { CompendiumEntry } from '@/app';
import { Button, Drawer, IconButton, Kbd, SearchInput, Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import { useBookStore } from './bookStore';
import { useCatalogs } from './catalogs';
import { CommandEntry } from './entries/CommandEntry';
import { ClassEntry } from './entries/ClassEntry';
import { EquipmentEntry } from './entries/EquipmentEntry';
import { LanguageEntry } from './entries/LanguageEntry';
import { LicenseEntry } from './entries/LicenseEntry';
import { MagicItemEntry } from './entries/MagicItemEntry';
import { MonsterEntry } from './entries/MonsterEntry';
import { SpellEntry } from './entries/SpellEntry';
import { TablesEntry } from './entries/TablesEntry';
import { Home } from './Home';
import { useIndexState } from './indexState';
import {
  HOME,
  SECTIONS,
  TABLE_SETS,
  routeFromEntry,
  routeKey,
  sectionOfRoute,
  type Route,
  type SectionId,
} from './model';
import { NavigationProvider, useNavigationState } from './navigation';
import { buildRows, recentRows, type Row } from './rows';
import { LISTBOX_ID, SearchResults, optionId, type CatalogStatus } from './SearchResults';
import { search, type ResultKind } from './search';
import { ClassesSection } from './sections/ClassesSection';
import { CommandsSection } from './sections/CommandsSection';
import { EquipmentSection } from './sections/EquipmentSection';
import { LanguagesSection } from './sections/LanguagesSection';
import { MagicItemsSection } from './sections/MagicItemsSection';
import { MonstersSection } from './sections/MonstersSection';
import { SpellsSection } from './sections/SpellsSection';
import { TablesSection } from './sections/TablesSection';
import { SpoilerGate, useSpoilerLocked } from './SpoilerGate';
import styles from './Compendium.module.css';

export interface CompendiumProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The entry to open at, such as `{ kind: 'spells', id: 'sleep' }`, or `null` for the first page. */
  entry: CompendiumEntry | null;
}

/**
 * The rules reference: classes, spells, monsters, equipment, magic items, languages, and the rule tables, from
 * the cached catalog hooks. The shell renders it, and any feature opens it with `useTableUi().openCompendium()`.
 */
export function Compendium({ open, onOpenChange, entry }: CompendiumProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [idle, setIdle] = useState(false);
  // Load the catalogs shortly after the table opens, so the first search is instant.
  useEffect(() => {
    const timer = setTimeout(() => setIdle(true), 2500);
    return () => clearTimeout(timer);
  }, []);
  return (
    <>
      {idle && <Prefetch />}
      <Drawer
        open={open}
        onOpenChange={onOpenChange}
        title="Rules reference"
        hideTitle
        flush
        width="min(900px, 88vw)"
        dimmed={false}
        initialFocus={inputRef}
        className={styles.drawer}
      >
        <Book entry={entry} inputRef={inputRef} />
      </Drawer>
    </>
  );
}

/** Starts the catalog requests. It renders nothing. */
function Prefetch() {
  useCatalogs(true);
  return null;
}

function PageView({ route }: { route: Route }) {
  switch (route.page) {
    case 'home':
      return null;
    case 'license':
      return <LicenseEntry />;
    case 'section':
      switch (route.section) {
        case 'classes':
          return <ClassesSection />;
        case 'spells':
          return <SpellsSection />;
        case 'monsters':
          return <MonstersSection />;
        case 'equipment':
          return <EquipmentSection />;
        case 'magic-items':
          return <MagicItemsSection />;
        case 'languages':
          return <LanguagesSection />;
        case 'tables':
          return <TablesSection />;
        case 'commands':
          return <CommandsSection />;
      }
      return null;
    case 'entry':
      switch (route.kind) {
        case 'classes':
          return <ClassEntry id={route.id} />;
        case 'spells':
          return <SpellEntry id={route.id} />;
        case 'monsters':
          return <MonsterEntry id={route.id} />;
        case 'equipment':
          return <EquipmentEntry id={route.id} />;
        case 'magic-items':
          return (
            <SpoilerGate what="entry">
              <MagicItemEntry id={route.id} />
            </SpoilerGate>
          );
        case 'languages':
          return <LanguageEntry id={route.id} />;
        case 'tables':
          return TABLE_SETS.some((set) => set.id === route.id) ? (
            <TablesEntry id={route.id} anchor={route.anchor} />
          ) : (
            <TablesSection />
          );
        case 'commands':
          return <CommandEntry id={route.id} />;
      }
  }
}

function statusOf(
  label: string,
  catalog: { loading: boolean; error: unknown; retry: () => void },
): CatalogStatus {
  return { label, loading: catalog.loading, failed: catalog.error !== null, retry: catalog.retry };
}

function Book({
  entry,
  inputRef,
}: {
  entry: CompendiumEntry | null;
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  const nav = useNavigationState(entry ? routeFromEntry(entry) : HOME);
  const { route, go, back, forward } = nav;
  const catalogs = useCatalogs(true);
  const locked = useSpoilerLocked();
  const recents = useBookStore((s) => s.recents);
  const remember = useBookStore((s) => s.remember);
  const forgetRecents = useBookStore((s) => s.forgetRecents);
  const acceptSpoilers = useBookStore((s) => s.acceptSpoilers);
  const resetIndex = useIndexState((s) => s.reset);

  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [expanded, setExpanded] = useState<ReadonlySet<ResultKind>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const shownKey = useRef<string | null>(null);
  const positions = useRef(new Map<string, number>());
  const currentKey = routeKey(route);

  // A fresh book starts with unfiltered indexes.
  useEffect(() => {
    resetIndex();
  }, [resetIndex]);

  // Opening the book at another entry while it is open turns to that page.
  const [seenEntry, setSeenEntry] = useState(entry);
  if (entry !== seenEntry) {
    setSeenEntry(entry);
    if (entry) {
      go(routeFromEntry(entry));
      setQuery('');
    }
  }

  useEffect(() => {
    remember(route);
  }, [route, remember]);

  // Escape clears the search first. The drawer would otherwise close on the same key press.
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || query === '' || document.activeElement !== inputRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      setQuery('');
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [query, inputRef]);

  // Each page keeps its scroll position, and a new page starts at the top.
  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    element.scrollTop = positions.current.get(currentKey) ?? 0;
    // The first page leaves focus where the drawer put it. A later page takes focus, so a link that went away
    // doesn't leave it on the page behind.
    const turned = shownKey.current !== null && shownKey.current !== currentKey;
    shownKey.current = currentKey;
    if (turned && document.activeElement !== inputRef.current) element.focus({ preventScroll: true });
  }, [currentKey, inputRef]);

  const statuses: CatalogStatus[] = [
    statusOf('classes', catalogs.classes),
    statusOf('spells', catalogs.spells),
    statusOf('monsters', catalogs.monsters),
    statusOf('equipment', catalogs.equipment),
    statusOf('magic items', catalogs.magicItems),
    statusOf('languages', catalogs.languages),
  ];
  const searching = query.trim() !== '';
  const groups = useMemo(() => search(catalogs.items, query), [catalogs.items, query]);
  const result = useMemo(() => buildRows(groups, expanded, locked), [groups, expanded, locked]);
  const recent = useMemo(
    () => recentRows(recents, catalogs.items, locked),
    [recents, catalogs.items, locked],
  );
  const rows: Row[] = searching ? result.flat : route.page === 'home' ? recent : [];
  const activeIndex = Math.min(active, Math.max(rows.length - 1, 0));

  const choose = useCallback(
    (row: Row) => {
      if (row.type === 'item') {
        go(row.item.route);
        setQuery('');
        setActive(0);
      } else if (row.type === 'more') {
        setExpanded((current) => new Set(current).add(row.kind));
      } else {
        acceptSpoilers();
      }
    },
    [go, acceptSpoilers],
  );

  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (rows.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((activeIndex + 1) % rows.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((activeIndex - 1 + rows.length) % rows.length);
    } else if (event.key === 'Home' && searching) {
      event.preventDefault();
      setActive(0);
    } else if (event.key === 'End' && searching) {
      event.preventDefault();
      setActive(rows.length - 1);
    } else if (event.key === 'Enter') {
      const row = rows[activeIndex];
      if (row) {
        event.preventDefault();
        choose(row);
      }
    }
  };

  // Keep the active row in view as the arrow keys move it.
  useEffect(() => {
    if (rows.length === 0) return;
    document.getElementById(optionId(activeIndex))?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, rows.length, query]);

  const onBookKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.altKey && event.key === 'ArrowLeft') {
      event.preventDefault();
      back();
    } else if (event.altKey && event.key === 'ArrowRight') {
      event.preventDefault();
      forward();
    } else if (
      event.key === '/' &&
      !(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)
    ) {
      event.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  };

  const section: SectionId | null = sectionOfRoute(route);
  const tabValue = searching ? 'search' : (section ?? 'home');
  const expandedList = rows.length > 0;

  // A narrow drawer scrolls its tab strip, so bring the current section's tab into view.
  useEffect(() => {
    document
      .querySelector('[role="tab"][data-state="active"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [tabValue]);

  return (
    <NavigationProvider value={nav}>
      <div className={styles.book} onKeyDown={onBookKeyDown}>
        <div className={styles.top}>
          <div className={styles.nav}>
            <IconButton
              icon="arrow-left"
              label="Back"
              title="Back (Alt+Left)"
              variant="ghost"
              disabled={!nav.canGoBack}
              onClick={back}
            />
            <IconButton
              icon="arrow-right"
              label="Forward"
              title="Forward (Alt+Right)"
              variant="ghost"
              disabled={!nav.canGoForward}
              onClick={forward}
            />
          </div>
          <SearchInput
            ref={inputRef}
            size="lg"
            className={styles.searchInput}
            wrapperClassName={styles.search}
            placeholder="Search spells, monsters, items"
            aria-label="Search the rules"
            role="combobox"
            aria-expanded={expandedList}
            aria-controls={expandedList ? LISTBOX_ID : undefined}
            aria-activedescendant={expandedList ? optionId(activeIndex) : undefined}
            aria-autocomplete="list"
            autoComplete="off"
            spellCheck={false}
            value={query}
            onValueChange={(value) => {
              setQuery(value);
              setActive(0);
              setExpanded(new Set());
            }}
            onKeyDown={onSearchKeyDown}
          />
        </div>

        <Tabs
          value={tabValue}
          onValueChange={(value) =>
            go(value === 'home' ? HOME : { page: 'section', section: value as SectionId })
          }
          className={styles.tabs}
        >
          <TabsList aria-label="Sections of the rules reference" className={styles.tabList}>
            <TabsTrigger value="home" icon="book">
              Contents
            </TabsTrigger>
            {SECTIONS.map((item) => (
              <TabsTrigger key={item.id} value={item.id}>
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value={tabValue} className={styles.panel}>
            <div
              ref={scrollRef}
              className={styles.scroll}
              tabIndex={-1}
              onScroll={(event) => {
                const key = event.currentTarget.dataset['route'];
                if (key) positions.current.set(key, event.currentTarget.scrollTop);
              }}
              data-route={searching ? undefined : currentKey}
              data-page={searching ? 'search' : currentKey}
            >
              {searching ? (
                <SearchResults
                  statuses={statuses}
                  groups={result.groups}
                  query={query}
                  activeIndex={activeIndex}
                  onHover={setActive}
                  onChoose={choose}
                  onClear={() => setQuery('')}
                />
              ) : route.page === 'home' ? (
                <Home
                  catalogs={catalogs}
                  recents={recent}
                  activeIndex={activeIndex}
                  onHover={setActive}
                  onChoose={choose}
                  onForget={forgetRecents}
                  onExample={(example) => {
                    setQuery(example);
                    setActive(0);
                    inputRef.current?.focus();
                  }}
                />
              ) : (
                <div className={styles.page}>
                  <PageView route={route} />
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        <footer className={styles.footer}>
          <span className={styles.hints}>
            <Kbd keys="Up" /> <Kbd keys="Down" /> move <Kbd keys="Enter" /> open <Kbd keys="Esc" /> clear or
            close
          </span>
          <Button
            variant="ghost"
            size="sm"
            icon="scroll"
            onClick={() => {
              setQuery('');
              go({ page: 'license' });
            }}
          >
            Open Game License
          </Button>
        </footer>
      </div>
    </NavigationProvider>
  );
}
