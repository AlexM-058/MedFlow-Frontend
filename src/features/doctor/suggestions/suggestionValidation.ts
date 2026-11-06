// Pure validation for the doctor suggestion dialog. No React or CSS imports so it
// can run under `node --experimental-strip-types` in suggestionValidation.test.ts.
import { SUGGESTION_PHOTO_RULE, validateFile } from '../shared/files.ts';

export const SUGGESTION_MESSAGE_MAX = 1000;

/** Only the metadata needed for checks; the file content is never read. */
export interface SuggestionPhotoMeta {
  name: string;
  type: string;
  size: number;
}

export interface SuggestionDraft {
  message: string;
  photo: SuggestionPhotoMeta | null;
}

export interface SuggestionErrors {
  message?: string;
  photo?: string;
}

/** Returns an error for the message, or null when it can be sent. */
export function validateSuggestionMessage(message: string): string | null {
  const trimmed = message.trim();
  if (trimmed.length === 0) return 'Introduceți un mesaj pentru pacient.';
  if (trimmed.length > SUGGESTION_MESSAGE_MAX) {
    return `Scurtați mesajul la cel mult ${SUGGESTION_MESSAGE_MAX} de caractere.`;
  }
  return null;
}

/** Returns an error for the optional photo, or null when it is absent or acceptable. */
export function validateSuggestionPhoto(photo: SuggestionPhotoMeta | null): string | null {
  return photo ? validateFile(photo, SUGGESTION_PHOTO_RULE) : null;
}

/** Collects all errors; an empty object means the draft is valid. */
export function validateSuggestion(draft: SuggestionDraft): SuggestionErrors {
  const errors: SuggestionErrors = {};
  const message = validateSuggestionMessage(draft.message);
  if (message) errors.message = message;
  const photo = validateSuggestionPhoto(draft.photo);
  if (photo) errors.photo = photo;
  return errors;
}

export function hasSuggestionErrors(errors: SuggestionErrors): boolean {
  return Boolean(errors.message || errors.photo);
}

/** Live counter text, based on the trimmed length that validation uses. */
export function describeMessageLength(message: string): string {
  const length = message.trim().length;
  if (length > SUGGESTION_MESSAGE_MAX) {
    return `${length} din ${SUGGESTION_MESSAGE_MAX} de caractere — cu ${length - SUGGESTION_MESSAGE_MAX} peste limită`;
  }
  return `${length} din ${SUGGESTION_MESSAGE_MAX} de caractere`;
}
