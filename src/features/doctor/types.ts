// Shared doctor-module types. Frozen interface for auth/, workspace/ and suggestions/.
// Pure types only: safe to import from Node-run tests (`import type ... from '../types.ts'`).

export interface DoctorProfile {
  fullName: string;
  specialty: string;
  email: string;
}

export type PatientStatus = 'needs-review' | 'follow-up-due' | 'up-to-date';

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
}

/** Minimal patient reference passed to the suggestion dialog. */
export interface SuggestionTarget {
  id: string;
  name: string;
}
