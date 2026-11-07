// Fixture (synthetic demo) implementation of every care-scenario adapter.
// All adapters share ONE in-memory store: nothing is persisted, a page reload
// restarts the demo. Every adapter declares source 'fixture' so the UI labels the
// data as "Demo data"; this module is never used as a fallback for live errors.
// Data is clearly fictional ("Ana Test", "Dr. Demo Ionescu").
import { brand } from '../../../brand/brand.config.ts';
import type {
  CareCase,
  CareCaseAdapter,
  CaseStatus,
  CaseSummary,
  ConfirmedMedication,
  ContextItem,
  ContextKind,
  DecisionVariants,
  DoctorFeedback,
  ExtractedDocument,
  IntakeAdapter,
  IntakeMessage,
  IntakeResult,
  LocalDocument,
  MedicationSchedule,
  PatientContextAdapter,
  PersonRef,
  PrescriptionAdapter,
  ReviewedField,
  ScheduleAdapter,
  SummaryItem,
} from '../contracts.ts';
import {
  hasNegation,
  hasUncertainty,
  matchesRedFlag,
  matchesSummaryKeyword,
  RED_FLAG_MESSAGE,
} from './fixtureRules.ts';

export interface FixtureScenarioOptions {
  /** Clock used for every timestamp (tests pass a fixed clock). */
  now?: () => Date;
  /** Simulated latency per call, in ms. Default 250; tests use 0. */
  delayMs?: number;
  /** Name shown for assistant messages. Default: brand.assistantName. */
  assistantName?: string;
  /** The first non-emergency intake message gets no assistant reply (partial error demo). */
  failAssistantOnce?: boolean;
}

export interface FixtureScenario {
  context: PatientContextAdapter;
  intake: IntakeAdapter;
  prescription: PrescriptionAdapter;
  schedule: ScheduleAdapter;
  careCase: CareCaseAdapter;
  /** Restores the synthetic seed and cancels in-flight calls. */
  reset(): void;
}

export const FIXTURE_PATIENT: PersonRef = { id: 'fixture-patient-ana', fullName: 'Ana Test' };
export const FIXTURE_DOCTOR: PersonRef = { id: 'fixture-doctor-demo', fullName: 'Dr. Demo Ionescu' };
export const FIXTURE_CASE_ID = 'fixture-case-ana';
export const FEEDBACK_MAX_LENGTH = 4000;

// Scripted collection questions. They only collect information: no advice, no diagnosis.
const INTAKE_QUESTIONS = [
  'Când a început? Este suficientă o zi sau o oră aproximativă.',
  'Cât durează de fiecare dată sau a fost continuu de când a început?',
  'Pe o scară de la 0 (deloc) la 10 (cea mai puternică imaginabilă), cât de intens este în acest moment?',
  'Ați observat și alte simptome? Vă rugăm să le enumerați, chiar dacă par fără legătură.',
  'Ce medicamente luați în prezent, inclusiv produse fără prescripție? Scrieți „Nu știu” dacă nu sunteți sigur(ă).',
];
const INTAKE_DONE =
  'Vă mulțumim. Răspunsurile dumneavoastră au fost salvate pentru medic. Puteți adăuga orice altceva doriți să știe medicul, apoi trimiteți cazul.';
const ASSISTANT_FAILURE =
  'Asistentul nu a putut răspunde. Mesajul dumneavoastră a fost salvat; trimiteți-l din nou pentru a reîncerca răspunsul.';

// Synthetic printed prescription (fictional data) used by the extraction fixture.
const PRESCRIPTION_QUOTES = {
  name: 'Rp. Amlodipina 5 mg',
  dose: '5 mg',
  frequency: 'S: 1 cp dimineata',
  duration: '30 zile',
  date: 'Data: 06.11.2026',
};

