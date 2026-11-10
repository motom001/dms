/**
 * Vertretung und das Bearbeiten von Aufgaben (#54, #77, #78, #415, #1078 aus dienst.ts): Empfänger auflösen, Aufgaben
 * Abwesender umleiten, übergeben, vergeben, erledigen, weitergeben (einzeln und gesammelt), gebündelte
 * Benachrichtigungen, „Zu erledigen“. Schicht 3 – Teile und Anschluss wie `AufgabenDienst` (aufgaben.dienst.ts).
 */
import { randomUUID } from 'node:crypto';
import { Fachfehler } from '../fehler';
import type { Kern, Zugriff } from '../kern';
import type { MappenDienst, MappenHistorie } from '../mappen';
import { protokoll } from '../protokoll';
import type { Repo } from '../repo';
import { t } from '../sprache';
import { NICHT_SICHTBAR, type ZugriffDienst } from '../zugriff';
import { type Abwesenheit, abwesenheitWirkt, type Aufgabe, AUFGABE_MAX, type Aufgabenart, type Benutzer, VERTRETER_SCHRITTE } from '../../../shared/src/model';
import { heuteIn } from '../../../shared/src/sichten';
import type { AufgabenAnschluss, AufgabenDienst, AufgabenTeile } from './aufgaben.dienst';

/** Sammel-Weitergabe (#415): höchstens so viele Aufgaben auf einmal; Schlüssel der Sammelbenachrichtigung. */
export const SAMMEL_MAX = 1000;
export const SAMMEL_WEITERGABE = 'weitergabe';

export class AufgabenVertretung {
  constructor(private readonly kern: Kern, private readonly teile: AufgabenTeile, private readonly anschluss: AufgabenAnschluss) {}

  private get repo(): Repo { return this.kern.repo; }
  private get konten() { return this.anschluss.konten(); }
  private name(benutzerId: string | null): Promise<string> { return this.kern.name(benutzerId); }
  private notiere(...a: Parameters<MappenHistorie['notiere']>) { return this.teile.historie.notiere(...a); }
  private ereignis(...a: Parameters<Kern['ereignis']>) { return this.anschluss.ereignis(...a); }
  private neueAufgabe(a: Aufgabe, typ?: string) { return this.teile.ereignisse.neueAufgabe(a, typ); }
  private pruefeEmpfaenger(id: unknown) { return this.teile.aufgaben.pruefeEmpfaenger(id); }
  private erledigeNachAnlass(...a: Parameters<AufgabenDienst['erledigeNachAnlass']>) { return this.teile.aufgaben.erledigeNachAnlass(...a); }
  private faelleNach(mappeIds: string[]) { return this.teile.ohneLeserecht.faelleNach(mappeIds); }
  private ohneLeserechtText<T extends Aufgabe>(liste: T[], lesbar: Set<string>, ich: string) { return this.teile.ohneLeserecht.ohneLeserechtText(liste, lesbar, ich); }
  private folgeterminVon(a: Aufgabe) { return this.teile.fristen.folgeterminVon(a); }
  private siehtOhneEmpfaenger(ich: { id: string; rolle: string }) { return this.teile.ohneEmpfaenger.siehtOhneEmpfaenger(ich); }
  private gesehen(...a: Parameters<MappenDienst['gesehen']>) { return this.teile.mappen.gesehen(...a); }
  private kannLesen(benutzerId: string, mappeId: string) { return this.teile.rechte.kannLesen(benutzerId, mappeId); }
  private lesbare(...a: Parameters<ZugriffDienst['lesbare']>) { return this.teile.rechte.lesbare(...a); }

