import "server-only";
import type { z } from "zod";
import { prisma } from "@/lib/prisma";
import { personSchema, propertySchema, unitSchema } from "@/lib/schemas";
import { normalizeEnum, PROPERTY_TYPE_MAP, MANAGEMENT_MAP, UNIT_TYPE_MAP } from "@/lib/import-columns";

// Geteilte Zeilen-Verarbeitung für CSV-Importe (Auto-Header wie manuelles
// Mapping). `cols` bildet Feld → Spaltenindex (-1 = nicht vorhanden).

export type Cols = Record<string, number>;
/** Grund, warum eine Zeile übersprungen wurde (#33). `row` = Zeilennummer in der Datei (Kopf = 1). */
export type ImportIssue = { row: number; code: "required" | "invalid" | "propertyNotFound"; field: string; value?: string };
export type RunResult = { created: number; skipped: number; issues: ImportIssue[] };
export type RunOptions = { defaultBuilding: string };

const PERSON_TYPES = ["MIETER", "EIGENTUEMER", "INTERESSENT", "HANDWERKER", "MAKLER", "BANK", "SONSTIGE"];
const unitRowSchema = unitSchema.omit({ buildingId: true });
const at = (r: string[], i: number | undefined) => (i !== undefined && i >= 0 ? r[i] : undefined);

// Erstes Validierungsproblem als Import-Grund; der Rohwert kommt aus der Zeile, nicht aus zod.
function issueOf(row: number, error: z.ZodError, raw: Record<string, string | undefined>): ImportIssue {
  const field = String(error.issues[0]?.path[0] ?? "");
  const value = raw[field]?.trim();
  return value ? { row, code: "invalid", field, value } : { row, code: "required", field };
}

export async function runPersonImport(rows: string[][], cols: Cols, tenantId: string): Promise<RunResult> {
  const issues: ImportIssue[] = [];
  let created = 0;
  for (const [i, r] of rows.entries()) {
    if (i === 0) continue;
    const rawType = (at(r, cols.type) ?? "").toUpperCase();
    const raw = {
      firstName: at(r, cols.firstName) ?? "",
      lastName: at(r, cols.lastName) ?? "",
      email: at(r, cols.email),
      phone: at(r, cols.phone),
      note: at(r, cols.note),
    };
    const parsed = personSchema.safeParse({ ...raw, type: PERSON_TYPES.includes(rawType) ? rawType : "SONSTIGE" });
    if (!parsed.success) {
      issues.push(issueOf(i + 1, parsed.error, raw));
      continue;
    }
    await prisma.person.create({ data: { ...parsed.data, tenantId } });
    created++;
  }
  return { created, skipped: issues.length, issues };
}

export async function runPropertyImport(rows: string[][], cols: Cols, tenantId: string): Promise<RunResult> {
  const issues: ImportIssue[] = [];
  let created = 0;
  for (const [i, r] of rows.entries()) {
    if (i === 0) continue;
    const raw = {
      name: at(r, cols.name) ?? "",
      street: at(r, cols.street) ?? "",
      zip: at(r, cols.zip) ?? "",
      city: at(r, cols.city) ?? "",
    };
    const parsed = propertySchema.safeParse({
      ...raw,
      type: normalizeEnum(at(r, cols.type), PROPERTY_TYPE_MAP, "WOHNEN"),
      management: normalizeEnum(at(r, cols.management), MANAGEMENT_MAP, "MIET"),
      feeType: "PAUSCHAL",
    });
    if (!parsed.success) {
      issues.push(issueOf(i + 1, parsed.error, raw));
      continue;
    }
    await prisma.property.create({ data: { ...parsed.data, tenantId } });
    created++;
  }
  return { created, skipped: issues.length, issues };
}

export async function runUnitImport(rows: string[][], cols: Cols, tenantId: string, opts: RunOptions): Promise<RunResult> {
  const properties = await prisma.property.findMany({
    where: { tenantId },
    select: { id: true, name: true, buildings: { select: { id: true, name: true } } },
  });
  const key = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
  const propByName = new Map(properties.map((p) => [key(p.name), p]));
  const buildingCache = new Map<string, string>();
  for (const p of properties) for (const b of p.buildings) buildingCache.set(`${p.id}|${key(b.name)}`, b.id);

  const issues: ImportIssue[] = [];
  let created = 0;
  for (const [i, r] of rows.entries()) {
    if (i === 0) continue;
    const propName = at(r, cols.property) ?? "";
    const prop = propByName.get(key(propName));
    if (!prop) {
      issues.push(propName.trim() ? { row: i + 1, code: "propertyNotFound", field: "property", value: propName.trim() } : { row: i + 1, code: "required", field: "property" });
      continue;
    }
    const raw = {
      label: at(r, cols.label) ?? "",
      area: at(r, cols.area) || "0",
      rooms: at(r, cols.rooms),
      mea: at(r, cols.mea),
    };
    // Erst validieren, dann das Gebäude anlegen: eine ungültige Zeile hinterlässt kein leeres Gebäude.
    const parsed = unitRowSchema.safeParse({ ...raw, type: normalizeEnum(at(r, cols.type), UNIT_TYPE_MAP, "WOHNUNG") });
    if (!parsed.success) {
      issues.push(issueOf(i + 1, parsed.error, raw));
      continue;
    }
    const bldName = (at(r, cols.building) || "").trim() || opts.defaultBuilding;
    const cacheKey = `${prop.id}|${key(bldName)}`;
    let buildingId = buildingCache.get(cacheKey);
    if (!buildingId) {
      const b = await prisma.building.create({ data: { tenantId, propertyId: prop.id, name: bldName } });
      buildingId = b.id;
      buildingCache.set(cacheKey, buildingId);
    }
    await prisma.unit.create({ data: { ...parsed.data, buildingId, tenantId } });
    created++;
  }
  return { created, skipped: issues.length, issues };
}

export const RUNNERS = {
  person: runPersonImport,
  property: runPropertyImport,
  unit: runUnitImport,
} as const;
