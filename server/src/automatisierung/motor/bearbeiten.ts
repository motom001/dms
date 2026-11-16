/**
 * Automatisierungen verwalten (#674, #1278 Teil von `Automatisierungen`): Übersicht, prüfen, anlegen, ändern, an/aus,
 * löschen, kopieren, Läufe, nach einer Wiederherstellung.
 */
import { randomUUID } from 'node:crypto';
import { AutomatisierungBasis } from './basis';
import {
  type AutomatisierungAnsicht,
  type Fehlschlag,
  kontextTyp,
  type AutomatisierungDaten,
  type Herkunft,
  type DannKarte,
  automatisierungsProblemOrte,
  type Kontextdaten,
  werkbankBereiche,
  bereinigeAutomatisierung,
  wennBereich,
  AUTOMATISIERUNG_GRENZEN,
  REIHENFOLGE,
  type Automatisierung,
  istAufruf,
  type Lauf,
  laufFuer,
} from '../../../../shared/src/automatisierung';
import { Fachfehler } from '../../fehler';
import { t, log } from './gemeinsam';
import { DANN_AUSFUEHRER } from './karten';
import { gleicherStand } from './hilfen';

/** Übersicht, Prüfen und Bearbeiten. */
export abstract class AutomatisierungBearbeiten extends AutomatisierungBasis {
  /** Mappentypen, die das Konto „Automatisierung“ überhaupt nicht lesen darf (#709). */
  private async unlesbar(): Promise<{ typen: Set<string>; kontoId: string | null }> {
    const konto = await this.konto().catch(() => null);
    if (!konto) return { typen: new Set(), kontoId: null };
    const z = await this.d.dienst.rechtepruefung.zugriff(konto);
    const typen = new Set<string>();
    for (const typ of await this.d.dienst.mappentypen.listeTypen()) {
      const lesbar = z.typen.has(typ.id) && (!z.lesen || z.lesen.offen.includes(typ.id) || z.lesen.je.some((x) => x.typId === typ.id));
      if (!lesbar) typen.add(typ.id);
    }
    return { typen, kontoId: konto.id };
  }

  async uebersicht(): Promise<{ automatisierungen: AutomatisierungAnsicht[]; fehlgeschlagen: number; fehlschlaege: Fehlschlag[] }> {
    const [liste, k, letzte, fehl, u] = await Promise.all([
      this.d.repo.liste(),
      this.kontext(),
      this.d.repo.letzte(),
      this.d.repo.fehlgeschlagene(),
      this.unlesbar(),
    ]);
    const namen = new Map(liste.map((a) => [a.id, a.name]));
    // Welche Läufe fehlgeschlagen sind (#707): Automatisierung und Zeitpunkt, neueste zuerst; Probeläufe zählen nicht.
    const fehlschlaege = fehl.map((l) => ({
      id: l.id,
      automatisierungId: l.automatisierungId,
      name: namen.get(l.automatisierungId) ?? '',
      gestartet: l.gestartet,
    }));
    return {
      automatisierungen: await Promise.all(liste.map((a) => this.ansicht(a, k, letzte, u.typen, u.kontoId))),
      fehlgeschlagen: fehl.length,
      fehlschlaege,
    };
  }

  async hole(id: string): Promise<AutomatisierungAnsicht> {
    const a = await this.gibt(id);
    const u = await this.unlesbar();
    return this.ansicht(a, await this.kontext(), await this.d.repo.letzte(), u.typen, u.kontoId);
  }