  /**
   * Wer eine Aufgabe für `id` bekommt: der Benutzer selbst – oder, solange seine Abwesenheit wirkt
   * bzw. er deaktiviert ist, sein Vertreter. Ketten höchstens VERTRETER_SCHRITTE weit; bei einem
   * Kreis oder einem deaktivierten Vertreter bleibt sie beim letzten erreichbaren Empfänger.
   */
  async empfaengerAufloesen(id: string | null): Promise<{ ziel: string | null; abwesende: string[] }> {
    if (!id || !this.konten?.benutzer) return { ziel: id, abwesende: [] };
    const alle = new Map((await this.konten.benutzer()).map((b) => [b.id, b] as const));
    const heute = heuteIn();
    let ziel = id;
    const abwesende: string[] = [];
    const gesehen = new Set([id]);
    for (let i = 0; i < VERTRETER_SCHRITTE; i++) {
      const b = alle.get(ziel);
      if (!b || (b.aktiv && !abwesenheitWirkt(b.abwesenheit, heute))) break;
      const v = b.abwesenheit?.vertreterId;
      const vb = v ? alle.get(v) : undefined;
      if (!v || !vb || !vb.aktiv || gesehen.has(v)) break;
      abwesende.push(ziel); gesehen.add(v); ziel = v;
    }
    return { ziel, abwesende };
  }

  /** Neue Aufgabe eines Abwesenden an den Vertreter geben – wie „Weitergeben“, mit Protokolleintrag. Vertretungs-Aufgaben nie. */
  async leiteUm(a: Aufgabe): Promise<Aufgabe> {
    if (a.art === 'vertretung' || !a.empfaengerId) return a;
    const { ziel, abwesende } = await this.empfaengerAufloesen(a.empfaengerId);
    if (!ziel || ziel === a.empfaengerId) return a;
    await this.repo.delegiereAufgabe(a.id, ziel);
    const namen = (await Promise.all(abwesende.map((x) => this.name(x)))).join(', ');
    await this.notiere(a.mappeId, null, 'aufgabe', {
      text: t('meldungen.dienst.weitergegeben-wegen-abwesenheit-von', { namen, name: await this.name(ziel), text: a.text }),
      aufgabe: a.id, aufgabenart: a.art, vonId: a.empfaengerId, anId: ziel, aufgabentext: a.text,
    });
    protokoll.modul('ablage').info('Aufgabe wegen Abwesenheit weitergegeben', { mappeId: a.mappeId, von: namen, an: await this.name(ziel) });
    return (await this.repo.holeAufgabe(a.id)) ?? a;
  }

  /** „Passt nicht“-Aufgaben anlegen bzw. erledigen; neue für Abwesende gehen an deren Vertreter. */
  async passungsAufgaben(liste: Array<{ id: string; problem: string | null }>) {
    await this.repo.aufgabenZurPassung(liste);
    const ids = liste.filter((x) => x.problem).map((x) => x.id);
    if (!ids.length || !this.konten?.benutzer) return;
    for (const a of await this.repo.offeneAufgaben({ mappeIds: ids })) if (a.art === 'passung') await this.leiteUm(a);
  }

  /** Alle offenen Aufgaben eines Benutzers (ohne die der Administratoren) an einen anderen geben. */
  async aufgabenUebergeben(id: string, an: string, von: string | null): Promise<number> {
    const ziel = await this.pruefeEmpfaenger(an);
    if (!ziel || ziel === id) throw new Fachfehler(422, t('meldungen.dienst.bitte-einen-anderen-benutzer'));
    const offen = (await this.repo.offeneAufgaben({ benutzerId: id })).filter((a) => a.empfaengerId === id);
    for (const a of offen) {
      await this.repo.delegiereAufgabe(a.id, ziel);
      await this.notiere(a.mappeId, von, 'aufgabe', {
        text: t('meldungen.dienst.weitergegeben-von-an', { name: await this.name(id), name2: await this.name(ziel), text: a.text }),
        aufgabe: a.id, aufgabenart: a.art, vonId: id, anId: ziel, aufgabentext: a.text,
      });
    }
    if (offen.length) protokoll.modul('ablage').info('Offene Aufgaben übergeben', { von: await this.name(id), an: await this.name(ziel), anzahl: offen.length });
    await this.faelleNach(offen.map((a) => a.mappeId));
    return offen.length;
  }

