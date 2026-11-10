/**
 * Archiv (#1074 aus dienst.ts): Archivnummern am Dokument (#345) mit Kreis und Aufkleberbogen, Archivmodus der Mappen
 * (#212: Frist, „darf weg“, Vorschau beim Einschalten) und „Alle Dateien prüfen“. Schicht 2.
 */
import { createHash } from 'node:crypto';
import { aufbewahrenBis, datumText, inFrist, JAHRE_MAX } from '../../../shared/src/archiv';
import type { Auftrag, Fortschritt, PhasenPlan } from '../../../shared/src/auftrag';
import type { Dokument } from '../../../shared/src/model';
import type { Nummernkreis } from '../../../shared/src/nummernkreis';
import { Fachfehler } from '../fehler';
import type { Kern, Zugriff } from '../kern';
import { ARCHIV_KREIS, bereinigeTyp } from '../mappentypen';
import { protokoll } from '../protokoll';
import { istUuid, type Repo } from '../repo';
import { t } from '../sprache';
import type { ZugriffDienst } from '../zugriff';
import type { MappenHistorie } from './historie';

/** Barcode-Präfix der Archivnummern (#345); der Kreis: ARCHIV_KREIS (mappentypen/nummernkreise.ts). */
export const ARCHIV_PRAEFIX = 'DMS-ASN:';
/** Eingabe → Archivnummer (Präfix aus dem Barcode weg, ohne Rand); leer → null. */
export function archivnummerAus(v: unknown): string | null {
  const t = String(v ?? '').trim().replace(/^DMS-ASN:/i, '').trim();
  return t || null;
}

/** Etikettenformat des Aufkleberbogens (Schlüssel von ETIKETTEN in aufkleber.ts). */
type Etikett = string;

/** Was das Archiv außer Kern und Rechteprüfung braucht – vom Dienst hereingereicht. */
export interface MappenArchivAnschluss {
  /** Aufkleberbogen (#345; aufkleber.ts, gezeichnet in der PDF-Stelle). */
  aufkleber: {
    ETIKETTEN: Record<Etikett, { spalten: number; zeilen: number }>;
    aufkleberPdf(nummern: string[], etikett: Etikett, start: number, praefix: string): Promise<Buffer>;
  };
  /** Aufträge im Hintergrund (auftrag.ts). */
  auftraege: { starte(art: string, titel: string, arbeit: (fortschritt: Fortschritt) => Promise<unknown>, phasen?: PhasenPlan[]): Auftrag };
  /** Fehlende Dateien für den Hinweis der Übersicht merken (#877; Dokumente, noch im Dienst). */
  schreibeFehlendeDateien(shas: string[]): Promise<unknown>;
}

export class MappenArchiv {
  constructor(private readonly kern: Kern, private readonly rechtepruefung: ZugriffDienst, private readonly historie: MappenHistorie, private readonly anschluss: MappenArchivAnschluss) {}

  private get repo(): Repo { return this.kern.repo; }
  private get dateien() { return this.kern.dateien; }
  private get auftraege() { return this.anschluss.auftraege; }
  private lesbare(...a: Parameters<ZugriffDienst['lesbare']>) { return this.rechtepruefung.lesbare(...a); }
  private notiere(...a: Parameters<MappenHistorie['notiere']>) { return this.historie.notiere(...a); }
  private schreibeFehlendeDateien(shas: string[]) { return this.anschluss.schreibeFehlendeDateien(shas); }

  /* ---------- Archivnummer (#345) ---------- */

  /** Der Nummernkreis der Archivnummern; entsteht beim ersten Gebrauch („A-000001“), Muster in der Werkbank änderbar. */
  async archivKreis(): Promise<Nummernkreis> {
    const da = (await this.repo.listeNummernkreise()).find((k) => k.schluessel === ARCHIV_KREIS);
    return da ?? this.repo.speichereNummernkreis({ schluessel: ARCHIV_KREIS, name: 'Archivnummer', muster: 'A-{zaehler:6}', start: 1 });
  }

