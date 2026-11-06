// Pure scheduling logic for confirmed medications (DEMO_IMPLEMENTATION_PLAN.md M4).
// No DOM, no React. All wall-clock math is done with Intl in the schedule's own IANA
// time zone, never in the host zone. Nothing here invents times, doses or durations:
// it only validates what the patient chose explicitly and computes from it.
import type { ConfirmedMedication, MedicationSchedule } from '../care-scenario/contracts.ts';

const MINUTE = 60_000;
const DAY = 86_400_000;

// ---------- Text normalisation and prescription classification ----------

/** Lower case, no diacritics (ă â î ș ț and the cedilla variants), single spaces. */
export function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export interface ParsedDuration {
  days: number;
}

/** Longest duration accepted as "clear" (one year). Anything longer needs the doctor. */
const MAX_DURATION_DAYS = 366;

/**
 * Parses only the clear forms "30 zile", "30 de zile", "30 days", "2 saptamani" /
 * "2 săptămâni", "2 weeks" (and their singulars). Everything else returns null and the
 * patient must choose the end explicitly.
 */
export function parseDuration(text: string | null | undefined): ParsedDuration | null {
  if (!text) return null;
  const match = /^(\d{1,3}) (?:de )?(zile|zi|days|day|saptamani|saptamana|weeks|week)$/.exec(normalizeText(text));
  if (!match) return null;
  const count = Number(match[1]);
  if (!Number.isInteger(count) || count <= 0) return null;
  const unit = match[2];
  const days = unit.startsWith('s') || unit.startsWith('w') ? count * 7 : count;
  return days > MAX_DURATION_DAYS ? null : { days };
}

export type RegimenKind = 'fixed' | 'as-needed' | 'variable';

const AS_NEEDED = [/\bla nevoie\b/, /\bprn\b/, /\bas needed\b/, /\bdaca e nevoie\b/, /\bdaca este nevoie\b/];
const VARIABLE = [
  /\bapoi\b/,
  /\bthen\b/,
  /\bzilele\b/,
  /\balternate\b/,
  // Explicit dose ranges such as "1-2 cp" or "1 to 2 tablets".
  /\b\d+ ?(?:-|–|to|pana la) ?\d+ ?(?:cp|comprimate?|tablets?|tabs?|capsules?|caps|capsule|pastile|picaturi|drops)\b/,
];

/**
 * Classifies the prescribed regimen from its verbatim texts. As-needed and variable
 * regimens are never scheduled automatically in this demo.
 */
export function classifyRegimen(
  medication: Pick<ConfirmedMedication, 'instructionOriginal' | 'doseText' | 'durationText'>,
): RegimenKind {
  const all = normalizeText([medication.instructionOriginal, medication.doseText, medication.durationText ?? ''].join(' | '));
  if (AS_NEEDED.some((pattern) => pattern.test(all))) return 'as-needed';
  if (VARIABLE.some((pattern) => pattern.test(all))) return 'variable';
  return 'fixed';
}

export const REGIMEN_MESSAGES: Record<Exclude<RegimenKind, 'fixed'>, string> = {
  'as-needed': 'As-needed medication is not scheduled automatically in this demo.',
  variable: 'This regimen needs your doctor; it is not scheduled automatically.',
};

// ---------- Dates and times ----------

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidTime(value: string): boolean {
  return TIME_RE.test(value);
}

export function isValidDate(value: string): boolean {
  const match = DATE_RE.exec(value);
  if (!match) return false;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** Calendar arithmetic on "YYYY-MM-DD" (time-zone free). */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * DAY).toISOString().slice(0, 10);
}

