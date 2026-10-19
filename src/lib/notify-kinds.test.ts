import { describe, it, expect } from "vitest";
import { inWindow, leadRange, digest, isNotifyKind, HOUR_MS, DAY_MS } from "./notify-kinds";

const prev = new Date("2026-10-16T10:00:00Z");
const now = new Date("2026-10-16T10:05:00Z");

describe("notify-kinds (#77)", () => {
  it("erinnert genau einmal je Fenster", () => {
    expect(inWindow(new Date("2026-10-16T11:03:00Z"), HOUR_MS, prev, now)).toBe(true);
    expect(inWindow(new Date("2026-10-16T11:00:00Z"), HOUR_MS, prev, now)).toBe(false); // Grenze gehört zum Vorlauf
    expect(inWindow(new Date("2026-10-16T11:05:00Z"), HOUR_MS, prev, now)).toBe(true);
    expect(inWindow(new Date("2026-10-16T11:06:00Z"), HOUR_MS, prev, now)).toBe(false); // nächster Lauf
  });

  it("leadRange verschiebt das Fenster um den Vorlauf", () => {
    const r = leadRange(DAY_MS, prev, now);
    expect(r.gt.toISOString()).toBe("2026-10-17T10:00:00.000Z");
    expect(r.lte.toISOString()).toBe("2026-10-17T10:05:00.000Z");
  });

  it("digest kürzt lange Listen", () => {
    const text = digest("Kopf", ["a", "b", "c"], 2);
    expect(text).toBe("Kopf\n\n• a\n• b\n… und 1 weitere");
  });

  it("kennt nur definierte Arten", () => {
    expect(isNotifyKind("PAYMENTS_IN")).toBe(true);
    expect(isNotifyKind("PAYMENTS")).toBe(false); // seit #80 aufgeteilt
    expect(isNotifyKind("FOO")).toBe(false);
  });
});
