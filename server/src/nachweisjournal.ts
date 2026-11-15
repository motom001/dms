/**
 * Nachweis-Journal (#1053): was für die Nachweise eines Monats sonst nirgends dauerhaft steht – Fehlanmeldungen,
 * Rechteänderungen, Updates und Paket-Verlauf, Wartungszeiten, Läufe von „Alle Dateien prüfen“, geleerter Papierkorb,
 * erzeugte Datenschutzauskünfte. Das Protokoll hält nur 24 Stunden.
 *
 * Abgelegt je Monat in der Einstellung `nachweise:JJJJ-MM` (Teil der Sicherung), geschrieben mit Vergleichen und
 * Tauschen (`tausche`), damit zwei Server keine Einträge verlieren. Je Monat höchstens `JE_MONAT` Einträge, danach
 * nur noch gezählt; nach `MONATE` Monaten fällt ein Monat weg. Nie Geheimnisse, nie volle IP-Adressen
 * (Ergänzung Sicherheit: IPv4 /24, IPv6 /48 und „Heimnetz/außen“; unbekannte Konten nur als Anzahl).
 */
import { kuerzeIp, istPrivat } from './abruf';
import { ohneGeheimnisse } from './geheimnis-sperre';
import { protokoll } from './protokoll';
import type { Einstellungen } from './einstellungen';
import type { PaketdatenWert } from '../../shared/src/paketdaten';

const log = protokoll.modul('system');

/** Arten im Journal – die Kennung ist zugleich die Kennung des Nachweises. */
export type JournalArt = 'zugang.fehlanmeldung' | 'zugang.rechte' | 'betrieb.update' | 'betrieb.paket' | 'betrieb.wartung'
  | 'unveraenderbarkeit.pruefung' | 'datenschutz.auskunft' | 'datenschutz.papierkorb';
/** Nur gezählt (ohne Einzelheiten): Fehlanmeldungen mit unbekanntem Konto. */
export type JournalZaehler = 'zugang.fehlanmeldung_unbekannt';

export interface JournalEintrag { art: JournalArt; zeit: string; daten: Record<string, PaketdatenWert> }
export interface JournalMonat { eintraege: JournalEintrag[]; weitere: number; zaehler: Partial<Record<JournalZaehler, number>> }

export const JE_MONAT = 2000;
export const MONATE = 25;
const LEER: JournalMonat = { eintraege: [], weitere: 0, zaehler: {} };
const schluessel = (monat: string) => `nachweise:${monat}`;
export const monatVon = (d: Date) => d.toISOString().slice(0, 7);
function monatMinus(monat: string, n: number): string {
  const [j, m] = monat.split('-').map(Number);
  const d = new Date(Date.UTC(j, m - 1 - n, 1));
  return monatVon(d);
}
function liesMonat(v: unknown): JournalMonat {
  if (!v || typeof v !== 'object') return { ...LEER, eintraege: [], zaehler: {} };
  const o = v as Partial<JournalMonat>;
  return { eintraege: Array.isArray(o.eintraege) ? [...o.eintraege] : [], weitere: typeof o.weitere === 'number' ? o.weitere : 0, zaehler: o.zaehler && typeof o.zaehler === 'object' ? { ...o.zaehler } : {} };
}

export class Nachweisjournal {
  constructor(private readonly einst: Einstellungen, private readonly jetzt: () => Date = () => new Date()) {}

  /** Monat lesen (`JJJJ-MM`). */
  async monat(monat: string): Promise<JournalMonat> { return liesMonat(await this.einst.lies(schluessel(monat))); }

  private async aendere(f: (m: JournalMonat) => void): Promise<void> {
    const monat = monatVon(this.jetzt());
    const k = schluessel(monat);
    for (let versuch = 0; versuch < 8; versuch++) {
      const alt = (await this.einst.lies(k)) ?? null;
      const neu = liesMonat(alt);
      f(neu);
      if (!this.einst.tausche) { await this.einst.schreibe(k, neu); break; }
      if (await this.einst.tausche(k, alt, neu)) {
        // Erster Eintrag eines Monats: den Monat räumen, der jetzt zu alt ist.
        if (alt === null) await this.einst.schreibe(schluessel(monatMinus(monat, MONATE)), null).catch(() => {});
        return;
      }
    }
    log.warn('Nachweis nach mehreren Versuchen nicht eingetragen', { monat });
  }

  async schreibe(art: JournalArt, daten: Record<string, PaketdatenWert>): Promise<void> {
    const eintrag: JournalEintrag = { art, zeit: this.jetzt().toISOString(), daten: ohneGeheimnisse(daten) };
    await this.aendere((m) => { if (m.eintraege.length >= JE_MONAT) m.weitere++; else m.eintraege.push(eintrag); });
  }

  async zaehle(art: JournalZaehler): Promise<void> {
    await this.aendere((m) => { m.zaehler[art] = (m.zaehler[art] ?? 0) + 1; });
  }
}

/* ---------- Eine Stelle für alle Aufrufer (wie das Protokoll: ein Mandant je Prozess) ---------- */

let aktiv: Nachweisjournal | null = null;
/** Vom Start bzw. von Tests gesetzt. */
export function setzeNachweisjournal(j: Nachweisjournal | null) { aktiv = j; }
export const nachweisjournal = () => aktiv;

/** Eintragen, ohne den Aufrufer aufzuhalten oder scheitern zu lassen. Gibt das Versprechen für Tests zurück. */
export function nachweis(art: JournalArt, daten: Record<string, PaketdatenWert>): Promise<void> {
  if (!aktiv) return Promise.resolve();
  return aktiv.schreibe(art, daten).catch((e: Error) => log.warn('Nachweis nicht eingetragen', { art, fehler: e.message }));
}

/** Fehlanmeldung: Konto nur, wenn es das Konto gibt; Adresse gekürzt, dazu Heimnetz oder außen. */
export function fehlanmeldung(email: string, ip: string, bekannt: boolean): Promise<void> {
  if (!aktiv) return Promise.resolve();
  if (!bekannt) return aktiv.zaehle('zugang.fehlanmeldung_unbekannt').catch((e: Error) => log.warn('Nachweis nicht eingetragen', { art: 'zugang.fehlanmeldung_unbekannt', fehler: e.message }));
  return nachweis('zugang.fehlanmeldung', { konto: email, netz: kuerzeIp(ip), heimnetz: istPrivat(ip) });
}

/**
 * Update-Verlauf: Läuft eine andere Version als beim letzten Start, steht das Update im Journal – genau einmal, auch
 * wenn mehrere Prozesse zugleich starten (`tausche`). Der erste Start überhaupt zählt nicht als Update.
 */
export async function merkeVersion(einst: Einstellungen, version: string): Promise<void> {
  const alt = (await einst.lies('nachweise_version')) ?? null;
  if (alt === version) return;
  const getauscht = einst.tausche ? await einst.tausche('nachweise_version', alt, version) : (await einst.schreibe('nachweise_version', version), true);
  if (getauscht && typeof alt === 'string') await nachweis('betrieb.update', { von: alt, nach: version });
}