  /**
   * Mappen zum Ausprobieren (#709): nur vom Mappentyp der Wenn-Karte und nur solche, die das Konto „Automatisierung“
   * lesen darf. Die Werkbank ist nur für Administratoren – die Schnittmenge mit ihren Rechten ist damit diese Menge.
   */
  async testmappen(id: string, suche: unknown): Promise<{ mappen: Array<{ id: string; titel: string; typId: string }>; gesamt: number }> {
    const a = await this.gibt(id);
    const typ = kontextTyp(a.wenn, (await this.kontext()).typen);
    if (!typ) return { mappen: [], gesamt: 0 };
    const konto = await this.konto();
    const s = await this.d.dienst.sichten.seite(
      konto,
      { sicht: `typ:${typ.id}`, suche, anzahl: 20 },
      await this.d.dienst.rechtepruefung.zugriff(konto),
      20,
    );
    return { mappen: s.mappen.map((m) => ({ id: m.id, titel: m.titel ?? '', typId: m.typId })), gesamt: s.gesamt };
  }

  protected async gibt(id: string) {
    const a = await this.d.repo.hole(id);
    if (!a) throw new Fachfehler(404, t('automatisierung.nicht-gefunden'));
    return a;
  }

  /** Speichern geht nur mit gültigem Stand (Fehler mit Gründen); eine neue Automatisierung startet ausgeschaltet. */
  protected async pruefe(d: AutomatisierungDaten, wer?: { herkunft: Herkunft; paketId?: string | null; alt?: DannKarte[] }) {
    const k = await this.kontext();
    // Mit dem Bereich im Editor (#1000), damit die Oberfläche ihn öffnet.
    const o = automatisierungsProblemOrte(d, k);
    const p = [...new Set(o.map((x) => x.text))];
    if (p.length) throw new Fachfehler(422, p[0], { probleme: p, orte: [...new Set(o.map((x) => x.ort))] });
    for (const x of [...d.dann, ...d.sonst])
      if (x.art !== 'stopp' && !DANN_AUSFUEHRER[x.art])
        throw new Fachfehler(422, t('automatisierung.karte.unbekannt', { art: x.art }), { orte: ['dann'] });
    if (wer) this.pruefePaketKarten(d, wer, k);
  }

  /**
   * „Paket nach Zeitplan ausführen“ beim Speichern (#1082, Sicherheit): Eine mitgelieferte Automatisierung ruft nur ihr
   * eigenes Paket; eine selbst angelegte nur Pakete, die `zeitplan.ausgefuehrt` abonnieren – außer die Karte nannte das
   * Paket schon vorher (entfernt: Sie läuft ins Leere und lässt sich trotzdem weiter bearbeiten).
   */
  private pruefePaketKarten(
    d: AutomatisierungDaten,
    wer: { herkunft: Herkunft; paketId?: string | null; alt?: DannKarte[] },
    k: Kontextdaten,
  ) {
    const vorher = new Set((wer.alt ?? []).flatMap((x) => (x.art === 'paket' ? [x.paket] : [])));
    for (const x of [...d.dann, ...d.sonst]) {
      if (x.art !== 'paket') continue;
      if (wer.herkunft === 'paket') {
        if (x.paket !== wer.paketId) throw new Fachfehler(422, t('automatisierung.paket.nur-eigenes'), { orte: ['dann'] });
        continue;
      }
      if (vorher.has(x.paket)) continue;
      const p = k.pakete?.find((y) => y.id === x.paket);
      if (!p) throw new Fachfehler(422, t('automatisierung.paket.nicht-installiert', { paket: x.paket }), { orte: ['dann'] });
      if (!p.zeitplan) throw new Fachfehler(422, t('automatisierung.paket.ohne-zeitplan', { name: p.name }), { orte: ['dann'] });
    }
  }

