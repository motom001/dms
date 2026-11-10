/**
 * KI-Dienste und Mappentypen (#796, #1078 aus dienst.ts): welche Mappentypen für KI-Pakete zugelassen sind (Einstellung
 * `ki_typen`, Teil der Sicherung), die Sperre je Paket und die Übersicht in der Werkbank. Schicht 2 – bekommt den Kern
 * und die Rechteprüfung.
 */
import { Fachfehler } from '../fehler';
import type { Kern } from '../kern';
import { protokoll } from '../protokoll';
import type { Repo } from '../repo';
import { t } from '../sprache';
import type { ZugriffDienst } from '../zugriff';
import { INHALT_EREIGNISSE, type InstalliertesPaket, istKiPaket, type KiUebersicht, MAPPEN_EREIGNISSE } from '../../../shared/src/pakete';

export class KiTypen {
  constructor(private readonly kern: Kern, private readonly rechte: ZugriffDienst) {}

  private get repo(): Repo { return this.kern.repo; }
  private get einstellungen() { return this.kern.einstellungen; }
  private paketVerwehrt(): Promise<Record<string, string[]>> { return this.kern.paketVerwehrt(); }
  private typverweise(...a: Parameters<ZugriffDienst['typverweise']>) { return this.rechte.typverweise(...a); }

  /**
   * Mappentypen, die für KI-Dienste zugelassen sind (Einstellung `ki_typen`, Teil der Sicherung). Was nicht darin steht –
   * auch jeder neue Mappentyp –, geht an kein KI-Paket. Fehlt die Einstellung (frische Installation), ist nichts
   * zugelassen. `hinweis`: nach dem Update einmal in der Werkbank sagen, dass man jetzt ausschließen kann.
   */
  async kiTypen(): Promise<{ zugelassen: Set<string>; hinweis: boolean }> {
    const v = await this.einstellungen?.lies('ki_typen') as { zugelassen?: unknown; hinweis?: unknown } | null | undefined;
    const liste = v && typeof v === 'object' && Array.isArray(v.zugelassen) ? v.zugelassen.map(String) : [];
    return { zugelassen: new Set(liste), hinweis: !!v && v.hinweis === true };
  }

  private async schreibeKiTypen(k: { zugelassen: Set<string>; hinweis: boolean }) {
    if (!this.einstellungen) throw new Fachfehler(404, t('meldungen.dienst.einstellungen-sind-nicht'));
    await this.einstellungen.schreibe('ki_typen', { zugelassen: [...k.zugelassen].sort(), ...(k.hinweis ? { hinweis: true } : {}) });
  }

  /**
   * Für ein Paket: Ist dieser Mappentyp für es gesperrt, weil es ein KI-Paket ist und der Typ nicht zugelassen ist?
   * Für Pakete ohne Netz (oder ohne Zugriff auf Inhalte) immer nein. Je Aufruf neu gelesen – Änderungen wirken sofort.
   */
  async kiSperre(p: Pick<InstalliertesPaket, 'laeufer'> | null | undefined): Promise<(typId: string) => boolean> {
    if (!p || !istKiPaket(p.laeufer)) return () => false;
    const { zugelassen } = await this.kiTypen();
    return (typId) => !zugelassen.has(typId);
  }

  /** Wie `kiSperre`, für ein Paket nach Id (Erkennen, Antworten, Übersetzen). Unbekanntes Paket: nichts gesperrt. */
  async kiSperreFuer(paketId: string): Promise<(typId: string) => boolean> {
    return this.kiSperre((await this.repo.listePakete()).find((x) => x.id === paketId));
  }

  /**
   * Für die Werkbank: alle Mappentypen (außer Benutzer) mit „zugelassen“, die KI-Pakete und welche Mappentypen jedes
   * bekommt – bei Paketen mit Leserecht die lesbaren (bestätigte Rechte, nicht verwehrt) und zugelassenen, bei
   * Paketen, die Ausschnitte vom Kern bekommen (Antworten, Erkennen, Übersetzen), alle zugelassenen.
   */
  async kiUebersicht(): Promise<KiUebersicht> {
    const [typen, pakete, verwehrt, k] = [await this.repo.listeTypen(), await this.repo.listePakete(), await this.paketVerwehrt(), await this.kiTypen()];
    const liste = typen.filter((x) => x.system !== 'benutzer').sort((a, b) => a.name.localeCompare(b.name, 'de'));
    const ki: KiUebersicht['pakete'] = [];
    for (const p of pakete) {
      const l = p.laeufer;
      if (!l || !istKiPaket(l)) continue;
      const lesbar = await this.typverweise(p.id, pakete, typen);
      // Ausschnitte bzw. Text vom Kern (auch „Wohin gehört das?“, #939) oder Ereignisse zu Dokumenten und Post (#796): kommen aus allen zugelassenen Typen, auch ohne Leserecht.
      const ueberKern = (l.rechte.schnittstellen ?? []).some((s) => s === 'dms:antworten' || s === 'dms:erkennen' || s === 'dms:klassifizieren' || s === 'dms:uebersetzen')
        || l.ereignisse.some((e) => INHALT_EREIGNISSE.includes(e) && !MAPPEN_EREIGNISSE.includes(e));
      const darf = lesbar(l.rechte.lesen);
      const bekommt = liste.filter((x) => k.zugelassen.has(x.id) && (ueberKern || (darf.has(x.id) && !verwehrt[x.id]?.includes(p.id)))).map((x) => x.id);
      ki.push({ id: p.id, name: p.name, bekommt });
    }
    return {
      typen: liste.map((x) => ({ id: x.id, name: x.name, zugelassen: k.zugelassen.has(x.id), ...(x.system ? { system: x.system } : {}) })),
      pakete: ki.sort((a, b) => a.name.localeCompare(b.name, 'de')),
      hinweis: k.hinweis && ki.length > 0,
    };
  }

  /** Einen Mappentyp für KI-Dienste zulassen bzw. sperren; wirkt sofort (Lesen, Ereignisse, Antworten, Erkennen, Übersetzen). */
  async setzeKiTyp(typId: string, zugelassen: boolean, von: string | null): Promise<KiUebersicht> {
    const typ = await this.repo.holeTyp(typId);
    if (!typ) throw new Fachfehler(404, t('meldungen.dienst.diesen-mappentyp-gibt-es'));
    if (typ.system === 'benutzer') throw new Fachfehler(422, t('meldungen.dienst.ki-benutzer'));
    const k = await this.kiTypen();
    if (zugelassen) k.zugelassen.add(typId); else k.zugelassen.delete(typId);
    await this.schreibeKiTypen(k);
    protokoll.modul('werkbank').info(zugelassen ? 'Mappentyp für KI-Dienste zugelassen' : 'Mappentyp für KI-Dienste gesperrt', { typ: typ.name, von });
    return this.kiUebersicht();
  }

  /** Den Hinweis nach dem Update („Mappentypen lassen sich jetzt ausschließen“) nicht mehr zeigen. */
  async kiHinweisGelesen(): Promise<KiUebersicht> {
    const k = await this.kiTypen();
    if (k.hinweis) await this.schreibeKiTypen({ ...k, hinweis: false });
    return this.kiUebersicht();
  }
}
