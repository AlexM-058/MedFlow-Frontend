import { useState, type ReactNode } from 'react';
import { BrandMark } from '../components/BrandMark';
import { brand } from '../brand/brand.config';
import { AccountMenu } from '../components/AccountMenu';
import { useAuth } from './authContext';
import { accountApi, AccountApiError } from '../lib/accountApi';
import { isOpaqueCode } from './navigation';
import './auth.css';

/** Absolute (client-hosted) legal pages must not get access to this window. */
function externalLinkProps(url: string) {
  return /^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('//') ? { rel: 'noopener noreferrer' } : {};
}

export type Portal = 'patient' | 'doctor';

/** Each portal has its own entry page; the logo returns to that portal's sign-in, never to a shared page. */
export function AccountLayout({ children, portal = 'patient' }: { children: ReactNode; portal?: Portal }) {
  return (
    <div className="account-shell" data-portal={portal}>
      <header className="account-shell__header">
        <a href={`#/${portal}`} aria-label={`${brand.productName} – ${portal === 'doctor' ? 'portalul medicilor' : 'portalul pacienților'}`}><BrandMark /></a>
        <AccountMenu />
      </header>
      <main className="account-shell__main">{children}</main>
      <footer className="account-shell__footer">
        {brand.legal.privacyUrl && <a href={brand.legal.privacyUrl} {...externalLinkProps(brand.legal.privacyUrl)}>Confidențialitate</a>}
        {brand.legal.termsUrl && <a href={brand.legal.termsUrl} {...externalLinkProps(brand.legal.termsUrl)}>Termeni și condiții</a>}
      </footer>
    </div>
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
      setFailure(reason instanceof Error ? reason.message : 'Autentificarea nu a putut fi pornită.');
      setPending(false);
    }
  }

  return (
    <section className="account-card" aria-labelledby="sign-in-heading">
      <h1 id="sign-in-heading">{doctor ? 'Autentificare medic' : 'Bun venit'}</h1>
      <p>{doctor ? 'Folosiți contul Google al invitației dumneavoastră.' : 'Autentificați-vă cu Google pentru a vă conecta cu medicul dumneavoastră.'}</p>
      {(failure || error) && <p className="account-error" role="alert">{failure || error}</p>}
      {status === 'unconfigured' && <p className="account-notice" role="status">Autentificarea cu Google nu este configurată în acest mediu. Încercați din nou mai târziu.</p>}
      <button className="ui-button ui-button--primary" type="button" onClick={() => void start()} disabled={pending || status === 'unconfigured'} aria-busy={pending || undefined}>
        <span className="account-google-mark" aria-hidden="true">G</span>
        {pending ? 'Se deschide Google…' : 'Continuă cu Google'}
      </button>
      <details className="account-small">
        <summary>Ce date cerem?</summary>
        <p>Doar numele și adresa de email, pentru a vă identifica contul. Nu cerem acces la mesajele dumneavoastră Gmail.{doctor ? ` Accesul medicilor este acordat de echipa ${brand.productName}.` : ''}</p>
      </details>
    </section>
  );
}

/** Real routes fail closed; they never render the demo DoctorApp. */
export function AuthBoundary({ children, destination, doctor = false, allowProfileError = false }: { children: ReactNode; destination: string; doctor?: boolean; allowProfileError?: boolean }) {
  const { status, session, error, refreshProfile } = useAuth();
  if (status === 'loading' || status === 'profile-loading') return <p className="account-card" role="status">Se încarcă contul dumneavoastră…</p>;
  if (!session) return <GoogleSignIn destination={destination} doctor={doctor} />;
  if (status === 'error' && !allowProfileError) return (
    <section className="account-card">
      <h1>Nu am putut încărca contul dumneavoastră</h1>
      <p className="account-error" role="alert">{error}</p>
      <button className="ui-button ui-button--secondary" type="button" onClick={() => void refreshProfile()}>Încercați din nou</button>
    </section>
  );
  return children;
}

export function DoctorInvitationPage({ token }: { token: string }) {
  const { session, profile, refreshProfile } = useAuth();
  const [pending, setPending] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!isOpaqueCode(token)) return <section className="account-card"><h1>Invitație invalidă</h1><p>Solicitați echipei {brand.productName} un nou link de invitație.</p></section>;

  async function accept() {
    if (!session || pending) return;
    setPending(true);
    setError(null);
    try {
      const result = await accountApi.acceptDoctorInvitation(session.access_token, token);
      if (result.role !== 'doctor' || result.id !== session.user.id) throw new Error('Contul de medic nu a putut fi verificat.');
      setAccepted(true);
      await refreshProfile();
    } catch (reason) {
      const code = reason instanceof AccountApiError ? reason.code : '';
      setError(code === 'INVITATION_EMAIL_MISMATCH' ? 'Această invitație este pentru o altă adresă de email Google. Deconectați-vă și folosiți contul invitat.' : reason instanceof Error ? reason.message : 'Invitația nu a putut fi acceptată.');
    } finally { setPending(false); }
  }

  return (
    <AuthBoundary destination={`/doctor/invite/${token}`} doctor allowProfileError>
      <section className="account-card">
        <p className="account-eyebrow">{brand.productName.toUpperCase()} PENTRU MEDICI</p>
        <h1>{accepted ? 'Invitație acceptată' : 'Acceptați invitația de medic'}</h1>
        <p>Echipa {brand.productName} trebuie să aprobe accesul dumneavoastră profesional. Această invitație poate fi acceptată doar cu adresa de email Google căreia i-a fost emisă.</p>
        {error && <p className="account-error" role="alert">{error}</p>}
        {accepted ? (
          profile?.role === 'doctor' ? <a className="ui-button ui-button--primary" href="#/doctor">Deschideți spațiul de lucru al medicului</a> : <><p role="status">Accesul a fost acordat. Reîncărcați profilul înainte de a continua.</p><button className="ui-button ui-button--secondary" onClick={() => void refreshProfile()}>Reîncărcați profilul</button></>
        ) : <button className="ui-button ui-button--primary" type="button" onClick={() => void accept()} disabled={pending} aria-busy={pending || undefined}>{pending ? 'Se acceptă invitația…' : 'Acceptați invitația'}</button>}
      </section>
    </AuthBoundary>
  );
}
