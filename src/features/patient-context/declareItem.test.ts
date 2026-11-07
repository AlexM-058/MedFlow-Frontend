import { declareItem, KINDS, KIND_LABELS, MAX_ITEM_LENGTH, validItemText, type DeclareApi } from './declareItem.ts';
import type { ContextItem, ContextKind } from '../care-scenario/contracts.ts';

const failures: string[] = [];
let passed = 0;
function check(name: string, ok: boolean) {
  if (ok) passed++;
  else failures.push(name);
}

const item = (id: string, kind: ContextKind, text: string, status = 'unconfirmed'): ContextItem => ({
  id, kind, text, source: { kind: 'patient-input', at: '2026-11-07T10:00:00Z' }, confirmation: { status } as ContextItem['confirmation'],
}) as ContextItem;

function fakeApi(options: { addFails?: boolean; confirmFails?: boolean } = {}) {
  const calls: string[] = [];
  const api: DeclareApi = {
    async add(kind, text) { calls.push(`add:${kind}:${text}`); if (options.addFails) throw new Error('offline'); return item('i1', kind, text); },
    async confirm(id) { calls.push(`confirm:${id}`); if (options.confirmFails) throw new Error('offline'); return item(id, 'allergy', 'penicilină', 'confirmed'); },
  };
  return { api, calls };
}

async function main() {
  check('all three kinds have a label', KINDS.length === 3 && KINDS.every((kind) => KIND_LABELS[kind].length > 0));
  check('text is trimmed', validItemText('  penicilină  ') === 'penicilină');
  check('empty or blank text is refused', validItemText('') === null && validItemText('   ') === null);
  check('text over the limit is refused, the limit itself is accepted', validItemText('x'.repeat(MAX_ITEM_LENGTH + 1)) === null && validItemText('x'.repeat(MAX_ITEM_LENGTH)) !== null);

  const ok = fakeApi();
  const done = await declareItem(ok.api, 'allergy', '  penicilină ');
  check('saved with the trimmed text, then confirmed', ok.calls.join() === 'add:allergy:penicilină,confirm:i1');
  check('the result is the confirmed item', done.confirmed && done.item.confirmation.status === 'confirmed');

  const noConfirm = await declareItem(fakeApi({ confirmFails: true }).api, 'condition', 'diabet');
  check('if only the confirmation fails the item is kept and reported as unconfirmed', !noConfirm.confirmed && noConfirm.item.text === 'diabet');

  const blank = fakeApi();
  let refused = '';
  try { await declareItem(blank.api, 'medication', '   '); } catch (error) { refused = (error as Error).message; }
  check('blank text never reaches the server', /Scrieți/.test(refused) && blank.calls.length === 0);

  const failing = fakeApi({ addFails: true });
  let failed = false;
  try { await declareItem(failing.api, 'allergy', 'penicilină'); } catch { failed = true; }
  check('a failed save is an error and nothing is confirmed', failed && failing.calls.join() === 'add:allergy:penicilină');

  console.log(`${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) throw new Error(`Failed: ${failures.join('; ')}`);
}

await main();
