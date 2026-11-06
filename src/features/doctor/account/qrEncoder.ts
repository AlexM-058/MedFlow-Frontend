import { encode } from 'uqr';

/** Square module matrix: true = dark module. Includes no quiet zone. */
export type QrMatrix = readonly (readonly boolean[])[];

export const QR_ENCODER_AVAILABLE = true;

/** Encode locally; an oversized or unsupported payload never crashes the workspace. */
export function encodeQrModules(text: string): QrMatrix | null {
  if (!text.trim()) return null;
  try {
    return encode(text, { border: 0, ecc: 'M' }).data;
  } catch {
    return null;
  }
}

/** Standalone SVG for display/download. Colors are fixed for scanner contrast. */
export function qrMatrixToSvg(matrix: QrMatrix, quietZone = 4): string {
  const size = matrix.length + quietZone * 2;
  let path = '';
  matrix.forEach((row, y) => {
    row.forEach((dark, x) => {
      if (dark) path += `M${x + quietZone} ${y + quietZone}h1v1h-1z`;
    });
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#ffffff"/><path d="${path}" fill="#000000"/></svg>`;
}
