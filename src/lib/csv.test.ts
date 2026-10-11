import { describe, it, expect } from "vitest";
import { toCsv, parseCsv, decodeCsv } from "./csv";

describe("parseCsv", () => {
  it("parst Semikolon-CSV mit BOM + Header", () => {
    const csv = "﻿firstName;lastName;email\r\nErika;Muster;e@x.de\r\nMax;Klein;m@x.de";
    const rows = parseCsv(csv);
    expect(rows).toEqual([
      ["firstName", "lastName", "email"],
      ["Erika", "Muster", "e@x.de"],
      ["Max", "Klein", "m@x.de"],
    ]);
  });

  it("respektiert Anführungszeichen mit Trenner/Quote innen", () => {
    const rows = parseCsv('a;b\r\n"Müller; Sohn";"sagt ""hi"""');
    expect(rows[1]).toEqual(["Müller; Sohn", 'sagt "hi"']);
  });

  it("erkennt Komma-Trenner + verwirft leere Zeilen", () => {
    const rows = parseCsv("a,b\n1,2\n\n3,4\n");
    expect(rows).toEqual([["a", "b"], ["1", "2"], ["3", "4"]]);
  });

  it("Roundtrip toCsv -> parseCsv", () => {
    const csv = toCsv(["Name", "Ort"], [["A;B", "Berlin"], ["C", "Köln"]]);
    const rows = parseCsv(csv);
    expect(rows[1]).toEqual(["A;B", "Berlin"]);
  });
});

describe("decodeCsv (#33)", () => {
  it("liest UTF-8 (mit BOM)", () => {
    const bytes = new TextEncoder().encode("﻿Gebäude;Fläche");
    expect(parseCsv(decodeCsv(bytes))).toEqual([["Gebäude", "Fläche"]]);
  });

  it("fällt bei Excel-ANSI (Windows-1252) zurück, Umlaute und € bleiben erhalten", () => {
    // "Straße;Größe €" in CP1252
    const bytes = Uint8Array.from([0x53, 0x74, 0x72, 0x61, 0xdf, 0x65, 0x3b, 0x47, 0x72, 0xf6, 0xdf, 0x65, 0x20, 0x80]);
    expect(decodeCsv(bytes)).toBe("Straße;Größe €");
  });
});
