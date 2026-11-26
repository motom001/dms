/**
 * Betrieb im Routen-Kontext (#1278, Schritt 6b-1: aus `routenKontext` verschoben, unverändert): Sprache, Region,
 * tägliche Zusammenfassung, Speicherplatz für Demo-Daten, Stand der Wiederherstellung, Exporte und Auskünfte,
 * Löschkonzept, Notfallblatt und die Adresse für Rückrufe.
 */
import { zielHost } from '../../../shared/src/automatisierung';
import type { Readable } from 'node:stream';
import type { Benutzer } from '../../../shared/src/model';
import type { DemoPlatz } from '../demo/demo';
import type { Dienst } from '../dienst/dienst';
import { Fachfehler } from '../grundlagen/fehler';
import type { Konten } from '../konten';
import { loescheExport } from '../export/vollexport';
import { auskunftOrdner } from '../datenschutz/auskunft';
import { AUSKUNFT_TAGE } from '../../../shared/src/auskunft';
import { textDritte, type TextDritte } from '../../../shared/src/anrede';
import { t } from '../sprache/sprache';
import type { LoeschkonzeptQuelle } from '../../../shared/src/loeschkonzept';
import { erreichbar } from '../../../shared/src/notfallkontakte';
import { eigeneVersion } from '../system/system';
import { notfallblatt } from '../notfall/notfallblatt';
import { MAIL_STANDARD, STANDARD_TAGE, wirksameZeit, type MailZeit } from '../aufgaben/aufgabenmail';
import { LAENDER, tagIn, ZEITZONEN, zeitzone, type Region } from '../../../shared/src/region';
import { istMaschinell, liesSpracheinstellung, spracheAusKopf, wirksameSprache } from '../../../shared/src/sprachwahl';
import { RegionDienst } from '../einstellungen/region';
import { feiertagsquelle } from '../../../shared/src/feiertagsquelle';
import { GB } from '../grundlagen/grenzen';
import { L } from './routen-hilfen';
import type { Anfrage, Antwort } from './routen-typen';
import type { RoutenExtras } from './routen-extras';
import type { betriebsBausteine, sicherungsBausteine } from './routen-kontext-bausteine';

