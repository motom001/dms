/**
 * Werte als Text (#1278, vorher `shared/src/model.ts`): leere Werte, Titel und Platzhalter, Register, Grenzen für
 * Dateien und Auswahl, Werte formatieren und lesen, freie Schlüssel.
 */
import { istPasswortWert, type Betrag, type Mappe, type Werte, type Wert } from './mappe';
import { hatZeitraumform, istZeitraum, zeitraumText, prozentText } from '../feldarten';
import { PLATZHALTER_MIT_FILTERN, wendeFilterAn, liesFilter, LEER, ohneLeereTeile, pruefeFilter } from '../titelfilter';
import { t } from '../texte';
import { datumsformat, zahlformat } from '../region';
import { gebietsschema } from '../sprache';
import type { Mappentyp, Register } from './mappentyp';
import type { Feld } from './felder';
import { optionText } from '../beschriftung';
import { alsText } from '../markdown';
import { ibanGruppen } from '../feldformate';

export function istLeer(v: unknown): boolean {
  if (v == null || v === '') return true;
  if (Array.isArray(v)) return v.length === 0;
  if (istPasswortWert(v)) return !!v.entfernen || (!v.gesetzt && !v.neu);
  if (typeof v === 'object' && 'betrag' in (v as object)) {
    const b = (v as Betrag).betrag;
    return b == null || (b as unknown) === '';
  }
  // Zeitraum (#1035): ohne Anzahl leer, auch wenn eine Einheit gewählt ist.
  if (hatZeitraumform(v)) return v.anzahl == null || v.anzahl === '';
  return false;
}

/** Platzhalter `{feld}` bzw. `{feld|filter…}` (#170). */
const PLATZHALTER = PLATZHALTER_MIT_FILTERN;

/** Feste Indexwerte, die jede Titel-Vorlage zusätzlich zu den Feldern verwenden kann. */
export const INDEXPLATZHALTER = { angelegt: t('gemeinsam.model.index.angelegt'), geaendert: t('gemeinsam.model.index.geaendert') } as const;
export type Indexplatzhalter = keyof typeof INDEXPLATZHALTER;
export const istIndexplatzhalter = (k: string): k is Indexplatzhalter => Object.prototype.hasOwnProperty.call(INDEXPLATZHALTER, k);
export type Indexwerte = Partial<Pick<Mappe, 'erstellt' | 'geaendert'>>;

