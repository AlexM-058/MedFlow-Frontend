import { useState, type InputHTMLAttributes, type ReactNode, type Ref } from 'react';

/** Ids for the hint/error elements of a field, joined for aria-describedby. */
function describedBy(...ids: Array<string | false | undefined>): string | undefined {
  const joined = ids.filter(Boolean).join(' ');
  return joined || undefined;
}

interface FieldShellProps {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
}

/** Label + control + optional hint + error, with stable ids (`${id}-hint`, `${id}-error`). */
export function FieldShell({ id, label, hint, error, children }: FieldShellProps) {
  return (
    <div className="doctor-field doctor-auth-field">
      <label className="doctor-label" htmlFor={id}>
        {label}
      </label>
      {children}
      {hint && (
        <p id={`${id}-hint`} className="doctor-hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="doctor-field-error">
          {error}
        </p>
      )}
    </div>
  );
}

type NativeInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'aria-invalid' | 'aria-describedby'>;

interface TextFieldProps extends NativeInputProps {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string;
  inputRef?: Ref<HTMLInputElement>;
}

export function TextField({ id, label, hint, error, inputRef, className, ...inputProps }: TextFieldProps) {
  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <input
        {...inputProps}
        ref={inputRef}
        id={id}
        className={`doctor-input doctor-auth-input${className ? ` ${className}` : ''}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(hint ? `${id}-hint` : undefined, error ? `${id}-error` : undefined)}
      />
    </FieldShell>
  );
}

type PasswordFieldProps = Omit<TextFieldProps, 'type'>;

/** Masked password input with an optional show/hide toggle (aria-pressed). */
export function PasswordField({ id, label, hint, error, inputRef, ...inputProps }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <div className="doctor-auth-password">
        <input
          {...inputProps}
          ref={inputRef}
          id={id}
          type={visible ? 'text' : 'password'}
          className="doctor-input doctor-auth-input doctor-auth-password__input"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(hint ? `${id}-hint` : undefined, error ? `${id}-error` : undefined)}
          autoCapitalize="off"
          spellCheck={false}
        />
        <button
          type="button"
          className="doctor-auth-password__toggle"
          aria-pressed={visible}
          aria-controls={id}
          onClick={() => setVisible((value) => !value)}
        >
          Show<span className="doctor-sr-only"> password</span>
        </button>
      </div>
    </FieldShell>
  );
}
