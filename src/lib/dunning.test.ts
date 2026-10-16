import { describe, it, expect } from "vitest";
import { dunningDocument, dunningLetterBody } from "./dunning";

const base = {
  propertyName: "Haus A",
  unitLabel: "EG Links",
  renterName: "Max Mustermann",
  tenantName: "Verwaltung Muster",
  chargeTypeLabel: "Miete",
  period: new Date("2026-05-01T00:00:00Z"),
  dueDate: new Date("2026-05-03T00:00:00Z"),
  open: 800,
  fee: 5,
};

describe("dunningDocument (#28)", () => {
  it("Stufe 1 = Zahlungserinnerung", () => {
    expect(dunningDocument({ ...base, level: 1 }).title).toBe("Zahlungserinnerung");
  });

  it("Stufe 2 = 2. Mahnung", () => {
    expect(dunningDocument({ ...base, level: 2 }).title).toBe("2. Mahnung");
  });

  it("summiert offenen Betrag + Mahngebühr", () => {
    const text = dunningDocument({ ...base, level: 2 }).lines.join("\n");
    expect(text).toContain("Max Mustermann");
    expect(text).toContain("Haus A · EG Links");
    expect(text).toContain("Mahngebühr");
    // Gesamt 805 €
    expect(text).toContain("805");
  });

  it("ohne Gebühr keine Mahngebühr-Zeile", () => {
    const text = dunningDocument({ ...base, level: 1, fee: 0 }).lines.join("\n");
    expect(text).not.toContain("Mahngebühr");
  });

  it("zeigt Telefon/E-Mail der Verwaltung unter dem Gruß (#76)", () => {
    const lines = dunningDocument({ ...base, level: 1, tenantContact: ["Tel. 030 123", "info@muster.de"] }).lines;
    expect(lines.slice(-3)).toEqual(["Verwaltung Muster", "Tel. 030 123", "info@muster.de"]);
  });

  it("Brieftext für den Postversand (#78)", () => {
    const body = dunningLetterBody({ ...base, level: 2 });
    expect(body.startsWith("Guten Tag Max Mustermann,")).toBe(true);
    expect(body).toContain("Haus A · EG Links");
    expect(body).toContain("Mahngebühr");
    expect(body).toMatch(/Offener Gesamtbetrag: 805,00\s€/);
    expect(body.endsWith("Verwaltung Muster")).toBe(true);
  });
});
