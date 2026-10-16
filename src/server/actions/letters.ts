"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, requireWriter, type SessionUser } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { encryptSecret } from "@/lib/crypto";
import { deleteFile, saveFile } from "@/lib/storage";
import { isEmptyHtml } from "@/server/mail-sanitize";
import type { ActionState } from "@/lib/schemas";
import { pingenPing } from "@/lib/adapters/pingen";
import { epostPing } from "@/lib/adapters/epost";
import { MAX_RECIPIENT_LINES } from "@/server/letter-pdf";
import {
  buildLetterPdf, refreshLetterStatus, letterProviders, setLetterStatus, letterAttachmentDocs, letterRecipients, senderLines,
  type LetterProvider, type LetterOptions,
} from "@/server/letters";
import { getLocale } from "next-intl/server";
import { date } from "@/lib/format";
import { getDateLocale } from "@/lib/date-locale";
import { dunningLetterBody } from "@/lib/dunning";
import { dunningFor } from "@/server/dunning";
import { fileWohnungsgeber, wohnungsgeberPdf } from "@/server/wohnungsgeber";
import { deliverLetter, queueLetter } from "@/server/outbox";

// Briefe (#58): erstellen (PDF, DIN 5008), ablegen und per Pingen oder Deutscher Post versenden.

const str = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim() : "");
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

function providerOf(fd: FormData): LetterProvider | null {
  const p = str(fd.get("provider"));
  return p === "PINGEN" || p === "EPOST" ? p : null;
}

/** Versandoptionen aus dem Formular; „Versandart“ wird je Anbieter übersetzt. */
function optionsOf(fd: FormData, provider: LetterProvider): LetterOptions {
  const mode = str(fd.get("mode")); // standard | fast | registered
  return {
    color: fd.get("color") === "on",
    duplex: fd.get("duplex") === "on",
    ...(provider === "PINGEN"
      ? { product: mode === "fast" ? "fast" : mode === "registered" ? "registered" : "cheap" }
      : { registered: mode === "registered" ? "Einwurf Einschreiben" : null }),
  };
}

/** Brief-PDF erzeugen, als Dokument ablegen und den Brief (Entwurf) anlegen. */
async function storeLetter(
  user: SessionUser,
  l: { personId: string | null; recipient: string[]; subject: string; body: string; place: string; date: string; attachmentIds: string[]; propertyId?: string },
) {
  const pdf = await buildLetterPdf(user.tenantId, l);
  const storageKey = await saveFile(pdf, ".pdf");
  const doc = await prisma.document.create({
    data: {
      tenantId: user.tenantId, personId: l.personId, propertyId: l.propertyId ?? null, category: "BRIEF", mime: "application/pdf", size: pdf.length, storageKey,
      name: `Brief ${l.subject.replace(/[\\/:*?"<>|]/g, "-").slice(0, 80)}.pdf`,
    },
  });
  const letter = await prisma.letter.create({
    data: {
      tenantId: user.tenantId, personId: l.personId, recipient: l.recipient.join("\n"), subject: l.subject, body: l.body, documentId: doc.id, sentById: user.id,
      statusEvents: { create: { status: "ENTWURF" } },
      attachments: { connect: l.attachmentIds.map((id) => ({ id })) },
    },
  });
  await audit(user, "CREATE", "Letter", letter.id, l.subject);
  return letter;
}

const letterError = async (id: string) =>
  (await prisma.letter.findUnique({ where: { id }, select: { statusText: true } }))?.statusText ?? "Versand fehlgeschlagen";

/** Mit Versandweg über den Postausgang einplanen (#79), sonst bleibt der Brief Entwurf. */
async function queueFromForm(user: SessionUser, letterId: string, fd: FormData): Promise<ActionState> {
  const provider = providerOf(fd);
  if (!provider) return { ok: true };
  const notice = await queueLetter(user.tenantId, letterId, provider, optionsOf(fd, provider), user);
  return notice === "failed" ? { error: await letterError(letterId) } : { ok: true, notice };
}

/** Anschrift eines Kontakts (eigene Anschrift oder Objekt des laufenden Vertrags), Name zuerst. */
async function postalAddress(tenantId: string, personId: string) {
  return (await letterRecipients(tenantId, [personId]))[0]?.address ?? [];
}

/** Ort/Datum für die Datumszeile, wie im Brief-Dialog vorbelegt. */
async function placeAndDate(tenantId: string) {
  const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { address: true } });
  return { place: senderLines(t?.address).city, date: date(new Date(), await getDateLocale(await getLocale())) };
}