  /**
   * Abwesenheit geändert (#78): Klartext im Protokoll der Benutzer-Mappe; die Aufgabe „Vertretung“
   * des bisherigen Vertreters erledigt sich, der aktuelle bekommt eine neue (nicht umgeleitet).
   */
  async abwesenheitGeaendert(b: Benutzer, alt: Abwesenheit, von: string | null, wegen?: string) {
    const neu = b.abwesenheit;
    if (!neu || JSON.stringify(neu) === JSON.stringify(alt)) return;
    const { benutzer: typ } = await this.kern.system();
    const m = await this.repo.holeMappe(b.id);
    if (!m || m.typId !== typ.id) return;
    const name = b.name || b.email;
    const datum = (t: string) => t.split('-').reverse().join('.');
    const zeitraum = (a: Abwesenheit) => (a.von && a.bis ? t('meldungen.dienst.vom-bis', { datum: datum(a.von), datum2: datum(a.bis) }) : a.von ? t('meldungen.dienst.ab-bis-die-abwesenheit', { datum: datum(a.von) })
      : a.bis ? t('meldungen.dienst.ab-sofort-bis', { datum: datum(a.bis) }) : t('meldungen.dienst.ab-sofort-bis-die'));
    const durch = von && von !== b.id ? t('meldungen.dienst.eingetragen-von', { name: await this.name(von) }) : '';
    const endet = alt.an && !neu.an;
    const text = endet ? t('meldungen.dienst.abwesenheit-beendet', { wert: wegen ? ` (${wegen})` : '' })
      : neu.an ? t('meldungen.dienst.abwesenheit-vertreter', { wert: alt.an ? t('meldungen.dienst.geaendert') : t('meldungen.dienst.eingetragen'), zeitraum: zeitraum(neu), name: await this.name(neu.vertreterId), durch })
      : t('meldungen.dienst.vertreter', { wert: neu.vertreterId ? t('meldungen.dienst.hinterlegt', { name: await this.name(neu.vertreterId) }) : t('meldungen.dienst.entfernt'), durch });
    await this.notiere(b.id, von, 'abwesenheit', { text });
    // Ereigniskatalog (#670): Abwesenheit gesetzt (auch geändert) bzw. beendet; Vertretung zurückgezogen (#678/#712)
    // für den bisherigen Vertreter, wenn die Abwesenheit endet oder ein anderer bzw. kein Vertreter eingetragen ist.
    const bisher = alt.an ? alt.vertreterId ?? null : null;
    const zurueck = bisher && (endet || !neu.an || neu.vertreterId !== bisher) ? bisher : null;
    if (endet) {
      await this.ereignis('benutzer.abwesenheit_beendet', { benutzer: b.id, vertreter: bisher }, von);
      // Aufgaben mit Anlass „Abwesenheit“ (#724, z. B. aus „Wenn Abwesenheit gesetzt“) erledigen sich.
      await this.erledigeNachAnlass(b.id, (x) => x.art === 'abwesenheit' && x.benutzer === b.id, t('meldungen.dienst.abwesenheit-beendet-2'));
    } else if (alt.an) {
      // Geändert (Zeitraum oder Vertreter): Was „Abwesenheit gesetzt“ angelegt hatte, erledigt sich; das Ereignis
      // unten legt es mit den neuen Angaben neu an – wie früher die Vertretungs-Aufgabe.
      await this.erledigeNachAnlass(b.id, (x) => x.art === 'abwesenheit' && x.benutzer === b.id, t('meldungen.dienst.vertretung-geaendert'));
    }
    if (zurueck) await this.ereignis('benutzer.vertretung_zurueckgezogen', { benutzer: b.id, vertreter: zurueck }, von);
    if (!endet && neu.an) await this.ereignis('benutzer.abwesenheit_gesetzt', { benutzer: b.id, von: neu.von, bis: neu.bis, vertreter: neu.vertreterId }, von);
    // Seit #712 legt der Kern keine Vertretungs-Aufgabe mehr an – das macht die Automatisierung „Vertretung eingetragen“
    // (Paket Benachrichtigungen bzw. beim Update übernommen). Alte Vertretungs-Aufgaben erledigen sich wie bisher.
    for (const a of (await this.repo.offeneAufgaben({ mappeIds: [b.id] })).filter((x) => x.art === 'vertretung')) {
      await this.repo.erledigeAufgabe(a.id, null);
      await this.notiere(b.id, null, 'aufgabe', { text: t('meldungen.dienst.erledigt', { wert: endet ? t('meldungen.dienst.abwesenheit-beendet-2') : t('meldungen.dienst.vertretung-geaendert'), text: a.text }), aufgabe: a.id, aufgabenart: 'vertretung', fuer: a.empfaengerId, aufgabentext: a.text });
    }
  }

