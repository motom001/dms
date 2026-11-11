import { BUNDESLAENDER } from '../../shared/src/feiertage';
import { beruflichBei, istNutzung, istVerweis, liesPlanOrganisation, PAKET_ORGANISATION, type Nutzung, PLAN_VERBINDUNGEN, type DateiFehler, type Einrichtungsplan, type PlanDatenbank, type Planprobleme, type PlanVerbindung } from '../../shared/src/einrichtungsplan';
import { pruefeAdresse } from './betrieb';
import { liesEinrichtungsdatei, schreibeEinrichtungsdatei } from './einrichtungsdatei';
import type { Einstellungen } from './einstellungen';
import type { Einrichtungscode } from './einrichtungscode';
import { Fachfehler } from './fehler';
import { pruefeEmail, pruefePasswortRegeln, type Konten } from './konten';
import { protokoll } from './protokoll';
import { t } from './sprache';
import { liesMerkmale, MERKMALE_EINSTELLUNG } from '../../shared/src/merkmale';
import { vorlageFuer } from '../../shared/src/werkbankansicht';

/**
 * Einrichtungsassistent (#119), sobald die Datenbank steht. Seit #804 sammelt der Assistent erst alles (Ablage,
 * Dein Konto, Pakete, Optionales) und legt nichts an; erst „Jetzt einrichten“ legt Ablage und das eigene Konto mit
 * „Gesamte Verwaltung“ an (mit Einrichtungscode) und führt danach – angemeldet und im Verwaltungsmodus – den Rest aus.
 * Seit #821 gibt es nur dieses eine Konto: kein Administrator und kein „erster Benutzer“ daneben. Der Stand der
 * Schritte nach dem Anlegen liegt in den Einstellungen („einrichtung“).
 *
 * Konfigurationsdatei (#806): Lesen, Prüfen und Schreiben nur mit gültigem Einrichtungscode und nur, solange Ablago
 * noch nicht eingerichtet ist (bzw. für „Gesamte Verwaltung“, solange der Assistent offen ist).
 */

const log = protokoll.modul('system');
export const SCHRITTE = ['schluessel', 'pakete', 'optional', 'fertig'] as const;
export type Schritt = (typeof SCHRITTE)[number];
export interface EinrichtungStand { offen: boolean; erledigt: Schritt[]; uebersprungen: Schritt[]; mandant: string | null }

export interface EinrichtungDeps {
  konten: Pick<Konten, 'einrichten' | 'einrichtungNoetig'>;
  code: Einrichtungscode | null;
  einstellungen: Einstellungen;
  /** Name des Mandanten setzen (Tabelle haushalte) und lesen. */
  mandant: { name(): Promise<string | null>; umbenennen(name: string): Promise<void> };
  /** Schriftzug des Standard-Designs (#72). */
  schriftzug?: (text: string) => Promise<void>;
  /** Die Datenbank, mit der Ablago gerade verbunden ist (ohne Passwort) – für die Konfigurationsdatei (#806). */
  datenbank?: () => Omit<PlanDatenbank, 'passwort'> | null;
  /** Notfallblatt zum aktuellen Schlüssel heruntergeladen? Ohne geht „Einrichtung abschließen“ nicht (#804). */
  notfallblattAktuell?: () => Promise<boolean>;
}

export const MANDANT_MAX = 30;
export const EINRICHTUNGSDATEI_NAME = 'ablago-einrichtung.yaml';

const text = (v: unknown, max = 300) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const ja = (v: unknown) => v === true;

/** #1045: Die Antwort auf „Wofür nutzt du Ablago?“ bestimmt das Merkmal – ohne Antwort zählt es wie bisher (#1032). */
function nutzungAus(n: unknown, beruflich: unknown): { nutzung?: Nutzung; beruflich: boolean } {
  return istNutzung(n) ? { nutzung: n, beruflich: beruflichBei(n) } : { beruflich: ja(beruflich) };
}

