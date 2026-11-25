/**
 * Automatisierungen (#672, #674): kleine Abläufe ohne Code – **Wenn · Und · Dann · Sonst** (Sonst seit #677).
 *
 * - **Genau eine Wenn-Karte** – ein Ereignis aus dem Katalog (#670) oder „Datum erreicht“ (#724: Vorlauf in Tagen,
 *   Wochen oder Monaten, auch wiederkehrend; ersetzt „Datum in N Tagen“ und die Wenn-Karte „Frist erreicht“). Sie legt den Kontext
 *   fest: die Mappe und ihren Mappentyp. Dessen Felder stehen in Und und Dann als Bedingungen und Platzhalter bereit.
 * - **Und** – Bedingungen aus dem Baukasten der Ansichten (`sichten/`), dazu „Mappe ist in Ansicht …“ und
 *   „Mappe ist in den Favoriten von …“; jede umkehrbar, Gruppen „alle“ / „eine davon“ (eine Ebene tief).
 * - **Dann** – Karten in ihrer Reihenfolge. Die Karten selbst führt der Server aus (`automatisierung-karten.ts`).
 * - **Sonst** (#677) – Karten, die laufen, wenn die Und-Bedingungen nicht zutreffen (dieselben Karten wie Dann).
 * - **Werkbank-Karten** (#677): Wenn „Fehler gemeldet“, „Protokollmeldung“, „neue Version“ (ohne Mappe) und Dann
 *   „Sicherung anstoßen“ – mit genau den Werkbank-Rechten des Systemkontos (`automatisierung-werkbank.ts`).
 * - **Aufruf von außen** (#679): Wenn-Karte mit eigener Adresse und Geheimnis, Parameter als Platzhalter
 *   (`automatisierung-aufruf.ts`).
 * - **Nach außen** (#671): Dann-Karten „URL aufrufen“ (nur freigegebene Ziele, Inhaltsstufen, Signatur) und „E-Mail
 *   senden“ (`automatisierung-aussen.ts`).
 *
 * Gespeichert wird nur, was hier steht; `bereinigeAutomatisierung` schneidet alles andere ab. Was zu einer
 * Automatisierung nicht (mehr) passt (Mappentyp gelöscht, Feld fehlt …), meldet `automatisierungsProbleme` –
 * sie wird dann rot und angehalten, die Arbeit im DMS blockiert das nie („Bearbeiten geht vor Automatisierung“).
 */
import { EREIGNISKATALOG, KATALOG_ARTEN, wennFaehig, type BetriebWenn } from './ereignisse';
import { bereinigeBetrieb, betriebKurz, betriebPlatzhalter, betriebProbleme, istBetrieb } from './automatisierung-werkbank';
import { aufrufKurz, aufrufPlatzhalter, bereinigeAufruf, istAufruf } from './automatisierung-aufruf';
import { aussenKurz, aussenProbleme, bereinigeAussen, istAussenKarte } from './automatisierung-aussen';
import { bereinigeVerknuepft, verknuepftKurz, verknuepftProbleme } from './automatisierung-verknuepft';
import type {
  AussenZiel,
  AutomatisierungDaten,
  DannKarte,
  Empfaenger,
  Lauf,
  UndKarte,
  WennEreignis,
  WennKarte,
} from './automatisierung-typen';
import { VORLAUF_EINHEITEN, vorlaufText, type VorlaufEinheit } from './fristen';
// „Datum erreicht“ (#724): seit #671 in fristen.ts (dort passt es hin, und diese Datei bleibt unter 400 Zeilen).
export { erreichteDaten, vorlaufText } from './fristen';
import type { Feld, Mappentyp } from './model/basis';
import { einzigesZiel, jedeMappe, zieleVon } from './verweisziele';
import { bedingungEingabeFehler, bedingungsProblem, bereinigeBedingungen, type Sicht } from './sichten';
import { t } from './texte';
import { PAKET_ID, SCHLUESSEL } from './kennungen';
import { aufgabeName, kartenWerteRoh, type KontextPaket, type PaketKarte } from './paketkarten';
export type { KontextPaket, PaketKarte };

/** Grenzen (Zahl der Automatisierungen, Karten je Bereich, Länge der Texte, Laufzeit, Bremse). */
export const AUTOMATISIERUNG_GRENZEN = {
  automatisierungen: 200,
  bedingungen: 20,
  karten: 20,
  name: 120,
  text: 2000,
  /** Kette von Automatisierungen, die einander auslösen (0 = direkt ausgelöst). */
  tiefe: 3,
  /** Bremse: höchstens so viele Läufe je Minute und Automatisierung, sonst angehalten. */
  laeufeJeMinute: 30,
  /** Ein Lauf darf so lange dauern. */
  laufzeitS: 60,
  /** Verlauf je Automatisierung: so viele Läufe bzw. Tage bleiben stehen. */
  verlauf: 200,
  verlaufTage: 30,
  /** „Datum erreicht“: so viele Tage holt der Zeitplan nach (NAS war aus). */
  nachholenTage: 31,
} as const;

/**
 * Mappentyp „Post“ von Ablago in mitgelieferten Automatisierungen (#1001): `wenn.typ: dms:post` – z. B. „Post für dich“
 * im Paket „Benachrichtigungen“. Andere Typen von Ablago gibt es dort nicht.
 */
export const DMS_POST = 'dms:post';
/**
 * Ab dieser Version versteht Ablago in mitgelieferten Automatisierungen `wenn.typ: dms:post` und `wenn.angelegt` („auch
 * beim Anlegen“) und legt „Post für dich“ nicht mehr selbst an (#1001). Ältere hielten eine solche Automatisierung an.
 */
export const DMS_POST_AUTOMATISIERUNG_AB = '0.257.0';

export * from './automatisierung-typen';
export * from './automatisierung-werkbank';
export * from './automatisierung-aufruf';
export * from './automatisierung-aussen';
export * from './automatisierung-verknuepft';

