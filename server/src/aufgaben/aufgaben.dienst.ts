/**
 * Aufgaben (#54, #56, #1078 aus dienst.ts): Empfänger prüfen, @-Erwähnungen in Feldern und Notizen als Aufgaben, die
 * Freigabe „Favoriten benachrichtigen“ (#506), Aufgaben aus Automatisierungen und das Erledigen nach Anlass (#724).
 * Schicht 3 – bekommt den Kern, die Rechteprüfung, Mappen, Ereignisse, die Rollen (post/) und die übrigen Klassen dieses
 * Ordners (sie kennen einander über `teile`); Ereignis, Konten und die Gültigkeit der Zahlen über den Anschluss.
 */
import { randomUUID } from 'node:crypto';
import type { EreignisseDienst } from '../ereignisse/index';
import { Fachfehler } from '../fehler';
import type { Kern } from '../kern';
import type { MappenDienst, MappenHistorie } from '../mappen';
import type { PostSystemmappen } from '../post';
import { protokoll } from '../protokoll';
import { istUuid, type Repo } from '../repo';
import { t } from '../sprache';
import type { Gueltigkeit } from '../zaehlerspeicher';
import type { ZugriffDienst } from '../zugriff';
import { type FavoritenFreigabe, freigabeZumSpeichern, liesFavoritenFreigabe } from '../../../shared/src/favoritenfreigabe';
import { erwaehnungen } from '../../../shared/src/markdown';
import { type Aufgabe, AUFGABE_MAX, type AufgabenAnlass, type Benutzer, type Mappentyp, type Werte } from '../../../shared/src/model';
import type { Fristen } from './fristen';
import type { OhneEmpfaenger } from './ohne-empfaenger';
import type { OhneLeserecht } from './ohne-leserecht';
import type { AufgabenVertretung } from './vertretung';

/** Die Teile, die die Aufgaben rufen – dazu alle Klassen dieses Ordners (zusammengesetzt im Dienst). */
export interface AufgabenTeile {
  rechte: ZugriffDienst; historie: MappenHistorie; mappen: MappenDienst; ereignisse: EreignisseDienst; systemmappen: PostSystemmappen;
  aufgaben: AufgabenDienst; vertretung: AufgabenVertretung; ohneLeserecht: OhneLeserecht; fristen: Fristen; ohneEmpfaenger: OhneEmpfaenger;
}

/** Konten (#43, #78, #506), vom Start angebunden: alle Personen mit Abwesenheit, persönliche Einstellungen. */
export interface AufgabenKonten {
  benutzer?(): Promise<Benutzer[]>;
  setzeEinstellung?(id: string, schluessel: string, wert: unknown): Promise<void>;
}

/** Was die Aufgaben außer dem Kern brauchen – vom Dienst hereingereicht. */
export interface AufgabenAnschluss {
  /** Ereignis auslösen – über den Anschluss (`kern.ereignis`; Tests ersetzen `dienst.kern.ereignis`). */
  ereignis(...a: Parameters<Kern['ereignis']>): Promise<void>;
  /** Konten (#43), vom Start angebunden. */
  konten(): AufgabenKonten | undefined;
  /** Gültigkeit der Zahlen in dieser Anfrage (#742; `mindestensMs` setzen Tests am Dienst). */
  gueltigkeit(): Gueltigkeit;
}

export class AufgabenDienst {
  constructor(private readonly kern: Kern, private readonly teile: AufgabenTeile, private readonly anschluss: AufgabenAnschluss) {}

  private get repo(): Repo { return this.kern.repo; }
  private get konten() { return this.anschluss.konten(); }
  private name(benutzerId: string | null): Promise<string> { return this.kern.name(benutzerId); }
  private notiere(...a: Parameters<MappenHistorie['notiere']>) { return this.teile.historie.notiere(...a); }
  private get einstellungen() { return this.kern.einstellungen; }
  private sichtbarFuer(benutzerId: string, ids: string[]) { return this.teile.rechte.sichtbarFuer(benutzerId, ids); }
  private neueAufgabe(a: Aufgabe, typ?: string) { return this.teile.ereignisse.neueAufgabe(a, typ); }
  private listeRollen(mitKonten = false) { return this.teile.systemmappen.listeRollen(mitKonten); }
  private leiteUm(a: Aufgabe) { return this.teile.vertretung.leiteUm(a); }
  private empfaengerAufloesen(id: string | null) { return this.teile.vertretung.empfaengerAufloesen(id); }
  private benachrichtigeGebuendelt(...a: Parameters<AufgabenVertretung['benachrichtigeGebuendelt']>) { return this.teile.vertretung.benachrichtigeGebuendelt(...a); }
  private faelleNach(mappeIds: string[]) { return this.teile.ohneLeserecht.faelleNach(mappeIds); }

