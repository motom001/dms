/**
 * Änderungshistorie (#57) – #1278, vorher `shared/src/model.ts`: Abrufe, Feldänderungen, Konflikte, Einträge.
 */
import type { Historienart } from './historienarten';
import type { Wert } from './mappe';

/** Wege eines Abrufs (#800) und die Art des Eintrags dazu. */
export type Abrufweg = 'oberflaeche' | 'api' | 'webdav';
export const ABRUF_ART: Record<Abrufweg, Historienart> = { oberflaeche: 'heruntergeladen', api: 'abruf_api', webdav: 'abruf_webdav' };
/** Welche Fassung abgerufen wurde: das Original, eine ältere Version, die Archivfassung, die umgewandelte Fassung, Seitenbilder. */
export type Abruffassung = 'original' | 'version' | 'archiv' | 'umgewandelt' | 'seiten' | 'export';
/** Eine Feldänderung: Werte lesbar zum Zeitpunkt der Änderung; Passwörter nur als „geändert“. */
export interface Feldaenderung {
  feld: string;
  label: string;
  alt?: string;
  neu?: string;
  geheim?: boolean;
}
/**
 * Gleichzeitig bearbeiten (#609): ein Feld, das seit dem Stand des Schreibers jemand anderes geändert hat und
 * das der Schreiber jetzt anders setzen will. Kommt mit 409 als `details` von `PUT /mappen/{id}`.
 */
export interface Feldkonflikt {
  feld: string;
  label: string;
  /** Was der Schreiber eintragen wollte und was jetzt gilt – lesbar; bei Passwortfeldern leer. */
  deins: string;
  aktuell: string;
  /** Der Wert, der jetzt gilt; fehlt bei Passwortfeldern (`geheim`). */
  wert?: Wert | null;
  geheim?: boolean;
  /** Wer das Feld zuletzt geändert hat (null = das DMS selbst) und wann. */
  von: string | null;
  name: string;
  zeit: string;
}
/**
 * Verweis passt nicht (#887): Die Mappe im Verweisfeld `feld` passt nicht zu den eigenen Feldern `eigeneFelder` – über
 * den Auswahlfilter mit Werten dieser Mappe (#173) oder weil eines davon aus `feld` folgt (#886). Leer und `regel`:
 * passt nur nicht zu den festen Bedingungen des Auswahlfilters. Ein Hinweis, kein Fehler: Speichern bleibt möglich.
 */
export interface Verweiskonflikt {
  feld: string;
  eigeneFelder: string[];
  regel?: boolean;
  ids: string[];
}

export interface Mappenkonflikt {
  /** Aktueller Stand der Mappe – damit noch einmal senden, um die eigenen Werte zu übernehmen. */
  stand: string;
  konflikte: Feldkonflikt[];
}

export interface Historieneintrag {
  id: number;
  mappeId: string;
  zeit: string;
  benutzerId: string | null;
  art: Historienart;
  daten: { aenderungen?: Feldaenderung[]; dokument?: string; feld?: string; text?: string; [k: string]: unknown };
}
