// Run: node --experimental-strip-types --no-warnings src/features/admin/adminLogic.test.ts
import { assertEqual, assertTrue, finish, test } from '../connections/testHarness.ts';
import {
  EMPTY_FORM,
  normalizeForm,
  replaceInvitation,
  SessionGuard,
  sortInvitations,
  validateInvitationForm,
  type DoctorInvitation,
} from './adminLogic.ts';

const valid = { email: ' Doctor@Clinic.ro ', fullName: 'Dr. Synthetic Ana', specialty: 'Family medicine', clinic: 'Synthetic Clinic' };
const inv = (id: string, status: DoctorInvitation['status'], expiresAt: string): DoctorInvitation => ({
  id, status, expiresAt, email: `${id}@example.test`, fullName: 'Dr. Synthetic', specialty: 'Cardiology',
  clinic: 'Synthetic Clinic', acceptedAt: null, revokedAt: null,
});

test('accepts a complete form and normalizes it', () => {
  assertEqual(validateInvitationForm(valid), {});
  assertEqual(normalizeForm(valid).email, 'doctor@clinic.ro');
  assertEqual(normalizeForm({ ...valid, clinic: '  Synthetic Clinic  ' }).clinic, 'Synthetic Clinic');
});

test('requires every field (whitespace is empty)', () => {
  const errors = validateInvitationForm({ ...EMPTY_FORM, fullName: '   ' });
  assertEqual(Object.keys(errors).sort(), ['clinic', 'email', 'fullName', 'specialty']);
});

test('rejects invalid emails and over-long values', () => {
  assertTrue(validateInvitationForm({ ...valid, email: 'not-an-email' }).email);
  assertTrue(validateInvitationForm({ ...valid, email: 'a@b' }).email);
  assertTrue(validateInvitationForm({ ...valid, clinic: 'x'.repeat(301) }).clinic);
  assertEqual(validateInvitationForm({ ...valid, clinic: 'x'.repeat(300) }).clinic, undefined);
});

test('sorts pending first (soonest expiry), then newest', () => {
  const list = [
    inv('a', 'accepted', '2026-11-10T10:00:00Z'),
    inv('b', 'pending', '2026-11-12T10:00:00Z'),
    inv('c', 'pending', '2026-11-08T10:00:00Z'),
    inv('d', 'revoked', '2026-11-11T10:00:00Z'),
  ];
  assertEqual(sortInvitations(list).map((i) => i.id), ['c', 'b', 'd', 'a']);
});

test('replaces or prepends the server record without mutating', () => {
  const list = [inv('a', 'pending', '2026-11-10T10:00:00Z')];
  const next = replaceInvitation(list, { ...list[0], status: 'revoked' });
  assertEqual(next[0].status, 'revoked');
  assertEqual(list[0].status, 'pending');
  assertEqual(replaceInvitation(list, inv('b', 'pending', '2026-11-11T10:00:00Z')).map((i) => i.id), ['b', 'a']);
});

test('session guard drops answers from a previous account', () => {
  const guard = new SessionGuard();
  const started = guard.current();
  guard.reset();
  assertTrue(!guard.isCurrent(started));
  assertTrue(guard.isCurrent(guard.current()));
});

finish();
