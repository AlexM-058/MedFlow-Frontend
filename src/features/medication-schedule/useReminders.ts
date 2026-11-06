import { useCallback, useEffect, useRef, useState } from 'react';
import type { MedicationSchedule } from '../care-scenario/contracts';
import {
  canShowSystemNotification,
  dueDoses,
  mapNotificationPermission,
  SYSTEM_NOTIFICATION,
  type DoseOccurrence,
  type ReminderPermission,
} from './scheduleLogic';

/** How often the page checks for reached dose times while it is open. */
const CHECK_INTERVAL_MS = 15_000;

function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

function readPermission(): ReminderPermission {
  const supported = notificationsSupported();
  return mapNotificationPermission({
    supported,
    secureContext: typeof window !== 'undefined' && window.isSecureContext,
    permission: supported ? Notification.permission : undefined,
  });
}

export interface TakenDose {
  dose: DoseOccurrence;
  markedAt: number;
}

/**
 * In-page reminders only: a timer while the page is open (no service worker, no
 * background or lock-screen delivery). Each dose fires once per page session.
 */
export function useReminders(schedules: readonly MedicationSchedule[], now: () => Date) {
  const [permission, setPermission] = useState<ReminderPermission>(readPermission);
  const [requesting, setRequesting] = useState(false);
  const [banners, setBanners] = useState<DoseOccurrence[]>([]);
  const [taken, setTaken] = useState<TakenDose[]>([]);
  const [systemFailed, setSystemFailed] = useState(false);
  const [nowMs, setNowMs] = useState(() => now().getTime());
  const firedRef = useRef(new Set<string>());
  const lastCheckRef = useRef<number | null>(null);

  useEffect(() => {
    if (lastCheckRef.current === null) lastCheckRef.current = now().getTime();

    const check = () => {
      const current = now();
      const last = lastCheckRef.current ?? current.getTime();
      const due = dueDoses(schedules, new Date(last), current, firedRef.current);
      lastCheckRef.current = current.getTime();
      setNowMs(current.getTime());
      if (due.length === 0) return;
      for (const dose of due) firedRef.current.add(dose.key);
      setBanners((previous) => [...previous, ...due]);
      if (canShowSystemNotification(permission)) {
        try {
          // Generic text only: never the medication name, dose or time on the lock screen.
          new Notification(SYSTEM_NOTIFICATION.title, { body: SYSTEM_NOTIFICATION.body, tag: SYSTEM_NOTIFICATION.tag });
        } catch {
          // Some mobile browsers only allow notifications from a service worker.
          setSystemFailed(true);
        }
      }
    };

    const interval = window.setInterval(check, CHECK_INTERVAL_MS);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [schedules, now, permission]);

  /** Asks for permission; called only from the user's click. */
  const requestPermission = useCallback(async () => {
    if (!notificationsSupported()) {
      setPermission('unsupported');
      return;
    }
    setRequesting(true);
    try {
      const result = await Notification.requestPermission();
      setPermission(mapNotificationPermission({ supported: true, secureContext: window.isSecureContext, permission: result }));
    } catch {
      setPermission(readPermission());
    } finally {
      setRequesting(false);
    }
  }, []);

  const dismiss = useCallback((key: string) => {
    setBanners((previous) => previous.filter((dose) => dose.key !== key));
  }, []);

  const markTaken = useCallback(
    (key: string) => {
      const dose = banners.find((item) => item.key === key);
      if (!dose) return;
      setBanners((previous) => previous.filter((item) => item.key !== key));
      setTaken((list) => [...list, { dose, markedAt: now().getTime() }]);
    },
    [banners, now],
  );

  const dismissSchedule = useCallback((scheduleId: string) => {
    setBanners((previous) => previous.filter((dose) => dose.scheduleId !== scheduleId));
  }, []);

  return { permission, requesting, requestPermission, banners, taken, dismiss, markTaken, dismissSchedule, systemFailed, nowMs };
}
