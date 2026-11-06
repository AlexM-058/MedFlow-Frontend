import './doctor.css';
import { useState } from 'react';
import type { AuthMode } from './contracts';
import type { DoctorProfile } from './types';
import { DoctorAuth } from './auth';
import { DoctorWorkspace } from './workspace';

export interface DoctorAppProps {
  /** Return to the patient area (owned by the app shell). */
  onExit: () => void;
}

/**
 * Doctor area entry point. Starts on login; all state is local demo state.
 * No real authentication: the "session" is an in-memory profile that logout clears.
 */
export function DoctorApp({ onExit }: DoctorAppProps) {
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [demoSession, setDemoSession] = useState<DoctorProfile | null>(null);

  return (
    <div className="doctor-app">
      {demoSession ? (
        <DoctorWorkspace
          doctor={demoSession}
          onLogout={() => {
            setDemoSession(null);
            setAuthMode('login');
          }}
          onExit={onExit}
        />
      ) : (
        <DoctorAuth
          mode={authMode}
          onModeChange={setAuthMode}
          onDemoLogin={setDemoSession}
          onExit={onExit}
        />
      )}
    </div>
  );
}