/** Reihenfolge (1–99): kleiner = früher; Vorgaben je Herkunft. */
export const REIHENFOLGE = { min: 1, max: 99, eigen: 50, dms: 10, paket: 30 } as const;

/**
 * Ereignisse, die eine Wenn-Karte sein können: alle mit einer Mappe als Kontext (Benutzer sind Mappen), dazu die
 * Werkbank-Karten aus dem Betrieb (#677, ohne Mappe). „Frist erreicht“ ist für Pakete; als Wenn-Karte steht es in
 * „Datum erreicht“ (#724).
 */
export const WENN_EREIGNISSE = KATALOG_ARTEN.filter((a) => wennFaehig(a) && a !== 'frist.erreicht') as Array<WennEreignis | BetriebWenn>;

/** Wochentage 1 = Montag … 7 = Sonntag (wie im Profil). */
export const WOCHENTAGE = [1, 2, 3, 4, 5, 6, 7] as const;

/** Personen, die ein Ereignis mitbringt und die Empfänger sein können (#678/#712). */
export const PERSONEN_IM_EREIGNIS: Partial<Record<string, string[]>> = {
  'benutzer.abwesenheit_gesetzt': ['vertreter', 'benutzer'],
  'benutzer.abwesenheit_beendet': ['vertreter', 'benutzer'],
  'benutzer.vertretung_zurueckgezogen': ['vertreter', 'benutzer'],
  'benutzer.gesperrt': ['benutzer'],
  'benutzer.deaktiviert': ['benutzer'],
  'benutzer.aktiviert': ['benutzer'],
  'favorit.neu': ['benutzer'],
};

/** Beschriftung der Personen aus dem Ereignis (Platzhalter und Empfänger). */
export const EREIGNIS_PERSON: Record<string, string> = { vertreter: 'Vertreter', benutzer: 'Benutzer' };

export type DannArt = DannKarte['art'];
export const DANN_ARTEN: DannArt[] = [
  'feld',
  'feld_verknuepft',
  'aufgabe',
  'zusammenfassung',
  'favoriten',
  'anmeldeschutz',
  'paket',
  'sicherung',
  'url',
  'email',
  'stopp',
];

export type Herkunft = 'eigen' | 'dms' | 'paket';

/** Warum eine Automatisierung angehalten ist (getrennt von „von Hand aus“). */
/** `ziel` (#671): Eine Zustellung nach außen ist dauerhaft gescheitert (Ziel nicht erreichbar, abgelehnt, nicht mehr freigegeben). */
export interface Angehalten {
  grund: 'fehlerhaft' | 'bremse' | 'wiederherstellung' | 'ziel';
  text: string;
  zeit: string;
}

export interface Automatisierung extends AutomatisierungDaten {
  id: string;
  /** Von Hand an/aus. */
  aktiv: boolean;
  angehalten: Angehalten | null;
  herkunft: Herkunft;
  paketId?: string | null;
  /** Fortlaufende Fassung (Änderungsverlauf, Schutz gegen gleichzeitiges Speichern). */
  version: number;
  erstellt: string;
  erstelltVon: string | null;
  geaendert: string;
  geaendertVon: string | null;
}

/** Ein fehlgeschlagener Lauf für den Hinweis über der Liste (#707). */
export interface Fehlschlag {
  id: string;
  automatisierungId: string;
  name: string;
  gestartet: string;
}

export interface Fassung {
  version: number;
  zeit: string;
  von: string | null;
  daten: AutomatisierungDaten & { aktiv: boolean };
}

/** Für Liste und Editor: Automatisierung mit Kurzform, Problemen und letztem Lauf. */
export interface AutomatisierungAnsicht extends Automatisierung {
  kurz: string;
  probleme: string[];
  letzterLauf: Pick<Lauf, 'id' | 'zustand' | 'gestartet' | 'fehler'> | null;
  /** Schlüssel des Auslösers (Liste „nach Auslöser“, „läuft als 2. von 3“). */
  ausloeser: string;
  /** Das Konto „Automatisierung“ darf den Mappentyp der Wenn-Karte nicht lesen (#709): Hinweis, kein Fehler. */
  rechte?: { typId: string; typ: string; kontoId: string | null; text: string };
  /** Karten, die gerade ins Leere laufen (#1082: „Paket … ist nicht installiert“) – Hinweis, kein Fehler. */
  leer?: string[];
  /**
   * „Aufruf von außen“ (#679): Adresse (ohne Geheimnis), seit wann, Geheimnis seit wann; `oeffentlich` = die Adresse von
   * Ablago sieht nach Internet aus (sonst nur im Heimnetz nutzbar). null = noch keine Adresse angelegt.
   */
  aufruf?: { adresse: string; erstellt: string; geheimnisSeit: string; oeffentlich: boolean } | null;
  /** „URL aufrufen“ (#671): Karten mit Geheimnis für die Signatur (ohne Geheimnis) – nur, wenn es solche Karten gibt. */
  geheimnisse?: Array<{ karte: string; erstellt: string }>;
}

/* ---------- Kontext ---------- */

/** Was eine Prüfung über das DMS wissen muss (Pakete: `KontextPaket` in paketkarten.ts, #1278). */
export interface Kontextdaten {
  typen: Mappentyp[];
  sichten: Pick<Sicht, 'id' | 'name' | 'typen'>[];
  benutzer: Array<{ id: string; name: string; aktiv?: boolean }>;
  rollen: Array<{ id: string; name: string }>;
  /** Installierte Pakete (#1082); fehlt bei älteren Aufrufern. */
  /** Dazu die freigegebenen Ziele nach außen (#671); fehlt = nicht geprüft (z. B. Vorschau beim Installieren eines Pakets). */
  pakete?: KontextPaket[];
  ziele?: AussenZiel[];
}

/** Passt die Wenn-Karte zur Karte „Paket nach Zeitplan ausführen“ (#1082)? Nur „Zeitplan“, nicht „für jeden Benutzer“. */
export const zeitplanFuerPaket = (w: WennKarte) => w.art === 'zeitplan' && !w.jeBenutzer;