/** Mahnung als Brief (#78): Text der zuletzt erstellten Mahnstufe, an den ersten Mieter. */
export async function letterDunning(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireWriter();
  const res = await dunningFor(user.tenantId, str(fd.get("chargeId")));
  if (!res) return { error: "Sollstellung nicht gefunden" };
  if (!res.renter) return { error: "Kein Mieter am Vertrag hinterlegt" };
  const recipient = await postalAddress(user.tenantId, res.renter.id);
  if (recipient.length < 3) return { error: "Für den Mieter ist keine Anschrift hinterlegt" };
  const letter = await storeLetter(user, {
    personId: res.renter.id, propertyId: res.property.id, recipient: recipient.slice(0, MAX_RECIPIENT_LINES),
    subject: `${res.doc.title} · ${res.property.name} ${res.lease.unit.label}`, body: dunningLetterBody(res.input),
    ...(await placeAndDate(user.tenantId)), attachmentIds: [],
  });
  const out = await queueFromForm(user, letter.id, fd);
  revalidatePath("/", "layout");
  return out;
}

/**
 * Wohnungsgeberbestätigung als Brief (#78): kurzes Anschreiben an die Mieter, die
 * (unterschriebene) Bestätigung als Anlage. Die Bestätigung wird zudem abgelegt (#75).
 */
export async function letterWohnungsgeber(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireWriter();
  const opt = Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v)]));
  const res = await wohnungsgeberPdf(user.tenantId, str(fd.get("leaseId")), opt);
  if (!res) return { error: "Mietvertrag nicht gefunden" };
  const { lease, property } = res;
  const first = lease.renters[0]?.person;
  if (!first) return { error: "Kein Mieter am Vertrag hinterlegt" };
  const address = await postalAddress(user.tenantId, first.id);
  if (address.length < 3) return { error: "Für den Mieter ist keine Anschrift hinterlegt" };
  const names = lease.renters.map((r) => `${r.person.firstName} ${r.person.lastName}`).join(", ");
  const doc = await fileWohnungsgeber(user.tenantId, res);
  const letter = await storeLetter(user, {
    personId: first.id, propertyId: property.id,
    // alle Mieter in der Namenszeile, solange sie ins Anschriftfeld passt
    recipient: [names.length <= 50 ? names : address[0], ...address.slice(1)].slice(0, MAX_RECIPIENT_LINES),
    subject: "Ihre Wohnungsgeberbestätigung",
    body:
      `Guten Tag ${names},\n\nanbei erhalten Sie die Wohnungsgeberbestätigung für Ihre Wohnung ` +
      `${property.street}, ${property.zip} ${property.city} (${lease.unit.label}). ` +
      `Bitte legen Sie sie bei der Anmeldung beim Bürgeramt vor.\n\nMit freundlichen Grüßen\n${property.tenant.name}`,
    ...(await placeAndDate(user.tenantId)), attachmentIds: [doc.id],
  });
  const out = await queueFromForm(user, letter.id, fd);
  revalidatePath("/", "layout");
  return out;
}

export async function createLetter(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireWriter();
  const recipient = str(fd.get("recipient")).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const subject = str(fd.get("subject"));
  const body = str(fd.get("body"));
  if (recipient.length < 2) return { error: "Bitte die vollständige Anschrift angeben (Name, Straße, PLZ Ort)" };
  if (recipient.length > MAX_RECIPIENT_LINES) return { error: `Die Anschrift darf höchstens ${MAX_RECIPIENT_LINES} Zeilen haben` };
  if (!subject || isEmptyHtml(body)) return { error: "Betreff und Text sind Pflicht" };
  let personId: string | null = str(fd.get("personId")) || null;
  if (personId && !(await prisma.person.findFirst({ where: { id: personId, tenantId: user.tenantId }, select: { id: true } }))) personId = null;

  const attachments = await letterAttachmentDocs(user.tenantId, fd.getAll("documentIds").map(String));
  const letter = await storeLetter(user, {
    personId, recipient, subject, body, place: str(fd.get("place")), date: str(fd.get("date")), attachmentIds: attachments.map((a) => a.id),
  });

  const out = await queueFromForm(user, letter.id, fd);
  revalidatePath("/", "layout");
  return out;
}

/** Bereits erstellten Brief (Entwurf oder fehlgeschlagen) versenden. */
export async function sendLetter(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireWriter();
  const id = str(fd.get("id"));
  const provider = providerOf(fd);
  if (!provider) return { error: "Bitte einen Versandweg wählen" };
  const letter = await prisma.letter.findFirst({ where: { id, tenantId: user.tenantId }, select: { status: true } });
  if (!letter) return { error: "Brief nicht gefunden" };
  if (letter.status !== "ENTWURF" && letter.status !== "FEHLER") return { error: "Brief wurde bereits eingereicht" };
  const notice = await queueLetter(user.tenantId, id, provider, optionsOf(fd, provider), user);
  await audit(user, "UPDATE", "Letter", id, `Versand ${provider}`);
  revalidatePath("/", "layout");
  return notice === "failed" ? { error: await letterError(id) } : { ok: true, notice };
}

