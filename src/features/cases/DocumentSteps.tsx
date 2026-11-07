import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal } from '../../components/Modal';
import type { ConfirmedMedication } from '../care-scenario/contracts';
import { createLivePrescriptionAdapter } from '../care-scenario/live/liveAdapters';
import { StepShell } from '../patient-journey/StepShell';
import { PrescriptionReviewPanel } from '../prescription-review';
import { DocumentBatch } from './DocumentBatch';
import { FindingsSummary } from './FindingsSummary';
import { MedicationListReview } from './MedicationListReview';

interface StepProps {
  caseId: string;
  token: string;
  onContinue: () => void;
  onSkip: () => void;
}

/** "Amlodipină, Metformin și încă 2": a confirmed list in one short line, so the screen never needs scrolling. */
function names(medications: ConfirmedMedication[]): string {
  const unique = [...new Set(medications.map((medication) => medication.name))];
  return unique.length <= 3 ? unique.join(', ') : `${unique.slice(0, 3).join(', ')} și încă ${unique.length - 3}`;
}

/**
 * Step "Rețeta": one screen, one button. "Încărcați rețeta" opens a pop-up with "Încărcați document" and "Cameră";
 * the reading and the check against the paper happen inside it, and it closes once the prescription is confirmed.
 * What the reader extracted is never shown as confirmed until the patient confirms it (the Backend enforces this
 * too). Optional: "Continuați" is enabled once a prescription is confirmed, "Sari peste" is always there.
 */
export function PrescriptionStep({ caseId, token, onContinue, onSkip }: StepProps) {
  const adapter = useMemo(
    () => createLivePrescriptionAdapter({ getToken: () => token, getCaseId: async () => caseId }),
    [token, caseId],
  );
  const [confirmed, setConfirmed] = useState<ConfirmedMedication[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

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
    setOpen(false);
  }, []);

  return (
    <>
      <StepShell
        title="Rețeta"
        hint="Încărcați rețeta, iar noi o citim pentru dumneavoastră."
        primary={{ label: 'Continuați', onClick: onContinue, disabled: confirmed.length === 0 }}
        secondary={{ label: 'Sari peste', onClick: onSkip }}
      >
        {loadError && <p role="alert">{loadError}</p>}
        {confirmed.length > 0 && <p className="step__done" role="status">✓ Rețetă confirmată: {names(confirmed)}</p>}
        <button type="button" className="ui-button ui-button--primary step__big" onClick={() => setOpen(true)}>
          {confirmed.length > 0 ? 'Încărcați altă rețetă' : 'Încărcați rețeta'}
        </button>
      </StepShell>
      <Modal open={open} title="Încărcați rețeta" onClose={() => setOpen(false)}>
        <PrescriptionReviewPanel adapter={adapter} onConfirmed={onConfirmed} compact />
      </Modal>
    </>
  );
}

/**
 * Step "Documentația medicală": one screen, two buttons. "Încărcați documente" opens a pop-up (document or camera,
 * photos, PDF or a RAR archive, read one by one) followed by ONE list of medicines to confirm; "Actualizați" opens
 * the medicines already confirmed so they can be corrected. Optional: continue to the conversation or skip.
 */
export function DocumentsStep({ caseId, token, onContinue, onSkip }: StepProps) {
  const [revision, setRevision] = useState(0);
  const [modal, setModal] = useState<'upload' | 'update' | null>(null);
  const close = () => setModal(null);
  const refresh = () => setRevision((value) => value + 1);
  return (
    <>
      <StepShell
        title="Documentația medicală"
        hint="Încărcați documente noi sau actualizați medicamentele."
        primary={{ label: 'Continuați la conversație', onClick: onContinue }}
        secondary={{ label: 'Sari peste', onClick: onSkip }}
      >
        <button type="button" className="ui-button ui-button--primary step__big" onClick={() => setModal('upload')}>Încărcați documente</button>
        <button type="button" className="ui-button ui-button--secondary step__big" onClick={() => setModal('update')}>Actualizați</button>
      </StepShell>
      <Modal open={modal === 'upload'} title="Încărcați documente" onClose={close}>
        <DocumentBatch caseId={caseId} token={token} onFinished={refresh} />
        <MedicationListReview caseId={caseId} token={token} refreshKey={revision} mode="pending" onSaved={refresh} />
        <FindingsSummary caseId={caseId} token={token} refreshKey={revision} />
      </Modal>
      <Modal open={modal === 'update'} title="Actualizați medicamentele" onClose={close}>
        <MedicationListReview caseId={caseId} token={token} refreshKey={revision} mode="update" onSaved={refresh} />
        <FindingsSummary caseId={caseId} token={token} refreshKey={revision} />
      </Modal>
    </>
  );
}
