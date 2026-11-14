/**
 * Mappen-Abläufe aus Automatisierungsvorlagen (#1044): „Aufgabe vergeben“, „Erinnern“, „Wiedervorlage“ und eigene
 * Vorlagen, angewendet an einer Mappe. Löst die freien Erinnerungen (#131) und das Vergeben von Hand ab – es gibt nur
 * noch einen Weg. Schicht 3 – Teile und Anschluss wie `AufgabenDienst` (aufgaben.dienst.ts).
 *
 * - **Vorlagen:** Kern-Vorgaben (`aufgabe_vergeben`, `erinnern`) gibt es immer; gespeichert wird eine nur, wenn ein Admin
 *   sie ändert oder ein Paket sie überlagert. Dazu eigene Vorlagen und solche aus Paketen.
 * - **Anwenden:** prüft die Antworten wie bisher die Dialoge. „Sofort“ läuft in derselben Anfrage (genauso schnell wie
 *   früher); sonst entsteht ein Ablauf, der im Bereich „Geplant“ der Mappe steht, bis er läuft.
 * - **Rechte zur Laufzeit** (Sicherheit): Ein Ablauf läuft mit den Rechten der Person, die ihn angelegt hat, geprüft
 *   **wenn er läuft** – ist sie deaktiviert, kein Mensch oder darf sie die Mappe nicht mehr lesen, bleibt er
 *   „angehalten“ stehen (Hinweis an die Verwaltung). Kein gespeicherter Zugriff, nie das Systemkonto.
 * - **Empfänger:** aktive Benutzer; wer die Mappe nicht lesen darf, bekommt die Aufgabe mit dem Hinweis aus #798 (von
 *   Hand geschriebener Text bleibt sichtbar). Platzhalter der Vorlage füllt der Motor mit den Rechten der Person **und**
 *   des Empfängers (#795, `ablaufPlatzhalter`); die Eingabe beim Anwenden setzt er nie als Platzhalter ein.
 * - **Gleiches Verhalten wie bisher:** dieselben Aufgaben (Art „manuell“ bzw. „Erinnerung“, Ersteller = Person),
 *   dieselben Einträge in der Historie, Vertretung (`leiteUm`), Fälle ohne Leserecht und Tägliche Zusammenfassung.
 * - **Bremse:** höchstens `ABLAEUFE_JE_PERSON_UND_MAPPE` offene je Person und Mappe und `ABLAEUFE_JE_MINUTE`
 *   angewendete je Person und Minute (grenzen.ts).
 */
import { randomUUID } from 'node:crypto';
import { Fachfehler } from '../fehler';
import { ABLAEUFE_JE_MINUTE, ABLAEUFE_JE_PERSON_UND_MAPPE } from '../grenzen';
import type { Kern, Zugriff } from '../kern';
import type { MappenHistorie } from '../mappen';
import { protokoll } from '../protokoll';
import { istUuid, type Repo } from '../repo';
import { t, tAuto } from '../sprache';
import type { ZugriffDienst } from '../zugriff';
import {
  type AblaufAngehalten, type AblaufAntworten, type AblaufProbe, type AblaufVerlauf, type Ablaufvorlage, type AblaufvorlageAnsicht, type AblaufvorlageDaten, bereinigeVorlage,
  fragtDatum, istKernVorlage, kernVorlage, KERN_VORLAGEN, laeuftAm, type MappenAblauf, VORLAGEN_GRENZEN, VORLAGEN_REIHENFOLGE, vorlageKurz, vorlagenEingabeFehler, vorlagenProbleme,
  type VorlageZumAnwenden, type VorlagenEmpfaenger, type VorlagenKarte,
} from '../../../shared/src/ablaufvorlagen';
import { AUTOMATISIERUNG_GRENZEN } from '../../../shared/src/automatisierung';
import { datumDe, ERINNERUNG_TEXT_MAX, istDatum } from '../../../shared/src/fristen';
import { type Aufgabe, AUFGABE_MAX, type Mappe, type Mappentyp } from '../../../shared/src/model';
import { heuteIn } from '../../../shared/src/sichten';
import type { AufgabenAnschluss, AufgabenTeile } from './aufgaben.dienst';
import { type PaketAblaufvorlage, vorlagenAusPaket } from './ablaufvorlagen-paket';

export type { PaketAblaufvorlage } from './ablaufvorlagen-paket';

const log = protokoll.modul('ablage');

/**
 * Platzhalter füllen (#795) – der Motor (automatisierung.ts) setzt das: mit den Rechten der Person (`z`) und, mit `empf`,
 * zusätzlich mit denen des Empfängers. Ohne Motor (Tests) bleiben Platzhalter der Vorlage stehen.
 */
export type AblaufPlatzhalter = (text: string, c: { name: string; mappe: Mappe; typ: Mappentyp | null; z: Zugriff; daten: Record<string, unknown> }, empf: Zugriff | null) => Promise<{ text: string; verborgen: number; mappe: boolean }>;

/** Feste Platzhalter einer Vorlage – vor dem Motor durch Marken ersetzt, damit Eingaben nie selbst Platzhalter werden. */
const MARKE = (k: string) => `\u0000${k}\u0000`;

/** Was ein Lauf braucht: Mappe, Person (mit Zugriff) und die Antworten. */
interface Lauf { v: Ablaufvorlage; mappe: Mappe; typ: Mappentyp | null; person: string; z: Zugriff; empfaengerId: string | null; text: string; datum: string | null; sofort: boolean }

