/**
 * Auskunft nach Art. 15 DSGVO (#396): Einstellungen, Auswahl und Prüfregeln – gemeinsam für Server
 * und Werkbank. Gesammelt wird mit der Baum-Sammlung (baum.ts); erzeugt wird eine ZIP-Datei mit
 * Deckblatt, Übersicht, Dokumenten und JSON im Format des Vollexports.
 */
import { liesAnrede, TEXTE_DRITTE, textDritte, type Anrede } from './anrede';
import type { Baum, BaumRichtung } from './baum';
import { imHeimnetz, rechnername } from './heimnetz';
import { t } from './texte';

/** Je Mappentyp: betrifft eine Person? Zweck der Verarbeitung (für das Deckblatt). */
export interface DatenschutzTyp { person: boolean; zweck: string }

export interface Datenschutz {
  /** Absender des Deckblatts: Name und Anschrift des Verantwortlichen, mehrzeilig. */
  verantwortlicher: string;
  /** Empfänger der Daten (Art. 15 Abs. 1 lit. c), Vorschlag für jede Auskunft. */
  empfaenger: string;
  /** Rechte der betroffenen Person – Text auf dem Deckblatt. */
  rechte: string;
  typen: Record<string, DatenschutzTyp>;
  /** Anrede in Unterlagen für Dritte (#474): Deckblatt, Übersicht, LIESMICH, Abrufseite, E-Mails an die Person. Vorgabe „du“. */
  anrede: Anrede;
}

/** Vorschlag für die Rechte auf dem Deckblatt – in der eingestellten Anrede (#474). */
export const rechteStandard = (anrede: Anrede) => TEXTE_DRITTE[anrede]['auskunft.rechte'];
export const RECHTE_STANDARD = rechteStandard('du');
/** Ist das der unveränderte Vorschlag (in irgendeiner Anrede)? Dann folgt er der Anrede. */
export const istRechteStandard = (t: string) => Object.values(TEXTE_DRITTE).some((x) => x['auskunft.rechte'] === t.trim());
export const DATENSCHUTZ_STANDARD: Datenschutz = { verantwortlicher: '', empfaenger: '', rechte: RECHTE_STANDARD, typen: {}, anrede: 'du' };

export const TEXT_MAX = 2000;
export const ZWECK_MAX = 500;
/** So lange liegt eine erzeugte Auskunft zum Herunterladen bereit (danach gelöscht, ebenso nach dem Herunterladen). */
export const AUSKUNFT_TAGE = 7;
/** Ebenso lange liegen Vollexport und „Meine Daten exportieren“ bereit (#797): dieselbe Frist, derselbe Ablauf. */
export const EXPORT_TAGE = AUSKUNFT_TAGE;
/** Frist zur Beantwortung (Art. 12 Abs. 3 DSGVO): ein Monat ab Eingang. */
export const AUSKUNFT_FRIST_MONATE = 1;
/** Begründung, warum eine Notiz nicht herausgegeben wird (Pflicht). */
export const GRUND_MIN = 5;
export const GRUND_MAX = 500;
export const AUSKUNFT_PASSWORT_MIN = 10;

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\r\n/g, '\n').trim().slice(0, max) : '');

/** Gespeicherte Einstellung lesen; fehlt etwas, gilt der Standard. */
export function liesDatenschutz(v: unknown): Datenschutz {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const typen: Record<string, DatenschutzTyp> = {};
  if (o.typen && typeof o.typen === 'object') {
    for (const [id, t] of Object.entries(o.typen as Record<string, unknown>)) {
      const x = (t && typeof t === 'object' ? t : {}) as Record<string, unknown>;
      const person = x.person === true; const zweck = text(x.zweck, ZWECK_MAX);
      if (person || zweck) typen[id] = { person, zweck };
    }
  }
  const anrede = liesAnrede(o.anrede);
  const rechte = typeof o.rechte === 'string' ? text(o.rechte, TEXT_MAX) : '';
  return {
    verantwortlicher: text(o.verantwortlicher, TEXT_MAX),
    empfaenger: text(o.empfaenger, TEXT_MAX),
    // Leer oder der unveränderte Vorschlag: der Vorschlag in der eingestellten Anrede.
    rechte: rechte && !istRechteStandard(rechte) ? rechte : rechteStandard(anrede),
    typen,
    anrede,
  };
}

