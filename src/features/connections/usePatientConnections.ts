import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../auth/authContext';
import type { ConnectionRequest } from '../../auth/contracts';
import { accountApi } from '../../lib/accountApi';
import {
  applyServerRequest,
  describeMutationFailure,
  newlyAccepted,
  RequestSync,
  sortPatientRequests,
  type MutationKind,
  type SyncTicket,
} from './connectionSync';

export const CONNECTION_POLL_MS = 15_000;

/**
 * Mutation signatures with the optional AbortSignal agreed with Codex. Until the
 * shared API accepts it the extra argument is ignored and stale results are
 * still discarded by generation; afterwards the network request is cancelled too.
 */
interface MutationApi {
  requestConnection(token: string, code: string, signal?: AbortSignal): Promise<ConnectionRequest>;
  updateConnection(token: string, id: string, action: 'cancel', signal?: AbortSignal): Promise<ConnectionRequest>;
}
const mutationApi: MutationApi = accountApi;

export type ListPhase = 'idle' | 'loading' | 'ready' | 'error';

export interface ConnectionItemState {
  pending: MutationKind | null;
  error: string | null;
  retry: boolean;
}

interface ListState {
  identity: string | null;
  phase: Exclude<ListPhase, 'idle'>;
  requests: ConnectionRequest[];
  error: string | null;
  refreshing: boolean;
  updatedAt: number | null;
}

interface ItemsState {
  identity: string | null;
  items: Record<string, ConnectionItemState>;
}

const EMPTY_LIST: ListState = { identity: null, phase: 'loading', requests: [], error: null, refreshing: false, updatedAt: null };
const EMPTY_ITEMS: ItemsState = { identity: null, items: {} };
const IDLE_ITEM: ConnectionItemState = { pending: null, error: null, retry: false };

export const requestItemKey = (code: string) => `request:${code}`;
export const cancelItemKey = (id: string) => `cancel:${id}`;

/**
 * Connection requests of the signed-in, server-verified patient.
 *
 * - Every async result carries a ticket. A sign-out, account switch, token
 *   change or unmount starts a new generation: older reads and mutations can
 *   no longer change the list, item state or the next session's profile.
 * - Only one read runs at a time. Polling and tab-visibility refreshes skip
 *   while a read or mutation is running; a manual or post-mutation refresh
 *   replaces the running read, and ordering rules reject older results.
 * - Mutations are keyed (one per code / request id), never retried
 *   automatically, and only apply the record returned by the server.
 */
