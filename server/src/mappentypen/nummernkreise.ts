/**
 * Nummernkreise (#171, #1073 aus dienst.ts): Kreise anlegen, ändern, löschen, Zählerstand setzen und Nummern
 * nachträglich vergeben. Schicht 2.
 */
import { istLeer, type Feldaenderung, type Historienart, type Historieneintrag, type Mappe, type Mappentyp } from '../../../shared/src/model';
import { datumIn, KREIS_SCHLUESSEL, kreisVon, naechste, neubeginn, pruefeMuster, type Nummernkreis } from '../../../shared/src/nummernkreis';
import type { Auftrag, Fortschritt, PhasenPlan } from '../../../shared/src/auftrag';
import { Fachfehler } from '../fehler';
import type { Kern } from '../kern';
import { protokoll } from '../protokoll';
import type { Repo } from '../repo';
import { t } from '../sprache';

/** Kreis der Archivnummern (#345). */
export const ARCHIV_KREIS = 'archivnummer';

const text = (v: unknown) => (v == null ? '' : String(v)).trim();

/** Was die Nummernkreise außer dem Kern brauchen – vom Dienst hereingereicht. */
export interface NummernkreiseAnschluss {
  /** Der Kreis der Archivnummern (#345), entsteht beim ersten Gebrauch (Archivnummer, noch im Dienst). */
  archivKreis(): Promise<Nummernkreis>;
  /** Titel nach dem Vergeben der Nummern neu berechnen (Mappen, noch im Dienst). */
  aktualisiereTitel(ids: string[]): Promise<unknown>;
  /** Aufträge im Hintergrund (auftrag.ts). */
  auftraege: { starte(art: string, titel: string, arbeit: (fortschritt: Fortschritt) => Promise<unknown>, phasen?: PhasenPlan[]): Auftrag };
}

export class Nummernkreise {
  constructor(private readonly kern: Kern, private readonly anschluss: NummernkreiseAnschluss) {}

  private get repo(): Repo { return this.kern.repo; }
  private get auftraege() { return this.anschluss.auftraege; }
  private archivKreis() { return this.anschluss.archivKreis(); }
  private aktualisiereTitel(ids: string[]) { return this.anschluss.aktualisiereTitel(ids); }
  private notiere(mappeId: string, benutzerId: string | null, art: Historienart, daten?: Historieneintrag['daten']) { return this.kern.historie.schreibe(mappeId, benutzerId, art, daten); }

  /** Felder, die einen Kreis nutzen: „Mappentyp · Feld“. */
  private async kreisVerwendung(): Promise<Map<string, Array<{ typId: string; typ: string; feldKey: string; feld: string }>>> {
    const v = new Map<string, Array<{ typId: string; typ: string; feldKey: string; feld: string }>>();
    for (const t of await this.repo.listeTypen()) for (const f of t.felder) {
      const k = kreisVon(f);
      if (k) v.set(k, [...(v.get(k) ?? []), { typId: t.id, typ: t.name, feldKey: f.key, feld: f.label }]);
    }
    return v;
  }

  async listeNummernkreise(jetzt = new Date()) {
    await this.archivKreis(); // Archivnummern (#345): der Kreis ist immer da
    const v = await this.kreisVerwendung();
    const d = datumIn(jetzt);
    return (await this.repo.listeNummernkreise()).map((k) => {
      const n = naechste(k, d);
      return { ...k, naechste: n.nummer, naechsterZaehler: n.zaehler, zeitraum: n.zeitraum, neubeginn: neubeginn(k.muster), verwendet: v.get(k.schluessel) ?? [] };
    });
  }

  async speichereNummernkreis(e: unknown, von: string) {
    const x = (e ?? {}) as Record<string, unknown>;
    const schluessel = text(x.schluessel).toLowerCase();
    const name = text(x.name).slice(0, 80);
    const muster = String(x.muster ?? '').trim();
    const start = Number(x.start ?? 1);
    const vorhanden = (await this.repo.listeNummernkreise()).find((k) => k.schluessel === schluessel);
    if (x.neu === true && vorhanden) throw new Fachfehler(409, t('meldungen.dienst.die-kennung-hat-schon', { schluessel, name: vorhanden.name }));
    if (x.neu !== true && !vorhanden) throw new Fachfehler(404, t('meldungen.dienst.diesen-nummernkreis-gibt-es'));
    if (!KREIS_SCHLUESSEL.test(schluessel)) throw new Fachfehler(422, t('meldungen.dienst.kennung-kleinbuchstaben-ziffern-und'));
    if (!name) throw new Fachfehler(422, t('meldungen.dienst.der-nummernkreis-braucht-einen'));
    const fm = pruefeMuster(muster);
    if (fm) throw new Fachfehler(422, fm);
    if (!Number.isSafeInteger(start) || start < 0) throw new Fachfehler(422, t('meldungen.dienst.der-startwert-muss-eine'));
    const k = await this.repo.speichereNummernkreis({ schluessel, name, muster, start });
    protokoll.modul('werkbank').info(vorhanden ? 'Nummernkreis geändert' : 'Nummernkreis angelegt', { von, schluessel, muster, start, ...(vorhanden && vorhanden.muster !== muster ? { musterVorher: vorhanden.muster } : {}) });
    return k;
  }

