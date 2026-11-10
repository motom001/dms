/**
 * Passwortfelder (#46, #1074 aus dienst.ts): Lassen sich Passwörter speichern, welche sind mit dem Schlüssel nicht
 * lesbar, Klartext zum Anzeigen und für die API (je Abruf im Protokoll und in der Historie). Schicht 2.
 */
import { istPasswortWert, type Mappe, type Werte } from '../../../shared/src/model';
import { Fachfehler } from '../fehler';
import type { Kern } from '../kern';
import { protokoll } from '../protokoll';
import type { Repo } from '../repo';
import { t } from '../sprache';
import type { MappenHistorie } from './historie';

/**
 * Passwortfeld (#46): neues Passwort verschlüsseln, entfernen oder das bisherige behalten.
 * - { neu: '…' } oder ein Text: neues Passwort
 * - null, '' oder { entfernen: true }: entfernen
 * - fehlt oder { gesetzt: true } (so, wie die Oberfläche es bekam): unverändert
 */
export function passwortWert(eingabe: unknown, hatEingabe: boolean, bisher: unknown, verschluessele: (k: string) => string): Werte[string] {
  // Ohne Eingabe oder unverändert durchgereicht (System, z. B. beim Nachziehen einer Benutzer-Mappe): behalten.
  if (!hatEingabe || (eingabe === bisher && eingabe !== undefined)) return (bisher ?? null) as Werte[string];
  if (eingabe === null || eingabe === '') return null;
  if (typeof eingabe === 'string') {
    if (eingabe.startsWith('dms1$')) throw new Fachfehler(422, t('meldungen.dienst.verschluesselte-werte-lassen-sich'));
    return verschluessele(eingabe.slice(0, 1000));
  }
  if (istPasswortWert(eingabe)) {
    if (eingabe.entfernen) return null;
    if (typeof eingabe.neu === 'string' && eingabe.neu !== '') return verschluessele(eingabe.neu.slice(0, 1000));
    return (eingabe.gesetzt ? bisher ?? null : null) as Werte[string];
  }
  throw new Fachfehler(422, t('meldungen.dienst.ungueltiger-wert-fuer-ein'));
}

export const keinSchluessel = (): never => {
  throw new Fachfehler(409, t('meldungen.dienst.passwoerter-lassen-sich-erst'));
};

/** Ein unlesbares Passwortfeld für die Werkbank (wie `Betroffen` in geheimnisse.ts). */
type Betroffen = { bereich: string; was: string; wo?: string };

/** Was die Passwortfelder außer dem Kern brauchen – vom Dienst hereingereicht. */
export interface PasswortfelderAnschluss {
  /** Der Schlüssel (#39, #46; tresor.ts, beim Start gesetzt). */
  tresor(): { readonly bereit: boolean; lesbar(wert: unknown): boolean; entschluessele(wert: string): string | null } | undefined;
  /** Ist ein Wert verschlüsselt (tresor.ts)? */
  istVerschluesselt(v: unknown): v is string;
}

export class Passwortfelder {
  constructor(private readonly kern: Kern, private readonly historie: MappenHistorie, private readonly anschluss: PasswortfelderAnschluss) {}

  private get repo(): Repo { return this.kern.repo; }
  private get tresor() { return this.anschluss.tresor(); }
  private istVerschluesselt(v: unknown): v is string { return this.anschluss.istVerschluesselt(v); }
  private notiere(...a: Parameters<MappenHistorie['notiere']>) { return this.historie.notiere(...a); }

  /* ---------- Passwortfelder (#46) ---------- */

  /** Lassen sich gerade Passwörter speichern? */
  get passwoerterMoeglich() { return !!this.tresor?.bereit; }

  /** Passwortfelder, die mit dem vorhandenen Schlüssel nicht lesbar sind (für die Werkbank). */
  async unlesbarePasswoerter(): Promise<Betroffen[]> {
    const out: Betroffen[] = [];
    for (const mappentyp of await this.repo.listeTypen()) {
      const felder = mappentyp.felder.filter((f) => f.typ === 'passwort');
      if (!felder.length) continue;
      for (const m of await this.repo.listeMappen(mappentyp.id)) {
        for (const f of felder) {
          const v = m.werte[f.key];
          if (this.istVerschluesselt(v) && !this.tresor?.lesbar(v)) out.push({ bereich: mappentyp.name, was: `${m.titel || t('meldungen.dienst.mappe-ohne-titel')}: ${f.label}`, wo: t('meldungen.dienst.in-der-ablage-neu') });
        }
      }
    }
    return out;
  }

  /** Klartext eines Passworts zum Anzeigen; jeder Aufruf steht im Protokoll (ohne den Wert). */
  async zeigePasswort(mappeId: string, feldKey: string, benutzerId: string | null = null): Promise<{ wert: string }> {
    const m = await this.repo.holeMappe(mappeId);
    if (!m) throw new Fachfehler(404, t('meldungen.dienst.diese-mappe-gibt-es'));
    const typ = await this.repo.holeTyp(m.typId);
    const f = typ?.felder.find((x) => x.key === feldKey && x.typ === 'passwort');
    if (!f) throw new Fachfehler(404, t('meldungen.dienst.dieses-passwortfeld-gibt-es'));
    const v = m.werte[f.key];
    if (!this.istVerschluesselt(v)) throw new Fachfehler(404, t('meldungen.dienst.in-diesem-feld-ist'));
    const klar = this.tresor?.entschluessele(v) ?? null;
    if (klar === null) throw new Fachfehler(409, t('meldungen.dienst.dieses-passwort-ist-nicht'));
    protokoll.modul('ablage').info('Passwort angezeigt', { mappe: m.titel || m.id, mappeId: m.id, feld: f.label });
    await this.notiere(m.id, benutzerId, 'passwort_angezeigt', { feld: f.label });
    return { wert: klar };
  }

  /**
   * Für die API mit dem Recht „Passwörter lesen“: Passwörter einer oder mehrerer Mappen
   * im Klartext; je Mappe ein Protokolleintrag (ohne die Werte).
   */
  async entschluesselePasswoerter<T extends Mappe>(mappen: T[], wer: string, benutzerId: string | null = null): Promise<T[]> {
    const typen = new Map((await this.repo.listeTypen()).map((t) => [t.id, t]));
    const historie: Parameters<Repo['historieSchreibe']>[0] = [];
    const ergebnis = mappen.map((m) => {
      const felder = typen.get(m.typId)?.felder.filter((f) => f.typ === 'passwort' && this.istVerschluesselt(m.werte[f.key])) ?? [];
      if (!felder.length) return m;
      const werte = { ...m.werte };
      for (const f of felder) werte[f.key] = this.tresor?.entschluessele(werte[f.key] as string) ?? null;
      protokoll.modul('ablage').info('Passwörter über die API abgerufen', { mappe: m.titel || m.id, mappeId: m.id, felder: felder.map((f) => f.label).join(', '), schluessel: wer });
      historie.push({ mappeId: m.id, benutzerId, art: 'passwort_angezeigt', daten: { feld: felder.map((f) => f.label).join(', '), api: wer } });
      return { ...m, werte };
    });
    await this.repo.historieSchreibe(historie);
    return ergebnis;
  }
}
