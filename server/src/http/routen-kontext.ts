/**
 * Hilfen der Routen, die Dienste brauchen (#960): einmal je Aufruf von routen() gebaut und jeder Routendatei
 * als Parameter übergeben. Aus routen() hierher verschoben, unverändert.
 */
import { teiltypen } from '../../../shared/src/teile';
import type { Readable } from 'node:stream';
import { buffer as alsPuffer } from 'node:stream/consumers';
import { pdfFuerAnzeige } from '../pdfanzeige';
import type { Abruffassung, Benutzer, Mappe } from '../../../shared/src/model';
import type { Recht } from '../../../shared/src/rechte';
import type { DemoPlatz } from '../demo';
import type { Dienst } from '../dienst';
import { Fachfehler } from '../fehler';
import type { Konten } from '../konten';
import { zuletztListe } from '../konto-repo';
import { wunschAus } from '../../../shared/src/stempel';
import { loescheExport } from '../vollexport';
import { auskunftOrdner } from '../auskunft';
import { AUSKUNFT_TAGE } from '../../../shared/src/auskunft';
import { textDritte, type TextDritte } from '../../../shared/src/anrede';
import { t } from '../sprache';
import type { LoeschkonzeptQuelle } from '../../../shared/src/loeschkonzept';
import { AbrufBremse, AbrufTickets } from '../abruf';
import { darfBereich, darfVerwalten, hatGesamt } from '../../../shared/src/verwaltungsrecht';
import { Paketverwaltung } from '../pakete';
import { Paketerstellung } from '../paketerstellung';
import { Umwandlung } from '../umwandlung';
import { Entdecken } from '../entdecken';
import { heuteIn } from '../../../shared/src/sichten';
import { eigeneVersion } from '../system';
import { notfallblatt } from '../notfallblatt';
import { WartungFehler } from '../wartung';
import { Fotostapel } from '../fotostapel';
import { MAIL_STANDARD, STANDARD_TAGE, wirksameZeit, type MailZeit } from '../aufgabenmail';
import { LAENDER, ZEITZONEN, zeitzone } from '../../../shared/src/region';
import { istMaschinell, liesSpracheinstellung, spracheAusKopf, wirksameSprache } from '../../../shared/src/sprachwahl';
import { BUNDESLAENDER } from '../../../shared/src/feiertage';
import { RegionDienst } from '../region';
import { GB } from '../grenzen';
import { L, ich } from './routen-hilfen';
import type { Anfrage, Datei, Antwort, RoutenExtras } from '../routen';

