import { describe, expect, it } from "vitest";
import { normalizePostalAddress, postalAddressError } from "./postal-address";

const check = (raw: string) => {
  const lines = normalizePostalAddress(raw);
  return { lines, error: postalAddressError(lines) };
};

describe("Postanschrift (#71)", () => {
  it("Inland: normalisiert Leerzeilen, Leerzeichen, D-PLZ und Länderzeile", () => {
    expect(check("  Hauptstr.   1 \n\nD-10115  Berlin\nDeutschland")).toEqual({ lines: ["Hauptstr. 1", "10115 Berlin"], error: null });
  });

  it("Ausland: Land in Großbuchstaben unter PLZ Ort", () => {
    expect(check("Rue de Lyon 5\n75012 Paris\nFrankreich")).toEqual({ lines: ["Rue de Lyon 5", "75012 Paris", "FRANKREICH"], error: null });
  });

  it("lehnt unvollständige oder falsche Anschriften ab", () => {
    expect(check("Hauptstr. 1").error).not.toBeNull(); // keine PLZ-Zeile
    expect(check("Hauptstr. 1\n1011 Berlin").error).not.toBeNull(); // PLZ 4-stellig
    expect(check("Berlin 10115\nHauptstr. 1").error).not.toBeNull(); // Reihenfolge vertauscht
    expect(check("c/o X\nHinterhaus\nHauptstr. 1\n10115 Berlin").error).not.toBeNull(); // zu viele Zeilen
  });
});
