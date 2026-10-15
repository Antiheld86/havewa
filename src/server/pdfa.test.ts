import { execFileSync } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";

vi.mock("server-only", () => ({}));
const { gsArgs, pdfaDef, toPdfA1b } = await import("./pdfa");

const hasGs = (() => {
  try {
    execFileSync("gs", ["--version"]);
    return true;
  } catch {
    return false;
  }
})();

describe("PDF/A-Umwandlung (#66)", () => {
  it("Prolog setzt sRGB-OutputIntent und escaped den Pfad", () => {
    const def = pdfaDef(String.raw`/x/(a)\b.icc`);
    expect(def).toContain(String.raw`/ICCProfile (/x/\(a\)\\b.icc) def`);
    expect(def).toContain("/S /GTS_PDFA1");
  });

  it("Ghostscript-Aufruf: PDF/A-1, RGB, Prolog vor Eingabe", () => {
    const a = gsArgs("/icc", "/d.ps", "/in.pdf", "/out.pdf");
    expect(a).toEqual(expect.arrayContaining(["-dPDFA=1", "-sDEVICE=pdfwrite", "--permit-file-read=/icc", "-sOutputFile=/out.pdf"]));
    expect(a.slice(-2)).toEqual(["/d.ps", "/in.pdf"]);
  });

  // Läuft nur, wo Ghostscript installiert ist (Docker-Image); Konformität dort per veraPDF geprüft.
  it.skipIf(!hasGs)("wandelt ein PDF mit nicht eingebetteter Schrift um, Seiten bleiben erhalten", async () => {
    const d = await PDFDocument.create();
    const f = await d.embedFont(StandardFonts.Helvetica);
    d.addPage([595.28, 841.89]).drawText("Hallo", { x: 50, y: 700, font: f });
    d.addPage([595.28, 841.89]).drawText("Seite 2", { x: 50, y: 700, font: f });
    const out = await toPdfA1b(Buffer.from(await d.save()));
    expect(out.toString("latin1")).toContain("pdfaid:part");
    expect((await PDFDocument.load(out)).getPageCount()).toBe(2);
  });
});
