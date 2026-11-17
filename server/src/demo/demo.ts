import { randomUUID } from 'node:crypto';
import { grenzeAlsTag, ibanGruppen, pruefeFormate } from '../../../shared/src/feldformate';
import { setzeZusammengesetzte } from '../../../shared/src/zusammengesetzt';
import {
  formatiere,
  istOk,
  pruefeMappe,
  titelAus,
  verweiseVon,
  zieleVon,
  type Feld,
  type Mappentyp,
  type Wert,
  type Werte,
} from '../../../shared/src/model';
import type { Zeitraum } from '../../../shared/src/feldarten';
import {
  dokumentRegister,
  MAX_DEMO,
  MAX_DEMO_DOKUMENTE,
  mengenWarnung,
  nichtErzeugbar,
  pflichtGrund,
  schaetzeMenge,
  verteilung,
  type NichtErzeugbar,
} from '../../../shared/src/demodaten';
import {
  DOKUMENTARTEN,
  erzeugeDokument,
  kannRastern,
  pruefeDokumentOptionen,
  type Abschaetzung,
  type DokumentOptionen,
  type Dokumentart,
  type MappenInhalt,
} from './demo-dokumente';
import { NACHNAMEN, ORTE, STRASSEN, VORNAMEN } from './demo-text';
import type { PhasenPlan } from '../prozesse/auftrag';
import type { Dienst } from '../dienst/dienst';
import { Fachfehler } from '../grundlagen/fehler';
import type { NeueMappe } from '../repo';
import { Zufall } from './zufall';
import { DEMO_PLATZ_PRUEFEN, DEMO_VORRAT_MAX, GB } from '../grundlagen/grenzen';

/**
 * Erzeugt Demo-Mappen für die vorhandenen Mappentypen. Die Werte passen zu
 * Datentyp und Eigenschaften der Felder; Referenzen zeigen auf vorhandene
 * Mappen. Alles wird als Demo gekennzeichnet und lässt sich wieder entfernen.
 *
 * Wachstumstests (#248): bis 50.000 Mappen je Lauf, wahlweise mit erzeugten Dokumenten
 * (demo-dokumente.ts), mit Startwert wiederholbar. Vorhandene Mappen werden nur schlank
 * geladen (Id, Typ, Titel; Werte nur für eindeutige Felder).
 */
export { MAX_DEMO };

// Zufall des laufenden Auftrags (mit Startwert). Es läuft immer nur ein Auftrag (Auftraege).
let z = new Zufall();
const zufall = (n: number) => z.int(n);
const eins = <T>(a: readonly T[]): T => z.eins(a);
const zwischen = (min: number, max: number) => z.zwischen(min, max);
const BRANCHEN = [
  'Heizungsbau',
  'Elektrotechnik',
  'Sanitär',
  'Dachdeckerei',
  'Autohaus',
  'Versicherungsmakler',
  'Steuerberatung',
  'Stadtwerke',
  'Gartenbau',
  'Malerbetrieb',
  'Zahnarztpraxis',
  'Tischlerei',
  'Energieversorgung',
  'Telekommunikation',
  'Hausverwaltung',
];
const FORMEN = ['GmbH', 'GmbH & Co. KG', 'AG', 'e. K.', 'OHG', ''];
const DINGE = [
  'Strom',
  'Gas',
  'Wasser',
  'Internet',
  'Mobilfunk',
  'Kfz-Versicherung',
  'Hausrat',
  'Haftpflicht',
  'Wartung Heizung',
  'Fitnessstudio',
  'Zeitung',
  'Streaming',
  'Wohngebäude',
  'Rechtsschutz',
  'Photovoltaik',
];
const ZWECKE = [
  'Abschlag',
  'Jahresabrechnung',
  'Rechnung',
  'Monatsbeitrag',
  'Nachzahlung',
  'Gutschrift',
  'Reparatur',
  'Wartung',
  'Beitrag',
];
const SAETZE = [
  'Unterlagen vollständig.',
  'Rückfrage beim Kundenservice offen.',
  'Laut Telefonat verlängert.',
  'Kündigung vorgemerkt.',
  'Bitte bei Gelegenheit prüfen.',
  'Original liegt im Ordner.',
  'Wurde per Lastschrift beglichen.',
];

const firma = () => [eins(NACHNAMEN), eins(BRANCHEN), eins(FORMEN)].filter(Boolean).join(' ');
const person = () => `${eins(VORNAMEN)} ${eins(NACHNAMEN)}`;
const iso = (d: Date) => d.toISOString().slice(0, 10);
// Mit Startwert: fester Bezugstag, damit gleiche Startwerte gleiche Daten ergeben.
let heute = Date.now();
const tageVonHeute = (von: number, bis: number) => iso(new Date(heute + Math.round(zwischen(von, bis)) * 86_400_000));

