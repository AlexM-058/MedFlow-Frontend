// Run from Frontend:
// node --experimental-strip-types --no-warnings src/features/doctor/suggestions/suggestionValidation.test.ts
import { assertEqual, assertTrue, finish, test } from '../shared/testHarness.ts';
import { MB } from '../shared/files.ts';
import {
  SUGGESTION_MESSAGE_MAX,
  describeMessageLength,
  hasSuggestionErrors,
  validateSuggestion,
} from './suggestionValidation.ts';

const validPhoto = { name: 'rash-photo.JPG', type: 'image/jpeg', size: 2 * MB };

test('blank message is rejected', () => {
  assertEqual(validateSuggestion({ message: '', photo: null }), { message: 'Introduceți un mesaj pentru pacient.' });
});

test('whitespace-only message is rejected', () => {
  const errors = validateSuggestion({ message: '  \n\t  ', photo: null });
  assertTrue(errors.message, 'expected a message error');
});

test('message over the limit is rejected', () => {
  const errors = validateSuggestion({ message: 'a'.repeat(SUGGESTION_MESSAGE_MAX + 1), photo: null });
  assertEqual(errors.message, `Scurtați mesajul la cel mult ${SUGGESTION_MESSAGE_MAX} de caractere.`);
});

test('message exactly at the limit with surrounding spaces is valid', () => {
  const errors = validateSuggestion({ message: `  ${'a'.repeat(SUGGESTION_MESSAGE_MAX)}  `, photo: null });
  assertEqual(hasSuggestionErrors(errors), false);
});

test('valid message without photo has no errors', () => {
  assertEqual(validateSuggestion({ message: 'Please continue the plan we discussed.', photo: null }), {});
});

test('wrong file type is rejected', () => {
  const errors = validateSuggestion({
    message: 'Hello',
    photo: { name: 'notes.pdf', type: 'application/pdf', size: 1000 },
  });
  assertEqual(errors, { photo: 'Alegeți un fișier JPG sau PNG.' });
});

test('image with mismatched MIME type is rejected', () => {
  const errors = validateSuggestion({ message: 'Hello', photo: { name: 'photo.png', type: 'image/gif', size: 1000 } });
  assertEqual(errors.photo, 'Alegeți un fișier JPG sau PNG.');
});

test('photo over 10 MB is rejected', () => {
  const errors = validateSuggestion({ message: 'Hello', photo: { ...validPhoto, size: 10 * MB + 1 } });
  assertEqual(errors.photo, 'Fișierul depășește 10 MB.');
});

test('empty photo is rejected', () => {
  const errors = validateSuggestion({ message: 'Hello', photo: { ...validPhoto, size: 0 } });
  assertEqual(errors.photo, 'Fișierul selectat este gol.');
});

test('valid photo with valid message has no errors', () => {
  const errors = validateSuggestion({ message: 'Hello', photo: validPhoto });
  assertEqual(errors, {});
  assertEqual(hasSuggestionErrors(errors), false);
});

test('both errors are reported together', () => {
  const errors = validateSuggestion({ message: ' ', photo: { name: 'x.txt', type: 'text/plain', size: 5 } });
  assertTrue(errors.message && errors.photo, 'expected message and photo errors');
});

test('character counter reports trimmed length and overflow', () => {
  assertEqual(describeMessageLength('  abc  '), `3 din ${SUGGESTION_MESSAGE_MAX} de caractere`);
  assertEqual(
    describeMessageLength('a'.repeat(SUGGESTION_MESSAGE_MAX + 5)),
    `${SUGGESTION_MESSAGE_MAX + 5} din ${SUGGESTION_MESSAGE_MAX} de caractere — cu 5 peste limită`,
  );
});

finish();
