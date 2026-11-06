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
  title = 'Scan medical document',
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
      const message = err instanceof Error ? err.message : 'Could not capture document.';
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
        <p className="doc-scanner__eyebrow">LOCAL ONLY</p>
        <h2 id="doc-scanner-title">{title}</h2>
        <p className="doc-scanner__hint">
          Capture a printed prescription, lab result, or medical letter. Nothing is uploaded until you
          confirm and a later case flow sends it to the backend.
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
              alt="Scanned medical document preview"
            />
          ) : (
            <div className="doc-scanner__pdf-placeholder">
              <p>PDF ready (preview not shown)</p>
              <p className="doc-scanner__meta">{draft.fileName}</p>
            </div>
          )}
          <dl className="doc-scanner__meta-list">
            <div>
              <dt>File</dt>
              <dd>{draft.fileName}</dd>
            </div>
            <div>
              <dt>Type</dt>
              <dd>{draft.mimeType}</dd>
            </div>
            {typeof draft.sizeBytes === 'number' && (
              <div>
                <dt>Size</dt>
                <dd>{Math.round(draft.sizeBytes / 1024)} KB</dd>
              </div>
            )}
            {method && (
              <div>
                <dt>Capture</dt>
                <dd>{describeCaptureMethod(method)}</dd>
              </div>
            )}
          </dl>
          <div className="doc-scanner__actions">
            <button type="button" className="ui-button ui-button--secondary" onClick={handleCancel}>
              Cancel
            </button>
            <button type="button" className="ui-button ui-button--secondary" onClick={handleRetake}>
              Retake
            </button>
            <button type="button" className="ui-button ui-button--primary doc-scanner__primary" onClick={handleUse}>
              Use Document
            </button>
          </div>
        </div>
      ) : (
        <div className="doc-scanner__idle">
          <p className="doc-scanner__synthetic">
            Use a synthetic printed document for testing (fake prescription / lab sheet).
          </p>
          <div className="doc-scanner__actions">
            <button
              type="button"
              className="ui-button ui-button--primary doc-scanner__primary"
              disabled={phase === 'capturing'}
              aria-busy={phase === 'capturing' || undefined}
              onClick={() => void startCapture(false)}
            >
              {phase === 'capturing' ? 'Opening camera…' : 'Scan document'}
            </button>
            <button
              type="button"
              className="ui-button ui-button--secondary"
              disabled={phase === 'capturing'}
              onClick={() => void startCapture(true)}
            >
              Choose from gallery
            </button>
            {onCancel && (
              <button type="button" className="ui-button ui-button--secondary" onClick={handleCancel}>
                Cancel
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
