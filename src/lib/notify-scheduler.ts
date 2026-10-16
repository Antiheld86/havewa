import { runAllNotifications } from "@/server/notifications";

// E-Mail-Benachrichtigungen (#77): alle 5 Minuten das neue Zeitfenster prüfen.
// ponytail: ein Prozess (wie Bank-/IMAP-Job); bei mehreren Instanzen doppelte Mails, dann Lock nötig.

const TICK_MS = 5 * 60_000;
const g = globalThis as unknown as { __havewaNotifyTimer?: ReturnType<typeof setInterval>; __havewaNotifyRunning?: boolean };

async function tick() {
  if (g.__havewaNotifyRunning) return;
  g.__havewaNotifyRunning = true;
  try {
    await runAllNotifications();
  } catch (e) {
    console.warn("[notify] Lauf fehlgeschlagen:", e instanceof Error ? e.message : e);
  } finally {
    g.__havewaNotifyRunning = false;
  }
}

/** Startet den Benachrichtigungs-Job genau einmal pro Prozess. */
export function startNotifyScheduler() {
  if (g.__havewaNotifyTimer) return;
  g.__havewaNotifyTimer = setInterval(() => void tick(), TICK_MS);
  g.__havewaNotifyTimer.unref?.();
  setTimeout(() => void tick(), 60_000).unref?.();
}