/** Sprache, Region, tägliche Zusammenfassung, Platz für Demo-Daten und Stand der Wiederherstellung. */
export function einstellungsHilfen(dienst: Dienst, konten: Konten, x: RoutenExtras) {
  /** Sprache für die Oberfläche (#729): die der Person, sonst die mitgeschickte, sonst die der Installation. */
  const spracheFuer = async (a: Anfrage) => {
    // #1198: höchstens kurz auf die Datenbank warten, sonst die zuletzt gelesene Einstellung.
    const e = x.sprachen ? await x.sprachen.liesHoechstens() : liesSpracheinstellung(null);
    const kopf = spracheAusKopf(a.kopf?.('x-sprache'), e.erlaubt);
    return {
      sprache: a.benutzer ? wirksameSprache(a.benutzer.sprache ?? kopf, e) : (kopf ?? e.standard),
      standard: e.standard,
      erlaubt: e.erlaubt,
      maschinell: e.erlaubt.filter(istMaschinell),
    };
  };
  // Regionen und Feiertage aus der Feiertagsquelle (#1696): aus einem Regionspaket, sonst wie bisher aus dem Kern.
  const regionStand = async (r: Region) => {
    const q = feiertagsquelle(await dienst.kern.repo.listePakete(), r);
    return {
      region: r,
      laender: LAENDER,
      bundeslaender: q.regionen,
      zeitzonen: ZEITZONEN,
      feiertage: RegionDienst.feiertageIm(r, undefined, q),
      // Woher die Feiertage kommen (Werkbank → Region): Paketname oder null (Ablago rechnet selbst).
      feiertagsquelle: q.paket,
    };
  };
  /** Eigene Einstellung der täglichen Zusammenfassung mit den Standards der Werkbank (#92, #94). */
  const zusammenfassung = async (i: Benutzer) => {
    // Standard seit #1001 aus der eingeschalteten Automatisierung (Uhrzeit ihrer Wenn-Karte), Feiertage aus der Region.
    const vorgabe = (await dienst.zusammenfassungVorgabe?.()) ?? null;
    const std = {
      aktiv: !!vorgabe,
      uhrzeit: vorgabe?.uhrzeit ?? MAIL_STANDARD.uhrzeit,
      bundesland: x.region ? (await x.region.lies()).bundesland : null,
    };
    const e = await konten.einstellungen(i);
    const eigen = e.aufgaben_mail_zeit && typeof e.aufgaben_mail_zeit === 'object' ? (e.aufgaben_mail_zeit as Partial<MailZeit>) : null;
    return {
      aktiv: e.aufgaben_mail !== false,
      uhrzeit: typeof eigen?.uhrzeit === 'string' ? eigen.uhrzeit : null,
      ...(({ tage, feiertage }) => ({ tage, feiertage }))(wirksameZeit(eigen, std)),
      standard: { uhrzeit: std.uhrzeit, tage: STANDARD_TAGE, bundesland: std.bundesland },
      versand: !!x.betrieb?.mailer() && std.aktiv,
    };
  };
  /** Demo-Dokumente (#248): freier Platz bei den Dateien; frei bleiben müssen Mindest-Speicherplatz der Sicherung bzw. die Speicherplatz-Grenze. */
  const demoPlatz: DemoPlatz | undefined = x.speicherplatz
    ? {
        frei: async () => (await x.speicherplatz!.messe()).ordner.find((o) => o.art === 'dateien')?.frei ?? null,
        mindest: async () => {
          const grenze = (await x.speicherplatz!.messe()).ordner.find((o) => o.art === 'dateien')?.grenzBytes ?? 0;
          const sich = x.sicherung ? (await x.sicherung.plan()).mindestFreiGB * GB : 0;
          return Math.max(grenze, sich);
        },
      }
    : undefined;
  /**
   * Stand für den Wiederherstellungsbildschirm: läuft etwas, oder gibt es eine Abschlussmeldung? `frisch` (#1341): bei
   * mehreren Prozessen vom Leiter; ohne genügt der Spiegel (bis 1 s alt) – `/api/konto/status` fragt jede Seite oft.
   */
  const whStand = async (o: { frisch?: boolean } = {}) => {
    const lauf = o.frisch ? await x.wiederherstellung?.laufStand() : x.wiederherstellung?.aktuellerLauf();
    const abschluss = x.sicherung
      ? ((await x.sicherung.einstellungen.lies('wiederherstellung_abschluss')) as Record<string, unknown> | null)
      : null;
    // Ohne Anmeldung lesbar: ohne die Adresse dessen, der sie gestartet hat.
    return {
      lauf: lauf?.art === 'wiederherstellung' ? { ...lauf, von: '' } : null,
      abschluss: abschluss ? { ...abschluss, von: '' } : null,
    };
  };
  return { spracheFuer, regionStand, zusammenfassung, demoPlatz, whStand };
}

/** Persönliche Exporte, Auskünfte, Löschkonzept und die Meldungen der Abrufseite. */
export function exportHilfen(dienst: Dienst, x: RoutenExtras) {
  /**
   * Persönlicher Export (#255): je Benutzer, ob er gerade läuft und woran er zuletzt scheiterte – seit #744 im
   * Kurzzustand, damit jeder Prozess es weiß. „Läuft“ ist eine Belegung mit Frist (endet ein Prozess mittendrin).
   */
  const EXPORT_LAEUFT = 'eigener-export-laeuft',
    EXPORT_FEHLER = 'eigener-export-fehler';
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
    typen: await dienst.mappentypen.listeTypen(),
    datenschutz: await dienst.datenschutzDienst.datenschutzFuerUnterlagen(),
    papierkorbTage: await dienst.kern.papierkorbTage(),
    historieTage: await dienst.mappenHistorie.historieTage(),
    // Ohne eingerichtete Sicherung (oder wenn der Plan nicht lesbar ist) steht im Dokument „keine automatischen Sicherungen“.
    sicherung: (await x.sicherung?.plan?.().catch(() => null)) ?? null,
    auskunftTage: AUSKUNFT_TAGE,
    version: eigeneVersion(),
    stand: new Intl.DateTimeFormat('sv-SE', { timeZone: zeitzone() }).format(new Date()),
    mandant: (await x.mandantName?.()) ?? '',
    loeschprotokoll: { jahre: await dienst.loeschprotokollVerwaltung.loeschprotokollJahre() },
  });
  /** Meldungen der Abrufseite in der Anrede für Dritte (#474). */
  const abrufText = async (k: TextDritte) => textDritte((await dienst.datenschutzDienst.datenschutz()).anrede, k);
  /** Nach dem Herunterladen gelöscht (#797), wie die Auskunft: erst, wenn die ZIP ganz gelesen ist. */
  const danachLoeschen = (strom: Readable, ordner: string, melde: () => void) =>
    strom.on('end', () => void loescheExport(ordner).then(melde, () => {}));
  return { EXPORT_LAEUFT, EXPORT_FEHLER, eigenerExport, auskunftZiel, loeschkonzeptQuelle, abrufText, danachLoeschen };
}

