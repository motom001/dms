/**
 * KI-Dienste und Mappentypen (#796, #1078 aus dienst.ts): welche Mappentypen für KI-Pakete zugelassen sind (Einstellung
 * `ki_typen`, Teil der Sicherung), die Sperre je Paket und die Übersicht in der Werkbank. Schicht 2 – bekommt den Kern
 * und die Rechteprüfung.
 *
 * Wortlaut (#1559): In der Oberfläche heißt das „Darf an Dienste im Netz gehen“ (kurz „im Netz erlaubt“ / „bleibt in
 * Ablago“) – die Sperre gilt für jedes Paket mit Netz, das Inhalte bekommt, nicht nur für KI. Die internen Namen
 * (`ki_typen`, `istKiPaket`, Routen) bleiben, damit kein Umbau nötig ist. Technisch bleibt es eine eigene Sperre neben
 * den Berechtigungen: Diese regeln, wer eine Mappe sieht; die Sperre, wohin Inhalte fließen dürfen.
 *
 * Eine Entscheidung (#1635): Wer „Auch Helfer, die Dienste im Netz nutzen“ erlaubt, gibt alle Bereiche frei; die
 * Feinabstimmung nimmt einzelne aus. Gespeichert als `{ ausgenommen: [...] }` – neue Mappentypen gehen mit. Bestehende
 * Installationen behalten ihre Liste `{ zugelassen: [...] }` (nichts wird still erweitert), bis jemand „Alle erlauben“
 * wählt. Neue Installationen bekommen bei der Einrichtung `{ ausgenommen: [] }` ({@link KI_ALLE}).
 */
import { Fachfehler } from '../grundlagen/fehler';
import type { Kern } from '../kern';
import { protokoll } from '../protokoll/protokoll';
import type { Repo } from '../repo';
import { t } from '../sprache/sprache';
import type { ZugriffDienst } from '../zugriff';
import { INHALT_EREIGNISSE, type InstalliertesPaket, istKiPaket, type KiUebersicht, MAPPEN_EREIGNISSE } from '../../../shared/src/pakete';

/**
 * Stand der Einstellung `ki_typen`: `alle` = alle außer `liste` (ausgenommen); sonst nur `liste` (zugelassen).
 * `hinweis`: Bei der bisherigen Liste einmal fragen „Bisher gehen nur diese Bereiche hinaus – alle erlauben?“ (#1635;
 * ersetzt den Hinweis nach dem Update von #796), bis jemand ihn ausblendet (`gefragt`).
 */
export interface KiStand {
  alle: boolean;
  liste: Set<string>;
  hinweis: boolean;
}

/** Wert für neue Installationen (#1635): alle Bereiche, nichts ausgenommen. */
export const KI_ALLE = { ausgenommen: [] as string[] };

/** Die Einstellung lesen. Fehlt sie, gilt die alte Liste ohne Einträge (bestehende Installation ohne Zulassung). */
export function liesKiStand(v: unknown): KiStand {
  const o = (v && typeof v === 'object' ? v : {}) as { zugelassen?: unknown; ausgenommen?: unknown; gefragt?: unknown };
  const alle = Array.isArray(o.ausgenommen);
  const roh = alle ? o.ausgenommen : o.zugelassen;
  return { alle, liste: new Set(Array.isArray(roh) ? roh.map(String) : []), hinweis: !alle && o.gefragt !== true };
}

/** Darf dieser Mappentyp an Dienste im Netz gehen? */
export const kiErlaubt = (k: KiStand, typId: string) => (k.alle ? !k.liste.has(typId) : k.liste.has(typId));

/** Den Stand als Einstellung schreiben. */
export const kiWert = (k: KiStand) =>
  k.alle ? { ausgenommen: [...k.liste].sort() } : { zugelassen: [...k.liste].sort(), ...(k.hinweis ? {} : { gefragt: true }) };

/** Einen Mappentyp zulassen bzw. ausnehmen – in beiden Formen. */
export function setzeKi(k: KiStand, typId: string, erlaubt: boolean): KiStand {
  const liste = new Set(k.liste);
  if (erlaubt === k.alle) liste.delete(typId);
  else liste.add(typId);
  return { ...k, liste };
}

export class KiTypen {
  constructor(
    private readonly kern: Kern,
    private readonly rechte: ZugriffDienst,
  ) {}

  private get repo(): Repo {
    return this.kern.repo;
  }
  private get einstellungen() {
    return this.kern.einstellungen;
  }
  private paketVerwehrt(): Promise<Record<string, string[]>> {
    return this.kern.paketVerwehrt();
  }
  private typverweise(...a: Parameters<ZugriffDienst['typverweise']>) {
    return this.rechte.typverweise(...a);
  }

  /**
   * Stand der Einstellung `ki_typen` (Teil der Sicherung, #1635): alle außer den ausgenommenen oder – bei bestehenden
   * Installationen – die bisherige Liste. `hinweis`: nach dem Update von #796 einmal sagen, dass man ausschließen kann.
   */
  async kiTypen(): Promise<KiStand> {
    return liesKiStand(await this.einstellungen?.lies('ki_typen'));
  }