/** Mappentypen, die „eine Person betreffen“ (Betroffene einer Auskunft). */
export const personenTypen = (d: Datenschutz) => Object.entries(d.typen).filter(([, t]) => t.person).map(([id]) => id);

/** Ende der Antwortfrist: Eingang + 1 Monat (31.01. → 28./29.02.), JJJJ-MM-TT. */
export function fristBis(eingang: string): string {
  const [j, m, t] = eingang.slice(0, 10).split('-').map(Number);
  const ziel = new Date(Date.UTC(j, m - 1 + AUSKUNFT_FRIST_MONATE, 1));
  const letzter = new Date(Date.UTC(ziel.getUTCFullYear(), ziel.getUTCMonth() + 1, 0)).getUTCDate();
  ziel.setUTCDate(Math.min(t, letzter));
  return ziel.toISOString().slice(0, 10);
}

/* ---------- Vorschau (Prüfliste) ---------- */

export interface AuskunftDokument {
  id: string; name: string; register: string; mime: string; groesse: number;
  /** Selbst eine geschwärzte Fassung (#392). */
  geschwaerzt: boolean;
  /** Es gibt eine geschwärzte Fassung davon in derselben Mappe (Id) – dann diese statt des Originals vorschlagen. */
  geschwaerzteFassung: string | null;
  /** Ältere Versionen werden nie mitgegeben (sie könnten ungeschwärzt sein). */
  aeltere: number;
  /** Lässt sich schwärzen (PDF, JPEG, PNG). */
  schwaerzbar: boolean;
}
export interface AuskunftNotiz { id: string; erstellt: string; text: string }
export interface AuskunftMappe {
  dokumente: AuskunftDokument[];
  notizen: AuskunftNotiz[];
  /** Einträge der Historie. */
  historie: number;
  /** Hinweis „Daten Dritter?“: Personen (Mappentyp „betrifft eine Person“) außerhalb der Sammlung, mit denen die Mappe verbunden ist (Titel). */
  dritte: string[];
  /** Passwortfelder werden nie mitgegeben (Bezeichnungen). */
  ohneFelder: string[];
}
/**
 * Prüfliste (#396, #472): Baum ab der Person – nach unten alles, nach oben nur weiter nach oben – und nur
 * über Verweise der Art „Zugehörigkeit“ weiter. Mappen, die nur über „Bezug“ verbunden sind
 * (`baum.knoten[].nurBezug`, z. B. ein Vertrag mit der Person als Ansprechpartner), gehen standardmäßig
 * nur als Erwähnung hinaus (Art, Titel, Feld); ganz aufnehmen kann man sie bewusst. Volltext-Vorschläge
 * gibt es nicht (#472: Verwechslungen, Gefahr fremder Inhalte).
 */
export interface AuskunftVorschau {
  baum: Baum;
  /** Inhalte je Mappe des Baums – auch der Bezug-Mappen (für „ganz aufnehmen“). */
  mappen: Record<string, AuskunftMappe>;
  /** Ende der Antwortfrist, wenn heute eingegangen. */
  frist: string;
}

/** Eine Bezug-Mappe, die nur als Erwähnung hinausgeht: „als Ansprechpartner eingetragen in Vertrag „W-1““. */
export interface AuskunftErwaehnung { mappeId: string; typ: string; titel: string; feld: string; richtung: BaumRichtung }

