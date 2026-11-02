/**
 * Ansicht der Werkbank (#281): Welche Bereiche stehen in der Leiste?
 *
 * Ausblenden heißt nicht abschalten – es betrifft nur die Navigation. Bereiche mit einer Warnung
 * erscheinen trotzdem. Die Bereiche sind so geschnitten, dass sie später auch Einheiten für
 * abgestufte Administratorrechte sein können (#282); ihre Kennung ist der Pfad unter /werkbank.
 */

import { uebersetzer } from './sprache';
import werkbank from './sprachen/de/werkbank.json';

/** Texte der Werkbank (#473): Gruppen, Bereiche, Vorlagen stehen in `sprachen/de/werkbank.json`. */
const t = uebersetzer({ werkbank });

export type Vorlage = 'haushalt' | 'organisation' | 'alles';

const vorlage = (v: Vorlage) => ({ name: t.frei(`werkbank.vorlage.${v}.name`), text: t.frei(`werkbank.vorlage.${v}.text`) });
export const VORLAGEN: Record<Vorlage, { name: string; text: string }> = {
  haushalt: vorlage('haushalt'), organisation: vorlage('organisation'), alles: vorlage('alles'),
};

/**
 * Gruppen der Leiste (#68), nach Aufgaben statt nach Technik (#354): höchstens sechs, je etwa 7 ± 2
 * Bereiche. Die Kennung der Gruppe wird nirgends gespeichert – gespeichert sind nur Bereiche.
 */
const GRUPPENFOLGE = ['ablage', 'benutzer', 'post', 'sichern', 'einstellungen', 'wartung'] as const;
export type Gruppe = (typeof GRUPPENFOLGE)[number];
export const GRUPPEN = Object.fromEntries(GRUPPENFOLGE.map((g) => [g, t.frei(`werkbank.gruppe.${g}`)])) as Record<Gruppe, string>;

export interface Bereich {
  /** Pfad unter /werkbank, zugleich die Kennung. */
  pfad: string;
  gruppe: Gruppe;
  name: string;
  /** In welchen Vorlagen der Bereich zu sehen ist („alles“ enthält jeden). */
  in: Array<Exclude<Vorlage, 'alles'>>;
  /** Für das Handbuch und den Dialog: wann man ihn braucht. */
  wann: string;
}

const H = ['haushalt', 'organisation'] as const;
const O = ['organisation'] as const;
type Eintrag = { pfad: string; gruppe: Gruppe; in: readonly Exclude<Vorlage, 'alles'>[] };

/**
 * Alle Bereiche außer der Übersicht (die ist immer da), in der Reihenfolge der Leiste (#354).
 * Name und „wann“ kommen aus der Sprachdatei (`werkbank.bereich.<pfad>.name` / `.wann`).
 */
const EINTRAEGE: Eintrag[] = [
  { pfad: 'typen', gruppe: 'ablage', in: H },
  { pfad: 'sichten', gruppe: 'ablage', in: H },
  { pfad: 'nummernkreise', gruppe: 'ablage', in: O },
  { pfad: 'stempel', gruppe: 'ablage', in: H },
  { pfad: 'pakete', gruppe: 'ablage', in: H },
  { pfad: 'darfweg', gruppe: 'ablage', in: O },
  { pfad: 'datenschutz', gruppe: 'ablage', in: O },
  { pfad: 'benutzer', gruppe: 'benutzer', in: H },
  { pfad: 'verschluesselung', gruppe: 'benutzer', in: H },
  { pfad: 'postfaecher', gruppe: 'post', in: O },
  { pfad: 'eingangsordner', gruppe: 'post', in: O },
  { pfad: 'webdav', gruppe: 'post', in: H },
  { pfad: 'texterkennung', gruppe: 'post', in: O },
  { pfad: 'sicherung', gruppe: 'sichern', in: H },
  { pfad: 'wiederherstellung', gruppe: 'sichern', in: H },
  { pfad: 'vollexport', gruppe: 'sichern', in: H },
  { pfad: 'papierkorb', gruppe: 'sichern', in: H },
  { pfad: 'betrieb', gruppe: 'einstellungen', in: H },
  { pfad: 'aufgaben', gruppe: 'einstellungen', in: H },
  { pfad: 'anmeldeschutz', gruppe: 'einstellungen', in: O },
  { pfad: 'designs', gruppe: 'einstellungen', in: O },
  { pfad: 'anbindung', gruppe: 'einstellungen', in: [] },
  { pfad: 'technik', gruppe: 'einstellungen', in: H },
  { pfad: 'systemzustand', gruppe: 'wartung', in: H },
  { pfad: 'protokoll', gruppe: 'wartung', in: O },
  { pfad: 'fehlermeldungen', gruppe: 'wartung', in: O },
  { pfad: 'wartungsmodus', gruppe: 'wartung', in: O },
  { pfad: 'wartung', gruppe: 'wartung', in: [] },
  { pfad: 'demo', gruppe: 'wartung', in: [] },
];