/**
 * Warum die Karte „Paket nach Zeitplan ausführen“ gerade ins Leere läuft (#1082) – Paket entfernt oder ohne das Ereignis;
 * null, wenn sie das Paket erreicht. Kein Problem der Automatisierung: Sie bleibt an und meldet es nur.
 */
export function paketKarteLeer(paket: string, pakete: KontextPaket[] | undefined): string | null {
  const p = pakete?.find((x) => x.id === paket);
  if (!p) return t('gemeinsam.automatisierung.paket-nicht-installiert', { paket });
  return p.zeitplan ? null : t('gemeinsam.automatisierung.paket-ohne-zeitplan', { name: p.name });
}

/** Mappentyp der Wenn-Karte (null = jeder Typ bzw. Benutzer bei Benutzer-Ereignissen). */
export function kontextTyp(w: WennKarte, typen: Mappentyp[]): Mappentyp | null {
  if (w.art === 'zeitplan') return w.jeBenutzer ? (typen.find((t) => t.system === 'benutzer') ?? null) : null;
  if (istBetrieb(w) || istAufruf(w)) return null;
  if (w.art !== 'datum' && EREIGNISKATALOG[w.art].gruppe === 'benutzer') return typen.find((t) => t.system === 'benutzer') ?? null;
  const id = w.typ;
  return id ? (typen.find((t) => t.id === id) ?? null) : null;
}

/** Schlüssel des Auslösers: gleiche Schlüssel = laufen nacheinander für dasselbe Ereignis. */
export function ausloeserSchluessel(w: WennKarte): string {
  if (w.art === 'zeitplan')
    return `zeitplan|${w.uhrzeit}|${w.tage.join('')}|${w.feiertage ? 'f' : ''}|${w.jeBenutzer ? `b:${w.rolle ?? ''}${w.profilzeit ? ':p' : ''}` : ''}`;
  if (w.art === 'protokoll.meldung') return `${w.art}|${w.stufe}|${w.modul ?? ''}|${w.enthaelt ?? ''}`;
  // Aufruf von außen (#679): je Automatisierung eine eigene Adresse – der Server hängt die Id an (laufen nie gemeinsam).
  if (istBetrieb(w) || istAufruf(w)) return w.art;
  return w.art === 'datum' ? `datum|${w.typ}|${w.feld}|${w.vorlauf}|${w.einheit}` : `${w.art}|${w.typ ?? ''}`;
}

/** Platzhalter, die im Kontext der Wenn-Karte zur Verfügung stehen. */
export function platzhalterFuer(w: WennKarte, typ: Mappentyp | null): Array<{ key: string; label: string }> {
  if (istBetrieb(w)) return betriebPlatzhalter(w);
  if (istAufruf(w)) return aufrufPlatzhalter(w);
  const fest = [
    { key: 'titel', label: t('gemeinsam.automatisierung.titel-der-mappe') },
    { key: 'mappentyp', label: t('gemeinsam.automatisierung.mappentyp') },
    { key: 'heute', label: t('gemeinsam.automatisierung.datum-heute') },
    { key: 'automatisierung', label: t('gemeinsam.automatisierung.name-dieser-automatisierung') },
  ];
  if (w.art === 'datum')
    fest.push(
      { key: 'datum', label: t('gemeinsam.automatisierung.erreichtes-datum') },
      { key: 'tage', label: t('gemeinsam.automatisierung.tage-bis-dahin') },
    );
  if (w.art === 'zeitplan' && w.jeBenutzer) fest.push({ key: 'benutzer', label: t('gemeinsam.automatisierung.benutzer') });
  // Aus dem Ereignis (#678/#712): Personen mit Namen, Zeitraum einer Abwesenheit.
  for (const p of PERSONEN_IM_EREIGNIS[w.art] ?? []) fest.push({ key: p, label: EREIGNIS_PERSON[p] ?? p });
  if (w.art === 'zeitplan')
    return [...fest, ...(typ?.felder ?? []).filter((f) => f.typ !== 'passwort').map((f) => ({ key: f.key, label: f.label }))];
  if (w.art === 'benutzer.abwesenheit_gesetzt')
    fest.push(
      { key: 'von', label: t('gemeinsam.automatisierung.abwesend-von') },
      { key: 'bis', label: t('gemeinsam.automatisierung.abwesend-bis') },
      { key: 'zeitraum', label: t('gemeinsam.automatisierung.zeitraum-der-abwesenheit') },
    );
  return [...fest, ...(typ?.felder ?? []).filter((f) => f.typ !== 'passwort').map((f) => ({ key: f.key, label: f.label }))];
}

/* ---------- Eingaben bereinigen ---------- */

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const id = (v: unknown) => (typeof v === 'string' ? v.trim().slice(0, 80) : '');
const UHRZEIT = /^([01]\d|2[0-3]):[0-5]\d$/;

function bereinigeEmpfaenger(e: unknown): Empfaenger | null {
  const x = (e ?? {}) as Record<string, unknown>;
  if ((x.art === 'person' || x.art === 'rolle') && id(x.id)) return { art: x.art, id: id(x.id) };
  if (x.art === 'feld' && id(x.feld))
    return { art: 'feld', feld: id(x.feld), ...(x.sonst === 'ersteller' ? { sonst: 'ersteller' as const } : {}) };
  if (x.art === 'ersteller') return { art: 'ersteller' };
  if (x.art === 'ereignis' && id(x.feld)) return { art: 'ereignis', feld: id(x.feld) };
  return null;
}

