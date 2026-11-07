import { useState } from 'react';
import { navigate } from '../../auth/navigation';
import { PendingConnections } from '../connections';
import { QrScanner } from './QrScanner';
import { StepShell } from './StepShell';

/**
 * Step 1, one action at a time: scan the doctor's QR with the camera. Nothing else is shown
 * until then. There is deliberately no way to type or paste a code or link: the QR is the only entry.
 */
export function ConnectStage() {
  const [scanning, setScanning] = useState(false);

  return (
    <>
      <StepShell
        title="Conectare la medic"
        hint="Scanați codul QR primit de la medicul dumneavoastră."
        primary={scanning ? undefined : { label: 'Scanați codul QR', onClick: () => setScanning(true) }}
      >
        {scanning && <QrScanner onCode={(code) => navigate(`/connect/${code}`)} onClose={() => setScanning(false)} />}
      </StepShell>
      <PendingConnections />
    </>
  );
}