export const BEREICHE: Bereich[] = EINTRAEGE.map((e) => ({
  ...e, in: [...e.in], name: t.frei(`werkbank.bereich.${e.pfad}.name`), wann: t.frei(`werkbank.bereich.${e.pfad}.wann`),
}));

/** Name eines Bereichs (auch der Übersicht) für Leiste, Überschriften und Verweise. */
export const bereichName = (pfad: string) => t.frei(`werkbank.bereich.${pfad}.name`);

const BEKANNT = new Set(BEREICHE.map((b) => b.pfad));

/**
 * Umgezogene Bereiche: alte Kennung → neue. Alte Links und Lesezeichen leiten weiter, gespeicherte
 * Ansichten übernehmen die neue Kennung (#407: Datenbank → Datenbank-Anbindung; #408: Speicherplatz
 * → Systemzustand unter Wartung und Fehlersuche).
 */
export const UMGEZOGEN: Readonly<Record<string, string>> = { datenbank: 'anbindung', speicherplatz: 'systemzustand' };

/** Für die ganze Installation: Vorlage plus Abweichungen. */
export interface WerkbankAnsicht { vorlage: Vorlage; ein: string[]; aus: string[] }
/** Je Administrator: zusätzlich eingeblendete Bereiche. */
export interface EigeneAnsicht { ein: string[] }

/** Ohne Einstellung bleibt alles sichtbar – so ändert sich für bestehende Installationen nichts. */
export const OHNE_EINSTELLUNG: WerkbankAnsicht = { vorlage: 'alles', ein: [], aus: [] };

const liste = (v: unknown) => (Array.isArray(v)
  ? [...new Set(v.filter((x): x is string => typeof x === 'string').map((x) => UMGEZOGEN[x] ?? x).filter((x) => BEKANNT.has(x)))]
  : []);

/** Liest einen gespeicherten Wert; Unbekanntes fällt weg. `null` = noch nicht eingestellt. */
export function liesAnsicht(v: unknown): WerkbankAnsicht | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const vorlage = (Object.keys(VORLAGEN) as Vorlage[]).includes(o.vorlage as Vorlage) ? o.vorlage as Vorlage : 'alles';
  return { vorlage, ein: liste(o.ein), aus: liste(o.aus) };
}
export function liesEigene(v: unknown): EigeneAnsicht {
  return { ein: v && typeof v === 'object' ? liste((v as Record<string, unknown>).ein) : [] };
}

export const inVorlage = (vorlage: Vorlage, pfad: string) =>
  vorlage === 'alles' || !!BEREICHE.find((b) => b.pfad === pfad)?.in.includes(vorlage);

/** Für alle sichtbar (Installation). */
export function fuerAlle(a: WerkbankAnsicht, pfad: string): boolean {
  if (pfad === 'uebersicht') return true;
  if (a.aus.includes(pfad)) return false;
  return a.ein.includes(pfad) || inVorlage(a.vorlage, pfad);
}

/** Für diesen Administrator sichtbar: Installation plus eigene Ergänzungen. */
export const sichtbar = (a: WerkbankAnsicht, eigene: EigeneAnsicht, pfad: string) => fuerAlle(a, pfad) || eigene.ein.includes(pfad);

