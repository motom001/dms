/**
 * Ansicht der Werkbank (#281): Welche Bereiche stehen in der Leiste?
 *
 * Ausblenden heißt nicht abschalten – es betrifft nur die Navigation. Bereiche mit einer Warnung
 * erscheinen trotzdem. Die Bereiche sind so geschnitten, dass sie später auch Einheiten für
 * abgestufte Administratorrechte sein können (#282); ihre Kennung ist der Pfad unter /werkbank.
 */

import type { Hilfeort } from './hilfe';
import { uebersetzer } from './sprache';
import werkbank from './sprachen/de/werkbank';

/** Texte der Werkbank (#473): Gruppen, Bereiche, Vorlagen stehen in `sprachen/de/werkbank/rahmen.json`. */
const t = uebersetzer({ werkbank });

/**
 * Stufen der Werkbank (#987) entlang der Personas, aufsteigend – jede enthält die vorige: Einsteiger (Lena), Haushalt
 * (Markus, Petra), Selbständig (Herr Özdemir, Katrin), Betrieb (Tischlerei, Mittelstand), Alles (IT-Dienstleister,
 * Fehlersuche). Die Kennung von Betrieb bleibt „organisation“, damit gespeicherte Ansichten weiter gelten.
 */
export const STUFEN = ['einsteiger', 'haushalt', 'selbstaendig', 'organisation', 'alles'] as const;
export type Vorlage = (typeof STUFEN)[number];
export const istVorlage = (v: unknown): v is Vorlage => (STUFEN as readonly unknown[]).includes(v);

const vorlage = (v: Vorlage) => ({ name: t.frei(`werkbank.vorlage.${v}.name`), text: t.frei(`werkbank.vorlage.${v}.text`) });
export const VORLAGEN = Object.fromEntries(STUFEN.map((v) => [v, vorlage(v)])) as Record<Vorlage, { name: string; text: string }>;

/**
 * Gruppen der Leiste (#68), nach Aufgaben statt nach Technik (#354, neu geordnet #717/#725): je etwa 7 ± 2 Bereiche.
 * Datenschutz (#1184) ist eine kleine eigene Gruppe: Auskünfte, Löschkonzept, Löschprotokoll – nur bei beruflicher
 * Nutzung in der Leiste (`NUR_BERUFLICH`). Die Kennung der Gruppe wird nirgends gespeichert – gespeichert sind nur Bereiche.
 */
const GRUPPENFOLGE = ['ablage', 'benutzer', 'datenschutz', 'post', 'sichern', 'einstellungen', 'wartung'] as const;
export type Gruppe = (typeof GRUPPENFOLGE)[number];
export const GRUPPEN = Object.fromEntries(GRUPPENFOLGE.map((g) => [g, t.frei(`werkbank.gruppe.${g}`)])) as Record<Gruppe, string>;

export interface Bereich {
  /** Pfad unter /werkbank, zugleich die Kennung. */
  pfad: string;
  gruppe: Gruppe;
  name: string;
  /** Ab welcher Stufe der Bereich in der Leiste steht (#987); jede höhere Stufe zeigt ihn auch. */
  ab: Vorlage;
  /** Daraus abgeleitet: in welchen Vorlagen er zu sehen ist („alles“ enthält jeden). */
  in: Array<Exclude<Vorlage, 'alles'>>;
  /** Für das Handbuch und den Dialog: wann man ihn braucht. */
  wann: string;
}

// Stufen (#987): ab Einsteiger, Haushalt, Selbständig, Betrieb bzw. nur in Alles.
const E = 'einsteiger',
  H = 'haushalt',
  S = 'selbstaendig',
  B = 'organisation',
  A = 'alles';
/** Zahlen links aus der Übersicht (#375): Name in `WerkbankZahlen` (server/src/werkbank/werkbankzahlen.ts). */
type Zaehlername = 'pakete' | 'nummernkreise' | 'benutzer' | 'postfaecher' | 'darfWeg';

