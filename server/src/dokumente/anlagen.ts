/**
 * Anlagen (#998): Ein Dokument kann Anlagen haben – jede ein eigenes Dokument (Datei, Versionen, Volltext,
 * Archivfassung, Stempel) in derselben Mappe und demselben Register wie ihr Hauptdokument, in fester Reihenfolge
 * („Anlage 1, 2, 3“). Hier: lesen, „Als Anlage an … hängen“, „Zum eigenen Dokument machen“, umsortieren, umbenennen
 * und das Anlegen beim Teilen einer Post (Trennblatt, dms-registry #152). Schicht 2 – bekommt den Kern und die
 * Versionen („zuletzt geändert“).
 *
 * Regeln:
 * - Rechte wie beim Hauptdokument: Es ist dieselbe Mappe. Die Routen prüfen Lesen bzw. Bearbeiten an ihr.
 * - Eine Anlage hängt an genau einem Hauptdokument; Anlagen haben keine eigenen Anlagen (hängt man ein Dokument mit
 *   Anlagen an, kommen seine Anlagen gleich dahinter mit).
 * - Nur innerhalb einer Mappe. Verschieben, Papierkorb und Wiederherstellen nehmen die Anlagen mit (Repo, Dokumente,
 *   Papierkorb); wer eine Anlage allein woandershin bringen will, macht sie erst zum eigenen Dokument.
 * - Alles steht in der Historie der Mappe (Art „anlage“).
 */
import { ANLAGEN_MAX, anlageName, anlageText } from '../../../shared/src/anlagen';
import type { Dokument } from '../../../shared/src/model';
import { Fachfehler } from '../fehler';
import type { Kern } from '../kern';
import { protokoll } from '../protokoll';
import { istUuid, type Repo } from '../repo';
import { t } from '../sprache';
import { dateiname } from './dokumente.dienst';
import type { DokumentVersionen } from './versionen';

const log = protokoll.modul('dokumente');
const text = (v: unknown) => (v == null ? '' : String(v)).trim();

/** Antwort von GET …/anlagen: das Dokument und seine Anlagen (Anlage 1 zuerst). */
export interface AnlagenStand { dokument: Dokument; anlagen: Dokument[] }

export class DokumentAnlagen {
  constructor(private readonly kern: Kern, private readonly teile: { versionen: DokumentVersionen }) {}

  private get repo(): Repo { return this.kern.repo; }
  private notiere(...a: Parameters<Kern['historie']['schreibe']>) { return this.kern.historie.schreibe(...a); }
  private inTransaktion<T>(f: () => Promise<T>): Promise<T> { return this.kern.inTransaktion(f); }

  private async hole(id: string): Promise<Dokument> {
    const d = istUuid(id) ? await this.repo.holeDokument(id) : undefined;
    if (!d) throw new Fachfehler(404, t('meldungen.dienst.dieses-dokument-gibt-es'));
    return d;
  }

  /** Hauptdokument holen: kein eigenes Dokument, sondern selbst eine Anlage → 409. */
  private async haupt(id: string): Promise<Dokument> {
    const d = await this.hole(id);
    if (d.anlageZu) throw new Fachfehler(409, t('meldungen.anlagen.haupt-ist-anlage', { name: d.name }));
    return d;
  }

  private async stand(haupt: Dokument): Promise<AnlagenStand> {
    return { dokument: (await this.repo.holeDokument(haupt.id)) ?? haupt, anlagen: await this.repo.anlagenVon(haupt.id) };
  }

  /** „zuletzt geändert“ der Mappe. */
  private async beruehre(mappeId: string, von: string | null) {
    const m = await this.repo.holeMappe(mappeId);
    if (m) await this.teile.versionen.beruehre(m.id, await this.repo.holeTyp(m.typId), von);
  }

