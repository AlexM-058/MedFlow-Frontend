// Device time zone and locale; invalid server dates are omitted rather than guessed.
const DATE = new Intl.DateTimeFormat('ro-RO', { dateStyle: 'medium', timeStyle: 'short' });
const TIME = new Intl.DateTimeFormat('ro-RO', { timeStyle: 'short' });

export function formatRequestDate(iso: string): string | null {
  const time = Date.parse(iso);
  return Number.isNaN(time) ? null : DATE.format(time);
}

export function formatUpdatedAt(time: number): string {
  return TIME.format(time);
}
