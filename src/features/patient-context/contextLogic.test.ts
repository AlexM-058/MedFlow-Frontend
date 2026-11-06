// Run: node --experimental-strip-types --no-warnings src/features/patient-context/contextLogic.test.ts
import type { ContextItem } from '../care-scenario/contracts.ts';
import { assertEqual, assertTrue, finish, test } from '../connections/testHarness.ts';
import {
  canConfirm,
  canMarkUnknown,
  CONTEXT_GROUPS,
  describeConfirmation,
  describeSource,
  formatDateTime,
  groupItems,
  MAX_ITEM_LENGTH,
  statusLabel,
  upsertItem,
  validateItemText,
} from './contextLogic.ts';

// Local times (no "Z"), so the expected strings do not depend on the machine's time zone.
const AT = '2026-11-06T14:02:00';

const item = (id: string, kind: ContextItem['kind'], status: ContextItem['confirmation']['status']): ContextItem => ({
  id,
  kind,
  text: `Synthetic ${id}`,
  source: { kind: 'patient-input', at: AT },
  confirmation: { status },
});

test('groups items by kind and keeps their order', () => {
  const groups = groupItems([item('a1', 'allergy', 'confirmed'), item('m1', 'medication', 'unknown'), item('a2', 'allergy', 'unconfirmed')]);
  assertEqual(groups.allergy.map((i) => i.id), ['a1', 'a2']);
  assertEqual(groups.condition, []);
  assertEqual(groups.medication.map((i) => i.id), ['m1']);
  assertEqual(CONTEXT_GROUPS.map((g) => g.title), ['Allergies', 'Conditions', 'Current medication']);
});

test('unknown is shown as "Unknown", never blank and never "No"', () => {
  assertEqual(statusLabel('unknown'), 'Unknown');
  assertEqual(statusLabel('confirmed'), 'Confirmed');
  assertEqual(statusLabel('unconfirmed'), 'Not confirmed');
  assertEqual(statusLabel('conflict'), 'Conflict');
});

test('formats local date and time, and keeps an unparseable value as given', () => {
  assertEqual(formatDateTime(AT), '06 Nov 2026 14:02');
  assertEqual(formatDateTime('not a date'), 'not a date');
});

test('describes every source in plain words', () => {
  assertEqual(describeSource({ kind: 'patient-input', at: AT }), { label: 'You entered this · 06 Nov 2026 14:02' });
  assertEqual(describeSource({ kind: 'doctor', doctorId: 'doc-1', at: AT }), { label: 'From your doctor · 06 Nov 2026 14:02' });
  assertEqual(describeSource({ kind: 'document', documentId: 'rx-demo-1', page: 1, quote: 'Amlodipina 5 mg' }), {
    label: 'From document rx-demo-1, page 1',
    quote: 'Amlodipina 5 mg',
  });
  assertEqual(describeSource({ kind: 'document', documentId: 'rx-demo-1' }), { label: 'From document rx-demo-1' });
  assertEqual(describeSource({ kind: 'message', messageId: 'm1', quote: 'I take aspirin' }), {
    label: 'From your message in the chat',
    quote: 'I take aspirin',
  });
});

test('describes who confirmed and when, without inventing either', () => {
  assertEqual(describeConfirmation({ status: 'confirmed', by: 'patient', at: AT }), 'Confirmed by you · 06 Nov 2026 14:02');
  assertEqual(describeConfirmation({ status: 'confirmed', by: 'doctor', at: AT }), 'Confirmed by your doctor · 06 Nov 2026 14:02');
  assertEqual(describeConfirmation({ status: 'confirmed' }), 'Confirmed');
  assertEqual(describeConfirmation({ status: 'unknown', by: 'patient', at: AT }), 'Marked as unknown by you · 06 Nov 2026 14:02');
  assertEqual(describeConfirmation({ status: 'unconfirmed' }), 'Not confirmed yet');
  assertTrue(describeConfirmation({ status: 'conflict' }).startsWith('Needs your doctor'));
});

test('actions: conflict and confirmed items cannot be changed by the patient', () => {
  assertTrue(canConfirm(item('x', 'allergy', 'unconfirmed')));
  assertTrue(canConfirm(item('x', 'allergy', 'unknown')));
  assertTrue(!canConfirm(item('x', 'allergy', 'confirmed')));
  assertTrue(!canConfirm(item('x', 'allergy', 'conflict')));
  assertTrue(canMarkUnknown(item('x', 'allergy', 'unconfirmed')));
  assertTrue(!canMarkUnknown(item('x', 'allergy', 'unknown')));
  assertTrue(!canMarkUnknown(item('x', 'allergy', 'conflict')));
});

test('validates required text and the length limit', () => {
  assertEqual(validateItemText('   ').ok, false);
  assertEqual(validateItemText('  Penicillin  '), { ok: true, text: 'Penicillin' });
  assertEqual(validateItemText('a'.repeat(MAX_ITEM_LENGTH)).ok, true);
  assertEqual(validateItemText('a'.repeat(MAX_ITEM_LENGTH + 1)).ok, false);
});

test('upsert replaces by id and never duplicates', () => {
  const list = [item('a1', 'allergy', 'unconfirmed'), item('a2', 'allergy', 'unconfirmed')];
  const confirmed = { ...list[0], confirmation: { status: 'confirmed' as const, by: 'patient' as const, at: AT } };
  const next = upsertItem(list, confirmed);
  assertEqual(next.map((i) => i.id), ['a1', 'a2']);
  assertEqual(next[0].confirmation.status, 'confirmed');
  assertEqual(upsertItem(next, item('a3', 'allergy', 'unconfirmed')).length, 3);
  assertEqual(list[0].confirmation.status, 'unconfirmed', 'input list is not mutated');
});

finish();
