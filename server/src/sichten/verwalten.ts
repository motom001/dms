/**
 * Sichten verwalten (#38, #73, #148, #917; #1076 aus dienst.ts): Sichten für die Ablage, verborgene Sichten,
 * Testlauf, anlegen, ändern, löschen, ordnen, verschieben, Vorschau, eigene Sicht für einen Mappentyp, Belegung.
 * Schicht 3.
 */
import { randomUUID } from 'node:crypto';
import { ansichtSymbol } from '../../../shared/src/ansichtsymbole';
import { ausgangAus, bereinigeBeschriftungen, type TypTeile } from '../../../shared/src/beschriftung';
import type { Benutzer, Mappentyp } from '../../../shared/src/model';
import { ALLE_TYPEN } from '../../../shared/src/pakete';
import { bereinigeBedingungen, kinderVon, klauselnFuer, type Sicht, type SichtDaten, waereKreis } from '../../../shared/src/sichten';
import { alleSichtRechte, bereinigeSichtRegelwerk, sichtRegelProblem, type SichtRegelwerk, sichtTestlauf } from '../../../shared/src/sichtrechte';
import { Fachfehler } from '../fehler';
import type { Kern, Zugriff } from '../kern';
import { liesStand, TYP_TEILE } from '../mappentypen';
import { istUuid, KonfigurationVeraltet, type Repo } from '../repo';
import { t } from '../sprache';
import type { ZugriffDienst } from '../zugriff';

const text = (v: unknown) => (v == null ? '' : String(v)).trim();

/** Was das Verwalten der Sichten außer Kern und Rechteprüfung braucht – vom Dienst hereingereicht. */
export interface SichtenVerwaltungAnschluss {
  /** Konten (vom Start verbunden): Benutzer für den Testlauf (#148). */
  konten(): { benutzer?(): Promise<Benutzer[]> } | undefined;
}

export class SichtenVerwaltung {
  constructor(private readonly kern: Kern, private readonly rechte: ZugriffDienst, private readonly anschluss: SichtenVerwaltungAnschluss) {}

  private get repo(): Repo { return this.kern.repo; }
  private get konten() { return this.anschluss.konten(); }
  private aufloesung(benutzerId: string) { return this.rechte.aufloesung(benutzerId); }

  /* ---------- Sichten verwalten (#38) ---------- */

  /**
   * Sichten für die Ablage (#148): Administratoren alle mit Regeln; Benutzer nur die sichtbaren,
   * mit ihren Rechten daran und ohne die Regeln selbst.
   */
  async listeSichten(z?: Zugriff): Promise<Sicht[]> {
    const alle = await this.repo.listeSichten();
    if (!z || z.admin) return alle;
    const rechte = alleSichtRechte(alle, z.wer, false);
    return alle.filter((s) => rechte.get(s.id)?.R).map(({ berechtigungen: _b, ...s }) => ({ ...s, rechte: rechte.get(s.id)! }));
  }

  /** Ids der Sichten, die ein Benutzer nicht sehen darf (#148); Administratoren und ohne Zugriff: keine. */
  verborgeneSichten(alle: Sicht[], z?: Zugriff): Set<string> {
    if (!z || z.admin) return new Set();
    const rechte = alleSichtRechte(alle, z.wer, false);
    return new Set(alle.filter((s) => !rechte.get(s.id)?.R).map((s) => s.id));
  }

