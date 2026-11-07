import { extractConnectCode, journeyStage } from './journeyLogic.ts';

const assert = {
  equal(actual: unknown, expected: unknown) {
    if (actual !== expected) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  },
};

assert.equal(journeyStage({ doctorCount: 0 }), 'connect');
assert.equal(journeyStage({ doctorCount: 0, step: 'chat' }), 'connect'); // no doctor: nothing else is possible
// Once a doctor is connected the journey starts at the prescription and moves where the patient chooses.
assert.equal(journeyStage({ doctorCount: 1 }), 'prescription');
assert.equal(journeyStage({ doctorCount: 1, step: 'prescription' }), 'prescription');
assert.equal(journeyStage({ doctorCount: 3, step: 'documents' }), 'documents');
assert.equal(journeyStage({ doctorCount: 1, step: 'chat' }), 'chat');

const code = 'synthetic_doctor_code_1234';
assert.equal(extractConnectCode(code), code);
assert.equal(extractConnectCode(`  ${code}\n`), code);
assert.equal(extractConnectCode(`https://app.example/#/connect/${code}`), code);
assert.equal(extractConnectCode(`https://app.example/#/connect/${code}/`), code);
for (const bad of ['', 'short', 'https://evil.example/x', `/connect/${code}/extra`, '../../admin', `${code}?next=/admin`]) {
  assert.equal(extractConnectCode(bad), null);
}
console.log('journeyLogic: ok');