/** Ein Plan aus der Oberfläche (JSON) in fester Form; Unbekanntes fällt weg, Passwörter nur als Verweis. */
export function planAusEingabe(x: unknown): Einrichtungsplan {
  const o = (x ?? {}) as Record<string, unknown>;
  const db = o.datenbank as Record<string, unknown> | null | undefined;
  // Bis 0.192 hieß „Dein Konto“ (#821) im Plan „administrator“.
  const ko = (o.konto ?? o.administrator ?? {}) as Record<string, unknown>;
  const op = (o.optional ?? {}) as Record<string, unknown>;
  const m = op.mail as Record<string, unknown> | null | undefined;
  const verweis = (v: unknown) => (istVerweis(v) ? { passwort: v } : {});
  const zahl = (v: unknown, standard: number) => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n >= 1 && n <= 65535 ? n : standard; };
  const verbindung: PlanVerbindung = PLAN_VERBINDUNGEN.includes(m?.verbindung as PlanVerbindung) ? m!.verbindung as PlanVerbindung : 'starttls';
  const { nutzung, beruflich } = nutzungAus(o.nutzung, op.beruflich);
  const organisation = liesPlanOrganisation(o.organisation);
  return {
    datenbank: db && typeof db === 'object' ? { host: text(db.host, 255), port: zahl(db.port, 5432), datenbank: text(db.datenbank, 63), benutzer: text(db.benutzer, 63), ...verweis(db.passwort) } : null,
    ablage: text(o.ablage, 100).replace(/\s+/g, ' '),
    konto: { name: text(ko.name, 100), email: text(ko.email, 254), ...verweis(ko.passwort) },
    pakete: Array.isArray(o.pakete) ? o.pakete.slice(0, 100).flatMap((p) => {
      const q = (p ?? {}) as Record<string, unknown>;
      const id = text(q.id, 64);
      if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) return [];
      const auto = q.automatisierungen && typeof q.automatisierungen === 'object' ? Object.entries(q.automatisierungen as Record<string, unknown>).filter(([k, v]) => /^[a-z0-9][a-z0-9_-]{0,63}$/.test(k) && typeof v === 'boolean') : [];
      return [{ id, beispiele: ja(q.beispiele), automatisierungen: Object.fromEntries(auto) as Record<string, boolean> }];
    }) : null,
    optional: {
      adresse: text(op.adresse) || null,
      bundesland: typeof op.bundesland === 'string' && op.bundesland in BUNDESLAENDER ? op.bundesland : null,
      beispiele: ja(op.beispiele),
      ...(beruflich ? { beruflich: true } : {}),
      mail: m && typeof m === 'object' ? {
        aktiv: m.aktiv !== false, host: text(m.host, 200), port: zahl(m.port, verbindung === 'ssl' ? 465 : 587), verbindung,
        benutzer: text(m.benutzer, 200), absender: text(m.absender, 200), selbstsigniert: ja(m.selbstsigniert), ...verweis(m.passwort),
      } : null,
    },
    ...(nutzung ? { nutzung } : {}),
    ...(organisation ? { organisation } : {}),
  };
}

/** Fehlermeldung einer Prüfung oder null. */
const meldung = (f: () => unknown): string | null => { try { f(); return null; } catch (e) { return (e as Error).message; } };

export class Einrichtung {
  constructor(private d: EinrichtungDeps) {}

  /** Solange niemand eingerichtet ist: Code nötig (falls ein Code bereitsteht). */
  async pruefeCode(code: unknown) {
    if (!(await this.d.konten.einrichtungNoetig())) throw new Fachfehler(409, t('meldungen.einrichtung.die-einrichtung-ist-bereits'));
    await this.d.code?.pruefeGeteilt(code);
  }
  get codeNoetig() { return !!this.d.code?.aktiv; }

