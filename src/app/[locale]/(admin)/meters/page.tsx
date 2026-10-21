import { getTranslations, getLocale } from "next-intl/server";
import type { MeterType } from "@prisma/client";
import { requireUser } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { Link } from "@/i18n/navigation";
import { date, decimal } from "@/lib/format";
import { getDateLocale } from "@/lib/date-locale";
import { consumption } from "@/lib/meters";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ReadingDialog, MeterReplaceDialog } from "@/components/entity-dialogs";

const METER_TYPES: MeterType[] = ["STROM", "GAS", "WASSER_KALT", "WASSER_WARM", "WAERME"];
const selectClass =
  "flex h-9 rounded-lg border border-input bg-transparent px-3 text-sm dark:bg-input/30";

export default async function MetersPage({
  searchParams,
}: {
  searchParams: Promise<{ property?: string; type?: string; status?: string }>;
}) {
  const sp = await searchParams;
  const user = await requireUser();
  const t = await getTranslations();
  const locale = await getLocale();
  const df = await getDateLocale(locale);
  const type = METER_TYPES.find((m) => m === sp.type);
  const propertyId = sp.property || undefined;
  const showAll = sp.status === "all";

  const [meters, properties] = await Promise.all([
    prisma.meter.findMany({
      where: {
        tenantId: user.tenantId,
        ...(showAll ? {} : { removedAt: null }),
        ...(type ? { type } : {}),
        ...(propertyId ? { unit: { building: { propertyId } } } : {}),
      },
      include: {
        unit: {
          select: {
            id: true,
            label: true,
            building: { select: { property: { select: { id: true, name: true } } } },
          },
        },
        readings: { orderBy: { date: "desc" }, take: 2 },
      },
      orderBy: [
        { unit: { building: { property: { name: "asc" } } } },
        { unit: { label: "asc" } },
        { type: "asc" },
      ],
    }),
    prisma.property.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("meters.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("meters.subtitle")}</p>
      </div>

      <form className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">{t("units.property")}</label>
          <select name="property" defaultValue={propertyId ?? ""} className={selectClass}>
            <option value="">{t("meters.allProperties")}</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">{t("fields.type")}</label>
          <select name="type" defaultValue={type ?? ""} className={selectClass}>
            <option value="">{t("meters.allTypes")}</option>
            {METER_TYPES.map((m) => (
              <option key={m} value={m}>{t(`meterType.${m}`)}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">{t("meters.status")}</label>
          <select name="status" defaultValue={showAll ? "all" : ""} className={selectClass}>
            <option value="">{t("meters.statusActive")}</option>
            <option value="all">{t("meters.statusAll")}</option>
          </select>
        </div>
        <Button type="submit" size="sm" variant="outline">{t("common.search")}</Button>
      </form>

      <Card>
        <CardContent className="p-0">
          {meters.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">{t("meters.empty")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("units.property")}</TableHead>
                  <TableHead>{t("nav.units")}</TableHead>
                  <TableHead>{t("fields.type")}</TableHead>
                  <TableHead>{t("fields.serialNo")}</TableHead>
                  <TableHead className="text-right">{t("meters.lastReading")}</TableHead>
                  <TableHead className="text-right">{t("meters.consumption")}</TableHead>
                  <TableHead className="w-64 text-right">{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {meters.map((m) => {
                  const latest = m.readings[0];
                  const used = consumption(
                    m.readings.map((r) => ({ date: r.date, value: Number(r.value) })),
                  );
                  return (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">{m.unit.building.property.name}</TableCell>
                      <TableCell>
                        <Link href={`/units/${m.unit.id}`} className="hover:underline">
                          {m.unit.label}
                        </Link>
                      </TableCell>
                      <TableCell><Badge variant="secondary">{t(`meterType.${m.type}`)}</Badge></TableCell>
                      <TableCell className="text-muted-foreground">
                        {m.serialNo}
                        {m.removedAt && (
                          <Badge variant="outline" className="ml-2">
                            {t("unitDetail.removedAt", { date: date(m.removedAt, df) })}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {latest ? (
                          <>
                            {decimal(Number(latest.value), locale)}
                            <span className="ml-2 text-muted-foreground">{date(latest.date, df)}</span>
                          </>
                        ) : (
                          t("common.none")
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {used == null ? t("common.none") : decimal(used, locale)}
                      </TableCell>
                      <TableCell>
                        {!m.removedAt && (
                          <div className="flex justify-end gap-1">
                            <ReadingDialog meterId={m.id} />
                            <MeterReplaceDialog meterId={m.id} serialNo={m.serialNo} />
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