/** Text einer Erwähnung – ohne Dokumente, Notizen und übrige Feldwerte der Mappe. */
export function erwaehnungText(e: Pick<AuskunftErwaehnung, 'typ' | 'titel' | 'feld' | 'richtung'>): string {
  const mappe = `${e.typ ? `${e.typ} ` : ''}„${e.titel || t('gemeinsam.auskunft.ohne-titel')}“`;
  return e.richtung === 'verwiesenVon' ? t('gemeinsam.auskunft.als-eingetragen-in', { feld: e.feld, mappe }) : t('gemeinsam.auskunft.verweist-ueber-auf', { feld: e.feld, mappe });
}

/** Was hinausgeht: nur ausdrücklich Ausgewähltes. */
export interface AuskunftAuswahl {
  mappen: string[];
  dokumente: string[];
  notizen: string[];
  /** Mappen, deren Historie mitgeht. */
  historie: string[];
  /** Abgewählte Notizen ausgewählter Mappen – je mit Begründung. */
  ohneNotizen: Array<{ id: string; grund: string }>;
  /** Bezug-Mappen (#472), die nur als Erwähnung hinausgehen (Art, Titel, Feld); ganz aufgenommene stehen in `mappen`. */
  erwaehnungen: string[];
}

const ids = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string'))] : []);

/** Eingabe → Auswahl (ohne Prüfung gegen die Daten). */
export function liesAuswahl(v: unknown): AuskunftAuswahl {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const ohne = Array.isArray(o.ohneNotizen) ? o.ohneNotizen : [];
  return {
    mappen: ids(o.mappen), dokumente: ids(o.dokumente), notizen: ids(o.notizen), historie: ids(o.historie), erwaehnungen: ids(o.erwaehnungen),
    ohneNotizen: ohne.map((x) => (x && typeof x === 'object' ? x as Record<string, unknown> : {})).filter((x) => typeof x.id === 'string')
      .map((x) => ({ id: x.id as string, grund: text(x.grund, GRUND_MAX) })),
  };
}

/**
 * Prüft die Auswahl gegen die gesammelten Mappen. Liefert Fehlermeldungen (leer = in Ordnung):
 * nur bekannte Mappen; Dokumente und Notizen nur aus ausgewählten Mappen; jede Notiz einer
 * ausgewählten Mappe ist entweder dabei oder hat eine Begründung; Erwähnungen nur von Bezug-Mappen.
 */
export function auswahlProbleme(a: AuskunftAuswahl, bekannt: Record<string, AuskunftMappe>, bezug: ReadonlySet<string> = new Set()): string[] {
  const p: string[] = [];
  if (a.erwaehnungen.some((id) => !bezug.has(id))) p.push(t('gemeinsam.auskunft.erwaehnungen-nur-von-mappen'));
  if (!a.mappen.length) p.push(t('gemeinsam.auskunft.bitte-mindestens-eine-mappe'));
  const fremd = a.mappen.filter((id) => !bekannt[id]);
  if (fremd.length) p.push(t('gemeinsam.auskunft.ausgewaehlte-mappen-gehoeren-nicht', { fremd: fremd.length }));
  const gewaehlt = new Set(a.mappen.filter((id) => bekannt[id]));
  const dok = new Set<string>(); const not = new Set<string>();
  for (const id of gewaehlt) { for (const d of bekannt[id].dokumente) dok.add(d.id); for (const n of bekannt[id].notizen) not.add(n.id); }
  if (a.dokumente.some((id) => !dok.has(id))) p.push(t('gemeinsam.auskunft.dokumente-nur-aus-ausgewaehlten'));
  if (a.notizen.some((id) => !not.has(id))) p.push(t('gemeinsam.auskunft.notizen-nur-aus-ausgewaehlten'));
  if (a.historie.some((id) => !gewaehlt.has(id))) p.push(t('gemeinsam.auskunft.historie-nur-von-ausgewaehlten'));
  const drin = new Set(a.notizen);
  const grund = new Map(a.ohneNotizen.map((x) => [x.id, x.grund] as const));
  const ohneGrund = [...not].filter((id) => !drin.has(id) && (grund.get(id) ?? '').length < GRUND_MIN);
  if (ohneGrund.length) p.push(t('gemeinsam.auskunft.abgewaehlte-notizen-haben-keine', { anzahl: ohneGrund.length }));
  return p;
}