function bereinigeWenn(e: unknown): WennKarte {
  const x = (e ?? {}) as Record<string, unknown>;
  // Bis 0.158: „Datum in N Tagen“ (tage) und „Frist erreicht“ – beide gehen in „Datum erreicht“ auf (#724).
  if (x.art === 'datum' || x.art === 'frist.erreicht') {
    const alt = x.vorlauf === undefined && x.tage !== undefined;
    const einheit = (!alt && typeof x.einheit === 'string' && x.einheit in VORLAUF_EINHEITEN ? x.einheit : 'tage') as VorlaufEinheit;
    const grenze = einheit === 'tage' ? 3650 : einheit === 'wochen' ? 520 : 120;
    const vorlauf = Math.max(-grenze, Math.min(grenze, Math.trunc(Number(alt ? x.tage : x.vorlauf) || 0)));
    const w = Math.trunc(Number(x.wiederholung) || 0);
    return {
      art: 'datum',
      typ: id(x.typ),
      feld: x.art === 'datum' ? id(x.feld) : '',
      vorlauf,
      einheit,
      uhrzeit: typeof x.uhrzeit === 'string' && UHRZEIT.test(x.uhrzeit) ? x.uhrzeit : '07:00',
      wiederholung: w >= 1 && w <= 120 ? w : null,
    };
  }
  if (x.art === 'zeitplan') {
    const tage = [
      ...new Set((Array.isArray(x.tage) ? x.tage : WOCHENTAGE).map(Number).filter((t) => Number.isInteger(t) && t >= 1 && t <= 7)),
    ].sort();
    const jeBenutzer = x.jeBenutzer === true;
    return {
      art: 'zeitplan',
      uhrzeit: typeof x.uhrzeit === 'string' && UHRZEIT.test(x.uhrzeit) ? x.uhrzeit : '07:00',
      tage: tage.length ? tage : [...WOCHENTAGE],
      feiertage: x.feiertage === true,
      jeBenutzer,
      ...(jeBenutzer ? { rolle: id(x.rolle) || null, profilzeit: x.profilzeit === true } : {}),
    };
  }
  // Werkbank-Karten (#677): ohne Mappentyp; „Protokollmeldung“ mit Stufe (Vorgabe Fehler), Modul und Text.
  // Aufruf von außen (#679): nur die Namen der Parameter.
  const betrieb = bereinigeBetrieb(x) ?? (x.art === 'aufruf' ? bereinigeAufruf(x) : null);
  if (betrieb) return betrieb;
  const art = (WENN_EREIGNISSE as string[]).includes(String(x.art)) ? (x.art as WennEreignis) : 'mappe.angelegt';
  const w: WennKarte = { art, typ: id(x.typ) || null };
  if (art === 'mappe.geaendert' && Array.isArray(x.felder)) w.felder = [...new Set(x.felder.map(id).filter(Boolean))].slice(0, 50);
  if (art === 'mappe.geaendert' && x.angelegt === true) w.angelegt = true;
  return w;
}

function bereinigeUnd(e: unknown, tiefe = 0): UndKarte | null {
  const x = (e ?? {}) as Record<string, unknown>;
  const nicht = x.nicht === true ? { nicht: true } : {};
  if (x.art === 'bedingung') {
    const [b] = bereinigeBedingungen([x.bedingung]);
    return b ? { art: 'bedingung', bedingung: b, ...nicht } : null;
  }
  if (x.art === 'ansicht' && id(x.sicht)) return { art: 'ansicht', sicht: id(x.sicht), ...nicht };
  if (x.art === 'favorit') {
    const v = bereinigeEmpfaenger(x.von);
    return v ? { art: 'favorit', von: v, ...nicht } : null;
  }
  if (x.art === 'gruppe' && tiefe === 0) {
    const karten = (Array.isArray(x.karten) ? x.karten : [])
      .slice(0, AUTOMATISIERUNG_GRENZEN.bedingungen)
      .map((k) => bereinigeUnd(k, 1))
      .filter((k): k is UndKarte => !!k);
    return { art: 'gruppe', modus: x.modus === 'eine' ? 'eine' : 'alle', karten, ...nicht };
  }
  return null;
}

const UND_ARTEN = ['bedingung', 'ansicht', 'favorit', 'gruppe'];

/**
 * Was `bereinigeAutomatisierung` am Und-Teil weglassen würde – je Stelle ein Text, leer = in Ordnung (#1108). Für
 * Pakete: Eine falsch geschriebene Bedingung ist dort ein Fehler, statt still wegzufallen (die Automatisierung liefe
 * sonst öfter als gedacht). Die Werkbank braucht das nicht – ihr Editor erzeugt nur gültige Karten.
 */
export function undEingabeFehler(roh: unknown): string[] {
  if (roh === undefined || roh === null) return [];
  if (typeof roh !== 'object' || Array.isArray(roh) || !Array.isArray((roh as Record<string, unknown>).karten))
    return [t('gemeinsam.bedingungspruefung.und-form')];
  return undKartenFehler(roh as Record<string, unknown>, 'und', 0);
}

function undKartenFehler(x: Record<string, unknown>, wo: string, tiefe: number): string[] {
  const karten = Array.isArray(x.karten) ? x.karten : [];
  const aus: string[] = [];
  const stelle = (teil: string, grund: string) => aus.push(t('gemeinsam.bedingungspruefung.und-stelle', { wo: teil, grund }));
  if (x.modus !== undefined && x.modus !== 'alle' && x.modus !== 'eine')
    stelle(wo, t('gemeinsam.bedingungspruefung.modus', { wert: String(x.modus) }));
  if (karten.length > AUTOMATISIERUNG_GRENZEN.bedingungen)
    stelle(wo, t('gemeinsam.bedingungspruefung.zu-viele', { max: AUTOMATISIERUNG_GRENZEN.bedingungen }));
  karten.forEach((k, i) => {
    const hier = `${wo}.karten[${i + 1}]`;
    const fehler = undKarteFehler(k, hier, tiefe);
    if (typeof fehler === 'string') stelle(hier, fehler);
    else aus.push(...fehler);
  });
  return aus;
}

function undArtFehler(c: Record<string, unknown>): string | null {
  if (c.nicht !== undefined && typeof c.nicht !== 'boolean') return t('gemeinsam.bedingungspruefung.nicht');
  if (c.art === undefined) return t('gemeinsam.bedingungspruefung.art-fehlt', { arten: UND_ARTEN.join(', ') });
  return UND_ARTEN.includes(String(c.art))
    ? null
    : t('gemeinsam.bedingungspruefung.art-unbekannt', { art: String(c.art), arten: UND_ARTEN.join(', ') });
}

