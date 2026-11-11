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
 * Gruppen der Leiste (#68), nach Aufgaben statt nach Technik (#354, neu geordnet #717/#725): höchstens sechs, je etwa 7 ± 2
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
  /**
   * In welchen Vorlagen er nur im Expertenmodus erscheint (#356): Wer ihn eingeschaltet hat, sieht diese Bereiche
   * zusätzlich – sonst bleiben sie für Einsteiger aus der Leiste.
   */
  experte: Array<Exclude<Vorlage, 'alles'>>;
  /** Für das Handbuch und den Dialog: wann man ihn braucht. */
  wann: string;
}

const H = ['haushalt', 'organisation'] as const;
const O = ['organisation'] as const;
type Eintrag = { pfad: string; gruppe: Gruppe; in: readonly Exclude<Vorlage, 'alles'>[]; experte?: readonly Exclude<Vorlage, 'alles'>[] };

/**
 * Alle Bereiche außer der Übersicht (die ist immer da), in der Reihenfolge der Leiste (#354).
 * Datenschutz steht unter „Benutzer und Sicherheit“ (#354, vorher „Ablage aufbauen“).
 * Name und „wann“ kommen aus der Sprachdatei (`werkbank.bereich.<pfad>.name` / `.wann`).
 */
const EINTRAEGE: Eintrag[] = [
  // Ablage aufbauen (#717): erst Fertiges, dann Feinarbeit, zum Schluss, was auf allem aufbaut.
  // Nutzung (#1032): privat oder auch beruflich – bestimmt, was Mappentypen zeigen; darum vorn bei „Ablage aufbauen“
  // (Einstellungen hat schon sieben Bereiche). Nur für „Gesamte Verwaltung“ (verwaltungsrecht.ts).
  { pfad: 'nutzung', gruppe: 'ablage', in: H },
  { pfad: 'pakete', gruppe: 'ablage', in: H },
  { pfad: 'typen', gruppe: 'ablage', in: H },
  { pfad: 'sichten', gruppe: 'ablage', in: H },
  { pfad: 'nummernkreise', gruppe: 'ablage', in: O },
  // Automatisierungen (#675): für Betriebe sichtbar, im Haushalt nur im Expertenmodus.
  { pfad: 'automatisierungen', gruppe: 'ablage', in: O, experte: ['haushalt'] },
  // Automatisierungsvorlagen (#1044): daneben, gleich sichtbar – „Aufgabe vergeben“, „Erinnern“, Wiedervorlage …
  { pfad: 'ablaufvorlagen', gruppe: 'ablage', in: O, experte: ['haushalt'] },
  { pfad: 'benutzer', gruppe: 'benutzer', in: H },
  { pfad: 'verschluesselung', gruppe: 'benutzer', in: H },
  // Eigene Organisation (#995): Verweis auf die Organisation mit dem Merkmal – erst mit der Vorlage für Betriebe.
  { pfad: 'organisation', gruppe: 'benutzer', in: O },
  // Datenschutz getrennt (#668): Auskünfte (mit Mitte, wachsende Sammlung) und Löschkonzept.
  { pfad: 'auskuenfte', gruppe: 'benutzer', in: O },
  { pfad: 'loeschkonzept', gruppe: 'benutzer', in: O },
  // „Aufbewahrung abgelaufen“ (#725, früher „Darf weg“) und Stempel (#717) regeln, was die Ablage verlässt.
  { pfad: 'aufbewahrung', gruppe: 'benutzer', in: O },
  { pfad: 'stempel', gruppe: 'benutzer', in: H },
  { pfad: 'postfaecher', gruppe: 'post', in: O },
  { pfad: 'eingangsordner', gruppe: 'post', in: O },
  { pfad: 'webdav', gruppe: 'post', in: H },
  // Suche und Volltext (#725): Texterkennung samt Unscharfer Suche und Gleichbedeutenden Wörtern (früher „Suche“,
  // im Haushalt nur im Expertenmodus – zusammengelegt erbt der Bereich die weiteste Sichtbarkeit).
  { pfad: 'texterkennung', gruppe: 'post', in: O, experte: ['haushalt'] },
  // Gleichbedeutende Wörter (#992): eigener Bereich mit Mitte direkt darunter, sichtbar wie „Suche und Volltext“.
  { pfad: 'woerter', gruppe: 'post', in: O, experte: ['haushalt'] },
  // Sicherung mit Wiederherstellen als Abschnitt (#725).
  { pfad: 'sicherung', gruppe: 'sichern', in: H },
  { pfad: 'vollexport', gruppe: 'sichern', in: H },
  { pfad: 'papierkorb', gruppe: 'sichern', in: H },
  { pfad: 'betrieb', gruppe: 'einstellungen', in: H },
  // Region (#726): Land, Bundesland, Zeitzone an einer Stelle.
  { pfad: 'region', gruppe: 'einstellungen', in: H },
  // Sprachen (#729): erlaubte Sprachen und Sprache der Installation.
  { pfad: 'sprachen', gruppe: 'einstellungen', in: H },
  { pfad: 'aufgaben', gruppe: 'einstellungen', in: H },
  { pfad: 'anmeldeschutz', gruppe: 'einstellungen', in: O },
  { pfad: 'designs', gruppe: 'einstellungen', in: O },
  { pfad: 'anbindung', gruppe: 'einstellungen', in: [] },
  // Systemzustand nimmt „Technik“ (Version und Updates) und die Auslastung der Datenbank auf (#725).
  { pfad: 'systemzustand', gruppe: 'wartung', in: H },
  { pfad: 'protokoll', gruppe: 'wartung', in: O },
  { pfad: 'fehlermeldungen', gruppe: 'wartung', in: O },
  // Wartung (#725): Wartungsmodus und Wartungsoperationen auf einer Seite.
  { pfad: 'wartung', gruppe: 'wartung', in: O },
  { pfad: 'demo', gruppe: 'wartung', in: [] },
];

