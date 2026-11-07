import type { ConnectionStatus as Status } from '../../auth/contracts';

const LABELS: Record<Status, string> = {
  pending: 'În așteptarea aprobării medicului',
  accepted: 'Cerere acceptată',
  rejected: 'Cerere refuzată',
  cancelled: 'Cerere anulată',
};

/** `live` only for a single, focused status; lists stay quiet during polling. */
export function ConnectionStatus({ status, live = false }: { status: Status; live?: boolean }) {
  return (
    <p className={`connection-status connection-status--${status}`} role={live ? 'status' : undefined}>
      {LABELS[status]}
    </p>
  );
}