/** Eine Und-Karte: ein Grund (diese Stelle), sonst die Gründe aus einer Gruppe ([] = in Ordnung). */
function undKarteFehler(k: unknown, hier: string, tiefe: number): string | string[] {
  if (!k || typeof k !== 'object' || Array.isArray(k)) return t('gemeinsam.bedingungspruefung.kein-objekt');
  const c = k as Record<string, unknown>;
  const form = undArtFehler(c);
  if (form) return form;
  if (c.art === 'bedingung') {
    const g = bedingungEingabeFehler(c.bedingung);
    return g ? t('gemeinsam.bedingungspruefung.innen', { grund: g }) : [];
  }
  if (c.art === 'ansicht') return id(c.sicht) ? [] : t('gemeinsam.bedingungspruefung.sicht-fehlt');
  if (c.art === 'favorit') return bereinigeEmpfaenger(c.von) ? [] : t('gemeinsam.bedingungspruefung.von-fehlt');
  if (tiefe > 0) return t('gemeinsam.bedingungspruefung.gruppe-in-gruppe');
  return Array.isArray(c.karten) ? undKartenFehler(c, hier, 1) : t('gemeinsam.bedingungspruefung.und-form');
}

/** „Paket nach Zeitplan ausführen“ (#1082): Paket-Id und Aufgabe nur mit gültiger Kennung, sonst leer. */
function bereinigePaketKarte(x: Record<string, unknown>, i: number): DannKarte {
  const kid = id(x.id) || `k${i + 1}`;
  const paket = id(x.paket),
    aufgabe = id(x.aufgabe);
  const werte = kartenWerteRoh(x.werte);
  return {
    id: kid,
    art: 'paket',
    paket: PAKET_ID.test(paket) ? paket : '',
    aufgabe: SCHLUESSEL.test(aufgabe) ? aufgabe : null,
    ...(Object.keys(werte).length ? { werte } : {}),
  };
}

/** „Favoriten-Änderungen melden“ (#1001): Rollen (ohne Dubletten, leer = alle) und Vorgabe nur, wenn aus. */
function bereinigeFavoriten(x: Record<string, unknown>, kid: string): DannKarte {
  const rollen = [...new Set((Array.isArray(x.rollen) ? x.rollen : []).map(id).filter(Boolean))].slice(0, 50);
  return { id: kid, art: 'favoriten', ...(rollen.length ? { rollen } : {}), ...(x.vorgabe === false ? { vorgabe: false } : {}) };
}

const OHNE_EINSTELLUNG = new Set(['stopp', 'zusammenfassung', 'sicherung']);
/** Karten mit eigener Bereinigung: Favoriten (#1001), Feld in verknüpfter Mappe (#1557). */
const EIGENE_BEREINIGUNG: Record<string, (x: Record<string, unknown>, kid: string) => DannKarte> = {
  favoriten: bereinigeFavoriten,
  feld_verknuepft: (x, kid) => bereinigeVerknuepft(x, kid, id, AUTOMATISIERUNG_GRENZEN.text),
};
function bereinigeDann(e: unknown, i: number): DannKarte | null {
  const x = (e ?? {}) as Record<string, unknown>;
  const kid = id(x.id) || `k${i + 1}`;
  // Karten ohne Einstellungen (#677: „Sicherung anstoßen“).
  if (OHNE_EINSTELLUNG.has(String(x.art))) return { id: kid, art: x.art as 'stopp' | 'zusammenfassung' | 'sicherung' };
  const eigen = EIGENE_BEREINIGUNG[String(x.art)];
  if (eigen) return eigen(x, kid);
  // Nach außen (#671).
  if (istAussenKarte({ art: String(x.art) })) return bereinigeAussen(x, kid, bereinigeEmpfaenger);
  if (x.art === 'anmeldeschutz') return { id: kid, art: 'anmeldeschutz', was: x.was === 'konto' ? 'konto' : 'sammel' };
  if (x.art === 'feld') {
    const w = x.werte && typeof x.werte === 'object' && !Array.isArray(x.werte) ? (x.werte as Record<string, unknown>) : {};
    return {
      id: kid,
      art: 'feld',
      werte: Object.fromEntries(
        Object.entries(w)
          .slice(0, 50)
          .map(([k, v]) => [id(k), typeof v === 'string' ? v.slice(0, AUTOMATISIERUNG_GRENZEN.text) : v])
          .filter(([k]) => k),
      ),
    };
  }
  if (x.art === 'aufgabe') {
    const empfaenger = (Array.isArray(x.empfaenger) ? x.empfaenger : [])
      .slice(0, 20)
      .map(bereinigeEmpfaenger)
      .filter((v): v is Empfaenger => !!v);
    const faellig =
      x.faellig === null || x.faellig === undefined || x.faellig === ''
        ? null
        : Math.max(0, Math.min(3650, Math.trunc(Number(x.faellig) || 0)));
    return {
      id: kid,
      art: 'aufgabe',
      empfaenger,
      text: text(x.text, AUTOMATISIERUNG_GRENZEN.text),
      als: x.als === 'benachrichtigung' ? 'benachrichtigung' : 'aufgabe',
      faellig: x.als === 'benachrichtigung' ? null : faellig,
    };
  }
  return null;
}

const istPaketKarte = (e: unknown): e is Record<string, unknown> =>
  !!e && typeof e === 'object' && (e as Record<string, unknown>).art === 'paket';
const dannListe = (e: unknown) =>
  (Array.isArray(e) ? e : [])
    .slice(0, AUTOMATISIERUNG_GRENZEN.karten)
    .map((k, i) => (istPaketKarte(k) ? bereinigePaketKarte(k, i) : bereinigeDann(k, i)))
    .filter((k): k is DannKarte => !!k)
    // Eindeutige Ids je Karte (Verlauf, Live-Fortschritt).
    .map((k, i, alle) => (alle.findIndex((x) => x.id === k.id) === i ? k : { ...k, id: `${k.id}-${i + 1}` }));

