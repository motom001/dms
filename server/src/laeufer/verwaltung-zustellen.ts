/** Paket-Läufer, Seite des DMS (#1278 aus verwaltung.ts): Ereignisse zustellen (mit Wiederholung) und Übersicht für die Werkbank. */
import { PaketlaeuferAufrufe } from './verwaltung-aufrufe';
import { extern } from '../system/externmessung';
import { log, type Ergebnis, liesWeiter, WEITER_MAX, WARTEN_MIN, type PaketStand } from './verwaltung-hilfen';
import type { PaketEreignis } from '../repo';
import { t } from '../sprache/sprache';
import type { LaeuferZustand } from '../../../shared/src/pakete';
import type { Grenzen } from './prozess';

export abstract class PaketlaeuferZustellen extends PaketlaeuferAufrufe {
  /**
   * Fällige Ereignisse zustellen: je Paket eine eigene Kette, der Reihe nach. Schlägt ein Ereignis fehl,
   * warten die späteren desselben Pakets, bis es zugestellt oder aufgegeben ist (siehe faelligeEreignisse).
   */
  async stelleZu(): Promise<void> {
    if (this.holend || !this.laeuft()) return;
    this.holend = true;
    try {
      const liste = await this.o.dienst.kern.repo.faelligeEreignisse(50);
      const jePaket = new Map<string, typeof liste>();
      for (const e of liste) jePaket.set(e.paketId, [...(jePaket.get(e.paketId) ?? []), e]);
      for (const [paket, es] of jePaket) {
        // Harte Grenze des Monatsbudgets (#565): Ereignisse kostenpflichtiger KI-Pakete warten bis zum Monatsanfang.
        if (this.zustellend.has(paket) || extern.pausiertBis(paket)) continue;
        this.zustellend.add(paket);
        void this.stellePaketZu(paket, es)
          .catch((e) => log.error('Paket-Läufer: Zustellung unterbrochen', { paket, fehler: (e as Error).message }))
          .finally(() => {
            this.zustellend.delete(paket);
            if (this.laeuft()) setImmediate(() => void this.stelleZu());
          });
      }
    } catch (e) {
      log.error('Paket-Läufer: Zustellung unterbrochen', { fehler: (e as Error).message });
    } finally {
      this.holend = false;
    }
  }

