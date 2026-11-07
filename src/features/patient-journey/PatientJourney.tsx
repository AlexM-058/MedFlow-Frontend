import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../../auth/authContext';
import { navigate } from '../../auth/navigation';
import { PatientAccountPage } from '../connections';
import { DataSourceBadge } from '../care-scenario';
import type { ConfirmedMedication } from '../care-scenario/contracts';
import { createFixtureScenario } from '../care-scenario/fixture';
import { IntakeChatPanel } from '../intake-chat';
import { PatientContextPanel } from '../patient-context';
import { PrescriptionReviewPanel } from '../prescription-review';
import { extractConnectCode, journeyStage, type JourneyStage } from './journeyLogic';
import { QrScanner } from './QrScanner';
import './patient-journey.css';

const STEPS: readonly { stage: JourneyStage; label: string }[] = [
  { stage: 'connect', label: 'Conectare la medic' },
  { stage: 'prescription', label: 'Adăugați rețeta' },
  { stage: 'chat', label: 'Discuție cu asistentul' },
];

type Scenario = ReturnType<typeof createFixtureScenario>;

/**
 * Patient side of the first product: connect (QR) -> add a prescription -> chat.
 * One active step at a time, large text and plain wording, so an older patient can
 * complete it with a little help from a relative.
 *
 * BACKEND: today the prescription, history and chat adapters are the synthetic in-memory
 * fixture (a reload restarts steps 2-3, and nothing is sent to the server). The integration
 * points a backend colleague replaces are marked BACKEND: / AGENT: below. Medical data is
 * deliberately NOT kept in browser storage; persistence belongs to the backend.
 */
export function PatientJourney() {
  const { profile } = useAuth();
  const [scenario] = useState(() => createFixtureScenario());
  const [medications, setMedications] = useState<ConfirmedMedication[]>([]);

  // BACKEND: replace with the live PrescriptionAdapter once saveReview/listConfirmed exist
  // (see care-scenario/live/liveAdapters.ts, which currently throws LiveNotAvailableError).
  useEffect(() => {
    const controller = new AbortController();
    scenario.prescription.listConfirmed(controller.signal).then(
      (list) => { if (!controller.signal.aborted) setMedications(list); },
      () => { /* The prescription panel reports its own errors. */ },
    );
    return () => controller.abort();
  }, [scenario]);

  const onConfirmed = useCallback((confirmed: ConfirmedMedication[]) => {
    setMedications((current) => [...current.filter((item) => !confirmed.some((next) => next.id === item.id)), ...confirmed]);
  }, []);

  const doctorCount = profile?.activeDoctors.length ?? 0;
  const stage = journeyStage({ doctorCount, confirmedMedicationCount: medications.length });
  const activeIndex = STEPS.findIndex((step) => step.stage === stage);

  return (
    <div className="journey">
      <p className="journey__progress" aria-live="polite">Pasul {activeIndex + 1} din {STEPS.length}</p>
      <ol className="journey__steps" aria-label="Pașii dumneavoastră">
        {STEPS.map((step, index) => (
          <li
            key={step.stage}
            className="journey__step"
            aria-current={index === activeIndex ? 'step' : undefined}
            data-done={index < activeIndex}
          >
            <span className="journey__step-number" aria-hidden="true">{index < activeIndex ? '✓' : index + 1}</span>
            {step.label}
          </li>
        ))}
      </ol>

      {stage === 'connect' && <ConnectStage />}

      {stage === 'prescription' && (
        <section className="journey__panel" aria-labelledby="journey-rx-title">
          <div className="journey__head">
            <h2 id="journey-rx-title">Adăugați rețeta</h2>
            <DataSourceBadge source={scenario.prescription.source} />
          </div>
          <p>Faceți o fotografie rețetei sau alegeți un fișier. Apoi verificați fiecare rând și confirmați-l. Discuția se deschide după ce confirmați rețeta.</p>
          <p className="journey__help">Puteți cere unui apropiat să vă ajute cu fotografia și cu verificarea.</p>
          <PrescriptionReviewPanel adapter={scenario.prescription} onConfirmed={onConfirmed} />
        </section>
      )}

      {stage === 'chat' && <ChatStage scenario={scenario} medications={medications} />}
    </div>
  );
}

