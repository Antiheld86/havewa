import { PDFDocument } from "pdf-lib";

// Brief + Anhänge zu einem Versand-PDF zusammenführen (#66). Druckdienstleister
// verlangen A4: abweichende Seiten werden proportional auf A4 eingepasst.

const A4: [number, number] = [595.28, 841.89];
const isA4 = (w: number, h: number) => Math.abs(w - A4[0]) < 3 && Math.abs(h - A4[1]) < 3;

export async function mergeLetterPdf(letter: Uint8Array, attachments: Uint8Array[], duplex = false): Promise<Buffer> {
  if (attachments.length === 0) return Buffer.from(letter);
  // PDF/A-1 des Briefs nicht brechen: Info-Dict unverändert (passt zu XMP), keine Objekt-Streams.
  const out = await PDFDocument.load(letter, { updateMetadata: false });
  for (const raw of attachments) {
    // Bei Duplex beginnt jeder Anhang auf einem neuen Blatt (nicht auf der Rückseite).
    if (duplex && out.getPageCount() % 2 === 1) out.addPage(A4);
    const src = await PDFDocument.load(raw, { ignoreEncryption: true });
    for (const [i, page] of src.getPages().entries()) {
      const { width, height } = page.getSize();
      if (isA4(width, height)) {
        const [copy] = await out.copyPages(src, [i]);
        out.addPage(copy);
        continue;
      }
      const embedded = await out.embedPage(page);
      const scale = Math.min(A4[0] / width, A4[1] / height);
      const target = out.addPage(A4);
      target.drawPage(embedded, {
        x: (A4[0] - width * scale) / 2,
        y: (A4[1] - height * scale) / 2,
        width: width * scale,
        height: height * scale,
      });
    }
  }
  return Buffer.from(await out.save({ useObjectStreams: false }));
}
