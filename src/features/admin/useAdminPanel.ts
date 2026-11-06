import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../auth/authContext';
import { adminApi, AdminApiError } from './adminApi';
import { normalizeForm, replaceInvitation, SessionGuard, sortInvitations, type DoctorInvitation, type InvitationForm } from './adminLogic';

export type AdminPhase = 'signed-out' | 'checking' | 'denied' | 'ready' | 'error';

interface PanelState {
  /** The account this state belongs to. Rendering ignores state of any other account. */
  identity: string | null;
  phase: Exclude<AdminPhase, 'signed-out'>;
  error: string | null;
  invitations: DoctorInvitation[];
  listError: string | null;
  refreshing: boolean;
  /** One-time invitation link. Memory only: never written to storage or the URL. */
  created: { invitationId: string; link: string } | null;
  createError: string | null;
  revoking: Record<string, boolean>;
  revokeErrors: Record<string, string>;
}

const initial = (identity: string | null): PanelState => ({
  identity, phase: 'checking', error: null, invitations: [], listError: null, refreshing: false,
  created: null, createError: null, revoking: {}, revokeErrors: {},
});

const message = (error: unknown, fallback: string) => (error instanceof AdminApiError ? error.message : fallback);
const isAbort = (error: unknown) => error instanceof DOMException && error.name === 'AbortError';

/**
 * Admin panel state bound to the signed-in account. Logout or an account switch
 * clears the link, list and admin status immediately (render-time identity check)
 * and a session guard drops late answers that belong to the previous account.
 */
