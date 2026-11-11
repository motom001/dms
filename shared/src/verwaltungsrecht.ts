/**
 * Verwaltungsrecht an der Person (#818) und Verwaltungsmodus (#819) – kein Kontotyp „Administrator“ mehr.
 *
 * Verwalten ist ein Recht an einer **Person**, keine Rolle: entweder „Gesamte Verwaltung“ (`GESAMT`, schließt auch
 * künftige Bereiche ein) oder eine Auswahl der Werkbank-Bereiche der ersten Ebene (`BEREICHE`, Kennung = Pfad unter
 * /werkbank). Wer einen Bereich darf, darf alles darunter. Die Übersicht /werkbank sieht jeder, der verwalten darf.
 *
 * Gebraucht wird das Recht nur im **Verwaltungsmodus**: Er beginnt mit einer erneuten Anmeldung über das Benutzermenü
 * („Ablago verwalten“), endet nach `MODUS_MINUTEN` ohne Aktivität oder mit „Verwaltung beenden“ und ist ein Zustand
 * der Sitzung auf dem Server. Ohne Modus arbeitet auch eine Person mit Verwaltungsrecht wie alle anderen.
 *
 * Die Aufteilung schafft Ordnung und schützt vor Versehen, nicht vor Absicht: Bereiche mit einem Umweg zu allen Daten
 * tragen das Warnzeichen „Gibt Zugriff auf alle Daten“ (`HEIKLE_BEREICHE`). Eine echte Grenze ist nur „Verwaltungsrechte
 * vergeben“ und das Ändern der Konten von Verwaltenden – das darf nur „Gesamte Verwaltung“.
 */
import { BEREICHE, GRUPPEN, type Gruppe } from './werkbankansicht';

/** „Gesamte Verwaltung“: alle Bereiche, auch künftige. */
export const GESAMT = '*';

/** Gespeichertes Verwaltungsrecht einer Person: `[]` = darf nicht verwalten, `['*']` = Gesamte Verwaltung. */
export type Verwaltungsrecht = string[];

/** Der Verwaltungsmodus endet nach so vielen Minuten ohne Aktivität (#819). */
export const MODUS_MINUTEN = 15;
/** So lange gilt eine Anmeldung bzw. erneute Anmeldung als frisch (#819): kein weiteres Nachfragen. */
export const FRISCH_MINUTEN = 10;

/** Bereiche mit Umweg zu allen Daten (#818, Frage 8 von Sicherheit): Warnzeichen „Gibt Zugriff auf alle Daten“. */
export const HEIKLE_BEREICHE: ReadonlySet<string> = new Set([
  // Verschlüsselung (Schlüssel, Notfallblatt), Datenbank-Anbindung, Sicherung mit Wiederherstellen, Vollexport;
  // dazu die Bereiche mit Umweg: Mappentypen (Regeln), Pakete, Automatisierungen, E-Mail-Versand (Betrieb),
  // Anmeldung über Anbieter (Anmeldeschutz).
  'verschluesselung', 'anbindung', 'sicherung', 'vollexport', 'typen', 'pakete', 'automatisierungen', 'betrieb', 'anmeldeschutz',
]);

/**
 * Handlungen, für die immer eine frische Anmeldung nötig ist (#819, Frage 7 von Sicherheit). Danach gilt sie
 * `FRISCH_MINUTEN`. Die Zuordnung zu Schnittstellen steht im Server (`verwaltungsbereiche.ts`).
 */
export type HeikleHandlung = 'rechte' | 'schluessel' | 'vollexport' | 'wiederherstellen' | 'anbindung' | 'anbieter' | 'mailversand' | 'notfall';

/**
 * Bereiche nur für „Gesamte Verwaltung“: Sie lassen sich nicht einzeln vergeben. Nutzung (#1032) ändert, was alle
 * Mappentypen zeigen und mit welcher Vorlage die Werkbank startet – das gehört zur ganzen Verwaltung.
 */
export const NUR_GESAMT_BEREICHE: ReadonlySet<string> = new Set(['nutzung']);

const BEKANNT = new Set(BEREICHE.map((b) => b.pfad).filter((p) => !NUR_GESAMT_BEREICHE.has(p)));

/** Bereinigt eine Eingabe: nur bekannte Bereiche, ohne Doppelte; „Gesamte Verwaltung“ steht allein. */
export function liesVerwaltung(v: unknown): Verwaltungsrecht {
  if (!Array.isArray(v)) return [];
  const x = v.filter((s): s is string => typeof s === 'string');
  if (x.includes(GESAMT)) return [GESAMT];
  return BEREICHE.map((b) => b.pfad).filter((p) => BEKANNT.has(p) && x.includes(p));
}

