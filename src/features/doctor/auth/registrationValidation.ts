// Pure, framework-free validation for the doctor login and registration forms.
// No React or CSS imports: this module also runs under Node for tests.
// Values are only checked locally; nothing is sent, stored or logged.
import { CREDENTIAL_FILE_RULE, validateFile } from '../shared/files.ts';

export interface LoginValues {
  email: string;
  password: string;
}

export type LoginField = keyof LoginValues;
export type LoginErrors = Partial<Record<LoginField, string>>;

export interface CredentialFileInfo {
  name: string;
  type: string;
  size: number;
}

export interface RegistrationValues {
  fullName: string;
  email: string;
  phone: string;
  specialty: string;
  licenseNumber: string;
  institution: string;
  password: string;
  confirmPassword: string;
  credentialFile: CredentialFileInfo | null;
}

export type RegistrationField = keyof RegistrationValues;
export type RegistrationErrors = Partial<Record<RegistrationField, string>>;

/** Field order used to focus the first invalid control. */
export const LOGIN_FIELD_ORDER: readonly LoginField[] = ['email', 'password'];

export const REGISTRATION_FIELD_ORDER: readonly RegistrationField[] = [
  'fullName',
  'email',
  'phone',
  'specialty',
  'licenseNumber',
  'institution',
  'password',
  'confirmPassword',
  'credentialFile',
];

/** Synthetic specialty options for the demo form. */
export const SPECIALTY_OPTIONS: readonly string[] = [
  'Medicină de familie',
  'Medicină internă',
  'Cardiologie',
  'Pediatrie',
  'Dermatologie',
  'Altă specialitate',
];

export const PASSWORD_MIN_LENGTH = 8;
export const PHONE_MIN_DIGITS = 8;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_ALLOWED = /^\+?[\d\s]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}

/** Lenient: digits and spaces, optional leading +, at least 8 digits. */
export function isValidPhone(value: string): boolean {
  const trimmed = value.trim();
  if (!PHONE_ALLOWED.test(trimmed)) return false;
  return trimmed.replace(/\D/g, '').length >= PHONE_MIN_DIGITS;
}

function emailError(value: string): string | undefined {
  if (!value.trim()) return 'Introduceți adresa de e-mail de serviciu.';
  if (!isValidEmail(value)) return 'Introduceți o adresă de e-mail de forma nume@clinica.ro.';
  return undefined;
}

export function validateLogin(values: LoginValues): LoginErrors {
  const errors: LoginErrors = {};
  const email = emailError(values.email);
  if (email) errors.email = email;
  if (!values.password) errors.password = 'Introduceți parola.';
  return errors;
}

export function validateRegistration(values: RegistrationValues): RegistrationErrors {
  const errors: RegistrationErrors = {};

  if (!values.fullName.trim()) errors.fullName = 'Introduceți numele complet.';

  const email = emailError(values.email);
  if (email) errors.email = email;

  if (!values.phone.trim()) {
    errors.phone = 'Introduceți numărul de telefon.';
  } else if (!isValidPhone(values.phone)) {
    errors.phone = `Introduceți un număr de telefon cu cel puțin ${PHONE_MIN_DIGITS} cifre (doar cifre, spații și +).`;
  }

  if (!values.specialty) errors.specialty = 'Selectați specialitatea.';
  if (!values.licenseNumber.trim()) errors.licenseNumber = 'Introduceți numărul de înregistrare profesională.';
  if (!values.institution.trim()) errors.institution = 'Introduceți clinica sau spitalul.';

  if (!values.password) {
    errors.password = 'Creați o parolă.';
  } else if (values.password.length < PASSWORD_MIN_LENGTH) {
    errors.password = `Folosiți cel puțin ${PASSWORD_MIN_LENGTH} caractere.`;
  }

  if (!values.confirmPassword) {
    errors.confirmPassword = 'Introduceți din nou parola.';
  } else if (values.password !== values.confirmPassword) {
    errors.confirmPassword = 'Parolele nu coincid.';
  }

  if (!values.credentialFile) {
    errors.credentialFile = 'Atașați dovada calității de medic (certificat sau drept de liberă practică).';
  } else {
    const fileError = validateFile(values.credentialFile, CREDENTIAL_FILE_RULE);
    if (fileError) errors.credentialFile = fileError;
  }

  return errors;
}

/** First field (in display order) that has an error, or null. */
export function firstInvalidField<F extends string>(
  errors: Partial<Record<F, string>>,
  order: readonly F[],
): F | null {
  return order.find((field) => Boolean(errors[field])) ?? null;
}
