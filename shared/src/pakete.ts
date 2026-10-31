/**
 * Paketverwaltung (#188): Katalog der Registry, Versionen und installierte Pakete.
 * Format von Katalog und Paket: motom001/dms-registry (README, schema/). Server und Oberfläche teilen diese Datei.
 */

/** Der offizielle Katalog (Branch gh-pages der Registry). */
export const OFFIZIELLER_KATALOG = 'https://raw.githubusercontent.com/motom001/dms-registry/gh-pages/katalog.json';
/** Die Registry selbst – Quellen, Regeln, Vorlage. */
export const REGISTRY = 'https://github.com/motom001/dms-registry';

export const PAKET_ID = /^[a-z][a-z0-9_]{1,19}$/;
export const VERSION = /^\d+\.\d+\.\d+$/;
export const BEREICH = /^(>=|>|=|\^|~)?(\d+\.\d+\.\d+)( <(\d+\.\d+\.\d+))?$/;

export interface Benannt { schluessel: string; name: string }
export interface KatalogVersion {
  version: string;
  /** Nötige DMS-Version, z. B. „>=0.63.0“. */
  dms: string;
  abhaengigkeiten: Record<string, string>;
  inhalt: { mappentypen: Benannt[]; sichten: Benannt[]; beispiele: number };
  code: boolean;
  /** Adresse des Archivs, relativ zu katalog.json. */
  archiv: string;
  sha256: string;
  groesse: number;
  veroeffentlicht: string;
  quelle: string; readme: string; changelog: string;
}
export interface KatalogPaket {
  id: string; name: string; beschreibung: string;
  autor: { name: string; github: string };
  lizenz: string; aktuell: string;
  /** Neueste zuerst. */
  versionen: KatalogVersion[];
}
export interface Katalog { format: number; erstellt: string; quelle: string; pakete: KatalogPaket[] }

/** Woher ein installiertes Paket stammt. */
export type Herkunft =
  | { art: 'katalog'; url: string }
  | { art: 'hochgeladen'; von: string | null; am: string };

export interface InstalliertesPaket {
  id: string; name: string; version: string; beschreibung: string; lizenz: string;
  autor: { name: string; github: string };
  herkunft: Herkunft;
  installiert: string; installiertVon: string | null;
  aktualisiert: string | null; aktualisiertVon: string | null;
  /** Lokaler Schlüssel → Id des Mappentyps bzw. der Sicht im DMS. */
  typen: Record<string, string>;
  sichten: Record<string, string>;
  abhaengigkeiten: Record<string, string>;
  /** Einstellungen, wie das Paket sie beschreibt (#197); null = keine. */
  einstellungen?: import('./paketeinstellungen').Einstellungsbeschreibung | null;
  /** Nur in der Antwort der Werkbank: Pflichtfelder der Einstellungen fehlen (#197). */
  einstellungenNoetig?: boolean;
  /** Das Paket enthält Code (läuft erst mit dem Paket-Läufer). */
  code?: boolean;
  /** Links aus dem Katalog (README, Changelog, Quelle), sofern bekannt. */
  links?: { readme?: string; changelog?: string; quelle?: string };
}

/* ---------- Versionen ---------- */

const teile = (v: string) => v.split('.').map((x) => Number.parseInt(x, 10) || 0);

/** < 0: a älter, 0: gleich, > 0: a neuer. Vorspann wie „v“ und Zusätze wie „-rc1“ zählen nicht. */
export function vergleicheVersion(a: string, b: string): number {
  const x = teile(a.replace(/^v/, '').split('-')[0]), y = teile(b.replace(/^v/, '').split('-')[0]);
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  return 0;
}

/**
 * Passt eine Version zu einem Bereich? „>=1.2.0“, „>1.2.0“, „=1.2.0“ bzw. „1.2.0“ (genau),
 * „^1.2.0“ (gleiche Hauptversion; bei 0.x gleiche Nebenversion), „~1.2.0“ (gleiche Nebenversion),
 * optional mit Obergrenze „ <2.0.0“.
 */
