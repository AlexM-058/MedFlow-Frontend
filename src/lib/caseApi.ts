// Typed client for the EXISTING Backend case endpoints (Backend/src/cases.ts):
//   POST /cases, GET /cases/:id, POST /cases/:id/messages, POST /cases/:id/documents.
// Responses are snake_case and are mapped to camelCase here. Backend errors are
// `{ error, details? }` in Romanian without a code: the user-facing message is chosen
// from the HTTP status (English), and the server text is kept only for diagnostics.
// Transport rules mirror accountApi.ts.
import { supportContact } from '../brand/brandAsset';

export type CaseDocumentType = 'prescription' | 'lab_result' | 'medical_letter' | 'other';

export interface CaseRecord {
  id: string;
  patientId: string;
  doctorId: string;
  /** Backend case status, e.g. "draft". Kept as text: the Backend owns the list. */
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface CaseMessageRecord {
  id: string;
  caseId: string;
  senderRole: string;
  content: string;
  createdAt: string;
}

export interface CaseDecision {
  id: string;
  caseId: string;
  doctorId: string;
  text: string;
  createdAt: string;
}

function decisionRecord(value: unknown): CaseDecision {
  const data = record(value);
  return { id: string(data.id), caseId: string(data.case_id), doctorId: string(data.doctor_id), text: string(data.final_response), createdAt: string(data.created_at) };
}

export interface CaseDocumentRecord {
  id: string;
  caseId: string;
  uploadedBy: string;
  documentType: string;
  mimeType: string;
  sizeBytes: number;
  /** Raw `extracted_data` from the extraction service; validate before use (see live/mapExtractedDocument.ts). */
  extractedData: unknown;
  createdAt: string;
}

export type CaseApiErrorCode =
  | 'INVALID_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'NO_ACTIVE_DOCTOR'
  | 'CONFLICT'
  | 'FILE_TOO_LARGE'
  | 'UNSUPPORTED_FILE'
  | 'EXTRACTION_UNAVAILABLE'
  | 'SERVICE_UNAVAILABLE'
  | 'TIMEOUT'
  | 'NOT_CONFIGURED'
  | 'INVALID_RESPONSE'
  | 'UNAVAILABLE';

export class CaseApiError extends Error {
  readonly status: number;
  readonly code: CaseApiErrorCode;
  /** Whether retrying the same request can succeed (network, timeout, 5xx). */
  readonly retryable: boolean;
  /** Raw server error text (Romanian), for diagnostics only; do not show it as the user message. */
  readonly serverMessage: string | null;
  readonly details: unknown;

  constructor(message: string, status = 0, code: CaseApiErrorCode = 'UNAVAILABLE', serverMessage: string | null = null, details: unknown = undefined) {
    super(message);
    this.name = 'CaseApiError';
    this.status = status;
    this.code = code;
    this.retryable = status === 0 || status >= 500;
    this.serverMessage = serverMessage;
    this.details = details;
  }
}

export const CASE_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
export const CASE_MESSAGE_MAX_LENGTH = 5000;
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
const DOCUMENT_TYPES: CaseDocumentType[] = ['prescription', 'lab_result', 'medical_letter', 'other'];
const DEFAULT_TIMEOUT_MS = 15000;
/** Extraction can take up to 60 s on the server, plus the upload itself. */
const UPLOAD_TIMEOUT_MS = 70000;

type Operation = 'case' | 'message' | 'upload';

function errorFor(status: number, operation: Operation): { message: string; code: CaseApiErrorCode } {
  switch (status) {
    case 400:
      return {
        code: 'INVALID_REQUEST',
        message:
          operation === 'upload'
            ? 'Fișierul este gol sau tipul documentului nu este valid. Verificați fișierul și încercați din nou.'
            : operation === 'case'
              ? 'Cazul nu a putut fi creat. Dacă aveți mai mulți medici, alegeți unul și încercați din nou.'
              : 'Cererea nu a fost acceptată. Verificați ce ați introdus și încercați din nou.',
      };
    case 401:
      return { code: 'UNAUTHORIZED', message: 'Sesiunea dumneavoastră a expirat. Vă rugăm să vă autentificați din nou.' };
    case 403:
      return { code: 'FORBIDDEN', message: 'Acest cont nu are voie să efectueze această acțiune.' };
    case 404:
      return { code: 'NOT_FOUND', message: 'Acest caz nu este disponibil. Este posibil să nu existe sau să nu aveți acces la el.' };
    case 409:
      return operation === 'case'
        ? { code: 'NO_ACTIVE_DOCTOR', message: 'Nu aveți încă un medic activ. Conectați-vă mai întâi cu medicul dumneavoastră.' }
        : { code: 'CONFLICT', message: 'Această acțiune intră în conflict cu starea curentă. Reîmprospătați pagina și încercați din nou.' };
    case 413:
      return { code: 'FILE_TOO_LARGE', message: 'Fișierul este prea mare. Dimensiunea maximă este de 10 MB.' };
    case 415:
      return { code: 'UNSUPPORTED_FILE', message: 'Acest tip de fișier nu este acceptat. Folosiți un fișier JPG, PNG sau PDF.' };
    case 502:
    case 503:
    case 504:
      return operation === 'upload'
        ? { code: 'EXTRACTION_UNAVAILABLE', message: 'Serviciul de citire a documentelor nu este disponibil. Documentul dumneavoastră nu a fost salvat; este în continuare pe acest dispozitiv. Vă rugăm să încercați din nou.' }
        : { code: 'SERVICE_UNAVAILABLE', message: 'Serviciul este temporar indisponibil. Vă rugăm să încercați din nou.' };
    default:
      return { code: 'UNAVAILABLE', message: 'Serviciile pentru cazuri nu sunt disponibile. Vă rugăm să încercați din nou.' };
  }
}

type RecordValue = Record<string, unknown>;
function invalid(): CaseApiError {
  return new CaseApiError('Serviciul a returnat un răspuns invalid.', 502, 'INVALID_RESPONSE');
}
function record(value: unknown): RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  return value as RecordValue;
}
function string(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw invalid();
  return value;
}
function text(value: unknown): string {
  if (typeof value !== 'string') throw invalid();
  return value;
}

