/**
 * Datenquellen für Vollexport (#254) und persönlichen Export (#255, #683; #1078 aus dienst.ts). Das Format schreibt
 * vollexport.ts. Schicht 3 – Teile und Anschluss wie `DatenschutzDienst` (datenschutz.dienst.ts).
 */
import { exportSpalten, mappenPdf } from '../export';
import type { Kern, Zugriff } from '../kern';
import type { Repo } from '../repo';
import { istVerschluesselt } from '../tresor';
import type { ExportQuelle } from '../vollexport';
import type { ZugriffDienst } from '../zugriff';
import { type Mappe, type MappenBezug, type Vertretung, verweiseVon } from '../../../shared/src/model';
import type { DatenschutzAnschluss, DatenschutzTeile } from './datenschutz.dienst';

export class VollexportQuellen {
  constructor(private readonly kern: Kern, private readonly teile: DatenschutzTeile, private readonly anschluss: DatenschutzAnschluss) {}

  private get repo(): Repo { return this.kern.repo; }
  private get dateien() { return this.kern.dateien; }
  private get umwandlung() { return this.teile.umwandlung.umwandlung; }
  private get archiv() { return this.teile.archiv.archiv; }
  private get tresor() { return this.anschluss.tresor(); }
  private get automatisierungenExport() { return this.anschluss.automatisierungenExport(); }
  private loeschprotokollAlle() { return this.teile.loeschprotokoll.loeschprotokollAlle(); }
  private lesbare(...a: Parameters<ZugriffDienst['lesbare']>) { return this.teile.rechte.lesbare(...a); }
  private rechteAnVielen(...a: Parameters<ZugriffDienst['rechteAnVielen']>) { return this.teile.rechte.rechteAnVielen(...a); }
  private maskiereBezuege(...a: Parameters<ZugriffDienst['maskiereBezuege']>) { return this.teile.rechte.maskiereBezuege(...a); }

  /** Datenquelle für den Vollexport; Benutzer, Designs und Protokoll kommen von außen. */
  vollexportQuelle(e: { mandant: string; version: string; benutzer: ExportQuelle['benutzer']; designs: ExportQuelle['designs']; protokoll: ExportQuelle['protokoll']; region?: ExportQuelle['region']; merkmale?: ExportQuelle['merkmale']; organisation?: ExportQuelle['organisation']; z?: Zugriff }): ExportQuelle {
    const r = this.repo;
    const { z, ...x } = e;
    const bezugCache = new Map<string, MappenBezug | undefined>();
    return {
      ...x,
      typen: () => r.listeTypen(),
      sichten: () => r.listeSichten(),
      nummernkreise: () => r.listeNummernkreise(),
      pakete: () => r.listePakete(),
      mappen: (typId) => r.listeMappen(typId),
      papierkorb: () => r.papierkorb(),
      papierkorbDokumente: () => r.papierkorbDokumente(),
      loeschprotokoll: () => this.loeschprotokollAlle(),
      synonyme: () => r.synonyme(),
      automatisierungen: () => this.automatisierungenExport?.() ?? Promise.resolve([]),
      // Gebündelt (#367): ein Zugriff je Paket, nicht je Mappe oder Dokument.
      dokumente: (ids) => r.dokumenteVon(ids),
      versionen: (ids) => r.versionenVonDokumenten(ids),
      volltexte: (ids) => r.volltexte(ids),
      datei: (sha) => this.dateien.lies(sha),
      // Umgewandelte Fassungen (#577) neben dem Original – wie in der Sicherung.
      fassung: async (sha) => { const f = await this.umwandlung?.lies(sha); return f ? { mime: f.info.mime, inhalt: f.inhalt } : null; },
      // Archivfassung (#631) neben dem Original: <Datei>.pdfa.pdf; ist das Original schon PDF/A, keine zweite Datei.
      archivfassung: async (sha) => { const i = await this.archiv?.info(sha); if (!i) return null; return i.imOriginal ? { imOriginal: true } : { inhalt: (await this.archiv!.lies(sha))?.inhalt ?? null }; },
      notizen: (ids) => r.notizenVon(ids),
      aufgaben: (ids) => r.aufgabenVonMappen(ids),
      ablaeufe: () => r.ablaeufe(),
      ablaufvorlagen: () => this.anschluss.ablaufvorlagenExport?.() ?? Promise.resolve([]),
      historie: (ids) => r.historieVon(ids),
      favoriten: () => r.alleFavoriten(),
      passwort: (w) => (istVerschluesselt(w) ? this.tresor?.entschluessele(w) ?? null : null),
      pdf: async (titel, mappen, typ, uebersicht) => {
        const ids = mappen.flatMap((m) => [...verweiseVon(typ, m.werte).map((v) => v.zielId), m.erstelltVon, m.geaendertVon].filter((v): v is string => !!v));
        // Bezüge merken (#367): je Mappe ein PDF, die Ziele wiederholen sich (Benutzer, Partner).
        const fehlt = [...new Set(ids)].filter((id) => !bezugCache.has(id));
        // Mit Zugriff (persönlicher Export): Titel von Mappen, die der Benutzer nicht lesen darf, verdeckt – wie in der Oberfläche.
        if (fehlt.length) {
          const neu = await r.bezuege(fehlt);
          const sichtbar = z ? await this.maskiereBezuege(z, neu) : null;
          for (const id of fehlt) bezugCache.set(id, sichtbar ? sichtbar[id] : neu.get(id));
        }
        const b = new Map([...new Set(ids)].map((id) => [id, bezugCache.get(id)] as const));
        const quelle = { typen: new Map([[typ.id, typ]]), titel: (id: string | null | undefined) => (id ? b.get(id)?.titel ?? '' : '') };
        return mappenPdf(titel, mappen.map((m) => ({ mappe: m, typ, dokumente: [], inhalt: async () => Buffer.alloc(0) })), quelle, uebersicht ? { spalten: exportSpalten([typ], 'liste'), typen: [typ] } : null);
      },
    };
  }

