import { useId } from 'react';
import type { ConnectionRequest } from '../../../auth/contracts';
import { STATUS_LABEL, splitRequests } from './connectionLogic';
import type { MutationState, RequestsState } from './useConnectionRequests';
import type { ConnectionAction } from './connectionLogic';

const dateTime = new Intl.DateTimeFormat('ro-RO', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const timeOnly = new Intl.DateTimeFormat('ro-RO', { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });

function formatDate(iso: string): string {
  const time = Date.parse(iso);
  return Number.isNaN(time) ? 'Dată necunoscută' : dateTime.format(time);
}

interface Props {
  state: RequestsState;
  mutations: Record<string, MutationState>;
  onRefresh: () => void;
  onAct: (request: ConnectionRequest, action: ConnectionAction) => void;
}

function RequestItem({ request, mutation, onAct }: { request: ConnectionRequest; mutation?: MutationState; onAct: Props['onAct'] }) {
  const busy = mutation?.pending ?? null;
  const isPending = request.status === 'pending';
  return (
    <li className="doctor-account-request">
      <div className="doctor-account-request__main">
        <p className="doctor-account-request__name">{request.patient.fullName}</p>
        <p className="doctor-account-request__meta">
          Solicitată <time dateTime={request.createdAt}>{formatDate(request.createdAt)}</time>
        </p>
      </div>
      <span className={`doctor-account-badge doctor-account-badge--${request.status}`}>{STATUS_LABEL[request.status]}</span>
      {isPending && (
        <div className="doctor-account-actions doctor-account-request__actions">
          <button
            type="button"
            className="doctor-button doctor-button--primary"
            onClick={() => onAct(request, 'accept')}
            disabled={busy !== null}
            aria-busy={busy === 'accept'}
          >
            {busy === 'accept' ? 'Se acceptă…' : 'Acceptați'}
            <span className="doctor-sr-only"> cererea de la {request.patient.fullName}</span>
          </button>
          <button
            type="button"
            className="doctor-button doctor-button--secondary"
            onClick={() => onAct(request, 'reject')}
            disabled={busy !== null}
            aria-busy={busy === 'reject'}
          >
            {busy === 'reject' ? 'Se respinge…' : 'Respingeți'}
            <span className="doctor-sr-only"> cererea de la {request.patient.fullName}</span>
          </button>
        </div>
      )}
      {mutation?.error && (
        <p className="doctor-notice doctor-notice--error doctor-account-request__message" role="alert">
          {mutation.error} Cererea nu a fost modificată; puteți încerca din nou.
        </p>
      )}
      {mutation?.notice && (
        <p className="doctor-notice doctor-notice--info doctor-account-request__message" role="status">
          {mutation.notice}
        </p>
      )}
    </li>
  );
}

export function ConnectionRequestsPanel({ state, mutations, onRefresh, onAct }: Props) {
  const titleId = useId();
  const { pending, history } = splitRequests(state.requests);

  return (
    <section className="doctor-account-panel" aria-labelledby={titleId} aria-busy={state.refreshing}>
      <div className="doctor-account-panel__header doctor-account-panel__header--row">
        <div>
          <h2 id={titleId} className="doctor-account-panel__title">
            Cereri de conectare
          </h2>
          <p className="doctor-account-panel__intro">
            Cereri trimise de pacienții care au folosit codul QR sau linkul dumneavoastră. Nimic nu este acceptat automat.
          </p>
        </div>
        <button type="button" className="doctor-button doctor-button--secondary" onClick={onRefresh} disabled={state.refreshing}>
          {state.refreshing ? 'Se actualizează…' : 'Actualizați'}
        </button>
      </div>

      {state.updatedAt && (
        <p className="doctor-hint">Ultima actualizare: {timeOnly.format(state.updatedAt)}. Lista se actualizează la fiecare 30 de secunde cât timp această pagină este deschisă.</p>
      )}

      {state.phase === 'loading' && (
        <p className="doctor-account-status-line" role="status">
          Se încarcă cererile de conectare…
        </p>
      )}

      {state.error && (
        <div className="doctor-notice doctor-notice--error doctor-account-stack" role="alert">
          <p>
            {state.error}
            {state.phase === 'ready' ? ' Este afișată ultima listă încărcată.' : ''}
          </p>
          <div className="doctor-account-actions">
            <button type="button" className="doctor-button doctor-button--secondary" onClick={onRefresh}>
              Încercați din nou
            </button>
          </div>
        </div>
      )}

      {state.phase === 'ready' && (
        <>
          <h3 className="doctor-account-subtitle">În așteptare ({pending.length})</h3>
          {pending.length === 0 ? (
            <p className="doctor-account-empty">Nu există cereri în așteptare.</p>
          ) : (
            <ul className="doctor-account-requests">
              {pending.map((request) => (
                <RequestItem key={request.id} request={request} mutation={mutations[request.id]} onAct={onAct} />
              ))}
            </ul>
          )}

          <h3 className="doctor-account-subtitle">Istoric ({history.length})</h3>
          {history.length === 0 ? (
            <p className="doctor-account-empty">Nu există încă cereri procesate.</p>
          ) : (
            <ul className="doctor-account-requests">
              {history.map((request) => (
                <RequestItem key={request.id} request={request} mutation={mutations[request.id]} onAct={onAct} />
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