  /** Ein aktiver Benutzer (seine Benutzer-Mappe), sonst 422. */
  async pruefeEmpfaenger(id: unknown): Promise<string> {
    const { benutzer } = await this.kern.system();
    const m = istUuid(id) ? await this.repo.holeMappe(id) : undefined;
    if (!m || m.typId !== benutzer.id) throw new Fachfehler(422, t('meldungen.dienst.bitte-einen-benutzer-als'));
    if (m.werte.aktiv === false) throw new Fachfehler(422, t('meldungen.dienst.dieser-benutzer-ist-deaktiviert'));
    return m.id;
  }

  /**
   * Neue @-Erwähnungen in formatiertem Text werden Aufgaben (#56). Gibt es für Benutzer und Feld
   * schon eine offene, entsteht keine zweite; entfernte Erwähnungen stehen nur in der Historie.
   */
  async pruefeErwaehnungen(typ: Mappentyp, mappeId: string, alt: Werte, neu: Werte, von: string | null) {
    for (const f of typ.felder.filter((x) => x.typ === 'formatiert')) {
      await this.erwaehnungenAbgleichen(mappeId, { key: f.key, ort: `in „${f.label}“` }, String(alt[f.key] ?? ''), String(neu[f.key] ?? ''), von);
    }
  }

  /**
   * Gemeinsamer Abgleich für Felder und Notizen (#81): `quelle.key` unterscheidet die Stelle
   * (Feldschlüssel oder `notiz:<id>`), `quelle.ort` steht im Text („in „Beschreibung““, „in einer Notiz“).
   */
  async erwaehnungenAbgleichen(mappeId: string, quelle: { key: string; ort: string; auszug?: string }, altText: string, neuText: string, von: string | null) {
    const vorher = new Set(erwaehnungen(altText));
    const jetzt = new Set(erwaehnungen(neuText));
    if (!vorher.size && !jetzt.size) return;
    const { benutzer } = await this.kern.system();
    const offen = (await this.repo.offeneAufgaben({ mappeIds: [mappeId] })).filter((a) => a.art === 'erwaehnung' && a.feldKey === quelle.key);
    // #137: nur Benutzer, die der Erwähnende sehen darf.
    const sichtbar = von ? await this.sichtbarFuer(von, [...jetzt]) : new Set(jetzt);
    for (const id of jetzt) {
      if (vorher.has(id) || id === von || offen.some((a) => a.empfaengerId === id) || !sichtbar.has(id)) continue;
      const m = await this.repo.holeMappe(id);
      if (!m || m.typId !== benutzer.id) continue;
      // Deaktivierte nur, wenn ihr Vertreter übernimmt (#78).
      if (m.werte.aktiv === false && (await this.empfaengerAufloesen(id)).ziel === id) continue;
      const a = await this.neueAufgabe({
        id: randomUUID(), mappeId, empfaengerId: id, art: 'erwaehnung', feldKey: quelle.key,
        text: t('meldungen.dienst.erwaehnt-von', { name: await this.name(von), ort: quelle.ort, wert: quelle.auszug ? `: ${quelle.auszug}` : '' }).slice(0, AUFGABE_MAX),
        erstellt: '', erstelltVon: von, erledigt: null, erledigtVon: null,
      });
      await this.notiere(mappeId, von, 'aufgabe', { text: t('meldungen.dienst.erwaehnt', { name: await this.name(id), ort: quelle.ort }), aufgabe: a.id, aufgabenart: 'erwaehnung', fuer: id, aufgabentext: a.text });
      await this.leiteUm(a);
    }
    for (const id of vorher) {
      if (!jetzt.has(id)) await this.notiere(mappeId, von, 'aufgabe', { text: t('meldungen.dienst.erwaehnung-von-entfernt', { name: await this.name(id), ort: quelle.ort }) });
    }
  }