/** Eine erzeugte Auskunft, solange sie zum Herunterladen bereitliegt. */
export interface AuskunftStand {
  id: string;
  mappeId: string;
  titel: string;
  erstellt: string;
  /** Wird spätestens dann gelöscht. */
  bis: string;
  bytes: number;
  mappen: number;
  dokumente: number;
  verschluesselt: boolean;
  von: string;
  /** Wer sie erstellt hat (Benutzer-Id, ab #455) – bekommt die Benachrichtigung über Abrufe. */
  vonId?: string;
  /** Ursprüngliches Ende (Erstellung + AUSKUNFT_TAGE); ein Abruf-Link verlängert `bis` bis zu seinem Ablauf (#455). */
  bisOhneLink?: string;
}

/** Ein Dateiname ohne Sonderzeichen für die ZIP-Datei: Auskunft-<Titel>-<Datum>.zip */
export function auskunftDateiname(titel: string, datum: string): string {
  const text2 = titel.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'Person';
  return t('gemeinsam.auskunft.auskunft', { t: text2, datum: datum.slice(0, 10) });
}

/* ---------- Zustellen (#455): per E-Mail oder Abruf-Link mit Abrufcode ---------- */

/** Abruf-Link: Vorgaben und Grenzen. */
export const LINK_TAGE_STANDARD = 30;
export const LINK_TAGE_MAX = 90;
export const LINK_ABRUFE_STANDARD = 3;
export const LINK_ABRUFE_MAX = 10;
/** Nach so vielen falschen Abrufcodes ist der Link gesperrt (zusätzlich zum Anmeldeschutz je IP). */
export const LINK_FEHLVERSUCHE_MAX = 10;
/** Erzeugter Abrufcode: 8 Zeichen aus 32 gut unterscheidbaren (40 Bit) – zusammen mit dem Link (256 Bit). */
export const CODE_ZEICHEN = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LAENGE = 8;
/** Selbst gewählter Code (z. B. Vertragsnummer): mindestens so viele Zeichen. */
export const CODE_EIGEN_MIN = 6;
/** Viele Mailserver nehmen höchstens 10–25 MB an. */
export const EMAIL_WARNUNG_BYTES = 10 * 1024 * 1024;

/** Abrufcode vergleichbar machen: Groß-/Kleinschreibung, Leerzeichen und Bindestriche egal. */
export const normiereCode = (c: unknown) => (typeof c === 'string' ? c.normalize('NFKC').toUpperCase().replace(/[\s\-_.]/g, '').slice(0, 64) : '');
/** Zur Anzeige in Vierergruppen: ABCD-EFGH. */
export const zeigeCode = (c: string) => c.replace(/(.{4})(?=.)/g, '$1-');

export type LinkStatus = 'aktiv' | 'abgelaufen' | 'verbraucht' | 'gesperrt' | 'widerrufen';
export const LINK_STATUS: Record<LinkStatus, string> = {
  aktiv: 'aktiv', abgelaufen: 'abgelaufen', verbraucht: t('gemeinsam.auskunft.alle-abrufe-verbraucht'), gesperrt: t('gemeinsam.auskunft.gesperrt-nach-fehlversuchen'), widerrufen: 'zurückgezogen',
};

