/**
 * Mappe mit allen verknüpften Mappen löschen (#396, #424, #1078 aus dienst.ts): die Baum-Sammlung über Verweise,
 * Vorschau, Ausführen in einem Vorgang, Erinnerung zum Fristende, Verweise wieder setzen und den ganzen Vorgang
 * wiederherstellen. Schicht 3 – Teile und Anschluss wie `LoeschenDienst` (loeschen.dienst.ts).
 */
import { randomUUID } from 'node:crypto';
import { type BaumQuelle, sammleBaum } from '../baum';
import { Fachfehler } from '../fehler';
import type { Anlass, Kern, Loeschprotokoll, ProtokollMappe, ProtokollTeil, Zugriff } from '../kern';
import type { MappenHistorie } from '../mappen';
import { protokoll } from '../protokoll';
import { istUuid, type PapierkorbEintrag, type Repo } from '../repo';
import { t } from '../sprache';
import type { ZugriffDienst } from '../zugriff';
import { type Baum, BAUM_STANDARD, bereinigeBaumOptionen, verweisartVon } from '../../../shared/src/baum';
import { datumDe } from '../../../shared/src/fristen';
import { liesLoeschAuswahl, LOESCH_TIEFE, loeschErinnerung, type LoeschKante, type LoeschPlan, type LoeschVorschau, loeschVorschlag, planeLoeschung } from '../../../shared/src/loeschbaum';
import { type Ausloeser, liesAnlass, type LoeschKontext } from '../../../shared/src/loeschprotokoll';
import { darfLoeschen, type Mappe, type Mappentyp, verweiseVon, type Werte } from '../../../shared/src/model';
import { istTeilVerweis } from '../../../shared/src/teile';
import type { LoeschenAnschluss, LoeschenDienst, LoeschenTeile } from './loeschen.dienst';
import type { Papierkorb } from './papierkorb';

/** Wert eines Mehrfachverweises als Liste. */
const alsListe = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : typeof v === 'string' && v ? [v] : []);

export class MitVerknuepften {
  constructor(private readonly kern: Kern, private readonly teile: LoeschenTeile, private readonly anschluss: LoeschenAnschluss) {}

  private get repo(): Repo { return this.kern.repo; }
  private ereignis(...a: Parameters<Kern['ereignis']>) { return this.anschluss.ereignis(...a); }
  private aktualisiereTitel(ids: string[]) { return this.anschluss.aktualisiereTitel(ids); }
  private papierkorbTage(): Promise<number> { return this.kern.papierkorbTage(); }
  private name(benutzerId: string | null): Promise<string> { return this.kern.name(benutzerId); }
  private notiere(...a: Parameters<MappenHistorie['notiere']>) { return this.teile.historie.notiere(...a); }
  private aenderungen(typ: Mappentyp, alt: Werte, neu: Werte) { return this.teile.historie.aenderungen(typ, alt, neu); }
  private lesbare(...a: Parameters<ZugriffDienst['lesbare']>) { return this.teile.rechte.lesbare(...a); }
  private rechteAnVielen(...a: Parameters<ZugriffDienst['rechteAnVielen']>) { return this.teile.rechte.rechteAnVielen(...a); }
  private pruefeRecht(...a: Parameters<ZugriffDienst['pruefeRecht']>) { return this.teile.rechte.pruefeRecht(...a); }
  private pruefeUnpassende(typ: Mappentyp) { return this.teile.passung.pruefeUnpassende(typ); }
  private passungFuer(typ: Mappentyp, ids: string[]) { return this.teile.passung.passungFuer(typ, ids); }
  private leere(...a: Parameters<Papierkorb['leere']>) { return this.teile.papierkorb.leere(...a); }
  private loeschPruefung(...a: Parameters<LoeschenDienst['loeschPruefung']>) { return this.teile.loeschen.loeschPruefung(...a); }
  private wiederEintrag(e: PapierkorbEintrag, typ: Mappentyp | undefined, vorgang: string | null): ProtokollTeil { return this.kern.loeschprotokoll.wiederEintrag(e, typ, vorgang); }
  private loeschKontext(von: string | null, anlass: Anlass = {}): Promise<LoeschKontext> { return this.kern.loeschprotokoll.kontext(von, anlass); }
  private mappenEintraege(liste: ProtokollMappe[], x: Parameters<Loeschprotokoll['mappenEintraege']>[1]): ProtokollTeil[] { return this.kern.loeschprotokoll.mappenEintraege(liste, x); }
  private protokolliere(teile: ProtokollTeil[], k: LoeschKontext, nachGrund = false) { return this.kern.loeschprotokoll.schreibe(teile, k, nachGrund); }
  private lebendInhalt(mappen: Mappe[]) { return this.teile.protokoll.lebendInhalt(mappen); }