  /**
   * Werkbank-Karten (#677): Wer eine Karte einrichtet, die einen Werkbank-Bereich berührt (Sicherung, Gemeldete Fehler,
   * Protokoll, Systemzustand), muss diesen Bereich selbst verwalten dürfen – sonst bekäme er über das Systemkonto mehr, als er
   * darf. Geprüft wird, was gegenüber dem bisherigen Stand dazukommt – und jede Änderung an einer Wenn-Karte der Werkbank
   * (Art, Stufe, Modul, Text; vorher oder nachher): Sonst ließe sich etwa mit dem Filter `enthaelt` am Verlauf ablesen, ob
   * ein Text im Protokoll stand (Sicherheit in PR #1155). Name, an/aus, Und, Dann und Sonst bleiben offen. Ohne `darf`
   * (Pakete, Tests): keine Prüfung.
   */
  private pruefeBereiche(neu: AutomatisierungDaten, alt: AutomatisierungDaten | null, darf?: (bereich: string) => boolean) {
    if (!darf) return;
    const vorher = new Set(alt ? werkbankBereiche(alt) : []);
    const noetig = werkbankBereiche(neu).filter((b) => !vorher.has(b));
    if (alt && !gleicherStand(bereinigeAutomatisierung(alt).wenn, neu.wenn))
      for (const b of [wennBereich(alt.wenn), wennBereich(neu.wenn)]) if (b) noetig.push(b);
    const fehlt = noetig.find((b) => !darf(b));
    if (fehlt) throw new Fachfehler(403, t('automatisierung.bereich.fehlt', { bereich: t.frei(`werkbank.bereich.${fehlt}.name`) }));
  }

  async lege(
    e: unknown,
    von: string | null,
    herkunft: Herkunft = 'eigen',
    darf?: (bereich: string) => boolean,
  ): Promise<AutomatisierungAnsicht> {
    if ((await this.d.repo.liste()).length >= AUTOMATISIERUNG_GRENZEN.automatisierungen)
      throw new Fachfehler(422, t('automatisierung.zuviele', { anzahl: AUTOMATISIERUNG_GRENZEN.automatisierungen }));
    const d = bereinigeAutomatisierung(e);
    this.pruefeBereiche(d, null, darf);
    const roh = (e ?? {}) as Record<string, unknown>;
    if (roh.reihenfolge === undefined) d.reihenfolge = REIHENFOLGE[herkunft];
    await this.pruefe(d, { herkunft });
    const a: Automatisierung = {
      ...d,
      id: randomUUID(),
      aktiv: roh.aktiv === true,
      angehalten: null,
      herkunft,
      version: 1,
      erstellt: this.iso(),
      erstelltVon: von,
      geaendert: this.iso(),
      geaendertVon: von,
    };
    await this.d.repo.lege(a);
    log.info('Automatisierung angelegt', { id: a.id, name: a.name });
    return this.hole(a.id);
  }

  async aendere(id: string, e: unknown, von: string | null, darf?: (bereich: string) => boolean): Promise<AutomatisierungAnsicht> {
    const alt = await this.gibt(id);
    const roh = (e ?? {}) as Record<string, unknown>;
    const d = bereinigeAutomatisierung({ ...alt, ...roh });
    this.pruefeBereiche(d, alt, darf);
    // Mitgeliefert (#1082): „Paket nach Zeitplan ausführen“ zeigt immer auf das eigene Paket – was auch geschickt wird.
    if (alt.herkunft === 'paket' && alt.paketId) for (const k of [...d.dann, ...d.sonst]) if (k.art === 'paket') k.paket = alt.paketId;
    await this.pruefe(d, { herkunft: alt.herkunft, paketId: alt.paketId, alt: [...alt.dann, ...alt.sonst] });
    const version = Number(roh.version ?? alt.version);
    const aktiv = typeof roh.aktiv === 'boolean' ? roh.aktiv : alt.aktiv;
    if (!(await this.d.repo.speichere(id, { ...d, aktiv }, von, version))) throw new Fachfehler(409, t('automatisierung.konflikt'));
    // Aufruf von außen (#679): Ist die Wenn-Karte keine mehr, gilt auch ihre Adresse nicht mehr.
    if (istAufruf(alt.wenn) && !istAufruf(d.wenn)) await this.aufrufe.entferne(id, 'Wenn-Karte geändert');
    // URL aufrufen (#671): Fällt eine Karte weg, auch ihr Geheimnis.
    const urlKarten = new Set([...d.dann, ...d.sonst].filter((k) => k.art === 'url').map((k) => k.id));
    for (const k of [...alt.dann, ...alt.sonst])
      if (k.art === 'url' && !urlKarten.has(k.id)) await this.ausleitung.geheimnisEntfernen(id, k.id);
    // Gespeichert mit gültigem Stand: „fehlerhaft“ ist damit behoben (Bremse und Wiederherstellung hebt nur „einschalten“ auf).
    if (alt.angehalten?.grund === 'fehlerhaft' || (aktiv && !alt.aktiv)) await this.d.repo.setze(id, { angehalten: null });
    return this.hole(id);
  }

