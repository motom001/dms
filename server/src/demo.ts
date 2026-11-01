import { randomUUID } from 'node:crypto';
import { formatiere, istOk, pruefeMappe, titelAus, verweiseVon, type Feld, type Mappentyp, type Wert, type Werte } from '../../shared/src/model';
import { DOKUMENTARTEN, erzeugeDokument, kannRastern, pruefeDokumentOptionen, schaetze, type Abschaetzung, type DokumentOptionen, type Dokumentart, type MappenInhalt } from './demo-dokumente';
import { NACHNAMEN, ORTE, STRASSEN, VORNAMEN } from './demo-text';
import type { PhasenPlan } from './auftrag';
import type { Dienst } from './dienst';
import { Fachfehler } from './fehler';
import type { NeueMappe } from './repo';
import { Zufall } from './zufall';

/**
 * Erzeugt Demo-Mappen für die vorhandenen Mappentypen. Die Werte passen zu
 * Datentyp und Eigenschaften der Felder; Referenzen zeigen auf vorhandene
 * Mappen. Alles wird als Demo gekennzeichnet und lässt sich wieder entfernen.
 *
 * Wachstumstests (#248): bis 50.000 Mappen je Lauf, wahlweise mit erzeugten Dokumenten
 * (demo-dokumente.ts), mit Startwert wiederholbar. Vorhandene Mappen werden nur schlank
 * geladen (Id, Typ, Titel; Werte nur für eindeutige Felder).
 */
export const MAX_DEMO = 50_000;

// Zufall des laufenden Auftrags (mit Startwert). Es läuft immer nur ein Auftrag (Auftraege).
let z = new Zufall();
const zufall = (n: number) => z.int(n);
const eins = <T>(a: readonly T[]): T => z.eins(a);
const zwischen = (min: number, max: number) => z.zwischen(min, max);
const BRANCHEN = ['Heizungsbau', 'Elektrotechnik', 'Sanitär', 'Dachdeckerei', 'Autohaus', 'Versicherungsmakler', 'Steuerberatung', 'Stadtwerke', 'Gartenbau', 'Malerbetrieb', 'Zahnarztpraxis', 'Tischlerei', 'Energieversorgung', 'Telekommunikation', 'Hausverwaltung'];
const FORMEN = ['GmbH', 'GmbH & Co. KG', 'AG', 'e. K.', 'OHG', ''];
const DINGE = ['Strom', 'Gas', 'Wasser', 'Internet', 'Mobilfunk', 'Kfz-Versicherung', 'Hausrat', 'Haftpflicht', 'Wartung Heizung', 'Fitnessstudio', 'Zeitung', 'Streaming', 'Wohngebäude', 'Rechtsschutz', 'Photovoltaik'];
const ZWECKE = ['Abschlag', 'Jahresabrechnung', 'Rechnung', 'Monatsbeitrag', 'Nachzahlung', 'Gutschrift', 'Reparatur', 'Wartung', 'Beitrag'];
const SAETZE = ['Unterlagen vollständig.', 'Rückfrage beim Kundenservice offen.', 'Laut Telefonat verlängert.', 'Kündigung vorgemerkt.', 'Bitte bei Gelegenheit prüfen.', 'Original liegt im Ordner.', 'Wurde per Lastschrift beglichen.'];

const firma = () => [eins(NACHNAMEN), eins(BRANCHEN), eins(FORMEN)].filter(Boolean).join(' ');
const person = () => `${eins(VORNAMEN)} ${eins(NACHNAMEN)}`;
const iso = (d: Date) => d.toISOString().slice(0, 10);
// Mit Startwert: fester Bezugstag, damit gleiche Startwerte gleiche Daten ergeben.
let heute = Date.now();
const tageVonHeute = (von: number, bis: number) => iso(new Date(heute + Math.round(zwischen(von, bis)) * 86_400_000));

