/**
 * Historie der Mappen (#57, #1074 aus dienst.ts): Einträge schreiben (über den Kern) und lesen, Änderungen lesbar
 * machen, Abrufe von Dateien (#800) und wie lange die Historie gelöschter Mappen bleibt. Schicht 2.
 */
import { ABRUF_ART, type Abruffassung, type Abrufweg, type Feld, type Feldaenderung, formatiere, type Historienart, historienartenVon, type Historieneintrag, historiengruppenVon, istLeer, type Mappentyp, verweisAusText, type Werte } from '../../../shared/src/model';
import { tagIn } from '../../../shared/src/region';
import { Fachfehler } from '../fehler';
import type { Kern } from '../kern';
import { protokoll } from '../protokoll';
import { istUuid, type Repo } from '../repo';
import { t } from '../sprache';

/** Höchstens so viele Einträge der Historie auf einer Seite (#800). */
export const HISTORIE_SEITE_MAX = 1000;
export const HISTORIE_STANDARD_TAGE = 365;

export class MappenHistorie {
  constructor(private readonly kern: Kern) {}

  private get repo(): Repo { return this.kern.repo; }
  private get einstellungen() { return this.kern.einstellungen; }

  /* ---------- Änderungshistorie (#57) ---------- */

  /** Ein Eintrag in die Historie einer Mappe (Kern). */
  notiere(mappeId: string, benutzerId: string | null, art: Historienart, daten?: Historieneintrag['daten']) { return this.kern.historie.schreibe(mappeId, benutzerId, art, daten); }

  /** Was sich zwischen zwei Ständen geändert hat – lesbar, wie es zu diesem Zeitpunkt aussah. */
  async aenderungen(typ: Mappentyp, alt: Werte, neu: Werte): Promise<Feldaenderung[]> {
    const gleich = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
    const felder = typ.felder.filter((f) => !gleich(alt[f.key], neu[f.key]) && !(istLeer(alt[f.key]) && istLeer(neu[f.key])));
    if (!felder.length) return [];
    const ids = felder.filter((f) => f.typ === 'referenz').flatMap((f) => [alt[f.key], neu[f.key]].flatMap((v) => (Array.isArray(v) ? v : v ? [v] : []))).map(String).filter(istUuid);
    const titel = await this.repo.titelVon(ids);
    const lesbar = (f: Feld, v: Werte[string] | undefined) => {
      const text2 = formatiere(f, v, (id) => titel.get(id) || t('meldungen.dienst.ohne-titel'));
      return text2.length > 500 ? `${text2.slice(0, 497)} …` : text2;
    };
    // Altes Textfeld neben seinem Verweis (#534): „Halter (Text)“ statt zweimal „Halter“.
    const label = (f: Feld) => (verweisAusText(typ, f) ? t('pakete.historie.alttext', { label: f.label }) : f.label);
    return felder.map((f) => (f.typ === 'passwort'
      ? { feld: f.key, label: label(f), geheim: true }
      : { feld: f.key, label: label(f), alt: lesbar(f, alt[f.key]), neu: lesbar(f, neu[f.key]) }));
  }

  /**
   * Historie einer Mappe (auch im Papierkorb). Ohne Angaben alle Einträge (wie bisher, auch für die API). #800: Mit
   * `register` nur, was dieses Register „Historie“ zeigt (seine Einstellung, sonst die Vorauswahl; ein unbekanntes
   * Register zeigt alles); mit `max` (1–1000) eine Seite, mit `vor` (Id des letzten Eintrags) die nächste.
   */
  async historie(mappeId: string, o: { register?: unknown; max?: unknown; vor?: unknown } = {}): Promise<Historieneintrag[]> {
    const m = (await this.repo.holeMappe(mappeId)) ?? (await this.repo.holeAusPapierkorb(mappeId));
    if (!m) throw new Fachfehler(404, t('meldungen.dienst.diese-mappe-gibt-es'));
    const zahl = (v: unknown) => (v === undefined || v === null || v === '' ? undefined : Number(v));
    const max = zahl(o.max), vor = zahl(o.vor);
    if (max !== undefined && (!Number.isInteger(max) || max < 1 || max > HISTORIE_SEITE_MAX)) throw new Fachfehler(422, t('meldungen.dienst.historie-max', { max: HISTORIE_SEITE_MAX }));
    if (vor !== undefined && !Number.isSafeInteger(vor)) throw new Fachfehler(422, t('meldungen.dienst.historie-vor'));
    let arten: string[] | undefined;
    if (typeof o.register === 'string' && o.register) {
      const reg = (await this.repo.holeTyp(m.typId))?.register.find((r) => r.key === o.register && r.art === 'protokoll');
      if (reg) arten = historienartenVon(historiengruppenVon(reg));
    }
    return this.repo.historie(mappeId, { ...(arten ? { arten } : {}), ...(max ? { max } : {}), ...(vor !== undefined ? { vor } : {}) });
  }

