"use client";

import { useTranslations } from "next-intl";
import { Plus, Pencil } from "lucide-react";
import { createAppointment, updateAppointment } from "@/server/actions/appointments";
import { Button } from "@/components/ui/button";
import { CrudDialog } from "@/components/crud-dialog";
import { TextField, TextAreaField, SelectField, MultiSelectField } from "@/components/form-fields";

const TYPES = ["BESICHTIGUNG", "VERSAMMLUNG", "WARTUNG", "FRIST", "SONSTIGES"] as const;

export type AppointmentInput = {
  id: string;
  title: string;
  type: string;
  start: string; // ISO
  end: string | null;
  location: string | null;
  propertyId: string | null;
  note: string | null;
  personIds: string[];
  documentIds: string[];
};

type Opt = { value: string; label: string };

const dtLocal = (iso?: string | null) => (iso ? iso.slice(0, 16) : undefined);

export function AppointmentDialog({
  properties,
  persons,
  documents,
  defaultDate,
  appointment,
}: {
  properties: Opt[];
  persons: Opt[]; // Teilnehmer (#74)
  documents: Opt[]; // Unterlagen (#74)
  defaultDate?: string;
  appointment?: AppointmentInput;
}) {
  const t = useTranslations();
  const edit = !!appointment;

  return (
    <CrudDialog
      trigger={
        edit ? (
          <Button variant="ghost" size="icon" aria-label={t("common.edit")} title={t("common.edit")}>
            <Pencil className="size-4" />
          </Button>
        ) : (
          <Button size="sm">
            <Plus className="size-4" />
            {t("calendar.add")}
          </Button>
        )
      }
      title={edit ? t("common.edit") : t("calendar.add")}
      action={edit ? updateAppointment : createAppointment}
      submitLabel={edit ? t("common.save") : t("common.create")}
    >
      {edit && <input type="hidden" name="id" value={appointment!.id} />}
      <TextField name="title" label={t("fields.name")} defaultValue={appointment?.title} />
      <SelectField
        name="type"
        label={t("fields.type")}
        defaultValue={appointment?.type}
        options={TYPES.map((v) => ({ value: v, label: t(`appointmentType.${v}`) }))}
      />
      <TextField name="start" label={t("calendar.start")} type="datetime-local" defaultValue={dtLocal(appointment?.start) ?? defaultDate} />
      <TextField name="end" label={t("calendar.end")} type="datetime-local" required={false} defaultValue={dtLocal(appointment?.end)} />
      <TextField name="location" label={t("meetings.location")} required={false} defaultValue={appointment?.location ?? undefined} />
      <SelectField
        name="propertyId"
        label={t("units.property")}
        defaultValue={appointment?.propertyId ?? ""}
        options={[{ value: "", label: t("common.none") }, ...properties]}
      />
      <MultiSelectField name="personIds" label={t("calendar.persons")} options={persons} defaultValues={appointment?.personIds} />
      <MultiSelectField name="documentIds" label={t("calendar.documents")} options={documents} defaultValues={appointment?.documentIds} />
      <TextAreaField name="note" label={t("fields.note")} defaultValue={appointment?.note ?? undefined} />
    </CrudDialog>
  );
}
