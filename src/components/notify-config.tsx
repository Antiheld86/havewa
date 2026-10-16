"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Check, TriangleAlert, BellRing } from "lucide-react";
import { updateNotifyConfig } from "@/server/actions/config";
import type { ActionState } from "@/lib/schemas";
import { NOTIFY_KINDS } from "@/lib/notify-kinds";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// E-Mail-Benachrichtigungen für Verwalter (#77), je Art schaltbar.
export function NotifyConfig({ enabled, smtpConfigured }: { enabled: string[]; smtpConfigured: boolean }) {
  const t = useTranslations("notifyMail");
  const [state, action, pending] = useActionState<ActionState, FormData>(updateNotifyConfig, {});

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BellRing className="size-4" /> {t("title")}
        </CardTitle>
        <p className="text-xs text-muted-foreground">{t("hint")}</p>
        {!smtpConfigured && <p className="text-xs text-amber-600 dark:text-amber-400">{t("noSmtp")}</p>}
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2">
            {NOTIFY_KINDS.map((k) => (
              <label key={k} className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="kinds" value={k} defaultChecked={enabled.includes(k)} className="mt-0.5 size-4" />
                <span>
                  {t(`kind_${k}`)}
                  <span className="block text-xs text-muted-foreground">{t(`kindHint_${k}`)}</span>
                </span>
              </label>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={pending}>{t("save")}</Button>
            {state.error && (
              <span className="flex items-center gap-1.5 text-sm text-destructive">
                <TriangleAlert className="size-4" /> {state.error}
              </span>
            )}
            {state.ok && (
              <span className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
                <Check className="size-4" /> {t("saved")}
              </span>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
