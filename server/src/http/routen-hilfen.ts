/**
 * Gemeinsame Hilfen der Routendateien (#960): Antworten, Protokoll-Module, Cookies und Stände für die Werkbank.
 * Aus routen.ts hierher verschoben, unverändert; routen.ts gibt die öffentlichen davon weiter.
 */
import type { Benutzer, Mappentyp } from '../../../shared/src/model';
import { Fachfehler } from '../fehler';
import { SITZUNG_TAGE } from '../konten';
import type { SitzungIntern } from '../konto-repo';
import type { Zweifaktor } from '../zweifaktor';
import type { KontaktZuordnung } from '../vollexport';
import { t } from '../sprache';
import type { Ausloeser } from '../../../shared/src/loeschprotokoll';
import { NUR_GESAMT } from '../verwaltungsbereiche';
import { darfBereich, hatGesamt } from '../../../shared/src/verwaltungsrecht';
import { protokoll } from '../protokoll';
import { KLASSEN_MS, poolZusammen, type PoolStand } from '../poolmessung';
import { dateiLeser, liesPss, liesRss } from '../systemlast';
import { PROZESSE_MAX } from '../prozesse';
import type { Prozessstand } from '../aufteilung';
import { ARBEITER_MAX, arbeiterStand } from '../arbeit';
import { VERBINDUNGEN_MAX, VERBINDUNGEN_MIN } from '../db';
import { MAX_ANFRAGEN_MAX, MAX_ANFRAGEN_MIN } from '../ueberlast';
import { engpaesseAus, VARIABLE, type Grenzwerte, type ProzessZeile } from '../../../shared/src/systemlast';
import { MB } from '../grenzen';
import type { Anfrage, Antwort, RoutenExtras } from '../routen';

const L = {
  konto: protokoll.modul('konto'), ablage: protokoll.modul('ablage'), werkbank: protokoll.modul('werkbank'),
  dokumente: protokoll.modul('dokumente'), system: protokoll.modul('system'), mail: protokoll.modul('mail'),
  datenschutz: protokoll.modul('datenschutz'),
};

export const SITZUNG_COOKIE = 'dms_sitzung';
export const SITZUNG_SEKUNDEN = SITZUNG_TAGE * 24 * 60 * 60;

const ok = (body: unknown, status = 200): Antwort => ({ status, body });

/**
 * Archivmodus (#212, #373): genau ein Eintrag je gespeicherter Änderung, mit vorher/nachher
 * (an/aus, Frist, Stichtag). Ausschalten ist eine Warnung.
 */
function archivProtokoll(t: { name: string; archiv?: Mappentyp['archiv'] }, vorher: Mappentyp['archiv'] | null) {
  const nachher = t.archiv ?? null;
  if (JSON.stringify(vorher) === JSON.stringify(nachher)) return;
  const zustand = (x: Mappentyp['archiv'] | null) => (x ? { an: true, jahre: x.jahre, stichtag: x.stichtag ?? 'Anlagedatum' } : { an: false });
  const daten = { typ: t.name, vorher: zustand(vorher), nachher: zustand(nachher) };
  if (!nachher) L.werkbank.warn('Archivmodus ausgeschaltet', daten);
  else L.werkbank.info(vorher ? 'Archivmodus geändert' : 'Archivmodus eingeschaltet', daten);
}
const leer: Antwort = { status: 204 };

const b = (a: Anfrage) => (a.body ?? {}) as Record<string, unknown>;
const info = (a: Anfrage) => ({ ip: a.ip, geraet: a.geraet ?? '' });
/** Löschprotokoll (#470): wer löscht – Benutzer in der Oberfläche, Schnittstelle (API-Schlüssel) oder Paket (Dienstkonto). */
const quelle = (a: Anfrage): Ausloeser => (a.benutzer?.art === 'dienst' ? 'paket' : a.apiSchluessel ? 'api' : 'benutzer');
const ich = (a: Anfrage) => {
  if (!a.benutzer) throw new Fachfehler(401, t('anmeldung.fehler.bitte-anmelden'));
  return a.benutzer;
};

/**
 * Systemzustand (#544): Arbeiter, Verbindungen zur Datenbank und Grenze des Überlastschutzes – nur zum Ansehen,
 * eingestellt per Umgebungsvariable – und die Engpässe, je mit der Variable, die man ändern müsste.
 */
