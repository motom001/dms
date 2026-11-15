/**
 * Aufgaben (#54, #56, #1078 aus dienst.ts): Empfänger prüfen, @-Erwähnungen in Feldern und Notizen als Aufgaben, die
 * Aufgaben aus Automatisierungen (auch „Post für dich“, #1001) und das Erledigen nach Anlass (#724). Die Freigabe
 * „Favoriten benachrichtigen“ (#506) steht seit #1001 in der Automatisierung.
 * Schicht 3 – bekommt den Kern, die Rechteprüfung, Mappen, Ereignisse, die Rollen (post/) und die übrigen Klassen dieses
 * Ordners (sie kennen einander über `teile`); Ereignis, Konten und die Gültigkeit der Zahlen über den Anschluss.
 */
import { randomUUID } from 'node:crypto';
import type { EreignisseDienst } from '../ereignisse/index';
import { Fachfehler } from '../fehler';
import type { Kern } from '../kern';
import type { MappenDienst, MappenHistorie } from '../mappen';
import type { PostSystemmappen } from '../post';
import { istUuid, type Repo } from '../repo';
import { t } from '../sprache';
import { historienAufgabentext } from './historientext';
import type { Gueltigkeit } from '../zaehlerspeicher';
import type { ZugriffDienst } from '../zugriff';
import { alsText, erwaehnungen, ohneTitel } from '../../../shared/src/markdown';
import { FAVORIT_ERWAEHNT, FAVORIT_ERWAEHNT_OFFEN, favoritErwaehntWahl, type FavoritErwaehntMerk } from '../../../shared/src/erwaehnen';
import { type Aufgabe, AUFGABE_MAX, type AufgabenAnlass, type Benutzer, type Mappentyp, type Werte } from '../../../shared/src/model';
import type { AblaufPlatzhalter, MappenAblaeufe } from './ablaeufe';
import type { Fristen } from './fristen';
import type { OhneEmpfaenger } from './ohne-empfaenger';
import type { OhneLeserecht } from './ohne-leserecht';
import type { AufgabenVertretung } from './vertretung';

/** Die Teile, die die Aufgaben rufen – dazu alle Klassen dieses Ordners (zusammengesetzt im Dienst). */
export interface AufgabenTeile {
  rechte: ZugriffDienst; historie: MappenHistorie; mappen: MappenDienst; ereignisse: EreignisseDienst; systemmappen: PostSystemmappen;
  aufgaben: AufgabenDienst; vertretung: AufgabenVertretung; ohneLeserecht: OhneLeserecht; fristen: Fristen; ohneEmpfaenger: OhneEmpfaenger;
  /** Mappen-Abläufe aus Automatisierungsvorlagen (#1044). */
  ablaeufe: MappenAblaeufe;
}

/** Konten (#43, #78, #506), vom Start angebunden: alle Personen mit Abwesenheit, persönliche Einstellungen. */
export interface AufgabenKonten {
  benutzer?(): Promise<Benutzer[]>;
  /**
   * Eine Person (#1256): nur Menschen, ohne letzte Aktivität – für Vertretung und Alltags-Empfänger, die nur wenige
   * Personen brauchen. Ohne sie lesen beide die Liste aller Personen.
   */
  person?(id: string): Promise<Benutzer | undefined>;
  /** Persönliche Einstellungen (#889: „Wenn ein Favorit erwähnt wird“). */
  einstellungen?(id: string): Promise<Record<string, unknown>>;
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
  /** Platzhalter der Automatisierungsvorlagen füllen (#1044, #795) – setzt der Motor (automatisierung.ts). */
  ablaufPlatzhalter?(): AblaufPlatzhalter | undefined;
  /** Wer Favoriten-Änderungen bekommt (#1001) – setzt der Motor; ohne ihn alle, Vorgabe an. */
  favoritenRegeln?(): Promise<Array<{ rollen: string[]; vorgabe: boolean }>> | undefined;
}

