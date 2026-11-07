import { useState } from 'react';
import { navigate } from '../../auth/navigation';
import { PendingConnections } from '../connections';
import { QrScanner } from './QrScanner';

/**
 * Step 1, one action at a time: scan the doctor's QR with the camera. Nothing else is shown
 * until then. There is deliberately no way to type or paste a code or link: the QR is the only entry.
 */
export function ConnectStage() {
  const [scanning, setScanning] = useState(false);

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
            {/* TEMPORARY: opens the synthetic local-agent chat without a connected doctor. Remove once the real flow is tested. */}
            <button type="button" className="ui-button ui-button--secondary journey__big-button" onClick={() => navigate('/demo/local-chat')}>Deschideți chatul (temporar, test)</button>
          </>
        )}
      </section>
      <PendingConnections />
    </>
  );
}
