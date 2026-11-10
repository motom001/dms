/**
 * Stempel-Vorlagen (#394, #1077 aus dienst.ts): Vorlagen und die Stempel-Einstellung je Mappentyp – beides in den
 * Einstellungen (Schlüssel „stempel“). Schicht 3 – bekommt nur den Kern. Welcher Stempel beim Weitergeben gilt,
 * entscheidet der Ausgang (`ausgang/`).
 */
import { randomUUID } from 'node:crypto';
import { Fachfehler } from '../fehler';
import type { Kern } from '../kern';
import { protokoll } from '../protokoll';
import type { Repo } from '../repo';
import { t } from '../sprache';
import { liesStempelTyp, liesVorlagen, NEUER_STEMPEL, pruefeVorlage, STEMPEL_MODI, STEMPEL_NAME_MAX, STEMPEL_VORLAGEN_MAX, stempelAus, type StempelTyp, type StempelVorlage, WEBDAV_VORLAGE } from '../../../shared/src/stempel';

export class Stempelvorlagen {
  constructor(private readonly kern: Kern) {}

  private get repo(): Repo { return this.kern.repo; }
  private get einstellungen() { return this.kern.einstellungen; }

  /** Vorlagen und Einstellung je Mappentyp – beides in den Einstellungen (Schlüssel „stempel“), ohne Migration. */
  async stempelDaten(): Promise<{ vorlagen: StempelVorlage[]; typen: Record<string, StempelTyp> }> {
    const roh = (await this.einstellungen?.lies('stempel')) as { vorlagen?: unknown; typen?: unknown } | null;
    const typen: Record<string, StempelTyp> = {};
    if (roh?.typen && typeof roh.typen === 'object') for (const [k, v] of Object.entries(roh.typen)) { const t = liesStempelTyp(v); if (t) typen[k] = t; }
    return { vorlagen: liesVorlagen(roh?.vorlagen), typen };
  }

  private async schreibeStempelDaten(d: { vorlagen: StempelVorlage[]; typen: Record<string, StempelTyp> }) {
    if (!this.einstellungen) throw new Fachfehler(409, t('meldungen.dienst.einstellungen-lassen-sich-hier'));
    await this.einstellungen.schreibe('stempel', d);
  }

  /** Vorlagen für alle Angemeldeten (zum Auswählen beim Weitergeben). */
  async stempelVorlagen(): Promise<StempelVorlage[]> { return (await this.stempelDaten()).vorlagen; }

  /** Vorlage anlegen (`id` null) oder ändern (Werkbank). */
  async speichereStempelVorlage(id: string | null, eingabe: unknown, von: string): Promise<StempelVorlage[]> {
    const d = await this.stempelDaten();
    const alt = id ? d.vorlagen.find((v) => v.id === id) : undefined;
    if (id && !alt) throw new Fachfehler(404, t('meldungen.dienst.diese-stempel-vorlage-gibt'));
    if (!id && d.vorlagen.length >= STEMPEL_VORLAGEN_MAX) throw new Fachfehler(422, t('meldungen.dienst.hoechstens-stempel-vorlagen', { STEMPEL_VORLAGEN_MAX }));
    const o = (eingabe ?? {}) as Record<string, unknown>;
    const name = String(o.name ?? alt?.name ?? '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, STEMPEL_NAME_MAX);
    // Neue Vorlagen beginnen mit 70 % und „wie Tinte“ (#799); gespeichert ist eine Umstellung erledigt (ohne `umgestellt`).
    const v: StempelVorlage = { id: alt?.id ?? randomUUID(), name, ...stempelAus(o, alt ?? NEUER_STEMPEL) };
    const fehler = pruefeVorlage(v, d.vorlagen.filter((x) => x.id !== v.id).map((x) => x.name));
    if (Object.keys(fehler).length) throw new Fachfehler(422, Object.values(fehler).join(' '), { felder: fehler });
    d.vorlagen = alt ? d.vorlagen.map((x) => (x.id === v.id ? v : x)) : [...d.vorlagen, v];
    await this.schreibeStempelDaten(d);
    protokoll.modul('werkbank').info(alt ? 'Stempel-Vorlage geändert' : 'Stempel-Vorlage angelegt', { name: v.name, text: v.text, von });
    return d.vorlagen;
  }

  /** Vorlage löschen – nicht, solange ein Mappentyp sie nutzt. */
  async loescheStempelVorlage(id: string, von: string): Promise<StempelVorlage[]> {
    const d = await this.stempelDaten();
    const v = d.vorlagen.find((x) => x.id === id);
    if (!v) throw new Fachfehler(404, t('meldungen.dienst.diese-stempel-vorlage-gibt'));
    const typen = await this.repo.listeTypen();
    const nutzer = Object.entries(d.typen).filter(([t, s]) => s.vorlage === id && typen.some((x) => x.id === t)).map(([t]) => typen.find((x) => x.id === t)!.name);
    if (nutzer.length) throw new Fachfehler(409, t('meldungen.dienst.die-vorlage-wird-noch', { anzahl: nutzer.length, name: v.name, map: nutzer.map((n) => `„${n}“`).join(', ') }));
    // Stempel beim Lesen über das Laufwerk (#722): ohne Angabe gilt die mitgelieferte Vorlage.
    const laufwerk = (await this.einstellungen?.lies('webdav')) as { stempel?: unknown } | null;
    if ((laufwerk && 'stempel' in laufwerk ? laufwerk.stempel : WEBDAV_VORLAGE) === id) throw new Fachfehler(409, t('api.webdav.vorlage-in-gebrauch', { name: v.name }));
    d.vorlagen = d.vorlagen.filter((x) => x.id !== id);
    await this.schreibeStempelDaten(d);
    protokoll.modul('werkbank').info('Stempel-Vorlage gelöscht', { name: v.name, von });
    return d.vorlagen;
  }

  /** Stempel-Einstellung eines Mappentyps prüfen (vor dem Speichern des Typs). */
  async pruefeStempelTyp(v: unknown): Promise<StempelTyp | null> {
    if (v && typeof v === 'object' && typeof (v as { modus?: unknown }).modus === 'string' && !((v as { modus: string }).modus in STEMPEL_MODI)) {
      throw new Fachfehler(422, t('meldungen.dienst.stempel-beim-weitergeben-unbekannte'), { allgemein: [t('meldungen.dienst.stempel-beim-weitergeben-unbekannte')], felder: {}, orte: ['stempel'] });
    }
    const eintrag = liesStempelTyp(v);
    if (eintrag?.vorlage && !(await this.stempelDaten()).vorlagen.some((x) => x.id === eintrag.vorlage)) {
      throw new Fachfehler(422, t('meldungen.dienst.stempel-beim-weitergeben-diese'), { allgemein: [t('meldungen.dienst.stempel-beim-weitergeben-diese')], felder: {}, orte: ['stempel'] });
    }
    return eintrag;
  }

  async setzeStempelTyp(typId: string, t: StempelTyp | null) {
    if (!this.einstellungen) return;
    const d = await this.stempelDaten();
    const vorher = d.typen[typId] ?? null;
    if (JSON.stringify(vorher) === JSON.stringify(t)) return;
    if (t) d.typen[typId] = t; else delete d.typen[typId];
    await this.schreibeStempelDaten(d);
    protokoll.modul('werkbank').info('Stempel beim Weitergeben eingestellt', { typ: typId, modus: t?.modus ?? 'aus', vorlage: t?.vorlage ?? null });
  }
}
