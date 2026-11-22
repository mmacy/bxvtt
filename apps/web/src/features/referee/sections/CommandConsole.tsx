/**
 * Every referee command bxapi offers, each with a complete form built from its JSON schema. The list comes
 * from the command catalog, so a command that bxapi adds later appears here without a change to this client.
 */
import { COMMAND_TYPES, commandInfo, sessionModeLabel } from '@bxvtt/shared/text';
import { useMemo, useState } from 'react';
import { useCommandCatalog, useLegalCommands } from '@/app';
import { Accordion, Banner, Button, SearchInput, Skeleton } from '@/ui';
import { CommandForm } from '../schema/CommandForm';
import { changesEndedStory, useGameEnded } from '../endedGuard';
import { NameComma, UnavailableMark } from '../UnavailableMark';
import styles from './sections.module.css';

/** A catalog summary as plain text: without the `Referee:` prefix and code marks. */
function plainSummary(summary: string): string {
  return summary.replace(/^Referee:\s*/, '').replace(/`/g, '');
}

export function CommandConsole() {
  const catalog = useCommandCatalog();
  const legal = useLegalCommands();
  const ended = useGameEnded();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState('');
  const known = useMemo(() => new Set(COMMAND_TYPES), []);
  const legalSet = useMemo(() => new Set(legal.map((c) => c.command_type)), [legal]);
  const commands = useMemo(() => {
    const list = (catalog.data ?? []).filter((c) => c.kind === 'referee');
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return list
      .map((c) => {
        const info = commandInfo(c.command_type);
        return {
          type: c.command_type,
          label: info.label,
          description: known.has(c.command_type) ? info.description : plainSummary(c.summary),
          modes: c.allowed_modes,
        };
      })
      .filter((c) => {
        const hay = `${c.label} ${c.description} ${c.type}`.toLowerCase();
        return words.every((w) => hay.includes(w));
      })
      .sort(
        (a, b) =>
          Number(legalSet.has(b.type)) - Number(legalSet.has(a.type)) || a.label.localeCompare(b.label),
      );
  }, [catalog.data, query, known, legalSet]);

  if (catalog.loading) return <Skeleton lines={8} />;
  if (catalog.error) {
    return (
      <Banner
        tone="danger"
        title="The command list didn't load"
        actions={
          <Button size="sm" variant="secondary" onClick={catalog.retry}>
            Try again
          </Button>
        }
      >
        {catalog.error.detail}
      </Banner>
    );
  }
  return (
    <div className={styles.section}>
      <p className={styles.secondaryLine}>
        Every referee command the rules engine offers, with a form built from its rules. The ones you can send
        now come first.
      </p>
      <SearchInput
        value={query}
        onValueChange={setQuery}
        placeholder="Search commands"
        aria-label="Search commands"
      />
      {commands.length === 0 && <p className={styles.secondaryLine}>No command matches.</p>}
      <Accordion
        type="single"
        value={open}
        onValueChange={setOpen}
        items={commands.map((c) => {
          const now = legalSet.has(c.type);
          return {
            value: c.type,
            title: (
              <span className={styles.triggerTitle}>
                {c.label}
                <span className={styles.secondary}>
                  {c.description}
                  {(!now || (ended && changesEndedStory(c.type))) && <NameComma />}
                </span>
              </span>
            ),
            meta: !now ? (
              <UnavailableMark />
            ) : ended && changesEndedStory(c.type) ? (
              <UnavailableMark>The game is over</UnavailableMark>
            ) : undefined,
            content:
              open === c.type ? (
                <div className={styles.form}>
                  {!now && (
                    <p className={styles.secondaryLine}>
                      Allowed in: {c.modes.map((m) => sessionModeLabel(m).toLowerCase()).join(', ')}.
                    </p>
                  )}
                  <CommandForm commandType={c.type} />
                </div>
              ) : null,
          };
        })}
      />
    </div>
  );
}
