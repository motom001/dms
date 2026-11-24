/**
 * Eingebaute Anbieter (#1570): Was Ablago selbst mit Dokumenten tut, als Anbieter der Leistungen – dieselbe Arbeit
 * wie bisher (PDF-Stelle im Arbeiter, Werkzeugdienst). Was jeder meldet (Leistungen, Dateitypen, Einschränkungen),
 * steht in `shared/src/leistungen/eingebaut.ts`.
 *
 * - Eigene Zeitgrenze `null`: Ablago selbst begrenzt schon dort, wo es aufruft (Texterkennung nach Seitenzahl #1550,
 *   Briefsatz im Arbeiter); für andere Auftraggeber gilt die des Katalogs.
 * - `intern` (nur von Ablago): was der bisherige Aufruf schon vorbereitet hat (z. B. der fertige Brief), damit das
 *   Ergebnis genau gleich bleibt. Ohne `intern` arbeitet jeder Anbieter allein aus der Eingabe – wie ein Paket.
 * - Fehler bleiben Fachfehler mit den bisherigen Meldungen.
 */
import { EINGEBAUTE_ANBIETER, type Datei, type EingebauterAnbieter, type Leistungsname } from '../../../shared/src/leistungen';
import type { ERechnung, ERechnungPartei } from '../../../shared/src/erechnung';
import type { Bereich } from '../../../shared/src/schwaerzen';
import { laufText, setzeVorlage, type Brief, type Platzhalterwert } from '../../../shared/src/textsatz';
import { gebietsschemaVon } from '../../../shared/src/sprache';
import { STANDARD_STUFE, istStufe } from '../dateien/verkleinern';
import { verkleinere } from '../dateien/verkleinern';
import { analysiere as analysiereSchwaerzen, schwaerze } from '../dateien/schwaerzen';
import { bewertePdfA } from '../dateien/archivfassung';
import { Fachfehler } from '../grundlagen/fehler';
import { TEXTSATZ_PDF_MAX, TEXTSATZ_SEITEN } from '../grundlagen/grenzen';
import {
  baueSeiten,
  bildSeitePdf,
  briefPdf,
  fuegeZusammen,
  groesseText,
  liesPdfA,
  seitenInfo,
  type PdfaBefund,
  type SeitenWahl,
} from '../pdf';
import { t } from '../sprache/sprache';
import type { Anbieter, Anbieterergebnis, Einschraenkungspruefung } from './anbieter';

type Arbeit = (
  eingabe: Record<string, unknown>,
  intern: Record<string, unknown> | undefined,
  signal: AbortSignal,
) => Promise<Anbieterergebnis>;

const PDF = 'application/pdf';
const puffer = (d: Datei) => Buffer.from(d.inhalt.buffer, d.inhalt.byteOffset, d.inhalt.byteLength);
const alsDatei = (inhalt: Buffer, name: string, mime = PDF): Datei => ({ inhalt, mime, name });
const pdfName = (name: string) => `${name.replace(/\.[^.]{1,8}$/, '')}.pdf`;

/** Ein eingebauter Anbieter aus seiner Meldung und der Arbeit je Leistung. */
function anbieter(id: EingebauterAnbieter, arbeit: Partial<Record<Leistungsname, Arbeit>>): Anbieter {
  return {
    id,
    art: 'eingebaut',
    bietet: EINGEBAUTE_ANBIETER[id],
    zeitgrenzeMs: () => null,
    async fuehreAus(a) {
      const f = arbeit[a.leistung];
      if (!f) throw new Fachfehler(500, `${id}: ${a.leistung}`);
      return f(a.eingabe, a.intern, a.signal);
    },
  };
}

/* ---------- PDF bearbeiten ---------- */

const seiten: Arbeit = async (e) => {
  const d = e.datei as Datei;
  const wahl = (e.seiten as SeitenWahl[]).map((s) => ({ nr: s.nr, ...(s.drehung ? { drehung: s.drehung } : {}) }));
  const pdf = await baueSeiten(puffer(d), wahl);
  return { daten: { seiten: wahl.length }, datei: alsDatei(pdf, d.name) };
};

const zusammenfuegen: Arbeit = async (e) => {
  const dateien = e.dateien as Datei[];
  const pdf = await fuegeZusammen(dateien.map(puffer));
  return { daten: { seiten: (await seitenInfo(pdf)).anzahl }, datei: alsDatei(pdf, dateien[0].name) };
};

const verkleinern: Arbeit = async (e) => {
  const d = e.datei as Datei;
  const r = await verkleinere(puffer(d), istStufe(e.stufe) ? e.stufe : STANDARD_STUFE);
  return { daten: { vorher: r.vorher, nachher: r.nachher }, datei: alsDatei(r.inhalt, d.name), intern: { ergebnis: r } };
};

