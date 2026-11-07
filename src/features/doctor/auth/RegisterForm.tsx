import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { CREDENTIAL_FILE_RULE, acceptAttribute, formatFileSize, validateFile } from '../shared/files';
import { FieldShell, PasswordField, TextField } from './AuthField';
import {
  PASSWORD_MIN_LENGTH,
  REGISTRATION_FIELD_ORDER,
  SPECIALTY_OPTIONS,
  firstInvalidField,
  validateRegistration,
  type CredentialFileInfo,
  type RegistrationErrors,
  type RegistrationField,
  type RegistrationValues,
} from './registrationValidation';

interface RegisterFormProps {
  headingId: string;
  onLogin: () => void;
}

type TextValues = Omit<RegistrationValues, 'credentialFile'>;

const EMPTY_VALUES: TextValues = {
  fullName: '',
  email: '',
  phone: '',
  specialty: '',
  licenseNumber: '',
  institution: '',
  password: '',
  confirmPassword: '',
};

/** Non-sensitive details echoed back in the demo "pending verification" state. */
interface PendingSummary {
  fullName: string;
  email: string;
  specialty: string;
  institution: string;
  fileName: string;
}

/**
 * Demo registration. Only file metadata (name, type, size) is kept in memory;
 * the document is never read, uploaded or stored, and passwords are cleared on submit.
 */
