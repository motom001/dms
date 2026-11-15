/**
 * Erwähnen mit @ (#889): Jede Mappe lässt sich erwähnen, ein Benutzer ist der Sonderfall mit Konto. Gespeichert wird
 * `@[Titel](mappe:<id>)`; `benutzer:<id>` aus älteren Notizen gilt weiter.
 *
 * - **Vorschläge** nach `@`: nur lesbare Mappen, Favoriten zuerst; bei gleichem Typ und Titel die erste Spalte der
 *   Trefferliste als Zusatz. Benutzer kennt die Oberfläche schon (lesbare Personen) und stellt sie selbst nach oben.
 * - **Verweise**: aktueller Titel und Typ erwähnter Mappen, die die Person lesen darf – sonst nur „verborgen“ bzw.
 *   „gelöscht“ wie bei der Sichtbarkeit (#888).
 * - **Übersicht einer Mappe** (auch API v1): wo sie erwähnt ist (nur Stellen in Mappen, die die Person lesen darf) und
 *   wen oder was sie selbst erwähnt.
 */
import { Fachfehler } from './fehler';
import { t } from './sprache';
import { istUuid } from './repo';
import { erwaehnungen } from '../../shared/src/markdown';
import { SICHTBARKEIT_MAX, type Sichtbarkeit } from '../../shared/src/sichtbarkeit';
import type { Mappe, Mappentyp } from '../../shared/src/model';
import type { Kern, Zugriff } from './kern';
import type { FavoritErwaehntMerk } from '../../shared/src/erwaehnen';
import type { FavoritErwaehntZeile } from './aufgabenmail';
import type { ZugriffDienst } from './zugriff';

/** Höchstens so viele Vorschläge nach `@` (ohne Benutzer). */
export const VORSCHLAEGE_MAX = 8;
/** Höchstens so viele Hinweise „Erwähnt in …“ je Mappe. */
export const ERWAEHNT_IN_MAX = 20;

export interface ErwaehnungsVorschlag { id: string; titel: string; typId: string; favorit: boolean; zusatz?: string }
export interface Verweis { sichtbarkeit: Sichtbarkeit; titel?: string; typId?: string }
/** Hinweis in der erwähnten Mappe: Stelle in einer anderen Mappe (Notiz oder formatiertes Feld mit Beschriftung). */
export interface ErwaehntIn { mappeId: string; titel: string; typId: string; stelle: 'notiz' | 'feld'; feld?: string; am: string }
export interface ErwaehnungsUebersicht { erwaehnt: Array<Verweis & { id: string }>; erwaehntIn: ErwaehntIn[] }

/** Erste Spalte der Standard-Trefferliste, die ein Feld ist (für gleich benannte Mappen eines Typs). */
function ersteSpalte(typ: Mappentyp | undefined, m: Mappe): string | undefined {
  const spalten = typ?.trefferlisten?.find((l) => l.standard)?.spalten ?? typ?.trefferliste ?? [];
  const key = spalten.find((s) => !s.startsWith('_'));
  const w = key ? m.werte[key] : undefined;
  return typeof w === 'string' || typeof w === 'number' ? String(w).slice(0, 80) : undefined;
}

export class MappenErwaehnungen {
  constructor(private readonly kern: Kern, private readonly rechte: ZugriffDienst) {}

  private get repo() { return this.kern.repo; }

  /**
   * Vorschläge nach `@` (ohne Benutzer): Treffer im Titel bzw. ohne Suchbegriff die Favoriten und zuletzt geöffneten.
   * Reihenfolge: Favoriten, dann zuletzt verwendete (`zuletzt`: lesbare zuletzt geöffnete, neueste zuerst), dann der Rest.
   */
  async vorschlaege(z: Zugriff, roh: unknown, zuletzt: Array<{ id: string; typId: string; titel: string }> = []): Promise<ErwaehnungsVorschlag[]> {
    const { benutzer } = await this.kern.system();
    const suche = typeof roh === 'string' ? roh.trim().slice(0, 80) : '';
    const typen = [...z.typen.values()].filter((x) => x.id !== benutzer.id).map((x) => x.id);
    if (!typen.length) return [];
    const { mappen } = suche
      ? await this.repo.seite({ klauseln: [{ typen, filter: [] }], suche, von: 0, anzahl: 30, lesen: z.lesen })
      : await this.repo.seite({ favoriten: { benutzerId: z.ich.id }, von: 0, anzahl: 30, lesen: z.lesen });
    const kurz = (x: { id: string; typId: string; titel: string }) => ({ id: x.id, typId: x.typId, titel: x.titel, werte: {} }) as unknown as Mappe;
    const dazu = suche ? [] : zuletzt.filter((x) => !mappen.some((m) => m.id === x.id)).map(kurz);
    const liste = [...mappen, ...dazu].filter((m) => m.typId !== benutzer.id);
    const fav = await this.repo.favoritenVon(z.ich.id, liste.map((m) => m.id));
    const rang = (id: string) => { const i = zuletzt.findIndex((x) => x.id === id); return i < 0 ? zuletzt.length : i; };
    const sortiert = [...liste].sort((a, b) => Number(fav.has(b.id)) - Number(fav.has(a.id)) || rang(a.id) - rang(b.id)).slice(0, VORSCHLAEGE_MAX);
    const gleich = (m: Mappe) => sortiert.filter((x) => x.typId === m.typId && (x.titel ?? '') === (m.titel ?? '')).length > 1;
    return sortiert.map((m) => {
      const zusatz = gleich(m) ? ersteSpalte(z.typen.get(m.typId), m) : undefined;
      return { id: m.id, titel: m.titel ?? '', typId: m.typId, favorit: fav.has(m.id), ...(zusatz ? { zusatz } : {}) };
    });
  }

