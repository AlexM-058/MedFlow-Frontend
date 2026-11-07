import { isOpaqueCode } from '../../auth/navigation.ts';

export type JourneyStage = 'connect' | 'chat';

/**
 * The patient's single active step, derived from state (never from a stored flag):
 * 1. connect to a doctor (QR)  2. chat with the assistant.
 * The chat opens as soon as a doctor is connected (the message has a recipient). A prescription
 * is no longer required first; it can be added later, and the assistant never decides from it.
 */
export function journeyStage(input: { doctorCount: number }): JourneyStage {
  return input.doctorCount < 1 ? 'connect' : 'chat';
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
