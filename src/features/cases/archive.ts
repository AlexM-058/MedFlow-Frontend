// RAR archives: a whole medical file sent as ONE .rar is opened here, in the browser, and each document inside
// goes through the normal one-by-one reading (batchUpload.ts). The archive itself never reaches the server, and
// nothing is written to disk: files only exist as in-memory File objects. No network and no import.meta.env: the
// caller passes the WebAssembly binary, so this is testable in Node.
//
// An archive is untrusted input, so it is limited BEFORE and WHILE it is opened:
//   - size of the archive, number of entries, size of each file and total declared size;
//   - the real type is decided from the first bytes (JPEG, PNG, PDF), never from the name;
//   - names are display text only (path parts such as ".." are dropped); nothing uses them as a path;
//   - password-protected or multi-part archives are refused with a clear message.

export interface ArchiveLimits {
  maxArchiveBytes: number;
  maxEntries: number;
  maxFileBytes: number;
  maxTotalBytes: number;
}

export const DEFAULT_ARCHIVE_LIMITS: ArchiveLimits = {
  maxArchiveBytes: 200 * 1024 * 1024,
  maxEntries: 40,
  maxFileBytes: 10 * 1024 * 1024,
  maxTotalBytes: 150 * 1024 * 1024,
};

export interface ArchiveResult {
  files: File[];
  /** Entries that were not used, with the reason (shown to the patient). Directories and system files are ignored silently. */
  skipped: { name: string; reason: string }[];
}

export class ArchiveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArchiveError';
  }
}

export function isRarFile(file: { name: string; type?: string }): boolean {
  return /\.rar$/i.test(file.name) || file.type === 'application/vnd.rar' || file.type === 'application/x-rar-compressed';
}

/** Real type from the first bytes, or null when it is not JPEG, PNG or PDF. */
export function detectType(bytes: Uint8Array): 'image/jpeg' | 'image/png' | 'application/pdf' | null {
  const starts = (signature: number[]) => signature.every((value, index) => bytes[index] === value);
  if (starts([0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (starts([0x25, 0x50, 0x44, 0x46, 0x2d])) return 'application/pdf';
  return null;
}

/** Display name: path parts "", "." and ".." are dropped, separators unified, length capped. Never used as a path. */
export function cleanName(name: string): string {
  const parts = name.split(/[\\/]+/).filter((part) => part !== '' && part !== '.' && part !== '..');
  return (parts.join('/') || 'fisier').slice(-120);
}

/** macOS and Windows leftovers that are not documents: ignored without noise. */
function isSystemFile(name: string): boolean {
  const parts = name.split(/[\\/]+/);
  const last = parts[parts.length - 1] ?? '';
  return parts.includes('__MACOSX') || last.startsWith('._') || last === '.DS_Store' || last.toLowerCase() === 'thumbs.db';
}

/** Entries that try to leave the archive folder ("..") or start from a root. Refused one by one, the rest is still read. */
function isUnsafePath(name: string): boolean {
  return /(^|[\\/])\.\.([\\/]|$)/.test(name) || /^([\\/]|[A-Za-z]:)/.test(name);
}

const MB = 1024 * 1024;
const megabytes = (bytes: number) => Math.round(bytes / MB);

/**
 * Opens a RAR archive and returns the documents inside. `wasmBinary` is the unrar WebAssembly module.
 * Throws ArchiveError (Romanian message) when the archive cannot be used as a whole.
 */
export async function extractRar(data: ArrayBuffer, wasmBinary: ArrayBuffer, limits: ArchiveLimits = DEFAULT_ARCHIVE_LIMITS): Promise<ArchiveResult> {
  if (data.byteLength === 0) throw new ArchiveError('Arhiva este goală.');
  if (data.byteLength > limits.maxArchiveBytes) throw new ArchiveError(`Arhiva depășește ${megabytes(limits.maxArchiveBytes)} MB. Împărțiți fotografiile în mai multe arhive.`);

  const { createExtractorFromData } = await import('node-unrar-js');
  let extractor;
  try {
    extractor = await createExtractorFromData({ data, wasmBinary });
  } catch {
    throw new ArchiveError('Arhiva RAR este deteriorată sau nu este un fișier RAR valid.');
  }

  const skipped: ArchiveResult['skipped'] = [];
  let chosen: Set<string>;
  try {
    const list = extractor.getFileList();
    if (list.arcHeader.flags.headerEncrypted) throw new ArchiveError('Arhiva este protejată cu parolă. Dezarhivați-o și alegeți fișierele direct.');
    if (list.arcHeader.flags.volume) throw new ArchiveError('Arhiva este împărțită în mai multe părți. Folosiți o arhivă întreagă.');

    chosen = new Set();
    let declaredTotal = 0;
    for (const header of list.fileHeaders) {
      if (header.flags.directory || isSystemFile(header.name)) continue;
      const name = cleanName(header.name);
      if (isUnsafePath(header.name)) { skipped.push({ name, reason: 'Nume de fișier nesigur (conține „..” sau cale absolută).' }); continue; }
      if (header.flags.encrypted) { skipped.push({ name, reason: 'Fișier protejat cu parolă.' }); continue; }
      if (chosen.size >= limits.maxEntries) { skipped.push({ name, reason: `Prea multe fișiere în arhivă (cel mult ${limits.maxEntries}).` }); continue; }
      if (header.unpSize > limits.maxFileBytes) { skipped.push({ name, reason: `Fișierul depășește ${megabytes(limits.maxFileBytes)} MB.` }); continue; }
      if (header.unpSize === 0) { skipped.push({ name, reason: 'Fișierul este gol.' }); continue; }
      if (declaredTotal + header.unpSize > limits.maxTotalBytes) { skipped.push({ name, reason: 'Arhiva conține prea multe date în total.' }); continue; }
      declaredTotal += header.unpSize;
      chosen.add(header.name);
    }
  } catch (error) {
    if (error instanceof ArchiveError) throw error;
    throw new ArchiveError('Arhiva RAR este deteriorată sau nu poate fi citită.');
  }

  const files: File[] = [];
  if (chosen.size > 0) {
    try {
      const extracted = extractor.extract({ files: (header) => chosen.has(header.name) });
      for (const entry of extracted.files) {
        const name = cleanName(entry.fileHeader.name);
        const bytes = entry.extraction; // v2: the file content itself (Uint8Array)
        if (!bytes) { skipped.push({ name, reason: 'Fișierul nu a putut fi citit din arhivă.' }); continue; }
        if (bytes.byteLength > limits.maxFileBytes) { skipped.push({ name, reason: `Fișierul depășește ${megabytes(limits.maxFileBytes)} MB.` }); continue; }
        const type = detectType(bytes);
        if (!type) { skipped.push({ name, reason: 'Conținutul nu este o imagine JPG, PNG sau un PDF.' }); continue; }
        files.push(new File([bytes as BlobPart], name, { type }));
      }
    } catch {
      throw new ArchiveError('Arhiva RAR este deteriorată sau nu poate fi dezarhivată.');
    }
  }
  if (files.length === 0 && skipped.length === 0) throw new ArchiveError('Arhiva nu conține fotografii JPG, PNG sau PDF-uri.');
  files.sort((a, b) => a.name.localeCompare(b.name, 'ro', { numeric: true }));
  return { files, skipped };
}
