/**
 * Paket-Läufer (#338), Seite des DMS: startet und überwacht den Läufer-Prozess, gibt ihm die Pakete mit Code,
 * stellt Ereignisse zu (mit Wiederholung) und führt Anfragen der Pakete an die API aus – jeweils mit dem
 * Schlüssel des Dienstkontos des Pakets. Der Schlüssel verlässt diesen Prozess nie.
 *
 * #1278: aufgeteilt, die Tür bleibt hier – die Klasse ist eine Kette PaketlaeuferBasis (verwaltung-basis.ts, alle
 * Felder) → PaketlaeuferAufrufe (verwaltung-aufrufe.ts) → PaketlaeuferZustellen (verwaltung-zustellen.ts) →
 * PaketlaeuferPakete (verwaltung-pakete.ts) → Paketlaeufer; Typen und Hilfen in verwaltung-hilfen.ts.
 */
import { PaketlaeuferPakete } from './verwaltung-pakete';
import type { Grenzen } from './prozess';
import { type LaeuferOptionen, STANDARD_GRENZEN, NACHLAUF_MS, abbruch, log, PRUEF_MS } from './verwaltung-hilfen';
import { t } from '../sprache/sprache';
import { hatSchnittstelle, hatNetz } from '../../../shared/src/pakete';
import { PRUEF_AKTION } from '../../../shared/src/paketreiter';
import type { Probedatei, AktionsDatei, Zugang } from '../paketaktionen';
import { extern } from '../system/externmessung';
import type { PaketLaeufer } from '../pakete/verwaltung/index';

export { bytesText, liesWeiter, merkeNetz, NETZ_ZUSAMMEN_MS, netzText, schluesselRecht, type ApiAufruf } from './verwaltung-hilfen';
export { WEITER_MAX_BYTES } from '../grundlagen/grenzen';

export class Paketlaeufer extends PaketlaeuferPakete implements PaketLaeufer {
  readonly grenzen: Grenzen;

  constructor(protected o: LaeuferOptionen) {
    super();
    this.grenzen = { ...STANDARD_GRENZEN, ...o.grenzen };
    o.dienst.ereignisWecker = () => void this.stelleZu();
    // Vektoren (#442): Der Kern fragt das Paket mit dms:vektoren nach dem Vektor eines Suchbegriffs.
    o.dienst.suche.vektorAnbieter = { paket: () => this.vektorPaket(), vektorFuer: (t, ms) => this.vektorFuer(t, ms) };
    // „Frag deine Ablage“ (#444): Das Paket mit dms:antworten beantwortet Fragen aus den Ausschnitten des Kerns.
    o.dienst.fragen.anbieter = {
      paket: () => this.paketMit('dms:antworten'),
      antworte: (paket, eingang, teil) =>
        this.schnittstelle(paket, 'dms:antworten', eingang, { bezeichnung: t('meldungen.verwaltung.frage-beantwortet'), teil }),
    };
    // „Aus Dokument ausfüllen“ per Paket (#511): Pakete mit dms:erkennen, mit Zeitlimit.
    o.dienst.erkennung.anbieter = {
      pakete: () =>
        this.pakete
          .filter((x) => hatSchnittstelle(x.laeufer, 'dms:erkennen') && this.ladefehler.has(x.id) && !this.ladefehler.get(x.id))
          .map((x) => ({ id: x.id, name: x.name, netz: hatNetz(x.laeufer) })),
      erkenne: (paket, eingang, ms) =>
        this.schnittstelle(paket, 'dms:erkennen', eingang, { bezeichnung: t('meldungen.verwaltung.felder-erkannt'), ms }),
    };
    // „Wohin gehört das?“ (#939): Pakete mit dms:klassifizieren, mit Zeitlimit; kein Inhalt in der Werkbank.
    o.dienst.erkennung.klassifizierung.anbieter = {
      pakete: () => this.klassifizierPakete(),
      klassifiziere: (paket, eingang, ms) =>
        this.schnittstelle(paket, 'dms:klassifizieren', eingang, { bezeichnung: t('meldungen.verwaltung.typ-vorgeschlagen'), ms }),
    };
    // Paket-Aktionen im Menü „Mappe“ (#1039): Schritt mit Antwort und Zeitgrenze, mit eingeschränktem Zugriff.
    o.dienst.paketaktionen.laeufer = {
      geladen: (paket) => this.aktionBereit(paket),
      rufe: (paket, eingang, a) => this.mappenaktion(paket, eingang, a),
    };
    // Entfernte Sicherungen (#976): auflisten und zurückholen über Pakete mit dms:sicherung-holen; kein Inhalt in der Werkbank.
    o.dienst.sicherungHolen = {
      rufe: async (paket, eingang, ms) =>
        (
          await this.schnittstelle(paket, 'dms:sicherung-holen', eingang, {
            bezeichnung: t(
              eingang.auftrag === 'auflisten' ? 'meldungen.verwaltung.sicherungen-aufgelistet' : 'meldungen.verwaltung.sicherung-geholt',
            ),
            ...(ms ? { ms } : {}),
          })
        ).text,
    };
    // Inhalte übersetzen (#732): Pakete mit dms:uebersetzen, je Abschnitt ein Aufruf mit Zeitlimit; kein Inhalt in der Werkbank.
    o.dienst.uebersetzung.anbieter = {
      pakete: () => this.uebersetzPakete(),
      uebersetze: (paket, eingang, ms) =>
        this.schnittstelle(paket, 'dms:uebersetzen', eingang, { bezeichnung: t('meldungen.verwaltung.text-uebersetzt'), ms }),
    };
  }

