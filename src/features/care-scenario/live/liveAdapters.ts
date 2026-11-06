// Live adapters for domains that have a Backend endpoint today. Only prescription
// extraction exists (POST /cases/:id/documents). Review and the confirmed list have
// no endpoint yet: they reject with LiveNotAvailableError; there is no silent fixture
// fallback. Domains without endpoints (context, intake, schedule, case summary,
// feedback, variants) have no live adapter here.
import { CaseApiError, caseApi } from '../../../lib/caseApi';
import type { ConfirmedMedication, ExtractedDocument, LocalDocument, PrescriptionAdapter } from '../contracts';
import { mapExtractedDocument } from './mapExtractedDocument';

export { mapExtractedDocument, UNEXPECTED_FORMAT_WARNING } from './mapExtractedDocument';

export class LiveNotAvailableError extends Error {
  constructor(message = 'This step is not connected to the server yet') {
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
    throw new Error('The scanned document could not be read on this device. Scan it again.', { cause: error });
  }
  // Object URLs keep their type, but other URIs may not: use the declared type then.
  return blob.type ? blob : new Blob([blob], { type: document.mimeType });
}

export function createLivePrescriptionAdapter(options: LivePrescriptionOptions): PrescriptionAdapter {
  return {
    source: 'live',
    async extract(document: LocalDocument, signal?: AbortSignal): Promise<ExtractedDocument> {
      if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
      const token = options.getToken();
      if (!token) throw new CaseApiError('Your session has expired. Please sign in again.', 401, 'UNAUTHORIZED');
      const file = await readLocalFile(document, signal);
      const caseId = await options.getCaseId();
      if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
      const uploaded = await caseApi.uploadDocument(token, caseId, file, 'prescription', signal);
      return mapExtractedDocument(uploaded, document.fileName);
    },
    async saveReview(): Promise<ConfirmedMedication[]> {
      throw new LiveNotAvailableError();
    },
    async listConfirmed(): Promise<ConfirmedMedication[]> {
      throw new LiveNotAvailableError();
    },
  };
}
