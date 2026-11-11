/**
 * Export mehrerer Mappen (#152, #153, #294, #1077 aus dienst.ts): Tabelle (CSV, Excel), ZIP mit Dokumenten oder ein
 * PDF – mit Stempel, Verkleinern und Archivfassung. Schicht 3 – bekommt den Kern, die Rechteprüfung, Sichten, fehlende
 * Dateien, den Ausgang und die Stempel-Vorlagen. Die Prüfstelle (`mitnehmbar`) ruft er über seinen Anschluss.
 */
import type { Readable } from 'node:stream';
import { arbeite } from '../arbeit';
import { type Ausgabe, fuerAusgabe, kannStempeln } from '../ausgabe';
import type { FehlendeDateien } from '../dokumente';
import { eindeutig, exportSpalten, mappenPdf, sichererName, spaltenKopf, zeile } from '../export';
import { Fachfehler } from '../fehler';
import type { Kern, Zugriff } from '../kern';
import type { Stempelvorlagen } from '../pdf-bearbeiten';
import type { Repo } from '../repo';
import type { SichtenDienst } from '../sichten';
import { t } from '../sprache';
import { stufeAus } from '../verkleinern';
import type { Zelle } from '../xlsx';
import { ZIP_MAX, type ZipEintrag, zipGroesse, zipStrom } from '../zip';
import { NICHT_SICHTBAR, type ZugriffDienst } from '../zugriff';
import { ABRUF_ART, type Abrufweg, type Dokument, type Mappe, type Mappentyp, verweiseVon } from '../../../shared/src/model';
import { zeitzone } from '../../../shared/src/region';
import { alleSichtRechte } from '../../../shared/src/sichtrechte';
import { type GeltenderStempel, wunschAus } from '../../../shared/src/stempel';
import type { AusgangDienst } from './ausgang.dienst';
import { sichtVerboten, verboten } from './pruefstelle';

const text = (v: unknown) => (v == null ? '' : String(v)).trim();
/** Mappen in der Reihenfolge der Ids (#542: mit Index statt `indexOf` je Vergleich – bei 20.000 Mappen Sekunden). */
export function inReihenfolge<T extends { id: string }>(liste: T[], ids: string[]): T[] {
  const pos = new Map(ids.map((id, i) => [id, i]));
  return liste.sort((a, b) => (pos.get(a.id) ?? 0) - (pos.get(b.id) ?? 0));
}

/** Die Teile, die der Export ruft: Rechteprüfung, Sichten (Treffer), fehlende Dateien, Ausgang, Stempel-Vorlagen. */
export interface ExportTeile { rechte: ZugriffDienst; sichten: SichtenDienst; fehlend: FehlendeDateien; ausgang: AusgangDienst; stempel: Stempelvorlagen }

/** Was der Export außer dem Kern braucht – vom Dienst hereingereicht. */
export interface ExportAnschluss {
  /** Die gemeinsame Prüfstelle (#723) – über den Anschluss (`dienst.ausgang.mitnehmbar`), damit jeder Weg dieselbe Stelle fragt. */
  mitnehmbar(ich: { id: string; rolle: string }, z: Zugriff, ids: string[]): Promise<Set<string>>;
  /** Inhalt der entsperrten Fassung (#827; geschützte PDFs, am Dienst). */
  entsperrtZu(inhalt: Buffer): Promise<Buffer | null>;
}

export class AusgangExport {
  constructor(private readonly kern: Kern, private readonly teile: ExportTeile, private readonly anschluss: ExportAnschluss) {}

