import "server-only";
import { prisma } from "@/lib/prisma";
import { saveFile } from "@/lib/storage";
import { simplePdf, jpegSize } from "@/lib/pdf";
import { wohnungsgeberDocument } from "@/lib/wohnungsgeber";
import { tenantContact } from "@/server/letters";

export type WgOptions = { name?: string; address?: string; place?: string; signedOn?: string; signature?: string };

const clip = (v: string | undefined) => (v ?? "").trim().slice(0, 300);

/** Unterschrift aus dem Dialog: data-URL eines JPEG (Canvas), max. ~500 KB. */
export function signatureJpeg(dataUrl: string | undefined) {
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl ?? "");
  if (!m || m[1].length > 700_000) return null;
  const jpeg = Buffer.from(m[1], "base64");
  const size = jpegSize(jpeg);
  return size ? { jpeg, ...size } : null;
}

/**
 * Wohnungsgeberbestätigung (§ 19 BMG) zu einem Mietvertrag als PDF, optional mit
 * Ort/Datum und digitaler Unterschrift (#55). null, wenn der Vertrag nicht zum Mandanten gehört.
 */
export async function wohnungsgeberPdf(tenantId: string, leaseId: string, opt: WgOptions) {
  const lease = await prisma.lease.findFirst({
    where: { id: leaseId, tenantId },
    include: {
      unit: { include: { building: { include: { property: { include: { tenant: { select: { name: true, address: true, phone: true, smtpFrom: true } } } } } } } },
      renters: { include: { person: true } },
    },
  });
  if (!lease) return null;
  const property = lease.unit.building.property;
  const doc = wohnungsgeberDocument({
    landlordName: clip(opt.name) || property.tenant.name,
    landlordAddress: clip(opt.address) || property.tenant.address || "—",
    landlordContact: tenantContact(property.tenant),
    tenantNames: lease.renters.map((r) => `${r.person.firstName} ${r.person.lastName}`),
    dwellingAddress: `${property.street}, ${property.zip} ${property.city} · ${property.name} · ${lease.unit.label}`,
    moveInDate: lease.startDate,
    place: clip(opt.place),
    signedOn: clip(opt.signedOn),
  });
  const sig = signatureJpeg(opt.signature);
  const pdf = simplePdf(doc.title, doc.lines, sig ? [{ ...sig, line: doc.signatureLine, drawWidth: 170 }] : []);
  return { pdf, lease, property };
}

/**
 * Erzeugte Bestätigung in den Dokumenten ablegen (#75): Kategorie Bescheinigung,
 * verknüpft mit Objekt, Einheit und erstem Mieter.
 */
export async function fileWohnungsgeber(tenantId: string, res: NonNullable<Awaited<ReturnType<typeof wohnungsgeberPdf>>>) {
  const { pdf, lease, property } = res;
  const storageKey = await saveFile(pdf, "wohnungsgeberbestaetigung.pdf");
  return prisma.document.create({
    data: {
      tenantId, propertyId: property.id, unitId: lease.unitId, personId: lease.renters[0]?.personId ?? null,
      name: `Wohnungsgeberbestätigung ${property.name} ${lease.unit.label}.pdf`, category: "BESCHEINIGUNG",
      mime: "application/pdf", size: pdf.length, storageKey,
    },
  });
}
