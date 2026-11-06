// Pure mapping from a Backend document (POST /cases/:id/documents) to the shared
// ExtractedDocument contract. No network and no import.meta.env: safe for Node tests.
// Values are copied as text; nothing is inferred. Unexpected shapes are reported as
// warnings instead of being dropped silently.
import type { CaseDocumentRecord } from '../../../lib/caseApi.ts';
import type { ExtractedDocument, ExtractedMedication } from '../contracts.ts';

const DOCUMENT_TYPES: ExtractedDocument['documentType'][] = ['prescription', 'lab_result', 'medical_letter', 'other'];
export const UNEXPECTED_FORMAT_WARNING = 'Part of the extraction result had an unexpected format and is not shown. Check the original document.';

type Raw = Record<string, unknown>;
const isRecord = (value: unknown): value is Raw => !!value && typeof value === 'object' && !Array.isArray(value);

/** Text value or null; empty strings become null. Numbers are kept as their text. */
function textOrNull(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() ? value : null;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

export function mapExtractedDocument(apiDocument: CaseDocumentRecord, fileName = 'Uploaded document'): ExtractedDocument {
  const warnings: string[] = [];
  let unexpected = false;
  const data = apiDocument.extractedData;
  const extracted: Raw = isRecord(data) ? data : {};
  if (!isRecord(data)) unexpected = true;

  const medications: ExtractedMedication[] = [];
  if (Array.isArray(extracted.medications)) {
    for (const entry of extracted.medications) {
      if (!isRecord(entry)) {
        unexpected = true;
        continue;
      }
      medications.push({
        name: textOrNull(entry.name),
        dose: textOrNull(entry.dose),
        frequency: textOrNull(entry.frequency),
        duration: textOrNull(entry.duration),
      });
    }
  } else if (extracted.medications !== undefined && extracted.medications !== null) {
    unexpected = true;
  }

  const dates: ExtractedDocument['dates'] = [];
  if (Array.isArray(extracted.dates)) {
    for (const entry of extracted.dates) {
      if (!isRecord(entry)) {
        unexpected = true;
        continue;
      }
      dates.push({ label: textOrNull(entry.label), value: textOrNull(entry.value) });
    }
  } else if (extracted.dates !== undefined && extracted.dates !== null) {
    unexpected = true;
  }

  if (Array.isArray(extracted.warnings)) {
    for (const entry of extracted.warnings) {
      const value = textOrNull(entry);
      if (value) warnings.push(value);
      else if (entry !== null && entry !== undefined && entry !== '') warnings.push(JSON.stringify(entry));
    }
  } else if (extracted.warnings !== undefined && extracted.warnings !== null) {
    unexpected = true;
  }
  if (unexpected) warnings.push(UNEXPECTED_FORMAT_WARNING);

  const documentType = DOCUMENT_TYPES.find((type) => type === apiDocument.documentType) ?? 'other';
  return {
    id: apiDocument.id,
    documentType,
    fileName,
    medications,
    dates,
    warnings,
    // The Backend does not return source quotes yet.
    sourceQuotes: {},
    extractedAt: apiDocument.createdAt,
  };
}
