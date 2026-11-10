/**
 * Paketverwaltung (#188): Katalog der Registry, Versionen und installierte Pakete.
 * Format von Katalog und Paket: motom001/dms-registry (README, schema/). Server und Oberfläche teilen diese Datei.
 */
import { dateitypName, DMS_UMWANDELN_AB, kernTyp, MIME, UMWANDELN_TYPEN_MAX } from './dateiumwandlung';
import { DMS_PAKET_VOLLTEXT_AB, VOLLTEXT_TYPEN_MAX } from './paketvolltext';
import { ARCHIV_TYPEN_MAX, DMS_ARCHIVFASSUNG_AB } from './archivfassung';
import { DMS_UEBERSETZEN_AB } from './uebersetzung';
import type { Hilfeort } from './hilfe';
import type { PaketKatalogArt, VERALTETE_EREIGNISSE } from './ereignisse';
import { t } from './texte';
import { gebietsschema } from './sprache';
import { PAKET_ID, TYPVERWEIS_ODER_ALLE } from './kennungen';

/** Der offizielle Katalog (Branch gh-pages der Registry). */
export const OFFIZIELLER_KATALOG = 'https://catalog.ablago.app/katalog.json';
/** Die Katalog-Webseite (GitHub Pages der Registry), u. a. zum Zusammenstellen einer Sammeldatei (#461). */
export const KATALOG_SEITE = 'https://catalog.ablago.app/';
/** Die Registry selbst – Quellen, Regeln, Vorlage. */
export const REGISTRY = 'https://github.com/motom001/dms-registry';

/** Muster der Paket-Id (#1084: bis 40 Zeichen, optional ein Punkt-Zusatz) – zentral in kennungen.ts. */
export { PAKET_ID };
export const VERSION = /^\d+\.\d+\.\d+$/;

/**
 * „Im Katalog ansehen“ (#622, dms-registry #84): Adresse der Katalog-Webseite – oder mit `paket` der
 * Seite dieses Pakets – mit der eigenen DMS-Version im **Fragment** `#dms=<Version>`. Das Fragment
 * schickt der Browser nie an den Server (kein Zugriffsprotokoll, keine Telemetrie, #389); nur das
 * Skript der Katalogseite (`dms.js`) liest es, merkt es sich im Browser und entfernt es wieder.
 * Nur die Version, nie ein Parameter (`?…`). Die Katalogseite nimmt genau `X.Y.Z` an – eine andere
 * Angabe (z. B. „unbekannt“) lässt das Fragment weg; eine ungültige Paket-Id die Paketseite.
 */
export function katalogSeiteMitVersion(dms: string, paket?: string): string {
  return mitVersion(paket && PAKET_ID.test(paket) ? `${KATALOG_SEITE}paket/${paket}/` : KATALOG_SEITE, dms);
}
/** Seite „Pakete herunterladen“ der Katalog-Webseite: Sammeldatei für ein DMS ohne Internet (#461). */
export const SAMMEL_SEITE = `${KATALOG_SEITE}sammeldatei.html`;
/**
 * Link auf die Sammeldatei-Seite – wie {@link katalogSeiteMitVersion} mit der Version nur im Fragment
 * `#dms=<Version>` (dms.js liest es dort ebenso), nie als Query `?dms=` (das stünde im Zugriffsprotokoll).
 */
export const sammelSeiteMitVersion = (dms: string): string => mitVersion(SAMMEL_SEITE, dms);
const mitVersion = (seite: string, dms: string) => (VERSION.test(dms) ? `${seite}#dms=${dms}` : seite);
/** Links auf die Katalog-Webseite: neuer Tab ohne Zugriff aufs DMS und ohne Herkunftsadresse (#622). */
export const KATALOG_LINK_REL = 'noopener noreferrer';
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
  /** Ergänzung eines anderen Pakets (#405, Manifest `ergaenzt`), z. B. eine Zusatzsprache der Texterkennung. */
  ergaenzt?: Ergaenzung;
  /** Sprachpaket (#731): Sprache, maschinell übersetzt oder geprüft – für den Hinweis im Katalog. */
  sprache?: KatalogSprache;
}
/** Angaben eines Sprachpakets im Katalog (#731, dms-registry #116). */
export interface KatalogSprache { kennung: string; maschinell: boolean; geprueftVon?: string; ablago?: string }

/** Liest `sprache` einer Katalogversion; Ungültiges zählt nicht (das Paket bleibt sichtbar, nur ohne Hinweis). */
export function liesKatalogSprache(v: unknown): KatalogSprache | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const o = v as Record<string, unknown>;
  if (typeof o.kennung !== 'string' || !/^[a-z]{2,3}(-[A-Z]{2})?$/.test(o.kennung)) return undefined;
  const gv = typeof o.geprueft_von === 'string' ? o.geprueft_von : typeof o.geprueftVon === 'string' ? o.geprueftVon : '';
  return {
    kennung: o.kennung, maschinell: o.maschinell === true,
    ...(gv.trim() && gv.length <= 200 && !/[<>]/.test(gv) ? { geprueftVon: gv.trim() } : {}),
    ...(typeof o.ablago === 'string' && VERSION.test(o.ablago) ? { ablago: o.ablago } : {}),
  };
}

/**
 * Ein Paket ergänzt ein anderes (#405): Manifest-Feld `ergaenzt: <paket>` oder `ergaenzt: { paket, gruppe }`. Das
 * ergänzte Paket muss unter `abhaengigkeiten` stehen. Die Installation zeigt Ergänzungen als Häkchen unter dem
 * ergänzten Paket, gruppiert nach `gruppe` (z. B. „Weitere Sprachen“); ohne Gruppe unter „Ergänzungen“.
 * Ältere DMS-Versionen übergehen das Feld (#635) – Pakete damit brauchen kein höheres `dms`.
 */
export interface Ergaenzung { paket: string; gruppe?: string }
/** Ab dieser Version zeigt das DMS Ergänzungen als Häkchen und installiert mehrere Pakete in einem Ablauf (#405). */
export const DMS_ERGAENZUNG_AB = '0.151.0';
export const ERGAENZUNG_GRUPPE_MAX = 40;

/** Liest `ergaenzt` (Manifest oder Katalog); null, wenn nicht da. fehler: was daran ungültig ist. */
export function liesErgaenzt(v: unknown, abhaengigkeiten: Record<string, unknown> = {}): { ergaenzt: Ergaenzung | null; fehler: string[] } {
  if (v === undefined || v === null) return { ergaenzt: null, fehler: [] };
  const roh = typeof v === 'string' ? { paket: v } : v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null;
  if (!roh) return { ergaenzt: null, fehler: ['ergaenzt: der Name eines Pakets oder { paket, gruppe }.'] };
  const fehler: string[] = [];
  const paket = typeof roh.paket === 'string' ? roh.paket : '';
  if (!PAKET_ID.test(paket)) fehler.push(t('gemeinsam.pakete.ergaenzt-ungueltige-paket-id'));
  else if (!(paket in abhaengigkeiten)) fehler.push(t('gemeinsam.pakete.ergaenzt-muss-auch-unter', { paket }));
  const gruppe = roh.gruppe === undefined ? undefined : typeof roh.gruppe === 'string' ? roh.gruppe.trim() : null;
  if (gruppe === null || (gruppe !== undefined && (!gruppe || gruppe.length > ERGAENZUNG_GRUPPE_MAX))) fehler.push(t('gemeinsam.pakete.ergaenzt-gruppe-ein-text', { ERGAENZUNG_GRUPPE_MAX }));
  for (const k of Object.keys(roh)) if (k !== 'paket' && k !== 'gruppe') fehler.push(t('gemeinsam.pakete.ergaenzt-gibt-es-nicht', { k }));
  return fehler.length ? { ergaenzt: null, fehler } : { ergaenzt: { paket, ...(gruppe ? { gruppe } : {}) }, fehler };
}

/** Ein Angebot zum Mitinstallieren (#405): Ergänzung eines Pakets aus dem Katalog. */
export interface ErgaenzungAngebot { id: string; name: string; version: string; beschreibung: string; gruppe: string | null; code: boolean }

/**
 * Ergänzungen eines Pakets im Katalog (#405): Pakete, deren neueste zur DMS-Version passende Version `ergaenzt: <basis>`
 * angibt und die noch nicht installiert sind – nach Gruppe und Namen sortiert.
 */
export function ergaenzungenVon(k: Katalog, basis: string, dms: string, installiert: Array<{ id: string }> = []): ErgaenzungAngebot[] {
  const erg: ErgaenzungAngebot[] = [];
  for (const p of k.pakete) {
    if (p.id === basis || installiert.some((x) => x.id === p.id)) continue;
    const v = [...p.versionen].sort((a, b) => vergleicheVersion(b.version, a.version)).find((x) => dmsPasst(dms, x.dms));
    if (v?.ergaenzt?.paket === basis) erg.push({ id: p.id, name: p.name, version: v.version, beschreibung: p.beschreibung, gruppe: v.ergaenzt.gruppe ?? null, code: v.code });
  }
  return erg.sort((a, b) => (a.gruppe ?? '').localeCompare(b.gruppe ?? '', 'de') || a.name.localeCompare(b.name, 'de'));
}
export interface KatalogPaket {
  id: string; name: string; beschreibung: string;
  autor: { name: string; github: string };
  lizenz: string; aktuell: string;
  /** Neueste zuerst. */
  versionen: KatalogVersion[];
  /** Anzeige wie im Katalog (#645, dms-registry #84/#98): Lucide-Name, Sprachkürzel, Kategorien – optional. */
  symbol?: string; kuerzel?: string; kategorien?: string[];
}
export interface Katalog { format: number; erstellt: string; quelle: string; pakete: KatalogPaket[] }

