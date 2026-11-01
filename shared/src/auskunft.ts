/**
 * Auskunft nach Art. 15 DSGVO (#396): Einstellungen, Auswahl und Prüfregeln – gemeinsam für Server
 * und Werkbank. Gesammelt wird mit der Baum-Sammlung (baum.ts); erzeugt wird eine ZIP-Datei mit
 * Deckblatt, Übersicht, Dokumenten und JSON im Format des Vollexports.
 */
import type { Baum, BaumRichtung } from './baum';

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
}

/** Das Deckblatt geht an Kunden, Mieter und Kontakte – wie überall im DMS mit „du“ (Thomas, 01.11.2026; förmlich ggf. später mit #357). */
export const RECHTE_STANDARD = 'Du hast das Recht auf Berichtigung (Art. 16 DSGVO), Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18), Datenübertragbarkeit (Art. 20) und Widerspruch (Art. 21). Außerdem kannst du dich bei einer Datenschutz-Aufsichtsbehörde beschweren (Art. 77). Die Daten im Ordner „daten“ sind maschinenlesbar (CSV und JSON) und lassen sich in andere Systeme übernehmen.';
export const DATENSCHUTZ_STANDARD: Datenschutz = { verantwortlicher: '', empfaenger: '', rechte: RECHTE_STANDARD, typen: {} };

export const TEXT_MAX = 2000;
export const ZWECK_MAX = 500;
/** So lange liegt eine erzeugte Auskunft zum Herunterladen bereit (danach gelöscht, ebenso nach dem Herunterladen). */
export const AUSKUNFT_TAGE = 7;
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
  return {
    verantwortlicher: text(o.verantwortlicher, TEXT_MAX),
    empfaenger: text(o.empfaenger, TEXT_MAX),
    rechte: typeof o.rechte === 'string' && o.rechte.trim() ? text(o.rechte, TEXT_MAX) : RECHTE_STANDARD,
    typen,
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
  const mappe = `${e.typ ? `${e.typ} ` : ''}„${e.titel || 'Ohne Titel'}“`;
  return e.richtung === 'verwiesenVon' ? `als „${e.feld}“ eingetragen in ${mappe}` : `verweist über „${e.feld}“ auf ${mappe}`;
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
  if (a.erwaehnungen.some((id) => !bezug.has(id))) p.push('Erwähnungen nur von Mappen, die über einen Bezug verbunden sind – bitte neu sammeln.');
  if (!a.mappen.length) p.push('Bitte mindestens eine Mappe auswählen.');
  const fremd = a.mappen.filter((id) => !bekannt[id]);
  if (fremd.length) p.push(`${fremd.length} ausgewählte Mappen gehören nicht zur Sammlung – bitte neu sammeln.`);
  const gewaehlt = new Set(a.mappen.filter((id) => bekannt[id]));
  const dok = new Set<string>(); const not = new Set<string>();
  for (const id of gewaehlt) { for (const d of bekannt[id].dokumente) dok.add(d.id); for (const n of bekannt[id].notizen) not.add(n.id); }
  if (a.dokumente.some((id) => !dok.has(id))) p.push('Dokumente nur aus ausgewählten Mappen.');
  if (a.notizen.some((id) => !not.has(id))) p.push('Notizen nur aus ausgewählten Mappen.');
  if (a.historie.some((id) => !gewaehlt.has(id))) p.push('Historie nur von ausgewählten Mappen.');
  const drin = new Set(a.notizen);
  const grund = new Map(a.ohneNotizen.map((x) => [x.id, x.grund] as const));
  const ohneGrund = [...not].filter((id) => !drin.has(id) && (grund.get(id) ?? '').length < GRUND_MIN);
  if (ohneGrund.length) p.push(ohneGrund.length === 1 ? 'Eine abgewählte Notiz hat keine Begründung.' : `${ohneGrund.length} abgewählte Notizen haben keine Begründung.`);
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
  const t = titel.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'Person';
  return `Auskunft-${t}-${datum.slice(0, 10)}`;
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
  aktiv: 'aktiv', abgelaufen: 'abgelaufen', verbraucht: 'alle Abrufe verbraucht', gesperrt: 'gesperrt nach Fehlversuchen', widerrufen: 'zurückgezogen',
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
export function liesLinkEingabe(v: unknown): { tage: number; abrufe: number; code: string | null; an: string; senden: boolean; fehler: string[] } {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const fehler: string[] = [];
  const zahl = (x: unknown, std: number) => (x === undefined || x === null || x === '' ? std : Math.round(Number(x)));
  const tage = zahl(o.tage, LINK_TAGE_STANDARD);
  const abrufe = zahl(o.abrufe, LINK_ABRUFE_STANDARD);
  if (!Number.isInteger(tage) || tage < 1 || tage > LINK_TAGE_MAX) fehler.push(`Gültigkeit: 1 bis ${LINK_TAGE_MAX} Tage.`);
  if (!Number.isInteger(abrufe) || abrufe < 1 || abrufe > LINK_ABRUFE_MAX) fehler.push(`Abrufe: 1 bis ${LINK_ABRUFE_MAX}.`);
  const eigen = o.code === undefined || o.code === null || o.code === '' ? null : normiereCode(o.code);
  if (eigen !== null && eigen.length < CODE_EIGEN_MIN) fehler.push(`Ein eigener Abrufcode braucht mindestens ${CODE_EIGEN_MIN} Zeichen (ohne Leerzeichen und Bindestriche).`);
  const an = typeof o.an === 'string' ? o.an.trim().slice(0, 320) : '';
  return { tage, abrufe, code: eigen, an, senden: o.senden === true, fehler };
}

/**
 * Ist das DMS unter dieser Adresse wahrscheinlich aus dem Internet erreichbar? Nein bei localhost,
 * privaten und lokalen Adressen (10.x, 192.168.x, 172.16–31.x, fe80::, fc/fd…, *.local, *.lan,
 * *.home, *.internal, *.fritz.box) und Namen ohne Punkt. Nur ein Vorschlag für die Wahl des Weges.
 */
export function oeffentlichErreichbar(adresse: string): boolean {
  let host: string;
  try { host = new URL(adresse).hostname.toLowerCase().replace(/^\[|\]$/g, ''); } catch { return false; }
  if (!host || host === 'localhost' || !host.includes('.') && !host.includes(':')) return false;
  if (/\.(local|lan|home|internal|intranet|localdomain|fritz\.box|home\.arpa)$/.test(host) || host.endsWith('.localhost')) return false;
  const v4 = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(host);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return !(a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127));
  }
  if (host.includes(':')) return !(host === '::1' || /^f[cd]/.test(host) || /^fe[89ab]/.test(host));
  return true;
}