/** Schwärzen: mit der Analyse und den Bereichen des Aufrufers, wenn er sie hat (dieselben Wörter, dieselben Stellen). */
const schwaerzen: Arbeit = async (e, intern) => {
  const d = e.datei as Datei;
  const inhalt = puffer(d);
  const a =
    (intern?.analyse as Awaited<ReturnType<typeof analysiereSchwaerzen>> | undefined) ?? (await analysiereSchwaerzen(inhalt, d.mime));
  const bereiche = (intern?.bereiche as Bereich[] | undefined) ?? (e.bereiche as Bereich[]);
  const r = await schwaerze(inhalt, d.mime, a, bereiche);
  return { daten: { seiten: r.seiten }, datei: alsDatei(r.inhalt, d.name, r.mime), intern: { ergebnis: r } };
};

/* ---------- Briefsatz ---------- */

/** PDF im Arbeiter zeichnen; Seiten und Größe aus grenzen.ts (wie bisher im Textsatz). */
async function zeichne(brief: Brief): Promise<{ pdf: Buffer; seiten: number }> {
  const r = await briefPdf(brief);
  if ('zuLang' in r) throw new Fachfehler(413, t('meldungen.textsatz.zu-lang', { seiten: r.zuLang }));
  const pdf = Buffer.from(r.pdf);
  if (pdf.length > TEXTSATZ_PDF_MAX) throw new Fachfehler(413, t('meldungen.textsatz.zu-gross', { max: groesseText(TEXTSATZ_PDF_MAX) }));
  return { pdf, seiten: r.seiten };
}

/** Ein Brief allein aus der Eingabe – so, wie ein Paket ihn auch bekäme. */
function briefVon(text: string, e: Record<string, unknown>, wert: (name: string) => Platzhalterwert, titel: string): Brief {
  const g = setzeVorlage(text, wert);
  const zeilen = (x: unknown) => (Array.isArray(x) ? x.map(String) : []);
  return {
    sprache: gebietsschemaVon(typeof e.sprache === 'string' ? e.sprache : 'de'),
    titel: g.betreff ? laufText(g.betreff) : titel,
    herkunft: 'Ablago',
    absender: zeilen(e.absender),
    ruecksende: '',
    anschrift: zeilen(e.anschrift).map((z) => [{ text: z }]),
    datum: typeof e.datum === 'string' ? e.datum : '',
    betreff: g.betreff,
    bloecke: g.bloecke,
    seitenText: t('meldungen.textsatz.seite'),
    seitenMax: TEXTSATZ_SEITEN,
  };
}

const ausText: Arbeit = async (e) => {
  const titel = typeof e.titel === 'string' && e.titel ? e.titel : 'Dokument';
  // Freier Text hat keine Platzhalter: geschweifte Klammern bleiben, wie sie sind.
  const r = await zeichne(briefVon(String(e.text), e, (name) => ({ text: `{${name}}` }), titel));
  return { daten: { seiten: r.seiten }, datei: alsDatei(r.pdf, `${titel}.pdf`) };
};

/** Aus einer Vorlage: mit dem schon gebauten Brief des Textsatzes (`intern.brief`), sonst aus der Eingabe. */
const ausVorlage: Arbeit = async (e, intern) => {
  const v = e.vorlage as Datei;
  const werte = new Map((e.werte as Array<{ platzhalter: string; wert: string }> | undefined)?.map((w) => [w.platzhalter, w.wert]) ?? []);
  const luecken = new Set<string>();
  const eigen = briefVon(
    Buffer.from(v.inhalt).toString('utf8'),
    e,
    (name) => {
      if (werte.has(name)) return { text: werte.get(name)! };
      luecken.add(name);
      return { luecke: name };
    },
    v.name.replace(/\.md$/i, ''),
  );
  const r = await zeichne((intern?.brief as Brief | undefined) ?? eigen);
  return {
    daten: { seiten: r.seiten, luecken: [...luecken].slice(0, 500).map((l) => l.slice(0, 200)) },
    datei: alsDatei(r.pdf, pdfName(v.name)),
  };
};

/* ---------- Umwandeln, Archivfassung ---------- */

const inPdf: Arbeit = async (e) => {
  const d = e.datei as Datei;
  return { daten: { seiten: 1 }, datei: alsDatei(await bildSeitePdf(d.inhalt, d.mime), pdfName(d.name)) };
};

/**
 * Gilt ein PDF schon als Archivfassung? Kennung und Seiten (wirft mit Grund, wenn nicht). Je Inhalt einmal gelesen:
 * Die Prüfung der Einschränkung vor der Wahl und die Arbeit danach teilen sich das Ergebnis.
 */
const gelesen = new WeakMap<Uint8Array, Promise<PdfaBefund>>();
async function pdfa(inhalt: Uint8Array) {
  let p = gelesen.get(inhalt);
  if (!p) gelesen.set(inhalt, (p = liesPdfA(inhalt)));
  const befund = await p;
  return { befund, ...bewertePdfA(befund) };
}

