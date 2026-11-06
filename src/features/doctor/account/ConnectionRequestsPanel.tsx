import { useId } from 'react';
import type { ConnectionRequest } from '../../../auth/contracts';
import { STATUS_LABEL, splitRequests } from './connectionLogic';
import type { MutationState, RequestsState } from './useConnectionRequests';
import type { ConnectionAction } from './connectionLogic';

const dateTime = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const timeOnly = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });

function formatDate(iso: string): string {
  const time = Date.parse(iso);
  return Number.isNaN(time) ? 'Unknown date' : dateTime.format(time);
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
          Requested <time dateTime={request.createdAt}>{formatDate(request.createdAt)}</time>
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
            {busy === 'accept' ? 'Accepting…' : 'Accept'}
            <span className="doctor-sr-only"> request from {request.patient.fullName}</span>
          </button>
          <button
            type="button"
            className="doctor-button doctor-button--secondary"
            onClick={() => onAct(request, 'reject')}
            disabled={busy !== null}
            aria-busy={busy === 'reject'}
          >
            {busy === 'reject' ? 'Rejecting…' : 'Reject'}
            <span className="doctor-sr-only"> request from {request.patient.fullName}</span>
          </button>
        </div>
      )}
      {mutation?.error && (
        <p className="doctor-notice doctor-notice--error doctor-account-request__message" role="alert">
          {mutation.error} The request is unchanged; you can try again.
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
            Connection requests
          </h2>
          <p className="doctor-account-panel__intro">
            Requests sent by patients who used your QR or link. Nothing is accepted automatically.
          </p>
        </div>
        <button type="button" className="doctor-button doctor-button--secondary" onClick={onRefresh} disabled={state.refreshing}>
          {state.refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {state.updatedAt && (
        <p className="doctor-hint">Last updated {timeOnly.format(state.updatedAt)}. Updates every 30 seconds while this page is open.</p>
      )}

      {state.phase === 'loading' && (
        <p className="doctor-account-status-line" role="status">
          Loading connection requests…
        </p>
      )}

      {state.error && (
        <div className="doctor-notice doctor-notice--error doctor-account-stack" role="alert">
          <p>
            {state.error}
            {state.phase === 'ready' ? ' Showing the last loaded list.' : ''}
          </p>
          <div className="doctor-account-actions">
            <button type="button" className="doctor-button doctor-button--secondary" onClick={onRefresh}>
              Try again
            </button>
          </div>
        </div>
      )}

      {state.phase === 'ready' && (
        <>
          <h3 className="doctor-account-subtitle">Pending ({pending.length})</h3>
          {pending.length === 0 ? (
            <p className="doctor-account-empty">No pending requests.</p>
          ) : (
            <ul className="doctor-account-requests">
              {pending.map((request) => (
                <RequestItem key={request.id} request={request} mutation={mutations[request.id]} onAct={onAct} />
              ))}
            </ul>
          )}

          <h3 className="doctor-account-subtitle">History ({history.length})</h3>
          {history.length === 0 ? (
            <p className="doctor-account-empty">No processed requests yet.</p>
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
