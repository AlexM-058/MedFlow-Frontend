// Live adapters for domains that have a Backend endpoint today: prescription extraction
// (POST /cases/:id/documents), the patient's review (POST /cases/:id/documents/:docId/review)
// and the confirmed list (GET /cases/:id/documents). There is no silent fixture fallback.
// Domains without endpoints (context, intake, schedule, case summary, feedback, variants)
// have no live adapter here.
import { CaseApiError, caseApi } from '../../../lib/caseApi';
import type { ConfirmedMedication, ExtractedDocument, LocalDocument, PrescriptionAdapter, ReviewedField } from '../contracts';
import { mapConfirmedMedications } from './mapConfirmedMedications';
import { mapExtractedDocument } from './mapExtractedDocument';

export { mapExtractedDocument, UNEXPECTED_FORMAT_WARNING } from './mapExtractedDocument';

export class LiveNotAvailableError extends Error {
  constructor(message = 'Acest pas nu este încă conectat la server') {
    super(message);
    this.name = 'LiveNotAvailableError';
  }
}

export interface LivePrescriptionOptions {
  getToken: () => string | null;
  /** Resolves the case the document belongs to (e.g. creates it on first use). */
  getCaseId: () => Promise<string>;
}

async function readLocalFile(document: LocalDocument, signal?: AbortSignal): Promise<Blob> {
  let blob: Blob;
  try {
    const response = await fetch(document.uri, { signal });
    if (!response.ok) throw new Error('local read failed');
    blob = await response.blob();
  } catch (error) {
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    throw new Error('Documentul scanat nu a putut fi citit pe acest dispozitiv. Scanați-l din nou.', { cause: error });
  }
  // Object URLs keep their type, but other URIs may not: use the declared type then.
  return blob.type ? blob : new Blob([blob], { type: document.mimeType });
}

/** Old rows saved while the extraction service was down: they hold no reading, so they are never shown as one. */
function isFailedExtraction(data: unknown): boolean {
  return !!data && typeof data === 'object' && (data as { extraction_status?: unknown }).extraction_status === 'unavailable';
}

export function createLivePrescriptionAdapter(options: LivePrescriptionOptions): PrescriptionAdapter {
  function requireToken(): string {
    const token = options.getToken();
    if (!token) throw new CaseApiError('Sesiunea a expirat. Vă rugăm să vă autentificați din nou.', 401, 'UNAUTHORIZED');
    return token;
  }
  async function listConfirmed(signal?: AbortSignal): Promise<ConfirmedMedication[]> {
    const token = requireToken();
    const caseId = await options.getCaseId();
    return mapConfirmedMedications(await caseApi.listDocuments(token, caseId, signal));
  }
  return {
    source: 'live',
    async extract(document: LocalDocument, signal?: AbortSignal): Promise<ExtractedDocument> {
      if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
      const token = requireToken();
      const file = await readLocalFile(document, signal);
      const caseId = await options.getCaseId();
      if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
      const uploaded = await caseApi.uploadDocument(token, caseId, file, 'prescription', signal);
      if (isFailedExtraction(uploaded.extractedData)) {
        // The Backend no longer answers like this, but never present "nothing read" as "no medication found".
        throw new CaseApiError('Serviciul de citire a documentelor nu este disponibil. Încercați din nou.', 503, 'EXTRACTION_UNAVAILABLE');
      }
      return mapExtractedDocument(uploaded, document.fileName);
    },
    async saveReview(documentId: string, fields: ReviewedField[]): Promise<ConfirmedMedication[]> {
      const token = requireToken();
      const caseId = await options.getCaseId();
      await caseApi.reviewDocument(token, caseId, documentId, fields);
      return (await listConfirmed()).filter((medication) => medication.documentId === documentId);
    },
    listConfirmed,
  };
}