  async loescheNummernkreis(schluessel: string, von: string) {
    if (schluessel === ARCHIV_KREIS) throw new Fachfehler(409, t('meldungen.dienst.den-nummernkreis-der-archivnummern'));
    const v = (await this.kreisVerwendung()).get(schluessel);
    if (v?.length) throw new Fachfehler(409, t('meldungen.dienst.der-nummernkreis-wird-noch', { map: v.map((x) => `${x.typ} · ${x.feld}`).join(', ') }));
    await this.repo.loescheNummernkreis(schluessel);
    protokoll.modul('werkbank').info('Nummernkreis gelöscht', { von, schluessel });
  }

  /** Zählerstand setzen (#171): `naechster` ist der Zähler der nächsten Nummer im aktuellen Zeitraum. */
  async setzeZaehler(schluessel: string, e: unknown, von: string, jetzt = new Date()) {
    const naechster = Number((e as { naechster?: unknown })?.naechster);
    if (!Number.isSafeInteger(naechster) || naechster < 0) throw new Fachfehler(422, t('meldungen.dienst.der-zaehlerstand-muss-eine'));
    const k = (await this.repo.listeNummernkreise()).find((x) => x.schluessel === schluessel);
    if (!k) throw new Fachfehler(404, t('meldungen.dienst.diesen-nummernkreis-gibt-es'));
    const vorher = naechste(k, datumIn(jetzt));
    const neu = await this.repo.setzeZaehler(schluessel, vorher.zeitraum, naechster - 1);
    protokoll.modul('werkbank').warn('Zählerstand eines Nummernkreises gesetzt', { von, schluessel, zeitraum: vorher.zeitraum, vorher: vorher.zaehler, naechster });
    return neu;
  }

  /** Wartung (#171): Mappen eines Typs ohne Nummer – Anzahl und welche Nummern entstehen. */
  async nummernVorschau(typId: string, feldKey: string, jetzt = new Date()) {
    const { kreis, ohne } = await this.ohneNummer(typId, feldKey);
    if (!ohne.length) return { anzahl: 0, von: null, bis: null };
    const d = datumIn(jetzt);
    const n = naechste(kreis, d);
    const bis = naechste({ ...kreis, staende: { ...kreis.staende, [n.zeitraum]: n.zaehler + ohne.length - 2 } }, d);
    return { anzahl: ohne.length, von: n.nummer, bis: ohne.length === 1 ? n.nummer : bis.nummer };
  }

  private async ohneNummer(typId: string, feldKey: string): Promise<{ typ: Mappentyp; kreis: Nummernkreis; ohne: Mappe[] }> {
    const typ = await this.repo.holeTyp(typId);
    const f = typ?.felder.find((x) => x.key === feldKey);
    const k = f ? kreisVon(f) : null;
    if (!typ || !f || !k) throw new Fachfehler(422, t('meldungen.dienst.dieses-feld-nutzt-keinen'));
    const kreis = (await this.repo.listeNummernkreise()).find((x) => x.schluessel === k);
    if (!kreis) throw new Fachfehler(409, t('meldungen.dienst.den-nummernkreis-gibt-es', { k }));
    const ohne = (await this.repo.listeMappen(typId)).filter((m) => istLeer(m.werte[feldKey]))
      .sort((a, b) => a.erstellt.localeCompare(b.erstellt) || a.id.localeCompare(b.id));
    return { typ, kreis, ohne };
  }

  /** Wartung (#171): Nummern nachträglich vergeben, in der Reihenfolge des Anlegens; als Auftrag. */
  nummernNachtragen(typId: string, feldKey: string, von: string) {
    return this.auftraege.starte('nummern', 'Nummern nachträglich vergeben', async (fortschritt) => {
      const { typ, ohne } = await this.ohneNummer(typId, feldKey);
      const label = typ.felder.find((f) => f.key === feldKey)!.label;
      let vergeben = 0; let erste: string | null = null; let letzte: string | null = null;
      for (const [i, m] of ohne.entries()) {
        const nr = await this.repo.vergebeNummer(m.id, feldKey, kreisVon(typ.felder.find((f) => f.key === feldKey)!)!, new Date());
        if (nr) {
          vergeben++; erste ??= nr; letzte = nr;
          await this.notiere(m.id, null, 'geaendert', { aenderungen: [{ feld: feldKey, label, neu: nr }] satisfies Feldaenderung[] });
        }
        fortschritt(i + 1, ohne.length);
      }
      await this.aktualisiereTitel(ohne.map((m) => m.id));
      protokoll.modul('werkbank').info('Nummern nachträglich vergeben', { von, typ: typ.name, feld: label, vergeben, erste, letzte });
      return { vergeben, erste, letzte };
    }, [{ key: 'nummern', name: 'Nummern vergeben', einheit: 'Mappen' }]);
  }
}