/** Inclusive end: a 30-day course starting on day 1 ends on day 30 (start + 29). */
export function computeEndDate(startDate: string, durationDays: number): string {
  return addDays(startDate, durationDays - 1);
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** The device's IANA time zone (falls back to UTC if the runtime does not report one). */
export function deviceTimeZone(): string {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return zone && isValidTimeZone(zone) ? zone : 'UTC';
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

interface WallParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function wallParts(instant: number, timeZone: string): WallParts {
  const values: Record<string, number> = {};
  for (const part of partsFormatter(timeZone).formatToParts(new Date(instant))) {
    if (part.type !== 'literal') values[part.type] = Number(part.value);
  }
  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour === 24 ? 0 : values.hour,
    minute: values.minute,
    second: values.second,
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Wall-clock date and time of an instant in an IANA zone. */
export function wallClock(instant: Date | number, timeZone: string): { date: string; time: string } {
  const p = wallParts(typeof instant === 'number' ? instant : instant.getTime(), timeZone);
  return { date: `${p.year}-${pad(p.month)}-${pad(p.day)}`, time: `${pad(p.hour)}:${pad(p.minute)}` };
}

/** Today's date ("YYYY-MM-DD") in the given zone. */
export function todayIn(timeZone: string, now: Date): string {
  return wallClock(now, timeZone).date;
}

/** UTC offset (ms) of the zone at an instant. */
function offsetAt(instant: number, timeZone: string): number {
  const p = wallParts(instant, timeZone);
  const whole = instant - (((instant % 1000) + 1000) % 1000);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - whole;
}

export type LocalTimeResolution =
  | { kind: 'ok'; at: number; repeated: boolean }
  /** The wall time does not exist that day (spring-forward gap). */
  | { kind: 'nonexistent' };

/**
 * Converts a wall-clock date + time in an IANA zone to an instant.
 * DST rules (defined behaviour):
 *  - spring forward: a time inside the gap does not exist -> 'nonexistent'; the dose is
 *    skipped and the UI shows a visible note (it is never moved to another time);
 *  - fall back: a repeated time resolves to its FIRST occurrence, so it reminds once.
 */
export function resolveLocalTime(date: string, time: string, timeZone: string): LocalTimeResolution {
  const [y, m, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  const offsets = new Set([offsetAt(guess - DAY, timeZone), offsetAt(guess, timeZone), offsetAt(guess + DAY, timeZone)]);
  const hits = [...new Set([...offsets].map((offset) => guess - offset))]
    .filter((candidate) => {
      const wall = wallClock(candidate, timeZone);
      return wall.date === date && wall.time === time;
    })
    .sort((a, b) => a - b);
  if (hits.length === 0) return { kind: 'nonexistent' };
  return { kind: 'ok', at: hits[0], repeated: hits.length > 1 };
}

// ---------- Form validation ----------

/** How the patient settled the end of the course. */
export type EndMode = 'unset' | 'suggested' | 'date' | 'none';

export interface ScheduleFormInput {
  times: string[];
  startDate: string;
  endMode: EndMode;
  /** Used only when endMode is 'date'. */
  endDate: string;
}

export type ScheduleField = 'regimen' | 'times' | 'startDate' | 'end';

export interface ScheduleError {
  field: ScheduleField;
  message: string;
  /** Index of the time row, for errors about one time. */
  index?: number;
}

export interface ValidSchedule {
  times: string[];
  startDate: string;
  endDate: string | null;
}

export type ValidationResult = { ok: true; value: ValidSchedule } | { ok: false; errors: ScheduleError[] };

export function validateScheduleForm(
  medication: Pick<ConfirmedMedication, 'instructionOriginal' | 'doseText' | 'durationText'>,
  input: ScheduleFormInput,
): ValidationResult {
  const errors: ScheduleError[] = [];
  const regimen = classifyRegimen(medication);
  if (regimen !== 'fixed') {
    return { ok: false, errors: [{ field: 'regimen', message: REGIMEN_MESSAGES[regimen] }] };
  }

  const filled = input.times.map((value) => value.trim());
  if (filled.every((value) => value === '')) {
    errors.push({ field: 'times', message: 'Choose at least one time. Times are never chosen for you.' });
  } else {
    const seen = new Set<string>();
    filled.forEach((value, index) => {
      if (value === '') {
        errors.push({ field: 'times', index, message: 'Enter a time or remove this row.' });
      } else if (!isValidTime(value)) {
        errors.push({ field: 'times', index, message: 'Use the 24-hour format HH:MM, for example 07:30.' });
      } else if (seen.has(value)) {
        errors.push({ field: 'times', index, message: `${value} is already in the list.` });
      } else {
        seen.add(value);
      }
    });
  }

  const startDate = input.startDate.trim();
  const startOk = isValidDate(startDate);
  if (startDate === '') errors.push({ field: 'startDate', message: 'Choose the first day of the treatment.' });
  else if (!startOk) errors.push({ field: 'startDate', message: 'Enter a valid start date.' });

  let endDate: string | null = null;
  const duration = parseDuration(medication.durationText);
  if (duration) {
    if (input.endMode !== 'suggested') {
      errors.push({ field: 'end', message: 'Confirm the end date computed from your prescription.' });
    } else if (startOk) {
      endDate = computeEndDate(startDate, duration.days);
    }
  } else if (input.endMode === 'none') {
    endDate = null;
  } else if (input.endMode === 'date') {
    const end = input.endDate.trim();
    if (!isValidDate(end)) errors.push({ field: 'end', message: 'Choose a valid end date.' });
    else if (startOk && end < startDate) errors.push({ field: 'end', message: 'The end date cannot be before the start date.' });
    else endDate = end;
  } else {
    errors.push({ field: 'end', message: 'Choose an end date, or confirm that the prescription gives no end date.' });
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: { times: [...filled].sort(), startDate, endDate } };
}

/** Builds the save request. Prescribed texts are copied verbatim; only the chosen fields are added. */
export function buildScheduleRequest(
  medication: ConfirmedMedication,
  value: ValidSchedule,
  timezone: string,
): Omit<MedicationSchedule, 'id' | 'status' | 'confirmedAt'> {
  return {
    medicationId: medication.id,
    medication: medication.name,
    doseText: medication.doseText,
    instructionOriginal: medication.instructionOriginal,
    times: [...value.times],
    startDate: value.startDate,
    endDate: value.endDate,
    timezone,
  };
}

// ---------- Schedule state and dose occurrences ----------

/** True once the schedule's last day (inclusive) is over in its own zone. */
export function isEnded(schedule: MedicationSchedule, now: Date): boolean {
  if (schedule.status === 'ended') return true;
  return schedule.endDate !== null && todayIn(schedule.timezone, now) > schedule.endDate;
}

export function effectiveStatus(schedule: MedicationSchedule, now: Date): MedicationSchedule['status'] {
  if (schedule.status === 'cancelled') return 'cancelled';
  return isEnded(schedule, now) ? 'ended' : 'active';
}

export interface DoseOccurrence {
  /** Stable per dose: schedule id + local date + local time. Contains no medical text. */
  key: string;
  scheduleId: string;
  medication: string;
  /** Local date and time in the schedule's zone. */
  date: string;
  time: string;
  timezone: string;
  /** Instant (epoch ms). */
  at: number;
}

export interface SkippedDose {
  scheduleId: string;
  medication: string;
  date: string;
  time: string;
  timezone: string;
  reason: 'nonexistent-local-time';
}

/**
 * Doses of one schedule with from <= at < to. Cancelled schedules yield nothing.
 * Times that do not exist on a DST day are returned in `skipped`, never shifted.
 */
export function doseOccurrences(
  schedule: MedicationSchedule,
  from: Date,
  to: Date,
): { doses: DoseOccurrence[]; skipped: SkippedDose[] } {
  const doses: DoseOccurrence[] = [];
  const skipped: SkippedDose[] = [];
  if (schedule.status !== 'active' || schedule.times.length === 0 || to.getTime() <= from.getTime()) {
    return { doses, skipped };
  }
  const zone = schedule.timezone;
  let date = wallClock(from.getTime() - DAY, zone).date;
  if (date < schedule.startDate) date = schedule.startDate;
  let last = wallClock(to.getTime() + DAY, zone).date;
  if (schedule.endDate !== null && last > schedule.endDate) last = schedule.endDate;
  const times = [...schedule.times].filter(isValidTime).sort();

  for (; date <= last; date = addDays(date, 1)) {
    for (const time of times) {
      const resolved = resolveLocalTime(date, time, zone);
      if (resolved.kind === 'nonexistent') {
        const dayStart = resolveLocalTime(date, '12:00', zone);
        const approx = dayStart.kind === 'ok' ? dayStart.at : Date.UTC(...ymd(date));
        if (approx + DAY > from.getTime() && approx - DAY < to.getTime()) {
          skipped.push({ scheduleId: schedule.id, medication: schedule.medication, date, time, timezone: zone, reason: 'nonexistent-local-time' });
        }
        continue;
      }
      if (resolved.at >= from.getTime() && resolved.at < to.getTime()) {
        doses.push({
          key: `${schedule.id}|${date}|${time}`,
          scheduleId: schedule.id,
          medication: schedule.medication,
          date,
          time,
          timezone: zone,
          at: resolved.at,
        });
      }
    }
  }
  doses.sort((a, b) => a.at - b.at);
  return { doses, skipped };
}

function ymd(date: string): [number, number, number] {
  const [y, m, d] = date.split('-').map(Number);
  return [y, m - 1, d];
}

/** The next dose strictly after `now`, across active (not ended, not cancelled) schedules. */
export function nextDose(schedules: readonly MedicationSchedule[], now: Date): DoseOccurrence | null {
  let best: DoseOccurrence | null = null;
  for (const schedule of schedules) {
    if (effectiveStatus(schedule, now) !== 'active') continue;
    const candidate = nextDoseOf(schedule, now);
    if (candidate && (!best || candidate.at < best.at)) best = candidate;
  }
  return best;
}

/** Next dose of one schedule strictly after `now`, or null. */
export function nextDoseOf(schedule: MedicationSchedule, now: Date): DoseOccurrence | null {
  if (effectiveStatus(schedule, now) !== 'active') return null;
  let from = now.getTime() + 1;
  const start = resolveLocalTime(schedule.startDate, '00:00', schedule.timezone);
  if (start.kind === 'ok' && start.at > from) from = start.at;
  // Each window covers several local days, so a fully skipped DST day is crossed.
  for (let i = 0; i < 4; i += 1) {
    const to = from + 3 * DAY;
    const { doses } = doseOccurrences(schedule, new Date(from), new Date(to));
    if (doses.length > 0) return doses[0];
    if (schedule.endDate !== null && wallClock(from, schedule.timezone).date > schedule.endDate) return null;
    from = to;
  }
  return null;
}

/** Time a reminder may still fire after its dose time (e.g. after the tab was hidden). */
export const MAX_REMINDER_DELAY_MS = 30 * MINUTE;

/**
 * Doses whose time was reached in (lastCheck, now], not yet fired, and not older than
 * `maxDelayMs`. Ended or cancelled schedules never remind.
 */
export function dueDoses(
  schedules: readonly MedicationSchedule[],
  lastCheck: Date,
  now: Date,
  fired: ReadonlySet<string>,
  maxDelayMs: number = MAX_REMINDER_DELAY_MS,
): DoseOccurrence[] {
  const from = Math.max(lastCheck.getTime() + 1, now.getTime() - maxDelayMs);
  const to = now.getTime() + 1;
  if (to <= from) return [];
  const due: DoseOccurrence[] = [];
  for (const schedule of schedules) {
    if (effectiveStatus(schedule, now) !== 'active') continue;
    for (const dose of doseOccurrences(schedule, new Date(from), new Date(to)).doses) {
      if (!fired.has(dose.key)) due.push(dose);
    }
  }
  return due.sort((a, b) => a.at - b.at);
}

/** DST-skipped dose times in the next `days` days, for a visible note. */
export function upcomingSkipped(schedule: MedicationSchedule, now: Date, days = 14): SkippedDose[] {
  if (effectiveStatus(schedule, now) !== 'active') return [];
  return doseOccurrences(schedule, now, new Date(now.getTime() + days * DAY)).skipped;
}

// ---------- Display helpers ----------

/** "today", "tomorrow" or e.g. "Mon, 9 Nov 2026", relative to the dose's own zone. */
export function formatDoseDay(dose: Pick<DoseOccurrence, 'date' | 'timezone' | 'at'>, now: Date): string {
  const today = todayIn(dose.timezone, now);
  if (dose.date === today) return 'today';
  if (dose.date === addDays(today, 1)) return 'tomorrow';
  return formatDate(dose.date);
}

/** "Mon, 9 Nov 2026" for a "YYYY-MM-DD" calendar date. */
export function formatDate(date: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(Date.UTC(...ymd(date))));
}

// ---------- Notifications ----------

export type ReminderPermission = 'unsupported' | 'default' | 'denied' | 'granted';

/** Maps the browser's Notification support and permission to the panel's state. */
export function mapNotificationPermission(env: {
  supported: boolean;
  secureContext: boolean;
  permission?: string;
}): ReminderPermission {
  if (!env.supported || !env.secureContext) return 'unsupported';
  if (env.permission === 'granted') return 'granted';
  if (env.permission === 'denied') return 'denied';
  return 'default';
}

export const PERMISSION_MESSAGES: Record<ReminderPermission, string> = {
  unsupported:
    'This browser cannot show system notifications here. In-page reminders still work while this page is open.',
  default: 'System notifications are off. In-page reminders work while this page is open.',
  denied:
    'Notifications are blocked for this site. To turn them on, open the site settings from the icon next to the address bar, allow notifications, then reload the page. In-page reminders still work while this page is open.',
  granted: 'System notifications are on while this page is open. They never show the medication name.',
};

export function canShowSystemNotification(permission: ReminderPermission): boolean {
  return permission === 'granted';
}

/** Lock-screen content: always generic, never the medication name, dose or time. */
export const SYSTEM_NOTIFICATION = Object.freeze({
  title: 'Medication reminder',
  body: 'Open the app to see the details',
  tag: 'medication-reminder',
});