  /** Archivnummer am Dokument setzen oder entfernen (leer); eindeutig je Haushalt. */
  async setzeArchivnummer(id: string, eingabe: unknown, von: string | null): Promise<Dokument> {
    const d = await this.repo.holeDokument(id);
    if (!d) throw new Fachfehler(404, t('meldungen.dienst.dieses-dokument-gibt-es'));
    const nr = archivnummerAus(eingabe);
    if (nr && nr.length > 40) throw new Fachfehler(422, t('meldungen.dienst.die-archivnummer-ist-zu'));
    if (nr && /\s/.test(nr)) throw new Fachfehler(422, t('meldungen.dienst.die-archivnummer-darf-keine'));
    if ((d.archivnummer ?? null) === nr) return d;
    if (!(await this.repo.setzeArchivnummer(id, nr))) {
      throw new Fachfehler(409, t('meldungen.dienst.die-archivnummer-hat-schon', { nr: String(nr) }));
    }
    await this.notiere(d.mappeId, von, 'archivnummer', { dokument: d.name, text: nr ? `${d.name}: ${nr}` : `${d.name}: entfernt`, alt: d.archivnummer ?? null, neu: nr });
    protokoll.modul('dokumente').info(nr ? 'Archivnummer gesetzt' : 'Archivnummer entfernt', { id, nr, vorher: d.archivnummer ?? undefined });
    return (await this.repo.holeDokument(id))!;
  }

  /** Dokument zu einer Archivnummer (auch mit Präfix aus dem Barcode); nur, wenn die Mappe lesbar ist. */
  async findeArchivnummer(eingabe: unknown, z?: Zugriff) {
    const nr = archivnummerAus(eingabe);
    const d = nr ? await this.repo.findeArchivnummer(nr) : undefined;
    const m = d ? await this.repo.holeMappe(d.mappeId) : undefined;
    if (!d || !m || !(await this.lesbare(z, [m.id])).has(m.id)) throw new Fachfehler(404, t('meldungen.dienst.zur-archivnummer-gibt-es', { wert: nr ?? '' }));
    return { dokument: d, mappeId: m.id, typId: m.typId, titel: m.titel ?? '' };
  }

  /**
   * Aufkleberbogen (#345): `anzahl` neue Nummern aus dem Kreis „Archivnummer“ ziehen – gedruckte Nummern
   * gelten als vergeben – und als PDF für das gewählte Etikettenformat ab Feld `start`.
   */
  async archivAufkleber(eingabe: unknown, von: string) {
    const { ETIKETTEN, aufkleberPdf } = this.anschluss.aufkleber;
    const e = (eingabe ?? {}) as Record<string, unknown>;
    const anzahl = Number(e.anzahl ?? 0);
    const etikett = String(e.etikett ?? '48x25') as Etikett;
    const start = Number(e.start ?? 1);
    if (!(etikett in ETIKETTEN)) throw new Fachfehler(422, t('meldungen.dienst.unbekanntes-etikettenformat'));
    const f = ETIKETTEN[etikett];
    if (!Number.isInteger(anzahl) || anzahl < 1 || anzahl > 500) throw new Fachfehler(422, t('meldungen.dienst.bitte-1-bis-500'));
    if (!Number.isInteger(start) || start < 1 || start > f.spalten * f.zeilen) throw new Fachfehler(422, t('meldungen.dienst.das-startfeld-muss-zwischen', { wert: f.spalten * f.zeilen }));
    await this.archivKreis();
    const nummern = await this.repo.zieheNummern(ARCHIV_KREIS, anzahl, new Date());
    const pdf = await aufkleberPdf(nummern, etikett, start, ARCHIV_PRAEFIX);
    protokoll.modul('werkbank').info('Aufkleber mit Archivnummern erzeugt', { von, anzahl, erste: nummern[0], letzte: nummern[nummern.length - 1], etikett });
    return { pdf, erste: nummern[0], letzte: nummern[nummern.length - 1] };
  }

  /* ---------- Archivmodus (#212) ---------- */

