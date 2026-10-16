import { auth } from "@/auth";
import { actingTenantId } from "@/lib/acting-tenant";
import { roleAllows } from "@/lib/rbac";
import { dunningFor } from "@/server/dunning";

// Mahnung / Zahlungserinnerung zu einer Sollstellung direkt als PDF (statt der
// HTML-Vorschauseite; umgeht auch das Darkmode-Darstellungsproblem). Spiegelt
// die zuletzt erstellte Mahnstufe wider.
export async function GET(_req: Request, { params }: { params: Promise<{ chargeId: string }> }) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });
  if (!roleAllows(session.user.role, ["VERWALTER", "BUCHHALTUNG"])) return new Response("Forbidden", { status: 403 });

  const { chargeId } = await params;
  const tenantId = await actingTenantId(session.user);
  const res = await dunningFor(tenantId, chargeId);
  if (!res) return new Response("Not found", { status: 404 });
  const { doc } = res;
  const pdf = res.pdf();
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${doc.title.replace(/[^\x20-\x7e]/g, "_")}.pdf"`,
    },
  });
}
