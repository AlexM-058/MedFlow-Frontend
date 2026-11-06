// Run: node --experimental-strip-types --no-warnings src/features/doctor/account/connectionLogic.test.ts
import type { ConnectionRequest } from '../../../auth/contracts.ts';
import { assertEqual, assertTrue, finish, test } from '../shared/testHarness.ts';
import { applyServerRequest, checkConnectionUrl, failureHandling, sortRequests, splitRequests } from './connectionLogic.ts';

const CODE = 'synthetic_doctor_code_1234';
const ok = (url: string, code = CODE) => checkConnectionUrl({ code, url });

test('accepts canonical HTTPS connection link', () => {
  const result = ok(`https://app.medflow.example/#/connect/${CODE}`);
  assertTrue(result.ok, JSON.stringify(result));
});

test('accepts link with base path', () => {
  assertTrue(ok(`https://app.medflow.example/medflow/#/connect/${CODE}`).ok);
});

test('accepts http only on loopback (local development)', () => {
  assertTrue(ok(`http://localhost:5173/#/connect/${CODE}`).ok);
  assertTrue(!ok(`http://app.medflow.example/#/connect/${CODE}`).ok);
});

test('rejects non-URL, other schemes and credentials', () => {
  assertTrue(!ok('not a url').ok);
  assertTrue(!ok(`javascript:alert(1)//#/connect/${CODE}`).ok);
  assertTrue(!ok(`https://user:pass@app.medflow.example/#/connect/${CODE}`).ok);
});

test('rejects query parameters (no tokens may ride along)', () => {
  assertTrue(!ok(`https://app.medflow.example/?access_token=x#/connect/${CODE}`).ok);
});

test('rejects mismatched or malformed code', () => {
  assertTrue(!ok('https://app.medflow.example/#/connect/other_code_5678').ok);
  assertTrue(!ok(`https://app.medflow.example/#/connect/${CODE}/extra`).ok);
  assertTrue(!ok('https://app.medflow.example/#/connect/a/b', 'a/b').ok);
  assertTrue(!ok('https://app.medflow.example/#/connect/short', 'short').ok);
});

test('matches the shared code length range of 16 to 256 characters', () => {
  for (const length of [16, 256]) {
    const code = 'a'.repeat(length);
    assertTrue(ok(`https://app.medflow.example/#/connect/${code}`, code).ok);
  }
  for (const length of [8, 15, 257]) {
    const code = 'a'.repeat(length);
    assertTrue(!ok(`https://app.medflow.example/#/connect/${code}`, code).ok);
  }
});

const doctor = { id: 'd1', fullName: 'Dr. Synthetic', specialty: 'Family medicine', clinic: 'Synthetic Clinic' };
const req = (id: string, status: ConnectionRequest['status'], createdAt: string): ConnectionRequest => ({
  id, status, createdAt, doctor, patient: { id: `p-${id}`, fullName: `Patient ${id}` },
});
const list = [
  req('r1', 'accepted', '2026-11-05T10:00:00Z'),
  req('r2', 'pending', '2026-11-06T09:00:00Z'),
  req('r3', 'pending', '2026-11-04T09:00:00Z'),
  req('r4', 'rejected', '2026-11-06T11:00:00Z'),
  req('r5', 'cancelled', '2026-11-01T11:00:00Z'),
];

test('sorts pending first (oldest waiting first), history newest first', () => {
  assertEqual(sortRequests(list).map((r) => r.id), ['r3', 'r2', 'r4', 'r1', 'r5']);
});

test('splits pending and history', () => {
  const { pending, history } = splitRequests(list);
  assertEqual(pending.map((r) => r.id), ['r3', 'r2']);
  assertEqual(history.map((r) => r.id), ['r4', 'r1', 'r5']);
});

test('applies only the server record and does not mutate input', () => {
  const updated = req('r2', 'accepted', '2026-11-06T09:00:00Z');
  const next = applyServerRequest(list, updated);
  assertEqual(next.find((r) => r.id === 'r2')?.status, 'accepted');
  assertEqual(list.find((r) => r.id === 'r2')?.status, 'pending');
  assertEqual(next.length, 5);
});

test('maps failures: 409 refresh, 401 reauthenticate, others retry', () => {
  assertEqual(failureHandling(409), 'refresh');
  assertEqual(failureHandling(401), 'reauthenticate');
  assertEqual(failureHandling(500), 'retry');
  assertEqual(failureHandling(0), 'retry');
  assertEqual(failureHandling(403), 'retry');
});

finish();