  /** Testlauf an einer Sicht (#148), auch mit ungespeicherten Regeln und Elternsicht. */
  async sichtTestlauf(e: unknown): Promise<unknown> {
    const x = (e ?? {}) as { sichtId?: unknown; benutzerId?: unknown; berechtigungen?: unknown; elternId?: unknown };
    const alle = await this.repo.listeSichten();
    const id = istUuid(x.sichtId) && alle.some((s) => s.id === x.sichtId) ? x.sichtId : randomUUID();
    const b = this.konten?.benutzer ? (await this.konten.benutzer()).find((y) => y.id === x.benutzerId) : undefined;
    if (!b) throw new Fachfehler(404, t('meldungen.dienst.diesen-benutzer-gibt-es'));
    const elternId = istUuid(x.elternId) && alle.some((s) => s.id === x.elternId) && !waereKreis(alle, id, x.elternId) ? x.elternId : null;
    const alt = alle.find((s) => s.id === id);
    const probe: Sicht[] = [...alle.filter((s) => s.id !== id), {
      ...(alt ?? { name: t('meldungen.dienst.neue-ansicht'), beschreibung: '', position: 0, typen: [], bedingungen: [], erstellt: '', geaendert: '' }),
      id, elternId, berechtigungen: bereinigeSichtRegelwerk(x.berechtigungen),
    }];
    const a = await this.aufloesung(b.id);
    if (b.rolle === 'admin') return { admin: true, benutzer: { id: b.id, name: b.name || b.email }, kette: [] };
    const kette = sichtTestlauf(probe, id, { id: b.id, rollen: a.meineRollen });
    return { admin: false, benutzer: { id: b.id, name: b.name || b.email }, kette, wirksam: kette.at(-1)?.stand };
  }

  private async bereinigeSicht(e: unknown, id: string, alle: Sicht[]): Promise<SichtDaten> {
    const x = (e ?? {}) as Record<string, unknown>;
    const name = ausgangAus(x.beschriftungen, 'name', text(x.name)).slice(0, 80);
    if (!name) throw new Fachfehler(422, t('meldungen.dienst.bitte-einen-namen-fuer'));
    const elternId = istUuid(x.elternId) ? x.elternId : null;
    if (elternId && !alle.some((s) => s.id === elternId)) throw new Fachfehler(422, t('meldungen.dienst.die-gewaehlte-elternsicht-gibt'));
    if (waereKreis(alle, id, elternId)) throw new Fachfehler(422, t('meldungen.dienst.eine-ansicht-kann-nicht'));
    const vorhanden = new Set((await this.repo.listeTypen()).map((t) => t.id));
    const gewaehlt = [...new Set((Array.isArray(x.typen) ? x.typen : []).map(String))];
    // „Alle Mappentypen“ (#725) steht allein; sonst nur vorhandene Typen.
    const typen = gewaehlt.includes(ALLE_TYPEN) ? [ALLE_TYPEN] : gewaehlt.filter((t) => vorhanden.has(t));
    const geschwister = kinderVon(alle.filter((s) => s.id !== id), elternId);
    // Ohne Stelle: bleibt die Elternsicht, bleibt auch die Stelle (#917) – sonst ans Ende der neuen Ebene.
    const bisher = alle.find((s) => s.id === id);
    const position = Number.isFinite(Number(x.position)) && x.position !== null && x.position !== undefined
      ? Math.trunc(Number(x.position))
      : bisher && bisher.elternId === elternId ? bisher.position : (geschwister.at(-1)?.position ?? 0) + 10;
    // Trefferliste (#75): nur der Schlüssel; passt er nicht (mehr), gilt der Standard und die Werkbank zeigt es an.
    const trefferliste = text(x.trefferliste).slice(0, 40) || null;
    // Berechtigungen (#148): fehlt die Angabe, bleiben sie, wie sie sind.
    const berechtigungen: SichtRegelwerk | null = 'berechtigungen' in x ? bereinigeSichtRegelwerk(x.berechtigungen) : alle.find((s) => s.id === id)?.berechtigungen ?? null;
    const probleme = (berechtigungen?.regeln ?? []).map((r) => sichtRegelProblem(r, !!elternId)).filter((p): p is string => !!p);
    if (probleme.length) throw new Fachfehler(422, t('meldungen.dienst.berechtigungen', { probleme: probleme.join(' ') }), { gruende: probleme, berechtigungen: true });
    // Symbol (#428): nur Namen aus der festen Auswahl; fehlt die Angabe, bleibt es, wie es ist.
    const symbol = 'symbol' in x ? ansichtSymbol(x.symbol) : alle.find((s) => s.id === id)?.symbol ?? null;
    // Beschriftungen je Sprache (#728): fehlt die Angabe, bleiben sie, wie sie sind.
    const beschriftungen = 'beschriftungen' in x ? bereinigeBeschriftungen<TypTeile>(x.beschriftungen, TYP_TEILE) : alle.find((s) => s.id === id)?.beschriftungen;
    return { name, beschreibung: ausgangAus(x.beschriftungen, 'beschreibung', text(x.beschreibung)).slice(0, 500), elternId, position, typen, bedingungen: bereinigeBedingungen(x.bedingungen), trefferliste, berechtigungen, symbol, beschriftungen };
  }

