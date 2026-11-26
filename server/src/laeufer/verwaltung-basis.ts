/**
 * Paket-Läufer, Seite des DMS (#1278 aus verwaltung.ts): Grundklasse – der Zustand (alle Felder mit ihren Startwerten),
 * Senden an den Läufer-Prozess, Verlauf und Stand je Paket.
 */
import type { ChildProcess } from 'node:child_process';
import {
  type LaeuferOptionen,
  type PaketStand,
  type Aufruf,
  type AktionsZugang,
  type Ergebnis,
  netzText,
  VERLAUF_ZEILEN,
  PROTOKOLL_MAX,
  log,
} from './verwaltung-hilfen';
import type { Grenzen, AnLaeufer } from './prozess';
import type { Benutzer } from '../../../shared/src/model';
import type { InstalliertesPaket } from '../../../shared/src/pakete';
import { t } from '../sprache/sprache';

export abstract class PaketlaeuferBasis {
  /** Was die Klasse Paketlaeufer setzt (Konstruktor, verwaltung.ts). */
  protected abstract o: LaeuferOptionen;
  abstract readonly grenzen: Grenzen;
  protected kind: ChildProcess | null = null;
  protected bereit = false;
  protected schluessel = new Map<string, string>();
  protected konto = new Map<string, Benutzer>();
  protected pakete: InstalliertesPaket[] = [];
  protected ladefehler = new Map<string, string | null>();
  private stand = new Map<string, Omit<PaketStand, 'id' | 'name' | 'version' | 'dienstkonto' | 'geladen' | 'fehler' | 'ereignisse'>>();
  protected aufrufe = new Map<number, Aufruf>();
  protected nr = 1;
  protected uhr: ReturnType<typeof setInterval> | null = null;
  /** Pakete, deren Ereignisse gerade zugestellt werden (je Paket eine Kette, damit ein langsames Paket die anderen nicht bremst). */
  protected zustellend = new Set<string>();
  protected holend = false;
  /** Abgleich der Pakete nacheinander (mehrere Installationen kurz hintereinander, #338-Review). */
  protected abgleich: Promise<void> = Promise.resolve();
  protected schluesselRecht = new Map<string, string>();
  protected neustarts = 0;
  protected aus = false;
  /** Zeitpunkt des letzten Absturzes (für die Werkbank, #403). */
  protected absturz: string | null = null;
  /** Was der laufende Läufer-Prozess schon hat: Paket → Stand (Version, Modul, Zeitpunkt). Nur Geändertes wird neu geschickt (#403). */
  protected gesendet = new Map<string, string>();
  /** Nachberechnung der Vektoren je Paket (#442): Modell, Stelle im Bestand, Pause nach vollständigem Durchgang. */
  protected nachlauf = new Map<string, { modell: string; nach: string | null; pauseBis: number }>();
  protected nachlaufUhr: ReturnType<typeof setInterval> | null = null;
  protected nachlaufLaeuft = false;
  /**
   * Wahl „Vektoren von“ (#1707), gelesen beim Abgleich der Pakete: `von` rechnet, `bisher` liefert die Vektoren der
   * Suche, bis der Nachlauf von `von` durch ist. Beides null = wie vor #1707 (das erste Paket nach Id).
   */
  protected vektorWahl: { von: string | null; bisher: string | null } = { von: null, bisher: null };
  /** Laufende Aufrufe von Paket-Aktionen (#1039): Aufruf-Nummer → Paket, eingeschränkter Zugriff, abgelegte Dateien. */
  protected zugaenge = new Map<number, AktionsZugang>();
  /** Gescheiterte Schreibversuche eines Aufrufs an die API (#1491): Aufruf-Nummer → „PUT /mappen/… → 409 …“. */
  protected schreibfehler = new Map<number, string[]>();

  /** Gescheiterte Schreibversuche eines Aufrufs (#1491) für den Verlauf – danach vergessen. */
  protected nimmSchreibfehler(nr: number): string[] {
    const l = this.schreibfehler.get(nr) ?? [];
    this.schreibfehler.delete(nr);
    return l;
  }

  /** Offene Aufrufe beenden – sonst warten Zustellung oder Aktion für immer. */
  protected beendeAufrufe(r: Ergebnis) {
    const offen = [...this.aufrufe.values()];
    this.aufrufe.clear();
    for (const a of offen) a.ok(r);
  }

  protected sende(m: AnLaeufer) {
    this.kind?.send(m);
  }

