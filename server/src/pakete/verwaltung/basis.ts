/**
 * Grundlage der Paketverwaltung (#1278): Zustand (Kataloge, Uploads, Umbau-Lagen), Dienst und Optionen, dazu Hilfen,
 * die viele Teile brauchen. Die Paketverwaltung ist eine Kette von Teil-Klassen, je Aufgabe eine Datei:
 * basis → herkunft → kataloge → uploads → vorschau-teile → planen → hochladen → beispiel-mappen → ergaenzen →
 * anlegen → installieren → ablauf → einstellungen → entfernen → paketverwaltung. Jede Teil-Klasse ruft nur, was
 * unter ihr steht; die zwei Aufrufe nach oben (Aufräumen der Uploads, Fassungen anmelden) stehen hier als abstrakte
 * Methoden. Die Rümpfe sind aus pakete.ts unverändert übernommen, `this` ist überall dieselbe Paketverwaltung.
 */
import { type Mappe, type Mappentyp } from '../../../../shared/src/model';
import { type HerkunftPruefung, OFFIZIELLER_KATALOG, type InstalliertesPaket, type Katalog } from '../../../../shared/src/pakete';
import type { Dienst } from '../../dienst';
import { vorgabeMappen, vorgabenLage, type VorgabenLage } from '../index';
import { type UmbauLage } from '../index';
import { vorgabeKennung, vorgabeVerweis } from '../../../../shared/src/vorgaben';
import { type Paket } from './format';
import { type Handelnder, type PaketOptionen } from './optionen';
import { type Vorschau } from './plan';

/** Ein hochgeladenes, geprüftes Paket, bis es installiert wird (höchstens 30 Minuten). */
/** `bytes`: Größe des Archivs – danach richtet sich die Obergrenze im Arbeitsspeicher (#901). */
export interface Hochgeladen {
  paket: Paket;
  von: Handelnder;
  am: string;
  zeit: number;
  pruefung: HerkunftPruefung;
  bytes?: number;
  /** Aus einer Sammeldatei (#1084: fremde_typen müssen sich zuordnen lassen). */ sammel?: boolean;
}

/** Woher ein Upload stammt: einzeln hochgeladen oder aus einer Sammeldatei; das Archiv liest beides gleich (PAKET_GRENZEN). */
export type UploadArt = 'einzeln' | 'sammel';

export const UPLOAD_GUELTIG = 30 * 60_000;

/** So oft fliegen abgelaufene Uploads heraus, auch wenn niemand mehr hochlädt (#901). */
const UPLOAD_AUFRAEUMEN_MS = 5 * 60_000;

/** Zustand und gemeinsame Hilfen; die Methoden ganz oben in der Kette sind hier abstrakt angekündigt. */
export abstract class PaketBasis {
  protected kataloge = new Map<string, { katalog: Katalog; pruefung: HerkunftPruefung; zeit: number }>();

  protected uploads = new Map<string, Hochgeladen>();

  /** Umbau (#1041): die geplante Lage zur Vorschau, die die Installation gleich ausführt. */
  protected umbauLagen = new WeakMap<Vorschau, UmbauLage>();

  /** Ansichten, die trotz Änderung ersetzt werden (#1125) – je Vorschau, wie die Lage des Umbaus. */
  protected sichtenErsetzen = new WeakMap<Vorschau, Set<string>>();

  constructor(
    protected d: Dienst,
    protected o: PaketOptionen,
  ) {
    setInterval(() => {
      void this.raeumeUploadsAuf();
    }, UPLOAD_AUFRAEUMEN_MS).unref();
    this.fassungenAnmelden();
  }

