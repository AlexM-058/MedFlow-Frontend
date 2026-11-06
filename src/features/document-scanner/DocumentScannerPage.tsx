import { useState } from 'react';
import { AppHeader } from '../../components/AppHeader';
import { DocumentScanner } from './DocumentScanner';
import type { ScannedDocument } from './types';

/**
 * Standalone demo route for the scanner.
 * Confirmed documents stay in local React state — no upload.
 */
export function DocumentScannerPage() {
  const [confirmed, setConfirmed] = useState<ScannedDocument | null>(null);

  return (
    <div className="app">
      <a className="skip-link" href="#scanner-content">Skip to scanner</a>
      <AppHeader />
      <main id="scanner-content" className="doc-scanner-page" tabIndex={-1}>
        <DocumentScanner
          onConfirm={(document) => setConfirmed(document)}
          onCancel={() => {
            window.location.hash = '/patient';
          }}
        />

        {confirmed && (
          <aside className="doc-scanner-page__result" aria-live="polite">
            <h3>Ready for later upload</h3>
            <p>
              Local <code>ScannedDocument</code> confirmed. Wire this object into{' '}
              <code>POST /cases/{'{id}'}/documents</code> when that endpoint exists.
            </p>
            <pre className="doc-scanner-page__json">{JSON.stringify(confirmed, null, 2)}</pre>
            <button
              type="button"
              className="button-secondary"
              onClick={() => setConfirmed(null)}
            >
              Clear confirmed document
            </button>
          </aside>
        )}
      </main>
    </div>
  );
}
