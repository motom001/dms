/**
 * Löschprotokoll lesen und verwalten (#470, #1078 aus dienst.ts): Inhalt vor dem Löschen sammeln, Aufbewahrung in
 * Jahren, Ansicht, Ausgabe als CSV oder PDF, alle Einträge für den Vollexport. Geschrieben wird im Kern
 * (kern/loeschprotokoll.ts, #961). Schicht 3 – bekommt den Kern und die Teile des Löschens (Dokumente je Mappe vom
 * Ausgang).
 */
import { Fachfehler } from '../fehler';
import { dokInfo, type Kern, type ProtokollMappe, versionInfo } from '../kern';
import { protokoll } from '../protokoll';
import type { Repo } from '../repo';
import { schriftstueckPdf } from '../schriftstueck';
import { t } from '../sprache';
import { csvAus } from '../xlsx';
import { datumText } from '../../../shared/src/archiv';
import { alsZeile, AUSLOESER, liesFilter, LOESCH_MAX, LOESCH_SPALTEN, type LoeschEintrag, LOESCHGRUENDE, LOESCHPROTOKOLL_JAHRE_MAX, LOESCHPROTOKOLL_STANDARD_JAHRE, LOESCHSCHRITTE, LOESCHWEGE } from '../../../shared/src/loeschprotokoll';
import type { Mappe } from '../../../shared/src/model';
import { zeitzone } from '../../../shared/src/region';
import { gebietsschema } from '../../../shared/src/sprache';
import type { LoeschenTeile } from './loeschen.dienst';

export class LoeschprotokollVerwaltung {
  constructor(private readonly kern: Kern, private readonly teile: LoeschenTeile) {}

  private get repo(): Repo { return this.kern.repo; }
  private get einstellungen() { return this.kern.einstellungen; }
  private dokumenteJeMappe(ids: string[]) { return this.teile.ausgang.dokumenteJeMappe(ids); }

  /** Lebende Mappen samt Dokumenten (aller Versionen) und Notizen – für Einträge vor dem Löschen. Demo-Mappen bleiben draußen. */
  async lebendInhalt(mappen: Mappe[]): Promise<ProtokollMappe[]> {
    const echt = mappen.filter((m) => !m.demo);
    if (!echt.length) return [];
    const ids = echt.map((m) => m.id);
    const typen = new Map((await this.repo.listeTypen()).map((t) => [t.id, t] as const));
    const dok = await this.dokumenteJeMappe(ids);
    const alle = [...dok.values()].flat();
    const versionen = alle.length ? await this.repo.versionenVonDokumenten(alle.map((d) => d.id)) : [];
    const notizen = await this.repo.notizenVon(ids);
    return echt.map((m) => {
      const d = dok.get(m.id) ?? [];
      const ds = new Set(d.map((x) => x.id));
      return { id: m.id, typId: m.typId, typ: typen.get(m.typId), werte: m.werte, notizen: notizen.filter((n) => n.mappeId === m.id).length,
        dokumente: [...d.map(dokInfo), ...versionen.filter((v) => ds.has(v.dokumentId)).map(versionInfo)] };
    });
  }

  async korbAlsInhalt(liste: Awaited<ReturnType<Repo['papierkorbInhalt']>>): Promise<ProtokollMappe[]> {
    const typen = new Map((await this.repo.listeTypen()).map((t) => [t.id, t] as const));
    return liste.filter((k) => !k.demo).map((k) => ({ id: k.id, typId: k.typId, typ: typen.get(k.typId), werte: k.werte, notizen: k.notizen, dokumente: k.dokumente, vorgang: k.vorgang }));
  }

  async loeschprotokollJahre(): Promise<number> {
    const e = this.einstellungen ? ((await this.einstellungen.lies('loeschprotokoll')) as { jahre?: number } | null) : null;
    return typeof e?.jahre === 'number' ? e.jahre : LOESCHPROTOKOLL_STANDARD_JAHRE;
  }

  async setzeLoeschprotokollJahre(eingabe: unknown, von: string): Promise<number> {
    if (!this.einstellungen) throw new Fachfehler(404, t('meldungen.dienst.einstellungen-sind-nicht'));
    const jahre = Number(eingabe);
    if (!Number.isInteger(jahre) || jahre < 1 || jahre > LOESCHPROTOKOLL_JAHRE_MAX) throw new Fachfehler(422, t('meldungen.dienst.bitte-eine-ganze-zahl-3', { LOESCHPROTOKOLL_JAHRE_MAX }));
    await this.einstellungen.schreibe('loeschprotokoll', { jahre });
    protokoll.modul('datenschutz').info('Aufbewahrung des Löschprotokolls geändert', { jahre, von });
    return jahre;
  }