  /**
   * Persönlicher Export (#255): gleiches Format wie der Vollexport, beschränkt auf Mappen, die der
   * Benutzer lesen darf; seine Aufgaben, Erinnerungen, Favoriten, sein Profil. Keine Struktur anderer
   * Benutzer, keine Protokolle. Passwörter nur, wo er sie sehen darf (und nur mit Bestätigung).
   */
  async persoenlicheQuelle(z: Zugriff, x: { mandant: string; version: string; ich: { benutzer: Array<Record<string, unknown>>; vertretungen: Vertretung[] } }): Promise<ExportQuelle> {
    const voll = this.vollexportQuelle({ mandant: x.mandant, version: x.version, benutzer: async () => x.ich, designs: async () => [], protokoll: () => [], z });
    const ich = z.ich.id;
    const mappenJeTyp = new Map<string, Mappe[]>();
    const lesbar = new Set<string>();
    const pwErlaubt = new Set<string>();
    for (const t of await this.repo.listeTypen()) {
      const alle = await this.repo.listeMappen(t.id);
      const ok = await this.lesbare(z, alle.map((m) => m.id));
      const ms = alle.filter((m) => ok.has(m.id));
      if (!ms.length) continue;
      mappenJeTyp.set(t.id, ms);
      // Rechte gebündelt je Typ (#367) statt einer Abfrage je Mappe.
      const p = await this.rechteAnVielen(z, ms);
      for (const m of ms) { lesbar.add(m.id); if (z.admin || p.get(m.id)?.P) pwErlaubt.add(m.id); }
    }
    const typen = (await this.repo.listeTypen()).filter((t) => mappenJeTyp.has(t.id));
    const passwortVon = new Map<unknown, boolean>();
    for (const [, ms] of mappenJeTyp) for (const m of ms) for (const v of Object.values(m.werte)) if (istVerschluesselt(v)) passwortVon.set(v, pwErlaubt.has(m.id));
    return {
      ...voll,
      typen: async () => typen,
      sichten: async () => [],
      nummernkreise: async () => [],
      pakete: async () => [],
      mappen: async (typId) => mappenJeTyp.get(typId) ?? [],
      papierkorb: async () => (await this.repo.papierkorb({ von: ich })),
      // Nur Eigenes (#683): Dokumente im Papierkorb, die er gelöscht hat; Löschprotokoll, Synonyme und Automatisierungen
      // gehören dem ganzen Haushalt (Werkbank) und stehen nur im Vollexport.
      papierkorbDokumente: async () => (await this.repo.papierkorbDokumente({ von: ich })),
      loeschprotokoll: undefined, synonyme: undefined, automatisierungen: undefined, ablaufvorlagen: undefined,
      aufgaben: async (ids) => (await this.repo.aufgabenVonMappen(ids)).filter((a) => a.empfaengerId === ich || a.erstelltVon === ich),
      // Geplante Abläufe (#1044): an ihn bzw. von ihm angelegt, an Mappen, die er lesen darf.
      ablaeufe: async () => (await this.repo.ablaeufe()).filter((e) => (e.empfaengerId === ich || e.erstelltVon === ich) && lesbar.has(e.mappeId)),
      favoriten: async () => (await this.repo.alleFavoriten()).filter((f) => f.benutzerId === ich),
      passwort: (w) => (passwortVon.get(w) ? voll.passwort(w) : null),
    };
  }
}
