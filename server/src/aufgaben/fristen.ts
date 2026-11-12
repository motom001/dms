/**
 * Fristen, Erinnerungen und Termine (#129–#133, #528, #725, #1078 aus dienst.ts): Frist-Aufgaben abgleichen, „Frist
 * erreicht“ melden, freie Erinnerungen, die Termine für „Zu erledigen“ mit ihrem Zwischenspeicher, Folgetermine.
 * Schicht 3 – Teile und Anschluss wie `AufgabenDienst` (aufgaben.dienst.ts); dazu die beiden Stände des Haushalts.
 */
import { Fachfehler } from '../fehler';
import type { Kern, Zugriff } from '../kern';
import type { MappenDienst, MappenHistorie } from '../mappen';
import { kontext, protokoll } from '../protokoll';
import type { FristKandidat, Repo } from '../repo';
import { t } from '../sprache';
import { fingerabdruck, type Haushaltsstand, mitFavoriten, Zaehlerspeicher } from '../zaehlerspeicher';
import type { ZugriffDienst } from '../zugriff';
import { type Bundesland, feiertageZwischen } from '../../../shared/src/feiertage';
import { datumDe, folgetermine, fristAb, fristEmpfaenger, fristFelder, fristText, istDatum, naechsterTermin, type Termin, type TermineAntwort } from '../../../shared/src/fristen';
import { zeitraumProblem } from '../../../shared/src/kalender';
import type { Aufgabe, Feld, Mappe } from '../../../shared/src/model';
import { heuteIn, verschiebe } from '../../../shared/src/sichten';
import type { AufgabenAnschluss, AufgabenTeile } from './aufgaben.dienst';

/** Startseite (#918): der nächste Termin erst in so vielen Tagen gesucht, nur ohne Treffer im ganzen Jahr. */
export const NAECHSTER_TERMIN_ERST_TAGE = 31;

/** Stände des Haushalts für den Zwischenspeicher der Termine (#742, #918) – die des Dienstes. */
export interface FristenStaende { stand: Haushaltsstand; mappenstand: Haushaltsstand }

export class Fristen {
  /** Termine (#528, #725): Zwischenspeicher je Benutzer, Rechte und Zeitraum. */
  private readonly termineSpeicher: Zaehlerspeicher<Termin[]>;
  /** Termine „nur Favoriten“ (bzw. ein Lesefilter mit Favoriten): am Haushaltsstand (#918). */
  private readonly termineFavSpeicher: Zaehlerspeicher<Termin[]>;

  constructor(private readonly kern: Kern, private readonly teile: AufgabenTeile, private readonly anschluss: AufgabenAnschluss, staende: FristenStaende) {
    this.termineSpeicher = new Zaehlerspeicher<Termin[]>(staende.mappenstand);
    this.termineFavSpeicher = new Zaehlerspeicher<Termin[]>(staende.stand);
  }

  private get repo(): Repo { return this.kern.repo; }
  private notiere(...a: Parameters<MappenHistorie['notiere']>) { return this.teile.historie.notiere(...a); }
  private inTransaktion<T>(f: () => Promise<T>): Promise<T> { return this.kern.inTransaktion(f); }
  private ereignis(...a: Parameters<Kern['ereignis']>) { return this.anschluss.ereignis(...a); }
  private gueltigkeit() { return this.anschluss.gueltigkeit(); }
  private siehtOhneEmpfaenger(ich: { id: string; rolle: string }) { return this.teile.ohneEmpfaenger.siehtOhneEmpfaenger(ich); }
  private lesbare(...a: Parameters<ZugriffDienst['lesbare']>) { return this.teile.rechte.lesbare(...a); }
  private aendereMappe(...a: Parameters<MappenDienst['aendereMappe']>) { return this.teile.mappen.aendereMappe(...a); }

