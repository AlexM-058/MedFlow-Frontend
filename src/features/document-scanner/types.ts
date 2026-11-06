/** Local-only scanned medical document (not uploaded until a later API call). */
export type ScannedDocument = {
  uri: string;
  mimeType: string;
  fileName: string;
  sizeBytes?: number;
};

export type ScanCaptureMethod = 'camera-input' | 'gallery-input';

export type ScanCaptureResult = {
  document: ScannedDocument;
  method: ScanCaptureMethod;
};
