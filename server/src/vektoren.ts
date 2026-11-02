/**
 * Vektoren zu Dokumenten (#442): Schnittstelle für Pakete wie „KI lokal – Ähnlichkeit“ (dms-registry #44).
 *
 * Der Kern rechnet keine Vektoren. Ein Paket mit dem Recht `dms:vektoren` legt je Dokument und Modell einen
 * Vektor ab; der Kern vergleicht nur (Kosinus) und filtert nach den Rechten des Aufrufers.
 *
 * Speicher: float4-Array in PostgreSQL (Tabelle `vektoren`, Migration 047) – ohne Erweiterung, denn pgvector
 * steckt nicht im Image postgres:17, das die Vorlagen für NAS benutzen. Verglichen wird im Kern über einen
 * Zwischenspeicher je Modell (8 Bit je Wert), den der Dienst im Hintergrund lädt, sobald das Modell bekannt ist.
 * Messung mit 256 Dimensionen auf amd64 (2 Kerne), test/vektoren-messen.ts, Einzelheiten im Administratorhandbuch:
 *   10 000 Dokumente:  Kosinus in SQL (unnest) 305 ms, Zwischenspeicher 4 ms (4 MB, Laden 0,4 s)
 *   100 000 Dokumente: Kosinus in SQL (unnest) 2 985 ms, Zwischenspeicher 37 ms (33 MB, Laden 3,2 s)
 * In PostgreSQL braucht ein Vektor gut 1,2 KB.
 */

/** Höchstens so viele Dimensionen nimmt der Kern an. */
export const DIMENSION_MAX = 4096;
/** Wenigstens so viele – darunter ist es kein sinnvoller Vektor. */
export const DIMENSION_MIN = 8;
/** Kennung eines Modells, z. B. „static-similarity-mrl-multilingual-v1/256“. */
export const MODELL = /^[A-Za-z0-9][A-Za-z0-9._:/+-]{0,99}$/;
/** Ohne Angabe des Pakets: ab dieser Ähnlichkeit (Kosinus) gilt ein Dokument als ähnlich. */
export const SCHWELLE_STANDARD = 0.5;

/** Prüft eine Modellkennung; wirft mit verständlicher Meldung. */
export function liesModell(x: unknown): string {
  const m = typeof x === 'string' ? x.trim() : '';
  if (!MODELL.test(m)) throw new Error('Die Modellkennung fehlt oder ist ungültig (Buchstaben, Ziffern und . _ : / + -, höchstens 100 Zeichen).');
  return m;
}

/** Liest einen Vektor (Liste von Zahlen) und normiert ihn auf Länge 1; wirft mit verständlicher Meldung. */
export function liesVektor(x: unknown, dimension?: number): Float32Array {
  if (!Array.isArray(x)) throw new Error('Der Vektor fehlt (Liste von Zahlen).');
  if (x.length < DIMENSION_MIN || x.length > DIMENSION_MAX) throw new Error(`Ein Vektor hat ${DIMENSION_MIN} bis ${DIMENSION_MAX} Werte, dieser hat ${x.length}.`);
  if (dimension !== undefined && x.length !== dimension) throw new Error(`Die Vektoren dieses Modells haben ${dimension} Werte, dieser hat ${x.length}.`);
  const v = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) {
    const z = x[i];
    if (typeof z !== 'number' || !Number.isFinite(z)) throw new Error(`Wert ${i + 1} des Vektors ist keine Zahl.`);
    v[i] = z;
  }
  const n = norm(v);
  if (!(n > 1e-12)) throw new Error('Der Vektor ist überall 0.');
  for (let i = 0; i < v.length; i++) v[i] /= n;
  return v;
}

export function norm(v: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  return Math.sqrt(s);
}

