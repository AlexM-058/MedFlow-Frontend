import { useState } from 'react';
import { useAuth } from '../../auth/authContext';
import { DocumentsStep, PrescriptionStep } from '../cases/DocumentSteps';
import { AddHealthData } from '../patient-context/AddHealthData';
import { PatientChat } from '../patient-chat';
import { usePatientCase } from '../patient-chat/usePatientCase';
import { ConnectStage } from './ConnectStage';
import { journeyStage, type JourneyStage, type JourneyStep } from './journeyLogic';
import './patient-journey.css';

const STEPS: readonly { stage: JourneyStage; label: string }[] = [
  { stage: 'connect', label: 'Conectare la medic' },
  { stage: 'prescription', label: 'Adăugați rețeta' },
  { stage: 'documents', label: 'Documentația medicală' },
  { stage: 'chat', label: 'Conversația cu asistentul' },
];

/**
 * Patient side of the first product: connect (QR) -> add the prescription -> upload or update the medical
 * documentation -> the conversation. One active step at a time, large text and plain wording, so an older patient can
 * complete it with a little help from a relative. The prescription and the documentation are optional ("Skip").
 *
 * Every step works on the SAME case with the connected doctor (usePatientCase). The conversation is the real one:
 * every message is saved in the case (so the doctor sees it) and the local agent only asks collection questions.
 * Medical data is deliberately NOT kept in browser storage; persistence belongs to the backend.
 * The technical test chat (/demo/local-chat) stays reachable by URL for the team only.
 */
export function PatientJourney() {
  const { profile } = useAuth();
  const [step, setStep] = useState<JourneyStep>('prescription');
  const { token, state, retry } = usePatientCase();
  const doctorCount = profile?.activeDoctors.length ?? 0;
  const stage = journeyStage({ doctorCount, step });
  const activeIndex = STEPS.findIndex((entry) => entry.stage === stage);

  return (
    <div className="journey">
      <ol className="journey__dots" aria-label={`Pasul ${activeIndex + 1} din ${STEPS.length}: ${STEPS[activeIndex]?.label ?? ''}`}>
        {STEPS.map((entry, index) => (
          <li key={entry.stage} data-state={index < activeIndex ? 'done' : index === activeIndex ? 'current' : 'todo'} aria-current={index === activeIndex ? 'step' : undefined}>
            <span className="visually-hidden">{entry.label}</span>
          </li>
        ))}
      </ol>
      {stage === 'connect' && <ConnectStage />}
      {stage !== 'connect' && state.phase === 'loading' && <p role="status">Se pregătește dosarul…</p>}
      {stage !== 'connect' && state.phase === 'error' && (
        <section className="step">
          <p role="alert">{state.message}</p>
          <button type="button" className="ui-button ui-button--primary" onClick={retry}>Încercați din nou</button>
        </section>
      )}
      {stage !== 'connect' && state.phase === 'ready' && token && (
        <>
          {stage === 'prescription' && <PrescriptionStep caseId={state.caseId} token={token} onContinue={() => setStep('documents')} onSkip={() => setStep('documents')} />}
          {stage === 'documents' && <DocumentsStep caseId={state.caseId} token={token} onContinue={() => setStep('chat')} onSkip={() => setStep('chat')} />}
          <AddHealthData token={token} raised={stage === 'chat'} />
          {stage === 'chat' && <PatientChat caseId={state.caseId} token={token} onOpenDocuments={() => setStep('documents')} />}
        </>
      )}
    </div>
  );
}
