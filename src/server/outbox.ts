import "server-only";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import type { SessionUser } from "@/lib/rbac";
import { sendMail, isMailerConfigured, smtpFromAddress, type MailAttachment, type SmtpConfig } from "@/lib/adapters/mailer";
import { readFile } from "@/lib/storage";
import { messageIdFor, refIds } from "@/lib/inbound";
import { setLetterStatus, submitLetter, type LetterOptions, type LetterProvider } from "@/server/letters";

// Postausgang (#79): ausgehende E-Mails und Briefe werden eingeplant und nach der
// im Mandanten eingestellten Verzögerung versendet (0 = sofort, null = nur manuell).
// Bis dahin lassen sie sich anhalten oder sofort senden. Systembenachrichtigungen
// (#77) laufen NICHT hierüber.

export type QueueResult = "sent" | "queued" | "draft" | "failed";

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const addrList = (s: string | null | undefined) => (s ?? "").split(/[,;]/).map((a) => a.trim()).filter(Boolean);

export async function smtpConfig(tenantId: string): Promise<SmtpConfig> {
  const t = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { smtpHost: true, smtpPort: true, smtpUser: true, smtpPassword: true, smtpFrom: true, smtpSecure: true },
  });
  return { host: t?.smtpHost, port: t?.smtpPort, user: t?.smtpUser, password: t?.smtpPassword, from: t?.smtpFrom, secure: t?.smtpSecure };
}

/** Versandzeitpunkt nach Mandanten-Einstellung; null = nur manuell. */
export async function outboxSchedule(tenantId: string): Promise<Date | null> {
  const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { outboxDelayMin: true } });
  const min = t?.outboxDelayMin;
  return min === null || min === undefined ? null : new Date(Date.now() + min * 60_000);
}

/** E-Mail jetzt versenden. Liefert die Fehlermeldung oder null. */
export async function deliverEmail(tenantId: string, id: string, actor?: SessionUser): Promise<string | null> {
  const msg = await prisma.emailMessage.findFirst({
    where: { id, tenantId },
    include: { attachments: { include: { document: true } } },
  });
  if (!msg) return "E-Mail nicht gefunden";
  if (msg.status === "GESENDET") return null;
  const cfg = await smtpConfig(tenantId);
  const messageId = msg.messageId ?? messageIdFor(msg.id, smtpFromAddress(cfg));
  try {
    const attachments: MailAttachment[] = [];
    for (const a of msg.attachments) {
      try {
        attachments.push({ filename: a.document.name, content: await readFile(a.document.storageKey) });
      } catch {
        // fehlende Datei überspringen
      }
    }
    await sendMail(
      {
        to: addrList(msg.toAddress), cc: addrList(msg.cc), bcc: addrList(msg.bcc),
        subject: msg.subject, body: msg.body, html: msg.html, attachments, messageId, references: refIds(msg.references),
      },
      cfg,
    );
    await prisma.emailMessage.update({
      where: { id: msg.id },
      data: { status: "GESENDET", sentAt: new Date(), scheduledAt: null, error: null, sentById: actor?.id ?? msg.sentById, messageId },
    });
    if (actor) await audit(actor, "UPDATE", "EmailMessage", msg.id, isMailerConfigured(cfg) ? "gesendet" : "in Postausgang gestellt (kein SMTP)");
    return null;
  } catch (e) {
    await prisma.emailMessage.update({ where: { id: msg.id }, data: { status: "FEHLER", scheduledAt: null, error: errMsg(e) || "Versand fehlgeschlagen" } });
    return errMsg(e) || "Versand fehlgeschlagen";
  }
}

/** E-Mail(s) nach Mandanten-Einstellung einplanen bzw. sofort senden. */
export async function queueEmails(tenantId: string, ids: string[], actor: SessionUser): Promise<QueueResult> {
  if (ids.length === 0) return "draft";
  const at = await outboxSchedule(tenantId);
  if (!at) return "draft";
  if (at.getTime() <= Date.now()) {
    let failed = false;
    for (const id of ids) failed = !!(await deliverEmail(tenantId, id, actor)) || failed;
    return failed ? "failed" : "sent";
  }
  await prisma.emailMessage.updateMany({
    where: { tenantId, id: { in: ids }, status: { in: ["ENTWURF", "FEHLER"] } },
    data: { status: "GEPLANT", scheduledAt: at, sentById: actor.id, error: null },
  });
  return "queued";
}

/** Brief jetzt beim Anbieter einreichen. Liefert die Fehlermeldung oder null. */
export async function deliverLetter(tenantId: string, id: string, provider: LetterProvider, o: LetterOptions, testEmail?: string) {
  try {
    await submitLetter(tenantId, id, provider, o, testEmail);
    await prisma.letter.update({ where: { id }, data: { scheduledAt: null } });
    return null;
  } catch (e) {
    await setLetterStatus(id, "FEHLER", errMsg(e).slice(0, 500), { provider, scheduledAt: null });
    return errMsg(e);
  }
}

/** Brief mit Versandweg einplanen bzw. sofort einreichen (wie queueEmails). */
export async function queueLetter(tenantId: string, id: string, provider: LetterProvider, o: LetterOptions, actor: SessionUser): Promise<QueueResult> {
  const at = await outboxSchedule(tenantId);
  if (!at) {
    // nur manuell: Versandweg merken, der Brief bleibt Entwurf
    await prisma.letter.update({ where: { id }, data: { provider, options: o } });
    return "draft";
  }
  if (at.getTime() <= Date.now()) return (await deliverLetter(tenantId, id, provider, o, actor.email ?? undefined)) ? "failed" : "sent";
  await setLetterStatus(id, "GEPLANT", null, { provider, options: o, scheduledAt: at, sentById: actor.id });
  return "queued";
}

/** Fällige E-Mails und Briefe aller Mandanten versenden (Hintergrundjob). */
export async function deliverDue() {
  const now = new Date();
  const emails = await prisma.emailMessage.findMany({
    where: { status: "GEPLANT", scheduledAt: { lte: now } },
    select: { id: true, tenantId: true },
    take: 100,
  });
  for (const m of emails) {
    // Beanspruchen, damit „Jetzt senden“ und der Job nicht doppelt versenden
    const { count } = await prisma.emailMessage.updateMany({ where: { id: m.id, status: "GEPLANT" }, data: { status: "ENTWURF" } });
    if (count) await deliverEmail(m.tenantId, m.id);
  }
  const letters = await prisma.letter.findMany({
    where: { status: "GEPLANT", scheduledAt: { lte: now } },
    select: { id: true, tenantId: true, provider: true, options: true, sentById: true },
    take: 50,
  });
  for (const l of letters) {
    const { count } = await prisma.letter.updateMany({ where: { id: l.id, status: "GEPLANT" }, data: { status: "ENTWURF" } });
    if (!count || (l.provider !== "PINGEN" && l.provider !== "EPOST")) continue;
    const by = l.sentById ? await prisma.user.findUnique({ where: { id: l.sentById }, select: { email: true } }) : null;
    await deliverLetter(l.tenantId, l.id, l.provider, (l.options ?? {}) as LetterOptions, by?.email);
  }
  return emails.length + letters.length;
}
