/**
 * Erkennung lernt aus Korrekturen (#1681): Lernen beim Zuordnen einer Post in eine neue Mappe, gelernte Belege für
 * „Wohin gehört das?“, gelernte Kennwörter für „Aus Dokument ausfüllen“ und die Übersicht „Gelerntes“ in der Werkbank.
 * Die reinen Teile stehen in shared/src/gelerntes.ts. Gelerntes liegt in der Einstellung `gelerntes` – mit der Sicherung
 * und im Vollexport (struktur/gelerntes.json). Keine Werte aus Dokumenten ins Protokoll.
 */
import { randomUUID } from 'node:crypto';
import {
  aktiv,
  GELERNT_SICHERHEIT,
  GELERNTES_EINSTELLUNG,
  kennwortVor,
  lerne,
  liesGelerntes,
  wertNachKennwort,
  type Gelernt,
  type GelerntFuerWerkbank,
} from '../../../shared/src/gelerntes';
import { SICHER_AB, type Klassbeleg } from '../../../shared/src/klassifizierung';
import type { MappenBezug, Mappentyp, Wert } from '../../../shared/src/model';
import type { Einstellungen } from '../einstellungen/einstellungen';
import { Fachfehler } from '../grundlagen/fehler';
import type { Zugriff } from '../kern';
import { protokoll } from '../protokoll/protokoll';
import type { Repo } from '../repo';
import { t } from '../sprache/sprache';
import type { ErkennungDienst } from './erkennung-basis';

const log = protokoll.modul('ablage');

/** Was die Oberfläche beim Zuordnen mitschickt (#1681): Vorschlag von „Wohin gehört das?“ und Korrekturen an Feldern. */
interface LernEingabe {
  vorgeschlagen?: { typId?: unknown; sicherheit?: unknown } | null;
  felder?: unknown;
  bestaetigt?: unknown;
}

export class Gelerntes {
  constructor(
    private einst: () => Einstellungen | undefined,
    private repo: () => Repo,
    private d: Pick<ErkennungDienst, 'rechtepruefung'>,
  ) {}

  async alle(): Promise<Gelernt[]> {
    return liesGelerntes(await this.einst()?.lies(GELERNTES_EINSTELLUNG));
  }

  /** Ändern mit Prüfung, ob seitdem jemand anderes geschrieben hat (mehrere Prozesse): bis zu drei Versuche. */
  private async aendere(f: (l: Gelernt[]) => Gelernt[]): Promise<void> {
    const s = this.einst();
    if (!s) return;
    for (let i = 0; i < 3; i++) {
      const roh = (await s.lies(GELERNTES_EINSTELLUNG)) ?? null;
      const neu = f(liesGelerntes(roh));
      if (!s.tausche) return s.schreibe(GELERNTES_EINSTELLUNG, neu);
      if (await s.tausche(GELERNTES_EINSTELLUNG, roh, neu)) return;
    }
    log.warn('Gelerntes nicht gespeichert (gleichzeitig geändert)');
  }

  /** Eindeutig erkannter Absender einer Post (wie bei den Zielvorschlägen) – vor dem Zuordnen lesen. */
  async absenderVon(postId: string): Promise<string | null> {
    const e = (await this.repo().erkennungLies(postId))?.ergebnis as { eindeutig?: string | null } | undefined;
    return e?.eindeutig ?? null;
  }

  /** Absender der ersten Post unter diesen Mappen. */
  private async absenderUnter(mappen: readonly string[]): Promise<string | null> {
    for (const id of mappen) {
      const a = await this.absenderVon(id);
      if (a) return a;
    }
    return null;
  }

  /**
   * Lernen beim Zuordnen in eine neue Mappe (#1681): `l` von der Oberfläche; ohne Absender oder ohne `l` nichts. Kennwörter
   * aus dem Text der zugeordneten Dokumente.
   */
  async lerneAusZuordnen(
    absender: string | null,
    postId: string,
    e: { ziel?: unknown; dokumente?: unknown; lernen?: unknown },
    von: string | null,
  ): Promise<void> {
    const l = e.lernen as LernEingabe | undefined;
    if (!absender || !l || typeof l !== 'object' || typeof e.ziel !== 'string') return;
    const ziel = await this.repo().holeMappe(e.ziel);
    const typ = ziel ? await this.repo().holeTyp(ziel.typId) : undefined;
    if (!ziel || !typ) return;
    const v = l.vorgeschlagen;
    const korrektur = !!v && (v.typId !== typ.id || !(typeof v.sicherheit === 'number' && v.sicherheit >= SICHER_AB));
    const felder = await this.kennwoerter(typ, e.dokumente, l.felder);
    const bestaetigt = (Array.isArray(l.bestaetigt) ? l.bestaetigt : []).filter((x): x is string => typeof x === 'string');
    const am = new Date().toISOString();
    await this.aendere((liste) =>
      lerne(liste, { absender, typId: typ.id, post: ziel.id, von, am, korrektur, felder, bestaetigt, neueId: randomUUID }),
    );
    log.info('Erkennung hat aus einer Korrektur gelernt', { typ: typ.name, typGelernt: korrektur, felder: felder.length, post: postId });
  }