/** Nur Originale, die schon gültiges PDF/A sind: Sie werden übernommen, nicht umgewandelt (Einschränkung `bereits-pdfa`). */
const pdfaUebernehmen: Arbeit = async (e) => {
  const d = e.datei as Datei;
  const k = await pdfa(d.inhalt);
  const stufe = `${k.pdfa.teil}${k.pdfa.stufe ?? ''}`.toLowerCase();
  return {
    daten: { seiten: k.seiten, ...(['1b', '2b', '2u', '3b', '3u'].includes(stufe) ? { stufe } : {}) },
    datei: d,
    intern: { pdfa: k.pdfa },
  };
};

/** Einschränkungen der Eingabe prüfen (#1570): Ablago selbst, vor der Wahl des Anbieters. */
export const pruefeEinschraenkung: Einschraenkungspruefung = async (e, dateien) => {
  if (e === 'bereits-pdfa') {
    for (const d of dateien) if (d.mime !== PDF || !(await pdfa(d.inhalt).catch(() => null))) return false;
    return dateien.length > 0;
  }
  return false;
};

/* ---------- Die Anbieter ---------- */

/** E-Rechnung lesen: das Lesen selbst reicht der Dienst herein (Erkennung; PDFs im Arbeiter). Ohne E-Rechnung: Fehler. */
export type ERechnungLeser = (
  d: Datei,
) => Promise<{ er: ERechnung; steuern: ReadonlyArray<{ satz: number; netto?: number; ust?: number; kategorie?: string }> }>;

const k = (s: string | undefined, n: number) => (s === undefined ? undefined : s.slice(0, n));
const ohneLeere = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
function partei(p: ERechnungPartei) {
  return ohneLeere({
    name: k(p.name, 500),
    ustid: k(p.ustid, 40),
    kennung: k(p.kennung, 200),
    strasse: k(p.strasse, 500),
    plz: k(p.plz, 20),
    ort: k(p.ort, 200),
    land: k(p.land, 2),
    email: k(p.email, 320),
    telefon: k(p.telefon, 100),
  });
}
/** Die Ausgabe der Leistung aus dem, was Ablago liest (gekürzt auf die Grenzen des Schemas); das Ganze in `intern`. */
function erechnungDaten(er: ERechnung, steuern: Awaited<ReturnType<ERechnungLeser>>['steuern']): Record<string, unknown> {
  return ohneLeere({
    syntax: er.syntax,
    gutschrift: er.gutschrift,
    nummer: k(er.nummer, 200),
    datum: k(er.datum, 10),
    faellig: k(er.faellig, 10),
    waehrung: er.waehrung,
    netto: er.netto,
    ust: er.ust,
    brutto: er.brutto,
    zahlbetrag: er.zahlbetrag,
    verkaeufer: partei(er.verkaeufer),
    kaeufer: partei(er.kaeufer),
    iban: k(er.iban, 34),
    steuern: steuern.slice(0, 50),
    positionen: er.positionen.slice(0, 500).map((p) =>
      ohneLeere({
        nr: k(p.nr, 50),
        beschreibung: k(p.beschreibung, 2000),
        menge: p.menge,
        einheit: k(p.einheit, 10),
        einzelpreis: p.einzelpreis,
        gesamt: p.gesamt,
        ustSatz: p.ustSatz,
      }),
    ),
  });
}

/** Text lesen: Textebene über den Werkzeugdienst – reicht die Texterkennung beim Start herein. */
export type Textleser = (d: Datei, o: { signal: AbortSignal; intern?: Record<string, unknown> }) => Promise<Anbieterergebnis>;

/** Alle eingebauten Anbieter, die ohne weitere Teile auskommen, und die mit Leser. */
export function eingebauteAnbieter(o: { erechnung: ERechnungLeser }): Anbieter[] {
  return [
    anbieter('ablago.pdf', {
      'dokument.bearbeiten.seiten@1': seiten,
      'dokument.bearbeiten.zusammenfuegen@1': zusammenfuegen,
      'dokument.bearbeiten.verkleinern@1': verkleinern,
      'dokument.bearbeiten.schwaerzen@1': schwaerzen,
    }),
    anbieter('ablago.briefsatz', { 'dokument.erstellen.aus-text@1': ausText, 'dokument.erstellen.aus-vorlage@1': ausVorlage }),
    anbieter('ablago.umwandeln', { 'dokument.umwandeln.pdf@1': inPdf }),
    anbieter('ablago.archiv', { 'dokument.umwandeln.pdfa@1': pdfaUebernehmen }),
    anbieter('ablago.erechnung', {
      'dokument.lesen.erechnung@1': async (e) => {
        const { er, steuern } = await o.erechnung(e.datei as Datei);
        return { daten: erechnungDaten(er, steuern), intern: { er } };
      },
    }),
  ];
}

/** „Text aus PDF und Texterkennung“: die Textebene von PDFs (Scans und Bilder erkennt ein Paket, #459). */
export function textAnbieter(lies: Textleser): Anbieter {
  return anbieter('ablago.text', { 'dokument.lesen.text@1': (e, intern, signal) => lies(e.datei as Datei, { signal, intern }) });
}
