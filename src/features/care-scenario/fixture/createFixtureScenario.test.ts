// Run: node --experimental-strip-types --no-warnings src/features/care-scenario/fixture/createFixtureScenario.test.ts
import { assertEqual, assertTrue, finish, test } from '../../connections/testHarness.ts';
import type { ReviewedField } from '../contracts.ts';
import { createFixtureScenario, RED_FLAG_MESSAGE } from './index.ts';

const clock = () => new Date('2026-11-07T09:00:00.000Z');
const make = (extra: Parameters<typeof createFixtureScenario>[0] = {}) =>
  createFixtureScenario({ now: clock, delayMs: 0, assistantName: 'Demo Assistant', ...extra });

/** The harness is synchronous: run the async body first, then record the outcome. */
async function check(name: string, body: () => Promise<void>): Promise<void> {
  let failure: unknown = null;
  try { await body(); } catch (error) { failure = error; }
  test(name, () => { if (failure) throw failure; });
}

async function rejects(promise: Promise<unknown>, match?: (error: unknown) => boolean): Promise<unknown> {
  try { await promise; } catch (error) {
    if (match && !match(error)) throw new Error(`unexpected error: ${String(error)}`, { cause: error });
    return error;
  }
  throw new Error('expected a rejection');
}
const isAbort = (error: unknown) => error instanceof DOMException && error.name === 'AbortError';

function fieldsFor(documentId: string, values: Partial<Record<'name' | 'dose' | 'frequency' | 'duration', string | null>>, status: 'confirmed' | 'unconfirmed' = 'confirmed'): ReviewedField[] {
  void documentId;
  return (['name', 'dose', 'frequency', 'duration'] as const)
    .filter((key) => key in values)
    .map((key) => ({
      path: `medications.0.${key}`,
      label: key,
      extracted: values[key] ?? null,
      value: values[key] ?? null,
      confirmation: { status, by: 'patient', at: clock().toISOString() },
    }));
}

