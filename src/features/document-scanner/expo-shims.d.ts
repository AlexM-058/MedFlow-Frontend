/** Optional native modules — present only in Expo / RN builds. */
declare module 'expo-camera' {
  export const CameraView: {
    scanDocumentAsync?: (options?: {
      quality?: number;
      requestPdf?: boolean;
    }) => Promise<{ pages?: string[]; pdfUri?: string } | null>;
  };
}

declare module 'expo-image-picker' {
  export function requestCameraPermissionsAsync(): Promise<{ granted: boolean }>;
  export function launchCameraAsync(options: Record<string, unknown>): Promise<{
    canceled: boolean;
    assets?: Array<{
      uri: string;
      mimeType?: string | null;
      fileName?: string | null;
      fileSize?: number | null;
    }>;
  }>;
}
