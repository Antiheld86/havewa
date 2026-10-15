import { prisma } from "@/lib/prisma";
import { isBankSyncDue as isDailyDue } from "@/lib/bank-scheduler";
import { refreshLetterStatus } from "@/server/letters";

// Täglicher Abruf des Briefstatus beim Anbieter (#65), je Mandant abschaltbar.
// ponytail: ein Prozess, sequentiell (wie Bank-/IMAP-Job); bei mehreren Instanzen Lock nötig.

const TICK_MS = 60 * 60_000;
const g = globalThis as unknown as { __havewaLetterTimer?: ReturnType<typeof setInterval>; __havewaLetterRunning?: boolean };

async function tick() {
  if (g.__havewaLetterRunning) return;
  g.__havewaLetterRunning = true;
  try {
    const tenants = await prisma.tenant.findMany({ where: { letterAutoRefresh: true }, select: { id: true, letterAutoRefreshAt: true } });
    for (const t of tenants) {
      if (!isDailyDue(t.letterAutoRefreshAt)) continue;
      await prisma.tenant.update({ where: { id: t.id }, data: { letterAutoRefreshAt: new Date() } });
      const changed = await refreshLetterStatus(t.id);
      if (changed) console.log(`[letters] Mandant ${t.id}: ${changed} Briefstatus aktualisiert`);
    }
  } catch (e) {
    console.warn("[letters] Status-Abruf fehlgeschlagen:", e instanceof Error ? e.message : e);
  } finally {
    g.__havewaLetterRunning = false;
  }
}

/** Startet den täglichen Briefstatus-Abruf genau einmal pro Prozess. */
export function startLetterScheduler() {
  if (g.__havewaLetterTimer) return;
  g.__havewaLetterTimer = setInterval(() => void tick(), TICK_MS);
  g.__havewaLetterTimer.unref?.();
  setTimeout(() => void tick(), 90_000).unref?.();
}