  /** Datenquelle der Baum-Sammlung für einen Zugriff (Rechte des Aufrufers). */
  baumQuelle(z: Zugriff): BaumQuelle {
    const r = this.repo;
    return {
      typen: z.typen,
      mappen: (ids) => r.holeMappen(ids),
      kanten: (ids) => r.kantenVon(ids),
      lesbare: (ids) => this.lesbare(z, ids),
      bezuege: (ids) => r.bezuege(ids),
      dokumente: (ids) => r.zaehleDokumente(ids),
      rechte: (ms) => this.rechteAnVielen(z, ms),
    };
  }

  /**
   * Alle Mappen, die über Verweise an `startId` hängen (#396, #424) – innerhalb der Rechte des
   * Aufrufers. Benutzer und Rollen sind ohne Angabe von `ohneTypen` ausgenommen.
   */
  async baum(startId: string, eingabe: unknown, z: Zugriff): Promise<Baum> {
    const sys = await this.kern.system();
    const opt = bereinigeBaumOptionen(eingabe, { ...BAUM_STANDARD, ohneTypen: [sys.benutzer.id, sys.rolle.id] });
    return sammleBaum(this.baumQuelle(z), startId, opt);
  }

  /**
   * Vorschau (#424): Baum „nach unten“ (Mappen, die auf die Start-Mappe verweisen, und so weiter), ohne
   * Benutzer und Rollen; dazu alle Verweise im Baum, welche Mappen auch an anderen hängen (🔗) und welche
   * sich grundsätzlich nicht löschen lassen. Tiefe 1–10 (Standard 5), Obergrenze max (Standard 1000).
   * Weiter geht es nur über Verweise der Art „Zugehörigkeit“; Mappen, die nur über „Bezug“ dranhängen
   * (📎, z. B. Ansprechpartner), stehen als Blatt da – bei ihnen wird nur der Verweis entfernt.
   */
  async loeschVorschau(startId: string, eingabe: unknown, z: Zugriff): Promise<LoeschVorschau> {
    const sys = await this.kern.system();
    const ohne = new Set([sys.benutzer.id, sys.rolle.id]);
    const e = (eingabe && typeof eingabe === 'object' ? eingabe : {}) as Record<string, unknown>;
    const opt = bereinigeBaumOptionen({ tiefe: e.tiefe, max: e.max }, { ...BAUM_STANDARD, tiefe: LOESCH_TIEFE, richtungen: ['verwiesenVon'], seitwaerts: false, ohneTypen: [...ohne], nurZugehoerigkeit: true });
    const baum = await sammleBaum(this.baumQuelle(z), startId, opt);
    const imBaum = new Set(baum.knoten.map((k) => k.id));
    const alle: LoeschKante[] = [];
    for (let i = 0; i < baum.knoten.length; i += 500) alle.push(...await this.repo.kantenVon(baum.knoten.slice(i, i + 500).map((k) => k.id)));
    const gesehen = new Set<string>();
    const kanten = alle.filter((k) => imBaum.has(k.quelleId) && imBaum.has(k.zielId) && k.quelleId !== k.zielId && !gesehen.has(`${k.quelleId}|${k.feldKey}|${k.zielId}`) && !!gesehen.add(`${k.quelleId}|${k.feldKey}|${k.zielId}`));
    // 🔗: gehört auch zu einer Mappe außerhalb – über ein Feld der Art Zugehörigkeit, über das sie im Baum
    // hängt, oder zu einer Mappe desselben Typs wie im Baum (z. B. zusätzlich zu einem anderen Vertrag).
    // Bezug-Verweise (Aussteller, Kategorie, Ablageort) und Verweise auf Benutzer zählen nicht.
    const aussenZiele = [...new Set(alle.filter((k) => imBaum.has(k.quelleId) && !imBaum.has(k.zielId)).map((k) => k.zielId))];
    const typVon = await this.repo.typenVon(aussenZiele);
    const typIm = new Map(baum.knoten.map((k) => [k.id, k.typId] as const));
    const zugehoerig = (x: LoeschKante) => verweisartVon(z.typen.get(typIm.get(x.quelleId) ?? ''), x.feldKey) === 'zugehoerigkeit';
    const geteilt = baum.knoten.filter((k) => {
      if (k.nurBezug) return false;
      const innen = kanten.filter((x) => x.quelleId === k.id && zugehoerig(x));
      if (!innen.length) return false;
      const felder = new Set(innen.map((x) => x.feldKey));
      const typen = new Set(innen.map((x) => typIm.get(x.zielId)));
      return alle.some((x) => x.quelleId === k.id && !imBaum.has(x.zielId) && zugehoerig(x) && !ohne.has(typVon.get(x.zielId) ?? '') && (felder.has(x.feldKey) || typen.has(typVon.get(x.zielId))));
    }).map((k) => k.id);
    const nichtLoeschbar: Record<string, string> = {};
    const mappen = new Map((await this.repo.holeMappen(baum.knoten.filter((k) => !k.gesperrt && k.rechte.D).map((k) => k.id))).map((m) => [m.id, m] as const));
    for (const [id, m] of mappen) {
      const typ = z.typen.get(m.typId);
      if (!darfLoeschen(typ, m)) nichtLoeschbar[id] = m.systemKennung ? t('meldungen.dienst.systemrollen-lassen-sich-nicht-2') : t('meldungen.dienst.mappen-vom-typ-lassen-3', { wert: typ?.name ?? '' });
    }
    const v = { baum, kanten, geteilt, nichtLoeschbar };
    return { ...v, vorschlag: loeschVorschlag(v), papierkorbTage: await this.papierkorbTage() };
  }

