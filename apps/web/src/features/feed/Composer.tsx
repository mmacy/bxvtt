import { LIMITS, type FeedEntry, type PostFeedRequest } from '@bxvtt/shared/protocol';
import { joinList } from '@bxvtt/shared/text';
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  describeProblem,
  getApi,
  useIsReferee,
  useMembers,
  useTableId,
  useTableStoreApi,
  useTableUser,
} from '@/app';
import { DropdownMenu, Icon, IconButton, Kbd, Tag, Textarea, cx, type MenuEntry } from '@/ui';
import { matchSlashCommands, parseComposer, SLASH_COMMANDS, type Recipient } from './model/commands';
import { EMPTY_TRAY, trayExpression, type TrayState } from './model/dice';
import { readDraft, writeDraft } from './model/storage';
import { DiceTray } from './DiceTray';
import styles from './composer.module.css';

/** The dice tray's choices per table, kept while the panel is closed. */
const trays = new Map<string, { tray: TrayState; label: string; secret: boolean; open: boolean }>();

const COUNT_FROM = LIMITS.feedText - 400;

export interface ComposerProps {
  /** Called with the entry the server stored, so the feed can show it at once. */
  onPosted: (entry: FeedEntry) => void;
  /** Text to put in the composer, such as a slash command picked from the empty state. */
  insert?: { text: string; nonce: number } | null;
}

