// Run: node --experimental-strip-types --no-warnings src/features/medication-schedule/scheduleLogic.test.ts
// Synthetic data only.
import type { ConfirmedMedication, MedicationSchedule } from '../care-scenario/contracts.ts';
import { assertEqual, assertTrue, finish, test } from '../connections/testHarness.ts';
import {
  buildScheduleRequest,
  canShowSystemNotification,
  classifyRegimen,
  computeEndDate,
  doseOccurrences,
  dueDoses,
  effectiveStatus,
  formatDoseDay,
  isEnded,
  mapNotificationPermission,
  nextDose,
  parseDuration,
  resolveLocalTime,
  SYSTEM_NOTIFICATION,
  upcomingSkipped,
  validateScheduleForm,
  wallClock,
} from './scheduleLogic.ts';

const med = (over: Partial<ConfirmedMedication> = {}): ConfirmedMedication => ({
  id: 'med-1',
  documentId: 'doc-1',
  name: 'Amlodipine (synthetic)',
  doseText: '5 mg',
  instructionOriginal: '1 cp dimineata',
  durationText: '30 de zile',
  fields: [],
  confirmedAt: '2026-11-07T08:00:00Z',
  ...over,
});

const schedule = (over: Partial<MedicationSchedule> = {}): MedicationSchedule => ({
  id: 'sch-1',
  medicationId: 'med-1',
  medication: 'Amlodipine (synthetic)',
  doseText: '5 mg',
  instructionOriginal: '1 cp dimineata',
  times: ['08:00'],
  startDate: '2026-11-07',
  endDate: '2026-12-06',
  timezone: 'Europe/Bucharest',
  status: 'active',
  confirmedAt: '2026-11-07T07:00:00Z',
  ...over,
});

const iso = (ms: number) => new Date(ms).toISOString();
const fields = (r: ReturnType<typeof validateScheduleForm>) => (r.ok ? [] : r.errors.map((e) => e.field));

// ---------- Validation ----------

test('frequency without times is blocked (no default times)', () => {
  const twice = med({ instructionOriginal: 'de doua ori pe zi' });
  const r = validateScheduleForm(twice, { times: [], startDate: '2026-11-07', endMode: 'suggested', endDate: '' });
  assertEqual(fields(r), ['times']);
  const empty = validateScheduleForm(twice, { times: ['', ''], startDate: '2026-11-07', endMode: 'suggested', endDate: '' });
  assertEqual(fields(empty), ['times']);
});

test('invalid and duplicate times are rejected per row', () => {
  const r = validateScheduleForm(med(), { times: ['08:00', '8:00', '24:00', '08:00'], startDate: '2026-11-07', endMode: 'suggested', endDate: '' });
  assertTrue(!r.ok);
  if (!r.ok) assertEqual(r.errors.map((e) => e.index), [1, 2, 3]);
});

test('duration without start date is blocked', () => {
  const r = validateScheduleForm(med(), { times: ['08:00'], startDate: '', endMode: 'suggested', endDate: '' });
  assertEqual(fields(r), ['startDate']);
});

test('"30 zile" gives an inclusive end date: start + 29 days', () => {
  assertEqual(parseDuration('30 zile'), { days: 30 });
  assertEqual(computeEndDate('2026-11-07', 30), '2026-12-06');
  const r = validateScheduleForm(med({ durationText: '30 zile' }), { times: ['08:00'], startDate: '2026-11-07', endMode: 'suggested', endDate: '' });
  assertTrue(r.ok);
  if (r.ok) assertEqual(r.value, { times: ['08:00'], startDate: '2026-11-07', endDate: '2026-12-06' });
});

test('parsed duration must still be confirmed by the patient', () => {
  const r = validateScheduleForm(med(), { times: ['08:00'], startDate: '2026-11-07', endMode: 'unset', endDate: '' });
  assertEqual(fields(r), ['end']);
  const none = validateScheduleForm(med(), { times: ['08:00'], startDate: '2026-11-07', endMode: 'none', endDate: '' });
  assertEqual(fields(none), ['end'], 'a prescription with a clear duration cannot be marked "no end date"');
});

