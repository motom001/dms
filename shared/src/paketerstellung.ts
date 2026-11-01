/**
 * Paket selbst erstellen (#374): Mappentypen und Ansichten dieses DMS als Paket im Format der Registry.
 * Prüfung und Erzeugung stecken im Server (paketerstellung.ts); diese Datei teilen Server und Oberfläche.
 */
import { PAKET_ID, VERSION } from './pakete';

/** Lizenzen der Registry (REGELN.md, Positivliste); die erste ist der Vorschlag. */
export const LIZENZEN = ['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'MPL-2.0', 'LGPL-3.0-or-later', 'GPL-3.0-or-later', 'AGPL-3.0-or-later', 'CC0-1.0'] as const;
export type Lizenz = typeof LIZENZEN[number];

/** Grenzen aus dem Schema der Registry (manifest.schema.json). */
export const NAME_LAENGE = { min: 2, max: 60 } as const;
export const BESCHREIBUNG_LAENGE = { min: 10, max: 300 } as const;
export const GITHUB = /^[A-Za-z0-9-]+$/;

/** Was ins Paket soll: Ids aus diesem DMS. Beispiele nur aus ausdrücklich gewählten Mappen. */
export interface PaketAuswahl { typen: string[]; sichten: string[]; beispiele: string[] }

/** Angaben für das Manifest. */
export interface PaketAngaben {
  id: string; name: string; version: string; beschreibung: string;
  autor: { name: string; github: string };
  lizenz: string;
  /** Nötige DMS-Version, z. B. „>=0.86.0“. */
  dms: string;
  /** Eintrag für CHANGELOG.md zu dieser Version. */
  aenderungen: string;
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
}

/** Was es zur Auswahl gibt. */
export interface ErstellenStand {
  typen: Array<{ id: string; name: string; beschreibung: string; paket: { id: string; name: string; version: string } | null; geaendert: boolean }>;
  sichten: Array<{ id: string; name: string; elternId: string | null; paket: { id: string; name: string; version: string } | null }>;
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
  inhalt: { typen: Array<{ schluessel: string; name: string }>; sichten: Array<{ schluessel: string; name: string; eltern: string | null }>; beispiele: number };
  /** Mappen der gewählten eigenen Typen, aus denen man Beispiele wählen kann (je Typ höchstens 200). */
  beispielMappen: Array<{ typId: string; typ: string; mappen: Array<{ id: string; titel: string; demo: boolean }>; mehr: boolean }>;
  /** Dieselbe Prüfung wie beim Hochladen ist gelaufen: Das Paket ließe sich so wieder einspielen. */
  einspielbar: boolean;
  /** Archivname und Größe, wenn einspielbar. */
  datei: { name: string; bytes: number } | null;
}

/** Nächste Version: Nebenversion + 1 (1.0.0 → 1.1.0); ungültig → 1.0.0. */
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