  /**
   * Ausführen (#424): dieselbe Vorschau neu sammeln, Plan aus `auswahl` (Mappen-Id → loeschen |
   * entkoppeln | behalten; was fehlt, bleibt), dann in einem Vorgang: Verweise bleibender Mappen kappen
   * (für das Wiederherstellen gemerkt) und alle Mappen samt Dokumenten in den Papierkorb. Rechte und
   * Aufbewahrungsfristen werden dabei nie übergangen. Historie und Protokoll ohne Inhalte.
   */
  async loescheMitVerknuepften(startId: string, eingabe: unknown, benutzerId: string, z: Zugriff, quelle?: Ausloeser) {
    const e = (eingabe && typeof eingabe === 'object' ? eingabe : {}) as Record<string, unknown>;
    if (!e.auswahl || typeof e.auswahl !== 'object') throw new Fachfehler(422, t('meldungen.dienst.bitte-die-auswahl-angeben'));
    const v = await this.loeschVorschau(startId, e, z);
    const plan = planeLoeschung(v, liesLoeschAuswahl(e.auswahl));
    if (!plan.loeschen.length) throw new Fachfehler(422, t('meldungen.dienst.nach-dieser-auswahl-wird'), { plan });
    const weg = new Set(plan.loeschen);
    const gekappt = new Set(plan.entkoppeln.map((k) => `${k.quelleId}|${k.feldKey}|${k.zielId}`));
    // Zur Sicherheit je Mappe wie beim einzelnen Löschen prüfen – mit allen Verweisen, nicht nur denen im Baum.
    const mappen = new Map((await this.repo.holeMappen(plan.loeschen)).map((m) => [m.id, m] as const));
    for (const id of plan.loeschen) {
      const m = mappen.get(id);
      if (!m) throw new Fachfehler(409, t('meldungen.dienst.eine-der-mappen-gibt'));
      const alleRueck = await this.repo.rueckverweise(id);
      // Teile (#1031) gehen immer mit ihrer übergeordneten Mappe – abgewählt, nur entkoppelt oder ohne Recht (nicht im
      // Baum) lehnt Ablago ab und nennt nur die Anzahl (Ergänzung Sicherheit).
      const ohneTeile = new Set(alleRueck.filter((r) => r.quelleId !== id && !weg.has(r.quelleId) && istTeilVerweis(z.typen.get(r.quelleTypId), r.feldKey)).map((r) => r.quelleId));
      if (ohneTeile.size) throw new Fachfehler(409, t('meldungen.teile.mit-verknuepften-fehlen', { anzahl: ohneTeile.size, titel: m.titel || t('meldungen.dienst.ohne-titel') }));
      const rueck = alleRueck.filter((r) => !weg.has(r.quelleId) && !gekappt.has(`${r.quelleId}|${r.feldKey}|${id}`));
      const p = await this.loeschPruefung(m, z.typen.get(m.typId), rueck);
      if (!p.ok) throw new Fachfehler(p.status, t('meldungen.dienst.bitte-die-vorschau-neu', { wert: m.titel || t('meldungen.dienst.ohne-titel'), grund: p.grund }));
    }
    // Verweise bleibender Mappen entfernen (🔗 „nur Verweis entfernen“).
    const entkoppelt: Record<string, Array<{ quelleId: string; feldKey: string }>> = {};
    const jeQuelle = new Map<string, LoeschKante[]>();
    for (const k of plan.entkoppeln) jeQuelle.set(k.quelleId, [...(jeQuelle.get(k.quelleId) ?? []), k]);
    for (const [quelleId, ks] of jeQuelle) {
      const m = await this.pruefeRecht(z, quelleId, 'U');
      const typ = (await this.repo.holeTyp(m.typId))!;
      const werte = { ...m.werte };
      for (const k of ks) {
        const rest = alsListe(werte[k.feldKey]).filter((x) => x !== k.zielId);
        if (rest.length) werte[k.feldKey] = typ.felder.find((f) => f.key === k.feldKey)?.mehrfach ? rest : rest[0];
        else delete werte[k.feldKey];
        (entkoppelt[k.zielId] ??= []).push({ quelleId, feldKey: k.feldKey });
      }
      await this.schreibeVerweisWerte(typ, m, werte, benutzerId);
    }
    const vorgang = weg.has(startId) ? startId : randomUUID();
    const vorher = await this.lebendInhalt(plan.loeschen.map((id) => mappen.get(id)!));
    await this.repo.legeVorgangInPapierkorb(plan.loeschen, benutzerId, vorgang, entkoppelt);
    const kontext = await this.loeschKontext(benutzerId, { ...liesAnlass(e), ausloeser: quelle });
    await this.protokolliere(this.mappenEintraege(vorher, { schritt: 'papierkorb', weg: 'verknuepft', vorgang, startId: v.baum.knoten[0].id,
      verweise: Object.fromEntries(Object.entries(entkoppelt).map(([id, l]) => [id, l.length])) }), kontext);
    const start = v.baum.knoten[0];
    const z_ = plan.zahlen;
    const text = t('meldungen.dienst.mit-verknuepften-mappen-geloescht', { mappen: z_.mappen, wert: t('meldungen.dienst.mappen', { anzahl: z_.mappen }), dokumente: z_.dokumente, wert2: t('meldungen.dienst.dokumente', { anzahl: z_.dokumente }) });
    await this.repo.historieSchreibe(plan.loeschen.map((mappeId) => ({ mappeId, benutzerId, art: 'papierkorb' as const, daten: {
      vorgang, text, ...(mappeId === start.id ? { zahlen: z_ } : { start: start.id }),
    } })));
    // Ereigniskatalog (#670): je Mappe „gelöscht“ und „mit verknüpften Mappen gelöscht“ (gleicher Vorgang).
    for (const mappeId of plan.loeschen) {
      const typ = mappen.get(mappeId)?.typId ?? null;
      await this.ereignis('mappe.geloescht', { mappe: mappeId, typ }, benutzerId);
      await this.ereignis('mappe.geloescht_verknuepft', { mappe: mappeId, typ, vorgang, start: start.id }, benutzerId);
    }
    for (const typId of new Set([...mappen.values()].map((m) => m.typId))) {
      const typ = z.typen.get(typId);
      if (typ?.felder.some((f) => f.eindeutig)) await this.pruefeUnpassende(typ);
    }
    const tage = await this.papierkorbTage();
    if (!tage) await this.leere(plan.loeschen, benutzerId, false, { weg: 'ausgeschaltet', kontext });
    const erinnerung = await this.loeschErinnerungAn(v, plan, benutzerId);
    protokoll.modul('ablage').info(tage ? 'Mappe mit verknüpften Mappen in den Papierkorb gelegt' : 'Mappe mit verknüpften Mappen endgültig gelöscht', {
      von: benutzerId, start: startId, vorgang, mappen: z_.mappen, dokumente: z_.dokumente, verweiseEntfernt: z_.verweise,
      bleiben: { frist: z_.frist, ohneRecht: z_.ohneRecht, verweis: z_.gehalten, abgewaehlt: z_.abgewaehlt }, abgeschnitten: v.baum.abgeschnitten || undefined,
      erinnerung: erinnerung?.datum,
    });
    return { vorgang, endgueltig: !tage, zahlen: z_, loeschen: plan.loeschen, entkoppeln: plan.entkoppeln, erinnerung };
  }