test('parseDuration accepts only the clear forms', () => {
  assertEqual(parseDuration('30 de zile'), { days: 30 });
  assertEqual(parseDuration('30 days'), { days: 30 });
  assertEqual(parseDuration('2 săptămâni'), { days: 14 });
  assertEqual(parseDuration('2 saptamani'), { days: 14 });
  assertEqual(parseDuration('2 weeks'), { days: 14 });
  assertEqual(parseDuration('1 zi'), { days: 1 });
  for (const unclear of ['o luna', '1 month', '30', 'până la control', '7-10 zile', '0 zile', 'aprox. 30 zile', null, '']) {
    assertEqual(parseDuration(unclear), null, String(unclear));
  }
});

test('unparseable duration requires an explicit end choice', () => {
  const m = med({ durationText: 'până la control' });
  assertEqual(fields(validateScheduleForm(m, { times: ['08:00'], startDate: '2026-11-07', endMode: 'unset', endDate: '' })), ['end']);
  assertEqual(fields(validateScheduleForm(m, { times: ['08:00'], startDate: '2026-11-07', endMode: 'suggested', endDate: '' })), ['end']);
  const picked = validateScheduleForm(m, { times: ['08:00'], startDate: '2026-11-07', endMode: 'date', endDate: '2026-11-20' });
  assertTrue(picked.ok && picked.value.endDate === '2026-11-20');
  const none = validateScheduleForm(med({ durationText: null }), { times: ['08:00'], startDate: '2026-11-07', endMode: 'none', endDate: '' });
  assertTrue(none.ok && none.value.endDate === null);
});

test('end date before start date is rejected', () => {
  const r = validateScheduleForm(med({ durationText: null }), { times: ['08:00'], startDate: '2026-11-07', endMode: 'date', endDate: '2026-11-06' });
  assertEqual(fields(r), ['end']);
});

test('as-needed (PRN) is not schedulable', () => {
  for (const text of ['1 cp la nevoie', 'PRN', 'as needed for pain', 'daca e nevoie', 'dacă este nevoie']) {
    assertEqual(classifyRegimen(med({ instructionOriginal: text })), 'as-needed', text);
  }
  const r = validateScheduleForm(med({ instructionOriginal: '1 cp la nevoie' }), { times: ['08:00'], startDate: '2026-11-07', endMode: 'suggested', endDate: '' });
  assertEqual(fields(r), ['regimen']);
});

test('variable regimens are not schedulable', () => {
  for (const text of ['2 cp/zi 5 zile, apoi 1 cp/zi', '1 tablet, then half', 'in zilele impare', 'alternate days', '1-2 cp seara']) {
    assertEqual(classifyRegimen(med({ instructionOriginal: text })), 'variable', text);
  }
  assertEqual(classifyRegimen(med()), 'fixed');
  assertEqual(classifyRegimen(med({ instructionOriginal: '1-0-1' })), 'fixed', 'morning-noon-evening notation is not a range');
});

test('the request keeps the prescription verbatim', () => {
  const m = med({ instructionOriginal: 'de 2 ori pe zi', durationText: '30 zile' });
  const r = validateScheduleForm(m, { times: ['20:00', '08:00'], startDate: '2026-11-07', endMode: 'suggested', endDate: '' });
  assertTrue(r.ok);
  if (!r.ok) return;
  const req = buildScheduleRequest(m, r.value, 'Europe/Bucharest');
  assertEqual(req.instructionOriginal, 'de 2 ori pe zi');
  assertEqual(req.doseText, '5 mg');
  assertEqual(req.times, ['08:00', '20:00']);
  assertEqual(req.timezone, 'Europe/Bucharest');
});

// ---------- Next dose, expiry, cancellation ----------

test('next dose today, then tomorrow after the time passed', () => {
  const s = schedule();
  // 2026-11-07 07:00 Bucharest (EET, UTC+2) = 05:00Z
  assertEqual(iso(nextDose([s], new Date('2026-11-07T05:00:00Z'))!.at), '2026-11-07T06:00:00.000Z');
  const later = nextDose([s], new Date('2026-11-07T06:00:00Z'))!;
  assertEqual([later.date, later.time], ['2026-11-08', '08:00']);
  assertEqual(formatDoseDay(later, new Date('2026-11-07T06:00:00Z')), 'tomorrow');
});

