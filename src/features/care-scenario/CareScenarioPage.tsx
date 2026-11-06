import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { AppHeader } from '../../components/AppHeader';
import { DoctorCasePanel } from '../doctor/case';
import { PatientFeedbackPanel } from '../doctor-feedback';
import { IntakeChatPanel } from '../intake-chat';
import { MedicationSchedulePanel } from '../medication-schedule';
import { PatientContextPanel } from '../patient-context';
import { PrescriptionReviewPanel } from '../prescription-review';
import type { CareCase, ConfirmedMedication } from './contracts';
import { createFixtureScenario } from './fixture';
import './care-scenario.css';

type Perspective = 'patient' | 'doctor';

const STEPS = [
  { id: 'care-step-context', label: 'Your health context' },
  { id: 'care-step-prescription', label: 'Scan and review a prescription' },
  { id: 'care-step-schedule', label: 'Confirm the schedule' },
  { id: 'care-step-chat', label: 'Answer the assistant' },
  { id: 'care-step-send', label: 'Send to your doctor' },
  { id: 'care-step-answer', label: "Your doctor's answer" },
] as const;

/**
 * Demo care scenario (#/demo/care). Every domain uses the fixture adapters: synthetic
 * data in memory only, nothing is sent to the server, a reload restarts the demo.
 * Both perspectives live on one page for the presentation only; real patient and
 * doctor accounts use separate sign-ins and server persistence (NEXT_ACTIONS.md).
 */
export function CareScenarioPage() {
  const [scenario, setScenario] = useState(() => createFixtureScenario());
  const [run, setRun] = useState(0);

  const restart = () => {
    scenario.reset();
    setScenario(createFixtureScenario());
    setRun((value) => value + 1);
  };

  return (
    <div className="app care-scenario-app">
      <a className="skip-link" href="#care-scenario-content">Skip to the scenario</a>
      <AppHeader />
      <main id="care-scenario-content" className="care-scenario" tabIndex={-1}>
        <ScenarioBody key={run} scenario={scenario} onRestart={restart} />
      </main>
    </div>
  );
}

type Scenario = ReturnType<typeof createFixtureScenario>;

function ScenarioBody({ scenario, onRestart }: { scenario: Scenario; onRestart: () => void }) {
  const [view, setView] = useState({ perspective: 'patient' as Perspective, revision: 0, doctorVisited: false });
  const { perspective, revision } = view;
  const setPerspective = (next: Perspective) => setView((current) => current.perspective === next ? current : {
    perspective: next,
    revision: current.revision + 1,
    doctorVisited: current.doctorVisited || next === 'doctor',
  });
  const tabsId = useId();
  const patientTab = useRef<HTMLButtonElement>(null);
  const doctorTab = useRef<HTMLButtonElement>(null);

  function onTabKey(event: React.KeyboardEvent) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    const next: Perspective = event.key === 'Home' ? 'patient' : event.key === 'End' ? 'doctor' : perspective === 'patient' ? 'doctor' : 'patient';
    setPerspective(next);
    (next === 'patient' ? patientTab : doctorTab).current?.focus();
  }

  return (
    <>
      <header className="care-scenario__intro">
        <p className="care-scenario__eyebrow">DEMO SCENARIO</p>
        <h1>From prescription to your doctor's answer</h1>
        <div className="care-scenario__notice" role="note">
          <p>
            <strong>Synthetic demo data.</strong> Nothing on this page is sent to the server and a reload starts over.
            Patient and doctor views are shown together only for the presentation; real accounts sign in separately.
            {' '}<a href={`${import.meta.env.BASE_URL}demo/synthetic-prescription.svg`} download="synthetic-prescription.svg">Download the synthetic prescription</a> to print or view.
          </p>
          <button type="button" className="ui-button ui-button--secondary" onClick={onRestart}>Restart demo</button>
        </div>
      </header>

      <div className="care-scenario__tabs" role="tablist" aria-label="Demo perspective" onKeyDown={onTabKey}>
        <button
          ref={patientTab}
          type="button"
          role="tab"
          id={`${tabsId}-patient`}
          aria-controls={`${tabsId}-patient-panel`}
          aria-selected={perspective === 'patient'}
          tabIndex={perspective === 'patient' ? 0 : -1}
          className="care-scenario__tab"
          onClick={() => setPerspective('patient')}
        >
          Patient · Ana Test
        </button>
        <button
          ref={doctorTab}
          type="button"
          role="tab"
          id={`${tabsId}-doctor`}
          aria-controls={`${tabsId}-doctor-panel`}
          aria-selected={perspective === 'doctor'}
          tabIndex={perspective === 'doctor' ? 0 : -1}
          className="care-scenario__tab"
          onClick={() => setPerspective('doctor')}
        >
          Doctor · Dr. Demo Ionescu
        </button>
      </div>

      {/* Keep local drafts, the prescription preview and reminder state across tabs. */}
        <section hidden={perspective !== 'patient'} id={`${tabsId}-patient-panel`} role="tabpanel" aria-labelledby={`${tabsId}-patient`} className="care-scenario__panel">
          <PatientJourney scenario={scenario} refreshKey={revision} />
        </section>
        <section hidden={perspective !== 'doctor'} id={`${tabsId}-doctor-panel`} role="tabpanel" aria-labelledby={`${tabsId}-doctor`} className="care-scenario__panel">
          {view.doctorVisited && <DoctorView scenario={scenario} refreshKey={revision} />}
        </section>
    </>
  );
}