  /**
   * Frist-Aufgaben abgleichen: offene Fristen erledigen sich, sobald das Datum nicht mehr stimmt; „Frist erreicht“
   * melden. Neue Frist-Aufgaben legt seit #712 nur noch die Automatisierung „Datum erreicht“ an.
   * Nach dem Speichern einer Mappe, nach Änderungen am Mappentyp und regelmäßig (täglicher Lauf).
   */
  async fristenAbgleichen(f: { typId?: string; mappeIds?: string[] } = {}, heute = heuteIn()): Promise<{ angelegt: number; erledigt: number }> {
    const typen = new Map((await this.repo.listeTypen()).map((t) => [t.id, t] as const));
    let mappen: Mappe[];
    if (f.mappeIds) mappen = await this.repo.holeMappen(f.mappeIds);
    else {
      // Typen mit Erinnerung – und solche, an denen noch offene Fristen hängen (Erinnerung abgeschaltet).
      const offen = new Set((await this.repo.fristAufgaben()).filter((a) => !a.erledigt).map((a) => a.typId));
      const welche = [...typen.values()].filter((t) => (!f.typId || t.id === f.typId) && (fristFelder(t).length || offen.has(t.id)));
      mappen = (await Promise.all(welche.map((t) => this.repo.listeMappen(t.id)))).flat();
    }
    if (!mappen.length) return { angelegt: 0, erledigt: 0 };
    const vorhanden = await this.repo.fristAufgaben(f.mappeIds ?? (f.typId ? mappen.map((m) => m.id) : undefined));
    const angelegt = 0; let erledigt = 0;
    for (const m of mappen) {
      const typ = typen.get(m.typId);
      if (!typ) continue;
      // Offene Fristen, deren Datum sich geändert hat oder leer ist: erledigt.
      for (const a of vorhanden.filter((x) => x.mappeId === m.id && !x.erledigt)) {
        const feld = typ.felder.find((x) => x.key === a.feldKey);
        const wert = a.feldKey ? m.werte[a.feldKey] : null;
        // Aus einer Automatisierung (Anlass Datum): erledigt sich nur, wenn das Datum nicht mehr stimmt.
        const giltNoch = a.anlass?.art === 'datum' ? !!feld : !!feld?.frist;
        if (giltNoch && wert === a.datum) continue;
        const grund = !feld ? t('meldungen.dienst.feld-entfernt') : !giltNoch ? t('meldungen.dienst.keine-erinnerung-mehr') : !istDatum(wert) ? t('meldungen.dienst.datum-leer') : wert > (a.datum ?? '') ? t('meldungen.dienst.verschoben-auf', { datumDe: datumDe(wert) }) : t('meldungen.dienst.geaendert-auf', { datumDe: datumDe(wert) });
        await this.repo.erledigeAufgabe(a.id, null);
        await this.notiere(m.id, null, 'aufgabe', { text: t('meldungen.dienst.erledigt-3', { grund, text: a.text }), aufgabe: a.id, aufgabenart: 'frist', fuer: a.empfaengerId, aufgabentext: a.text });
        erledigt++;
      }
      for (const feld of fristFelder(typ)) {
        const wert = m.werte[feld.key];
        const fr = feld.frist!;
        // Ereigniskatalog (#670): „Frist erreicht“ zum Erinnerungszeitpunkt und am Tag selbst – je Zeitpunkt genau einmal.
        if (istDatum(wert) && !m.demo && wert >= heute && fristAb(wert, fr) <= heute) {
          const an = fristEmpfaenger(fr, m);
          await this.fristErreicht(m, feld.key, wert, 'vorlauf', an);
          if (wert === heute) await this.fristErreicht(m, feld.key, wert, 'faellig', an);
        }
        // #712: Das Feld legt keine Aufgaben mehr selbst an – das tun die Automatisierungen „Datum erreicht“, in die
        // jede Erinnerung am Feld beim Update übernommen wurde (Automatisierungen.fristenUebernehmen).
      }
    }
    if (angelegt || erledigt) protokoll.modul('ablage').info('Fristen abgeglichen', { angelegt, erledigt });
    return { angelegt, erledigt };
  }

