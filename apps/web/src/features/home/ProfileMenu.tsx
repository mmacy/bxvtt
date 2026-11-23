import { LIMITS, USER_COLORS, type UserColor } from '@bxvtt/shared/protocol';
import { useState, type FormEvent } from 'react';
import { describeProblem, displayStringProblem, useIdentity } from '@/app';
import { Avatar, Button, Field, Popover, TextInput, toast } from '@/ui';
import { DeleteProfileDialog, SignOutDialog } from './ProfileDialogs';
import styles from './home.module.css';
import profileStyles from './profile.module.css';

/**
 * Plain names for the user colors, for the color picker's accessible labels, in the palette's order. Keyed by
 * `USER_COLORS`, so a palette change that leaves a color unnamed fails the typecheck.
 */
const COLOR_NAMES: Record<(typeof USER_COLORS)[number], string> = {
  '#e76742': 'Vermilion',
  '#f29e2e': 'Saffron',
  '#e3c444': 'Gold',
  '#a4c639': 'Lime',
  '#3fae6a': 'Green',
  '#2bb3a3': 'Teal',
  '#3fa7d6': 'Sky blue',
  '#5c8de5': 'Blue',
  '#8e7ff3': 'Violet',
  '#bc70dd': 'Purple',
  '#e261a0': 'Pink',
  '#8d9cab': 'Slate',
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

/**
 * The user's avatar in the page header, which opens the profile form and the buttons that sign out and delete the
 * profile. Each button closes the menu and opens its confirm dialog.
 */
export function ProfileMenu() {
  const user = useIdentity((s) => s.user);
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<'sign-out' | 'delete' | null>(null);
  if (user === null) return null;
  const show = (next: 'sign-out' | 'delete') => {
    setOpen(false);
    setDialog(next);
  };
  const dialogProps = (kind: 'sign-out' | 'delete') => ({
    open: dialog === kind,
    onOpenChange: (next: boolean) => !next && setDialog(null),
  });
  return (
    <>
      <ProfilePopover open={open} onOpenChange={setOpen} onShow={show} />
      <SignOutDialog {...dialogProps('sign-out')} />
      <DeleteProfileDialog {...dialogProps('delete')} />
    </>
  );
}

function ProfilePopover({
  open,
  onOpenChange,
  onShow,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onShow: (dialog: 'sign-out' | 'delete') => void;
}) {
  const user = useIdentity((s) => s.user);
  if (user === null) return null;
  return (
    <Popover
      open={open}
      onOpenChange={onOpenChange}
      align="end"
      width="300px"
      title="Your profile"
      trigger={
        // The button takes its name from its text, "Ruth, your profile", which starts with the name a speech-input
        // user sees. The avatar's initial is hidden from assistive technology.
        <button type="button" className={styles.profileTrigger}>
          <Avatar name={user.name} color={user.color} size="sm" decorative />
          {/* The comma shares the name's element, so the name reads "Ruth, your profile" with no space before it. */}
          <span className={`${styles.profileName} ${styles.narrowHidden}`}>
            {user.name}
            <span className="visually-hidden-inline">, your profile</span>
          </span>
        </button>
      }
    >
      <ProfileForm onDone={() => onOpenChange(false)} />
      <div className={profileStyles.actions}>
        <Button size="sm" variant="ghost" icon="log-out" onClick={() => onShow('sign-out')}>
          Sign out
        </Button>
        <Button size="sm" variant="danger" icon="trash" onClick={() => onShow('delete')}>
          Delete profile
        </Button>
      </div>
    </Popover>
  );
}
