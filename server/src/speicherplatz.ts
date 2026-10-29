import type { Einstellungen } from './einstellungen';
import { Fachfehler } from './fehler';
import { belegung, statfsMesser, type Messer, type Ordner, type OrdnerBelegung } from './ordner';
import { protokoll } from './protokoll';
import type { Wartung } from './wartung';

/**
 * Speicherplatz-Überwachung (#116) in zwei Stufen:
 *   Warnschwelle – Hinweis in der Werkbank und einmal je Unterschreiten eine Mail an die Admins.
 *   Grenze       – Hochladen sofort gesperrt; der Wartungsmodus startet mit 5 Minuten Vorlauf
 *                  („Speicherplatzlimit erreicht“) und endet nicht von selbst.
 * Gemessen werden die festen Ordner (#115) jede Minute und vor jedem Hochladen.
 */

const log = protokoll.modul('system');
export const LIMIT_TEXT = 'Speicherplatzlimit erreicht';
export const VORLAUF_MIN = 5;
const GB = 1024 ** 3;

export type Einheit = 'prozent' | 'gb';
export interface Schwelle { wert: number; einheit: Einheit }
export interface SpeicherplatzEinstellung { warnung: Schwelle; grenze: Schwelle }
export const SP_STANDARD: SpeicherplatzEinstellung = { warnung: { wert: 10, einheit: 'prozent' }, grenze: { wert: 2, einheit: 'gb' } };

export type SpZustand = 'ok' | 'warnung' | 'grenze';
export interface OrdnerStand extends OrdnerBelegung { zustand: SpZustand | null; warnBytes: number | null; grenzBytes: number | null }
export interface SpeicherplatzStand {
  zustand: SpZustand;
  gemessen: string;
  ordner: OrdnerStand[];
  einstellung: SpeicherplatzEinstellung;
  /** Seit wann der aktuelle Zustand gilt (ISO). */
  seit: string | null;
  /** Die Grenze hat den Wartungsmodus ausgelöst, der noch läuft – der Platz reicht aber wieder. */
  wartungBeenden: boolean;
}

interface Gemerkt { zustand: SpZustand; seit: string; gewarnt: boolean; ausgeloest: boolean }

export interface SpeicherplatzDeps {
  einstellungen: Einstellungen;
  wartung?: Wartung;
  anAdmins?: (betreff: string, text: string) => Promise<void>;
  messer?: Messer;
  jetzt?: () => Date;
}

export const gbText = (b: number) => `${(b / GB).toFixed(1).replace('.', ',')} GB`;
const schwelleText = (s: Schwelle) => (s.einheit === 'prozent' ? `${String(s.wert).replace('.', ',')} %` : `${String(s.wert).replace('.', ',')} GB`);

/** Schwelle in Bytes für einen Datenträger dieser Größe. */
export function inBytes(s: Schwelle, gesamt: number): number {
  return s.einheit === 'prozent' ? Math.round((gesamt * s.wert) / 100) : Math.round(s.wert * GB);
}

function pruefeSchwelle(x: unknown, alt: Schwelle, name: string): Schwelle {
  const o = (x && typeof x === 'object' ? x : {}) as Partial<Schwelle>;
  const einheit = o.einheit === undefined ? alt.einheit : o.einheit;
  if (einheit !== 'prozent' && einheit !== 'gb') throw new Fachfehler(422, `${name}: Einheit ist „prozent“ oder „gb“.`);
  const wert = o.wert === undefined ? alt.wert : Number(o.wert);
  if (!Number.isFinite(wert) || wert < 0) throw new Fachfehler(422, `${name}: Bitte eine Zahl ab 0 angeben.`);
  if (einheit === 'prozent' && wert > 90) throw new Fachfehler(422, `${name}: höchstens 90 %.`);
  if (einheit === 'gb' && wert > 100_000) throw new Fachfehler(422, `${name}: höchstens 100.000 GB.`);
  return { wert: Math.round(wert * 10) / 10, einheit };
}

export class Speicherplatz {
  private letzte: SpeicherplatzStand | null = null;
  private zeitgeber?: NodeJS.Timeout;
  private messer: Messer;
  private jetzt: () => Date;