/** Ein Abruf-Link, wie ihn die Werkbank sieht – ohne Schlüssel und Code (beide liegen nur als Hash vor). */
export interface AuskunftLink {
  id: string;
  /** Die Auskunft (ZIP), für die er gilt. */
  auskunftId: string;
  mappeId: string;
  titel: string;
  /** An wen der Link per E-Mail ging (falls). */
  empfaenger: string | null;
  /** Code vom DMS erzeugt oder selbst gewählt (z. B. Vertragsnummer). */
  codeArt: 'erzeugt' | 'eigen';
  erstellt: string;
  erstelltVon: string | null;
  ablauf: string;
  maxAbrufe: number;
  abrufe: number;
  fehlversuche: number;
  gesperrt: string | null;
  widerrufen: string | null;
  /** Zuletzt erfolgreich abgerufen. */
  abgerufen: string | null;
}

export function linkStatus(l: Pick<AuskunftLink, 'ablauf' | 'maxAbrufe' | 'abrufe' | 'gesperrt' | 'widerrufen'>, jetzt = new Date()): LinkStatus {
  if (l.widerrufen) return 'widerrufen';
  if (l.gesperrt) return 'gesperrt';
  if (l.abrufe >= l.maxAbrufe) return 'verbraucht';
  if (new Date(l.ablauf).getTime() <= jetzt.getTime()) return 'abgelaufen';
  return 'aktiv';
}

/** Eingaben für einen neuen Abruf-Link prüfen. */
export function liesLinkEingabe(v: unknown): { tage: number; abrufe: number; code: string | null; codeWieEingegeben: string | null; an: string; senden: boolean; fehler: string[] } {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const fehler: string[] = [];
  const zahl = (x: unknown, std: number) => (x === undefined || x === null || x === '' ? std : Math.round(Number(x)));
  const tage = zahl(o.tage, LINK_TAGE_STANDARD);
  const abrufe = zahl(o.abrufe, LINK_ABRUFE_STANDARD);
  if (!Number.isInteger(tage) || tage < 1 || tage > LINK_TAGE_MAX) fehler.push(t('gemeinsam.auskunft.gueltigkeit-1-bis-tage', { LINK_TAGE_MAX }));
  if (!Number.isInteger(abrufe) || abrufe < 1 || abrufe > LINK_ABRUFE_MAX) fehler.push(t('gemeinsam.auskunft.abrufe-1-bis', { LINK_ABRUFE_MAX }));
  const eigen = o.code === undefined || o.code === null || o.code === '' ? null : normiereCode(o.code);
  if (eigen !== null && eigen.length < CODE_EIGEN_MIN) fehler.push(t('gemeinsam.auskunft.ein-eigener-abrufcode-braucht', { CODE_EIGEN_MIN }));
  const an = typeof o.an === 'string' ? o.an.trim().slice(0, 320) : '';
  // Ein eigener Code (z. B. eine Kundennummer) wird so angezeigt, wie er eingegeben wurde (#666); geprüft wird normiert.
  const codeWieEingegeben = eigen === null ? null : String(o.code).trim().slice(0, 64);
  return { tage, abrufe, code: eigen, codeWieEingegeben, an, senden: o.senden === true, fehler };
}

/**
 * Ist das DMS unter dieser Adresse wahrscheinlich aus dem Internet erreichbar? Nein bei localhost,
 * privaten und lokalen Adressen und Namen im Heimnetz (Liste in heimnetz.ts, Art „hinweis“, #595).
 * Nur ein Vorschlag für die Wahl des Weges.
 */
export function oeffentlichErreichbar(adresse: string): boolean {
  return rechnername(adresse) !== null && !imHeimnetz(adresse, 'hinweis');
}

/** Texte der E-Mails an die Person – in der eingestellten Anrede (#474; Texte in anrede.ts). */
export const auskunftMail = {
  zip: (anrede: Anrede, bis?: string) => ({
    betreff: textDritte(anrede, 'mail.zip.betreff'),
    nachricht: `${textDritte(anrede, 'mail.zip.text')}${bis ? `\n\n${textDritte(anrede, 'mail.zip.frist', { bis })}` : ''}\n`,
  }),
  link: (anrede: Anrede, link: string, bis: string, abrufe: number, absender: string) => ({
    betreff: textDritte(anrede, 'mail.link.betreff'),
    nachricht: `${textDritte(anrede, 'mail.link.text', { bis, link, wieOft: textDritte(anrede, 'mail.link.abrufe', { anzahl: abrufe }) })}\n${absender ? `\n${absender}\n` : ''}`,
  }),
};