function grenzenUndEngpaesse(x: RoutenExtras) {
  const a = arbeiterStand();
  const v = x.verbindungen?.stand();
  const u = x.ueberlast?.stand();
  // Mehrere Prozesse (#745): Arbeiter und Anfragen gelten je Prozess, Verbindungen seit #874 zusammen.
  const p = x.verbund?.mehrere ? { prozesse: x.verbund.anzahl } : {};
  const pe = x.prozessEinstellung;
  const grenzen: Grenzwerte = {
    ...(pe ? { prozesse: { wert: x.verbund?.anzahl ?? pe.anzahl, quelle: pe.quelle, variable: VARIABLE.prozesse, min: 1, max: PROZESSE_MAX } } : {}),
    arbeiter: { wert: a.aus ? 0 : a.groesse, quelle: a.quelle, variable: VARIABLE.arbeiter, min: 0, max: ARBEITER_MAX, ...p },
    // #874: Verbindungen gelten für alle Prozesse zusammen – Wert ist die Summe, dazu die Anteile.
    ...(v ? { verbindungen: { wert: x.verbindungen?.aufteilung?.gesamt ?? v.max, quelle: v.quelle, variable: VARIABLE.verbindungen, min: VERBINDUNGEN_MIN, max: VERBINDUNGEN_MAX, ...(x.verbund?.mehrere && x.verbindungen?.aufteilung ? { aufteilung: { leiter: x.verbindungen.aufteilung.leiter, andere: x.verbindungen.aufteilung.andere, prozesse: x.verbund.anzahl } } : {}) } } : {}),
    ...(u ? { anfragen: { wert: u.max, quelle: u.quelle, variable: VARIABLE.anfragen, min: MAX_ANFRAGEN_MIN, max: MAX_ANFRAGEN_MAX, ...p } } : {}),
  };
  const engpaesse = engpaesseAus({
    schleife: !!x.messung?.auslastung.warnung(),
    verbindungen: v ? { median: v.median, messungen: v.messungen } : null,
    arbeiterAbgewiesen: a.aus ? null : a.zuletztAbgewiesen,
    ueberlastAbgewiesen: u?.zuletztAbgewiesen ?? null,
  });
  return { grenzen, engpaesse };
}

/**
 * Mehrere Prozesse (#745): Stand jedes Prozesses – Arbeitsspeicher (Pss aus /proc, sonst RSS), Rechenzeit, Wartezeit der
 * Ereignisschleife und laufende Anfragen; dazu der Hauptprozess. null mit einem Prozess.
 */
async function prozessZeilen(x: RoutenExtras, frage: 'prozess.stand' | 'prozess.last' = 'prozess.stand'): Promise<{ zeilen: ProzessZeile[]; staende: Array<Prozessstand | null>; halde: Record<number, number | null>; rssMb: number; speicherMb: number } | null> {
  const v = x.verbund;
  if (!v?.mehrere) return null;
  const alle = await v.frageAlle<Prozessstand>(frage);
  const zeilen: ProzessZeile[] = [];
  let rss = 0;
  if (v.primaer) {
    const r = liesRss(dateiLeser, v.primaer);
    rss += r ?? 0;
    zeilen.push({ nr: 0, pid: v.primaer, rolle: 'haupt', speicher: liesPss(dateiLeser, v.primaer) ?? r, cpu: null, schleifeP99: null, anfragen: null });
  }
  for (const p of alle) {
    rss += p.wert ? p.wert.rssMb * MB : liesRss(dateiLeser, p.pid) ?? 0;
    zeilen.push({
      nr: p.nr, pid: p.pid, rolle: p.leiter ? 'leiter' : 'anfragen', speicher: liesPss(dateiLeser, p.pid) ?? (p.wert ? p.wert.rssMb * MB : null),
      cpu: p.wert?.cpu ?? null, schleifeP99: p.wert?.schleife?.p99 ?? null, anfragen: p.wert?.anfragen.laufend ?? null,
    });
  }
  // Summe für den Lasttest: Pss (geteilte Seiten anteilig – die Summe der RSS zählte den Code jedes Prozesses voll).
  const pss = zeilen.every((z) => z.speicher !== null) ? zeilen.reduce((n, z) => n + z.speicher!, 0) : rss;
  return { zeilen, staende: alle.map((p) => p.wert), halde: Object.fromEntries(alle.map((p) => [p.nr, p.wert?.heapMb ?? null])), rssMb: Math.round(rss / MB), speicherMb: Math.round(pss / MB) };
}

/**
 * Wo es unter Last hakt (#874), für den Lasttest über alle Prozesse: Wartezeit auf eine freie Verbindung (Klassen
 * fortlaufend, Höchstwert der letzten 10 s), belegte und erlaubte Verbindungen, Sitzungen der Datenbank mit Sperren,
 * Rechenzeit von PostgreSQL, Ablago und Container (fortlaufend in Sekunden) und der Arbeitsspeicher je Prozess.
 */
