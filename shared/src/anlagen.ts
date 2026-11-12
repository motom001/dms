/**
 * Anlagen (#998): Ein Dokument kann Anlagen haben – die Werkstattrechnung als Hauptdokument, dahinter HU/AU-Protokoll,
 * Auflistung der Arbeiten und Teilebestellung als „Anlage 1, 2, 3“. Jede Anlage ist ein eigenes Dokument (eigene Datei
 * mit Versionen, Volltext, Archivfassung, Stempel) in derselben Mappe und demselben Register wie ihr Hauptdokument und
 * wandert mit ihm (Post → Mappe, verschieben, Papierkorb, Wiederherstellen). Rechte gelten wie beim Hauptdokument – es
 * ist dieselbe Mappe.
 *
 * Erkennung, Klassifizieren und KI (#939) nutzen nur Hauptdokumente: AGB, Preislisten und Protokolle stören das Auslesen
 * nicht. Die Volltextsuche findet Anlagen mit dem Vermerk „in Anlage 2“. Reine Funktionen für Server und Oberfläche,
 * ohne Abhängigkeiten zur Laufzeit außer den Texten.
 */
import { t } from './texte';

/** Ab dieser Version kennt Ablago Anlagen (#998) und die Schnittstelle `dms:anlagen`; ältere lehnen sie beim Installieren ab. */
export const DMS_ANLAGEN_AB = '0.263.0';
/** Höchstens so viele Anlagen je Hauptdokument (ein Sammelscan mit Trennblättern hat selten mehr als eine Handvoll). */
export const ANLAGEN_MAX = 99;

/** Was die Funktionen hier von einem Dokument brauchen. */
export interface AnlageTeil { id: string; name: string; anlageZu?: string | null; anlageNr?: number | null }

/** Ist das eine Anlage (hängt an einem Hauptdokument)? */
export const istAnlage = (d: Pick<AnlageTeil, 'anlageZu'>): boolean => !!d.anlageZu;

/** Die Anlagen eines Dokuments aus einer Liste, in ihrer Reihenfolge (Anlage 1 zuerst). */
export function anlagenVon<T extends AnlageTeil>(alle: readonly T[], id: string): T[] {
  return alle.filter((d) => d.anlageZu === id).sort((a, b) => (a.anlageNr ?? 0) - (b.anlageNr ?? 0) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

/**
 * Hauptdokumente mit ihren Anlagen darunter, in der Reihenfolge der Liste. Eine Anlage, deren Hauptdokument nicht in der
 * Liste steht (anderes Register, gefiltert), steht als eigene Zeile da – sie geht nie verloren.
 */
export function gruppiere<T extends AnlageTeil>(liste: readonly T[]): Array<{ haupt: T; anlagen: T[] }> {
  const ids = new Set(liste.map((d) => d.id));
  return liste.filter((d) => !d.anlageZu || !ids.has(d.anlageZu)).map((haupt) => ({ haupt, anlagen: anlagenVon(liste, haupt.id) }));
}

/** Nur Hauptdokumente und eigene Dokumente – ohne Anlagen (für Erkennung, Klassifizieren und KI). */
export const nurHauptdokumente = <T extends Pick<AnlageTeil, 'anlageZu'>>(liste: readonly T[]): T[] => liste.filter((d) => !d.anlageZu);

/**
 * Die Auswahl samt Anlagen: hinter jedem gewählten Hauptdokument seine Anlagen, jedes Dokument einmal. `mitAnlagen`
 * false: nur, was gewählt ist („mit Anlagen?“ beim Herunterladen und Weitergeben, Vorgabe ja).
 */
export function mitAnlagen<T extends AnlageTeil>(auswahl: readonly T[], alle: readonly T[], an = true): T[] {
  const erg: T[] = [];
  const drin = new Set<string>();
  const nimm = (d: T) => { if (!drin.has(d.id)) { drin.add(d.id); erg.push(d); } };
  for (const d of auswahl) {
    nimm(d);
    if (an) for (const a of anlagenVon(alle, d.id)) nimm(a);
  }
  return erg;
}

/**
 * Was beim Verschieben einer Auswahl wirklich bewegt wird: Hauptdokumente und eigene Dokumente – ihre Anlagen wandern
 * mit (Repo). `allein`: gewählte Anlagen, deren Hauptdokument nicht gewählt ist (der Dienst lehnt das ab).
 */
export function zumVerschieben<T extends AnlageTeil>(auswahl: readonly T[]): { bewegen: T[]; allein: T[] } {
  const ids = new Set(auswahl.map((d) => d.id));
  return { bewegen: auswahl.filter((d) => !d.anlageZu), allein: auswahl.filter((d) => !!d.anlageZu && !ids.has(d.anlageZu)) };
}

/** Name und Endung einer Datei: „Rechnung.pdf“ → [„Rechnung“, „.pdf“]. */
export function stammUndEndung(name: string): [string, string] {
  const p = name.lastIndexOf('.');
  return p > 0 && name.length - p <= 6 ? [name.slice(0, p), name.slice(p)] : [name, ''];
}

/** „Anlage 2“ in der Sprache der Oberfläche. */
export const anlageText = (nr: number): string => t('gemeinsam.anlagen.anlage', { nr });

/**
 * Vorgabe-Name einer Anlage (#998): „<Name des Dokuments> – Anlage 1“ mit der Endung der Anlage selbst
 * („Werkstattrechnung – Anlage 1.pdf“). Umbenennen lässt sie sich jederzeit.
 */
export function anlageName(hauptName: string, nr: number, endungVon = hauptName): string {
  const [stamm] = stammUndEndung(hauptName);
  const [, endung] = stammUndEndung(endungVon);
  return `${stamm} – ${anlageText(nr)}${endung}`.slice(0, 200);
}

/**
 * Name einer Anlage im WebDAV-Laufwerk (#998): neben dem Hauptdokument mit Namenszusatz „– Anlage n“, damit sie
 * dort steht, wo sie hingehört. Trägt die Anlage schon den Vorgabe-Namen, bleibt er; sonst kommt ihr eigener Name
 * hinter den Zusatz („Werkstattrechnung – Anlage 1 – HU-Protokoll.pdf“).
 */
export function laufwerkName(hauptName: string, anlage: AnlageTeil): string {
  const nr = anlage.anlageNr ?? 1;
  const vorgabe = anlageName(hauptName, nr, anlage.name);
  if (anlage.name === vorgabe) return vorgabe;
  const [stamm] = stammUndEndung(hauptName);
  return `${stamm} – ${anlageText(nr)} – ${anlage.name}`.slice(0, 200);
}

/** Vermerk an einem Treffer der Volltextsuche: „in Anlage 2“ (#998). */
export const anlageVermerk = (nr: number): string => t('gemeinsam.anlagen.in-anlage', { nr });
