/**
 * A complete, validated form for any referee command, built from the command's JSON schema. The quick actions
 * reuse it wherever a purpose-built form would add nothing, and the command console renders it for every
 * command bxapi offers, including commands added after this client was written.
 */
import { commandInfo } from '@bxvtt/shared/text';
import { useCallback, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useCommandSchema } from '@/app';
import { Banner, Button, Skeleton } from '@/ui';
import { CommandOutcome, useRefereeCommand } from '../RefereeCommand';
import styles from '../referee.module.css';
import { useCommandReason } from '../useCommandReason';
import { useRefereeData } from '../useReferee';
import { FieldList, FormEnvContext, type FormEnv } from './fields';
import {
  buildCommand,
  commandFields,
  initialValue,
  validateFields,
  type FieldSpec,
  type FormErrors,
  type FormValue,
  type JsonSchema,
} from './model';

export interface CommandFormProps {
  commandType: string;
  /** Values the form sends without showing their fields. */
  fixed?: Record<string, unknown>;
  /** Values the form starts with, over the schema's defaults. */
  initial?: Record<string, unknown>;
  /** Fields not to show. They keep their defaults. */
  hide?: readonly string[];
  /** Shows `source`, which records who issued the command, and hides nothing else. */
  showSource?: boolean;
  submitLabel?: string;
  /** Clears the form after bxapi accepts the command, for one-off text such as a journal entry. */
  resetOnAccept?: boolean;
  /** Content between the fields and the send button, such as a note about the command. */
  children?: ReactNode;
  onAccepted?: () => void;
}

/** Loads a command's schema and renders its form. */
export function CommandForm(props: CommandFormProps) {
  const schema = useCommandSchema(props.commandType);
  if (schema.loading) {
    return (
      <div className={styles.form} aria-busy="true">
        <Skeleton lines={3} />
      </div>
    );
  }
  if (schema.error || !schema.data) {
    return (
      <Banner
        tone="danger"
        title="Couldn't load command form"
        actions={
          <Button size="sm" variant="secondary" onClick={schema.retry}>
            Try again
          </Button>
        }
      >
        {schema.error?.detail ?? 'Try again in a moment.'}
      </Banner>
    );
  }
  return (
    <SchemaForm
      key={props.commandType}
      {...props}
      schema={schema.data.json_schema as unknown as JsonSchema}
    />
  );
}

function startValues(fields: readonly FieldSpec[], initial: Record<string, unknown> | undefined) {
  const values: Record<string, FormValue> = {};
  for (const field of fields) {
    const value = initialValue(field);
    if (value !== undefined) values[field.name] = value;
  }
  return { ...values, ...initial };
}

/** The form for one schema. Exported for tests that pass a schema directly. */
export function SchemaForm({
  commandType,
  schema,
  fixed,
  initial,
  hide,
  showSource = false,
  submitLabel,
  resetOnAccept = false,
  children,
  onAccepted,
}: CommandFormProps & { schema: JsonSchema }) {
  const data = useRefereeData();
  const { available, reason } = useCommandReason(commandType);
  const fields = useMemo(() => commandFields(schema), [schema]);
  const [values, setValues] = useState(() => startValues(fields, initial));
  const [showErrors, setShowErrors] = useState(false);
  const [extraErrors, setExtraErrors] = useState<FormErrors>({});
  const { run, busy, outcome, clear } = useRefereeCommand();

  const merged = useMemo(() => ({ ...values, ...fixed }), [values, fixed]);
  const errors = useMemo(
    () => ({ ...validateFields(fields, merged), ...extraErrors }),
    [fields, merged, extraErrors],
  );
  const setExtraError = useCallback((path: string, message: string | null) => {
    setExtraErrors((current) => {
      if (message === null) {
        if (!(path in current)) return current;
        const { [path]: _removed, ...rest } = current;
        return rest;
      }
      return current[path] === message ? current : { ...current, [path]: message };
    });
  }, []);

  const hidden = useMemo(() => {
    const set = new Set<string>([...(hide ?? []), ...Object.keys(fixed ?? {})]);
    if (!showSource) set.add('source');
    return set;
  }, [hide, fixed, showSource]);

  const env: FormEnv = useMemo(
    () => ({ commandType, data, errors, showErrors, setExtraError }),
    [commandType, data, errors, showErrors, setExtraError],
  );

  const info = commandInfo(commandType);
  const errorCount = Object.keys(errors).length;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (errorCount > 0) {
      setShowErrors(true);
      clear();
      return;
    }
    const accepted = await run(buildCommand(commandType, merged));
    if (accepted) {
      setShowErrors(false);
      if (resetOnAccept) setValues(startValues(fields, initial));
      onAccepted?.();
    }
  };

  return (
    <FormEnvContext.Provider value={env}>
      <form className={styles.form} onSubmit={submit} noValidate aria-label={info.label}>
        <FieldList
          fields={fields}
          values={values}
          onValuesChange={(next) => {
            setValues(next);
            if (outcome?.status !== 'accepted') clear();
          }}
          path=""
          parentName={null}
          depth={0}
          hidden={hidden}
        />
        {children}
        {showErrors && errorCount > 0 && (
          <p className={styles.formError} role="alert">
            {errorCount === 1
              ? 'Fix 1 highlighted field before sending.'
              : `Fix ${errorCount} highlighted fields before sending.`}
          </p>
        )}
        <div className={styles.actions}>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            loading={busy}
            disabled={!available}
            disabledReason={reason}
          >
            {submitLabel ?? info.button}
          </Button>
          {reason !== null && <span className={styles.muted}>{reason}</span>}
        </div>
        <CommandOutcome outcome={outcome} onDismiss={clear} />
      </form>
    </FormEnvContext.Provider>
  );
}