/** Texte der E-Mails an die Person – in Du-Form (Thomas, 01.11.2026). */
export const auskunftMail = {
  zip: (bis?: string) => ({
    betreff: 'Deine Auskunft nach Art. 15 DSGVO',
    nachricht: `Hallo,

du hast eine Auskunft über die Daten angefordert, die wir zu dir gespeichert haben (Art. 15 DSGVO). Du findest sie im Anhang als ZIP-Datei.

Die Datei ist mit einem Passwort geschützt (AES-256). Das Passwort bekommst du auf einem anderen Weg – zum Beispiel per Telefon, SMS oder Brief –, nicht per E-Mail. Öffnen lässt sie sich zum Beispiel mit 7-Zip (Windows), Keka (macOS) oder WinZip; das eingebaute Entpacken von Windows kann das nicht.${bis ? `\n\nBitte antworte bis ${bis}, falls etwas fehlt oder du Fragen hast.` : ''}
`,
  }),
  link: (link: string, bis: string, abrufe: number, absender: string) => ({
    betreff: 'Deine Auskunft nach Art. 15 DSGVO zum Abrufen',
    nachricht: `Hallo,

du hast eine Auskunft über die Daten angefordert, die wir zu dir gespeichert haben (Art. 15 DSGVO). Du kannst sie bis ${bis} hier abrufen${abrufe > 1 ? ` (höchstens ${abrufe}-mal)` : ' (einmal)'}:

${link}

Zum Abrufen brauchst du deinen Abrufcode. Den bekommst du auf einem anderen Weg – zum Beispiel per Brief, Telefon oder SMS –, nicht per E-Mail. Gib den Link bitte nicht weiter.
${absender ? `\n${absender}\n` : ''}`,
  }),
};