  async favoritenFreigabe(): Promise<FavoritenFreigabe> {
    return liesFavoritenFreigabe(await this.einstellungen?.lies('favoriten_freigabe'));
  }

  /** Für alle, je Rolle (Systemrollen und fachliche Rollen) oder gar nicht; dazu die Vorgabe für neue Benutzer. */
  async setzeFavoritenFreigabe(eingabe: unknown, von: string) {
    if (!this.einstellungen) throw new Fachfehler(404, t('meldungen.dienst.einstellungen-sind-nicht'));
    const f = liesFavoritenFreigabe(eingabe);
    if (f.erlaubt === 'rollen') {
      const bekannt = new Set((await this.listeRollen()).map((r) => r.id));
      f.rollen = f.rollen.filter((r) => bekannt.has(r));
      if (!f.rollen.length) throw new Fachfehler(422, t('werkbank.fehler.freigabe.rollen'));
    }
    await this.einstellungen.schreibe('favoriten_freigabe', freigabeZumSpeichern(f));
    protokoll.modul('werkbank').info('Benachrichtigung für Favoriten eingestellt', { von, erlaubt: f.erlaubt, rollen: f.rollen.length, vorgabe: f.vorgabe });
    return this.favoritenFreigabe();
  }

  /**
   * Wer eine Aufgabe für den Benutzer `id` wirklich bekommt (#724, gemeinsamer Weg für Kern und Automatisierungen):
   * er selbst – abwesend oder deaktiviert sein Vertreter (`empfaengerAufloesen`); ist niemand Aktives erreichbar, die
   * Administratoren (null). Wirft nur, wenn `id` kein Benutzer ist; ein deaktivierter Empfänger bricht nichts ab.
   */
  async aufgabenEmpfaenger(id: string): Promise<{ an: string | null; ueber: string[] }> {
    const { benutzer } = await this.kern.system();
    const m = istUuid(id) ? await this.repo.holeMappe(id) : undefined;
    if (!m || m.typId !== benutzer.id) throw new Fachfehler(422, t('meldungen.dienst.bitte-einen-benutzer-als'));
    const { ziel, abwesende } = await this.empfaengerAufloesen(id);
    const aktiv = async (x: string | null) => !!x && (!this.konten?.benutzer ? (await this.repo.holeMappe(x))?.werte.aktiv !== false : (await this.konten.benutzer()).some((b) => b.id === x && b.aktiv));
    if (await aktiv(ziel)) return { an: ziel, ueber: abwesende };
    return { an: null, ueber: [...abwesende, ...(ziel ? [ziel] : [])] };
  }

