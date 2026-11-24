import { hoechstens } from '../datenbank/db';
import type { Benutzer } from '../../../shared/src/model';
import type { Dienst } from '../dienst/dienst';
import { Fachfehler } from '../grundlagen/fehler';
import type { Konten } from '../konten';
import type { SitzungIntern } from '../konten/konto-repo';
import { API_VERSION_OHNE_ANMELDUNG, openapi, v1Routen } from './api-v1';
import { NUR_ZAEHLER, ZAEHLER_PFAD, type ApiSchluesselDienst } from '../anmeldung/apischluessel';
import { t } from '../sprache/sprache';
import { ALS_KOPF, KONSOLE_KOPF, istLoopback, konsolenBenutzer, type Konsolenzugang } from '../system/konsole';
import { bereicheDerRoute, heikleHandlung, JEDER, NUR_GESAMT } from '../werkbank/verwaltungsbereiche';
import { darfBereich, darfVerwalten, hatGesamt } from '../../../shared/src/verwaltungsrecht';
import { eigeneVersion } from '../system/system';
import type { Stufe } from '../protokoll/protokoll';
import { maskiere } from '../geheimnisse/tresor';
import type { Anfrage, Route } from './routen-typen';
import type { RoutenExtras } from './routen-extras';
import { SITZUNG_COOKIE, SITZUNG_SEKUNDEN, ok } from './routen-hilfen';
import { routenKontext, type RoutenKontext } from './routen-kontext';
import { anmeldungRouten, notfallRouten } from '../anmeldung/anmeldung.routen';
import { kontenRouten, apiSchluesselRouten } from '../konten/konten.routen';
import { typenRouten, typenArchivRouten, berechtigungenRouten } from '../mappentypen/mappentypen.routen';
import { werkbankRouten, werkbankUebersichtRouten, werkbankEinstellungenRouten } from '../werkbank/werkbank.routen';
import { darfRouten } from '../werkbank/darf.routen';
import { exportRouten } from '../ausgang/ausgang.routen';
import { datenschutzRouten, abrufRouten } from '../datenschutz/datenschutz.routen';
import { notfallkontakteRouten } from '../notfallkontakte/notfallkontakte.routen';
import { organisationRouten } from '../organisation/organisation.routen';
import { textsatzRouten } from '../textsatz/textsatz.routen';
import { leistungenRouten } from '../leistungen/leistungen.routen';
import { paketaktionenRouten } from '../paketaktionen/paketaktionen.routen';
import { paketeRouten, paketeEinstellungenRouten } from '../pakete/pakete.routen';
import { paketdatenRouten } from '../paketdaten/paketdaten.routen';
import { sucheRouten } from '../suche/suche.routen';
import { wartungRouten } from '../wartung/wartung.routen';
import { sicherungRouten } from '../sicherung/sicherung.routen';
import { betriebRouten, systemRouten, systemzustandRouten } from '../system/system.routen';
import { postfaecherRouten } from '../post/post.routen';
import { automatisierungRouten } from '../automatisierung/automatisierung.routen';
import { fassungenRouten } from '../fassungen/fassungen.routen';
import { ablageRouten } from '../sichten/sichten.routen';
import { aufgabenRouten } from '../aufgaben/aufgaben.routen';
import { mappenRouten } from '../mappen/mappen.routen';
import { dokumenteRouten } from '../dokumente/dokumente.routen';

/** Früher hier definiert (#960: nach http/routen-hilfen.ts verschoben), weiter auch von hier erreichbar. */
export {
  SITZUNG_COOKIE,
  SITZUNG_SEKUNDEN,
  ZWEITE_ABGELEHNT,
  leseCookie,
  BINDUNG_COOKIE,
  ANBIETER_COOKIE,
  POSTFACH_BINDUNG_COOKIE,
  kurzCookie,
  passtEtag,
  nurEigeneBereiche,
  kontaktVorschlaege,
} from './routen-hilfen';
/**
 * Form der Routen und Kopfzeilen ausgelieferter Dateien (#1278, Schritt 5b: nach http/routen-typen.ts und
 * http/datei-koepfe.ts verschoben), für Tests weiter auch von hier erreichbar.
 */