/** Stand einer Vorlage in einer Fassung (#1006) – wie bis Migration 108 in `ablaufvorlage_fassungen`. */
const fassungsStand = (v: Ablaufvorlage) => ({ name: v.name, reihenfolge: v.reihenfolge, aktiv: v.aktiv, beschreibung: v.beschreibung, typen: v.typen, wann: v.wann, fragen: v.fragen, karten: v.karten });

/** Kern-Vorgabe als Vorlage (unverändert, ohne gespeicherten Stand). */
function kernStandard(k: (typeof KERN_VORLAGEN)[number]): Ablaufvorlage {
  return { ...kernVorlage(k), kennung: k, aktiv: true, herkunft: 'kern', paketId: null, version: 0, geaendert: null, geaendertVon: null };
}

export class MappenAblaeufe {
  constructor(private readonly kern: Kern, private readonly teile: AufgabenTeile, private readonly anschluss: AufgabenAnschluss) {}

  private get repo(): Repo { return this.kern.repo; }
  private get konten() { return this.anschluss.konten(); }
  private name(id: string | null) { return this.kern.name(id); }
  private notiere(...a: Parameters<MappenHistorie['notiere']>) { return this.teile.historie.notiere(...a); }
  private get rechte(): ZugriffDienst { return this.teile.rechte; }
  private jetzt() { return new Date().toISOString(); }

  /* ---------- Vorlagen ---------- */

  /** Alle Vorlagen: die Kern-Vorgaben (gespeichert, wenn geändert bzw. überlagert), dazu eigene und aus Paketen. */
  async vorlagen(): Promise<Ablaufvorlage[]> {
    const gespeichert = await this.repo.ablaufvorlagen();
    const kern = KERN_VORLAGEN.map((k) => gespeichert.find((v) => v.kennung === k) ?? kernStandard(k));
    return [...kern, ...gespeichert.filter((v) => !istKernVorlage(v.kennung))]
      .sort((a, b) => a.reihenfolge - b.reihenfolge || a.name.localeCompare(b.name, 'de') || a.kennung.localeCompare(b.kennung));
  }

  async vorlage(kennung: string): Promise<Ablaufvorlage> {
    const v = (await this.vorlagen()).find((x) => x.kennung === kennung);
    if (!v) throw new Fachfehler(404, tAuto('automatisierung.vorlage.fehlt'));
    return v;
  }

  /** Für das Menü „Mappe“: eingeschaltete, gültige Vorlagen dieses Mappentyps. */
  async zumAnwenden(typId: string): Promise<VorlageZumAnwenden[]> {
    return this.zumAnwendenAus(await this.vorlagen(), typId, await this.repo.listeTypen());
  }

  /** Dasselbe aus schon gelesenen Vorlagen und Typen (die Mappe lädt sie ohnehin – ein Lesen weniger). */
  zumAnwendenAus(vorlagen: Ablaufvorlage[], typId: string, typen: Mappentyp[]): VorlageZumAnwenden[] {
    // Probleme mit allen Typen der Ablage prüfen: der Zugriff kennt nur die lesbaren – fehlt einer, gilt die Vorlage trotzdem.
    return vorlagen.filter((v) => v.aktiv && (!v.typen.length || v.typen.includes(typId)) && !vorlagenProbleme({ ...v, typen: v.typen.filter((x) => typen.some((y) => y.id === x)) }, typen).length)
      .map((v) => ({ kennung: v.kennung, name: v.name, beschreibung: v.beschreibung, wann: v.wann, fragen: v.fragen, reihenfolge: v.reihenfolge }));
  }

  /* ---------- Anwenden ---------- */

  /** Antworten prüfen – mit denselben Meldungen wie früher die Dialoge „Aufgabe vergeben“ und „Erinnern“. */
  private async antworten(v: Ablaufvorlage, e: AblaufAntworten, von: string): Promise<{ empfaengerId: string | null; text: string; datum: string | null }> {
    const sofort = v.wann.art === 'sofort';
    let text = '';
    if (v.fragen.includes('text')) {
      const roh = typeof e.text === 'string' ? e.text : '';
      text = sofort ? roh.trim() : roh.replace(/\s+/g, ' ').trim();
      if (!text) throw new Fachfehler(422, sofort ? t('meldungen.dienst.bitte-beschreiben-was-zu') : t('meldungen.dienst.woran-soll-erinnert-werden'));
      if (sofort && text.length > AUFGABE_MAX) throw new Fachfehler(422, t('meldungen.dienst.hoechstens-zeichen', { AUFGABE_MAX }));
      if (!sofort && text.length > ERINNERUNG_TEXT_MAX) throw new Fachfehler(422, t('meldungen.dienst.hoechstens-zeichen-2', { ERINNERUNG_TEXT_MAX }));
    }
    // Datum: bei „Am gewählten Datum“ immer, bei „In …“ nur mit der Frage „Datum“ (#1180) – sonst steht es fest.
    let datum: string | null = null;
    if (fragtDatum(v)) {
      if (!istDatum(e.datum)) throw new Fachfehler(422, t('meldungen.dienst.bitte-ein-datum-angeben'));
      datum = e.datum;
    }
    // Empfänger: ein aktiver Benutzer. Fehlt er, ist es bei geplanten Abläufen wie früher bei „Erinnern“ man selbst.
    let empfaengerId: string | null = null;
    if (v.fragen.includes('empfaenger')) empfaengerId = e.empfaengerId || sofort ? await this.teile.aufgaben.pruefeEmpfaenger(e.empfaengerId) : von;
    return { empfaengerId, text, datum };
  }

