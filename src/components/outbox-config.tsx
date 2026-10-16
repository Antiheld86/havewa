"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, TriangleAlert, Timer } from "lucide-react";
import { updateOutboxConfig } from "@/server/actions/config";
import type { ActionState } from "@/lib/schemas";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Postausgang (#79): Versandverzögerung für E-Mails und Briefe.
export function OutboxConfig({ delayMin }: { delayMin: number | null }) {
  const t = useTranslations("outbox");
  const [state, action, pending] = useActionState<ActionState, FormData>(updateOutboxConfig, {});
  const [manual, setManual] = useState(delayMin === null);

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Timer className="size-4" /> {t("title")}
        </CardTitle>
        <p className="text-xs text-muted-foreground">{t("hint")}</p>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="outboxDelayMin">{t("delay")}</Label>
            <Input
              id="outboxDelayMin"
              name="outboxDelayMin"
              type="number"
              min={0}
              max={1440}
              defaultValue={delayMin ?? 10}
              disabled={manual}
              className="w-28"
            />
          </div>
          <label className="flex h-9 items-center gap-2 text-sm">
            <input type="checkbox" name="manual" checked={manual} onChange={(e) => setManual(e.target.checked)} className="size-4" />
            {t("manual")}
          </label>
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
        </form>
      </CardContent>
    </Card>
  );
}