export const BEREICHE: Bereich[] = EINTRAEGE.map((e) => ({
  ...e, in: [...e.in], experte: [...(e.experte ?? [])], name: t.frei(`werkbank.bereich.${e.pfad}.name`), wann: t.frei(`werkbank.bereich.${e.pfad}.wann`),
}));

/** Name eines Bereichs (auch der Übersicht) für Leiste, Überschriften und Verweise. */
export const bereichName = (pfad: string) => t.frei(`werkbank.bereich.${pfad}.name`);

/** Weitere Namen, unter denen die Werkbank-Suche einen Bereich findet (#725: auch alte Namen wie „Darf weg“). */
export const bereichAuch = (pfad: string): string[] => {
  const k = `werkbank.bereich.${pfad}.auch`;
  return t.hat(k) ? t.frei(k).split('|').map((x) => x.trim()).filter(Boolean) : [];
};

const falte = (x: string) => x.toLocaleLowerCase('de-DE').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/ß/g, 'ss');

/** Findet die Werkbank-Suche diesen Bereich? Name, „wann“ und frühere Namen, Groß/klein und Umlaute egal. */
export function bereichPasst(pfad: string, suche: string): boolean {
  const s = falte(suche.trim());
  if (!s) return true;
  return [bereichName(pfad), t.frei(`werkbank.bereich.${pfad}.wann`), ...bereichAuch(pfad)].some((x) => falte(x).includes(s));
}

const BEKANNT = new Set(BEREICHE.map((b) => b.pfad));

/**
 * Umgezogene Bereiche: alte Kennung → neue. Alte Links und Lesezeichen leiten weiter, gespeicherte
 * Ansichten übernehmen die neue Kennung (#407: Datenbank → Datenbank-Anbindung; #408: Speicherplatz
 * → Systemzustand unter Wartung und Fehlersuche).
 */
export const UMGEZOGEN: Readonly<Record<string, string>> = {
  datenbank: 'anbindung', speicherplatz: 'systemzustand',
  // #717/#725: zusammengelegt oder umbenannt.
  darfweg: 'aufbewahrung', suche: 'texterkennung', wiederherstellung: 'sicherung', technik: 'systemzustand', wartungsmodus: 'wartung',
  // #668: Datenschutz in Auskünfte und Löschkonzept getrennt; die alte Adresse führt zu den Auskünften.
  datenschutz: 'auskuenfte',
};

/** Wohin ein umgezogener Bereich innerhalb seiner neuen Seite springt (Abschnitt, `#…`). */
export const UMGEZOGEN_ABSCHNITT: Readonly<Record<string, string>> = {
  suche: 'suche', wiederherstellung: 'wiederherstellen', technik: 'version', wartungsmodus: 'wartungsmodus',
};

/** Für die ganze Installation: Vorlage plus Abweichungen. */
export interface WerkbankAnsicht { vorlage: Vorlage; ein: string[]; aus: string[] }
/**
 * Je Administrator: zusätzlich eingeblendete Bereiche und der Expertenmodus (#356) – er zeigt die Bereiche, die die
 * Vorlage nur für Fortgeschrittene vorsieht (`Bereich.experte`). Kein Recht, nur die Leiste.
 */
export interface EigeneAnsicht { ein: string[]; experte?: boolean }

/**
 * Vorgabe der Vorlage aus dem Merkmal „beruflich genutzt“ (#1032): beruflich → Organisation (Selbständig/Betrieb),
 * sonst Haushalt. Die Vorlage bleibt eine Einstellung der Werkbank (künftig je Person, #987); das Merkmal gilt für die
 * Ablage und gibt nur die Vorgabe.
 */
export const vorlageFuer = (m: { beruflich: boolean }): Vorlage => (m.beruflich ? 'organisation' : 'haushalt');

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
  const o = v && typeof v === 'object' ? v as Record<string, unknown> : {};
  return { ein: liste(o.ein), ...(o.experte === true ? { experte: true } : {}) };
}

export const inVorlage = (vorlage: Vorlage, pfad: string) =>
  vorlage === 'alles' || !!BEREICHE.find((b) => b.pfad === pfad)?.in.includes(vorlage);

/** Für alle sichtbar (Installation). */
export function fuerAlle(a: WerkbankAnsicht, pfad: string): boolean {
  if (pfad === 'uebersicht') return true;
  if (a.aus.includes(pfad)) return false;
  return a.ein.includes(pfad) || inVorlage(a.vorlage, pfad);
}

