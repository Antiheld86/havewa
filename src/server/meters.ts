import "server-only";
import { prisma } from "@/lib/prisma";
import type { z } from "zod";
import type { meterReplaceSchema } from "@/lib/schemas";

export type MeterReplaceResult =
  | { ok: true; oldId: string; newId: string }
  | { ok: false; error: string; status: number };

/**
 * Zählertausch: Endstand am alten Zähler, neuer Zähler (gleiche Einheit/Art) mit
 * Anfangsstand, alter Zähler wird als ausgebaut markiert und verweist auf den
 * Nachfolger. Geteilt von Server Action und API-Operation.
 */
export async function replaceMeterTx(
  tenantId: string,
  input: z.infer<typeof meterReplaceSchema>,
): Promise<MeterReplaceResult> {
  const old = await prisma.meter.findFirst({
    where: { id: input.meterId, tenantId },
    include: { readings: { orderBy: { date: "desc" }, take: 1 } },
  });
  if (!old) return { ok: false, error: "Zähler nicht gefunden", status: 404 };
  if (old.removedAt) return { ok: false, error: "Zähler ist bereits ausgebaut", status: 400 };
  const last = old.readings[0];
  if (last && input.date < last.date) {
    return { ok: false, error: "Tauschdatum liegt vor dem letzten Zählerstand", status: 400 };
  }
  if (last && input.oldValue < Number(last.value)) {
    return { ok: false, error: "Endstand liegt unter dem letzten Zählerstand", status: 400 };
  }

  const newId = await prisma.$transaction(async (tx) => {
    await tx.meterReading.create({
      data: { tenantId, meterId: old.id, date: input.date, value: input.oldValue },
    });
    const created = await tx.meter.create({
      data: { tenantId, unitId: old.unitId, type: old.type, serialNo: input.serialNo },
    });
    await tx.meterReading.create({
      data: { tenantId, meterId: created.id, date: input.date, value: input.newValue },
    });
    await tx.meter.update({
      where: { id: old.id },
      data: { removedAt: input.date, replacedById: created.id },
    });
    return created.id;
  });
  return { ok: true, oldId: old.id, newId };
}
