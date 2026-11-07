import { useState, type FormEvent } from 'react';
import { navigate } from '../../auth/navigation';
import { PendingConnections } from '../connections';
import { extractConnectCode } from './journeyLogic';
import { QrScanner } from './QrScanner';

/**
 * Step 1, one action at a time: scan the doctor's QR with the camera. Nothing else is shown
 * until then. Pasting a code or link is tucked away for people who cannot scan.
 */
export function ConnectStage() {
  const [value, setValue] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [scanning, setScanning] = useState(false);

  function submit(event: FormEvent) {
    event.preventDefault();
    const code = extractConnectCode(value);
    if (!code) { setInvalid(true); return; }
    setInvalid(false);
    navigate(`/connect/${code}`);
  }

  return (
    <>
      <section className="journey__panel" aria-labelledby="journey-connect-title">
        <h2 id="journey-connect-title">Conectați-vă la medicul dumneavoastră</h2>
        <p>Cereți medicului codul QR și scanați-l cu camera telefonului.</p>
        {scanning ? (
          <QrScanner onCode={(code) => navigate(`/connect/${code}`)} onClose={() => setScanning(false)} />
        ) : (
          <>
            <button type="button" className="ui-button ui-button--primary journey__big-button" onClick={() => setScanning(true)}>Scanați codul QR</button>
            <details className="journey__alt">
              <summary>Nu puteți scana? Introduceți codul</summary>
              <p className="journey__help">Un apropiat vă poate trimite linkul medicului pe telefon. Lipiți-l aici și apăsați „Continuați”.</p>
              <form className="journey__code-form" onSubmit={submit} noValidate>
                <label htmlFor="journey-code">Cod sau link de conectare</label>
                <div className="journey__code-row">
                  <input
                    id="journey-code"
                    className="journey__code-input"
                    value={value}
                    onChange={(event) => { setValue(event.target.value); setInvalid(false); }}
                    autoComplete="off"
                    spellCheck={false}
                    aria-invalid={invalid || undefined}
                    aria-describedby={invalid ? 'journey-code-error' : undefined}
                  />
                  <button type="submit" className="ui-button ui-button--primary">Continuați</button>
                </div>
                {invalid && <p id="journey-code-error" className="account-error" role="alert">Codul nu este valid. Verificați dacă ați copiat tot codul sau tot linkul.</p>}
              </form>
            </details>
          </>
        )}
      </section>
      <PendingConnections />
    </>
  );
}