  /**
   * Erinnerung zum Fristende (#424, Option D): Blieben Mappen wegen der Aufbewahrungsfrist stehen (und damit
   * die Start-Mappe), bekommt der Löschende an der Start-Mappe eine Erinnerung (#131) zum Tag nach dem
   * spätesten Fristende; dann steht sie als Aufgabe unter „Zu erledigen“. Gibt es dieselbe schon, keine zweite.
   */
  private async loeschErinnerungAn(v: LoeschVorschau, plan: LoeschPlan, benutzerId: string): Promise<{ id: string; datum: string; text: string } | null> {
    const x = loeschErinnerung(v, plan);
    if (!x) return null;
    const startId = v.baum.knoten[0].id;
    const da = (await this.repo.erinnerungen({ mappeId: startId, empfaengerId: benutzerId })).find((e) => e.text === x.text && e.datum === x.datum);
    if (da) return { id: da.id, datum: da.datum, text: da.text };
    const r = await this.repo.legeErinnerungAn({ id: randomUUID(), mappeId: startId, empfaengerId: benutzerId, datum: x.datum, text: x.text, erstellt: '', erstelltVon: benutzerId });
    await this.notiere(startId, benutzerId, 'aufgabe', { text: t('meldungen.dienst.erinnerung-fuer-am', { name: await this.name(benutzerId), datumDe: datumDe(x.datum), text: x.text }), aufgabenart: 'erinnerung', fuer: benutzerId, aufgabentext: x.text });
    return { id: r.id, datum: r.datum, text: r.text };
  }