export function RegisterForm({ headingId, onLogin }: RegisterFormProps) {
  const id = useId();
  const [values, setValues] = useState<TextValues>(EMPTY_VALUES);
  const [credentialFile, setCredentialFile] = useState<CredentialFileInfo | null>(null);
  /** Error from the last file selection (wrong type, too large), shown until a valid file replaces it. */
  const [fileSelectError, setFileSelectError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState<PendingSummary | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingHeadingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (pending) pendingHeadingRef.current?.focus();
  }, [pending]);

  const currentValues: RegistrationValues = { ...values, credentialFile };
  const liveErrors: RegistrationErrors = submitted ? validateRegistration(currentValues) : {};
  const errors: RegistrationErrors = fileSelectError
    ? { ...liveErrors, credentialFile: fileSelectError }
    : liveErrors;

  function update<K extends keyof TextValues>(field: K) {
    return (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const next = event.target.value;
      setValues((previous) => ({ ...previous, [field]: next }));
    };
  }

  /** Element id of each field's focusable control, used to focus the first invalid field. */
  const fieldIds: Record<RegistrationField, string> = {
    fullName: `${id}-name`,
    email: `${id}-email`,
    phone: `${id}-phone`,
    specialty: `${id}-specialty`,
    licenseNumber: `${id}-license`,
    institution: `${id}-institution`,
    password: `${id}-password`,
    confirmPassword: `${id}-confirm`,
    credentialFile: `${id}-file-button`,
  };

  function focusField(field: RegistrationField) {
    document.getElementById(fieldIds[field])?.focus();
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Reset so choosing the same file again still triggers a change event.
    event.target.value = '';
    if (!file) return;
    const info: CredentialFileInfo = { name: file.name, type: file.type, size: file.size };
    const error = validateFile(info, CREDENTIAL_FILE_RULE);
    if (error) {
      setCredentialFile(null);
      setFileSelectError(error);
      return;
    }
    setCredentialFile(info);
    setFileSelectError(null);
  }

  function removeFile() {
    setCredentialFile(null);
    setFileSelectError(null);
    focusField('credentialFile');
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: RegistrationErrors = {
      ...validateRegistration(currentValues),
      ...(fileSelectError ? { credentialFile: fileSelectError } : {}),
    };
    const firstInvalid = firstInvalidField(nextErrors, REGISTRATION_FIELD_ORDER);
    if (firstInvalid) {
      setSubmitted(true);
      focusField(firstInvalid);
      return;
    }
    // Demo only: nothing is sent. Drop passwords from state immediately.
    setPending({
      fullName: values.fullName.trim(),
      email: values.email.trim(),
      specialty: values.specialty,
      institution: values.institution.trim(),
      fileName: credentialFile?.name ?? '',
    });
    setValues({ ...values, password: '', confirmPassword: '' });
  }

  if (pending) {
    return (
      <div className="doctor-auth-pending">
        <div className="doctor-auth-heading">
          <p className="doctor-eyebrow">Demo · Verificare în așteptare</p>
          <h1 id={headingId} ref={pendingHeadingRef} className="doctor-auth-title" tabIndex={-1}>
            Verificare în așteptare
          </h1>
          <p className="doctor-auth-subtitle">
            Într-o versiune conectată, documentul dumneavoastră ar fi verificat înainte de activarea contului de medic.
          </p>
        </div>

        <div className="doctor-notice doctor-notice--success" role="status">
          <strong>Doar demonstrație:</strong> nimic nu a fost încărcat sau trimis. Contul dumneavoastră nu a fost creat sau aprobat, iar
          parola nu a fost stocată.
        </div>

        <dl className="doctor-auth-summary">
          <div>
            <dt>Nume complet</dt>
            <dd>{pending.fullName}</dd>
          </div>
          <div>
            <dt>E-mail de serviciu</dt>
            <dd>{pending.email}</dd>
          </div>
          <div>
            <dt>Specialitate</dt>
            <dd>{pending.specialty}</dd>
          </div>
          <div>
            <dt>Clinică / spital</dt>
            <dd>{pending.institution}</dd>
          </div>
          <div>
            <dt>Document de atestare</dt>
            <dd>{pending.fileName} (neîncărcat)</dd>
          </div>
        </dl>

        <button type="button" className="doctor-button doctor-button--primary doctor-button--block" onClick={onLogin}>
          Înapoi la autentificare
        </button>
      </div>
    );
  }

  const fileHeadingId = `${id}-file-heading`;
  const fileHintId = `${id}-file-hint`;
  const fileStatusId = `${id}-file-status`;
  const fileErrorId = `${id}-file-error`;
  const reviewHintId = `${id}-review-hint`;
  const fileDescribedBy = [fileHintId, credentialFile ? fileStatusId : null, errors.credentialFile ? fileErrorId : null, reviewHintId]
    .filter(Boolean)
    .join(' ');

  return (
    <>
      <div className="doctor-auth-heading">
        <h1 id={headingId} className="doctor-auth-title" tabIndex={-1}>
          Creați-vă contul de medic
        </h1>
        <p className="doctor-auth-subtitle">Datele și atestările dumneavoastră, într-un singur loc.</p>
      </div>

      <form className="doctor-auth-form" noValidate onSubmit={handleSubmit} aria-labelledby={headingId}>
        <div className="doctor-auth-grid">
          <TextField
            id={`${id}-name`}
            label="Nume complet"
            name="name"
            autoComplete="name"
            placeholder="Dr. Prenume Nume"
            value={values.fullName}
            onChange={update('fullName')}
            error={errors.fullName}
            required
          />
          <TextField
            id={`${id}-email`}
            label="E-mail de serviciu"
            type="email"
            name="email"
            autoComplete="email"
            inputMode="email"
            placeholder="medic@clinica.ro"
            value={values.email}
            onChange={update('email')}
            error={errors.email}
            required
          />
          <TextField
            id={`${id}-phone`}
            label="Număr de telefon"
            type="tel"
            name="phone"
            autoComplete="tel"
            inputMode="tel"
            placeholder="+40 7xx xxx xxx"
            value={values.phone}
            onChange={update('phone')}
            error={errors.phone}
            required
          />
          <FieldShell id={`${id}-specialty`} label="Specialitate" error={errors.specialty}>
            <select
              id={`${id}-specialty`}
              name="specialty"
              className="doctor-input doctor-auth-input doctor-auth-select"
              value={values.specialty}
              onChange={update('specialty')}
              aria-invalid={errors.specialty ? true : undefined}
              aria-describedby={errors.specialty ? `${id}-specialty-error` : undefined}
              required
            >
              <option value="">Selectați specialitatea</option>
              {SPECIALTY_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </FieldShell>
          <TextField
            id={`${id}-license`}
            label="Număr de înregistrare profesională"
            name="license-number"
            autoComplete="off"
            placeholder="Introduceți numărul de înregistrare"
            value={values.licenseNumber}
            onChange={update('licenseNumber')}
            error={errors.licenseNumber}
            required
          />
          <TextField
            id={`${id}-institution`}
            label="Clinică / spital"
            name="organization"
            autoComplete="organization"
            placeholder="Introduceți instituția"
            value={values.institution}
            onChange={update('institution')}
            error={errors.institution}
            required
          />
          <PasswordField
            id={`${id}-password`}
            label="Parolă"
            name="new-password"
            autoComplete="new-password"
            placeholder="Creați o parolă"
            hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
            value={values.password}
            onChange={update('password')}
            error={errors.password}
            required
          />
          <PasswordField
            id={`${id}-confirm`}
            label="Confirmați parola"
            name="confirm-password"
            autoComplete="new-password"
            placeholder="Introduceți din nou parola"
            value={values.confirmPassword}
            onChange={update('confirmPassword')}
            error={errors.confirmPassword}
            required
          />
        </div>

        <div className="doctor-auth-file-group" role="group" aria-labelledby={fileHeadingId}>
          <p id={fileHeadingId} className="doctor-label">
            Dovada calității de medic
          </p>
          <div
            className={`doctor-auth-dropzone${errors.credentialFile ? ' doctor-auth-dropzone--invalid' : ''}`}
          >
            <svg className="doctor-auth-dropzone__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path
                d="M12 15V4m0 0L7.5 8.5M12 4l4.5 4.5M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <div className="doctor-auth-dropzone__text">
              <p className="doctor-auth-dropzone__title">Atașați dreptul de liberă practică sau certificatul</p>
              <p id={fileHintId} className="doctor-hint">
                {CREDENTIAL_FILE_RULE.label} · Maximum 10 MB
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept={acceptAttribute(CREDENTIAL_FILE_RULE)}
              onChange={handleFileChange}
              hidden
              tabIndex={-1}
            />
            <button
              type="button"
              id={fieldIds.credentialFile}
              className="doctor-button doctor-button--secondary doctor-auth-dropzone__button"
              onClick={() => fileInputRef.current?.click()}
              aria-describedby={fileDescribedBy}
            >
              {credentialFile ? 'Înlocuiți fișierul' : 'Alegeți fișiere'}
            </button>
          </div>

          {credentialFile && (
            <div className="doctor-auth-file" id={fileStatusId}>
              <p className="doctor-auth-file__meta">
                <span className="doctor-sr-only">Fișier selectat: </span>
                <span className="doctor-auth-file__name">{credentialFile.name}</span>{' '}
                <span className="doctor-auth-file__size">{formatFileSize(credentialFile.size)}</span>
              </p>
              <button type="button" className="doctor-button doctor-button--ghost" onClick={removeFile}>
                Eliminați<span className="doctor-sr-only"> {credentialFile.name}</span>
              </button>
            </div>
          )}

          {errors.credentialFile && (
            <p id={fileErrorId} className="doctor-field-error" role={fileSelectError ? 'alert' : undefined}>
              {errors.credentialFile}
            </p>
          )}
          <p id={reviewHintId} className="doctor-hint">
            Documentul dumneavoastră va fi verificat înainte de activarea contului de medic. În această demonstrație rămâne pe
            dispozitivul dumneavoastră și nu este încărcat niciodată.
          </p>
        </div>

        <button type="submit" className="doctor-button doctor-button--primary doctor-button--block">
          Trimiteți pentru verificare
        </button>
      </form>

      <p className="doctor-auth-switch">
        Aveți deja cont?{' '}
        <button type="button" className="doctor-auth-text-button" onClick={onLogin}>
          Autentificați-vă pentru a verifica starea verificării
        </button>
      </p>
    </>
  );
}