  /** Kennwörter der korrigierten Felder aus dem Text der Dokumente; Felder ohne Fund fallen weg. */
  private async kennwoerter(typ: Mappentyp, dokumente: unknown, felder: unknown): Promise<Array<{ feld: string; kennwort: string }>> {
    const liste = (Array.isArray(felder) ? felder : []).filter(
      (x): x is { feld: string; wert: Wert } => !!x && typeof x === 'object' && typeof (x as { feld?: unknown }).feld === 'string',
    );
    if (!liste.length) return [];
    const ids = (Array.isArray(dokumente) ? dokumente : []).filter((x): x is string => typeof x === 'string').slice(0, 10);
    const text = (await Promise.all(ids.map((id) => this.repo().volltext(id)))).filter(Boolean).join('\n\n');
    const erg: Array<{ feld: string; kennwort: string }> = [];
    for (const x of liste.slice(0, 50)) {
      const f = typ.felder.find((y) => y.key === x.feld && !y.system);
      const k = f && text ? kennwortVor(text, f, x.wert) : null;
      if (k) erg.push({ feld: x.feld, kennwort: k });
    }
    return erg;
  }

  /**
   * Gelernte Typen als Beleg für „Wohin gehört das?“ (#1681): je aktivem Eintrag des Absenders, jede Ablehnung halbiert.
   * Die Mappe, aus der gelernt wurde, geht als Bezug mit, wenn die Person sie lesen darf.
   */
  async typBelege(
    mappen: readonly string[],
    ziele: Mappentyp[],
    z?: Zugriff,
  ): Promise<{ belege: Array<Klassbeleg & { typId: string }>; bezuege: Record<string, MappenBezug> }> {
    const absender = await this.absenderUnter(mappen);
    if (!absender) return { belege: [], bezuege: {} };
    const ids = new Set(ziele.map((x) => x.id));
    const liste = (await this.alle()).filter((g) => aktiv(g) && g.art === 'typ' && g.absender === absender && ids.has(g.typId));
    if (!liste.length) return { belege: [], bezuege: {} };
    const lesbar = await this.d.rechtepruefung.lesbare(
      z,
      liste.flatMap((g) => (g.post ? [g.post] : [])),
    );
    const belege = liste.map((g) => ({
      typId: g.typId,
      weg: 'gelernt' as const,
      sicherheit: Math.round(GELERNT_SICHERHEIT * 0.5 ** g.abgelehnt * 100) / 100,
      gelernt: { am: g.am, von: g.von },
      ...(g.post && lesbar.has(g.post) ? { mappeId: g.post } : {}),
    }));
    const b = await this.repo().bezuege([...lesbar]);
    return { belege, bezuege: Object.fromEntries(b) };
  }

  /**
   * Gelernte Kennwörter für „Aus Dokument ausfüllen“ (#1681): je aktivem Eintrag des Absenders für diesen Typ der Wert
   * hinter dem Kennwort – geht vor dem, was die Erkennung sonst gefunden hat. Mit Hinweis „gelernt …“.
   */
  async feldVorschlaege(
    mappen: readonly string[],
    typ: Mappentyp,
    text: string,
  ): Promise<Record<string, { wert: Wert; fundstelle: string; hinweis: string }>> {
    const absender = text.trim() ? await this.absenderUnter(mappen) : null;
    if (!absender) return {};
    const erg: Record<string, { wert: Wert; fundstelle: string; hinweis: string }> = {};
    const liste = (await this.alle())
      .filter((g) => aktiv(g) && g.art === 'feld' && g.absender === absender && g.typId === typ.id)
      .sort((a, b) => b.am.localeCompare(a.am));
    for (const g of liste) {
      const f = typ.felder.find((x) => x.key === g.feld);
      if (!f || erg[f.key] || !g.kennwort) continue;
      const w = wertNachKennwort(text, f, g.kennwort);
      if (w)
        erg[f.key] = {
          ...w,
          hinweis: t('meldungen.erkennung.gelernt', { datum: g.am.slice(0, 10).split('-').reverse().join('.'), kennwort: g.kennwort }),
        };
    }
    return erg;
  }

  /** Übersicht „Gelerntes“ (Werkbank): alle Einträge, neueste zuerst; Titel nur von Mappen, die die Person lesen darf. */
  async liste(z?: Zugriff): Promise<GelerntFuerWerkbank[]> {
    const alle = (await this.alle()).sort((a, b) => b.am.localeCompare(a.am));
    const ids = [...new Set(alle.flatMap((g) => [g.absender, ...(g.post ? [g.post] : [])]))];
    const [lesbar, b] = await Promise.all([this.d.rechtepruefung.lesbare(z, ids), this.repo().bezuege(ids)]);
    const titel = (id?: string) => (id && lesbar.has(id) ? b.get(id)?.titel : undefined);
    return alle.map((g) => ({
      ...g,
      ...(titel(g.absender) !== undefined ? { absenderTitel: titel(g.absender) } : {}),
      ...(titel(g.post) !== undefined ? { mappeTitel: titel(g.post) } : {}),
    }));
  }

  /** Einen Eintrag löschen (Werkbank). */
  async loesche(id: string, von: string): Promise<{ geloescht: number }> {
    if (!(await this.alle()).some((g) => g.id === id)) throw new Fachfehler(404, t('meldungen.erkennung.gelernt-gibt-es-nicht'));
    await this.aendere((l) => l.filter((g) => g.id !== id));
    log.info('Gelerntes gelöscht', { von });
    return { geloescht: 1 };
  }

  /** „Alles für diesen Absender vergessen“ (Werkbank). */
  async vergiss(absender: string, von: string): Promise<{ geloescht: number }> {
    const n = (await this.alle()).filter((g) => g.absender === absender).length;
    await this.aendere((l) => l.filter((g) => g.absender !== absender));
    log.info('Gelerntes für einen Absender vergessen', { von, eintraege: n });
    return { geloescht: n };
  }
}
