import { callbackPath, decodeReturn, encodeReturn, isOpaqueCode, safeDestination } from './navigation.ts';

const assert = {
  equal(actual: unknown, expected: unknown) {
    if (actual !== expected) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  },
};

const code = 'synthetic_doctor_code_1234';
for (const route of ['/patient', '/doctor', `/connect/${code}`, `/doctor/invite/${code}`]) {
  assert.equal(safeDestination(route), route);
  assert.equal(decodeReturn(encodeReturn(route, 1000), 2000), route);
}
for (const route of ['https://evil.example', '//evil.example', '/\\evil.example', '/patient?next=https://evil.example', '/demo/doctor', '/connect/short', '/doctor/invite/%2F%2Fevil', '/connect/valid_code_12345678/extra', null, {}]) {
  assert.equal(safeDestination(route), '/patient');
}
assert.equal(decodeReturn(encodeReturn('/doctor', 1000), 1000 + 15 * 60 * 1000 + 1), '/patient');
assert.equal(decodeReturn(encodeReturn('/doctor', 2000), 1000), '/patient');
assert.equal(decodeReturn('{invalid', 1000), '/patient');
assert.equal(decodeReturn(JSON.stringify({ destination: '/doctor', createdAt: '1000' }), 2000), '/patient');
assert.equal(isOpaqueCode('a'.repeat(16)), true);
assert.equal(isOpaqueCode('a'.repeat(256)), true);
assert.equal(isOpaqueCode('a'.repeat(257)), false);
assert.equal(isOpaqueCode('code/with/unsafe/path'), false);
assert.equal(callbackPath('/'), '/auth/callback');
assert.equal(callbackPath('/medflow/'), '/medflow/auth/callback');
console.log('Auth navigation checks passed: allowlist, token format, expiry and callback paths.');