/** Step 1. The doctor's QR is scanned in this page (camera), or a pasted code or link works too. */
function ConnectStage() {
  const [value, setValue] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [scanning, setScanning] = useState(false);

  function submit(event: FormEvent) {
    event.preventDefault();
    const code = extractConnectCode(value);
    if (!code) { setInvalid(true); return; }
    setInvalid(false);
    navigate(`/connect/${code}`);
  }

  return (
    <>
      <section className="journey__panel" aria-labelledby="journey-connect-title">
        <h2 id="journey-connect-title">Conectați-vă la medicul dumneavoastră</h2>
        <p>Scanați codul QR al medicului cu camera din această pagină. Dacă nu puteți scana, lipiți mai jos codul sau linkul primit de la medic.</p>
        {scanning ? (
          <QrScanner onCode={(code) => navigate(`/connect/${code}`)} onClose={() => setScanning(false)} />
        ) : (
          <button type="button" className="ui-button ui-button--primary" onClick={() => setScanning(true)}>Scanați codul QR</button>
        )}
        <p className="journey__help">Un apropiat vă poate trimite linkul medicului pe telefon. Lipiți-l aici și apăsați „Continuați”.</p>
        <form className="journey__code-form" onSubmit={submit} noValidate>
          <label htmlFor="journey-code">Cod sau link de conectare</label>
          <div className="journey__code-row">
            <input
              id="journey-code"
              className="journey__code-input"
              value={value}
              onChange={(event) => { setValue(event.target.value); setInvalid(false); }}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={invalid || undefined}
              aria-describedby={invalid ? 'journey-code-error' : undefined}
            />
            <button type="submit" className="ui-button ui-button--primary">Continuați</button>
          </div>
          {invalid && <p id="journey-code-error" className="account-error" role="alert">Codul nu este valid. Verificați dacă ați copiat tot codul sau tot linkul.</p>}
        </form>
      </section>
      <PatientAccountPage />
    </>
  );
}

/** Step 3: the assistant only collects information. It never diagnoses or prescribes. */
function ChatStage({ scenario, medications }: { scenario: Scenario; medications: ConfirmedMedication[] }) {
  return (
    <>
      <section className="journey__panel" aria-labelledby="journey-meds-title">
        <h2 id="journey-meds-title">Rețeta dumneavoastră confirmată</h2>
        <ul className="journey__meds">
          {medications.map((medication) => (
            <li className="journey__med" key={medication.id}>
              <strong>{medication.name}</strong> · {medication.doseText}
              <p>{medication.instructionOriginal}</p>
              {medication.durationText && <p className="journey__muted">Durată: {medication.durationText}</p>}
            </li>
          ))}
        </ul>
      </section>

      {/* BACKEND: patient history (allergies, conditions, medication) needs a context endpoint that does not exist yet. */}
      <section className="journey__panel" aria-label="Istoricul dumneavoastră medical">
        <PatientContextPanel adapter={scenario.context} />
      </section>

      {/*
        AGENT: this is where the real assistant plugs in. Replace scenario.intake with an adapter that
        (1) saves each patient message BEFORE any AI processing (symptom reports are never discarded),
        (2) runs the deterministic red-flag check, separate from LLM text, and
        (3) builds the caseSummary (confirmed prescription + history) for the orchestrator.
        BACKEND: needs POST /cases/:id/messages (exists), GET /cases/:id/messages (missing) and case status updates.
      */}
      <section className="journey__panel" aria-label="Discuție cu asistentul">
        <div className="journey__head"><DataSourceBadge source={scenario.intake.source} /></div>
        <IntakeChatPanel adapter={scenario.intake} />
      </section>
    </>
  );
}
