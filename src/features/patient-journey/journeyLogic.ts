import { isOpaqueCode } from '../../auth/navigation.ts';

export type JourneyStage = 'connect' | 'prescription' | 'chat';

/**
 * The patient's single active step, derived from state (never from a stored flag):
 * 1. connect to a doctor  2. add and confirm a prescription  3. chat with the assistant.
 * The chat needs BOTH a connected doctor (the message has a recipient) and at least one
 * confirmed prescription (the assistant starts from confirmed data, not guesses).
 */
export function journeyStage(input: { doctorCount: number; confirmedMedicationCount: number }): JourneyStage {
  if (input.doctorCount < 1) return 'connect';
  if (input.confirmedMedicationCount < 1) return 'prescription';
  return 'chat';
}

/**
 * Accepts what a patient (or a helper) can realistically paste: the bare code, or the full
 * link the doctor shared (".../#/connect/<code>"). Returns null unless the result is an
 * opaque code, so nothing else is ever used to build a route.
 */
export function extractConnectCode(input: string): string | null {
  const text = input.trim();
  const fromLink = /\/connect\/([A-Za-z0-9_-]+)\/?$/.exec(text);
  const candidate = fromLink ? fromLink[1] : text;
  return isOpaqueCode(candidate) ? candidate : null;
}
