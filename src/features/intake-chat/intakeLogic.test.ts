// Run: node --experimental-strip-types --no-warnings src/features/intake-chat/intakeLogic.test.ts
import type { IntakeMessage, IntakeResult } from '../care-scenario/contracts.ts';
import { assertEqual, assertTrue, finish, test } from '../connections/testHarness.ts';
import {
  addPending,
  applyResult,
  createClientMessageId,
  deliveryLabel,
  entriesFromHistory,
  setDelivery,
  shouldSendOnKey,
} from './intakeLogic.ts';

const NOW = '2026-11-07T10:00:00Z';
const msg = (id: string, role: IntakeMessage['role'], text: string, clientMessageId?: string): IntakeMessage => ({
  id,
  role,
  text,
  createdAt: NOW,
  ...(clientMessageId ? { clientMessageId } : {}),
});
const result = (overrides: Partial<IntakeResult> = {}): IntakeResult => ({
  patientMessage: msg('srv-1', 'patient', 'Synthetic headache since yesterday', 'cm-1'),
  assistantMessage: msg('srv-2', 'assistant', 'Thank you. How strong is the pain from 1 to 10?'),
  redFlag: null,
  partialError: null,
  ...overrides,
});

test('client message ids are prefixed and unique', () => {
  const a = createClientMessageId();
  const b = createClientMessageId();
  assertTrue(a.startsWith('cm-') && b.startsWith('cm-'));
  assertTrue(a !== b);
  assertEqual(createClientMessageId(() => 'fixed'), 'cm-fixed');
});

test('Enter sends, Shift+Enter and IME composition do not', () => {
  const base = { key: 'Enter', shiftKey: false, isComposing: false, keyCode: 13 };
  assertTrue(shouldSendOnKey(base));
  assertTrue(!shouldSendOnKey({ ...base, shiftKey: true }));
  assertTrue(!shouldSendOnKey({ ...base, isComposing: true }));
  assertTrue(!shouldSendOnKey({ ...base, keyCode: 229 }));
  assertTrue(!shouldSendOnKey({ ...base, key: 'a' }));
});

test('history without duplicates by id or clientMessageId', () => {
  const entries = entriesFromHistory([msg('1', 'patient', 'a', 'cm-a'), msg('1', 'patient', 'a', 'cm-a'), msg('2', 'patient', 'a', 'cm-a'), msg('3', 'assistant', 'b')]);
  assertEqual(entries.map((e) => e.message.id), ['2', '3']);
});

test('pending message is visible immediately; failure keeps it with its text', () => {
  let entries = addPending([], 'Synthetic headache since yesterday', 'cm-1', NOW);
  assertEqual(entries.length, 1);
  assertEqual(entries[0].delivery, 'pending');
  assertEqual(deliveryLabel('pending'), 'Sending…');
  entries = setDelivery(entries, 'cm-1', 'failed');
  assertEqual(entries[0].message.text, 'Synthetic headache since yesterday');
  assertEqual(deliveryLabel('failed'), 'Not sent');
  assertEqual(deliveryLabel('sent'), null);
});

test('a retry reuses the same entry and never duplicates the patient message', () => {
  let entries = addPending([], 'Synthetic headache', 'cm-1', NOW);
  entries = setDelivery(entries, 'cm-1', 'failed');
  entries = addPending(entries, 'Synthetic headache', 'cm-1', NOW);
  assertEqual(entries.length, 1);
  assertEqual(entries[0].delivery, 'pending');
  entries = applyResult(entries, 'cm-1', result());
  entries = applyResult(entries, 'cm-1', result());
  assertEqual(entries.map((e) => e.message.id), ['srv-1', 'srv-2']);
  assertEqual(entries[0].key, 'cm-1', 'React key stays stable');
  assertEqual(entries[0].delivery, 'sent');
});

test('a copy that arrived through a reload is merged, not duplicated', () => {
  let entries = entriesFromHistory([msg('srv-1', 'patient', 'Synthetic headache since yesterday', 'cm-1')]);
  entries = addPending(entries, 'other', 'cm-2', NOW);
  entries = applyResult(entries, 'cm-2', result({ patientMessage: msg('srv-1', 'patient', 'Synthetic headache since yesterday', 'cm-1') }));
  assertEqual(entries.filter((e) => e.message.id === 'srv-1').length, 1);
});

test('partial error: patient message saved, no assistant reply, notice flag set', () => {
  let entries = addPending([], 'Synthetic headache', 'cm-1', NOW);
  entries = applyResult(entries, 'cm-1', result({ assistantMessage: null, partialError: 'assistant unavailable' }));
  assertEqual(entries.length, 1);
  assertEqual(entries[0].delivery, 'sent');
  assertEqual(entries[0].partialError, true);
});

test('red flag: rule message attached, assistant reply never shown', () => {
  let entries = addPending([], 'Synthetic chest pain', 'cm-1', NOW);
  entries = applyResult(
    entries,
    'cm-1',
    result({ redFlag: { message: 'These symptoms may need emergency care.' }, assistantMessage: msg('srv-2', 'assistant', 'must not appear') }),
  );
  assertEqual(entries.length, 1);
  assertEqual(entries[0].redFlag, { message: 'These symptoms may need emergency care.' });
  assertTrue(!entries[0].partialError);
});

finish();
