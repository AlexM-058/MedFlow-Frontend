import { PatientAccountPage } from './PatientAccountPage';
import { usePatientConnections } from './usePatientConnections';

/**
 * Shows the connection status only while a request waits for the doctor. Otherwise it renders
 * nothing, so the first step stays one clear action for an older patient.
 */
export function PendingConnections() {
  const { requests } = usePatientConnections();
  if (!requests.some((request) => request.status === 'pending')) return null;
  return <PatientAccountPage />;
}