  /** Aktueller Titel und Typ erwähnter Mappen (Anzeige); nicht lesbar: nur „verborgen“, gelöscht: „geloescht“. */
  async verweise(z: Zugriff | undefined, roh: unknown): Promise<Record<string, Verweis>> {
    const s = await this.rechte.sichtbarkeit(z, Array.isArray(roh) ? roh.slice(0, SICHTBARKEIT_MAX) : []);
    const sichtbar = Object.keys(s).filter((id) => s[id] === 'sichtbar');
    const b = sichtbar.length ? await this.repo.bezuege(sichtbar) : new Map<string, { titel: string; typId: string }>();
    return Object.fromEntries(Object.entries(s).map(([id, x]): [string, Verweis] => {
      const m = x === 'sichtbar' ? b.get(id) : undefined;
      return [id, m ? { sichtbarkeit: 'sichtbar', titel: m.titel, typId: m.typId } : { sichtbarkeit: x === 'sichtbar' ? 'geloescht' : x }];
    }));
  }

  /** Wo eine Mappe erwähnt ist und was sie selbst erwähnt – nur, was die Person lesen darf. */
  async uebersicht(z: Zugriff, mappeId: string): Promise<ErwaehnungsUebersicht> {
    const m = istUuid(mappeId) ? await this.repo.holeMappe(mappeId) : undefined;
    if (!m || !(await this.rechte.lesbare(z, [m.id])).has(m.id)) throw new Fachfehler(404, t('meldungen.dienst.diese-mappe-gibt-es'));
    return { erwaehntIn: await this.erwaehntIn(z, m.id), erwaehnt: await this.erwaehnt(z, m) };
  }

  private async erwaehntIn(z: Zugriff, mappeId: string): Promise<ErwaehntIn[]> {
    const stellen = await this.repo.erwaehntIn(mappeId);
    const ids = [...new Set(stellen.map((x) => x.mappeId))];
    if (!ids.length) return [];
    const lesbar = await this.rechte.lesbare(z, ids);
    const b = await this.repo.bezuege(ids.filter((id) => lesbar.has(id)));
    const erg: ErwaehntIn[] = [];
    for (const x of stellen) {
      const q = b.get(x.mappeId);
      if (!q || !lesbar.has(x.mappeId)) continue;
      if (x.stelle.startsWith('notiz:')) { erg.push({ mappeId: x.mappeId, titel: q.titel, typId: q.typId, stelle: 'notiz', am: x.am }); continue; }
      // Nur formatierte Felder: Erwähnungen gibt es nur dort.
      const f = z.typen.get(q.typId)?.felder.find((y) => y.key === x.stelle && y.typ === 'formatiert');
      if (f) erg.push({ mappeId: x.mappeId, titel: q.titel, typId: q.typId, stelle: 'feld', feld: f.label, am: x.am });
    }
    return erg.sort((a, b2) => b2.am.localeCompare(a.am)).slice(0, ERWAEHNT_IN_MAX);
  }

  private async erwaehnt(z: Zugriff, m: Mappe): Promise<Array<Verweis & { id: string }>> {
    const typ = z.typen.get(m.typId);
    const texte = [...(await this.repo.notizen(m.id)).map((n) => n.text), ...(typ?.felder ?? []).filter((f) => f.typ === 'formatiert').map((f) => String(m.werte[f.key] ?? ''))];
    const ids = [...new Set(texte.flatMap((x) => erwaehnungen(x)))].filter((id) => id !== m.id);
    const v = await this.verweise(z, ids);
    return ids.filter((id) => v[id]).map((id) => ({ id, ...v[id] }));
  }

  /**
   * Für die tägliche Zusammenfassung (#889): gemerkte Erwähnungen von Favoriten mit aktuellen Titeln – nur, wenn die
   * Person beide Mappen (noch) lesen darf.
   */
  async fuerZusammenfassung(z: Zugriff, roh: unknown): Promise<FavoritErwaehntZeile[]> {
    const merk = (Array.isArray(roh) ? roh : []).filter((x): x is FavoritErwaehntMerk => !!x && istUuid((x as FavoritErwaehntMerk).quelle) && istUuid((x as FavoritErwaehntMerk).ziel)).slice(-50);
    const ids = [...new Set(merk.flatMap((x) => [x.quelle, x.ziel]))];
    if (!ids.length) return [];
    const lesbar = await this.rechte.lesbare(z, ids);
    const b = await this.repo.bezuege(ids.filter((id) => lesbar.has(id)));
    return merk.filter((x) => b.has(x.quelle) && b.has(x.ziel)).map((x) => ({ ziel: b.get(x.ziel)!.titel, quelle: b.get(x.quelle)!.titel, quelleId: x.quelle, typId: b.get(x.quelle)!.typId, ort: String(x.ort ?? '').slice(0, 100) }));
  }
}
