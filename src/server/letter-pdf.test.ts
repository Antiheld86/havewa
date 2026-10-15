import { describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";

vi.mock("server-only", () => ({}));
const { letterPdf } = await import("./letter-pdf");

describe("letterPdf mit formatiertem Text (#67)", () => {
  it("rendert HTML-Brieftext (fett, kursiv, Liste) zu einer gültigen PDF-Seite", async () => {
    const pdf = await letterPdf({
      sender: { name: "Verwaltung", lines: ["Hauptstr. 1", "10115 Berlin"] },
      recipient: ["Max Mieter", "Nebenstr. 2", "10115 Berlin"],
      place: "Berlin",
      date: "15.10.2026",
      subject: "Test",
      body: "<p>Hallo <strong>fett</strong> <em>kursiv</em> <u>unter</u></p><ul><li><p>eins</p></li><li><p>zwei</p></li></ul>",
    });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect((await PDFDocument.load(pdf)).getPageCount()).toBe(1);
  });
});