/** Deutsche IBAN mit richtiger Prüfziffer (für Felder mit Format IBAN, #535). */
function demoIban(): string {
  const bban = Array.from({ length: 18 }, () => zufall(10)).join('');
  let rest = 0;
  for (const z of `${bban}131400`) rest = (rest * 10 + Number(z)) % 97;
  return ibanGruppen(`DE${String(98 - rest).padStart(2, '0')}${bban}`);
}

function textFuer(f: Feld, nr: number): string {
  const s = `${f.key} ${f.label}`.toLowerCase();
  // Feldformat (#535): Werte, die passen.
  if (f.format === 'email')
    return `${eins(VORNAMEN)
      .toLowerCase()
      .replace(/[^a-z]/g, '')}.${eins(NACHNAMEN)
      .toLowerCase()
      .replace(/[^a-z]/g, '')}${nr}@example.org`;
  if (f.format === 'telefon') return `0351 ${100000 + zufall(899999)}`;
  if (f.format === 'internetseite')
    return `https://www.${eins(NACHNAMEN)
      .toLowerCase()
      .replace(/[^a-z]/g, '')}${nr}.example.org`;
  if (f.format === 'iban') return demoIban();
  if (f.format === 'plz') return String(10000 + zufall(89999));
  if (/mail/.test(s))
    return `${eins(VORNAMEN).toLowerCase()}.${eins(NACHNAMEN)
      .toLowerCase()
      .replace(/[^a-z]/g, '')}${nr}@example.org`;
  if (/telefon|handy|mobil|tel\b/.test(s)) return `0351 ${100000 + zufall(899999)}`;
  if (/iban/.test(s)) return `DE${String(10 + zufall(89))}${Array.from({ length: 18 }, () => zufall(10)).join('')}`;
  if (/stra(ss|ß)e|adresse|anschrift/.test(s)) return `${eins(STRASSEN)} ${1 + zufall(120)}, ${eins(ORTE)}`;
  if (/\bort\b|stadt/.test(s)) return eins(ORTE);
  if (/nummer|\bnr\b|kennung|konto|aktenzeichen|kennzeichen/.test(s))
    return `${eins(['A', 'K', 'R', 'V', 'S'])}-${2020 + zufall(7)}-${String(10000 + zufall(89999))}`;
  if (/vorname/.test(s)) return eins(VORNAMEN);
  if (/person|inhaber|ansprech/.test(s)) return person();
  if (/name|firma|partner|aussteller|anbieter|unternehmen/.test(s)) return zufall(5) === 0 ? person() : firma();
  if (/zweck|betreff/.test(s)) return `${eins(ZWECKE)} ${eins(DINGE)} ${String(1 + zufall(12)).padStart(2, '0')}/${2023 + zufall(4)}`;
  if (/bezeichnung|titel|thema/.test(s)) return `${eins(DINGE)} ${eins(['Haus', 'Wohnung', 'Familie', 'Auto', 'Garten', ''])}`.trim();
  return `${eins(DINGE)} ${nr}`;
}