/** Art, Feld und Datum einer Aufgabe aus einer Automatisierung: Frist (#724), „Post für dich“ (#1001) oder Zugewiesen. */
function artUndSchluessel(frist: { feld: string; datum: string } | null, post: string | null, datum: string | null): Pick<Aufgabe, 'art' | 'feldKey' | 'datum'> {
  if (frist) return { art: 'frist', feldKey: frist.feld, datum: frist.datum };
  if (post) return { art: 'post', feldKey: post, datum };
  return { art: 'manuell', datum };
}

export class AufgabenDienst {
  constructor(private readonly kern: Kern, private readonly teile: AufgabenTeile, private readonly anschluss: AufgabenAnschluss) {}

  private get repo(): Repo { return this.kern.repo; }
  private get konten() { return this.anschluss.konten(); }
  private name(benutzerId: string | null): Promise<string> { return this.kern.name(benutzerId); }
  private notiere(...a: Parameters<MappenHistorie['notiere']>) { return this.teile.historie.notiere(...a); }
  private sichtbarFuer(benutzerId: string, ids: string[]) { return this.teile.rechte.sichtbarFuer(benutzerId, ids); }
  private neueAufgabe(a: Aufgabe, typ?: string) { return this.teile.ereignisse.neueAufgabe(a, typ); }
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
   * Gemeinsamer Abgleich für Felder und Notizen (#81): `quelle.key` unterscheidet die Stelle (Feldschlüssel oder
   * `notiz:<id>`), `quelle.ort` steht im Text („in „Beschreibung““, „in einer Notiz“). Nur **neue** Erwähnungen lösen
   * etwas aus, und nur solche, die der Erwähnende sehen darf (#137). Benutzer bekommen eine Aufgabe (#56); andere Mappen
   * melden sich bei denen, die sie als Favorit haben (#889).
   */
  async erwaehnungenAbgleichen(mappeId: string, quelle: { key: string; ort: string; auszug?: string }, altText: string, neuText: string, von: string | null) {
    const vorher = new Set(erwaehnungen(altText));
    const jetzt = new Set(erwaehnungen(neuText));
    if (!vorher.size && !jetzt.size) return;
    const { benutzer } = await this.kern.system();
    const offen = (await this.repo.offeneAufgaben({ mappeIds: [mappeId] })).filter((a) => a.art === 'erwaehnung' && a.feldKey === quelle.key);
    const sichtbar = von ? await this.sichtbarFuer(von, [...jetzt]) : new Set(jetzt);
    for (const id of jetzt) {
      if (vorher.has(id) || !sichtbar.has(id) || id === mappeId) continue;
      const m = await this.repo.holeMappe(id);
      if (!m) continue;
      if (m.typId !== benutzer.id) { await this.favoritErwaehnt(mappeId, m, quelle, von, offen); continue; }
      if (id === von || offen.some((a) => a.empfaengerId === id && a.anlass?.art !== 'favorit')) continue;
      // Deaktivierte nur, wenn ihr Vertreter übernimmt (#78).
      if (m.werte.aktiv === false && (await this.empfaengerAufloesen(id)).ziel === id) continue;
      const a = await this.neueAufgabe({
        id: randomUUID(), mappeId, empfaengerId: id, art: 'erwaehnung', feldKey: quelle.key,
        text: await this.erwaehntText(id, von, quelle, neuText),
        erstellt: '', erstelltVon: von, erledigt: null, erledigtVon: null,
      });
      // In die Historie nur der neutrale Text (#1293): Der Text der Aufgabe ist für den Empfänger aufbereitet.
      await this.notiere(mappeId, von, 'aufgabe', { text: t('meldungen.dienst.erwaehnt', { name: await this.name(id), ort: quelle.ort }), aufgabe: a.id, aufgabenart: 'erwaehnung', fuer: id, aufgabentext: historienAufgabentext(a, this.neutralerErwaehntText(quelle, neuText)) });
      await this.leiteUm(a);
    }
    for (const id of vorher) {
      if (jetzt.has(id)) continue;
      const m = await this.repo.holeMappe(id);
      if (m?.typId === benutzer.id) await this.notiere(mappeId, von, 'aufgabe', { text: t('meldungen.dienst.erwaehnung-von-entfernt', { name: await this.name(id), ort: quelle.ort }) });
    }
  }

  /** Derselbe Text neutral für die Historie (#1293): ohne Namen, Erwähnungen im Auszug nur als „@Erwähnung“. */
  private neutralerErwaehntText(quelle: { ort: string; auszug?: string }, text: string): string {
    const x = quelle.auszug === undefined ? '' : alsText(ohneTitel(text));
    const auszug = quelle.auszug === undefined ? '' : `: ${x.length > 80 ? `${x.slice(0, 77)} …` : x}`;
    return t('meldungen.dienst.erwaehnt-ohne-name', { ort: quelle.ort, wert: auszug }).slice(0, AUFGABE_MAX);
  }

  /**
   * Text der Aufgabe „Erwähnt von …“ für den Empfänger (#888, #889): Den Namen des Erwähnenden und Titel weiterer
   * Erwähnungen im Auszug nur, wenn der Empfänger diese Mappen lesen darf – sonst neutral.
   */
  private async erwaehntText(empfaenger: string, von: string | null, quelle: { ort: string; auszug?: string }, text: string): Promise<string> {
    const ids = erwaehnungen(text);
    const sieht = await this.sichtbarFuer(empfaenger, [...ids, ...(von ? [von] : [])]);
    // Titel erst hier (#1293): gespeichert ist nur die Kennung.
    const titel = quelle.auszug === undefined ? new Map<string, { titel: string }>() : await this.repo.bezuege(ids.filter((id) => sieht.has(id)));
    const auszug = quelle.auszug === undefined ? '' : (() => {
      const x = alsText(text, (id) => (sieht.has(id) && titel.has(id) ? titel.get(id)!.titel || t('meldungen.dienst.ohne-titel') : t('meldungen.dienst.erwaehnung-nicht-sichtbar')));
      return `: ${x.length > 80 ? `${x.slice(0, 77)} …` : x}`;
    })();
    const roh = von && !sieht.has(von)
      ? t('meldungen.dienst.erwaehnt-ohne-name', { ort: quelle.ort, wert: auszug })
      : t('meldungen.dienst.erwaehnt-von', { name: await this.name(von), ort: quelle.ort, wert: auszug });
    return roh.slice(0, AUFGABE_MAX);
  }

  /**
   * Eine andere Mappe wurde erwähnt (#889): Wer sie als Favorit hat, erfährt es – je nach Einstellung „Wenn ein Favorit
   * erwähnt wird“ sofort (Aufgabe an der Mappe mit der Erwähnung), in der täglichen Zusammenfassung oder nie. Nur wer
   * **beide** Mappen lesen darf; nie der Erwähnende selbst. Der Text nennt nur den Titel des Favoriten.
   */
  private async favoritErwaehnt(mappeId: string, ziel: { id: string; titel?: string | null }, quelle: { key: string; ort: string }, von: string | null, offen: Aufgabe[]) {
    const fav = (await this.repo.favoritenDerMappe(ziel.id)).filter((f) => f.benutzerId !== von);
    if (!fav.length) return;
    const aktiv = this.konten?.benutzer ? new Set((await this.konten.benutzer()).filter((b) => b.aktiv).map((b) => b.id)) : null;
    for (const { benutzerId } of fav) {
      if (aktiv && !aktiv.has(benutzerId)) continue;
      const e = (await this.konten?.einstellungen?.(benutzerId)) ?? {};
      const wahl = favoritErwaehntWahl(e[FAVORIT_ERWAEHNT]);
      if (wahl === 'nie') continue;
      const sieht = await this.sichtbarFuer(benutzerId, [ziel.id, mappeId]);
      if (!sieht.has(ziel.id) || !sieht.has(mappeId)) continue;
      if (wahl === 'zusammenfassung') { await this.merkeFuerZusammenfassung(benutzerId, e, { quelle: mappeId, ziel: ziel.id, ort: quelle.ort, am: new Date().toISOString() }); continue; }
      if (offen.some((a) => a.empfaengerId === benutzerId && a.anlass?.art === 'favorit' && a.anlass.mappe === ziel.id)) continue;
      await this.neueAufgabe({
        id: randomUUID(), mappeId, empfaengerId: benutzerId, art: 'erwaehnung', feldKey: quelle.key, anlass: { art: 'favorit', mappe: ziel.id },
        text: t('meldungen.dienst.favorit-erwaehnt', { titel: ziel.titel || t('meldungen.dienst.ohne-titel'), ort: quelle.ort }).slice(0, AUFGABE_MAX),
        erstellt: '', erstelltVon: von, erledigt: null, erledigtVon: null,
      });
    }
  }

  /** Für die tägliche Zusammenfassung merken (persönliche Einstellung, höchstens 50, neueste zuletzt). */
  private async merkeFuerZusammenfassung(benutzerId: string, e: Record<string, unknown>, x: FavoritErwaehntMerk) {
    const bisher = Array.isArray(e[FAVORIT_ERWAEHNT_OFFEN]) ? e[FAVORIT_ERWAEHNT_OFFEN] as FavoritErwaehntMerk[] : [];
    await this.konten?.setzeEinstellung?.(benutzerId, FAVORIT_ERWAEHNT_OFFEN, [...bisher.filter((y) => !(y.quelle === x.quelle && y.ziel === x.ziel)), x].slice(-50));
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
  async aufgabeAusAutomatisierung(e: { mappeId: string; empfaengerId: string; text: string | ((an: string | null) => Promise<string>); datum: string | null; von: string; buendeln: string | null; anlass: Record<string, unknown>; aufgabenAnlass?: AufgabenAnlass | null; frist?: { feld: string; datum: string } | null; postAn?: string | null }): Promise<{ id: string; ohneLeserecht: boolean; vorhanden?: boolean; an: string | null }> {
    // „Post für dich“ (#1001): Schlüssel an:<Person aus „An“> wie bisher im Kern – gibt es die Aufgabe schon offen
    // (auch eine vor dem Update angelegte oder an die Vertretung gegangene), entsteht keine zweite.
    const postSchluessel = e.postAn ? `an:${e.postAn}` : null;
    const schonPost = postSchluessel ? await this.offenePostAufgabe(e.mappeId, postSchluessel) : undefined;
    if (schonPost) return { id: schonPost.id, ohneLeserecht: false, vorhanden: true, an: schonPost.empfaengerId };
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
        id: randomUUID(), mappeId: e.mappeId, empfaengerId: an, text, ...artUndSchluessel(frist, postSchluessel, e.datum),
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

  /** Offene „Post für dich“ mit diesem Schlüssel (an:<Person>) an der Post (#1001). */
  private async offenePostAufgabe(mappeId: string, schluessel: string): Promise<Aufgabe | undefined> {
    return (await this.repo.offeneAufgaben({ mappeIds: [mappeId] })).find((x) => x.art === 'post' && x.feldKey === schluessel);
  }

  /** Offene Aufgaben einer Mappe, deren Anlass `passt`, als erledigt eintragen (#724: „erledigt sich selbst“). */
  async erledigeNachAnlass(mappeId: string, passt: (x: AufgabenAnlass, a: Aufgabe) => boolean, grund: string): Promise<number> {
    let n = 0;
    for (const a of await this.repo.offeneAufgaben({ mappeIds: [mappeId] })) {
      if (!a.anlass || !passt(a.anlass, a)) continue;
      await this.repo.erledigeAufgabe(a.id, null);
      await this.notiere(mappeId, null, 'aufgabe', { text: t('meldungen.dienst.erledigt-3', { grund, text: historienAufgabentext(a) }), aufgabe: a.id, aufgabenart: a.art, fuer: a.empfaengerId, aufgabentext: historienAufgabentext(a) });
      n++;
    }
    if (n) await this.faelleNach([mappeId]);
    return n;
  }
}
