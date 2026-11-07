import { buildReviewFields, canConfirm, confirmAllReadable, editField, markNotPresent, missingFields, resetField, toReviewedFields } from './prescriptionReviewLogic.ts';
import type { ExtractedDocument } from '../care-scenario/contracts.ts';

const failures: string[] = [];
let passed = 0;
function check(name: string, ok: boolean) {
  if (ok) passed++;
  else failures.push(name);
}

const document = (medications: { name: string | null; dose: string | null; frequency: string | null; duration: string | null }[]): ExtractedDocument => ({
  id: 'doc-1', documentType: 'prescription', fileName: 'x.png', medications, dates: [], warnings: [], sourceQuotes: {}, extractedAt: '2026-11-07T09:00:00Z',
});
const at = '2026-11-07T10:00:00Z';

// Everything that was read becomes confirmed; the absent duration still needs a decision.
const fields = buildReviewFields(document([{ name: 'Amlodipină', dose: '5 mg', frequency: 'zilnic', duration: null }]));
const all = confirmAllReadable(fields, at);
check('the three read fields are confirmed as extracted', all.filter((field) => field.resolution.kind === 'confirmed').length === 3
  && all.every((field) => field.resolution.kind !== 'confirmed' || (field.resolution.edited === false && field.resolution.value === field.extracted)));
check('the absent duration is NOT decided for the patient', all[3]?.resolution.kind === 'pending' && !canConfirm(all));
check('what is missing is exactly the duration', missingFields(all).map((item) => item.label).join() === 'Durată');
const done = confirmAllReadable(fields, at).map((field) => field);
const withDuration = markNotPresent(done, 'medications.0.duration', at);
check('after declaring the duration absent the prescription can be confirmed', withDuration.ok && canConfirm(withDuration.fields));
check('the review sent to the server carries the reader text and the patient confirmation', withDuration.ok
  && toReviewedFields(withDuration.fields).every((field) => field.confirmation.status === 'confirmed' && field.confirmation.by === 'patient'));

// An unreadable field is never confirmed on the patient's behalf.
const unreadable = confirmAllReadable(buildReviewFields(document([{ name: 'Aspirină', dose: null, frequency: 'zilnic', duration: '7 zile' }])), at);
check('an unreadable dose stays pending', unreadable[1]?.resolution.kind === 'pending' && unreadable[1]?.extracted === null);
check('a prescription with an unreadable dose cannot be confirmed yet', !canConfirm(unreadable));
const typed = editField(unreadable, 'medications.0.dose', '75 mg', at);
check('typing the dose from paper completes it', typed.ok && canConfirm(typed.fields));

// Decisions already taken are kept: a correction is not overwritten, a reset field is confirmed again from the reader text.
const corrected = editField(fields, 'medications.0.dose', '10 mg', at);
check('a correction is kept', corrected.ok && (() => {
  const result = confirmAllReadable(corrected.fields, at);
  const dose = result.find((field) => field.key === 'dose');
  return dose?.resolution.kind === 'confirmed' && dose.resolution.value === '10 mg' && dose.resolution.edited === true;
})());
const reset = resetField(all, 'medications.0.name');
check('a field sent back to pending is confirmed again from the reader text', reset.ok && confirmAllReadable(reset.fields, at)[0]?.resolution.kind === 'confirmed');

// Several medicines at once; nothing mutated.
const two = buildReviewFields(document([{ name: 'A', dose: '1 mg', frequency: 'zilnic', duration: '5 zile' }, { name: 'B', dose: '2 mg', frequency: 'seara', duration: '7 zile' }]));
const twoAll = confirmAllReadable(two, at);
check('every medicine is confirmed and the input is not mutated', canConfirm(twoAll) && two.every((field) => field.resolution.kind === 'pending'));

console.log(`${passed} passed, ${failures.length} failed`);
if (failures.length > 0) throw new Error(`Failed: ${failures.join('; ')}`);