/** Wert für ein Feld oder undefined, wenn sich nichts Passendes erzeugen lässt. */
function wertFuer(f: Feld, nr: number, pools: Map<string, string[]>, vergeben: Set<string>): Wert | undefined {
  switch (f.typ) {
    case 'formatiert':
      return `**${eins(SAETZE)}**\n\n- ${eins(SAETZE)}\n- ${eins(SAETZE)}`;
    case 'text':
    case 'langtext': {
      let s = f.typ === 'langtext' ? Array.from({ length: 1 + zufall(3) }, () => eins(SAETZE)).join(' ') : textFuer(f, nr);
      if (f.eindeutig) {
        let n = nr;
        while (vergeben.has(s.toLowerCase())) s = `${textFuer(f, n)} ${++n}`;
      }
      if (f.maxLen != null && s.length > f.maxLen) s = s.slice(-f.maxLen);
      if (f.minLen != null && s.length < f.minLen) s = s.padEnd(f.minLen, '·');
      if (f.muster) {
        try {
          if (!new RegExp(`^(?:${f.muster})$`).test(s)) return undefined;
        } catch {
          return undefined;
        }
      }
      return s;
    }
    case 'zahl': {
      const min = typeof f.min === 'number' ? f.min : 1,
        max = typeof f.max === 'number' ? f.max : Math.max(min + 1000, 1000);
      const stellen = Math.min(f.nachkomma ?? 0, 4);
      let x = Number(zwischen(min, max).toFixed(stellen));
      // Eindeutig (#711): nach 200 Versuchen sind die Werte zwischen min und max vermutlich vergeben – nicht endlos suchen.
      for (let n = 0; f.eindeutig && vergeben.has(String(x)); n++) {
        if (n >= 200) return undefined;
        x = Number(zwischen(min, max).toFixed(stellen));
      }
      return x;
    }
    case 'betrag': {
      const min = typeof f.min === 'number' ? f.min : 5,
        max = typeof f.max === 'number' ? f.max : Math.max(min + 100, 2500);
      return { betrag: Number(zwischen(min, max).toFixed(2)), waehrung: f.waehrung || 'EUR' };
    }
    // Zeitraum und Prozent (#1035): übliche Fristen und Steuersätze.
    case 'zeitraum':
      return {
        ...eins<Zeitraum>([
          { anzahl: 14, einheit: 'tage' },
          { anzahl: 4, einheit: 'wochen' },
          { anzahl: 1, einheit: 'monate' },
          { anzahl: 3, einheit: 'monate' },
          { anzahl: 1, einheit: 'jahre' },
          { anzahl: 2, einheit: 'jahre' },
        ]),
      };
    case 'prozent': {
      const auswahl = [7, 19, 0, 2.5, 5].filter(
        (x) => (typeof f.min !== 'number' || x >= f.min) && (typeof f.max !== 'number' || x <= f.max),
      );
      return auswahl.length ? eins(auswahl) : typeof f.min === 'number' ? f.min : undefined;
    }
    case 'datum': {
      const s = `${f.key} ${f.label}`.toLowerCase();
      const d = /kuendig|kündig|ende|frist|ablauf|gueltig|gültig|bis\b|faellig|fällig/.test(s)
        ? tageVonHeute(10, 700)
        : tageVonHeute(-1100, 0);
      // Grenzen (#535), z. B. Geburtstag höchstens heute.
      const tag = iso(new Date(heute));
      const min = grenzeAlsTag(f.min, tag),
        max = grenzeAlsTag(f.max, tag);
      return min && d < min ? min : max && d > max ? max : d;
    }
    case 'janein':
      return z.chance(0.5);
    case 'auswahl': {
      const o = f.optionen ?? [];
      if (!o.length) return undefined;
      if (!f.mehrfach) return eins(o);
      return [...new Set(Array.from({ length: 1 + zufall(Math.min(2, o.length)) }, () => eins(o)))];
    }
    // Passwörter nie in Demo-Daten (#46).
    case 'passwort':
      return undefined;
    case 'referenz': {
      // Mehrere Zieltypen (#1036): ein Typ mit Mappen, bei „alle vom selben Typ“ für alle Verweise derselbe.
      const mit = zieleVon(f).filter((z) => (pools.get(z) ?? []).length);
      if (!mit.length) return undefined;
      const pool = f.gleicherTyp ? pools.get(eins(mit))! : mit.flatMap((z) => pools.get(z)!);
      if (!f.mehrfach) return eins(pool);
      return [...new Set(Array.from({ length: 1 + zufall(3) }, () => eins(pool)))];
    }
  }
}

/** Reihenfolge: Typen, auf die verwiesen wird, zuerst. */
function reihenfolge(typen: Mappentyp[]): Mappentyp[] {
  const fertig: Mappentyp[] = [];
  const rest = [...typen];
  while (rest.length) {
    const i = rest.findIndex((t) =>
      t.felder.every((f) => f.typ !== 'referenz' || zieleVon(f).every((z) => z === t.id || !rest.some((r) => r.id === z))),
    );
    fertig.push(...rest.splice(i < 0 ? 0 : i, 1)); // bei Kreisen: einfach weiter
  }
  return fertig;
}

/**
 * Nachgeben (#367): Die Demo-Daten entstehen im selben Prozess, der auch die Oberfläche bedient.
 * Nach jedem Schritt kommt die Ereignisschleife an die Reihe (wartende Anfragen werden bedient), und
 * nach längerer Arbeit folgt eine kurze Pause (`anteil` der Arbeitszeit, höchstens `maxMs`) – so
 * bleibt die Bedienung daneben flüssig; die Erzeugung dauert dafür etwas länger.
 */
export function takt(anteil = 0.25, maxMs = 250) {
  let seit = performance.now();
  return async () => {
    const pause = Math.min(maxMs, (performance.now() - seit) * anteil);
    await new Promise<void>((r) => (pause >= 5 ? setTimeout(r, pause) : setImmediate(r)));
    seit = performance.now();
  };
}

