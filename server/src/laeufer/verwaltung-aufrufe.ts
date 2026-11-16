/** Paket-Läufer, Seite des DMS (#1278 aus verwaltung.ts): Vektoren (#442), Antworten (#444), Erkennen (#511) – Aufrufe einer Schnittstelle. */
import { PaketlaeuferBasis } from './verwaltung-basis';
import { hatSchnittstelle, hatNetz, type Schnittstelle } from '../../../shared/src/pakete';
import { extern } from '../system/externmessung';
import { t } from '../sprache/sprache';
import { liesModell, liesVektor, SCHWELLE_STANDARD } from '../suche/vektoren';
import {
  NACHLAUF_JE_RUNDE,
  NACHLAUF_PAUSE_MS,
  log,
  type AktionsZugang,
  type Ergebnis,
  abbruch,
  LETZTE,
  erfasseNetz,
  merkeNetz,
} from './verwaltung-hilfen';
import type { NetzEintrag } from './prozess';

export abstract class PaketlaeuferAufrufe extends PaketlaeuferBasis {
  /* ---------- Vektoren (#442) ---------- */

  /** Das Paket mit dem Recht dms:vektoren (bei mehreren das erste nach Id), sofern der Läufer es geladen hat. */
  vektorPaket(): string | null {
    const p = this.pakete
      .filter((x) => hatSchnittstelle(x.laeufer, 'dms:vektoren') && !this.ladefehler.get(x.id))
      .sort((a, b) => a.id.localeCompare(b.id))[0];
    return p?.id ?? null;
  }

  /**
   * Fragt das Paket nach dem Vektor eines Textes: Aktion „dms:vektor“ mit { text }; Antwort (Ergebnis) als JSON
   * { modell, vektor, schwelle? }. Leerer Text: nur das Modell. null = kein Paket, keine Antwort in ms, Fehler.
   */
  async vektorFuer(text: string, ms: number): Promise<{ paket: string; modell: string; vektor: Float32Array; schwelle: number } | null> {
    // Die Suche fragt beim Tippen oft nach demselben Begriff: die letzten Antworten merken.
    const k = text.trim().toLowerCase();
    const alt = this.suchvektoren.get(k);
    if (alt && alt.paket === this.vektorPaket()) return alt;
    const r = await this.vektorAnfrage(text, ms);
    if (!r?.vektor) return null;
    const erg = { paket: r.paket, modell: r.modell, vektor: r.vektor, schwelle: r.schwelle };
    this.suchvektoren.set(k, erg);
    if (this.suchvektoren.size > 100) this.suchvektoren.delete(this.suchvektoren.keys().next().value!);
    return erg;
  }

  private async vektorAnfrage(
    text: string,
    ms: number,
  ): Promise<{ paket: string; modell: string; vektor: Float32Array | null; schwelle: number } | null> {
    const paket = this.vektorPaket();
    if (!paket || !this.laeuft()) return null;
    // Harte Grenze des Monatsbudgets (#565): ohne Vektor sucht die Suche wie ohne Paket.
    if (extern.pausiertBis(paket)) return null;
    const r = await this.rufe(
      paket,
      'aktion',
      { aktion: 'dms:vektor', text: text.slice(0, 2000) },
      {
        ms,
        vorrang: true,
        funktion: 'vektoren',
        bezeichnung: text ? t('meldungen.verwaltung.vektor-eines-suchbegriffs') : t('meldungen.verwaltung.modell-abfragen'),
      },
    );
    if (!r.ok) return null;
    try {
      const j = JSON.parse(r.text) as { modell?: unknown; vektor?: unknown; schwelle?: unknown };
      const s = Number(j.schwelle);
      return {
        paket,
        modell: liesModell(j.modell),
        vektor: text ? liesVektor(j.vektor) : null,
        schwelle: Number.isFinite(s) && s > -1 && s < 1 ? s : SCHWELLE_STANDARD,
      };
    } catch (e) {
      this.notiere(paket, { stufe: 2, text: t('meldungen.verwaltung.antwort-auf-dms-vektor', { message: (e as Error).message }) });
      return null;
    }
  }

