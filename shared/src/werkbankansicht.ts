/**
 * Ansicht der Werkbank (#281): Welche Bereiche stehen in der Leiste?
 *
 * Ausblenden heißt nicht abschalten – es betrifft nur die Navigation. Bereiche mit einer Warnung
 * erscheinen trotzdem. Die Bereiche sind so geschnitten, dass sie später auch Einheiten für
 * abgestufte Administratorrechte sein können (#282); ihre Kennung ist der Pfad unter /werkbank.
 */

export type Vorlage = 'haushalt' | 'organisation' | 'alles';

export const VORLAGEN: Record<Vorlage, { name: string; text: string }> = {
  haushalt: { name: 'Haushalt', text: 'Schlank: nur, was ein Haushalt zum Einrichten und Sichern braucht.' },
  organisation: { name: 'Betrieb', text: 'Für Selbständige und kleine Betriebe. Dazu Nummernkreise, Darf weg, Datenschutz, Anmeldeschutz, Designs, Postfächer, Eingangsordner, Texterkennung, Protokoll, Gemeldete Fehler und Wartungsmodus.' },
  alles: { name: 'Alles', text: 'Jeder Bereich der Werkbank.' },
};

/** Gruppen der Leiste (#68). */
export const GRUPPEN = { ablage: 'Ablage einrichten', benutzer: 'Benutzer und Zusammenarbeit', einstellungen: 'Einstellungen', wartung: 'Wartung und Fehlersuche' } as const;
export type Gruppe = keyof typeof GRUPPEN;

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

/** Alle Bereiche außer der Übersicht (die ist immer da), in der Reihenfolge der Leiste. */
export const BEREICHE: Bereich[] = [
  { pfad: 'typen', gruppe: 'ablage', name: 'Mappentypen', in: [...H], wann: 'eigene Arten von Mappen bauen' },
  { pfad: 'sichten', gruppe: 'ablage', name: 'Ansichten', in: [...H], wann: 'die Sammlungen links in der Ablage ordnen' },
  { pfad: 'nummernkreise', gruppe: 'ablage', name: 'Nummernkreise', in: [...O], wann: 'fortlaufende Nummern, z. B. für Rechnungen' },
  { pfad: 'stempel', gruppe: 'ablage', name: 'Stempel', in: [...H], wann: 'Vorlagen für Stempel und Wasserzeichen beim Weitergeben' },
  { pfad: 'pakete', gruppe: 'ablage', name: 'Pakete', in: [...H], wann: 'fertige Mappentypen und Ansichten installieren' },
  { pfad: 'darfweg', gruppe: 'ablage', name: 'Darf weg', in: [...O], wann: 'Mappen mit abgelaufener Aufbewahrungsfrist (nur mit Archivmodus)' },
  { pfad: 'datenschutz', gruppe: 'ablage', name: 'Datenschutz', in: [...O], wann: 'Auskunft nach Art. 15 DSGVO an Kunden, Mieter und Kontakte als ZIP' },
  { pfad: 'benutzer', gruppe: 'benutzer', name: 'Benutzer', in: [...H], wann: 'Benutzer und Rollen anlegen' },
  { pfad: 'anmeldeschutz', gruppe: 'benutzer', name: 'Anmeldeschutz', in: [...O], wann: 'Zwei-Faktor vorschreiben, Anmeldung über einen Anbieter, gesperrte Adressen' },
  { pfad: 'aufgaben', gruppe: 'benutzer', name: 'Aufgaben', in: [...H], wann: 'alle offenen Aufgaben im Blick behalten' },
  { pfad: 'betrieb', gruppe: 'einstellungen', name: 'E-Mail und Adresse', in: [...H], wann: 'E-Mail-Versand und Adresse des DMS' },
  { pfad: 'verschluesselung', gruppe: 'einstellungen', name: 'Verschlüsselung', in: [...H], wann: 'den Schlüssel für Passwörter und Sicherungen' },
  { pfad: 'designs', gruppe: 'einstellungen', name: 'Designs', in: [...O], wann: 'Logo, Farben und eigenes CSS' },
  { pfad: 'papierkorb', gruppe: 'einstellungen', name: 'Papierkorb', in: [...H], wann: 'gelöschte Mappen zurückholen' },
  { pfad: 'anbindung', gruppe: 'einstellungen', name: 'Datenbank-Anbindung', in: [], wann: 'die Verbindung zur Datenbank ändern' },
  { pfad: 'speicherplatz', gruppe: 'einstellungen', name: 'Speicherplatz', in: [...H], wann: 'sehen, wie voll das Gerät ist' },
  { pfad: 'postfaecher', gruppe: 'einstellungen', name: 'Postfächer', in: [...O], wann: 'Post aus einem E-Mail-Konto abholen' },
  { pfad: 'eingangsordner', gruppe: 'einstellungen', name: 'Eingangsordner', in: [...O], wann: 'Scans aus einem Ordner übernehmen' },
  { pfad: 'webdav', gruppe: 'einstellungen', name: 'WebDAV-Laufwerk', in: [...H], wann: 'die Ablage im Explorer, Finder oder in der Dateien-App einbinden' },
  { pfad: 'texterkennung', gruppe: 'einstellungen', name: 'Texterkennung', in: [...O], wann: 'Text in gescannten Dokumenten finden' },
  { pfad: 'protokoll', gruppe: 'wartung', name: 'Protokoll', in: [...O], wann: 'das technische Protokoll lesen' },
  { pfad: 'fehlermeldungen', gruppe: 'wartung', name: 'Gemeldete Fehler', in: [...O], wann: 'Fehler, die Benutzer gemeldet haben' },
  { pfad: 'sicherung', gruppe: 'wartung', name: 'Sicherung', in: [...H], wann: 'Sicherungen einrichten und prüfen' },
  { pfad: 'wiederherstellung', gruppe: 'wartung', name: 'Wiederherstellen', in: [...H], wann: 'eine Sicherung zurückspielen' },
  { pfad: 'vollexport', gruppe: 'wartung', name: 'Vollexport', in: [...H], wann: 'alle Daten in offenen Formaten mitnehmen' },
  { pfad: 'wartungsmodus', gruppe: 'wartung', name: 'Wartungsmodus', in: [...O], wann: 'Benutzer vorübergehend aussperren' },
  { pfad: 'wartung', gruppe: 'wartung', name: 'Wartungsoperationen', in: [], wann: 'einmalige Pflegearbeiten' },
  { pfad: 'datenbank', gruppe: 'wartung', name: 'Datenbank', in: [], wann: 'Tabellen und Größen der Datenbank' },
  { pfad: 'technik', gruppe: 'wartung', name: 'Technik', in: [...H], wann: 'Version, Updates und die Übersicht für GitHub' },
  { pfad: 'demo', gruppe: 'wartung', name: 'Demo-Daten', in: [], wann: 'Beispielmappen zum Ausprobieren' },
];

