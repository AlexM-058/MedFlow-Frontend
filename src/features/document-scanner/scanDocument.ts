import type { ScanCaptureMethod, ScanCaptureResult, ScannedDocument } from './types';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'application/pdf', 'image/jpg']);

function guessMimeFromUri(uri: string): string {
  const lower = uri.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.pdf')) return 'application/pdf';
  return 'image/jpeg';
}

function fileNameFromUri(uri: string, mimeType: string): string {
  const fromPath = uri.split(/[/\\]/).pop()?.split('?')[0];
  if (fromPath && fromPath.includes('.')) return fromPath;
  const ext = mimeType === 'image/png' ? 'png' : mimeType === 'application/pdf' ? 'pdf' : 'jpg';
  return `medflow-scan-${Date.now()}.${ext}`;
}

function toScannedDocument(partial: {
  uri: string;
  mimeType?: string | null;
  fileName?: string | null;
  sizeBytes?: number | null;
}): ScannedDocument {
  const mimeType = partial.mimeType && ALLOWED_MIME.has(partial.mimeType)
    ? (partial.mimeType === 'image/jpg' ? 'image/jpeg' : partial.mimeType)
    : guessMimeFromUri(partial.uri);
  return {
    uri: partial.uri,
    mimeType,
    fileName: partial.fileName?.trim() || fileNameFromUri(partial.uri, mimeType),
    ...(typeof partial.sizeBytes === 'number' && partial.sizeBytes >= 0
      ? { sizeBytes: partial.sizeBytes }
      : {}),
  };
}

/** Expo SDK 58+: CameraView.scanDocumentAsync (VisionKit / ML Kit). */
async function tryExpoDocumentScanner(): Promise<ScanCaptureResult | null> {
  try {
    const camera = await import(/* @vite-ignore */ 'expo-camera');
    type ExpoCameraModule = typeof import('expo-camera');
    const { CameraView } = camera as ExpoCameraModule;
    if (!CameraView?.scanDocumentAsync) return null;

    const result = await CameraView.scanDocumentAsync({
      quality: 1,
      requestPdf: false,
    });
    const pageUri = result?.pages?.[0];
    if (!pageUri) return null;

    return {
      method: 'expo-document-scanner',
      document: toScannedDocument({ uri: pageUri, mimeType: 'image/jpeg' }),
    };
  } catch {
    return null;
  }
}

/** Fallback: expo-image-picker camera / library. */
async function tryExpoImagePicker(): Promise<ScanCaptureResult | null> {
  try {
    const picker = await import(/* @vite-ignore */ 'expo-image-picker');
    type ExpoImagePickerModule = typeof import('expo-image-picker');
    const ImagePicker = picker as ExpoImagePickerModule;
    if (!ImagePicker.launchCameraAsync) return null;

    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return null;

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 1,
      allowsEditing: true,
    });
    if (result.canceled || !result.assets?.[0]?.uri) return null;
    const asset = result.assets[0];
    return {
      method: 'expo-image-picker',
      document: toScannedDocument({
        uri: asset.uri,
        mimeType: asset.mimeType,
        fileName: asset.fileName,
        sizeBytes: asset.fileSize,
      }),
    };
  } catch {
    return null;
  }
}

/**
 * Browser / Capacitor WebView: camera capture or gallery via file input.
 * No OpenCV — device may still offer basic crop UI depending on OS.
 */
function captureViaFileInput(preferCamera: boolean): Promise<ScanCaptureResult | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,application/pdf,image/*';
    if (preferCamera) {
      input.setAttribute('capture', 'environment');
    }
    input.style.display = 'none';

    const cleanup = () => {
      input.removeEventListener('change', onChange);
      input.remove();
    };

    const onChange = () => {
      const file = input.files?.[0];
      cleanup();
      if (!file) {
        resolve(null);
        return;
      }
      const uri = URL.createObjectURL(file);
      resolve({
        method: 'file-input',
        document: toScannedDocument({
          uri,
          mimeType: file.type || guessMimeFromUri(file.name),
          fileName: file.name,
          sizeBytes: file.size,
        }),
      });
    };

    input.addEventListener('change', onChange);
    document.body.appendChild(input);
    input.click();
    // If the user dismisses without selecting, change may never fire.
    window.setTimeout(() => {
      if (!input.isConnected) return;
      // Keep input until change; no forced null (user may still pick).
    }, 0);
  });
}

/**
 * Capture a printed medical document to local storage only.
 * Preference: Expo document scanner → Expo image picker → file/camera input.
 */
export async function captureMedicalDocument(options?: {
  preferGallery?: boolean;
}): Promise<ScanCaptureResult | null> {
  const expoScan = await tryExpoDocumentScanner();
  if (expoScan) return expoScan;

  if (!options?.preferGallery) {
    const expoPicker = await tryExpoImagePicker();
    if (expoPicker) return expoPicker;
  }

  return captureViaFileInput(!options?.preferGallery);
}

export function revokeScannedDocumentUri(document: ScannedDocument | null | undefined): void {
  if (document?.uri?.startsWith('blob:')) {
    URL.revokeObjectURL(document.uri);
  }
}

export function describeCaptureMethod(method: ScanCaptureMethod): string {
  switch (method) {
    case 'expo-document-scanner':
      return 'Native document scanner (perspective correction)';
    case 'expo-image-picker':
      return 'Expo camera / image picker';
    case 'capacitor-camera':
      return 'Capacitor camera';
    case 'file-input':
      return 'Device file / camera input';
  }
}