export function routenKontext(dienst: Dienst, konten: Konten, x: RoutenExtras = {}) {
  const fotostapel = x.fotostapel ?? new Fotostapel();
  const { messung, system } = x;
  const designs = () => { if (!x.designs) throw new Fachfehler(404, t('meldungen.routen.designs-sind-nicht-eingerichtet')); return x.designs; };
  const log = x.log ?? ((m: string) => L.mail.warn(m));
  const pakete = x.pakete ?? new Paketverwaltung(dienst, { version: eigeneVersion, benutzer: async () => (await konten.listeBenutzer()).filter((b) => b.aktiv !== false).map((b) => ({ id: b.id, name: b.name || b.email })) });
  const paketerstellung = new Paketerstellung(dienst, { version: eigeneVersion });
  // Ablago entdecken (#831, #832): Rundgänge und Tipps je Person; Funktionen, nach denen Tipps gefiltert werden.
  const entdecken = x.entdecken ?? new Entdecken({
    einstellungen: (b) => konten.einstellungen(b), setzeEinstellung: (b, k, w) => konten.setzeEinstellung(b, k, w),
    version: eigeneVersion, heute: () => heuteIn(),
    funktionen: async () => {
      const f = new Set<'fragen' | 'laufwerk' | 'mail'>();
      if ((await dienst.fragen.stand()).verfuegbar) f.add('fragen');
      if (x.webdav && (await x.webdav.einstellung()).aktiv) f.add('laufwerk');
      if (konten.mailAktiv) f.add('mail');
      return f;
    },
    log: L.konto,
  });
  const umwandlung = new Umwandlung(dienst);
  const wer = (a: Anfrage) => ({ id: a.benutzer?.id ?? null, email: a.benutzer?.email ?? null });
  /**
   * Hilfen des Einrichtungsassistenten (#804, #806): Code vor der Einrichtung, danach bei offenem Assistenten eine
   * Person mit „Gesamte Verwaltung“ (#818) – nicht in einer Vertretung und nicht mit API-Schlüssel.
   */
  const einrichtungZugang = async (a: Anfrage) => {
    if (!x.einrichtung) throw new Fachfehler(404, t('meldungen.routen.kein-einrichtungsassistent'));
    await x.einrichtung.pruefeZugang(a.einrichtungscode, !!a.benutzer && !a.apiSchluessel && hatGesamt(a.benutzer) && !a.sitzungsDaten?.vertretungId);
  };
  /**
   * Ist ein Abruf ein Weitergeben (#394)? Herunterladen (?herunterladen), Stempel-Parameter oder ein API-Schlüssel
   * eines Benutzers. Anzeigen in der Oberfläche und Pakete (Dienstkonten, z. B. Texterkennung) bekommen das Original.
   */
  const weitergabe = (a: Anfrage) => a.query.herunterladen !== undefined || a.query.verkleinern !== undefined || !!wunschAus(a.query) || (!!a.apiSchluessel && a.benutzer?.art !== 'dienst');
  /**
   * Herunterladen ist Mitnehmen (#723): verlangt außer Lesen das Exportrecht E – über die gemeinsame Prüfstelle wie
   * E-Mail, Export und Laufwerk. Anzeigen im Browser (inline) bleibt mit R. Dienstkonten der Pakete (Texterkennung,
   * Umwandlung, Archivfassung) lesen Dateien zur Verarbeitung in Ablago und brauchen E nicht.
   */
  const mitnehmen = async (a: Anfrage, mappeId: string) => {
    if (a.benutzer?.art === 'dienst') return;
    await dienst.ausgang.pruefeAusgang(ich(a), await zg(a), 'herunterladen', [mappeId]);
    await modusSpur(a, [mappeId], 'heruntergeladen');
  };
  /**
   * Abruf in die Historie (#800): in der Oberfläche heruntergeladen oder mit einem API-Schlüssel abgerufen – erst wenn
   * die Datei fertig zum Ausliefern ist (Rechte geprüft, Stempel und Fassung gebildet), nie bei einem Fehler. Pakete
   * (Dienstkonten) lesen Dateien zur Verarbeitung in Ablago; das ist kein Abruf. Gleiche Abrufe am selben Tag fasst
   * `notiereAbruf` zu einem Eintrag zusammen. Scheitert das Schreiben, geht die Datei nicht hinaus.
   */
  const abgerufen = async <T extends Antwort>(a: Anfrage, dokumentId: string, o: { fassung?: Abruffassung; version?: number | null; gestempelt?: boolean; datei?: string }, antwort: T): Promise<T> => {
    if (a.benutzer?.art === 'dienst') return antwort;
    try {
      await dienst.mappenHistorie.notiereAbruf({ dokumentId, benutzerId: ich(a).id, weg: a.apiSchluessel ? 'api' : 'oberflaeche', schluessel: a.apiSchluessel?.name ?? null, ...o });
    } catch (e) {
      const inhalt = antwort.datei?.inhalt;
      if (inhalt && !Buffer.isBuffer(inhalt)) (inhalt as Readable).destroy();
      throw e;
    }
    return antwort;
  };
  /** Abruf mit dem API-Schlüssel eines Menschen (nicht eines Pakets): gilt als Herausgeben (#394, #799). */
  const herausgeben = (a: Anfrage) => !!a.apiSchluessel && a.benutzer?.art !== 'dienst';
  /**
   * Seitenbilder über einen API-Schlüssel (#799): Recht E und – wenn ein Stempel gilt – Bilder aus der gestempelten
   * Kopie. Oberfläche und Pakete bekommen die Seiten, wie sie abgelegt sind (null).
   */
  const seitenquelle = async (a: Anfrage, mappeId: string) => {
    if (!herausgeben(a)) return null;
    await mitnehmen(a, mappeId);
    return dienst.ausgang.gestempelteSeiten(a.params.id, { stempel: a.query, ich: ich(a) });
  };
  /** Kommt die Datei nicht zum Ansehen (inline), sondern zum Abspeichern? Mit API-Schlüssel eines Menschen immer. */
  const zumAbspeichern = (a: Anfrage) => a.query.herunterladen !== undefined || (!!a.apiSchluessel && a.benutzer?.art !== 'dienst');
  /**
   * Anzeige im Browser (#639): Ein PDF kommt nur als bereinigte Kopie in den eingebauten Betrachter (ohne JavaScript,
   * automatische Aktionen, Formular-Übermittlung, eingebettete Dateien). Mit API-Schlüssel (Pakete) das Original.
   * Lässt es sich nicht bereinigen, gibt es statt der Anzeige einen kurzen Hinweis – Herunterladen geht weiter.
   */
  const fuerAnzeige = async (a: Anfrage, d: Datei): Promise<Antwort> => {
    if (!d.anzeigen || d.mime !== 'application/pdf' || a.apiSchluessel) return { datei: d };
    const pdf = await pdfFuerAnzeige(Buffer.isBuffer(d.inhalt) ? d.inhalt : await alsPuffer(d.inhalt));
    if (!pdf) {
      const hinweis = Buffer.from('Dieses PDF lässt sich nicht sicher anzeigen (verschlüsselt oder beschädigt). Bitte lade es herunter und öffne es in einem PDF-Programm.\n\nThis PDF cannot be displayed safely (encrypted or damaged). Please download it and open it in a PDF reader.\n');
      return { datei: { inhalt: hinweis, name: 'hinweis.txt', mime: 'text/plain; charset=utf-8', anzeigen: true, groesse: hinweis.length, koepfe: { 'x-dms-anzeige': 'nur-herunterladen', 'cache-control': 'no-store' } } };
    }
    return { datei: { ...d, inhalt: pdf, groesse: pdf.length, koepfe: { ...d.koepfe, 'x-dms-anzeige': 'bereinigt' } } };
  };
  /** Antwort für eine ausgegebene Datei (#394): immer als Herunterladen. Verkleinert (#393): Kopf X-DMS-Verkleinert „vorher/nachher“. */
  const ausgabeDatei = (r: { name: string; mime: string; anzeigbar: boolean; groesse: number; inhalt: Buffer | Readable; gestempelt: boolean; verkleinert?: { vorher: number; nachher: number } | null }): Antwort => {
    L.dokumente.debug(r.gestempelt ? 'Dokument mit Stempel heruntergeladen' : 'Dokument heruntergeladen', { name: r.name });
    const koepfe: Record<string, string> = { ...(r.gestempelt ? { 'x-dms-stempel': '1' } : {}), ...(r.verkleinert ? { 'x-dms-verkleinert': `${r.verkleinert.vorher}/${r.verkleinert.nachher}` } : {}) };
    return { datei: { inhalt: r.inhalt, name: r.name, mime: r.anzeigbar ? r.mime : 'application/octet-stream', anzeigen: false, groesse: r.groesse, ...(Object.keys(koepfe).length ? { koepfe } : {}) } };
  };
  const typName = async (id: string) => (await dienst.mappentypen.listeTypen()).find((t) => t.id === id)?.name ?? id;
  /** Passwörter für Dokumente (#827): nur die Person selbst im Browser – kein API-Schlüssel, keine Vertretung. */
  const nurSelbst = (a: Anfrage) => {
    if (a.apiSchluessel || !a.sitzungsDaten?.id) throw new Fachfehler(403, t('mappen.entsperren.gemerkt.nur-browser'));
    if (a.sitzungsDaten.vertretungId) throw new Fachfehler(403, t('mappen.entsperren.gemerkt.vertretung'));
    const e = dienst.geschuetztePdfs.pdfEntsperren;
    if (!e) throw new Fachfehler(404, t('mappen.entsperren.gemerkt.aus'));
    return e;
  };
  const betrieb = () => { if (!x.betrieb) throw new Fachfehler(404, t('meldungen.routen.betriebseinstellungen-sind-nicht')); return x.betrieb; };
  const region = () => { if (!x.region) throw new Fachfehler(404, t('meldungen.routen.die-region-ist-nicht')); return x.region; };
  const sprachen = () => { if (!x.sprachen) throw new Fachfehler(404, t('meldungen.sprachen.nicht-eingerichtet')); return x.sprachen; };
  /** Sprache für die Oberfläche (#729): die der Person, sonst die mitgeschickte, sonst die der Installation. */
  const spracheFuer = async (a: Anfrage) => {
    const e = x.sprachen ? await x.sprachen.lies() : liesSpracheinstellung(null);
    const kopf = spracheAusKopf(a.kopf?.('x-sprache'), e.erlaubt);
    return {
      sprache: a.benutzer ? wirksameSprache(a.benutzer.sprache ?? kopf, e) : kopf ?? e.standard,
      standard: e.standard, erlaubt: e.erlaubt,
      maschinell: e.erlaubt.filter(istMaschinell),
    };
  };
  const regionStand = async (r: import('../../../shared/src/region').Region) => ({
    region: r, laender: LAENDER, bundeslaender: BUNDESLAENDER, zeitzonen: ZEITZONEN, feiertage: RegionDienst.feiertageIm(r),
  });
  /** Eigene Einstellung der täglichen Zusammenfassung mit den Standards der Werkbank (#92, #94). */
  const zusammenfassung = async (i: Benutzer) => {
    // Standard seit #1001 aus der eingeschalteten Automatisierung (Uhrzeit ihrer Wenn-Karte), Feiertage aus der Region.
    const vorgabe = (await dienst.zusammenfassungVorgabe?.()) ?? null;
    const std = { aktiv: !!vorgabe, uhrzeit: vorgabe?.uhrzeit ?? MAIL_STANDARD.uhrzeit, bundesland: x.region ? (await x.region.lies()).bundesland : null };
    const e = await konten.einstellungen(i);
    const eigen = e.aufgaben_mail_zeit && typeof e.aufgaben_mail_zeit === 'object' ? e.aufgaben_mail_zeit as Partial<MailZeit> : null;
    return {
      aktiv: e.aufgaben_mail !== false,
      uhrzeit: typeof eigen?.uhrzeit === 'string' ? eigen.uhrzeit : null,
      ...(({ tage, feiertage }) => ({ tage, feiertage }))(wirksameZeit(eigen, std)),
      standard: { uhrzeit: std.uhrzeit, tage: STANDARD_TAGE, bundesland: std.bundesland },
      versand: !!x.betrieb?.mailer() && std.aktiv,
    };
  };
  const ocr = () => { if (!x.texterkennung) throw new Fachfehler(404, t('meldungen.routen.die-texterkennung-ist-nicht')); return x.texterkennung; };
  const meldungen = () => { if (!x.fehlermeldungen) throw new Fachfehler(404, t('meldungen.routen.gemeldete-fehler-sind-nicht')); return x.fehlermeldungen; };
  const tresor = () => { if (!x.tresor) throw new Fachfehler(404, t('meldungen.routen.die-verschluesselung-ist-nicht')); return x.tresor; };
  const schluessel = () => { if (!x.apiSchluessel) throw new Fachfehler(404, t('meldungen.routen.api-schluessel-sind-nicht')); return x.apiSchluessel; };
  const webhooks = () => { if (!x.webhooks) throw new Fachfehler(404, t('webhook.nicht-eingerichtet')); return x.webhooks; };
  const autos = () => { if (!x.automatisierungen) throw new Fachfehler(404, t('meldungen.routen.automatisierungen-sind-nicht')); return x.automatisierungen; };
  /**
   * ?passwoerter=anzeigen (#46): nur mit einem API-Schlüssel, der das Recht „Passwörter lesen“ hat.
   * Liefert den Namen des Schlüssels fürs Protokoll, sonst null.
   */
  const passwoerterAnzeigen = (a: Anfrage): string | null => {
    if (a.query.passwoerter === undefined) return null;
    if (a.query.passwoerter !== 'anzeigen') throw new Fachfehler(422, t('meldungen.routen.passwoerter-kennt-nur-den'));
    if (!a.apiSchluessel?.passwoerter) throw new Fachfehler(403, t('meldungen.routen.passwoerter-liefert-die-api'));
    return a.apiSchluessel.name;
  };
  /**
   * Technische Aufgaben (#719, #819): Hinweis ohne Einzelheiten für Personen mit Verwaltungsrecht außerhalb des
   * Verwaltungsmodus, wenn in einem ihrer Bereiche etwas anliegt – nicht in einer Vertretung, und nur ja/nein.
   */
  const verwaltungHinweis = async (a: Anfrage): Promise<boolean> => {
    if (!a.benutzer || a.benutzer.rolle === 'admin' || !darfVerwalten(a.benutzer) || a.sitzungsDaten?.vertretungId || !x.verwaltung) return false;
    try { return await x.verwaltung.offen(a.benutzer); } catch { return false; }
  };
  /**
   * Spur im Verwaltungsmodus (#820): Öffnet, lädt herunter, ändert, exportiert oder versendet jemand im Modus eine
   * Mappe, die er mit seinen Alltagsrechten nicht lesen dürfte, steht das dauerhaft in ihrer Historie. Liefert die
   * Mappen, für die das gilt.
   */
  const modusSpur = async (a: Anfrage, ids: string[], was: 'angesehen' | 'heruntergeladen' | 'geaendert' | 'exportiert' | 'versendet'): Promise<Set<string>> => {
    if (a.benutzer?.rolle !== 'admin' || a.konsole || !ids.length) return new Set();
    return dienst.systemtypen.vermerkeVerwaltungsmodus({ ...a.benutzer, rolle: 'mitglied' }, ids, was);
  };
  /** Berechtigungen (#124): Zugriff des Benutzers, einmal je Anfrage. */
  const zg = (a: Anfrage) => dienst.rechtepruefung.zugriff(ich(a));
  /** #137: Empfänger von Aufgaben nur unter den Benutzern, die man sieht. */
  const empfaengerSichtbar = async (a: Anfrage, id: unknown) => {
    if (typeof id !== 'string' || !id) return;
    if (!(await dienst.rechtepruefung.lesbare(await zg(a), [id])).has(id)) throw new Fachfehler(422, t('meldungen.routen.diesen-benutzer-gibt-es'));
  };
  /** #127: Darf der Empfänger die Mappe lesen? Sonst ein Hinweis in der Antwort. */
  const leseHinweis = async (empfaengerId: string | null, mappeId: string) =>
    (empfaengerId && !(await dienst.rechtepruefung.kannLesen(empfaengerId, mappeId)) ? { hinweis: t('meldungen.routen.gespeichert-der-empfaenger-darf') } : {});
  const darf = async (a: Anfrage, mappeId: string, recht: Recht) => dienst.rechtepruefung.pruefeRecht(await zg(a), mappeId, recht);
  /** „Zuletzt geöffnet“ (#334, #940): nur lesbare Mappen außerhalb des Papierkorbs, neueste oben, je mit Zeitpunkt. */
  const zuletztGeoeffnet = async (a: Anfrage, anzahl: number) => {
    const liste = zuletztListe((await konten.einstellungen(ich(a))).zuletzt_geoeffnet);
    const ids = liste.map((x) => x.id);
    const lesbar = await dienst.rechtepruefung.lesbare(await zg(a), ids);
    const bezuege = await dienst.dokumente.bezuegeVon(ids.filter((id) => lesbar.has(id)));
    // Teile (#1031) nicht: Sie erscheinen nur an ihrer übergeordneten Mappe.
    const teile = teiltypen((await zg(a)).typen.values());
    return liste.filter((x) => bezuege.has(x.id) && !teile.has(bezuege.get(x.id)!.typId)).slice(0, anzahl).map((x) => ({ id: x.id, typId: bezuege.get(x.id)!.typId, titel: bezuege.get(x.id)!.titel, am: x.am }));
  };
  /** Klartext von Passwörtern nur für Mappen mit Recht P; die anderen bleiben verdeckt. */
  const entschluessele = async <T extends Mappe>(a: Anfrage, mappen: T[], klartext: string): Promise<T[]> => {
    const { mit } = await dienst.rechtepruefung.mitPasswortRecht(await zg(a), mappen);
    const klar = new Map((await dienst.passwortfelder.entschluesselePasswoerter(mit, klartext, ich(a).id)).map((m) => [m.id, m]));
    return mappen.map((m) => klar.get(m.id) ?? m);
  };
  /** Benutzer mit ihren weiteren Rollen (#27). */
  const mitRollen = async (b: Benutzer) => ({ ...b, rollen: (await dienst.systemtypen.weitereRollen()).get(b.id) ?? [] });
  const sicherung = () => { if (!x.sicherung) throw new Fachfehler(404, t('meldungen.routen.sicherungen-sind-nicht-eingerichtet')); return x.sicherung; };
  /** Paket mit dms:sicherung-lesen (#585) – Menschen und andere Pakete bekommen 403. */
  const sicherungsPaket = async (a: Anfrage): Promise<string> => {
    const p = (await zg(a)).paket;
    if (!p) throw new Fachfehler(403, t('pakete.sicherung.nur-pakete'));
    if (!p.schnittstellen?.includes('dms:sicherung-lesen')) throw new Fachfehler(403, t('pakete.sicherung.recht'));
    return p.id;
  };
  /**
   * Persönlicher Export (#255): je Benutzer, ob er gerade läuft und woran er zuletzt scheiterte – seit #744 im
   * Kurzzustand, damit jeder Prozess es weiß. „Läuft“ ist eine Belegung mit Frist (endet ein Prozess mittendrin).
   */
  const EXPORT_LAEUFT = 'eigener-export-laeuft', EXPORT_FEHLER = 'eigener-export-fehler';
  const eigenerExport = async (id: string) => ({
    laeuft: !!(await dienst.kurzzustand.lies(EXPORT_LAEUFT, id)),
    fehler: ((await dienst.kurzzustand.lies(EXPORT_FEHLER, id))?.wert as string | undefined) ?? null,
  });
  // Vollexport (#254), persönliche Exporte (#255) und Auskünfte (#396) im Export-Ordner (#797), nicht bei den Sicherungen.
  // Auskünfte ohne Export-Ordner (Tests) im temporären Ordner.
  const auskunftZiel = () => auskunftOrdner(x.exporte?.pfad);
  /** Löschkonzept (#469): nur Typen, Einstellungen und Fristen – nichts aus Mappen. */
  const loeschkonzeptQuelle = async (): Promise<LoeschkonzeptQuelle> => ({
    // Verantwortlicher aus der eigenen Organisation (#995), sonst die bisherige Angabe.
    typen: await dienst.mappentypen.listeTypen(), datenschutz: await dienst.datenschutzDienst.datenschutzFuerUnterlagen(),
    papierkorbTage: await dienst.kern.papierkorbTage(), historieTage: await dienst.mappenHistorie.historieTage(),
    // Ohne eingerichtete Sicherung (oder wenn der Plan nicht lesbar ist) steht im Dokument „keine automatischen Sicherungen“.
    sicherung: (await x.sicherung?.plan?.().catch(() => null)) ?? null, auskunftTage: AUSKUNFT_TAGE,
    version: eigeneVersion(), stand: new Intl.DateTimeFormat('sv-SE', { timeZone: zeitzone() }).format(new Date()), mandant: (await x.mandantName?.()) ?? '',
    loeschprotokoll: { jahre: await dienst.loeschprotokollVerwaltung.loeschprotokollJahre() },
  });
  /** Auskunft zustellen (#455): Einmal-Tickets der öffentlichen Abrufseite. */
  const abrufTickets = new AbrufTickets(Date.now, dienst.kurzzustand);
  /** Fehlversuche je IP-Bereich über alle Abruf-Links und gleichzeitige Code-Prüfungen – getrennt vom Anmeldeschutz. */
  const abrufBremse = new AbrufBremse({ zustand: dienst.kurzzustand });
  /**
   * Notfallblatt (#106, #814) als PDF – jedes neue Blatt mit neuem Notfallcode (#815): Der bisherige gilt danach nicht
   * mehr, gespeichert ist nur der Hash des neuen. Aus der Werkbank (frische Anmeldung) und nach dem Notfallzugang.
   */
  const notfallblattErzeugen = async (von: string): Promise<Buffer> => {
    const tresor2 = tresor();
    const text = tresor2.alsText();
    if (!text || !tresor2.fingerabdruck) throw new Fachfehler(409, t('meldungen.routen.es-gibt-noch-keinen'));
    // #814: keine Ordner oder Dateinamen aus Docker oder vom NAS auf dem Blatt – nur Verweise ins Handbuch.
    const inhalt = await notfallblatt({
      name: (x.designs ? (await x.designs.marke()).schriftzug : null) || 'Ablago',
      haushaltId: x.sicherung?.haushaltId ?? '–',
      adresse: x.betrieb ? x.betrieb.ansicht().adresse || x.betrieb.adresseFuerLinks() : '',
      version: eigeneVersion(), erstellt: new Date(), schluessel: text, fingerabdruck: tresor2.fingerabdruck,
      aussenziele: x.sicherung ? await x.sicherung.externZiele().catch(() => []) : [],
      notfallcode: await konten.neuerNotfallcode(),
    });
    if (x.sicherung) await x.sicherung.notfallblattErstellt(von);
    else L.system.warn('Notfallblatt heruntergeladen', { von, fingerabdruck: tresor2.fingerabdruck });
    return inhalt;
  };
  const notfallblattDatei = async (von: string): Promise<Antwort> => {
    const inhalt = await notfallblattErzeugen(von);
    // Der Schlüssel steht darauf: nicht im Cache des Browsers ablegen.
    return { datei: { inhalt, name: `Ablago-Notfallblatt-${new Date().toISOString().slice(0, 10)}.pdf`, mime: 'application/pdf', anzeigen: false, groesse: inhalt.length, koepfe: { 'cache-control': 'no-store' } } };
  };
  const nf = () => { if (!x.notfallcode) throw new Fachfehler(404, t('konten.notfall.fehler.aus')); return x.notfallcode; };
  /** Meldungen der Abrufseite in der Anrede für Dritte (#474). */
  const abrufText = async (k: TextDritte) => textDritte((await dienst.datenschutzDienst.datenschutz()).anrede, k);
  const exportZiel = () => { if (!x.exporte) throw new Fachfehler(404, t('werkbank.export.ohne-ordner')); return x.exporte.pfad; };
  /** Nach dem Herunterladen gelöscht (#797), wie die Auskunft: erst, wenn die ZIP ganz gelesen ist. */
  const danachLoeschen = (strom: Readable, ordner: string, melde: () => void) => strom.on('end', () => void loescheExport(ordner).then(melde, () => {}));
  const oidc = () => { if (!x.oidc) throw new Fachfehler(404, t('meldungen.routen.die-anmeldung-ueber-einen')); return x.oidc; };
  const adresse = () => (x.betrieb?.adresseFuerLinks() ?? '').replace(/\/+$/, '');
  const zf = () => { if (!konten.zweifaktor) throw new Fachfehler(404, t('meldungen.routen.die-zwei-faktor-anmeldung')); return konten.zweifaktor; };
  const pk = () => { if (!konten.passkeys) throw new Fachfehler(404, t('anmeldung.passkey.fehler.aus')); return konten.passkeys; };
  const postfaecher = () => { if (!x.postfaecher) throw new Fachfehler(404, t('meldungen.routen.postfaecher-sind-nicht-eingerichtet')); return x.postfaecher; };
  const pfOAuth = () => { if (!x.postfachOAuth) throw new Fachfehler(404, t('meldungen.routen.die-anmeldung-per-oauth')); return x.postfachOAuth; };
  /** #358: Rückruf-Adresse fest aus der eingestellten Adresse des DMS – nie aus der Anfrage. */
  const pfRueckruf = () => (adresse() ? `${adresse()}/api/oauth/postfach/rueckruf` : '');
  const oauthPostfach = async (id: string) => {
    const p = await postfaecher().hole(id);
    if (p.anmeldung !== 'oauth' || !p.anbieter) throw new Fachfehler(409, t('meldungen.routen.dieses-postfach-meldet-sich'));
    return { id: p.id, anbieter: p.anbieter, benutzer: p.benutzer };
  };
  /** Demo-Dokumente (#248): freier Platz bei den Dateien; frei bleiben müssen Mindest-Speicherplatz der Sicherung bzw. die Speicherplatz-Grenze. */
  const demoPlatz: DemoPlatz | undefined = x.speicherplatz ? {
    frei: async () => (await x.speicherplatz!.messe()).ordner.find((o) => o.art === 'dateien')?.frei ?? null,
    mindest: async () => {
      const grenze = (await x.speicherplatz!.messe()).ordner.find((o) => o.art === 'dateien')?.grenzBytes ?? 0;
      const sich = x.sicherung ? (await x.sicherung.plan()).mindestFreiGB * GB : 0;
      return Math.max(grenze, sich);
    },
  } : undefined;
  const wh = () => { if (!x.wiederherstellung) throw new Fachfehler(404, t('meldungen.routen.die-wiederherstellung-ist-nicht')); return x.wiederherstellung; };
  const anbindung = () => { if (!x.anbindung) throw new Fachfehler(404, t('meldungen.routen.die-datenbank-anbindung-ist')); return x.anbindung; };
  const speicherplatz = () => { if (!x.speicherplatz) throw new Fachfehler(404, t('meldungen.routen.die-speicherplatz-ueberwachung-ist')); return x.speicherplatz; };
  /** Stand für den Wiederherstellungsbildschirm: läuft etwas, oder gibt es eine Abschlussmeldung? */
  const whStand = async () => {
    const lauf = x.wiederherstellung?.aktuellerLauf();
    const abschluss = x.sicherung ? (await x.sicherung.einstellungen.lies('wiederherstellung_abschluss')) as Record<string, unknown> | null : null;
    // Ohne Anmeldung lesbar: ohne die Adresse dessen, der sie gestartet hat.
    return {
      lauf: lauf?.art === 'wiederherstellung' ? { ...lauf, von: '' } : null,
      abschluss: abschluss ? { ...abschluss, von: '' } : null,
    };
  };
  const wartung = () => { if (!x.wartung) throw new Fachfehler(404, t('meldungen.routen.der-wartungsmodus-ist-nicht')); return x.wartung; };
  /** Wiederherstellen im laufenden System (#107, #818): im Verwaltungsmodus mit Recht auf „Sicherung“. */
  const darfWiederherstellen = (a: Anfrage) => a.benutzer?.rolle === 'admin' && darfBereich(a.benutzer, 'sicherung');
  /** Ab der Ankündigung kommen nur Administratoren hinein (#102): eine neue Sitzung gleich wieder beenden. */
  const nurAdminsInWartung = async (r: { benutzer: Benutzer; schluessel: string }) => {
    if (!x.wartung?.sperrtAnmeldung(r.benutzer)) return;
    await konten.abmelden(r.schluessel);
    L.konto.info('Anmeldung im Wartungsmodus abgewiesen', { email: r.benutzer.email });
    throw new WartungFehler(x.wartung.meldung(), x.wartung.retryAfter());
  };
  return {
    dienst, konten, x, fotostapel, messung, system, designs, log,
    pakete, paketerstellung, entdecken, umwandlung, wer, einrichtungZugang, weitergabe, mitnehmen,
    abgerufen, herausgeben, seitenquelle, zumAbspeichern, fuerAnzeige, ausgabeDatei, typName, nurSelbst,
    betrieb, region, sprachen, spracheFuer, regionStand, zusammenfassung, ocr,
    meldungen, tresor, schluessel, webhooks, autos, passwoerterAnzeigen, verwaltungHinweis, modusSpur,
    zg, empfaengerSichtbar, leseHinweis, darf, zuletztGeoeffnet, entschluessele, mitRollen, sicherung,
    sicherungsPaket, EXPORT_LAEUFT, EXPORT_FEHLER, eigenerExport, auskunftZiel, loeschkonzeptQuelle, abrufTickets, abrufBremse,
    notfallblattErzeugen, notfallblattDatei, nf, abrufText, exportZiel, danachLoeschen, oidc, adresse,
    zf, pk, postfaecher, pfOAuth, pfRueckruf, oauthPostfach, demoPlatz, wh, anbindung,
    speicherplatz, whStand, wartung, darfWiederherstellen, nurAdminsInWartung,
  };
}

export type RoutenKontext = ReturnType<typeof routenKontext>;