function textFuer(f: Feld, nr: number): string {
  const s = `${f.key} ${f.label}`.toLowerCase();
  if (/mail/.test(s)) return `${eins(VORNAMEN).toLowerCase()}.${eins(NACHNAMEN).toLowerCase().replace(/[^a-z]/g, '')}${nr}@example.org`;
  if (/telefon|handy|mobil|tel\b/.test(s)) return `0351 ${100000 + zufall(899999)}`;
  if (/iban/.test(s)) return `DE${String(10 + zufall(89))}${Array.from({ length: 18 }, () => zufall(10)).join('')}`;
  if (/stra(ss|ß)e|adresse|anschrift/.test(s)) return `${eins(STRASSEN)} ${1 + zufall(120)}, ${eins(ORTE)}`;
  if (/\bort\b|stadt/.test(s)) return eins(ORTE);
  if (/nummer|\bnr\b|kennung|konto|aktenzeichen|kennzeichen/.test(s)) return `${eins(['A', 'K', 'R', 'V', 'S'])}-${2020 + zufall(7)}-${String(10000 + zufall(89999))}`;
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
    case 'formatiert': return `**${eins(SAETZE)}**\n\n- ${eins(SAETZE)}\n- ${eins(SAETZE)}`;
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
        try { if (!new RegExp(`^(?:${f.muster})$`).test(s)) return undefined; } catch { return undefined; }
      }
      return s;
    }
    case 'zahl': {
      const min = f.min ?? 1, max = f.max ?? Math.max(min + 1000, 1000);
      const stellen = Math.min(f.nachkomma ?? 0, 4);
      let x = Number(zwischen(min, max).toFixed(stellen));
      if (f.eindeutig) while (vergeben.has(String(x))) x = Number(zwischen(min, max).toFixed(stellen));
      return x;
    }
    case 'betrag': {
      const min = f.min ?? 5, max = f.max ?? Math.max(min + 100, 2500);
      return { betrag: Number(zwischen(min, max).toFixed(2)), waehrung: f.waehrung || 'EUR' };
    }
    case 'datum': {
      const s = `${f.key} ${f.label}`.toLowerCase();
      return /kuendig|kündig|ende|frist|ablauf|gueltig|gültig|bis\b|faellig|fällig/.test(s) ? tageVonHeute(10, 700) : tageVonHeute(-1100, 0);
    }
    case 'janein': return z.chance(0.5);
    case 'auswahl': {
      const o = f.optionen ?? [];
      if (!o.length) return undefined;
      if (!f.mehrfach) return eins(o);
      return [...new Set(Array.from({ length: 1 + zufall(Math.min(2, o.length)) }, () => eins(o)))];
    }
    // Passwörter nie in Demo-Daten (#46).
    case 'passwort': return undefined;
    case 'referenz': {
      const pool = pools.get(f.zielTyp ?? '') ?? [];
      if (!pool.length) return undefined;
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
    const i = rest.findIndex((t) => t.felder.every((f) => f.typ !== 'referenz' || f.zielTyp === t.id || !rest.some((r) => r.id === f.zielTyp)));
    fertig.push(...rest.splice(i < 0 ? 0 : i, 1)); // bei Kreisen: einfach weiter
  }
  return fertig;
}

export interface Fortschritt { (fertig: number, gesamt: number, phase?: 'mappen' | 'dokumente'): void }

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
export interface DemoPlatz { frei(): Promise<number | null>; mindest(): Promise<number> }

export function pruefeDemoOptionen(x: unknown): DemoOptionen {
  const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
  const startwert = typeof o.startwert === 'string' && o.startwert.trim() ? o.startwert.trim().slice(0, 100) : undefined;
  return { anzahl: pruefeAnzahl(o.anzahl), startwert, dokumente: pruefeDokumentOptionen(o.dokumente) };
}

/** Wie viele Mappen bekommt jeder Typ? Stammdaten (wenig Verweise) weniger als Belege. */
function verteilung(typen: Mappentyp[], n: number) {
  const gewicht = (t: Mappentyp) => 1 + 2 * t.felder.filter((f) => f.typ === 'referenz' && f.zielTyp !== t.id).length;
  const summe = typen.reduce((a, t) => a + gewicht(t), 0);
  // Größte Reste (#364): Die Summe ergibt genau n – sonst stünde bei „40 Mappen“ im Fortschritt „39“.
  const roh = typen.map((t) => (n * gewicht(t)) / summe);
  const anzahl = roh.map(Math.floor);
  let rest = n - anzahl.reduce((a, b) => a + b, 0);
  for (const i of roh.map((_, i) => i).sort((i, j) => (roh[j] - anzahl[j]) - (roh[i] - anzahl[i]) || i - j)) { if (rest-- <= 0) break; anzahl[i]++; }
  // Jeder Typ bekommt mindestens eine Mappe (bei sehr kleinen Anzahlen also etwas mehr als n).
  return new Map(typen.map((t, i) => [t.id, Math.max(1, anzahl[i])]));
}
const dokumentRegister = (t: Mappentyp) => t.register.filter((r) => r.art === 'dokumente');

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
}