  /** Nummern 1, 2, 3 … ohne Lücken (nach Lösen und Umsortieren). */
  private async nummeriere(hauptId: string, reihenfolge?: string[]) {
    const liste = await this.repo.anlagenVon(hauptId);
    const ids = reihenfolge ?? liste.map((a) => a.id);
    for (const [i, id] of ids.entries()) if (liste.find((a) => a.id === id)?.anlageNr !== i + 1) await this.repo.setzeAnlage(id, hauptId, i + 1);
  }

  /** Anlagen lesen (GET …/anlagen): bei einer Anlage ihr Hauptdokument mit allen Anlagen. */
  async liste(id: string): Promise<AnlagenStand> {
    const d = await this.hole(id);
    return this.stand(d.anlageZu ? await this.hole(d.anlageZu) : d);
  }

  /**
   * „Als Anlage an … hängen“ (POST …/anlagen): `dokument` wird die nächste Anlage von `hauptId` (mit `name`
   * umbenannt). Nur in derselben Mappe; das Register wird das des Hauptdokuments. Hängt das Dokument an einem anderen
   * Hauptdokument, wechselt es; hat es selbst Anlagen, kommen sie gleich dahinter mit.
   */
  async haengeAn(hauptId: string, eingabe: unknown, von: string | null): Promise<AnlagenStand> {
    const e = (eingabe ?? {}) as Record<string, unknown>;
    const haupt = await this.haupt(hauptId);
    const d = await this.hole(text(e.dokument));
    if (d.id === haupt.id) throw new Fachfehler(422, t('meldungen.anlagen.an-sich-selbst'));
    if (d.mappeId !== haupt.mappeId) throw new Fachfehler(422, t('meldungen.anlagen.andere-mappe'));
    if (d.anlageZu === haupt.id) throw new Fachfehler(409, t('meldungen.anlagen.schon-anlage', { name: d.name, haupt: haupt.name }));
    const name = e.name === undefined || e.name === null || text(e.name) === '' ? undefined : dateiname(e.name);
    const vorhanden = await this.repo.anlagenVon(haupt.id);
    const mit = await this.repo.anlagenVon(d.id);
    if (vorhanden.length + 1 + mit.length > ANLAGEN_MAX) throw new Fachfehler(422, t('meldungen.anlagen.zu-viele', { max: ANLAGEN_MAX }));
    await this.inTransaktion(async () => {
      const vorher = d.anlageZu;
      if (d.registerKey !== haupt.registerKey) await this.repo.verschiebeDokument(d.id, haupt.mappeId, haupt.registerKey);
      let nr = vorhanden.length;
      await this.repo.setzeAnlage(d.id, haupt.id, ++nr, name);
      for (const a of mit) await this.repo.setzeAnlage(a.id, haupt.id, ++nr);
      if (vorher) await this.nummeriere(vorher);
      await this.notiere(haupt.mappeId, von, 'anlage', {
        text: t('meldungen.anlagen.angehaengt', { name: name ?? d.name, haupt: haupt.name, anlage: anlageText(vorhanden.length + 1) }), dokument: name ?? d.name, haupt: haupt.name,
        nr: vorhanden.length + 1, ...(mit.length ? { mit: mit.length } : {}),
      });
      await this.beruehre(haupt.mappeId, von);
    });
    log.info('Anlage angehängt', { dokument: d.id, haupt: haupt.id, nr: vorhanden.length + 1, mit: mit.length || undefined });
    return this.stand(haupt);
  }

