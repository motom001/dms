/**
 * Vorgaben aus Paketen (#1038) – Mappen zum Behalten, nicht zum Wegwerfen.
 *
 * - **Beispiel** (#347): erfundene Daten zum Ausprobieren, auf Wunsch beim Installieren, entfernbar.
 * - **Vorgabe**: übliche Einträge, die zum Paket gehören und bleiben – etwa die Vertragsarten „Strom“, „Miete“ oder
 *   „Versicherung“ aus dem Paket Verträge. Kommen immer mit (keine Wahl), lösen beim Installieren nichts aus (keine
 *   Ereignisse, wie Beispiele, Frage 71) und tragen die Kennzeichnung „aus Paket …“.
 *
 * **Feste Kennung:** `paket:<id>:<schluessel>` an der Mappe (Spalte `vorgabe`). Die Paket-Id gehört dazu – ein Paket
 * findet nur seine eigenen Vorgaben wieder, nie eine Mappe des Administrators oder die Vorgabe eines anderen Pakets,
 * auch bei gleichem Schlüssel (Ergänzung Sicherheit). In Paketinhalten heißt eine Vorgabe wie ein Typverweis: der
 * eigene Schlüssel (`strom`) oder `paket:schluessel` (`vertraege:strom`).
 *
 * **Updates** ergänzen neue Vorgaben und Vorlagen. Eine Vorgabe, die das Paket genau so geschrieben hat, wie sie jetzt
 * ist, bekommt die neue Fassung; hat der Administrator sie geändert, bleibt sie, wie sie ist (höchstens der Hinweis
 * „neue Fassung im Paket“). Gelöschte Vorgaben bleiben gelöscht.
 *
 * **Andere Pakete:** Ein Paket darf Vorgaben auch in Mappentypen eines Pakets liefern, von dem es abhängt (Fahrzeuge →
 * Vertragsart „Pkw-Kaufvertrag“). An eine Vorgabe eines anderen Pakets darf es nur Vorlagen anhängen
 * (`ergaenzt: vertraege:miete`) – keine Felder, keine Rechte; entfernt man es, gehen nur seine Vorlagen mit.
 */
import { TYPVERWEIS } from './kennungen';

/**
 * Ab dieser Version legt Ablago Vorgaben an und versteht die Anzeige-Bedingung „zeigt auf die Vorgabe …“ (#1038).
 * Ältere übergehen `inhalt.vorgaben` und solche Bedingungen. Beim Einreihen auf die Version setzen, mit der es erscheint.
 */
export const DMS_VORGABEN_AB = '0.236.0';
/** Höchstens so viele Vorgaben und Ergänzungen in einem Paket. */
export const VORGABEN_MAX = 200;
/** Höchstens so viele Vorlagen je Vorgabe bzw. Ergänzung. */
export const VORLAGEN_JE_VORGABE_MAX = 20;
/** Text-Vorlagen liegen im Paket unter `inhalt/vorlagen/` und sind Markdown. */
export const VORLAGEN_ORDNER = 'vorlagen/';
export const VORLAGE_ENDUNG = '.md';
/** Pfad einer Vorlage relativ zu inhalt/: vorlagen/, höchstens zwei Ordner, einfache Namen, Endung .md. */
export const VORLAGE_DATEI = /^vorlagen\/(?:[a-z0-9][a-z0-9_-]{0,59}\/){0,2}[a-z0-9][a-z0-9_-]{0,79}\.md$/;
/** Art der Datei in Ablago. */
export const VORLAGE_MIME = 'text/markdown';

/** Feste Kennung einer Vorgabe an der Mappe. */
export const vorgabeKennung = (paket: string, schluessel: string): string => `paket:${paket}:${schluessel}`;
/** Präfix aller Vorgaben eines Pakets. */
export const vorgabePraefix = (paket: string): string => `paket:${paket}:`;
/** Zerlegt `paket:<id>:<schluessel>`; null, wenn es keine Vorgabe-Kennung ist. */
export function teileVorgabe(kennung: string | null | undefined): { paket: string; schluessel: string } | null {
  const m = /^paket:([^:]+):([^:]+)$/.exec(kennung ?? '');
  return m ? { paket: m[1], schluessel: m[2] } : null;
}
/** Verweis auf eine Vorgabe in Paketinhalten: eigener Schlüssel oder `paket:schluessel` – Form wie ein Typverweis. */
export const VORGABEVERWEIS = TYPVERWEIS;
/** Verweis → Paket und Schlüssel (eigene ohne Doppelpunkt gehören dem Paket `eigenes`). */
export function vorgabeVerweis(verweis: string, eigenes: string): { paket: string; schluessel: string } {
  const i = verweis.indexOf(':');
  return i < 0 ? { paket: eigenes, schluessel: verweis } : { paket: verweis.slice(0, i), schluessel: verweis.slice(i + 1) };
}