  /**
   * Zugang zu den Hilfen des Assistenten (Datei, Prüfung, Paketkatalog): vor der Einrichtung mit Code; danach nur mit
   * „Gesamte Verwaltung“, solange der Assistent offen ist (etwa „Ändern“, wenn beim Einrichten etwas nicht klappte).
   */
  async pruefeZugang(code: unknown, admin: boolean) {
    if (admin && !(await this.d.konten.einrichtungNoetig()) && (await this.stand()).offen) return;
    await this.pruefeCode(code);
  }

  /** Ablage und „Dein Konto“ (bei „Jetzt einrichten“, #804, #821); meldet die Person an. */
  async einrichten(e: Record<string, unknown>, code: unknown, info: { ip: string; geraet: string }) {
    await this.pruefeCode(code);
    const mandant = typeof e.mandant === 'string' ? e.mandant.replace(/\s+/g, ' ').trim() : '';
    if (!mandant) throw new Fachfehler(422, t('meldungen.einrichtung.bitte-einen-namen-angeben'));
    if (mandant.length > MANDANT_MAX) throw new Fachfehler(422, t('meldungen.einrichtung.der-name-darf-hoechstens', { MANDANT_MAX }));
    const r = await this.d.konten.einrichten(e, info);
    await this.d.mandant.umbenennen(mandant);
    try { await this.d.schriftzug?.(mandant); } catch (x) { log.warn('Schriftzug nicht gesetzt', { fehler: (x as Error).message }); }
    await this.d.einstellungen.schreibe('einrichtung', { offen: true, erledigt: [], uebersprungen: [] });
    // Neue Installationen bekommen die schlanke Werkbank (#281); bestehende behalten alles. Die Vorlage folgt dem
    // Merkmal „beruflich genutzt“ (#1032): beruflich → Organisation, sonst Haushalt.
    await this.d.einstellungen.schreibe('werkbank_ansicht', { vorlage: vorlageFuer(liesMerkmale(await this.d.einstellungen.lies(MERKMALE_EINSTELLUNG))), ein: [], aus: [] });
    await this.d.code?.entfernen();
    log.info('Einrichtung: Ablage und eigenes Konto mit „Gesamte Verwaltung“ angelegt', { mandant, email: r.benutzer.email });
    return r;
  }

  async stand(): Promise<EinrichtungStand> {
    const g = (await this.d.einstellungen.lies('einrichtung')) as Partial<EinrichtungStand> | null;
    return { offen: !!g?.offen, erledigt: g?.erledigt ?? [], uebersprungen: g?.uebersprungen ?? [], mandant: await this.d.mandant.name() };
  }

  /** Einen Schritt als erledigt oder übersprungen merken; „fertig“ schließt den Assistenten – erst mit Notfallblatt. */
  async merke(schritt: unknown, uebersprungen: boolean, von: string): Promise<EinrichtungStand> {
    if (!SCHRITTE.includes(schritt as Schritt)) throw new Fachfehler(422, t('meldungen.einrichtung.unbekannter-schritt'));
    const x = schritt as Schritt;
    if (x === 'fertig' && this.d.notfallblattAktuell && !(await this.d.notfallblattAktuell())) throw new Fachfehler(409, t('einrichtung.abschluss.fehlt'));
    const s = await this.stand();
    const erledigt = uebersprungen ? s.erledigt.filter((y) => y !== x) : [...new Set([...s.erledigt, x])];
    const ueber = uebersprungen ? [...new Set([...s.uebersprungen, x])] : s.uebersprungen.filter((y) => y !== x);
    const offen = x !== 'fertig';
    await this.d.einstellungen.schreibe('einrichtung', { offen, erledigt, uebersprungen: ueber });
    log.info(offen ? `Einrichtung: Schritt „${x}“ ${uebersprungen ? 'übersprungen' : 'erledigt'}` : 'Einrichtungsassistent abgeschlossen', { von });
    return { ...s, offen, erledigt, uebersprungen: ueber };
  }

