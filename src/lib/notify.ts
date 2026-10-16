import { prisma } from "@/lib/prisma";
import { sendMail } from "@/lib/adapters/mailer";
import type { NotifyKind } from "@/lib/notify-kinds";

type NotificationInput = { title: string; body?: string; link?: string };

/** Benachrichtigung an bestimmte Benutzer erzeugen. */
export async function notifyUsers(tenantId: string, userIds: string[], n: NotificationInput) {
  if (userIds.length === 0) return;
  await prisma.notification.createMany({
    data: userIds.map((userId) => ({ tenantId, userId, title: n.title, body: n.body ?? null, link: n.link ?? null })),
  });
}

/**
 * Benachrichtigung an alle Verwalter-Rollen des Mandanten (ADMIN/VERWALTER/BUCHHALTUNG).
 * Mit `kind` zusätzlich per E-Mail, wenn diese Art im Mandanten aktiviert ist (#77).
 */
export async function notifyManagers(tenantId: string, n: NotificationInput, kind?: NotifyKind) {
  const managers = await prisma.user.findMany({
    where: { tenantId, role: { in: ["ADMIN", "VERWALTER", "BUCHHALTUNG"] } },
    select: { id: true, email: true },
  });
  await notifyUsers(tenantId, managers.map((m) => m.id), n);
  if (kind) await notifyByEmail(tenantId, kind, managers.map((m) => m.email), n);
}

/**
 * Systembenachrichtigung per E-Mail (#77): direkt über SMTP, NICHT über den
 * Postausgang (#79) und ohne Verzögerung. Je Empfänger eine eigene Mail.
 */
export async function notifyByEmail(tenantId: string, kind: NotifyKind, to: string[], n: NotificationInput) {
  const t = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true, notifyEmail: true, smtpHost: true, smtpPort: true, smtpUser: true, smtpPassword: true, smtpFrom: true, smtpSecure: true },
  });
  if (!t?.notifyEmail.includes(kind)) return;
  const cfg = { host: t.smtpHost, port: t.smtpPort, user: t.smtpUser, password: t.smtpPassword, from: t.smtpFrom, secure: t.smtpSecure };
  const base = process.env.APP_URL?.replace(/\/$/, "");
  const body = [n.body ?? "", n.link && base ? `\n${base}${n.link}` : "", `\n— ${t.name} · HaVeWa`].filter(Boolean).join("\n");
  for (const addr of new Set(to.filter(Boolean))) {
    try {
      await sendMail({ to: addr, subject: n.title, body }, cfg);
    } catch (e) {
      console.warn(`[notify] E-Mail an ${addr} fehlgeschlagen:`, e instanceof Error ? e.message : e);
    }
  }
}
