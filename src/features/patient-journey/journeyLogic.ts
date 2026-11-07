import { isOpaqueCode } from '../../auth/navigation.ts';

export type JourneyStage = 'connect' | 'prescription' | 'documents' | 'chat';
export type JourneyStep = Exclude<JourneyStage, 'connect'>;

/**
 * The patient's single active step:
 * 1. connect to a doctor (QR), which comes from the account (never from a stored flag);
 * 2. add the prescription  3. upload or update the medical documentation  4. the conversation.
 * Steps 2 and 3 are optional (the patient can skip them); `step` is where the patient is in them. Without a
 * connected doctor nothing else is possible: a message needs a recipient.
 */
export function journeyStage(input: { doctorCount: number; step?: JourneyStep }): JourneyStage {
  return input.doctorCount < 1 ? 'connect' : (input.step ?? 'prescription');
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
