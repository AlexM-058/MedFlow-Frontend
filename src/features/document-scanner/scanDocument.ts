import type { ScanCaptureMethod, ScanCaptureResult, ScannedDocument } from './types';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'application/pdf', 'image/jpg']);

function guessMimeFromName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.pdf')) return 'application/pdf';
  return 'image/jpeg';
}

function fallbackFileName(mimeType: string): string {
  const ext = mimeType === 'image/png' ? 'png' : mimeType === 'application/pdf' ? 'pdf' : 'jpg';
  return `medflow-scan-${Date.now()}.${ext}`;
}

function toScannedDocument(file: File, uri: string): ScannedDocument {
  const mimeType = ALLOWED_MIME.has(file.type)
    ? (file.type === 'image/jpg' ? 'image/jpeg' : file.type)
    : guessMimeFromName(file.name);
  return {
    uri,
    mimeType,
    fileName: file.name.trim() || fallbackFileName(mimeType),
    sizeBytes: file.size,
  };
}

/**
 * Browser / Capacitor WebView capture through a file input.
 * Resolves null when the user dismisses the picker (`cancel` event), so the
 * caller never stays stuck in a capturing state.
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

    const finish = (result: ScanCaptureResult | null) => {
      input.removeEventListener('change', onChange);
      input.removeEventListener('cancel', onCancel);
      input.remove();
      resolve(result);
    };

    const onCancel = () => finish(null);

    const onChange = () => {
      const file = input.files?.[0];
      if (!file) {
        finish(null);
        return;
      }
      finish({
        method: preferCamera ? 'camera-input' : 'gallery-input',
        document: toScannedDocument(file, URL.createObjectURL(file)),
      });
    };

    input.addEventListener('change', onChange);
    input.addEventListener('cancel', onCancel);
    document.body.appendChild(input);
    input.click();
  });
}

/**
 * Capture a printed medical document locally. Nothing is uploaded here.
 */
export function captureMedicalDocument(options?: {
  preferGallery?: boolean;
}): Promise<ScanCaptureResult | null> {
  return captureViaFileInput(!options?.preferGallery);
}

export function revokeScannedDocumentUri(document: ScannedDocument | null | undefined): void {
  if (document?.uri?.startsWith('blob:')) {
    URL.revokeObjectURL(document.uri);
  }
}

export function describeCaptureMethod(method: ScanCaptureMethod): string {
  switch (method) {
    case 'camera-input':
      return 'Device camera';
    case 'gallery-input':
      return 'Device files / gallery';
  }
}
