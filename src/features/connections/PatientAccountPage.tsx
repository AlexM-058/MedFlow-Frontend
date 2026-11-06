import { useAuth } from '../../auth/authContext';
import type { ConnectionRequest } from '../../auth/contracts';
import { ConnectionStatus } from './ConnectionStatus';
import { formatRequestDate, formatUpdatedAt } from './format';
import { cancelItemKey, usePatientConnections } from './usePatientConnections';
import { useProfileRefresh } from './useProfileRefresh';
import './connections.css';

export function PatientAccountPage() {
  const auth = useAuth();
  const connections = usePatientConnections();
  const careTeam = useProfileRefresh();

  if (auth.status !== 'ready' || !auth.profile || auth.profile.role !== 'patient') {
    return <section className="connection-page"><h1>Patient account</h1><p role="status">Your patient account must be verified before viewing your care team.</p></section>;
  }

  const { phase, requests, error, refreshing, updatedAt } = connections;

  return (
    <section className="connection-page" aria-labelledby="connection-account-title">
      <header className="connection-page__heading">
        <p className="connection-eyebrow">PATIENT ACCOUNT</p>
        <h1 id="connection-account-title">Your care team</h1>
        <p>Welcome, {auth.profile.fullName}. Scan your doctor's QR code with your phone camera to request a connection.</p>
      </header>

      <section className="connection-section" aria-labelledby="connection-active-title">
        <div className="connection-section__heading">
          <h2 id="connection-active-title">Connected doctors</h2>
          <button
            type="button"
            className="connection-button connection-button--secondary"
            onClick={() => void careTeam.run()}
            disabled={careTeam.pending}
            aria-busy={careTeam.pending}
          >
            {careTeam.pending ? 'Refreshing care team…' : 'Refresh care team'}
          </button>
        </div>
        {auth.profile.activeDoctors.length === 0 ? <p>You do not have an active doctor connection yet.</p> : (
          <ul className="connection-list">{auth.profile.activeDoctors.map((doctor) => (
            <li className="connection-card" key={doctor.id}>
              <h3>{doctor.fullName}</h3><p>{doctor.specialty}</p><p>{doctor.clinic}</p>
              <p className="connection-status connection-status--accepted">Active connection</p>
            </li>
          ))}</ul>
        )}
      </section>

      <section className="connection-section" aria-labelledby="connection-requests-title" aria-busy={refreshing}>
        <div className="connection-section__heading">
          <h2 id="connection-requests-title">Connection requests</h2>
          <button
            type="button"
            className="connection-button connection-button--secondary"
            onClick={connections.refresh}
            disabled={refreshing}
            aria-busy={refreshing}
          >
            {refreshing ? 'Refreshing…' : 'Refresh requests'}
          </button>
        </div>

        {phase === 'loading' ? <p role="status">Loading connection requests…</p> : phase === 'error' ? (
          <div className="connection-error" role="alert">
            <p>{error}</p>
            <button type="button" className="connection-button connection-button--secondary" onClick={connections.refresh} disabled={refreshing}>
              {refreshing ? 'Trying again…' : 'Try again'}
            </button>
          </div>
        ) : (
          <>
            {error && (
              <p className="connection-error" role="alert">{error} Showing the last loaded list.</p>
            )}
            {requests.length === 0 ? <p>No connection requests yet.</p> : (
              <ul className="connection-list">{requests.map((request) => (
                <RequestCard key={request.id} request={request} connections={connections} />
              ))}</ul>
            )}
            {updatedAt !== null && <p className="connection-meta">Last updated {formatUpdatedAt(updatedAt)}</p>}
          </>
        )}
      </section>
      <p className="connection-note">Medical messaging will be connected separately. No medical information is shared by scanning a QR code.</p>
    </section>
  );
}

function RequestCard({ request, connections }: { request: ConnectionRequest; connections: ReturnType<typeof usePatientConnections> }) {
  const state = connections.item(cancelItemKey(request.id));
  const cancelling = state.pending === 'cancel';
  const requested = formatRequestDate(request.createdAt);
  return (
    <li className="connection-card">
      <h3>{request.doctor.fullName}</h3>
      <p>{request.doctor.specialty} · {request.doctor.clinic}</p>
      {requested && <p className="connection-meta">Requested {requested}</p>}
      <ConnectionStatus status={request.status} />
      {state.error && (
        <p className="connection-error" role="alert">{state.error}</p>
      )}
      {request.status === 'pending' && (
        <div className="connection-actions">
          <button
            type="button"
            className="connection-button connection-button--secondary"
            disabled={cancelling}
            aria-busy={cancelling}
            onClick={() => void connections.cancelConnection(request.id)}
          >
            {cancelling ? 'Cancelling…' : state.error && state.retry ? 'Try cancelling again' : 'Cancel request'}
            <span className="visually-hidden"> to {request.doctor.fullName}</span>
          </button>
        </div>
      )}
    </li>
  );
}