  /** Ansicht (Werkbank → Datenschutz): Einträge nach Filter, neueste zuerst. */
  async loeschprotokoll(q: Record<string, unknown>) {
    const f = liesFilter(q);
    const r = await this.repo.loeschprotokoll(f);
    return { ...r, jahre: await this.loeschprotokollJahre(), max: f.max };
  }

  /** Ausgabe als CSV oder PDF (Nachweis); höchstens LOESCH_MAX × 10 Einträge. */
  async loeschprotokollAusgabe(q: Record<string, unknown>, format: 'csv' | 'pdf', x: { von: string; mandant: string; version: string }) {
    const f = { ...liesFilter(q), max: LOESCH_MAX * 10 };
    const { eintraege, gesamt } = await this.repo.loeschprotokoll(f);
    const tag = new Intl.DateTimeFormat('sv-SE', { timeZone: zeitzone() }).format(new Date());
    if (format === 'csv') { const b = csvAus(LOESCH_SPALTEN, eintraege.map(alsZeile)); return { name: t('meldungen.dienst.loeschprotokoll-csv', { tag }), mime: 'text/csv; charset=utf-8', inhalt: b }; }
    const zeit = (iso: string) => new Date(iso).toLocaleString(gebietsschema(), { timeZone: zeitzone(), dateStyle: 'short', timeStyle: 'short' });
    const filter = [f.von && `ab ${datumText(f.von)}`, f.bis && `bis ${datumText(f.bis)}`, f.typId && `Mappentyp ${eintraege.find((e) => e.typId === f.typId)?.typ ?? f.typId}`,
      f.grund && (f.grund === 'ohne' ? t('meldungen.dienst.ohne-grund') : LOESCHGRUENDE[f.grund]), f.schritt && LOESCHSCHRITTE[f.schritt], f.vorgang && `Vorgang ${f.vorgang}`, f.suche && `Suche „${f.suche}“`].filter(Boolean).join(', ');
    const b = await schriftstueckPdf({
      titel: t('meldungen.dienst.loeschprotokoll'), untertitel: x.mandant, quer: true,
      stand: t('meldungen.dienst.erstellt-am-von-ablago', { zeit: zeit(new Date().toISOString()), von: x.von, version: x.version, eintraege: eintraege.length, wert: gesamt > eintraege.length ? ` von ${gesamt}` : '', wert2: filter ? ` · Filter: ${filter}` : '' }),
      vorbemerkung: t('meldungen.dienst.nachweis-ueber-geloeschte-mappen'),
      abschnitte: [{ titel: t('meldungen.dienst.eintraege'), bloecke: [{ art: 'tabelle', breiten: [0.9, 0.85, 0.95, 0.8, 1.6, 2.1, 0.9, 1.0, 1.1], kopf: ['Zeit', 'Schritt', t('meldungen.dienst.mappentyp-nummer'), 'Wie', t('meldungen.dienst.mappe-dokument'), 'Inhalt', 'Von', 'Grund', 'Vorgang'],
        zeilen: eintraege.map((e) => [
          zeit(e.zeit), LOESCHSCHRITTE[e.schritt], [e.typ, e.nummer].filter(Boolean).join(' · '), LOESCHWEGE[e.weg] ?? e.weg,
          e.art === 'mappe' ? `Mappe ${e.mappeId}` : t('meldungen.dienst.dokument', { dokumentId: String(e.dokumentId), wert: e.version && e.version > 1 ? ` (Version ${e.version})` : '', wert2: e.archivnummer ? ` · Archivnummer ${e.archivnummer}` : '' }),
          e.art === 'mappe' ? (e.anzahl ? t('meldungen.dienst.dokumente-aeltere-versionen-notizen', { dokumente: e.anzahl.dokumente, versionen: e.anzahl.versionen, notizen: e.anzahl.notizen, verweise: e.anzahl.verweise }) : '')
            : t('meldungen.dienst.sha-256-bytes', { sha256: String(e.sha256), groesse: String(e.groesse), mime: String(e.mime), wert: e.seiten ? ` · ${e.seiten} Seiten` : '' }),
          `${e.von}${e.ausloeser !== 'benutzer' ? ` (${AUSLOESER[e.ausloeser]})` : ''}`, [e.grund ? LOESCHGRUENDE[e.grund] : '', e.grundText].filter(Boolean).join(': '), e.vorgang ? `${e.vorgang}${e.startId === e.mappeId ? ' (Start)' : ''}` : '',
        ]) }] }],
    });
    return { name: t('meldungen.dienst.loeschprotokoll-pdf', { tag }), mime: 'application/pdf', inhalt: b };
  }

  /** Für den Vollexport: alle Einträge (älteste zuerst). */
  async loeschprotokollAlle(): Promise<LoeschEintrag[]> {
    const { eintraege } = await this.repo.loeschprotokoll({ max: Number.MAX_SAFE_INTEGER });
    return eintraege.reverse();
  }
}
