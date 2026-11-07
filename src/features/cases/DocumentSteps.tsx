import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ConfirmedMedication } from '../care-scenario/contracts';
import { createLivePrescriptionAdapter } from '../care-scenario/live/liveAdapters';
import { StepShell } from '../patient-journey/StepShell';
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
 * Step "Rețeta": one photo of the prescription, read automatically; the patient checks it against the paper and
 * confirms. What the reader extracted is never shown as confirmed until the patient confirms it (the Backend enforces
 * this too). Optional: "Continuați" is enabled once a prescription is confirmed, "Sari peste" is always there.
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
    <StepShell
      title="Rețeta"
      hint="Încărcați o fotografie a rețetei și verificați ce am citit."
      primary={{ label: 'Continuați', onClick: onContinue, disabled: confirmed.length === 0 }}
      secondary={{ label: 'Sari peste', onClick: onSkip }}
    >
      {loadError && <p role="alert">{loadError}</p>}
      {confirmed.length > 0 && (
        <ul className="step__list" aria-label="Medicamente confirmate">
          {confirmed.map((medication) => (
            <li key={medication.id}>
              <strong>{medication.name}</strong>
              <span>{[medication.doseText, medication.instructionOriginal, medication.durationText].filter(Boolean).join(' · ')}</span>
            </li>
          ))}
        </ul>
      )}
      <PrescriptionReviewPanel adapter={adapter} onConfirmed={onConfirmed} compact />
    </StepShell>
  );
}

/**
 * Step "Documentația medicală": two actions. "Încărcați" adds sheets (photos, PDF or a RAR archive), read one by one;
 * "Actualizați" opens the medicines already confirmed so they can be corrected. New sheets always come with ONE list
 * of medicines to confirm. Optional: the patient can continue to the conversation at any time or skip.
 */
export function DocumentsStep({ caseId, token, onContinue, onSkip }: StepProps) {
  const [revision, setRevision] = useState(0);
  const [updating, setUpdating] = useState(false);
  return (
    <StepShell
      title="Documentația medicală"
      hint="Încărcați documente noi sau actualizați medicamentele confirmate."
      primary={{ label: 'Continuați la conversație', onClick: onContinue }}
      secondary={{ label: 'Sari peste', onClick: onSkip }}
    >
      <DocumentBatch
        caseId={caseId}
        token={token}
        onFinished={() => setRevision((value) => value + 1)}
        extraAction={(
          <button type="button" className="ui-button ui-button--secondary" aria-expanded={updating} onClick={() => setUpdating((value) => !value)}>
            Actualizați
          </button>
        )}
      />
      <MedicationListReview
        caseId={caseId}
        token={token}
        refreshKey={revision}
        mode={updating ? 'update' : 'pending'}
        onSaved={() => setRevision((value) => value + 1)}
      />
    </StepShell>
  );
}
