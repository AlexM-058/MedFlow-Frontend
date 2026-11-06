import { useId, useState, type FormEvent } from 'react';
import type { DoctorProfile } from '../types';
import { DEMO_DOCTOR } from '../fixtures';
import { DoctorDialog } from '../shared/DoctorDialog';
import { PasswordField, TextField } from './AuthField';
import { brand } from '../../../brand/brand.config';
import {
  LOGIN_FIELD_ORDER,
  firstInvalidField,
  validateLogin,
  type LoginField,
  type LoginErrors,
} from './registrationValidation';

interface LoginFormProps {
  headingId: string;
  onDemoLogin: (doctor: DoctorProfile) => void;
  onRegister: () => void;
}

/** Demo login: local validation only, no credentials leave the browser. */
export function LoginForm({ headingId, onDemoLogin, onRegister }: LoginFormProps) {
  const id = useId();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const fieldIds: Record<LoginField, string> = { email: `${id}-email`, password: `${id}-password` };

  // After the first submit attempt, errors update live as the doctor types.
  const errors: LoginErrors = submitted ? validateLogin({ email, password }) : {};

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validateLogin({ email, password });
    const firstInvalid = firstInvalidField(nextErrors, LOGIN_FIELD_ORDER);
    if (firstInvalid) {
      setSubmitted(true);
      document.getElementById(fieldIds[firstInvalid])?.focus();
      return;
    }
    // Demo session only: the password is discarded, never checked or stored.
    setPassword('');
    onDemoLogin({ ...DEMO_DOCTOR, email: email.trim() });
  }

  return (
    <>
      <div className="doctor-auth-heading">
        <h1 id={headingId} className="doctor-auth-title" tabIndex={-1}>
          Welcome back, doctor
        </h1>
        <p className="doctor-auth-subtitle">Log in to continue caring for your patients.</p>
      </div>

      <form className="doctor-auth-form" noValidate onSubmit={handleSubmit} aria-labelledby={headingId}>
        <TextField
          id={fieldIds.email}
          label="Work email"
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          placeholder="doctor@clinic.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={errors.email}
          required
        />
        <PasswordField
          id={fieldIds.password}
          label="Password"
          name="password"
          autoComplete="current-password"
          placeholder="Enter your password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={errors.password}
          required
        />

        <div className="doctor-auth-row">
          <label className="doctor-auth-check">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(event) => setRememberMe(event.target.checked)}
            />
            <span>Remember me</span>
          </label>
          <button type="button" className="doctor-auth-text-button" onClick={() => setResetOpen(true)}>
            Forgot password?
          </button>
        </div>

        <button type="submit" className="doctor-button doctor-button--primary doctor-button--block">
          Log in
        </button>

        <p className="doctor-auth-demo-note">
          <span className="doctor-demo-tag">Demo</span> No real authentication: any valid email and password opens
          a sample workspace with synthetic patients.
        </p>
      </form>

      <p className="doctor-auth-switch">
        New to {brand.productName}?{' '}
        <button type="button" className="doctor-auth-text-button" onClick={onRegister}>
          Create a doctor account
        </button>
      </p>

      <DoctorDialog
        open={resetOpen}
        title="Password reset is not connected"
        onClose={() => setResetOpen(false)}
        footer={
          <button
            type="button"
            className="doctor-button doctor-button--primary"
            onClick={() => setResetOpen(false)}
          >
            OK
          </button>
        }
      >
        <p>
          This is a demo. Password reset is not connected yet, so no email is sent and no account is changed. In the
          demo, any valid email and password opens the sample workspace.
        </p>
      </DoctorDialog>
    </>
  );
}
