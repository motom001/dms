/**
 * Pakete mit dem echten Installer prüfen (#1124) – für die CI von dms-registry und für Paket-Entwickler.
 *
 * Liest Paketordner, packt sie wie die Registry (alle Dateien des Ordners, ohne Ordner davor) und installiert sie über
 * die Paketverwaltung in eine leere Ablage im Arbeitsspeicher (speicherRepo, wie die Server-Tests). Die Archive stehen
 * dafür in einem Katalog im Arbeitsspeicher, der als offizieller Katalog gilt: So laufen genau die Prüfungen wie beim
 * Installieren aus dem Katalog – liesPaket, Prüfsumme, Vorschau, Abhängigkeiten, Herausgeber, Umbau, Anlegen samt
 * Beispielen. Ohne Netz, ohne Datenbank-Server, ohne Geheimnisse; nichts verlässt den Prozess.
 *
 * Mehrere Ordner installiert das Werkzeug in Abhängigkeitsreihenfolge. Gibt es dieselbe Id in mehreren Versionen,
 * installiert es die älteste und aktualisiert danach Version für Version (Update alt → neu); ein Paket, das eine andere
 * Id unter `ersetzt` nennt, ist das Update dieser Id (Umzug, #1084).
 */
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { passt, vergleicheVersion, type Katalog } from '../../shared/src/pakete';
import { speicherDateien } from './dateispeicher';
import { Dienst } from './dienst';
import { speicherEinstellungen } from './einstellungen';
import { Fachfehler } from './fehler';
import { MB } from './grenzen';
import { ARCHIV_MAX, liesPaket, liesZip, Paketverwaltung, type Manifest } from './pakete';
import type { Repo } from './repo';
import { speicherRepo } from './repo-speicher';
import { mitSprache, t } from './sprache';
import { zipPuffer } from './zip';

/** Adresse des Prüfkatalogs: reserviert (.invalid), wird nie aufgerufen – die Daten liegen im Arbeitsspeicher. */
export const PRUEFKATALOG = 'https://pakete-pruefen.invalid/katalog.json';
/** Wer installiert (steht nur in der Historie der Prüf-Ablage). */
export const PRUEFER = { id: '00000000-0000-4000-8000-000000001124', email: 'pakete-pruefen@example.org' };
/** Feste Zeit in den ZIP-Köpfen: gleiche Ordner, gleiche Prüfsumme. */
const ZIP_ZEIT = new Date('2026-01-01T12:00:00Z');

/** Ein gelesener Paketordner. */
export interface PruefPaket {
  ordner: string; manifest: Manifest; archiv: Buffer; sha256: string;
  /** Hinweise schon beim Lesen (z. B. übergangene Verknüpfungen). */
  hinweise: string[];
}
/** Ergebnis je Paket und Schritt. */
export interface PruefErgebnis {
  ordner: string; id: string | null; version: string | null;
  /** Bei einem Update die Version davor. */
  vorher: string | null;
  ok: boolean;
  /** Warum es nicht ging – wie `details.gruende` beim Installieren. */
  gruende: string[];
  /** Hinweise der Vorschau (machen nichts rot). */
  hinweise: string[];
}
export interface PruefOptionen {
  /** Ablago-Version für die Angabe `dms` im Manifest; ohne: diese Version. */
  version: string;
  /** Beispiele mit installieren (Standard: ja, wie das Häkchen in der Oberfläche). */
  beispiele?: boolean;
  /** Sprache der Gründe und Hinweise (de, en). */
  sprache?: string;
  /** Andere leere Ablage (Tests: PostgreSQL); ohne: im Arbeitsspeicher. */
  repo?: Repo;
}

const gruendeVon = (e: unknown): string[] => {
  if (e instanceof Fachfehler) {
    const g = (e.details as { gruende?: unknown } | undefined)?.gruende;
    return Array.isArray(g) && g.length ? [e.message, ...g.map(String).filter((x) => x !== e.message)] : [e.message];
  }
  return [e instanceof Error ? e.message : String(e)];
};

/**
 * Dateien eines Paketordners (rekursiv) wie im Archiv der Registry: Pfade relativ, mit /. Symbolische Links nimmt das
 * Werkzeug nicht mit (ein Link könnte aus dem Ordner zeigen); dafür ein Hinweis. Mehr als ARCHIV_MAX liest es nicht.
 */