/* ---------- Verzeichnis der Auskünfte (#668): Liste mit Zustand, Frist und Verlauf ---------- */

/** Zustand einer Auskunft in der Liste der Werkbank. */
export type AuskunftZustand = 'angefragt' | 'inArbeit' | 'bereit' | 'zugestellt' | 'abgerufen' | 'geloescht';
/** Offen = noch nicht bei der Person angekommen: Antwortfrist zählt. */
export const istOffen = (z: AuskunftZustand) => z === 'angefragt' || z === 'inArbeit' || z === 'bereit';

/** Ein Schritt im Verlauf einer Auskunft – aus der Historie der Person (nur Zahlen, keine Inhalte). */
export interface AuskunftSchritt { zeit: string; text: string; von: string | null; erfolg?: boolean }

/** Ein Eintrag der Liste: eine erzeugte Auskunft (auch gelöscht, als Nachweis), eine Anfrage mit Frist oder ein laufender Auftrag. */
export interface AuskunftEintrag {
  /** Id der Auskunft; bei einer Anfrage `frist-<Aufgabe>`, beim laufenden Auftrag `auftrag-<Id>`. */
  id: string;
  art: 'auskunft' | 'anfrage' | 'auftrag';
  mappeId: string | null;
  titel: string;
  zustand: AuskunftZustand;
  /** Erstellt bzw. angefragt (Frist angelegt). */
  zeit: string;
  /** Antwortfrist (Datum JJJJ-MM-TT), solange offen und eine Frist-Aufgabe besteht. */
  frist: string | null;
  fristAufgabe: string | null;
  mappen?: number;
  dokumente?: number;
  verschluesselt?: boolean;
  /** Liegt die ZIP noch bereit, ihr Stand. */
  bereit?: AuskunftStand;
  verlauf: AuskunftSchritt[];
}

/** Woran eine Frist-Aufgabe der Auskunft zu erkennen ist (#396 legt sie als manuelle Aufgabe an). */
export const FRIST_SCHLUESSEL = 'auskunft.frist';
export const FRIST_TEXT_ANFANG = t('gemeinsam.auskunft.auskunft-nach-art-15');

export interface VerzeichnisQuelle {
  /** Historie-Einträge der Art „auskunft“, beliebige Reihenfolge. */
  historie: Array<{ mappeId: string; zeit: string; benutzerId: string | null; daten: Record<string, unknown> }>;
  bereit: AuskunftStand[];
  /** Offene Frist-Aufgaben (Art manuell, siehe FRIST_SCHLUESSEL). */
  fristen: Array<{ id: string; mappeId: string; mappeTitel?: string; datum: string | null; erstellt: string }>;
  titel: Map<string, string>;
  namen: Map<string, string>;
  laufend?: { id: string; titel: string; gestartet: string } | null;
}

/**
 * Baut die Liste (#668) aus dem, was ohnehin gespeichert ist: Historie der Person (erstellt, zugestellt,
 * abgerufen, heruntergeladen, gelöscht), bereitliegende ZIP-Dateien und offene Frist-Aufgaben. Gelöschte und
 * abgelaufene Auskünfte bleiben so als Nachweis in der Liste – ohne Datei. Neueste zuerst.
 */