  /**
   * Prüft einen gesammelten Plan, ohne etwas anzulegen (#804, #806): je Schritt, was nicht passt. Das Passwort für
   * „Dein Konto“ kommt nur zum Prüfen mit und wird nicht gespeichert; fehlt es, ist das ein Grund im Schritt.
   */
  pruefePlan(eingabe: unknown, geheim: { passwort?: unknown } = {}): Planprobleme {
    const p = planAusEingabe(eingabe);
    const probleme: Planprobleme = {};
    const dazu = (s: keyof Planprobleme, m: string | null) => { if (m) (probleme[s] ??= []).push(m); };
    dazu('ablage', !p.ablage ? t('einrichtung.plan.ablage.fehlt') : p.ablage.length > MANDANT_MAX ? t('einrichtung.plan.ablage.lang', { max: MANDANT_MAX }) : null);
    dazu('konto', meldung(() => pruefeEmail(p.konto.email)));
    dazu('konto', typeof geheim.passwort === 'string' && geheim.passwort ? meldung(() => pruefePasswortRegeln(geheim.passwort)) : t('einrichtung.plan.passwort.fehlt'));
    dazu('optional', p.optional.adresse ? meldung(() => pruefeAdresse(p.optional.adresse)) : null);
    if (p.optional.mail?.aktiv && !p.optional.mail.host) dazu('optional', t('einrichtung.plan.mail.server'));
    // „Deine Organisation“ (#1045): nur bei beruflicher Nutzung, Name Pflicht, E-Mail gültig – und Paket Basis dabei.
    const o = p.organisation;
    if (o) {
      if (!p.optional.beruflich) dazu('nutzung', t('einrichtung.plan.organisation.privat'));
      dazu('nutzung', o.name ? null : t('einrichtung.plan.organisation.name'));
      dazu('nutzung', o.email ? meldung(() => pruefeEmail(o.email)) : null);
      if (!p.pakete?.some((x) => x.id === PAKET_ORGANISATION)) dazu('pakete', t('einrichtung.plan.organisation.basis'));
    }
    return probleme;
  }

  /** Konfigurationsdatei lesen (#806); dazu Hinweise, etwa wenn die Datei eine andere Datenbank nennt. */
  dateiLesen(text: unknown): { plan: Einrichtungsplan | null; fehler: DateiFehler[]; hinweise: string[] } {
    const r = liesEinrichtungsdatei(text);
    const hinweise: string[] = [...r.hinweise];
    const jetzt = this.d.datenbank?.();
    const db = r.plan?.datenbank;
    if (db && jetzt && (db.host !== jetzt.host || db.port !== jetzt.port || db.datenbank !== jetzt.datenbank || db.benutzer !== jetzt.benutzer)) {
      hinweise.push(t('einrichtung.datei.hinweis.datenbank', { datei: `${db.benutzer}@${db.host}:${db.port}/${db.datenbank}`, jetzt: `${jetzt.benutzer}@${jetzt.host}:${jetzt.port}/${jetzt.datenbank}` }));
    }
    log.info(r.plan ? 'Einrichtung: Konfigurationsdatei geladen' : 'Einrichtung: Konfigurationsdatei abgelehnt', { fehler: r.fehler.length });
    return { ...r, hinweise };
  }

  /** Konfigurationsdatei schreiben (#806): mit der verbundenen Datenbank, ohne Passwörter und ohne Schlüssel. */
  dateiSchreiben(eingabe: unknown): { text: string; name: string } {
    const p = planAusEingabe(eingabe);
    const jetzt = this.d.datenbank?.();
    if (jetzt) p.datenbank = { ...jetzt, ...(p.datenbank?.passwort ? { passwort: p.datenbank.passwort } : {}) };
    return { text: schreibeEinrichtungsdatei(p), name: EINRICHTUNGSDATEI_NAME };
  }
}