/** Woher ein installiertes Paket stammt. */
export type Herkunft =
  | { art: 'katalog'; url: string }
  | { art: 'hochgeladen'; von: string | null; am: string };

/**
 * Herkunftsprüfung (#594): Was die Signatur über einen Katalog, eine Sammeldatei oder ein hochgeladenes Paket
 * sagt. Die Vorschau zeigt sie als Zeile „Herkunft“.
 */
export interface HerkunftPruefung {
  /**
   * projekt: gültig signiert vom DMS-Projekt (offizieller Katalog bzw. Sammeldatei daraus);
   * anbieter: gültig signiert mit dem bestätigten Schlüssel eines eigenen Katalogs;
   * unsigniert: keine Signatur; ungueltig: Signatur da, aber ungültig (steht im Protokoll);
   * datei: hochgeladenes Paket ohne signierten Katalog.
   */
  art: 'projekt' | 'anbieter' | 'unsigniert' | 'ungueltig' | 'datei';
  /** Aus dem offiziellen Katalog bzw. einer Sammeldatei mit dem offiziellen Katalog. */
  offiziell: boolean;
  /** Stand (`erstellt`) des signierten Katalogs. */
  stand?: string;
  /** Älter als KATALOG_ALT_TAGE (nur ohne Internet, Sammeldatei). */
  alt?: boolean;
  /** Fingerabdruck des Anbieter-Schlüssels (eigener Katalog). */
  fingerabdruck?: string;
  /** Der Anbieter hat seinen Schlüssel geordnet gewechselt (neuer mit dem alten signiert). */
  wechsel?: boolean;
  /** Hochgeladenes Paket: Prüfsumme steht so im offiziellen Katalog, in dieser Version. */
  katalogversion?: string;
  /** Das DMS hat noch Testschlüssel statt der echten Schlüssel des Projekts. */
  test?: boolean;
  /** Vor der Installation muss die Herkunft bestätigt werden. */
  bestaetigen: boolean;
}
/** Ab so vielen Tagen warnt das DMS vor einem alten Katalogstand (Sammeldatei ohne Internet, #594). */
export const KATALOG_ALT_TAGE = 90;

export interface InstalliertesPaket {
  id: string; name: string; version: string; beschreibung: string; lizenz: string;
  autor: { name: string; github: string };
  herkunft: Herkunft;
  installiert: string; installiertVon: string | null;
  aktualisiert: string | null; aktualisiertVon: string | null;
  /** Schlüssel der mitgelieferten Automatisierungen dieser Version (#712) – bei einem Update stehen nur neue zur Wahl. */
  automatisierungen?: string[];
  /** Lokaler Schlüssel → Id des Mappentyps bzw. der Sicht im DMS. */
  typen: Record<string, string>;
  sichten: Record<string, string>;
  /** Schlüssel der Beispiel-Mappen → Id (#347), nur wenn Beispiele mit Schlüssel angelegt wurden. */
  beispiele?: Record<string, string>;
  /**
   * Alle Beispiel-Mappen dieser Installation (#878) mit ihrem Stand direkt nach dem Anlegen. Unveränderte gehen beim
   * Entfernen des Pakets und mit „Beispiele entfernen“ samt ihren Dokumenten weg; fehlt bei älteren Installationen.
   */
  beispielMappen?: BeispielStand[];
  abhaengigkeiten: Record<string, string>;
  /** Einstellungen, wie das Paket sie beschreibt (#197); null = keine. */
  einstellungen?: import('./paketeinstellungen').Einstellungsbeschreibung | null;
  /** Nur in der Antwort der Werkbank: Pflichtfelder der Einstellungen fehlen (#197). */
  einstellungenNoetig?: boolean;
  /** Nur in der Antwort der Werkbank: Sprachpaket (#731) – Übersetzung zu so viel Prozent vollständig (diese Version). */
  spracheAbdeckung?: number;
  /** Das Paket enthält Code (#338: läuft im Paket-Läufer). */
  code?: boolean;
  /** Code des Pakets (#338): Ereignisse, bestätigte Rechte und erlaubte Adressen im Netzwerk/Internet, Prüfwert des Moduls. */
  laeufer?: PaketCode;
  /** Links aus dem Katalog (README, Changelog, Quelle), sofern bekannt. */
  links?: { readme?: string; changelog?: string; quelle?: string };
  /** Nötige DMS-Version laut Manifest (seit #458 gespeichert; fehlt bei älteren Installationen). */
  dms?: string;
  /** Stand der Mappentypen, wie das Paket sie gebracht hat (#653), je Id – für „geändert“ mit Unterschieden. */
  typStand?: Record<string, import('./typvergleich').TypBild>;
  /** Sprachpaket (#731): Sprache, Gebietsschema, Ablago-Version der Texte, maschinell/geprüft; die Texte selbst stehen extra. */
  sprache?: import('./sprachpaket').SprachpaketInfo;
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

/**
 * Reihenfolge zum Installieren: Abhängigkeiten zuerst (#460, #461). Abhängigkeiten, die nicht in der Liste
 * stehen, zählen nicht (sind schon installiert oder fehlen). null = Kreis.
 */
export function nachAbhaengigkeiten<T extends { id: string; abhaengigkeiten: Record<string, string> }>(liste: T[]): T[] | null {
  const nach = new Map(liste.map((x) => [x.id, x]));
  const fertig = new Set<string>(), unterwegs = new Set<string>();
  const erg: T[] = [];
  const besuche = (x: T): boolean => {
    if (fertig.has(x.id)) return true;
    if (unterwegs.has(x.id)) return false;
    unterwegs.add(x.id);
    for (const a of Object.keys(x.abhaengigkeiten)) { const z = nach.get(a); if (z && !besuche(z)) return false; }
    unterwegs.delete(x.id); fertig.add(x.id); erg.push(x);
    return true;
  };
  for (const x of liste) if (!besuche(x)) return null;
  return erg;
}

/** Ein Paket in einer Auswahl aus dem Katalog (#460, #461): selbst gewählt oder als Abhängigkeit mitgenommen. */
export interface AuswahlPaket {
  id: string; name: string; version: string; code: boolean;
  /** Selbst gewählt (sonst: kommt als Abhängigkeit mit). */
  gewaehlt: boolean;
  /** Von diesen Paketen gebraucht. */
  fuer: string[];
  abhaengigkeiten: Record<string, string>;
  /** Ergänzung eines anderen Pakets (#405). */
  ergaenzt?: Ergaenzung;
}

/**
 * Pakete aus einem Katalog auswählen (#460, #461): je Paket die neueste Version, die zur DMS-Version passt;
 * Abhängigkeiten kommen mit (neueste passende Version), außer sie sind schon passend installiert. Reihenfolge:
 * Abhängigkeiten zuerst. probleme: was sich nicht auflösen lässt (dann fehlt das Paket in der Liste).
 * versionen: für selbst gewählte Pakete eine bestimmte Version statt der neuesten (#405).
 */
export function auswahlMitAbhaengigkeiten(k: Katalog, gewaehlt: string[], dms: string, installiert: Array<{ id: string; version: string }> = [], versionen: Record<string, string> = {}): { pakete: AuswahlPaket[]; probleme: string[] } {
  const plan = new Map<string, AuswahlPaket>();
  const probleme: string[] = [];
  const name = (id: string) => k.pakete.find((p) => p.id === id)?.name ?? id;
  const nimm = (id: string, bereich: string | null, von: string | null) => {
    const da = installiert.find((x) => x.id === id);
    if (von && da && (!bereich || passt(da.version, bereich))) return;
    const schon = plan.get(id);
    if (schon) {
      if (von && !schon.fuer.includes(von)) schon.fuer.push(von);
      if (bereich && !passt(schon.version, bereich)) probleme.push(t('gemeinsam.pakete.braucht-gewaehlt-ist', { name: name(von ?? id), name2: schon.name, bereich, version: schon.version }));
      return;
    }
    const kp = k.pakete.find((p) => p.id === id);
    if (!kp) { probleme.push(t('gemeinsam.pakete.braucht-das-gibt-es', { name: name(von ?? id), id })); return; }
    const fest = !von ? versionen[id] : undefined;
    const v = [...kp.versionen].sort((a, b) => vergleicheVersion(b.version, a.version)).find((x) => (fest ? x.version === fest : !bereich || passt(x.version, bereich)) && dmsPasst(dms, x.dms));
    if (!v) {
      probleme.push(von ? t('gemeinsam.pakete.braucht-dazu-passt-keine', { name: name(von), name2: kp.name, bereich: String(bereich), dms }) : t('gemeinsam.pakete.keine-version-passt-zu', { name: kp.name, dms }));
      return;
    }
    plan.set(id, { id, name: kp.name, version: v.version, code: v.code, gewaehlt: !von, fuer: von ? [von] : [], abhaengigkeiten: v.abhaengigkeiten, ...(v.ergaenzt ? { ergaenzt: v.ergaenzt } : {}) });
    for (const [a, b] of Object.entries(v.abhaengigkeiten)) nimm(a, b, id);
  };
  for (const id of gewaehlt) {
    const x = plan.get(id);
    if (x) x.gewaehlt = true; else nimm(id, null, null);
  }
  const liste = [...plan.values()];
  const geordnet = nachAbhaengigkeiten(liste);
  if (!geordnet) probleme.push(t('gemeinsam.pakete.die-abhaengigkeiten-der-gewaehlten'));
  return { pakete: geordnet ?? liste, probleme };
}

/* ---------- Katalog lesen ---------- */

const text = (v: unknown) => (typeof v === 'string' ? v : '');

/** Prüft und vereinheitlicht einen geladenen Katalog; wirft mit verständlicher Meldung. */
/** Symbol, Kürzel und Kategorien eines Katalogeintrags (#645) – nur gültige Werte, sonst weggelassen. */
function anzeige(p: Record<string, unknown>): Pick<KatalogPaket, 'symbol' | 'kuerzel' | 'kategorien'> {
  const r: Pick<KatalogPaket, 'symbol' | 'kuerzel' | 'kategorien'> = {};
  if (typeof p.symbol === 'string' && /^[a-z0-9-]{1,60}$/.test(p.symbol)) r.symbol = p.symbol;
  if (typeof p.kuerzel === 'string' && /^[A-Za-z]{1,3}$/.test(p.kuerzel)) r.kuerzel = p.kuerzel.toUpperCase();
  const k = Array.isArray(p.kategorien) ? p.kategorien.filter((x): x is string => typeof x === 'string' && /^[a-z0-9_-]{1,40}$/.test(x)).slice(0, 5) : [];
  if (k.length) r.kategorien = k;
  return r;
}

export function liesKatalog(j: unknown): Katalog {
  const k = j as Partial<Katalog> | null;
  if (!k || typeof k !== 'object' || !Array.isArray(k.pakete)) throw new Error('Das ist kein Paketkatalog (katalog.json).');
  if (k.format !== 1) throw new Error(`Katalogformat ${String(k.format)} kennt diese Ablago-Version nicht – bitte Ablago aktualisieren.`);
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
        // Ergänzung (#405): ungültige Angaben zählen nicht (das Paket bleibt installierbar, nur ohne Häkchen).
        ergaenzt: liesErgaenzt(v.ergaenzt, v.abhaengigkeiten && typeof v.abhaengigkeiten === 'object' ? v.abhaengigkeiten : {}).ergaenzt ?? undefined,
        sprache: liesKatalogSprache(v.sprache),
      }))
      .sort((a, b) => vergleicheVersion(b.version, a.version));
    if (!versionen.length) continue;
    pakete.push({
      id: p.id, name: text(p.name) || p.id, beschreibung: text(p.beschreibung),
      autor: { name: text(p.autor?.name), github: text(p.autor?.github) }, lizenz: text(p.lizenz),
      aktuell: VERSION.test(text(p.aktuell)) ? p.aktuell : versionen[0].version, versionen,
      ...anzeige(p as unknown as Record<string, unknown>),
    });
  }
  return { format: 1, erstellt: text(k.erstellt), quelle: text(k.quelle), pakete: pakete.sort((a, b) => a.name.localeCompare(b.name, 'de')) };
}