export interface Fortschritt {
  (fertig: number, gesamt: number, phase?: 'mappen' | 'dokumente', extra?: { uebersprungen?: number; gruende?: string[] }): void;
}

/** Phasen des Auftrags (#364): erst Mappen, dann wahlweise Dokumente – jeweils mit eigener Zahl. */
export function demoPhasen(mitDokumenten: boolean): PhasenPlan[] {
  return [
    { key: 'mappen', name: 'Mappen anlegen', einheit: 'Mappen' },
    ...(mitDokumenten ? [{ key: 'dokumente', name: 'Dokumente erzeugen', einheit: 'Dokumente' }] : []),
  ];
}

export interface DemoOptionen {
  anzahl: number;
  /** Gleicher Startwert = gleiche Daten (Werte, Dokumente), damit Messungen vergleichbar sind. */
  startwert?: string;
  dokumente?: DokumentOptionen | null;
}

/** Freier Platz im Ordner der Dateien und Mindest-Speicherplatz (Sicherung, Speicherplatz-Grenze). */
export interface DemoPlatz {
  frei(): Promise<number | null>;
  mindest(): Promise<number>;
}

export function pruefeDemoOptionen(x: unknown): DemoOptionen {
  const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
  const startwert = typeof o.startwert === 'string' && o.startwert.trim() ? o.startwert.trim().slice(0, 100) : undefined;
  return { anzahl: pruefeAnzahl(o.anzahl), startwert, dokumente: pruefeDokumentOptionen(o.dokumente) };
}

export interface DemoAbschaetzung {
  mappen: number;
  mappenMitRegister: number;
  dokumente: Abschaetzung | null;
  /** Freier Platz im Ordner der Dateien (null: nicht messbar). */
  frei: number | null;
  mindest: number;
  reicht: boolean;
  /** Ohne pdftoppm (Entwicklung) werden Scans und Bilder zu einfachen PDFs. */
  rastern: boolean;
  /** Mappentypen, die sich nicht erzeugen lassen (#711), mit bestellter Anzahl und Grund. */
  nichtErzeugbar: NichtErzeugbar[];
}

export async function schaetzeDemo(dienst: Dienst, o: DemoOptionen, platz?: DemoPlatz): Promise<DemoAbschaetzung> {
  // Dieselbe Rechnung wie in der Oberfläche (#365), hier zusätzlich mit dem freien Platz.
  const typen = await dienst.mappentypen.listeTypen();
  const { mappen, mappenMitRegister, dokumente } = schaetzeMenge(typen, o);
  const frei = platz ? await platz.frei().catch(() => null) : null;
  const mindest = platz ? await platz.mindest().catch(() => 0) : 0;
  const anzahl = await dienst.datenschutzDienst.mappenJeTyp();
  const fehlen = nichtErzeugbar(
    typen,
    verteilung(
      typen.filter((t) => !t.system),
      o.anzahl,
    ),
    (id) => anzahl.get(id) ?? 0,
  );
  return {
    mappen,
    mappenMitRegister,
    dokumente,
    frei,
    mindest,
    reicht: frei === null || frei - (dokumente?.bytes ?? 0) >= mindest,
    rastern: await kannRastern(),
    nichtErzeugbar: fehlen,
  };
}

/** Was eine Mappe zum Dokument beiträgt: Titel und Werte, damit die Volltextsuche das Dokument über sie findet. */
function inhaltVon(t: Mappentyp, werte: Werte, titel: string, titelVon: (id: string) => string): MappenInhalt {
  const angaben: Array<[string, string]> = [];
  let partner: string | undefined, betrag: number | undefined, datum: string | undefined;
  for (const f of t.felder) {
    const v = werte[f.key];
    if (v == null || f.typ === 'passwort' || f.typ === 'formatiert' || f.typ === 'langtext') continue;
    const text = formatiere(f, v, titelVon, { felder: t.felder, werte });
    if (!text) continue;
    angaben.push([f.label, text]);
    if (f.typ === 'referenz' && !partner) partner = text.split(', ')[0];
    if (f.typ === 'betrag' && betrag === undefined && typeof v === 'object' && v && 'betrag' in v)
      betrag = Number((v as { betrag: number }).betrag);
    if (f.typ === 'datum' && !datum) datum = text;
  }
  return { titel, typ: t.name, angaben, partner, betrag, datum };
}

/** „Versicherung: 85 übersprungen – Für das Pflichtfeld …“ (#711). */
export const uebersprungenText = (x: { typ: string; grund: string; anzahl: number }) =>
  `${x.typ}: ${x.anzahl.toLocaleString('de-DE')} übersprungen – ${x.grund}`;