export function auskunftVerzeichnis(q: VerzeichnisQuelle): AuskunftEintrag[] {
  const je = new Map<string, AuskunftEintrag>();
  const bereit = new Map(q.bereit.map((b) => [b.id, b]));
  const hist = [...q.historie].sort((a, b) => a.zeit.localeCompare(b.zeit));
  for (const h of hist) {
    const id = typeof h.daten.auskunft === 'string' ? h.daten.auskunft : null;
    if (!id) continue;
    let e = je.get(id);
    if (!e) {
      e = { id, art: 'auskunft', mappeId: h.mappeId, titel: q.titel.get(h.mappeId) ?? '', zustand: 'geloescht', zeit: h.zeit, frist: null, fristAufgabe: null, verlauf: [] };
      je.set(id, e);
    }
    const z = h.daten.zustellung;
    if (!z && typeof h.daten.mappen === 'number') {
      e.zeit = h.zeit; e.mappen = h.daten.mappen; e.dokumente = typeof h.daten.dokumente === 'number' ? h.daten.dokumente : undefined;
      e.verschluesselt = h.daten.verschluesselt === true;
    }
    e.verlauf.push({ zeit: h.zeit, text: String(h.daten.text ?? ''), von: h.benutzerId ? q.namen.get(h.benutzerId) ?? null : null, ...(typeof h.daten.erfolg === 'boolean' ? { erfolg: h.daten.erfolg } : {}) });
  }
  // Bereitliegende ohne Historie (z. B. Eintrag schon aufgeräumt): trotzdem zeigen.
  for (const b of q.bereit) if (!je.has(b.id)) je.set(b.id, { id: b.id, art: 'auskunft', mappeId: b.mappeId, titel: b.titel, zustand: 'bereit', zeit: b.erstellt, frist: null, fristAufgabe: null, mappen: b.mappen, dokumente: b.dokumente, verschluesselt: b.verschluesselt, verlauf: [] });
  for (const e of je.values()) {
    const b = bereit.get(e.id);
    // Ein zurückgezogener Link (ohne Ablauf) zählt nicht als Zustellung.
    const zust = (art: string) => q.historie.some((h) => h.daten.auskunft === e.id && h.daten.zustellung === art && h.daten.erfolg !== false && (art !== 'link' || !!h.daten.ablauf));
    if (b) { e.bereit = b; e.titel = e.titel || b.titel; }
    e.zustand = zust('abruf') ? 'abgerufen' : zust('email') || zust('link') || zust('download') ? 'zugestellt' : b ? 'bereit' : 'geloescht';
    e.verlauf.reverse();
  }
  const liste = [...je.values()];
  // Offene Frist: zur jüngsten offenen Auskunft der Person, die nach der Frist entstand – sonst als Anfrage.
  for (const f of q.fristen) {
    const ziel = liste.filter((e) => e.art === 'auskunft' && e.mappeId === f.mappeId && istOffen(e.zustand) && e.zeit >= f.erstellt).sort((a, b) => b.zeit.localeCompare(a.zeit))[0];
    if (ziel) { ziel.frist = f.datum; ziel.fristAufgabe = f.id; continue; }
    liste.push({ id: `frist-${f.id}`, art: 'anfrage', mappeId: f.mappeId, titel: q.titel.get(f.mappeId) ?? f.mappeTitel ?? '', zustand: 'angefragt', zeit: f.erstellt, frist: f.datum, fristAufgabe: f.id, verlauf: [] });
  }
  if (q.laufend) liste.push({ id: `auftrag-${q.laufend.id}`, art: 'auftrag', mappeId: null, titel: q.laufend.titel, zustand: 'inArbeit', zeit: q.laufend.gestartet, frist: null, fristAufgabe: null, verlauf: [] });
  return liste.sort((a, b) => b.zeit.localeCompare(a.zeit));
}

/** Tage bis zur Frist (negativ = überfällig), gerechnet in Kalendertagen. */
export function tageBisFrist(frist: string, heute: string): number {
  return Math.round((Date.parse(`${frist}T00:00:00Z`) - Date.parse(`${heute}T00:00:00Z`)) / 86400000);
}
