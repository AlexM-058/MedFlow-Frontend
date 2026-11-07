// Sequential upload of many document photos (a whole medical file: 20-30 sheets).
//
// Why one at a time: the local reader processes a single document at a time (about 15 s on CPU) and the
// gateway answers 429 to a second one; the files are not stored on the server, so the only copy lives in this
// page until it is read. A sheet that fails never stops the others and can be retried. No network and no
// import.meta.env here: safe for Node tests. The caller passes the upload function.

export type BatchStatus = 'pending' | 'reading' | 'done' | 'failed';

export interface BatchItem {
  id: number;
  file: File;
  name: string;
  status: BatchStatus;
  message?: string;
  documentId?: string;
}

export type BatchStop = null | 'session' | 'unavailable' | 'cancelled';

export const BATCH_MAX_FILES = 40;
export const BATCH_MAX_BYTES = 10 * 1024 * 1024;
/** After this many failures in a row the reader is most likely down: stop instead of failing every sheet. */
export const BATCH_MAX_CONSECUTIVE_FAILURES = 3;
const ACCEPTED = ['image/jpeg', 'image/png', 'application/pdf'];

/** Why a file cannot be sent (checked before any request), or null. */
export function precheck(file: File): string | null {
  if (!ACCEPTED.includes(file.type)) return 'Tip de fișier neacceptat (folosiți JPG, PNG sau PDF).';
  if (file.size === 0) return 'Fișierul este gol.';
  if (file.size > BATCH_MAX_BYTES) return 'Fișierul depășește 10 MB.';
  return null;
}

export function createBatch(files: File[]): BatchItem[] {
  return files.slice(0, BATCH_MAX_FILES).map((file, id) => {
    const problem = precheck(file);
    return { id, file, name: file.name || `Foaia ${id + 1}`, status: problem ? 'failed' : 'pending', ...(problem ? { message: problem } : {}) };
  });
}

export function summarizeBatch(items: BatchItem[]) {
  const count = (status: BatchStatus) => items.filter((item) => item.status === status).length;
  return { total: items.length, done: count('done'), failed: count('failed'), pending: count('pending'), reading: count('reading') };
}

/** Failed items go back to pending (not the ones refused by the pre-check: those cannot succeed). */
export function retryable(items: BatchItem[]): BatchItem[] {
  return items.map((item) => (item.status === 'failed' && precheck(item.file) === null ? { id: item.id, file: item.file, name: item.name, status: 'pending' as const } : item));
}

type Upload = (file: File, signal: AbortSignal) => Promise<{ id: string }>;

function codeOf(error: unknown): string | undefined {
  return error && typeof error === 'object' && 'code' in error ? String((error as { code: unknown }).code) : undefined;
}

/**
 * Reads every pending item, one after another. Returns the final items and why it stopped early, if it did:
 * session expired (log in again), reader unavailable (3 failures in a row) or cancelled by the user.
 */
export async function runBatch(
  initial: BatchItem[],
  upload: Upload,
  onChange: (items: BatchItem[]) => void,
  signal: AbortSignal,
): Promise<{ items: BatchItem[]; stopped: BatchStop }> {
  let items = initial;
  const update = (id: number, patch: Partial<BatchItem>) => {
    items = items.map((item) => (item.id === id ? { ...item, ...patch } : item));
    onChange(items);
  };
  let failuresInARow = 0;

  for (const item of initial) {
    if (item.status !== 'pending') continue;
    if (signal.aborted) return { items, stopped: 'cancelled' };
    update(item.id, { status: 'reading' });
    try {
      const document = await upload(item.file, signal);
      failuresInARow = 0;
      update(item.id, { status: 'done', documentId: document.id });
    } catch (error) {
      if (signal.aborted) {
        update(item.id, { status: 'pending' });
        return { items, stopped: 'cancelled' };
      }
      failuresInARow += 1;
      update(item.id, { status: 'failed', message: error instanceof Error && error.message ? error.message : 'Foaia nu a putut fi citită.' });
      if (codeOf(error) === 'UNAUTHORIZED') return { items, stopped: 'session' };
      if (failuresInARow >= BATCH_MAX_CONSECUTIVE_FAILURES) return { items, stopped: 'unavailable' };
    }
  }
  return { items, stopped: null };
}