  /** Startet den Läufer, wenn es Pakete mit Code gibt; sonst erst, wenn eins installiert wird. */
  async start() {
    this.aus = false;
    await this.synchronisiere();
    this.uhr ??= setInterval(() => void this.stelleZu(), this.o.abrufMs ?? 5000);
    this.uhr.unref?.();
    this.nachlaufUhr ??= setInterval(() => void this.nachberechnen(), this.o.nachlaufMs ?? NACHLAUF_MS);
    this.nachlaufUhr.unref?.();
  }

  async stop() {
    this.aus = true;
    if (this.uhr) clearInterval(this.uhr);
    this.uhr = null;
    if (this.nachlaufUhr) clearInterval(this.nachlaufUhr);
    this.nachlaufUhr = null;
    const k = this.kind;
    this.kind = null;
    this.bereit = false;
    this.beendeAufrufe(abbruch(t('meldungen.verwaltung.der-paket-laeufer-wurde'), true));
    if (k && k.exitCode === null) {
      k.kill();
      await new Promise((ok) => {
        k.once('exit', ok);
        setTimeout(ok, 2000);
      });
    }
  }

  /* ---------- PaketLaeufer (für die Paketverwaltung) ---------- */

  codeGeaendert(): Promise<void> {
    this.nachlauf.clear();
    this.suchvektoren.clear();
    return this.synchronisiere().catch((e) => log.error('Paket-Läufer: Pakete nicht neu geladen', { fehler: (e as Error).message }));
  }

  ereignis(paket: string, name: 'paket.einstellungen_geaendert', felder: string[]) {
    void this.o.dienst.ereignisseDienst.auftrag(paket, name, { felder });
  }

  async aktion(paket: string, aktion: string, einstellungen: Record<string, unknown>): Promise<string> {
    if (this.o.pausiert?.()) throw new Error('Während der Wartung laufen keine Pakete. Bitte danach noch einmal.');
    const r = await this.rufe(paket, 'aktion', { aktion, einstellungen });
    if (!r.ok) throw new Error(r.fehler ?? 'Die Aktion ist fehlgeschlagen.');
    return r.text || 'Erledigt.';
  }

  /**
   * Prüffunktion des Pakets (#996): Aktion `einstellungen_pruefen` mit den Werten im Klartext, kurzer Zeitgrenze und
   * leerem Zugriff (keine Mappe, keine Dokumente, eigener Speicher nur lesen) – das Paket kann nichts schreiben. Antwort
   * `{"fehler": {"feld": "Meldung"}}`; null, wenn das Paket nicht lief (dann gilt nur die Prüfung von Ablago).
   */
  async pruefeEinstellungen(paket: string, einstellungen: Record<string, unknown>): Promise<Record<string, string> | null> {
    if (!this.aktionBereit(paket)) return null;
    const r = await this.rufe(
      paket,
      'aktion',
      { aktion: PRUEF_AKTION, einstellungen },
      {
        ms: PRUEF_MS,
        vorrang: true,
        bezeichnung: t('meldungen.verwaltung.einstellungen-geprueft'),
        zugang: { zugang: { mappe: {}, dokumente: {} }, dateien: [] },
        ohneInhalt: true,
        funktion: PRUEF_AKTION,
      },
    );
    if (!r.ok) {
      log.warn(`Paket ${paket}: Prüffunktion der Einstellungen fehlgeschlagen`, { paket, fehler: r.fehler });
      return null;
    }
    try {
      const j = JSON.parse(r.text) as { fehler?: unknown };
      if (!j.fehler || typeof j.fehler !== 'object' || Array.isArray(j.fehler)) return {};
      return Object.fromEntries(
        Object.entries(j.fehler as Record<string, unknown>)
          .slice(0, 50)
          .map(([k, v]) => [k.slice(0, 100), String(v).slice(0, 300)]),
      );
    } catch {
      return {};
    }
  }

