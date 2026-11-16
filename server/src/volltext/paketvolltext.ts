/**
 * Volltext aus Paketen (#614): Pakete mit dem Recht `dms:volltext` liefern den Volltext für Dateitypen, die der Kern
 * nicht selbst liest (z. B. Word, Excel, E-Mails – Paket „Office und E-Mail“). Muster wie Dateien umwandeln (#577):
 *
 * - Zuständig ist je Dateityp das erste Paket nach Id, das ihn in `code.volltext` nennt.
 * - Der Kern meldet solche Dateien mit dem Ereignis `datei.volltext` an genau dieses Paket – aus der Warteschlange des
 *   Volltexts (texterkennung.ts), also beim Hochladen, bei einer neuen Version, bei „Volltext neu erzeugen“, „Erneut
 *   versuchen“ und wenn ein solches Paket neu installiert wird (vorhandene Dateien ohne Text). Bis das Paket schreibt,
 *   steht am Dokument „wartet auf Volltext (Paket …)“; vorhandener Text bleibt so lange für die Suche stehen.
 * - Das Paket liest die Datei (`GET /dokumente/{id}/inhalt`) und schreibt den Volltext (`PUT /dokumente/{id}/volltext`)
 *   – mit `dokumente: lesen`, ohne Schreibrecht: Für diese Dokumente (zuständiger Dateityp) darf es genau das (und die
 *   Sprache des Texts), sonst nichts.
 * - Schreibt es nichts (z. B. verschlüsselte Datei), steht sein Grund am Dokument; gibt der Läufer auf: Fehler.
 */
import type { Dokument } from '../../../shared/src/model';
import { hatSchnittstelle, type InstalliertesPaket } from '../../../shared/src/pakete';
import { VOLLTEXT_PAKET_MAX_BYTES } from '../../../shared/src/paketvolltext';
import { kernTyp } from '../../../shared/src/dateiumwandlung';
import { protokoll } from '../protokoll/protokoll';

const log = protokoll.modul('texterkennung');

/** So lange gilt eine Meldung als unterwegs: Dieselbe Datei geht in der Zeit nicht noch einmal an das Paket. */
export const VOLLTEXT_ANGEFORDERT_MS = 30 * 60_000;

/** Ein Paket, das Volltext liefert: Id, Name, Version und seine Dateitypen. */
export interface VolltextPaket {
  id: string;
  name: string;
  version: string;
  typen: string[];
}

export interface PaketVolltextAnbindung {
  /** Installierte Pakete. */
  pakete(): Promise<InstalliertesPaket[]>;
  /** Ereignis `datei.volltext` an genau dieses Paket (Ausgangskorb des Läufers). */
  /** „gesperrt“ (#796): KI-Sperre – nichts ging an das Paket. */
  melde(paket: string, daten: Record<string, unknown>): Promise<'gesperrt' | void>;
}

export class PaketVolltext {
  /** Dokument-Id → Zeit der Meldung. */
  private angefordert = new Map<string, number>();

  constructor(private o: PaketVolltextAnbindung) {}

  /** Alle installierten Pakete mit `dms:volltext`, nach Id. */
  async pakete(): Promise<VolltextPaket[]> {
    return (await this.o.pakete())
      .filter((p) => hatSchnittstelle(p.laeufer, 'dms:volltext') && p.laeufer?.volltext?.length)
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((p) => ({ id: p.id, name: p.name, version: p.version, typen: p.laeufer!.volltext! }));
  }

  /**
   * Das zuständige Paket für einen Dateityp (bei mehreren das erste nach Id) oder null. PDF, JPEG, PNG liest der Kern.
   * Ohne Rücksicht auf Groß- und Kleinschreibung: Browser schicken z. B. „…macroEnabled.12“, das Manifest nennt Kleinbuchstaben.
   */
  async paketFuer(mime: string, liste?: VolltextPaket[]): Promise<VolltextPaket | null> {
    const m = mime.toLowerCase();
    if (kernTyp(m)) return null;
    return (liste ?? (await this.pakete())).find((p) => p.typen.includes(m)) ?? null;
  }

  /** Darf dieses Paket den Volltext dieses Dokuments schreiben (dms:volltext und zuständig für den Dateityp)? */
  async darfSchreiben(paketId: string, d: Pick<Dokument, 'mime'>): Promise<boolean> {
    const p = await this.paketFuer(d.mime);
    return !!p && p.id === paketId;
  }

  /** Läuft für dieses Dokument schon eine Meldung (in den letzten 30 Minuten)? */
  unterwegs(id: string): boolean {
    const t = this.angefordert.get(id);
    return t !== undefined && Date.now() - t <= VOLLTEXT_ANGEFORDERT_MS;
  }

  /**
   * Ein Dokument an das zuständige Paket melden (`datei.volltext`). `neu`: ausdrücklich neu (z. B. „Volltext neu
   * erzeugen“), auch wenn das Dokument schon unterwegs ist. Liefert, ob die Meldung hinausging – „gesperrt“, wenn der
   * Mappentyp nicht an dieses (KI-)Paket darf (#796).
   */
  async anfordern(
    d: Pick<Dokument, 'id' | 'mappeId' | 'name' | 'mime' | 'groesse' | 'sha256'>,
    p: VolltextPaket,
    o: { neu?: boolean } = {},
  ): Promise<boolean | 'gesperrt'> {
    const jetzt = Date.now();
    for (const [id, zeit] of this.angefordert) if (jetzt - zeit > VOLLTEXT_ANGEFORDERT_MS) this.angefordert.delete(id);
    if (d.groesse > VOLLTEXT_PAKET_MAX_BYTES) return false;
    if (!o.neu && this.angefordert.has(d.id)) return false;
    this.angefordert.set(d.id, jetzt);
    if (
      (await this.o.melde(p.id, {
        dokument: d.id,
        mappe: d.mappeId,
        name: d.name,
        mime: d.mime,
        groesse: d.groesse,
        sha256: d.sha256,
        ...(o.neu ? { neu: true } : {}),
      })) === 'gesperrt'
    ) {
      this.angefordert.delete(d.id);
      return 'gesperrt';
    }
    log.info('Datei zum Volltext an das Paket gemeldet', { dokument: d.id, typ: d.mime, paket: p.id });
    return true;
  }

  /** Das Paket ist mit der Meldung fertig (oder hat aufgegeben): Das Dokument darf wieder gemeldet werden. */
  erledigt(id: string) {
    this.angefordert.delete(id);
  }
}