export interface DemoErgebnis {
  erzeugt: Record<string, number>;
  /** Mappentypen mit weniger als bestellt (#711): wie viele fehlen und warum. */
  uebersprungen: Array<{ typ: string; grund: string; anzahl: number }>;
  gesamt: number;
  startwert: string;
  dauerMs: number;
  dokumente: {
    anzahl: number;
    bytes: number;
    seiten: number;
    texterkennung: number;
    duplikate: number;
    jeArt: Record<Dokumentart, number>;
    dauerMs: number;
  } | null;
  /** Warum die Dokumente vorzeitig endeten (z. B. Speicherplatz). */
  abgebrochen?: string;
  /** Scans und Bilder ohne pdftoppm als einfache PDFs erzeugt. */
  ohneRastern?: boolean;
}

/**
 * Erzeugt die Demo-Mappen im Arbeitsspeicher, prüft sie mit denselben Regeln wie
 * beim Speichern und schreibt sie paketweise in die Datenbank. So dauern auch
 * 50.000 Mappen nur Minuten statt Stunden. Danach wahlweise Dokumente (#248).
 */
export async function erzeugeDemo(
  dienst: Dienst,
  eingabe: unknown,
  benutzerId: string | null,
  fortschritt: Fortschritt = () => {},
  platz?: DemoPlatz,
): Promise<DemoErgebnis> {
  const beginn = Date.now();
  const o: DemoOptionen =
    typeof eingabe === 'number' || typeof eingabe === 'string' ? { anzahl: pruefeAnzahl(eingabe) } : pruefeDemoOptionen(eingabe);
  z = new Zufall(o.startwert);
  heute = o.startwert ? Date.UTC(2026, 0, 1) : Date.now();
  const typen = await demoTypen(dienst, o, platz);
  const ziel = verteilung(typen, o.anzahl);
  const lauf = new MappenLauf(
    dienst,
    benutzerId,
    fortschritt,
    [...ziel.values()].reduce((a, b) => a + b, 0),
  );
  await lauf.ladeVorhandene();
  lauf.beginne();
  for (const t of typen) await lauf.erzeugeTyp(t, ziel.get(t.id)!, !!o.dokumente && dokumentRegister(t).length > 0);
  await lauf.schreibe();
  // Weniger als bestellt (#711): sofort zeigen, nicht erst nach den Dokumenten – kein Haken, sondern „übersprungen“.
  const { erzeugt, uebersprungen, fertig: mappen, mappenZiel } = lauf;
  if (uebersprungen.length)
    fortschritt(mappen, mappenZiel, 'mappen', { uebersprungen: mappenZiel - mappen, gruende: uebersprungen.map(uebersprungenText) });
  // Statistik nach dem Massen-Einfügen (#367), sonst plant PostgreSQL mit veralteten Zahlen.
  if (mappen) await dienst.sichten.aktualisiereStatistik();
  const ergebnis: DemoErgebnis = { erzeugt, uebersprungen, gesamt: mappen, startwert: z.startwert, dauerMs: 0, dokumente: null };
  if (o.dokumente) await erzeugeDokumente(lauf, o.dokumente, ergebnis, platz);
  ergebnis.dauerMs = Date.now() - beginn;
  return ergebnis;
}

/** Mappentypen in der Reihenfolge der Verweise (ohne Systemtypen) – und vorab: Grenze je Lauf und freier Platz. */
async function demoTypen(dienst: Dienst, o: DemoOptionen, platz?: DemoPlatz): Promise<Mappentyp[]> {
  // Benutzer und Rollen pflegt das System; Demo-Mappen dürfen aber auf sie verweisen.
  const typen = reihenfolge((await dienst.mappentypen.listeTypen()).filter((t) => !t.system));
  if (!typen.length) throw new Fachfehler(409, 'Es gibt noch keine Mappentypen. Lege zuerst welche an oder lade die Beispiele.');

  // Grenze je Lauf (#365): Mappen × Anteil × Dokumente je Mappe.
  const menge = schaetzeMenge(typen, o);
  if ((menge.dokumente?.dokumente ?? 0) > MAX_DEMO_DOKUMENTE) throw new Fachfehler(422, mengenWarnung(menge)!);

  // Platz vorab: reicht er für die geschätzten Dokumente nicht, beginnt der Lauf gar nicht erst.
  if (o.dokumente && platz) {
    const s = await schaetzeDemo(dienst, o, platz);
    if (!s.reicht)
      throw new Fachfehler(
        507,
        `Zu wenig Speicherplatz: Die Dokumente brauchen etwa ${gb(s.dokumente?.bytes ?? 0)}, frei sind ${gb(s.frei ?? 0)}, mindestens frei bleiben müssen ${gb(s.mindest)} (Sicherung und Speicherplatz-Grenze).`,
      );
  }
  return typen;
}