  /**
   * „Frist erreicht“ (#670): Merken und Ereignis in einer Transaktion – auch wenn zwei Server den Fristen-Lauf zugleich
   * machen oder er nach einem Neustart wiederholt wird, kommt es je Mappe, Feld, Datum und Zeitpunkt genau einmal.
   */
  private async fristErreicht(m: Mappe, feld: string, datum: string, zeitpunkt: 'vorlauf' | 'faellig', empfaenger: string | null) {
    try {
      await this.inTransaktion(async () => {
        if (!(await this.repo.merkeFristMeldung({ mappeId: m.id, feld, datum, zeitpunkt }))) return;
        await this.ereignis('frist.erreicht', { mappe: m.id, typ: m.typId, feld, datum, zeitpunkt, empfaenger });
      });
    } catch (e) { protokoll.modul('ablage').warn('„Frist erreicht“ nicht gemeldet', { mappe: m.id, feld, fehler: (e as Error).message }); }
  }

  /**
   * Täglicher (bzw. stündlicher) Lauf: Fristen und fällige Mappen-Abläufe (#1044; früher freie Erinnerungen, #131 – sie
   * sind seit dem Update Abläufe der Vorlage „Erinnern“ und werden am Datum dieselbe Aufgabe „Erinnerung“).
   */
  async fristenLauf(heute = heuteIn()) {
    const f = await this.fristenAbgleichen({}, heute);
    const erinnerungen = await this.teile.ablaeufe.faellige(heute);
    await this.teile.ablaeufe.raeumeAuf();
    return { ...f, erinnerungen };
  }

  /**
   * Termine für „Zu erledigen“ → Monat und Jahr (#528, #725): von … bis (höchstens ein Jahr), nach Datum.
   *
   * - Eigene offene Aufgaben mit Datum (Fristen, Erinnerungen, andere wie „Auskunft bis …“) – Überfälliges auch
   *   außerhalb des Zeitraums (für „3 überfällig“).
   * - Die Daten der Frist-Felder („ist eine Frist“, #712) an allen Mappen, die man **lesen darf** – der Empfänger
   *   am Feld ist mit #712 weggefallen –, dazu die künftigen Termine wiederkehrender Fristen; `favoriten` grenzt
   *   auf die eigenen Favoriten ein.
   * - Eigene freie Erinnerungen und die Feiertage der Region (#726).
   *
   * Eine Vorschau „demnächst“ gibt es nicht mehr (#725): Automatisierungen legen die Aufgabe zum richtigen
   * Zeitpunkt in „Zu erledigen“.
   *
   * Zwischengespeichert wie die Zahlen der Ansichten (#512): je Benutzer, Rechte und Zeitraum, solange sich
   * am Haushalt nichts ändert (auch Erinnerungen zählen hier), höchstens 5 Minuten, nie über Mitternacht.
   */
  async termine(z: Zugriff, q: { von?: unknown; bis?: unknown; favoriten?: unknown } = {}, land?: Bundesland | null): Promise<TermineAntwort> {
    const heute = heuteIn();
    const problem = zeitraumProblem(q.von, q.bis);
    if (problem) throw new Fachfehler(422, problem);
    const von = q.von as string; const bis = q.bis as string;
    const nurFavoriten = q.favoriten === true || q.favoriten === '1' || q.favoriten === 'true';
    // #719: Sieht er die Aufgaben ohne Empfänger? Das ändert sich mit der Werkbank, nicht mit dem Haushaltsstand.
    const ohne = await this.siehtOhneEmpfaenger(z.ich);
    const schluessel = `${z.ich.id}|${z.ich.rolle}|${ohne ? 'o' : ''}|${fingerabdruck({ lesen: z.lesen, paket: z.paket?.id ?? null })}|${von}|${bis}|${nurFavoriten ? 'f' : 'a'}`;
    const beginn = performance.now();
    // #918: ohne Favoriten am Mappenstand – ein Stern rechnet die Termine nicht neu.
    const speicher = nurFavoriten || mitFavoriten(z.lesen) ? this.termineFavSpeicher : this.termineSpeicher;
    const r = await speicher.hole(schluessel, async () => ({ wert: await this.sammleTermine(z, heute, von, bis, nurFavoriten), zeitabhaengig: true }), this.gueltigkeit());
    const k = kontext.getStore();
    if (k) k.zwischenspeicher = { art: r.art, ms: performance.now() - beginn };
    return { heute, von, bis, eintraege: r.wert, feiertage: feiertageZwischen(von, bis, land) };
  }