  async pruefeArchivDokument(mappeId: string, was: string) {
    const m = await this.repo.holeMappe(mappeId);
    const typ = m ? await this.repo.holeTyp(m.typId) : undefined;
    const bis = m ? aufbewahrenBis(typ?.archiv, m) : null;
    if (inFrist(bis)) throw new Fachfehler(409, t('meldungen.dienst.aufbewahrungspflicht-bis-dokumente', { datumText: datumText(bis!), was }), { aufbewahrenBis: bis });
  }

  /** Vorschau beim Einschalten: wie viele Mappen betroffen, wie viele schon „darf weg“. */
  async archivVorschau(typId: string, e: unknown) {
    const typ = istUuid(typId) ? await this.repo.holeTyp(typId) : undefined;
    const archiv = bereinigeTyp({ felder: typ?.felder ?? [], archiv: e }).archiv;
    if (!archiv) throw new Fachfehler(422, t('meldungen.dienst.bitte-eine-frist-von', { JAHRE_MAX }));
    const mappen = typ ? await this.repo.listeMappen(typ.id) : [];
    return { mappen: mappen.length, darfWeg: mappen.filter((m) => !inFrist(aufbewahrenBis(archiv, m))).length };
  }

  /** „Darf weg“: Mappen in Typen mit Archivmodus, deren Frist abgelaufen ist. Gelöscht wird nichts automatisch. */
  async darfWeg() {
    const erg: Array<{ id: string; typId: string; typ: string; titel: string; aufbewahrenBis: string }> = [];
    for (const t of (await this.repo.listeTypen()).filter((x) => x.archiv)) {
      for (const m of await this.repo.listeMappen(t.id)) {
        const bis = aufbewahrenBis(t.archiv, m);
        if (bis && !inFrist(bis)) erg.push({ id: m.id, typId: t.id, typ: t.name, titel: m.titel ?? '', aufbewahrenBis: bis });
      }
    }
    return erg.sort((a, b) => a.aufbewahrenBis.localeCompare(b.aufbewahrenBis) || a.titel.localeCompare(b.titel, 'de'));
  }

  /** Integrität (#212): jede Datei gegen ihren Prüfwert; als Auftrag im Hintergrund. */
  pruefeDateien(von: string) {
    return this.auftraege.starte('dateien-pruefen', 'Alle Dateien prüfen', async (fortschritt) => {
      const alle = await this.repo.alleDateien();
      const shas = [...new Set(alle.map((x) => x.sha256))];
      const abweichungen: Array<{ sha256: string; grund: string; dokumente: typeof alle }> = [];
      const fehlend: string[] = [];
      for (const [i, sha] of shas.entries()) {
        let grund: string | null = null;
        try {
          const s = await this.dateien.lies(sha);
          const h = createHash('sha256');
          if (Buffer.isBuffer(s)) h.update(s); else for await (const teil of s) h.update(teil as Buffer);
          if (h.digest('hex') !== sha) grund = t('meldungen.dienst.inhalt-veraendert');
        } catch { grund = t('meldungen.dienst.datei-fehlt'); fehlend.push(sha); }
        if (grund) abweichungen.push({ sha256: sha, grund, dokumente: alle.filter((x) => x.sha256 === sha) });
        fortschritt(i + 1, shas.length);
      }
      // Hinweis der Übersicht (#877): Die Prüfung kennt jetzt alle fehlenden Dateien.
      await this.schreibeFehlendeDateien(fehlend).catch(() => {});
      const log = protokoll.modul('werkbank');
      if (abweichungen.length) log.error('Dateien prüfen: Abweichungen gefunden', { von, dateien: shas.length, abweichungen: abweichungen.length, erste: abweichungen[0].dokumente[0]?.name });
      else log.info('Dateien prüfen: alle in Ordnung', { von, dateien: shas.length });
      return { dateien: shas.length, abweichungen };
    }, [{ key: 'dateien', name: 'Dateien prüfen', einheit: 'Dateien' }]);
  }
}
