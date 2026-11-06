import { useCallback, useEffect, useRef, useState } from 'react';
import type { ConnectionRequest } from '../../../auth/contracts';
import { accountApi, AccountApiError } from '../../../lib/accountApi';
import { applyServerRequest, failureHandling, type ConnectionAction } from './connectionLogic';

export const REQUEST_POLL_MS = 30_000;

export interface RequestsState {
  phase: 'loading' | 'ready' | 'error';
  requests: ConnectionRequest[];
  /** List-level error; previously loaded requests stay visible. */
  error: string | null;
  refreshing: boolean;
  updatedAt: Date | null;
}

export interface MutationState {
  pending: ConnectionAction | null;
  error: string | null;
  notice: string | null;
}

const isAbort = (error: unknown) => error instanceof DOMException && error.name === 'AbortError';

/**
 * Server-scoped connection requests. Reads are abortable (an obsolete read is
 * cancelled when a new one starts) and repeat while the page is visible.
 * Mutations are per request, guarded against duplicate sends, and only apply
 * the record returned by the server.
 */
export function useConnectionRequests(token: string | null) {
  const [state, setState] = useState<RequestsState>({ phase: 'loading', requests: [], error: null, refreshing: false, updatedAt: null });
  const [mutations, setMutations] = useState<Record<string, MutationState>>({});
  const inFlight = useRef(new Set<string>());
  const readController = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    readController.current?.abort();
    if (!token) {
      setState((s) => ({ ...s, phase: 'error', error: 'Your session is not available. Please sign in again.' }));
      return;
    }
    const controller = new AbortController();
    readController.current = controller;
    setState((s) => ({ ...s, refreshing: true }));
    try {
      const requests = await accountApi.listConnections(token, controller.signal);
      if (controller.signal.aborted) return;
      setState({ phase: 'ready', requests, error: null, refreshing: false, updatedAt: new Date() });
    } catch (error) {
      if (isAbort(error) || controller.signal.aborted) return;
      const text = error instanceof AccountApiError ? error.message : 'Connection requests could not be loaded.';
      setState((s) => ({ ...s, phase: s.phase === 'ready' ? 'ready' : 'error', error: text, refreshing: false }));
    } finally {
      if (readController.current === controller) readController.current = null;
    }
  }, [token]);

  useEffect(() => {
    // Initial read; state changes only after the awaited request.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, REQUEST_POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      readController.current?.abort();
    };
  }, [refresh]);

  const act = useCallback(
    async (request: ConnectionRequest, action: ConnectionAction) => {
      if (!token || inFlight.current.has(request.id)) return;
      inFlight.current.add(request.id);
      setMutations((m) => ({ ...m, [request.id]: { pending: action, error: null, notice: null } }));
      try {
        const updated = await accountApi.updateConnection(token, request.id, action);
        setState((s) => ({ ...s, requests: applyServerRequest(s.requests, updated) }));
        const done = updated.status === 'accepted' ? 'accepted' : updated.status === 'rejected' ? 'rejected' : updated.status;
        setMutations((m) => ({ ...m, [request.id]: { pending: null, error: null, notice: `Request from ${updated.patient.fullName} ${done}.` } }));
      } catch (error) {
        const status = error instanceof AccountApiError ? error.status : 0;
        const handling = failureHandling(status);
        const text = error instanceof AccountApiError ? error.message : 'The request could not be updated. Please try again.';
        setMutations((m) => ({
          ...m,
          [request.id]: {
            pending: null,
            error: handling === 'refresh' ? null : text,
            notice: handling === 'refresh' ? 'This request was already processed. The list was refreshed with its current status.' : null,
          },
        }));
        if (handling === 'refresh') void refresh();
      } finally {
        inFlight.current.delete(request.id);
      }
    },
    [token, refresh],
  );

  return { state, mutations, refresh, act };
}