  /**
   * Startseite (#725): der nächste Termin ab heute (innerhalb eines Jahres) und die Zahl des Überfälligen.
   *
   * #918: erst die nächsten 31 Tage, nur ohne Termin darin das ganze Jahr. Das Ergebnis ist dasselbe: Jeder Termin der
   * 31 Tage ist auch einer des Jahres, alles danach ist später; Überfälliges kommt in jedem Zeitraum ganz mit, und bei
   * gleichem Datum ordnet `sammleTermine` eindeutig. Ein Jahr umfasst bei jährlichen Fristen jede Mappe, 31 Tage nur
   * die mit einem Termin in diesen Monaten.
   */
  async naechsterTermin(z: Zugriff): Promise<{ termin: Termin | null; ueberfaellig: number }> {
    const heute = heuteIn();
    const aus = (t: TermineAntwort) => ({ termin: t.eintraege.find((x) => x.datum >= heute) ?? null, ueberfaellig: t.eintraege.filter((x) => x.faellig && x.datum < heute).length });
    const nah = aus(await this.termine(z, { von: heute, bis: verschiebe(heute, NAECHSTER_TERMIN_ERST_TAGE) }));
    return nah.termin ? nah : aus(await this.termine(z, { von: heute, bis: verschiebe(heute, 365) }));
  }

  private async sammleTermine(z: Zugriff, heute: string, von: string, bis: string, nurFavoriten: boolean): Promise<Termin[]> {
    const ich = z.ich.id;
    const ohne = await this.siehtOhneEmpfaenger(z.ich);
    const ab = von > heute ? von : heute;
    const erg: Termin[] = [];
    // Schon fällig: eigene offene Aufgaben mit Datum. Überfälliges immer, sonst nur im Zeitraum.
    const offen = (await this.repo.offeneAufgaben({ benutzerId: ich, admin: ohne })).filter((a) => istDatum(a.datum) && a.datum <= bis && (a.datum < heute || a.datum >= von));
    const lesbar = await this.lesbare(z, offen.map((a) => a.mappeId));
    for (const a of offen) {
      if (!lesbar.has(a.mappeId)) continue;
      const art = a.art === 'frist' || a.art === 'erinnerung' ? a.art : 'aufgabe';
      erg.push({ art, datum: a.datum!, ab: a.erstellt.slice(0, 10), text: a.text, mappeId: a.mappeId, mappeTitel: a.mappeTitel ?? '', typId: a.typId ?? '', faellig: true, feldKey: a.feldKey ?? null });
    }
    // Frist-Felder an lesbaren Mappen (#725: „lesen darf“ statt „für mich“), mit künftigen Terminen
    // wiederkehrender Fristen (#528), gerechnet vom eingetragenen Datum.
    for (const typ of [...z.typen.values()].filter((x) => fristFelder(x).length)) {
      const felder = fristFelder(typ);
      const wiederkehrend = felder.filter((f) => f.frist!.wiederholung);
      const termine = (m: FristKandidat, f: Feld): Array<{ datum: string; folge: boolean }> => {
        const w = m.werte[f.key];
        if (!istDatum(w)) return [];
        const x = w >= ab && w <= bis ? [{ datum: w, folge: false }] : [];
        return wiederkehrend.includes(f) ? [...x, ...folgetermine(w, f.frist!.wiederholung!, ab, bis).map((d) => ({ datum: d, folge: true }))] : x;
      };
      // Nur Mappen, die im Zeitraum einen Termin haben können (#477, #918: Vorfilter fristtermine, auch für
      // wiederkehrende Fristen), und von ihnen nur Titel und Datumswerte. Entschieden wird hier, mit `termine`.
      const kandidaten = await this.repo.fristKandidaten(typ.id, felder.map((f) => ({ key: f.key, monate: f.frist!.wiederholung ?? null })), ab, bis);
      let passend = kandidaten.filter((m) => felder.some((f) => termine(m, f).length));
      if (nurFavoriten && passend.length) { const fav = await this.repo.favoritenVon(ich, passend.map((m) => m.id)); passend = passend.filter((m) => fav.has(m.id)); }
      if (!passend.length) continue;
      const ok = await this.lesbare(z, passend.map((m) => m.id));
      const schon = new Set(erg.filter((x) => x.faellig && x.feldKey).map((x) => `${x.mappeId}|${x.feldKey}|${x.datum}`));
      for (const m of passend) {
        if (!ok.has(m.id)) continue;
        for (const f of felder) {
          for (const t of termine(m, f)) {
            if (schon.has(`${m.id}|${f.key}|${t.datum}`)) continue;
            erg.push({ art: 'frist', datum: t.datum, ab: t.datum, text: fristText(f.frist!, f, t.datum, m.titel ?? ''), mappeId: m.id, mappeTitel: m.titel ?? '', typId: m.typId, faellig: false, feldKey: f.key, ...(t.folge ? { folgetermin: true } : {}) });
          }
        }
      }
    }
    // Eigene geplante Abläufe (#1044, früher freie Erinnerungen): an mich bzw. ohne gefragten Empfänger von mir angelegt.
    const erinnerungen = (await this.repo.ablaeufe({ bis })).filter((e) => e.datum >= von && (e.empfaengerId ?? e.erstelltVon) === ich);
    const ok = await this.lesbare(z, erinnerungen.map((e) => e.mappeId));
    for (const e of erinnerungen) {
      if (!ok.has(e.mappeId)) continue;
      erg.push({ art: 'erinnerung', datum: e.datum, ab: e.datum, text: e.text, mappeId: e.mappeId, mappeTitel: e.mappeTitel ?? '', typId: e.typId ?? '', faellig: false, erinnerungId: e.id });
    }
    let liste = erg;
    if (nurFavoriten) { const fav = await this.repo.favoritenVon(ich, [...new Set(erg.map((x) => x.mappeId))]); liste = erg.filter((x) => fav.has(x.mappeId)); }
    // Eindeutige Reihenfolge (#918): bei gleichem Datum und Titel fällige Aufgaben, Fristen, Erinnerungen, dann nach
    // Mappe, Feld und Erinnerung – unabhängig davon, in welcher Reihenfolge die Datenbank liefert.
    const rang = (x: Termin) => (x.faellig ? 0 : x.art === 'frist' ? 1 : 2);
    const vgl = (a?: string | null, b?: string | null) => ((a ?? '') < (b ?? '') ? -1 : (a ?? '') > (b ?? '') ? 1 : 0);
    liste.sort((a, b) => a.datum.localeCompare(b.datum) || a.mappeTitel.localeCompare(b.mappeTitel, 'de') || rang(a) - rang(b)
      || vgl(a.mappeId, b.mappeId) || vgl(a.feldKey, b.feldKey) || vgl(a.erinnerungId, b.erinnerungId) || vgl(a.text, b.text) || vgl(a.ab, b.ab));
    return liste;
  }

