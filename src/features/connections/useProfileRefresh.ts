import { useCallback, useRef, useState } from 'react';
import { useAuth } from '../../auth/authContext';

/** Explicit care-team refresh with a visible pending state and no duplicate calls. */
export function useProfileRefresh() {
  const { refreshProfile } = useAuth();
  const [pending, setPending] = useState(false);
  const running = useRef(false);

  const run = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setPending(true);
    try {
      // The provider records profile errors itself and shows them through useAuth().
      await refreshProfile();
    } catch {
      /* Reported by the provider; never replaced with local data. */
    } finally {
      running.current = false;
      setPending(false);
    }
  }, [refreshProfile]);

  return { pending, run };
}