/** Herkunft lesbar, z. B. „offizieller Katalog“ oder „hochgeladen von … am …“. */
export function herkunftText(h: Herkunft, person: (id: string | null) => string = (x) => x ?? '–'): string {
  if (h.art === 'katalog') return h.url === OFFIZIELLER_KATALOG ? t('gemeinsam.pakete.offizieller-katalog') : t('gemeinsam.pakete.katalog', { url: h.url });
  return t('gemeinsam.pakete.hochgeladen-von-am', { person: person(h.von), datum: new Date(h.am).toLocaleDateString(gebietsschema()) });
}

/* ---------- Pakete mit Code (#338) ---------- */

/** Volltext von einem Paket: so beginnt ocr.info; die eingebaute Texterkennung lässt ihn stehen. */
export const PAKET_TEXT = t('gemeinsam.pakete.texterkennung-durch-paket');
/** Volltext von einem Paket mit `dms:volltext` (#614): ausgelesen, nicht erkannt (Frage 49) – gilt intern ebenso als „vom Paket“. */
export const PAKET_VOLLTEXT = t('gemeinsam.pakete.volltext-durch-paket');
/** Stammt der Volltext (ocr.info) von einem Paket – erkannt oder ausgelesen? */
export const istPaketText = (info: string | null | undefined) => !!info && (info.startsWith(PAKET_TEXT) || info.startsWith(PAKET_VOLLTEXT));

/** Was ein Paket mit Dokumenten darf. */
export type DokumentRecht = 'keine' | 'lesen' | 'schreiben';
export const DOKUMENT_RECHTE: Record<DokumentRecht, string> = { keine: t('gemeinsam.pakete.keine-dokumente'), lesen: t('gemeinsam.pakete.dokumente-lesen'), schreiben: t('gemeinsam.pakete.dokumente-lesen-und-volltext') };
/**
 * Ereignisse, die ein Paket abonnieren kann (nicht blockierend, mit Wiederholung) – genau die des gemeinsamen
 * Ereigniskatalogs mit `paket: true` (shared/src/ereignisse.ts, #724) und die veralteten Namen im Übergang.
 */
export const EREIGNISSE = {
  'post.angelegt': t('gemeinsam.pakete.neue-post-ist-angelegt'),
  'dokument.hochgeladen': t('gemeinsam.pakete.ein-dokument-wurde-hochgeladen'),
  'texterkennung.fertig': t('gemeinsam.pakete.die-texterkennung-eines-dokuments'),
  'volltext.fertig': t('gemeinsam.pakete.der-volltext-eines-dokuments'),
  'paket.einstellungen_geaendert': t('gemeinsam.pakete.die-einstellungen-des-pakets'),
  'datei.umwandeln': t('gemeinsam.pakete.eine-datei-soll-umgewandelt'),
  'sicherung.fertig': t('gemeinsam.pakete.eine-sicherung-ist-fertig'),
  'datei.volltext': t('gemeinsam.pakete.eine-datei-braucht-ihren'),
  'datei.archivfassung': t('gemeinsam.pakete.ein-dokument-mit-fertigem'),
  // Mappen-Ereignisse aus dem Ereigniskatalog (#670, shared/src/ereignisse.ts): nur zu Typen unter code.mappentypen (#686: auch fremde).
  'mappe.angelegt': t('gemeinsam.pakete.eine-mappe-ist-angelegt'),
  'mappe.geaendert': t('gemeinsam.pakete.eine-mappe-ist-geaendert'),
  'mappe.geloescht': t('gemeinsam.pakete.eine-mappe-ist-geloescht'),
  'mappe.wiederhergestellt': t('gemeinsam.pakete.eine-mappe-ist-aus'),
  'frist.erreicht': t('gemeinsam.pakete.eine-frist-ist-erreicht'),
} as const satisfies Record<PaketKatalogArt | keyof typeof VERALTETE_EREIGNISSE, string>;
/** Ereignisse zu Mappen (#670): brauchen code.mappentypen, gelten nur für diese Typen (seit #686 auch fremde). */
export const MAPPEN_EREIGNISSE: readonly EreignisArt[] = ['mappe.angelegt', 'mappe.geaendert', 'mappe.geloescht', 'mappe.wiederhergestellt', 'frist.erreicht'];
/** Ab dieser Version kennt das DMS Mappen-Ereignisse für Pakete (#670); ältere lehnen die Ereignisse beim Installieren ab. */
export const DMS_MAPPEN_EREIGNISSE_AB = '0.153.0';
/** Ab dieser Version (#686) nimmt das DMS fremde Mappentypen und „*“ in code.mappentypen an; ältere lehnen sie ab. */
export const DMS_FREMDE_MAPPENTYPEN_AB = '0.166.0';
export type EreignisArt = keyof typeof EREIGNISSE;
/**
 * Schnittstellen des Kerns, die ein Paket zusätzlich nutzen darf (`code.rechte.schnittstellen`, #442).
 * Der Kern rechnet dabei nichts selbst: Er speichert und vergleicht nur, was das Paket liefert.
 */
export const SCHNITTSTELLEN = {
  'dms:vektoren': t('gemeinsam.pakete.vektoren-zu-dokumenten-speichern'),
  'dms:antworten': t('gemeinsam.pakete.fragen-an-die-ablage'),
  'dms:erkennen': t('gemeinsam.pakete.felder-aus-dokumenten-vorschlagen'),
  'dms:texterkennung': t('gemeinsam.pakete.texterkennung-fuer-scans-und'),
  'dms:umwandeln': t('gemeinsam.pakete.dateien-umwandeln-die-ablago'),
  'dms:sicherung-lesen': t('gemeinsam.pakete.die-verschluesselte-sicherung-lesen'),
  'dms:volltext': t('gemeinsam.pakete.volltext-fuer-dateien-liefern'),
  'dms:archivfassung': t('gemeinsam.pakete.archivfassung-pdf-a-ablegen'),
  'dms:uebersetzen': t('gemeinsam.pakete.inhalte-uebersetzen'),
  'dms:klassifizieren': t('gemeinsam.pakete.mappentyp-vorschlagen'),
} as const;
export type Schnittstelle = keyof typeof SCHNITTSTELLEN;
/** Ab dieser Version kennt das DMS `code.rechte.schnittstellen` und das Ereignis `volltext.fertig` (#442). */
export const DMS_VEKTOREN_AB = '0.120.0';
/**
 * Ab dieser Version kennt das DMS die Schnittstelle `dms:antworten`, die Einstellung vom Typ `adresse`
 * (Dienst-Adresse, zu der allein das Paket ins Netz darf) und die Funktionen `netz_strom`, `netz_weiter`
 * und `teil` des Läufers (#444).
 */