  /**
   * Nachberechnung im Hintergrund (#442): Dokumente mit Volltext ohne Vektor des aktuellen Modells bekommen
   * gedrosselt ein Ereignis „volltext.fertig“ – nur, wenn das Paket gerade nichts offen hat. So holt das Paket
   * den Bestand nach (nach der Installation, nach einem Modellwechsel, nach „Neu berechnen“).
   */
  async nachberechnen(): Promise<void> {
    const paket = this.vektorPaket();
    if (!paket || this.nachlaufLaeuft || !this.laeuft()) return;
    const p = this.pakete.find((x) => x.id === paket)!;
    if (!p.laeufer?.ereignisse.includes('volltext.fertig')) return;
    this.nachlaufLaeuft = true;
    try {
      let n = this.nachlauf.get(paket);
      if (!n) {
        const r = await this.vektorAnfrage('', 30_000);
        if (!r) return;
        await this.o.dienst.suche.merkeVektorModell(paket, r.modell);
        n = { modell: r.modell, nach: null, pauseBis: 0 };
        this.nachlauf.set(paket, n);
      }
      if (Date.now() < n.pauseBis) return;
      if (((await this.o.dienst.kern.repo.ereignisStand())[paket]?.offen ?? 0) > 0) return;
      const ids = await this.o.dienst.ereignisseDienst.vektorNachlauf(paket, n.modell, NACHLAUF_JE_RUNDE, n.nach);
      if (ids.length) n.nach = ids[ids.length - 1];
      else {
        n.nach = null;
        n.pauseBis = Date.now() + NACHLAUF_PAUSE_MS;
      }
    } catch (e) {
      log.warn('Paket-Läufer: Nachberechnung der Vektoren unterbrochen', { paket, fehler: (e as Error).message });
    } finally {
      this.nachlaufLaeuft = false;
    }
  }

  /** „Neu berechnen“ (Werkbank): Vektoren weg, Nachberechnung sofort von vorn. */
  async vektorenNeu(): Promise<{ entfernt: number }> {
    const paket = this.vektorPaket();
    if (!paket) throw new Error('Es ist kein Paket mit dem Recht „dms:vektoren“ installiert.');
    const r = await this.o.dienst.suche.vektorenNeu(paket);
    this.nachlauf.delete(paket);
    void this.nachberechnen();
    return r;
  }

  /* ---------- Antworten (#444) und Erkennen (#511) ---------- */

  /** Geladene Pakete mit dms:klassifizieren (#939); vektoren: liefert auch die Vektoren (Ähnlichkeit). */
  klassifizierPakete(): Array<{ id: string; name: string; netz: boolean; vektoren: boolean }> {
    return this.pakete
      .filter((x) => hatSchnittstelle(x.laeufer, 'dms:klassifizieren') && this.ladefehler.has(x.id) && !this.ladefehler.get(x.id))
      .map((x) => ({ id: x.id, name: x.name, netz: hatNetz(x.laeufer), vektoren: hatSchnittstelle(x.laeufer, 'dms:vektoren') }));
  }

  /** Geladene Pakete mit dms:uebersetzen (#732). */
  uebersetzPakete(): Array<{ id: string; name: string; version: string; netz: boolean }> {
    return this.pakete
      .filter((x) => hatSchnittstelle(x.laeufer, 'dms:uebersetzen') && this.ladefehler.has(x.id) && !this.ladefehler.get(x.id))
      .map((x) => ({ id: x.id, name: x.name, version: x.version, netz: hatNetz(x.laeufer) }));
  }

  /** Das Paket mit dieser Schnittstelle (bei mehreren das erste nach Id), sobald der Läufer es fehlerfrei geladen hat. */
  paketMit(s: Schnittstelle): { id: string; name: string } | null {
    const p = this.pakete
      .filter((x) => hatSchnittstelle(x.laeufer, s) && this.ladefehler.has(x.id) && !this.ladefehler.get(x.id))
      .sort((a, b) => a.id.localeCompare(b.id))[0];
    return p ? { id: p.id, name: p.name } : null;
  }

  /**
   * Ruft eine Schnittstelle eines Pakets auf (Aktion `dms:antworten`, `dms:erkennen`, `dms:klassifizieren` bzw. `dms:uebersetzen`): Eingang als JSON, Teile
   * der Antwort an `teil`, Ergebnis als Text. Ohne Inhalt in der Werkbank. Wirft mit verständlicher Meldung.
   */
  async schnittstelle(
    paket: string,
    aktion: string,
    eingang: Record<string, unknown>,
    opt: { bezeichnung: string; teil?: (text: string) => void; ms?: number },
  ): Promise<{ text: string; ms: number }> {
    if (this.o.pausiert?.()) throw new Error('Während der Wartung laufen keine Pakete.');
    if (!this.laeuft()) throw new Error('Der Paket-Läufer läuft gerade nicht.');
    // Monatsbudget mit harter Grenze (#565): kostenpflichtige KI-Funktionen pausieren bis zum Monatsanfang.
    await extern.pruefePause(paket);
    const r = await this.rufe(
      paket,
      'aktion',
      { ...eingang, aktion },
      {
        vorrang: true,
        ohneInhalt: true,
        bezeichnung: opt.bezeichnung,
        funktion: aktion.replace(/^dms:/, ''),
        ...(opt.teil ? { teil: opt.teil } : {}),
        ...(opt.ms ? { ms: opt.ms } : {}),
      },
    );
    if (!r.ok) throw new Error(r.fehler ?? 'Das Paket hat nicht geantwortet.');
    return { text: r.text, ms: r.ms };
  }

