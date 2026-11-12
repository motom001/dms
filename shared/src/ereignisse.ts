/**
 * Gemeinsamer Ereigniskatalog (#670): was im DMS passiert, an einer Stelle beschrieben – für Automatisierungen
 * (Wenn-Karten, #674), und Pakete mit Code (`code.ereignisse`).
 *
 * - **Nur Ids, Art, Feldschlüssel und Datum** – nie Feldwerte, Titel oder Namen. Wer mehr wissen will, liest mit seinen
 *   eigenen Rechten nach (Paket: bestätigte Rechte, Automatisierung: Systemkonto, #673).
 * - **Mindestens einmal, mit Ereignis-Id:** Der Kern schreibt ein Ereignis in derselben Transaktion wie die Änderung
 *   (Tabelle `ereignisse`) und verteilt es danach; wer es bekommt, erkennt eine Wiederholung an der Id.
 * - **Bündeln:** Viele schnelle Änderungen an derselben Mappe werden ein Ereignis (`buendelS`), die geänderten
 *   Feldschlüssel zusammengeführt. Demo-Daten, Importe und Wiederherstellungen lösen nichts aus.
 *
 * Texte (Name, Beschreibung) stehen in `shared/src/sprachen/de/ereignisse.json` unter `name.<art>` und `text.<art>` (Unterstrich als Bindestrich, `ereignisSchluessel`).
 */

/** Wozu ein Ereignis gehört – zugleich der Kontext einer Wenn-Karte (welche Platzhalter es gibt). */
export type Ereignisgruppe = 'mappe' | 'zeit' | 'person' | 'benutzer' | 'verarbeitung' | 'betrieb' | 'auftrag';
/**
 * Gruppen, die keine Wenn-Karte sind: Betrieb und Aufträge an ein einzelnes Paket. Aus dem Betrieb
 * sind nur die Werkbank-Karten {@link BETRIEB_WENN} Wenn-Karten (#677) – „Sicherung fertig“ nicht (das Systemkonto darf
 * Erfolg und Ort einer Sicherung nicht sehen).
 */
export const OHNE_WENN: readonly Ereignisgruppe[] = ['betrieb', 'auftrag'];
/** Wenn-Karten aus dem Betrieb (#677): Fehler gemeldet, Protokollmeldung, neue Version. */
export const BETRIEB_WENN = ['fehler.gemeldet', 'protokoll.meldung', 'version.neu'] as const;
export type BetriebWenn = (typeof BETRIEB_WENN)[number];
export const istBetriebWenn = (a: string): a is BetriebWenn => (BETRIEB_WENN as readonly string[]).includes(a);
/** Kann das Ereignis eine Wenn-Karte sein (vor den Sonderfällen der Automatisierungen)? */
export const wennFaehig = (a: KatalogArt) => !OHNE_WENN.includes(EREIGNISKATALOG[a].gruppe) || istBetriebWenn(a);

export interface Katalogeintrag {
  gruppe: Ereignisgruppe;
  /** Angaben im Ereignis (nur Ids, Schlüssel, Datum, Zahlen). */
  felder: readonly string[];
  /** Können Pakete es abonnieren (`code.ereignisse`)? */
  paket?: boolean;
  /** Zu einer Mappe: Pakete bekommen es nur, wenn ihr Paket-Benutzer Mappen dieses Typs lesen darf (#686). */
  mappentyp?: boolean;
  /** Zusammenfassen: schnelle Folgen zur selben Mappe binnen so vieler Sekunden werden ein Ereignis. */
  buendelS?: number;
}