export function useAdminPanel() {
  const { session, profile } = useAuth();
  const identity = session && profile && session.user.id === profile.id ? profile.id : null;
  const token = identity ? session?.access_token ?? null : null;

  const [state, setState] = useState<PanelState>(() => initial(null));
  const [creating, setCreating] = useState(false);
  const guard = useRef<SessionGuard | null>(null);
  const tokenRef = useRef<string | null>(null);
  const controllers = useRef(new Set<AbortController>());
  const creatingRef = useRef(false);
  const revokingRef = useRef(new Set<string>());

  const getGuard = useCallback(() => (guard.current ??= new SessionGuard()), []);

  /** Runs one request for the current account; returns null if it became stale. */
  const run = useCallback(async <T,>(task: (token: string, signal: AbortSignal) => Promise<T>) => {
    const currentToken = tokenRef.current;
    if (!currentToken) return { stale: true as const };
    const generation = getGuard().current();
    const controller = new AbortController();
    controllers.current.add(controller);
    try {
      const value = await task(currentToken, controller.signal);
      if (!getGuard().isCurrent(generation) || controller.signal.aborted) return { stale: true as const };
      return { stale: false as const, value };
    } catch (error) {
      if (isAbort(error) || !getGuard().isCurrent(generation) || controller.signal.aborted) return { stale: true as const };
      return { stale: false as const, error };
    } finally {
      controllers.current.delete(controller);
    }
  }, [getGuard]);

  const loadList = useCallback(async (owner: string) => {
    setState((s) => (s.identity === owner ? { ...s, refreshing: true } : s));
    const result = await run((t, signal) => adminApi.listInvitations(t, signal));
    if (result.stale) return;
    setState((s) => {
      if (s.identity !== owner) return s;
      if ('error' in result) return { ...s, refreshing: false, listError: message(result.error, 'Invitațiile nu au putut fi încărcate.') };
      return { ...s, refreshing: false, listError: null, invitations: result.value };
    });
  }, [run]);

  const load = useCallback(async (owner: string) => {
    setState((s) => (s.identity === owner ? { ...s, phase: 'checking', error: null } : s));
    const result = await run((t, signal) => adminApi.getStatus(t, signal));
    if (result.stale) return;
    if ('error' in result) {
      setState((s) => (s.identity === owner ? { ...s, phase: 'error', error: message(result.error, 'Accesul de administrator nu a putut fi verificat.') } : s));
      return;
    }
    if (!result.value) {
      setState((s) => (s.identity === owner ? { ...initial(owner), phase: 'denied' } : s));
      return;
    }
    setState((s) => (s.identity === owner ? { ...s, phase: 'ready', error: null } : s));
    await loadList(owner);
  }, [loadList, run]);

  useEffect(() => { tokenRef.current = token; }, [token]);

  // Account boundary: a different (or no) account discards everything at once.
  useEffect(() => {
    const pending = controllers.current;
    getGuard().reset();
    pending.forEach((controller) => controller.abort());
    pending.clear();
    creatingRef.current = false;
    revokingRef.current.clear();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset is tied to the identity change itself
    setState(initial(identity));
    setCreating(false);
    if (identity) void load(identity);
    return () => {
      getGuard().reset();
      pending.forEach((controller) => controller.abort());
      pending.clear();
    };
  }, [identity, load, getGuard]);

  const create = useCallback(async (form: InvitationForm): Promise<boolean> => {
    const owner = identity;
    if (!owner || creatingRef.current) return false;
    creatingRef.current = true;
    setCreating(true);
    setState((s) => (s.identity === owner ? { ...s, createError: null, created: null } : s));
    const result = await run((t, signal) => adminApi.createInvitation(t, normalizeForm(form), signal));
    if (!result.stale) {
      creatingRef.current = false;
      setCreating(false);
    }
    if (result.stale) return false;
    if ('error' in result) {
      setState((s) => (s.identity === owner ? { ...s, createError: message(result.error, 'Invitația nu a putut fi creată.') } : s));
      // A lost answer may still have created the invitation: show the server's list.
      void loadList(owner);
      return false;
    }
    setState((s) => (s.identity === owner ? {
      ...s, createError: null,
      created: { invitationId: result.value.invitation.id, link: result.value.link },
      invitations: replaceInvitation(s.invitations, result.value.invitation),
    } : s));
    return true;
  }, [identity, loadList, run]);

  const revoke = useCallback(async (id: string) => {
    const owner = identity;
    if (!owner || revokingRef.current.has(id)) return;
    revokingRef.current.add(id);
    setState((s) => {
      if (s.identity !== owner) return s;
      const revokeErrors = { ...s.revokeErrors };
      delete revokeErrors[id];
      return { ...s, revoking: { ...s.revoking, [id]: true }, revokeErrors };
    });
    const result = await run((t, signal) => adminApi.revokeInvitation(t, id, signal));
    if (result.stale) return;
    revokingRef.current.delete(id);
    setState((s) => {
      if (s.identity !== owner) return s;
      const revoking = { ...s.revoking };
      delete revoking[id];
      if ('error' in result) return { ...s, revoking, revokeErrors: { ...s.revokeErrors, [id]: message(result.error, 'Invitația nu a putut fi revocată.') } };
      return {
        ...s, revoking,
        invitations: replaceInvitation(s.invitations, result.value),
        // A revoked invitation's link must not stay on screen.
        created: s.created?.invitationId === id ? null : s.created,
      };
    });
  }, [identity, run]);

  const dismissLink = useCallback(() => {
    setState((s) => ({ ...s, created: null }));
  }, []);

  // Render only the state that belongs to the current account.
  const view = identity && state.identity === identity ? state : initial(identity);
  return {
    phase: (identity ? view.phase : 'signed-out') as AdminPhase,
    error: view.error,
    invitations: sortInvitations(view.invitations),
    listError: view.listError,
    refreshing: view.refreshing,
    created: view.created,
    createError: view.createError,
    creating: identity ? creating : false,
    revoking: view.revoking,
    revokeErrors: view.revokeErrors,
    retry: () => { if (identity) void load(identity); },
    refresh: () => { if (identity) void loadList(identity); },
    create,
    revoke,
    dismissLink,
  };
}