export function liesOrdner(pfad: string): { dateien: Map<string, Buffer>; hinweise: string[] } {
  const dateien = new Map<string, Buffer>();
  const hinweise: string[] = [];
  let summe = 0;
  const lauf = (abs: string, rel: string) => {
    for (const n of readdirSync(abs).sort()) {
      const p = join(abs, n), r = rel ? `${rel}/${n}` : n;
      const s = lstatSync(p);
      if (s.isSymbolicLink()) { hinweise.push(t('meldungen.pakete-pruefen.link', { datei: r })); continue; }
      if (s.isDirectory()) { lauf(p, r); continue; }
      if (!s.isFile()) continue;
      summe += s.size;
      if (summe > ARCHIV_MAX) throw new Fachfehler(422, t('meldungen.pakete-pruefen.zu-gross', { mb: Math.round(ARCHIV_MAX / MB) }));
      dateien.set(r, readFileSync(p));
    }
  };
  if (!lstatSync(pfad).isDirectory()) throw new Fachfehler(422, t('meldungen.pakete-pruefen.kein-ordner', { pfad }));
  lauf(pfad, '');
  return { dateien, hinweise };
}

/**
 * Ein Ordner ohne manifest.yaml, aber mit Paketordnern darin (z. B. `pakete/` der Registry), steht für alle diese
 * Pakete – so geht `pakete-pruefen /pakete` auch im Container, wo die Shell des Rechners kein `*` auflöst.
 */
export function paketordner(pfad: string): string[] {
  try {
    if (!lstatSync(pfad).isDirectory() || existsSync(join(pfad, 'manifest.yaml'))) return [pfad];
    const innen = readdirSync(pfad).sort().map((n) => join(pfad, n)).filter((p) => lstatSync(p).isDirectory() && existsSync(join(p, 'manifest.yaml')));
    return innen.length ? innen : [pfad];
  } catch { return [pfad]; }
}

/** Liest einen Paketordner: Archiv wie in der Registry und das Manifest über liesPaket (wirft mit allen Gründen). */
export function liesPaketordner(pfad: string): PruefPaket {
  const { dateien, hinweise } = liesOrdner(pfad);
  const archiv = zipPuffer([...dateien].map(([name, daten]) => ({ name, daten })), ZIP_ZEIT);
  const paket = liesPaket(liesZip(archiv));
  return { ordner: pfad, manifest: paket.manifest, archiv, sha256: createHash('sha256').update(archiv).digest('hex'), hinweise };
}

/**
 * Reihenfolge der Schritte: Jede (Id, Version) ist ein Knoten. Vor einem Paket kommt je Abhängigkeit die älteste
 * angegebene Version, die den Bereich erfüllt; vor einer Version die ältere derselben Id; vor einem Paket mit `ersetzt`
 * alle Versionen der ersetzten Id. Unter den freien Knoten zuerst die niedrigere Stufe (älteste Version einer Id = 0),
 * dann die Reihenfolge der Angabe – so laufen alle alten Stände vor den Updates. `kreis`: was wegen eines Kreises nicht
 * an die Reihe kommt.
 */
export function reihenfolge<T extends ReihenPaket>(pakete: T[]): { reihe: T[]; kreis: T[] } {
  const { vor, stufe } = vorgaenger(pakete);
  const reihe: T[] = [], fertig = new Set<T>();
  for (;;) {
    const frei = pakete.filter((p) => !fertig.has(p) && [...vor.get(p)!].every((x) => fertig.has(x)));
    if (!frei.length) break;
    frei.sort((a, b) => stufe.get(a)! - stufe.get(b)! || pakete.indexOf(a) - pakete.indexOf(b));
    reihe.push(frei[0]); fertig.add(frei[0]);
  }
  return { reihe, kreis: pakete.filter((p) => !fertig.has(p)) };
}
type ReihenPaket = { manifest: Pick<Manifest, 'id' | 'version' | 'abhaengigkeiten' | 'ersetzt'> };