/** Betreff einer fotografierten Post (#490): „Post vom 01.11.2026, 20:52“ statt des Dateinamens „image“. */
export function fotoBetreff(d: Date = new Date()): string {
  return t('gemeinsam.model.foto-betreff', {
    zeit: datumsformat(gebietsschema(), { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(
      d,
    ),
  });
}
const TAG_FORMAT = () => datumsformat(gebietsschema(), { day: '2-digit', month: '2-digit', year: 'numeric' });

/** Tag eines Zeitstempels als TT.MM.JJJJ in der Zeitzone des Haushalts. */
export function tagVon(zeitstempel: string | undefined): string {
  if (!zeitstempel) return '';
  const d = new Date(zeitstempel);
  return Number.isNaN(d.getTime()) ? '' : TAG_FORMAT().format(d);
}

/** Feldschlüssel, die eine Titel-Vorlage verwendet. */
export function vorlageFelder(vorlage: string): string[] {
  return [...vorlage.matchAll(PLATZHALTER)].map((m) => m[1]);
}

/** Wirksame Vorlage: die eingestellte oder das erste Textfeld. */
export function wirksameVorlage(t: Pick<Mappentyp, 'felder' | 'titelVorlage'>): string {
  if (t.titelVorlage?.trim()) return t.titelVorlage;
  const f = t.felder.find((x) => x.typ === 'text');
  return f ? `{${f.key}}` : '';
}

/**
 * Textfeld, aus dem ein Verweisfeld nach einem Paket-Update gefüllt wird (#534): nur Text oder Langtext
 * desselben Mappentyps; sonst undefined.
 */
export function altesTextfeldVon(t: Pick<Mappentyp, 'felder'>, f: Feld): Feld | undefined {
  if (f.typ !== 'referenz' || !f.ausText || f.ausText === f.key) return undefined;
  const alt = t.felder.find((x) => x.key === f.ausText);
  return alt && (alt.typ === 'text' || alt.typ === 'langtext') ? alt : undefined;
}

/** Ist dieses Feld das alte Textfeld eines Verweisfelds (#534)? Dann das Verweisfeld. */
export function verweisAusText(t: Pick<Mappentyp, 'felder'>, f: Feld): Feld | undefined {
  return t.felder.find((x) => x.key !== f.key && altesTextfeldVon(t, x)?.key === f.key);
}

/**
 * Titel einer Mappe aus der Vorlage; Platzhalter werden formatiert eingesetzt. Deaktivierte Benutzer behalten
 * ihren Namen (#663) – „deaktiviert“ ist ein Zustand (`aktiv`), den die Oberfläche durchgestrichen zeigt.
 */
export function titelAus(
  t: (Pick<Mappentyp, 'felder' | 'titelVorlage'> & Pick<Partial<Mappentyp>, 'system'>) | undefined,
  werte: Werte,
  titelVon: (id: string) => string = (id) => id,
  index: Indexwerte = {},
): string {
  if (!t) return '';
  return titelAusVorlage(t, werte, titelVon, index);
}

function titelAusVorlage(
  t: Pick<Mappentyp, 'felder' | 'titelVorlage'>,
  werte: Werte,
  titelVon: (id: string) => string,
  index: Indexwerte,
): string {
  return setzeEin(wirksameVorlage(t), t, werte, titelVon, index);
}

/**
 * Text eines zusammengesetzten Felds (#1050) für eine Person: die Vorlage mit den formatierten Werten, Verweise mit dem
 * Titel aus `titelVon` – der Aufrufer reicht nur Titel herein, die die Person sehen darf (sonst „(nicht sichtbar)“).
 * Gespeichert ist der Schlüssel mit den Kennungen (zusammengesetzt.ts); dieser Text wird nie gespeichert.
 */
export function zusammengesetztText(
  felder: readonly Feld[],
  f: Pick<Feld, 'vorlage'>,
  werte: Werte,
  titelVon: (id: string) => string = (id) => id,
): string {
  return setzeEin(f.vorlage ?? '', { felder: felder.filter((x) => x.typ !== 'zusammengesetzt') as Feld[] }, werte, titelVon, {});
}

/** Vorlage mit Platzhaltern und Filtern (#170) einsetzen – für Titel und zusammengesetzte Felder (#1050). */
function setzeEin(
  vorlage: string,
  t: Pick<Mappentyp, 'felder'>,
  werte: Werte,
  titelVon: (id: string) => string,
  index: Indexwerte,
): string {
  const ersetzt = vorlage.replace(PLATZHALTER, (_, k: string, kette: string) => {
    let text = '';
    let roh: unknown;
    let art: string | undefined;
    if (k === 'angelegt' || k === 'geaendert') {
      const z = k === 'angelegt' ? index.erstellt : index.geaendert;
      text = tagVon(z);
      roh = z ? isoTag(z) : undefined;
      art = 'datum';
    } else {
      const f = t.felder.find((x) => x.key === k);
      // Passwörter nie im Titel – auch nicht, wenn eine ältere Vorlage sie noch nennt.
      // Zusammengesetzt (#1050): der Text aus seinen Teilen – Verweise mit Titel wie ein Verweis im Titel.
      if (f && f.typ === 'zusammengesetzt') {
        text = zusammengesetztText(t.felder, f, werte, titelVon);
        roh = text;
        art = 'text';
      } else if (f && f.typ !== 'passwort') {
        text = formatiere(f, werte[k], titelVon);
        roh = werte[k];
        art = f.typ;
      }
      // Verweis noch leer, alter Text da (#534): bis zur Umwandlung zählt der Text.
      const alt = f ? altesTextfeldVon(t, f) : undefined;
      if (alt && istLeer(werte[k]) && !istLeer(werte[alt.key])) {
        text = formatiere(alt, werte[alt.key], titelVon);
        roh = werte[alt.key];
        art = alt.typ;
      }
    }
    const mitFiltern = wendeFilterAn(text, roh, art, liesFilter(kette));
    // Leere Teile fallen samt Trenner weg („Strom –  – 2026“ wird „Strom – 2026“).
    return mitFiltern.trim() ? mitFiltern : LEER;
  });
  return ohneLeereTeile(ersetzt).replace(/\s+/g, ' ').trim();
}

/** Zeitstempel → „JJJJ-MM-TT“ in der Zeitzone des Haushalts (für Datumsfilter an angelegt/geaendert). */
function isoTag(zeitstempel: string): string {
  const d = new Date(zeitstempel);
  if (Number.isNaN(d.getTime())) return '';
  const teile = Object.fromEntries(
    datumsformat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  return `${teile.year}-${teile.month}-${teile.day}`;
}

/** Fehler in den Filtern der Titel-Vorlage (#170). */
export function pruefeTitelFilter(t: Pick<Mappentyp, 'felder' | 'titelVorlage'>): string[] {
  const m: string[] = [];
  for (const x of (t.titelVorlage ?? '').matchAll(PLATZHALTER)) {
    const art = istIndexplatzhalter(x[1]) ? 'datum' : t.felder.find((f) => f.key === x[1])?.typ;
    m.push(...pruefeFilter(x[1], x[2] ?? '', art));
  }
  return m;
}

/** Namen der Register, die Ablago selbst anlegt (#728: aus der Sprachdatei; gespeichert wie jeder andere Name). */
export const REGISTERNAMEN = {
  allgemein: t('gemeinsam.model.register.allgemein'),
  dokumente: t('gemeinsam.model.register.dokumente'),
  verknuepfungen: t('gemeinsam.model.register.verknuepfungen'),
  historie: t('gemeinsam.model.register.historie'),
  benutzer: t('gemeinsam.model.register.benutzer'),
} as const;

/** Register für einen neuen oder alten Mappentyp ohne Register. */
export function standardRegister(felder: Feld[]): Register[] {
  return [
    { key: 'allgemein', name: REGISTERNAMEN.allgemein, art: 'felder', felder: felder.map((f) => f.key) },
    { key: 'dokumente', name: REGISTERNAMEN.dokumente, art: 'dokumente' },
    { key: 'verknuepfungen', name: REGISTERNAMEN.verknuepfungen, art: 'verknuepfungen', quellen: [] },
  ];
}
export const MAX_DATEIGROESSE = 100 * 1024 * 1024;
/** Höchstens so viele Mappen in einer Auswahl (#149). */
export const MAX_AUSWAHL = 5000;

/**
 * Wert lesbar formatieren – in der Sprache des Benutzers (#729; Auswahl als Beschriftung, #728). `titelVon` löst Referenzen
 * auf. Zusammengesetzte Felder (#1050) brauchen `mappe` (Felder des Typs und Werte der Mappe) – ohne sie bleibt der Text
 * leer; nie erscheint der gespeicherte Schlüssel mit Kennungen.
 */
export function formatiere(
  f: Feld,
  v: Wert | undefined,
  titelVon: (id: string) => string = (id) => id,
  mappe?: { felder: readonly Feld[]; werte: Werte },
): string {
  if (f.typ === 'zusammengesetzt') return mappe ? zusammengesetztText(mappe.felder, f, mappe.werte, titelVon) : '';
  if (v == null || v === '') return '';
  switch (f.typ) {
    case 'betrag': {
      const b = v as Betrag;
      if (typeof b.betrag !== 'number') return '';
      try {
        return zahlformat(gebietsschema(), { style: 'currency', currency: b.waehrung || 'EUR' }).format(b.betrag);
      } catch {
        return `${b.betrag.toLocaleString(gebietsschema(), { minimumFractionDigits: 2 })} ${b.waehrung}`;
      }
    }
    case 'datum': {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v));
      return m
        ? datumsformat(gebietsschema(), { day: '2-digit', month: '2-digit', year: 'numeric' }, 'UTC').format(
            new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])),
          )
        : String(v);
    }
    case 'janein':
      return v ? t('gemeinsam.model.ja') : t('gemeinsam.model.nein');
    case 'zahl':
      return typeof v === 'number' ? zahlformat(gebietsschema(), { maximumFractionDigits: f.nachkomma ?? 10 }).format(v) : String(v);
    // Zeitraum und Prozent (#1035): „3 Monate“, „19 %“.
    case 'zeitraum':
      return istZeitraum(v) ? zeitraumText(v) : '';
    case 'prozent':
      return typeof v === 'number' ? prozentText(v, f.nachkomma) : String(v);
    // Fester Wert → Beschriftung in der Sprache des Benutzers (#728); gespeichert bleibt der Wert.
    case 'auswahl':
      return (Array.isArray(v) ? v : [v]).map((x) => optionText(f, String(x))).join(', ');
    case 'referenz':
      return (Array.isArray(v) ? v : [String(v)]).map(titelVon).join(', ');
    case 'passwort':
      return istPasswortWert(v) && !v.gesetzt && !v.neu ? '' : '••••••••';
    // Tabelle (#1030): kein eigener Wert.
    case 'tabelle':
      return '';
    case 'formatiert':
      return alsText(String(v));
    // IBAN in Vierergruppen (#535), auch gespeicherte ohne Leerzeichen.
    case 'text':
      return f.format === 'iban' && typeof v === 'string' && /^[A-Za-z]{2}\d{2}[A-Za-z0-9 ]+$/.test(v.trim()) ? ibanGruppen(v) : String(v);
    default:
      return String(v);
  }
}