type MitRecht = { verwaltung?: Verwaltungsrecht | null; art?: string } | null | undefined;

/** Darf die Person überhaupt verwalten (Haken „Darf Ablago verwalten“)? Dienst- und Systemkonten nie. */
export const darfVerwalten = (b: MitRecht): boolean => !!b && !b.art && (b.verwaltung?.length ?? 0) > 0;
/** Hat die Person „Gesamte Verwaltung“? */
export const hatGesamt = (b: MitRecht): boolean => !!b && !b.art && !!b.verwaltung?.includes(GESAMT);

/**
 * Darf die Person diesen Bereich (Pfad der ersten Ebene unter /werkbank)? Die Übersicht darf jeder, der verwalten darf;
 * ein unbekannter oder nicht zugeordneter Bereich nur „Gesamte Verwaltung“ (Vorgabe „nein“).
 */
export function darfBereich(b: MitRecht, pfad: string): boolean {
  if (!darfVerwalten(b)) return false;
  if (hatGesamt(b)) return true;
  if (pfad === 'uebersicht') return true;
  return BEKANNT.has(pfad) && b!.verwaltung!.includes(pfad);
}

/** Bereiche, die die Person sieht (für Leiste und Übersicht); `null` = alle. */
export const eigeneBereiche = (b: MitRecht): Set<string> | null => (hatGesamt(b) ? null : new Set(darfVerwalten(b) ? b!.verwaltung! : []));

/** Der Baum für Werkbank → Benutzer → Person (#818): Gruppen gliedern nur, Haken gibt es je Bereich. */
export interface Verwaltungsast { gruppe: Gruppe; name: string; bereiche: Array<{ pfad: string; heikel: boolean }> }
export function verwaltungsbaum(): Verwaltungsast[] {
  const aeste = new Map<Gruppe, Verwaltungsast>();
  for (const b of BEREICHE) {
    if (NUR_GESAMT_BEREICHE.has(b.pfad)) continue;
    const ast = aeste.get(b.gruppe) ?? { gruppe: b.gruppe, name: GRUPPEN[b.gruppe], bereiche: [] };
    ast.bereiche.push({ pfad: b.pfad, heikel: HEIKLE_BEREICHE.has(b.pfad) });
    aeste.set(b.gruppe, ast);
  }
  return [...aeste.values()];
}

/** Vorher/Nachher fürs Protokoll (#818): lesbar, „Gesamte Verwaltung“ als `*`. */
export const verwaltungText = (v: Verwaltungsrecht | undefined | null) => (!v?.length ? '–' : v.join(', '));

/** Gleich, unabhängig von der Reihenfolge? */
export const gleicheVerwaltung = (a: Verwaltungsrecht | undefined | null, b: Verwaltungsrecht | undefined | null) =>
  [...(a ?? [])].sort().join(',') === [...(b ?? [])].sort().join(',');

/** Stand des Verwaltungsmodus für die Oberfläche (#819), aus `GET /api/konto/status`. */
export interface Verwaltungsstand {
  /** Darf die Person verwalten? Sonst gibt es den Menüeintrag nicht. */
  darf: boolean;
  /** Läuft der Modus in dieser Sitzung? */
  aktiv: boolean;
  /** Bis wann er ohne Aktivität läuft (ISO), nur wenn aktiv. */
  bis: string | null;
  /** Wiedereinstieg mit einem Klick möglich: heute in diesem Browser schon bestätigt (#819, F3). */
  heuteBestaetigt: boolean;
  /** Liegt die Anmeldung höchstens `FRISCH_MINUTEN` zurück? Dann ohne erneute Abfrage. */
  frisch: boolean;
  /** Ist für die erneute Anmeldung ein Code nötig (Zwei-Faktor eingerichtet)? */
  code: boolean;
  /** Hat die Person ein Passwort? Ohne (nur Anbieter) geht die erneute Anmeldung über den Anbieter. */
  passwort: boolean;
  /** Geht die erneute Anmeldung auch mit einem Passkey (#811)? Nur, wenn einer zur Adresse passt (HTTPS). */
  passkey?: boolean;
  /** Eigene Bereiche; `null` = Gesamte Verwaltung. */
  bereiche: string[] | null;
}