/** Was vor jedem Paket kommen muss, und seine Stufe (0 = älteste angegebene Version seiner Id). */
function vorgaenger<T extends ReihenPaket>(pakete: T[]): { vor: Map<T, Set<T>>; stufe: Map<T, number> } {
  const jeId = new Map<string, T[]>();
  for (const p of pakete) jeId.set(p.manifest.id, [...(jeId.get(p.manifest.id) ?? []), p]);
  for (const l of jeId.values()) l.sort((a, b) => vergleicheVersion(a.manifest.version, b.manifest.version));
  const stufe = new Map(pakete.map((p) => [p, jeId.get(p.manifest.id)!.indexOf(p)]));
  const vor = new Map<T, Set<T>>(pakete.map((p) => [p, new Set<T>()]));
  for (const p of pakete) {
    const v = vor.get(p)!, i = stufe.get(p)!;
    if (i > 0) v.add(jeId.get(p.manifest.id)![i - 1]);
    for (const [id, bereich] of Object.entries(p.manifest.abhaengigkeiten)) {
      const d = (jeId.get(id) ?? []).find((x) => passt(x.manifest.version, bereich));
      if (d && d !== p) v.add(d);
    }
    for (const alt of p.manifest.ersetzt ?? []) for (const x of jeId.get(alt) ?? []) v.add(x);
  }
  return { vor, stufe };
}

/** Katalog im Arbeitsspeicher aus den gelesenen Paketen (ohne Signatur – geprüft wird der Installer, nicht die Herkunft). */
function pruefkatalog(pakete: PruefPaket[], versteckt: Set<string>): Katalog {
  const jeId = new Map<string, PruefPaket[]>();
  for (const p of pakete) if (!versteckt.has(p.manifest.id)) jeId.set(p.manifest.id, [...(jeId.get(p.manifest.id) ?? []), p]);
  return {
    format: 1, erstellt: '', quelle: 'pakete-pruefen',
    pakete: [...jeId].map(([id, l]) => {
      const neu = [...l].sort((a, b) => vergleicheVersion(b.manifest.version, a.manifest.version));
      const m = neu[0].manifest;
      return {
        id, name: m.name, beschreibung: m.beschreibung, autor: m.autor, lizenz: m.lizenz, aktuell: m.version,
        ...(m.herausgeber ? { herausgeber: m.herausgeber } : {}), ...(m.ersetzt?.length ? { ersetzt: m.ersetzt } : {}),
        versionen: neu.map((p) => ({
          version: p.manifest.version, dms: p.manifest.dms, abhaengigkeiten: p.manifest.abhaengigkeiten,
          inhalt: { mappentypen: [], sichten: [], beispiele: 0 }, code: p.manifest.code !== undefined,
          ...(p.manifest.ergaenzt ? { ergaenzt: p.manifest.ergaenzt } : {}),
          archiv: `archive/${id}-${p.manifest.version}.zip`, sha256: p.sha256, groesse: p.archiv.length,
          veroeffentlicht: '2026-01-01T00:00:00Z', quelle: '', readme: '', changelog: '',
        })),
      };
    }),
  };
}

/**
 * Liest alle Ordner (Fehler → Gründe, danach die übrigen). Dieselbe Version zweimal (z. B. alter und neuer Stand eines
 * unveränderten Pakets) zählt einmal – bei anderem Inhalt ist das ein Fehler, wie in der Registry (Version erhöhen).
 */
function liesAlle(ordner: string[]): { gelesen: PruefPaket[]; ergebnisse: PruefErgebnis[] } {
  const ergebnisse: PruefErgebnis[] = [], gelesen: PruefPaket[] = [];
  const fehler = (o: string, gruende: string[], m?: Manifest): PruefErgebnis => ({ ordner: o, id: m?.id ?? null, version: m?.version ?? null, vorher: null, ok: false, gruende, hinweise: [] });
  for (const o of ordner.flatMap(paketordner)) {
    let p: PruefPaket;
    try { p = { ...liesPaketordner(resolve(o)), ordner: o }; } catch (e) { ergebnisse.push(fehler(o, gruendeVon(e))); continue; }
    const da = gelesen.find((x) => x.manifest.id === p.manifest.id && x.manifest.version === p.manifest.version);
    if (!da) gelesen.push(p);
    else if (da.sha256 !== p.sha256) ergebnisse.push(fehler(o, [t('meldungen.pakete-pruefen.gleiche-version', { ordner: da.ordner, version: p.manifest.version })], p.manifest));
  }
  return { gelesen, ergebnisse };
}

/** Alles bestätigen, was in der Oberfläche eine Person bestätigt – geprüft wird, ob das Paket sich installieren lässt. */
const JA = { bestaetigt: true, rechteBestaetigt: true, herausgeberBestaetigt: true, umbauBestaetigt: true, gesamteVerwaltung: true } as const;

