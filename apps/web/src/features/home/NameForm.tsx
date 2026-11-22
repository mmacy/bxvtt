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
}

/**
 * The first-run form: the visitor picks the display name the table sees, and the browser stores the new user.
 * After the server forgot a stored user, it explains that and prefills the old name.
 */
export function NameForm({ title, description, submitLabel }: NameFormProps) {
  const create = useIdentity((s) => s.create);
  const notice = useIdentity((s) => s.notice);
  const lastName = useIdentity((s) => s.lastName);
  const [name, setName] = useState(lastName ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const headingId = useId();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed === '') {
      setError('Enter a name, such as the one your friends call you.');
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
        <Banner tone="info" title="This server doesn't know you yet">
          The server no longer has the name this browser saved, so pick a name again. Your tables on this
          server stay with your old name.
        </Banner>
      )}
      <Field
        label="Your name"
        hint="The other people at the table see this name. You can change it later."
        error={error ?? undefined}
        aside={`${name.trim().length}/${LIMITS.userName}`}
      >
        <TextInput
          value={name}
          autoFocus
          autoComplete="nickname"
          maxLength={LIMITS.userName}
          placeholder="Such as Rhea"
          onChange={(event) => setName(event.target.value)}
        />
      </Field>
      <Button type="submit" variant="primary" loading={busy} block>
        {submitLabel}
      </Button>
    </form>
  );
}