  /** Ereignisse eines Pakets der Reihe nach; beim ersten Fehler Schluss (Wiederholung später). */
  private async stellePaketZu(paket: string, es: PaketEreignis[]): Promise<void> {
    for (const e of es) {
      if (!this.laeuft()) return; // Wartung oder Läufer weg: später, ohne Versuch
      if (!this.pakete.some((p) => p.id === paket)) {
        await this.o.dienst.kern.repo.ereignisFehlgeschlagen(e.id, t('meldungen.verwaltung.das-paket-hat-keinen'), null);
        continue;
      }
      // Antwort jedes Aufrufs (#636): z. B. Stand der Kopie außer Haus – das Paket meldet ihn, statt selbst zu schreiben.
      const antwort = (r: Ergebnis, beginn: number) =>
        r.ohneVersuch
          ? Promise.resolve()
          : this.o.dienst.volltexte
              .nachEreignisAufruf(paket, e, { ok: r.ok, text: r.text, fehler: r.fehler, rc: r.rc, beginn })
              .catch((f) =>
                log.warn('Paket-Läufer: Antwort des Pakets nicht übernommen', { paket, art: e.art, fehler: (f as Error).message }),
              );
      let beginn = Date.now();
      let r = await this.rufe(paket, 'ereignis', { art: e.art, id: e.id, erstellt: e.erstellt, versuch: e.versuche + 1, daten: e.daten });
      await antwort(r, beginn);
      // Fortsetzung (#458): gleich noch einmal, mit dem Stand des Pakets; der Stand bleibt für eine Wiederholung gespeichert.
      for (let weiter = r.ok ? liesWeiter(r.text) : null; weiter; weiter = r.ok ? liesWeiter(r.text) : null) {
        const abschnitt = (Number(e.daten.abschnitt) || 0) + 1;
        const max = this.o.weiterMax ?? WEITER_MAX;
        if (abschnitt > max) {
          this.notiere(paket, { stufe: 2, text: t('meldungen.verwaltung.ereignis-nach-fortsetzungen-beendet', { max }) });
          break;
        }
        e.daten = { ...e.daten, weiter, abschnitt };
        await this.o.dienst.kern.repo.ereignisDaten(e.id, e.daten);
        await this.o.dienst.volltexte.texterkennungFortschritt(paket, e, weiter).catch(() => {});
        if (!this.laeuft()) return;
        beginn = Date.now();
        r = await this.rufe(paket, 'ereignis', { art: e.art, id: e.id, erstellt: e.erstellt, versuch: e.versuche + 1, daten: e.daten });
        await antwort(r, beginn);
      }
      // Texterkennung als Paket (#458): Dokument wartet nicht länger, wenn das Paket fertig ist oder aufgibt.
      const nachher = (x: { ok: boolean; text: string; fehler?: string | null; aufgegeben?: boolean }) =>
        this.o.dienst.volltexte
          .nachTexterkennungsEreignis(paket, e, x)
          .catch((f) => log.warn('Paket-Läufer: Stand der Texterkennung nicht nachgetragen', { paket, fehler: (f as Error).message }));
      if (r.ok) {
        await this.o.dienst.kern.repo.ereignisZugestellt(e.id);
        await nachher({ ok: true, text: r.text });
        continue;
      }
      if (r.ohneVersuch) return;
      const w = WARTEN_MIN[e.versuche];
      await this.o.dienst.kern.repo.ereignisFehlgeschlagen(
        e.id,
        r.fehler ?? 'Fehler',
        w === undefined ? null : new Date(Date.now() + w * 60_000),
      );
      if (w === undefined) {
        log.error(`Paket ${paket}: Ereignis aufgegeben`, { paket, art: e.art, fehler: r.fehler });
        await nachher({ ok: false, text: '', fehler: r.fehler, aufgegeben: true });
        continue;
      }
      return; // spätere Ereignisse dieses Pakets warten auf die Wiederholung (Reihenfolge)
    }
  }

  /** Für die Werkbank: Stand je Paket mit Code. */
  async uebersicht(): Promise<{
    laeuft: boolean;
    pausiert: boolean;
    zustand: LaeuferZustand;
    absturz: string | null;
    grenzen: Grenzen;
    pakete: PaketStand[];
  }> {
    const ereignisse = await this.o.dienst.kern.repo.ereignisStand();
    const laeuft = !!this.kind && this.bereit;
    const zustand: LaeuferZustand = this.o.pausiert?.()
      ? 'pausiert'
      : laeuft
        ? 'bereit'
        : !this.pakete.length
          ? 'aus'
          : !this.kind && this.absturz
            ? 'neustart'
            : 'startet';
    return {
      laeuft,
      pausiert: !!this.o.pausiert?.(),
      zustand,
      absturz: this.absturz,
      grenzen: this.grenzen,
      pakete: this.pakete.map((p) => {
        const s = this.standVon(p.id);
        return {
          id: p.id,
          name: p.name,
          version: p.version,
          dienstkonto: this.konto.get(p.id)?.name ?? null,
          geladen: this.ladefehler.has(p.id) && !this.ladefehler.get(p.id),
          fehler: this.ladefehler.get(p.id) ?? null,
          ...s,
          letzte: [...s.letzte].reverse(),
          protokoll: [...s.protokoll].reverse(),
          ereignisse: ereignisse[p.id] ?? { offen: 0, aufgegeben: 0, zugestellt: 0 },
        };
      }),
    };
  }
}