/** Ein Schritt: installieren bzw. – ist die Id (oder eine unter `ersetzt`) schon da – aktualisieren. */
async function schritt(p: PruefPaket, d: Dienst, pv: Paketverwaltung, versteckt: Set<string>, beispiele: boolean): Promise<PruefErgebnis> {
  const { id, version } = p.manifest;
  const installiert = await d.kern.repo.listePakete();
  const alt = installiert.find((x) => x.id === id) ?? installiert.find((x) => p.manifest.ersetzt?.includes(x.id)) ?? null;
  const vorher = !alt ? null : alt.id === id ? alt.version : `${alt.id} ${alt.version}`;
  const erg: PruefErgebnis = { ordner: p.ordner, id, version, vorher, ok: false, gruende: [], hinweise: [...p.hinweise] };
  try {
    // Umzug (#1084): Die alte Id verschwindet aus dem Katalog, damit das Update sie unter `ersetzt` findet.
    if (alt && alt.id !== id) versteckt.add(alt.id);
    await pv.katalog();
    try { erg.hinweise.push(...(await pv.vorschau({ id: alt?.id ?? id, version })).hinweise); } catch { /* Gründe liefert gleich die Installation */ }
    if (alt) await pv.aktualisiere(alt.id, { version, ...JA }, PRUEFER);
    else await pv.installiere({ id, version, beispiele, ...JA }, PRUEFER);
    erg.ok = true;
  } catch (e) {
    erg.gruende = gruendeVon(e);
  }
  return erg;
}

/**
 * Prüft die Ordner: liest jeden, installiert in Reihenfolge in eine leere Ablage im Arbeitsspeicher und gibt je Ordner
 * bzw. Schritt das Ergebnis zurück.
 */
export async function pruefePakete(ordner: string[], opt: PruefOptionen): Promise<PruefErgebnis[]> {
  return mitSprache(opt.sprache ?? 'de', async () => {
    const { gelesen, ergebnisse } = liesAlle(ordner);
    const { reihe, kreis } = reihenfolge(gelesen);
    for (const p of kreis) ergebnisse.push({ ordner: p.ordner, id: p.manifest.id, version: p.manifest.version, vorher: null, ok: false, gruende: [t('meldungen.pakete-pruefen.kreis')], hinweise: [] });
    if (!reihe.length) return ergebnisse;
    const versteckt = new Set<string>();
    const archive = new Map(gelesen.map((p) => [new URL(`archive/${p.manifest.id}-${p.manifest.version}.zip`, PRUEFKATALOG).toString(), p.archiv]));
    const abruf = async (url: string): Promise<Buffer> => {
      if (url === PRUEFKATALOG) return Buffer.from(JSON.stringify(pruefkatalog(gelesen, versteckt)));
      const b = archive.get(url);
      // Kein Netz: alles andere (Signatur, Schlüssel, fremde Kataloge) gibt es hier nicht.
      if (!b) throw new Error(t('meldungen.pakete-pruefen.ohne-netz', { url }));
      return b;
    };
    const d = new Dienst(opt.repo ?? speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
    const pv = new Paketverwaltung(d, { version: () => opt.version, abruf, katalogUrl: PRUEFKATALOG });
    for (const p of reihe) ergebnisse.push(await schritt(p, d, pv, versteckt, opt.beispiele !== false));
    return ergebnisse;
  });
}

/** Ergebnisse als Text: je Paket OK bzw. FEHLER mit Gründen, Hinweise eingerückt, am Ende die Summe. */
export function alsText(ergebnisse: PruefErgebnis[]): string {
  const zeilen: string[] = [];
  for (const e of ergebnisse) {
    const was = e.id ? e.vorher ? t('meldungen.pakete-pruefen.update', { id: e.id, version: e.version ?? '', vorher: e.vorher }) : `${e.id} ${e.version}` : basename(e.ordner);
    zeilen.push(`${(e.ok ? 'OK' : t('meldungen.pakete-pruefen.fehler')).padEnd(6)}  ${was}  [${e.ordner}]`);
    for (const g of e.gruende) zeilen.push(`          - ${g}`);
    for (const h of e.hinweise) zeilen.push(`          ${t('meldungen.pakete-pruefen.hinweis', { text: h })}`);
  }
  const gut = ergebnisse.filter((e) => e.ok).length;
  zeilen.push('', t('meldungen.pakete-pruefen.summe', { gut, alle: ergebnisse.length }));
  return zeilen.join('\n');
}
