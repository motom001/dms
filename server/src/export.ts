/**
 * Export mehrerer Mappen (#152, #153): Tabelle (CSV, Excel), ZIP mit Dokumenten und ein PDF.
 * Passwortfelder werden nie ausgegeben.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { formatiere, istSystemspalte, SYSTEMSPALTEN, trefferlistenVon, type Dokument, type Feld, type Mappe, type Mappentyp } from '../../shared/src/model';
import { spaltenDerSicht } from '../../shared/src/sichten';
import type { Zelle } from './xlsx';

export type Spaltenart = 'liste' | 'alle';

const ALLE_SYSTEM = ['_titel', '_typ', '_erstellt', '_erstelltVon', '_geaendert', '_geaendertVon'];
const istPasswort = (typen: Mappentyp[], k: string) => typen.some((t) => t.felder.some((f) => f.key === k && f.typ === 'passwort'));

/** Spalten des Exports: wie die Trefferliste der Sicht oder alle Felder; nie Passwörter. */
export function exportSpalten(typen: Mappentyp[], art: Spaltenart, trefferliste?: string | null): string[] {
  let s: string[];
  if (art === 'liste') {
    s = spaltenDerSicht(typen, trefferliste).spalten;
    if (!s.length || (typen.length === 1 && !trefferlistenVon(typen[0]).some((l) => l.spalten.length))) s = [];
  } else s = [];
  if (!s.length) {
    const felder: string[] = [];
    for (const t of typen) for (const f of t.felder) if (!felder.includes(f.key)) felder.push(f.key);
    s = ['_titel', ...(typen.length > 1 ? ['_typ'] : []), ...felder, '_erstellt', '_erstelltVon', '_geaendert', '_geaendertVon'];
  }
  if (!s.includes('_titel')) s = ['_titel', ...s];
  return s.filter((k) => (istSystemspalte(k) ? ALLE_SYSTEM.includes(k) : !istPasswort(typen, k)));
}

export function spaltenKopf(k: string, typen: Mappentyp[]): string {
  if (istSystemspalte(k)) return SYSTEMSPALTEN[k];
  return typen.map((t) => t.felder.find((f) => f.key === k)?.label).find(Boolean) ?? k;
}

const titelOder = (t: string | null | undefined) => (t && t.trim() ? t : 'Ohne Titel');
const zeit = (iso: string) => new Date(iso).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'short', timeStyle: 'short' });

export interface Quelle { typen: Map<string, Mappentyp>; titel(id: string | null | undefined): string }

/** Eine Zeile: als Text (CSV, PDF) und als Wert (Excel). */
export function zeile(m: Mappe, spalten: string[], q: Quelle): { text: string[]; werte: Zelle[] } {
  const typ = q.typen.get(m.typId);
  const text: string[] = []; const werte: Zelle[] = [];
  for (const k of spalten) {
    switch (k) {
      case '_titel': text.push(titelOder(m.titel)); werte.push(titelOder(m.titel)); continue;
      case '_typ': text.push(typ?.name ?? ''); werte.push(typ?.name ?? ''); continue;
      case '_erstellt': text.push(zeit(m.erstellt)); werte.push({ zeitpunkt: m.erstellt }); continue;
      case '_geaendert': text.push(zeit(m.geaendert)); werte.push({ zeitpunkt: m.geaendert }); continue;
      case '_erstelltVon': { const n = m.erstelltVon ? q.titel(m.erstelltVon) : ''; text.push(n); werte.push(n); continue; }
      case '_geaendertVon': { const n = m.geaendertVon ? q.titel(m.geaendertVon) : ''; text.push(n); werte.push(n); continue; }
    }
    const f = typ?.felder.find((x) => x.key === k);
    const v = m.werte[k];
    if (!f || f.typ === 'passwort' || v == null || v === '') { text.push(''); werte.push(null); continue; }
    const t = formatiere(f, v, (id) => q.titel(id));
    text.push(t);
    werte.push(wert(f, v, t));
  }
  return { text, werte };
}