export const DMS_ANTWORTEN_AB = '0.124.0';
/** Hilfe-Ort je Schnittstelle (Administratorhandbuch, Pakete mit Code). */
export const SCHNITTSTELLE_HILFE: Record<Schnittstelle, Hilfeort> = { 'dms:vektoren': 'pakete.recht.vektoren', 'dms:antworten': 'pakete.recht.antworten', 'dms:erkennen': 'pakete.recht.erkennen', 'dms:texterkennung': 'pakete.recht.texterkennung', 'dms:umwandeln': 'pakete.recht.umwandeln', 'dms:sicherung-lesen': 'pakete.recht.sicherung', 'dms:volltext': 'pakete.recht.volltext', 'dms:archivfassung': 'pakete.recht.archivfassung', 'dms:uebersetzen': 'pakete.recht.uebersetzen', 'dms:klassifizieren': 'pakete.recht.klassifizieren' };
/**
 * Ab dieser Version (#585) kennt das DMS das Ereignis `sicherung.fertig` und die Schnittstelle `dms:sicherung-lesen`:
 * Ein Paket liest die verschlüsselte Sicherung in Stücken, kopiert sie außer Haus und meldet je Sicherung zurück.
 */
export const DMS_SICHERUNG_AB = '0.142.0';
/** Ab dieser Version kennt das DMS die Schnittstelle `dms:erkennen` (#511): Erkennung für „Aus Dokument ausfüllen“. */
export const DMS_ERKENNEN_AB = '0.125.0';
/**
 * Ab dieser Version kennt das DMS den Abschnitt `inhalt.wortlisten` (#356): Gruppen gleichbedeutender Wörter für die
 * Suche. Ältere Versionen übergehen ihn stillschweigend – Pakete damit geben `dms: ">=0.127.0"` an.
 */
export const DMS_WORTLISTEN_AB = '0.127.0';
/**
 * Ab dieser Version (#458) liest der Kern nur noch die Textebene von PDFs (poppler) und meldet jedes Dokument mit
 * `volltext.fertig` – auch ohne Text (`text: false`), mit `quelle`, `mime`, `seiten` und ggf. `neu`. Die
 * Schnittstelle `dms:texterkennung` gibt es ab hier. `texterkennung.fertig` bleibt als veralteter Gleichlaut.
 */
export const DMS_VOLLTEXT_AB = '0.133.0';
/**
 * Bekommt ein Paket `volltext.fertig` auch für Dokumente ohne Text (#458)? Ja, wenn es die Texterkennung übernimmt
 * (`dms:texterkennung`) oder sein Manifest mindestens DMS 0.133.0 verlangt – ältere Pakete (z. B. für Vektoren)
 * kennen nur Ereignisse mit Text.
 */
export function kenntVolltextOhneText(p: Pick<InstalliertesPaket, 'dms' | 'laeufer'>): boolean {
  if (hatSchnittstelle(p.laeufer, 'dms:texterkennung')) return true;
  const m = p.dms ? BEREICH.exec(p.dms.trim()) : null;
  return !!m && vergleicheVersion(m[2], DMS_VOLLTEXT_AB) >= 0;
}
/** Höchstens so viele Gruppen gleichbedeutender Wörter je Paket (#356). */
export const WORTLISTEN_MAX = 1000;
/** Darf ein Paket mit Code ins Netz (feste Adressen oder Dienst-Adresse)? Dann verlassen Daten das DMS. */
export const hatNetz = (c: PaketCode | undefined) => !!c && (c.netz.length > 0 || (c.adressen?.length ?? 0) > 0);
/**
 * Schnittstellen, über die ein Paket Inhalte bekommt (#796): Ausschnitte, Text, Dateien. `dms:sicherung-lesen` fehlt
 * bewusst – die Sicherung ist verschlüsselt und enthält immer alles.
 */
/**
 * Ereignisse ohne Inhalt der Ablage (#796): Nur sie zählen nicht. Die Liste ist bewusst die Gegenliste – eine neue
 * Ereignisart gilt damit erst einmal als „mit Inhalt“ (Mappen-, Dokument-, Post-Ereignisse tragen Ids, Typen,
 * Dateinamen oder „Für“).
 */
export const EREIGNISSE_OHNE_INHALT: readonly EreignisArt[] = ['sicherung.fertig', 'paket.einstellungen_geaendert'];
/** Ereignisse, mit denen ein Paket etwas aus der Ablage erfährt (#796): alle außer {@link EREIGNISSE_OHNE_INHALT}. */
export const INHALT_EREIGNISSE: readonly EreignisArt[] = (Object.keys(EREIGNISSE) as EreignisArt[]).filter((e) => !EREIGNISSE_OHNE_INHALT.includes(e));
export const INHALT_SCHNITTSTELLEN: readonly Schnittstelle[] = ['dms:antworten', 'dms:erkennen', 'dms:klassifizieren', 'dms:uebersetzen', 'dms:vektoren', 'dms:texterkennung', 'dms:volltext', 'dms:umwandeln', 'dms:archivfassung'];
/**
 * KI-Paket bzw. „KI-Dienst“ (#796): ein Paket, das Inhalte lesen oder bekommen kann (Mappen, Dokumente, Volltext,
 * Ausschnitte) und ins Netz darf. Es bekommt nur Inhalte aus Mappentypen, die der Administrator für KI-Dienste
 * zugelassen hat – neue Mappentypen erst nach ausdrücklicher Zulassung. Pakete ohne Netz rechnen im Haus und
 * sind davon nicht betroffen.
 */
export const istKiPaket = (c: PaketCode | undefined): boolean => !!c && hatNetz(c)
  && (c.rechte.lesen.length > 0 || c.rechte.dokumente !== 'keine' || (c.rechte.schnittstellen ?? []).some((s) => INHALT_SCHNITTSTELLEN.includes(s))
    || c.ereignisse.some((e) => INHALT_EREIGNISSE.includes(e)));

/** Werkbank (#796): Mappentypen mit „für KI-Dienste zugelassen“, KI-Pakete und welche Mappentypen jedes bekommt. */
export interface KiUebersicht {
  typen: Array<{ id: string; name: string; zugelassen: boolean; system?: string }>;
  pakete: Array<{ id: string; name: string; bekommt: string[] }>;
  /** Nach dem Update einmal: Mappentypen lassen sich jetzt ausschließen (nur, wenn es KI-Pakete gibt). */
  hinweis: boolean;
}
/** Alle Mappentypen (außer Benutzer) – für Pakete wie die Texterkennung, die an jedes Dokument müssen. */
export const ALLE_TYPEN = '*';

/**
 * Arten von Dokumenten für die Archivfassung (#660): je ein Schlüssel einer Ja/Nein-Einstellung des Pakets. `emails`
 * (#946): `.eml` und Outlook `.msg` – siehe `mailTyp` in archivfassung.ts.
 */
export const ARCHIV_ARTEN = ['pdf_text', 'pdf_scan', 'bilder', 'emails'] as const;
export type ArchivArt = (typeof ARCHIV_ARTEN)[number];
export type ArchivAuswahl = Partial<Record<ArchivArt, string>>;

