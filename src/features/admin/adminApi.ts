import type { DoctorInvitation, InvitationForm, InvitationStatus } from './adminLogic';
import { brand } from '../../brand/brand.config';
import { supportContact } from '../../brand/brandAsset';

// Same transport rules as src/lib/accountApi.ts (kept separate so the shared
// account client is not modified): configured HTTPS base, bearer token, no
// cookies, no redirects, no cache, 15 s timeout, session-expired event on 401.

export class AdminApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(message: string, status = 0, code = 'UNAVAILABLE') {
    super(message);
    this.name = 'AdminApiError';
    this.status = status;
    this.code = code;
  }
}

type RecordValue = Record<string, unknown>;
const invalid = () => new AdminApiError('The admin service returned an invalid response.', 502, 'INVALID_RESPONSE');
function record(value: unknown): RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  return value as RecordValue;
}
function string(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw invalid();
  return value;
}
function optionalString(value: unknown): string | null {
  return value === null || value === undefined ? null : string(value);
}
const STATUSES: InvitationStatus[] = ['pending', 'accepted', 'expired', 'revoked'];
function invitation(value: unknown): DoctorInvitation {
  const data = record(value);
  if (!STATUSES.includes(data.status as InvitationStatus)) throw invalid();
  return {
    id: string(data.id), email: string(data.email), fullName: string(data.fullName), specialty: string(data.specialty),
    clinic: string(data.clinic), status: data.status as InvitationStatus, expiresAt: string(data.expiresAt),
    acceptedAt: optionalString(data.acceptedAt), revokedAt: optionalString(data.revokedAt),
  };
}

function baseUrl(): string {
  const configured = import.meta.env.VITE_API_BASE_URL?.trim();
  if (!configured) throw new AdminApiError(`Account services are not configured yet. ${supportContact}`, 0, 'NOT_CONFIGURED');
  const url = new URL(configured, window.location.origin);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(url.protocol === 'http:' && local))) {
    throw new AdminApiError('The account service URL is not valid.', 0, 'NOT_CONFIGURED');
  }
  return url.href.replace(/\/$/, '');
}

const MESSAGES: Record<number, string> = {
  400: 'Check the doctor details and try again.',
  401: 'Your session has expired. Please sign in again.',
  403: `This account is not a ${brand.productName} administrator.`,
  404: 'This invitation is no longer available.',
  429: 'Too many attempts. Please wait a minute before trying again.',
};

async function request(path: string, token: string, method = 'GET', body?: unknown, signal?: AbortSignal): Promise<RecordValue> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timeout = window.setTimeout(abort, 15000);
  try {
    const response = await fetch(`${baseUrl()}${path}`, {
      method,
      signal: controller.signal,
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    let payload: unknown;
    try { payload = await response.json(); } catch { payload = null; }
    if (!response.ok) {
      const code = payload && typeof payload === 'object' && 'code' in payload && typeof payload.code === 'string' ? payload.code : 'REQUEST_FAILED';
      if (response.status === 401) window.dispatchEvent(new CustomEvent('medflow:session-expired', { detail: { token } }));
      throw new AdminApiError(MESSAGES[response.status] ?? 'The admin service is unavailable. Please try again.', response.status, code);
    }
    return record(payload);
  } catch (error) {
    if (error instanceof AdminApiError) throw error;
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    throw new AdminApiError('Could not reach the admin service. Please try again.');
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}

export const adminApi = {
  async getStatus(token: string, signal?: AbortSignal): Promise<boolean> {
    const data = await request('/admin/status', token, 'GET', undefined, signal);
    if (typeof data.isAdmin !== 'boolean') throw invalid();
    return data.isAdmin;
  },
  async listInvitations(token: string, signal?: AbortSignal): Promise<DoctorInvitation[]> {
    const data = await request('/admin/doctor-invitations', token, 'GET', undefined, signal);
    if (!Array.isArray(data.invitations)) throw invalid();
    return data.invitations.map(invitation);
  },
  async createInvitation(token: string, form: InvitationForm, signal?: AbortSignal): Promise<{ invitation: DoctorInvitation; link: string }> {
    const data = await request('/admin/doctor-invitations', token, 'POST', form, signal);
    const link = string(data.link);
    // Only an https (or loopback http) app link to #/doctor/invite/... is shown.
    const parsed = new URL(link);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
    if ((parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && local)) || !/^#\/doctor\/invite\/[A-Za-z0-9_-]{16,256}$/.test(parsed.hash)) {
      throw invalid();
    }
    return { invitation: invitation(data.invitation), link };
  },
  async revokeInvitation(token: string, id: string, signal?: AbortSignal): Promise<DoctorInvitation> {
    const data = await request(`/admin/doctor-invitations/${encodeURIComponent(id)}/revoke`, token, 'POST', {}, signal);
    return invitation(data.invitation);
  },
};
