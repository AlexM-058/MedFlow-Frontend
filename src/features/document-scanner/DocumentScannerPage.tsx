import { useEffect, useRef, useState } from 'react';
import { AppHeader } from '../../components/AppHeader';
import { DocumentScanner } from './DocumentScanner';
import { revokeScannedDocumentUri } from './scanDocument';
import type { ScannedDocument } from './types';

/**
 * Standalone demo route for the scanner.
 * Confirmed documents stay in local React state — no upload.
 */
export function DocumentScannerPage() {
  const [confirmed, setConfirmedState] = useState<ScannedDocument | null>(null);
  // This page owns the confirmed document's object URL: revoke it when it is
  // replaced, cleared or the page unmounts.
  const confirmedRef = useRef<ScannedDocument | null>(null);
  const setConfirmed = (next: ScannedDocument | null) => {
    revokeScannedDocumentUri(confirmedRef.current);
    confirmedRef.current = next;
    setConfirmedState(next);
  };
  useEffect(() => () => revokeScannedDocumentUri(confirmedRef.current), []);

  return (
    <div className="app">
      <a className="skip-link" href="#scanner-content">Treceți la scaner</a>
      <AppHeader />
      <main id="scanner-content" className="doc-scanner-page" tabIndex={-1}>
        <DocumentScanner
          onConfirm={(document) => setConfirmed(document)}
          onCancel={() => {
            window.location.hash = '/demo/patient';
          }}
        />

        {confirmed && (
          <aside className="doc-scanner-page__result" aria-live="polite">
            <h3>Pregătit pentru încărcare ulterioară</h3>
            <p>
              <code>ScannedDocument</code> local confirmat. Conectați acest obiect la{' '}
              <code>POST /cases/{'{id}'}/documents</code> când acel endpoint va exista.
            </p>
            <pre className="doc-scanner-page__json">{JSON.stringify(confirmed, null, 2)}</pre>
            <button
              type="button"
              className="ui-button ui-button--secondary"
              onClick={() => setConfirmed(null)}
            >
              Ștergeți documentul confirmat
            </button>
          </aside>
        )}
      </main>
    </div>
  );
}
