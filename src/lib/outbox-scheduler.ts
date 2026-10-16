import { deliverDue } from "@/server/outbox";

// Postausgang (#79): geplante E-Mails und Briefe minütlich versenden.
// ponytail: ein Prozess, sequentiell (wie Bank-/IMAP-Job); bei mehreren Instanzen schützt nur der Claim je Nachricht.

const TICK_MS = 60_000;
const g = globalThis as unknown as { __havewaOutboxTimer?: ReturnType<typeof setInterval>; __havewaOutboxRunning?: boolean };

async function tick() {
  if (g.__havewaOutboxRunning) return;
  g.__havewaOutboxRunning = true;
  try {
    const n = await deliverDue();
    if (n) console.log(`[outbox] ${n} geplante Nachricht(en) versendet`);
  } catch (e) {
    console.warn("[outbox] Versand fehlgeschlagen:", e instanceof Error ? e.message : e);
  } finally {
    g.__havewaOutboxRunning = false;
  }
}

/** Startet den Postausgang-Job genau einmal pro Prozess. */
export function startOutboxScheduler() {
  if (g.__havewaOutboxTimer) return;
  g.__havewaOutboxTimer = setInterval(() => void tick(), TICK_MS);
  g.__havewaOutboxTimer.unref?.();
}