export interface PaketCode {
  sprache: string;
  ereignisse: EreignisArt[];
  /** Typverweise wie in Inhalten (eigene ohne Präfix, <paket>:<schluessel>, dms:<kennung>) oder „*“. */
  rechte: { lesen: string[]; schreiben: string[]; dokumente: DokumentRecht; schnittstellen?: Schnittstelle[] };
  /** Erlaubte Adressen (https://host…); alles andere ist gesperrt. */
  netz: string[];
  /**
   * Einstellungen vom Typ „adresse“ (#444): Dorthin darf das Paket zusätzlich ins Netz – zu der Adresse, die der
   * Administrator einträgt und bestätigt. Steht hier, damit die Rückfrage bei der Installation sie nennt.
   */
  adressen?: Array<{ schluessel: string; name: string }>;
  /**
   * Dateitypen, die das Paket umwandelt (#577, `code.umwandeln`, nur mit `dms:umwandeln`): Dafür bekommt es das
   * Ereignis `datei.umwandeln` und darf eine Fassung (PDF, PNG, JPEG) und ein Vorschaubild zurückgeben.
   */
  umwandeln?: string[];
  /**
   * Dateitypen, für die das Paket den Volltext liefert (#614, `code.volltext`, nur mit `dms:volltext`): Dafür bekommt
   * es das Ereignis `datei.volltext` und darf den Volltext dieser Dokumente schreiben – sonst nichts an Dokumenten.
   */
  volltext?: string[];
  /**
   * Archivfassung (#631, `code.archivfassung`, nur mit `dms:archivfassung`): Dateitypen, zu denen das Paket ein PDF/A
   * ablegt (PDF, JPEG und PNG erlaubt), und optional je Art (#660: `pdf_text`, `pdf_scan`, `bilder`, #946: `emails`) der Schlüssel einer
   * Ja/Nein-Einstellung des Pakets: an = diese Dokumente bekommen eine Archivfassung (fehlt der Schlüssel: immer).
   */
  archivfassung?: { typen: string[]; auswahl?: ArchivAuswahl };
  /**
   * Mappentypen, zu denen das Paket Mappen-Ereignisse bekommt (#670, `code.mappentypen`): Schlüssel aus dem eigenen
   * `inhalt`, Verweise auf fremde Typen wie in `code.rechte` (#686, `paket:typ`, `dms:post`) oder `*` (alle, die das
   * Paket lesen darf). Nötig für mappe.* und frist.erreicht; das Paket muss sie lesen dürfen. Zugestellt wird nur, was
   * der Paket-Benutzer gerade lesen darf (Regeln für die Rolle „Paket“, „Pakete“ am Mappentyp).
   */
  mappentypen?: string[];
  /** Das WebAssembly-Modul (code/modul.wasm) und Daten (code/daten/…), nur im installierten Paket. */
  modul?: { sha256: string; groesse: number };
  daten?: string[];
}

/**
 * Mappentypen des DMS, die `code.rechte` mit `dms:<kennung>` nennen darf (#435): Ablageort (Alias, #883), Rolle und Post.
 * `dms:benutzer` ist verboten (Pakete sehen keine Benutzer). Post gibt es hier – anders als bei Verweisen in
 * Inhalten –, damit ein Paket wie Trennblatt nur Post lesen und schreiben darf statt aller Typen („*“).
 */
export const DMS_RECHTE_TYPEN: Record<string, string> = { ablageort: 'Ablageort', rolle: 'Rolle', post: 'Post' };
/**
 * Veraltete Verweise (#883): Den Ablageort bringt seit Ablago 0.212 das Paket Basis mit. `dms:ablageort` gilt eine Zeit
 * lang weiter als Alias für `basis:ablageort` – in Inhalten wie in `code.rechte` – und zeigt auf den Ablageort von Basis
 * bzw. den früheren des Kerns. Die Paketprüfung gibt dazu einen Hinweis. Der Alias entfällt mit Ablago 1.0.0
 * (server/src/uebergaenge.ts, #902).
 */
export const DMS_ALIAS: Record<string, string> = { ablageort: 'basis:ablageort' };
/** Veraltete `dms:…`-Verweise aus einer Liste (je einmal), z. B. ["dms:ablageort"]. */
export const veralteteVerweise = (liste: Iterable<string>): string[] => [...new Set([...liste].filter((v) => v.startsWith('dms:') && DMS_ALIAS[v.slice(4)]))];
/** Ab dieser Version kennt das DMS `dms:post` in code.rechte (#435); ältere ignorieren die Kennung. */
export const DMS_POST_RECHT_AB = '0.94.0';

const SPRACHEN = ['rust', 'go', 'c', 'assemblyscript', 'javascript'];

/**
 * Die eine Größengrenze für Pakete (#644): das Archiv beim Herunterladen, Hochladen, in der Sammeldatei und beim
 * Paket erstellen, ebenso alle Dateien unter code/ zusammen. dms-registry prüft dieselbe Zahl (pruefen.py,
 * katalog.py, sammeldatei.py). 128 MB, damit Modelle (z. B. Übersetzen, 17–44 MB je Sprachrichtung) passen.
 */
export const PAKET_MAX = 128 * 1024 * 1024;
/** Höchstens so groß sind alle Dateien unter code/ eines Pakets zusammen (#403) – dieselbe Grenze wie das Archiv (#644). */
export const CODE_MAX = PAKET_MAX;
/**
 * Beispiel-Dokumente (#878): Dateien unter inhalt/beispiele/, die ein Beispiel unter `dokumente` nennt. Erlaubt sind
 * PDF, PNG und JPEG (erkannt am Inhalt, passend zur Endung), je Datei höchstens so groß wie beim Hochladen; alle
 * zusammen zählen zur Paketgrenze (PAKET_MAX). dms-registry prüft dasselbe (pruefen.py).
 */
export const BEISPIEL_ORDNER = 'inhalt/beispiele/';
export const BEISPIEL_ENDUNGEN: Readonly<Record<string, string>> = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' };
/** Ab dieser Version legt Ablago Beispiel-Dokumente an (#878); ältere übergehen `dokumente` an Beispielen. */
export const BEISPIEL_DOKUMENTE_AB = '0.223.0';
/** Stand einer Beispiel-Mappe nach dem Anlegen (#878): Prüfwert der Feldwerte und Dokumente als „Id:sha256“. */
export interface BeispielStand { id: string; werte: string; dokumente: string[] }

/** Größe in MB für Meldungen, gerundet auf eine Stelle mit Komma. */
export const inMB = (bytes: number): string => (Math.round(bytes / 104857.6) / 10).toString().replace('.', ',');

/**
 * Legt eine Neuinstallation sichtbar etwas an – Mappentypen, Ansichten oder Beispiele (#643)? Nur dann zeigt die
 * Vorschau „Das wird angelegt“; Pakete nur mit Code (z. B. Texterkennung) beschreiben stattdessen, was sie tun.
 */
export function legtEtwasAn(v: { typen: Array<{ vorhanden: boolean; geloescht?: boolean }>; sichten: Array<{ vorhanden: boolean }>; beispiele: number }): boolean {
  return v.typen.some((t) => !t.vorhanden && !t.geloescht) || v.sichten.some((s) => !s.vorhanden) || v.beispiele > 0;
}

/**
 * Liest code: aus dem Manifest (ohne einstellungen/aktionen – die liest paketeinstellungen.ts).
 * dateien: Dateien unter code/ des Pakets (Name, Größe in Bytes) für die Größengrenze.
 */
