// Run: node --experimental-strip-types --no-warnings src/features/connections/connectionSync.test.ts
import type { ConnectionRequest } from '../../auth/contracts.ts';
import { assertEqual, assertTrue, finish, test } from './testHarness.ts';
import {
  applyServerRequest,
  describeMutationFailure,
  newlyAccepted,
  requestForDoctor,
  RequestSync,
  sortPatientRequests,
} from './connectionSync.ts';

const doctorA = { id: 'doc-a', fullName: 'Dr. Synthetic A', specialty: 'Family medicine', clinic: 'Synthetic Clinic' };
const doctorB = { id: 'doc-b', fullName: 'Dr. Synthetic B', specialty: 'Cardiology', clinic: 'Synthetic Clinic' };
const req = (id: string, status: ConnectionRequest['status'], createdAt: string, doctor = doctorA): ConnectionRequest => ({
  id, status, createdAt, doctor, patient: { id: 'pat-1', fullName: 'Synthetic Patient' },
});

test('ignores a delayed read after the session changed', () => {
  const sync = new RequestSync();
  const oldSession = sync.begin();
  sync.reset();
  const newSession = sync.begin();
  assertTrue(!sync.acceptRead(oldSession), 'old-session read must be ignored');
  assertTrue(sync.acceptRead(newSession));
});

test('ignores a delayed mutation after the session changed', () => {
  const sync = new RequestSync();
  const mutation = sync.begin();
  sync.reset();
  assertTrue(!sync.acceptMutation(mutation));
  assertTrue(!sync.isCurrent(mutation));
});

test('two refreshes resolving in reverse order keep the newer list', () => {
  const sync = new RequestSync();
  const first = sync.begin();
  const second = sync.begin();
  assertTrue(sync.acceptRead(second));
  assertTrue(!sync.acceptRead(first), 'older refresh must not overwrite the newer one');
});

test('a read started before a completed mutation cannot restore the old status', () => {
  const sync = new RequestSync();
  const read = sync.begin();
  const mutation = sync.begin();
  assertTrue(sync.acceptMutation(mutation));
  assertTrue(!sync.acceptRead(read));
  assertTrue(sync.acceptRead(sync.begin()), 'a read started afterwards is applied');
});

test('reset does not let an old ticket match the new generation later', () => {
  const sync = new RequestSync();
  const stale = sync.begin();
  sync.reset();
  sync.reset();
  assertTrue(!sync.acceptRead(stale));
});

test('applies the server record without mutating the input', () => {
  const list = [req('r1', 'pending', '2026-11-06T09:00:00Z')];
  const next = applyServerRequest(list, req('r1', 'cancelled', '2026-11-06T09:00:00Z'));
  assertEqual(next[0].status, 'cancelled');
  assertEqual(list[0].status, 'pending');
  assertEqual(applyServerRequest(list, req('r2', 'pending', '2026-11-06T10:00:00Z')).length, 2);
});

test('sorts pending first, then newest first, stable by id', () => {
  const list = [
    req('r1', 'rejected', '2026-11-01T09:00:00Z'),
    req('r2', 'pending', '2026-11-05T09:00:00Z'),
    req('r3', 'accepted', '2026-11-06T09:00:00Z'),
    req('r4', 'cancelled', '2026-11-06T09:00:00Z'),
  ];
  assertEqual(sortPatientRequests(list).map((r) => r.id), ['r2', 'r3', 'r4', 'r1']);
});

test('detects pending -> accepted once per request', () => {
  const previous = [req('r1', 'pending', '2026-11-06T09:00:00Z'), req('r2', 'pending', '2026-11-06T09:00:00Z')];
  const next = [req('r1', 'accepted', '2026-11-06T09:00:00Z'), req('r2', 'rejected', '2026-11-06T09:00:00Z')];
  assertEqual(newlyAccepted(previous, next, new Set()), ['r1']);
  assertEqual(newlyAccepted(previous, next, new Set(['r1'])), []);
  assertEqual(newlyAccepted([], next, new Set()), [], 'a first load never triggers a profile refresh');
});

test('picks the pending request for a doctor, otherwise the newest', () => {
  const list = [
    req('r1', 'rejected', '2026-11-06T09:00:00Z'),
    req('r2', 'cancelled', '2026-11-04T09:00:00Z'),
    req('r3', 'pending', '2026-11-06T09:00:00Z', doctorB),
  ];
  assertEqual(requestForDoctor(list, 'doc-a')?.id, 'r1');
  assertEqual(requestForDoctor(list, 'doc-b')?.id, 'r3');
  assertEqual(requestForDoctor(list, 'doc-c'), undefined);
  assertEqual(requestForDoctor(list, undefined), undefined);
});

test('maps mutation failures', () => {
  const err = (status: number) => Object.assign(new Error('Server message'), { status });
  const conflict = describeMutationFailure(err(409), 'cancel');
  assertEqual([conflict.refresh, conflict.retry], [true, false]);
  assertEqual(describeMutationFailure(err(410), 'request').retry, false);
  assertEqual(describeMutationFailure(err(401), 'cancel').refresh, false);
  const unavailable = describeMutationFailure(err(503), 'request');
  assertEqual([unavailable.refresh, unavailable.retry], [true, true]);
  assertEqual(describeMutationFailure(new Error('network'), 'cancel').retry, true);
  assertEqual(describeMutationFailure(err(429), 'request').refresh, false);
});

finish();