/** Ein Eintrag der Liste der Werkbank-Seiten (#1281). */
interface Eintrag {
  /** Pfad unter /werkbank, zugleich Kennung des Bereichs und des Verwaltungsrechts (#818). */
  readonly pfad: string;
  readonly gruppe: Gruppe;
  /** Ab welcher Stufe der Bereich in der Leiste steht (#987). */
  readonly ab: Vorlage;
  /** Hilfeseite (#110): Stelle im Administratorhandbuch, Schlüssel in `HILFE` (hilfe.ts); daraus auch die Tabellen im Handbuch. */
  readonly hilfe: Hilfeort;
  /** Liste in der Mitte (#366, `hatMitte`). */
  readonly mitte?: true;
  /**
   * Weitere Bereiche, deren Verwaltungsrecht die Seite in der Oberfläche auch öffnet (#1184: das Löschprotokoll mit dem
   * Löschkonzept). Der Server prüft je Schnittstelle (`verwaltungsbereiche.ts`, Regel mit `seitenRecht`).
   */
  readonly auchMit?: readonly string[];
  /** Zahl links aus der Übersicht, bis der Bereich selbst geladen ist (#375). */
  readonly zaehler?: Zaehlername;
}

/**
 * Die Liste der Werkbank-Seiten (#1281): alle Bereiche außer der Übersicht (die ist immer da), in der Reihenfolge der
 * Leiste (#354). Eine neue Seite braucht hier einen Eintrag; Leiste, Wegwahl (`web/src/werkbank/rahmen/seiten.ts`),
 * Verwaltungsrecht, Hilfe, Zahlen und die Tabellen im Handbuch lesen daraus. Name und „wann“ kommen aus der Sprachdatei
 * (`werkbank.bereich.<pfad>.name` / `.wann`); ein Test meldet fehlende Texte, Seiten und Handbuchseiten.
 * Datenschutz steht unter „Benutzer und Sicherheit“ (#354, vorher „Ablage aufbauen“).
 */
