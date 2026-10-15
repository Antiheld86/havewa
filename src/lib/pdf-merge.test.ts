import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { mergeLetterPdf } from "./pdf-merge";

async function pdf(pages: [number, number][]) {
  const d = await PDFDocument.create();
  pages.forEach((s) => d.addPage(s).drawRectangle({ x: 10, y: 10, width: 20, height: 20 }));
  return d.save();
}
const A4: [number, number] = [595.28, 841.89];

describe("mergeLetterPdf (#66)", () => {
  it("hängt Anhänge an und passt Nicht-A4-Seiten auf A4 ein", async () => {
    const out = await PDFDocument.load(await mergeLetterPdf(await pdf([A4]), [await pdf([A4, [612, 792]])]));
    expect(out.getPageCount()).toBe(3);
    for (const p of out.getPages()) expect(Math.round(p.getWidth())).toBe(595);
  });

  it("Duplex: Anhang beginnt auf neuem Blatt", async () => {
    const out = await PDFDocument.load(await mergeLetterPdf(await pdf([A4]), [await pdf([A4])], true));
    expect(out.getPageCount()).toBe(3); // Brief, Leerseite, Anhang
  });

  it("ohne Anhänge unverändert", async () => {
    const letter = await pdf([A4]);
    expect(Buffer.compare(await mergeLetterPdf(letter, []), Buffer.from(letter))).toBe(0);
  });
});