export const EREIGNISKATALOG = {
  // Mappen
  'mappe.angelegt': { gruppe: 'mappe', felder: ['mappe', 'typ'], paket: true, mappentyp: true },
  'mappe.geaendert': { gruppe: 'mappe', felder: ['mappe', 'typ', 'felder'], paket: true, mappentyp: true, buendelS: 5 },
  'mappe.verknuepft': { gruppe: 'mappe', felder: ['mappe', 'typ', 'von', 'vonTyp', 'feld'] },
  'dokument.hochgeladen': { gruppe: 'mappe', felder: ['dokument', 'mappe', 'typ', 'mime', 'groesse'], paket: true },
  'mappe.notiz': { gruppe: 'mappe', felder: ['mappe', 'typ', 'notiz'] },
  'mappe.geloescht': { gruppe: 'mappe', felder: ['mappe', 'typ'], paket: true, mappentyp: true },
  'mappe.geloescht_verknuepft': { gruppe: 'mappe', felder: ['mappe', 'typ', 'vorgang', 'start'] },
  'mappe.endgueltig_geloescht': { gruppe: 'mappe', felder: ['mappe', 'typ'] },
  'mappe.wiederhergestellt': { gruppe: 'mappe', felder: ['mappe', 'typ'], paket: true, mappentyp: true },
  // Zeit
  'frist.erreicht': { gruppe: 'zeit', felder: ['mappe', 'typ', 'feld', 'datum', 'zeitpunkt', 'empfaenger'], paket: true, mappentyp: true },
  // Für Personen
  'aufgabe.neu': { gruppe: 'person', felder: ['aufgabe', 'mappe', 'typ', 'empfaenger', 'aufgabenart'] },
  // „an“ (#1042); „fuer“ mit demselben Wert nur noch bis 1.0.0 (server/src/uebergaenge.ts).
  'post.angelegt': { gruppe: 'person', felder: ['mappe', 'kanal', 'an', 'fuer'], paket: true },
  'favorit.neu': { gruppe: 'person', felder: ['benutzer', 'mappe', 'typ'] },
  // #678: Jemand hat eine Mappe geändert, die andere als Favorit mit „benachrichtigen“ haben (Dann-Karte „Favoriten-Änderungen melden“).
  'favorit.geaendert': { gruppe: 'person', felder: ['mappe', 'typ', 'von'] },
  // Benutzer
  'benutzer.abwesenheit_gesetzt': { gruppe: 'benutzer', felder: ['benutzer', 'von', 'bis', 'vertreter'] },
  'benutzer.abwesenheit_beendet': { gruppe: 'benutzer', felder: ['benutzer', 'vertreter'] },
  // #678/#712: Vertretung endet für den bisherigen Vertreter – Abwesenheit beendet, Vertreter gewechselt oder entfernt.
  'benutzer.vertretung_zurueckgezogen': { gruppe: 'benutzer', felder: ['benutzer', 'vertreter'] },
  'benutzer.gesperrt': { gruppe: 'benutzer', felder: ['benutzer', 'zeitpunkt', 'fehlversuche', 'bis', 'ip'] },
  'benutzer.deaktiviert': { gruppe: 'benutzer', felder: ['benutzer'] },
  'benutzer.aktiviert': { gruppe: 'benutzer', felder: ['benutzer'] },
  // Verarbeitung
  'volltext.fertig': { gruppe: 'verarbeitung', felder: ['dokument', 'mappe', 'typ', 'quelle'], paket: true },
  'datei.umgewandelt': { gruppe: 'verarbeitung', felder: ['dokument', 'mappe', 'typ', 'paket'] },
  'archivfassung.erstellt': { gruppe: 'verarbeitung', felder: ['dokument', 'mappe', 'typ', 'paket'] },
  'erkennung.fertig': { gruppe: 'verarbeitung', felder: ['mappe', 'typ', 'dokument'] },
  // Betrieb
  'sicherung.fertig': { gruppe: 'betrieb', felder: ['datei', 'groesse', 'sha256', 'beginn', 'verschluesselung'], paket: true },
  // Wenn-Karten der Werkbank (#677) – nur für Automatisierungen, nie für Pakete oder nach außen. „protokoll.meldung“ trägt
  // ausnahmsweise den Text der Meldung (ohne Geheimnisse wie im Protokoll, gekürzt): Das Protokoll lebt nur im
  // Arbeitsspeicher des Prozesses, der sie schrieb.
  'fehler.gemeldet': { gruppe: 'betrieb', felder: ['fehlermeldung', 'benutzer', 'zeitpunkt'] },
  'protokoll.meldung': { gruppe: 'betrieb', felder: ['stufe', 'modul', 'text', 'zeitpunkt'] },
  'version.neu': { gruppe: 'betrieb', felder: ['version', 'installiert'] },
  // Aufträge an genau ein Paket (der Kern bittet ein bestimmtes Paket um etwas, #577, #614, #631, #338)
  'paket.einstellungen_geaendert': { gruppe: 'auftrag', felder: ['felder'], paket: true },
  'datei.umwandeln': { gruppe: 'auftrag', felder: ['dokument', 'mappe', 'mime', 'groesse', 'sha256'], paket: true },
  'datei.volltext': { gruppe: 'auftrag', felder: ['dokument', 'mappe', 'mime', 'groesse', 'sha256'], paket: true },
  // #946: zeitzone (IANA, Werkbank → Region) für Datumsangaben in der Archivfassung.
  'datei.archivfassung': { gruppe: 'auftrag', felder: ['dokument', 'mappe', 'mime', 'groesse', 'sha256', 'zeitzone'], paket: true },
  // #1082: Dann-Karte „Paket nach Zeitplan ausführen“ – nur an das Paket der Karte, nie an andere. automatisierung (Id),
  // aufgabe (Kennung oder null), zeitpunkt (geplant, ISO) und datum (Tag in der Zeitzone der Ablage).
  'zeitplan.ausgefuehrt': { gruppe: 'auftrag', felder: ['automatisierung', 'aufgabe', 'zeitpunkt', 'datum'], paket: true },
} as const satisfies Record<string, Katalogeintrag>;

