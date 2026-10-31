import { createHash, randomBytes } from 'node:crypto';

/**
 * Zufall mit Startwert (#248): gleicher Startwert, gleiche Folge – damit Messungen mit
 * Demo-Daten vergleichbar sind. Ohne Startwert ein zufälliger. Nicht für Sicherheit gedacht.
 */
export class Zufall {
  private s: number;
  readonly startwert: string;

  constructor(startwert?: string | null) {
    this.startwert = startwert?.trim() || randomBytes(4).toString('hex');
    this.s = createHash('sha256').update(this.startwert).digest().readUInt32LE(0);
  }

  /** Gleichverteilt in [0, 1) (mulberry32). */
  zahl(): number {
    this.s = (this.s + 0x6d2b79f5) | 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(n: number): number { return Math.floor(this.zahl() * n); }
  zwischen(min: number, max: number): number { return min + this.zahl() * (max - min); }
  /** Ganze Zahl von min bis max (beide eingeschlossen). */
  von(min: number, max: number): number { return min + this.int(max - min + 1); }
  eins<T>(a: readonly T[]): T { return a[this.int(a.length)]; }
  chance(p: number): boolean { return this.zahl() < p; }
  /** Index nach Gewichten. */
  gewichtet(gewichte: readonly number[]): number {
    const summe = gewichte.reduce((a, b) => a + b, 0);
    let x = this.zahl() * summe;
    for (let i = 0; i < gewichte.length; i++) { x -= gewichte[i]; if (x < 0) return i; }
    return gewichte.length - 1;
  }
  /** Bytes, deterministisch aus dem Startwert (für große, nicht komprimierbare Dateien). */
  bytes(n: number): Buffer {
    const b = Buffer.allocUnsafe(n);
    let i = 0;
    while (i < n) {
      const h = createHash('sha256').update(`${this.startwert}:${this.int(2 ** 31)}`).digest();
      // Ein Hash als Keim, daraus schnell viele Bytes (xorshift); reicht gegen Kompression.
      let x = h.readUInt32LE(0) || 1;
      const ende = Math.min(n, i + (1 << 20));
      for (; i + 4 <= ende; i += 4) { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; b.writeUInt32LE(x >>> 0, i); }
      for (; i < ende; i++) b[i] = h[i & 31];
    }
    return b;
  }
}