test('next dose crosses midnight', () => {
  const s = schedule({ times: ['23:30', '00:15'] });
  const now = new Date('2026-11-07T21:45:00Z'); // 23:45 local
  const next = nextDose([s], now)!;
  assertEqual([next.date, next.time, iso(next.at)], ['2026-11-08', '00:15', '2026-11-07T22:15:00.000Z']);
});

test('future start date: next dose is on the start date', () => {
  const s = schedule({ startDate: '2026-11-20', endDate: '2026-11-25' });
  const next = nextDose([s], new Date('2026-11-07T10:00:00Z'))!;
  assertEqual([next.date, next.time], ['2026-11-20', '08:00']);
});

test('schedule expiry: no next dose and no reminder after the end date', () => {
  const s = schedule({ startDate: '2026-11-01', endDate: '2026-11-06' });
  const now = new Date('2026-11-07T06:00:30Z');
  assertTrue(isEnded(s, now));
  assertEqual(effectiveStatus(s, now), 'ended');
  assertEqual(nextDose([s], now), null);
  assertEqual(dueDoses([s], new Date('2026-11-07T05:59:00Z'), now, new Set()), []);
  // The last day is still active (inclusive) until its last dose.
  const lastDay = new Date('2026-11-06T05:00:00Z');
  assertTrue(!isEnded(s, lastDay));
  assertEqual(nextDose([s], lastDay)!.date, '2026-11-06');
  assertEqual(nextDose([s], new Date('2026-11-06T07:00:00Z')), null, 'after the last dose of the last day');
});

test('cancelled schedule never yields a next dose or a reminder', () => {
  const s = schedule({ status: 'cancelled' });
  const now = new Date('2026-11-07T06:00:00Z');
  assertEqual(nextDose([s], new Date('2026-11-07T05:00:00Z')), null);
  assertEqual(dueDoses([s], new Date('2026-11-07T05:59:00Z'), now, new Set()), []);
  assertEqual(doseOccurrences(s, new Date('2026-11-07T00:00:00Z'), new Date('2026-11-09T00:00:00Z')).doses, []);
});

test('nextDose picks the earliest across schedules', () => {
  const a = schedule({ id: 'a', times: ['20:00'] });
  const b = schedule({ id: 'b', medication: 'Synthetic B', times: ['12:00'] });
  assertEqual(nextDose([a, b], new Date('2026-11-07T07:00:00Z'))!.scheduleId, 'b');
});

// ---------- Time zones and DST ----------

test('computed in the schedule zone, not the host zone', () => {
  const ny = schedule({ timezone: 'America/New_York' });
  // 2026-11-07: New York is on EST (UTC-5) since 2026-11-01.
  assertEqual(iso(nextDose([ny], new Date('2026-11-07T10:00:00Z'))!.at), '2026-11-07T13:00:00.000Z');
  const tokyo = schedule({ timezone: 'Asia/Tokyo' });
  // 08:00 JST = 23:00Z the previous day; at 2026-11-07T00:00Z it is already 09:00 in Tokyo.
  const next = nextDose([tokyo], new Date('2026-11-07T00:00:00Z'))!;
  assertEqual([next.date, iso(next.at)], ['2026-11-08', '2026-11-07T23:00:00.000Z']);
  assertEqual(formatDoseDay(next, new Date('2026-11-07T00:00:00Z')), 'tomorrow');
});

test('Europe/Bucharest fall back 2026-10-25: repeated 03:30 reminds once (first occurrence)', () => {
  const r = resolveLocalTime('2026-10-25', '03:30', 'Europe/Bucharest');
  assertTrue(r.kind === 'ok' && r.repeated);
  if (r.kind === 'ok') assertEqual(iso(r.at), '2026-10-25T00:30:00.000Z');
  const s = schedule({ times: ['03:30', '08:00'], startDate: '2026-10-24', endDate: '2026-10-26' });
  const { doses, skipped } = doseOccurrences(s, new Date('2026-10-24T00:00:00Z'), new Date('2026-10-27T00:00:00Z'));
  assertEqual(skipped, []);
  assertEqual(doses.map((d) => iso(d.at)), [
    '2026-10-24T00:30:00.000Z',
    '2026-10-24T05:00:00.000Z',
    '2026-10-25T00:30:00.000Z',
    '2026-10-25T06:00:00.000Z', // 08:00 EET (UTC+2) after the change
    '2026-10-26T01:30:00.000Z',
    '2026-10-26T06:00:00.000Z',
  ]);
  const fired = new Set([doses[2].key]);
  assertEqual(dueDoses([s], new Date('2026-10-25T01:00:00Z'), new Date('2026-10-25T01:31:00Z'), fired), [], 'no second reminder at the repeated 03:30');
});