  /** Verweisfelder einer Mappe neu schreiben (#424) – mit Historie, Titel und Passung wie beim Speichern. */
  private async schreibeVerweisWerte(typ: Mappentyp, m: Mappe, werte: Werte, von: string | null) {
    const aenderungen = await this.aenderungen(typ, m.werte, werte);
    const neu = await this.repo.aendereMappe(m.id, werte, [], von, { basis: m.werte, verweise: (w) => verweiseVon(typ, w) });
    if (aenderungen.length) await this.notiere(m.id, von, 'geaendert', { aenderungen, stand: neu.geaendert });
    await this.aktualisiereTitel([m.id]);
    await this.passungFuer(typ, [m.id]);
  }

  /** Beim Löschen entfernte Verweise wieder setzen (#424); liefert, wie viele nicht mehr gingen. */
  async verbindeWieder(zielId: string, liste: Array<{ quelleId: string; feldKey: string }>, von: string | null): Promise<{ wieder: number; entfallen: number }> {
    let wieder = 0; let entfallen = 0;
    const jeQuelle = new Map<string, string[]>();
    for (const x of liste) jeQuelle.set(x.quelleId, [...(jeQuelle.get(x.quelleId) ?? []), x.feldKey]);
    for (const [quelleId, felder] of jeQuelle) {
      const m = await this.repo.holeMappe(quelleId);
      const typ = m ? await this.repo.holeTyp(m.typId) : undefined;
      if (!m || !typ || !(await this.repo.holeMappe(zielId))) { entfallen += felder.length; continue; }
      const werte = { ...m.werte };
      for (const key of felder) {
        const f = typ.felder.find((x) => x.key === key && x.typ === 'referenz');
        const da = alsListe(werte[key]);
        if (!f) { entfallen++; continue; }
        if (da.includes(zielId)) { wieder++; continue; }
        if (f.mehrfach) { werte[key] = [...da, zielId]; wieder++; }
        else if (!da.length) { werte[key] = zielId; wieder++; }
        else entfallen++;
      }
      await this.schreibeVerweisWerte(typ, m, werte, von);
    }
    return { wieder, entfallen };
  }

