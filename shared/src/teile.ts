/**
 * „Ist Teil einer anderen Mappe“ (#1031): Mappen eines Typs mit dieser Einstellung gehören immer zu einer anderen Mappe –
 * etwa eine Rechnungsposition zu ihrer Rechnung. Sie heißen **Teile**, die andere die **übergeordnete Mappe**
 * (Glossar). Am Mappentyp steht dafür die Kennung des Verweisfelds, über das sie dazugehören (`teilVon`).
 *
 * - **Wo sie erscheinen:** nur an der übergeordneten Mappe (Feldart Tabelle, Verknüpfungsregister) und über einen direkten
 *   Link – nicht in Ansichten, Trefferlisten über mehrere Typen, „Zuletzt geöffnet“, Volltext und erweiterter Suche, nicht
 *   unter „+ Neu“ und nicht bei „Wohin gehört das?“. Der Typ bekommt keine eigene Ansicht.
 * - **Suche:** Was in einem Teil steht, ist ein Treffer der übergeordneten Mappe („gefunden in Rechnungsposition …“) –
 *   nur, wenn die Person beide lesen darf (sonst wird die Suche zum Orakel, Ergänzung Sicherheit).
 * - **Kein Schutz:** Ausblenden ist Ordnung. Über die Schnittstelle, den Export, die Sicherung und direkte Links bleiben
 *   Teile erreichbar; geschützt wird über Rechte. Die Leserechte der übergeordneten Mappe übernimmt der Typ einmal beim
 *   Einschalten als Vorgabe – spätere Änderungen dort gelten nicht von selbst mit.
 * - **Löschen:** Wird die übergeordnete Mappe gelöscht, gehen ihre Teile mit (ein Vorgang im Papierkorb); wiederhergestellt
 *   ebenso. Fehlt das Recht an einem Teil, lehnt Ablago ab und nennt die Anzahl.
 *
 * Ohne Abhängigkeiten zur Laufzeit außer Texten und Verweiszielen, damit Modell, Server und Oberfläche sie ohne Kreis nutzen.
 */
import type { Feld, Mappentyp, MappentypDaten, Werte } from './model';
import type { Regel, Regelwerk } from './rechte';
import { einzigesZiel, jedeMappe, zieleVon } from './verweisziele';
import { t } from './texte';

type MitTeil = Pick<MappentypDaten, 'teilVon' | 'felder'>;

/** Ab dieser Version kennt Ablago „Ist Teil einer anderen Mappe“ (#1031). Beim Einreihen auf die Version setzen, mit der es erscheint. */
export const DMS_TEILE_AB = '0.235.0';

/** Ist das ein Typ, dessen Mappen immer zu einer anderen gehören? */
export const istTeiltyp = (typ: Pick<MappentypDaten, 'teilVon'> | undefined | null): boolean => !!typ?.teilVon;

/** Das Verweisfeld, über das die Mappen dieses Typs zu ihrer übergeordneten Mappe gehören; undefined = eigenständig. */
export const teilFeld = (typ: MitTeil | undefined | null): Feld | undefined =>
  (typ?.teilVon ? typ.felder.find((f) => f.key === typ.teilVon && f.typ === 'referenz') : undefined);

/** Id des Typs der übergeordneten Mappen (der eine Zieltyp des Felds). */
export const uebergeordneterTyp = (typ: MitTeil | undefined | null): string | undefined => {
  const f = teilFeld(typ);
  return f ? einzigesZiel(f) : undefined;
};

/** Id der übergeordneten Mappe aus den Werten eines Teils; null, wenn (noch) keine eingetragen ist. */
export function uebergeordneteId(typ: MitTeil | undefined | null, werte: Werte | undefined): string | null {
  const f = teilFeld(typ);
  const v = f && werte ? werte[f.key] : null;
  return typeof v === 'string' && v ? v : null;
}

/** Ids der Typen mit „Ist Teil einer anderen Mappe“. */
export function teiltypen(typen: Iterable<Pick<Mappentyp, 'id' | 'teilVon'>>): Set<string> {
  const s = new Set<string>();
  for (const x of typen) if (x.teilVon) s.add(x.id);
  return s;
}

/** Ohne Teiltypen: für Ansichten, „+ Neu“, „Wohin gehört das?“, Auswahl in der erweiterten Suche. */
export const ohneTeiltypen = <T extends Pick<MappentypDaten, 'teilVon'>>(typen: T[]): T[] => typen.filter((x) => !istTeiltyp(x));

/** Teiltypen, deren Mappen zu Mappen vom Typ `id` gehören (Tabelle „Positionen“ an der Rechnung, Löschen, Suche). */
export const teiltypenVon = <T extends Pick<Mappentyp, 'id' | 'teilVon' | 'felder'>>(typen: Iterable<T>, id: string): T[] =>
  [...typen].filter((x) => x.id !== id && uebergeordneterTyp(x) === id);

