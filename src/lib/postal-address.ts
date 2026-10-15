// Postanschrift für den Briefversand prüfen (#71), angelehnt an die Adressanforderungen
// der Deutschen Post (Pingen): keine Leerzeilen, „PLZ Ort“ in der letzten Zeile,
// bei Auslandsanschriften das Land in Großbuchstaben darunter.

/** Name + Anschrift zusammen höchstens 4 Zeilen (Fensterzone, MAX_RECIPIENT_LINES). */
export const MAX_ADDRESS_LINES = 3;

/** Zeilen trimmen, Mehrfach-Leerzeichen und Leerzeilen entfernen, „D-12345“ → „12345“, Inland ohne Länderzeile. */
export function normalizePostalAddress(raw: string): string[] {
  const lines = raw.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  if (lines.length > 1 && /^(deutschland|germany|de|d)$/i.test(lines[lines.length - 1])) lines.pop();
  const last = lines.length - 1;
  if (last >= 0) lines[last] = lines[last].replace(/^D-(\d{5})\b/i, "$1");
  const foreign = lines.length >= 2 && !/^\d{5} /.test(lines[last]) && /^\p{L}[\p{L} .-]*$/u.test(lines[last]);
  if (foreign) lines[last] = lines[last].toUpperCase();
  return lines;
}

/** Fehlermeldung oder null, wenn die (normalisierte) Anschrift versandfähig ist. */
export function postalAddressError(lines: string[]): string | null {
  if (lines.length < 2) return "Anschrift braucht mindestens Straße und „PLZ Ort“";
  if (lines.length > MAX_ADDRESS_LINES) return `Anschrift höchstens ${MAX_ADDRESS_LINES} Zeilen (ohne Namen)`;
  const last = lines[lines.length - 1];
  if (/^\d{5} \S/.test(last)) return null; // Inland
  if (/^\d/.test(last)) return "Letzte Zeile muss „PLZ Ort“ sein (5-stellige PLZ, Leerzeichen, Ort)";
  // Ausland: Land in der letzten Zeile, darüber eine Zeile mit Postleitzahl/Ort
  if (lines.length < 3 || !/\d/.test(lines[lines.length - 2])) return "Auslandsanschrift: „PLZ Ort“ und darunter das Land";
  return null;
}