  constructor(readonly ordner: Ordner, private d: SpeicherplatzDeps) {
    this.messer = d.messer ?? statfsMesser;
    this.jetzt = d.jetzt ?? (() => new Date());
  }

  async einstellung(): Promise<SpeicherplatzEinstellung> {
    const g = (await this.d.einstellungen.lies('speicherplatz')) as Partial<SpeicherplatzEinstellung> | null;
    return { warnung: { ...SP_STANDARD.warnung, ...(g?.warnung ?? {}) }, grenze: { ...SP_STANDARD.grenze, ...(g?.grenze ?? {}) } };
  }

  async speichere(x: unknown, von: string): Promise<SpeicherplatzStand> {
    const alt = await this.einstellung();
    const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
    const neu = { warnung: pruefeSchwelle(o.warnung, alt.warnung, 'Warnschwelle'), grenze: pruefeSchwelle(o.grenze, alt.grenze, 'Grenze') };
    if (neu.warnung.einheit === neu.grenze.einheit && neu.warnung.wert < neu.grenze.wert) {
      throw new Fachfehler(422, 'Die Warnschwelle muss mindestens so viel freien Platz verlangen wie die Grenze – sonst käme die Warnung erst nach der Grenze.');
    }
    await this.d.einstellungen.schreibe('speicherplatz', neu);
    log.info('Speicherplatz-Schwellen geändert', { von, warnung: schwelleText(neu.warnung), grenze: schwelleText(neu.grenze) });
    return this.pruefe();
  }

  /** Nur messen und bewerten, ohne Folgen. */
  async messe(): Promise<SpeicherplatzStand> {
    const e = await this.einstellung();
    const roh = await belegung(this.ordner, this.messer);
    const ordner: OrdnerStand[] = roh.map((o) => {
      if (o.gesamt === null || o.frei === null) return { ...o, zustand: null, warnBytes: null, grenzBytes: null };
      const warnBytes = inBytes(e.warnung, o.gesamt), grenzBytes = inBytes(e.grenze, o.gesamt);
      return { ...o, warnBytes, grenzBytes, zustand: o.frei < grenzBytes ? 'grenze' : o.frei < warnBytes ? 'warnung' : 'ok' };
    });
    const zustand: SpZustand = ordner.some((o) => o.zustand === 'grenze') ? 'grenze' : ordner.some((o) => o.zustand === 'warnung') ? 'warnung' : 'ok';
    const g = await this.gemerkt();
    const w = this.d.wartung?.stand;
    return {
      zustand, gemessen: this.jetzt().toISOString(), ordner, einstellung: e,
      seit: g?.zustand === zustand ? g.seit : null,
      wartungBeenden: zustand !== 'grenze' && !!w && w.stufe !== 'aus' && w.ausloeser === 'speicherplatz',
    };
  }

  private async gemerkt(): Promise<Gemerkt | null> { return (await this.d.einstellungen.lies('speicherplatz_stand')) as Gemerkt | null; }

  /** Letzte Messung (für die Übersicht), sonst neu messen. */
  async stand(): Promise<SpeicherplatzStand> { return this.letzte && Date.now() - Date.parse(this.letzte.gemessen) < 60_000 ? this.letzte : this.pruefe(); }