  /** Einen Aufruf ausführen und auf das Ergebnis warten. ms: eigene, kürzere Wartezeit; vorrang: vor die Warteschlange. */
  protected async rufe(
    paket: string,
    art: 'ereignis' | 'aktion',
    eingang: Record<string, unknown>,
    opt: {
      ms?: number;
      vorrang?: boolean;
      bezeichnung?: string;
      teil?: (text: string) => void;
      ohneInhalt?: boolean;
      zugang?: Omit<AktionsZugang, 'paket'>;
      funktion?: string;
      ohneVerlauf?: boolean;
    } = {},
  ): Promise<Ergebnis> {
    if (!this.kind || !this.bereit) return abbruch(t('meldungen.verwaltung.der-paket-laeufer-laeuft'), true);
    const p = this.pakete.find((x) => x.id === paket);
    if (!p) throw new Error('Dieses Paket hat keinen Code.');
    const nr = this.nr++;
    // Paket-Aktion (#1039): Fragen aus diesem Aufruf gehen an den eingeschränkten Zugriff, nicht ans Dienstkonto.
    if (opt.zugang) this.zugaenge.set(nr, { paket, ...opt.zugang });
    const json = JSON.stringify({
      ...eingang,
      paket: { id: p.id, version: p.version },
      einstellungen: eingang.einstellungen ?? (await this.o.einstellungen(paket).catch(() => ({}))),
    });
    // Eigene Zeitgrenze über der des Läufers: Antwortet der Läufer gar nicht mehr, hängt hier nichts.
    const r = await new Promise<Ergebnis>((ok) => {
      const uhr = setTimeout(
        () => {
          if (this.aufrufe.delete(nr))
            ok(
              abbruch(
                opt.ms
                  ? t('meldungen.verwaltung.keine-antwort-innerhalb-von', { ms: opt.ms })
                  : t('meldungen.verwaltung.der-paket-laeufer-hat'),
              ),
            );
        },
        opt.ms ?? this.grenzen.sekunden * 1000 + 15_000,
      );
      uhr.unref?.();
      this.aufrufe.set(nr, {
        ok: (x) => {
          clearTimeout(uhr);
          ok(x);
        },
        ...(opt.teil ? { teil: opt.teil } : {}),
      });
      this.sende({ art: 'aufruf', nr, paket, eingang: { art, json }, ...(opt.vorrang ? { vorrang: true } : {}) });
    }).finally(() => this.zugaenge.delete(nr));
    const s = this.standVon(paket);
    s.aufrufe++;
    if (!r.ok) s.fehlgeschlagen++;
    s.letzterAufruf = new Date().toISOString();
    s.dauerMs = r.ms;
    s.speicherMB = r.speicherMB;
    // Das Ergebnis kann lang sein (Vektor als JSON, #442): in der Werkbank nur der Anfang.
    // ohneInhalt (#444): Fragen und Antworten stehen nirgends – in der Werkbank nur Länge bzw. Fehler.
    const anzeige = opt.ohneInhalt && r.ok ? `${r.text.length} Zeichen` : r.ok ? r.text : (r.fehler ?? '');
    s.letzte.push({
      zeit: s.letzterAufruf,
      art: opt.bezeichnung ?? (art === 'aktion' ? `Aktion ${String(eingang.aktion)}` : String(eingang.art)),
      ok: r.ok,
      text: anzeige.slice(0, 300),
    });
    if (s.letzte.length > LETZTE) s.letzte.splice(0, s.letzte.length - LETZTE);
    if (!r.ok) log.warn(`Paket ${paket}: Aufruf fehlgeschlagen`, { paket, art, fehler: r.fehler, ms: r.ms });
    erfasseNetz(p, { ereignis: art === 'ereignis', funktion: opt.funktion, art: String(eingang.art) }, r.messung);
    this.verlauf(paket, art, eingang, opt, r);
    // Netzaufrufe (#807): ins Protokoll des Pakets und eine Zeile mit der Summe ins Systemprotokoll – Hosts und Bytes, nie Inhalte.
    if (r.netz?.length) {
      merkeNetz(s.protokoll, r.netz);
      const summe = (f: (x: NetzEintrag) => number) => r.netz!.reduce((a, x) => a + f(x), 0);
      log.info(`Paket ${paket}: Netzaufrufe`, {
        paket,
        aufruf: opt.bezeichnung ?? (art === 'aktion' ? `Aktion ${String(eingang.aktion)}` : String(eingang.art)),
        anfragen: summe((x) => (x.abgelehnt ? 0 : x.anzahl)),
        abgelehnt: summe((x) => (x.abgelehnt ? x.anzahl : 0)),
        hosts: [...new Set(r.netz.map((x) => x.host))].join(', '),
        hin: summe((x) => x.hin),
        zurueck: summe((x) => x.zurueck),
      });
    }
    return r;
  }
}
