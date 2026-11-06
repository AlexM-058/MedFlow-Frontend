// Pure rules for the admin panel. No React, DOM or API imports (runs under Node tests).

export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'revoked';

export interface DoctorInvitation {
  id: string;
  email: string;
  fullName: string;
  specialty: string;
  clinic: string;
  status: InvitationStatus;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
}

export interface InvitationForm {
  email: string;
  fullName: string;
  specialty: string;
  clinic: string;
}

export type InvitationFormErrors = Partial<Record<keyof InvitationForm, string>>;

export const EMPTY_FORM: InvitationForm = { email: '', fullName: '', specialty: '', clinic: '' };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LIMITS: Record<keyof InvitationForm, number> = { email: 320, fullName: 200, specialty: 200, clinic: 300 };
const LABELS: Record<keyof InvitationForm, string> = { email: 'Email', fullName: 'Full name', specialty: 'Specialty', clinic: 'Clinic' };

/** Same limits as the backend and database; the server still validates everything. */
export function validateInvitationForm(form: InvitationForm): InvitationFormErrors {
  const errors: InvitationFormErrors = {};
  for (const key of Object.keys(LIMITS) as (keyof InvitationForm)[]) {
    const value = form[key].trim();
    if (!value) errors[key] = `${LABELS[key]} is required.`;
    else if (value.length > LIMITS[key]) errors[key] = `${LABELS[key]} must be at most ${LIMITS[key]} characters.`;
  }
  if (!errors.email && !EMAIL.test(form.email.trim())) errors.email = 'Enter a valid email address, for example name@clinic.ro.';
  return errors;
}

export function normalizeForm(form: InvitationForm): InvitationForm {
  return {
    email: form.email.trim().toLowerCase(),
    fullName: form.fullName.trim(),
    specialty: form.specialty.trim(),
    clinic: form.clinic.trim(),
  };
}

export const STATUS_LABEL: Record<InvitationStatus, string> = {
  pending: 'Waiting for the doctor',
  accepted: 'Accepted',
  expired: 'Expired',
  revoked: 'Revoked',
};

/** Pending first (soonest to expire first), then the rest, newest expiry first. */
export function sortInvitations(invitations: readonly DoctorInvitation[]): DoctorInvitation[] {
  return [...invitations].sort((a, b) => {
    const aPending = a.status === 'pending';
    if (aPending !== (b.status === 'pending')) return aPending ? -1 : 1;
    const diff = Date.parse(a.expiresAt) - Date.parse(b.expiresAt);
    if (diff !== 0 && !Number.isNaN(diff)) return aPending ? diff : -diff;
    return a.id.localeCompare(b.id);
  });
}

export function replaceInvitation(list: readonly DoctorInvitation[], updated: DoctorInvitation): DoctorInvitation[] {
  return list.some((item) => item.id === updated.id)
    ? list.map((item) => (item.id === updated.id ? updated : item))
    : [updated, ...list];
}

/**
 * Session guard: every async result carries the generation it started in.
 * Logout or an account switch bumps the generation, so a late answer from the
 * previous administrator can never show a link or a list to the next account.
 */
export class SessionGuard {
  private generation = 0;
  reset(): void { this.generation += 1; }
  current(): number { return this.generation; }
  isCurrent(generation: number): boolean { return generation === this.generation; }
}