interface Store {
  generation: number;
  seq: number;
  context: ContextItem[];
  messages: IntakeMessage[];
  /** Results of patient sends, keyed by clientMessageId (idempotency). */
  results: Map<string, IntakeResult>;
  assistantReplies: number;
  failAssistantPending: boolean;
  documents: ExtractedDocument[];
  reviews: Map<string, ReviewedField[]>;
  medications: ConfirmedMedication[];
  schedules: MedicationSchedule[];
  status: CaseStatus;
  submittedAt: string | null;
  summary: CaseSummary | null;
  feedback: DoctorFeedback | null;
  variants: DecisionVariants | null;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function abortError(): DOMException {
  return new DOMException('Operațiunea a fost anulată.', 'AbortError');
}

export function createFixtureScenario(options: FixtureScenarioOptions = {}): FixtureScenario {
  const now = options.now ?? (() => new Date());
  const delayMs = Math.max(0, options.delayMs ?? 250);
  const assistantName = options.assistantName ?? brand.assistantName;
  const iso = () => now().toISOString();

  const store: Store = createStore(0);

  function createStore(generation: number): Store {
    const at = iso();
    return {
      generation,
      seq: 0,
      context: seedContext(at),
      messages: [
        {
          id: 'fixture-msg-greeting',
          role: 'assistant',
          text: `Bună ziua, sunt ${assistantName}. Colectez informații pentru medicul dumneavoastră; nu stabilesc diagnostice și nu recomand tratamente. Ce doriți să le comunicați medicului dumneavoastră?`,
          createdAt: at,
        },
      ],
      results: new Map(),
      assistantReplies: 0,
      failAssistantPending: options.failAssistantOnce === true,
      documents: [],
      reviews: new Map(),
      medications: [],
      schedules: [],
      status: 'draft',
      submittedAt: null,
      summary: null,
      feedback: null,
      variants: null,
    };
  }

  function nextId(prefix: string): string {
    store.seq += 1;
    return `fixture-${prefix}-${store.seq}`;
  }

  /**
   * Runs `work` after the simulated delay and returns a copy of its result.
   * Rejects with AbortError when the signal aborts or the demo is reset meanwhile.
   */
  function run<T>(work: () => T, signal?: AbortSignal): Promise<T> {
    const generation = store.generation;
    return new Promise<T>((resolve, reject) => {
      if (signal?.aborted) {
        reject(abortError());
        return;
      }
      let timer: ReturnType<typeof setTimeout> | undefined;
      const onAbort = () => {
        if (timer !== undefined) clearTimeout(timer);
        reject(abortError());
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      const finish = () => {
        signal?.removeEventListener('abort', onAbort);
        if (signal?.aborted || generation !== store.generation) {
          reject(abortError());
          return;
        }
        try {
          resolve(clone(work()));
        } catch (error) {
          reject(error);
        }
      };
      if (delayMs > 0) timer = setTimeout(finish, delayMs);
      else queueMicrotask(finish);
    });
  }

  // ---------- Patient context ----------

  function findContextItem(id: string): ContextItem {
    const item = store.context.find((entry) => entry.id === id);
    if (!item) throw new Error('Acest element de context nu mai există.');
    return item;
  }

  const context: PatientContextAdapter = {
    source: 'fixture',
    load: (signal) => run(() => store.context, signal),
    add: (kind: ContextKind, text: string) =>
      run(() => {
        if (!['allergy', 'condition', 'medication'].includes(kind)) throw new Error('Tip de context necunoscut.');
        const trimmed = typeof text === 'string' ? text.trim() : '';
        if (!trimmed) throw new Error('Scrieți elementul înainte de a-l salva.');
        const at = iso();
        const item: ContextItem = {
          id: nextId('ctx'),
          kind,
          text: trimmed,
          source: { kind: 'patient-input', at },
          confirmation: { status: 'unconfirmed' },
        };
        store.context.push(item);
        return item;
      }),
    confirm: (id: string) =>
      run(() => {
        const item = findContextItem(id);
        if (item.confirmation.status === 'conflict') {
          throw new Error('Acest element este marcat ca neconcordanță. Medicul dumneavoastră îl va verifica; nu poate fi confirmat aici.');
        }
        item.confirmation = { status: 'confirmed', by: 'patient', at: iso() };
        return item;
      }),
    markUnknown: (id: string) =>
      run(() => {
        const item = findContextItem(id);
        item.confirmation = { status: 'unknown', by: 'patient', at: iso() };
        return item;
      }),
  };

  // ---------- Intake chat ----------

  function assistantReply(): IntakeMessage {
    const text = store.assistantReplies < INTAKE_QUESTIONS.length ? INTAKE_QUESTIONS[store.assistantReplies] : INTAKE_DONE;
    store.assistantReplies += 1;
    const message: IntakeMessage = { id: nextId('msg'), role: 'assistant', text, createdAt: iso() };
    store.messages.push(message);
    return message;
  }

  const intake: IntakeAdapter = {
    source: 'fixture',
    assistantName,
    load: (signal) => run(() => store.messages, signal),
    send: (text: string, clientMessageId: string) =>
      run(() => {
        if (typeof clientMessageId !== 'string' || !clientMessageId.trim()) throw new Error('Este necesar un identificator al mesajului.');
        const existing = store.results.get(clientMessageId);
        if (existing) {
          // Retry of a message already saved: never duplicate it. If only the reply failed, retry the reply.
          if (!existing.assistantMessage && !existing.redFlag && existing.partialError) {
            existing.assistantMessage = assistantReply();
            existing.partialError = null;
            delete existing.patientMessage.assistantFailed;
          }
          return existing;
        }
        const trimmed = typeof text === 'string' ? text.trim() : '';
        if (!trimmed) throw new Error('Scrieți un mesaj înainte de a-l trimite.');

        // 1. Persist the patient message first, whatever happens next.
        const patientMessage: IntakeMessage = {
          id: nextId('msg'),
          role: 'patient',
          text: trimmed,
          createdAt: iso(),
          clientMessageId,
        };
        store.messages.push(patientMessage);
        const result: IntakeResult = { patientMessage, assistantMessage: null, redFlag: null, partialError: null };
        store.results.set(clientMessageId, result);

        // 2. Deterministic safety rule before any assistant reply.
        if (matchesRedFlag(trimmed)) {
          result.redFlag = { message: RED_FLAG_MESSAGE };
          // Kept on the stored message so a reloaded history still shows the 112 notice.
          patientMessage.redFlag = { message: RED_FLAG_MESSAGE };
          return result;
        }
        // 3. Simulated assistant failure (explicit partial error, message kept).
        if (store.failAssistantPending) {
          store.failAssistantPending = false;
          result.partialError = ASSISTANT_FAILURE;
          patientMessage.assistantFailed = true;
          return result;
        }
        result.assistantMessage = assistantReply();
        return result;
      }),
  };

  // ---------- Prescription ----------

  const prescription: PrescriptionAdapter = {
    source: 'fixture',
    extract: (document: LocalDocument, signal) =>
      run(() => {
        if (!document || typeof document.fileName !== 'string') throw new Error('Nu a fost furnizat niciun document.');
        const illegible = document.fileName.toLowerCase().includes('illegible');
        const sourceQuotes: Record<string, string> = {
          'medications.0.name': PRESCRIPTION_QUOTES.name,
          'medications.0.duration': PRESCRIPTION_QUOTES.duration,
          'dates.0.value': PRESCRIPTION_QUOTES.date,
        };
        if (!illegible) {
          sourceQuotes['medications.0.dose'] = PRESCRIPTION_QUOTES.dose;
          sourceQuotes['medications.0.frequency'] = PRESCRIPTION_QUOTES.frequency;
        }
        const extracted: ExtractedDocument = {
          id: nextId('doc'),
          documentType: 'prescription',
          fileName: document.fileName,
          medications: [
            {
              name: 'Amlodipina',
              dose: illegible ? null : '5 mg',
              frequency: illegible ? null : '1 cp dimineata',
              duration: '30 zile',
            },
          ],
          dates: [{ label: 'Data prescrierii', value: '06.11.2026' }],
          warnings: illegible ? ['Doza și frecvența nu au putut fi citite'] : [],
          sourceQuotes,
          extractedAt: iso(),
        };
        store.documents.push(extracted);
        return extracted;
      }, signal),
    saveReview: (documentId: string, fields: ReviewedField[]) =>
      run(() => {
        if (!store.documents.some((doc) => doc.id === documentId)) throw new Error('Acest document nu a fost găsit.');
        if (!Array.isArray(fields)) throw new Error('Nu au fost furnizate câmpuri verificate.');
        const medications = buildConfirmedMedications(documentId, fields);
        store.reviews.set(documentId, clone(fields));
        store.medications = store.medications.filter((med) => med.documentId !== documentId).concat(medications);
        return medications;
      }),
    listConfirmed: (signal) => run(() => store.medications, signal),
  };

  function buildConfirmedMedications(documentId: string, fields: ReviewedField[]): ConfirmedMedication[] {
    const indexes = new Set<number>();
    for (const field of fields) {
      const match = /^medications\.(\d+)\./.exec(field.path);
      if (match) indexes.add(Number(match[1]));
    }
    if (indexes.size === 0) throw new Error('Nu au fost verificate câmpuri de medicament.');
    const confirmedAt = iso();
    return [...indexes]
      .sort((a, b) => a - b)
      .map((index) => {
        const own = fields.filter((field) => field.path.startsWith(`medications.${index}.`));
        const get = (key: string) => own.find((field) => field.path === `medications.${index}.${key}`);
        const required = (key: 'name' | 'dose' | 'frequency'): string => {
          const field = get(key);
          if (!field) throw new Error(`Medicamentul ${index + 1}: câmpul „${key}” lipsește.`);
          if (field.confirmation.status !== 'confirmed') throw new Error(`Medicamentul ${index + 1}: câmpul „${key}” nu este încă confirmat.`);
          if (field.value === null || !field.value.trim()) throw new Error(`Medicamentul ${index + 1}: câmpul „${key}” nu are valoare. Completați-l sau întrebați medicul dumneavoastră.`);
          return field.value;
        };
        const name = required('name');
        const doseText = required('dose');
        const instructionOriginal = required('frequency');
        const duration = get('duration');
        if (duration && duration.confirmation.status !== 'confirmed') {
          throw new Error(`Medicamentul ${index + 1}: durata nu este încă confirmată (confirmați-o sau confirmați că nu este indicată).`);
        }
        const durationText = duration && duration.value !== null && duration.value.trim() ? duration.value : null;
        return {
          id: nextId('med'),
          documentId,
          name,
          doseText,
          instructionOriginal,
          durationText,
          fields: clone(own),
          confirmedAt,
        };
      });
  }

  // ---------- Schedule ----------

  const schedule: ScheduleAdapter = {
    source: 'fixture',
    list: (signal) => run(() => store.schedules, signal),
    save: (input) =>
      run(() => {
        const saved: MedicationSchedule = { ...clone(input), id: nextId('schedule'), status: 'active', confirmedAt: iso() };
        store.schedules.push(saved);
        return saved;
      }),
    cancel: (id: string) =>
      run(() => {
        const found = store.schedules.find((entry) => entry.id === id);
        if (!found) throw new Error('Acest program nu a fost găsit.');
        found.status = 'cancelled';
        return found;
      }),
  };

  // ---------- Care case ----------

  function snapshot(): CareCase {
    return {
      id: FIXTURE_CASE_ID,
      status: store.status,
      patient: FIXTURE_PATIENT,
      doctor: FIXTURE_DOCTOR,
      submittedAt: store.submittedAt,
      messages: store.messages,
      documents: store.documents,
      context: store.context,
      medications: store.medications,
    };
  }

  function buildSummary(): CaseSummary {
    const items: SummaryItem[] = [];
    let counter = 0;
    for (const message of store.messages) {
      if (message.role !== 'patient' || !matchesSummaryKeyword(message.text)) continue;
      counter += 1;
      const item: SummaryItem = {
        id: `fixture-summary-item-${counter}`,
        text: `Pacientul a relatat: „${message.text}”`,
        sources: [{ kind: 'message', messageId: message.id, quote: message.text }],
      };
      if (hasNegation(message.text)) item.negated = true;
      if (hasUncertainty(message.text)) item.uncertain = true;
      items.push(item);
    }
    for (const med of store.medications) {
      counter += 1;
      const quote = med.fields.find((field) => field.path.endsWith('.name'))?.sourceQuote;
      const label = store.documents.find((doc) => doc.id === med.documentId)?.fileName || 'Rețetă';
      items.push({
        id: `fixture-summary-item-${counter}`,
        text: `Medicament confirmat de pacient dintr-o rețetă verificată: ${med.name} ${med.doseText}, "${med.instructionOriginal}"${med.durationText ? `, ${med.durationText}` : ''}`,
        sources: [{ kind: 'document', documentId: med.documentId, label, ...(quote ? { quote } : {}) }],
      });
    }
    return { version: 1, createdAt: iso(), generatedBy: 'fixture', items };
  }

  function requireSubmitted(action: string): void {
    if (store.status === 'draft') throw new Error(`Cazul nu a fost încă trimis medicului, așa că ${action} nu este disponibil.`);
  }

  const careCase: CareCaseAdapter = {
    source: 'fixture',
    getCase: (signal) => run(snapshot, signal),
    submit: () =>
      run(() => {
        if (store.status === 'draft') {
          if (!store.messages.some((message) => message.role === 'patient')) {
            throw new Error('Adăugați cel puțin un mesaj înainte de a trimite cazul medicului dumneavoastră.');
          }
          store.status = 'pending_doctor';
          store.submittedAt = iso();
          store.summary = buildSummary();
        }
        return snapshot();
      }),
    getSummary: (signal) => run(() => store.summary, signal),
    getFeedback: (signal) => run(() => store.feedback, signal),
    sendFeedback: (text: string, basedOnVariant: number | null) =>
      run(() => {
        requireSubmitted('răspunsul');
        const trimmed = typeof text === 'string' ? text.trim() : '';
        if (!trimmed) throw new Error('Scrieți răspunsul înainte de a-l trimite.');
        if (trimmed.length > FEEDBACK_MAX_LENGTH) throw new Error(`Răspunsul poate avea cel mult ${FEEDBACK_MAX_LENGTH} de caractere.`);
        if (basedOnVariant !== null) {
          const count = store.variants?.options.length ?? 0;
          if (!Number.isInteger(basedOnVariant) || basedOnVariant < 0 || basedOnVariant >= count) {
            throw new Error('Varianta selectată nu există. Solicitați mai întâi variantele.');
          }
        }
        const feedback: DoctorFeedback = {
          id: nextId('feedback'),
          caseId: FIXTURE_CASE_ID,
          doctor: FIXTURE_DOCTOR,
          text: trimmed,
          createdAt: iso(),
          basedOnVariant,
        };
        store.feedback = feedback;
        store.status = 'answered';
        return feedback;
      }),
    requestVariants: () =>
      run(() => {
        requireSubmitted('suportul decizional');
        const variants: DecisionVariants = {
          generatedBy: 'fixture',
          createdAt: iso(),
          options: [
            {
              option: 'Opțiunea demo 1 (sintetică): solicitarea de la pacient a valorilor tensiunii arteriale măsurate acasă timp de 7 zile, înainte de decizie.',
              reasoning: 'Text demo sintetic, scris în prealabil; nu a fost generat pe baza acestui caz.',
              confidence: 'Nu se aplică (date demo)',
              confirmationPath: 'Medicul verifică valorile și decide.',
            },
            {
              option: 'Opțiunea demo 2 (sintetică): invitarea pacientului la o consultație în persoană pentru evaluarea simptomelor și a medicației actuale.',
              reasoning: 'Text demo sintetic, scris în prealabil; nu a fost generat pe baza acestui caz.',
              confidence: 'Nu se aplică (date demo)',
              confirmationPath: 'Medicul examinează pacientul și decide.',
            },
            {
              option: 'Opțiunea demo 3 (sintetică): adresarea unor întrebări suplimentare pacientului înainte de orice recomandare.',
              reasoning: 'Text demo sintetic, scris în prealabil; nu a fost generat pe baza acestui caz.',
              confidence: 'Nu se aplică (date demo)',
              confirmationPath: 'Medicul citește răspunsurile și decide.',
            },
          ],
          // Listed from stored statuses only; nothing is inferred from text.
          missingInformation: store.context
            .filter((item) => item.confirmation.status === 'unknown')
            .map((item) => `${item.kind}: ${item.text}`),
          contradictions: store.context
            .filter((item) => item.confirmation.status === 'conflict')
            .map((item) => `${item.kind}: ${item.text}${item.note ? ` (${item.note})` : ''}`),
        };
        store.variants = variants;
        return variants;
      }),
  };

  return {
    context,
    intake,
    prescription,
    schedule,
    careCase,
    reset() {
      Object.assign(store, createStore(store.generation + 1));
    },
  };
}

function seedContext(at: string): ContextItem[] {
  const patientInput = { kind: 'patient-input' as const, at };
  return [
    {
      id: 'fixture-ctx-allergy-penicillin',
      kind: 'allergy',
      text: 'Penicillin',
      source: patientInput,
      confirmation: { status: 'confirmed', by: 'patient', at },
    },
    {
      id: 'fixture-ctx-condition-hbp',
      kind: 'condition',
      text: 'Tensiune arterială mare',
      source: patientInput,
      confirmation: { status: 'unconfirmed' },
    },
    {
      id: 'fixture-ctx-medication-unknown',
      kind: 'medication',
      text: 'Medicația actuală nu a fost încă furnizată',
      source: patientInput,
      confirmation: { status: 'unknown' },
    },
    {
      id: 'fixture-ctx-conflict-synthetic',
      kind: 'allergy',
      text: 'Alergie la aspirină: răspuns „da” într-un formular și „nu” în altul',
      source: patientInput,
      confirmation: { status: 'conflict' },
      note: 'Neconcordanță sintetică pentru demonstrație (etichetată); nu a fost detectată automat.',
    },
  ];
}
