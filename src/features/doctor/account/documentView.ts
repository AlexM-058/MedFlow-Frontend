import type { CaseDocumentRecord } from '../../../lib/caseApi.ts';
import { mapConfirmedMedications } from '../../care-scenario/live/mapConfirmedMedications.ts';
import { countFindings, readFindings, type LabFinding, type ObservationFinding } from '../../cases/findings.ts';
import { mapExtractedDocument } from '../../care-scenario/live/mapExtractedDocument.ts';

export type DocumentStatus = 'extracted' | 'empty' | 'unavailable';

export interface DocumentView {
  id: string;
  typeLabel: string;
  createdAt: string;
  sizeLabel: string;
  status: DocumentStatus;
  statusLabel: string;
  /** Patient review state of a prescription; null when it does not apply (other documents, nothing read). */
  review: 'confirmed' | 'unreviewed' | null;
  reviewLabel: string | null;
  medications: {
    name: string; dose: string; frequency: string; duration: string;
    /** Only on confirmed rows: fields the patient changed, with what the reader saw. */
    corrections?: { label: string; readerSaw: string; patientValue: string }[];
  }[];
  dates: { label: string; value: string }[];
  warnings: string[];
  /** Everything else the reader found. Read automatically and NOT confirmed by the patient. */
  diagnoses: string[];
  labs: LabFinding[];
  allergies: string[];
  observations: ObservationFinding[];
}

export const REVIEW_LABELS = {
  confirmed: 'Confirmat de pacient',
  unreviewed: 'Neconfirmat de pacient: citit automat, poate conține erori',
} as const;

const TYPE_LABELS: Record<string, string> = {
  prescription: 'Rețetă',
  lab_result: 'Analize',
  medical_letter: 'Scrisoare medicală',
  other: 'Alt document',
};

export const STATUS_LABELS: Record<DocumentStatus, string> = {
  extracted: 'Date extrase',
  empty: 'Nu s-au găsit câmpuri',
  unavailable: 'Extracție indisponibilă',
};

/** Shown when a field was not read from the document: never replaced by a guess. */
export const MISSING = '—';

export function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return MISSING;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

/** The Backend stores {extraction_status: 'unavailable'} when the extraction service could not be reached. */
function extractionUnavailable(data: unknown): boolean {
  return !!data && typeof data === 'object' && !Array.isArray(data) && (data as Record<string, unknown>).extraction_status === 'unavailable';
}

/**
 * What the doctor sees for one uploaded document. Values are the patient's document as read by the
 * extractor, copied as text; a missing value is shown as a dash and nothing is inferred. A failed
 * extraction is stated, never hidden: the document stays in the list.
 */
export function describeDocument(document: CaseDocumentRecord): DocumentView {
  const base = {
    id: document.id,
    typeLabel: TYPE_LABELS[document.documentType] ?? TYPE_LABELS.other ?? 'Alt document',
    createdAt: document.createdAt,
    sizeLabel: formatSize(document.sizeBytes),
  };
  if (extractionUnavailable(document.extractedData)) {
    return { ...base, status: 'unavailable', statusLabel: STATUS_LABELS.unavailable, review: null, reviewLabel: null, medications: [], dates: [], warnings: [], diagnoses: [], labs: [], allergies: [], observations: [] };
  }
  const mapped = mapExtractedDocument(document);
  // A reviewed prescription shows what the patient confirmed (and what they changed); otherwise the
  // reader's output is shown, clearly marked as unconfirmed.
  const confirmed = mapConfirmedMedications([document]);
  const medications: DocumentView['medications'] = confirmed.length > 0
    ? confirmed.map((medication) => {
        const corrections = medication.fields
          .filter((field) => (field.extracted ?? null) !== (field.value ?? null))
          .map((field) => ({ label: field.label, readerSaw: field.extracted ?? MISSING, patientValue: field.value ?? MISSING }));
        return {
          name: medication.name,
          dose: medication.doseText,
          frequency: medication.instructionOriginal,
          duration: medication.durationText ?? MISSING,
          ...(corrections.length > 0 ? { corrections } : {}),
        };
      })
    : mapped.medications.map((medication) => ({
        name: medication.name ?? MISSING,
        dose: medication.dose ?? MISSING,
        frequency: medication.frequency ?? MISSING,
        duration: medication.duration ?? MISSING,
      }));
  const review: DocumentView['review'] = confirmed.length > 0 ? 'confirmed' : mapped.medications.length > 0 ? 'unreviewed' : null;
  const dates = mapped.dates.map((entry) => ({ label: entry.label ?? 'Dată', value: entry.value ?? MISSING }));
  const found = readFindings(document.extractedData);
  const status: DocumentStatus = medications.length > 0 || dates.length > 0 || countFindings(found) > 0 ? 'extracted' : 'empty';
  return {
    ...base, status, statusLabel: STATUS_LABELS[status], review, reviewLabel: review ? REVIEW_LABELS[review] : null,
    medications, dates, warnings: mapped.warnings,
    diagnoses: found.diagnoses, labs: found.labs, allergies: found.allergies, observations: found.observations,
  };
}