/** Eine Demo-Mappe mit Dokument-Register: Für sie entstehen danach wahlweise Dokumente. */
interface MitDokumenten {
  id: string;
  t: Mappentyp;
  werte: Werte;
  titel: string;
}

/** Ein Versuch für eine Mappe: Werte, ein Fehler der Prüfung (neuer Versuch) oder unmöglich (Pflichtfeld ohne Wert). */
type Versuch = { werte: Werte } | { fehler: string } | { unmoeglich: string };

/**
 * Die Mappen eines Laufs: vorhandene und neue Mappen als Ziele für Verweise (Pools, Typ, Titel), das Paket, das als
 * Nächstes geschrieben wird (#367: 250 Mappen je Paket, danach nachgeben), und was entstanden bzw. übersprungen ist.
 */
class MappenLauf {
  readonly pools = new Map<string, string[]>();
  readonly typVon = new Map<string, string>();
  readonly titel = new Map<string, string>();
  readonly erzeugt: Record<string, number> = {};
  readonly uebersprungen: DemoErgebnis['uebersprungen'] = [];
  readonly mitDokumenten: MitDokumenten[] = [];
  fertig = 0;
  private paket: NeueMappe[] = [];
  weiter: () => Promise<void> = async () => {};
  private jetzt = '';

  constructor(
    readonly dienst: Dienst,
    readonly benutzerId: string | null,
    readonly fortschritt: Fortschritt,
    readonly mappenZiel: number,
  ) {}

  /** Schlank laden (#248): Id, Typ, Titel – Werte nur für eindeutige Felder. */
  async ladeVorhandene() {
    for (const m of await this.dienst.mappen.mappenKurz()) this.merke(m.id, m.typId, m.titel ?? '');
  }

  private merke(id: string, typId: string, titel: string) {
    (this.pools.get(typId) ?? this.pools.set(typId, []).get(typId)!).push(id);
    this.typVon.set(id, typId);
    this.titel.set(id, titel);
  }

  beginne() {
    this.fortschritt(0, this.mappenZiel, 'mappen');
    this.paket = [];
    this.weiter = takt();
    this.jetzt = new Date().toISOString();
  }

  /** Kleinere Transaktionen (#367): das Paket schreiben, danach nachgeben. */
  async schreibe() {
    await this.dienst.mappen.legeMappenAn(this.paket);
    this.fertig += this.paket.length;
    this.paket = [];
    this.fortschritt(this.fertig, this.mappenZiel, 'mappen');
    await this.weiter();
  }

  titelVon = (x: string) => this.titel.get(x) || 'Ohne Titel';

  /** Bis zu `soll` Mappen eines Typs; nach 25 Fehlversuchen in Folge oder einem unmöglichen Pflichtfeld übersprungen. */
  async erzeugeTyp(t: Mappentyp, soll: number, mitRegister: boolean) {
    const vergeben = new Map<string, Set<string>>();
    for (const f of t.felder.filter((x) => x.eindeutig))
      vergeben.set(f.key, new Set((await this.dienst.mappen.feldwerte(t.id, f.key)).map((w) => String(w).trim().toLowerCase())));
    let ok = 0,
      fehlversuche = 0,
      letzterFehler = '';
    while (ok < soll && fehlversuche < 25) {
      const v = this.versuch(t, ok, vergeben);
      if ('unmoeglich' in v) {
        letzterFehler = v.unmoeglich;
        break;
      }
      if ('fehler' in v) {
        fehlversuche++;
        letzterFehler = v.fehler;
        continue;
      }
      ok++;
      fehlversuche = 0;
      await this.nimm(t, v.werte, vergeben, mitRegister);
    }
    this.erzeugt[t.name] = ok;
    if (ok < soll) this.uebersprungen.push({ typ: t.name, grund: letzterFehler || 'unbekannt', anzahl: soll - ok });
  }

