// Shared doctor-module types. Frozen interface for auth/, workspace/ and suggestions/.
// Pure types only: safe to import from Node-run tests (`import type ... from '../types.ts'`).

export interface DoctorProfile {
  fullName: string;
  specialty: string;
  email: string;
}

export type PatientStatus = 'needs-review' | 'follow-up-due' | 'up-to-date';

export interface AiCaseSummary {
  /** Short headline of the patient's report / reason for contact */
  headline: string;
  /** Key symptoms extracted by the AI assistant */
  symptoms: readonly string[];
  /** Current medications reported by the patient or extracted from records */
  medications?: readonly string[];
  /** Known allergies checked against safety guidelines */
  allergies?: readonly string[];
  /** Isolated medical safety alert (separate from LLM output) */
  flaggedAlert?: string | null;
  /** Clinical pre-visit summary synthesized for the doctor */
  clinicalNotes: string;
  /** Original source document (e.g. prescription scan, lab result PDF) */
  sourceDocument?: string;
  /** When the summary was generated */
  receivedAt?: string;
}

export interface MedicalDocumentRecord {
  id: string;
  title: string;
  type: 'prescription' | 'lab_result' | 'clinical_note' | 'consultation';
  date: string;
  source: string;
  summary: string;
  fileFormat?: 'PDF' | 'JPG' | 'SVG';
}

export interface PatientMedicalRecord {
  allergies: readonly string[];
  chronicConditions?: readonly string[];
  currentMedications?: readonly string[];
  documents: readonly MedicalDocumentRecord[];
}

export interface DoctorPatient {
  /** Display ID, e.g. "MF-001". */
  id: string;
  name: string;
  status: PatientStatus;
  /** ISO 8601 instant of the last contact. */
  lastContactAt: string;
  /** ISO 8601 calendar date (YYYY-MM-DD) of the next follow-up. */
  nextFollowUpOn: string;
  /** Short synthetic, non-clinical summary for "View patient". */
  summary: string;
  /** Structured AI pre-visit intake / symptom summary (if received). */
  aiSummary?: AiCaseSummary;
  /** Complete medical record and documents for this specific patient. */
  medicalRecord?: PatientMedicalRecord;
}

/** Minimal patient reference passed to the suggestion dialog. */
export interface SuggestionTarget {
  id: string;
  name: string;
}