  /**
   * Verlauf (#1003): je Aufruf ein Eintrag – Art, Ergebnis (Grenze erreicht: zeit/speicher), Dauer, Speicher, Mappe des
   * Ereignisses und Netzaufrufe als Text; bei Fehlern die Meldung. Seit #1491 auch der Ergebnistext des Laufs (wie unter
   * „Zuletzt“, höchstens 300 Zeichen; mit `ohneInhalt` nur seine Länge). Scheiterte ein Schreibversuch des Pakets an der
   * API (400, 404, 409 …), ist der Lauf eine Warnung, nicht „ok“ – mit den gescheiterten Anfragen.
   */
  protected verlauf(
    paket: string,
    art: 'ereignis' | 'aktion',
    eingang: Record<string, unknown>,
    opt: { bezeichnung?: string; ohneVerlauf?: boolean; ohneInhalt?: boolean; schreibfehler?: string[] },
    r: Ergebnis,
  ) {
    if (opt.ohneVerlauf) return;
    const bezeichnung = opt.bezeichnung;
    const daten =
      art === 'ereignis' && eingang.daten && typeof eingang.daten === 'object' ? (eingang.daten as Record<string, unknown>) : {};
    const ergebnis = r.ok
      ? opt.schreibfehler?.length
        ? 'warnung'
        : 'ok'
      : r.ms >= this.grenzen.sekunden * 1000 || /zeitgrenze|time limit/i.test(r.fehler ?? '')
        ? 'zeit'
        : /speichergrenze|memory limit/i.test(r.fehler ?? '')
          ? 'speicher'
          : 'fehler';
    void this.o.dienst.kern.repo
      .notiereVerlauf([
        {
          paket,
          art: art === 'ereignis' ? 'ereignis' : 'aufruf',
          was: art === 'ereignis' ? String(eingang.art) : (bezeichnung ?? String(eingang.aktion ?? '')),
          ergebnis,
          ms: r.ms,
          speicherMB: r.speicherMB,
          text: verlaufText(r, opt),
          bezug: typeof daten.mappe === 'string' ? { mappe: daten.mappe } : null,
          netz: (r.netz ?? []).map(netzText),
        },
      ])
      .catch(() => {});
  }

  /** Protokollzeilen des Pakets im Verlauf (#1003): höchstens VERLAUF_ZEILEN je Stunde und Paket, damit es ihn nicht flutet. */
  private zeilen = new Map<string, { stunde: number; anzahl: number }>();
  private protokollVerlauf(paket: string, e: { stufe: number; text: string }) {
    const stunde = Math.floor(Date.now() / 3_600_000);
    const z = this.zeilen.get(paket);
    const n = z && z.stunde === stunde ? z.anzahl + 1 : 1;
    this.zeilen.set(paket, { stunde, anzahl: n });
    if (n > VERLAUF_ZEILEN) return;
    void this.o.dienst.kern.repo
      .notiereVerlauf([
        {
          paket,
          art: 'protokoll',
          ergebnis: e.stufe >= 2 ? 'warnung' : null,
          text: n === VERLAUF_ZEILEN ? t('meldungen.verwaltung.verlauf-zeilen-max', { anzahl: VERLAUF_ZEILEN }) : e.text.slice(0, 300),
        },
      ])
      .catch(() => {});
  }

  protected notiere(paket: string, e: { stufe: number; text: string }) {
    const s = this.standVon(paket);
    this.protokollVerlauf(paket, e);
    s.protokoll.push({ zeit: new Date().toISOString(), ...e });
    if (s.protokoll.length > PROTOKOLL_MAX) s.protokoll.splice(0, s.protokoll.length - PROTOKOLL_MAX);
    (e.stufe >= 2 ? log.warn : log.info).call(log, `Paket ${paket}: ${e.text}`, { paket });
  }

  protected standVon(paket: string) {
    let s = this.stand.get(paket);
    if (!s) {
      s = { aufrufe: 0, fehlgeschlagen: 0, letzterAufruf: null, dauerMs: null, speicherMB: null, letzte: [], protokoll: [] };
      this.stand.set(paket, s);
    }
    return s;
  }
  protected suchvektoren = new Map<string, { paket: string; modell: string; vektor: Float32Array; schwelle: number }>();

  protected laeuft() {
    return !!this.kind && this.bereit && !this.aus && !this.o.pausiert?.();
  }
}

/**
 * Text eines Verlaufseintrags (#1491): bei Erfolg der Ergebnistext (mit `ohneInhalt` nur seine Länge), davor die
 * gescheiterten Schreibversuche; bei einem Fehler die Meldung. Höchstens 300 Zeichen.
 */
function verlaufText(r: Ergebnis, opt: { ohneInhalt?: boolean; schreibfehler?: string[] }): string {
  if (!r.ok) return (r.fehler ?? '').slice(0, 300);
  const fehler = opt.schreibfehler?.length
    ? t('meldungen.verwaltung.verlauf-schreiben-gescheitert', { liste: opt.schreibfehler.slice(0, 3).join('; ') })
    : '';
  const text = opt.ohneInhalt ? t('meldungen.verwaltung.verlauf-zeichen', { anzahl: r.text.length }) : r.text;
  return [fehler, text].filter(Boolean).join(' – ').slice(0, 300);
}