test('Europe/Bucharest spring forward 2027-03-28: 03:30 does not exist and is skipped with a note', () => {
  assertEqual(resolveLocalTime('2027-03-28', '03:30', 'Europe/Bucharest'), { kind: 'nonexistent' });
  const s = schedule({ times: ['03:30', '08:00'], startDate: '2027-03-27', endDate: '2027-03-29' });
  const { doses, skipped } = doseOccurrences(s, new Date('2027-03-27T00:00:00Z'), new Date('2027-03-30T00:00:00Z'));
  assertEqual(skipped.map((k) => [k.date, k.time]), [['2027-03-28', '03:30']]);
  assertEqual(doses.map((d) => `${d.date} ${d.time}`), ['2027-03-27 03:30', '2027-03-27 08:00', '2027-03-28 08:00', '2027-03-29 03:30', '2027-03-29 08:00']);
  // 02:00 local on the change day: the next dose is 08:00 EEST (UTC+3) = 05:00Z, not a shifted 03:30.
  const next = nextDose([s], new Date('2027-03-28T00:00:00Z'))!;
  assertEqual([next.time, iso(next.at)], ['08:00', '2027-03-28T05:00:00.000Z']);
  assertEqual(upcomingSkipped(s, new Date('2027-03-26T12:00:00Z')).map((k) => k.date), ['2027-03-28']);
});

test('wallClock formats in the requested zone', () => {
  assertEqual(wallClock(new Date('2026-11-07T22:30:00Z'), 'Europe/Bucharest'), { date: '2026-11-08', time: '00:30' });
  assertEqual(wallClock(new Date('2026-11-07T22:30:00Z'), 'UTC'), { date: '2026-11-07', time: '22:30' });
});

// ---------- Reminders ----------

test('due doses fire once per dose key', () => {
  const s = schedule();
  const last = new Date('2026-11-07T05:59:50Z');
  const now = new Date('2026-11-07T06:00:05Z');
  const due = dueDoses([s], last, now, new Set());
  assertEqual(due.map((d) => d.key), ['sch-1|2026-11-07|08:00']);
  assertEqual(dueDoses([s], last, now, new Set([due[0].key])), []);
});

test('reminders older than the allowed delay do not fire after the tab was hidden for hours', () => {
  const s = schedule();
  assertEqual(dueDoses([s], new Date('2026-11-07T05:00:00Z'), new Date('2026-11-07T10:00:00Z'), new Set()), []);
  assertEqual(dueDoses([s], new Date('2026-11-07T05:00:00Z'), new Date('2026-11-07T06:20:00Z'), new Set()).length, 1);
});

test('notification permission states map explicitly', () => {
  assertEqual(mapNotificationPermission({ supported: false, secureContext: true }), 'unsupported');
  assertEqual(mapNotificationPermission({ supported: true, secureContext: false, permission: 'granted' }), 'unsupported');
  assertEqual(mapNotificationPermission({ supported: true, secureContext: true, permission: 'default' }), 'default');
  assertEqual(mapNotificationPermission({ supported: true, secureContext: true, permission: 'denied' }), 'denied');
  assertEqual(mapNotificationPermission({ supported: true, secureContext: true, permission: 'granted' }), 'granted');
  assertEqual(mapNotificationPermission({ supported: true, secureContext: true, permission: 'weird' }), 'default');
  assertTrue(canShowSystemNotification('granted'));
  assertTrue(!canShowSystemNotification('denied') && !canShowSystemNotification('default') && !canShowSystemNotification('unsupported'));
});

test('system notification text is generic', () => {
  const text = `${SYSTEM_NOTIFICATION.title} ${SYSTEM_NOTIFICATION.body} ${SYSTEM_NOTIFICATION.tag}`.toLowerCase();
  assertEqual([SYSTEM_NOTIFICATION.title, SYSTEM_NOTIFICATION.body], ['Medication reminder', 'Open the app to see the details']);
  for (const leak of ['amlodipine', 'mg', '08:00']) assertTrue(!text.includes(leak), leak);
});

finish();
