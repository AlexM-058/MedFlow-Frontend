import { normalizeText, parseDuration } from './scheduleLogic.ts';

/**
 * Deterministic consistency checks between what a prescription says and what the patient chose.
 * They only inform: nothing is corrected, blocked or invented, and the patient (or the doctor and
 * pharmacist) decides. No language model is involved.
 */

export interface DailyDose {
  /** How many times a day the medicine is taken, when the text says so. */
  intakesPerDay: number | null;
  /** How many units (tablets, sachets...) are taken in a whole day, when the text says so. */
  unitsPerDay: number | null;
}

const UNIT = '(?:cpr|cp|comprimate|comprimat|tablete|tableta|capsule|capsula|cps|plicuri|plic|pastile|pastila|picaturi)';
const WORD_COUNT: Record<string, number> = { 'o data': 1, doua: 2, trei: 3, patru: 4 };
const AS_NEEDED = /\bla nevoie\b|\bprn\b|\bdaca e nevoie\b|\bdaca este nevoie\b/;

function agree(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.every((value) => value === values[0]) ? (values[0] ?? null) : null;
}

/**
 * Reads a daily dose from the frequency text only when it is stated plainly:
 * "1-0-1" / "1.0.1" (slots), "de 2 ori pe zi", "1 la 12 ore", "2 cpr / zi", "1 cp dimineata".
 * Anything else, including as-needed text, gives null for that part. Conflicting readings of the
 * same text give null rather than a guess.
 */
export function parseDailyDose(text: string | null | undefined): DailyDose | null {
  if (!text) return null;
  const t = normalizeText(text);
  if (AS_NEEDED.test(t)) return null;

  const intakes: number[] = [];
  const units: number[] = [];

  const slots = /\b(\d)\s*[-–.]\s*(\d)\s*[-–.]\s*(\d)(?:\s*[-–.]\s*(\d))?\b/.exec(t);
  if (slots) {
    const values = slots.slice(1).filter((item): item is string => item !== undefined).map(Number);
    intakes.push(values.filter((value) => value > 0).length);
    units.push(values.reduce((sum, value) => sum + value, 0));
  }

  const times = /(?:^|\s)(?:de\s+)?(\d)\s*(?:x|ori)\s*(?:\/\s*zi|pe\s+zi|zilnic)\b/.exec(t);
  if (times?.[1]) intakes.push(Number(times[1]));
  const worded = /(?:^|\s)(?:de\s+)?(o data|doua|trei|patru)\s*(?:ori\s*)?(?:\/\s*zi|pe\s+zi|zilnic)\b/.exec(t);
  if (worded?.[1]) intakes.push(WORD_COUNT[worded[1]] ?? 0);

  const everyHours = /\bla\s+(\d{1,2})\s*(?:h|ore)\b/.exec(t);
  if (everyHours?.[1]) {
    const hours = Number(everyHours[1]);
    if (hours >= 4 && hours <= 24 && 24 % hours === 0) intakes.push(24 / hours);
  }

  const perDay = new RegExp(`(?:^|\\s)(\\d)\\s*${UNIT}\\.?\\s*(?:\\/\\s*zi|pe\\s+zi|zilnic)\\b`).exec(t);
  if (perDay?.[1]) units.push(Number(perDay[1]));

  const timeOfDay = new RegExp(`(?:^|\\s)(\\d)\\s*${UNIT}\\.?\\s*(?:dimineata|seara|pranz|la culcare|noaptea)\\b`).exec(t);
  if (timeOfDay?.[1]) { intakes.push(1); units.push(Number(timeOfDay[1])); }
  if (/\bdimineata\b.*\bseara\b/.test(t) && !timeOfDay) intakes.push(2);

  let intakesPerDay = agree(intakes.filter((value) => value > 0));
  const unitsPerDay = agree(units.filter((value) => value > 0));
  // One unit a day can only be taken once (halves are not interpreted).
  if (intakesPerDay === null && unitsPerDay === 1 && intakes.length === 0) intakesPerDay = 1;
  if (intakesPerDay === null && unitsPerDay === null) return null;
  return { intakesPerDay, unitsPerDay };
}

export interface CoherenceInput {
  /** The prescription's own words about how often, unchanged. */
  frequencyText: string | null;
  durationText: string | null;
  /** Units dispensed or prescribed, when the document says so. */
  quantity: number | null;
  /** How many times of day the patient has entered so far (null while none). */
  chosenTimes: number | null;
}

export interface CoherenceWarning {
  code: 'times_differ' | 'quantity_short';
  message: string;
}

const administrations = (count: number) => (count === 1 ? 'o administrare' : `${count} administrări`);
const hours = (count: number) => (count === 1 ? 'o singură oră' : `${count} ore`);

export function coherenceWarnings(input: CoherenceInput): CoherenceWarning[] {
  const warnings: CoherenceWarning[] = [];
  const dose = parseDailyDose(input.frequencyText);
  if (!dose) return warnings;

  if (dose.intakesPerDay !== null && input.chosenTimes !== null && input.chosenTimes > 0 && input.chosenTimes !== dose.intakesPerDay) {
    warnings.push({
      code: 'times_differ',
      message: `Rețeta indică ${administrations(dose.intakesPerDay)} pe zi, iar dumneavoastră ați ales ${hours(input.chosenTimes)}. Verificați cu medicul sau cu farmacistul înainte să salvați.`,
    });
  }

  const days = parseDuration(input.durationText)?.days ?? null;
  if (dose.unitsPerDay !== null && days !== null && input.quantity !== null && Number.isFinite(input.quantity)) {
    const needed = dose.unitsPerDay * days;
    // A larger quantity is normal (boxes come in fixed sizes); only a shortfall is worth a note.
    if (input.quantity < needed) {
      warnings.push({
        code: 'quantity_short',
        message: `Cantitatea (${input.quantity}) este mai mică decât necesarul din rețetă (${dose.unitsPerDay} pe zi × ${days} zile = ${needed}). Este posibil să nu ajungă pentru toată durata.`,
      });
    }
  }
  return warnings;
}
