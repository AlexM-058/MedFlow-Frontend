import { useEffect, useId, useRef, useState } from 'react';
import { caseApi } from '../../lib/caseApi';
import { ArchiveError, extractRar, isRarFile } from './archive';
import {
  BATCH_MAX_FILES,
  createBatch,
  retryable,
  runBatch,
  summarizeBatch,
  type BatchItem,
  type BatchStop,
} from './batchUpload';
import { loadRarWasm } from './rarWasm';

const STATUS_TEXT: Record<BatchItem['status'], string> = {
  pending: 'În așteptare',
  reading: 'Se citește…',
  done: 'Citit',
  failed: 'Nu a putut fi citit',
};

const STOP_TEXT: Record<Exclude<BatchStop, null>, string> = {
  session: 'Sesiunea a expirat. Autentificați-vă din nou, apoi reluați foile rămase.',
  unavailable: 'Serviciul de citire nu răspunde. Foile rămase nu au fost trimise; încercați din nou mai târziu.',
  cancelled: 'Citirea a fost oprită. Puteți relua foile rămase.',
};

/**
 * Many sheets at once (a whole medical file): they are sent ONE AT A TIME with progress, a failing sheet never
 * stops the others and can be retried. The photos stay on this device; the server keeps only what it read.
 * Nothing counts as confirmed here: the patient verifies the medicines afterwards.
 */
export function DocumentBatch({ caseId, token, onFinished }: { caseId: string; token: string; onFinished: () => void }) {
  const inputId = useId();
  const cameraId = useId();
  const [items, setItems] = useState<BatchItem[]>([]);
  const [running, setRunning] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [stopped, setStopped] = useState<BatchStop>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  async function start(batch: BatchItem[]) {
    const current = new AbortController();
    controller.current = current;
    setRunning(true);
    setStopped(null);
    const result = await runBatch(
      batch,
      (file, signal) => caseApi.uploadDocument(token, caseId, file, 'prescription', signal),
      setItems,
      current.signal,
    );
    setStopped(result.stopped);
    setRunning(false);
    onFinished();
  }

  /** Photos and PDFs go in as they are; a .rar is opened here in the browser (nothing is uploaded or saved). */
  async function choose(files: FileList | null) {
    const picked = files ? Array.from(files) : [];
    if (picked.length === 0) return;
    setPreparing(true);
    const documents: File[] = [];
    const rejected: { name: string; reason: string }[] = [];
    for (const file of picked) {
      if (!isRarFile(file)) { documents.push(file); continue; }
      try {
        const opened = await extractRar(await file.arrayBuffer(), await loadRarWasm());
        documents.push(...opened.files);
        rejected.push(...opened.skipped.map((entry) => ({ name: `${file.name} › ${entry.name}`, reason: entry.reason })));
      } catch (error) {
        rejected.push({ name: file.name, reason: error instanceof ArchiveError ? error.message : 'Arhiva nu a putut fi deschisă.' });
      }
    }
    const batch = createBatch(documents, rejected);
    setItems(batch);
    setPreparing(false);
    if (batch.some((item) => item.status === 'pending')) void start(batch);
    else setStopped(null);
  }

  const stats = summarizeBatch(items);
  const left = stats.pending + stats.reading;

  return (
    <section className="case-inbox__batch" aria-label="Încărcare mai multe foi">
      <div className="step__choices">
        <label htmlFor={inputId} className={`ui-button ui-button--primary${running || preparing ? ' is-disabled' : ''}`}>Încărcați document</label>
        <label htmlFor={cameraId} className={`ui-button ui-button--secondary${running || preparing ? ' is-disabled' : ''}`}>Cameră</label>
      </div>
      <input id={cameraId} type="file" accept="image/jpeg,image/png" capture="environment" disabled={running || preparing}
        className="doctor-sr-only" onChange={(event) => { const chosen = event.target.files; void choose(chosen); event.target.value = ''; }} />
      <input id={inputId} type="file" multiple accept="image/jpeg,image/png,application/pdf,.rar,application/vnd.rar,application/x-rar-compressed" disabled={running || preparing}
        className="doctor-sr-only" onChange={(event) => { const chosen = event.target.files; void choose(chosen); event.target.value = ''; }} />
      <p className="step__hint">Mai multe deodată: JPG, PNG, PDF sau o arhivă RAR (cel mult {BATCH_MAX_FILES} fișiere).</p>
      {preparing && <p role="status">Se deschid arhivele…</p>}
      {items.length > 0 && (
        <>
          <p role="status" aria-live="polite">
            {running ? `Se citește foaia ${Math.min(stats.done + stats.failed + 1, stats.total)} din ${stats.total}…` : `Terminat: ${stats.done} din ${stats.total} citite${stats.failed ? `, ${stats.failed} cu probleme` : ''}.`}
          </p>
          <progress max={stats.total} value={stats.done + stats.failed} aria-label="Progres citire" />
          <details open={stats.failed > 0 || undefined}>
            <summary>Detalii pe foi ({stats.total})</summary>
            <ul aria-label="Foile încărcate">
              {items.map((item) => (
                <li key={item.id}>
                  <strong>{item.name}</strong>: {STATUS_TEXT[item.status]}
                  {item.message && item.status === 'failed' && <span role="alert"> {item.message}</span>}
                </li>
              ))}
            </ul>
          </details>
          {running && <button type="button" className="ui-button ui-button--secondary" onClick={() => controller.current?.abort()}>Opriți citirea</button>}
          {!running && stopped && <p role="alert">{STOP_TEXT[stopped]}</p>}
          {!running && (stats.failed > 0 || left > 0) && (
            <button type="button" className="ui-button ui-button--primary" onClick={() => void start(retryable(items))}>
              {left > 0 ? 'Reluați foile rămase' : 'Reîncercați foile cu probleme'}
            </button>
          )}
        </>
      )}
    </section>
  );
}
