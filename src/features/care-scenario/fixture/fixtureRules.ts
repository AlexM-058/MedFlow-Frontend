// Deterministic text rules used by the fixture scenario (no LLM, no inference of
// diagnoses, drug classes or interactions). Pure functions, safe for Node tests.

/** Lowercase, remove diacritics (ă â î ș ț and cedilla forms) and normalise apostrophes. */
export function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[‘’]/g, "'")
    .toLowerCase();
}

// Emergency phrases (RO + EN). Matched on normalised text, so "durere în piept"
// and "durere in piept" are the same rule. This is a safety rule, not LLM text.
const RED_FLAG_PATTERNS: RegExp[] = [
  /\bdurer[ei] (?:puternica |puternice |mare |mari )?(?:in|de|la) piept\b/,
  /\bma doare (?:in )?piept/,
  /\bchest pain\b/,
  /\bpain in (?:my|the) chest\b/,
  /\bnu (?:mai )?pot (?:sa )?respir/,
  /\bcan(?:not|'t) breathe\b/,
  /\bdifficulty breathing\b/,
  /\bshortness of breath\b/,
  /\bparaliz/,
  /\bparalysis\b/,
  /\bslurred speech\b/,
  /\bnu (?:mai )?pot (?:sa )?vorbesc\b/,
  /\bvorbesc (?:greu|neclar|incurcat)\b/,
  /\bsinucid/,
  /\bsuicid/,
  /\bvreau sa mor\b/,
  /\bsa-mi iau viata\b/,
  /\bkill myself\b/,
  /\bend my life\b/,
  /\bwant to die\b/,
];

export const RED_FLAG_MESSAGE =
  'Mesajul dumneavoastră poate descrie o urgență. Sunați acum la 112 sau mergeți la cea mai apropiată unitate de primiri urgențe. ' +
  'Acest chat nu poate ajuta într-o urgență. Mesajul dumneavoastră a fost salvat pentru medicul dumneavoastră.';

export function matchesRedFlag(text: string): boolean {
  const normalized = normalizeText(text);
  return RED_FLAG_PATTERNS.some((pattern) => pattern.test(normalized));
}

// Symptom and timing keywords (RO + EN) used only to decide which patient messages
// the fixture summary cites. Messages that match nothing stay uncited on purpose.
const SUMMARY_PATTERN = new RegExp(
  '\\b(?:' +
    [
      // RO symptoms (stems)
      'dur', 'doare', 'ma doare', 'febr', 'temperatur', 'tus', 'great', 'vom', 'amete', 'obos', 'cap', 'gat',
      'respir', 'palpitati', 'umfl', 'eruptie', 'mancarim', 'frisoan', 'diaree', 'insomni', 'tensiune',
      'simpt', 'piept',
      // RO timing
      'ieri', 'azi', 'astazi', 'alaltaieri', 'zi', 'zile', 'saptaman', 'luna', 'dimineat', 'sear', 'noapte',
      'ore', 'ora', 'de cand', 'incepand',
      // EN symptoms
      'pain', 'ache', 'hurt', 'fever', 'temperature', 'cough', 'nause', 'vomit', 'dizz', 'tired', 'fatigue',
      'headache', 'throat', 'breath', 'palpitation', 'swell', 'rash', 'itch', 'chill', 'diarrh', 'insomnia',
      'blood pressure', 'symptom', 'chest',
      // EN timing
      'since', 'yesterday', 'today', 'day', 'days', 'week', 'month', 'morning', 'evening', 'night', 'hour',
      'hours', 'started',
    ].join('|') +
    ')|\\b\\d+\\s*/\\s*10\\b',
);

const NEGATION_PATTERN = /(?:^|[^a-z'-])(?:nu|n-am|n-a|n-au|fara|niciodata|no|not|never|without|don't|didn't|doesn't|haven't)(?![a-z'-])/;
const UNCERTAINTY_PATTERN = /\b(?:poate|cred|parca|nu sunt sigur[a]?|maybe|perhaps|not sure|i think|probably)\b/;

export function matchesSummaryKeyword(text: string): boolean {
  return SUMMARY_PATTERN.test(normalizeText(text));
}

export function hasNegation(text: string): boolean {
  return NEGATION_PATTERN.test(normalizeText(text));
}

export function hasUncertainty(text: string): boolean {
  return UNCERTAINTY_PATTERN.test(normalizeText(text));
}