  /** Werte für eine Mappe erzeugen und prüfen wie beim Anlegen (Regeln, eindeutige Werte, Formate und Grenzen #535). */
  private versuch(t: Mappentyp, ok: number, vergeben: Map<string, Set<string>>): Versuch {
    const werte: Werte = {};
    let unmoeglich = '';
    for (const f of t.felder) {
      // Berechnete Felder (#1034) füllt ihr Paket, nicht der Demo-Generator; zusammengesetzte (#1050) setzt Ablago unten.
      if (f.berechnetVon || f.typ === 'zusammengesetzt' || (!f.pflicht && z.chance(0.2))) continue;
      const w = wertFuer(f, ok + 1, this.pools, vergeben.get(f.key) ?? new Set());
      if (w === undefined) {
        if (f.pflicht)
          unmoeglich = pflichtGrund(
            f.label,
            f.typ === 'referenz' ? 'verweis' : f.typ === 'passwort' ? 'passwort' : f.eindeutig ? 'eindeutig' : 'sonst',
          );
        continue;
      }
      werte[f.key] = w;
    }
    if (unmoeglich) return { unmoeglich };
    setzeZusammengesetzte(t, werte);
    const p = pruefeMappe(t, werte, {
      typVon: (id) => this.typVon.get(id),
      doppelt: (k, v) => (vergeben.get(k)?.has(String(v).trim().toLowerCase()) ? 'eine andere Mappe' : undefined),
    });
    // Formate und Grenzen (#535) wie beim Anlegen.
    Object.assign(p.felder, pruefeFormate(t, werte, undefined, iso(new Date(heute))));
    if (istOk(p)) return { werte };
    const [k, msg] = Object.entries(p.felder)[0] ?? [];
    return { fehler: k ? `${t.felder.find((f) => f.key === k)?.label ?? k}: ${msg?.[0]}` : (p.allgemein[0] ?? 'ungültig') };
  }

  /** Eine geprüfte Mappe ins Paket; als Ziel für Verweise merken; ein volles Paket schreiben. */
  private async nimm(t: Mappentyp, werte: Werte, vergeben: Map<string, Set<string>>, mitRegister: boolean) {
    const id = randomUUID();
    const tt = titelAus(t, werte, this.titelVon, { erstellt: this.jetzt, geaendert: this.jetzt });
    this.paket.push({ id, typId: t.id, werte, verweise: verweiseVon(t, werte), titel: tt, benutzerId: this.benutzerId, demo: true });
    if (mitRegister) this.mitDokumenten.push({ id, t, werte, titel: tt });
    this.merke(id, t.id, tt);
    for (const [k, set] of vergeben) if (werte[k] != null) set.add(String(werte[k]).trim().toLowerCase());
    if (this.paket.length >= 250) await this.schreibe();
  }
}

/** Dateien eines Laufs: Statistik, Vorrat für Duplikate, gesammelte Texterkennung, Zähler für Statistik und Platz. */
class DokumentLauf {
  readonly gewichte: number[];
  readonly statistik: NonNullable<DemoErgebnis['dokumente']>;
  readonly vorrat: Array<{ name: string; mime: string; inhalt: Buffer }> = [];
  ocr: string[] = [];
  seitPruefung = 0;
  readonly beginn = Date.now();
  seitStatistik = 0;
  erzeugt = 0;

  constructor(
    readonly lauf: MappenLauf,
    readonly d: DokumentOptionen,
    readonly rastern: boolean,
    readonly gesamt: number,
    readonly platz?: DemoPlatz,
  ) {
    this.gewichte = DOKUMENTARTEN.map((a) => d.mischung[a]);
    const jeArt = Object.fromEntries(DOKUMENTARTEN.map((a) => [a, 0])) as Record<Dokumentart, number>;
    this.statistik = { anzahl: 0, bytes: 0, seiten: 0, texterkennung: 0, duplikate: 0, jeArt, dauerMs: 0 };
  }

  /** Ein Duplikat aus dem Vorrat (Anteil Duplikate) oder ein neues Dokument einer gewichtet gewählten Art. */
  async naechsteDatei(inhalt: MappenInhalt): Promise<{ name: string; mime: string; inhalt: Buffer }> {
    const { statistik, vorrat } = this;
    if (vorrat.length && z.chance(this.d.duplikate / 100)) {
      statistik.duplikate++;
      return z.eins(vorrat);
    }
    const art = DOKUMENTARTEN[z.gewichtet(this.gewichte)];
    const kennung = `${z
      .int(2 ** 31)
      .toString(16)
      .padStart(8, '0')}${z
      .int(2 ** 31)
      .toString(16)
      .padStart(8, '0')}`;
    const e = await erzeugeDokument(z, art, inhalt, kennung, this.rastern);
    statistik.jeArt[e.art]++;
    statistik.seiten += e.seiten;
    if (e.inhalt.length < DEMO_VORRAT_MAX) {
      vorrat.push(e);
      if (vorrat.length > 50) vorrat.shift();
    }
    statistik.bytes += e.inhalt.length;
    this.seitPruefung += e.inhalt.length;
    return e;
  }