export async function schaetzeDemo(dienst: Dienst, o: DemoOptionen, platz?: DemoPlatz): Promise<DemoAbschaetzung> {
  const typen = (await dienst.listeTypen()).filter((t) => !t.system);
  const ziel = verteilung(typen, o.anzahl);
  const mappen = [...ziel.values()].reduce((a, b) => a + b, 0);
  const mappenMitRegister = typen.filter((t) => dokumentRegister(t).length).reduce((a, t) => a + (ziel.get(t.id) ?? 0), 0);
  const dokumente = o.dokumente ? schaetze(mappenMitRegister, o.dokumente) : null;
  const frei = platz ? await platz.frei().catch(() => null) : null;
  const mindest = platz ? await platz.mindest().catch(() => 0) : 0;
  return { mappen, mappenMitRegister, dokumente, frei, mindest, reicht: frei === null || frei - (dokumente?.bytes ?? 0) >= mindest, rastern: await kannRastern() };
}

/** Was eine Mappe zum Dokument beiträgt: Titel und Werte, damit die Volltextsuche das Dokument über sie findet. */
function inhaltVon(t: Mappentyp, werte: Werte, titel: string, titelVon: (id: string) => string): MappenInhalt {
  const angaben: Array<[string, string]> = [];
  let partner: string | undefined, betrag: number | undefined, datum: string | undefined;
  for (const f of t.felder) {
    const v = werte[f.key];
    if (v == null || f.typ === 'passwort' || f.typ === 'formatiert' || f.typ === 'langtext') continue;
    const text = formatiere(f, v, titelVon);
    if (!text) continue;
    angaben.push([f.label, text]);
    if (f.typ === 'referenz' && !partner) partner = text.split(', ')[0];
    if (f.typ === 'betrag' && betrag === undefined && typeof v === 'object' && v && 'betrag' in v) betrag = Number((v as { betrag: number }).betrag);
    if (f.typ === 'datum' && !datum) datum = text;
  }
  return { titel, typ: t.name, angaben, partner, betrag, datum };
}

