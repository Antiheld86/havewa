import "server-only";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

// PDF → PDF/A-1b per Ghostscript. Die Deutsche Post (E-POSTBUSINESS) akzeptiert
// „DIN/A4 Schreiben im PDF/A-1b Format“; der Brief selbst ist schon PDF/A, nach dem
// Anhängen beliebiger PDFs (#66) aber nicht mehr. Ghostscript bettet Schriften ein,
// rechnet Farben nach sRGB um und reduziert Transparenz (geprüft mit veraPDF).

const run = promisify(execFile);

// sRGB-Profil für den OutputIntent (Debian-Paket ghostscript bzw. icc-profiles-free)
const ICC_CANDIDATES = ["/usr/share/color/icc/ghostscript/srgb.icc", "/usr/share/color/icc/sRGB.icc"];

/** PostScript-Prolog: OutputIntent mit sRGB-Profil, Pflicht für PDF/A. */
export function pdfaDef(icc: string): string {
  const ps = icc.replace(/[()\\]/g, "\\$&");
  return `%!
/ICCProfile (${ps}) def
[/_objdef {icc_PDFA} /type /stream /OBJ pdfmark
[{icc_PDFA} <</N 3>> /PUT pdfmark
[{icc_PDFA} ICCProfile (r) file /PUT pdfmark
[/_objdef {OutputIntent_PDFA} /type /dict /OBJ pdfmark
[{OutputIntent_PDFA} <</Type /OutputIntent /S /GTS_PDFA1 /DestOutputProfile {icc_PDFA} /OutputConditionIdentifier (sRGB)>> /PUT pdfmark
[{Catalog} <</OutputIntents [ {OutputIntent_PDFA} ]>> /PUT pdfmark
`;
}

export function gsArgs(icc: string, def: string, input: string, output: string): string[] {
  return [
    "-q", "-dPDFA=1", "-dBATCH", "-dNOPAUSE", "-dNOOUTERSAVE",
    "-dPDFACompatibilityPolicy=1", // nicht Darstellbares weglassen statt abbrechen
    "-sColorConversionStrategy=RGB", "-sProcessColorModel=DeviceRGB",
    "-sDEVICE=pdfwrite", `--permit-file-read=${icc}`, `-sOutputFile=${output}`, def, input,
  ];
}

export async function toPdfA1b(pdf: Buffer): Promise<Buffer> {
  const icc = ICC_CANDIDATES.find((p) => existsSync(p));
  if (!icc) throw new Error("PDF/A-Umwandlung nicht möglich: Ghostscript (sRGB-Profil) ist auf dem Server nicht installiert");
  const dir = await mkdtemp(path.join(os.tmpdir(), "havewa-pdfa-"));
  try {
    const [def, input, output] = ["pdfa.ps", "in.pdf", "out.pdf"].map((f) => path.join(dir, f));
    await writeFile(def, pdfaDef(icc));
    await writeFile(input, pdf);
    try {
      await run("gs", gsArgs(icc, def, input, output), { timeout: 120_000 });
    } catch (e) {
      const msg = (e as { code?: string }).code === "ENOENT" ? "Ghostscript ist auf dem Server nicht installiert" : String((e as { stderr?: string }).stderr || e).slice(0, 300);
      throw new Error(`PDF/A-Umwandlung fehlgeschlagen: ${msg}`);
    }
    return await readFile(output);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