function caseRecord(value: unknown): CaseRecord {
  const data = record(value);
  return {
    id: string(data.id),
    patientId: string(data.patient_id),
    doctorId: string(data.doctor_id),
    status: string(data.status),
    createdAt: string(data.created_at),
    updatedAt: string(data.updated_at),
  };
}
function messageRecord(value: unknown): CaseMessageRecord {
  const data = record(value);
  return {
    id: string(data.id),
    caseId: string(data.case_id),
    senderRole: string(data.sender_role),
    content: text(data.content),
    createdAt: string(data.created_at),
  };
}
function documentRecord(value: unknown): CaseDocumentRecord {
  const data = record(value);
  if (typeof data.size_bytes !== 'number' || !Number.isFinite(data.size_bytes)) throw invalid();
  return {
    id: string(data.id),
    caseId: string(data.case_id),
    uploadedBy: string(data.uploaded_by),
    documentType: string(data.document_type),
    mimeType: string(data.mime_type),
    sizeBytes: data.size_bytes,
    extractedData: data.extracted_data ?? null,
    createdAt: string(data.created_at),
  };
}

function baseUrl(): string {
  const configured = import.meta.env.VITE_API_BASE_URL?.trim();
  if (!configured) throw new CaseApiError(`Serviciile pentru cazuri nu sunt încă configurate. ${supportContact}`, 0, 'NOT_CONFIGURED');
  const url = new URL(configured, window.location.origin);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(url.protocol === 'http:' && local))) {
    throw new CaseApiError('Adresa serviciului pentru cazuri nu este validă.', 0, 'NOT_CONFIGURED');
  }
  return url.href.replace(/\/$/, '');
}

interface RequestOptions {
  method: 'GET' | 'POST';
  token: string;
  operation: Operation;
  json?: unknown;
  binary?: { body: Blob; contentType: string };
  timeoutMs?: number;
  signal?: AbortSignal;
}

async function request(path: string, options: RequestOptions): Promise<unknown> {
  const { method, token, operation, json, binary, signal } = options;
  if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
  if (!token) throw new CaseApiError('Sesiunea dumneavoastră a expirat. Vă rugăm să vă autentificați din nou.', 401, 'UNAUTHORIZED');
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timeout = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = { Accept: 'application/json', Authorization: `Bearer ${token}` };
    let body: BodyInit | undefined;
    if (binary) {
      headers['Content-Type'] = binary.contentType;
      body = binary.body;
    } else if (json !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(json);
    }
    const response = await fetch(`${baseUrl()}${path}`, {
      method,
      signal: controller.signal,
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
      headers,
      ...(body === undefined ? {} : { body }),
    });
    let payload: unknown;
    try { payload = await response.json(); } catch { payload = null; }
    if (!response.ok) {
      if (response.status === 401) window.dispatchEvent(new CustomEvent('medflow:session-expired', { detail: { token } }));
      const server = payload && typeof payload === 'object' && !Array.isArray(payload) ? (payload as RecordValue) : {};
      const { message, code } = errorFor(response.status, operation);
      throw new CaseApiError(message, response.status, code, typeof server.error === 'string' ? server.error : null, server.details);
    }
    return payload;
  } catch (error) {
    if (error instanceof CaseApiError) throw error;
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    if (timedOut) {
      throw new CaseApiError(
        operation === 'upload'
          ? 'Citirea documentului a durat prea mult. Documentul dumneavoastră este în continuare pe acest dispozitiv. Vă rugăm să încercați din nou.'
          : 'Cererea a durat prea mult. Vă rugăm să încercați din nou.',
        0,
        'TIMEOUT',
      );
    }
    throw new CaseApiError('Serviciile pentru cazuri nu au putut fi contactate. Vă rugăm să încercați din nou.');
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}

