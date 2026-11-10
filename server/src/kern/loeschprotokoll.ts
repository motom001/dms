import { randomUUID } from 'node:crypto';
import type { Dokument, DokumentVersion, Mappentyp, Werte } from '../../../shared/src/model';
import { liesAnlass, LOESCH_MAX, nummerVon, type Ausloeser, type LoeschAnlass, type LoeschDokument, type LoeschEintrag, type LoeschKontext, type Loeschweg } from '../../../shared/src/loeschprotokoll';
import type { PapierkorbEintrag } from '../repo';
import { protokoll } from '../protokoll';
import type { Kern } from './kern';

/* Löschprotokoll (#470) */
/** Grund und Auslöser einer Löschung (aus Oberfläche/Schnittstelle) und wie gelöscht wurde. */
export type Anlass = LoeschAnlass & { ausloeser?: Ausloeser; weg?: Loeschweg };
/** Ein Eintrag ohne Zeit, Id und „wer/warum“ (kommt aus dem Kontext). */
export type ProtokollTeil = Omit<LoeschEintrag, 'id' | 'zeit' | 'vonId' | 'von' | 'ausloeser' | 'grund' | 'grundText'>;
export interface ProtokollMappe { id: string; typId: string; typ: Mappentyp | undefined; werte: Werte; notizen: number; dokumente: LoeschDokument[]; vorgang?: string | null }
export const dokInfo = (d: Dokument): LoeschDokument => ({ dokumentId: d.id, version: d.version ?? 1, sha256: d.sha256, groesse: d.groesse, mime: d.mime, seiten: d.ocr?.seiten ?? null, archivnummer: d.archivnummer ?? null });
export const versionInfo = (v: DokumentVersion): LoeschDokument => ({ dokumentId: v.dokumentId, version: v.nummer, sha256: v.sha256, groesse: v.groesse, mime: v.mime, seiten: null, archivnummer: null });

/* ---------- Löschprotokoll (#470) schreiben; lesen gehört zum Löschen ---------- */

export class Loeschprotokoll {
  constructor(private readonly kern: Kern) {}

  /** Wer und warum. Ohne Benutzer: „DMS“ (automatisch). */
  async kontext(von: string | null, anlass: Anlass = {}): Promise<LoeschKontext> {
    const a = liesAnlass({ grund: anlass.grund, text: anlass.text });
    const ausloeser: Ausloeser = anlass.ausloeser ?? (von ? 'benutzer' : 'automatisch');
    return { vonId: von, von: von ? await this.kern.name(von) : 'Ablago', ausloeser, grund: a.grund ?? null, grundText: a.text ?? '' };
  }

  /** Einträge für Mappen und ihre Dokumente. */
  mappenEintraege(liste: ProtokollMappe[], x: { schritt: LoeschEintrag['schritt']; weg: Loeschweg; vorgang?: string; startId?: string; verweise?: Record<string, number> }): ProtokollTeil[] {
    return liste.flatMap((m) => {
      const nummer = nummerVon(m.typ, m.werte);
      const vorgang = x.vorgang ?? m.vorgang ?? null;
      const gemeinsam = { mappeId: m.id, typId: m.typId, typ: m.typ?.name ?? '', nummer, vorgang, startId: vorgang ? (x.startId ?? (m.id === vorgang ? m.id : null)) : null, schritt: x.schritt, weg: x.weg };
      const dokumente = new Set(m.dokumente.map((d) => d.dokumentId)).size;
      return [
        { ...gemeinsam, art: 'mappe' as const, dokumentId: null, archivnummer: null, version: null, sha256: null, groesse: null, mime: null, seiten: null,
          anzahl: { dokumente, versionen: m.dokumente.length - dokumente, notizen: m.notizen, verweise: x.verweise?.[m.id] ?? 0 } },
        ...this.dokEintraege(m.dokumente, gemeinsam),
      ];
    });
  }

  dokEintraege(liste: LoeschDokument[], x: { mappeId: string; typId: string | null; typ: string; nummer: string | null; vorgang: string | null; startId: string | null; schritt: LoeschEintrag['schritt']; weg: Loeschweg }): ProtokollTeil[] {
    return liste.map((d) => ({ ...x, art: 'dokument' as const, dokumentId: d.dokumentId, archivnummer: d.archivnummer, version: d.version, sha256: d.sha256, groesse: d.groesse, mime: d.mime, seiten: d.seiten, anzahl: null }));
  }