const EINTRAEGE = [
  // Ablage aufbauen (#717): erst Fertiges, dann Feinarbeit, zum Schluss, was auf allem aufbaut.
  // Die Nutzung (#1032, privat oder auch beruflich) steht seit #1170 oben auf „Eigene Organisation“ unter Einstellungen.
  { pfad: 'pakete', gruppe: 'ablage', ab: E, hilfe: 'werkbank.pakete', mitte: true, zaehler: 'pakete' },
  // Beispiel-Ablage (#988): gleich nach den Paketen, deren Beispiele sie anlegt – schon für Einsteiger.
  { pfad: 'beispielablage', gruppe: 'ablage', ab: E, hilfe: 'werkbank.beispielablage' },
  { pfad: 'typen', gruppe: 'ablage', ab: H, hilfe: 'werkbank.typen', mitte: true },
  { pfad: 'sichten', gruppe: 'ablage', ab: H, hilfe: 'werkbank.sichten', mitte: true },
  { pfad: 'nummernkreise', gruppe: 'ablage', ab: S, hilfe: 'werkbank.nummernkreise', mitte: true, zaehler: 'nummernkreise' },
  // Automatisierungen (#675): ab Haushalt (#987, vorher dort nur im Expertenmodus).
  { pfad: 'automatisierungen', gruppe: 'ablage', ab: H, hilfe: 'werkbank.automatisierungen', mitte: true },
  // Automatisierungsvorlagen (#1044): daneben, gleich sichtbar – „Aufgabe vergeben“, „Erinnern“, Wiedervorlage …
  { pfad: 'ablaufvorlagen', gruppe: 'ablage', ab: H, hilfe: 'werkbank.ablaufvorlagen', mitte: true },
  // Rundgänge (#941): alle sehen, an/aus, eigene schreiben – zum Schluss, weil sie auf allem anderen aufbauen.
  { pfad: 'rundgaenge', gruppe: 'ablage', ab: H, hilfe: 'werkbank.rundgaenge', mitte: true },
  // Tipps (#942): daneben – Tipps können Rundgänge starten.
  { pfad: 'tipps', gruppe: 'ablage', ab: H, hilfe: 'werkbank.tipps', mitte: true },
  { pfad: 'benutzer', gruppe: 'benutzer', ab: E, hilfe: 'werkbank.benutzer', mitte: true, zaehler: 'benutzer' },
  { pfad: 'verschluesselung', gruppe: 'benutzer', ab: E, hilfe: 'werkbank.verschluesselung' },
  // „Aufbewahrung abgelaufen“ (#725, früher „Darf weg“) und Stempel (#717) regeln, was die Ablage verlässt.
  { pfad: 'aufbewahrung', gruppe: 'benutzer', ab: S, hilfe: 'werkbank.aufbewahrung', zaehler: 'darfWeg' },
  { pfad: 'stempel', gruppe: 'benutzer', ab: H, hilfe: 'werkbank.stempel', mitte: true },
  // Datenschutz (#1184, vorher unter „Benutzer und Sicherheit“, #668): Auskünfte (mit Mitte, wachsende Sammlung),
  // Löschkonzept und Löschprotokoll (vorher Abschnitt des Löschkonzepts) als drei klar getrennte Einträge.
  { pfad: 'auskuenfte', gruppe: 'datenschutz', ab: S, hilfe: 'werkbank.auskuenfte', mitte: true },
  { pfad: 'loeschkonzept', gruppe: 'datenschutz', ab: S, hilfe: 'werkbank.loeschkonzept' },
  { pfad: 'loeschprotokoll', gruppe: 'datenschutz', ab: S, hilfe: 'werkbank.loeschprotokoll', auchMit: ['loeschkonzept'] },
  { pfad: 'postfaecher', gruppe: 'post', ab: H, hilfe: 'werkbank.postfaecher', mitte: true, zaehler: 'postfaecher' },
  { pfad: 'eingangsordner', gruppe: 'post', ab: H, hilfe: 'werkbank.eingangsordner' },
  { pfad: 'webdav', gruppe: 'post', ab: H, hilfe: 'werkbank.webdav' },
  // Suche und Volltext (#725): Texterkennung samt Unscharfer Suche und Gleichbedeutenden Wörtern (früher „Suche“).
  { pfad: 'texterkennung', gruppe: 'post', ab: H, hilfe: 'werkbank.texterkennung' },
  // Gleichbedeutende Wörter (#992): eigener Bereich mit Mitte direkt darunter, sichtbar wie „Suche und Volltext“.
  { pfad: 'woerter', gruppe: 'post', ab: H, hilfe: 'werkbank.woerter', mitte: true },
  // Sicherung mit Wiederherstellen als Abschnitt (#725).
  { pfad: 'sicherung', gruppe: 'sichern', ab: E, hilfe: 'werkbank.sicherung' },
  { pfad: 'vollexport', gruppe: 'sichern', ab: H, hilfe: 'werkbank.vollexport' },
  { pfad: 'papierkorb', gruppe: 'sichern', ab: E, hilfe: 'werkbank.papierkorb', mitte: true },
  // Einstellungen zum Sichern (#1196, #1197): Aufbewahrung im Papierkorb und eigener Export der Benutzer – getrennt von
  // den Abläufen (Grundsatz: Einstellungen und Abläufe nicht mischen). In dieser Gruppe, weil „Einstellungen“ schon
  // sieben Bereiche hat (#354).
  { pfad: 'daten', gruppe: 'sichern', ab: H, hilfe: 'werkbank.daten' },
  { pfad: 'betrieb', gruppe: 'einstellungen', ab: E, hilfe: 'werkbank.betrieb' },
  // Region (#726): Land, Bundesland, Zeitzone an einer Stelle.
  { pfad: 'region', gruppe: 'einstellungen', ab: E, hilfe: 'werkbank.region' },
  // Sprachen (#729): erlaubte Sprachen und Sprache der Installation.
  { pfad: 'sprachen', gruppe: 'einstellungen', ab: H, hilfe: 'werkbank.sprachen' },
  // Eigene Organisation (#995) mit der Nutzung obenauf (#1170): einmal gesetzt, dann ist Ruhe – darum unter Einstellungen.
  // Ab Haushalt, weil der Haken „auch beruflich genutzt“ gerade für den Haushalt erreichbar sein muss.
  { pfad: 'organisation', gruppe: 'einstellungen', ab: H, hilfe: 'werkbank.organisation' },
  { pfad: 'aufgaben', gruppe: 'einstellungen', ab: H, hilfe: 'werkbank.aufgaben', mitte: true },
  { pfad: 'anmeldeschutz', gruppe: 'einstellungen', ab: H, hilfe: 'werkbank.anmeldeschutz' },
  { pfad: 'designs', gruppe: 'einstellungen', ab: B, hilfe: 'werkbank.designs', mitte: true },
  { pfad: 'anbindung', gruppe: 'einstellungen', ab: A, hilfe: 'werkbank.anbindung' },
  // Systemzustand nimmt „Technik“ (Version und Updates) und die Auslastung der Datenbank auf (#725).
  { pfad: 'systemzustand', gruppe: 'wartung', ab: E, hilfe: 'werkbank.speicherplatz' },
  { pfad: 'protokoll', gruppe: 'wartung', ab: H, hilfe: 'werkbank.protokoll', mitte: true },
  { pfad: 'fehlermeldungen', gruppe: 'wartung', ab: H, hilfe: 'werkbank.fehlermeldungen', mitte: true },
  // Wartung (#725): Wartungsmodus und Wartungsoperationen auf einer Seite.
  { pfad: 'wartung', gruppe: 'wartung', ab: H, hilfe: 'werkbank.wartungsmodus' },
  { pfad: 'demo', gruppe: 'wartung', ab: A, hilfe: 'werkbank.demo' },
] as const satisfies readonly Eintrag[];