const run = async () => {
  await check('every adapter is labelled as fixture', async () => {
    const s = make();
    for (const adapter of [s.context, s.intake, s.prescription, s.schedule, s.careCase]) assertEqual(adapter.source, 'fixture');
    assertEqual(s.intake.assistantName, 'Demo Assistant');
  });

  await check('seed context: confirmed allergy, unknown medication and labelled synthetic conflict', async () => {
    const items = await make().context.load();
    const allergy = items.find((item) => item.text === 'Penicillin');
    assertEqual(allergy?.confirmation.status, 'confirmed');
    assertEqual(items.find((item) => item.kind === 'medication')?.confirmation.status, 'unknown');
    const conflicts = items.filter((item) => item.confirmation.status === 'conflict');
    assertEqual(conflicts.length, 1);
    assertEqual(conflicts[0].note, 'Synthetic conflict for the demo (labelled); not detected automatically.');
  });

  await check('returned objects are copies of the store', async () => {
    const s = make();
    const items = await s.context.load();
    items[0].text = 'changed';
    assertEqual((await s.context.load())[0].text, 'Penicillin');
  });

  await check('context add, confirm and markUnknown keep the item', async () => {
    const s = make();
    const added = await s.context.add('condition', '  Asthma  ');
    assertEqual(added.text, 'Asthma');
    assertEqual(added.confirmation.status, 'unconfirmed');
    assertEqual((await s.context.confirm(added.id)).confirmation, { status: 'confirmed', by: 'patient', at: '2026-11-07T09:00:00.000Z' });
    const unknown = await s.context.markUnknown(added.id);
    assertEqual([unknown.text, unknown.confirmation.status], ['Asthma', 'unknown']);
    await rejects(s.context.add('allergy', '   '));
    await rejects(s.context.confirm('fixture-ctx-conflict-synthetic'));
  });

  await check('idempotent retry: same clientMessageId never duplicates the message', async () => {
    const s = make();
    const first = await s.intake.send('Ma doare capul de ieri', 'client-1');
    const retry = await s.intake.send('Ma doare capul de ieri', 'client-1');
    assertEqual(retry.patientMessage.id, first.patientMessage.id);
    assertEqual(retry.assistantMessage?.id, first.assistantMessage?.id);
    const patientMessages = (await s.intake.load()).filter((m) => m.role === 'patient');
    assertEqual(patientMessages.length, 1);
    assertEqual(patientMessages[0].clientMessageId, 'client-1');
    assertTrue(first.assistantMessage?.text.startsWith('When did this start'), 'first scripted question');
  });

  await check('red flag (RO with diacritics) stores the patient message and gives no reply', async () => {
    const s = make();
    const result = await s.intake.send('Am o durere în piept de o oră', 'client-rf');
    assertEqual(result.redFlag, { message: RED_FLAG_MESSAGE });
    assertTrue(RED_FLAG_MESSAGE.includes('112'), 'mentions 112');
    assertEqual(result.assistantMessage, null);
    const messages = await s.intake.load();
    const stored = messages.find((m) => m.id === result.patientMessage.id);
    assertEqual(stored?.redFlag, { message: RED_FLAG_MESSAGE }, 'red flag kept on the stored message');
    assertEqual(result.patientMessage.redFlag, { message: RED_FLAG_MESSAGE });
    assertEqual((await s.careCase.getCase()).messages.find((m) => m.id === result.patientMessage.id)?.redFlag, { message: RED_FLAG_MESSAGE });
    assertEqual(messages.filter((m) => m.role === 'assistant').length, 1, 'only the greeting');
  });

  await check('red flag rules (EN and RO without diacritics)', async () => {
    const s = make();
    for (const [i, text] of ['I cannot breathe', 'nu pot respira', 'durere in piept', 'dureri puternice în piept', 'Mă doare pieptul', 'chest pain since morning', 'slurred speech', 'paralizie la mana', 'I want to kill myself'].entries()) {
      assertTrue((await s.intake.send(text, `rf-${i}`)).redFlag, text);
    }
    assertEqual((await s.intake.send('Am tuse de doua zile', 'normal')).redFlag, null);
  });

  await check('partial error: patient message saved, no reply, retry gets the reply without duplicate', async () => {
    const s = make({ failAssistantOnce: true });
    const result = await s.intake.send('Am febra', 'client-fail');
    assertEqual(result.assistantMessage, null);
    assertTrue(result.partialError, 'partial error set');
    assertEqual(result.redFlag, null);
    assertEqual((await s.intake.load()).find((m) => m.id === result.patientMessage.id)?.assistantFailed, true, 'failure kept in history');
    assertEqual((await s.careCase.getCase()).messages.find((m) => m.id === result.patientMessage.id)?.assistantFailed, true);
    const retry = await s.intake.send('Am febra', 'client-fail');
    assertEqual(retry.patientMessage.id, result.patientMessage.id);
    assertTrue(retry.assistantMessage, 'reply after retry');
    assertEqual(retry.partialError, null);
    assertEqual((await s.intake.load()).filter((m) => m.role === 'patient').length, 1);
    assertEqual((await s.intake.load()).find((m) => m.id === result.patientMessage.id)?.assistantFailed, undefined, 'cleared after the reply');
    assertTrue((await s.intake.send('Si tuse', 'next')).assistantMessage, 'fails only once');
  });

  await check('prescription extract returns the synthetic prescription with quotes', async () => {
    const doc = await make().prescription.extract({ uri: 'blob:x', mimeType: 'image/jpeg', fileName: 'reteta.jpg' });
    assertEqual(doc.medications, [{ name: 'Amlodipina', dose: '5 mg', frequency: '1 cp dimineata', duration: '30 zile' }]);
    assertEqual(doc.dates, [{ label: 'Data prescrierii', value: '06.11.2026' }]);
    assertEqual(doc.warnings, []);
    for (const key of ['name', 'dose', 'frequency', 'duration']) assertTrue(doc.sourceQuotes[`medications.0.${key}`], key);
  });

  await check('illegible prescription: null dose and frequency, warning, no quotes for them', async () => {
    const doc = await make().prescription.extract({ uri: 'blob:x', mimeType: 'image/png', fileName: 'Reteta-ILLEGIBLE.png' });
    assertEqual([doc.medications[0].dose, doc.medications[0].frequency], [null, null]);
    assertEqual(doc.warnings, ['Dose and frequency could not be read']);
    assertEqual(doc.sourceQuotes['medications.0.dose'], undefined);
    assertEqual(doc.sourceQuotes['medications.0.frequency'], undefined);
  });

  await check('saveReview rejects incomplete or unconfirmed fields', async () => {
    const s = make();
    const doc = await s.prescription.extract({ uri: 'blob:x', mimeType: 'image/png', fileName: 'illegible.png' });
    const missingDose = await rejects(s.prescription.saveReview(doc.id, fieldsFor(doc.id, { name: 'Amlodipina', dose: null, frequency: '1 cp dimineata' })));
    assertTrue(String(missingDose).includes('dose'), 'names the dose');
    await rejects(s.prescription.saveReview(doc.id, fieldsFor(doc.id, { name: 'Amlodipina', dose: '5 mg', frequency: '1 cp dimineata' }, 'unconfirmed')));
    await rejects(s.prescription.saveReview(doc.id, fieldsFor(doc.id, { name: 'Amlodipina', dose: '5 mg' })));
    await rejects(s.prescription.saveReview('missing-doc', fieldsFor('x', { name: 'A', dose: '1', frequency: 'f' })));
    assertEqual((await s.prescription.listConfirmed()).length, 0);
  });

  await check('saveReview copies reviewed values verbatim into a confirmed medication', async () => {
    const s = make();
    const doc = await s.prescription.extract({ uri: 'blob:x', mimeType: 'image/png', fileName: 'reteta.png' });
    const meds = await s.prescription.saveReview(doc.id, fieldsFor(doc.id, { name: 'Amlodipina', dose: '5 mg', frequency: '1 cp dimineata', duration: '30 zile' }));
    assertEqual(meds.length, 1);
    assertEqual([meds[0].name, meds[0].doseText, meds[0].instructionOriginal, meds[0].durationText], ['Amlodipina', '5 mg', '1 cp dimineata', '30 zile']);
    assertEqual((await s.prescription.listConfirmed()).length, 1);
    await s.prescription.saveReview(doc.id, fieldsFor(doc.id, { name: 'Amlodipina', dose: '5 mg', frequency: '1 cp dimineata', duration: null }));
    const listed = await s.prescription.listConfirmed();
    assertEqual(listed.length, 1, 're-review replaces');
    assertEqual(listed[0].durationText, null);
  });

  await check('schedule save, list and cancel', async () => {
    const s = make();
    const saved = await s.schedule.save({
      medicationId: 'm', medication: 'Amlodipina', doseText: '5 mg', instructionOriginal: '1 cp dimineata',
      times: ['08:00'], startDate: '2026-11-07', endDate: '2026-12-06', timezone: 'Europe/Bucharest',
    });
    assertEqual([saved.status, saved.confirmedAt], ['active', '2026-11-07T09:00:00.000Z']);
    assertEqual((await s.schedule.cancel(saved.id)).status, 'cancelled');
    assertEqual((await s.schedule.list())[0].status, 'cancelled');
  });

  await check('submit requires a patient message; summary null before submit', async () => {
    const s = make();
    await rejects(s.careCase.submit());
    assertEqual(await s.careCase.getSummary(), null);
    assertEqual((await s.careCase.getCase()).status, 'draft');
  });

  await check('summary: negation and uncertainty kept; uncovered message stays uncited', async () => {
    const s = make();
    const negated = await s.intake.send('Nu am febră', 'a');
    const uncertain = await s.intake.send('Poate de ieri ma doare capul', 'b');
    const other = await s.intake.send('Multumesc frumos', 'c');
    const doc = await s.prescription.extract({ uri: 'blob:x', mimeType: 'image/png', fileName: 'reteta.png' });
    await s.prescription.saveReview(doc.id, fieldsFor(doc.id, { name: 'Amlodipina', dose: '5 mg', frequency: '1 cp dimineata', duration: '30 zile' }));
    const submitted = await s.careCase.submit();
    assertEqual(submitted.status, 'pending_doctor');
    assertEqual(submitted.submittedAt, '2026-11-07T09:00:00.000Z');
    const summary = await s.careCase.getSummary();
    assertTrue(summary, 'summary exists');
    assertEqual(summary!.generatedBy, 'fixture');
    const cites = (id: string) => summary!.items.find((item) => item.sources.some((src) => src.kind === 'message' && src.messageId === id));
    const neg = cites(negated.patientMessage.id);
    assertEqual(neg?.text, 'Patient reported: "Nu am febră"');
    assertEqual(neg?.negated, true);
    assertEqual(neg?.sources[0], { kind: 'message', messageId: negated.patientMessage.id, quote: 'Nu am febră' });
    assertEqual(cites(uncertain.patientMessage.id)?.uncertain, true);
    assertEqual(cites(uncertain.patientMessage.id)?.negated, undefined);
    assertEqual(cites(other.patientMessage.id), undefined, 'uncovered message is not cited');
    assertTrue(summary!.items.some((item) => item.sources.some((src) => src.kind === 'document' && src.documentId === doc.id && src.label === 'reteta.png')), 'medication cites the document with its label');
  });

  await check('variants only after submit; feedback answers the case', async () => {
    const s = make();
    await rejects(s.careCase.requestVariants!());
    await rejects(s.careCase.sendFeedback('Too early', null));
    await s.intake.send('I have had a headache since yesterday', 'x');
    await s.careCase.submit();
    const variants = await s.careCase.requestVariants!();
    assertEqual(variants.options.length, 3);
    assertEqual(variants.generatedBy, 'fixture');
    assertEqual(variants.contradictions.length, 1);
    assertTrue(variants.missingInformation.some((entry) => entry.includes('Current medication not yet provided')), 'missing info');
    await rejects(s.careCase.sendFeedback('   ', null));
    await rejects(s.careCase.sendFeedback('x'.repeat(4001), null));
    await rejects(s.careCase.sendFeedback('Ok', 5));
    await rejects(s.careCase.sendFeedback('Ok', 3), undefined);
    const feedback = await s.careCase.sendFeedback('  Please measure your blood pressure daily and come on Monday.  ', 1);
    assertEqual(feedback.text, 'Please measure your blood pressure daily and come on Monday.');
    assertEqual(feedback.doctor, { id: 'fixture-doctor-demo', fullName: 'Dr. Demo Ionescu' });
    assertEqual(feedback.basedOnVariant, 1, '0-based index into options');
    assertEqual((await s.careCase.sendFeedback('First option', 0)).basedOnVariant, 0);
    assertEqual((await s.careCase.getFeedback())?.text, 'First option', 'latest feedback');
    assertEqual((await s.careCase.getCase()).status, 'answered');
  });

  await check('abort: aborted signal rejects with AbortError', async () => {
    const s = make({ delayMs: 20 });
    const before = new AbortController();
    before.abort();
    await rejects(s.context.load(before.signal), isAbort);
    const during = new AbortController();
    const pending = s.careCase.getCase(during.signal);
    during.abort();
    await rejects(pending, isAbort);
  });

  await check('reset restores the seed and cancels in-flight calls', async () => {
    const s = make({ delayMs: 10 });
    await s.intake.send('Am tuse', 'r1');
    const pending = s.intake.load();
    s.reset();
    await rejects(pending, isAbort);
    assertEqual((await s.intake.load()).filter((m) => m.role === 'patient').length, 0);
    assertEqual((await s.careCase.getCase()).status, 'draft');
  });

  finish();
};

await run();
