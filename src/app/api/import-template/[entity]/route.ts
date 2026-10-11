import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { actingTenantId } from "@/lib/acting-tenant";
import { prisma } from "@/lib/prisma";
import { csvResponse, toCsv } from "@/lib/csv";

// CSV-Vorlagen für den Import (#33): zeigen die erwartete Spaltenstruktur mit einer
// Beispielzeile. Semikolon + BOM, damit deutsches Excel die Spalten sauber trennt.
// Deutsche Header werden vom Import ebenfalls akzeptiert.
const HEADERS: Record<string, string[]> = {
  person: ["firstName", "lastName", "email", "phone", "type", "note"],
  property: ["name", "street", "zip", "city", "type", "management"],
  unit: ["property", "building", "label", "type", "area", "rooms", "mea"],
};

export async function GET(_req: Request, { params }: { params: Promise<{ entity: string }> }) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });
  const { entity } = await params;
  const headers = HEADERS[entity];
  if (!headers) return new Response("Not found", { status: 404 });

  let example: string[];
  if (entity === "person") example = ["Max", "Mustermann", "max@example.de", "+49 30 1234", "MIETER", ""];
  else if (entity === "property") example = ["Beispielobjekt", "Hauptstr. 1", "12345", "Berlin", "WOHNEN", "MIET"];
  else {
    // Einheiten verweisen per Name auf ein Objekt: ein vorhandenes nehmen, damit die Vorlage direkt importierbar ist.
    const prop = await prisma.property.findFirst({
      where: { tenantId: await actingTenantId(session.user) },
      orderBy: { createdAt: "asc" },
      select: { name: true, buildings: { select: { name: true }, orderBy: { createdAt: "asc" }, take: 1 } },
    });
    const building = prop?.buildings[0]?.name ?? (await getTranslations("buildings"))("defaultName");
    example = [prop?.name ?? "Beispielobjekt", building, "Whg 1", "WOHNUNG", "60,5", "3", ""];
  }
  return csvResponse(`havewa-${entity}-template.csv`, toCsv(headers, [example]));
}
