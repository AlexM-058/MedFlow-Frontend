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
      if (!controller.signal.aborted) setPreview({ code, attempt, doctor: null, error: error instanceof Error ? error.message : 'Could not open this doctor link.' });
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
    catch (error) { setSignInError(error instanceof Error ? error.message : 'Could not start Google sign-in.'); }
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
        <p className="connection-eyebrow">YOUR CARE TEAM</p>
        <h1 id="connection-page-title">Connect with your doctor</h1>
        <p>Check the doctor's details before requesting a connection. Your doctor must accept before the connection becomes active.</p>
      </header>

      {!valid ? <p className="connection-error" role="alert">This doctor link is invalid. Please scan the doctor's QR code again.</p> : !current ? <p role="status">Loading doctor details…</p> : current.error ? (
        <div className="connection-error" role="alert">
          <p>{current.error}</p>
          <button
            type="button"
            className="ui-button ui-button--secondary"
            disabled={retryingPreview}
            aria-busy={retryingPreview}
            onClick={() => setAttempt((value) => value + 1)}
          >
            {retryingPreview ? 'Trying again…' : 'Try again'}
          </button>
        </div>
      ) : doctor ? (
        <section className="connection-card" aria-labelledby="connection-doctor-name">
          <p className="connection-eyebrow">DOCTOR</p>
          <h2 id="connection-doctor-name">{doctor.fullName}</h2>
          <p>{doctor.specialty}</p><p>{doctor.clinic}</p>

          {auth.status === 'loading' || auth.status === 'profile-loading' ? <p role="status">Verifying your account…</p> : auth.status === 'unconfigured' ? (
            <p className="connection-error" role="alert">Google sign-in is not configured yet. {supportContact}</p>
          ) : auth.status === 'error' ? (
            <div className="connection-error" role="alert">
              <p>{auth.error ?? 'Your account could not be verified.'}</p>
              <button
                type="button"
                className="ui-button ui-button--secondary"
                disabled={careTeam.pending}
                aria-busy={careTeam.pending}
                onClick={() => void careTeam.run()}
              >
                {careTeam.pending ? 'Verifying…' : 'Retry account verification'}
              </button>
            </div>
          ) : !auth.session ? (
            <>
              <p>Sign in with Google to continue. Scanning this code does not send a request automatically.</p>
              {(signInError ?? auth.error) && <p className="connection-error" role="alert">{signInError ?? auth.error}</p>}
              <button type="button" className="ui-button ui-button--primary" disabled={signingIn} aria-busy={signingIn} onClick={() => void signIn()}>
                {signingIn ? 'Opening Google…' : 'Continue with Google'}
              </button>
            </>
          ) : auth.profile?.role !== 'patient' ? (
            <p className="connection-error" role="alert">This account is a doctor account. Sign out and use a patient account to request a connection.</p>
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
      <a className="connection-link" href="#/patient">Back to your account</a>
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

  if (phase === 'loading' || phase === 'idle') return <p role="status">Checking your existing connections…</p>;
  if (phase === 'error') {
    return (
      <div className="connection-error" role="alert">
        <p>{error}</p>
        <button type="button" className="ui-button ui-button--secondary" onClick={connections.refresh} disabled={refreshing} aria-busy={refreshing}>
          {refreshing ? 'Checking…' : 'Refresh connection status'}
        </button>
      </div>
    );
  }

  if (activeDoctor) {
    return <p className="connection-status connection-status--accepted" role="status">This doctor is in your care team.</p>;
  }

  // A revoked/invalid link or a forbidden action cannot succeed by clicking again.
  const blocked = Boolean(send.error) && !send.retry;
  const canRequest = !pending && latest?.status !== 'accepted' && !blocked;
  return (
    <>
      {latest && <ConnectionStatus status={latest.status} live />}
      {error && <p className="connection-error" role="alert">{error} Showing the last known status.</p>}

      {latest?.status === 'accepted' && (
        <div className="connection-notice">
          <p>Your doctor accepted the request. Your care team is being updated; if this doctor does not appear yet, update it below.</p>
          <div className="connection-actions">
            <button type="button" className="ui-button ui-button--primary" disabled={careTeam.pending} aria-busy={careTeam.pending} onClick={() => void careTeam.run()}>
              {careTeam.pending ? 'Updating care team…' : 'Update care team'}
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
              ? 'Sending request…'
              : send.error && send.retry
                ? 'Try requesting again'
                : latest ? 'Request connection again' : 'Request connection'}
          </button>
        )}
        {pending && (
          <>
            <button type="button" className="ui-button ui-button--secondary" onClick={connections.refresh} disabled={refreshing} aria-busy={refreshing}>
              {refreshing ? 'Checking status…' : 'Refresh status'}
            </button>
            <button
              type="button"
              className="ui-button ui-button--secondary"
              disabled={cancelling}
              aria-busy={cancelling}
              onClick={() => void connections.cancelConnection(pending.id)}
            >
              {cancelling ? 'Cancelling…' : 'Cancel request'}
            </button>
          </>
        )}
      </div>
      {pending && <p className="connection-meta">Your doctor reviews requests manually. This page checks for an answer while it stays open.</p>}
    </>
  );
}