  /**
   * Ausprobieren (#1004): das Ereignis aus `code.ausprobieren` im Probemodus – vor die Warteschlange, mit leerem
   * Zugriff außer der Probedatei (kein Dienstkonto, keine Mappen, eigener Speicher nur lesen). Erzeugte Dateien
   * (`POST /dateien`) kommen mit dem Ergebnis zurück; in den Verlauf schreibt die Paketverwaltung („ausprobiert von …“).
   */
  async ausprobieren(
    paket: string,
    eingang: Record<string, unknown>,
    probe: Probedatei,
  ): Promise<{ ok: boolean; text: string; fehler: string | null; ms: number; speicherMB: number; dateien: AktionsDatei[] }> {
    if (this.o.pausiert?.() || !this.aktionBereit(paket))
      return { ok: false, text: '', fehler: t('meldungen.verwaltung.der-paket-laeufer-laeuft'), ms: 0, speicherMB: 0, dateien: [] };
    try {
      await extern.pruefePause(paket);
    } catch (e) {
      return { ok: false, text: '', fehler: (e as Error).message, ms: 0, speicherMB: 0, dateien: [] };
    }
    const dateien: AktionsDatei[] = [];
    const r = await this.rufe(paket, 'ereignis', eingang, {
      vorrang: true,
      bezeichnung: t('meldungen.verwaltung.ausprobiert'),
      zugang: { zugang: { mappe: {}, dokumente: {}, probe }, dateien },
      ohneInhalt: true,
      funktion: 'ausprobieren',
      ohneVerlauf: true,
    });
    return { ok: r.ok, text: r.text, fehler: r.fehler, ms: r.ms, speicherMB: r.speicherMB, dateien };
  }

  /** Paket-Aktionen (#1039): fehlerfrei geladene Pakete (für den Schnappschuss der anderen Prozesse). */
  aktionPakete(): string[] {
    return this.pakete.filter((p) => this.ladefehler.has(p.id) && !this.ladefehler.get(p.id)).map((p) => p.id);
  }

  /** Paket-Aktionen (#1039): Läuft der Läufer und hat er das Paket fehlerfrei geladen? */
  aktionBereit(paket: string): boolean {
    return this.laeuft() && this.ladefehler.has(paket) && !this.ladefehler.get(paket);
  }

  /**
   * Ein Schritt einer Paket-Aktion (#1039): Aufruf mit Antwort und Zeitgrenze, vor die Warteschlange. Fragen aus diesem
   * Aufruf beantwortet der eingeschränkte Zugriff (nie das Dienstkonto); abgelegte Dateien kommen mit dem Ergebnis.
   */
  async mappenaktion(
    paket: string,
    eingang: Record<string, unknown>,
    a: { ms: number; zugang: Zugang; bezeichnung: string },
  ): Promise<{ ok: boolean; text: string; fehler: string | null; dateien: AktionsDatei[] }> {
    if (this.o.pausiert?.()) return { ok: false, text: '', fehler: t('meldungen.verwaltung.der-paket-laeufer-laeuft'), dateien: [] };
    // Monatsbudget mit harter Grenze (#565): auch Paket-Aktionen kostenpflichtiger KI-Pakete pausieren bis zum Monatsanfang.
    try {
      await extern.pruefePause(paket);
    } catch (e) {
      return { ok: false, text: '', fehler: (e as Error).message, dateien: [] };
    }
    const dateien: AktionsDatei[] = [];
    const funktion = typeof eingang.mappenaktion === 'string' ? `mappenaktion:${eingang.mappenaktion}` : 'mappenaktion';
    const r = await this.rufe(paket, 'aktion', eingang, {
      ms: a.ms,
      vorrang: true,
      bezeichnung: a.bezeichnung,
      zugang: { zugang: a.zugang, dateien },
      ohneInhalt: true,
      funktion,
    });
    return { ok: r.ok, text: r.text, fehler: r.fehler, dateien };
  }
}
