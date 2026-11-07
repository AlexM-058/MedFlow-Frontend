import type { CaseDecision } from '../../lib/caseApi.ts';

/** How many of the patient's newest cases are checked for a doctor message. */
export const MAX_CASES_CHECKED = 5;

export const UNKNOWN_DOCTOR_NAME = 'Medicul dumneavoastră';

/** The newest doctor message across the given cases (null entries = case without a message). */
export function latestDecision(decisions: readonly (CaseDecision | null)[]): CaseDecision | null {
  let best: CaseDecision | null = null;
  for (const decision of decisions) {
    if (decision && (best === null || Date.parse(decision.createdAt) > Date.parse(best.createdAt))) best = decision;
  }
  return best;
}

/** Unread = newer than the time the patient last pressed "I read it" on this device. */
export function isUnread(decision: CaseDecision | null, lastReadAt: string | null): boolean {
  if (!decision) return false;
  if (lastReadAt === null) return true;
  return Date.parse(decision.createdAt) > Date.parse(lastReadAt);
}

/** The doctor's own name, as saved in the profile; a neutral fallback if the doctor is no longer connected. */
export function senderName(decision: Pick<CaseDecision, 'doctorId'>, doctors: readonly { id: string; fullName: string }[]): string {
  return doctors.find((doctor) => doctor.id === decision.doctorId)?.fullName.trim() || UNKNOWN_DOCTOR_NAME;
}

/**
 * Only a timestamp is stored in the browser (never the message text), because medical content
 * must not live in browser storage. Without it every message simply shows as unread again.
 */
export interface MarkerStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const markerKey = (userId: string) => `medflow.doctorMessageRead.${userId}`;

export function readMarker(userId: string, storage: MarkerStorage | null): string | null {
  if (!storage) return null;
  try {
    const value = storage.getItem(markerKey(userId));
    return value !== null && !Number.isNaN(Date.parse(value)) ? value : null;
  } catch {
    return null;
  }
}

/** Returns false when the marker could not be saved, so the caller can still hide the card for this visit. */
export function writeMarker(userId: string, createdAt: string, storage: MarkerStorage | null): boolean {
  if (!storage || Number.isNaN(Date.parse(createdAt))) return false;
  try {
    storage.setItem(markerKey(userId), createdAt);
    return true;
  } catch {
    return false;
  }
}

/** The browser's storage, or null when it is blocked (private mode, disabled site data). */
export function browserStorage(): MarkerStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}
