import { useCallback, useEffect, useRef, useState } from 'react';
import type { ConnectionCode } from '../../../auth/contracts';
import { accountApi, AccountApiError } from '../../../lib/accountApi';
import { checkConnectionUrl } from './connectionLogic';

export type CodeState =
  | { phase: 'loading' }
  | { phase: 'ready'; code: ConnectionCode; url: string }
  | { phase: 'invalid'; message: string }
  | { phase: 'error'; message: string };

function message(error: unknown, fallback: string): string {
  return error instanceof AccountApiError ? error.message : fallback;
}

/** Loads the doctor's server-issued connection code; never invents a replacement. */
export function useDoctorConnectionCode(token: string | null) {
  const [state, setState] = useState<CodeState>({ phase: 'loading' });
  const [rotating, setRotating] = useState(false);
  const rotatingRef = useRef(false);
  const generation = useRef(0);

  const load = useCallback(async () => {
    const id = ++generation.current;
    if (!token) {
      setState({ phase: 'error', message: 'Sesiunea dumneavoastră nu este disponibilă. Vă rugăm să vă autentificați din nou.' });
      return;
    }
    setState({ phase: 'loading' });
    try {
      const code = await accountApi.getDoctorCode(token);
      if (id !== generation.current) return;
      const check = checkConnectionUrl(code);
      setState(check.ok ? { phase: 'ready', code, url: check.url } : { phase: 'invalid', message: check.reason });
    } catch (error) {
      if (id !== generation.current) return;
      setState({ phase: 'error', message: message(error, 'Codul dumneavoastră QR de conectare nu a putut fi încărcat. Vă rugăm să încercați din nou.') });
    }
  }, [token]);

  useEffect(() => {
    // Initial load; `load` only sets state after the awaited request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    return () => {
      generation.current += 1;
    };
  }, [load]);

  /** Rotates on the server. The displayed code changes only after server success. Throws on failure. */
  const rotate = useCallback(async () => {
    if (rotatingRef.current || !token) return;
    rotatingRef.current = true;
    setRotating(true);
    try {
      const code = await accountApi.rotateDoctorCode(token);
      const check = checkConnectionUrl(code);
      generation.current += 1;
      setState(check.ok ? { phase: 'ready', code, url: check.url } : { phase: 'invalid', message: check.reason });
    } catch (error) {
      throw new Error(message(error, 'Codul QR nu a putut fi regenerat. Codul QR actual încă funcționează.'), { cause: error });
    } finally {
      rotatingRef.current = false;
      setRotating(false);
    }
  }, [token]);

  return { state, reload: load, rotate, rotating };
}