export function passt(version: string, bereich: string): boolean {
  const m = BEREICH.exec(bereich.trim());
  if (!m) return false;
  const [, op = '=', basis, , ober] = m;
  const c = vergleicheVersion(version, basis);
  const [haupt, neben] = teile(basis);
  let ok: boolean;
  switch (op) {
    case '>=': ok = c >= 0; break;
    case '>': ok = c > 0; break;
    case '^': ok = c >= 0 && (haupt > 0 ? vergleicheVersion(version, `${haupt + 1}.0.0`) < 0 : vergleicheVersion(version, `0.${neben + 1}.0`) < 0); break;
    case '~': ok = c >= 0 && vergleicheVersion(version, `${haupt}.${neben + 1}.0`) < 0; break;
    default: ok = c === 0;
  }
  return ok && (!ober || vergleicheVersion(version, ober) < 0);
}

/** Eine DMS-Version ohne Zahl (z. B. „Entwicklung“) gilt als passend. */
export const dmsPasst = (dms: string, bereich: string) => !/^\d+\.\d+\.\d+/.test(dms.replace(/^v/, '')) || passt(dms.replace(/^v/, ''), bereich);

/** Neueste Version eines Katalogpakets, die zu einem Bereich passt. */
export function neuestePassende(p: KatalogPaket, bereich?: string): KatalogVersion | undefined {
  return [...p.versionen].sort((a, b) => vergleicheVersion(b.version, a.version)).find((v) => !bereich || passt(v.version, bereich));
}

/* ---------- Katalog lesen ---------- */

const text = (v: unknown) => (typeof v === 'string' ? v : '');

/** Prüft und vereinheitlicht einen geladenen Katalog; wirft mit verständlicher Meldung. */
export function liesKatalog(j: unknown): Katalog {
  const k = j as Partial<Katalog> | null;
  if (!k || typeof k !== 'object' || !Array.isArray(k.pakete)) throw new Error('Das ist kein Paketkatalog (katalog.json).');
  if (k.format !== 1) throw new Error(`Katalogformat ${String(k.format)} kennt dieses DMS nicht – bitte das DMS aktualisieren.`);
  const pakete: KatalogPaket[] = [];
  for (const p of k.pakete) {
    if (!p || !PAKET_ID.test(text(p.id)) || !Array.isArray(p.versionen)) continue;
    const versionen = p.versionen.filter((v) => v && VERSION.test(text(v.version)) && /^[0-9a-f]{64}$/.test(text(v.sha256)) && text(v.archiv))
      .map((v) => ({
        ...v,
        dms: text(v.dms) || '>=0.0.0',
        abhaengigkeiten: v.abhaengigkeiten && typeof v.abhaengigkeiten === 'object' ? v.abhaengigkeiten : {},
        inhalt: { mappentypen: v.inhalt?.mappentypen ?? [], sichten: v.inhalt?.sichten ?? [], beispiele: Number(v.inhalt?.beispiele) || 0 },
        code: !!v.code,
      }))
      .sort((a, b) => vergleicheVersion(b.version, a.version));
    if (!versionen.length) continue;
    pakete.push({
      id: p.id, name: text(p.name) || p.id, beschreibung: text(p.beschreibung),
      autor: { name: text(p.autor?.name), github: text(p.autor?.github) }, lizenz: text(p.lizenz),
      aktuell: VERSION.test(text(p.aktuell)) ? p.aktuell : versionen[0].version, versionen,
    });
  }
  return { format: 1, erstellt: text(k.erstellt), quelle: text(k.quelle), pakete: pakete.sort((a, b) => a.name.localeCompare(b.name, 'de')) };
}

/** Herkunft lesbar, z. B. „offizieller Katalog“ oder „hochgeladen von … am …“. */
export function herkunftText(h: Herkunft, person: (id: string | null) => string = (x) => x ?? '–'): string {
  if (h.art === 'katalog') return h.url === OFFIZIELLER_KATALOG ? 'offizieller Katalog' : `Katalog ${h.url}`;
  return `hochgeladen von ${person(h.von)} am ${new Date(h.am).toLocaleDateString('de-DE')}`;
}