export type { Anfrage, Datei, Antwort, Route } from './routen-typen';
export { dateiKoepfe } from './datei-koepfe';

/** Rückmeldung zur Kopie außer Haus per PUT (#585) – nur noch im Übergang für Pakete vor #636; entfällt mit 1.0.0 (uebergaenge.ts, #902). */
const SICHERUNG_EXTERN_PFAD = '/api/v1/sicherungen/:name/extern';
/**
 * Zurückholen entfernter Sicherungen (#976): Pakete mit dms:sicherung-holen haben nur einen Leseschlüssel und liefern
 * hier die angeforderte Sicherung in Stücken. Die Route prüft Recht, Anforderung, Stelle und Größe.
 */
const SICHERUNG_HOLEN_PFAD = '/api/v1/sicherungen/:name/holen';

/** Routen der Fachbereiche (#960), in der Reihenfolge, in der sie früher hier standen (Registrierreihenfolge). */
const BEREICHE: Array<(k: RoutenKontext) => Route[]> = [
  anmeldungRouten,
  kontenRouten,
  typenRouten,
  werkbankRouten,
  exportRouten,
  datenschutzRouten,
  notfallRouten,
  notfallkontakteRouten,
  abrufRouten,
  organisationRouten,
  textsatzRouten,
  leistungenRouten,
  paketaktionenRouten,
  typenArchivRouten,
  paketeRouten,
  sucheRouten,
  paketeEinstellungenRouten,
  paketdatenRouten,
  wartungRouten,
  sicherungRouten,
  betriebRouten,
  werkbankUebersichtRouten,
  darfRouten,
  berechtigungenRouten,
  systemRouten,
  postfaecherRouten,
  automatisierungRouten,
  fassungenRouten,
  systemzustandRouten,
  ablageRouten,
  aufgabenRouten,
  werkbankEinstellungenRouten,
  mappenRouten,
  dokumenteRouten,
  apiSchluesselRouten,
];

