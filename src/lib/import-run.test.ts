import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const db = vi.hoisted(() => ({
  property: { findMany: vi.fn(), create: vi.fn() },
  building: { create: vi.fn() },
  unit: { create: vi.fn() },
  person: { create: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

const { runUnitImport, runPersonImport } = await import("./import-run");
const { mapColumns, UNIT_COLS, PERSON_COLS } = await import("./import-columns");

const opts = { defaultBuilding: "Haupthaus" };

beforeEach(() => {
  vi.clearAllMocks();
  db.property.findMany.mockResolvedValue([
    { id: "p1", name: "Musterstraße  5", buildings: [{ id: "b1", name: "Haus A" }] },
  ]);
  db.building.create.mockResolvedValue({ id: "bNew" });
});

describe("runUnitImport (#33)", () => {
  const header = ["Objekt", "Gebäude", "Bezeichnung", "Typ", "Fläche", "Zimmer"];
  const cols = mapColumns(header, UNIT_COLS);

  it("legt Einheiten an, erkennt Objekt/Gebäude tolerant und deutsche Zahlen", async () => {
    const rows = [header, ["musterstraße 5", "haus a", "WE 1", "Wohnung", "60,5", "2,5"], ["Musterstraße 5", "", "WE 2", "", "40", ""]];
    const r = await runUnitImport(rows, cols, "t1", opts);
    expect(r).toEqual({ created: 2, skipped: 0, issues: [] });
    expect(db.unit.create).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({ buildingId: "b1", label: "WE 1", type: "WOHNUNG", area: 60.5, rooms: 2.5, tenantId: "t1" }),
    });
    // Ohne Gebäude: Standardgebäude, einmal angelegt
    expect(db.building.create).toHaveBeenCalledWith({ data: { tenantId: "t1", propertyId: "p1", name: "Haupthaus" } });
    expect(db.unit.create).toHaveBeenNthCalledWith(2, { data: expect.objectContaining({ buildingId: "bNew", area: 40 }) });
  });

  it("meldet je übersprungener Zeile den Grund und legt dafür kein Gebäude an", async () => {
    const rows = [
      header,
      ["Beispielobjekt", "Haupthaus", "Whg 1", "", "60", ""],
      ["", "", "Whg 2", "", "60", ""],
      ["Musterstraße 5", "Neu", "", "", "60", ""],
      ["Musterstraße 5", "Neu", "Whg 4", "", "60 m", ""],
    ];
    const r = await runUnitImport(rows, cols, "t1", opts);
    expect(r.created).toBe(0);
    expect(r.issues).toEqual([
      { row: 2, code: "propertyNotFound", field: "property", value: "Beispielobjekt" },
      { row: 3, code: "required", field: "property" },
      { row: 4, code: "required", field: "label" },
      { row: 5, code: "invalid", field: "area", value: "60 m" },
    ]);
    expect(r.skipped).toBe(4);
    expect(db.building.create).not.toHaveBeenCalled();
    expect(db.unit.create).not.toHaveBeenCalled();
  });
});

describe("runPersonImport", () => {
  it("meldet fehlende Pflichtfelder mit Zeilennummer", async () => {
    const header = ["Vorname", "Nachname"];
    const r = await runPersonImport([header, ["Max", "Muster"], ["Erika", ""]], mapColumns(header, PERSON_COLS), "t1");
    expect(r).toEqual({ created: 1, skipped: 1, issues: [{ row: 3, code: "required", field: "lastName" }] });
  });
});