function PatientJourney({ scenario, refreshKey }: { scenario: Scenario; refreshKey: number }) {
  const [medications, setMedications] = useState<ConfirmedMedication[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    scenario.prescription.listConfirmed(controller.signal).then(
      (list) => { if (!controller.signal.aborted) setMedications(list); },
      () => { /* The prescription panel shows its own errors. */ },
    );
    return () => controller.abort();
  }, [scenario]);

  const onConfirmed = useCallback((confirmed: ConfirmedMedication[]) => {
    setMedications((current) => [...current.filter((item) => !confirmed.some((next) => next.id === item.id)), ...confirmed]);
  }, []);

  return (
    <div className="care-scenario__journey">
      <nav className="care-scenario__steps" aria-label="Scenario steps">
        <ol>
          {STEPS.map((step, index) => (
            <li key={step.id}><a href={`#${step.id}`}><span aria-hidden="true">{index + 1}</span>{step.label}</a></li>
          ))}
        </ol>
      </nav>

      <div className="care-scenario__sections">
        <section id={STEPS[0].id} tabIndex={-1} aria-label={STEPS[0].label} className="care-scenario__section">
          <PatientContextPanel adapter={scenario.context} />
        </section>
        <section id={STEPS[1].id} tabIndex={-1} aria-label={STEPS[1].label} className="care-scenario__section">
          <PrescriptionReviewPanel adapter={scenario.prescription} onConfirmed={onConfirmed} />
        </section>
        <section id={STEPS[2].id} tabIndex={-1} aria-label={STEPS[2].label} className="care-scenario__section">
          <MedicationSchedulePanel adapter={scenario.schedule} medications={medications} />
        </section>
        <section id={STEPS[3].id} tabIndex={-1} aria-label={STEPS[3].label} className="care-scenario__section">
          <IntakeChatPanel adapter={scenario.intake} />
        </section>
        <section id={STEPS[4].id} tabIndex={-1} aria-label={STEPS[4].label} className="care-scenario__section">
          <SendToDoctor scenario={scenario} />
        </section>
        <section id={STEPS[5].id} tabIndex={-1} aria-label={STEPS[5].label} className="care-scenario__section">
          <PatientFeedbackPanel adapter={scenario.careCase} refreshKey={refreshKey} />
        </section>
      </div>
    </div>
  );
}

function SendToDoctor({ scenario }: { scenario: Scenario }) {
  const [careCase, setCareCase] = useState<CareCase | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sending = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    scenario.careCase.getCase(controller.signal).then(
      (value) => { if (!controller.signal.aborted) setCareCase(value); },
      (reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'The case could not be loaded.'); },
    );
    return () => { mounted.current = false; controller.abort(); };
  }, [scenario]);

  async function submit() {
    if (sending.current) return;
    sending.current = true;
    setPending(true);
    setError(null);
    try {
      const updated = await scenario.careCase.submit();
      if (mounted.current) setCareCase(updated);
    } catch (reason) {
      if (mounted.current) setError(reason instanceof Error ? reason.message : 'The case could not be sent.');
    } finally {
      sending.current = false;
      if (mounted.current) setPending(false);
    }
  }

  const sent = careCase && careCase.status !== 'draft';
  return (
    <div className="care-scenario__card">
      <h2>Send to your doctor</h2>
      <p>Your doctor receives your conversation, the confirmed prescription and your health context. Your doctor decides what happens next.</p>
      {sent ? (
        <p className="care-scenario__status" role="status">
          Sent to {careCase.doctor.fullName}{careCase.submittedAt ? ` · ${new Date(careCase.submittedAt).toLocaleString()}` : ''}. Switch to the doctor view to continue the demo.
        </p>
      ) : (
        <button type="button" className="ui-button ui-button--primary" onClick={() => void submit()} disabled={pending} aria-busy={pending}>
          {pending ? 'Sending…' : 'Send to my doctor'}
        </button>
      )}
      {error && <p className="care-scenario__error" role="alert">{error}</p>}
    </div>
  );
}

function DoctorView({ scenario, refreshKey }: { scenario: Scenario; refreshKey: number }) {
  const [status, setStatus] = useState<CareCase['status'] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    scenario.careCase.getCase(controller.signal).then(
      (value) => { if (!controller.signal.aborted) { setStatus(value.status); setError(null); } },
      (reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'The case could not be loaded.'); },
    );
    return () => controller.abort();
  }, [scenario, attempt, refreshKey]);

  if (error) {
    return (
      <div className="care-scenario__card">
        <p className="care-scenario__error" role="alert">{error}</p>
        <button type="button" className="ui-button ui-button--secondary" onClick={() => setAttempt((value) => value + 1)}>Try again</button>
      </div>
    );
  }
  if (status === null) return <p className="care-scenario__card" role="status">Loading the case…</p>;
  if (status === 'draft') {
    return (
      <div className="care-scenario__card">
        <h2>No case to review yet</h2>
        <p>The patient has not sent the case. Complete the patient steps and choose "Send to my doctor" first.</p>
        <button type="button" className="ui-button ui-button--secondary" onClick={() => setAttempt((value) => value + 1)}>Check again</button>
      </div>
    );
  }
  return <DoctorCasePanel adapter={scenario.careCase} refreshKey={refreshKey} />;
}