  async legeSichtAn(e: unknown): Promise<Sicht> {
    const alle = await this.repo.listeSichten();
    const id = randomUUID();
    return this.repo.legeSichtAn(id, await this.bereinigeSicht(e, id, alle));
  }

  /**
   * Ansicht ändern. Gleichzeitig bearbeiten (#917): Mit `stand` (ihr `geaendert`, wie gelesen) speichert Ablago nur,
   * wenn seitdem niemand die Ansicht geändert hat – sonst 409 und nichts geht verloren. Ohne `stand` keine Prüfung.
   */
  async aendereSicht(id: string, e: unknown): Promise<Sicht> {
    const alle = await this.repo.listeSichten();
    const alt = alle.find((s) => s.id === id);
    if (!alt) throw new Fachfehler(404, t('meldungen.dienst.diese-ansicht-gibt-es'));
    const stand = liesStand((e as { stand?: unknown } | null)?.stand, 'meldungen.dienst.stand-ungueltig');
    if (stand !== undefined && alt.geaendert !== stand) throw SichtenVerwaltung.konfigurationKonflikt('sicht', alt.geaendert);
    const d = await this.bereinigeSicht(e, id, alle);
    try { return await this.repo.aendereSicht(id, d, stand); }
    catch (f) { if (f instanceof KonfigurationVeraltet) throw SichtenVerwaltung.konfigurationKonflikt('sicht'); throw f; }
  }

  /** 409 „Jemand hat … inzwischen geändert“ (#917) für Mappentyp bzw. Ansicht; `aktuell` = der Stand jetzt. */
  static konfigurationKonflikt(art: 'typ' | 'sicht', aktuell?: string): Fachfehler {
    return new Fachfehler(409, t(art === 'typ' ? 'meldungen.dienst.typ-konflikt' : 'meldungen.dienst.sicht-konflikt'), { konflikt: true, ...(aktuell ? { stand: aktuell } : {}) });
  }

  /** Untersichten rücken eine Ebene nach oben, an die Stelle der gelöschten. */
  async loescheSicht(id: string): Promise<void> {
    const alle = await this.repo.listeSichten();
    const s = alle.find((x) => x.id === id);
    if (!s) throw new Fachfehler(404, t('meldungen.dienst.diese-ansicht-gibt-es'));
    // Neue Reihenfolge der Ebene: Geschwister davor, die Kinder, Geschwister danach.
    const ebene = kinderVon(alle, s.elternId).flatMap((g) => (g.id === id ? kinderVon(alle, id) : [g]));
    for (const [i, g] of ebene.entries()) {
      if (g.elternId !== s.elternId || g.position !== (i + 1) * 10) await this.repo.setzeSichtOrt(g.id, s.elternId, (i + 1) * 10);
    }
    await this.repo.loescheSicht(id);
  }

  /** Reihenfolge unter Geschwistern setzen: Ids in der gewünschten Reihenfolge. */
  async ordneSichten(elternId: unknown, ids: unknown): Promise<Sicht[]> {
    const alle = await this.repo.listeSichten();
    const eltern = istUuid(elternId) ? elternId : null;
    const geschwister = kinderVon(alle, eltern);
    const liste = Array.isArray(ids) ? ids.map(String) : [];
    if (liste.length !== geschwister.length || !geschwister.every((g) => liste.includes(g.id))) throw new Fachfehler(422, t('meldungen.dienst.die-reihenfolge-muss-genau'));
    for (const [i, sid] of liste.entries()) {
      const g = geschwister.find((x) => x.id === sid)!;
      if (g.position !== (i + 1) * 10) await this.repo.setzeSichtOrt(sid, g.elternId, (i + 1) * 10);
    }
    return this.repo.listeSichten();
  }

