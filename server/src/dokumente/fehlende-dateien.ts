/**
 * Fehlende Dateien (#877, #1075 aus dienst.ts): beim Lesen gemerkt, für den Hinweis der Werkbank-Übersicht gezählt,
 * alle Dateien auf Vorhandensein prüfen, vor einem Strom sauber abbrechen. Schicht 2.
 */
import type { Dokument } from '../../../shared/src/model';
import { DateiFehlt } from '../dateispeicher';
import type { Kern } from '../kern';
import { protokoll } from '../protokoll';
import type { Repo } from '../repo';

/** Fehlende Dateien (#877), die beim Lesen auffielen: für den Hinweis der Werkbank-Übersicht (höchstens so viele). */
const FEHLENDE_DATEIEN = 'dateien_fehlen';
const FEHLENDE_DATEIEN_MAX = 1000;

export class FehlendeDateien {
  constructor(private readonly kern: Kern) {}

  private get repo(): Repo { return this.kern.repo; }
  private get dateien() { return this.kern.dateien; }
  private get einstellungen() { return this.kern.einstellungen; }

  /* ---------- Fehlende Dateien (#877) ---------- */

  /**
   * Eine Datei fehlt im Ablageordner (beim ersten Lesen in diesem Prozess): einmal ins Protokoll – mit Prüfwert, Pfad
   * und den Mappen, nur dort – und für den Hinweis der Werkbank-Übersicht merken.
   */
  async merkeFehlendeDatei(f: { sha256: string; pfad: string; ablage: string }) {
    const doks = await this.repo.dokumenteMitSha(f.sha256).catch(() => [] as Dokument[]);
    protokoll.modul('dokumente').error('Datei eines Dokuments fehlt im Ablageordner', {
      sha256: f.sha256, pfad: f.pfad, ablage: f.ablage,
      ...(doks.length ? { dokumente: doks.slice(0, 5).map((d) => d.id).join(', '), mappen: [...new Set(doks.map((d) => d.mappeId))].slice(0, 5).join(', ') } : {}),
    });
    const alt = await this.gemerkteFehlendeDateien();
    if (!alt.includes(f.sha256)) await this.schreibeFehlendeDateien([...alt, f.sha256]);
  }

  private async gemerkteFehlendeDateien(): Promise<string[]> {
    const w = (await this.einstellungen?.lies(FEHLENDE_DATEIEN)) as { shas?: unknown } | null;
    return Array.isArray(w?.shas) ? w.shas.filter((x): x is string => typeof x === 'string' && /^[0-9a-f]{64}$/.test(x)) : [];
  }

  async schreibeFehlendeDateien(shas: string[]) {
    if (!this.einstellungen) return;
    const liste = [...new Set(shas)].slice(-FEHLENDE_DATEIEN_MAX);
    await this.einstellungen.schreibe(FEHLENDE_DATEIEN, liste.length ? { shas: liste, am: new Date().toISOString() } : null);
  }

  /**
   * Zahl der fehlenden Dateien für die Übersicht: die gemerkten, die noch gebraucht werden und immer noch fehlen.
   * Ist eine wieder da (Volume wieder eingebunden) oder kein Dokument zeigt mehr darauf, verschwindet sie aus der Liste.
   */
  async fehlendeDateien(): Promise<number> {
    const alt = await this.gemerkteFehlendeDateien();
    if (!alt.length) return 0;
    const noch: string[] = [];
    for (const sha of alt) if ((await this.repo.dateiBenutzt(sha)) && !(await this.dateiVorhanden(sha))) noch.push(sha);
    if (noch.length !== alt.length) await this.schreibeFehlendeDateien(noch);
    return noch.length;
  }

  private async dateiVorhanden(sha: string): Promise<boolean> {
    if (this.dateien.vorhanden) return this.dateien.vorhanden(sha);
    try { const s = await this.dateien.lies(sha); if (!Buffer.isBuffer(s)) s.destroy(); return true; } catch { return false; }
  }

  /**
   * Alle Dateien nur auf Vorhandensein prüfen (Lasttest #877: schnell, ohne zu lesen): Dokumente ohne Datei. Je
   * Datei ein `stat`, 32 gleichzeitig.
   */
  async dokumenteOhneDatei(): Promise<{ dateien: number; fehlend: number; dokumente: number }> {
    const alle = await this.repo.alleDateien();
    const shas = [...new Set(alle.map((x) => x.sha256))];
    const fehlt = new Set<string>();
    let i = 0;
    await Promise.all(Array.from({ length: Math.min(32, shas.length) }, async () => {
      while (i < shas.length) { const sha = shas[i++]; if (!(await this.dateiVorhanden(sha))) fehlt.add(sha); }
    }));
    if (fehlt.size) await this.schreibeFehlendeDateien([...(await this.gemerkteFehlendeDateien()), ...fehlt]).catch(() => {});
    return { dateien: shas.length, fehlend: fehlt.size, dokumente: new Set(alle.filter((x) => fehlt.has(x.sha256)).map((x) => x.dokumentId)).size };
  }

  /** Vor einem Strom, dessen Kopf schon unterwegs wäre (ZIP): fehlt eine Datei, gleich ein sauberer Fehler. */
  async pruefeVorhanden(docs: Array<Pick<Dokument, 'sha256' | 'name'>>) {
    if (!this.dateien.vorhanden) return;
    for (const d of docs) {
      if (await this.dateien.vorhanden(d.sha256)) continue;
      // Lesen meldet das Fehlen wie überall (einmal ins Protokoll, Hinweis der Übersicht).
      await this.dateien.lies(d.sha256).then((x) => { if (!Buffer.isBuffer(x)) x.destroy(); }, () => {});
      throw new DateiFehlt(d.sha256, d.name);
    }
  }
}
