import { useCallback, useEffect, useState } from 'react';

export type Resource<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'error'; message: string };

interface Settled<T> {
  load: (signal: AbortSignal) => Promise<T>;
  attempt: number;
  resource: Resource<T>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'Solicitarea a eșuat.';
}

/**
 * Loads one resource, aborts on unmount or when `load` changes, and never falls back
 * to other data on error. A result belongs to the `load` + attempt that produced it,
 * so a late response for a previous adapter is never shown.
 */
export function useResource<T>(load: (signal: AbortSignal) => Promise<T>, refreshKey = 0): [Resource<T>, () => void] {
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<Settled<T> | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setSettled({ load, attempt, resource: { status: 'ready', data } });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setSettled({ load, attempt, resource: { status: 'error', message: errorMessage(error) } });
      },
    );
    return () => controller.abort();
  }, [load, attempt, refreshKey]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  const current = settled && settled.load === load && settled.attempt === attempt ? settled.resource : { status: 'loading' as const };
  return [current, retry];
}

export { errorMessage };
