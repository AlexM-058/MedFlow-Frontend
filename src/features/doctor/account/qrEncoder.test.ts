// Run: node --experimental-strip-types --no-warnings src/features/doctor/account/qrEncoder.test.ts
import { assertEqual, assertTrue, finish, test } from '../shared/testHarness.ts';
import { encodeQrModules, qrMatrixToSvg } from './qrEncoder.ts';

const CONNECTION_URL = 'https://app.medflow.example/#/connect/synthetic_doctor_code_1234';

test('encodes a connection link into a square boolean QR module matrix', () => {
  const matrix = encodeQrModules(CONNECTION_URL);
  assertTrue(matrix);
  if (!matrix) return;
  assertTrue(matrix.length >= 21 && matrix.length <= 177);
  assertEqual((matrix.length - 21) % 4, 0, 'valid QR version size');
  assertTrue(matrix.every((row) => row.length === matrix.length));
  assertTrue(matrix.every((row) => row.every((module) => typeof module === 'boolean')));
  // The first finder pattern begins at the first module: the encoder adds no border.
  assertEqual(matrix[0].slice(0, 7), [true, true, true, true, true, true, true]);
});

test('encodes both smallest and largest supported opaque connection-code lengths', () => {
  for (const length of [16, 256]) {
    assertTrue(encodeQrModules(`https://app.medflow.example/#/connect/${'a'.repeat(length)}`));
  }
});

test('returns a safe failure for empty or oversized data', () => {
  assertEqual(encodeQrModules(''), null);
  assertEqual(encodeQrModules('   '), null);
  assertEqual(encodeQrModules('x'.repeat(10000)), null);
});

test('SVG has a four-module quiet zone and fixed scanner-safe colors', () => {
  const matrix = encodeQrModules(CONNECTION_URL);
  assertTrue(matrix);
  if (!matrix) return;
  const svg = qrMatrixToSvg(matrix);
  assertTrue(svg.includes(`viewBox="0 0 ${matrix.length + 8} ${matrix.length + 8}"`));
  assertTrue(svg.includes('fill="#ffffff"'));
  assertTrue(svg.includes('fill="#000000"'));
  assertTrue(!svg.includes(CONNECTION_URL), 'payload is encoded in modules, not SVG text');
});

finish();