export function routen(dienst: Dienst, konten: Konten, x: RoutenExtras = {}): Route[] {
  const k = routenKontext(dienst, konten, x);
  const { zg } = k;
  const intern: Route[] = BEREICHE.flatMap((f) => f(k));
  // Öffentliche API /api/v1 und ihre Beschreibung (aus der installierten Version). Die genaue Version nur angemeldet
  // (Sitzung oder API-Schlüssel), wie bei /api/konto/status – ohne Anmeldung nur die Version der API (#1067).
  const doku = async (a: Anfrage) => ok(openapi(a.benutzer ? eigeneVersion() : API_VERSION_OHNE_ANMELDUNG));
  // Die Id des Typs Post ändert sich nicht (Systemtyp); einmal nachgeschlagen.
  let postId: string | undefined;
  const alle: Route[] = [
    ...intern,
    // Post (#1042): alte Namen absender/fuer in Antworten der v1 mitliefern (Übergang bis 1.0.0).
    ...v1Routen(intern, { postTypId: async () => (postId ??= (await dienst.kern.system()).post.id) }),
    // `api`: Mit API-Schlüssel gilt man hier als angemeldet (genaue Version, #1067); ohne bleibt sie offen.
    { methode: 'GET', pfad: '/api/openapi.json', zugang: 'offen', api: true, handler: doku },
    { methode: 'GET', pfad: '/api/v1/openapi.json', zugang: 'offen', api: true, handler: doku },
  ];
  // Kein verschlüsselter Wert verlässt den Server: Passwortfelder erscheinen als { gesetzt, lesbar } (#46).
  const lesbar = (v: string) => !!x.tresor?.lesbar(v);
  // Dienstkonten (#338): Dokumente nur mit dem bestätigten Recht – lesen (GET) bzw. schreiben.
  // Dienstkonten von Paketen (#338): Dokumente nur mit dem Recht aus dem Manifest; E-Mail-Versand nie (Anhänge, Netz).
  // Vorlagen (#1040): Liste und „Text setzen“ lesen Vorlagen (Dokumente) und legen Dokumente ab – wie Dokumente.
  const dokumentRoute = (r: Route) => /\/dokumente\b|\/archivnummern\b|\/vektoren\b|\/mappen\/[^/]+\/vorlagen\b/.test(r.pfad);
  const nieFuerPakete = (r: Route) => /\/email\b/.test(r.pfad);
  // Vektoren (#442) ändern das Dokument nicht: Lesen reicht, das Recht dms:vektoren prüft der Dienst.
  // Fassung und Vorschaubild (#577) ändern das Dokument auch nicht: Lesen reicht, dms:umwandeln prüft der Dienst.
  // Leerseiten markieren (#997) ändert das Dokument nicht: Lesen reicht, dms:leerseiten prüft der Dienst.
  const lesendePost = (r: Route) =>
    /\/dokumente\/gleiche$|\/dokumente\/:id\/vektor$|\/vektoren\/aehnliche$|\/dokumente\/:id\/(fassung|vorschaubild|archivfassung|leerseiten)$/.test(
      r.pfad,
    );
  // Volltext und Sprache (#614): mit dms:volltext reicht Lesen – für welche Dokumente, prüft der Dienst (Dateitypen des Pakets).
  const nurVolltext = (r: Route, s: readonly string[] | undefined) =>
    r.methode === 'PUT' && /\/dokumente\/:id\/(volltext|sprache)$/.test(r.pfad) && !!s?.includes('dms:volltext');
  const dokumentRecht = async (r: Route, a: Anfrage): Promise<'keine' | 'lesen' | 'schreiben' | null> => {
    if (a.benutzer?.art !== 'dienst') return null;
    if (nieFuerPakete(r)) throw new Fachfehler(403, t('meldungen.routen.pakete-duerfen-keine-e'));
    const paket = (await zg(a)).paket;
    const recht = paket?.dokumente ?? 'keine';
    if (!dokumentRoute(r)) return recht;
    const schreibt = r.methode !== 'GET' && !lesendePost(r) && !nurVolltext(r, paket?.schnittstellen);
    if (recht === 'keine' || (schreibt && recht !== 'schreiben')) throw new Fachfehler(403, t('meldungen.routen.dieses-paket-darf-das'));
    return recht;
  };
  /** Ohne Dokumentrecht sieht ein Paket an der Mappe auch die Liste der Dokumente nicht. */
  const ohneDokumente = (body: unknown) => {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return body;
    const { dokumente: _weg, ...rest } = body as Record<string, unknown>;
    return rest;
  };
  return alle.map((r) => ({
    ...r,
    handler: async (a: Anfrage) => {
      const paketRecht = await dokumentRecht(r, a);
      const antwort = await r.handler(a);
      if (antwort.body === undefined) return antwort;
      const body =
        paketRecht === 'keine' && r.methode === 'GET' && /\/mappen\/:id$/.test(r.pfad) ? ohneDokumente(antwort.body) : antwort.body;
      return { ...antwort, body: maskiere(body, lesbar) };
    },
  }));
}

/** Zu welchem Modul eine Anfrage gehört (für das Protokoll). */
/**
 * Stufe der Anfragezeile im Protokoll („POST /api/… 200“): Fehler des Servers immer, Lesendes
 * (GET oder als lesend markierte POSTs wie Vorschauen, #373 – dort auch abgewiesene) nur auf „debug“,
 * häufige Abfragen auf „trace“. Ändernde Aufrufe stehen auf „info“.
 */
export function anfrageStufe(x: { methode: string; url: string; status: number; lesend?: boolean }): Stufe {
  const api = x.url.startsWith('/api/');
  if (x.status >= 500) return 'error';
  if (!api) return 'debug';
  if (/^\/api\/(werkbank\/(protokoll|auftrag)|gesundheit)\b/.test(x.url)) return 'trace';
  if (x.status === 401 && x.url === '/api/konto/status') return 'debug';
  if (x.lesend || (x.methode === 'GET' && x.status < 400)) return 'debug';
  return 'info';
}

