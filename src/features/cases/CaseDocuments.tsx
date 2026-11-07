import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ConfirmedMedication } from '../care-scenario/contracts';
import { createLivePrescriptionAdapter } from '../care-scenario/live/liveAdapters';
import { PrescriptionReviewPanel } from '../prescription-review';
import { DocumentBatch } from './DocumentBatch';
import { MedicationListReview } from './MedicationListReview';

/**
 * Optional step inside a case: the patient adds a prescription photo, the server reads it, and the
 * patient checks every row against the paper prescription before it counts. Nothing here blocks the
 * conversation with the doctor. What the reader extracted is never shown as confirmed until the patient
 * confirms it (the Backend enforces this too).
 */
export function CaseDocuments({ caseId, token }: { caseId: string; token: string }) {
  const adapter = useMemo(
    () => createLivePrescriptionAdapter({ getToken: () => token, getCaseId: async () => caseId }),
    [token, caseId],
  );
  const [confirmed, setConfirmed] = useState<ConfirmedMedication[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

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
  }, [adapter, revision]);

  const onConfirmed = useCallback((medications: ConfirmedMedication[]) => {
    setConfirmed((current) => [
      ...current.filter((item) => !medications.some((next) => next.id === item.id)),
      ...medications,
    ]);
  }, []);

  return (
    <section className="case-inbox__documents" aria-label="Rețeta dumneavoastră">
      <h4>Rețeta dumneavoastră (opțional)</h4>
      <p>Faceți o fotografie rețetei. Citirea se face automat, apoi verificați fiecare rând față de rețeta de hârtie. Medicul vede ce ați confirmat.</p>
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
      <details>
        <summary>{confirmed.length > 0 ? 'Adăugați o altă rețetă' : 'Adăugați o rețetă'}</summary>
        <PrescriptionReviewPanel adapter={adapter} onConfirmed={onConfirmed} />
      </details>
      <details>
        <summary>Încărcați mai multe foi deodată (dosar întreg)</summary>
        <DocumentBatch caseId={caseId} token={token} onFinished={() => setRevision((value) => value + 1)} />
      </details>
      <MedicationListReview caseId={caseId} token={token} refreshKey={revision} onSaved={() => setRevision((value) => value + 1)} />
    </section>
  );
}
