import { useEffect, useId, useRef } from 'react';
import { BrandMark } from '../../../components/BrandMark';
import type { AuthMode, DoctorAuthProps } from '../contracts';
import { LoginForm } from './LoginForm';
import { RegisterForm } from './RegisterForm';
import './doctor-auth.css';

const MODES: ReadonlyArray<{ mode: AuthMode; label: string }> = [
  { mode: 'login', label: 'Log in' },
  { mode: 'register', label: 'Register' },
];

/**
 * Doctor login and registration (demo). Desktop: split panel with a brand aside and
 * a Log in / Register toggle. Mobile: single column with text links between modes.
 * No real authentication or account creation happens here.
 */
export function DoctorAuth({ mode, onModeChange, onDemoLogin, onExit }: DoctorAuthProps) {
  const headingId = useId();
  const focusHeadingOnModeChange = useRef(false);

  useEffect(() => {
    if (!focusHeadingOnModeChange.current) return;
    focusHeadingOnModeChange.current = false;
    document.getElementById(headingId)?.focus();
  }, [mode, headingId]);

  /** Text links unmount with the form, so move focus to the new heading. */
  function switchFromLink(next: AuthMode) {
    focusHeadingOnModeChange.current = true;
    onModeChange(next);
  }

  return (
    <div className="doctor-auth">
      <aside className="doctor-auth-aside" aria-label="About MedFlow for doctors">
        <BrandMark />
        <div className="doctor-auth-aside__body">
          <p className="doctor-eyebrow">Care, connected.</p>
          <p className="doctor-auth-aside__headline">The care doesn't end when the appointment does.</p>
          <p className="doctor-auth-aside__text">A shared space for your patients, follow-ups and everyday care.</p>
        </div>
        <p className="doctor-eyebrow">MedFlow for doctors</p>
      </aside>

      <main className="doctor-auth-main">
        <div className="doctor-auth-topbar">
          <button type="button" className="doctor-button doctor-button--ghost doctor-auth-exit" onClick={onExit}>
            <span aria-hidden="true">←</span> Patient demo
          </button>
          <span className="doctor-demo-tag" title="No real authentication">
            Demo · no real sign-in
          </span>
        </div>

        <div className="doctor-auth-panel">
          <div className="doctor-auth-mobile-brand">
            <BrandMark />
            <p className="doctor-eyebrow">MedFlow for doctors</p>
          </div>

          <p className="doctor-notice doctor-notice--info doctor-auth-invite-note">
            <strong>Synthetic demo.</strong> Real MedFlow doctor accounts are invitation only: the MedFlow team
            sends you an invitation link, then you sign in with the invited Google account. The registration and
            password fields on this page are part of the demo and create no account.{' '}
            <a className="doctor-link" href="#/doctor">
              Go to real doctor sign-in
            </a>
          </p>

          <div className="doctor-auth-toggle" role="group" aria-label="Choose log in or registration">
            {MODES.map((item) => (
              <button
                key={item.mode}
                type="button"
                className="doctor-auth-toggle__button"
                aria-pressed={mode === item.mode}
                onClick={() => onModeChange(item.mode)}
              >
                {item.label}
              </button>
            ))}
          </div>

          {mode === 'login' ? (
            <LoginForm
              headingId={headingId}
              onDemoLogin={onDemoLogin}
              onRegister={() => switchFromLink('register')}
            />
          ) : (
            <RegisterForm headingId={headingId} onLogin={() => switchFromLink('login')} />
          )}
        </div>
      </main>
    </div>
  );
}
