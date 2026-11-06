import { useId, useRef, useState, type FormEvent } from 'react';
import { useAuth } from '../../auth/authContext';
import { AccountSessionControls } from '../../auth/AuthPages';
import { EMPTY_FORM, STATUS_LABEL, validateInvitationForm, type DoctorInvitation, type InvitationForm, type InvitationFormErrors } from './adminLogic';
import { useAdminPanel } from './useAdminPanel';
import './admin.css';
import { brand } from '../../brand/brand.config';

const DATE = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const formatDate = (iso: string | null) => {
  if (!iso) return null;
  const time = Date.parse(iso);
  return Number.isNaN(time) ? null : DATE.format(time);
};

/** MedFlow administrators invite doctors. Mount inside AuthBoundary at #/admin. */
export function AdminPage() {
  const { profile } = useAuth();
  const panel = useAdminPanel();

  return (
    <section className="admin-page" aria-labelledby="admin-title">
      <header className="admin-page__heading">
        <p className="admin-eyebrow">{brand.productName.toUpperCase()} ADMINISTRATION</p>
        <h1 id="admin-title">Doctor onboarding</h1>
        <p>Invite doctors after their professional details have been verified. Doctor access is granted only when the invited Google account accepts the invitation.</p>
      </header>

      {panel.phase === 'checking' || panel.phase === 'signed-out' ? (
        <p className="admin-card" role="status">Checking administrator access…</p>
      ) : panel.phase === 'error' ? (
        <div className="admin-error" role="alert">
          <p>{panel.error}</p>
          <button type="button" className="ui-button ui-button--secondary" onClick={panel.retry}>Try again</button>
        </div>
      ) : panel.phase === 'denied' ? (
        <section className="admin-card" aria-labelledby="admin-denied-title">
          <h2 id="admin-denied-title">Access restricted</h2>
          <p>{profile?.email ? `${profile.email} is not a ${brand.productName} administrator.` : `This account is not a ${brand.productName} administrator.`} Administrator access is granted by the {brand.productName} team during onboarding; it cannot be requested from this page.</p>
          <a className="admin-link" href="#/patient">Go to your account</a>
        </section>
      ) : (
        <>
          <InviteForm panel={panel} />
          <InvitationList panel={panel} />
        </>
      )}
      <AccountSessionControls />
    </section>
  );
}

type Panel = ReturnType<typeof useAdminPanel>;

function InviteForm({ panel }: { panel: Panel }) {
  const [form, setForm] = useState<InvitationForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<InvitationFormErrors>({});
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const linkRef = useRef<HTMLInputElement>(null);
  const firstErrorRef = useRef<Record<string, HTMLInputElement | null>>({});
  const baseId = useId();

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (panel.creating) return;
    const found = validateInvitationForm(form);
    setErrors(found);
    const first = (['email', 'fullName', 'specialty', 'clinic'] as const).find((key) => found[key]);
    if (first) { firstErrorRef.current[first]?.focus(); return; }
    setCopyStatus(null);
    if (await panel.create(form)) {
      setForm(EMPTY_FORM);
      requestAnimationFrame(() => linkRef.current?.focus());
    }
  }

  async function copy() {
    if (!panel.created) return;
    try {
      await navigator.clipboard.writeText(panel.created.link);
      setCopyStatus('Invitation link copied.');
    } catch {
      linkRef.current?.focus();
      linkRef.current?.select();
      setCopyStatus('Copying is blocked in this browser. The link is selected; copy it with your keyboard.');
    }
  }

  const field = (key: keyof InvitationForm, label: string, type = 'text', autoComplete = 'off') => {
    const id = `${baseId}-${key}`;
    const errorId = `${id}-error`;
    return (
      <div className="admin-field">
        <label htmlFor={id}>{label}</label>
        <input
          ref={(element) => { firstErrorRef.current[key] = element; }}
          id={id}
          type={type}
          autoComplete={autoComplete}
          value={form[key]}
          disabled={panel.creating}
          aria-invalid={Boolean(errors[key])}
          aria-describedby={errors[key] ? errorId : undefined}
          onChange={(event) => {
            setForm((current) => ({ ...current, [key]: event.target.value }));
            if (errors[key]) setErrors((current) => ({ ...current, [key]: undefined }));
          }}
        />
        {errors[key] && <p id={errorId} className="admin-field__error">{errors[key]}</p>}
      </div>
    );
  };

  return (
    <section className="admin-card" aria-labelledby={`${baseId}-title`}>
      <h2 id={`${baseId}-title`}>Invite a doctor</h2>
      <form className="admin-form" onSubmit={(event) => void submit(event)} noValidate>
        {field('email', 'Google account email', 'email', 'off')}
        {field('fullName', 'Full name')}
        {field('specialty', 'Specialty')}
        {field('clinic', 'Clinic')}
        <div className="admin-actions">
          <button type="submit" className="ui-button ui-button--primary" disabled={panel.creating} aria-busy={panel.creating}>
            {panel.creating ? 'Creating invitation…' : 'Create invitation'}
          </button>
        </div>
      </form>
      {panel.createError && <p className="admin-error" role="alert">{panel.createError}</p>}

      {panel.created && (
        <div className="admin-link-panel" role="region" aria-labelledby={`${baseId}-link-title`}>
          <h3 id={`${baseId}-link-title`}>Invitation link</h3>
          <p>Send this link only to the invited doctor. It is shown once and will not be shown again after you leave or sign out.</p>
          <label className="visually-hidden" htmlFor={`${baseId}-link`}>Invitation link</label>
          <input
            ref={linkRef}
            id={`${baseId}-link`}
            className="admin-link-panel__input"
            readOnly
            value={panel.created.link}
            onFocus={(event) => event.currentTarget.select()}
          />
          <div className="admin-actions">
            <button type="button" className="ui-button ui-button--primary" onClick={() => void copy()}>Copy link</button>
            <button type="button" className="ui-button ui-button--secondary" onClick={() => { setCopyStatus(null); panel.dismissLink(); }}>Done</button>
          </div>
        </div>
      )}
      <p className="admin-status-line" role="status" aria-live="polite">{copyStatus}</p>
    </section>
  );
}