export function liesCode(c: unknown, dateien: Array<{ name: string; groesse: number }> = []): { code: PaketCode | null; fehler: string[] } {
  const fehler: string[] = [];
  const summe = dateien.filter((d) => d.name.startsWith('code/')).reduce((n, d) => n + d.groesse, 0);
  if (summe > CODE_MAX) fehler.push(t('gemeinsam.pakete.code-die-dateien-unter', { replace: (summe / 1048576).toFixed(1).replace('.', ','), wert: CODE_MAX / 1048576 }));
  if (c === undefined || c === null) return { code: null, fehler };
  if (typeof c !== 'object' || Array.isArray(c)) return { code: null, fehler: [t('gemeinsam.pakete.code-muss-ein-objekt')] };
  const x = c as Record<string, unknown>;
  const sprache = String(x.sprache ?? '');
  if (!SPRACHEN.includes(sprache)) fehler.push(t('gemeinsam.pakete.code-sprache-eine-von', { SPRACHEN: SPRACHEN.join(', ') }));
  const liste = (v: unknown, wo: string): string[] => {
    if (v === undefined) return [];
    if (!Array.isArray(v) || v.some((y) => typeof y !== 'string')) { fehler.push(`${wo}: Liste von Texten erwartet.`); return []; }
    return [...new Set(v as string[])];
  };
  const ereignisse = liste(x.ereignisse, 'code.ereignisse');
  for (const e of ereignisse) if (!(e in EREIGNISSE)) fehler.push(t('gemeinsam.pakete.code-ereignisse-gibt-es', { e, keys: Object.keys(EREIGNISSE).join(', ') }));
  // Mappen-Ereignisse (#670): nur zu den Typen unter code.mappentypen (eigene Typen des Pakets, ohne Präfix).
  const mappentypen = liste(x.mappentypen, 'code.mappentypen');
  const mitMappen = ereignisse.filter((e) => MAPPEN_EREIGNISSE.includes(e as EreignisArt));
  // Fremde Mappentypen (#686): wie in code.rechte (paket:typ, dms:post …) oder „*“ für alle, die das Paket lesen darf.
  for (const k of mappentypen) if (!TYPVERWEIS_ODER_ALLE.test(k)) fehler.push(t('gemeinsam.pakete.code-mappentypen-schluessel-eines', { k }));
  if (mitMappen.length && !mappentypen.length) fehler.push(t('gemeinsam.pakete.code-ereignisse-braucht-code', { mitMappen: mitMappen.join(', ') }));
  if (!mitMappen.length && mappentypen.length) fehler.push(t('gemeinsam.pakete.code-mappentypen-nur-mit'));
  const r = (x.rechte ?? {}) as Record<string, unknown>;
  if (typeof r !== 'object' || Array.isArray(r)) fehler.push(t('gemeinsam.pakete.code-rechte-muss-ein'));
  const lesen = liste(r.lesen, 'code.rechte.lesen'), schreiben = liste(r.schreiben, 'code.rechte.schreiben');
  for (const text2 of [...lesen, ...schreiben]) if (!TYPVERWEIS_ODER_ALLE.test(text2)) fehler.push(t('gemeinsam.pakete.code-rechte-ist-kein', { t: text2 }));
  // Benutzer sehen Pakete nie (auch nicht mit "*"), siehe Handbuch „Pakete mit Code“.
  for (const text2 of [...lesen, ...schreiben]) if (text2 === 'dms:benutzer') fehler.push(t('gemeinsam.pakete.code-rechte-dms-benutzer'));
  else if (text2.startsWith('dms:') && !DMS_RECHTE_TYPEN[text2.slice(4)]) fehler.push(t('gemeinsam.pakete.code-rechte-diesen-mappentyp', { t: text2, map: Object.keys(DMS_RECHTE_TYPEN).map((k) => `dms:${k}`).join(', ') }));
  const dokumente = (r.dokumente ?? 'keine') as DokumentRecht;
  if (!(dokumente in DOKUMENT_RECHTE)) fehler.push(t('gemeinsam.pakete.code-rechte-dokumente-keine'));
  // Schnittstellen des Kerns (#442), z. B. dms:vektoren; Vektoren gibt es nur zu Dokumenten, die das Paket lesen darf.
  const schnittstellen = liste(r.schnittstellen, 'code.rechte.schnittstellen');
  for (const s of schnittstellen) if (!(s in SCHNITTSTELLEN)) fehler.push(t('gemeinsam.pakete.code-rechte-schnittstellen-gibt', { s, keys: Object.keys(SCHNITTSTELLEN).join(', ') }));
  if (schnittstellen.includes('dms:vektoren') && dokumente === 'keine') fehler.push(t('gemeinsam.pakete.code-rechte-schnittstellen-dms'));
  // Dateien umwandeln (#577): zuständige Dateitypen, nur mit dms:umwandeln, Lesen von Dokumenten und dem Ereignis.
  const umwandeln = liste(x.umwandeln, 'code.umwandeln').map((m) => m.toLowerCase());
  const willUmwandeln = schnittstellen.includes('dms:umwandeln');
  for (const m of umwandeln) {
    if (!MIME.test(m)) fehler.push(t('gemeinsam.pakete.code-umwandeln-ist-kein', { m }));
    else if (kernTyp(m)) fehler.push(t('gemeinsam.pakete.code-umwandeln-liest-ablago', { dateitypName: dateitypName(m), m }));
  }
  if (umwandeln.length > UMWANDELN_TYPEN_MAX) fehler.push(t('gemeinsam.pakete.code-umwandeln-hoechstens-dateitypen', { UMWANDELN_TYPEN_MAX }));
  if (willUmwandeln && !umwandeln.length) fehler.push(t('gemeinsam.pakete.code-rechte-schnittstellen-dms-2'));
  if (!willUmwandeln && umwandeln.length) fehler.push(t('gemeinsam.pakete.code-umwandeln-braucht-code'));
  if (willUmwandeln && dokumente === 'keine') fehler.push(t('gemeinsam.pakete.code-rechte-schnittstellen-dms-3'));
  if (willUmwandeln && !ereignisse.includes('datei.umwandeln')) fehler.push(t('gemeinsam.pakete.code-rechte-schnittstellen-dms-4'));
  if (!willUmwandeln && ereignisse.includes('datei.umwandeln')) fehler.push(t('gemeinsam.pakete.code-ereignisse-datei-umwandeln'));
  // Volltext aus Paketen (#614): wie beim Umwandeln – zuständige Dateitypen, nur mit dms:volltext, Lesen und dem Ereignis.
  const volltext = liste(x.volltext, 'code.volltext').map((m) => m.toLowerCase());
  const willVolltext = schnittstellen.includes('dms:volltext');
  for (const m of volltext) {
    if (!MIME.test(m)) fehler.push(t('gemeinsam.pakete.code-volltext-ist-kein', { m }));
    else if (kernTyp(m)) fehler.push(t('gemeinsam.pakete.code-volltext-liest-ablago', { dateitypName: dateitypName(m), m }));
  }
  if (volltext.length > VOLLTEXT_TYPEN_MAX) fehler.push(t('gemeinsam.pakete.code-volltext-hoechstens-dateitypen', { VOLLTEXT_TYPEN_MAX }));
  if (willVolltext && !volltext.length) fehler.push(t('gemeinsam.pakete.code-rechte-schnittstellen-dms-5'));
  if (!willVolltext && volltext.length) fehler.push(t('gemeinsam.pakete.code-volltext-braucht-code'));
  if (willVolltext && dokumente === 'keine') fehler.push(t('gemeinsam.pakete.code-rechte-schnittstellen-dms-6'));
  if (willVolltext && !ereignisse.includes('datei.volltext')) fehler.push(t('gemeinsam.pakete.code-rechte-schnittstellen-dms-7'));
  if (!willVolltext && ereignisse.includes('datei.volltext')) fehler.push(t('gemeinsam.pakete.code-ereignisse-datei-volltext'));
  // Archivfassung (#631): Dateitypen (auch PDF, JPEG, PNG), nur mit dms:archivfassung, Lesen und dem Ereignis.
  const willArchiv = schnittstellen.includes('dms:archivfassung');
  let archivfassung: PaketCode['archivfassung'];
  if (x.archivfassung !== undefined) {
    const a = x.archivfassung as Record<string, unknown>;
    if (!a || typeof a !== 'object' || Array.isArray(a)) fehler.push(t('gemeinsam.pakete.code-archivfassung-ein-objekt'));
    else {
      const typen = liste(a.typen, 'code.archivfassung.typen').map((m) => m.toLowerCase());
      for (const m of typen) if (!MIME.test(m)) fehler.push(t('gemeinsam.pakete.code-archivfassung-typen-ist', { m }));
      if (!typen.length) fehler.push(t('gemeinsam.pakete.code-archivfassung-typen-mindestens'));
      if (typen.length > ARCHIV_TYPEN_MAX) fehler.push(t('gemeinsam.pakete.code-archivfassung-typen-hoechstens', { ARCHIV_TYPEN_MAX }));
      for (const k of Object.keys(a)) if (k !== 'typen' && k !== 'auswahl') fehler.push(t('gemeinsam.pakete.code-archivfassung-gibt-es', { k }));
      const auswahl: ArchivAuswahl = {};
      if (a.auswahl !== undefined) {
        // Je Art (PDFs mit Text, gescannte PDFs, Bilder, E-Mails) der Schlüssel einer Ja/Nein-Einstellung (Abschnitt, keine Liste): an = bekommt eine Archivfassung.
        const w = a.auswahl as Record<string, unknown>;
        const felder = (Array.isArray(x.einstellungen) ? x.einstellungen : []).flatMap((b) => (b && typeof b === 'object' && !Array.isArray(b) && Array.isArray((b as Record<string, unknown>).felder) && (b as Record<string, unknown>).liste === undefined ? (b as Record<string, unknown>).felder as unknown[] : []));
        if (!w || typeof w !== 'object' || Array.isArray(w)) fehler.push(t('gemeinsam.pakete.code-archivfassung-auswahl-ein'));
        else {
          for (const k of Object.keys(w)) if (!(ARCHIV_ARTEN as readonly string[]).includes(k)) fehler.push(t('gemeinsam.pakete.code-archivfassung-auswahl-gibt', { k, ARCHIV_ARTEN: ARCHIV_ARTEN.join(', ') }));
          for (const art of ARCHIV_ARTEN) {
            if (w[art] === undefined) continue;
            const f = felder.find((y): y is Record<string, unknown> => !!y && typeof y === 'object' && (y as Record<string, unknown>).schluessel === w[art]);
            if (typeof w[art] !== 'string' || !f || f.typ !== 'janein') fehler.push(t('gemeinsam.pakete.code-archivfassung-auswahl-der', { art }));
            else auswahl[art] = w[art] as string;
          }
        }
      }
      archivfassung = { typen: [...new Set(typen)], ...(Object.keys(auswahl).length ? { auswahl } : {}) };
    }
  }
  if (willArchiv && !archivfassung?.typen.length) fehler.push(t('gemeinsam.pakete.code-rechte-schnittstellen-dms-8'));
  if (!willArchiv && x.archivfassung !== undefined) fehler.push(t('gemeinsam.pakete.code-archivfassung-braucht-code'));
  if (willArchiv && dokumente === 'keine') fehler.push(t('gemeinsam.pakete.code-rechte-schnittstellen-dms-9'));
  if (willArchiv && !ereignisse.includes('datei.archivfassung')) fehler.push(t('gemeinsam.pakete.code-rechte-schnittstellen-dms-10'));
  if (!willArchiv && ereignisse.includes('datei.archivfassung')) fehler.push(t('gemeinsam.pakete.code-ereignisse-datei-archivfassung'));
  // Sicherung außer Haus (#585): Lesen der verschlüsselten Sicherung nur zusammen mit dem Ereignis – und umgekehrt.
  const willSichern = schnittstellen.includes('dms:sicherung-lesen');
  if (willSichern && !ereignisse.includes('sicherung.fertig')) fehler.push(t('gemeinsam.pakete.code-rechte-schnittstellen-dms-11'));
  if (!willSichern && ereignisse.includes('sicherung.fertig')) fehler.push(t('gemeinsam.pakete.code-ereignisse-sicherung-fertig'));
  const netz = liste(x.netz, 'code.netz');
  for (const n of netz) {
    let ok = false;
    try { const u = new URL(n); ok = u.protocol === 'https:' && !u.username && !u.password && !u.search && !u.hash; } catch { /* unten */ }
    if (!ok) fehler.push(`code.netz: „${n}“ ist keine erlaubte Adresse (nur https://…, ohne Zugangsdaten).`);
  }
  // Dienst-Adresse als Einstellung (#444): Felder vom Typ adresse in den Abschnitten (geprüft in paketeinstellungen.ts).
  const adressen = (Array.isArray(x.einstellungen) ? x.einstellungen : []).flatMap((b) => (b && typeof b === 'object' && !Array.isArray(b) && Array.isArray((b as Record<string, unknown>).felder) && (b as Record<string, unknown>).liste === undefined
    ? ((b as Record<string, unknown>).felder as unknown[]).filter((f): f is Record<string, unknown> => !!f && typeof f === 'object' && (f as Record<string, unknown>).typ === 'adresse')
      .map((f) => ({ schluessel: String(f.schluessel ?? ''), name: String(f.name ?? '') || String(f.schluessel ?? '') }))
    : []));
  // Schreiben setzt Lesen voraus.
  const lesenAlle = [...new Set([...lesen, ...schreiben])];
  // Ereignisse zu Mappen nur zu Typen, die das Paket lesen darf (#670) – sonst wüsste es von Mappen, die es nie sehen darf.
  // „*“ nur, wenn das Paket auch alle Mappentypen lesen darf; ob es eine einzelne Mappe sehen darf, prüft Ablago bei der Zustellung (#686).
  for (const k of mappentypen) if (!lesenAlle.includes(k) && !lesenAlle.includes(ALLE_TYPEN)) fehler.push(k === ALLE_TYPEN ? t('gemeinsam.pakete.code-mappentypen-alle-mappentypen') : t('gemeinsam.pakete.code-mappentypen-das-paket', { k }));
  for (const k of mappentypen) if (k === 'dms:benutzer') fehler.push(t('gemeinsam.pakete.code-mappentypen-dms-benutzer'));
  return { code: fehler.length ? null : { sprache, ereignisse: ereignisse as EreignisArt[], rechte: { lesen: lesenAlle, schreiben, dokumente, ...(schnittstellen.length ? { schnittstellen: schnittstellen as Schnittstelle[] } : {}) }, netz, ...(adressen.length ? { adressen } : {}), ...(umwandeln.length ? { umwandeln: [...new Set(umwandeln)] } : {}), ...(volltext.length ? { volltext: [...new Set(volltext)] } : {}), ...(archivfassung && willArchiv ? { archivfassung } : {}), ...(mappentypen.length ? { mappentypen } : {}) }, fehler };
}

