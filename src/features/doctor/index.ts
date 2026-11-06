// Public exports of the doctor module (fixed integration contracts).

// Synthetic demo, mounted by the app shell only at #/demo/doctor.
export { DoctorApp } from './DoctorApp';
export type { DoctorAppProps } from './DoctorApp';

// Real workspace, mounted at #/doctor only for a server-verified doctor profile.
export { DoctorAccountWorkspace } from './account/DoctorAccountWorkspace';
export type { DoctorAccountWorkspaceProps } from './account/DoctorAccountWorkspace';
