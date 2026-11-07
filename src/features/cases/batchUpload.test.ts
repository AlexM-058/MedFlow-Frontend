import { BATCH_MAX_FILES, createBatch, precheck, retryable, runBatch, summarizeBatch, type BatchItem } from './batchUpload.ts';

const failures: string[] = [];
let passed = 0;
function check(name: string, ok: boolean) {
  if (ok) passed++;
  else failures.push(name);
}

const png = (name: string, size = 100) => new File([new Uint8Array(size).fill(1)], name, { type: 'image/png' });
const never = new AbortController().signal;

async function main() {
  // Pre-check: only what the server accepts is ever sent.
  check('jpg ok', precheck(new File(['x'], 'a.jpg', { type: 'image/jpeg' })) === null);
  check('heic refused', precheck(new File(['x'], 'a.heic', { type: 'image/heic' })) !== null);
  check('empty refused', precheck(new File([], 'a.png', { type: 'image/png' })) !== null);
  check('over 10 MB refused', precheck({ type: 'image/png', size: 11 * 1024 * 1024 } as File) !== null);
  const created = createBatch([png('1.png'), new File(['x'], 'b.txt', { type: 'text/plain' })]);
  check('refused file is failed at once with a reason', created[1]?.status === 'failed' && !!created[1]?.message);
  check('batch is capped', createBatch(Array.from({ length: 60 }, (_, i) => png(`${i}.png`))).length === BATCH_MAX_FILES);

  // All sheets are read one after another, never two at once.
  let running = 0;
  let maxRunning = 0;
  const order: string[] = [];
  const upload = async (file: File) => {
    running += 1; maxRunning = Math.max(maxRunning, running); order.push(file.name);
    await new Promise((resolve) => setTimeout(resolve, 2));
    running -= 1;
    return { id: `doc-${file.name}` };
  };
  const seen: BatchItem[][] = [];
  const all = await runBatch(createBatch(['1', '2', '3', '4'].map((n) => png(`${n}.png`))), upload, (items) => seen.push(items), never);
  check('every sheet is done', summarizeBatch(all.items).done === 4 && all.stopped === null);
  check('strictly sequential', maxRunning === 1 && order.join() === '1.png,2.png,3.png,4.png');
  check('progress is reported', seen.length >= 8 && seen.some((items) => items.some((item) => item.status === 'reading')));
  check('document ids are kept', all.items[2]?.documentId === 'doc-3.png');

  // One failing sheet does not stop the others, and it can be retried.
  let attempt = 0;
  const flaky = async (file: File) => {
    if (file.name === '2.png' && attempt++ === 0) throw new Error('Nu am putut citi documentul.');
    return { id: `doc-${file.name}` };
  };
  const first = await runBatch(createBatch([png('1.png'), png('2.png'), png('3.png')]), flaky, () => {}, never);
  check('the rest continues after one failure', first.items[0]?.status === 'done' && first.items[1]?.status === 'failed' && first.items[2]?.status === 'done');
  check('the failure keeps its reason', first.items[1]?.message === 'Nu am putut citi documentul.');
  const second = await runBatch(retryable(first.items), flaky, () => {}, never);
  check('retry reads only the failed sheet', second.items.every((item) => item.status === 'done') && attempt === 2);
  check('a pre-check failure is not retried', retryable(createBatch([new File(['x'], 'b.txt', { type: 'text/plain' })]))[0]?.status === 'failed');

  // Stops: expired session at once; reader down after three failures in a row.
  const expired = await runBatch(createBatch([png('1.png'), png('2.png')]), async () => { throw Object.assign(new Error('Sesiune'), { code: 'UNAUTHORIZED' }); }, () => {}, never);
  check('session expiry stops the batch', expired.stopped === 'session' && expired.items[1]?.status === 'pending');
  const down = await runBatch(createBatch(Array.from({ length: 6 }, (_, i) => png(`${i}.png`))), async () => { throw new Error('indisponibil'); }, () => {}, never);
  check('three failures in a row stop the batch', down.stopped === 'unavailable' && summarizeBatch(down.items).failed === 3 && summarizeBatch(down.items).pending === 3);

  // Cancel: the running sheet goes back to pending, nothing else is started.
  const controller = new AbortController();
  const cancelled = await runBatch(createBatch([png('1.png'), png('2.png'), png('3.png')]), async (file) => {
    if (file.name === '2.png') controller.abort();
    if (controller.signal.aborted) throw new Error('abort');
    return { id: file.name };
  }, () => {}, controller.signal);
  check('cancel stops cleanly', cancelled.stopped === 'cancelled' && cancelled.items[0]?.status === 'done'
    && cancelled.items[1]?.status === 'pending' && cancelled.items[2]?.status === 'pending');

  console.log(`${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) throw new Error(`Failed: ${failures.join('; ')}`);
}

await main();
