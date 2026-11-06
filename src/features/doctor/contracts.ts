// Frozen props contracts between the doctor module root and its sub-folders.
// auth/index.ts, workspace/index.ts and suggestions/index.ts export components
// with exactly these names and props. Do not change without the coordinator.
import type { DoctorProfile, SuggestionTarget } from './types';

export type AuthMode = 'login' | 'register';

/** Exported as `DoctorAuth` from ./auth/index.ts */
export interface DoctorAuthProps {
  mode: AuthMode;
  onModeChange: (mode: AuthMode) => void;
  /** Called after local validation succeeds on the login form (demo session only). */
  onDemoLogin: (doctor: DoctorProfile) => void;
  /** Return to the patient area. */
  onExit: () => void;
}

/** Exported as `DoctorWorkspace` from ./workspace/index.ts */
export interface DoctorWorkspaceProps {
  doctor: DoctorProfile;
  /** Clears demo session state; DoctorApp returns to login. */
  onLogout: () => void;
  /** Return to the patient area. */
  onExit: () => void;
}

/** Exported as `SuggestionDialog` from ./suggestions/index.ts */
export interface SuggestionDialogProps {
  /** Dialog is open while a patient is set; null means closed. */
  patient: SuggestionTarget | null;
  onClose: () => void;
}
