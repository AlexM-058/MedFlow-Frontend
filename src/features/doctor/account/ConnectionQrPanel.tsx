import { useId, useMemo, useRef, useState } from 'react';
import { DoctorDialog } from '../shared/DoctorDialog';
import { encodeQrModules, qrMatrixToSvg } from './qrEncoder';
import { useDoctorConnectionCode } from './useDoctorConnectionCode';
import { brand } from '../../../brand/brand.config';
import { brandSlug } from '../../../brand/brandAsset';

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
      setStatus('Linkul de conectare a fost copiat.');
    } catch {
      linkRef.current?.focus();
      linkRef.current?.select();
      setStatus('Copierea este blocată în acest browser. Linkul este selectat; copiați-l de la tastatură.');
    }
  }

  function downloadQr() {
    if (!svg) return;
    const blobUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = `${brandSlug}-connection-qr.svg`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 0);
    setStatus('Codul QR a fost descărcat.');
  }

  async function confirmRotate() {
    setRotateError(null);
    try {
      await rotate();
      setConfirmOpen(false);
      setStatus('A fost generat un nou cod QR. Codul QR anterior nu mai funcționează. Pacienții existenți și cererile în așteptare nu sunt afectați.');
    } catch (error) {
      setRotateError(error instanceof Error ? error.message : 'Codul QR nu a putut fi regenerat.');
    }
  }

  return (
    <section className="doctor-account-panel" aria-labelledby={`${linkId}-title`}>
      <div className="doctor-account-panel__header">
        <h2 id={`${linkId}-title`} className="doctor-account-panel__title">
          Codul dumneavoastră QR de conectare
        </h2>
        <p className="doctor-account-panel__intro">
          Pacienții scanează acest cod sau deschid linkul pentru a vă trimite o cerere de conectare. Dumneavoastră decideți dacă o acceptați.
          Codul vă identifică doar pe dumneavoastră; nu conține date ale pacienților și nu autentifică pe nimeni.
        </p>
      </div>

      {state.phase === 'loading' && (
        <p className="doctor-account-status-line" role="status">
          Se încarcă codul dumneavoastră QR de conectare…
        </p>
      )}

      {(state.phase === 'error' || state.phase === 'invalid') && (
        <div className="doctor-notice doctor-notice--error doctor-account-stack" role="alert">
          <p>
            <strong>{state.phase === 'invalid' ? 'Acest link de conectare nu poate fi afișat.' : 'Codul QR de conectare nu este disponibil.'}</strong>{' '}
            {state.message}
          </p>
          <div className="doctor-account-actions">
            <button type="button" className="doctor-button doctor-button--secondary" onClick={() => void reload()}>
              Încercați din nou
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
                alt={`Cod QR către pagina dumneavoastră de conectare ${brand.productName}`}
              />
            ) : (
              <div className="doctor-account-qr__pending" role="img" aria-describedby={qrNoteId} aria-label="Imaginea QR nu este disponibilă">
                <span aria-hidden="true">QR</span>
              </div>
            )}
            <figcaption id={qrNoteId} className="doctor-account-qr__caption">
              {svg
                ? 'Scanați cu camera telefonului.'
                : 'Acest link de conectare nu a putut fi codificat ca imagine QR. Încercați să îl regenerați sau transmiteți linkul de mai jos.'}
            </figcaption>
          </figure>

          <div className="doctor-account-stack">
            <div className="doctor-field">
              <label className="doctor-label" htmlFor={linkId}>
                Link de conectare
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
                Copiați linkul
              </button>
              <button
                type="button"
                className="doctor-button doctor-button--secondary"
                onClick={downloadQr}
                disabled={!svg}
                aria-describedby={svg ? undefined : qrNoteId}
              >
                Descărcați codul QR
              </button>
              <button
                type="button"
                className="doctor-button doctor-button--secondary"
                onClick={() => {
                  setRotateError(null);
                  setConfirmOpen(true);
                }}
              >
                Regenerați codul QR
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
        title="Regenerați codul dumneavoastră QR?"
        description="Codul QR și linkul actuale vor înceta să funcționeze imediat."
        onClose={() => setConfirmOpen(false)}
        preventClose={rotating}
        initialFocusRef={cancelRef}
        footer={
          <>
            <button ref={cancelRef} type="button" className="doctor-button doctor-button--secondary" onClick={() => setConfirmOpen(false)} disabled={rotating}>
              Păstrați codul QR actual
            </button>
            <button
              type="button"
              className="doctor-button doctor-button--primary"
              onClick={() => void confirmRotate()}
              aria-busy={rotating}
              disabled={rotating}
            >
              {rotating ? 'Se regenerează…' : 'Regenerați codul QR'}
            </button>
          </>
        }
      >
        <div className="doctor-account-stack">
          <p>
            Copiile tipărite sau transmise ale vechiului cod QR nu vor mai deschide pagina dumneavoastră de conectare. Pacienții deja conectați
            și cererile aflate deja în așteptare nu sunt afectați.
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
