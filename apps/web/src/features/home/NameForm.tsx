import { LIMITS } from '@bxvtt/shared/protocol';
import { useId, useState, type FormEvent } from 'react';
import { describeProblem, displayStringProblem, useIdentity } from '@/app';
import { Banner, Button, Field, TextInput } from '@/ui';
import styles from './home.module.css';

export interface NameFormProps {
  /** The form's heading. */
  title: string;
  /** One or two sentences under the heading. */
  description?: string;
  /** The submit button's label. */
  submitLabel: string;
  /** Whether the form is on an invite link's page, which changes how it explains coming back in. */
  onInvitePage?: boolean;
}

/**
 * The first-run form: the visitor picks the display name the table sees, and the browser stores the new user.
 * After the server forgot a stored user, it explains that and prefills the old name. After a referee let the user
 * back in from another browser, it explains how to come back in here instead, and leaves the name empty, so
 * nobody makes a second member with the same name by accident.
 */
export function NameForm({ title, description, submitLabel, onInvitePage = false }: NameFormProps) {
  const create = useIdentity((s) => s.create);
  const notice = useIdentity((s) => s.notice);
  const lastName = useIdentity((s) => s.lastName);
  const [name, setName] = useState(notice === 'retired' ? '' : (lastName ?? ''));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const headingId = useId();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed === '') {
      setError('Enter your display name.');
      return;
    }
    const invalid = displayStringProblem(trimmed, LIMITS.userName);
    if (invalid !== null) {
      setError(invalid);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await create(trimmed);
    } catch (problem) {
      const message = describeProblem(problem);
      setError(`${message.title}. ${message.detail}`);
      setBusy(false);
    }
  };

  return (
    <form className={styles.nameForm} onSubmit={(event) => void submit(event)} aria-labelledby={headingId}>
      <h2 id={headingId} className={styles.formTitle}>
        {title}
      </h2>
      {description && <p className={styles.formLead}>{description}</p>}
      {notice === 'forgotten' && (
        <Banner tone="info" title="Choose your name to continue">
          Your previous sign-in is no longer stored on this server. Enter a name to create a new sign-in.
        </Banner>
      )}
      {notice === 'retired' && (
        <Banner tone="info" title="You signed in from another browser">
          A referee approved a rejoin request for {lastName ?? 'you'} in another browser, which signed this
          browser out.{' '}
          {onInvitePage
            ? `To play as ${lastName ?? 'yourself'} here, select your name under "I've played at this table before" below, or enter a new name to join as a new member.`
            : `To play as ${lastName ?? 'yourself'} here, open the table's invite link in this browser and select "I've played at this table before", or enter a new name to start fresh.`}
        </Banner>
      )}
      <Field
        label="Your name"
        hint="Other players at the table see this name. You can change it anytime."
        error={error ?? undefined}
        aside={`${name.trim().length}/${LIMITS.userName}`}
      >
        <TextInput
          value={name}
          autoFocus
          autoComplete="nickname"
          maxLength={LIMITS.userName}
          placeholder="Rhea"
          onChange={(event) => setName(event.target.value)}
        />
      </Field>
      <Button type="submit" variant="primary" loading={busy} block>
        {submitLabel}
      </Button>
    </form>
  );
}
