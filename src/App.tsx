import { useState, useSyncExternalStore, type ComponentType, type MouseEvent } from 'react';
import { AppHeader } from './components/AppHeader';
import { AuthProvider } from './auth/AuthProvider';
import { useAuth } from './auth/authContext';
import type { AccountProfile } from './auth/contracts';
import { readAppRoute, subscribeToRoute, navigate } from './auth/navigation';
import { AccountEntryPage, AccountLayout, AccountSessionControls, AuthBoundary, DoctorInvitationPage } from './auth/AuthPages';
import { PatientConnectPage, PatientAccountPage } from './features/connections';
import { ChatPage } from './features/chat/ChatPage';
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
  text: 'Please bring your questions and any previous appointment notes to our next visit. You can use this space to prepare an update for your care team.',
  createdAt: '2026-11-06T09:30:00+02:00',
};

function PatientWorkspace() {
  const [suggestionOpen, setSuggestionOpen] = useState(false);

  return (
    <div className="app">
      <a className="skip-link" href="#patient-content">Skip to conversation</a>
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
  if (profile?.role !== 'doctor') return <section className="account-card"><h1>Doctor access is invitation only</h1><p>Open the invitation sent by the MedFlow team and sign in with the invited Google account. Selecting this page does not grant doctor access.</p><a href="#/patient">Go to your patient account</a><AccountSessionControls /></section>;
  if (DoctorAccountWorkspace) return <DoctorAccountWorkspace profile={profile} onExit={() => navigate('/patient')} />;
  return <section className="account-card"><h1>Welcome, {profile.fullName}</h1><p>Your doctor account has been verified. The QR and connection-request workspace is being integrated separately. No patient data is displayed in this preview.</p><AccountSessionControls /></section>;
}

function PatientAccount() {
  const { profile } = useAuth();
  if (profile?.role === 'doctor') return <section className="account-card"><h1>Your doctor account is ready</h1><a className="account-button account-button--primary" href="#/doctor">Open doctor workspace</a><AccountSessionControls /></section>;
  return <><PatientAccountPage /><AccountSessionControls /></>;
}

function SignedInControls() {
  const { session } = useAuth();
  return session ? <AccountSessionControls /> : null;
}

function Routes() {
  const route = useSyncExternalStore(subscribeToRoute, readAppRoute, () => '/home');
  if (route === '/home' || route === '/') return <AccountLayout><AccountEntryPage /></AccountLayout>;
  if (route === '/demo/patient') return <PatientWorkspace />;
  if (route === '/demo/doctor') return DoctorApp ? <DoctorApp onExit={() => navigate('/demo/patient')} /> : <AccountLayout><p role="status">The doctor demo is not available yet.</p></AccountLayout>;
  if (route === '/auth/callback') return <AccountLayout><p role="status">Completing Google sign-in…</p></AccountLayout>;
  const connect = /^\/connect\/([^/]+)$/.exec(route);
  const invitation = /^\/doctor\/invite\/([^/]+)$/.exec(route);
  return (
    <AccountLayout>
      {connect ? <><PatientConnectPage key={connect[1]} code={connect[1]} /><SignedInControls /></> : invitation ? <DoctorInvitationPage key={invitation[1]} token={invitation[1]} /> : route === '/doctor' ? (
        <AuthBoundary destination="/doctor" doctor><VerifiedDoctor /></AuthBoundary>
      ) : route === '/patient' || route === '/login' ? (
        <AuthBoundary destination="/patient"><PatientAccount /></AuthBoundary>
      ) : <section className="account-card"><h1>Page not found</h1><a href="#/patient">Return to MedFlow</a></section>}
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