async function engpassStand(x: RoutenExtras, p: Awaited<ReturnType<typeof prozessZeilen>>) {
  let pool: PoolStand | null;
  if (p) pool = poolZusammen(p.staende.map((z) => z?.pool));
  else { x.poolmessung?.an(); pool = x.poolmessung?.stand() ?? null; }
  const pids = p ? p.zeilen.map((z) => z.pid) : [process.pid];
  // Je Prozess: Pss (sonst RSS) und davon die Halde von V8 (heapUsed) – zeigt, ob Daten oder Puffer wachsen.
  const speicher = p ? p.zeilen.map((z) => ({ nr: z.nr, rolle: z.rolle, mb: z.speicher === null ? null : Math.round(z.speicher / MB), haldeMb: p.halde[z.nr] ?? null }))
    : [{ nr: 1, rolle: 'leiter' as const, mb: Math.round((liesPss(dateiLeser, process.pid) ?? process.memoryUsage().rss) / MB), haldeMb: Math.round(process.memoryUsage().heapUsed / MB) }];
  return {
    pool, klassenMs: KLASSEN_MS,
    verbindungen: x.verbindungen?.aufteilung ? { gesamt: x.verbindungen.aufteilung.gesamt, leiter: x.verbindungen.aufteilung.leiter, andere: x.verbindungen.aufteilung.andere } : null,
    sitzungen: (await x.sitzungen?.().catch(() => null)) ?? null,
    cpu: x.systemlast?.cpuJeArt(pids) ?? null,
    speicher,
    // Abgestürzte und neu gestartete Prozesse seit dem Start: der Lasttest zählt den Unterschied je Durchgang.
    neustarts: x.verbund?.neustarts() ?? { anzahl: 0, letzte: [] },
    // #895: Warnungen und Fehler aller Prozesse (zusammengefasst, ohne Einzelheiten) und CPU/Speicher je Prozessgruppe.
    protokoll: (await x.verbund?.meldungen().catch(() => null)) ?? null,
    gruppen: (await x.prozessgruppen?.().catch(() => null)) ?? null,
  };
}

/** Einstellung: „Nein, danke“ zur Empfehlung einer zweiten Person mit Verwaltungsrecht (#821) – gilt dauerhaft. */
export const ZWEITE_ABGELEHNT = 'verwaltung_zweite_abgelehnt';