  /** Wiederkehrende Frist (#130): Vorschlag für den nächsten Termin, solange das Datum noch das der Frist ist. */
  async folgeterminVon(a: Aufgabe): Promise<string | null> {
    if (a.art !== 'frist' || !a.feldKey || !a.datum) return null;
    const m = await this.repo.holeMappe(a.mappeId);
    const typ = m ? await this.repo.holeTyp(m.typId) : undefined;
    const w = a.anlass?.art === 'datum' ? a.anlass.wiederholung : typ?.felder.find((f) => f.key === a.feldKey)?.frist?.wiederholung;
    return w && m && m.werte[a.feldKey] === a.datum ? naechsterTermin(a.datum, w) : null;
  }

  /** „Datum auf … setzen“ (#130): nie automatisch, nur auf Klick – mit Eintrag im Protokoll wie jede Änderung. */
  async setzeFolgetermin(aufgabeId: string, ich: { id: string; rolle: string }, z?: Zugriff) {
    const a = await this.repo.holeAufgabe(aufgabeId);
    if (!a) throw new Fachfehler(404, t('meldungen.dienst.diese-aufgabe-gibt-es'));
    const naechster = await this.folgeterminVon(a);
    if (!naechster) throw new Fachfehler(409, t('meldungen.dienst.das-datum-hat-sich'));
    return this.aendereMappe(a.mappeId, { werte: { [a.feldKey!]: naechster } }, ich.id, z);
  }
}
