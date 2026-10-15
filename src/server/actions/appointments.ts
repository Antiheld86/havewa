"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireWriter } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { appointmentSchema, type ActionState } from "@/lib/schemas";

/** Prüft Objekt, Teilnehmer und Unterlagen auf Mandantenzugehörigkeit (#74). */
async function resolveLinks(tenantId: string, fd: FormData, propertyId?: string) {
  if (propertyId) {
    const prop = await prisma.property.findFirst({ where: { id: propertyId, tenantId }, select: { id: true } });
    if (!prop) return { error: "Objekt nicht gefunden" };
  }
  const ids = (name: string) => [...new Set(fd.getAll(name).map(String).filter(Boolean))];
  const [persons, documents] = await Promise.all([
    prisma.person.findMany({ where: { id: { in: ids("personIds") }, tenantId }, select: { id: true } }),
    prisma.document.findMany({ where: { id: { in: ids("documentIds") }, tenantId }, select: { id: true } }),
  ]);
  return { persons: { set: persons }, documents: { set: documents } };
}

export async function createAppointment(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireWriter();
  const r = appointmentSchema.safeParse(Object.fromEntries(fd));
  if (!r.success) return { error: r.error.issues[0]?.message ?? "Ungültige Eingabe" };
  const links = await resolveLinks(user.tenantId, fd, r.data.propertyId);
  if ("error" in links) return { error: links.error };

  const appt = await prisma.appointment.create({
    data: {
      ...r.data, tenantId: user.tenantId,
      persons: { connect: links.persons.set }, documents: { connect: links.documents.set },
    },
  });
  await audit(user, "CREATE", "Appointment", appt.id, r.data.title);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function updateAppointment(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireWriter();
  const id = String(fd.get("id") ?? "");
  const r = appointmentSchema.safeParse(Object.fromEntries(fd));
  if (!r.success) return { error: r.error.issues[0]?.message ?? "Ungültige Eingabe" };
  const appt = await prisma.appointment.findFirst({ where: { id, tenantId: user.tenantId }, select: { id: true } });
  if (!appt) return { error: "Termin nicht gefunden" };
  const links = await resolveLinks(user.tenantId, fd, r.data.propertyId);
  if ("error" in links) return { error: links.error };
  await prisma.appointment.update({ where: { id: appt.id }, data: { ...r.data, ...links } });
  await audit(user, "UPDATE", "Appointment", id, r.data.title);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteAppointment(fd: FormData): Promise<void> {
  const user = await requireWriter();
  const id = String(fd.get("id") ?? "");
  const res = await prisma.appointment.deleteMany({ where: { id, tenantId: user.tenantId } });
  if (res.count > 0) await audit(user, "DELETE", "Appointment", id);
  revalidatePath("/", "layout");
}