  wiederEintrag(e: PapierkorbEintrag, typ: Mappentyp | undefined, vorgang: string | null): ProtokollTeil {
    return { art: 'mappe', schritt: 'wiederhergestellt', weg: vorgang ? 'verknuepft' : 'einzeln', mappeId: e.id, typId: e.typId, typ: typ?.name ?? '', nummer: nummerVon(typ, e.werte),
      archivnummer: null, dokumentId: null, version: null, sha256: null, groesse: null, mime: null, seiten: null, anzahl: null, vorgang, startId: vorgang && e.id === vorgang ? e.id : null };
  }

  /** Letzter Eintrag „in den Papierkorb“ je Mappen- bzw. Dokument-Id (für Grund, Typ und Nummer beim endgültigen Löschen). */
  async letzteSchritte(ids: string[]): Promise<Map<string, LoeschEintrag>> {
    const r = new Map<string, LoeschEintrag>();
    for (let i = 0; i < ids.length; i += 500) {
      const teil = ids.slice(i, i + 500);
      const { eintraege } = await this.kern.repo.loeschprotokoll({ ids: teil, schritt: 'papierkorb', max: LOESCH_MAX * 5 });
      // Neueste zuerst: der erste Treffer je Id zählt.
      for (const e of eintraege) { const k = e.art === 'dokument' ? e.dokumentId! : e.mappeId; if (!r.has(k)) r.set(k, e); }
    }
    return r;
  }

  /** Typ, Nummer und Vorgang der Mappe eines Dokuments – lebend, im Papierkorb oder aus dem Protokoll. */
  async mappenInfo(mappeIds: string[], frueher: Map<string, LoeschEintrag>) {
    const ids = [...new Set(mappeIds)];
    const typen = new Map((await this.kern.repo.listeTypen()).map((t) => [t.id, t] as const));
    const lebend = new Map((await this.kern.repo.holeMappen(ids)).map((m) => [m.id, m] as const));
    const korb = new Map((await this.kern.repo.papierkorbInhalt(ids.filter((id) => !lebend.has(id)))).map((k) => [k.id, k] as const));
    return (mappeId: string, dokumentId: string) => {
      const m = lebend.get(mappeId); const k = korb.get(mappeId); const f = frueher.get(dokumentId);
      const typId = m?.typId ?? k?.typId ?? f?.typId ?? null;
      const typ = typId ? typen.get(typId) : undefined;
      return { mappeId, typId, typ: typ?.name ?? f?.typ ?? '', nummer: m ? nummerVon(typ, m.werte) : k ? nummerVon(typ, k.werte) : f?.nummer ?? null, vorgang: k?.vorgang ?? f?.vorgang ?? null, startId: f?.startId ?? null };
    };
  }

  /**
   * Einträge schreiben. `nachGrund`: Grund und Text vom Schritt „in den Papierkorb“ übernehmen, wenn dieser
   * Schritt selbst keinen hat (endgültig löschen, Ablauf). Ein Fehler hier macht das Löschen nicht rückgängig,
   * steht aber im Protokoll.
   */
  async schreibe(teile: ProtokollTeil[], k: LoeschKontext, nachGrund = false) {
    if (!teile.length) return;
    try {
      const frueher = nachGrund && !k.grund ? await this.letzteSchritte([...new Set(teile.map((t) => (t.art === 'dokument' ? t.dokumentId! : t.mappeId)))]) : new Map<string, LoeschEintrag>();
      const zeit = new Date().toISOString();
      await this.kern.repo.loeschprotokollSchreibe(teile.map((t) => {
        const f = frueher.get(t.art === 'dokument' ? t.dokumentId! : t.mappeId) ?? frueher.get(t.mappeId);
        return { ...t, id: randomUUID(), zeit, vonId: k.vonId, von: k.von, ausloeser: k.ausloeser, grund: k.grund ?? f?.grund ?? null, grundText: k.grund ? k.grundText : (f?.grundText ?? k.grundText),
          vorgang: t.vorgang ?? f?.vorgang ?? null, startId: t.startId ?? f?.startId ?? null };
      }));
    } catch (e) {
      protokoll.modul('datenschutz').error('Löschprotokoll nicht geschrieben', { fehler: (e as Error).message, eintraege: teile.length });
    }
  }
}