  /** Bremse (#1044, Sicherheit): offene je Person und Mappe, angewendete je Person und Minute. */
  private async bremse(mappeId: string, person: string, sofort: boolean) {
    if (!sofort && (await this.repo.ablaeufe({ mappeId, personId: person })).length >= ABLAEUFE_JE_PERSON_UND_MAPPE) {
      throw new Fachfehler(429, tAuto('automatisierung.vorlage.bremse.offen', { anzahl: ABLAEUFE_JE_PERSON_UND_MAPPE }));
    }
    const seit = new Date(Date.now() - 60_000).toISOString();
    if (await this.repo.zaehleAblaufVerlauf(person, seit, ['angewendet', 'geplant']) >= ABLAEUFE_JE_MINUTE) {
      throw new Fachfehler(429, tAuto('automatisierung.vorlage.bremse.minute', { anzahl: ABLAEUFE_JE_MINUTE }));
    }
  }

  /**
   * Vorlage an einer Mappe anwenden. Die Route hat geprüft, dass die Person die Mappe lesen und den Empfänger sehen darf.
   * Sofort: die Aufgaben dieser Anfrage; sonst der geplante Ablauf (ist sein Datum schon da, läuft er gleich).
   */
  async anwenden(mappeId: string, kennung: unknown, e: AblaufAntworten, von: string, zugriff?: Zugriff): Promise<{ aufgaben: Aufgabe[]; ablauf: MappenAblauf | null }> {
    const v = await this.vorlage(typeof kennung === 'string' ? kennung : '');
    if (!v.aktiv) throw new Fachfehler(409, tAuto('automatisierung.vorlage.aus', { name: v.name }));
    const typen = await this.repo.listeTypen();
    const probleme = vorlagenProbleme(v, typen);
    if (probleme.length) throw new Fachfehler(422, probleme[0], { probleme });
    const mappe = await this.repo.holeMappe(mappeId);
    if (!mappe) throw new Fachfehler(404, t('meldungen.dienst.diese-mappe-gibt-es'));
    if (v.typen.length && !v.typen.includes(mappe.typId)) throw new Fachfehler(422, tAuto('automatisierung.vorlage.anderer-typ', { name: v.name }));
    const x = await this.antworten(v, e, von);
    const sofort = v.wann.art === 'sofort';
    await this.bremse(mappeId, von, sofort);
    const heute = heuteIn();
    if (sofort) {
      const typ = typen.find((y) => y.id === mappe.typId) ?? null;
      // Rechte der Person dieser Anfrage; ohne (Tests, interne Aufrufe) ihre gespeicherten Rechte.
      const z = zugriff ?? (await this.teile.ohneLeserecht.zugriffVon(von)) ?? (await this.rechte.zugriff({ id: von, rolle: 'mitglied' }));
      const aufgaben = await this.fuehreAus({ v, mappe, typ, person: von, z, ...x, sofort: true });
      await this.vermerke(v.kennung, 'angewendet', { mappeId, personId: von, text: aufgaben.map((a) => a.text).join(' · ') });
      return { aufgaben, ablauf: null };
    }
    const datum = laeuftAm(v.wann, heute, x.datum)!;
    const a = await this.repo.legeAblaufAn({ id: randomUUID(), vorlage: v.kennung, mappeId, empfaengerId: x.empfaengerId, datum, text: x.text, erstellt: '', erstelltVon: von, angehalten: null });
    await this.notiere(mappeId, von, 'aufgabe', { ...this.geplantText(v, a, await this.name(a.empfaengerId ?? von)), aufgabenart: 'erinnerung', fuer: a.empfaengerId ?? von, aufgabentext: a.text, vorlage: v.kennung });
    await this.vermerke(v.kennung, 'geplant', { mappeId, ablaufId: a.id, personId: von, text: tAuto('automatisierung.vorlage.verlauf.geplant', { datum: datumDe(datum) }) });
    // Liegt das Datum heute oder früher, läuft er gleich (wie früher die Erinnerung).
    if (datum <= heute) await this.faellige(heute);
    return { aufgaben: [], ablauf: a };
  }

  /** Text in der Historie beim Planen – bei „Erinnern“ wie bisher. */
  private geplantText(v: Ablaufvorlage, a: MappenAblauf, name: string): { text: string } {
    if (v.kennung === 'erinnern') return { text: t('meldungen.dienst.erinnerung-fuer-am', { name, datumDe: datumDe(a.datum), text: a.text }) };
    return { text: tAuto('automatisierung.vorlage.historie.geplant', { vorlage: v.name, name, datumDe: datumDe(a.datum), text: a.text ? `: ${a.text}` : '' }) };
  }

  /* ---------- Laufen ---------- */

  /**
   * Darf die Person das heute noch (Sicherheit, Rechte zur Laufzeit)? Ein Mensch, aktiv, und sie darf die Mappe lesen.
   * Sonst der Grund – der Ablauf bleibt angehalten stehen.
   */
  private async pruefePerson(person: string | null, mappeId: string): Promise<{ z: Zugriff } | AblaufAngehalten> {
    const halt = (grund: AblaufAngehalten['grund']): AblaufAngehalten => ({ grund, text: tAuto.frei(`automatisierung.vorlage.angehalten.${grund}`), zeit: this.jetzt() });
    if (!person || !istUuid(person)) return halt('person');
    if (this.konten?.benutzer) {
      const b = (await this.konten.benutzer()).find((x) => x.id === person);
      if (!b) return halt('person');
      if (!b.aktiv) return halt('deaktiviert');
    } else {
      const { benutzer } = await this.kern.system();
      const m = await this.repo.holeMappe(person);
      if (!m || m.typId !== benutzer.id) return halt('person');
      if (m.werte.aktiv === false) return halt('deaktiviert');
    }
    const z = await this.teile.ohneLeserecht.zugriffVon(person);
    if (!z && this.konten?.benutzer) return halt('person');
    if (!(await this.rechte.kannLesen(person, mappeId))) return halt('leserecht');
    return { z: z ?? (await this.rechte.zugriff({ id: person, rolle: 'mitglied' })) };
  }

