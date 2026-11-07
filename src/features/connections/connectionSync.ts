// Pure synchronisation rules for the patient's connection requests.
// No React, DOM or API imports, so the rules run under plain Node tests.
// The server response is the only source of truth: nothing here invents a status.
import type { ConnectionRequest } from '../../auth/contracts.ts';

export interface SyncTicket {
  readonly generation: number;
  readonly startedAt: number;
}

/**
 * Decides whether an asynchronous result may still change the screen.
 * - `reset()` starts a new generation (sign-out, account or token change, unmount):
 *   every result that belongs to an older generation is ignored.
 * - Reads apply only if they started after the last applied change, so two
 *   refreshes resolving in reverse order, or a read that was already in flight
 *   when a mutation completed, can never restore an older list.
 */
export class RequestSync {
  private generation = 0;
  private clock = 0;
  private appliedAt = 0;

  reset(): void {
    this.generation += 1;
    this.appliedAt = 0;
  }

  begin(): SyncTicket {
    this.clock += 1;
    return { generation: this.generation, startedAt: this.clock };
  }

  isCurrent(ticket: SyncTicket): boolean {
    return ticket.generation === this.generation;
  }

  /** Returns true and records the read when its result may be shown. */
  acceptRead(ticket: SyncTicket): boolean {
    if (!this.isCurrent(ticket) || ticket.startedAt <= this.appliedAt) return false;
    this.appliedAt = ticket.startedAt;
    return true;
  }

  /** A completed mutation outranks every read that started before this moment. */
  acceptMutation(ticket: SyncTicket): boolean {
    if (!this.isCurrent(ticket)) return false;
    this.clock += 1;
    this.appliedAt = this.clock;
    return true;
  }
}

/** Replaces one request with the record returned by the server. */
export function applyServerRequest(requests: readonly ConnectionRequest[], updated: ConnectionRequest): ConnectionRequest[] {
  return requests.some((request) => request.id === updated.id)
    ? requests.map((request) => (request.id === updated.id ? updated : request))
    : [...requests, updated];
}

/** Pending first, then newest first. Ties by id so the order is stable across polls. */
export function sortPatientRequests(requests: readonly ConnectionRequest[]): ConnectionRequest[] {
  return [...requests].sort((a, b) => {
    const aPending = a.status === 'pending';
    if (aPending !== (b.status === 'pending')) return aPending ? -1 : 1;
    const diff = Date.parse(b.createdAt) - Date.parse(a.createdAt);
    if (diff !== 0 && !Number.isNaN(diff)) return diff;
    return a.id.localeCompare(b.id);
  });
}

/**
 * IDs that the server moved from pending to accepted between two lists of the
 * same account. `handled` prevents a second profile refresh for the same request.
 */
export function newlyAccepted(
  previous: readonly ConnectionRequest[],
  next: readonly ConnectionRequest[],
  handled: ReadonlySet<string>,
): string[] {
  const wasPending = new Set(previous.filter((request) => request.status === 'pending').map((request) => request.id));
  return next
    .filter((request) => request.status === 'accepted' && wasPending.has(request.id) && !handled.has(request.id))
    .map((request) => request.id);
}

/** The request that describes this doctor: the pending one, otherwise the newest. */
export function requestForDoctor(requests: readonly ConnectionRequest[], doctorId: string | undefined): ConnectionRequest | undefined {
  if (!doctorId) return undefined;
  return sortPatientRequests(requests.filter((request) => request.doctor.id === doctorId))[0];
}

export type MutationKind = 'request' | 'cancel';

export interface MutationFailure {
  message: string;
  /** Reload the list so the server's current status is shown. */
  refresh: boolean;
  /** The same explicit action may be tried again. */
  retry: boolean;
}

/** Maps a failed request/cancel to user-facing handling. Duck-typed on `status`. */
export function describeMutationFailure(error: unknown, kind: MutationKind): MutationFailure {
  const status = typeof error === 'object' && error !== null && typeof (error as { status?: unknown }).status === 'number'
    ? (error as { status: number }).status
    : 0;
  const serverMessage = error instanceof Error && error.message ? error.message : null;
  switch (status) {
    case 409:
      return {
        message: kind === 'request'
          ? 'O cerere pentru acest medic a fost deja procesată. Starea ei curentă este afișată aici.'
          : 'Această cerere a fost deja procesată. Starea ei curentă este afișată aici.',
        refresh: true,
        retry: false,
      };
    case 401:
      return { message: 'Sesiunea dumneavoastră a expirat. Vă rugăm să vă autentificați din nou.', refresh: false, retry: false };
    case 403:
      return { message: serverMessage ?? 'Acest cont nu are permisiunea de a efectua această acțiune.', refresh: false, retry: false };
    case 404:
    case 410:
      return kind === 'request'
        ? { message: 'Acest link al medicului nu mai este valid. Solicitați medicului codul QR actual.', refresh: true, retry: false }
        : { message: 'Această cerere nu mai este disponibilă. Lista a fost reîmprospătată.', refresh: true, retry: false };
    case 429:
      return { message: 'Prea multe încercări. Vă rugăm să așteptați puțin înainte de a încerca din nou.', refresh: false, retry: true };
    default:
      return {
        message: kind === 'request'
          ? 'Cererea dumneavoastră de conectare nu a putut fi confirmată. Verificați starea ei mai jos înainte de a încerca din nou.'
          : 'Cererea nu a putut fi anulată. Vă rugăm să încercați din nou.',
        refresh: true,
        retry: true,
      };
  }
}
