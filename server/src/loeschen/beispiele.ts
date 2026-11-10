/**
 * Beispiel-Mappen aus Paketen (#878, #1078 aus dienst.ts): Stand nach dem Anlegen, welche noch unverändert sind, und
 * das endgültige Entfernen (ohne Papierkorb und Ereignisse, im Löschprotokoll). Schicht 3 – bekommt den Kern und die
 * Teile des Löschens.
 */
import { createHash } from 'node:crypto';
import type { Anlass, Kern, Loeschprotokoll, ProtokollMappe, ProtokollTeil } from '../kern';
import type { Repo } from '../repo';
import type { LoeschKontext } from '../../../shared/src/loeschprotokoll';
import type { Mappe, Mappentyp } from '../../../shared/src/model';
import type { BeispielStand } from '../../../shared/src/pakete';
import type { LoeschenTeile } from './loeschen.dienst';

/** Prüfwert von Feldwerten (#878): JSON mit sortierten Schlüsseln, damit die Reihenfolge aus der Datenbank nicht zählt. */
function pruefwertVon(werte: unknown): string {
  const sortiert = (v: unknown): unknown => (Array.isArray(v) ? v.map(sortiert) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, x]) => [k, sortiert(x)])) : v);
  return createHash('sha256').update(JSON.stringify(sortiert(werte ?? {}))).digest('hex');
}

export class BeispielMappen {
  constructor(private readonly kern: Kern, private readonly teile: LoeschenTeile) {}

  private get repo(): Repo { return this.kern.repo; }
  private ohneEreignisse<T>(f: () => Promise<T>): Promise<T> { return this.kern.ohneEreignisse(f); }
  private aktualisiereStatistik() { return this.teile.sichten.aktualisiereStatistik(); }
  private loeschReihenfolge(ids: string[]) { return this.teile.loeschen.loeschReihenfolge(ids); }
  private loescheMappeIntern(id: string, typ: Mappentyp | undefined, von: string | null = null) { return this.teile.loeschen.loescheMappeIntern(id, typ, von); }
  private loeschKontext(von: string | null, anlass: Anlass = {}): Promise<LoeschKontext> { return this.kern.loeschprotokoll.kontext(von, anlass); }
  private mappenEintraege(liste: ProtokollMappe[], x: Parameters<Loeschprotokoll['mappenEintraege']>[1]): ProtokollTeil[] { return this.kern.loeschprotokoll.mappenEintraege(liste, x); }
  private protokolliere(teile: ProtokollTeil[], k: LoeschKontext, nachGrund = false) { return this.kern.loeschprotokoll.schreibe(teile, k, nachGrund); }
  private lebendInhalt(mappen: Mappe[]) { return this.teile.protokoll.lebendInhalt(mappen); }

  /** Stand von Beispiel-Mappen direkt nach dem Anlegen: Prüfwert der Feldwerte und Dokumente (Id und Inhalt). */
  async beispielStand(ids: string[]): Promise<BeispielStand[]> {
    const mappen = await this.repo.holeMappen(ids);
    return Promise.all(mappen.map(async (m) => ({ id: m.id, werte: pruefwertVon(m.werte), dokumente: (await this.repo.listeDokumente(m.id)).map((d) => `${d.id}:${d.sha256}`).sort() })));
  }

  /**
   * Welche Beispiel-Mappen sind noch unverändert (#878)? Unverändert heißt: gleiche Feldwerte, dieselben Dokumente, keine
   * Notizen und kein Verweis aus einer Mappe, die kein Beispiel dieser Liste ist. Gelöschte (auch im Papierkorb) fehlen.
   */
  async pruefeBeispiele(staende: BeispielStand[]): Promise<{ unveraendert: string[]; geaendert: Array<{ id: string; typId: string; titel: string; grund: 'geaendert' | 'verwiesen' }> }> {
    const mappen = new Map((await this.repo.holeMappen(staende.map((s) => s.id))).map((m) => [m.id, m] as const));
    const alle = new Set(mappen.keys());
    const unveraendert: string[] = [];
    const geaendert: Array<{ id: string; typId: string; titel: string; grund: 'geaendert' | 'verwiesen' }> = [];
    for (const s of staende) {
      const m = mappen.get(s.id);
      if (!m) continue;
      const dok = (await this.repo.listeDokumente(m.id)).map((d) => `${d.id}:${d.sha256}`).sort();
      const gleich = pruefwertVon(m.werte) === s.werte && dok.join('|') === [...s.dokumente].sort().join('|') && !(await this.repo.notizen(m.id)).length;
      const fremd = gleich && (await this.repo.rueckverweise(m.id)).some((r) => !alle.has(r.quelleId));
      if (gleich && !fremd) unveraendert.push(m.id);
      else geaendert.push({ id: m.id, typId: m.typId, titel: m.titel || m.id, grund: gleich ? 'verwiesen' : 'geaendert' });
    }
    return { unveraendert, geaendert };
  }

  /** Beispiel-Mappen samt Dokumenten endgültig entfernen (#878): ohne Papierkorb und Ereignisse, im Löschprotokoll. */
  async entferneBeispielMappen(ids: string[], von: string | null) {
    const mappen = await this.repo.holeMappen(ids);
    const vorher = await this.lebendInhalt(mappen);
    const typen = new Map((await this.repo.listeTypen()).map((t) => [t.id, t] as const));
    const typVon = new Map(mappen.map((m) => [m.id, m.typId] as const));
    await this.ohneEreignisse(async () => { for (const id of await this.loeschReihenfolge([...typVon.keys()])) await this.loescheMappeIntern(id, typen.get(typVon.get(id)!), von); });
    await this.protokolliere(this.mappenEintraege(vorher, { schritt: 'endgueltig', weg: 'beispiele' }), await this.loeschKontext(von));
    if (mappen.length) await this.aktualisiereStatistik();
  }
}