export function bereinigeAutomatisierung(e: unknown): AutomatisierungDaten {
  const x = (e ?? {}) as Record<string, unknown>;
  const und = (x.und ?? {}) as Record<string, unknown>;
  const r = Math.trunc(Number(x.reihenfolge));
  return {
    name: text(x.name, AUTOMATISIERUNG_GRENZEN.name),
    beschreibung: text(x.beschreibung, AUTOMATISIERUNG_GRENZEN.text),
    reihenfolge: Number.isFinite(r) ? Math.max(REIHENFOLGE.min, Math.min(REIHENFOLGE.max, r)) : REIHENFOLGE.eigen,
    wenn: bereinigeWenn(x.wenn),
    und: {
      modus: und.modus === 'eine' ? 'eine' : 'alle',
      karten: (Array.isArray(und.karten) ? und.karten : [])
        .slice(0, AUTOMATISIERUNG_GRENZEN.bedingungen)
        .map((k) => bereinigeUnd(k))
        .filter((k): k is UndKarte => !!k),
    },
    dann: dannListe(x.dann),
    sonst: dannListe(x.sonst),
  };
}

/* ---------- Prüfen ---------- */

const feldIn = (typ: Mappentyp | null, key: string): Feld | undefined => typ?.felder.find((f) => f.key === key);

function empfaengerProblem(e: Empfaenger, typ: Mappentyp | null, k: Kontextdaten): string | null {
  if (e.art === 'person') {
    const b = k.benutzer.find((x) => x.id === e.id);
    return !b
      ? t('gemeinsam.automatisierung.diese-person-gibt-es')
      : b.aktiv === false
        ? t('gemeinsam.automatisierung.ist-deaktiviert', { name: b.name })
        : null;
  }
  if (e.art === 'rolle') return k.rollen.some((x) => x.id === e.id) ? null : t('gemeinsam.automatisierung.diese-rolle-gibt-es');
  if (e.art === 'ersteller') return null;
  // Person aus dem Ereignis: fehlt sie im einzelnen Ereignis, gibt es eben nichts zu tun (kein Fehler).
  if (e.art === 'ereignis') return null;
  const f = feldIn(typ, e.feld);
  if (!f) return t('gemeinsam.automatisierung.das-feld-gibt-es', { feld: e.feld });
  const benutzerTyp = k.typen.find((t) => t.system === 'benutzer');
  return f.typ === 'referenz' && ((!zieleVon(f).length && !jedeMappe(f)) || einzigesZiel(f) === benutzerTyp?.id)
    ? null
    : t('gemeinsam.automatisierung.verweist-nicht-auf-benutzer', { label: f.label });
}

function undProbleme(u: UndKarte, typ: Mappentyp | null, k: Kontextdaten): string[] {
  if (u.art === 'gruppe') return u.karten.flatMap((x) => undProbleme(x, typ, k));
  if (u.art === 'ansicht') return k.sichten.some((s) => s.id === u.sicht) ? [] : [t('gemeinsam.automatisierung.die-ansicht-der-bedingung')];
  if (u.art === 'favorit') {
    const p = empfaengerProblem(u.von, typ, k);
    return p ? [p] : [];
  }
  // Merkmal der Ablage (#1032): braucht weder Mappentyp noch Mappe.
  if (u.bedingung.art === 'merkmal') {
    const p = bedingungsProblem(u.bedingung, []);
    return p ? [p] : [];
  }
  if (!typ) return [t('gemeinsam.automatisierung.bedingungen-auf-felder-brauchen')];
  const p = bedingungsProblem(u.bedingung, [typ]);
  return p ? [p] : [];
}

/** Wo ein Problem steht – der Bereich im Editor (#1000): Grunddaten, Wenn (mit den Und-Bedingungen) oder Dann. */
export type AutomatisierungOrt = 'grunddaten' | 'wenn' | 'dann';

/** Was nicht (mehr) passt – leer, wenn die Automatisierung laufen kann. */
export function automatisierungsProbleme(a: AutomatisierungDaten, k: Kontextdaten): string[] {
  return [...new Set(automatisierungsProblemOrte(a, k).map((x) => x.text))];
}

/**
 * Verwaist (#1586): mitgeliefert, aber ihr Paket ist nicht (mehr) installiert oder sie passt nicht mehr (etwa fehlt der
 * Mappentyp der Wenn-Karte). Eine verwaiste lässt sich wie eine eigene löschen – sonst bliebe sie eine Sackgasse.
 */
export function istVerwaist(a: Pick<Automatisierung, 'herkunft' | 'paketId'>, probleme: readonly string[], pakete?: Array<{ id: string }>) {
  return a.herkunft === 'paket' && (probleme.length > 0 || (!!pakete && !pakete.some((p) => p.id === a.paketId)));
}