export interface DemoErgebnis {
  erzeugt: Record<string, number>;
  uebersprungen: Array<{ typ: string; grund: string }>;
  gesamt: number;
  startwert: string;
  dauerMs: number;
  dokumente: { anzahl: number; bytes: number; seiten: number; texterkennung: number; duplikate: number; jeArt: Record<Dokumentart, number>; dauerMs: number } | null;
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
export async function erzeugeDemo(dienst: Dienst, eingabe: unknown, benutzerId: string | null, fortschritt: Fortschritt = () => {}, platz?: DemoPlatz): Promise<DemoErgebnis> {
  const beginn = Date.now();
  const o: DemoOptionen = typeof eingabe === 'number' || typeof eingabe === 'string' ? { anzahl: pruefeAnzahl(eingabe) } : pruefeDemoOptionen(eingabe);
  const n = o.anzahl;
  z = new Zufall(o.startwert);
  heute = o.startwert ? Date.UTC(2026, 0, 1) : Date.now();
  // Benutzer und Rollen pflegt das System; Demo-Mappen dürfen aber auf sie verweisen.
  const typen = reihenfolge((await dienst.listeTypen()).filter((t) => !t.system));
  if (!typen.length) throw new Fachfehler(409, 'Es gibt noch keine Mappentypen. Lege zuerst welche an oder lade die Beispiele.');

  // Platz vorab: reicht er für die geschätzten Dokumente nicht, beginnt der Lauf gar nicht erst.
  if (o.dokumente && platz) {
    const s = await schaetzeDemo(dienst, o, platz);
    if (!s.reicht) throw new Fachfehler(507, `Zu wenig Speicherplatz: Die Dokumente brauchen etwa ${gb(s.dokumente?.bytes ?? 0)}, frei sind ${gb(s.frei ?? 0)}, mindestens frei bleiben müssen ${gb(s.mindest)} (Sicherung und Speicherplatz-Grenze).`);
  }

  const ziel = verteilung(typen, n);
  const mappenZiel = [...ziel.values()].reduce((a, b) => a + b, 0);

  // Schlank laden (#248): Id, Typ, Titel – Werte nur für eindeutige Felder.
  const vorhanden = await dienst.mappenKurz();
  const pools = new Map<string, string[]>();
  const typVon = new Map<string, string>();
  const titel = new Map<string, string>();
  for (const m of vorhanden) {
    (pools.get(m.typId) ?? pools.set(m.typId, []).get(m.typId)!).push(m.id);
    typVon.set(m.id, m.typId);
    titel.set(m.id, m.titel ?? '');
  }

  const erzeugt: Record<string, number> = {};
  const uebersprungen: Array<{ typ: string; grund: string }> = [];
  const mitDokumenten: Array<{ id: string; t: Mappentyp; werte: Werte; titel: string }> = [];
  let fertig = 0;
  fortschritt(0, mappenZiel, 'mappen');
  let paket: NeueMappe[] = [];
  const schreibe = async () => { await dienst.legeMappenAn(paket); fertig += paket.length; paket = []; fortschritt(fertig, mappenZiel, 'mappen'); };
  const jetzt = new Date().toISOString();

  for (const t of typen) {
    const vergeben = new Map<string, Set<string>>();
    for (const f of t.felder.filter((x) => x.eindeutig)) vergeben.set(f.key, new Set((await dienst.feldwerte(t.id, f.key)).map((w) => String(w).trim().toLowerCase())));
    const mitRegister = o.dokumente && dokumentRegister(t).length > 0;
    let ok = 0, fehlversuche = 0, letzterFehler = '';
    while (ok < ziel.get(t.id)! && fehlversuche < 25) {
      const werte: Werte = {};
      let unmoeglich = '';
      for (const f of t.felder) {
        if (!f.pflicht && z.chance(0.2)) continue;
        const w = wertFuer(f, ok + 1, pools, vergeben.get(f.key) ?? new Set());
        if (w === undefined) { if (f.pflicht) unmoeglich = `Für das Pflichtfeld „${f.label}“ lässt sich kein passender Wert erzeugen${f.typ === 'referenz' ? ' (es gibt noch keine Mappen des Zieltyps)' : f.typ === 'passwort' ? ' (Passwörter gibt es in Demo-Daten nie)' : ''}.`; continue; }
        werte[f.key] = w;
      }
      if (unmoeglich) { letzterFehler = unmoeglich; break; }
      const p = pruefeMappe(t, werte, {
        typVon: (id) => typVon.get(id),
        doppelt: (k, v) => (vergeben.get(k)?.has(String(v).trim().toLowerCase()) ? 'eine andere Mappe' : undefined),
      });
      if (!istOk(p)) {
        fehlversuche++;
        const [k, msg] = Object.entries(p.felder)[0] ?? [];
        letzterFehler = k ? `${t.felder.find((f) => f.key === k)?.label ?? k}: ${msg?.[0]}` : p.allgemein[0] ?? 'ungültig';
        continue;
      }
      const id = randomUUID();
      const tt = titelAus(t, werte, (x) => titel.get(x) || 'Ohne Titel', { erstellt: jetzt, geaendert: jetzt });
      paket.push({ id, typId: t.id, werte, verweise: verweiseVon(t, werte), titel: tt, benutzerId, demo: true });
      if (mitRegister) mitDokumenten.push({ id, t, werte, titel: tt });
      ok++; fehlversuche = 0;
      (pools.get(t.id) ?? pools.set(t.id, []).get(t.id)!).push(id);
      typVon.set(id, t.id); titel.set(id, tt);
      for (const [k, set] of vergeben) if (werte[k] != null) set.add(String(werte[k]).trim().toLowerCase());
      if (paket.length >= 500) await schreibe();
    }
    erzeugt[t.name] = ok;
    if (ok < ziel.get(t.id)!) uebersprungen.push({ typ: t.name, grund: letzterFehler || 'unbekannt' });
  }
  await schreibe();
  const mappen = fertig;
  const ergebnis: DemoErgebnis = { erzeugt, uebersprungen, gesamt: mappen, startwert: z.startwert, dauerMs: 0, dokumente: null };

  if (o.dokumente) {
    const d = o.dokumente;
    // Erst planen (wie viele je Mappe), damit der Fortschritt die Gesamtzahl kennt.
    const plan = mitDokumenten.map((m) => ({ m, anzahl: z.chance(d.anteil / 100) ? z.von(d.von, d.bis) : 0 })).filter((x) => x.anzahl > 0);
    // Ab hier zählt die Phase „Dokumente erzeugen“; die Mappen-Phase gilt damit als fertig.
    const gesamt = plan.reduce((a, x) => a + x.anzahl, 0);
    let erzeugtDok = 0;
    fortschritt(0, gesamt, 'dokumente');
    const rastern = await kannRastern();
    const gewichte = DOKUMENTARTEN.map((a) => d.mischung[a]);
    const jeArt = Object.fromEntries(DOKUMENTARTEN.map((a) => [a, 0])) as Record<Dokumentart, number>;
    const statistik = { anzahl: 0, bytes: 0, seiten: 0, texterkennung: 0, duplikate: 0, jeArt, dauerMs: 0 };
    const vorrat: Array<{ name: string; mime: string; inhalt: Buffer }> = [];
    let ocr: string[] = [];
    let seitPruefung = 0;
    const docBeginn = Date.now();
    aussen: for (const { m, anzahl } of plan) {
      const register = dokumentRegister(m.t);
      const inhalt = inhaltVon(m.t, m.werte, m.titel, (x) => titel.get(x) || 'Ohne Titel');
      for (let i = 0; i < anzahl; i++) {
        let datei: { name: string; mime: string; inhalt: Buffer };
        if (vorrat.length && z.chance(d.duplikate / 100)) {
          datei = z.eins(vorrat);
          statistik.duplikate++;
        } else {
          const art = DOKUMENTARTEN[z.gewichtet(gewichte)];
          const kennung = `${z.int(2 ** 31).toString(16).padStart(8, '0')}${z.int(2 ** 31).toString(16).padStart(8, '0')}`;
          const e = await erzeugeDokument(z, art, inhalt, kennung, rastern);
          datei = e;
          jeArt[e.art]++;
          statistik.seiten += e.seiten;
          if (e.inhalt.length < 5 * 1024 * 1024) { vorrat.push(datei); if (vorrat.length > 50) vorrat.shift(); }
          statistik.bytes += e.inhalt.length;
          seitPruefung += e.inhalt.length;
        }
        const reg = z.eins(register);
        const r = await dienst.legeDemoDokumentAn(m.id, m.t, reg.key, datei.name, datei.mime, datei.inhalt, benutzerId);
        if (r.volltext) { ocr.push(r.id); statistik.texterkennung++; }
        if (ocr.length >= 200) { await dienst.demoTexterkennung(ocr); ocr = []; }
        statistik.anzahl++;
        erzeugtDok++;
        if (statistik.anzahl % 10 === 0) fortschritt(erzeugtDok, gesamt, 'dokumente');
        // Alle 200 MB: Reicht der Platz noch? Sonst sauber aufhören (Sicherung braucht ihn).
        if (platz && seitPruefung > 200 * 1024 * 1024) {
          seitPruefung = 0;
          const [frei, mindest] = await Promise.all([platz.frei().catch(() => null), platz.mindest().catch(() => 0)]);
          if (frei !== null && frei < mindest) { ergebnis.abgebrochen = `Zu wenig Speicherplatz: nur noch ${gb(frei)} frei, mindestens ${gb(mindest)} müssen frei bleiben.`; break aussen; }
        }
      }
    }
    await dienst.demoTexterkennung(ocr);
    statistik.dauerMs = Date.now() - docBeginn;
    ergebnis.dokumente = statistik;
    if (!rastern) ergebnis.ohneRastern = true;
    fortschritt(erzeugtDok, erzeugtDok, 'dokumente');
  }
  ergebnis.dauerMs = Date.now() - beginn;
  return ergebnis;
}

const gb = (b: number) => `${(b / 1024 ** 3).toFixed(1).replace('.', ',')} GB`;

export function pruefeAnzahl(anzahl: unknown): number {
  const n = Math.floor(Number(anzahl));
  if (!Number.isFinite(n) || n < 1 || n > MAX_DEMO) throw new Fachfehler(422, `Bitte eine Anzahl zwischen 1 und ${MAX_DEMO.toLocaleString('de-DE')} angeben.`);
  return n;
}