/** The message box: chat, whispers, `/roll`, the dice tray, and the slash command list. */
export function Composer({ onPosted, insert }: ComposerProps) {
  const tableId = useTableId();
  const store = useTableStoreApi();
  const me = useTableUser();
  const members = useMembers();
  const referee = useIsReferee();
  const stored = useMemo(() => readDraft(tableId), [tableId]);
  const [text, setText] = useState(stored.text);
  const [to, setTo] = useState<string[]>(stored.to);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [dismissedSlash, setDismissedSlash] = useState<string | null>(null);
  const savedTray = trays.get(tableId);
  const [tray, setTray] = useState<TrayState>(savedTray?.tray ?? EMPTY_TRAY);
  const [trayLabel, setTrayLabel] = useState(savedTray?.label ?? '');
  const [secret, setSecret] = useState(savedTray?.secret ?? false);
  const [trayOpen, setTrayOpen] = useState(savedTray?.open ?? false);
  const input = useRef<HTMLTextAreaElement | null>(null);
  const listId = useId();
  const errorId = useId();
  const countId = useId();
  const hintId = useId();

  const recipients: Recipient[] = useMemo(
    () =>
      members
        .filter((member) => member.user_id !== me?.id)
        .map((member) => ({ user_id: member.user_id, name: member.name, role: member.role })),
    [members, me?.id],
  );
  // A whisper can only go to someone still at the table.
  const targets = useMemo(
    () => to.filter((id) => recipients.some((r) => r.user_id === id)),
    [to, recipients],
  );
  const targetNames = targets.map((id) => recipients.find((r) => r.user_id === id)?.name ?? '');
  const otherReferees = recipients.filter((r) => r.role === 'referee');

  useEffect(() => writeDraft(tableId, { text, to: targets }), [tableId, text, targets]);
  useEffect(() => {
    trays.set(tableId, { tray, label: trayLabel, secret, open: trayOpen });
  }, [tableId, tray, trayLabel, secret, trayOpen]);

  const [insertNonce, setInsertNonce] = useState<number | null>(null);
  if (insert && insert.nonce !== insertNonce) {
    setInsertNonce(insert.nonce);
    setText(insert.text);
    setError(null);
  }
  useEffect(() => {
    if (insertNonce !== null) input.current?.focus();
  }, [insertNonce]);

  const suggestions = dismissedSlash === text ? [] : matchSlashCommands(text, referee);
  const activeIndex = Math.min(active, Math.max(0, suggestions.length - 1));

  const post = useCallback(
    async (body: PostFeedRequest): Promise<boolean> => {
      setPending(true);
      setError(null);
      try {
        const entry = await getApi().postFeed(tableId, body);
        store.getState().receiveFeedPage({ entries: [entry], has_more: false }, 'newer');
        onPosted(entry);
        return true;
      } catch (caught) {
        const problem = describeProblem(caught);
        setError(
          problem.code === 'content_invalid' || problem.code === 'validation_error'
            ? 'Invalid dice roll. Use one die type with an optional count and modifier, such as 2d6+1.'
            : `${problem.title}. ${problem.detail}`,
        );
        return false;
      } finally {
        setPending(false);
      }
    },
    [tableId, store, onPosted],
  );

  const send = async () => {
    if (pending) return;
    const intent = parseComposer(text, { recipients, selfId: me?.id ?? null, referee });
    switch (intent.kind) {
      case 'empty':
        return;
      case 'help':
        setHelpOpen(true);
        setText('');
        return;
      case 'error':
        setError(intent.message);
        return;
      case 'whisper':
        if (await post({ text: intent.text, to: intent.to })) setText('');
        return;
      case 'roll':
      case 'chat': {
        const body: PostFeedRequest = { text: intent.text };
        if (targets.length > 0) body.to = targets;
        if (await post(body)) setText('');
        return;
      }
    }
  };

  const rollTray = async () => {
    const expression = trayExpression(tray);
    if (expression === null || pending) return;
    const useSecret = referee && secret;
    const label = trayLabel.trim();
    const body: PostFeedRequest = {
      text: `/roll ${useSecret ? 'secret ' : ''}${expression}${label ? ` ${label}` : ''}`,
    };
    if (targets.length > 0 && !useSecret) body.to = targets;
    if (await post(body)) setTrayLabel('');
  };

  const complete = (index: number) => {
    const command = suggestions[index];
    if (!command) return;
    if (command.insert === '/help') {
      setText('');
      setHelpOpen(true);
    } else {
      setText(command.insert);
    }
    setActive(0);
    input.current?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (suggestions.length > 0) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        setActive((activeIndex + step + suggestions.length) % suggestions.length);
        return;
      }
      if (
        event.key === 'Tab' ||
        (event.key === 'Enter' && !event.shiftKey && suggestions[activeIndex]?.insert.trim() !== text.trim())
      ) {
        event.preventDefault();
        complete(activeIndex);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setDismissedSlash(text);
        return;
      }
    }
    if (event.key === 'Escape' && (helpOpen || trayOpen)) {
      event.preventDefault();
      event.stopPropagation();
      setHelpOpen(false);
      setTrayOpen(false);
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  };

  const toggle = (userId: string, on: boolean) =>
    setTo((current) => (on ? [...new Set([...current, userId])] : current.filter((id) => id !== userId)));
  const refereesChecked = otherReferees.length > 0 && otherReferees.every((r) => targets.includes(r.user_id));
  const menu: MenuEntry[] = [
    { type: 'label', label: 'Whisper to' },
    ...recipients.map<MenuEntry>((recipient) => ({
      type: 'checkbox',
      label: recipient.role === 'referee' ? `${recipient.name} (referee)` : recipient.name,
      checked: targets.includes(recipient.user_id),
      onCheckedChange: (checked) => toggle(recipient.user_id, checked),
    })),
    ...(otherReferees.length > 0
      ? ([
          { type: 'separator' },
          {
            type: 'checkbox',
            label: 'Every referee',
            checked: refereesChecked,
            onCheckedChange: (checked: boolean) =>
              setTo((current) =>
                checked
                  ? [...new Set([...current, ...otherReferees.map((r) => r.user_id)])]
                  : current.filter((id) => !otherReferees.some((r) => r.user_id === id)),
              ),
          },
        ] as MenuEntry[])
      : []),
    { type: 'separator' },
    {
      label: 'Send to everyone',
      icon: 'users',
      disabled: targets.length === 0,
      disabledReason: targets.length === 0 ? 'Your message already goes to everyone.' : null,
      onSelect: () => setTo([]),
    },
  ];

  const length = text.trim().length;
  const over = length > LIMITS.feedText;
  const describedBy = [error ? errorId : null, length >= COUNT_FROM ? countId : null, hintId]
    .filter(Boolean)
    .join(' ');
  const whispering = targets.length > 0;
  const meColor = members.find((member) => member.user_id === me?.id)?.color;

  return (
    <div className={cx(styles.composer, whispering && styles.composerWhisper)}>
      {trayOpen && (
        <DiceTray
          tray={tray}
          onTrayChange={setTray}
          label={trayLabel}
          onLabelChange={setTrayLabel}
          secret={secret}
          onSecretChange={setSecret}
          canRollSecret={referee}
          whisperTo={whispering ? joinList(targetNames) : null}
          pending={pending}
          onRoll={() => void rollTray()}
          onClose={() => {
            setTrayOpen(false);
            input.current?.focus();
          }}
          color={meColor}
        />
      )}
      {helpOpen && (
        <section className={styles.help} aria-label="Commands">
          <div className={styles.trayHeader}>
            <p className={styles.trayTitle}>Commands</p>
            <IconButton
              icon="close"
              label="Close command list"
              size="sm"
              onClick={() => setHelpOpen(false)}
            />
          </div>
          <dl className={styles.helpList}>
            {SLASH_COMMANDS.filter((command) => referee || !command.refereeOnly).map((command) => (
              <div key={command.usage} className={styles.helpItem}>
                <dt>
                  <code>{command.usage}</code>
                </dt>
                <dd>{command.description}</dd>
              </div>
            ))}
          </dl>
          <p className={styles.helpKeys}>
            <Kbd keys="Enter" /> sends. <Kbd keys={['Shift', 'Enter']} /> adds a new line. Use{' '}
            <code>**bold**</code> or <code>*italic*</code> for emphasis.
          </p>
        </section>
      )}
      {whispering && (
        <div className={styles.whisperBar}>
          <Icon name="whisper" size={14} />
          <span className={styles.whisperLabel}>Whisper to</span>
          {targets.map((id, index) => (
            <Tag
              key={id}
              removeLabel={`Stop whispering to ${targetNames[index]}`}
              onRemove={() => toggle(id, false)}
            >
              {targetNames[index]}
            </Tag>
          ))}
        </div>
      )}
      {suggestions.length > 0 && (
        <ul id={listId} className={styles.suggestions} role="listbox" aria-label="Commands">
          {suggestions.map((command, index) => (
            <li
              key={command.usage}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              className={cx(styles.suggestion, index === activeIndex && styles.suggestionActive)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => complete(index)}
            >
              <code>{command.usage}</code>
              <span>{command.description}</span>
            </li>
          ))}
        </ul>
      )}
      <div className={styles.inputRow}>
        <Textarea
          ref={input}
          minRows={1}
          autoGrow
          maxRows={6}
          value={text}
          aria-label={whispering ? `Whisper to ${joinList(targetNames)}` : 'Message the table'}
          aria-describedby={describedBy}
          aria-invalid={over || undefined}
          aria-controls={suggestions.length > 0 ? listId : undefined}
          aria-activedescendant={suggestions.length > 0 ? `${listId}-${activeIndex}` : undefined}
          aria-autocomplete="list"
          placeholder={whispering ? `Whisper to ${joinList(targetNames)}` : 'Message the table'}
          wrapperClassName={styles.textareaWrap}
          onChange={(event) => {
            setText(event.target.value);
            setActive(0);
            if (error) setError(null);
          }}
          onKeyDown={onKeyDown}
        />
        <div className={styles.tools}>
          <IconButton
            icon="dice"
            label="Dice tray"
            pressed={trayOpen}
            size="sm"
            onClick={() => setTrayOpen((open) => !open)}
          />
          <DropdownMenu
            side="top"
            align="end"
            items={menu}
            trigger={
              <IconButton
                icon="whisper"
                label="Whisper"
                tooltip="Whisper to one or more people at the table"
                pressed={whispering}
                size="sm"
                disabled={recipients.length === 0}
                disabledReason="No one else is at the table to whisper to."
              />
            }
          />
          <IconButton
            icon="send"
            label={whispering ? 'Send whisper' : 'Send'}
            variant={trayOpen ? 'secondary' : 'primary'}
            size="sm"
            loading={pending}
            disabled={length === 0 || over}
            disabledReason={
              over
                ? `Shorten your message to ${LIMITS.feedText.toLocaleString()} characters or fewer.`
                : 'Type a message to send it.'
            }
            onClick={() => void send()}
          />
        </div>
      </div>
      <div className={styles.footer}>
        <p id={hintId} className={styles.hint}>
          {helpOpen ? (
            ''
          ) : (
            <>
              <Kbd keys="Enter" /> sends, <Kbd keys={['Shift', 'Enter']} /> adds a line
              <span className={styles.hintSlash}>
                , <Kbd keys="/" /> shows commands
              </span>
            </>
          )}
        </p>
        {length >= COUNT_FROM && (
          <p id={countId} className={cx(styles.count, over && styles.countOver)}>
            {length.toLocaleString()} of {LIMITS.feedText.toLocaleString()} characters
          </p>
        )}
      </div>
      {error !== null && (
        <p id={errorId} className={styles.error} role="alert">
          <Icon name="error" size={14} />
          {error}
        </p>
      )}
    </div>
  );
}
