import { formatDoseDay as formatDoseDayEn } from './scheduleLogic';

export function formatDoseDay(...args: Parameters<typeof formatDoseDayEn>): string {
  const day = formatDoseDayEn(...args);
  return day === 'today' ? 'astăzi' : day === 'tomorrow' ? 'mâine' : day;
}