  /**
   * Das Dokument an die Mappe; Texterkennung gesammelt (200), Statistik der Datenbank alle 5000 (#367), Fortschritt alle
   * 10. Alle 200 MB: Reicht der Platz noch? Sonst sauber aufhören (Sicherung braucht ihn) – dann der Grund.
   */
  async lege(m: MitDokumenten, reg: { key: string }, datei: { name: string; mime: string; inhalt: Buffer }): Promise<string | null> {
    const { dienst, benutzerId, fortschritt } = this.lauf;
    const r = await dienst.datenschutzDienst.legeDemoDokumentAn(m.id, m.t, reg.key, datei.name, datei.mime, datei.inhalt, benutzerId);
    if (r.volltext) {
      this.ocr.push(r.id);
      this.statistik.texterkennung++;
    }
    if (this.ocr.length >= 200) {
      await dienst.eingangskanaele.demoTexterkennung(this.ocr);
      this.ocr = [];
    }
    this.statistik.anzahl++;
    this.erzeugt++;
    await this.lauf.weiter();
    // Zwischendurch die Statistik auffrischen (#367): Bei vielen Dokumenten wächst die Tabelle stark.
    if (++this.seitStatistik >= 5000) {
      this.seitStatistik = 0;
      await dienst.sichten.aktualisiereStatistik();
    }
    if (this.statistik.anzahl % 10 === 0) fortschritt(this.erzeugt, this.gesamt, 'dokumente');
    if (this.platz && this.seitPruefung > DEMO_PLATZ_PRUEFEN) {
      this.seitPruefung = 0;
      const [frei, mindest] = await Promise.all([this.platz.frei().catch(() => null), this.platz.mindest().catch(() => 0)]);
      if (frei !== null && frei < mindest)
        return `Zu wenig Speicherplatz: nur noch ${gb(frei)} frei, mindestens ${gb(mindest)} müssen frei bleiben.`;
    }
    return null;
  }
}

/** Dokumente (#248) zu den Mappen mit Dokument-Register: erst planen (wie viele je Mappe), dann erzeugen. */
async function erzeugeDokumente(lauf: MappenLauf, d: DokumentOptionen, ergebnis: DemoErgebnis, platz?: DemoPlatz) {
  const { dienst, fortschritt } = lauf;
  // Erst planen (wie viele je Mappe), damit der Fortschritt die Gesamtzahl kennt.
  const plan = lauf.mitDokumenten
    .map((m) => ({ m, anzahl: z.chance(d.anteil / 100) ? z.von(d.von, d.bis) : 0 }))
    .filter((x) => x.anzahl > 0);
  // Ab hier zählt die Phase „Dokumente erzeugen“; die Mappen-Phase gilt damit als fertig.
  const gesamt = plan.reduce((a, x) => a + x.anzahl, 0);
  fortschritt(0, gesamt, 'dokumente');
  const rastern = await kannRastern();
  const dl = new DokumentLauf(lauf, d, rastern, gesamt, platz);
  try {
    aussen: for (const { m, anzahl } of plan) {
      const register = dokumentRegister(m.t);
      const inhalt = inhaltVon(m.t, m.werte, m.titel, lauf.titelVon);
      for (let i = 0; i < anzahl; i++) {
        const datei = await dl.naechsteDatei(inhalt);
        const abgebrochen = await dl.lege(m, z.eins(register), datei);
        if (abgebrochen) {
          ergebnis.abgebrochen = abgebrochen;
          break aussen;
        }
      }
    }
    await dienst.eingangskanaele.demoTexterkennung(dl.ocr);
  } finally {
    if (dl.erzeugt) await dienst.sichten.aktualisiereStatistik();
  }
  dl.statistik.dauerMs = Date.now() - dl.beginn;
  ergebnis.dokumente = dl.statistik;
  if (!rastern) ergebnis.ohneRastern = true;
  fortschritt(dl.erzeugt, dl.erzeugt, 'dokumente');
}

const gb = (b: number) => `${(b / GB).toFixed(1).replace('.', ',')} GB`;

export function pruefeAnzahl(anzahl: unknown): number {
  const n = Math.floor(Number(anzahl));
  if (!Number.isFinite(n) || n < 1 || n > MAX_DEMO)
    throw new Fachfehler(422, `Bitte eine Anzahl zwischen 1 und ${MAX_DEMO.toLocaleString('de-DE')} angeben.`);
  return n;
}