/** Kennung einer Werkbank-Seite aus der Liste (ohne die Übersicht). */
export type Bereichskennung = (typeof EINTRAEGE)[number]['pfad'];
/** Zahlen der Leiste aus der Übersicht, in der Reihenfolge der Liste (#375). */
export type Zaehler = Extract<(typeof EINTRAEGE)[number], { zaehler: string }>['zaehler'];
export const ZAEHLER: readonly Zaehler[] = EINTRAEGE.flatMap((e) => ('zaehler' in e ? [e.zaehler] : []));
/** Bereich je Zahl (#375, #818): Die Übersicht liefert eine Zahl nur an Personen, die diesen Bereich verwalten. */
export const ZAEHLER_BEREICH = Object.fromEntries(
  EINTRAEGE.flatMap((e) => ('zaehler' in e ? [[e.zaehler, e.pfad] as const] : [])),
) as Readonly<Record<Zaehler, Bereichskennung>>;
/** Hilfeseite je Bereich (#110). */
export const bereichHilfe = (pfad: Bereichskennung): Hilfeort => EINTRAEGE.find((e) => e.pfad === pfad)!.hilfe;

/**
 * Verwaltungsbereiche, deren Recht eine Seite öffnet (#818, #1184): die Seite selbst und `auchMit` aus der Liste, diese
 * zuerst. Eine unbekannte Seite nur mit ihrem eigenen Namen.
 */
export function seitenRecht(pfad: string): string[] {
  const e = EINTRAEGE.find((x) => x.pfad === pfad);
  return [...(e && 'auchMit' in e ? e.auchMit : []), pfad];
}

/**
 * Darf eine Person mit diesen Verwaltungsbereichen die Seite in der Oberfläche öffnen (#818)? `null` = Gesamte Verwaltung;
 * die Übersicht und „Werkbank anpassen“ darf jeder, der verwalten darf. Der Server prüft dasselbe je Schnittstelle.
 */
export const darfSeite = (bereiche: readonly string[] | null, pfad: string): boolean =>
  bereiche === null || pfad === 'uebersicht' || pfad === 'ansicht' || seitenRecht(pfad).some((b) => bereiche.includes(b));

/** Stufe als Zahl: 0 = Einsteiger … 4 = Alles. */
export const stufeNr = (v: Vorlage) => STUFEN.indexOf(v);

export const BEREICHE: Bereich[] = EINTRAEGE.map((e) => ({
  pfad: e.pfad,
  gruppe: e.gruppe,
  ab: e.ab,
  in: STUFEN.filter((v): v is Exclude<Vorlage, 'alles'> => v !== 'alles' && stufeNr(v) >= stufeNr(e.ab)),
  name: t.frei(`werkbank.bereich.${e.pfad}.name`),
  wann: t.frei(`werkbank.bereich.${e.pfad}.wann`),
}));

/** Name eines Bereichs (auch der Übersicht) für Leiste, Überschriften und Verweise. */
export const bereichName = (pfad: string) => t.frei(`werkbank.bereich.${pfad}.name`);

/** Weitere Namen, unter denen die Werkbank-Suche einen Bereich findet (#725: auch alte Namen wie „Darf weg“). */
export const bereichAuch = (pfad: string): string[] => {
  const k = `werkbank.bereich.${pfad}.auch`;
  return t.hat(k)
    ? t
        .frei(k)
        .split('|')
        .map((x) => x.trim())
        .filter(Boolean)
    : [];
};