/** Probleme samt Bereich im Editor (#1000) – so öffnet ein Fehler seinen Bereich. */
export function automatisierungsProblemOrte(a: AutomatisierungDaten, k: Kontextdaten): Array<{ ort: AutomatisierungOrt; text: string }> {
  const erg: Array<{ ort: AutomatisierungOrt; text: string }> = [];
  let ort: AutomatisierungOrt = 'grunddaten';
  const p = {
    push: (...x: string[]) => {
      for (const text of x) erg.push({ ort, text });
    },
  };
  if (!a.name) p.push(t('gemeinsam.automatisierung.bitte-einen-namen-angeben'));
  ort = 'wenn';
  const w = a.wenn;
  const typ = kontextTyp(w, k.typen);
  if (w.art === 'datum') {
    if (!typ) p.push(t('gemeinsam.automatisierung.den-mappentyp-der-wenn'));
    else if (!w.feld) p.push(t('gemeinsam.automatisierung.datum-erreicht-bitte-ein'));
    else if (feldIn(typ, w.feld)?.typ !== 'datum')
      p.push(t('gemeinsam.automatisierung.das-datumsfeld-gibt-es', { feld: w.feld, name: typ.name }));
  } else if (w.art === 'zeitplan') {
    if (w.jeBenutzer && w.rolle && !k.rollen.some((r) => r.id === w.rolle)) p.push(t('gemeinsam.automatisierung.die-rolle-der-zeitplan'));
  } else if (istBetrieb(w) || istAufruf(w)) p.push(...betriebProbleme(a));
  else if (w.typ && !typ) p.push(t('gemeinsam.automatisierung.den-mappentyp-der-wenn'));
  else if (w.felder?.length && typ)
    for (const f of w.felder) if (!feldIn(typ, f)) p.push(t('gemeinsam.automatisierung.das-feld-gibt-es-2', { f, name: typ.name }));
  if (!istBetrieb(w) && !istAufruf(w)) for (const u of a.und.karten) p.push(...undProbleme(u, typ, k));
  ort = 'dann';
  if (!a.dann.length) p.push(t('gemeinsam.automatisierung.bitte-mindestens-eine-dann'));
  for (const d of [...a.dann, ...a.sonst]) {
    if (d.art === 'feld') {
      if (!typ) p.push(t('gemeinsam.automatisierung.feld-aendern-braucht-einen'));
      else if (!Object.keys(d.werte).length) p.push(t('gemeinsam.automatisierung.feld-aendern-bitte-mindestens'));
      else
        for (const key of Object.keys(d.werte)) {
          const f = feldIn(typ, key);
          if (!f) p.push(t('gemeinsam.automatisierung.feld-aendern-das-feld', { key, name: typ.name }));
          else if (f.typ === 'passwort') p.push(t('gemeinsam.automatisierung.feld-aendern-passwortfelder-setzt', { label: f.label }));
          // Berechnete Felder (#1034, „nie überschreiben“): schreibt nur ihr Paket – der Server lehnt es ohnehin ab.
          else if (f.berechnetVon) p.push(t('gemeinsam.automatisierung.feld-aendern-berechnet', { label: f.label }));
        }
    }
    if (d.art === 'feld_verknuepft') p.push(...verknuepftProbleme(d, typ, k.typen));
    if (d.art === 'zusammenfassung' && !(w.art === 'zeitplan' && w.jeBenutzer))
      p.push(t('gemeinsam.automatisierung.taegliche-zusammenfassung-senden'));
    if (d.art === 'favoriten' && w.art !== 'favorit.geaendert') p.push(t('gemeinsam.automatisierung.favoriten-aenderungen-melden-braucht'));
    if (d.art === 'favoriten' && d.rollen?.some((r) => !k.rollen.some((x) => x.id === r)))
      p.push(t('gemeinsam.automatisierung.favoriten-rolle-fehlt'));
    if (d.art === 'anmeldeschutz' && d.was === 'sammel' && !(w.art === 'zeitplan' && !w.jeBenutzer))
      p.push(t('gemeinsam.automatisierung.sammelmeldung-anmeldeschutz-braucht'));
    if (d.art === 'anmeldeschutz' && d.was === 'konto' && w.art !== 'benutzer.gesperrt')
      p.push(t('gemeinsam.automatisierung.kontosperre-melden-braucht-die'));
    // #1082: Ein entferntes Paket ist kein Problem (die Karte läuft ins Leere, s. paketKarteLeer) – nur Wenn-Karte und Wahl.
    if (d.art === 'paket' && !zeitplanFuerPaket(w)) p.push(t('gemeinsam.automatisierung.paket-braucht-zeitplan'));
    if (d.art === 'paket' && !d.paket) p.push(t('gemeinsam.automatisierung.paket-waehlen'));
    // Nach außen (#671): Ziel freigegeben, Inhaltsstufe passt zu Methode und Platzhaltern; E-Mail mit gültigem „An“.
    p.push(...aussenProbleme(d, w, typ, k.ziele, (e) => empfaengerProblem(e, typ, k)));
    if (d.art === 'aufgabe') {
      if (!d.text) p.push(t('gemeinsam.automatisierung.aufgabe-bitte-beschreiben-was'));
      if (!d.empfaenger.length) p.push(t('gemeinsam.automatisierung.aufgabe-bitte-mindestens-einen'));
      for (const e of d.empfaenger) {
        const x = empfaengerProblem(e, typ, k);
        if (x) p.push(`„Aufgabe“: ${x}`);
      }
    }
  }
  return erg;
}

/* ---------- Kurzform ---------- */

const NAMEN: Record<string, string> = {
  'mappe.angelegt': 'angelegt',
  'mappe.geaendert': 'gespeichert',
  'mappe.verknuepft': 'verknüpft',
  'dokument.hochgeladen': t('gemeinsam.automatisierung.dokument-hochgeladen'),
  'mappe.notiz': t('gemeinsam.automatisierung.notiz-hinzugefuegt'),
  'mappe.geloescht': 'gelöscht',
  'mappe.geloescht_verknuepft': t('gemeinsam.automatisierung.mit-verknuepften-geloescht'),
  'mappe.endgueltig_geloescht': t('gemeinsam.automatisierung.endgueltig-geloescht'),
  'mappe.wiederhergestellt': 'wiederhergestellt',
  'frist.erreicht': t('gemeinsam.automatisierung.frist-erreicht'),
};

/** „Wenn Vertrag gespeichert → Aufgabe an Verantwortlich“. */
export function kurzform(
  a: AutomatisierungDaten,
  k: Pick<Kontextdaten, 'typen' | 'benutzer' | 'rollen' | 'pakete'>,
  ereignisName: (art: string) => string = (x) => NAMEN[x] ?? x,
): string {
  const typ = kontextTyp(a.wenn, k.typen);
  const dann = zweigeKurz(a, (d) => dannText(d, typ, k));
  return t('gemeinsam.automatisierung.wenn', {
    wenn: wennText(a.wenn, k, ereignisName),
    wert: a.und.karten.length ? ` und ${t('gemeinsam.automatisierung.bedingungen', { anzahl: a.und.karten.length })}` : '',
    wert2: dann || '…',
  });
}

