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
    return <section className="connection-page"><h1>Cont pacient</h1><p role="status">Contul dumneavoastră de pacient trebuie verificat înainte de a vă vedea echipa medicală.</p></section>;
  }

  const { phase, requests, error, refreshing, updatedAt } = connections;

  return (
    <section className="connection-page" aria-labelledby="connection-account-title">
      <header className="connection-page__heading">
        <p className="connection-eyebrow">CONT PACIENT</p>
        <h1 id="connection-account-title">Echipa dumneavoastră medicală</h1>
        <p>Bine ați venit, {auth.profile.fullName}. Scanați codul QR al medicului cu camera telefonului pentru a solicita o conexiune.</p>
      </header>

      <section className="connection-section" aria-labelledby="connection-active-title">
        <div className="connection-section__heading">
          <h2 id="connection-active-title">Medici conectați</h2>
          <button
            type="button"
            className="ui-button ui-button--secondary"
            onClick={() => void careTeam.run()}
            disabled={careTeam.pending}
            aria-busy={careTeam.pending}
          >
            {careTeam.pending ? 'Se reîmprospătează echipa medicală…' : 'Reîmprospătați echipa medicală'}
          </button>
        </div>
        {auth.profile.activeDoctors.length === 0 ? <p>Nu aveți încă nicio conexiune activă cu un medic.</p> : (
          <ul className="connection-list">{auth.profile.activeDoctors.map((doctor) => (
            <li className="connection-card" key={doctor.id}>
              <h3>{doctor.fullName}</h3><p>{doctor.specialty}</p><p>{doctor.clinic}</p>
              <p className="connection-status connection-status--accepted">Conexiune activă</p>
            </li>
          ))}</ul>
        )}
      </section>

      <section className="connection-section" aria-labelledby="connection-requests-title" aria-busy={refreshing}>
        <div className="connection-section__heading">
          <h2 id="connection-requests-title">Cereri de conectare</h2>
          <button
            type="button"
            className="ui-button ui-button--secondary"
            onClick={connections.refresh}
            disabled={refreshing}
            aria-busy={refreshing}
          >
            {refreshing ? 'Se reîmprospătează…' : 'Reîmprospătați cererile'}
          </button>
        </div>

        {phase === 'loading' ? <p role="status">Se încarcă cererile de conectare…</p> : phase === 'error' ? (
          <div className="connection-error" role="alert">
            <p>{error}</p>
            <button type="button" className="ui-button ui-button--secondary" onClick={connections.refresh} disabled={refreshing}>
              {refreshing ? 'Se încearcă din nou…' : 'Încercați din nou'}
            </button>
          </div>
        ) : (
          <>
            {error && (
              <p className="connection-error" role="alert">{error} Se afișează ultima listă încărcată.</p>
            )}
            {requests.length === 0 ? <p>Nicio cerere de conectare încă.</p> : (
              <ul className="connection-list">{requests.map((request) => (
                <RequestCard key={request.id} request={request} connections={connections} />
              ))}</ul>
            )}
            {updatedAt !== null && <p className="connection-meta">Ultima actualizare {formatUpdatedAt(updatedAt)}</p>}
          </>
        )}
      </section>
      <p className="connection-note">Mesageria medicală va fi conectată separat. Nicio informație medicală nu este partajată prin scanarea unui cod QR.</p>
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
      {requested && <p className="connection-meta">Solicitat {requested}</p>}
      <ConnectionStatus status={request.status} />
      {state.error && (
        <p className="connection-error" role="alert">{state.error}</p>
      )}
      {request.status === 'pending' && (
        <div className="connection-actions">
          <button
            type="button"
            className="ui-button ui-button--secondary"
            disabled={cancelling}
            aria-busy={cancelling}
            onClick={() => void connections.cancelConnection(request.id)}
          >
            {cancelling ? 'Se anulează…' : state.error && state.retry ? 'Încercați din nou anularea' : 'Anulați cererea'}
            <span className="visually-hidden"> către {request.doctor.fullName}</span>
          </button>
        </div>
      )}
    </li>
  );
}
