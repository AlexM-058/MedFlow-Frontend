import type { AccountProfile, ConnectionCode, ConnectionRequest, PublicDoctor } from '../auth/contracts';
import { supportContact } from '../brand/brandAsset';

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
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AccountApiError('Serviciul a returnat un răspuns invalid.', 502, 'INVALID_RESPONSE');
  return value as RecordValue;
}
function string(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new AccountApiError('Serviciul a returnat un răspuns invalid.', 502, 'INVALID_RESPONSE');
  return value;
}
function doctor(value: unknown): PublicDoctor {
  const data = record(value);
  return { id: string(data.id), fullName: string(data.fullName), specialty: string(data.specialty), clinic: string(data.clinic) };
}
function profile(value: unknown): AccountProfile {
  const data = record(value);
  if (data.role !== 'doctor' && data.role !== 'patient') throw new AccountApiError('Rolul contului dumneavoastră nu a putut fi verificat.', 502, 'INVALID_RESPONSE');
  if (!Array.isArray(data.activeDoctors)) throw new AccountApiError('Echipa dumneavoastră de îngrijire nu a putut fi verificată.', 502, 'INVALID_RESPONSE');
  return { id: string(data.id), email: string(data.email), fullName: string(data.fullName), role: data.role, activeDoctors: data.activeDoctors.map(doctor) };
}
function connection(value: unknown): ConnectionRequest {
  const data = record(value);
  if (!['pending', 'accepted', 'rejected', 'cancelled'].includes(String(data.status))) throw new AccountApiError('Starea conexiunii nu a putut fi verificată.', 502, 'INVALID_RESPONSE');
  const patient = record(data.patient);
  return { id: string(data.id), status: data.status as ConnectionRequest['status'], createdAt: string(data.createdAt), doctor: doctor(data.doctor), patient: { id: string(patient.id), fullName: string(patient.fullName) } };
}

function baseUrl(): string {
  const configured = import.meta.env.VITE_API_BASE_URL?.trim();
  if (!configured) throw new AccountApiError(`Serviciile contului nu sunt încă configurate. ${supportContact}`, 0, 'NOT_CONFIGURED');
  const url = new URL(configured, window.location.origin);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(url.protocol === 'http:' && local))) {
    throw new AccountApiError('Adresa serviciului contului nu este validă.', 0, 'NOT_CONFIGURED');
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
      const messages: Record<number, string> = { 401: 'Sesiunea dumneavoastră a expirat. Vă rugăm să vă autentificați din nou.', 403: 'Acest cont nu are voie să efectueze această acțiune.', 404: 'Acest link sau această înregistrare nu mai este disponibilă.', 409: 'Această acțiune a fost deja procesată. Reîncărcați pagina pentru a vedea starea curentă.', 410: 'Acest link a expirat sau a fost revocat.', 429: 'Prea multe încercări. Vă rugăm să așteptați înainte de a încerca din nou.' };
      throw new AccountApiError(messages[response.status] ?? 'Serviciile contului sunt indisponibile. Vă rugăm să încercați din nou.', response.status, code);
    }
    return record(payload);
  } catch (error) {
    if (error instanceof AccountApiError) throw error;
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    throw new AccountApiError('Serviciile contului nu au putut fi contactate. Vă rugăm să încercați din nou.');
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
    if (!Array.isArray(data)) throw new AccountApiError('Cererile de conectare nu au putut fi verificate.', 502, 'INVALID_RESPONSE');
    return data.map(connection);
  },
  async requestConnection(token: string, code: string, signal?: AbortSignal) { return connection((await request('/connection-requests', token, 'POST', { code }, signal)).request); },
  async updateConnection(token: string, id: string, action: 'accept' | 'reject' | 'cancel', signal?: AbortSignal) { return connection((await request(`/connection-requests/${encodeURIComponent(id)}`, token, 'PATCH', { action }, signal)).request); },
  async getDoctorCode(token: string, signal?: AbortSignal): Promise<ConnectionCode> { const data = record((await request('/doctor/connection-code', token, 'GET', undefined, signal)).connectionCode); return { code: string(data.code), url: string(data.url) }; },
  async rotateDoctorCode(token: string, signal?: AbortSignal): Promise<ConnectionCode> { const data = record((await request('/doctor/connection-code/rotate', token, 'POST', {}, signal)).connectionCode); return { code: string(data.code), url: string(data.url) }; },
};