  /**
   * Sicht verschieben (Drag & Drop, #73): unter `elternId` (null = oberste Ebene) an die Stelle `stelle`
   * (0 = zuerst). Untersichten wandern mit; Kreise sind unmöglich.
   */
  async verschiebeSicht(id: string, elternId: unknown, stelle: unknown): Promise<Sicht[]> {
    const alle = await this.repo.listeSichten();
    const s = alle.find((x) => x.id === id);
    if (!s) throw new Fachfehler(404, t('meldungen.dienst.diese-ansicht-gibt-es'));
    const eltern = istUuid(elternId) ? elternId : null;
    if (eltern && !alle.some((x) => x.id === eltern)) throw new Fachfehler(422, t('meldungen.dienst.die-gewaehlte-elternsicht-gibt'));
    if (waereKreis(alle, id, eltern)) throw new Fachfehler(422, t('meldungen.dienst.eine-ansicht-kann-nicht'));
    const geschwister = kinderVon(alle.filter((x) => x.id !== id), eltern);
    const n = Number(stelle);
    const i = Number.isFinite(n) ? Math.max(0, Math.min(geschwister.length, Math.trunc(n))) : geschwister.length;
    const neu = [...geschwister.slice(0, i), s, ...geschwister.slice(i)];
    for (const [j, g] of neu.entries()) {
      const position = (j + 1) * 10;
      if (g.id === id ? g.elternId !== eltern || g.position !== position : g.position !== position) {
        await this.repo.setzeSichtOrt(g.id, g.id === id ? eltern : g.elternId, position);
      }
    }
    return this.repo.listeSichten();
  }

  /** Anzahl Treffer einer (noch nicht gespeicherten) Sicht – für die Vorschau in der Werkbank. */
  async sichtVorschau(ich: { id: string }, id: unknown, e: unknown): Promise<{ anzahl: number }> {
    const alle = await this.repo.listeSichten();
    const sid = istUuid(id) && alle.some((s) => s.id === id) ? id : randomUUID();
    const d = await this.bereinigeSicht(e, sid, alle);
    const probe: Sicht[] = [...alle.filter((s) => s.id !== sid), { ...d, id: sid, erstellt: '', geaendert: '' }];
    const typen = new Map((await this.repo.listeTypen()).map((t) => [t.id, t] as const));
    const [anzahl] = await this.repo.zaehleKlauseln([klauselnFuer(probe, sid, typen, await this.aufloesung(ich.id))]);
    return { anzahl };
  }

  /**
   * Eigene Sicht für einen Mappentyp, mit der Id des Typs (Lesezeichen bleiben gültig), auf der
   * obersten Ebene angehängt. Benutzer und Rolle stehen dabei immer am Ende.
   */
  async sichtFuerTyp(t: Mappentyp) {
    const alle = await this.repo.listeSichten();
    if (alle.some((s) => s.id === t.id)) return;
    const SYSTEM_AB = 100_000;
    const oben = kinderVon(alle, null).map((s) => s.position);
    const position = t.system
      ? Math.max(SYSTEM_AB, ...oben) + 10
      : Math.max(0, ...oben.filter((p) => p < SYSTEM_AB)) + 10;
    await this.repo.legeSichtAn(t.id, { name: t.name, beschreibung: t.beschreibung, elternId: null, position, typen: [t.id], bedingungen: [] });
  }

  async belegung(typId: string) {
    if (!(await this.repo.holeTyp(typId))) throw new Fachfehler(404, t('meldungen.dienst.diesen-mappentyp-gibt-es'));
    return this.repo.belegung(typId);
  }
}