/** Liest einen Cookie-Wert aus dem Cookie-Header. */
export function leseCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const teil of header.split(';')) {
    const [k, ...v] = teil.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

/** Hilfs-Cookies der Anmeldung über einen Anbieter (#241). */
export const BINDUNG_COOKIE = 'dms_anbieter_bindung';
export const ANBIETER_COOKIE = 'dms_anbieter';
/** #358: bindet den OAuth-Fluss eines Postfachs an den Browser, in dem er begonnen wurde. */
export const POSTFACH_BINDUNG_COOKIE = 'dms_postfach_bindung';
export function kurzCookie(name: string, wert: string, sekunden: number, pfad: string): string {
  // Secure ergänzt http.ts wie beim Sitzungs-Cookie.
  return [`${name}=${encodeURIComponent(wert)}`, `Path=${pfad}`, 'HttpOnly', 'SameSite=Lax', `Max-Age=${sekunden}`].join('; ');
}

/** Zwei-Faktor für /api/konto/status (#242, #416); beim Agieren als anderer Benutzer nie gesperrt. */
async function zweifaktorStatus(zf: Zweifaktor, b: Benutzer, s?: SitzungIntern) {
  const lage = s?.vertretungId ? 'ok' : await zf.lage(b, s?.erstellt);
  return { aktiv: await zf.aktiv(b.id), fehlt: lage === 'fehlt', ausstehend: lage === 'ausstehend' };
}

/** If-None-Match (RFC 9110): Liste von ETags, auch schwach (W/…) oder „*“. */
export function passtEtag(kopf: string | undefined, etag: string): boolean {
  if (!kopf) return false;
  return kopf.split(',').map((x) => x.trim().replace(/^W\//, '')).some((x) => x === '*' || x === etag);
}

/**
 * Übersicht der Werkbank (#818, Bauvorgabe Sicherheit): nur Meldungen der eigenen Bereiche. Was zu einem anderen
 * Bereich gehört, kommt neutral zurück (keine Warnung), damit die Oberfläche dieselben Felder hat.
 */
const UEBERSICHT_BEREICHE: Record<string, { bereich: string; leer: unknown }> = {
  tresor: { bereich: 'verschluesselung', leer: null }, mail: { bereich: 'betrieb', leer: true }, adresse: { bereich: 'betrieb', leer: true },
  texterkennung: { bereich: 'texterkennung', leer: null }, texterkennungPaket: { bereich: 'texterkennung', leer: true },
  // Fehlende Dateien (#877): Der Knopf führt zu „Alle Dateien prüfen“ unter Texterkennung.
  dateienFehlen: { bereich: 'texterkennung', leer: 0 },
  aufgaben: { bereich: 'aufgaben', leer: { offen: 0, ohneEmpfaenger: 0 } }, ohneLeserecht: { bereich: 'aufgaben', leer: 0 },
  aufgabenEmpfaenger: { bereich: 'benutzer', leer: null }, unpassend: { bereich: 'typen', leer: 0 },
  papierkorb: { bereich: 'papierkorb', leer: { anzahl: 0, aeltester: null, tage: 0 } }, fehlermeldungen: { bereich: 'fehlermeldungen', leer: null },
  notfallzugaenge: { bereich: NUR_GESAMT, leer: [] }, notfallcodeBenutzt: { bereich: NUR_GESAMT, leer: [] }, zweitePerson: { bereich: NUR_GESAMT, leer: false }, wartung: { bereich: 'wartung', leer: null }, sicherung: { bereich: 'sicherung', leer: null },
  exporte: { bereich: 'vollexport', leer: null }, speicherplatz: { bereich: 'systemzustand', leer: null }, auslastung: { bereich: 'systemzustand', leer: [] },
  engpaesse: { bereich: 'systemzustand', leer: [] }, erweiterungen: { bereich: 'systemzustand', leer: [] }, variablen: { bereich: 'systemzustand', leer: [] },
  bestand: { bereich: 'systemzustand', leer: null }, lasttestAbbruch: { bereich: 'systemzustand', leer: null }, anbindung: { bereich: 'anbindung', leer: null },
  einrichtung: { bereich: NUR_GESAMT, leer: null }, automatisierungen: { bereich: 'automatisierungen', leer: null },
  paketeEinstellungen: { bereich: 'pakete', leer: [] }, kiTypen: { bereich: 'pakete', leer: null }, postfachAnmeldung: { bereich: 'postfaecher', leer: [] },
  eingangsordner: { bereich: 'eingangsordner', leer: null },
};
export function nurEigeneBereiche<T extends Record<string, unknown>>(b: Benutzer, daten: T): T {
  if (hatGesamt(b)) return daten;
  const erg: Record<string, unknown> = { ...daten };
  for (const [k, { bereich, leer }] of Object.entries(UEBERSICHT_BEREICHE)) {
    if (!(k in erg)) continue;
    if (bereich === NUR_GESAMT || !darfBereich(b, bereich)) erg[k] = leer;
  }
  return erg as T;
}

/** Vollexport (#254): Vorschlag, welche Felder eines Typs einen Kontakt (vCard) ergeben – bestätigt der Administrator. */
export function kontaktVorschlaege(typen: Mappentyp[]): Array<{ typId: string; typ: string; zuordnung: KontaktZuordnung }> {
  const erg: Array<{ typId: string; typ: string; zuordnung: KontaktZuordnung }> = [];
  for (const t of typen) {
    const text = t.felder.filter((f) => f.typ === 'text' || f.typ === 'langtext');
    const finde = (re: RegExp) => text.find((f) => re.test(`${f.key} ${f.label}`.toLowerCase()))?.key;
    const email = finde(/e-?mail/), telefon = finde(/telefon|tel\b|handy|mobil|phone/);
    const adresse = text.find((f) => /adresse|anschrift|stra(ss|ß)e/.test(`${f.key} ${f.label}`.toLowerCase()) && f.key !== email)?.key;
    if (!email && !telefon && !adresse) continue;
    const name = finde(/^name|\bname\b|bezeichnung|firma|kontakt/) ?? text[0]?.key;
    if (!name) continue;
    erg.push({ typId: t.id, typ: t.name, zuordnung: { name, ...(email ? { email } : {}), ...(telefon ? { telefon } : {}), ...(adresse ? { adresse } : {}), ...(finde(/firma|unternehmen|organisation/) && finde(/firma|unternehmen|organisation/) !== name ? { firma: finde(/firma|unternehmen|organisation/) } : {}) } });
  }
  return erg;
}

export { L, ok, archivProtokoll, leer, b, info, quelle, ich, grenzenUndEngpaesse, prozessZeilen, engpassStand, zweifaktorStatus };