/** Speichert nur Abweichungen von der Vorlage. */
export function ansichtAus(vorlage: Vorlage, sichtbareBereiche: Iterable<string>): WerkbankAnsicht {
  const an = new Set(sichtbareBereiche);
  return {
    vorlage,
    ein: BEREICHE.filter((b) => an.has(b.pfad) && !inVorlage(vorlage, b.pfad)).map((b) => b.pfad),
    aus: BEREICHE.filter((b) => !an.has(b.pfad) && inVorlage(vorlage, b.pfad)).map((b) => b.pfad),
  };
}

/* ---------- Mittlere Spalte (#366) ---------- */

/**
 * Die Mitte gibt es nur für große Sammlungen, die man bearbeitet (Mappentypen, Ansichten, Benutzer …).
 * Kleine oder nur lesende Listen (lange Datenbankzugriffe unter Datenbank-Anbindung #407, Demo-Übersicht, Technik, Exporte, gesperrte Adressen,
 * Stempel-Vorlagen #394, Datenschutz #396)
 * stehen rechts im passenden Abschnitt. Alle anderen Bereiche – auch künftige – sind zweiteilig.
 */
export const MIT_MITTE: ReadonlySet<string> = new Set([
  'uebersicht', 'typen', 'sichten', 'nummernkreise', 'pakete', 'benutzer', 'aufgaben',
  'designs', 'papierkorb', 'postfaecher', 'protokoll', 'fehlermeldungen',
]);

export const hatMitte = (bereich: string) => MIT_MITTE.has(bereich);

/**
 * Welche Spalte am Handy zu sehen ist: Liste (Mitte) oder die Seite rechts. `rechtsOhneAuswahl`:
 * rechts steht schon ohne gewählten Eintrag etwas zu tun (Pakete: Installation über einen Link).
 * Ohne Auswahl sonst immer die Liste – sonst führte „← Zur Liste“ wieder auf dieselbe Seite.
 */
export function werkbankEbene(bereich: string, id?: string, rechtsOhneAuswahl = false): 'liste' | 'mappe' {
  return !hatMitte(bereich) || id || rechtsOhneAuswahl ? 'mappe' : 'liste';
}

/** Ziel von „← Zurück“ am Handy: ohne Mitte gleich zu den Bereichen, sonst zur Liste des Bereichs. */
export const werkbankZurueck = (bereich: string) => (hatMitte(bereich) ? `/werkbank/${bereich}` : '/werkbank');

/**
 * Alte Direktlinks in Bereiche ohne Mitte (z. B. /werkbank/stempel/:id) führen auf die Seite;
 * der Eintrag steht dann als ?offen=… in der Adresse und ist aufgeklappt. Umgezogene Bereiche
 * (`UMGEZOGEN`) leiten samt Suche (`?offen=…`) auf die neue Stelle. `null` = nichts umzuleiten.
 */
export function werkbankUmleitung(bereich: string, id?: string, suche = ''): string | null {
  const neu = UMGEZOGEN[bereich];
  if (neu) return id ? werkbankUmleitung(neu, id) ?? `/werkbank/${neu}` : `/werkbank/${neu}${suche}`;
  if (!id || hatMitte(bereich)) return null;
  return bereich === 'anbindung' || bereich === 'stempel' ? `/werkbank/${bereich}?offen=${encodeURIComponent(id)}` : `/werkbank/${bereich}`;
}

/** Plakette links für den Wartungsmodus (#366): „angekündigt“, solange er noch nicht wirkt, „an“ erst danach. */
export function wartungsPlakette(stufe: 'aus' | 'angekuendigt' | 'aktiv', aktivAb: string | null, jetzt = Date.now()): string | undefined {
  if (stufe === 'aus') return undefined;
  if (stufe === 'aktiv' || (aktivAb && Date.parse(aktivAb) <= jetzt)) return 'an';
  return 'angekündigt';
}

/** Systemzustand, Speicherplatz (#366, #408): Liegen alle messbaren Ordner auf demselben Datenträger, genügt ein Balken. */
export function einDatentraeger(ordner: Array<{ geraet: string | null; gesamt: number | null }>): boolean {
  const gemessen = ordner.filter((o) => o.gesamt !== null);
  return ordner.length > 1 && gemessen.length === ordner.length && !!gemessen[0].geraet && gemessen.every((o) => o.geraet === gemessen[0].geraet);
}