  /**
   * Aufgabe oder Benachrichtigung aus einer Automatisierung (#676, #724) – auf demselben Weg wie die eingebauten:
   * - **Vertretung:** Ist der Empfänger abwesend oder deaktiviert, geht sie an den Vertreter (mit Eintrag in der
   *   Historie); ist niemand erreichbar, an die Administratoren. Der Lauf bricht dabei nicht ab.
   * - **Anlass:** Mit Anlass erledigt sie sich selbst, wenn er wegfällt (Datum geändert/geleert, Post zugeordnet,
   *   Abwesenheit beendet). Kommt sie von „Datum erreicht“, ist sie eine **Frist** (Art „Frist“, Feld und Datum,
   *   wiederkehrend mit Folgetermin) – dieselbe Person bekommt je Mappe, Feld und Datum nur eine (auch neben der
   *   eingebauten Erinnerung).
   * - **Text** (#795): als Funktion bekommt sie den, der die Aufgabe wirklich bekommt (nach der Vertretung), und füllt
   *   die Platzhalter mit dessen Rechten.
   * - **Ohne Leserecht** (#798): Die Aufgabe hängt trotzdem an der Mappe; der Empfänger sieht nur einen Hinweis und die
   *   Fälligkeit, der Admin den Fall in der Werkbank.
   * - Benachrichtigungen bündeln je Automatisierung, Mappe und Empfänger (eine offene, der Text wird aktualisiert).
   */
  async aufgabeAusAutomatisierung(e: { mappeId: string; empfaengerId: string; text: string | ((an: string | null) => Promise<string>); datum: string | null; von: string; buendeln: string | null; anlass: Record<string, unknown>; aufgabenAnlass?: AufgabenAnlass | null; frist?: { feld: string; datum: string } | null }): Promise<{ id: string; ohneLeserecht: boolean; vorhanden?: boolean; an: string | null }> {
    const { an, ueber } = await this.aufgabenEmpfaenger(e.empfaengerId);
    const ohneLeserecht = !!an && !(await this.sichtbarFuer(an, [e.mappeId])).has(e.mappeId);
    const text = (typeof e.text === 'string' ? e.text : await e.text(an)).slice(0, AUFGABE_MAX);
    if (e.buendeln && an) {
      const id = await this.benachrichtigeGebuendelt({ empfaengerId: an, mappeId: e.mappeId, art: 'manuell', schluessel: `auto:${e.buendeln}:${e.mappeId}`.slice(0, 120), von: e.von, text: () => text });
      if (ohneLeserecht) await this.faelleNach([e.mappeId]);
      return { id, ohneLeserecht, an };
    }
    const frist = e.frist ?? null;
    if (frist) {
      // Schon eine Frist für diese Person (eingebaut, weitergegeben oder von einer anderen Automatisierung)? Dann keine zweite.
      const schon = (await this.repo.fristAufgaben([e.mappeId])).find((x) => x.feldKey === frist.feld && x.datum === frist.datum && [an, e.empfaengerId].includes(x.empfaengerId));
      if (schon) return { id: schon.id, ohneLeserecht, vorhanden: true, an };
    }
    let a: Aufgabe;
    try {
      a = await this.neueAufgabe({
        id: randomUUID(), mappeId: e.mappeId, empfaengerId: an, art: frist ? 'frist' : 'manuell', text,
        ...(frist ? { feldKey: frist.feld, datum: frist.datum } : { datum: e.datum }),
        anlass: e.aufgabenAnlass ?? null,
        erstellt: '', erstelltVon: e.von, erledigt: null, erledigtVon: null,
      });
    } catch (x) {
      // Gleichzeitig angelegt (eindeutiger Index der Fristen): die vorhandene zählt.
      const schon = frist ? (await this.repo.fristAufgaben([e.mappeId])).find((y) => y.feldKey === frist.feld && y.datum === frist.datum && y.empfaengerId === an) : undefined;
      if (schon) return { id: schon.id, ohneLeserecht, vorhanden: true, an };
      throw x;
    }
    const weiter = ueber.length ? t('meldungen.dienst.weitergegeben-wegen-abwesenheit-von-2', { all: (await Promise.all(ueber.map((x) => this.name(x)))).join(', ') }) : '';
    await this.notiere(e.mappeId, e.von, 'aufgabe', { ...e.anlass, text: t('meldungen.dienst.fuer-2', { name: await this.name(an), weiter, text }), aufgabe: a.id, aufgabenart: a.art, fuer: an, aufgabentext: text });
    if (ohneLeserecht) await this.faelleNach([e.mappeId]);
    return { id: a.id, ohneLeserecht, an };
  }

  /** Offene Aufgaben einer Mappe, deren Anlass `passt`, als erledigt eintragen (#724: „erledigt sich selbst“). */
  async erledigeNachAnlass(mappeId: string, passt: (x: AufgabenAnlass, a: Aufgabe) => boolean, grund: string): Promise<number> {
    let n = 0;
    for (const a of await this.repo.offeneAufgaben({ mappeIds: [mappeId] })) {
      if (!a.anlass || !passt(a.anlass, a)) continue;
      await this.repo.erledigeAufgabe(a.id, null);
      await this.notiere(mappeId, null, 'aufgabe', { text: t('meldungen.dienst.erledigt-3', { grund, text: a.text }), aufgabe: a.id, aufgabenart: a.art, fuer: a.empfaengerId, aufgabentext: a.text });
      n++;
    }
    if (n) await this.faelleNach([mappeId]);
    return n;
  }
}