  /** Messen und auf Übergänge reagieren: Warnung, Grenze, wieder genug Platz. */
  async pruefe(): Promise<SpeicherplatzStand> {
    const s = await this.messe();
    const alt = await this.gemerkt() ?? { zustand: 'ok' as SpZustand, seit: s.gemessen, gewarnt: false, ausgeloest: false };
    const neu: Gemerkt = { ...alt };
    if (s.zustand !== alt.zustand) { neu.zustand = s.zustand; neu.seit = s.gemessen; }
    const knapp = s.ordner.filter((o) => o.zustand && o.zustand !== 'ok').map((o) => `${o.pfad}: ${o.frei !== null ? gbText(o.frei) : '?'} frei von ${o.gesamt !== null ? gbText(o.gesamt) : '?'}`);

    if (s.zustand === 'ok') {
      if (alt.zustand !== 'ok') log.info('Speicherplatz wieder ausreichend', { ordner: s.ordner.map((o) => `${o.pfad}: ${o.frei !== null ? gbText(o.frei) : '?'} frei`).join('; ') });
      neu.gewarnt = false; neu.ausgeloest = false;
    } else if (s.zustand === 'warnung') {
      if (alt.zustand === 'grenze') log.info('Speicherplatz wieder über der Grenze, aber unter der Warnschwelle', { ordner: knapp.join('; ') });
      neu.ausgeloest = false;
      if (!alt.gewarnt) {
        neu.gewarnt = true;
        log.warn('Speicherplatz knapp: Warnschwelle unterschritten', { warnschwelle: schwelleText(s.einstellung.warnung), ordner: knapp.join('; ') });
        await this.mail('Speicherplatz wird knapp',
          `Der freie Speicherplatz des DMS liegt unter der Warnschwelle (${schwelleText(s.einstellung.warnung)}):\n\n${knapp.join('\n')}\n\n`
          + `Unter der Grenze (${schwelleText(s.einstellung.grenze)}) sperrt das DMS das Hochladen und geht in den Wartungsmodus. `
          + 'Schaffe rechtzeitig Platz (alte Sicherungen löschen, Papierkorb leeren) oder vergrößere den Speicher. Details: Werkbank → Speicherplatz.');
      }
    } else {
      neu.gewarnt = true;
      if (!alt.ausgeloest) {
        neu.ausgeloest = true;
        log.error('Speicherplatzlimit erreicht: Hochladen gesperrt, Wartungsmodus startet', { grenze: schwelleText(s.einstellung.grenze), ordner: knapp.join('; ') });
        const an = await this.d.wartung?.automatisch('speicherplatz', LIMIT_TEXT, VORLAUF_MIN);
        await this.mail(LIMIT_TEXT,
          `Der freie Speicherplatz des DMS liegt unter der Grenze (${schwelleText(s.einstellung.grenze)}):\n\n${knapp.join('\n')}\n\n`
          + 'Das Hochladen ist ab sofort gesperrt. '
          + (an ? `In ${VORLAUF_MIN} Minuten startet der Wartungsmodus; danach können nur Administratoren arbeiten. ` : 'Der Wartungsmodus ist bereits an. ')
          + 'Schaffe in der Werkbank Platz (alte Sicherungen löschen, Papierkorb leeren) und beende danach den Wartungsmodus selbst – er endet nicht von allein.');
      }
    }
    if (JSON.stringify(neu) !== JSON.stringify(alt)) await this.d.einstellungen.schreibe('speicherplatz_stand', neu);
    this.letzte = { ...s, seit: neu.seit, wartungBeenden: s.wartungBeenden };
    return this.letzte;
  }

  /** Vor jedem Hochladen: an der Grenze ist das Hochladen gesperrt (507 Insufficient Storage). */
  async pruefeHochladen() {
    let s: SpeicherplatzStand;
    try { s = await this.messe(); } catch { return; } // Messung gestört: nicht blockieren
    const vorher = this.letzte?.zustand;
    this.letzte = s;
    if (s.zustand === 'grenze') {
      if (vorher !== 'grenze') void this.pruefe().catch(() => {});
      const o = s.ordner.find((x) => x.zustand === 'grenze');
      throw new Fachfehler(507, `${LIMIT_TEXT}: Hochladen ist gesperrt${o?.frei != null ? ` (${gbText(o.frei)} frei)` : ''}. Bitte wende dich an deinen Administrator.`);
    }
  }

  start(ms = 60_000) {
    const lauf = () => void this.pruefe().catch((e) => log.error('Speicherplatz prüfen fehlgeschlagen', { fehler: (e as Error).message }));
    lauf();
    this.zeitgeber = setInterval(lauf, ms);
    this.zeitgeber.unref?.();
  }
  stop() { if (this.zeitgeber) clearInterval(this.zeitgeber); }

  private async mail(betreff: string, text: string) {
    try { await this.d.anAdmins?.(`DMS: ${betreff}`, text); } catch (e) { log.warn('Mail zum Speicherplatz nicht verschickt', { fehler: (e as Error).message }); }
  }
}
