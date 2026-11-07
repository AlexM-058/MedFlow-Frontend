import { useEffect, useState, useSyncExternalStore, type ComponentType, type MouseEvent } from 'react';
import { AppHeader } from './components/AppHeader';
import { brand } from './brand/brand.config';
import { AuthProvider } from './auth/AuthProvider';
import { useAuth } from './auth/authContext';
import { CaseInbox } from './features/cases/CaseInbox';
import type { AccountProfile } from './auth/contracts';
import { readAppRoute, subscribeToRoute, navigate } from './auth/navigation';
import { AccountLayout, AccountSessionControls, AuthBoundary, DoctorInvitationPage } from './auth/AuthPages';
import { PatientConnectPage } from './features/connections';
import { PatientJourney } from './features/patient-journey';
import { AdminPage } from './features/admin';
import { ChatPage } from './features/chat/ChatPage';
import { DocumentScannerPage } from './features/document-scanner';
import { CareScenarioPage } from './features/care-scenario';
import { PatientSuggestionPanel } from './features/patient-suggestions';
import { ThemeProvider } from './theme/ThemeProvider';

// Claude owns this optional module. Patient development works before its handoff.
const doctorModules = import.meta.glob<{
  DoctorApp: ComponentType<{ onExit: () => void }>;
  DoctorAccountWorkspace?: ComponentType<{ profile: AccountProfile; onExit: () => void }>;
}>(
  './features/doctor/index.ts',
  { eager: true },
);
const DoctorApp = doctorModules['./features/doctor/index.ts']?.DoctorApp;
const DoctorAccountWorkspace = doctorModules['./features/doctor/index.ts']?.DoctorAccountWorkspace;

const exampleSuggestion = {
  id: 'demo-suggestion-1',
  doctorName: 'Dr. Elena Marin',
  text: 'Vă rugăm să aduceți la următoarea vizită întrebările dumneavoastră și notițele de la consultațiile anterioare. Puteți folosi acest spațiu pentru a pregăti un mesaj pentru echipa dumneavoastră de îngrijire.',
  createdAt: '2026-11-06T09:30:00+02:00',
};

function PatientWorkspace() {
  const [suggestionOpen, setSuggestionOpen] = useState(false);

  return (
    <div className="app">
      <a className="skip-link" href="#patient-content">Treceți la conversație</a>
      <AppHeader />
      <div id="patient-content" className={`patient-workspace${suggestionOpen ? ' patient-workspace--with-suggestion' : ''}`} tabIndex={-1}>
        <ChatPage onOpenSuggestion={() => setSuggestionOpen(true)} suggestionOpen={suggestionOpen} />
        {suggestionOpen && <PatientSuggestionPanel suggestion={exampleSuggestion} onClose={() => setSuggestionOpen(false)} />}
      </div>
    </div>
  );
}

function VerifiedDoctor() {
  const { profile } = useAuth();
  if (profile?.role !== 'doctor') return <section className="account-card"><h1>Accesul medicilor se face doar pe bază de invitație</h1><p>Deschideți invitația trimisă de echipa {brand.productName} și autentificați-vă cu contul Google invitat. Accesarea acestei pagini nu oferă drepturi de medic.</p><a href="#/patient">Mergeți la contul de pacient</a><AccountSessionControls /></section>;
  if (DoctorAccountWorkspace) return <><DoctorAccountWorkspace profile={profile} onExit={() => navigate('/patient')} /></>;
  return <section className="account-card"><h1>Bun venit, {profile.fullName}</h1><p>Contul dumneavoastră de medic a fost verificat. Spațiul pentru codul QR și cererile de conectare este integrat separat. În această previzualizare nu sunt afișate date ale pacienților.</p><AccountSessionControls /></section>;
}

function PatientAccount() {
  const { profile } = useAuth();
  if (profile?.role === 'doctor') return <section className="account-card"><h1>Contul dumneavoastră de medic este pregătit</h1><a className="ui-button ui-button--primary" href="#/doctor">Deschideți spațiul de lucru al medicului</a><AccountSessionControls /></section>;
  return <><PatientJourney /><CaseInbox /><AccountSessionControls /></>;
}

function SignedInControls() {
  const { session } = useAuth();
  return session ? <AccountSessionControls /> : null;
}

/** There is no shared landing page: the root and the old /home go to the patient sign-in. */
function RedirectToPatient() {
  useEffect(() => { window.location.replace('#/patient'); }, []);
  return null;
}

function Routes() {
  const route = useSyncExternalStore(subscribeToRoute, readAppRoute, () => '/patient');
  if (route === '/home' || route === '/') return <RedirectToPatient />;
  if (route === '/demo/patient') return <PatientWorkspace />;
  if (route === '/demo/doctor') return DoctorApp ? <DoctorApp onExit={() => navigate('/demo/patient')} /> : <AccountLayout><p role="status">Demo-ul pentru medic nu este disponibil încă.</p></AccountLayout>;
  if (route === '/demo/scan') return <DocumentScannerPage />;
  if (route === '/demo/care') return <CareScenarioPage />;
  if (route === '/auth/callback') return <AccountLayout><p role="status">Se finalizează autentificarea cu Google…</p></AccountLayout>;
  const connect = /^\/connect\/([^/]+)$/.exec(route);
  const invitation = /^\/doctor\/invite\/([^/]+)$/.exec(route);
  const portal = route === '/doctor' || invitation ? 'doctor' : 'patient';
  return (
    <AccountLayout portal={portal}>
      {connect ? <><PatientConnectPage key={connect[1]} code={connect[1]} /><SignedInControls /></> : invitation ? <DoctorInvitationPage key={invitation[1]} token={invitation[1]} /> : route === '/doctor' ? (
        <AuthBoundary destination="/doctor" doctor><VerifiedDoctor /></AuthBoundary>
      ) : route === '/admin' ? (
        <AuthBoundary destination="/admin"><AdminPage /></AuthBoundary>
      ) : route === '/patient' || route === '/login' ? (
        <AuthBoundary destination="/patient"><PatientAccount /></AuthBoundary>
      ) : <section className="account-card"><h1>Pagina nu a fost găsită</h1><a href="#/patient">Înapoi la {brand.productName}</a></section>}
    </AccountLayout>
  );
}

export default function App() {
  function followDocumentAnchor(event: MouseEvent<HTMLDivElement>) {
    if (!(event.target instanceof Element)) return;
    const link = event.target.closest('a');
    const href = link?.getAttribute('href');
    if (!href?.startsWith('#') || href.startsWith('#/')) return;
    let target: HTMLElement | null;
    try { target = document.getElementById(decodeURIComponent(href.slice(1))); } catch { return; }
    if (!target) return;
    event.preventDefault();
    target.focus();
    target.scrollIntoView({ block: 'nearest' });
  }
  return <ThemeProvider><AuthProvider><div onClickCapture={followDocumentAnchor}><Routes /></div></AuthProvider></ThemeProvider>;
}