/** Der Wenn-Teil der Kurzform, z. B. „Vertrag angelegt“ – auch für die Fassungen (#1006). */
export function wennText(
  w: WennKarte,
  k: Pick<Kontextdaten, 'typen' | 'rollen'>,
  ereignisName: (art: string) => string = (x) => NAMEN[x] ?? x,
): string {
  const typ = kontextTyp(w, k.typen);
  return w.art === 'datum'
    ? `${typ?.name ?? '?'}: ${feldIn(typ, w.feld)?.label ?? (w.feld || '?')} ${vorlaufText(w.vorlauf, w.einheit)}`
    : istBetrieb(w)
      ? betriebKurz(w, ereignisName)
      : istAufruf(w)
        ? aufrufKurz(w)
        : w.art === 'zeitplan'
          ? `${zeitplanText(w)}${w.jeBenutzer ? t('gemeinsam.automatisierung.fuer-jeden-benutzer', { wert: w.rolle ? t('gemeinsam.automatisierung.der-rolle', { wert: k.rollen.find((r) => r.id === w.rolle)?.name ?? '?' }) : '' }) : ''}`
          : `${typ && EREIGNISKATALOG[w.art].gruppe !== 'benutzer' ? `${typ.name} ` : ''}${w.art === 'mappe.geaendert' && w.angelegt ? t('gemeinsam.automatisierung.angelegt-oder', { wert: ereignisName(w.art) }) : ereignisName(w.art)}`;
}

const istFeldKarte = (d: DannKarte): d is Extract<DannKarte, { art: 'feld' | 'feld_verknuepft' }> =>
  d.art === 'feld' || d.art === 'feld_verknuepft';
/** „Feld ändern“ bzw. „Feld in verknüpfter Mappe setzen“ (#1557) kurz. */
function feldKarteText(d: Extract<DannKarte, { art: 'feld' | 'feld_verknuepft' }>, typ: Mappentyp | null, typen: Mappentyp[] = []) {
  if (d.art === 'feld_verknuepft') return verknuepftKurz(d, typ, typen);
  return `${Object.keys(d.werte)
    .map((x) => feldIn(typ, x)?.label ?? x)
    .join(', ')} setzen`;
}

/** Eine Dann- oder Sonst-Karte kurz, z. B. „Aufgabe an Markus“ – Kurzform und Fassungen (#1006). */
export function dannText(
  d: DannKarte,
  typ: Mappentyp | null,
  k: Pick<Kontextdaten, 'benutzer' | 'rollen' | 'pakete'> & Partial<Pick<Kontextdaten, 'typen'>>,
): string {
  const wer = (e: Empfaenger) =>
    e.art === 'person'
      ? (k.benutzer.find((b) => b.id === e.id)?.name ?? '?')
      : e.art === 'rolle'
        ? (k.rollen.find((r) => r.id === e.id)?.name ?? '?')
        : e.art === 'ersteller'
          ? 'Ersteller'
          : e.art === 'ereignis'
            ? (EREIGNIS_PERSON[e.feld] ?? e.feld)
            : (feldIn(typ, e.feld)?.label ?? e.feld);
  return d.art === 'stopp'
    ? t('gemeinsam.automatisierung.danach-keine-weiteren')
    : d.art === 'zusammenfassung'
      ? t('gemeinsam.automatisierung.taegliche-zusammenfassung-senden-2')
      : d.art === 'favoriten'
        ? d.rollen?.length
          ? t('gemeinsam.automatisierung.favoriten-aenderungen-melden-an', {
              rollen: d.rollen.map((r) => k.rollen.find((x) => x.id === r)?.name ?? '?').join(', '),
            })
          : t('gemeinsam.automatisierung.favoriten-aenderungen-melden')
        : d.art === 'anmeldeschutz'
          ? d.was === 'sammel'
            ? t('gemeinsam.automatisierung.sammelmeldung-anmeldeschutz-senden')
            : t('gemeinsam.automatisierung.kontosperre-an-administratoren')
          : d.art === 'sicherung'
            ? t('gemeinsam.automatisierung.sicherung-anstossen')
            : d.art === 'url' || d.art === 'email'
              ? aussenKurz(d, wer)
              : d.art === 'paket'
                ? t('gemeinsam.automatisierung.paket-ausfuehren', {
                    name: k.pakete?.find((x) => x.id === d.paket)?.name ?? (d.paket || '?'),
                    wert: d.aufgabe ? ` (${aufgabeName(d.paket, d.aufgabe, k.pakete)})` : '',
                  })
                : istFeldKarte(d)
                  ? feldKarteText(d, typ, k.typen)
                  : `${d.als === 'aufgabe' ? 'Aufgabe' : 'Benachrichtigung'} an ${d.empfaenger.map(wer).join(', ') || '?'}`;
}

/** Dann und Sonst kurz (#677): „Aufgabe an Petra; sonst Benachrichtigung an Jonas“. */
function zweigeKurz(a: Pick<AutomatisierungDaten, 'dann' | 'sonst'>, karte: (d: DannKarte) => string): string {
  const sonst = a.sonst.length ? [t('gemeinsam.automatisierung.sonst', { karten: a.sonst.map(karte).join(', ') })] : [];
  return [a.dann.map(karte).join(', '), ...sonst].filter(Boolean).join('; ');
}

const TAG_KURZ = ['', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
/** „werktags um 07:00“, „Mo, Mi um 18:30“, „täglich um 07:00 (nicht an Feiertagen)“; mit Profilzeit: „zur Uhrzeit im Profil“. */
export function zeitplanText(w: Extract<WennKarte, { art: 'zeitplan' }>): string {
  if (w.jeBenutzer && w.profilzeit) return t('gemeinsam.automatisierung.zur-uhrzeit-im-profil');
  const text2 = w.tage.join('');
  const tage = text2 === '1234567' ? 'täglich' : text2 === '12345' ? 'werktags' : w.tage.map((x) => TAG_KURZ[x]).join(', ');
  return t('gemeinsam.automatisierung.um', {
    tage,
    uhrzeit: w.uhrzeit,
    wert: w.feiertage ? t('gemeinsam.automatisierung.nicht-an-feiertagen') : '',
  });
}
