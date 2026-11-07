import { extractConnectCode, journeyStage } from './journeyLogic.ts';

const assert = {
  equal(actual: unknown, expected: unknown) {
    if (actual !== expected) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  },
};

assert.equal(journeyStage({ doctorCount: 0, confirmedMedicationCount: 0 }), 'connect');
// A confirmed prescription alone never opens the chat: there must be a doctor to receive it.
assert.equal(journeyStage({ doctorCount: 0, confirmedMedicationCount: 2 }), 'connect');
assert.equal(journeyStage({ doctorCount: 1, confirmedMedicationCount: 0 }), 'prescription');
assert.equal(journeyStage({ doctorCount: 1, confirmedMedicationCount: 1 }), 'chat');

const code = 'synthetic_doctor_code_1234';
assert.equal(extractConnectCode(code), code);
assert.equal(extractConnectCode(`  ${code}\n`), code);
assert.equal(extractConnectCode(`https://app.example/#/connect/${code}`), code);
assert.equal(extractConnectCode(`https://app.example/#/connect/${code}/`), code);
for (const bad of ['', 'short', 'https://evil.example/x', `/connect/${code}/extra`, '../../admin', `${code}?next=/admin`]) {
  assert.equal(extractConnectCode(bad), null);
}
console.log('journeyLogic: ok');
