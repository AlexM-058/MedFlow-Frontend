// Run: node --experimental-strip-types --no-warnings src/features/doctor-feedback/feedbackLogic.test.ts
// Synthetic data only.
import type { DoctorFeedback } from '../care-scenario/contracts.ts';
import { assertEqual, assertTrue, finish, test } from '../connections/testHarness.ts';
import { attributionLabel, buildPatientFeedbackView } from './feedbackLogic.ts';

const feedback: DoctorFeedback = {
  id: 'f1',
  caseId: 'c1',
  doctor: { id: 'doc-1', fullName: 'Dr. Demo' },
  text: '  Keep taking amlodipine 5 mg as prescribed.\nCall the clinic if the dizziness gets worse.',
  createdAt: '2026-11-07T13:30:00Z',
  basedOnVariant: 2,
};

test('pending when the doctor has not answered', () => {
  assertEqual(buildPatientFeedbackView(null), { state: 'pending' });
});

test('answered view keeps the exact text and attribution', () => {
  const view = buildPatientFeedbackView(feedback);
  assertTrue(view.state === 'answered');
  if (view.state !== 'answered') return;
  assertEqual(view.text, feedback.text, 'text is not trimmed or reworded');
  assertEqual(view.doctorName, 'Dr. Demo');
  assertEqual(attributionLabel(view.doctorName), 'Dr. Demo said:');
  assertEqual(view.timeLabel, '07 Nov 2026, 15:30');
});

test('patient view contains only feedback fields, even from a wider object', () => {
  const wider = {
    ...feedback,
    summary: { items: [{ text: 'AI summary text' }] },
    variants: { options: [{ option: 'AI variant text' }] },
    reasoning: 'AI reasoning',
  } as unknown as DoctorFeedback;
  const view = buildPatientFeedbackView(wider);
  assertEqual(Object.keys(view).sort(), ['createdAt', 'doctorName', 'state', 'text', 'timeLabel']);
  const serialized = JSON.stringify(view);
  for (const leaked of ['AI summary text', 'AI variant text', 'AI reasoning', 'basedOnVariant', 'summary', 'variants']) {
    assertTrue(!serialized.includes(leaked), `patient view must not contain ${leaked}`);
  }
});

finish();