  private get repo(): Repo { return this.kern.repo; }
  private entsperrtZu = (inhalt: Buffer) => this.anschluss.entsperrtZu(inhalt);
  private mitnehmbar(...a: Parameters<ExportAnschluss['mitnehmbar']>) { return this.anschluss.mitnehmbar(...a); }
  private maskiereBezuege(...a: Parameters<ZugriffDienst['maskiereBezuege']>) { return this.teile.rechte.maskiereBezuege(...a); }
  private trefferIds(...a: Parameters<SichtenDienst['trefferIds']>) { return this.teile.sichten.trefferIds(...a); }
  private pruefeVorhanden(docs: Array<Pick<Dokument, 'sha256' | 'name'>>) { return this.teile.fehlend.pruefeVorhanden(docs); }
  private dokumenteJeMappe(ids: string[]) { return this.teile.ausgang.dokumenteJeMappe(ids); }
  private archivWahl(fassung: unknown) { return this.teile.ausgang.archivWahl(fassung); }
  private stempelPlan(...a: Parameters<AusgangDienst['stempelPlan']>) { return this.teile.ausgang.stempelPlan(...a); }
  private notiereWeitergabe(...a: Parameters<AusgangDienst['notiereWeitergabe']>) { return this.teile.ausgang.notiereWeitergabe(...a); }
  private stempelDaten() { return this.teile.stempel.stempelDaten(); }

