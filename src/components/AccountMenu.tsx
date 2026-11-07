import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/authContext';
import { ThemeOptions } from '../theme/ThemeSelector';

/**
 * The account menu: one button with three lines in the header. Under it, in one place: the email of the signed-in
 * account, the theme (Luminos / Întunecat / Sistem) and "Deconectare". Without a session (the sign-in page) only the
 * theme is shown. Closes with Escape, with a click outside, and returns the focus to the button.
 */
export function AccountMenu() {
  const { session, signOut } = useAuth();
  const panel = useRef<HTMLDetailsElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const email = session?.user.email ?? null;

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !panel.current?.contains(event.target)) panel.current?.removeAttribute('open');
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, []);

  async function exit() {
    setPending(true);
    setError(null);
    try { await signOut(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Deconectarea nu a reușit.'); }
    finally { setPending(false); }
  }

  return (
    <details
      className="theme-selector account-menu"
      ref={panel}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && panel.current?.open) {
          event.preventDefault();
          event.stopPropagation();
          panel.current.open = false;
          panel.current.querySelector('summary')?.focus();
        }
      }}
    >
      <summary className="theme-selector__trigger" aria-label="Meniul contului" title="Meniu">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </summary>
      <div className="theme-selector__panel account-menu__panel">
        {email && <p className="account-menu__email" title={email}>{email}</p>}
        <ThemeOptions />
        {session && (
          <button type="button" className="ui-button ui-button--secondary account-menu__out" onClick={() => void exit()} disabled={pending} aria-busy={pending || undefined}>
            {pending ? 'Se deconectează…' : 'Deconectare'}
          </button>
        )}
        {error && <p className="account-error" role="alert">{error}</p>}
      </div>
    </details>
  );
}