  /** Mappentypen des DMS, auf die Pakete verweisen dürfen (#310): Kennung → Typ. `ablageort` ist der Alias (#883). */
  protected async dmsTypen(): Promise<Map<string, Mappentyp>> {
    const s = await this.d.kern.system();
    const a = await this.d.systemtypen.ablageortTyp();
    return new Map<string, Mappentyp>([
      ['benutzer', s.benutzer],
      ['rolle', s.rolle],
      ...(a ? [['ablageort', a] as [string, Mappentyp]] : []),
    ]);
  }

  /**
   * Übernahme (#883): Bringt Basis den Ablageort mit und gibt es noch den früheren des Kerns, übernimmt das Paket ihn mit
   * gleicher Id – alle Mappen und Verweise bleiben, Herkunft danach „Basis“, kein zweiter Mappentyp. Eine Ansicht des
   * Pakets nur über den Ablageort (ohne Bedingungen, oberste Ebene) übernimmt die vorhandene Ansicht nur über ihn.
   */
  protected async uebernahme(
    paket: Paket,
    ich: InstalliertesPaket | null,
  ): Promise<{ typen: Record<string, string>; sichten: Record<string, string>; name: string } | null> {
    if (paket.manifest.id !== 'basis' || ich?.typen.ablageort || !paket.typen.some((t) => t.schluessel === 'ablageort')) return null;
    const frueher = await this.d.kern.frueherAblageortTyp();
    if (!frueher) return null;
    const sichten: Record<string, string> = {};
    const vorhanden = (await this.d.sichtenVerwaltung.listeSichten()).filter(
      (x) => !x.elternId && x.typen.length === 1 && x.typen[0] === frueher.id && !x.bedingungen.length,
    );
    for (const s of paket.sichten) {
      if (
        s.eltern ||
        ich?.sichten[s.schluessel] ||
        (s.bedingungen ?? []).length ||
        (s.typen ?? []).length !== 1 ||
        s.typen![0] !== 'ablageort'
      )
        continue;
      const x = vorhanden.find((v) => !Object.values(sichten).includes(v.id));
      if (x) sichten[s.schluessel] = x.id;
    }
    return { typen: { ablageort: frueher.id }, sichten, name: frueher.name };
  }

  get katalogUrl() {
    return this.o.katalogUrl ?? OFFIZIELLER_KATALOG;
  }

  /** Sprache der Installation (#1038: Werte der Vorgaben); ohne Angabe Deutsch. */
  protected async sprache(): Promise<string> {
    return (await Promise.resolve(this.o.standardSprache?.()).catch(() => undefined)) ?? 'de';
  }

  /**
   * Lage der Vorgaben eines Pakets (#1038): seine Mappen mit fester Kennung und was mit jeder geschieht. Beim Umzug
   * (#1084) stehen sie noch unter der früheren Id – die Kennung zieht erst mit dem Umzug um.
   */
  protected async vorgabenLage(paket: Paket, ich: InstalliertesPaket | null): Promise<VorgabenLage> {
    const id = ich?.id ?? paket.manifest.id;
    const mappen = paket.vorgaben?.length ? await vorgabeMappen(this.d, id) : [];
    return vorgabenLage(paket.vorgaben ?? [], ich, id, mappen, await this.sprache());
  }

  /** Mappe einer Vorgabe über ihre feste Kennung (`paket:schluessel` bzw. eigener Schlüssel); im Papierkorb zählt nicht. */
  protected async vorgabeMappe(verweis: string, eigenes: string): Promise<Mappe | undefined> {
    const v = vorgabeVerweis(verweis, eigenes);
    const k = vorgabeKennung(v.paket, v.schluessel);
    return (await this.d.kern.repo.mappenMitVorgabe(k)).find((x) => x.vorgabe === k);
  }

  /** Abgelaufene Uploads wegräumen (uploads.ts); der Konstruktor ruft es regelmäßig auf. */
  abstract raeumeUploadsAuf(): Promise<void>;

  /** Fassungen der Paket-Einstellungen anmelden (einstellungen.ts); ruft der Konstruktor. */
  protected abstract fassungenAnmelden(): void;
}
