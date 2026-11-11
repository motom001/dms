/**
 * Paket-Aktionen im Menü „Mappe“ (#1039): Ein Paket meldet im Manifest Aktionen an (`mappenaktionen`), Ablago zeigt sie
 * an passenden Mappen und führt den Ablauf – das Paket liefert nur Daten (Dialog-Beschreibung oder Ergebnis), nie
 * HTML oder JavaScript. Hier steht, was Server und Oberfläche gleich sehen: Schreibweise im Manifest, Rechte, Dialog und
 * Ergebnis. Lesen des Manifests, Prüfen, Ablauf und Rechte zur Laufzeit macht der Server (`server/src/paketaktionen/`).
 *
 * Regeln (Ergänzung Sicherheit, verbindlich):
 * - Das Paket handelt im Auftrag der Person, nur in der Schnittmenge aus angekündigten Rechten, Rechten der Person und
 *   Rechten des Pakets – bei jedem Schritt auf dem Server berechnet. Herausgeben zählt wie Herunterladen (Recht E, #723).
 * - Der Ablauf bleibt bei Ablago: Aktion, Mappe, Person und Schritt merkt sich der Server; das Paket bekommt nur eine
 *   Kennung für den Schritt. Mappe und Person kommen nie aus der Antwort des Pakets.
 * - Dialoge nur als Daten: Text, Auswahl, Haken, Textfeld, Datum – keine Passwort-Eingabe, kein Datei-Upload, keine
 *   Links nach außen, Text nur als Text. Der Paketname steht immer im Kopf („Aktion von Verträge“).
 */
import { SCHLUESSEL } from './kennungen';
import type { Anzeigeregel } from './model';

/** Ab dieser Version kennt Ablago `mappenaktionen` im Manifest; ältere übergehen den Abschnitt. */
export const DMS_MAPPENAKTIONEN_AB = '0.245.0';

/**
 * Rechte, die eine Aktion am Ende braucht (Schreibweise im Manifest). Je Recht, was Person und Paket an der Mappe haben
 * müssen – Person: Recht an der Mappe (R lesen, U bearbeiten, C anlegen im Zieltyp, E herausgeben); Paket: was es laut
 * `code.rechte` darf (lesen bzw. schreiben am Mappentyp).
 */
export const AKTION_RECHTE = ['lesen', 'dokument_hinzufuegen', 'aendern', 'mappen_anlegen', 'herausgeben'] as const;
export type AktionRecht = (typeof AKTION_RECHTE)[number];
export const istAktionRecht = (x: unknown): x is AktionRecht => typeof x === 'string' && (AKTION_RECHTE as readonly string[]).includes(x);

/**
 * Dialoge des Kerns, die eine Aktion statt eigenem Code nutzen kann: `dms:vorlage` öffnet „Brief aus Vorlage“ (#1040)
 * mit den Vorlagen dieses Pakets – z. B. „Vorlage hinzufügen“ im Paket Verträge.
 */
export const KERN_DIALOGE = ['dms:vorlage'] as const;
export type KernDialog = (typeof KERN_DIALOGE)[number];

/** Höchstens so viele Aktionen je Paket. */
export const MAPPENAKTIONEN_MAX = 20;
/** Höchstens so lang sind Name und Beschreibung einer Aktion (Zeichen). */
export const AKTION_NAME_MAX = 60;
export const AKTION_BESCHREIBUNG_MAX = 300;

/** Bedingung einer Aktion: wie „Anzeigen, wenn …“ (#1033) und der Grund, der im Menü steht, solange sie nicht zutrifft. */
export interface AktionBedingung { regel: Anzeigeregel; grund: string }

/** Eine angemeldete Aktion, wie Ablago sie aus dem Manifest liest und mit dem Paket speichert. */
export interface MappenAktion {
  schluessel: string;
  name: string;
  beschreibung?: string;
  /** Mappentypen als Verweis wie in `code.rechte` (eigener Schlüssel, `paket:typ`). */
  mappentypen: string[];
  rechte: AktionRecht[];
  /** Zieltypen bei `mappen_anlegen` (Verweise wie oben). */
  anlegen?: string[];
  bedingung?: AktionBedingung;
  /** Kern-Dialog statt Code des Pakets. */
  dialog?: KernDialog;
}

const istObjekt = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));

/* ---------- Was die Oberfläche bekommt ---------- */