const caseUrl = (caseId: string) => `/cases/${encodeURIComponent(caseId)}`;

export const caseApi = {
  async listCases(token: string, offset = 0, signal?: AbortSignal): Promise<CaseRecord[]> {
    const data = record(await request(`/cases?limit=50&offset=${offset}`, { method: 'GET', token, operation: 'case', signal }));
    if (!Array.isArray(data.cases)) throw invalid();
    return data.cases.map(caseRecord);
  },
  async listMessages(token: string, caseId: string, offset = 0, signal?: AbortSignal): Promise<CaseMessageRecord[]> {
    const data = record(await request(`${caseUrl(caseId)}/messages?limit=100&offset=${offset}`, { method: 'GET', token, operation: 'message', signal }));
    if (!Array.isArray(data.messages)) throw invalid();
    return data.messages.map(messageRecord);
  },
  async getDecision(token: string, caseId: string, signal?: AbortSignal): Promise<CaseDecision | null> {
    const data = record(await request(`${caseUrl(caseId)}/decision`, { method: 'GET', token, operation: 'case', signal }));
    return data.decision === null ? null : decisionRecord(data.decision);
  },
  async sendDecision(token: string, caseId: string, text: string): Promise<CaseDecision> {
    const data = record(await request(`${caseUrl(caseId)}/decision`, { method: 'POST', token, operation: 'case', json: { finalResponse: text } }));
    return decisionRecord(data.decision);
  },
  /** Patient opens a case with their active doctor (409 NO_ACTIVE_DOCTOR when none). */
  async createCase(token: string, doctorId?: string, signal?: AbortSignal): Promise<CaseRecord> {
    return caseRecord(await request('/cases', { method: 'POST', token, operation: 'case', json: doctorId ? { doctorId } : {}, signal }));
  },
  async getCase(token: string, id: string, signal?: AbortSignal): Promise<CaseRecord> {
    return caseRecord(await request(caseUrl(id), { method: 'GET', token, operation: 'case', signal }));
  },
  /** Saves a message; resolves only after the server stored it (201). */
  async postMessage(token: string, caseId: string, content: string, signal?: AbortSignal): Promise<CaseMessageRecord> {
    const trimmed = content.trim();
    if (!trimmed || trimmed.length > CASE_MESSAGE_MAX_LENGTH) {
      throw new CaseApiError(`Un mesaj trebuie să aibă între 1 și ${CASE_MESSAGE_MAX_LENGTH} caractere.`, 400, 'INVALID_REQUEST');
    }
    return messageRecord(await request(`${caseUrl(caseId)}/messages`, { method: 'POST', token, operation: 'message', json: { content: trimmed }, signal }));
  },
  /**
   * Uploads the raw file; the server extracts it (up to 60 s) and stores only the result.
   * On EXTRACTION_UNAVAILABLE / TIMEOUT nothing is saved: keep the local file and offer a retry.
   */
  async uploadDocument(token: string, caseId: string, file: Blob, documentType: CaseDocumentType, signal?: AbortSignal): Promise<CaseDocumentRecord> {
    if (!DOCUMENT_TYPES.includes(documentType)) throw new CaseApiError('Tipul documentului nu este valid.', 400, 'INVALID_REQUEST');
    if (file.size === 0) throw new CaseApiError('Fișierul este gol. Scanați sau alegeți din nou documentul.', 400, 'INVALID_REQUEST');
    if (file.size > CASE_DOCUMENT_MAX_BYTES) throw new CaseApiError('Fișierul este prea mare. Dimensiunea maximă este de 10 MB.', 413, 'FILE_TOO_LARGE');
    if (!ACCEPTED_TYPES.includes(file.type)) throw new CaseApiError('Acest tip de fișier nu este acceptat. Folosiți un fișier JPG, PNG sau PDF.', 415, 'UNSUPPORTED_FILE');
    const path = `${caseUrl(caseId)}/documents?documentType=${encodeURIComponent(documentType)}`;
    return documentRecord(await request(path, {
      method: 'POST',
      token,
      operation: 'upload',
      binary: { body: file, contentType: file.type },
      timeoutMs: UPLOAD_TIMEOUT_MS,
      signal,
    }));
  },
};
