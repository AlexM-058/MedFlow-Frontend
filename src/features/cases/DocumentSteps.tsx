import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ConfirmedMedication } from '../care-scenario/contracts';
import { createLivePrescriptionAdapter } from '../care-scenario/live/liveAdapters';
import { PrescriptionReviewPanel } from '../prescription-review';
import { DocumentBatch } from './DocumentBatch';
import { MedicationListReview } from './MedicationListReview';

interface StepProps {
  caseId: string;
  token: string;
  onContinue: () => void;
  onSkip: () => void;
}

/**
 * Step "Add the prescription": the patient photographs it, the server reads it, and the patient checks every row
 * against the paper prescription before it counts. What the reader extracted is never shown as confirmed until the
 * patient confirms it (the Backend enforces this too). Optional: "Continue" appears once a prescription is confirmed,
 * "Skip" is always there.
 */
export function PrescriptionStep({ caseId, token, onContinue, onSkip }: StepProps) {
  const adapter = useMemo(
    () => createLivePrescriptionAdapter({ getToken: () => token, getCaseId: async () => caseId }),
    [token, caseId],
  );
  const [confirmed, setConfirmed] = useState<ConfirmedMedication[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    adapter.listConfirmed(controller.signal).then(
      (list) => { if (!controller.signal.aborted) { setConfirmed(list); setLoadError(null); } },
      (error) => {
        if (controller.signal.aborted) return;
        setLoadError(error instanceof Error ? error.message : 'Lista rețetelor confirmate nu a putut fi încărcată.');
      },
    );
    return () => controller.abort();
  }, [adapter]);

  const onConfirmed = useCallback((medications: ConfirmedMedication[]) => {
    setConfirmed((current) => [
      ...current.filter((item) => !medications.some((next) => next.id === item.id)),
      ...medications,
    ]);
  }, []);

  return (
    <section className="journey__panel" aria-labelledby="journey-rx-title">
      <h2 id="journey-rx-title">Adăugați rețeta</h2>
      <p>Faceți o fotografie rețetei. Citirea se face automat, apoi verificați fiecare rând față de rețeta de hârtie. Medicul vede ce ați confirmat. Puteți sări peste acest pas.</p>
      {loadError && <p role="alert">{loadError}</p>}
      {confirmed.length > 0 && (
        <ul aria-label="Medicamente confirmate">
          {confirmed.map((medication) => (
            <li key={medication.id}>
              <strong>{medication.name}</strong> · {medication.doseText}
              <p>{medication.instructionOriginal}</p>
              {medication.durationText && <p>Durată: {medication.durationText}</p>}
            </li>
          ))}
        </ul>
      )}
      <PrescriptionReviewPanel adapter={adapter} onConfirmed={onConfirmed} />
      <div className="journey__actions">
        <button type="button" className="ui-button ui-button--primary" disabled={confirmed.length === 0} onClick={onContinue}>Continuați</button>
        <button type="button" className="ui-button ui-button--secondary" onClick={onSkip}>Sari peste</button>
      </div>
    </section>
  );
}

/**
 * Step "Upload or update the medical documentation": many sheets or a RAR archive, read one by one, then ONE list of
 * medicines to confirm. Optional: the patient can continue to the conversation at any time or skip.
 */
export function DocumentsStep({ caseId, token, onContinue, onSkip }: StepProps) {
  const [revision, setRevision] = useState(0);
  return (
    <section className="journey__panel" aria-labelledby="journey-docs-title">
      <h2 id="journey-docs-title">Documentația medicală</h2>
      <p>Încărcați sau actualizați documentele medicale: analize, scrisori, rețete mai vechi. Puteți alege mai multe fotografii deodată sau o arhivă RAR. Puteți sări peste acest pas.</p>
      <DocumentBatch caseId={caseId} token={token} onFinished={() => setRevision((value) => value + 1)} />
      <MedicationListReview caseId={caseId} token={token} refreshKey={revision} onSaved={() => setRevision((value) => value + 1)} />
      <div className="journey__actions">
        <button type="button" className="ui-button ui-button--primary" onClick={onContinue}>Continuați la conversație</button>
        <button type="button" className="ui-button ui-button--secondary" onClick={onSkip}>Sari peste</button>
      </div>
    </section>
  );
}
