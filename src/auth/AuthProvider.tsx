import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { accountApi, AccountApiError } from '../lib/accountApi';
import { supportContact } from '../brand/brandAsset';
import { AuthContext, type AuthContextValue, type AuthStatus } from './authContext';
import type { AccountProfile } from './contracts';
import { AUTH_RETURN_KEY, callbackPath, decodeReturn, encodeReturn } from './navigation';

interface Snapshot {
  status: AuthStatus;
  session: Session | null;
  profile: AccountProfile | null;
  error: string | null;
}

// PKCE codes are single-use. StrictMode must share one exchange, not redeem twice.
let callbackExchange: Promise<Session> | undefined;
function exchangeCallback(): Promise<Session> {
  if (!callbackExchange) {
    callbackExchange = (async () => {
      const params = new URLSearchParams(window.location.search);
      if (params.has('error')) throw new Error('Google sign-in was cancelled or could not be completed. Please try again.');
      const code = params.get('code');
      if (!code || !supabase) throw new Error('This sign-in link is incomplete. Please start Google sign-in again.');
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (error || !data.session) throw new Error('This sign-in link has expired or was already used. Please sign in again in this browser.');
      return data.session;
    })();
  }
  return callbackExchange;
}

function finishCallbackUrl(destination: string): void {
  window.history.replaceState(null, '', `${import.meta.env.BASE_URL}#${destination}`);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Snapshot>({ status: supabase ? 'loading' : 'unconfigured', session: null, profile: null, error: null });
  const requestId = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const activeToken = useRef<string | null>(null);
  const invalidateProfile = useCallback(() => {
    ++requestId.current;
    controllerRef.current?.abort();
  }, []);

  const loadProfile = useCallback(async (session: Session | null, background = false) => {
    const id = ++requestId.current;
    controllerRef.current?.abort();
    activeToken.current = session?.access_token ?? null;
    if (!session) {
      if (mounted.current) setState({ status: 'signed-out', session: null, profile: null, error: null });
      return;
    }
    const controller = new AbortController();
    controllerRef.current = controller;
    if (mounted.current) setState(previous => {
      const keepProfile = background && previous.status === 'ready' && previous.profile?.id === session.user.id;
      return { status: keepProfile ? 'ready' : 'profile-loading', session, profile: keepProfile ? previous.profile : null, error: null };
    });
    try {
      const profile = await accountApi.getMe(session.access_token, controller.signal);
      if (profile.id !== session.user.id) throw new AccountApiError('The account identity could not be verified.', 502, 'INVALID_RESPONSE');
      if (mounted.current && id === requestId.current) setState({ status: 'ready', session, profile, error: null });
    } catch (error) {
      if (!mounted.current || id !== requestId.current || controller.signal.aborted) return;
      if (error instanceof AccountApiError && error.status === 401) {
        setState({ status: 'signed-out', session: null, profile: null, error: 'Your session has expired. Please sign in again.' });
      } else {
        setState({ status: 'error', session, profile: null, error: error instanceof AccountApiError ? error.message : 'Your account could not be loaded. Please try again.' });
      }
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    if (!supabase) {
      if (window.location.pathname === callbackPath(import.meta.env.BASE_URL)) {
        queueMicrotask(() => {
          if (!mounted.current) return;
          finishCallbackUrl('/patient');
          try { window.sessionStorage.removeItem(AUTH_RETURN_KEY); } catch { /* Storage may be disabled. */ }
          setState({ status: 'unconfigured', session: null, profile: null, error: `Google sign-in is not configured in this environment. ${supportContact}` });
        });
      }
      return () => { mounted.current = false; };
    }
    const client = supabase;
    let active = true;
    let bootstrapping = true;
    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      // Keep the SDK callback synchronous. API requests happen outside its lock.
      if (event !== 'INITIAL_SESSION' && !bootstrapping && active) void loadProfile(session, true);
    });

    async function initialize() {
      const callback = window.location.pathname === callbackPath(import.meta.env.BASE_URL);
      let destination = '/patient';
      if (callback) {
        try { destination = decodeReturn(window.sessionStorage.getItem(AUTH_RETURN_KEY)); } catch { /* Safe default when storage is unavailable. */ }
      }
      try {
        let session: Session | null;
        if (callback) session = await exchangeCallback();
        else {
          const result = await client.auth.getSession();
          if (result.error) throw new Error('Your session could not be restored. Please sign in again.');
          session = result.data.session;
        }
        if (!active) return;
        if (callback) {
          try { window.sessionStorage.removeItem(AUTH_RETURN_KEY); } catch { /* No credentials are stored in this key. */ }
          finishCallbackUrl(destination);
        }
        bootstrapping = false;
        await loadProfile(session);
      } catch (error) {
        if (!active) return;
        bootstrapping = false;
        if (callback) {
          try { window.sessionStorage.removeItem(AUTH_RETURN_KEY); } catch { /* Storage may be disabled. */ }
          finishCallbackUrl(destination);
        }
        setState({ status: 'signed-out', session: null, profile: null, error: error instanceof Error ? error.message : 'Sign-in could not be completed.' });
      }
    }
    void initialize();

    function expire(event: Event) {
      if (!(event instanceof CustomEvent) || event.detail?.token !== activeToken.current) return;
      activeToken.current = null;
      invalidateProfile();
      void client.auth.signOut({ scope: 'local' }).then(() => {
        if (active && activeToken.current === null) setState({ status: 'signed-out', session: null, profile: null, error: 'Your session has expired. Please sign in again.' });
      });
      setState({ status: 'signed-out', session: null, profile: null, error: 'Your session has expired. Please sign in again.' });
    }
    window.addEventListener('medflow:session-expired', expire);
    return () => {
      active = false;
      mounted.current = false;
      invalidateProfile();
      subscription.unsubscribe();
      window.removeEventListener('medflow:session-expired', expire);
    };
  }, [loadProfile, invalidateProfile]);

  const signInWithGoogle = useCallback(async (destination: string) => {
    if (!supabase) throw new Error(`Google sign-in is not configured yet. ${supportContact}`);
    try { window.sessionStorage.setItem(AUTH_RETURN_KEY, encodeReturn(destination)); } catch {
      throw new Error('Allow session storage in this browser to sign in and return to your invitation or doctor link.');
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}${callbackPath(import.meta.env.BASE_URL)}`, scopes: 'openid email profile', queryParams: { prompt: 'select_account' } },
    });
    if (error) throw new Error('Google sign-in could not be started. Please try again.');
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) throw new Error('Sign-out could not be completed. Please try again.');
    try { window.sessionStorage.removeItem(AUTH_RETURN_KEY); } catch { /* No sensitive state remains in the application. */ }
    await loadProfile(null);
  }, [loadProfile]);

  const refreshProfile = useCallback(async () => {
    if (!supabase) return;
    const beforeSessionRead = requestId.current;
    const { data, error } = await supabase.auth.getSession();
    if (!mounted.current || beforeSessionRead !== requestId.current) return;
    if (error) {
      invalidateProfile();
      activeToken.current = null;
      if (mounted.current) setState({ status: 'signed-out', session: null, profile: null, error: 'Please sign in again.' });
      return;
    }
    await loadProfile(data.session, true);
  }, [loadProfile, invalidateProfile]);

  const value: AuthContextValue = { ...state, signInWithGoogle, signOut, refreshProfile };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
