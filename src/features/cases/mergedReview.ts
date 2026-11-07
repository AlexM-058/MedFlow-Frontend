// One review for a whole medical file: the patient sees ONE list of medicines (no duplicates across 20-30 sheets)
// and confirms or corrects each row once. The decision is then written to every document it came from, with the
// per-document review route that already exists (the Backend still checks each review against what the reader
// extracted, so nothing is trusted from here). A sheet is only reviewed when ALL its medicines were confirmed;
// otherwise it stays unreviewed and its medicines are not used. "Update" mode (includeReviewed) also lists the sheets
// already confirmed, showing what the patient confirmed, so it can be corrected; the reader's text is still what the
// server compares the review with. No network, no import.meta.env: Node-test safe.
import type { CaseDocumentRecord } from '../../lib/caseApi.ts';
import type { ReviewedField } from '../care-scenario/contracts.ts';

type Raw = Record<string, unknown>;
const isRecord = (value: unknown): value is Raw => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);

/** Lowercase, no diacritics, single spaces: only to decide that two rows are the same medicine. */
export function normalizeText(value: string | null): string {
  return (value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export interface DocumentMedication {
  documentId: string;
  /** Position in the document's extracted `medications` list (the Backend checks the review by position). */
  index: number;
  name: string | null;
  dose: string | null;
  frequency: string | null;
  duration: string | null;
  /** What the patient confirmed earlier for this medicine, when the sheet was already reviewed. */
  confirmed?: { name: string; dose: string; frequency: string };
}

export interface MergedRow {
  key: string;
  name: string | null;
  dose: string | null;
  frequency: string | null;
  occurrences: DocumentMedication[];
}

/** Prescriptions the patient has not reviewed yet and from which something was read. Failed readings are not shown. */
export function pendingDocuments(documents: CaseDocumentRecord[]): CaseDocumentRecord[] {
  return documents.filter((document) => {
    if (document.review !== null && document.review !== undefined) return false;
    if (document.documentType !== 'prescription' || !isRecord(document.extractedData)) return false;
    if (document.extractedData.extraction_status === 'unavailable') return false;
    return Array.isArray(document.extractedData.medications) && document.extractedData.medications.length > 0;
  });
}

/** Sheets that were read and have medicines: the unreviewed ones, plus the already confirmed ones in update mode. */
function reviewableDocuments(documents: CaseDocumentRecord[], includeReviewed: boolean): CaseDocumentRecord[] {
  const pending = new Set(pendingDocuments(documents).map((document) => document.id));
  return documents.filter((document) => {
    if (pending.has(document.id)) return true;
    if (!includeReviewed || document.documentType !== 'prescription' || !isRecord(document.extractedData)) return false;
    if (document.extractedData.extraction_status === 'unavailable') return false;
    return Array.isArray(document.extractedData.medications) && document.extractedData.medications.length > 0;
  });
}

function medicationsOf(document: CaseDocumentRecord): DocumentMedication[] {
  const raw = isRecord(document.extractedData) && Array.isArray(document.extractedData.medications) ? document.extractedData.medications : [];
  const reviewed = isRecord(document.review) && Array.isArray(document.review.medications) ? document.review.medications : [];
  return raw.map((entry, index) => {
    const row = isRecord(entry) ? entry : {};
    const medication: DocumentMedication = { documentId: document.id, index, name: text(row.name), dose: text(row.dose), frequency: text(row.frequency), duration: text(row.duration) };
    // A broken or incomplete earlier review is ignored (the sheet is then treated like an unreviewed one).
    const earlier = reviewed[index];
    if (isRecord(earlier)) {
      const name = text(earlier.name);
      const dose = text(earlier.dose);
      const frequency = text(earlier.frequency);
      if (name && dose && frequency) medication.confirmed = { name, dose, frequency };
    }
    return medication;
  });
}

/** The values the patient sees for one occurrence: what was confirmed before, otherwise what the reader extracted. */
function shownOf(medication: DocumentMedication) {
  return medication.confirmed ?? { name: medication.name, dose: medication.dose, frequency: medication.frequency };
}

export function mergeMedications(documents: CaseDocumentRecord[], options: { includeReviewed?: boolean } = {}): MergedRow[] {
  const rows = new Map<string, MergedRow>();
  for (const document of reviewableDocuments(documents, options.includeReviewed === true)) {
    for (const medication of medicationsOf(document)) {
      const shown = shownOf(medication);
      const key = [shown.name, shown.dose, shown.frequency].map(normalizeText).join('|');
      const row = rows.get(key);
      if (row) row.occurrences.push(medication);
      else rows.set(key, { key, name: shown.name, dose: shown.dose, frequency: shown.frequency, occurrences: [medication] });
    }
  }
  return [...rows.values()].sort((a, b) => normalizeText(a.name).localeCompare(normalizeText(b.name), 'ro'));
}

export interface RowDecision {
  confirmed: boolean;
  name: string;
  dose: string;
  frequency: string;
}

/** A confirmed row needs a name, a dose and a frequency: an unreadable one must be typed from the paper prescription. */
export function isRowReady(decision: RowDecision | undefined): decision is RowDecision {
  return !!decision && decision.confirmed && !!decision.name.trim() && !!decision.dose.trim() && !!decision.frequency.trim();
}

const LABELS = { name: 'Medicament', dose: 'Doză', frequency: 'Frecvență', duration: 'Durată' } as const;

/**
 * Turns the merged decisions into one review per document. A document is included only if every one of its
 * medicines belongs to a confirmed, complete row; the others are returned in `skipped` and stay unreviewed.
 * The duration is confirmed exactly as the reader extracted it (it is not part of the merged row).
 */
export function buildReviews(
  documents: CaseDocumentRecord[],
  rows: MergedRow[],
  decisions: Record<string, RowDecision | undefined>,
  at: string,
  options: { includeReviewed?: boolean } = {},
): { reviews: { documentId: string; fields: ReviewedField[] }[]; skipped: string[] } {
  const rowOf = new Map<string, MergedRow>();
  for (const row of rows) for (const occurrence of row.occurrences) rowOf.set(`${occurrence.documentId}#${occurrence.index}`, row);

  const reviews: { documentId: string; fields: ReviewedField[] }[] = [];
  const skipped: string[] = [];
  for (const document of reviewableDocuments(documents, options.includeReviewed === true)) {
    const fields: ReviewedField[] = [];
    let complete = true;
    for (const medication of medicationsOf(document)) {
      const row = rowOf.get(`${document.id}#${medication.index}`);
      const decision = row ? decisions[row.key] : undefined;
      if (!isRowReady(decision)) { complete = false; break; }
      const values = { name: decision.name.trim(), dose: decision.dose.trim(), frequency: decision.frequency.trim(), duration: medication.duration };
      for (const key of ['name', 'dose', 'frequency', 'duration'] as const) {
        fields.push({
          path: `medications.${medication.index}.${key}`,
          label: LABELS[key],
          extracted: medication[key],
          value: values[key],
          confirmation: { status: 'confirmed', by: 'patient', at },
        });
      }
    }
    if (complete && fields.length > 0) reviews.push({ documentId: document.id, fields });
    else skipped.push(document.id);
  }
  return { reviews, skipped };
}
