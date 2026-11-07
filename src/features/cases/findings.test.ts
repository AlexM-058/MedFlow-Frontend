import { countFindings, describeReading, EMPTY_FINDINGS, mergeFindings, readFindings } from './findings.ts';

const failures: string[] = [];
let passed = 0;
function check(name: string, ok: boolean) {
  if (ok) passed++;
  else failures.push(name);
}

const data = {
  medications: [{ name: 'Amlodipină', dose: '5 mg', frequency: 'zilnic', duration: null }, { name: null, dose: '1 mg', frequency: null, duration: null }],
  diagnoses: ['Hipertensiune arterială', '  ', 5],
  lab_results: [{ test: 'Glicemie', value: '130', unit: 'mg/dL', reference_range: '70 - 110' }, { test: null, value: '5' }, 'x'],
  allergies: ['penicilină'],
  observations: [{ label: 'Puls', value: '72 bătăi/min' }, { label: 'Puls', value: null }, { label: null, value: 'x' }],
  dates: [{ label: 'Data', value: '14.03.2025' }],
  warnings: [],
};

const found = readFindings(data);
check('only medicines with a name count', found.medications === 1);
check('blank or non-text diagnoses are skipped', found.diagnoses.length === 1 && found.diagnoses[0] === 'Hipertensiune arterială');
check('a lab result needs a test name; the rest is kept as text', found.labs.length === 1 && found.labs[0]?.value === '130' && found.labs[0]?.range === '70 - 110');
check('allergies are read', found.allergies.length === 1 && found.allergies[0] === 'penicilină');
check('an observation needs both label and value', found.observations.length === 1 && found.observations[0]?.label === 'Puls');
check('dates alone are not data', countFindings(found) === 5 && countFindings(readFindings({ medications: [], dates: [{ label: 'Data', value: '1.1.2025' }] })) === 0);

check('a failed reading, null and junk give nothing', [null, undefined, 'x', 5, [], { extraction_status: 'unavailable', error: 'x' }].every((value) => countFindings(readFindings(value)) === 0));
check('a service version without the new fields still works', countFindings(readFindings({ medications: [{ name: 'X' }], diagnoses: [], lab_results: [] })) === 1);

check('a sheet with data is described by what it holds', describeReading(found) === 'Am găsit: 1 medicament, 1 diagnostic, 1 analiză, 1 alergie, 1 observație.');
check('plurals are right', describeReading({ ...EMPTY_FINDINGS, medications: 4, labs: [found.labs[0]!, found.labs[0]!], diagnoses: ['a', 'b'] }) === 'Am găsit: 4 medicamente, 2 diagnostice, 2 analize.');
check('an unreadable sheet says so, it is never shown as read', describeReading(EMPTY_FINDINGS) === 'Nu am găsit date în această foaie. Încercați o poză mai clară.');

// Several sheets: the same finding appears once; medicines are counted per sheet.
const second = readFindings({ medications: [{ name: 'Metformin' }], diagnoses: ['hipertensiune ARTERIALĂ'], lab_results: [{ test: 'Glicemie', value: '130', unit: 'mg/dL' }, { test: 'Glicemie', value: '90', unit: 'mg/dL' }], allergies: ['Penicilina'] });
const merged = mergeFindings([found, second]);
check('the same diagnosis (case and diacritics aside) appears once', merged.diagnoses.length === 1);
check('the same lab value once, a different value of the same test kept', merged.labs.length === 2);
check('the same allergy once', merged.allergies.length === 1);
check('medicines are summed per sheet', merged.medications === 2);
check('merging nothing gives nothing', countFindings(mergeFindings([])) === 0);

console.log(`${passed} passed, ${failures.length} failed`);
if (failures.length > 0) throw new Error(`Failed: ${failures.join('; ')}`);
