import type { AccountProfile, ConnectionCode, ConnectionRequest, PublicDoctor } from '../auth/contracts';

export class AccountApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status = 0, code = 'UNAVAILABLE') {
    super(message);
    this.name = 'AccountApiError';
    this.status = status;
    this.code = code;
  }
}

type RecordValue = Record<string, unknown>;
function record(value: unknown): RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AccountApiError('The service returned an invalid response.', 502, 'INVALID_RESPONSE');
  return value as RecordValue;
}
function string(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new AccountApiError('The service returned an invalid response.', 502, 'INVALID_RESPONSE');
  return value;
}
function doctor(value: unknown): PublicDoctor {
  const data = record(value);
  return { id: string(data.id), fullName: string(data.fullName), specialty: string(data.specialty), clinic: string(data.clinic) };
}
function profile(value: unknown): AccountProfile {
  const data = record(value);
  if (data.role !== 'doctor' && data.role !== 'patient') throw new AccountApiError('Your account role could not be verified.', 502, 'INVALID_RESPONSE');
  if (!Array.isArray(data.activeDoctors)) throw new AccountApiError('Your care team could not be verified.', 502, 'INVALID_RESPONSE');
  return { id: string(data.id), email: string(data.email), fullName: string(data.fullName), role: data.role, activeDoctors: data.activeDoctors.map(doctor) };
}
function connection(value: unknown): ConnectionRequest {
  const data = record(value);
  if (!['pending', 'accepted', 'rejected', 'cancelled'].includes(String(data.status))) throw new AccountApiError('The connection status could not be verified.', 502, 'INVALID_RESPONSE');
  const patient = record(data.patient);
  return { id: string(data.id), status: data.status as ConnectionRequest['status'], createdAt: string(data.createdAt), doctor: doctor(data.doctor), patient: { id: string(patient.id), fullName: string(patient.fullName) } };
}

function baseUrl(): string {
  const configured = import.meta.env.VITE_API_BASE_URL?.trim();
  if (!configured) throw new AccountApiError('Account services are not configured yet. Please contact MedFlow support.', 0, 'NOT_CONFIGURED');
  const url = new URL(configured, window.location.origin);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(url.protocol === 'http:' && local))) {
    throw new AccountApiError('The account service URL is not valid.', 0, 'NOT_CONFIGURED');
  }
  return url.href.replace(/\/$/, '');
}

async function request(path: string, token?: string, method = 'GET', body?: unknown, signal?: AbortSignal): Promise<RecordValue> {
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
      headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    let payload: unknown;
    try { payload = await response.json(); } catch { payload = null; }
    if (!response.ok) {
      const code = payload && typeof payload === 'object' && 'code' in payload && typeof payload.code === 'string' ? payload.code : 'REQUEST_FAILED';
      if (response.status === 401 && token) window.dispatchEvent(new CustomEvent('medflow:session-expired', { detail: { token } }));
      const messages: Record<number, string> = { 401: 'Your session has expired. Please sign in again.', 403: 'This account is not allowed to perform that action.', 404: 'This link or record is no longer available.', 409: 'This action has already been processed. Refresh to see its current status.', 410: 'This link has expired or was revoked.', 429: 'Too many attempts. Please wait before trying again.' };
      throw new AccountApiError(messages[response.status] ?? 'Account services are unavailable. Please try again.', response.status, code);
    }
    return record(payload);
  } catch (error) {
    if (error instanceof AccountApiError) throw error;
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    throw new AccountApiError('Could not reach account services. Please try again.');
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}

export const accountApi = {
  async getMe(token: string, signal?: AbortSignal) { return profile((await request('/me', token, 'GET', undefined, signal)).profile); },
  async acceptDoctorInvitation(token: string, invitationToken: string, signal?: AbortSignal) { return profile((await request('/doctor-invitations/accept', token, 'POST', { token: invitationToken }, signal)).profile); },
  async previewDoctor(code: string, signal?: AbortSignal) { return doctor((await request(`/connect/${encodeURIComponent(code)}`, undefined, 'GET', undefined, signal)).doctor); },
  async listConnections(token: string, signal?: AbortSignal) {
    const data = (await request('/connection-requests', token, 'GET', undefined, signal)).requests;
    if (!Array.isArray(data)) throw new AccountApiError('Connection requests could not be verified.', 502, 'INVALID_RESPONSE');
    return data.map(connection);
  },
  async requestConnection(token: string, code: string, signal?: AbortSignal) { return connection((await request('/connection-requests', token, 'POST', { code }, signal)).request); },
  async updateConnection(token: string, id: string, action: 'accept' | 'reject' | 'cancel', signal?: AbortSignal) { return connection((await request(`/connection-requests/${encodeURIComponent(id)}`, token, 'PATCH', { action }, signal)).request); },
  async getDoctorCode(token: string, signal?: AbortSignal): Promise<ConnectionCode> { const data = record((await request('/doctor/connection-code', token, 'GET', undefined, signal)).connectionCode); return { code: string(data.code), url: string(data.url) }; },
  async rotateDoctorCode(token: string, signal?: AbortSignal): Promise<ConnectionCode> { const data = record((await request('/doctor/connection-code/rotate', token, 'POST', {}, signal)).connectionCode); return { code: string(data.code), url: string(data.url) }; },
};
