import jsQR from 'jsqr';

/**
 * Decodes one frame locally, in the browser. The image never leaves the device.
 * Returns the QR text, or null when the frame holds no readable code.
 */
export function decodeQrFrame(frame: ImageData): string | null {
  const result = jsQR(frame.data, frame.width, frame.height, { inversionAttempts: 'dontInvert' });
  return result ? result.data : null;
}
