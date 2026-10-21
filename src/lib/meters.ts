export type ReadingPoint = { date: Date; value: number };

// Verbrauch = neuester Stand minus vorletzter Stand. null, wenn nicht berechenbar
// (weniger als zwei Stände oder negative Differenz, z. B. nach Zählertausch).
export function consumption(readings: ReadingPoint[]): number | null {
  if (readings.length < 2) return null;
  const [latest, previous] = [...readings].sort((a, b) => b.date.getTime() - a.date.getTime());
  const diff = latest.value - previous.value;
  return diff < 0 ? null : diff;
}

export type ChainMeter = {
  id: string;
  replacedById: string | null;
  readings: ReadingPoint[];
};

// Gruppiert Zähler über replacedById zu Tauschketten (ältester Zähler zuerst).
// Ein Nachfolger, der nicht in `meters` enthalten ist, beendet die Kette.
export function meterChains<T extends { id: string; replacedById: string | null }>(meters: T[]): T[][] {
  const byId = new Map(meters.map((m) => [m.id, m]));
  const successors = new Set(meters.map((m) => m.replacedById).filter((id): id is string => !!id));
  return meters
    .filter((m) => !successors.has(m.id))
    .map((root) => {
      const chain: T[] = [];
      for (let m: T | undefined = root; m && !chain.includes(m); m = m.replacedById ? byId.get(m.replacedById) : undefined) {
        chain.push(m);
      }
      return chain;
    });
}

// Verbrauch je Kette: Ablesedifferenz (Max − Min) jedes Zählers mit mindestens
// zwei Ständen, summiert und einmal über den Zeitraum der ganzen Kette
// hochgerechnet — nicht je Zähler, sonst würde ein Tauschjahr doppelt zählen.
export function chainConsumption(
  meters: ChainMeter[],
  extrapolate: (measured: number, start: Date, end: Date) => number,
): number {
  return meterChains(meters).reduce((sum, chain) => {
    const measured = chain.reduce((acc, m) => {
      if (m.readings.length < 2) return acc;
      const vals = m.readings.map((r) => r.value);
      return acc + (Math.max(...vals) - Math.min(...vals));
    }, 0);
    const times = chain.flatMap((m) => m.readings.map((r) => r.date.getTime()));
    if (times.length < 2) return sum;
    return sum + extrapolate(measured, new Date(Math.min(...times)), new Date(Math.max(...times)));
  }, 0);
}