/** Kosinus zweier Vektoren gleicher Länge. */
export function kosinus(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let s = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { s += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? s / Math.sqrt(na * nb) : 0;
}

export interface Treffer { dokumentId: string; mappeId: string; aehnlichkeit: number }

/**
 * Zwischenspeicher der Vektoren eines Modells: je Vektor 8 Bit je Wert und ein Maßstab.
 * Normierte Vektoren → Skalarprodukt = Kosinus (bis auf die Rundung, unter 1 %).
 */
export class Vektorindex {
  private werte: Int8Array;
  private massstab: Float32Array;
  private dok: Array<string | null> = [];
  private mappe: Array<string | null> = [];
  private platz = new Map<string, number>();
  private frei: number[] = [];

  constructor(readonly dimension: number, eintraege: Array<{ dokumentId: string; mappeId: string; vektor: Float32Array }> = []) {
    const n = Math.max(16, eintraege.length);
    this.werte = new Int8Array(n * dimension);
    this.massstab = new Float32Array(n);
    for (const e of eintraege) if (e.vektor.length === dimension) this.setze(e.dokumentId, e.mappeId, e.vektor);
  }

  get anzahl(): number { return this.platz.size; }
  /** Belegter Arbeitsspeicher in Bytes (ohne Kennungen). */
  get bytes(): number { return this.werte.byteLength + this.massstab.byteLength; }

  setze(dokumentId: string, mappeId: string, v: Float32Array) {
    if (v.length !== this.dimension) throw new Error(`Die Vektoren dieses Modells haben ${this.dimension} Werte.`);
    let i = this.platz.get(dokumentId);
    if (i === undefined) {
      i = this.frei.pop() ?? this.dok.length;
      if (i >= this.massstab.length) this.wachse(i + 1);
      this.platz.set(dokumentId, i);
    }
    this.dok[i] = dokumentId; this.mappe[i] = mappeId;
    let max = 0;
    for (let k = 0; k < v.length; k++) max = Math.max(max, Math.abs(v[k]));
    const f = max > 0 ? 127 / max : 0;
    const o = i * this.dimension;
    for (let k = 0; k < v.length; k++) this.werte[o + k] = Math.round(v[k] * f);
    this.massstab[i] = max > 0 ? max / 127 / (norm(v) || 1) : 0;
  }

  entferne(dokumentId: string) {
    const i = this.platz.get(dokumentId);
    if (i === undefined) return;
    this.platz.delete(dokumentId);
    this.dok[i] = null; this.mappe[i] = null; this.massstab[i] = 0;
    this.frei.push(i);
  }

  /** Vektor eines Dokuments aus dem Zwischenspeicher (gerundet). */
  vektor(dokumentId: string): Float32Array | null {
    const i = this.platz.get(dokumentId);
    if (i === undefined) return null;
    const v = new Float32Array(this.dimension);
    const o = i * this.dimension;
    for (let k = 0; k < this.dimension; k++) v[k] = this.werte[o + k] * this.massstab[i];
    return v;
  }

  /**
   * Die `max` ähnlichsten Dokumente zu q (normiert), absteigend; `ohne` = diese Dokumente auslassen,
   * `schwelle` = nur ab dieser Ähnlichkeit.
   */
  suche(q: Float32Array, max: number, opt: { schwelle?: number; ohne?: Set<string> } = {}): Treffer[] {
    if (q.length !== this.dimension || max <= 0) return [];
    const schwelle = opt.schwelle ?? -1;
    const D = this.dimension, w = this.werte, s = this.massstab;
    const top: Array<{ i: number; a: number }> = [];
    let grenze = schwelle;
    for (let i = 0; i < this.dok.length; i++) {
      if (!s[i]) continue;
      let x = 0;
      const o = i * D;
      for (let k = 0; k < D; k++) x += w[o + k] * q[k];
      const a = x * s[i];
      if (a < grenze || (top.length >= max && a <= top[top.length - 1].a)) continue;
      if (opt.ohne?.has(this.dok[i]!)) continue;
      // Einsortieren (max ist klein).
      let j = top.length;
      while (j > 0 && top[j - 1].a < a) j--;
      top.splice(j, 0, { i, a });
      if (top.length > max) top.pop();
      if (top.length >= max) grenze = Math.max(schwelle, top[top.length - 1].a);
    }
    return top.map((t) => ({ dokumentId: this.dok[t.i]!, mappeId: this.mappe[t.i]!, aehnlichkeit: Math.max(-1, Math.min(1, t.a)) }));
  }

  private wachse(min: number) {
    const n = Math.max(min, this.massstab.length * 2);
    const w = new Int8Array(n * this.dimension); w.set(this.werte); this.werte = w;
    const s = new Float32Array(n); s.set(this.massstab); this.massstab = s;
  }
}

/** Ähnliche Dokumente in Mappen zusammenfassen: je Mappe der beste Treffer, absteigend; `ohneMappen` auslassen. */
export function jeMappe(treffer: Treffer[], max: number, ohneMappen: Set<string> = new Set()): Treffer[] {
  const beste = new Map<string, Treffer>();
  for (const t of treffer) {
    if (ohneMappen.has(t.mappeId)) continue;
    const b = beste.get(t.mappeId);
    if (!b || t.aehnlichkeit > b.aehnlichkeit) beste.set(t.mappeId, t);
  }
  return [...beste.values()].sort((a, b) => b.aehnlichkeit - a.aehnlichkeit).slice(0, max);
}