export function modulAus(url: string): string {
  if (/^\/api\/(konto|benutzer|personen|rollen|notfall)\b/.test(url)) return 'konto';
  if (/^\/api\/(dokumente|mappen\/[^/]+\/dokumente)\b/.test(url)) return 'dokumente';
  if (/^\/api\/(mappen|sichten|papierkorb|notizen|aufgaben)\b/.test(url)) return 'ablage';
  if (/^\/api\/(werkbank\/(sicherung|notfallblatt|wiederherstellung)|wiederherstellung|(v1\/)?sicherungen)\b/.test(url)) return 'sicherung';
  if (/^\/api\/(typen|werkbank|beispiele)\b/.test(url)) return 'werkbank';
  return 'http';
}

/** Set-Cookie für die Sitzung; `null` löscht sie. HttpOnly: kein Zugriff aus Skripten. */

export function sitzungsCookie(schluessel: string | null, sicher: boolean): string {
  const teile = [
    `${SITZUNG_COOKIE}=${schluessel ? encodeURIComponent(schluessel) : ''}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${schluessel ? SITZUNG_SEKUNDEN : 0}`,
  ];
  if (sicher) teile.push('Secure');
  return teile.join('; ');
}

/**
 * Zwei-Faktor- oder Passkey-Pflicht lesen oder nur ausschalten (#416, #811): geht für Administratoren auch, solange sie
 * die Zwei-Faktor-Anmeldung bzw. einen Passkey selbst noch einrichten müssen – so sperrt sich niemand mit dieser
 * Einstellung aus. Einschalten (ein Wert true) gehört nicht dazu.
 */
export function pflichtZuruecknehmen(r: Pick<Route, 'methode' | 'pfad'>, a: Pick<Anfrage, 'body' | 'benutzer'>): boolean {
  if ((r.pfad !== '/api/werkbank/zweifaktor' && r.pfad !== '/api/werkbank/passkeys') || a.benutzer?.rolle !== 'admin') return false;
  if (r.methode === 'GET') return true;
  if (r.methode !== 'PUT' || !a.body || typeof a.body !== 'object') return false;
  return Object.values(a.body as Record<string, unknown>).every((w) => w === false);
}

/**
 * Prüft Zugang und Schutz vor fremden Seiten (CSRF): Ändernde Anfragen
 * müssen den Header X-DMS tragen, den nur die eigene Oberfläche setzt.
 */