const falte = (x: string) =>
  x
    .toLocaleLowerCase('de-DE')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss');

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
  datenbank: 'anbindung',
  speicherplatz: 'systemzustand',
  // #717/#725: zusammengelegt oder umbenannt.
  darfweg: 'aufbewahrung',
  suche: 'texterkennung',
  wiederherstellung: 'sicherung',
  technik: 'systemzustand',
  wartungsmodus: 'wartung',
  // #668: Datenschutz in Auskünfte und Löschkonzept getrennt; die alte Adresse führt zu den Auskünften.
  datenschutz: 'auskuenfte',
  // #1170: Nutzung und Eigene Organisation auf einer Seite unter Einstellungen.
  nutzung: 'organisation',
};

/** Wohin ein umgezogener Bereich innerhalb seiner neuen Seite springt (Abschnitt, `#…`). */
export const UMGEZOGEN_ABSCHNITT: Readonly<Record<string, string>> = {
  suche: 'suche',
  wiederherstellung: 'wiederherstellen',
  technik: 'version',
  wartungsmodus: 'wartungsmodus',
  nutzung: 'nutzung',
};

/**
 * Gruppen, die nur bei beruflicher Nutzung in der Leiste stehen (#1184): Datenschutz gehört nicht zur rein privaten
 * Ablage. Am Merkmal „beruflich genutzt“ (#1170), zusätzlich zur Stufe (ab Selbständig, #987). Die Seiten bleiben über
 * ihre Adresse erreichbar – ausgeblendet ist nicht abgeschaltet.
 */
export const NUR_BERUFLICH: ReadonlySet<Gruppe> = new Set<Gruppe>(['datenschutz']);
export const inLeiste = (gruppe: Gruppe | null, m: { beruflich: boolean } | null | undefined) =>
  !gruppe || !NUR_BERUFLICH.has(gruppe) || !!m?.beruflich;

/**
 * Umgezogene Abschnitte (#1184): alte Adresse samt Sprungmarke → neue Seite. Das Löschprotokoll war ein Abschnitt des
 * Löschkonzepts und ist jetzt ein eigener Bereich. „Neue PDFs automatisch verkleinern“ steht seit #1190 beim
 * Speicherplatz im Systemzustand statt unter Suche und Volltext.
 */
const ABSCHNITT_UMGEZOGEN: Readonly<Record<string, string>> = {
  'loeschkonzept#loeschprotokoll': '/werkbank/loeschprotokoll',
  'texterkennung#automatisch-verkleinern': '/werkbank/systemzustand#automatisch-verkleinern',
};
export const abschnittUmleitung = (bereich: string, marke: string): string | null => ABSCHNITT_UMGEZOGEN[`${bereich}#${marke}`] ?? null;

/** Für die ganze Installation: Vorlage plus Abweichungen. */
export interface WerkbankAnsicht {
  vorlage: Vorlage;
  ein: string[];
  aus: string[];
}
/**
 * Je Person mit Verwaltungsrecht (#987): eine eigene Stufe („Meine Leiste“, ohne = die der Installation) und zusätzlich
 * eingeblendete Bereiche. Kein Recht, nur die Leiste (#810).
 */
export interface EigeneAnsicht {
  ein: string[];
  vorlage?: Vorlage;
}

/**
 * Bereiche, die der frühere Expertenmodus (#356, entfallen mit #987) im Haushalt zusätzlich zeigte. Wer ihn an hatte,
 * bekommt sie beim Lesen als eigene Einblendung – so verschwindet nichts aus der Leiste.
 */
export const FRUEHER_EXPERTE = ['automatisierungen', 'ablaufvorlagen', 'rundgaenge', 'tipps', 'texterkennung', 'woerter'] as const;

/**
 * Vorgabe der Vorlage aus dem Merkmal „beruflich genutzt“ (#1032): beruflich → Selbständig, sonst Einsteiger (#987).
 * Die Vorlage bleibt eine Einstellung der Werkbank; das Merkmal gilt für die Ablage und gibt nur die Vorgabe.
 */