  /** An/aus. Einschalten hebt ein Anhalten auf (Bremse, Wiederherstellung) – aber nur mit gültigem Stand. */
  async schalte(id: string, aktiv: boolean, von: string | null): Promise<AutomatisierungAnsicht> {
    const a = await this.gibt(id);
    if (aktiv) await this.pruefe(a);
    if (a.aktiv !== aktiv && !(await this.d.repo.speichere(id, { ...a, aktiv }, von, a.version)))
      throw new Fachfehler(409, t('automatisierung.konflikt'));
    if (aktiv) await this.d.repo.setze(id, { angehalten: null });
    log.info(aktiv ? 'Automatisierung eingeschaltet' : 'Automatisierung ausgeschaltet', { id, name: a.name });
    return this.hole(id);
  }

  async loesche(id: string): Promise<void> {
    const a = await this.gibt(id);
    if (a.herkunft !== 'eigen') throw new Fachfehler(409, t('automatisierung.loeschen.herkunft'));
    await this.d.repo.loesche(id);
    await this.aufrufe.entferne(id, 'Automatisierung gelöscht');
    // Karten nach außen (#671): in der Datenbank gehen Geheimnisse und Ausgangskorb mit (ON DELETE CASCADE).
    await this.ausleitung.geheimnisEntfernen(id);
    await this.ausleitung.verwerfe(id, 'Automatisierung gelöscht');
    log.info('Automatisierung gelöscht', { id, name: a.name });
  }

  /** Kopie als eigene Automatisierung (ausgeschaltet) – z. B. für einen zweiten Auslöser. */
  async kopiere(id: string, von: string | null, darf?: (bereich: string) => boolean): Promise<AutomatisierungAnsicht> {
    const a = await this.gibt(id);
    return this.lege(
      {
        ...a,
        name: t('automatisierung.kopie', { name: a.name }).slice(0, AUTOMATISIERUNG_GRENZEN.name),
        aktiv: false,
        reihenfolge: a.reihenfolge,
      },
      von,
      'eigen',
      darf,
    );
  }

  /** Verlauf; mit `darf` (Anfrage einer Person) ohne Lauf-Daten aus Bereichen, die sie nicht verwaltet ({@link laufFuer}). */
  async laeufe(id: string, anzahl = 50, darf?: (bereich: string) => boolean): Promise<Lauf[]> {
    await this.gibt(id);
    return (await this.d.repo.laeufe(id, Math.max(1, Math.min(AUTOMATISIERUNG_GRENZEN.verlauf, anzahl)))).map((l) => laufFuer(l, darf));
  }
  /** Ein Lauf; ohne `darf` mit allen gespeicherten Daten (Wiederholen), mit `darf` wie {@link laufFuer}. */
  async lauf(id: string, darf?: (bereich: string) => boolean): Promise<Lauf> {
    const l = await this.d.repo.lauf(id);
    if (!l) throw new Fachfehler(404, t('automatisierung.lauf.fehlt'));
    return laufFuer(l, darf);
  }

  /** Nach einer Wiederherstellung: alle eingeschalteten anhalten, bis ein Admin sie wieder einschaltet. */
  async nachWiederherstellung(): Promise<number> {
    let n = 0;
    for (const a of await this.d.repo.liste()) {
      if (!a.aktiv || a.angehalten) continue;
      await this.d.repo.setze(a.id, {
        angehalten: { grund: 'wiederherstellung', text: t('automatisierung.angehalten.wiederherstellung'), zeit: this.iso() },
      });
      n++;
    }
    return n;
  }
}
