import { useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../../auth/authContext';
import { caseApi, CaseApiError } from '../../lib/caseApi';
import type { PatientContextAdapter } from '../care-scenario/contracts';
import { PatientContextPanel } from './PatientContextPanel';

export function LivePatientContext() {
  const { session, profile } = useAuth();
  if (!session || profile?.role !== 'patient') return null;
  return <ContextForUser key={profile.id} token={session.access_token} />;
}

function ContextForUser({ token }: { token: string }) {
  const tokenRef = useRef(token);
  useEffect(() => { tokenRef.current = token; }, [token]);
  const adapter = useMemo<PatientContextAdapter>(() => {
    const currentToken = () => {
      if (!tokenRef.current) throw new CaseApiError('Autentificați-vă din nou.', 401, 'UNAUTHORIZED');
      return tokenRef.current;
    };
    return {
      source: 'live',
      load: (signal) => caseApi.loadContext(currentToken(), signal),
      add: (kind, text) => caseApi.addContext(currentToken(), kind, text),
      confirm: (id) => caseApi.updateContext(currentToken(), id, 'confirm'),
      markUnknown: (id) => caseApi.updateContext(currentToken(), id, 'unknown'),
    };
  }, []);
  return <section className="journey__panel" aria-label="Istoric medical salvat">
    <p>Informații declarate de dumneavoastră, salvate în cont. Confirmarea nu înlocuiește verificarea medicului. Nu introduceți date medicale reale în etapa de testare.</p>
    <PatientContextPanel adapter={adapter} />
  </section>;
}
