import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../auth/authContext';
import type { PublicDoctor } from '../../auth/contracts';
import { isOpaqueCode } from '../../auth/navigation';
import { accountApi } from '../../lib/accountApi';
import { requestForDoctor } from './connectionSync';
import { ConnectionStatus } from './ConnectionStatus';
import { cancelItemKey, requestItemKey, usePatientConnections } from './usePatientConnections';
import { useProfileRefresh } from './useProfileRefresh';
import './connections.css';
import { supportContact } from '../../brand/brandAsset';

export function PatientConnectPage({ code }: { code: string }) {
  const auth = useAuth();
  const connections = usePatientConnections();
  const careTeam = useProfileRefresh();
  const [attempt, setAttempt] = useState(0);
  const [preview, setPreview] = useState<{ code: string; attempt: number; doctor: PublicDoctor | null; error: string | null } | null>(null);
  const [signInError, setSignInError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const signInRef = useRef(false);
  const valid = isOpaqueCode(code);

  // Public preview only: it never creates a request, before or after sign-in.
  useEffect(() => {
    if (!valid) return;
    const controller = new AbortController();
    accountApi.previewDoctor(code, controller.signal).then((doctor) => {
      if (!controller.signal.aborted) setPreview({ code, attempt, doctor, error: null });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setPreview({ code, attempt, doctor: null, error: error instanceof Error ? error.message : 'Nu s-a putut deschide acest link al medicului.' });
    });
    return () => controller.abort();
  }, [code, valid, attempt]);

  const current = preview?.code === code ? preview : null;
  const retryingPreview = current !== null && current.attempt !== attempt;
  const doctor = current?.doctor ?? null;
  const verifiedPatient = auth.status === 'ready' && auth.profile?.role === 'patient';
  const latest = requestForDoctor(connections.requests, doctor?.id);
  const pending = latest?.status === 'pending' ? latest : undefined;
  const activeDoctor = Boolean(doctor && auth.profile?.activeDoctors.some((item) => item.id === doctor.id));
  const send = connections.item(requestItemKey(code));
  const cancel = pending ? connections.item(cancelItemKey(pending.id)) : null;
  const sending = send.pending === 'request';
  const listReady = connections.phase === 'ready';

  async function signIn() {
    if (signInRef.current) return;
    signInRef.current = true;
    setSigningIn(true);
    setSignInError(null);
    try { await auth.signInWithGoogle(`/connect/${code}`); }
    catch (error) { setSignInError(error instanceof Error ? error.message : 'Autentificarea cu Google nu a putut fi pornită.'); }
    finally { signInRef.current = false; setSigningIn(false); }
  }

  /** Explicit patient confirmation is the only path that creates a request. */
  function requestConnection() {
    if (!verifiedPatient || !listReady || pending || activeDoctor || sending) return;
    void connections.requestConnection(code);
  }

  return (
    <section className="connection-page" aria-labelledby="connection-page-title">
      <header className="connection-page__heading">
        <p className="connection-eyebrow">ECHIPA DUMNEAVOASTRĂ MEDICALĂ</p>
        <h1 id="connection-page-title">Conectați-vă cu medicul dumneavoastră</h1>
        <p>Verificați datele medicului înainte de a solicita o conexiune. Medicul trebuie să accepte înainte ca conexiunea să devină activă.</p>
      </header>

      {!valid ? <p className="connection-error" role="alert">Acest link al medicului nu este valid. Vă rugăm să scanați din nou codul QR al medicului.</p> : !current ? <p role="status">Se încarcă datele medicului…</p> : current.error ? (
        <div className="connection-error" role="alert">
          <p>{current.error}</p>
          <button
            type="button"
            className="ui-button ui-button--secondary"
            disabled={retryingPreview}
            aria-busy={retryingPreview}
            onClick={() => setAttempt((value) => value + 1)}
          >
            {retryingPreview ? 'Se încearcă din nou…' : 'Încercați din nou'}
          </button>
        </div>
      ) : doctor ? (
        <section className="connection-card" aria-labelledby="connection-doctor-name">
          <p className="connection-eyebrow">MEDIC</p>
          <h2 id="connection-doctor-name">{doctor.fullName}</h2>
          <p>{doctor.specialty}</p><p>{doctor.clinic}</p>

          {auth.status === 'loading' || auth.status === 'profile-loading' ? <p role="status">Se verifică contul dumneavoastră…</p> : auth.status === 'unconfigured' ? (
            <p className="connection-error" role="alert">Autentificarea cu Google nu este încă configurată. {supportContact}</p>
          ) : auth.status === 'error' ? (
            <div className="connection-error" role="alert">
              <p>{auth.error ?? 'Contul dumneavoastră nu a putut fi verificat.'}</p>
              <button
                type="button"
                className="ui-button ui-button--secondary"
                disabled={careTeam.pending}
                aria-busy={careTeam.pending}
                onClick={() => void careTeam.run()}
              >
                {careTeam.pending ? 'Se verifică…' : 'Reîncercați verificarea contului'}
              </button>
            </div>
          ) : !auth.session ? (
            <>
              <p>Autentificați-vă cu Google pentru a continua. Scanarea acestui cod nu trimite automat o cerere.</p>
              {(signInError ?? auth.error) && <p className="connection-error" role="alert">{signInError ?? auth.error}</p>}
              <button type="button" className="ui-button ui-button--primary" disabled={signingIn} aria-busy={signingIn} onClick={() => void signIn()}>
                {signingIn ? 'Se deschide Google…' : 'Continuați cu Google'}
              </button>
            </>
          ) : auth.profile?.role !== 'patient' ? (
            <p className="connection-error" role="alert">Acest cont este un cont de medic. Deconectați-vă și folosiți un cont de pacient pentru a solicita o conexiune.</p>
          ) : (
            <PatientConnectionState
              activeDoctor={activeDoctor}
              connections={connections}
              latest={latest}
              pending={pending}
              send={send}
              cancel={cancel}
              careTeam={careTeam}
              onRequest={requestConnection}
            />
          )}
        </section>
      ) : null}
      <a className="connection-link" href="#/patient">Înapoi la contul dumneavoastră</a>
    </section>
  );
}

type Connections = ReturnType<typeof usePatientConnections>;
type ItemState = ReturnType<Connections['item']>;

function PatientConnectionState({ activeDoctor, connections, latest, pending, send, cancel, careTeam, onRequest }: {
  activeDoctor: boolean;
  connections: Connections;
  latest: ReturnType<typeof requestForDoctor>;
  pending: ReturnType<typeof requestForDoctor>;
  send: ItemState;
  cancel: ItemState | null;
  careTeam: ReturnType<typeof useProfileRefresh>;
  onRequest: () => void;
}) {
  const { phase, error, refreshing } = connections;
  const sending = send.pending === 'request';
  const cancelling = cancel?.pending === 'cancel';

  if (phase === 'loading' || phase === 'idle') return <p role="status">Se verifică conexiunile dumneavoastră existente…</p>;
  if (phase === 'error') {
    return (
      <div className="connection-error" role="alert">
        <p>{error}</p>
        <button type="button" className="ui-button ui-button--secondary" onClick={connections.refresh} disabled={refreshing} aria-busy={refreshing}>
          {refreshing ? 'Se verifică…' : 'Reîmprospătați starea conexiunii'}
        </button>
      </div>
    );
  }

  if (activeDoctor) {
    return <p className="connection-status connection-status--accepted" role="status">Acest medic face parte din echipa dumneavoastră medicală.</p>;
  }

  // A revoked/invalid link or a forbidden action cannot succeed by clicking again.
  const blocked = Boolean(send.error) && !send.retry;
  const canRequest = !pending && latest?.status !== 'accepted' && !blocked;
  return (
    <>
      {latest && <ConnectionStatus status={latest.status} live />}
      {error && <p className="connection-error" role="alert">{error} Se afișează ultima stare cunoscută.</p>}

      {latest?.status === 'accepted' && (
        <div className="connection-notice">
          <p>Medicul dumneavoastră a acceptat cererea. Echipa dumneavoastră medicală se actualizează; dacă acest medic nu apare încă, actualizați-o mai jos.</p>
          <div className="connection-actions">
            <button type="button" className="ui-button ui-button--primary" disabled={careTeam.pending} aria-busy={careTeam.pending} onClick={() => void careTeam.run()}>
              {careTeam.pending ? 'Se actualizează echipa medicală…' : 'Actualizați echipa medicală'}
            </button>
          </div>
        </div>
      )}

      {send.error && <p className="connection-error" role="alert">{send.error}</p>}
      {cancel?.error && <p className="connection-error" role="alert">{cancel.error}</p>}

      <div className="connection-actions">
        {canRequest && (
          <button type="button" className="ui-button ui-button--primary" disabled={sending} aria-busy={sending} onClick={onRequest}>
            {sending
              ? 'Se trimite cererea…'
              : send.error && send.retry
                ? 'Încercați din nou solicitarea'
                : latest ? 'Solicitați din nou conexiunea' : 'Solicitați conexiunea'}
          </button>
        )}
        {pending && (
          <>
            <button type="button" className="ui-button ui-button--secondary" onClick={connections.refresh} disabled={refreshing} aria-busy={refreshing}>
              {refreshing ? 'Se verifică starea…' : 'Reîmprospătați starea'}
            </button>
            <button
              type="button"
              className="ui-button ui-button--secondary"
              disabled={cancelling}
              aria-busy={cancelling}
              onClick={() => void connections.cancelConnection(pending.id)}
            >
              {cancelling ? 'Se anulează…' : 'Anulați cererea'}
            </button>
          </>
        )}
      </div>
      {pending && <p className="connection-meta">Medicul dumneavoastră analizează cererile manual. Această pagină verifică dacă există un răspuns cât timp rămâne deschisă.</p>}
    </>
  );
}
