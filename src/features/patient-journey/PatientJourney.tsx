import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../auth/authContext';
import { DataSourceBadge } from '../care-scenario';
import type { ConfirmedMedication } from '../care-scenario/contracts';
import { createFixtureScenario } from '../care-scenario/fixture';
import { IntakeChatPanel } from '../intake-chat';
import { PatientContextPanel } from '../patient-context';
import { PrescriptionReviewPanel } from '../prescription-review';
import { ConnectStage } from './ConnectStage';
import { journeyStage, type JourneyStage } from './journeyLogic';
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
      <p className="journey__progress" aria-live="polite">Pasul {activeIndex + 1} din {STEPS.length}: {STEPS[activeIndex]?.label}</p>
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