/** Wert eines Felds, der auf eine Vorgabe zeigt: `{ vorgabe: strom }` bzw. `{ vorgabe: "vertraege:strom" }`. */
export const istVorgabeWert = (w: unknown): w is { vorgabe: string } =>
  !!w && typeof w === 'object' && !Array.isArray(w) && typeof (w as { vorgabe?: unknown }).vorgabe === 'string' && Object.keys(w).length === 1;
/** Alle Vorgabe-Verweise in Feldwerten (auch in Listen). */
export const vorgabeWerte = (werte: Record<string, unknown>): string[] =>
  Object.values(werte).flatMap((w) => (Array.isArray(w) ? w : [w]).filter(istVorgabeWert).map((x) => x.vorgabe));

/**
 * Stand einer Vorlage (Markdown-Dokument) nach dem Installieren: Datei im Paket, Dokument in Ablago und sein Prüfwert.
 * Ein Update ersetzt sie nur, solange das Dokument noch genau so ist.
 */
export interface VorlageStand { datei: string; dokument: string; sha256: string }
/** Was ein Paket über eine seiner Vorgaben weiß (Eintrag des installierten Pakets, `vorgaben`). */
export interface VorgabeStand {
  /** Mappe in Ablago. */
  mappe: string;
  /** Prüfwert der Feldwerte, wie das Paket sie zuletzt geschrieben hat – anders heißt: vom Administrator geändert. */
  stand: string;
  /** Prüfwert der Werte im Paket (diese Fassung) – ändert er sich, hat das Paket eine neue Fassung. */
  fassung: string;
  /** Vom Administrator gelöscht: Ein Update legt sie nicht wieder an. */
  geloescht?: boolean;
  /** Vorlagen des Pakets an dieser Vorgabe. */
  vorlagen?: VorlageStand[];
}
/** Vorlagen, die ein Paket an eine Vorgabe eines anderen Pakets angehängt hat (`ergaenzt`). */
export interface ErgaenzungStand { ziel: string; mappe: string; vorlagen: VorlageStand[] }

/**
 * Was eine Installation bzw. ein Update mit einer Vorgabe tut (Vorschau):
 * neu – wird angelegt; gleich – bleibt (nichts Neues); aktualisiert – unverändert, bekommt die neue Fassung;
 * geaendert – vom Administrator geändert, bleibt so; geloescht – gelöscht, kommt nicht wieder; uebernommen – gibt es
 * schon (von einer früheren Installation stehen geblieben), wird wieder aufgenommen, ohne sie zu ändern.
 */
export type VorgabeZustand = 'neu' | 'gleich' | 'aktualisiert' | 'geaendert' | 'geloescht' | 'uebernommen';
export interface VorgabePlan {
  schluessel: string;
  /** Name, wie die Mappe heißen wird bzw. heißt. */
  name: string;
  /** Mappentyp (Name). */
  typ: string;
  /** Mappentyp eines anderen Pakets: dessen Name – sonst null. */
  fremd: string | null;
  zustand: VorgabeZustand;
  /** geaendert: Das Paket bringt eine neue Fassung mit, die Ablago nicht übernimmt. */
  neueFassung?: boolean;
  /** Vorlagen, die mit dieser Installation bzw. diesem Update dazukommen. */
  vorlagen: number;
}
/** Vorlagen an eine Vorgabe eines anderen Pakets (Vorschau). */
export interface ErgaenzungPlan {
  /** `paket:schluessel` der Vorgabe. */
  ziel: string;
  /** Name der Mappe; fehlt sie (gelöscht), der Schlüssel. */
  name: string;
  /** Paket, dem die Vorgabe gehört (Name). */
  paket: string;
  /** Vorlagen, die dazukommen. */
  vorlagen: number;
  /** Die Vorgabe gibt es nicht (mehr): Die Vorlagen kommen nicht. */
  fehlt?: boolean;
}

/**
 * Ist die Mappe eine Vorgabe eines anderen Pakets als `paketId`? Dann ändert das Paket sie nicht, löscht sie nicht und
 * löscht keine Dokumente daran (Ergänzung Sicherheit) – auch nicht mit Schreibrecht am Mappentyp.
 */
export const fremdeVorgabe = (m: { vorgabe?: string | null } | undefined, paketId: string): boolean => {
  const v = teileVorgabe(m?.vorgabe);
  return !!v && v.paket !== paketId;
};

/** Herkunft an der Mappe (GET /mappen/{id}): Vorgabe aus Paket … – eine Kennzeichnung wie bei Paket-Hinweisen. */
export interface VorgabeHerkunft { paket: string; paketName: string }

/** Vorgaben, die eine Paket-Entfernung stehen lässt oder erst nach Rückfrage mitnimmt (Antwort 409, `vorgaben`). */
export interface VorgabeFrage { id: string; titel: string; typ: string }
