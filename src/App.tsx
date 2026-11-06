import { useState, useSyncExternalStore, type ComponentType } from 'react';
import { AppHeader } from './components/AppHeader';
import { ChatPage } from './features/chat/ChatPage';
import { PatientSuggestionPanel } from './features/patient-suggestions';
import { ThemeProvider } from './theme/ThemeProvider';

// Claude owns this optional module. Patient development works before its handoff.
const doctorModules = import.meta.glob<{ DoctorApp: ComponentType<{ onExit: () => void }> }>(
  './features/doctor/index.ts',
  { eager: true },
);
const DoctorApp = doctorModules['./features/doctor/index.ts']?.DoctorApp;

function subscribeToRoute(onChange: () => void) {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

function getRoute() {
  return window.location.hash === '#/doctor' ? 'doctor' : 'patient';
}

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

export default function App() {
  const route = useSyncExternalStore(subscribeToRoute, getRoute, () => 'patient');

  return (
    <ThemeProvider>
      {route === 'doctor' ? (
        DoctorApp ? (
          <DoctorApp onExit={() => { window.location.hash = '/patient'; }} />
        ) : (
          <main className="workspace-pending">
            <span className="workspace-pending__eyebrow">DOCTOR WORKSPACE</span>
            <h1>Your doctor workspace is on its way</h1>
            <p>The doctor interface is being built separately. This preview currently includes the patient chat and a sample doctor suggestion.</p>
            <a className="button-secondary" href="#/patient">Return to patient demo</a>
          </main>
        )
      ) : (
        <PatientWorkspace />
      )}
    </ThemeProvider>
  );
}
