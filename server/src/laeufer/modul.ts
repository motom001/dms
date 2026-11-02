/**
 * Paket-Läufer (#338): Prüft ein WebAssembly-Modul, bevor es läuft.
 *
 * Schnittstelle eines Pakets („DMS-Paket-ABI 1“):
 * - Speicher wird importiert (`env.memory`, mit wasi-sdk: `-Wl,--import-memory`). So setzt der Läufer die
 *   Obergrenze; ein Modul mit eigenem Speicher wird abgelehnt.
 * - Importe nur aus `env` (nur memory), `wasi_snapshot_preview1` (ohne Dateisystem und Netz) und `dms`.
 * - Exporte: `dms_puffer(laenge) → zeiger` (Platz für die Eingabe), `dms_ereignis(zeiger, laenge) → 0|Fehler`,
 *   optional `dms_aktion(zeiger, laenge) → 0|Fehler`, optional `_initialize` (Reaktor-Modell von wasi-sdk).
 */

export const SEITE = 65536;
/** netz_strom, netz_weiter und teil seit DMS 0.124.0 (#444): Antworten Stück für Stück lesen und weitergeben. */
export const DMS_FUNKTIONEN = ['api', 'api_binaer', 'netz', 'netz_strom', 'netz_weiter', 'teil', 'datei', 'antwort_laenge', 'antwort_lesen', 'ergebnis', 'log', 'speicher_lesen', 'speicher_schreiben'] as const;
export type DmsFunktion = typeof DMS_FUNKTIONEN[number];

export interface Modulpruefung {
  /** Mindestgröße des importierten Speichers in Seiten (64 KiB). */
  speicherMin: number;
  /** Höchstgröße, falls das Modul eine angibt. */
  speicherMax: number | null;
  wasi: string[];
  dms: DmsFunktion[];
  aktion: boolean;
}

/** Liest die Grenzen des importierten Speichers direkt aus dem Binärformat (die JS-API verrät sie nicht). */
function speicherImport(bytes: Uint8Array): { min: number; max: number | null; geteilt: boolean; bit64: boolean } | null {
  let p = 8;
  const leb = () => { let r = 0, s = 0, b: number; do { b = bytes[p++]; r |= (b & 0x7f) << s; s += 7; } while (b & 0x80 && s < 35); return r >>> 0; };
  const name = () => { const n = leb(); const t = new TextDecoder().decode(bytes.subarray(p, p + n)); p += n; return t; };
  while (p < bytes.length) {
    const id = bytes[p++]; const groesse = leb(); const ende = p + groesse;
    if (id === 2) {
      const anzahl = leb();
      for (let i = 0; i < anzahl; i++) {
        const mod = name(), feld = name(); const art = bytes[p++];
        if (art === 0) leb();
        else if (art === 1) { p++; const f = bytes[p++]; leb(); if (f & 1) leb(); }
        else if (art === 2) {
          const f = bytes[p++]; const min = leb(); const max = f & 1 ? leb() : null;
          if (mod === 'env' && feld === 'memory') return { min, max, geteilt: !!(f & 2), bit64: !!(f & 4) };
        } else if (art === 3) { p++; p++; }
        else return null;
      }
      return null;
    }
    p = ende;
  }
  return null;
}

/** Prüft Importe und Exporte; wirft mit einer verständlichen Meldung. */
export function pruefeModul(modul: WebAssembly.Module, bytes: Uint8Array): Modulpruefung {
  const importe = WebAssembly.Module.imports(modul);
  const exporte = new Map(WebAssembly.Module.exports(modul).map((e) => [e.name, e.kind]));
  const fremd = importe.filter((i) => !(i.module === 'wasi_snapshot_preview1' && i.kind === 'function') && !(i.module === 'dms' && i.kind === 'function' && (DMS_FUNKTIONEN as readonly string[]).includes(i.name)) && !(i.module === 'env' && i.name === 'memory' && i.kind === 'memory'));
  if (fremd.length) throw new Error(`Das Modul verlangt Unbekanntes: ${fremd.slice(0, 5).map((i) => `${i.module}.${i.name}`).join(', ')}.`);
  if (exporte.get('memory') === 'memory' && !importe.some((i) => i.kind === 'memory')) throw new Error('Das Modul bringt eigenen Speicher mit. Bitte mit -Wl,--import-memory bauen (der Läufer setzt die Obergrenze).');
  const sp = speicherImport(bytes);
  if (!sp) throw new Error('Das Modul importiert keinen Speicher (env.memory). Bitte mit -Wl,--import-memory bauen.');
  if (sp.geteilt || sp.bit64) throw new Error('Geteilter oder 64-Bit-Speicher wird nicht unterstützt.');
  for (const [n, k] of [['dms_puffer', 'function'], ['dms_ereignis', 'function']] as const) if (exporte.get(n) !== k) throw new Error(`Das Modul exportiert ${n} nicht.`);
  return {
    speicherMin: sp.min, speicherMax: sp.max,
    wasi: importe.filter((i) => i.module === 'wasi_snapshot_preview1').map((i) => i.name),
    dms: importe.filter((i) => i.module === 'dms').map((i) => i.name as DmsFunktion),
    aktion: exporte.get('dms_aktion') === 'function',
  };
}

/** Nur Lade-Argumente an den Läufer weitergeben (z. B. --import tsx in Tests, Source Maps) – keine Test-, Debug- oder Berechtigungsschalter. */
export function ladeArgumente(argv: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (/^--(import|require|loader|experimental-loader)$/.test(a) && i + 1 < argv.length) { out.push(a, argv[++i]); continue; }
    if (/^--(import|require|loader|experimental-loader)=/.test(a) || a === '-r' || a === '--enable-source-maps' || a === '--no-warnings') { if (a === '-r' && i + 1 < argv.length) out.push(a, argv[++i]); else out.push(a); }
  }
  return out;
}
