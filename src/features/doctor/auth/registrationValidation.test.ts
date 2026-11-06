// Run from Frontend/:
//   node --experimental-strip-types --no-warnings src/features/doctor/auth/registrationValidation.test.ts
import { assertEqual, assertTrue, finish, test } from '../shared/testHarness.ts';
import {
  REGISTRATION_FIELD_ORDER,
  firstInvalidField,
  isValidPhone,
  validateLogin,
  validateRegistration,
  type RegistrationValues,
} from './registrationValidation.ts';

const MB = 1024 * 1024;

function valid(overrides: Partial<RegistrationValues> = {}): RegistrationValues {
  return {
    fullName: 'Dr. Test Example',
    email: 'test.doctor@clinic.example',
    phone: '+40 700 000 000',
    specialty: 'Family medicine',
    licenseNumber: 'RO-000000',
    institution: 'Synthetic Clinic',
    password: 'demo-pass-123',
    confirmPassword: 'demo-pass-123',
    credentialFile: { name: 'license.pdf', type: 'application/pdf', size: 200 * 1024 },
    ...overrides,
  };
}

test('valid registration has no errors', () => {
  assertEqual(validateRegistration(valid()), {});
});

test('empty form reports every required field', () => {
  const errors = validateRegistration({
    fullName: '  ',
    email: '',
    phone: '',
    specialty: '',
    licenseNumber: '',
    institution: '',
    password: '',
    confirmPassword: '',
    credentialFile: null,
  });
  assertEqual(Object.keys(errors).sort(), [...REGISTRATION_FIELD_ORDER].sort());
  assertEqual(firstInvalidField(errors, REGISTRATION_FIELD_ORDER), 'fullName');
});

test('email format is checked', () => {
  assertTrue(validateRegistration(valid({ email: 'not-an-email' })).email, 'invalid email');
  assertTrue(validateRegistration(valid({ email: 'a@b' })).email, 'missing domain dot');
  assertEqual(validateRegistration(valid({ email: ' ok@clinic.ro ' })).email, undefined);
});

test('phone is lenient but needs 8 digits and allowed characters', () => {
  assertTrue(isValidPhone('+40 712 345 678'));
  assertTrue(isValidPhone('0712 345 678'));
  assertTrue(!isValidPhone('1234 567'), 'only 7 digits');
  assertTrue(!isValidPhone('0712-345-678'), 'dashes not allowed');
  assertTrue(!isValidPhone('07a12345678'), 'letters not allowed');
  assertTrue(validateRegistration(valid({ phone: '123' })).phone, 'short phone error');
});

test('password needs at least 8 characters', () => {
  const errors = validateRegistration(valid({ password: 'short', confirmPassword: 'short' }));
  assertTrue(errors.password, 'short password');
  assertEqual(errors.confirmPassword, undefined);
});

test('password confirmation must match', () => {
  const errors = validateRegistration(valid({ confirmPassword: 'different-123' }));
  assertEqual(errors.confirmPassword, 'Parolele nu coincid.');
  assertEqual(firstInvalidField(errors, REGISTRATION_FIELD_ORDER), 'confirmPassword');
});

test('credential file is required', () => {
  assertTrue(validateRegistration(valid({ credentialFile: null })).credentialFile);
});

test('credential file type is checked', () => {
  const errors = validateRegistration(
    valid({ credentialFile: { name: 'notes.docx', type: 'application/msword', size: 1000 } }),
  );
  assertEqual(errors.credentialFile, 'Alegeți un fișier PDF, JPG sau PNG.');
  assertEqual(
    validateRegistration(valid({ credentialFile: { name: 'scan.JPG', type: 'image/jpeg', size: 1000 } })).credentialFile,
    undefined,
  );
});

test('credential file size is checked', () => {
  const big = validateRegistration(
    valid({ credentialFile: { name: 'scan.png', type: 'image/png', size: 10 * MB + 1 } }),
  );
  assertEqual(big.credentialFile, 'Fișierul depășește 10 MB.');
  const edge = validateRegistration(
    valid({ credentialFile: { name: 'scan.png', type: 'image/png', size: 10 * MB } }),
  );
  assertEqual(edge.credentialFile, undefined);
  const empty = validateRegistration(valid({ credentialFile: { name: 'scan.png', type: 'image/png', size: 0 } }));
  assertEqual(empty.credentialFile, 'Fișierul selectat este gol.');
});

test('login requires email and password, checks email format', () => {
  assertEqual(Object.keys(validateLogin({ email: '', password: '' })), ['email', 'password']);
  assertTrue(validateLogin({ email: 'doctor', password: 'x' }).email);
  assertEqual(validateLogin({ email: 'doctor@clinic.com', password: 'x' }), {});
});

finish();