  /**
   * Export mehrerer Mappen (#152, #153): Tabelle (csv, xlsx), ZIP mit Dokumenten oder ein PDF.
   * Recht E an der Sicht, Lesen je Mappe; Reihenfolge wie in der Liste. Passwörter nie.
   */
  async exportiere(ich: { id: string; rolle: string; name?: string }, e: unknown, z: Zugriff, spur?: (ids: string[]) => Promise<unknown>, weg: Abrufweg = 'oberflaeche'): Promise<{ name: string; mime: string; inhalt: Buffer | Readable; groesse: number; mappen: number; ausgelassen: number }> {
    const x = (e ?? {}) as Record<string, unknown>;
    const format = String(x.format ?? '');
    if (!['csv', 'xlsx', 'zip', 'pdf'].includes(format)) throw new Fachfehler(422, t('meldungen.dienst.unbekanntes-format'));
    const q = { sicht: text(x.sicht), link: x.link, suche: x.suche, volltext: x.volltext, notizen: x.notizen, sortierung: x.sortierung, absteigend: x.absteigend };
    const alle = await this.repo.listeSichten();
    const sicht = alle.find((s) => s.id === q.sicht);
    if (sicht && !z.admin) {
      const r = alleSichtRechte(alle, z.wer, false).get(sicht.id);
      if (!r?.R) throw new Fachfehler(404, t('meldungen.dienst.diese-ansicht-gibt-es'));
      if (!r.E) throw sichtVerboten();
    }
    const treffer = (await this.trefferIds(ich, q, z)).ids;
    const gewaehlt = Array.isArray(x.ids) ? new Set(x.ids.map(String)) : null;
    let ids = gewaehlt ? treffer.filter((id) => gewaehlt.has(id)) : treffer;
    if (!ids.length) throw new Fachfehler(422, t('meldungen.dienst.keine-mappen-zum-exportieren'));
    // Ohne Sicht (erweiterte Suche, Typ-Liste, Link …) gilt Regel A (#294): nur Mappen, die der Benutzer
    // in mindestens einer Sicht mit Recht E sehen würde; die übrigen werden ausgelassen und gezählt.
    let ausgelassen = 0;
    if (!sicht && !z.admin) {
      const erlaubt = await this.mitnehmbar(ich, z, ids);
      ausgelassen = ids.length - erlaubt.size;
      ids = ids.filter((id) => erlaubt.has(id));
      if (!ids.length) throw verboten('export', [], Math.max(2, ausgelassen));
    }
    // Verwaltungsmodus (#820): fremde Mappen im Export dauerhaft in ihrer Historie.
    await spur?.(ids);
    const mappen = inReihenfolge(await this.repo.holeMappen(ids), ids);
    const typen = [...new Set(mappen.map((m) => m.typId))].map((t) => z.typen.get(t)).filter((t): t is Mappentyp => !!t);
    const spalten = exportSpalten(typen, x.spalten === 'alle' ? 'alle' : 'liste', sicht?.trefferliste ?? null);
    const verweise = mappen.flatMap((m) => { const t = z.typen.get(m.typId); return [...(t ? verweiseVon(t, m.werte).map((v) => v.zielId) : []), m.erstelltVon, m.geaendertVon].filter((v): v is string => !!v); });
    const bezuege = await this.maskiereBezuege(z, await this.repo.bezuege([...new Set(verweise)]));
    const quelle = { typen: z.typen, titel: (id: string | null | undefined) => (id ? bezuege[id]?.titel || NICHT_SICHTBAR : '') };
    const titel = sicht?.name ?? (q.sicht === 'suche' ? 'Suche' : typen[0]?.name) ?? t('meldungen.dienst.export');
    const datei = `${sichererName(titel, 60)} ${new Date().toISOString().slice(0, 10)}`;
    // Große Exporte (#542): Zeilen mit Pausen aufbereiten, Excel und CSV im Arbeiter schreiben.
    const tabelle = async (art: { xlsx?: boolean; csv?: boolean }) => {
      const kopf = spalten.map((k) => spaltenKopf(k, typen));
      const text: string[][] = []; const werte: Zelle[][] = [];
      for (const [i, m] of mappen.entries()) {
        const z = zeile(m, spalten, quelle);
        text.push(z.text); werte.push(z.werte);
        if (i % 1000 === 999) await new Promise<void>((r) => setImmediate(r));
      }
      const r = await arbeite('exportTabellen', { titel, kopf, ...(art.csv ? { text } : {}), ...(art.xlsx ? { werte } : {}), zeitzone: zeitzone() });
      return { xlsx: r.xlsx!, csv: r.csv! };
    };
    if (format === 'csv') { const b = (await tabelle({ csv: true })).csv; return { name: `${datei}.csv`, mime: 'text/csv; charset=utf-8', inhalt: b, groesse: b.length, mappen: mappen.length, ausgelassen }; }
    if (format === 'xlsx') { const b = (await tabelle({ xlsx: true })).xlsx; return { name: `${datei}.xlsx`, mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', inhalt: b, groesse: b.length, mappen: mappen.length, ausgelassen }; }
    // Dokumente aller Mappen in einem Zugriff (#367).
    const dokJe = (format === 'pdf' || format === 'zip') ? await this.dokumenteJeMappe(mappen.map((m) => m.id)) : new Map<string, Dokument[]>();
    // Archivfassung oder Original (#715): je Dokument, ohne Archivfassung das Original.
    const fw = await this.archivWahl(x.fassung);
    if (x.fassung === 'archiv') for (const [id, docs] of dokJe) dokJe.set(id, await Promise.all(docs.map(fw.waehle)));
    // Stempel (#394): je Mappe, weil die Pflicht am Mappentyp hängt. Nur PDFs und Bilder werden gestempelt.
    const wunsch = wunschAus(x.stempel);
    const stempelDaten = await this.stempelDaten();
    const plaene = new Map<string, GeltenderStempel>();
    for (const m of mappen) {
      if (!(dokJe.get(m.id) ?? []).length) continue;
      const p = await this.stempelPlan(m.typId, wunsch, '', stempelDaten);
      if (p) plaene.set(m.id, p);
    }
    // Verkleinert exportieren (#393): PDFs als verkleinerte Kopie, vor dem Stempeln.
    const klein = stufeAus(x.verkleinern);
    const wie = format === 'pdf' ? t('meldungen.dienst.als-pdf-exportiert') : t('meldungen.dienst.als-zip-exportiert');
    const gestempelt = new Map<string, Ausgabe[]>();
    const ausgabe = async (m: Mappe, d: Dokument, streng: boolean): Promise<Ausgabe> => {
      const a = await fuerAusgabe({ name: d.name, mime: d.mime, inhalt: await fw.lies(d) }, { stempel: plaene.get(m.id), verkleinern: klein },
        { benutzer: ich.name ?? '', mappe: m.titel || t('meldungen.dienst.ohne-titel'), archivnummer: d.archivnummer, entsperrt: this.entsperrtZu }, streng);
      gestempelt.set(m.id, [...(gestempelt.get(m.id) ?? []), a]);
      return a;
    };
    const historie = async () => {
      for (const [id, a] of gestempelt) await this.notiereWeitergabe(id, ich.id, wie, plaene.get(id) ?? null, a);
      // #800: Ein Export mit Dokumenten ist Herunterladen – je Mappe ein Eintrag mit ihren Dateien. Nicht zusammengefasst:
      // Ein Export ist eine bewusste Handlung, kein Rauschen. In Teilen zu 500, damit große Exporte nicht eine Riesenabfrage schicken.
      const abrufe = mappen.filter((m) => (dokJe.get(m.id) ?? []).length).map((m) => ({ mappeId: m.id, benutzerId: ich.id, art: ABRUF_ART[weg], daten: {
        dokumente: (dokJe.get(m.id) ?? []).map((d) => d.name), weg, fassung: 'export', format, ...(plaene.has(m.id) ? { gestempelt: true } : {}),
      } }));
      for (let i = 0; i < abrufe.length; i += 500) await this.repo.historieSchreibe(abrufe.slice(i, i + 500));
    };
    const bearbeiten = (m: Mappe) => plaene.has(m.id) || (!!klein && (dokJe.get(m.id) ?? []).some((d) => d.mime === 'application/pdf'));
    if (format === 'pdf') {
      const b = await mappenPdf(titel, await Promise.all(mappen.map(async (m) => {
        const docs = dokJe.get(m.id) ?? [];
        const mitStempel = plaene.has(m.id);
        const mitAusgabe = bearbeiten(m);
        // Gestempelte Bilder kommen als PDF zurück und werden darum wie PDFs eingebunden.
        return {
          mappe: m, typ: z.typen.get(m.typId),
          dokumente: mitStempel ? docs.map((d) => (kannStempeln(d.mime) ? { ...d, mime: 'application/pdf' } : d)) : docs,
          inhalt: async (d: Dokument) => {
            if (!mitAusgabe) return fw.lies(d);
            const original = docs.find((y) => y.id === d.id)!;
            return (await ausgabe(m, original, false)).inhalt;
          },
        };
      })), quelle, x.uebersicht === true ? { spalten, typen } : null);
      await historie();
      return { name: `${datei}.pdf`, mime: 'application/pdf', inhalt: b, groesse: b.length, mappen: mappen.length, ausgelassen };
    }
    // ZIP: Tabelle als Excel und CSV, je Mappe ein Ordner mit ihren Dokumenten.
    const eintrag = await tabelle({ xlsx: true, csv: true });
    const eintraege: ZipEintrag[] = [
      { name: 'Mappen.xlsx', daten: eintrag.xlsx }, { name: 'Mappen.csv', daten: eintrag.csv },
    ].map((d) => ({ name: d.name, groesse: d.daten.length, inhalt: async () => d.daten }));
    const ordner = eindeutig(mappen.map((m) => sichererName(m.titel || t('meldungen.dienst.ohne-titel'))));
    const ausDatei: Dokument[] = [];
    for (const [i, m] of mappen.entries()) {
      const docs = dokJe.get(m.id) ?? [];
      // Gestempelte Kopien entstehen vorab: das ZIP braucht die Größen im Voraus.
      const aus = bearbeiten(m) ? await Promise.all(docs.map((d) => ausgabe(m, d, false))) : null;
      const namen = eindeutig(docs.map((d, j) => sichererName(aus?.[j].name ?? d.name, 120)));
      docs.forEach((d, j) => {
        const a = aus?.[j];
        if (!a && !fw.archiv(d)) ausDatei.push(d);
        eintraege.push(a ? { name: `${ordner[i]}/${namen[j]}`, groesse: a.inhalt.length, inhalt: async () => a.inhalt } : { name: `${ordner[i]}/${namen[j]}`, groesse: d.groesse, inhalt: () => fw.strom(d) });
      });
    }
    // Fehlende Datei (#877): vorher melden – im ZIP wäre der Kopf schon unterwegs, die Antwort bräche nur ab.
    await this.pruefeVorhanden(ausDatei);
    const groesse = zipGroesse(eintraege);
    if (groesse > ZIP_MAX) throw new Fachfehler(422, t('meldungen.dienst.der-export-waere-groesser'));
    await historie();
    return { name: `${datei}.zip`, mime: 'application/zip', inhalt: zipStrom(eintraege), groesse, mappen: mappen.length, ausgelassen };
  }
}