/** Geplanten Brief sofort einreichen (#79), mit dem beim Einplanen gewählten Versandweg. */
export async function sendLetterNow(fd: FormData): Promise<void> {
  const user = await requireWriter();
  const id = str(fd.get("id"));
  const letter = await prisma.letter.findFirst({ where: { id, tenantId: user.tenantId, status: "GEPLANT" }, select: { provider: true, options: true } });
  if (!letter || (letter.provider !== "PINGEN" && letter.provider !== "EPOST")) return;
  const { count } = await prisma.letter.updateMany({ where: { id, status: "GEPLANT" }, data: { status: "ENTWURF" } });
  if (!count) return; // der Hintergrundjob war schneller
  await deliverLetter(user.tenantId, id, letter.provider, (letter.options ?? {}) as LetterOptions, user.email ?? undefined);
  await audit(user, "UPDATE", "Letter", id, `Versand ${letter.provider}`);
  revalidatePath("/", "layout");
}

/** Geplanten Brief anhalten: bleibt Entwurf, bis er erneut versendet wird. */
export async function holdLetter(fd: FormData): Promise<void> {
  const user = await requireWriter();
  const id = str(fd.get("id"));
  const letter = await prisma.letter.findFirst({ where: { id, tenantId: user.tenantId, status: "GEPLANT" }, select: { id: true } });
  if (!letter) return;
  await setLetterStatus(id, "ENTWURF", "angehalten", { scheduledAt: null });
  await audit(user, "UPDATE", "Letter", id, "angehalten");
  revalidatePath("/", "layout");
}

export async function refreshLetters(_p: ActionState, _fd: FormData): Promise<ActionState> {
  const user = await requireWriter();
  await refreshLetterStatus(user.tenantId);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteLetter(fd: FormData): Promise<void> {
  const user = await requireWriter();
  const id = str(fd.get("id"));
  const letter = await prisma.letter.findFirst({ where: { id, tenantId: user.tenantId }, include: { document: true } });
  if (!letter) return;
  await prisma.letter.delete({ where: { id: letter.id } });
  // Das erzeugte Brief-PDF mitlöschen (#70), sonst bleibt es verwaist in den Dokumenten.
  if (letter.document) {
    await prisma.document.delete({ where: { id: letter.document.id } });
    await deleteFile(letter.document.storageKey).catch(() => {});
  }
  await audit(user, "DELETE", "Letter", id);
  revalidatePath("/", "layout");
}

// --- Einstellungen: Zugangsdaten der Anbieter (nur Admin) ---

export async function updateLetterConfig(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireRole(["ADMIN"]);
  const provider = providerOf(fd);
  // Secret-Felder: leer = unverändert lassen
  const secret = (field: string, column: string) => (str(fd.get(field)) ? { [column]: encryptSecret(str(fd.get(field))) } : {});
  if (provider === "PINGEN") {
    const clientId = str(fd.get("pingenClientId")) || null;
    await prisma.tenant.update({
      where: { id: user.tenantId },
      data: clientId
        ? {
            pingenClientId: clientId,
            pingenOrgId: str(fd.get("pingenOrgId")) || null,
            pingenStaging: fd.get("pingenStaging") === "on",
            letterAutoRefresh: fd.get("letterAutoRefresh") === "on",
            ...secret("pingenClientSecret", "pingenClientSecretEnc"),
          }
        : { pingenClientId: null, pingenClientSecretEnc: null, pingenOrgId: null }, // leere Client-ID = Pingen entfernen
    });
  } else if (provider === "EPOST") {
    const vendorId = str(fd.get("epostVendorId")) || null;
    const ekp = str(fd.get("epostEkp")) || null;
    if (ekp && !/^\d{10}$/.test(ekp)) return { error: "Die EKP ist 10-stellig" };
    await prisma.tenant.update({
      where: { id: user.tenantId },
      data: vendorId
        ? {
            epostVendorId: vendorId,
            epostEkp: ekp,
            epostTest: fd.get("epostTest") === "on",
            ...secret("epostPassword", "epostPasswordEnc"),
            ...secret("epostSecret", "epostSecretEnc"),
          }
        : { epostVendorId: null, epostEkp: null, epostPasswordEnc: null, epostSecretEnc: null },
    });
  } else return { error: "Unbekannter Anbieter" };
  await audit(user, "UPDATE", "Tenant", user.tenantId, `Briefversand ${provider}`);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function testLetterConfig(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireRole(["ADMIN"]);
  const provider = providerOf(fd);
  const cfg = await letterProviders(user.tenantId);
  try {
    if (provider === "PINGEN") {
      if (!cfg.pingen) return { error: "Pingen ist nicht vollständig eingerichtet" };
      await pingenPing(cfg.pingen);
    } else if (provider === "EPOST") {
      if (!cfg.epost) return { error: "E-POST ist nicht vollständig eingerichtet" };
      await epostPing(cfg.epost);
    } else return { error: "Unbekannter Anbieter" };
    return { ok: true };
  } catch (e) {
    return { error: errMsg(e) };
  }
}
