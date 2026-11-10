/**
 * Passung (#1073, aus dienst.ts): Passt eine Mappe zur aktuellen Definition ihres Typs? Prüfen je Typ, je Mappe und
 * beim Start nachholen; Ergebnis am Repo, „passt nicht“-Aufgaben über den Anschluss. Schicht 2.
 */
import { ersterGrund, istLeer, verweiseVon, type Mappe, type Mappentyp } from '../../../shared/src/model';
import { pruefeMitAnzeige } from '../../../shared/src/anzeige';
import type { Kern } from '../kern';
import { istUuid, type Repo } from '../repo';
import { t } from '../sprache';

/** Was die Passung außer dem Kern braucht – vom Dienst hereingereicht. */
export interface PassungAnschluss {
  /** „Passt nicht“-Aufgaben anlegen bzw. erledigen (#54; Aufgaben, noch im Dienst). */
  passungsAufgaben(liste: Array<{ id: string; problem: string | null }>): Promise<void>;
}

export class Passung {
  constructor(private readonly kern: Kern, private readonly anschluss: PassungAnschluss) {}

  private get repo(): Repo { return this.kern.repo; }
  private passungsAufgaben(liste: Array<{ id: string; problem: string | null }>) { return this.anschluss.passungsAufgaben(liste); }

  /** Prüft alle Mappen eines Typs (nach einer Änderung des Typs) und speichert das Ergebnis. */
  async pruefePassung(typId: string): Promise<number> {
    const typ = await this.repo.holeTyp(typId);
    if (!typ) return 0;
    const mappen = await this.repo.listeMappen(typId);
    const typVon = await this.repo.typenVon(mappen.flatMap((m) => verweiseVon(typ, m.werte).map((v) => v.zielId)).filter(istUuid));
    // Eindeutige Felder: gleiche Werte im Arbeitsspeicher suchen statt je Mappe in der Datenbank.
    const gleiche = new Map<string, Map<string, Mappe[]>>();
    for (const f of typ.felder) {
      if (!f.eindeutig || (f.typ !== 'text' && f.typ !== 'zahl')) continue;
      const nachWert = new Map<string, Mappe[]>();
      for (const m of mappen) {
        if (istLeer(m.werte[f.key])) continue;
        const w = String(m.werte[f.key]).trim().toLowerCase();
        nachWert.set(w, [...(nachWert.get(w) ?? []), m]);
      }
      gleiche.set(f.key, nachWert);
    }
    // Anzeige-Bedingungen (#1033): Was eine Mappe nicht zeigt, ist nicht Pflicht – wie beim Speichern.
    const merkmale = await this.kern.merkmale();
    const ergebnis = mappen.map((m) => {
      const p = pruefeMitAnzeige(typ, m.werte, {
        merkmale,
        typVon: (id) => typVon.get(id),
        doppelt: (k, v) => {
          const andere = gleiche.get(k)?.get(String(v).trim().toLowerCase())?.find((x) => x.id !== m.id);
          return andere ? andere.titel || t('meldungen.dienst.ohne-titel') : undefined;
        },
      });
      return { id: m.id, problem: ersterGrund(typ, p), alt: m.problem ?? null, passtAlt: m.passt };
    });
    const geaendert = ergebnis.filter((e) => e.problem !== e.alt || e.passtAlt === undefined).map(({ id, problem }) => ({ id, problem }));
    await this.repo.setzePassung(geaendert);
    // Passt eine Mappe nicht, hat ihr Ersteller eine Aufgabe (#54); passt sie wieder, ist sie erledigt.
    await this.passungsAufgaben(geaendert);
    return ergebnis.filter((e) => e.problem).length;
  }

  /**
   * Nach dem Speichern einer Mappe: Andere Mappen desselben Typs, die bisher nicht passten,
   * können jetzt passen (z. B. weil ein doppelter Wert geändert wurde). Das sind meist wenige.
   */
  async pruefeUnpassende(typ: Mappentyp) {
    const ids = await this.repo.unpassende(typ.id);
    if (ids.length) await this.passungFuer(typ, ids);
  }

  /** Prüft einzelne Mappen eines Typs gegen seine Definition und speichert das Ergebnis. */
  async passungFuer(typ: Mappentyp, ids: string[]) {
    const liste: Array<{ id: string; problem: string | null }> = [];
    const mappen = await this.repo.holeMappen(ids);
    // In einem Zug statt je Mappe (#743): Typen der Verweisziele und „Bereits vergeben“ über den Index.
    const typen = await this.repo.typenVon([...new Set(mappen.flatMap((m) => verweiseVon(typ, m.werte).map((v) => v.zielId)))].filter(istUuid));
    const eindeutig = typ.felder.filter((f) => f.eindeutig && (f.typ === 'text' || f.typ === 'zahl'));
    const funde = await this.repo.findeDoppelte(typ.id, mappen.flatMap((m) => eindeutig.filter((f) => !istLeer(m.werte[f.key])).map((f) => ({ mappeId: m.id, feldKey: f.key, wert: String(m.werte[f.key]) }))));
    const merkmale = await this.kern.merkmale();
    for (const m of mappen) {
      const doppelt = (k: string) => { const d = funde.get(`${m.id}|${k}`); return d ? d.titel || t('meldungen.dienst.ohne-titel') : undefined; };
      const problem = ersterGrund(typ, pruefeMitAnzeige(typ, m.werte, { typVon: (id) => typen.get(id), doppelt, merkmale }));
      if (problem !== m.problem) liste.push({ id: m.id, problem });
    }
    await this.repo.setzePassung(liste);
    await this.passungsAufgaben(liste);
  }

  /** Beim Start: Passung für Typen nachholen, deren Mappen noch nie geprüft wurden. */
  async passungNachziehen(fortschritt: (fertig: number, gesamt: number) => void = () => {}): Promise<number> {
    const typen = await this.repo.typenOhnePassung();
    // Fortschritt für die Startseite (#802).
    for (const [i, t] of typen.entries()) { fortschritt(i, typen.length); await this.pruefePassung(t); }
    return typen.length;
  }
}