  /** Aufgabe von Hand vergeben, z. B. „Bitte Rechnung prüfen“. */
  async legeAufgabeAn(mappeId: string, e: unknown, von: string | null): Promise<Aufgabe> {
    const m = await this.repo.holeMappe(mappeId);
    if (!m) throw new Fachfehler(404, t('meldungen.dienst.diese-mappe-gibt-es'));
    const x = (e ?? {}) as Record<string, unknown>;
    const text = typeof x.text === 'string' ? x.text.trim() : '';
    if (!text) throw new Fachfehler(422, t('meldungen.dienst.bitte-beschreiben-was-zu'));
    if (text.length > AUFGABE_MAX) throw new Fachfehler(422, t('meldungen.dienst.hoechstens-zeichen', { AUFGABE_MAX }));
    const an = await this.pruefeEmpfaenger(x.empfaengerId);
    // #928: Typ und Name nur einmal lesen (je eine Abfrage weniger).
    const a = await this.neueAufgabe({ id: randomUUID(), mappeId, empfaengerId: an, art: 'manuell', text, erstellt: '', erstelltVon: von, erledigt: null, erledigtVon: null }, m.typId);
    const name = await this.name(an);
    await this.notiere(mappeId, von, 'aufgabe', { text: t('meldungen.dienst.fuer', { name, text }), aufgabe: a.id, aufgabenart: 'manuell', fuer: an, aufgabentext: text });
    protokoll.modul('ablage').info('Aufgabe vergeben', { mappeId, an: name });
    const erg = await this.leiteUm(a);
    // #798: Darf der Empfänger die Mappe nicht lesen, entsteht ein Fall – der Admin erfährt davon.
    await this.faelleNach([mappeId]);
    return erg;
  }

  async eigeneAufgabe(id: string, ich: { id: string; rolle: string }) {
    const a = await this.repo.holeAufgabe(id);
    if (!a) throw new Fachfehler(404, t('meldungen.dienst.diese-aufgabe-gibt-es'));
    const meine = a.empfaengerId === ich.id || (!a.empfaengerId && await this.siehtOhneEmpfaenger(ich));
    if (!meine && ich.rolle !== 'admin') throw new Fachfehler(403, t('meldungen.dienst.das-ist-nicht-deine'));
    if (a.erledigt) throw new Fachfehler(409, t('meldungen.dienst.diese-aufgabe-ist-schon'));
    return a;
  }

  /** Bestätigen (Erwähnungen, manuelle Aufgaben). „Passt nicht“ erledigt sich, sobald die Mappe passt. */
  async erledigeAufgabe(id: string, ich: { id: string; rolle: string }) {
    const a = await this.eigeneAufgabe(id, ich);
    if (a.art === 'passung') throw new Fachfehler(409, t('meldungen.dienst.diese-aufgabe-erledigt-sich'));
    // „Geändert“ bestätigen (#422) = gesehen; ohne Eintrag in der Historie der Mappe.
    if (a.art === 'aenderung') { await this.gesehen(ich, [a.mappeId]); return (await this.repo.holeAufgabe(id))!; }
    await this.repo.erledigeAufgabe(id, ich.id);
    await this.notiere(a.mappeId, ich.id, 'aufgabe', { text: t('meldungen.dienst.erledigt-2', { text: a.text }), aufgabe: id, aufgabenart: a.art, fuer: a.empfaengerId, aufgabentext: a.text });
    protokoll.modul('ablage').info('Aufgabe erledigt', { mappeId: a.mappeId, aufgabe: a.text });
    await this.faelleNach([a.mappeId]);
    const folgetermin = await this.folgeterminVon(a);
    return { ...(await this.repo.holeAufgabe(id))!, ...(folgetermin ? { folgetermin } : {}) };
  }

