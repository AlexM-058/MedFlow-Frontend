import { useState, type ReactNode } from 'react';
import { BrandMark } from '../components/BrandMark';
import { brand } from '../brand/brand.config';
import { ThemeSelector } from '../theme/ThemeSelector';
import { useAuth } from './authContext';
import { accountApi, AccountApiError } from '../lib/accountApi';
import { isOpaqueCode } from './navigation';
import './auth.css';

/** Absolute (client-hosted) legal pages must not get access to this window. */
function externalLinkProps(url: string) {
  return /^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('//') ? { rel: 'noopener noreferrer' } : {};
}

export function AccountLayout({ children }: { children: ReactNode }) {
  return (
    <div className="account-shell">
      <header className="account-shell__header">
        <a href="#/home" aria-label={`${brand.productName} – pagina principală`}><BrandMark /></a>
        <ThemeSelector />
      </header>
      <main className="account-shell__main">{children}</main>
      <footer className="account-shell__footer">
        <a href="#/demo/patient">Explorați demo-ul pentru pacient</a>
        <a href="#/demo/doctor">Explorați demo-ul pentru medic</a>
        <a href="#/demo/care">Explorați scenariul de îngrijire (demo)</a>
        {brand.legal.privacyUrl && <a href={brand.legal.privacyUrl} {...externalLinkProps(brand.legal.privacyUrl)}>Confidențialitate</a>}
        {brand.legal.termsUrl && <a href={brand.legal.termsUrl} {...externalLinkProps(brand.legal.termsUrl)}>Termeni și condiții</a>}
      </footer>
    </div>
  );
}

export function AccountEntryPage() {
  return (
    <section className="account-entry" aria-labelledby="account-entry-title">
      <div className="account-entry__intro">
        <p className="account-eyebrow">CARE, CONNECTED.</p>
        <h1 id="account-entry-title">Îngrijirea nu se oprește când se termină consultația.</h1>
        <p>Un spațiu comun pentru pacienți, medici și îngrijirea de zi cu zi. Alegeți zona dumneavoastră pentru a continua.</p>
      </div>
      <div className="account-entry__choices">
        <section className="account-card" aria-labelledby="patient-entry-title">
          <p className="account-eyebrow">PENTRU PACIENȚI</p>
          <h2 id="patient-entry-title">Îngrijirea dumneavoastră, într-un singur loc</h2>
          <p>Autentificați-vă cu Google, scanați codul QR al medicului și trimiteți o cerere de conectare la echipa dumneavoastră de îngrijire.</p>
          <a className="ui-button ui-button--primary" href="#/patient">Autentificare pacient</a>
        </section>
        <section className="account-card" aria-labelledby="doctor-entry-title">
          <p className="account-eyebrow">PENTRU MEDICI</p>
          <h2 id="doctor-entry-title">Îngrijire dincolo de consultație</h2>
          <p>Folosiți contul Google invitat pentru a accesa spațiul de lucru și a gestiona cererile de conectare ale pacienților.</p>
          <a className="ui-button ui-button--secondary" href="#/doctor">Autentificare medic</a>
          <p className="account-small">Accesul medicilor se face doar pe bază de invitație.</p>
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
      setFailure(reason instanceof Error ? reason.message : 'Autentificarea nu a putut fi pornită.');
      setPending(false);
    }
  }

  return (
    <section className="account-card" aria-labelledby="sign-in-heading">
      <p className="account-eyebrow">{`${brand.productName.toUpperCase()} FOR ${doctor ? 'DOCTORS' : 'PATIENTS'}`}</p>
      <h1 id="sign-in-heading">{doctor ? 'Autentificare medic' : 'Autentificare pacient'}</h1>
      <p>{doctor ? `Folosiți contul Google asociat invitației dumneavoastră ${brand.productName}. Accesul medicilor este acordat de echipa ${brand.productName}.` : 'Autentificați-vă cu Google pentru a vă conecta cu medicul dumneavoastră. Puteți vedea profilul medicului înainte de a trimite o cerere de conectare.'}</p>
      {(failure || error) && <p className="account-error" role="alert">{failure || error}</p>}
      {status === 'unconfigured' && <p className="account-notice" role="status">Autentificarea cu Google nu este configurată în acest mediu. Puteți explora demo-urile separate de mai jos.</p>}
      <button className="ui-button ui-button--primary" type="button" onClick={() => void start()} disabled={pending || status === 'unconfigured'} aria-busy={pending || undefined}>
        <span className="account-google-mark" aria-hidden="true">G</span>
        {pending ? 'Se deschide Google…' : 'Continuă cu Google'}
      </button>
      <p className="account-small">Vă solicităm numele și adresa de email pentru a vă identifica contul. Nu solicităm acces la mesajele dumneavoastră Gmail.</p>
      {doctor ? <a href="#/patient">Sunt pacient</a> : <a href="#/doctor">Am o invitație de medic</a>}
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
    try { await signOut(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Deconectarea nu a reușit.'); }
    finally { setPending(false); }
  }
  return (
    <div className="account-session">
      <span className="account-small">{session?.user.email}</span>
      <button className="ui-button ui-button--secondary" type="button" onClick={() => void exit()} disabled={pending} aria-busy={pending || undefined}>{pending ? 'Se deconectează…' : 'Deconectare'}</button>
      {error && <p className="account-error" role="alert">{error}</p>}
    </div>
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
        <AccountSessionControls />
      </section>
    </AuthBoundary>
  );
}
