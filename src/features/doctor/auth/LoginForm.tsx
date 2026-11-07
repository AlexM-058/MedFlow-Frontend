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
          Bine ați revenit
        </h1>
        <p className="doctor-auth-subtitle">Autentificați-vă pentru a continua îngrijirea pacienților dumneavoastră.</p>
      </div>

      <form className="doctor-auth-form" noValidate onSubmit={handleSubmit} aria-labelledby={headingId}>
        <TextField
          id={fieldIds.email}
          label="E-mail de serviciu"
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          placeholder="medic@clinica.ro"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={errors.email}
          required
        />
        <PasswordField
          id={fieldIds.password}
          label="Parolă"
          name="password"
          autoComplete="current-password"
          placeholder="Introduceți parola"
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
            <span>Ține-mă minte</span>
          </label>
          <button type="button" className="doctor-auth-text-button" onClick={() => setResetOpen(true)}>
            Ați uitat parola?
          </button>
        </div>

        <button type="submit" className="doctor-button doctor-button--primary doctor-button--block">
          Autentificare
        </button>

        <p className="doctor-auth-demo-note">
          <span className="doctor-demo-tag">Demo</span> Fără autentificare reală: orice e-mail și orice parolă valide deschid
          un spațiu de lucru de probă cu pacienți sintetici.
        </p>
      </form>

      <p className="doctor-auth-switch">
        Sunteți nou în {brand.productName}?{' '}
        <button type="button" className="doctor-auth-text-button" onClick={onRegister}>
          Creați un cont de medic
        </button>
      </p>

      <DoctorDialog
        open={resetOpen}
        title="Resetarea parolei nu este conectată"
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
          Aceasta este o demonstrație. Resetarea parolei nu este încă conectată, deci nu se trimite niciun e-mail și niciun cont nu este modificat. În
          demonstrație, orice e-mail și orice parolă valide deschid spațiul de lucru de probă.
        </p>
      </DoctorDialog>
    </>
  );
}