export async function pruefeZugang(
  r: Route,
  a: Anfrage,
  kopf: (n: string) => string | undefined,
  konten: Konten,
  schluessel?: ApiSchluesselDienst,
  konsole?: Konsolenzugang,
) {
  // Befehl `dms` im Container (#244): Schlüssel aus /tmp, nur über Loopback; handelt als Person mit „Gesamte
  // Verwaltung“ im Verwaltungsmodus (#818) – wer Zugang zum Container hat, hat ohnehin alles.
  const k = kopf(KONSOLE_KOPF);
  if (k !== undefined) {
    if (!konsole || !konsole.passt(k) || !istLoopback(a.peer))
      throw new Fachfehler(401, t('meldungen.routen.konsolenzugang-ungueltig-der-befehl'));
    a.konsole = true;
    try {
      a.benutzer = { ...konsolenBenutzer(await konten.listeBenutzer(), kopf(ALS_KOPF)), rolle: 'admin' };
      a.verwaltungsmodus = true;
    } catch (e) {
      // Nur die Konsolen-Befehle selbst gehen auch ohne Administrator (z. B. Passwort setzen).
      if (!r.konsole) throw e;
    }
    return;
  }
  if (r.konsole) throw new Fachfehler(404, t('meldungen.routen.diese-schnittstelle-gibt-es'));
  if (r.ohneSitzung && r.zugang === 'offen') return;
  // Öffentliche API: Anmeldung per API-Schlüssel statt Sitzung; kein X-DMS nötig (kein Cookie im Spiel).
  const auth = kopf('authorization');
  if (r.api && auth && schluessel) {
    const s = await schluessel.pruefe(auth);
    const b = s ? await konten.benutzerMitId(s.benutzerId) : undefined;
    if (!s || !b) throw new Fachfehler(401, t('meldungen.routen.der-benutzer-dieses-schluessels'));
    a.benutzer = b;
    a.apiSchluessel = s;
    // „Nur Zähler“ (#625): genau eine Adresse, alles andere 403.
    if (s.recht === NUR_ZAEHLER && !(r.methode === 'GET' && r.pfad === ZAEHLER_PFAD))
      throw new Fachfehler(403, t('api.schluessel.nur-zaehler'));
    // Übergang (#636): Pakete für die Kopie außer Haus haben seit 0.158.1 nur noch einen Leseschlüssel und melden ihren
    // Stand in der Antwort auf das Ereignis. Ältere Fassungen dürfen noch per PUT melden (die Route prüft, ob ein Paket
    // mit dms:sicherung-lesen fragt). Entfällt mit 1.0.0 (uebergaenge.ts, #902).
    const uebergang = r.methode === 'PUT' && (r.pfad === SICHERUNG_EXTERN_PFAD || r.pfad === SICHERUNG_HOLEN_PFAD);
    // Gesehen und ausgeblendet (#1307): nur Merker der eigenen Person – dafür genügt „lesen“.
    if (r.methode !== 'GET' && s.recht === 'lesen' && !uebergang && !r.lesenGenuegt)
      throw new Fachfehler(403, t('meldungen.routen.dieser-api-schluessel-darf'));
    // #818 (Frage 9 von Sicherheit): API-Schlüssel bekommen nie Verwaltungsrechte – auch nicht von Verwaltenden.
    a.benutzer = { ...b, rolle: 'mitglied' };
    if (r.zugang === 'admin') throw new Fachfehler(403, t('konten.verwaltung.fehler.schluessel'));
    return;
  }
  // Interne Schnittstellen nehmen keine API-Schlüssel. Ein Schlüssel „nur Zähler“ bekommt hier trotzdem eine klare
  // Antwort (#625) statt „bitte anmelden“ – etwa wenn eine Hausautomatisierung die falsche Adresse nutzt.
  if (auth && schluessel && /^Bearer\s+dms_/i.test(auth)) {
    const s = await schluessel.pruefe(auth).catch(() => undefined);
    if (s?.recht === NUR_ZAEHLER) throw new Fachfehler(403, t('api.schluessel.nur-zaehler'));
  }
  if (r.methode !== 'GET' && kopf('x-dms') !== '1') throw new Fachfehler(403, t('meldungen.routen.anfrage-ohne-kennung-der'));
  type Sitzung = { benutzer?: Benutzer; sitzungsDaten?: SitzungIntern; verwaltungsmodus?: boolean };
  const sitzung = async (): Promise<Sitzung> => {
    const anmeldung = await konten.anmeldungZu(a.sitzung, { still: r.still });
    if (!anmeldung?.benutzer) return {};
    // Verwaltungsmodus (#819): Zustand der Sitzung auf dem Server. Aktivität = jede ändernde Anfrage oder eine, die die
    // Oberfläche nach einer Eingabe als „aktiv“ kennzeichnet – Abfragen im Hintergrund (#919, `still`) nie.
    const aktiv =
      !r.still && ((r.methode !== 'GET' && !r.lesend && !r.pfad.startsWith('/api/konto/verwaltung')) || kopf('x-dms-aktiv') === '1');
    const verwaltungsmodus = await konten.modusPruefen(anmeldung.benutzer, a.sitzung, anmeldung.sitzung, aktiv);
    return {
      benutzer: { ...anmeldung.benutzer, rolle: verwaltungsmodus ? ('admin' as const) : ('mitglied' as const) },
      sitzungsDaten: anmeldung.sitzung,
      verwaltungsmodus,
    };
  };
  // Datenbank antwortet nicht (#1198): offene Anfragen mit Zeitgrenze laufen dann ohne Anmeldung weiter.
  const s =
    r.zugang === 'offen' && r.anmeldungHoechstensMs
      ? await hoechstens(sitzung(), r.anmeldungHoechstensMs, (): Sitzung => ({}))
      : await sitzung();
  a.benutzer = s.benutzer;
  a.sitzungsDaten = s.sitzungsDaten;
  if (s.benutzer) a.verwaltungsmodus = s.verwaltungsmodus;
  if (r.zugang === 'offen') return;
  if (!a.benutzer) throw new Fachfehler(401, t('anmeldung.fehler.bitte-anmelden'));
  // Zwei-Faktor vorgeschrieben (#242), aber noch nicht eingerichtet: nur das eigene Konto.
  // #416: gilt erst für Sitzungen ab dem Einschalten der Pflicht; die Pflicht selbst lesen und ausschalten geht immer.
  if (
    konten.zweifaktor &&
    !a.sitzungsDaten?.vertretungId &&
    !r.pfad.startsWith('/api/konto/') &&
    !pflichtZuruecknehmen(r, a) &&
    (await konten.zweifaktor.fehlt(a.benutzer, a.sitzungsDaten?.erstellt))
  ) {
    throw new Fachfehler(403, t('meldungen.routen.bitte-zuerst-die-zwei'));
  }
  // Passkey vorgeschrieben (#811), aber noch keiner da: ebenso nur das eigene Konto (#416: erst für neue Sitzungen).
  if (
    konten.passkeys &&
    !a.sitzungsDaten?.vertretungId &&
    !r.pfad.startsWith('/api/konto/') &&
    !pflichtZuruecknehmen(r, a) &&
    (await konten.passkeys.fehlt(a.benutzer, a.sitzungsDaten?.erstellt))
  ) {
    throw new Fachfehler(403, t('anmeldung.passkey.fehler.pflicht'));
  }
  if (r.zugang === 'admin') pruefeVerwaltung(r, a, konten);
}