export type KatalogArt = keyof typeof EREIGNISKATALOG;
export const KATALOG_ARTEN = Object.keys(EREIGNISKATALOG) as KatalogArt[];
export const istKatalogArt = (a: string): a is KatalogArt => Object.prototype.hasOwnProperty.call(EREIGNISKATALOG, a);
/** Teil des Sprachschlüssels zu einer Art (`name.<teil>`, `text.<teil>`): Unterstrich ist in Schlüsseln Mehrzahlformen vorbehalten. */
type Bindestrich<S extends string> = S extends `${infer A}_${infer B}` ? `${A}-${Bindestrich<B>}` : S;
export const ereignisSchluessel = <A extends KatalogArt>(a: A) => a.replace(/_/g, '-') as Bindestrich<A>;
export const katalogeintrag = (a: KatalogArt): Katalogeintrag => EREIGNISKATALOG[a];
/** Ereignisse zu Mappen: Pakete bekommen sie nur zu Typen, die ihr Paket-Benutzer lesen darf (#686). */
export const MAPPENTYP_EREIGNISSE = KATALOG_ARTEN.filter((a) => (EREIGNISKATALOG[a] as Katalogeintrag).mappentyp);
/** Ereignisse, die Pakete abonnieren können (`code.ereignisse`), ohne die veralteten Namen. */
export const PAKET_KATALOG = KATALOG_ARTEN.filter((a) => (EREIGNISKATALOG[a] as Katalogeintrag).paket);
export type PaketKatalogArt = { [K in KatalogArt]: (typeof EREIGNISKATALOG)[K] extends { paket: true } ? K : never }[KatalogArt];
/**
 * Veraltete Namen, die Pakete noch abonnieren dürfen (Übergang, #724): Der Kern meldet nur das neue Ereignis; wer den
 * alten Namen abonniert hat, bekommt es beim Zustellen unter diesem Namen – `texterkennung.fertig` nur für den
 * Volltext der eingebauten Texterkennung (`quelle: kern`), wie vor 0.133.0. Entfällt mit Ablago 1.0.0
 * (server/src/uebergaenge.ts, #902).
 */
export const VERALTETE_EREIGNISSE = { 'texterkennung.fertig': 'volltext.fertig' } as const satisfies Record<string, KatalogArt>;

/**
 * Eine Regel für Wiederholungen (#724) – Ereignisse im Ausgangskorb und ihre Zustellung an Pakete: nach 1, 5 und
 * 30 Minuten, 2 und 6 Stunden; danach aufgegeben.
 */
export const WIEDERHOLEN_MIN: readonly number[] = [1, 5, 30, 120, 360];
/** Wartezeit in Sekunden vor dem nächsten Versuch nach `versuche` Fehlschlägen; null = aufgeben. */
export function wiederholungNach(versuche: number): number | null {
  const liste = WIEDERHOLEN_MIN.map((m) => m * 60);
  return versuche >= 0 && versuche < liste.length ? liste[versuche] : null;
}

/** Wer ein Ereignis ausgelöst hat – damit erkennt eine Automatisierung ihre eigenen Änderungen (#674). */
export interface Ausloeser {
  art: 'benutzer' | 'paket' | 'automatisierung' | 'system';
  /** Benutzer-Id, Paket-Id bzw. Id der Automatisierung. */
  id?: string | null;
  /** Konto, unter dem es geschah (Benutzer, Dienstkonto, Systemkonto). */
  konto?: string | null;
  /** Tiefe einer Kette von Automatisierungen (0 = direkt ausgelöst). */
  kette?: number;
  /** Still (Demo-Daten, Beispiel-Mappen, Import): nur Pakete bekommen Verarbeitungs-Ereignisse, sonst niemand. */
  still?: boolean;
}

/** Ein Ereignis, wie es Abnehmer im DMS bekommen. */
export interface KatalogEreignis { id: string; art: KatalogArt; daten: Record<string, unknown>; ausloeser: Ausloeser; erstellt: string }

/** Geänderte Feldschlüssel zweier Ereignisse zusammenführen (Bündeln). */
export function mischeFelder(alt: Record<string, unknown>, neu: Record<string, unknown>): Record<string, unknown> {
  const liste = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);
  return { ...alt, ...neu, felder: [...new Set([...liste(alt.felder), ...liste(neu.felder)])].sort() };
}