  /** Weitergeben: durch den Empfänger selbst oder einen Administrator; steht im Protokoll. */
  async delegiereAufgabe(id: string, an: unknown, ich: { id: string; rolle: string }) {
    const a = await this.eigeneAufgabe(id, ich);
    const ziel = await this.pruefeEmpfaenger(an);
    if (ziel === a.empfaengerId) return a;
    await this.repo.delegiereAufgabe(id, ziel);
    const von = await this.name(a.empfaengerId), nach = await this.name(ziel);
    await this.notiere(a.mappeId, ich.id, 'aufgabe', { text: t('meldungen.dienst.weitergegeben-von-an-2', { von, nach, text: a.text }), aufgabe: id, aufgabenart: a.art, vonId: a.empfaengerId, anId: ziel, aufgabentext: a.text });
    protokoll.modul('ablage').info('Aufgabe weitergegeben', { mappeId: a.mappeId, von, an: nach, aufgabe: a.text });
    await this.faelleNach([a.mappeId]);
    return (await this.repo.holeAufgabe(id))!;
  }

  /**
   * Sammel-Weitergabe (#415, #419): mehrere Aufgaben an einen Benutzer. Je Aufgabe dieselben Rechte wie beim
   * einzelnen Weitergeben (eigene oder – als Administrator – alle); zusätzlich muss das Ziel die Mappe lesen
   * dürfen. Was nicht geht, kommt mit Grund zurück. Jede Weitergabe steht in der Historie ihrer Mappe; der
   * Empfänger bekommt dafür **eine** Sammelbenachrichtigung statt vieler einzelner.
   */
  async aufgabenWeitergeben(ids: unknown, an: unknown, ich: { id: string; rolle: string }): Promise<{
    weitergegeben: string[]; nicht: Array<{ id: string; grund: string }>;
  }> {
    if (!Array.isArray(ids) || !ids.length) throw new Fachfehler(422, t('meldungen.dienst.bitte-mindestens-eine-aufgabe'));
    if (ids.length > SAMMEL_MAX) throw new Fachfehler(422, t('meldungen.dienst.hoechstens-aufgaben-auf-einmal', { SAMMEL_MAX }));
    const ziel = await this.pruefeEmpfaenger(an);
    const nach = await this.name(ziel);
    const weitergegeben: string[] = [];
    const mappenWeiter: string[] = [];
    const nicht: Array<{ id: string; grund: string }> = [];
    for (const id of [...new Set(ids.map(String))]) {
      let a: Aufgabe;
      try { a = await this.eigeneAufgabe(id, ich); } catch (e) { if (!(e instanceof Fachfehler)) throw e; nicht.push({ id, grund: e.message }); continue; }
      if (a.empfaengerId === ziel) { nicht.push({ id, grund: t('meldungen.dienst.liegt-schon-bei', { nach }) }); continue; }
      // Lesen kann auch erst die Aufgabe selbst erlauben (Regel „hat eine Aufgabe“) – deshalb nach dem Umhängen
      // prüfen und bei Bedarf zurückhängen.
      await this.repo.delegiereAufgabe(id, ziel);
      if (!(await this.kannLesen(ziel, a.mappeId))) { await this.repo.delegiereAufgabe(id, a.empfaengerId); nicht.push({ id, grund: t('meldungen.dienst.darf-die-mappe-nicht', { nach }) }); continue; }
      const von = await this.name(a.empfaengerId);
      await this.notiere(a.mappeId, ich.id, 'aufgabe', { text: t('meldungen.dienst.weitergegeben-von-an-2', { von, nach, text: a.text }), aufgabe: id, aufgabenart: a.art, vonId: a.empfaengerId, anId: ziel, aufgabentext: a.text, sammel: true });
      weitergegeben.push(id);
      mappenWeiter.push(a.mappeId);
    }
    await this.faelleNach(mappenWeiter);
    if (weitergegeben.length) {
      protokoll.modul('ablage').info('Aufgaben gesammelt weitergegeben', { an: nach, anzahl: weitergegeben.length, nicht: nicht.length });
      if (ziel !== ich.id) await this.sammelHinweisWeitergabe(ziel, ich.id, weitergegeben.length);
    }
    return { weitergegeben, nicht };
  }