  /** Fällige Abläufe (täglicher Lauf, auch gleich nach dem Anwenden, wenn das Datum schon da ist). */
  async faellige(heute = heuteIn()): Promise<number> {
    let n = 0;
    for (const a of await this.repo.ablaeufe({ bis: heute, angehalten: false })) if (await this.laufe(a) === 'gelaufen') n++;
    return n;
  }

  /** Einen Ablauf laufen lassen – genau einmal: Wer ihn aus der Tabelle nimmt, führt ihn aus (in einer Transaktion). */
  private async laufe(a: MappenAblauf): Promise<'gelaufen' | 'angehalten' | 'weg'> {
    const v = (await this.vorlagen()).find((x) => x.kennung === a.vorlage);
    const p = v ? await this.pruefePerson(a.erstelltVon, a.mappeId) : { grund: 'vorlage' as const, text: tAuto('automatisierung.vorlage.angehalten.vorlage'), zeit: this.jetzt() };
    if ('grund' in p) {
      if (a.angehalten?.grund !== p.grund) {
        await this.repo.setzeAblaufAngehalten(a.id, p);
        await this.vermerke(a.vorlage, 'angehalten', { mappeId: a.mappeId, ablaufId: a.id, personId: a.erstelltVon, text: p.text });
        log.warn('Ablauf angehalten', { vorlage: a.vorlage, mappeId: a.mappeId, grund: p.grund });
      }
      return 'angehalten';
    }
    const mappe = await this.repo.holeMappe(a.mappeId);
    if (!mappe || !v) return 'weg';
    const typ = (await this.repo.holeTyp(mappe.typId)) ?? null;
    const lief = await this.kern.inTransaktion(async () => {
      if (!(await this.repo.loescheAblauf(a.id))) return false;
      await this.fuehreAus({ v, mappe, typ, person: a.erstelltVon!, z: p.z, empfaengerId: a.empfaengerId, text: a.text, datum: a.datum, sofort: false });
      return true;
    });
    if (!lief) return 'weg';
    await this.vermerke(a.vorlage, 'gelaufen', { mappeId: a.mappeId, ablaufId: a.id, personId: a.erstelltVon, text: a.text });
    return 'gelaufen';
  }

  /** Empfänger einer Karte (aktive Benutzer, ohne Doppelte). Felder mit den Rechten der Person gelesen. */
  private async empfaengerVon(k: VorlagenKarte, l: Lauf): Promise<string[]> {
    const { benutzer } = await this.kern.system();
    const ids: string[] = [];
    const sichtbar = k.empfaenger.some((e) => e.art === 'feld') ? await this.rechte.pruefeRecht(l.z, l.mappe.id, 'R').catch(() => null) : null;
    const liste = (x: unknown): string[] => (Array.isArray(x) ? x.map(String) : typeof x === 'string' && x ? [x] : []);
    const von = async (e: VorlagenEmpfaenger): Promise<string[]> => {
      if (e.art === 'frage') return l.empfaengerId ? [l.empfaengerId] : [];
      if (e.art === 'selbst') return [l.person];
      if (e.art === 'ersteller') return l.mappe.erstelltVon ? [l.mappe.erstelltVon] : [];
      const imFeld = liste(sichtbar?.werte[e.feld]).filter(istUuid);
      return imFeld.length ? imFeld : [l.person];
    };
    for (const e of k.empfaenger) for (const id of await von(e)) if (!ids.includes(id)) ids.push(id);
    const da: string[] = [];
    for (const id of ids) { const m = await this.repo.holeMappe(id); if (m && m.typId === benutzer.id) da.push(id); }
    return da;
  }

