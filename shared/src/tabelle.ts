/**
 * Feldart „Tabelle“ (#1030): Zwischen den Feldern eines Feldregisters zeigt die Mappe die Mappen eines anderen Typs, die
 * über ein Verweisfeld hierher verweisen – etwa die Positionen einer Rechnung – mit den Spalten einer Trefferliste des
 * anderen Typs und „+ Neu“ darunter.
 *
 * - **Kein eigener Wert:** Eine Tabelle ist reine Darstellung wie ein Abschnitt. Sie steht nicht in den Werten einer
 *   Mappe, nicht im Export, nicht in den Feldwerten der Schnittstelle und nicht zur Wahl für Bedingungen, Spalten,
 *   Titel-Vorlage, Erkennung oder „Dokument übernehmen“ ({@link hatWertfeld}).
 * - **Quelle** wie bei einem Verknüpfungsregister: Mappen vom Typ `typId`, die über `feldKey` hierher verweisen; Prüfung
 *   wie dort (das Feld muss auf diesen Typ zeigen) in {@link tabellenProbleme}.
 * - **Rechte:** Zeilen sind Mappen. Gezeigt und gezählt werden nur Mappen, die die Person lesen darf; „+ Neu“ nur, wenn sie
 *   den anderen Typ anlegen darf – der Server prüft beides (Anlegerecht am Zieltyp, Leserecht auf diese Mappe).
 * - **Keine Summen:** Rechnen ist Sache von Paketen (#1034).
 *
 * Eigene Datei ohne Abhängigkeiten zur Laufzeit außer Texten, damit Modell, Server und Oberfläche sie ohne Kreis nutzen.
 */
import type { Feld, Mappentyp, Quelle, Trefferliste } from './model';
import { AUSGANGSSPRACHE, sprache } from './sprache';
import { typName } from './beschriftung';
import { t } from './texte';

/** Quelle einer Tabelle: wie die eines Verknüpfungsregisters, dazu die Beschriftung von „+ Neu“. */
export interface Tabellenquelle extends Quelle {
  /** Beschriftung von „+ Neu“, z. B. „+ Position“ (Ausgangssprache); fehlt = „+ <Name des anderen Typs>“. */
  neu?: string;
}

/** Zeilen je Abruf; danach „weitere anzeigen“. */
export const TABELLE_SEITE = 50;
/** Höchstlänge der Beschriftung von „+ Neu“ (wie im Paketformat). */
export const TABELLE_NEU_MAX = 40;
/** Ab dieser Version kennt Ablago die Feldart Tabelle (#1030). Beim Einreihen auf die Version setzen, mit der sie erscheint. */
export const DMS_TABELLE_AB = '0.232.0';

/** Ist das eine Tabelle (Darstellung ohne eigenen Wert)? */
export const istTabelle = (f: Pick<Feld, 'typ'> | undefined): boolean => f?.typ === 'tabelle';
/**
 * Trägt das Feld einen Wert? Alles außer Tabellen. Für Auswahllisten von Spalten, Bedingungen, Platzhaltern, Export
 * und Schnittstelle – überall, wo es um Werte geht.
 */
export const hatWertfeld = (f: Pick<Feld, 'typ'>): boolean => f.typ !== 'tabelle';
/** Nur die Felder mit Wert (ohne Tabellen). */
export const wertfelder = <F extends Pick<Feld, 'typ'>>(felder: readonly F[]): F[] => felder.filter(hatWertfeld);

/** Die Trefferliste, deren Spalten die Tabelle zeigt: die gewählte, sonst (fehlt sie oder gibt es sie nicht mehr) die Standardliste. */
export function tabellenListe(quelltyp: Pick<Mappentyp, 'trefferlisten' | 'trefferliste'>, key: string | undefined, listen: (t: Pick<Mappentyp, 'trefferlisten' | 'trefferliste'>) => Trefferliste[]): Trefferliste {
  const l = listen(quelltyp);
  return l.find((x) => x.key === key) ?? l.find((x) => x.standard) ?? l[0];
}

/**
 * Spalten der Tabelle: die der Trefferliste ohne Passwortfelder (Ergänzung Sicherheit), Tabellen und ausgeblendete
 * Felder (#655) – Systemspalten (_titel, _erstellt …) bleiben. Ohne Spalten der Titel.
 */
export function tabellenSpalten(quelltyp: Pick<Mappentyp, 'felder' | 'trefferlisten' | 'trefferliste'>, key: string | undefined, listen: (t: Pick<Mappentyp, 'trefferlisten' | 'trefferliste'>) => Trefferliste[]): string[] {
  const spalten = tabellenListe(quelltyp, key, listen).spalten.filter((k) => {
    if (k.startsWith('_')) return true;
    const f = quelltyp.felder.find((x) => x.key === k);
    return !!f && f.typ !== 'passwort' && f.typ !== 'tabelle' && !f.ausgeblendet;
  });
  return spalten.length ? spalten : ['_titel'];
}

/**
 * Probleme der Einstellung einer Tabelle: Typ und Feld gewählt, das Feld verweist hierher (wie die Quelle eines
 * Verknüpfungsregisters), die Trefferliste gibt es, „+ Neu“ nicht zu lang. Leer = in Ordnung.
 */
export function tabellenProbleme(f: Pick<Feld, 'quelle'>, ctx: {
  eigeneId?: string;
  /** Felder und Trefferlisten eines Typs (der eigene über `eigene`), undefined = gibt es nicht. */
  typ: (id: string) => Pick<Mappentyp, 'felder' | 'trefferlisten' | 'trefferliste'> | undefined;
  zielErlaubt: (f: Feld, typId: string | undefined) => boolean;
  listen: (t: Pick<Mappentyp, 'trefferlisten' | 'trefferliste'>) => Trefferliste[];
}): string[] {
  const q = f.quelle;
  if (!q?.typId) return [t('gemeinsam.tabelle.typ-waehlen')];
  const quelltyp = ctx.typ(q.typId);
  if (!quelltyp) return [t('gemeinsam.tabelle.typ-fehlt')];
  if (!q.feldKey) return [t('gemeinsam.tabelle.feld-waehlen')];
  const v = quelltyp.felder.find((x) => x.key === q.feldKey);
  if (!v || v.typ !== 'referenz' || !ctx.zielErlaubt(v, ctx.eigeneId)) return [t('gemeinsam.tabelle.feld-verweist-nicht', { feld: v?.label || q.feldKey })];
  const m: string[] = [];
  if (q.trefferliste && !ctx.listen(quelltyp).some((l) => l.key === q.trefferliste)) m.push(t('gemeinsam.tabelle.liste-fehlt'));
  if (q.neu && q.neu.length > TABELLE_NEU_MAX) m.push(t('gemeinsam.tabelle.neu-zu-lang', { max: TABELLE_NEU_MAX }));
  return m;
}

/**
 * Beschriftung von „+ Neu“ unter der Tabelle (Muster #989): in der Ausgangssprache die eingestellte („+ Position“), in
 * anderen Sprachen ihre Beschriftung (`beschriftungen.<sprache>.neu`) – fehlt eine davon, „+ <Name des anderen Typs>“.
 */
export function tabelleNeuText(f: Pick<Feld, 'quelle' | 'beschriftungen'>, quelltyp: Pick<Mappentyp, 'name' | 'beschriftungen'>, spr = sprache()): string {
  const eigen = spr === AUSGANGSSPRACHE ? f.quelle?.neu : f.beschriftungen?.[spr]?.neu;
  return eigen?.trim() || t('gemeinsam.tabelle.neu', { typ: typName(quelltyp, spr) });
}