  /** „Zum eigenen Dokument machen“ (DELETE …/anlagen/:anlage): die Anlage bleibt in Mappe und Register, ohne Hauptdokument. */
  async loese(hauptId: string, anlageId: string, von: string | null): Promise<AnlagenStand> {
    const haupt = await this.haupt(hauptId);
    const a = await this.hole(anlageId);
    if (a.anlageZu !== haupt.id) throw new Fachfehler(404, t('meldungen.anlagen.keine-anlage', { name: a.name, haupt: haupt.name }));
    await this.inTransaktion(async () => {
      await this.repo.setzeAnlage(a.id, null, null);
      await this.nummeriere(haupt.id);
      await this.notiere(haupt.mappeId, von, 'anlage', { text: t('meldungen.anlagen.geloest', { name: a.name, haupt: haupt.name }), dokument: a.name, haupt: haupt.name, geloest: true });
      await this.beruehre(haupt.mappeId, von);
    });
    log.info('Anlage zum eigenen Dokument gemacht', { dokument: a.id, haupt: haupt.id });
    return this.stand(haupt);
  }

  /** Reihenfolge ändern (PUT …/anlagen): `reihenfolge` nennt genau die Anlagen in neuer Reihenfolge. */
  async sortiere(hauptId: string, eingabe: unknown, von: string | null): Promise<AnlagenStand> {
    const haupt = await this.haupt(hauptId);
    const e = (eingabe ?? {}) as Record<string, unknown>;
    const ids = Array.isArray(e.reihenfolge) ? e.reihenfolge.map(String) : [];
    const liste = await this.repo.anlagenVon(haupt.id);
    if (ids.length !== liste.length || new Set(ids).size !== ids.length || ids.some((id) => !liste.some((a) => a.id === id))) {
      throw new Fachfehler(422, t('meldungen.anlagen.reihenfolge'));
    }
    if (ids.every((id, i) => liste[i].id === id)) return this.stand(haupt);
    await this.inTransaktion(async () => {
      await this.nummeriere(haupt.id, ids);
      await this.notiere(haupt.mappeId, von, 'anlage', { text: t('meldungen.anlagen.sortiert', { haupt: haupt.name }), haupt: haupt.name, sortiert: true });
      await this.beruehre(haupt.mappeId, von);
    });
    return this.stand(haupt);
  }

  /** Anlage umbenennen (PUT …/anlagen/:anlage): die Vorgabe „<Name> – Anlage 1“ ist nur ein Vorschlag. */
  async benenne(hauptId: string, anlageId: string, eingabe: unknown, von: string | null): Promise<AnlagenStand> {
    const haupt = await this.haupt(hauptId);
    const a = await this.hole(anlageId);
    if (a.anlageZu !== haupt.id) throw new Fachfehler(404, t('meldungen.anlagen.keine-anlage', { name: a.name, haupt: haupt.name }));
    const roh = text((eingabe as Record<string, unknown> | null)?.name);
    if (!roh) throw new Fachfehler(422, t('meldungen.anlagen.name-leer'));
    const name = dateiname(roh);
    if (name === a.name) return this.stand(haupt);
    await this.inTransaktion(async () => {
      await this.repo.setzeAnlage(a.id, haupt.id, a.anlageNr ?? 1, name);
      await this.notiere(haupt.mappeId, von, 'anlage', { text: t('meldungen.anlagen.umbenannt', { vorher: a.name, name }), dokument: name, vorher: a.name, haupt: haupt.name });
      await this.beruehre(haupt.mappeId, von);
    });
    return this.stand(haupt);
  }

  /**
   * Neue Dokumente als Anlagen hinter die vorhandenen (Teilen einer Post mit Anlagen, dms-registry #152): Vorgabe-Name
   * „<Name des Dokuments> – Anlage n“. Ohne eigene Historie – das Teilen schreibt sie.
   */
  async alsAnlagen(haupt: Dokument, neu: Dokument[]): Promise<Dokument[]> {
    let nr = (await this.repo.anlagenVon(haupt.id)).length;
    for (const d of neu) {
      if (d.mappeId !== haupt.mappeId) throw new Fachfehler(500, t('meldungen.anlagen.andere-mappe'));
      nr++;
      await this.repo.setzeAnlage(d.id, haupt.id, nr, anlageName(haupt.name, nr, d.name));
    }
    return this.repo.anlagenVon(haupt.id);
  }
}