  /**
   * Einen ganzen Vorgang (#424) wiederherstellen: alle Mappen mit ihren Dokumenten und Verweisen, dazu die
   * beim Löschen entfernten Verweise bleibender Mappen. Rechte wie beim einzelnen Wiederherstellen.
   */
  async stelleVorgangWiederHer(vorgang: string, ich: { id: string; rolle: string }, alle = false, quelle?: Ausloeser) {
    const eintraege = (await this.repo.papierkorb(alle && ich.rolle === 'admin' ? {} : { von: ich.id })).filter((e) => e.vorgang === vorgang);
    if (!istUuid(vorgang) || !eintraege.length) throw new Fachfehler(404, t('meldungen.dienst.diesen-vorgang-gibt-es'));
    const typen = new Map((await this.repo.listeTypen()).map((t) => [t.id, t] as const));
    const fehlt = eintraege.find((e) => !typen.has(e.typId));
    if (fehlt) throw new Fachfehler(409, t('meldungen.dienst.den-mappentyp-von-gibt', { wert: fehlt.titel || t('meldungen.dienst.ohne-titel') }));
    const ids = eintraege.map((e) => e.id);
    const { verweiseEntfallen } = await this.repo.stelleMehrereWiederHer(ids);
    await this.repo.historieSchreibe(ids.map((mappeId) => ({ mappeId, benutzerId: ich.id, art: 'wiederhergestellt' as const, daten: { vorgang } })));
    for (const e of eintraege) await this.ereignis('mappe.wiederhergestellt', { mappe: e.id, typ: e.typId }, ich.id);
    await this.protokolliere(eintraege.map((e) => this.wiederEintrag(e, typen.get(e.typId), vorgang)), await this.loeschKontext(ich.id, { ausloeser: quelle }));
    await this.aktualisiereTitel(ids);
    let wieder = 0; let entfallen = verweiseEntfallen;
    for (const e of eintraege) if (e.entkoppelt.length) { const r = await this.verbindeWieder(e.id, e.entkoppelt, ich.id); wieder += r.wieder; entfallen += r.entfallen; }
    for (const typId of new Set(eintraege.map((e) => e.typId))) await this.passungFuer(typen.get(typId)!, eintraege.filter((e) => e.typId === typId).map((e) => e.id));
    protokoll.modul('ablage').info('Vorgang aus dem Papierkorb wiederhergestellt', { von: ich.id, vorgang, mappen: ids.length, verweiseWieder: wieder, verweiseEntfallen: entfallen || undefined });
    return { mappen: ids.length, verweiseWieder: wieder, verweiseEntfallen: entfallen, startId: ids.includes(vorgang) ? vorgang : null };
  }
}
