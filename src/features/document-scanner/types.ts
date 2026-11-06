/** Local-only scanned medical document (not uploaded until a later API call). */
export type ScannedDocument = {
  uri: string;
  mimeType: string;
  fileName: string;
  sizeBytes?: number;
};

export type ScanCaptureMethod = 'expo-document-scanner' | 'expo-image-picker' | 'capacitor-camera' | 'file-input';

export type ScanCaptureResult = {
  document: ScannedDocument;
  method: ScanCaptureMethod;
};