  /** Rauschen unterdrücken (#800): derselbe Abruf wird nacheinander geprüft und geschrieben, nicht gleichzeitig doppelt. */
  private readonly abrufeLaufend = new Map<string, Promise<boolean>>();

  /**
   * Abruf einer Datei in die Historie (#800): in der Oberfläche heruntergeladen, mit einem API-Schlüssel oder über das
   * WebDAV-Laufwerk abgerufen – mit Wer, Wann, Weg, Datei und Fassung. Ruft dieselbe Person dieselbe Datei (und
   * Fassung) auf demselben Weg am selben Kalendertag (Zeitzone der Ablage) noch einmal ab, bleibt es bei einem
   * Eintrag: Vorschaubilder und das mehrfache Lesen durch Explorer oder Office zählen so nur einmal. Ein Abruf an
   * einem späteren Tag bekommt einen eigenen Eintrag. Liefert, ob ein Eintrag geschrieben wurde.
   */
  async notiereAbruf(x: { dokumentId: string; benutzerId: string | null; weg: Abrufweg; fassung?: Abruffassung; version?: number | null; gestempelt?: boolean; schluessel?: string | null; datei?: string }): Promise<boolean> {
    const art = ABRUF_ART[x.weg];
    const fassung = x.fassung ?? 'original';
    const version = x.version ?? null;
    const k = [x.dokumentId, x.benutzerId ?? '', art, fassung, version ?? ''].join('|');
    const vorher = this.abrufeLaufend.get(k);
    const lauf = (vorher ?? Promise.resolve(false)).catch(() => false).then(async () => {
      const d = await this.repo.holeDokument(x.dokumentId);
      if (!d) return false;
      const jetzt = new Date();
      // Seit 26 Stunden über den Index der Mappe; „derselbe Tag“ entscheidet dann der Kalendertag in der Zeitzone.
      const letzter = await this.repo.letzterAbruf(d.mappeId, art, x.benutzerId, d.id, fassung, version, new Date(jetzt.getTime() - 26 * 3600_000).toISOString());
      if (letzter && tagIn(new Date(letzter)) === tagIn(jetzt)) return false;
      await this.notiere(d.mappeId, x.benutzerId, art, {
        dokument: d.name, dokumentId: d.id, weg: x.weg, fassung,
        ...(version !== null ? { version } : {}), ...(x.gestempelt ? { gestempelt: true } : {}),
        ...(x.schluessel ? { schluessel: x.schluessel } : {}), ...(x.datei && x.datei !== d.name ? { datei: x.datei } : {}),
      });
      return true;
    });
    this.abrufeLaufend.set(k, lauf);
    try { return await lauf; } finally { if (this.abrufeLaufend.get(k) === lauf) this.abrufeLaufend.delete(k); }
  }

  /** Wie lange die Historie endgültig gelöschter Mappen bleibt (Tage). */
  async historieTage(): Promise<number> {
    const e = this.einstellungen ? ((await this.einstellungen.lies('historie')) as { tage?: number } | null) : null;
    return typeof e?.tage === 'number' ? e.tage : HISTORIE_STANDARD_TAGE;
  }

  async setzeHistorieTage(eingabe: unknown): Promise<number> {
    if (!this.einstellungen) throw new Fachfehler(404, t('meldungen.dienst.einstellungen-sind-nicht'));
    const tage = Number(eingabe);
    if (!Number.isInteger(tage) || tage < 0 || tage > 36500) throw new Fachfehler(422, t('meldungen.dienst.bitte-eine-ganze-zahl'));
    await this.einstellungen.schreibe('historie', { tage });
    protokoll.modul('werkbank').info('Aufbewahrung der Historie gelöschter Mappen geändert', { tage });
    return tage;
  }
}