/** Zustand des Paket-Läufers (#403): aus (kein Paket mit Code), startet, bereit, neustart (nach Absturz), pausiert (Wartung). */
export type LaeuferZustand = 'aus' | 'startet' | 'bereit' | 'neustart' | 'pausiert';

/**
 * Text für „Stand“ in der Werkbank – passend zu dem, was der Läufer gerade tut. wartet: Stand ändert sich gleich
 * von selbst (die Werkbank fragt dann nach).
 */
export function laeuferZustandText(
  x: { zustand: LaeuferZustand; absturz: string | null; paket: { geladen: boolean; fehler: string | null; aufrufe: number } | null },
  zeit: (iso: string) => string,
): { text: string; fehler: boolean; wartet: boolean } {
  if (x.paket?.fehler) return { text: x.paket.fehler, fehler: true, wartet: false };
  if (x.zustand === 'pausiert') return { text: t('gemeinsam.pakete.pausiert-wartungsmodus'), fehler: false, wartet: false };
  if (x.zustand === 'neustart') return { text: t('gemeinsam.pakete.abgestuerzt-startet-neu', { wert: x.absturz ? t('gemeinsam.pakete.um', { zeit: zeit(x.absturz) }) : '' }), fehler: true, wartet: true };
  if (x.zustand !== 'bereit' || !x.paket?.geladen) return { text: t('gemeinsam.pakete.startet'), fehler: false, wartet: true };
  if (x.absturz) return { text: t('gemeinsam.pakete.neu-gestartet-nach-absturz', { zeit: zeit(x.absturz) }), fehler: false, wartet: false };
  return { text: x.paket.aufrufe ? t('gemeinsam.pakete.bereit') : t('gemeinsam.pakete.bereit-wartet-auf-das'), fehler: false, wartet: false };
}

/**
 * Netzwerkzugriff eines Pakets mit Code (#449) – so in der Vorschau, im Handbuch und auf der Katalog-Webseite.
 * adressen: Namen der Einstellungen vom Typ „adresse“ (#444), deren Wert der Administrator einträgt und bestätigt.
 */
export function netzText(netz: string[], adressen: string[] = []): string {
  const einst = adressen.map((a) => t('gemeinsam.pakete.der-adresse-aus-der', { a }));
  if (!netz.length && !einst.length) return t('gemeinsam.pakete.kein-zugriff-auf-netzwerk');
  return t('gemeinsam.pakete.zugriff-auf-netzwerk-internet', { wert: [...netz, ...einst].join(', ') });
}

/** Hilfe-Ort im Administratorhandbuch (Pakete mit Code) je Ereignis (#449); Schlüssel wie in shared/src/hilfe.ts. */
export const EREIGNIS_HILFE: Record<EreignisArt, Hilfeort> = {
  'post.angelegt': 'pakete.ereignis.post_angelegt',
  'dokument.hochgeladen': 'pakete.ereignis.dokument_hochgeladen',
  'texterkennung.fertig': 'pakete.ereignis.texterkennung_fertig',
  'volltext.fertig': 'pakete.ereignis.volltext_fertig',
  'paket.einstellungen_geaendert': 'pakete.ereignis.einstellungen_geaendert',
  'datei.umwandeln': 'pakete.ereignis.datei_umwandeln',
  'sicherung.fertig': 'pakete.ereignis.sicherung_fertig',
  'datei.volltext': 'pakete.ereignis.datei_volltext',
  'datei.archivfassung': 'pakete.ereignis.datei_archivfassung',
  'mappe.angelegt': 'pakete.ereignis.mappe',
  'mappe.geaendert': 'pakete.ereignis.mappe',
  'mappe.geloescht': 'pakete.ereignis.mappe',
  'mappe.wiederhergestellt': 'pakete.ereignis.mappe',
  'frist.erreicht': 'pakete.ereignis.frist_erreicht',
};

/** Ein Punkt der Rechte-Liste in der Vorschau (#449): Text, Handbuch-Stelle, ggf. Unterliste (Ereignisse). */
export interface RechtePunkt { text: string; hilfe: Hilfeort; unter?: Array<{ text: string; hilfe: Hilfeort }> }

/** Rechte und Netzwerkzugriff für die Rückfrage bei der Installation (#338, #449): je Recht ein Punkt, Ereignisse als Unterliste. */
export function rechtePunkte(c: PaketCode, typName: (verweis: string) => string): RechtePunkt[] {
  const eintrag = (l: string[]) => l.map((v) => (v === ALLE_TYPEN ? t('gemeinsam.pakete.alle-mappentypen') : typName(v))).join(', ');
  const z: RechtePunkt[] = [];
  if (c.rechte.lesen.length) z.push({ text: t('gemeinsam.pakete.mappen-lesen', { lesen: eintrag(c.rechte.lesen) }), hilfe: 'pakete.recht.lesen' });
  if (c.rechte.schreiben.length) z.push({ text: t('gemeinsam.pakete.mappen-anlegen-und-aendern', { schreiben: eintrag(c.rechte.schreiben) }), hilfe: 'pakete.recht.schreiben' });
  if (c.rechte.dokumente !== 'keine') z.push({ text: DOKUMENT_RECHTE[c.rechte.dokumente], hilfe: 'pakete.recht.dokumente' });
  // Dateien umwandeln (#577) und Volltext aus Paketen (#614): mit den Dateitypen, für die das Paket zuständig sein will.
  // Archivfassung (#631) ebenso.
  const typen = (s: Schnittstelle) => (s === 'dms:umwandeln' ? c.umwandeln : s === 'dms:volltext' ? c.volltext : s === 'dms:archivfassung' ? c.archivfassung?.typen : undefined);
  for (const s of c.rechte.schnittstellen ?? []) z.push({ text: `${SCHNITTSTELLEN[s]} (${s})${typen(s)?.length ? `: ${[...new Set(typen(s)!.map(dateitypName))].join(', ')}` : ''}`, hilfe: SCHNITTSTELLE_HILFE[s] });
  z.push({ text: netzText(c.netz, (c.adressen ?? []).map((a) => a.name)), hilfe: c.adressen?.length ? 'pakete.recht.adresse' : 'pakete.recht.netz' });
  // KI-Dienst (#796): Inhalte nur aus Mappentypen, die für KI-Dienste zugelassen sind.
  if (istKiPaket(c)) z.push({ text: t('gemeinsam.pakete.ki-nur-zugelassene'), hilfe: 'pakete.ki' });
  // Mappen-Ereignisse (#670) mit den Mappentypen, zu denen das Paket sie bekommt.
  // #686: „*“ heißt hier „alle, die das Paket lesen darf“ – am Mappentyp lässt sich einzelnen Paketen der Zugriff verwehren.
  const zuTypen = c.mappentypen?.length ? ` – zu: ${c.mappentypen.map((v) => (v === ALLE_TYPEN ? t('gemeinsam.pakete.allen-mappentypen-die-das') : typName(v))).join(', ')}` : '';
  if (c.ereignisse.length) z.push({ text: t('gemeinsam.pakete.reagiert-auf-diese-ereignisse'), hilfe: 'pakete.ereignisse', unter: c.ereignisse.map((e) => ({ text: `${EREIGNISSE[e]}${MAPPEN_EREIGNISSE.includes(e) ? zuTypen : ''}`, hilfe: EREIGNIS_HILFE[e] })) });
  return z;
}

