import { useState, type ReactNode } from 'react';
import { BrandMark } from '../components/BrandMark';
import { ThemeSelector } from '../theme/ThemeSelector';
import { useAuth } from './authContext';
import { accountApi, AccountApiError } from '../lib/accountApi';
import { isOpaqueCode } from './navigation';
import './auth.css';

export function AccountLayout({ children }: { children: ReactNode }) {
  return (
    <div className="account-shell">
      <header className="account-shell__header">
        <a href="#/home" aria-label="MedFlow home"><BrandMark /></a>
        <ThemeSelector />
      </header>
      <main className="account-shell__main">{children}</main>
      <footer className="account-shell__footer">
        <a href="#/demo/patient">Explore patient demo</a>
        <a href="#/demo/doctor">Explore doctor demo</a>
      </footer>
    </div>
  );
}

export function AccountEntryPage() {
  return (
    <section className="account-entry" aria-labelledby="account-entry-title">
      <div className="account-entry__intro">
        <p className="account-eyebrow">CARE, CONNECTED.</p>
        <h1 id="account-entry-title">The care doesn't end when the appointment does.</h1>
        <p>A shared space for patients, doctors and everyday care. Choose your area to continue.</p>
      </div>
      <div className="account-entry__choices">
        <section className="account-card" aria-labelledby="patient-entry-title">
          <p className="account-eyebrow">FOR PATIENTS</p>
          <h2 id="patient-entry-title">Your care, in one place</h2>
          <p>Sign in with Google, scan your doctor's QR code and request a connection with your care team.</p>
          <a className="account-button account-button--primary" href="#/patient">Patient sign in</a>
        </section>
        <section className="account-card" aria-labelledby="doctor-entry-title">
          <p className="account-eyebrow">FOR DOCTORS</p>
          <h2 id="doctor-entry-title">Care beyond the visit</h2>
          <p>Use your invited Google account to access your workspace and manage patient connection requests.</p>
          <a className="account-button" href="#/doctor">Doctor sign in</a>
          <p className="account-small">Doctor access is invitation only.</p>
        </section>
      </div>
    </section>
  );
}

export function GoogleSignIn({ destination = '/patient', doctor = false }: { destination?: string; doctor?: boolean }) {
  const { status, error, signInWithGoogle } = useAuth();
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  async function start() {
    if (pending) return;
    setPending(true);
    setFailure(null);
    try { await signInWithGoogle(destination); } catch (reason) {
      setFailure(reason instanceof Error ? reason.message : 'Could not start sign-in.');
      setPending(false);
    }
  }

  return (
    <section className="account-card" aria-labelledby="sign-in-heading">
      <p className="account-eyebrow">{doctor ? 'MEDFLOW FOR DOCTORS' : 'MEDFLOW FOR PATIENTS'}</p>
      <h1 id="sign-in-heading">{doctor ? 'Doctor sign in' : 'Patient sign in'}</h1>
      <p>{doctor ? 'Use the Google account associated with your MedFlow invitation. Doctor access is granted by the MedFlow team.' : 'Sign in with Google to connect with your doctor. You can review the doctor before requesting a connection.'}</p>
      {(failure || error) && <p className="account-error" role="alert">{failure || error}</p>}
      {status === 'unconfigured' && <p className="account-notice" role="status">Google sign-in is not configured in this environment. You can explore the separate demos below.</p>}
      <button className="account-button account-button--primary" type="button" onClick={() => void start()} disabled={pending || status === 'unconfigured'}>
        <span className="account-google-mark" aria-hidden="true">G</span>
        {pending ? 'Opening Google…' : 'Continue with Google'}
      </button>
      <p className="account-small">We request your name and email to identify your account. We do not request access to your Gmail messages.</p>
      {doctor ? <a href="#/patient">I am a patient</a> : <a href="#/doctor">I have a doctor invitation</a>}
    </section>
  );
}

export function AccountSessionControls() {
  const { session, signOut } = useAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function exit() {
    setPending(true);
    setError(null);
    try { await signOut(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not sign out.'); }
    finally { setPending(false); }
  }
  return (
    <div className="account-session">
      <span className="account-small">{session?.user.email}</span>
      <button className="account-button" type="button" onClick={() => void exit()} disabled={pending}>{pending ? 'Signing out…' : 'Sign out'}</button>
      {error && <p className="account-error" role="alert">{error}</p>}
    </div>
  );
}

/** Real routes fail closed; they never render the demo DoctorApp. */
export function AuthBoundary({ children, destination, doctor = false, allowProfileError = false }: { children: ReactNode; destination: string; doctor?: boolean; allowProfileError?: boolean }) {
  const { status, session, error, refreshProfile } = useAuth();
  if (status === 'loading' || status === 'profile-loading') return <p className="account-card" role="status">Loading your account…</p>;
  if (!session) return <GoogleSignIn destination={destination} doctor={doctor} />;
  if (status === 'error' && !allowProfileError) return (
    <section className="account-card">
      <h1>We could not load your account</h1>
      <p className="account-error" role="alert">{error}</p>
      <button className="account-button" type="button" onClick={() => void refreshProfile()}>Try again</button>
      <AccountSessionControls />
    </section>
  );
  return children;
}

export function DoctorInvitationPage({ token }: { token: string }) {
  const { session, profile, refreshProfile } = useAuth();
  const [pending, setPending] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!isOpaqueCode(token)) return <section className="account-card"><h1>Invalid invitation</h1><p>Ask the MedFlow team for a new invitation link.</p></section>;

  async function accept() {
    if (!session || pending) return;
    setPending(true);
    setError(null);
    try {
      const result = await accountApi.acceptDoctorInvitation(session.access_token, token);
      if (result.role !== 'doctor' || result.id !== session.user.id) throw new Error('The doctor account could not be verified.');
      setAccepted(true);
      await refreshProfile();
    } catch (reason) {
      const code = reason instanceof AccountApiError ? reason.code : '';
      setError(code === 'INVITATION_EMAIL_MISMATCH' ? 'This invitation is for a different Google email. Sign out and use the invited account.' : reason instanceof Error ? reason.message : 'Could not accept invitation.');
    } finally { setPending(false); }
  }

  return (
    <AuthBoundary destination={`/doctor/invite/${token}`} doctor allowProfileError>
      <section className="account-card">
        <p className="account-eyebrow">MEDFLOW FOR DOCTORS</p>
        <h1>{accepted ? 'Invitation accepted' : 'Accept your doctor invitation'}</h1>
        <p>The MedFlow team must approve your professional access. This invitation can only be accepted using the Google email it was issued to.</p>
        {error && <p className="account-error" role="alert">{error}</p>}
        {accepted ? (
          profile?.role === 'doctor' ? <a className="account-button account-button--primary" href="#/doctor">Open doctor workspace</a> : <><p role="status">Access was granted. Reload your profile before continuing.</p><button className="account-button" onClick={() => void refreshProfile()}>Reload profile</button></>
        ) : <button className="account-button account-button--primary" type="button" onClick={() => void accept()} disabled={pending}>{pending ? 'Accepting invitation…' : 'Accept invitation'}</button>}
        <AccountSessionControls />
      </section>
    </AuthBoundary>
  );
}
