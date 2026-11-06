// Date labels for the doctor UI, computed from real timestamps (never sorted by label).
import { DEMO_TIME_ZONE } from './fixtures.ts';

const dayKeyFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: DEMO_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const timeFormat = new Intl.DateTimeFormat('ro-RO', {
  timeZone: DEMO_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const dateFormat = new Intl.DateTimeFormat('ro-RO', {
  timeZone: DEMO_TIME_ZONE,
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

/** YYYY-MM-DD of an instant in the demo time zone. */
export function dayKey(instant: Date): string {
  return dayKeyFormat.format(instant);
}

function dayDifference(fromKey: string, toKey: string): number {
  const from = Date.parse(`${fromKey}T00:00:00Z`);
  const to = Date.parse(`${toKey}T00:00:00Z`);
  return Math.round((to - from) / 86_400_000);
}

/** "Astăzi, 09:42" | "Ieri" | "04 nov. 2026" */
export function formatLastContact(iso: string, now: Date): string {
  const instant = new Date(iso);
  const diff = dayDifference(dayKey(instant), dayKey(now));
  if (diff === 0) return `Astăzi, ${timeFormat.format(instant)}`;
  if (diff === 1) return 'Ieri';
  return dateFormat.format(instant);
}

/** "Astăzi" | "Mâine" | "09 nov. 2026" for a YYYY-MM-DD follow-up date. */
export function formatFollowUp(dateOnly: string, now: Date): string {
  const diff = dayDifference(dayKey(now), dateOnly);
  if (diff === 0) return 'Astăzi';
  if (diff === 1) return 'Mâine';
  return dateFormat.format(new Date(`${dateOnly}T12:00:00Z`));
}
