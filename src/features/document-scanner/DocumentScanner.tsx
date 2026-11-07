import { useCallback, useEffect, useRef, useState } from 'react';
import {
  captureMedicalDocument,
  describeCaptureMethod,
  revokeScannedDocumentUri,
} from './scanDocument';
import type { ScanCaptureMethod, ScannedDocument } from './types';
import './document-scanner.css';

type ScannerPhase = 'idle' | 'capturing' | 'preview' | 'error';

export type DocumentScannerProps = {
  /** Called only when the user confirms "Use Document". Image stays local until then. */
  onConfirm: (document: ScannedDocument) => void;
  onCancel?: () => void;
  title?: string;
};

export function DocumentScanner({
  onConfirm,
  onCancel,
  title = 'Scanare document medical',
}: DocumentScannerProps) {
  const [phase, setPhase] = useState<ScannerPhase>('idle');
  const [draft, setDraft] = useState<ScannedDocument | null>(null);
  const [method, setMethod] = useState<ScanCaptureMethod | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Revoke only an unconfirmed draft on unmount. A confirmed document's URL
  // belongs to the onConfirm consumer and must stay valid.
  const draftRef = useRef<ScannedDocument | null>(null);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);
  useEffect(() => () => revokeScannedDocumentUri(draftRef.current), []);

  const clearDraft = useCallback(() => {
    revokeScannedDocumentUri(draft);
    setDraft(null);
    setMethod(null);
  }, [draft]);

  const startCapture = useCallback(async (preferGallery = false) => {
    setError(null);
    setPhase('capturing');
    try {
      const result = await captureMedicalDocument({ preferGallery });
      if (!result) {
        setPhase(draft ? 'preview' : 'idle');
        return;
      }
      revokeScannedDocumentUri(draft);
      setDraft(result.document);
      setMethod(result.method);
      setPhase('preview');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Documentul nu a putut fi capturat.';
      setError(message);
      setPhase('error');
    }
  }, [draft]);

  const handleRetake = () => {
    clearDraft();
    void startCapture(false);
  };

  const handleCancel = () => {
    clearDraft();
    setPhase('idle');
    setError(null);
    onCancel?.();
  };

  const handleUse = () => {
    if (!draft) return;
    const confirmed = draft;
    draftRef.current = null;
    setDraft(null);
    setPhase('idle');
    onConfirm(confirmed);
  };

  return (
    <section className="doc-scanner" aria-labelledby="doc-scanner-title">
      <header className="doc-scanner__header">
        <p className="doc-scanner__eyebrow">DOAR LOCAL</p>
        <h2 id="doc-scanner-title">{title}</h2>
        <p className="doc-scanner__hint">
          Capturați o rețetă tipărită, un rezultat de laborator sau o scrisoare medicală. Nimic nu este încărcat până
          nu confirmați, iar un flux ulterior al cazului îl trimite către backend.
        </p>
      </header>

      {error && (
        <p className="doc-scanner__error" role="alert">
          {error}
        </p>
      )}

      {phase === 'preview' && draft ? (
        <div className="doc-scanner__preview-wrap">
          {draft.mimeType.startsWith('image/') ? (
            <img
              className="doc-scanner__preview"
              src={draft.uri}
              alt="Previzualizare document medical scanat"
            />
          ) : (
            <div className="doc-scanner__pdf-placeholder">
              <p>PDF pregătit (previzualizarea nu este afișată)</p>
              <p className="doc-scanner__meta">{draft.fileName}</p>
            </div>
          )}
          <dl className="doc-scanner__meta-list">
            <div>
              <dt>Fișier</dt>
              <dd>{draft.fileName}</dd>
            </div>
            <div>
              <dt>Tip</dt>
              <dd>{draft.mimeType}</dd>
            </div>
            {typeof draft.sizeBytes === 'number' && (
              <div>
                <dt>Dimensiune</dt>
                <dd>{Math.round(draft.sizeBytes / 1024)} KB</dd>
              </div>
            )}
            {method && (
              <div>
                <dt>Captură</dt>
                <dd>{describeCaptureMethod(method)}</dd>
              </div>
            )}
          </dl>
          <div className="doc-scanner__actions">
            <button type="button" className="ui-button ui-button--secondary" onClick={handleCancel}>
              Anulați
            </button>
            <button type="button" className="ui-button ui-button--secondary" onClick={handleRetake}>
              Refaceți
            </button>
            <button type="button" className="ui-button ui-button--primary doc-scanner__primary" onClick={handleUse}>
              Folosiți documentul
            </button>
          </div>
        </div>
      ) : (
        <div className="doc-scanner__idle">
          <p className="doc-scanner__synthetic">
            Folosiți pentru testare un document tipărit sintetic (rețetă / fișă de laborator fictivă).
          </p>
          <div className="doc-scanner__actions">
            <button
              type="button"
              className="ui-button ui-button--primary doc-scanner__primary"
              disabled={phase === 'capturing'}
              aria-busy={phase === 'capturing' || undefined}
              onClick={() => void startCapture(false)}
            >
              {phase === 'capturing' ? 'Se deschide camera…' : 'Scanați documentul'}
            </button>
            <button
              type="button"
              className="ui-button ui-button--secondary"
              disabled={phase === 'capturing'}
              onClick={() => void startCapture(true)}
            >
              Alegeți din galerie
            </button>
            {onCancel && (
              <button type="button" className="ui-button ui-button--secondary" onClick={handleCancel}>
                Anulați
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