/** Zahl aus deutscher oder technischer Schreibweise lesen. null = leer, NaN = ungültig. */
export function leseZahl(s: unknown): number | null {
  if (s == null) return null;
  if (typeof s === 'number') return s;
  // Auch mit Minuszeichen (U+2212), wie Ablago negative Beträge zeigt (#1035).
  let t = String(s)
    .trim()
    .replace(/\s/g, '')
    .replace(/\u2212/g, '-');
  if (t === '') return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  const n = Number(t);
  return Number.isNaN(n) ? NaN : n;
}

/** Schlüssel aus einer Bezeichnung ableiten: „Kündigung bis“ → kuendigung_bis. */
/** Ein Schlüssel, den es unter `vergeben` noch nicht gibt: „rechnung“, sonst „rechnung_2“ … */
export function freierSchluessel(basis: string, vergeben: Iterable<string>): string {
  const belegt = new Set(vergeben);
  const b = schluesselAus(basis);
  let k = b;
  let n = 2;
  while (belegt.has(k)) k = `${b.slice(0, 36)}_${n++}`;
  return k;
}

export function schluesselAus(label: string): string {
  let k = String(label || '')
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!k) k = 'feld';
  if (/^[0-9]/.test(k)) k = 'f_' + k;
  return k.slice(0, 40);
}
