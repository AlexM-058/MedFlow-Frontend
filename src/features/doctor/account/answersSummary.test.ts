import { pairAnswers, type SummaryMessage } from './answersSummary.ts';

const failures: string[] = [];
let passed = 0;
function check(name: string, ok: boolean) {
  if (ok) passed++;
  else failures.push(name);
}

let counter = 0;
const message = (senderRole: string, content: string, minute: number): SummaryMessage =>
  ({ id: `m${++counter}`, senderRole, content, createdAt: `2026-11-07T10:${String(minute).padStart(2, '0')}:00Z` });

const thread = [
  message('patient', 'Am tuse de 3 zile.', 0),
  message('ai', 'Când au început simptomele?', 1),
  message('patient', 'Acum 3 zile.', 2),
  message('patient', 'Mai ales seara.', 3),
  message('ai', 'Ce medicamente luați?', 4),
  message('patient', 'Paracetamol.', 5),
  message('doctor', 'Vă rog să veniți luni.', 6),
  message('ai', 'Aveți alergii?', 7),
];

const summary = pairAnswers(thread);
check('what the patient wrote before any question is its own group', summary.groups[0]?.question === null && summary.groups[0]?.answers[0]?.text === 'Am tuse de 3 zile.');
check('each question gets the answers that follow it, in order', summary.groups[1]?.question === 'Când au început simptomele?' && summary.groups[1]?.answers.map((a) => a.text).join('|') === 'Acum 3 zile.|Mai ales seara.');
check('the next question starts a new group', summary.groups[2]?.question === 'Ce medicamente luați?' && summary.groups[2]?.answers.length === 1);
check('a doctor message is not an answer', !summary.groups.some((group) => group.answers.some((answer) => answer.text.includes('luni'))));
check('a question with no answer yet is counted', summary.unanswered === 1 && summary.groups[3]?.answers.length === 0);
check('answers are the patient text, unchanged', summary.groups[2]?.answers[0]?.text === 'Paracetamol.');

// Order does not depend on the order of the array.
const shuffled = pairAnswers([...thread].reverse());
check('the same result whatever the input order', JSON.stringify(shuffled) === JSON.stringify(summary));

// Notices: emergency messages added by the Backend are kept, never mixed into the answers.
const withNotice = pairAnswers([...thread, message('system', 'ATENȚIE: Simptomele raportate pot indica o urgență.', 8)]);
check('system notices are listed apart', withNotice.notices.length === 1 && withNotice.notices[0]?.text.startsWith('ATENȚIE') && withNotice.groups.length === summary.groups.length);

// Edge cases.
check('no messages gives nothing', pairAnswers([]).groups.length === 0 && pairAnswers([]).unanswered === 0);
check('blank messages are skipped', pairAnswers([message('ai', '   ', 0), message('patient', '', 1)]).groups.length === 0);
check('only questions: all unanswered', pairAnswers([message('ai', 'A?', 0), message('ai', 'B?', 1)]).unanswered === 2);
check('only patient messages: one group without a question and nothing unanswered', (() => {
  const s = pairAnswers([message('patient', 'Salut', 0), message('patient', 'Am dureri', 1)]);
  return s.groups.length === 1 && s.groups[0]?.question === null && s.unanswered === 0;
})());
check('an unknown role is ignored', pairAnswers([message('robot', 'x', 0)]).groups.length === 0);

console.log(`${passed} passed, ${failures.length} failed`);
if (failures.length > 0) throw new Error(`Failed: ${failures.join('; ')}`);