/** Eingebaute Aktionen im Menü „Mappe“, die der Administrator ausblenden kann. */
export const EINGEBAUTE_AKTIONEN = ['aufgabe', 'erinnern', 'email', 'drucken', 'link'] as const;
export type EingebauteAktion = (typeof EINGEBAUTE_AKTIONEN)[number];
export const istEingebauteAktion = (x: unknown): x is EingebauteAktion => typeof x === 'string' && (EINGEBAUTE_AKTIONEN as readonly string[]).includes(x);

/** Eine Aktion im Menü einer Mappe. `gesperrt`: Bedingung trifft nicht zu – Grund im Menü. */
export interface AngeboteneAktion {
  paket: { id: string; name: string };
  schluessel: string; name: string; beschreibung?: string;
  rechte: AktionRecht[];
  dialog?: KernDialog;
  gesperrt?: string;
}
/** Antwort auf GET /api/mappen/{id}/paketaktionen. */
export interface AktionenAnMappe { aktionen: AngeboteneAktion[]; eingebautAus: EingebauteAktion[] }

/** Feldarten eines Dialogs (Schreibweise im Paket). `text` ist ein Absatz zum Lesen, keine Eingabe. */
export const DIALOG_ARTEN = ['text', 'auswahl', 'haken', 'textfeld', 'datum'] as const;
export type DialogArt = (typeof DIALOG_ARTEN)[number];
export interface DialogFeld {
  art: DialogArt;
  /** Kennung der Eingabe (nicht bei `text`). */
  schluessel?: string;
  name?: string;
  /** Absatz bei `text`, Hilfe unter der Eingabe sonst – immer nur Text. */
  text?: string;
  hilfe?: string;
  optionen?: Array<{ wert: string; name: string }>;
  /** Mehrfach bei `auswahl`: Haken je Option (z. B. eine Zeile je Rechnungsposition). */
  mehrfach?: boolean;
  standard?: string | boolean | string[];
  pflicht?: boolean;
}
/** Dialog-Beschreibung eines Pakets, geprüft. `gefahr`: Hauptknopf rot – nur, wenn das Paket etwas löscht. */
export interface AktionsDialog { titel: string; felder: DialogFeld[]; knopf: string; gefahr?: boolean }

/** Ergebnis eines Laufs für die Oberfläche. */
export interface AktionsErgebnis {
  meldung: string;
  /** Neues Dokument – mit „Dokument öffnen“. */
  dokument?: { id: string; name: string; registerKey: string };
  /** Geänderte Felder (Beschriftungen). */
  geaendert?: string[];
  /** Angelegte Mappen. */
  mappen?: Array<{ id: string; typId: string; titel: string }>;
  /** Datei zum Herausgeben – abholen mit POST /api/paketaktionen/laeufe/{lauf}/datei. */
  datei?: { name: string; groesse: number };
}
/** Antwort auf Start und jeden weiteren Schritt. */
export type AktionsSchritt =
  | { lauf: string; paket: { id: string; name: string }; aktion: string; name: string; schritt: number; dialog: AktionsDialog }
  | { lauf: string; paket: { id: string; name: string }; aktion: string; name: string; ergebnis: AktionsErgebnis }
  /** Kern-Dialog (#1040): Die Oberfläche öffnet ihn, mit den Vorlagen dieses Pakets. */
  | { lauf: string; paket: { id: string; name: string }; aktion: string; name: string; kern: KernDialog; rechte: AktionRecht[] };

/** Einstellungen der Werkbank zu den Aktionen im Menü „Mappe“ (Einstellung `mappenaktionen`). */
export interface AktionenEinstellung { eingebautAus: EingebauteAktion[]; paketAus: Record<string, string[]> }
export function liesAktionenEinstellung(v: unknown): AktionenEinstellung {
  const o = istObjekt(v) ? v : {};
  const eingebautAus = (Array.isArray(o.eingebautAus) ? o.eingebautAus : []).filter(istEingebauteAktion);
  const paketAus: Record<string, string[]> = {};
  if (istObjekt(o.paketAus)) for (const [k, l] of Object.entries(o.paketAus)) if (Array.isArray(l)) paketAus[k] = l.map(str).filter((x) => SCHLUESSEL.test(x));
  return { eingebautAus: [...new Set(eingebautAus)], paketAus };
}