  private async schreibeKiTypen(k: KiStand) {
    if (!this.einstellungen) throw new Fachfehler(404, t('meldungen.dienst.einstellungen-sind-nicht'));
    await this.einstellungen.schreibe('ki_typen', kiWert(k));
  }

  /**
   * Für ein Paket: Ist dieser Mappentyp für es gesperrt, weil es ein KI-Paket ist und der Typ nicht zugelassen ist?
   * Für Pakete ohne Netz (oder ohne Zugriff auf Inhalte) immer nein. Je Aufruf neu gelesen – Änderungen wirken sofort.
   * Die eine Regel für alle Wege (#1635): Lesen, Ereignisse, Aufträge, Antworten, Erkennen, Klassifizieren, Übersetzen.
   */
  async kiSperre(p: Pick<InstalliertesPaket, 'laeufer'> | null | undefined): Promise<(typId: string) => boolean> {
    if (!p || !istKiPaket(p.laeufer)) return () => false;
    const k = await this.kiTypen();
    return (typId) => !kiErlaubt(k, typId);
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
    const [typen, pakete, verwehrt, k] = [
      await this.repo.listeTypen(),
      await this.repo.listePakete(),
      await this.paketVerwehrt(),
      await this.kiTypen(),
    ];
    const liste = typen.filter((x) => x.system !== 'benutzer').sort((a, b) => a.name.localeCompare(b.name, 'de'));
    const ki: KiUebersicht['pakete'] = [];
    for (const p of pakete) {
      const l = p.laeufer;
      if (!l || !istKiPaket(l)) continue;
      const lesbar = await this.typverweise(p.id, pakete, typen);
      // Ausschnitte bzw. Text vom Kern (auch „Wohin gehört das?“, #939) oder Ereignisse zu Dokumenten und Post (#796): kommen aus allen zugelassenen Typen, auch ohne Leserecht.
      const ueberKern =
        (l.rechte.schnittstellen ?? []).some(
          (s) => s === 'dms:antworten' || s === 'dms:erkennen' || s === 'dms:klassifizieren' || s === 'dms:uebersetzen',
        ) || l.ereignisse.some((e) => INHALT_EREIGNISSE.includes(e) && !MAPPEN_EREIGNISSE.includes(e));
      const darf = lesbar(l.rechte.lesen);
      const bekommt = liste
        .filter((x) => kiErlaubt(k, x.id) && (ueberKern || (darf.has(x.id) && !verwehrt[x.id]?.includes(p.id))))
        .map((x) => x.id);
      ki.push({ id: p.id, name: p.name, bekommt });
    }
    return {
      typen: liste.map((x) => ({ id: x.id, name: x.name, zugelassen: kiErlaubt(k, x.id), ...(x.system ? { system: x.system } : {}) })),
      pakete: ki.sort((a, b) => a.name.localeCompare(b.name, 'de')),
      hinweis: k.hinweis,
      alle: k.alle,
    };
  }

  /** Einen Mappentyp für KI-Dienste zulassen bzw. sperren; wirkt sofort (Lesen, Ereignisse, Antworten, Erkennen, Übersetzen). */
  async setzeKiTyp(typId: string, zugelassen: boolean, von: string | null): Promise<KiUebersicht> {
    const typ = await this.repo.holeTyp(typId);
    if (!typ) throw new Fachfehler(404, t('meldungen.dienst.diesen-mappentyp-gibt-es'));
    if (typ.system === 'benutzer') throw new Fachfehler(422, t('meldungen.dienst.ki-benutzer'));
    await this.schreibeKiTypen(setzeKi(await this.kiTypen(), typId, zugelassen));
    protokoll
      .modul('werkbank')
      .info(zugelassen ? 'Mappentyp für KI-Dienste zugelassen' : 'Mappentyp für KI-Dienste gesperrt', { typ: typ.name, von });
    return this.kiUebersicht();
  }

  /**
   * „Alle erlauben“ (#1635): Eine bestehende Installation wechselt von ihrer bisherigen Liste zu „alle Bereiche“ – nur
   * auf ausdrücklichen Wunsch. `ausgenommen`: Mappentypen, die trotzdem in Ablago bleiben sollen.
   */
  async kiAlleErlauben(ausgenommen: string[], von: string | null): Promise<KiUebersicht> {
    const typen = new Set((await this.repo.listeTypen()).filter((x) => x.system !== 'benutzer').map((x) => x.id));
    await this.schreibeKiTypen({ alle: true, liste: new Set(ausgenommen.filter((x) => typen.has(x))), hinweis: false });
    protokoll.modul('werkbank').info('Alle Mappentypen dürfen an Dienste im Netz gehen', { ausgenommen: ausgenommen.length, von });
    return this.kiUebersicht();
  }

  /** Den Hinweis „Bisher gehen nur diese Bereiche hinaus – alle erlauben?“ (#1635) nicht mehr zeigen; die Liste bleibt. */
  async kiHinweisGelesen(): Promise<KiUebersicht> {
    const k = await this.kiTypen();
    if (k.hinweis) await this.schreibeKiTypen({ ...k, hinweis: false });
    return this.kiUebersicht();
  }
}