/** Was der Prüfung über andere Typen bekannt ist. */
export interface TeilKontext {
  eigeneId?: string;
  /** Systemtyp (Benutzer, Rolle, Post) – die gehören nie zu einer anderen Mappe. */
  system?: string | null;
  /** Ein anderer Mappentyp. */
  typVon(id: string): Pick<Mappentyp, 'name' | 'teilVon' | 'system'> | undefined;
  /** Namen der Typen, die ihrerseits Teil von Mappen dieses Typs sind. */
  teiltypenAuf(id: string): string[];
}

/** Das Ziel des Felds: genau ein anderer Typ, kein Systemtyp, selbst kein Teil. */
function zielProbleme(f: Feld, name: string, ctx: TeilKontext): string[] {
  const ziele = zieleVon(f);
  if (jedeMappe(f) || ziele.length !== 1 || f.zielOptional?.length) return [t('gemeinsam.teile.ein-zieltyp', { feld: name })];
  if (ziele[0] === ctx.eigeneId) return [t('gemeinsam.teile.nicht-sich-selbst', { feld: name })];
  const ziel = ctx.typVon(ziele[0]);
  if (ziel?.system) return [t('gemeinsam.teile.nicht-zu-system', { typ: ziel.name })];
  if (ziel?.teilVon) return [t('gemeinsam.teile.keine-kette', { typ: ziel.name })];
  return [];
}

/**
 * Warum die Einstellung so nicht geht (leer = in Ordnung): Das Feld ist ein Verweis auf genau einen anderen Mappentyp, eine
 * Mappe, Pflicht und immer zu sehen. Keine Ketten: Der übergeordnete Typ ist selbst kein Teil, und ein Typ mit eigenen
 * Teilen wird keiner (sonst müssten Suche und Löschen über mehrere Stufen gehen). Nie an Systemtypen.
 */
export function teilProbleme(d: MitTeil & Pick<MappentypDaten, 'register'>, ctx: TeilKontext): string[] {
  if (!d.teilVon) return [];
  if (ctx.system) return [t('gemeinsam.teile.nicht-bei-system')];
  const f = d.felder.find((x) => x.key === d.teilVon);
  if (!f || f.typ !== 'referenz') return [t('gemeinsam.teile.feld-waehlen')];
  const name = f.label || f.key;
  const p = zielProbleme(f, name, ctx);
  if (f.mehrfach) p.push(t('gemeinsam.teile.eine-mappe', { feld: name }));
  if (!f.pflicht) p.push(t('gemeinsam.teile.pflicht', { feld: name }));
  if (f.ausgeblendet || f.anzeigen || d.register.some((r) => r.ausgeblendet && r.felder?.includes(f.key))) p.push(t('gemeinsam.teile.sichtbar', { feld: name }));
  const eigene = ctx.eigeneId ? ctx.teiltypenAuf(ctx.eigeneId) : [];
  if (eigene.length) p.push(t('gemeinsam.teile.hat-teile', { typen: eigene.join(', ') }));
  return p;
}

/**
 * Leserechte der übergeordneten Mappe als Vorgabe (#1031, Ergänzung Sicherheit): beim Einschalten **übernommen**, nicht
 * verbunden. Übernommen werden die Grundeinstellung „Lesen“ und jede Regel, die Lesen erteilt oder entzieht – nur mit ihrer
 * Wirkung auf Lesen. Eine Regel, deren Bedingungen sich nicht vollständig übertragen lassen (Feld fehlt am Teil), kommt
 * nicht mit; sie wird gezählt, damit der Editor darauf hinweisen kann. Die übrigen Rechte bleiben, wie sie am Teil sind.
 */
export function leserechteAus(
  eltern: Regelwerk,
  eigen: Regelwerk,
  passt: (r: Regel) => Regel | null,
): { regelwerk: Regelwerk; ausgelassen: number } {
  let ausgelassen = 0;
  const regeln = eltern.regeln.filter((r) => r.dann.R).flatMap((r) => {
    const k = passt({ ...r, dann: { R: r.dann.R } });
    if (!k) { ausgelassen++; return []; }
    return [k];
  });
  return { regelwerk: { grund: { ...eigen.grund, R: eltern.grund.R }, regeln: [...regeln, ...eigen.regeln] }, ausgelassen };
}

/**
 * Ist ein Verweis von einer Mappe des Typs `quelle` über `feldKey` die Zugehörigkeit eines Teils zu seiner übergeordneten
 * Mappe (#1031)? Grundlage fürs Löschen und Wiederherstellen samt Teilen.
 */
export const istTeilVerweis = (quelle: MitTeil | undefined | null, feldKey: string): boolean =>
  !!quelle?.teilVon && quelle.teilVon === feldKey && !!teilFeld(quelle);
