// Pure logic for the real doctor workspace. No React, CSS or browser globals,
// so it runs under Node tests. Server responses are the only source of truth.
import type { ConnectionCode, ConnectionRequest, ConnectionStatus } from '../../../auth/contracts.ts';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export type ConnectionUrlCheck = { ok: true; url: string } | { ok: false; reason: string };

/**
 * Validates the server-provided connection link before it is shown or encoded.
 * Expected shape: https://{origin}{base}#/connect/{code}, nothing else.
 * An invalid link is never "repaired": the UI shows an error instead.
 */
export function checkConnectionUrl(connectionCode: ConnectionCode): ConnectionUrlCheck {
  const { code, url } = connectionCode;
  if (!/^[A-Za-z0-9_-]{16,256}$/.test(code)) {
    return { ok: false, reason: 'The connection code from the server has an unexpected format.' };
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: 'The connection link from the server is not a valid address.' };
  }
  const secure = parsed.protocol === 'https:' || (parsed.protocol === 'http:' && LOOPBACK_HOSTS.has(parsed.hostname));
  if (!secure) return { ok: false, reason: 'The connection link must use HTTPS.' };
  if (parsed.username || parsed.password) return { ok: false, reason: 'The connection link must not contain credentials.' };
  if (parsed.search) return { ok: false, reason: 'The connection link must not contain extra parameters.' };
  if (parsed.hash !== `#/connect/${code}`) {
    return { ok: false, reason: 'The connection link does not match the connection code.' };
  }
  return { ok: true, url: parsed.href };
}

export const STATUS_LABEL: Record<ConnectionStatus, string> = {
  pending: 'Pending',
  accepted: 'Accepted',
  rejected: 'Rejected',
  cancelled: 'Cancelled by patient',
};

/** Pending first (oldest waiting first), then history (newest first). Ties by id. */
export function sortRequests(requests: readonly ConnectionRequest[]): ConnectionRequest[] {
  return [...requests].sort((a, b) => {
    const aPending = a.status === 'pending';
    const bPending = b.status === 'pending';
    if (aPending !== bPending) return aPending ? -1 : 1;
    const diff = Date.parse(a.createdAt) - Date.parse(b.createdAt);
    if (diff !== 0 && !Number.isNaN(diff)) return aPending ? diff : -diff;
    return a.id.localeCompare(b.id);
  });
}

export function splitRequests(requests: readonly ConnectionRequest[]) {
  const sorted = sortRequests(requests);
  return {
    pending: sorted.filter((request) => request.status === 'pending'),
    history: sorted.filter((request) => request.status !== 'pending'),
  };
}

/** Replaces one request with the server's returned record (never an optimistic guess). */
export function applyServerRequest(
  requests: readonly ConnectionRequest[],
  updated: ConnectionRequest,
): ConnectionRequest[] {
  const exists = requests.some((request) => request.id === updated.id);
  return exists ? requests.map((request) => (request.id === updated.id ? updated : request)) : [...requests, updated];
}

export type ConnectionAction = 'accept' | 'reject';

/** What the UI should do after a failed accept/reject, by HTTP status. */
export function failureHandling(status: number): 'refresh' | 'reauthenticate' | 'retry' {
  if (status === 409) return 'refresh';
  if (status === 401) return 'reauthenticate';
  return 'retry';
}
