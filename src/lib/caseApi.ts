// Typed client for the EXISTING Backend case endpoints (Backend/src/cases.ts):
//   POST /cases, GET /cases/:id, POST /cases/:id/messages, POST /cases/:id/documents.
// Responses are snake_case and are mapped to camelCase here. Backend errors are
// `{ error, details? }` in Romanian without a code: the user-facing message is chosen
// from the HTTP status (English), and the server text is kept only for diagnostics.
// Transport rules mirror accountApi.ts.
import { supportContact } from '../brand/brandAsset';
import type { ContextItem, ContextKind, ReviewedField } from '../features/care-scenario/contracts';

function contextRecord(value: unknown): ContextItem {
  const data = record(value);
  const source = record(data.source);
  const confirmation = record(data.confirmation);
  if (!['allergy', 'condition', 'medication'].includes(String(data.kind)) || source.kind !== 'patient-input'
    || !['unconfirmed', 'confirmed', 'unknown'].includes(String(confirmation.status))
    || (confirmation.by !== undefined && confirmation.by !== 'patient')) throw invalid();
  return {
    id: string(data.id), kind: data.kind as ContextKind, text: string(data.text),
    source: { kind: 'patient-input', at: string(source.at) },
    confirmation: { status: confirmation.status as ContextItem['confirmation']['status'],
      ...(confirmation.by === 'patient' ? { by: 'patient' as const } : {}),
      ...(confirmation.at !== undefined ? { at: string(confirmation.at) } : {}),
    },
  };
}
function contextItems(payload: unknown): ContextItem[] {
  const data = record(payload);
  if (!Array.isArray(data.items)) throw invalid();
  return data.items.map(contextRecord);
}

export type CaseDocumentType = 'prescription' | 'lab_result' | 'medical_letter' | 'other';

/** Backlog state computed by the Backend for a doctor: see Backend README, GET /cases. */
export type CaseReviewState = 'new' | 'needs_review' | 'up_to_date';