  /** Text einer Karte für einen Empfänger: Platzhalter mit den Rechten der Person und des Empfängers, dann die Eingabe. */
  private async textFuer(k: VorlagenKarte, l: Lauf, an: string): Promise<{ text: string; verborgen: number; mappe: boolean }> {
    const vor = k.text.replace(/\{(eingabe|person|empfaenger)\}/g, (_, x: string) => MARKE(x));
    const fest: Record<string, string> = { eingabe: l.text };
    if (vor.includes(MARKE('person'))) fest.person = await this.name(l.person);
    if (vor.includes(MARKE('empfaenger'))) fest.empfaenger = await this.name(an);
    // Ohne weitere Platzhalter (wie „Aufgabe vergeben“ und „Erinnern“) braucht es den Motor nicht – genauso schnell wie früher.
    const p = /\{[a-z]/.test(vor) ? this.anschluss.ablaufPlatzhalter?.() : undefined;
    const empf = p && an !== l.person ? await this.teile.ohneLeserecht.zugriffVon(an) : null;
    const r = p ? await p(vor, { name: l.v.name, mappe: l.mappe, typ: l.typ, z: l.z, daten: l.datum ? { datum: l.datum } : {} }, empf) : { text: vor, verborgen: 0, mappe: true };
    // eslint-disable-next-line no-control-regex -- die Marke ist ein Steuerzeichen, damit keine Eingabe sie enthalten kann
    return { ...r, text: r.text.replace(/\u0000(eingabe|person|empfaenger)\u0000/g, (_, x: string) => fest[x] ?? '').trim() };
  }

  /**
   * Die Karten ausführen – auf demselben Weg wie bisher: Aufgabe (sofort „manuell“, später „Erinnerung“ mit Datum) mit der
   * Person als Ersteller, Eintrag in der Historie, Vertretung, Fall ohne Leserecht; Benachrichtigungen gebündelt je
   * Vorlage, Mappe und Empfänger. Mit `trocken` nur beschreiben, was passieren würde.
   */
  private async fuehreAus(l: Lauf): Promise<Aufgabe[]>;
  private async fuehreAus(l: Lauf, trocken: true): Promise<{ zeilen: string[]; vorschau: AblaufProbe[] }>;
  private async fuehreAus(l: Lauf, trocken = false): Promise<Aufgabe[] | { zeilen: string[]; vorschau: AblaufProbe[] }> {
    const aufgaben: Aufgabe[] = [];
    const zeilen: string[] = [];
    const vorschau: AblaufProbe[] = [];
    for (const k of l.v.karten) {
      const an = await this.empfaengerVon(k, l);
      if (!an.length) { zeilen.push(tAuto('automatisierung.vorlage.test.niemand')); continue; }
      for (const id of an) {
        const ziel = (await this.teile.vertretung.empfaengerAufloesen(id)).ziel ?? id;
        const f = await this.textFuer(k, l, ziel);
        const text = f.text.slice(0, AUFGABE_MAX);
        if (trocken) { const p = await this.probe(k, l, ziel, text, f); zeilen.push(...p.zeilen); vorschau.push(p.vorschau); continue; }
        if (k.als === 'benachrichtigung') {
          await this.teile.vertretung.benachrichtigeGebuendelt({ empfaengerId: ziel, mappeId: l.mappe.id, art: 'manuell', schluessel: `ablauf:${l.v.kennung}`.slice(0, 120), von: l.person, text: () => text });
          continue;
        }
        const a = await this.teile.ereignisse.neueAufgabe({
          id: randomUUID(), mappeId: l.mappe.id, empfaengerId: id, art: l.sofort ? 'manuell' : 'erinnerung', text, ...(l.sofort ? {} : { datum: l.datum }),
          erstellt: '', erstelltVon: l.person, erledigt: null, erledigtVon: null,
        }, l.mappe.typId);
        const name = await this.name(id);
        const eintrag = l.sofort ? t('meldungen.dienst.fuer', { name, text })
          : l.v.kennung === 'erinnern' ? t('meldungen.dienst.erinnerung-faellig-fuer', { name, text })
            : tAuto('automatisierung.vorlage.historie.gelaufen', { vorlage: l.v.name, name, text });
        await this.notiere(l.mappe.id, l.sofort ? l.person : null, 'aufgabe', { text: eintrag, aufgabe: a.id, aufgabenart: a.art, fuer: id, aufgabentext: text, vorlage: l.v.kennung });
        if (l.sofort) log.info('Aufgabe vergeben', { mappeId: l.mappe.id, an: name, vorlage: l.v.kennung });
        aufgaben.push(await this.teile.vertretung.leiteUm(a));
      }
    }
    if (trocken) return { zeilen, vorschau };
    // #798: Darf ein Empfänger die Mappe nicht lesen, entsteht ein Fall – der Admin erfährt davon.
    await this.teile.ohneLeserecht.faelleNach([l.mappe.id]);
    return aufgaben;
  }

  /** Ausprobieren: Zeilen und Vorschau (#1176) für einen Empfänger – so, wie er es sähe; eine Aufgabe trägt ihr Datum. */
  private async probe(k: VorlagenKarte, l: Lauf, ziel: string, text: string, f: { verborgen: number; mappe: boolean }): Promise<{ zeilen: string[]; vorschau: AblaufProbe }> {
    const name = await this.name(ziel);
    const hinweis = !f.mappe || !(await this.rechte.kannLesen(ziel, l.mappe.id)) ? tAuto('automatisierung.vorlage.test.ohne-leserecht', { name })
      : f.verborgen ? tAuto('automatisierung.vorlage.test.nicht-sichtbar', { name, anzahl: f.verborgen }) : null;
    const zeile = tAuto(k.als === 'aufgabe' ? 'automatisierung.vorlage.test.aufgabe' : 'automatisierung.vorlage.test.benachrichtigung', { name, text });
    return { zeilen: hinweis ? [zeile, hinweis] : [zeile], vorschau: { als: k.als, an: name, text, datum: k.als === 'aufgabe' && !l.sofort ? l.datum : null, ...(hinweis ? { hinweis } : {}) } };
  }

  /* ---------- Geplante Abläufe an der Mappe ---------- */

  /** Ändern und Löschen: wer ihn angelegt hat, der Empfänger oder ein Administrator. */
  private async eigener(id: string, ich: { id: string; rolle: string }): Promise<MappenAblauf> {
    const a = await this.repo.holeAblauf(id);
    if (!a) throw new Fachfehler(404, t('meldungen.dienst.diese-erinnerung-gibt-es'));
    if (a.erstelltVon !== ich.id && a.empfaengerId !== ich.id && ich.rolle !== 'admin') throw new Fachfehler(403, t('meldungen.dienst.aendern-kann-eine-erinnerung'));
    return a;
  }

  async ablaufMappe(id: string): Promise<string> {
    const a = await this.repo.holeAblauf(id);
    if (!a) throw new Fachfehler(404, t('meldungen.dienst.diese-erinnerung-gibt-es-2'));
    return a.mappeId;
  }

  /** Datum, Text und Empfänger ändern – nur, was die Vorlage fragt; die Person bleibt, wer ihn angelegt hat. */
  async aendere(id: string, e: AblaufAntworten, ich: { id: string; rolle: string }): Promise<MappenAblauf> {
    const alt = await this.eigener(id, ich);
    const v = (await this.vorlagen()).find((x) => x.kennung === alt.vorlage) ?? kernStandard('erinnern');
    const x = await this.antworten({ ...v, wann: { art: 'datum' }, fragen: [...new Set([...v.fragen, 'datum' as const])] }, { ...e, empfaengerId: e.empfaengerId ?? alt.empfaengerId ?? undefined }, alt.erstelltVon ?? ich.id);
    const neu = (await this.repo.aendereAblauf(id, { datum: x.datum!, text: v.fragen.includes('text') ? x.text : alt.text, empfaengerId: v.fragen.includes('empfaenger') ? x.empfaengerId : alt.empfaengerId }))!;
    const name = await this.name(neu.empfaengerId ?? neu.erstelltVon);
    const text = v.kennung === 'erinnern' ? t('meldungen.dienst.erinnerung-geaendert-fuer-am', { name, datumDe: datumDe(neu.datum), text: neu.text })
      : tAuto('automatisierung.vorlage.historie.geaendert', { vorlage: v.name, name, datumDe: datumDe(neu.datum), text: neu.text ? `: ${neu.text}` : '' });
    await this.notiere(alt.mappeId, ich.id, 'aufgabe', { text, aufgabenart: 'erinnerung', fuer: neu.empfaengerId ?? neu.erstelltVon, aufgabentext: neu.text, vorlage: v.kennung });
    if (neu.datum <= heuteIn() && !neu.angehalten) await this.faellige();
    return neu;
  }

  async loesche(id: string, ich: { id: string; rolle: string }) {
    const a = await this.eigener(id, ich);
    if (!(await this.repo.loescheAblauf(id))) return;
    const v = (await this.vorlagen()).find((x) => x.kennung === a.vorlage);
    const text = a.vorlage === 'erinnern' || !v ? t('meldungen.dienst.erinnerung-geloescht', { text: a.text }) : tAuto('automatisierung.vorlage.historie.geloescht', { vorlage: v.name, text: a.text ? `: ${a.text}` : '' });
    await this.notiere(a.mappeId, ich.id, 'aufgabe', { text, aufgabenart: 'erinnerung', fuer: a.empfaengerId, aufgabentext: a.text, vorlage: a.vorlage });
    await this.vermerke(a.vorlage, 'geloescht', { mappeId: a.mappeId, ablaufId: a.id, personId: ich.id, text: a.text });
  }

  /** Angehaltenen Ablauf fortsetzen (Administratoren): prüft die Rechte erneut; ist sein Datum da, läuft er gleich. */
  async fortsetzen(id: string, von: string): Promise<MappenAblauf | null> {
    const a = await this.repo.holeAblauf(id);
    if (!a) throw new Fachfehler(404, t('meldungen.dienst.diese-erinnerung-gibt-es'));
    await this.repo.setzeAblaufAngehalten(id, null);
    await this.vermerke(a.vorlage, 'fortgesetzt', { mappeId: a.mappeId, ablaufId: a.id, personId: von, text: '' });
    if (a.datum <= heuteIn()) await this.laufe({ ...a, angehalten: null });
    return (await this.repo.holeAblauf(id)) ?? null;
  }

  /** Offene Abläufe einer Mappe für den Bereich „Geplant“ – mit dem Namen der Vorlage. */
  async anMappe(mappeId: string): Promise<MappenAblauf[]> {
    const liste = await this.repo.ablaeufe({ mappeId });
    if (!liste.length) return [];
    const namen = new Map((await this.vorlagen()).map((v) => [v.kennung, v.name] as const));
    return liste.map((a) => ({ ...a, vorlageName: namen.get(a.vorlage) ?? a.vorlage }));
  }

  /* ---------- Verlauf ---------- */

  private async vermerke(vorlage: string, art: AblaufVerlauf['art'], e: { mappeId?: string | null; ablaufId?: string | null; personId?: string | null; text: string }) {
    await this.repo.vermerkeAblauf({ id: randomUUID(), vorlage, art, mappeId: e.mappeId ?? null, ablaufId: e.ablaufId ?? null, personId: e.personId ?? null, text: e.text.slice(0, 500), zeit: '' });
  }

  /** Aufräumen wie der Verlauf der Automatisierungen (Tage und Einträge je Vorlage). */
  raeumeAuf(): Promise<number> { return this.repo.raeumeAblaufVerlaufAuf(AUTOMATISIERUNG_GRENZEN.verlaufTage, AUTOMATISIERUNG_GRENZEN.verlauf); }

  /* ---------- Werkbank → Automatisierungsvorlagen ---------- */

  async uebersicht(): Promise<AblaufvorlageAnsicht[]> {
    const [liste, offen, typen, pakete] = await Promise.all([this.vorlagen(), this.repo.ablaeufe(), this.repo.listeTypen(), this.repo.listePakete()]);
    return liste.map((v) => ({
      ...v, kurz: vorlageKurz(v, typen), probleme: vorlagenProbleme(v, typen),
      offen: offen.filter((a) => a.vorlage === v.kennung).length, angehalten: offen.filter((a) => a.vorlage === v.kennung && a.angehalten).length,
      ...(istKernVorlage(v.kennung) && v.herkunft === 'paket' ? { ueberlagert: pakete.find((p) => p.id === v.paketId)?.name ?? v.paketId } : {}),
    }));
  }

  async ansicht(kennung: string): Promise<AblaufvorlageAnsicht> {
    const v = (await this.uebersicht()).find((x) => x.kennung === kennung);
    if (!v) throw new Fachfehler(404, tAuto('automatisierung.vorlage.fehlt'));
    return v;
  }

  /** Speichern geht nur mit gültigem Stand; unbekannte Karten (E-Mail, Adresse …) sind ein Fehler, keine Bereinigung. */
  private async gueltig(e: unknown): Promise<AblaufvorlageDaten> {
    const fehler = vorlagenEingabeFehler(e);
    if (fehler.length) throw new Fachfehler(422, fehler[0], { probleme: fehler });
    const d = bereinigeVorlage(e);
    const p = vorlagenProbleme(d, await this.repo.listeTypen());
    if (p.length) throw new Fachfehler(422, p[0], { probleme: p });
    return d;
  }

  async aendereVorlage(kennung: string, e: unknown, von: string): Promise<AblaufvorlageAnsicht> {
    const alt = await this.vorlage(kennung);
    const roh = (e ?? {}) as Record<string, unknown>;
    const d = await this.gueltig({ ...alt, ...roh });
    const aktiv = typeof roh.aktiv === 'boolean' ? roh.aktiv : alt.aktiv;
    const version = roh.version === undefined ? alt.version : Number(roh.version);
    const neu: Ablaufvorlage = { ...alt, ...d, aktiv };
    // Unveränderte Kern-Vorgabe: erst jetzt gespeichert (Fassung 1).
    const ok = alt.version === 0 ? await this.repo.speichereAblaufvorlage(neu, von, null) : await this.repo.speichereAblaufvorlage(neu, von, version);
    if (!ok) throw new Fachfehler(409, tAuto('automatisierung.konflikt'));
    log.info('Automatisierungsvorlage geändert', { kennung, name: neu.name });
    return this.ansicht(kennung);
  }

  async schalteVorlage(kennung: string, aktiv: boolean, von: string): Promise<AblaufvorlageAnsicht> {
    const alt = await this.vorlage(kennung);
    if (alt.aktiv === aktiv) return this.ansicht(kennung);
    if (!(await this.repo.speichereAblaufvorlage({ ...alt, aktiv }, von, alt.version === 0 ? null : alt.version))) throw new Fachfehler(409, tAuto('automatisierung.konflikt'));
    log.info(aktiv ? 'Automatisierungsvorlage eingeschaltet' : 'Automatisierungsvorlage ausgeschaltet', { kennung });
    return this.ansicht(kennung);
  }

  async legeVorlage(e: unknown, von: string): Promise<AblaufvorlageAnsicht> {
    if ((await this.repo.ablaufvorlagen()).length >= VORLAGEN_GRENZEN.vorlagen) throw new Fachfehler(422, tAuto('automatisierung.vorlage.zuviele', { anzahl: VORLAGEN_GRENZEN.vorlagen }));
    const roh = (e ?? {}) as Record<string, unknown>;
    const d = await this.gueltig({ reihenfolge: VORLAGEN_REIHENFOLGE.eigen, ...roh });
    const v: Ablaufvorlage = { ...d, kennung: `eigen:${randomUUID()}`, aktiv: roh.aktiv !== false, herkunft: 'eigen', paketId: null, version: 1, geaendert: null, geaendertVon: von };
    await this.repo.speichereAblaufvorlage(v, von, null);
    log.info('Automatisierungsvorlage angelegt', { kennung: v.kennung, name: v.name });
    return this.ansicht(v.kennung);
  }

  async kopiere(kennung: string, von: string): Promise<AblaufvorlageAnsicht> {
    const a = await this.vorlage(kennung);
    return this.legeVorlage({ ...a, name: tAuto('automatisierung.kopie', { name: a.name }).slice(0, VORLAGEN_GRENZEN.name), aktiv: false }, von);
  }

  /** Nur eigene; solange Abläufe offen sind, nicht – sie stehen unter „Gerade benutzt bei“. */
  async loescheVorlage(kennung: string): Promise<void> {
    const v = await this.vorlage(kennung);
    if (v.herkunft !== 'eigen') throw new Fachfehler(409, tAuto('automatisierung.vorlage.loeschen.herkunft'));
    const offen = (await this.repo.ablaeufe({ vorlage: kennung })).length;
    if (offen) throw new Fachfehler(409, tAuto('automatisierung.vorlage.loeschen.offen', { anzahl: offen }));
    await this.repo.loescheAblaufvorlage(kennung);
    log.info('Automatisierungsvorlage gelöscht', { kennung, name: v.name });
  }

  /** Kern-Vorgabe auf die Auslieferung zurücksetzen (nicht, solange ein Paket sie überlagert). */
  async zuruecksetzen(kennung: string): Promise<AblaufvorlageAnsicht> {
    const v = await this.vorlage(kennung);
    if (!istKernVorlage(kennung) || v.herkunft !== 'kern') throw new Fachfehler(409, tAuto('automatisierung.vorlage.zuruecksetzen.nicht'));
    await this.repo.loescheAblaufvorlage(kennung);
    return this.ansicht(kennung);
  }

  /**
   * Fassungen (#1006): Daten und an/aus einer Vorlage – nicht Herkunft und Paket. Kern-Vorgaben haben auch unverändert
   * einen Stand (die Auslieferung); Zurücksetzen ist darum eine Fassung, kein Löschen. Festgehalten wird über die
   * Repo-Hülle (`fassungen/huelle.ts`), wiederhergestellt über das normale Speichern mit denselben Prüfungen.
   */
  fassungsGegenstand() {
    const vorlage = async (kennung: string, repo: Repo): Promise<Ablaufvorlage | undefined> => {
      const v = (await repo.ablaufvorlagen()).find((x) => x.kennung === kennung);
      return v ?? (istKernVorlage(kennung) ? kernStandard(kennung) : undefined);
    };
    return {
      art: 'ablaufvorlage' as const,
      stand: async (kennung: string, repo: Repo) => {
        const v = await vorlage(kennung, repo);
        return v && { name: v.name, daten: fassungsStand(v) };
      },
      alle: async (repo: Repo) => [...new Set([...KERN_VORLAGEN, ...(await repo.ablaufvorlagen()).map((v) => v.kennung)])],
      stelleHer: async (kennung: string, daten: unknown, o: { von: { id: string | null } }) => {
        const alt = await this.vorlage(kennung);
        await this.aendereVorlage(kennung, { ...(daten as object), version: alt.version }, o.von.id ?? '');
      },
      kontext: async () => ({ typen: await this.repo.listeTypen() }),
    };
  }

  async verlauf(kennung: string, anzahl = 50): Promise<AblaufVerlauf[]> {
    await this.vorlage(kennung);
    return this.repo.ablaufVerlauf({ vorlage: kennung, anzahl: Math.max(1, Math.min(AUTOMATISIERUNG_GRENZEN.verlauf, anzahl)) });
  }

  /** „Gerade benutzt bei“: offene Abläufe mit Mappe – Titel nur, wo der Admin die Mappe lesen darf. */
  async benutzt(kennung: string, z?: Zugriff): Promise<MappenAblauf[]> {
    await this.vorlage(kennung);
    const liste = await this.repo.ablaeufe({ vorlage: kennung });
    const lesbar = await this.rechte.lesbare(z, liste.map((a) => a.mappeId));
    return liste.map((a) => (lesbar.has(a.mappeId) ? a : { ...a, mappeTitel: tAuto('automatisierung.platzhalter.nicht-sichtbar'), text: '' }));
  }

  /** Ausprobieren (trocken) an einer Mappe mit den Rechten des Admins als Person; nichts entsteht. Dazu die Vorschau (#1176). */
  async ausprobieren(kennung: string, mappeId: unknown, e: AblaufAntworten, ich: { id: string; rolle: string }, z: Zugriff): Promise<{ zeilen: string[]; vorschau: AblaufProbe[] }> {
    const v = await this.vorlage(kennung);
    const typen = await this.repo.listeTypen();
    const p = vorlagenProbleme(v, typen);
    if (p.length) throw new Fachfehler(422, p[0], { probleme: p });
    if (!istUuid(mappeId)) throw new Fachfehler(422, tAuto('automatisierung.test.mappe'));
    const mappe = await this.rechte.pruefeRecht(z, mappeId, 'R');
    if (v.typen.length && !v.typen.includes(mappe.typId)) throw new Fachfehler(422, tAuto('automatisierung.vorlage.anderer-typ', { name: v.name }));
    const x = await this.antworten(v, e, ich.id);
    const typ = typen.find((y) => y.id === mappe.typId) ?? null;
    const datum = v.wann.art === 'sofort' ? null : laeuftAm(v.wann, heuteIn(), x.datum);
    const r = await this.fuehreAus({ v, mappe, typ, person: ich.id, z, ...x, datum, sofort: v.wann.art === 'sofort' }, true);
    return { zeilen: [datum ? tAuto('automatisierung.vorlage.test.am', { datum: datumDe(datum) }) : tAuto('automatisierung.vorlage.test.sofort'), ...r.zeilen], vorschau: r.vorschau };
  }

  /** Für die Werkbank-Übersicht und die Mail an die Verwaltung: angehaltene Abläufe. */
  async warnungen(): Promise<{ angehalten: Array<{ id: string; vorlage: string; mappeId: string; grund: AblaufAngehalten['grund'] }> }> {
    return { angehalten: (await this.repo.ablaeufe({ angehalten: true })).map((a) => ({ id: a.id, vorlage: a.vorlage, mappeId: a.mappeId, grund: a.angehalten!.grund })) };
  }

  /** Vollexport: Vorlagen mit Änderungsverlauf – seit #1006 aus den Fassungen (auch in struktur/fassungen.json; Nummer als version). */
  async exportDaten(): Promise<unknown[]> {
    return Promise.all((await this.vorlagen()).map(async (v) => ({
      ...v, fassungen: (await this.repo.fassungen('ablaufvorlage', v.kennung)).map((f) => ({ version: f.nr, zeit: f.zeit, von: f.urheber.art === 'person' ? f.urheber.id : null, daten: f.daten })),
    })));
  }

  /* ---------- Vorlagen aus Paketen ---------- */

  /** Mitgelieferte Vorlagen eines Pakets anlegen, ersetzen bzw. (leere Liste) entfernen – siehe ablaufvorlagen-paket.ts. */
  ausPaket(p: { id: string; name: string; typen: Record<string, string> }, liste: PaketAblaufvorlage[]): Promise<number> {
    return vorlagenAusPaket(this.repo, p, liste);
  }
}