/**
 * Notfallblatt (#106, #814) als PDF – jedes neue Blatt mit neuem Notfallcode (#815): Der bisherige gilt danach nicht
 * mehr, gespeichert ist nur der Hash des neuen. Aus der Werkbank (frische Anmeldung) und nach dem Notfallzugang.
 */
export function notfallHilfen(dienst: Dienst, konten: Konten, x: RoutenExtras, tresor: ReturnType<typeof betriebsBausteine>['tresor']) {
  const notfallblattErzeugen = async (von: string): Promise<Buffer> => {
    const tresor2 = tresor();
    // Mehrere Prozesse (#1621): Den eben erzeugten Schlüssel liest ein anderer Prozess sonst erst beim nächsten Abgleich
    // (bis zu 2 s) – direkt nach „Jetzt einrichten“ meldete der Download dann 409. Fehlt er, jetzt nachladen.
    if (!tresor2.alsText()) await tresor2.nachladen();
    const text = tresor2.alsText();
    if (!text || !tresor2.fingerabdruck) throw new Fachfehler(409, t('meldungen.routen.es-gibt-noch-keinen'));
    // #814: keine Ordner oder Dateinamen aus Docker oder vom NAS auf dem Blatt – nur Verweise ins Handbuch.
    // Notfallkontakte (#812) unter „Wen fragen?“: Name, Telefon, E-Mail und Notiz.
    const kontakte = await dienst.notfallkontakte.liste();
    const inhalt = await notfallblatt({
      name: (x.designs ? (await x.designs.marke()).schriftzug : null) || 'Ablago',
      haushaltId: x.sicherung?.haushaltId ?? '–',
      adresse: x.betrieb ? x.betrieb.ansicht().adresse || x.betrieb.adresseFuerLinks() : '',
      version: eigeneVersion(),
      erstellt: new Date(),
      schluessel: text,
      fingerabdruck: tresor2.fingerabdruck,
      aussenziele: x.sicherung ? await x.sicherung.externZiele().catch(() => []) : [],
      kontakte: kontakte.map((k) => ({ name: k.name, erreichbar: erreichbar(k), notiz: k.notiz })),
      notfallcode: await konten.neuerNotfallcode(),
      // Aufruf von außen (#679): Adressen, die gerade Aufrufe annehmen.
      aufrufe: x.automatisierungen ? await x.automatisierungen.aufrufListe().catch(() => []) : [],
      // Ziele nach außen (#671): nur die Rechner.
      ziele: x.automatisierungen ? (await x.automatisierungen.ziele().catch(() => [])).map((z) => zielHost(z.adresse)) : [],
    });
    await dienst.notfallkontakte.blattErstellt(kontakte);
    if (x.sicherung) await x.sicherung.notfallblattErstellt(von);
    else L.system.warn('Notfallblatt heruntergeladen', { von, fingerabdruck: tresor2.fingerabdruck });
    return inhalt;
  };
  const notfallblattDatei = async (von: string): Promise<Antwort> => {
    const inhalt = await notfallblattErzeugen(von);
    // Der Schlüssel steht darauf: nicht im Cache des Browsers ablegen.
    return {
      datei: {
        inhalt,
        name: `Ablago-Notfallblatt-${tagIn(new Date())}.pdf`,
        mime: 'application/pdf',
        anzeigen: false,
        groesse: inhalt.length,
        koepfe: { 'cache-control': 'no-store' },
      },
    };
  };
  return { notfallblattErzeugen, notfallblattDatei };
}

/** Adresse des DMS für Links und die Rückruf-Adresse der Postfach-Anmeldung per OAuth. */
export function adressHilfen(x: RoutenExtras, postfaecher: ReturnType<typeof sicherungsBausteine>['postfaecher']) {
  const adresse = () => (x.betrieb?.adresseFuerLinks() ?? '').replace(/\/+$/, '');
  /** #358: Rückruf-Adresse fest aus der eingestellten Adresse des DMS – nie aus der Anfrage. */
  const pfRueckruf = () => (adresse() ? `${adresse()}/api/oauth/postfach/rueckruf` : '');
  const oauthPostfach = async (id: string) => {
    const p = await postfaecher().hole(id);
    if (p.anmeldung !== 'oauth' || !p.anbieter) throw new Fachfehler(409, t('meldungen.routen.dieses-postfach-meldet-sich'));
    return { id: p.id, anbieter: p.anbieter, benutzer: p.benutzer };
  };
  return { adresse, pfRueckruf, oauthPostfach };
}
