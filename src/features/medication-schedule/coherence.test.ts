import { coherenceWarnings, parseDailyDose } from './coherence.ts';

const assert = {
  equal(actual: unknown, expected: unknown) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  },
};

// Slot notation, as a pharmacist writes on the box: intakes = non-zero slots, units = their sum.
assert.equal(parseDailyDose('1-0-1'), { intakesPerDay: 2, unitsPerDay: 2 });
assert.equal(parseDailyDose('1 - 0 - 1'), { intakesPerDay: 2, unitsPerDay: 2 });
assert.equal(parseDailyDose('1.0.1'), { intakesPerDay: 2, unitsPerDay: 2 });
assert.equal(parseDailyDose('1-1-1'), { intakesPerDay: 3, unitsPerDay: 3 });
assert.equal(parseDailyDose('2-0-2'), { intakesPerDay: 2, unitsPerDay: 4 });
assert.equal(parseDailyDose('1-0-0-1'), { intakesPerDay: 2, unitsPerDay: 2 });

// Plain-language forms.
assert.equal(parseDailyDose('de 2 ori pe zi'), { intakesPerDay: 2, unitsPerDay: null });
assert.equal(parseDailyDose('de doua ori pe zi'), { intakesPerDay: 2, unitsPerDay: null });
assert.equal(parseDailyDose('de trei ori/zi'), { intakesPerDay: 3, unitsPerDay: null });
assert.equal(parseDailyDose('o data pe zi'), { intakesPerDay: 1, unitsPerDay: null });
assert.equal(parseDailyDose('1 cp la 8 ore'), { intakesPerDay: 3, unitsPerDay: null });
assert.equal(parseDailyDose('2 cpr / zi'), { intakesPerDay: null, unitsPerDay: 2 });
assert.equal(parseDailyDose('1 cpr / zi'), { intakesPerDay: 1, unitsPerDay: 1 });
assert.equal(parseDailyDose('1 cp dimineata'), { intakesPerDay: 1, unitsPerDay: 1 });
assert.equal(parseDailyDose('1 cpr seara'), { intakesPerDay: 1, unitsPerDay: 1 });

// Several readings of one text must agree, otherwise nothing is claimed for that part.
assert.equal(parseDailyDose('2 cpr. / zi (1 la 12h)'), { intakesPerDay: 2, unitsPerDay: 2 });
assert.equal(parseDailyDose('de 2 ori pe zi, la 8 ore'), null);

// Not stated plainly, as-needed, or not a dose: no claim.
for (const text of ['la nevoie', '1 cp la nevoie', 'PRN', '2 cpr / zi, la nevoie', 'dupa masa', 'o data pe saptamana', '07.11.2026', '', null, undefined, 'la 5 ore', 'la 7 ore']) {
  assert.equal(parseDailyDose(text as string | null | undefined), null);
}

// The patient chose a different number of times than the prescription says.
const twice = { frequencyText: '1-0-1', durationText: '7 zile', quantity: null };
assert.equal(coherenceWarnings({ ...twice, chosenTimes: 2 }), []);
assert.equal(coherenceWarnings({ ...twice, chosenTimes: null }), []);
assert.equal(coherenceWarnings({ ...twice, chosenTimes: 0 }), []);
assert.equal(coherenceWarnings({ ...twice, chosenTimes: 1 }).map((w) => w.code), ['times_differ']);
assert.equal(coherenceWarnings({ ...twice, chosenTimes: 3 }).map((w) => w.code), ['times_differ']);
assert.equal(coherenceWarnings({ ...twice, chosenTimes: 1 })[0]?.message.includes('2 administrări'), true);
assert.equal(coherenceWarnings({ ...twice, chosenTimes: 1 })[0]?.message.includes('o singură oră'), true);

// No claim from the text means no warning.
assert.equal(coherenceWarnings({ frequencyText: 'la nevoie', durationText: '7 zile', quantity: 3, chosenTimes: 1 }), []);
assert.equal(coherenceWarnings({ frequencyText: null, durationText: null, quantity: null, chosenTimes: 2 }), []);

// Quantity: only a shortfall is flagged (the pasted example: 2 per day x 7 days = 14).
const course = { frequencyText: '2 cpr. / zi', durationText: '7 zile', chosenTimes: null };
assert.equal(coherenceWarnings({ ...course, quantity: 14 }), []);
assert.equal(coherenceWarnings({ ...course, quantity: 20 }), []);
assert.equal(coherenceWarnings({ ...course, quantity: 10 }).map((w) => w.code), ['quantity_short']);
assert.equal(coherenceWarnings({ ...course, quantity: 10 })[0]?.message.includes('2 pe zi × 7 zile = 14'), true);
// Unclear duration or unknown quantity: nothing to compare.
assert.equal(coherenceWarnings({ ...course, durationText: 'o luna', quantity: 1 }), []);
assert.equal(coherenceWarnings({ ...course, quantity: null }), []);

console.log('coherence: ok');
