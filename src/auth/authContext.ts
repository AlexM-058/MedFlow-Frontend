import { createContext, useContext } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { AccountProfile } from './contracts';

export type AuthStatus = 'loading' | 'unconfigured' | 'signed-out' | 'profile-loading' | 'ready' | 'error';

export interface AuthContextValue {
  status: AuthStatus;
  session: Session | null;
  profile: AccountProfile | null;
  error: string | null;
  signInWithGoogle: (destination: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider.');
  return value;
}
