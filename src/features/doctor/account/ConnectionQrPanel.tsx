import { useId, useMemo, useRef, useState } from 'react';
import { DoctorDialog } from '../shared/DoctorDialog';
import { encodeQrModules, qrMatrixToSvg } from './qrEncoder';
import { useDoctorConnectionCode } from './useDoctorConnectionCode';

export function ConnectionQrPanel({ token }: { token: string | null }) {
  const { state, reload, rotate, rotating } = useDoctorConnectionCode(token);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [rotateError, setRotateError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const linkRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const linkId = useId();
  const qrNoteId = useId();

  const url = state.phase === 'ready' ? state.url : null;
  const svg = useMemo(() => {
    if (!url) return null;
    const matrix = encodeQrModules(url);
    return matrix ? qrMatrixToSvg(matrix) : null;
  }, [url]);

  async function copyLink() {
    if (!url) return;
    setStatus(null);
    try {
      await navigator.clipboard.writeText(url);
      setStatus('Connection link copied.');
    } catch {
      linkRef.current?.focus();
      linkRef.current?.select();
      setStatus('Copying is blocked in this browser. The link is selected; copy it with your keyboard.');
    }
  }

  function downloadQr() {
    if (!svg) return;
    const blobUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = 'medflow-connection-qr.svg';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 0);
    setStatus('QR code downloaded.');
  }

  async function confirmRotate() {
    setRotateError(null);
    try {
      await rotate();
      setConfirmOpen(false);
      setStatus('A new QR code was generated. The previous QR no longer works. Existing patients and pending requests are unchanged.');
    } catch (error) {
      setRotateError(error instanceof Error ? error.message : 'The QR code could not be regenerated.');
    }
  }

  return (
    <section className="doctor-account-panel" aria-labelledby={`${linkId}-title`}>
      <div className="doctor-account-panel__header">
        <h2 id={`${linkId}-title`} className="doctor-account-panel__title">
          Your connection QR
        </h2>
        <p className="doctor-account-panel__intro">
          Patients scan this code or open the link to send you a connection request. You decide whether to accept
          it. The code identifies you only; it contains no patient data and does not sign anyone in.
        </p>
      </div>

      {state.phase === 'loading' && (
        <p className="doctor-account-status-line" role="status">
          Loading your connection QR…
        </p>
      )}

      {(state.phase === 'error' || state.phase === 'invalid') && (
        <div className="doctor-notice doctor-notice--error doctor-account-stack" role="alert">
          <p>
            <strong>{state.phase === 'invalid' ? 'This connection link cannot be shown.' : 'Connection QR unavailable.'}</strong>{' '}
            {state.message}
          </p>
          <div className="doctor-account-actions">
            <button type="button" className="doctor-button doctor-button--secondary" onClick={() => void reload()}>
              Try again
            </button>
          </div>
        </div>
      )}

      {state.phase === 'ready' && (
        <div className="doctor-account-qr">
          <figure className="doctor-account-qr__figure">
            {svg ? (
              <img
                className="doctor-account-qr__image"
                src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`}
                alt="QR code linking to your MedFlow connection page"
              />
            ) : (
              <div className="doctor-account-qr__pending" role="img" aria-describedby={qrNoteId} aria-label="QR image unavailable">
                <span aria-hidden="true">QR</span>
              </div>
            )}
            <figcaption id={qrNoteId} className="doctor-account-qr__caption">
              {svg
                ? 'Scan with a phone camera.'
                : 'This connection link could not be encoded as a QR image. Try regenerating it, or share the link below.'}
            </figcaption>
          </figure>

          <div className="doctor-account-stack">
            <div className="doctor-field">
              <label className="doctor-label" htmlFor={linkId}>
                Connection link
              </label>
              <input
                ref={linkRef}
                id={linkId}
                className="doctor-input doctor-account-qr__link"
                readOnly
                value={state.url}
                onFocus={(event) => event.currentTarget.select()}
              />
            </div>
            <div className="doctor-account-actions">
              <button type="button" className="doctor-button doctor-button--primary" onClick={() => void copyLink()}>
                Copy link
              </button>
              <button
                type="button"
                className="doctor-button doctor-button--secondary"
                onClick={downloadQr}
                disabled={!svg}
                aria-describedby={svg ? undefined : qrNoteId}
              >
                Download QR
              </button>
              <button
                type="button"
                className="doctor-button doctor-button--secondary"
                onClick={() => {
                  setRotateError(null);
                  setConfirmOpen(true);
                }}
              >
                Regenerate QR
              </button>
            </div>
          </div>
        </div>
      )}

      <p className="doctor-account-status-line" role="status" aria-live="polite">
        {status}
      </p>

      <DoctorDialog
        open={confirmOpen}
        title="Regenerate your QR code?"
        description="The current QR code and link will stop working immediately."
        onClose={() => setConfirmOpen(false)}
        preventClose={rotating}
        initialFocusRef={cancelRef}
        footer={
          <>
            <button ref={cancelRef} type="button" className="doctor-button doctor-button--secondary" onClick={() => setConfirmOpen(false)} disabled={rotating}>
              Keep current QR
            </button>
            <button
              type="button"
              className="doctor-button doctor-button--primary"
              onClick={() => void confirmRotate()}
              aria-busy={rotating}
              disabled={rotating}
            >
              {rotating ? 'Regenerating…' : 'Regenerate QR'}
            </button>
          </>
        }
      >
        <div className="doctor-account-stack">
          <p>
            Printed or shared copies of the old QR will no longer open your connection page. Patients already connected
            to you and requests that are already pending are not affected.
          </p>
          {rotateError && (
            <p className="doctor-notice doctor-notice--error" role="alert">
              {rotateError}
            </p>
          )}
        </div>
      </DoctorDialog>
    </section>
  );
}