function wert(f: Feld, v: unknown, text: string): Zelle {
  switch (f.typ) {
    case 'zahl': return typeof v === 'number' ? v : text;
    case 'betrag': { const b = v as { betrag?: number; waehrung?: string }; return typeof b?.betrag === 'number' ? { betrag: b.betrag, waehrung: b.waehrung || 'EUR' } : null; }
    case 'datum': return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? { datum: v } : text;
    case 'janein': return text;
    default: return text;
  }
}

/** Ordner- und Dateinamen ohne verbotene Zeichen. */
export function sichererName(s: string, max = 80): string {
  return (s.replace(/[\u0000-\u001f<>:"/\\|?*]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^\.+/, '') || 'ohne Namen').slice(0, max).trim();
}

/** Eindeutige Namen: „a.pdf“, „a (2).pdf“ … */
export function eindeutig(namen: string[]): string[] {
  const vergeben = new Set<string>();
  return namen.map((n) => {
    let x = n; let i = 2;
    const punkt = n.lastIndexOf('.');
    const [kern, endung] = punkt > 0 ? [n.slice(0, punkt), n.slice(punkt)] : [n, ''];
    while (vergeben.has(x.toLowerCase())) x = `${kern} (${i++})${endung}`;
    vergeben.add(x.toLowerCase());
    return x;
  });
}

/* ---------- PDF (#152) ---------- */

/** Zeichen, die die Standardschriften (WinAnsi) kennen; alles andere wird „?“. */
const WIN_ANSI_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');
export function pdfSicher(s: string): string {
  let r = '';
  for (const ch of s.replace(/\t/g, '    ')) {
    const c = ch.codePointAt(0)!;
    r += (c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || WIN_ANSI_EXTRA.has(ch) ? ch : ch === '\n' ? '\n' : c === 0x2009 || c === 0x202f ? ' ' : '?';
  }
  return r;
}

export interface PdfMappe {
  mappe: Mappe; typ?: Mappentyp; dokumente: Dokument[];
  /** Inhalt eines Dokuments (für PDFs und Bilder). */
  inhalt(d: Dokument): Promise<Buffer>;
}

const A4 = { b: 595.28, h: 841.89 };
const RAND = 50;

class Schreiber {
  seite!: PDFPage;
  y = 0;
  constructor(private doc: PDFDocument, private f: { normal: PDFFont; fett: PDFFont }, private quer = false) {}
  get breite() { return this.quer ? A4.h : A4.b; }
  get hoehe() { return this.quer ? A4.b : A4.h; }
  neueSeite() { this.seite = this.doc.addPage(this.quer ? [A4.h, A4.b] : [A4.b, A4.h]); this.y = this.hoehe - RAND; }
  platz(h: number) { if (this.y - h < RAND) this.neueSeite(); }
  /** Text mit Umbruch an Wortgrenzen; gibt die Höhe zurück. */
  zeilen(text: string, groesse: number, breite: number, fett = false): string[] {
    const font = fett ? this.f.fett : this.f.normal;
    const erg: string[] = [];
    for (const absatz of pdfSicher(text).split('\n')) {
      let z = '';
      for (const wort of absatz.split(' ')) {
        const probe = z ? `${z} ${wort}` : wort;
        if (font.widthOfTextAtSize(probe, groesse) <= breite) { z = probe; continue; }
        if (z) erg.push(z);
        // Sehr lange Wörter hart trennen.
        let w = wort;
        while (font.widthOfTextAtSize(w, groesse) > breite && w.length > 1) {
          let n = w.length; while (n > 1 && font.widthOfTextAtSize(w.slice(0, n), groesse) > breite) n--;
          erg.push(w.slice(0, n)); w = w.slice(n);
        }
        z = w;
      }
      erg.push(z);
    }
    return erg;
  }
  text(text: string, o: { groesse?: number; fett?: boolean; x?: number; breite?: number; farbe?: number; abstand?: number } = {}) {
    const groesse = o.groesse ?? 10; const x = o.x ?? RAND; const breite = o.breite ?? this.breite - RAND - x;
    this.y -= o.abstand ?? 0;
    for (const z of this.zeilen(text, groesse, breite, o.fett)) {
      this.platz(groesse * 1.35);
      this.y -= groesse * 1.35;
      this.seite.drawText(z, { x, y: this.y + groesse * 0.3, size: groesse, font: o.fett ? this.f.fett : this.f.normal, color: rgb(o.farbe ?? 0.1, o.farbe ?? 0.12, o.farbe ?? 0.16) });
    }
  }
  linie() { this.platz(8); this.y -= 4; this.seite.drawLine({ start: { x: RAND, y: this.y }, end: { x: this.breite - RAND, y: this.y }, thickness: 0.5, color: rgb(0.75, 0.78, 0.82) }); this.y -= 4; }
}

const groesse = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB`);

/**
 * Ein PDF für mehrere Mappen: optional eine Übersicht als Tabelle, dann je Mappe eine Seite mit ihren
 * Feldern (ohne Passwörter) und der Liste der Dokumente; PDFs werden danach eingebunden, Bilder (JPEG, PNG)
 * als eigene Seite, andere Dateien nur genannt.
 */
export async function mappenPdf(titel: string, mappen: PdfMappe[], q: Quelle, uebersicht: { spalten: string[]; typen: Mappentyp[] } | null): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.setTitle(pdfSicher(titel)); doc.setProducer('DMS'); doc.setCreator('DMS');
  const f = { normal: await doc.embedFont(StandardFonts.Helvetica), fett: await doc.embedFont(StandardFonts.HelveticaBold) };

  if (uebersicht && mappen.length) {
    const s = new Schreiber(doc, f, true);
    s.neueSeite();
    s.text(titel, { groesse: 16, fett: true });
    s.text(`${mappen.length} ${mappen.length === 1 ? 'Mappe' : 'Mappen'} · ${zeit(new Date().toISOString())}`, { groesse: 9, farbe: 0.4, abstand: 2 });
    s.y -= 8;
    const sp = uebersicht.spalten;
    const nutzbar = s.breite - 2 * RAND;
    const w = nutzbar / sp.length;
    const reihe = (werte: string[], fett: boolean) => {
      const z = werte.map((t) => s.zeilen(t, 8.5, w - 6, fett).slice(0, 4));
      const h = Math.max(...z.map((x) => x.length)) * 11 + 4;
      if (s.y - h < RAND) { s.neueSeite(); }
      z.forEach((zeilen, i) => zeilen.forEach((t, j) => s.seite.drawText(t, { x: RAND + i * w, y: s.y - 10 - j * 11, size: 8.5, font: fett ? f.fett : f.normal, color: rgb(0.1, 0.12, 0.16) })));
      s.y -= h;
      s.seite.drawLine({ start: { x: RAND, y: s.y + 1 }, end: { x: RAND + nutzbar, y: s.y + 1 }, thickness: 0.3, color: rgb(0.8, 0.82, 0.85) });
    };
    reihe(sp.map((k) => spaltenKopf(k, uebersicht.typen)), true);
    for (const m of mappen) reihe(zeile(m.mappe, sp, q).text, false);
  }

  for (const x of mappen) {
    const { mappe: m, typ } = x;
    // Erst die Anhänge vorbereiten, damit die Seite der Mappe sagen kann, was eingebunden ist.
    const pdfs: Array<{ d: Dokument; doc: PDFDocument }> = []; const bilder: Array<{ d: Dokument; b: Buffer; png: boolean }> = [];
    const hinweis = new Map<string, string>();
    for (const d of x.dokumente) {
      try {
        if (d.mime === 'application/pdf') { pdfs.push({ d, doc: await PDFDocument.load(await x.inhalt(d), { ignoreEncryption: true, updateMetadata: false }) }); hinweis.set(d.id, 'eingebunden'); }
        else if (d.mime === 'image/jpeg' || d.mime === 'image/png') { bilder.push({ d, b: await x.inhalt(d), png: d.mime === 'image/png' }); hinweis.set(d.id, 'als Bild eingebunden'); }
        else hinweis.set(d.id, 'nicht eingebunden');
      } catch { hinweis.set(d.id, 'konnte nicht eingebunden werden'); }
    }
    const s = new Schreiber(doc, f);
    s.neueSeite();
    s.text(titelOder(m.titel), { groesse: 16, fett: true });
    s.text(`${typ?.name ?? ''} · angelegt ${zeit(m.erstellt)}${m.erstelltVon ? ` von ${q.titel(m.erstelltVon)}` : ''} · geändert ${zeit(m.geaendert)}${m.geaendertVon ? ` von ${q.titel(m.geaendertVon)}` : ''}`, { groesse: 8.5, farbe: 0.4, abstand: 2 });
    s.linie();
    const register = typ?.register.filter((r) => r.art === 'felder') ?? [];
    const gezeigt = new Set<string>();
    for (const r of register.length ? register : [{ key: '', name: '', felder: typ?.felder.map((f) => f.key) ?? [] }]) {
      const felder = (r.felder ?? []).map((k) => typ?.felder.find((f) => f.key === k)).filter((f): f is Feld => !!f && f.typ !== 'passwort');
      const mitWert = felder.filter((fd) => m.werte[fd.key] != null && m.werte[fd.key] !== '' && !(Array.isArray(m.werte[fd.key]) && !(m.werte[fd.key] as unknown[]).length));
      if (!mitWert.length) continue;
      if (register.length > 1 && r.name) s.text(r.name, { groesse: 11, fett: true, abstand: 6 });
      for (const fd of mitWert) {
        gezeigt.add(fd.key);
        const t = formatiere(fd, m.werte[fd.key], (id) => q.titel(id));
        const vor = s.y;
        s.text(fd.label, { groesse: 9, fett: true, breite: 150, abstand: 3 });
        const nach = s.y; s.y = vor;
        // Wert neben der Bezeichnung; ist er länger, rückt die nächste Zeile darunter.
        s.text(t, { groesse: 9.5, x: RAND + 160, abstand: 3 });
        s.y = Math.min(s.y, nach);
      }
    }
    if (x.dokumente.length) {
      s.text('Dokumente', { groesse: 11, fett: true, abstand: 10 });
      for (const d of x.dokumente) s.text(`• ${d.name} (${groesse(d.groesse)}) – ${hinweis.get(d.id)}`, { groesse: 9, abstand: 2 });
    }
    for (const b of bilder) {
      try {
        const bild = b.png ? await doc.embedPng(b.b) : await doc.embedJpg(b.b);
        const seite = doc.addPage([A4.b, A4.h]);
        const max = { b: A4.b - 2 * RAND, h: A4.h - 2 * RAND - 24 };
        const k = Math.min(1, max.b / bild.width, max.h / bild.height);
        seite.drawText(pdfSicher(`${titelOder(m.titel)} – ${b.d.name}`).slice(0, 120), { x: RAND, y: A4.h - RAND, size: 9, font: f.normal, color: rgb(0.4, 0.42, 0.46) });
        seite.drawImage(bild, { x: RAND, y: A4.h - RAND - 18 - bild.height * k, width: bild.width * k, height: bild.height * k });
      } catch { /* defektes Bild: genannt ist es schon */ }
    }
    for (const p of pdfs) {
      try {
        const seiten = await doc.copyPages(p.doc, p.doc.getPageIndices());
        for (const sp of seiten) doc.addPage(sp);
      } catch { /* z. B. verschlüsselt: genannt ist es schon */ }
    }
  }
  if (!doc.getPageCount()) doc.addPage([A4.b, A4.h]);
  return Buffer.from(await doc.save());
}