export const vorlageFuer = (m: { beruflich: boolean }): Vorlage => (m.beruflich ? 'selbstaendig' : 'einsteiger');

/** Ohne Einstellung bleibt alles sichtbar – so ändert sich für bestehende Installationen nichts. */
export const OHNE_EINSTELLUNG: WerkbankAnsicht = { vorlage: 'alles', ein: [], aus: [] };

const liste = (v: unknown) =>
  Array.isArray(v)
    ? [
        ...new Set(
          v
            .filter((x): x is string => typeof x === 'string')
            .map((x) => UMGEZOGEN[x] ?? x)
            .filter((x) => BEKANNT.has(x)),
        ),
      ]
    : [];

/** Liest einen gespeicherten Wert; Unbekanntes fällt weg. `null` = noch nicht eingestellt. */
export function liesAnsicht(v: unknown): WerkbankAnsicht | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const vorlage = istVorlage(o.vorlage) ? o.vorlage : 'alles';
  return { vorlage, ein: liste(o.ein), aus: liste(o.aus) };
}
/** Eigene Ansicht; ein gespeicherter Expertenmodus (vor #987) wird zur Einblendung seiner Bereiche. */
export function liesEigene(v: unknown): EigeneAnsicht {
  const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  const ein = liste([...(Array.isArray(o.ein) ? o.ein : []), ...(o.experte === true ? FRUEHER_EXPERTE : [])]);
  return { ein, ...(istVorlage(o.vorlage) ? { vorlage: o.vorlage } : {}) };
}

export const inVorlage = (vorlage: Vorlage, pfad: string) => {
  const b = BEREICHE.find((x) => x.pfad === pfad);
  return vorlage === 'alles' || (!!b && stufeNr(vorlage) >= stufeNr(b.ab));
};

/** Anzahl der Einträge in der Leiste einer Vorlage, die Übersicht mitgezählt (#987, Handbuch und Rauchtest). */
export const anzahlInVorlage = (vorlage: Vorlage) => 1 + BEREICHE.filter((b) => inVorlage(vorlage, b.pfad)).length;

/** Für alle sichtbar (Installation). */
export function fuerAlle(a: WerkbankAnsicht, pfad: string): boolean {
  if (pfad === 'uebersicht') return true;
  if (a.aus.includes(pfad)) return false;
  return a.ein.includes(pfad) || inVorlage(a.vorlage, pfad);
}

/**
 * Für diese Person sichtbar (#987): die Installation – mit der eigenen Stufe statt der Vorlage, wenn die Person eine
 * gewählt hat; was für alle ein- oder ausgeblendet ist, gilt weiter – plus eigene Einblendungen.
 */
export const sichtbar = (a: WerkbankAnsicht, eigene: EigeneAnsicht, pfad: string) =>
  fuerAlle(eigene.vorlage ? { ...a, vorlage: eigene.vorlage } : a, pfad) || eigene.ein.includes(pfad);

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
 * passenden Abschnitt. Welche Bereiche eine Mitte haben, sagt `mitte: true` in der Liste (#1281); die Übersicht hat
 * immer eine. Alle anderen Bereiche – auch künftige – sind zweiteilig.
 */
export const MIT_MITTE: ReadonlySet<string> = new Set(['uebersicht', ...EINTRAEGE.filter((e) => 'mitte' in e).map((e) => e.pfad)]);

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
  if (neu)
    return id
      ? (werkbankUmleitung(neu, id) ?? `/werkbank/${neu}`)
      : `/werkbank/${neu}${suche}${UMGEZOGEN_ABSCHNITT[bereich] ? `#${UMGEZOGEN_ABSCHNITT[bereich]}` : ''}`;
  if (!id && OFFEN_ALS_PFAD.has(bereich)) {
    const offen = new URLSearchParams(suche).get('offen');
    return offen ? `/werkbank/${bereich}/${encodeURIComponent(offen)}` : null;
  }
  // Vorgaben für jede Auskunft (#1183): auf „Eigene Organisation“ unter Einstellungen.
  if (bereich === 'auskuenfte' && id === 'einstellungen') return '/werkbank/organisation#auskunft-vorgaben';
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
  return (
    ordner.length > 1 && gemessen.length === ordner.length && !!gemessen[0].geraet && gemessen.every((o) => o.geraet === gemessen[0].geraet)
  );
}
