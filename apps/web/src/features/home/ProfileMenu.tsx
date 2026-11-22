import { LIMITS, USER_COLORS, type UserColor } from '@bxvtt/shared/protocol';
import { useState, type FormEvent } from 'react';
import { describeProblem, displayStringProblem, useIdentity } from '@/app';
import { Avatar, Button, Field, Popover, TextInput, toast } from '@/ui';
import styles from './home.module.css';

/** Names for the server's user colors, for the color picker's accessible labels. */
const COLOR_NAMES: Record<UserColor, string> = {
  '#e69f00': 'Orange',
  '#56b4e9': 'Sky blue',
  '#009e73': 'Green',
  '#f0e442': 'Yellow',
  '#0072b2': 'Blue',
  '#d55e00': 'Vermilion',
  '#cc79a7': 'Pink',
  '#882255': 'Wine',
  '#44aa99': 'Teal',
  '#999933': 'Olive',
  '#aa4499': 'Purple',
  '#6699cc': 'Steel blue',
};

/** The profile form: display name and color. */
export function ProfileForm({ onDone }: { onDone?: () => void }) {
  const user = useIdentity((s) => s.user);
  const update = useIdentity((s) => s.update);
  const [name, setName] = useState(user?.name ?? '');
  const [color, setColor] = useState<UserColor | null>(user?.color ?? null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (user === null) return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    const invalid = displayStringProblem(trimmed, LIMITS.userName);
    if (invalid !== null) {
      setError(invalid);
      return;
    }
    const body = {
      ...(trimmed !== user.name ? { name: trimmed } : {}),
      ...(color !== null && color !== user.color ? { color } : {}),
    };
    if (Object.keys(body).length === 0) {
      onDone?.();
      return;
    }
    setBusy(true);
    try {
      await update(body);
      toast.success('Profile saved');
      setError(null);
      onDone?.();
    } catch (problem) {
      const message = describeProblem(problem);
      setError(`${message.title}. ${message.detail}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className={styles.profileForm} onSubmit={(event) => void submit(event)}>
      <Field label="Name" error={error ?? undefined}>
        <TextInput
          value={name}
          maxLength={LIMITS.userName}
          onChange={(event) => setName(event.target.value)}
        />
      </Field>
      <fieldset className={styles.colors}>
        <legend className={styles.colorsLegend}>Color</legend>
        <div className={styles.swatches} role="radiogroup" aria-label="Color">
          {USER_COLORS.map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={color === value}
              aria-label={COLOR_NAMES[value]}
              title={COLOR_NAMES[value]}
              className={styles.swatch}
              style={{ background: value }}
              onClick={() => setColor(value)}
            />
          ))}
        </div>
      </fieldset>
      <div className={styles.formActions}>
        <Button type="submit" variant="primary" loading={busy}>
          Save profile
        </Button>
      </div>
    </form>
  );
}

/** The user's avatar in the page header, which opens the profile form. */
export function ProfileMenu() {
  const user = useIdentity((s) => s.user);
  const [open, setOpen] = useState(false);
  if (user === null) return null;
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      align="end"
      width="300px"
      title="Your profile"
      trigger={
        <button type="button" className={styles.profileTrigger} aria-label={`Your profile: ${user.name}`}>
          <Avatar name={user.name} color={user.color} size="sm" decorative />
          <span className={styles.profileName}>{user.name}</span>
        </button>
      }
    >
      <ProfileForm onDone={() => setOpen(false)} />
    </Popover>
  );
}