const BEKANNT = new Set(BEREICHE.map((b) => b.pfad));

/** Für die ganze Installation: Vorlage plus Abweichungen. */
export interface WerkbankAnsicht { vorlage: Vorlage; ein: string[]; aus: string[] }
/** Je Administrator: zusätzlich eingeblendete Bereiche. */
export interface EigeneAnsicht { ein: string[] }

/** Ohne Einstellung bleibt alles sichtbar – so ändert sich für bestehende Installationen nichts. */
export const OHNE_EINSTELLUNG: WerkbankAnsicht = { vorlage: 'alles', ein: [], aus: [] };

const liste = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && BEKANNT.has(x)))] : []);

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
 * Kleine oder nur lesende Listen (lange Zugriffe, Demo-Übersicht, Technik, Exporte, gesperrte Adressen,
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
 * Alte Direktlinks in Bereiche ohne Mitte (z. B. /werkbank/datenbank/:id) führen auf die Seite;
 * der Eintrag steht dann als ?offen=… in der Adresse und ist aufgeklappt. `null` = nichts umzuleiten.
 */
export function werkbankUmleitung(bereich: string, id?: string): string | null {
  if (!id || hatMitte(bereich)) return null;
  return bereich === 'datenbank' || bereich === 'stempel' ? `/werkbank/${bereich}?offen=${encodeURIComponent(id)}` : `/werkbank/${bereich}`;
}

/** Plakette links für den Wartungsmodus (#366): „angekündigt“, solange er noch nicht wirkt, „an“ erst danach. */
export function wartungsPlakette(stufe: 'aus' | 'angekuendigt' | 'aktiv', aktivAb: string | null, jetzt = Date.now()): string | undefined {
  if (stufe === 'aus') return undefined;
  if (stufe === 'aktiv' || (aktivAb && Date.parse(aktivAb) <= jetzt)) return 'an';
  return 'angekündigt';
}

/** Speicherplatz (#366): Liegen alle messbaren Ordner auf demselben Datenträger, genügt ein Balken. */
export function einDatentraeger(ordner: Array<{ geraet: string | null; gesamt: number | null }>): boolean {
  const gemessen = ordner.filter((o) => o.gesamt !== null);
  return ordner.length > 1 && gemessen.length === ordner.length && !!gemessen[0].geraet && gemessen.every((o) => o.geraet === gemessen[0].geraet);
}