/** Rechte-Punkte als einfache Zeilen (z. B. in der Fehlermeldung, wenn die Bestätigung fehlt). */
export const rechteZeilen = (punkte: RechtePunkt[]): string[] =>
  punkte.map((p) => (p.unter ? `${p.text} ${p.unter.map((u) => u.text).join('; ')}` : p.text));
export const rechteText = (c: PaketCode, typName: (verweis: string) => string): string[] => rechteZeilen(rechtePunkte(c, typName));

/** Gleiche Rechte und gleicher Netzwerkzugriff? (Sonst muss ein Update neu bestätigt werden.) */
export const gleicheRechte = (a: PaketCode | undefined, b: PaketCode | undefined) =>
  JSON.stringify(rechteSchluessel(a)) === JSON.stringify(rechteSchluessel(b));
const rechteSchluessel = (c: PaketCode | undefined) => c ? [[...c.rechte.lesen].sort(), [...c.rechte.schreiben].sort(), c.rechte.dokumente, [...c.netz].sort(), ...(c.rechte.schnittstellen?.length ? [[...c.rechte.schnittstellen].sort()] : []), ...(c.adressen?.length ? [c.adressen.map((a) => a.schluessel).sort()] : []), ...(c.volltext?.length ? [['volltext', ...[...c.volltext].sort()]] : []), ...(c.archivfassung?.typen.length ? [['archivfassung', ...[...c.archivfassung.typen].sort()]] : []), ...(c.mappentypen?.length ? [['mappentypen', ...[...c.mappentypen].sort()]] : [])] : null;
/** Ab dieser Version (#577) kennt das DMS Dateien umwandeln; siehe shared/src/dateiumwandlung.ts. */
export { DMS_UMWANDELN_AB };
/** Ab dieser Version (#614) kennt das DMS Volltext aus Paketen; siehe shared/src/paketvolltext.ts. */
export { DMS_PAKET_VOLLTEXT_AB };
/** Ab dieser Version (#631) kennt das DMS die Archivfassung; siehe shared/src/archivfassung.ts. */
export { DMS_ARCHIVFASSUNG_AB };
/** Ab dieser Version (#732) kennt das DMS Inhalte übersetzen; siehe shared/src/uebersetzung.ts. */
export { DMS_UEBERSETZEN_AB };
/** Darf das Paket diese Schnittstelle des Kerns nutzen (#442)? */
export const hatSchnittstelle = (c: PaketCode | undefined, s: Schnittstelle) => !!c?.rechte.schnittstellen?.includes(s);


/* ---------- Mehrere Pakete in einem Ablauf (#405) ---------- */

/**
 * Was zusammen installiert werden soll: Pakete aus einem Katalog (Abhängigkeiten kommen mit) oder die hochgeladenen
 * Pakete einer Sammeldatei (Upload-Kennungen). Derselbe Ablauf für Werkbank → Pakete, den Einrichtungsassistenten
 * (#460) und die Sammeldatei (#461).
 */
export interface AblaufEingabe {
  /** Katalogadresse; ohne: der offizielle Katalog. */
  quelle?: string;
  /** Paket-Ids aus dem Katalog – selbst gewählt, samt angehakter Ergänzungen; „id@1.2.0“ für eine bestimmte Version. */
  pakete?: string[];
  /** Upload-Kennungen der Pakete einer Sammeldatei. */
  uploads?: string[];
}
/** Die Antworten aus dem Ablauf – jede Frage einmal, mit Ausnahmen je Paket. */
export interface AblaufInstallation extends AblaufEingabe {
  /** Je Paket-Id: Namen für Mappentypen bzw. Ansichten (nur bei Namenskonflikten nötig). */
  namen?: Record<string, Record<string, string>>;
  sichtNamen?: Record<string, Record<string, string>>;
  /** Paket-Ids, deren Beispiel-Mappen angelegt werden. */
  beispiele?: string[];
  /** Je Paket-Id: Schlüssel der mitgelieferten Automatisierungen, die gleich eingeschaltet werden (#712). */
  automatisierungen?: Record<string, string[]>;
  /** Herkunft bestätigt (nicht offizielle Quelle bzw. ohne gültige Signatur) – ein Haken für alle. */
  bestaetigt?: boolean;
  /** Stand der Rechte, die der Administrator gesehen und erlaubt hat (AblaufPlan.rechte.stand) – ein Haken für alle. */
  rechteStand?: string;
  /** Je Paket-Id: Pflicht-Einstellungen. */
  einstellungen?: Record<string, Record<string, unknown>>;
  /** Paket-Ids, deren Pflicht-Einstellungen bewusst später kommen („Einstellungen nötig“ und Hinweis in der Übersicht). */
  spaeter?: string[];
  /** Dienst-Adressen in den Einstellungen bestätigt. */
  adresseBestaetigt?: boolean;
}
export interface AblaufPaket<V> {
  /** Paket-Id (Katalog) bzw. Upload-Kennung (Sammeldatei). */
  schluessel: string;
  id: string; name: string; version: string;
  /** Selbst gewählt; sonst kommt es als Abhängigkeit mit (fuer: Ids der Pakete, die es brauchen). */
  gewaehlt: boolean; fuer: string[];
  ergaenzt: Ergaenzung | null;
  vorschau: V;
  /** Pflicht-Einstellungen (Abschnitte), die nach den Vorgaben noch leer sind – gefragt im selben Ablauf. */
  einstellungen: import('./paketeinstellungen').EinstellungFeld[];
}
export interface AblaufPlan<V> {
  /** Reihenfolge der Installation: Abhängigkeiten zuerst. */
  pakete: AblaufPaket<V>[];
  /** Was die Installation verhindert (fehlende Abhängigkeiten, Kreise, schon installiert …). */
  probleme: string[];
  herkunft: HerkunftPruefung | null;
  herkunftBestaetigen: boolean;
  /** stand: Prüfwert aller Rechte, die bestätigt werden müssen – ändert sich eines, gilt die Bestätigung nicht mehr. */
  rechte: { bestaetigen: boolean; stand: string };
  /**
   * Pakete, die sich nicht laden ließen (Download, Prüfsumme, Archiv), und Pakete, die eines davon brauchen (#646):
   * Sie werden übersprungen, die übrigen lassen sich trotzdem installieren.
   */
  ausgelassen?: AblaufAusgelassen[];
  /** Auswahl für Einstellungen mit Verweisen (Mappentypen, Benutzer, Rollen, Ansichten). */
  auswahl: { typen: Array<{ id: string; name: string; felder: Array<{ key: string; label: string }> }>; benutzer: Array<{ id: string; name: string }>; rollen: Array<{ id: string; name: string }>; sichten: Array<{ id: string; name: string }> };
}
/** Ein Paket, das übersprungen wurde (#646), mit Grund – z. B. „lässt sich nicht herunterladen …“ oder „braucht …“. */
export interface AblaufAusgelassen { id: string; name: string; version: string; grund: string }
export interface AblaufErgebnis {
  installiert: Array<{ id: string; name: string; version: string; einstellungen: 'keine' | 'fertig' | 'spaeter' | 'fehler' }>;
  /** Pakete, die beim Installieren scheiterten (#646) – jedes ist vollständig zurückgenommen; die übrigen laufen weiter. */
  fehlgeschlagen: Array<{ id: string; name: string; meldung: string; gruende: string[] }>;
  /** Das erste davon (wie bis 0.158). */
  fehler: { id: string; name: string; meldung: string; gruende: string[] } | null;
  /** Nicht installiert, mit Grund: ließ sich nicht laden oder braucht ein Paket, das scheiterte (#646). */
  nichtInstalliert: AblaufAusgelassen[];
}

/**
 * Welche Pakete fallen weg, wenn diese scheitern (#646)? Alle, die – auch über Umwege – eines davon brauchen.
 * Liefert je wegfallendem Paket die Id des gescheiterten, an dem es hängt.
 */
export function haengenAn(pakete: Array<{ id: string; abhaengigkeiten: Record<string, string> }>, gescheitert: string[]): Map<string, string> {
  const weg = new Map<string, string>();
  let neu = true;
  while (neu) {
    neu = false;
    for (const p of pakete) {
      if (weg.has(p.id) || gescheitert.includes(p.id)) continue;
      const an = Object.keys(p.abhaengigkeiten).find((a) => gescheitert.includes(a) || weg.has(a));
      if (an) { weg.set(p.id, gescheitert.includes(an) ? an : weg.get(an)!); neu = true; }
    }
  }
  return weg;
}
