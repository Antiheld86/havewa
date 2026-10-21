import { describe, it, expect } from "vitest";
import { consumption, chainConsumption } from "./meters";

const d = (s: string) => new Date(s + "T00:00:00Z");

describe("consumption", () => {
  it("neuester minus vorletzter Stand, unabhängig von der Reihenfolge", () => {
    expect(
      consumption([
        { date: d("2026-01-01"), value: 100 },
        { date: d("2026-06-01"), value: 160.5 },
        { date: d("2025-06-01"), value: 40 },
      ]),
    ).toBeCloseTo(60.5);
  });
  it("null bei weniger als zwei Ständen", () => {
    expect(consumption([])).toBeNull();
    expect(consumption([{ date: d("2026-01-01"), value: 5 }])).toBeNull();
  });
  it("null bei negativer Differenz (Zählertausch)", () => {
    expect(
      consumption([
        { date: d("2026-01-01"), value: 9000 },
        { date: d("2026-06-01"), value: 3 },
      ]),
    ).toBeNull();
  });
});

describe("chainConsumption", () => {
  const same = (m: number) => m;
  const r = (date: string, value: number) => ({ date: d(date), value });

  it("einzelner Zähler wie bisher: Max − Min", () => {
    expect(
      chainConsumption(
        [{ id: "a", replacedById: null, readings: [r("2026-01-01", 100), r("2026-12-31", 250)] }],
        same,
      ),
    ).toBe(150);
  });
  it("Tausch zur Jahresmitte: beide Differenzen werden summiert", () => {
    const meters = [
      { id: "alt", replacedById: "neu", readings: [r("2026-01-01", 100), r("2026-06-30", 400)] },
      { id: "neu", replacedById: null, readings: [r("2026-06-30", 0), r("2026-12-31", 350)] },
    ];
    expect(chainConsumption(meters, same)).toBe(650);
  });
  it("Hochrechnung läuft einmal über den Zeitraum der Kette", () => {
    const calls: [number, string, string][] = [];
    const meters = [
      { id: "alt", replacedById: "neu", readings: [r("2026-01-01", 0), r("2026-03-31", 100)] },
      { id: "neu", replacedById: null, readings: [r("2026-03-31", 0), r("2026-06-30", 50)] },
    ];
    chainConsumption(meters, (m, s, e) => {
      calls.push([m, s.toISOString().slice(0, 10), e.toISOString().slice(0, 10)]);
      return m;
    });
    expect(calls).toEqual([[150, "2026-01-01", "2026-06-30"]]);
  });
  it("alter Zähler mit nur einem Stand im Jahr zählt nicht", () => {
    const meters = [
      { id: "alt", replacedById: "neu", readings: [r("2026-02-01", 900)] },
      { id: "neu", replacedById: null, readings: [r("2026-02-01", 0), r("2026-12-31", 80)] },
    ];
    expect(chainConsumption(meters, same)).toBe(80);
  });
  it("unabhängige Zähler werden getrennt summiert", () => {
    const meters = [
      { id: "a", replacedById: null, readings: [r("2026-01-01", 0), r("2026-12-31", 10)] },
      { id: "b", replacedById: null, readings: [r("2026-01-01", 5), r("2026-12-31", 30)] },
    ];
    expect(chainConsumption(meters, same)).toBe(35);
  });
});