function InvitationList({ panel }: { panel: Panel }) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const titleId = useId();

  return (
    <section className="admin-card" aria-labelledby={titleId} aria-busy={panel.refreshing}>
      <div className="admin-card__heading">
        <h2 id={titleId}>Invitations</h2>
        <button type="button" className="ui-button ui-button--secondary" onClick={panel.refresh} disabled={panel.refreshing} aria-busy={panel.refreshing}>
          {panel.refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      {panel.listError && <p className="admin-error" role="alert">{panel.listError}{panel.invitations.length > 0 ? ' Showing the last loaded list.' : ''}</p>}
      {panel.invitations.length === 0 ? (
        !panel.listError && <p>{panel.refreshing ? 'Loading invitations…' : 'No invitations yet.'}</p>
      ) : (
        <ul className="admin-list">
          {panel.invitations.map((invitation) => (
            <InvitationRow
              key={invitation.id}
              invitation={invitation}
              revoking={Boolean(panel.revoking[invitation.id])}
              error={panel.revokeErrors[invitation.id]}
              confirming={confirming === invitation.id}
              onAsk={() => setConfirming(invitation.id)}
              onCancel={() => setConfirming(null)}
              onConfirm={() => { setConfirming(null); void panel.revoke(invitation.id); }}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function InvitationRow({ invitation, revoking, error, confirming, onAsk, onCancel, onConfirm }: {
  invitation: DoctorInvitation; revoking: boolean; error?: string; confirming: boolean;
  onAsk: () => void; onCancel: () => void; onConfirm: () => void;
}) {
  const expires = formatDate(invitation.expiresAt);
  const accepted = formatDate(invitation.acceptedAt);
  return (
    <li className="admin-list__item">
      <div className="admin-list__main">
        <h3>{invitation.fullName}</h3>
        <p>{invitation.specialty} · {invitation.clinic}</p>
        <p className="admin-meta">{invitation.email}</p>
        <p className="admin-meta">
          {invitation.status === 'accepted' && accepted ? `Accepted ${accepted}` : expires ? `${invitation.status === 'pending' ? 'Expires' : 'Expiry'} ${expires}` : null}
        </p>
      </div>
      <p className={`admin-badge admin-badge--${invitation.status}`}>{STATUS_LABEL[invitation.status]}</p>
      {error && <p className="admin-error" role="alert">{error}</p>}
      {invitation.status === 'pending' && (
        <div className="admin-actions">
          {confirming ? (
            <>
              <button type="button" className="ui-button ui-button--danger" onClick={onConfirm}>
                Confirm revoke<span className="visually-hidden"> invitation for {invitation.fullName}</span>
              </button>
              <button type="button" className="ui-button ui-button--secondary" onClick={onCancel}>Keep invitation</button>
            </>
          ) : (
            <button type="button" className="ui-button ui-button--secondary" onClick={onAsk} disabled={revoking} aria-busy={revoking}>
              {revoking ? 'Revoking…' : error ? 'Try revoking again' : 'Revoke'}
              <span className="visually-hidden"> invitation for {invitation.fullName}</span>
            </button>
          )}
        </div>
      )}
    </li>
  );
}
