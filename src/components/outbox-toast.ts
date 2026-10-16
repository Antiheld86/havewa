import { toast } from "sonner";
import type { ActionState } from "@/lib/schemas";

/** Rückmeldung zum Postausgang (#79): gesendet, eingeplant, Entwurf oder fehlgeschlagen. */
export function outboxToast(t: (key: string) => string, notice: ActionState["notice"], fallback: string) {
  if (notice === "failed") toast.error(t("outbox.failed"));
  else toast.success(notice ? t(`outbox.${notice}`) : fallback);
}