/** Erscheint der Bereich in dieser Vorlage nur im Expertenmodus? */
export const nurImExpertenmodus = (vorlage: Vorlage, pfad: string) =>
  vorlage !== 'alles' && !!BEREICHE.find((b) => b.pfad === pfad)?.experte.includes(vorlage);

/** Bereiche, die der Expertenmodus in dieser Vorlage zusätzlich zeigt. */
export const expertenBereiche = (vorlage: Vorlage) => BEREICHE.filter((b) => nurImExpertenmodus(vorlage, b.pfad));

/**
 * Für diesen Administrator sichtbar: Installation plus eigene Ergänzungen, im Expertenmodus dazu die Bereiche, die
 * die Vorlage dafür vorsieht – außer sie sind für alle ausdrücklich ausgeblendet.
 */
export const sichtbar = (a: WerkbankAnsicht, eigene: EigeneAnsicht, pfad: string) =>
  fuerAlle(a, pfad) || eigene.ein.includes(pfad) || (!!eigene.experte && !a.aus.includes(pfad) && nurImExpertenmodus(a.vorlage, pfad));

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
 * Die Mitte bekommt jede Sammlung, in der man etwas anlegt und bearbeitet – groß oder klein (#366, seit #990
 * auch kleine wie die Stempel-Vorlagen): Liste in der Mitte mit „+ Neu“ oben, Bearbeitung rechts. Dazu Listen,
 * die man durchsieht (Protokoll, Fehlermeldungen, Papierkorb). Nur lesende Listen und Einstellungen, die zu
 * einem Abschnitt gehören (lange Datenbankzugriffe unter Datenbank-Anbindung #407, Demo-Übersicht, Technik,
 * Exporte, gesperrte Adressen, Löschkonzept #668), stehen rechts im
 * passenden Abschnitt. Alle anderen Bereiche – auch künftige – sind zweiteilig.
 */
export const MIT_MITTE: ReadonlySet<string> = new Set([
  'uebersicht', 'typen', 'sichten', 'nummernkreise', 'pakete', 'benutzer', 'aufgaben',
  'designs', 'papierkorb', 'automatisierungen', 'ablaufvorlagen', 'postfaecher', 'protokoll', 'fehlermeldungen',
  // Datenschutz-Auskünfte (#668): die Sammlung wächst mit jeder Anfrage.
  'auskuenfte',
  // Stempel-Vorlagen (#990): klein, aber man legt sie an und bearbeitet sie – wie Nummernkreise und Designs.
  'stempel',
  // Gleichbedeutende Wörter (#992): Gruppen in der Mitte, rechts die Wörter einer Gruppe.
  'woerter',
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

/** Wo das Notfallblatt in der Werkbank steht (#993): nur unter Verschlüsselung, Abschnitt „Notfallblatt“. */
export const NOTFALLBLATT_SEITE = '/werkbank/verschluesselung#notfallblatt';

/** Ziel von „← Zurück“ am Handy: ohne Mitte gleich zu den Bereichen, sonst zur Liste des Bereichs. */
export const werkbankZurueck = (bereich: string) => (hatMitte(bereich) ? `/werkbank/${bereich}` : '/werkbank');

/** Früher ohne Mitte mit ?offen=<id>, jetzt mit Mitte und /<id> (#990). */
const OFFEN_ALS_PFAD: ReadonlySet<string> = new Set(['stempel']);

/**
 * Alte Direktlinks in Bereiche ohne Mitte (z. B. /werkbank/region/:id) führen auf die Seite. Bereiche, die
 * früher ohne Mitte einen Eintrag über ?offen=… aufklappten und jetzt eine Mitte haben (`OFFEN_ALS_PFAD`,
 * #990: /werkbank/stempel?offen=kopie), führen auf den Eintrag rechts (/werkbank/stempel/kopie).
 * Umgezogene Bereiche (`UMGEZOGEN`) leiten samt Suche (`?offen=…`) auf die neue Stelle. `null` = nichts umzuleiten.
 */
export function werkbankUmleitung(bereich: string, id?: string, suche = ''): string | null {
  const neu = UMGEZOGEN[bereich];
  if (neu) return id ? werkbankUmleitung(neu, id) ?? `/werkbank/${neu}` : `/werkbank/${neu}${suche}${UMGEZOGEN_ABSCHNITT[bereich] ? `#${UMGEZOGEN_ABSCHNITT[bereich]}` : ''}`;
  if (!id && OFFEN_ALS_PFAD.has(bereich)) {
    const offen = new URLSearchParams(suche).get('offen');
    return offen ? `/werkbank/${bereich}/${encodeURIComponent(offen)}` : null;
  }
  if (!id || hatMitte(bereich)) return null;
  // Lange Datenbankzugriffe stehen seit #725 im Systemzustand (Auslastung).
  if (bereich === 'anbindung') return `/werkbank/systemzustand?offen=${encodeURIComponent(id)}#datenbank`;
  return `/werkbank/${bereich}`;
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