export interface CaseRecord {
  id: string;
  patientId: string;
  doctorId: string;
  /** Backend case status, e.g. "draft". Kept as text: the Backend owns the list. */
  status: string;
  createdAt: string;
  updatedAt: string;
  /** Doctor list only. Optional: absent when the Backend could not compute them. */
  lastMessage?: { senderRole: string; content: string; createdAt: string } | null;
  reviewState?: CaseReviewState;
  lastActivityAt?: string;
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

export interface LocalCaseSummary {
  items: { messageId: string; text: string }[];
  originals: { id: string; text: string }[];
  uncoveredMessageIds: string[];
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
  /** The patient's review of the extracted data (`{fields, medications}`), or null when not reviewed yet. */
  review: unknown;
  reviewedAt: string | null;
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
  | 'UNREADABLE_DOCUMENT'
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

type Operation = 'case' | 'message' | 'upload' | 'review';

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
    case 422:
      // Upload: the server read the file but found no usable text. Review: the review does not match the document.
      return operation === 'review'
        ? { code: 'INVALID_REQUEST', message: 'Verificarea nu corespunde documentului citit. Reîncărcați pagina și reluați verificarea.' }
        : { code: 'UNREADABLE_DOCUMENT', message: 'Nu am putut citi documentul. Faceți o poză mai clară, cu toată rețeta în cadru, și încercați din nou. Documentul rămâne pe acest dispozitiv.' };
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
    ...backlogFields(data),
  };
}
/** Additive Backend fields: a malformed value is ignored (the case itself stays valid), never invented. */
function backlogFields(data: RecordValue): Partial<Pick<CaseRecord, 'lastMessage' | 'reviewState' | 'lastActivityAt'>> {
  const fields: Partial<Pick<CaseRecord, 'lastMessage' | 'reviewState' | 'lastActivityAt'>> = {};
  const state = data.review_state;
  if (state === 'new' || state === 'needs_review' || state === 'up_to_date') fields.reviewState = state;
  if (typeof data.last_activity_at === 'string' && data.last_activity_at) fields.lastActivityAt = data.last_activity_at;
  const last = data.last_message;
  if (last === null) fields.lastMessage = null;
  else if (last && typeof last === 'object' && !Array.isArray(last)) {
    const message = last as RecordValue;
    if (typeof message.sender_role === 'string' && typeof message.content === 'string' && typeof message.created_at === 'string') {
      fields.lastMessage = { senderRole: message.sender_role, content: message.content, createdAt: message.created_at };
    }
  }
  return fields;
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
    review: data.review ?? null,
    reviewedAt: typeof data.reviewed_at === 'string' && data.reviewed_at ? data.reviewed_at : null,
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
  async summarizeLocally(token: string, caseId: string): Promise<LocalCaseSummary> {
    const payload = record(await request(`${caseUrl(caseId)}/summary`, { method: 'POST', token, operation: 'case', json: {}, timeoutMs: 110000 }));
    const data = record(payload.summary);
    if (!Array.isArray(data.items) || !Array.isArray(data.originals) || !Array.isArray(data.uncoveredMessageIds)) throw invalid();
    const originals = data.originals.map((entry) => { const item = record(entry); return { id: string(item.id), text: string(item.text) }; });
    const items = data.items.map((entry) => {
      const item = record(entry); const messageId = string(item.messageId); const text = string(item.text);
      if (!originals.some((original) => original.id === messageId && original.text.includes(text))) throw invalid();
      return { messageId, text };
    });
    return { items, originals, uncoveredMessageIds: data.uncoveredMessageIds.map(string) };
  },
  async askLocalQuestion(token: string, caseId: string): Promise<{ message: CaseMessageRecord | null; notice: string | null }> {
    const data = record(await request(`${caseUrl(caseId)}/intake-question`, { method: 'POST', token, operation: 'case', json: {}, timeoutMs: 110000 }));
    return { message: data.message === null ? null : messageRecord(data.message), notice: typeof data.notice === 'string' ? data.notice : null };
  },
  async loadContext(token: string, signal?: AbortSignal): Promise<ContextItem[]> {
    return contextItems(await request('/patient/context', { method: 'GET', token, operation: 'case', signal }));
  },
  async loadCaseContext(token: string, caseId: string, signal?: AbortSignal): Promise<ContextItem[]> {
    return contextItems(await request(`${caseUrl(caseId)}/context`, { method: 'GET', token, operation: 'case', signal }));
  },
  async addContext(token: string, kind: ContextKind, text: string): Promise<ContextItem> {
    const data = record(await request('/patient/context/items', { method: 'POST', token, operation: 'case', json: { kind, text } }));
    return contextRecord(data.item);
  },
  async updateContext(token: string, id: string, action: 'confirm' | 'unknown'): Promise<ContextItem> {
    const data = record(await request(`/patient/context/items/${encodeURIComponent(id)}/${action}`, { method: 'POST', token, operation: 'case', json: {} }));
    return contextRecord(data.item);
  },
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
  /** Documents of a case, newest first. Visible to the case's patient and doctor only (Backend checks). */
  async listDocuments(token: string, caseId: string, signal?: AbortSignal): Promise<CaseDocumentRecord[]> {
    const data = await request(`${caseUrl(caseId)}/documents`, { method: 'GET', token, operation: 'case', signal });
    if (!Array.isArray(data)) throw invalid();
    return data.map(documentRecord);
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
   * Saves the patient's review of an extracted prescription (patient only). The server checks it against
   * what the reader extracted; a mismatch is a 422 (INVALID_REQUEST). Returns the updated document.
   */
  async reviewDocument(token: string, caseId: string, documentId: string, fields: ReviewedField[], signal?: AbortSignal): Promise<CaseDocumentRecord> {
    return documentRecord(await request(`${caseUrl(caseId)}/documents/${encodeURIComponent(documentId)}/review`, {
      method: 'POST', token, operation: 'review', json: { fields }, signal,
    }));
  },
  /**
   * Uploads the raw file; the server extracts it (up to 60 s) and stores only the result.
   * On any failure (UNREADABLE_DOCUMENT, EXTRACTION_UNAVAILABLE, TIMEOUT) NOTHING is saved on the server:
   * keep the local file and offer a retry.
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
