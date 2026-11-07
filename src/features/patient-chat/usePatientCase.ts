import { useEffect, useState } from 'react';
import { useAuth } from '../../auth/authContext';
import { caseApi } from '../../lib/caseApi';
import { chooseCase } from './chatLogic';

export type PatientCaseState = { phase: 'loading' } | { phase: 'ready'; caseId: string } | { phase: 'error'; message: string };

const errorText = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback);

/**
 * The patient's conversation with the connected doctor: the newest case with that doctor, or a new one when there is
 * none yet. One place does this, so the steps of the journey (documents, chat) always work on the SAME case.
 */
export function usePatientCase() {
  const { session, profile } = useAuth();
  const token = session?.access_token ?? null;
  const doctorKey = (profile?.activeDoctors ?? []).map((doctor) => doctor.id).join(',');
  const [state, setState] = useState<PatientCaseState>({ phase: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!token || doctorKey === '') return;
    const controller = new AbortController();
    const connected = doctorKey.split(',');
    (async () => {
      try {
        const cases = await caseApi.listCases(token, 0, controller.signal);
        const opened = chooseCase(cases, connected) ?? await caseApi.createCase(token, connected[0], controller.signal);
        if (!controller.signal.aborted) setState({ phase: 'ready', caseId: opened.id });
      } catch (error) {
        if (!controller.signal.aborted) setState({ phase: 'error', message: errorText(error, 'Conversația nu a putut fi pornită.') });
      }
    })();
    return () => controller.abort();
  }, [token, doctorKey, attempt]);

  return {
    token,
    state,
    retry: () => { setState({ phase: 'loading' }); setAttempt((value) => value + 1); },
  };
}