/**
 * Werkbank (#818, #819): nur im Verwaltungsmodus, nur mit Recht auf den Bereich der Route (Vorgabe „nein“), und für
 * die heikelsten Handlungen nur mit frischer Anmeldung. Die Antwort sagt der Oberfläche, was fehlt (`details`).
 */
export function pruefeVerwaltung(route: Pick<Route, 'methode' | 'pfad' | 'bereichVon'>, a: Anfrage, konten: Konten) {
  const r = route.bereichVon ?? route;
  const b = a.benutzer!;
  if (a.konsole) return;
  if (!darfVerwalten(b)) throw new Fachfehler(403, t('konten.verwaltung.fehler.recht'));
  if (!a.verwaltungsmodus)
    throw new Fachfehler(403, t('konten.verwaltung.fehler.modus'), {
      verwaltungsmodus: true,
      heuteBestaetigt: konten.heuteBestaetigt(a.sitzungsDaten),
      frisch: konten.istFrisch(a.sitzungsDaten),
    });
  const bereiche = bereicheDerRoute(r.methode, r.pfad);
  const darf =
    bereiche === null
      ? hatGesamt(b)
      : bereiche.some((x) => (x === JEDER ? darfVerwalten(b) : x === NUR_GESAMT ? hatGesamt(b) : darfBereich(b, x)));
  if (!darf) throw new Fachfehler(403, t('konten.verwaltung.fehler.bereich'), { bereich: bereiche?.[0] ?? null });
  const heikel = heikleHandlung(r.methode, r.pfad, a.body);
  if (heikel && !konten.istFrisch(a.sitzungsDaten))
    throw new Fachfehler(403, t('konten.verwaltung.fehler.frisch'), { frisch: true, handlung: heikel });
}