export function usePatientConnections() {
  const { session, profile, refreshProfile } = useAuth();
  const identity = profile?.role === 'patient' && session?.user.id === profile.id ? profile.id : null;
  const token = identity ? session?.access_token ?? null : null;

  const [list, setList] = useState<ListState>(EMPTY_LIST);
  const [itemsState, setItemsState] = useState<ItemsState>(EMPTY_ITEMS);

  const sync = useRef<RequestSync | null>(null);
  const identityRef = useRef<string | null>(null);
  const tokenRef = useRef<string | null>(null);
  const appliedRef = useRef<ConnectionRequest[]>([]);
  const handledAccepted = useRef(new Set<string>());
  const readRef = useRef<{ controller: AbortController; ticket: SyncTicket } | null>(null);
  const mutationControllers = useRef(new Set<AbortController>());
  const inFlight = useRef(new Map<string, SyncTicket>());
  const refreshProfileRef = useRef(refreshProfile);

  useEffect(() => { refreshProfileRef.current = refreshProfile; }, [refreshProfile]);

  const getSync = useCallback(() => {
    sync.current ??= new RequestSync();
    return sync.current;
  }, []);

  const setItem = useCallback((owner: string, key: string, value: ConnectionItemState) => {
    setItemsState((current) => ({
      identity: owner,
      items: { ...(current.identity === owner ? current.items : {}), [key]: value },
    }));
  }, []);

  /** Applies a server list for the current account and refreshes the profile once per acceptance. */
  const applyList = useCallback((owner: string, requests: ConnectionRequest[]) => {
    const accepted = newlyAccepted(appliedRef.current, requests, handledAccepted.current);
    appliedRef.current = requests;
    setList({ identity: owner, phase: 'ready', requests, error: null, refreshing: false, updatedAt: Date.now() });
    if (accepted.length > 0) {
      accepted.forEach((id) => handledAccepted.current.add(id));
      // The provider records its own errors; a rejection must not escape here.
      void refreshProfileRef.current().catch(() => undefined);
    }
  }, []);

  const read = useCallback((force: boolean) => {
    const currentToken = tokenRef.current;
    const owner = identityRef.current;
    if (!currentToken || !owner) return;
    if (readRef.current) {
      if (!force) return;
      readRef.current.controller.abort();
    }
    const controller = new AbortController();
    const ticket = getSync().begin();
    readRef.current = { controller, ticket };
    setList((current) => (current.identity === owner ? { ...current, refreshing: true } : { ...EMPTY_LIST, identity: owner, refreshing: true }));

    accountApi.listConnections(currentToken, controller.signal).then(
      (requests) => {
        if (controller.signal.aborted || !getSync().acceptRead(ticket)) return;
        applyList(owner, requests);
      },
      (error: unknown) => {
        if (controller.signal.aborted || !getSync().isCurrent(ticket)) return;
        const message = error instanceof Error && error.message ? error.message : 'Connection requests could not be loaded.';
        setList((current) => ({
          ...current,
          identity: owner,
          phase: current.identity === owner && current.phase === 'ready' ? 'ready' : 'error',
          error: message,
          refreshing: false,
        }));
      },
    ).finally(() => {
      if (readRef.current?.controller !== controller) return;
      readRef.current = null;
      if (getSync().isCurrent(ticket)) setList((current) => (current.refreshing ? { ...current, refreshing: false } : current));
    });
  }, [applyList, getSync]);

  const abortAll = useCallback(() => {
    readRef.current?.controller.abort();
    readRef.current = null;
    mutationControllers.current.forEach((controller) => controller.abort());
    mutationControllers.current.clear();
    inFlight.current.clear();
  }, []);

  // Session boundary: any change of account or token invalidates pending work.
  useEffect(() => {
    tokenRef.current = token;
    if (identityRef.current !== identity) {
      identityRef.current = identity;
      appliedRef.current = [];
      handledAccepted.current.clear();
    }
    getSync().reset();
    abortAll();
    // Clears per-request spinners of cancelled work; the list itself is kept for the same account.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setItemsState(EMPTY_ITEMS);
    if (identity) read(true);
    return () => {
      getSync().reset();
      abortAll();
    };
  }, [identity, token, read, abortAll, getSync]);

  const view = identity && list.identity === identity ? list : null;
  const hasPending = Boolean(view?.requests.some((request) => request.status === 'pending'));

  // Poll only while something is waiting for the doctor and the tab is visible.
  useEffect(() => {
    if (!identity) return;
    const tick = () => {
      if (document.visibilityState === 'visible' && inFlight.current.size === 0) read(false);
    };
    const timer = hasPending ? window.setInterval(tick, CONNECTION_POLL_MS) : undefined;
    const onVisibility = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      if (timer !== undefined) window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [identity, hasPending, read]);

  const mutate = useCallback(async (
    key: string,
    kind: MutationKind,
    run: (token: string, signal: AbortSignal) => Promise<ConnectionRequest>,
  ): Promise<ConnectionRequest | null> => {
    const currentToken = tokenRef.current;
    const owner = identityRef.current;
    if (!currentToken || !owner || inFlight.current.has(key)) return null;
    const ticket = getSync().begin();
    const controller = new AbortController();
    inFlight.current.set(key, ticket);
    mutationControllers.current.add(controller);
    setItem(owner, key, { pending: kind, error: null, retry: false });
    try {
      const updated = await run(currentToken, controller.signal);
      if (controller.signal.aborted || !getSync().acceptMutation(ticket)) return null;
      applyList(owner, applyServerRequest(appliedRef.current, updated));
      setItem(owner, key, IDLE_ITEM);
      read(true);
      return updated;
    } catch (error) {
      if (controller.signal.aborted || !getSync().isCurrent(ticket)) return null;
      const failure = describeMutationFailure(error, kind);
      setItem(owner, key, { pending: null, error: failure.message, retry: failure.retry });
      if (failure.refresh) read(true);
      return null;
    } finally {
      mutationControllers.current.delete(controller);
      if (inFlight.current.get(key) === ticket) inFlight.current.delete(key);
    }
  }, [applyList, getSync, read, setItem]);

  const refresh = useCallback(() => read(true), [read]);
  const requestConnection = useCallback(
    (code: string) => mutate(requestItemKey(code), 'request', (t, signal) => mutationApi.requestConnection(t, code, signal)),
    [mutate],
  );
  const cancelConnection = useCallback(
    (id: string) => mutate(cancelItemKey(id), 'cancel', (t, signal) => mutationApi.updateConnection(t, id, 'cancel', signal)),
    [mutate],
  );

  const items = identity && itemsState.identity === identity ? itemsState.items : EMPTY_ITEMS.items;
  return {
    phase: (identity ? view?.phase ?? 'loading' : 'idle') as ListPhase,
    requests: view ? sortPatientRequests(view.requests) : [],
    error: view?.error ?? null,
    refreshing: view?.refreshing ?? false,
    updatedAt: view?.updatedAt ?? null,
    item: (key: string): ConnectionItemState => items[key] ?? IDLE_ITEM,
    refresh,
    requestConnection,
    cancelConnection,
  };
}
