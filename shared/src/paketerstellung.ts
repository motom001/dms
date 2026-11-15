/**
 * Paket selbst erstellen (#374): Mappentypen und Ansichten dieses DMS als Paket im Format der Registry.
 * Prüfung und Erzeugung stecken im Server (paketerstellung.ts); diese Datei teilen Server und Oberfläche.
 */
import { PAKET_ID, VERSION } from './pakete';
import { t } from './texte';

/** Freie Lizenzen der Registry (REGELN.md, Positivliste) – nur sie dürfen in den offiziellen Katalog. */
export const LIZENZEN = ['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'MPL-2.0', 'LGPL-3.0-or-later', 'GPL-3.0-or-later', 'AGPL-3.0-or-later', 'CC0-1.0'] as const;
export type Lizenz = typeof LIZENZEN[number];
/** Schlüssel der Sprachtexte je freier Lizenz (Name und ein sachlicher Satz, `pakete.erstellen.lizenz.<schluessel>.…`). */
export const LIZENZ_SCHLUESSEL: Record<Lizenz, string> = {
  'MIT': 'mit', 'Apache-2.0': 'apache', 'BSD-2-Clause': 'bsd2', 'BSD-3-Clause': 'bsd3', 'MPL-2.0': 'mpl',
  'LGPL-3.0-or-later': 'lgpl', 'GPL-3.0-or-later': 'gpl', 'AGPL-3.0-or-later': 'agpl', 'CC0-1.0': 'cc0',
};
/** Freie Lizenzen alphabetisch nach Kürzel (keine Wertung, #651). */
export const LIZENZEN_ALPHABETISCH: Lizenz[] = [...LIZENZEN].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
/** Passt eine Lizenz zur Suche? Kürzel und Name, ohne Groß-/Kleinschreibung („apa“ → Apache-2.0, „gnu“ → GPL, LGPL, AGPL). */
export function lizenzPasst(l: Lizenz, name: string, suche: string): boolean {
  const s = suche.trim().toLowerCase();
  return !s || l.toLowerCase().includes(s) || name.toLowerCase().includes(s);
}
/** Vorgabe beim Erstellen (#651): wie Ablago selbst. */
export const LIZENZ_VORGABE: Lizenz = 'Apache-2.0';
/**
 * Lizenz im Manifest, wenn keine angegeben ist (#651, Weg 3). SPDX kennt „NONE“ für „keine Lizenz“;
 * eigene Lizenzen stehen als „LicenseRef-…“ darin.
 */
export const KEINE_LIZENZ = 'NONE';
export const EIGENE_LIZENZ = /^LicenseRef-[A-Za-z0-9.-]{1,60}$/;
/** Art der Lizenz (#651): freie aus der Liste, eigene (Name + Text) oder keine. */
export type LizenzArt = 'frei' | 'eigen' | 'keine';
export const LIZENZNAME_LAENGE = { min: 2, max: 80 } as const;
export const LIZENZTEXT_MAX = 100_000;
/** Ist das eine freie Lizenz der Registry? Alles andere kommt nicht in den offiziellen Katalog. */
export const istFreieLizenz = (l: string) => (LIZENZEN as readonly string[]).includes(l);
/** Art einer Lizenzangabe im Manifest (für die Anzeige bei der Installation). */
export const lizenzArtVon = (l: string): LizenzArt => (istFreieLizenz(l) ? 'frei' : !l || l === KEINE_LIZENZ ? 'keine' : 'eigen');
/** „LicenseRef-…“ aus dem Namen einer eigenen Lizenz. */
export function lizenzVerweis(name: string): string {
  const s = name.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue').replace(/ß/g, 'ss')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9.]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
  return t('gemeinsam.paketerstellung.licenseref', { wert: s || 'eigene' });
}

/** Grenzen aus dem Schema der Registry (manifest.schema.json). */
export const NAME_LAENGE = { min: 2, max: 60 } as const;
export const BESCHREIBUNG_LAENGE = { min: 10, max: 300 } as const;
export const GITHUB = /^[A-Za-z0-9-]+$/;

/** Was ins Paket soll: Ids aus diesem DMS. Beispiele nur aus ausdrücklich gewählten Mappen. */
/** Wortlisten (#661): Ids eigener Gruppen gleichbedeutender Wörter (Werkbank → Suche). */
/** Beispiel-Dokumente (#878): Dokumente (PDF, PNG, JPEG) der gewählten Beispiel-Mappen kommen mit – nur auf ausdrücklichen Wunsch. */
export interface PaketAuswahl { typen: string[]; sichten: string[]; beispiele: string[]; wortlisten?: string[]; beispielDokumente?: boolean; /** Eigene Rundgänge (#941), Schlüssel ohne „eigen:“. */ rundgaenge?: string[] }

/** Angaben für das Manifest. */
export interface PaketAngaben {
  id: string; name: string; version: string; beschreibung: string;
  autor: { name: string; github: string };
  /** Bei „frei“ das SPDX-Kürzel; sonst setzt der Server LicenseRef-… bzw. NONE. */
  lizenz: string;
  /** #651: Art der Lizenz; fehlt sie (ältere Entwürfe), gilt „frei“. */
  lizenzArt?: LizenzArt;
  /** Bei „eigen“: Name und voller Text (kommt als LICENSE ins Paket). */
  lizenzName?: string;
  lizenzText?: string;
  /** Nötige DMS-Version, immer „>=X.Y.0“ (#651, Auswahl). */
  dms: string;
  /** Eintrag für CHANGELOG.md zu dieser Version. */
  aenderungen: string;
  /**
   * #651: Version, die der Empfänger zuletzt bekommen hat, wenn Ablago sie nicht selbst kennt
   * (aus „Letzte Version des Pakets hochladen“). Die neue Version muss höher sein.
   */
  bekannteVersion?: string;
  /** #651, nur im Expertenmodus: Version und Ablago-Version von Hand (werden trotzdem geprüft). */
  vonHand?: boolean;
}
export type PaketErstellenEingabe = PaketAuswahl & PaketAngaben;

/** Gemerkt nach jedem Export (Einstellung), damit der nächste dieselbe Id mit höherer Version bekommt. */
export interface PaketEntwurf extends PaketErstellenEingabe {
  /** Kennungen im Paket je Id im DMS (Typen und Ansichten) – bleiben über Versionen gleich. */
  schluessel: Record<string, string>;
  /** Frühere Versionen für CHANGELOG.md, neueste zuerst. */
  verlauf: Array<{ version: string; datum: string; text: string }>;
  exportiert: string;
  von: string | null;
  /** #651: Feldschlüssel je exportiertem Mappentyp (Id im DMS) – daraus erkennt Ablago die Art der nächsten Änderung. */
  felder?: Record<string, string[]>;
}

/** Art einer neuen Version (#651) mit Beispiel. */
export type VersionsArt = 'korrektur' | 'inhalt' | 'gross';
export const VERSIONSARTEN: VersionsArt[] = ['korrektur', 'inhalt', 'gross'];

/** Die drei möglichen nächsten Versionen nach `v` (1.2.3 → 1.2.4 / 1.3.0 / 2.0.0). */
export function naechsteVersionen(v: string): Record<VersionsArt, string> {
  if (!VERSION.test(v)) return { korrektur: '1.0.0', inhalt: '1.0.0', gross: '1.0.0' };
  const [a, b, c] = v.split('.').map(Number);
  return { korrektur: `${a}.${b}.${c + 1}`, inhalt: `${a}.${b + 1}.0`, gross: `${a + 1}.0.0` };
}

/** Was die Prüfung zu Version und nötiger Ablago-Version sagt (#651). */
export interface VersionsLage {
  /** Höchste Version, die der Empfänger schon haben kann (Entwurf oder hochgeladen); null = erstes Paket. */
  bekannt: string | null;
  /** Von Ablago erkannte Art der Änderung seit dem letzten Export, sonst null. */
  art: VersionsArt | null;
  /** Grund für die erkannte Art, z. B. „Feld Kundennummer entfernt“. */
  artGrund: string | null;
  /** Ermittelte Mindestversion von Ablago (X.Y.0) und warum. */
  mindest: string;
  gruende: string[];
  /** Wählbare Angaben für „Nötige Ablago-Version“, älteste zuerst (Mindestversion … eigene Version). */
  dmsOptionen: string[];
}

/** Selbst erstelltes Paket in der Paketverwaltung (#652): was zuletzt erstellt wurde, ohne Daten. */
export interface SelbstErstellt {
  id: string; name: string; version: string; erstellt: string; von: string | null; lizenz: string;
  /** Versionen, die sich noch als ZIP herunterladen lassen (neueste zuerst). */
  versionen: Array<{ version: string; erstellt: string; bytes: number }>;
}
/** Einzelheiten (#652): der damals erstellte Umfang und der Vergleich mit heute. */
export interface SelbstErstelltDetail extends SelbstErstellt {
  beschreibung: string; dms: string; autor: { name: string; github: string }; aenderungen: string;
  typen: Array<{ id: string; name: string | null; geaendert: boolean }>;
  sichten: Array<{ id: string; name: string | null }>;
  beispiele: number;
  verlauf: Array<{ version: string; datum: string; text: string }>;
}

/** Was es zur Auswahl gibt. */
export interface ErstellenStand {
  /** geaendert (#653): inhaltlich anders als der Paketstand; unterschiede: Kurzfassung und Liste (null = Paketstand unbekannt, vor 0.179.0 installiert). */
  typen: Array<{ id: string; name: string; beschreibung: string; paket: { id: string; name: string; version: string } | null; geaendert: boolean; unterschiede?: import('./typvergleich').TypUnterschiede | null }>;
  sichten: Array<{ id: string; name: string; elternId: string | null; paket: { id: string; name: string; version: string } | null }>;
  /** Gruppen gleichbedeutender Wörter (#661): eigene zum Ankreuzen, aus Paketen nur zur Anzeige. */
  wortlisten: Array<{ id: string; woerter: string[]; paket: { id: string; name: string } | null }>;
  /** Eigene Rundgänge (#941) zum Ankreuzen. */
  rundgaenge?: Array<{ schluessel: string; titel: string }>;
  entwuerfe: PaketEntwurf[];
  dms: string;
  /** Angaben für einen neuen Export: aus dem zuletzt exportierten Entwurf mit höherer Version, sonst leer mit Vorschlägen. */
  vorschlag: PaketErstellenEingabe;
}

/** Ein Typ bzw. eine Ansicht dieses DMS, die nicht gewählt ist, aber gebraucht wird. */
export interface Fehlend { art: 'typ' | 'sicht'; id: string; name: string; grund: string }

/** Ergebnis der automatischen Prüfung. */
export interface PaketPruefung {
  /** Verhindern den Export. */
  probleme: string[];
  /** Eigene, nicht gewählte Typen bzw. Ansichten, auf die verwiesen wird – „mit aufnehmen“. */
  fehlend: Fehlend[];
  /** Hinweise: was als Abhängigkeit eingetragen wird, was nicht ins Paket kommt. */
  hinweise: string[];
  abhaengigkeiten: Record<string, string>;
  /** Was ins Paket kommt (Kennung im Paket und Name). */
  inhalt: { typen: Array<{ schluessel: string; name: string }>; sichten: Array<{ schluessel: string; name: string; eltern: string | null }>; beispiele: number; wortlisten?: number; /** Beispiel-Dokumente (#878). */ beispielDokumente?: number; /** Eigene Rundgänge (#941). */ rundgaenge?: number };
  /** Mappen der gewählten eigenen Typen, aus denen man Beispiele wählen kann (je Typ höchstens 200). */
  beispielMappen: Array<{ typId: string; typ: string; mappen: Array<{ id: string; titel: string; demo: boolean }>; mehr: boolean }>;
  /** Dieselbe Prüfung wie beim Hochladen ist gelaufen: Das Paket ließe sich so wieder einspielen. */
  einspielbar: boolean;
  /** Archivname und Größe, wenn einspielbar. */
  datei: { name: string; bytes: number } | null;
  /** #651: Version und nötige Ablago-Version. */
  version: VersionsLage;
}

/** Nächste Version: Nebenversion + 1 (1.0.0 → 1.1.0); ungültig → 1.0.0 (Vorschlag „Neue Inhalte“). */
export function naechsteVersion(v: string): string {
  if (!VERSION.test(v)) return '1.0.0';
  const [a, b] = v.split('.').map(Number);
  return `${a}.${b + 1}.0`;
}

/** Paket-Id aus einem Namen: klein, a–z, 0–9 und _, höchstens 20 Zeichen, beginnt mit einem Buchstaben. */
export function paketIdAus(name: string): string {
  const s = name.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^[^a-z]+/, '').replace(/_+$/, '').slice(0, 20).replace(/_+$/, '');
  return PAKET_ID.test(s) ? s : '';
}