  /** Sammelaktion „erledigt“ (#415): wie erledigeAufgabe je Aufgabe; was nicht geht, mit Grund. */
  async aufgabenErledigen(ids: unknown, ich: { id: string; rolle: string }): Promise<{ erledigt: string[]; nicht: Array<{ id: string; grund: string }> }> {
    if (!Array.isArray(ids) || !ids.length) throw new Fachfehler(422, t('meldungen.dienst.bitte-mindestens-eine-aufgabe'));
    if (ids.length > SAMMEL_MAX) throw new Fachfehler(422, t('meldungen.dienst.hoechstens-aufgaben-auf-einmal', { SAMMEL_MAX }));
    const erledigt: string[] = [];
    const nicht: Array<{ id: string; grund: string }> = [];
    for (const id of [...new Set(ids.map(String))]) {
      try { await this.erledigeAufgabe(id, ich); erledigt.push(id); } catch (e) { if (!(e instanceof Fachfehler)) throw e; nicht.push({ id, grund: e.message }); }
    }
    return { erledigt, nicht };
  }

  /**
   * Gebündelte Benachrichtigung (#415, #419; auch #422): eine offene Aufgabe je Empfänger, Mappe, Art und
   * Schlüssel. Ist schon eine offen, kommt keine zweite – `text` bekommt die bisherige und baut daraus den neuen
   * Text (etwa hochgezählt). Erst wenn der Empfänger sie erledigt hat, entsteht bei Bedarf wieder eine neue.
   */
  async benachrichtigeGebuendelt(e: { empfaengerId: string; mappeId: string; art: Aufgabenart; schluessel: string; von: string | null; text: (bisher: Aufgabe | undefined) => string | Promise<string> }) {
    const offen = (await this.repo.offeneAufgaben({ mappeIds: [e.mappeId] })).find((a) => a.art === e.art && a.feldKey === e.schluessel && a.empfaengerId === e.empfaengerId);
    const text = (await e.text(offen)).slice(0, AUFGABE_MAX);
    if (offen) { if (offen.text !== text) await this.repo.aendereAufgabeText(offen.id, text); return offen.id; }
    const a = await this.neueAufgabe({ id: randomUUID(), mappeId: e.mappeId, empfaengerId: e.empfaengerId, art: e.art, feldKey: e.schluessel, text, erstellt: '', erstelltVon: e.von, erledigt: null, erledigtVon: null });
    return a.id;
  }

  /** Sammelbenachrichtigung der Weitergabe: an der Benutzer-Mappe dessen, der weitergegeben hat (#415). */
  private async sammelHinweisWeitergabe(ziel: string, von: string, n: number) {
    if (!(await this.repo.holeMappe(von))) return;
    const name = await this.name(von);
    await this.benachrichtigeGebuendelt({
      empfaengerId: ziel, mappeId: von, art: 'manuell', schluessel: SAMMEL_WEITERGABE, von,
      text: (bisher) => {
        const gesamt = n + Number(/(\d+) Aufgaben/.exec(bisher?.text ?? '')?.[1] ?? (bisher ? 1 : 0));
        return t('meldungen.dienst.hat-dir-aufgaben-weitergegeben', { anzahl: gesamt, name });
      },
    });
  }

  /** Meine offenen Aufgaben (mit denen der Administratoren, wenn ich einer bin). */
  async meineAufgaben(ich: { id: string; rolle: string }, z?: Zugriff) {
    const liste = await this.repo.offeneAufgaben({ benutzerId: ich.id, admin: await this.siehtOhneEmpfaenger(ich) });
    // Aufgaben zu Mappen, die man nicht lesen darf: ohne Titel (#127); automatische nur mit Hinweis (#798).
    const ok = await this.lesbare(z, liste.map((a) => a.mappeId));
    return (await this.ohneLeserechtText(liste, ok, ich.id)).map((a) => (ok.has(a.mappeId) ? a : { ...a, mappeTitel: NICHT_SICHTBAR, verborgen: true }));
  }
}
