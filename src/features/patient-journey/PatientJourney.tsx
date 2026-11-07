import { useAuth } from '../../auth/authContext';
import { LocalChat } from '../local-chat/LocalChatPage';
import { ConnectStage } from './ConnectStage';
import { journeyStage, type JourneyStage } from './journeyLogic';
import './patient-journey.css';

const STEPS: readonly { stage: JourneyStage; label: string }[] = [
  { stage: 'connect', label: 'Conectare la medic' },
  { stage: 'chat', label: 'Discuție cu asistentul' },
];

/**
 * Patient side of the first product: connect (QR) -> chat.
 * One active step at a time, large text and plain wording, so an older patient can
 * complete it with a little help from a relative.
 *
 * The chat opens as soon as a doctor is connected. It talks to the local agent through the
 * Backend (POST /demo/local-intake). That conversation is synthetic and is NOT saved or sent to
 * the doctor yet; the persisted case messages live in CaseInbox. Medical data is deliberately
 * NOT kept in browser storage; persistence belongs to the backend.
 */
export function PatientJourney() {
  const { profile } = useAuth();
  const doctorCount = profile?.activeDoctors.length ?? 0;
  const stage = journeyStage({ doctorCount });
  const activeIndex = STEPS.findIndex((step) => step.stage === stage);

  return (
    <div className="journey">
      <p className="journey__progress" aria-live="polite">Pasul {activeIndex + 1} din {STEPS.length}: {STEPS[activeIndex]?.label}</p>
      {stage === 'connect' && <ConnectStage />}
      {stage === 'chat' && <LocalChat />}
    </div>
  );
}
