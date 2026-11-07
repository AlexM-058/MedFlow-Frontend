import { extractConnectCode } from './journeyLogic.ts';

/** What one decoded frame means for the patient. */
export type ScanOutcome =
  | { kind: 'code'; code: string }
  | { kind: 'foreign' }
  | { kind: 'none' };

/**
 * Turns the text of a scanned QR into a navigation decision. Only an opaque connect code
 * (bare or inside ".../#/connect/<code>") is accepted: any other QR content is "foreign" and
 * is never used to build a route, open a link or call the server.
 */
export function interpretScan(text: string | null | undefined): ScanOutcome {
  if (text === null || text === undefined || text === '') return { kind: 'none' };
  const code = extractConnectCode(text);
  return code ? { kind: 'code', code } : { kind: 'foreign' };
}

export type CameraFailure = { phase: 'denied' | 'missing' | 'insecure' | 'unsupported' | 'error'; message: string };

/** Plain-language camera problems; the paste-a-code form stays available for every one of them. */
export function describeCameraFailure(errorName: string | undefined): CameraFailure {
  switch (errorName) {
    case 'NotAllowedError':
    case 'SecurityError':
      return { phase: 'denied', message: 'Accesul la cameră a fost refuzat. Permiteți camera pentru acest site din setările browserului sau lipiți codul sau linkul mai jos.' };
    case 'NotFoundError':
    case 'OverconstrainedError':
      return { phase: 'missing', message: 'Nu am găsit o cameră pe acest dispozitiv. Lipiți codul sau linkul primit de la medic.' };
    case 'NotReadableError':
      return { phase: 'error', message: 'Camera este folosită de altă aplicație. Închideți-o și încercați din nou, sau lipiți codul mai jos.' };
    default:
      return { phase: 'error', message: 'Camera nu a putut fi pornită. Încercați din nou sau lipiți codul sau linkul mai jos.' };
  }
}

export const INSECURE_CONTEXT: CameraFailure = {
  phase: 'insecure',
  message: 'Camera funcționează doar pe o conexiune securizată (HTTPS). Lipiți codul sau linkul primit de la medic.',
};

export const UNSUPPORTED_CAMERA: CameraFailure = {
  phase: 'unsupported',
  message: 'Acest browser nu permite accesul la cameră. Lipiți codul sau linkul primit de la medic.',
};

/** Downscales a camera frame so decoding stays fast on phones; never upscales, keeps the ratio. */
export function scaledSize(width: number, height: number, maxSide: number): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 };
  const largest = Math.max(width, height);
  if (largest <= maxSide) return { width, height };
  const ratio = maxSide / largest;
  return { width: Math.max(1, Math.round(width * ratio)), height: Math.max(1, Math.round(height * ratio)) };
}
