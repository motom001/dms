import type { Mappentyp } from '../../../shared/src/model';
import type { Kern, SystemIds } from '../kern';

/**
 * Die Schritte der Systemausstattung (#963) aus den Fachbereichen – beim Zusammenbau übergeben. Jeder Schritt legt
 * nur an, was fehlt, und ändert sonst nichts.
 */
export interface Ausstattungsschritte {
  mappentypen: {
    /** Systemtypen „Rolle“, „Benutzer“ und „Post“ samt Systemfeldern, Beschriftungen und Systemrollen; `neu` = eben angelegte Typen. */
    sichereSystemtypen(): Promise<{ post: Mappentyp; neu: Mappentyp[] }>;
  };
  sichten: {
    /** Eigene Ansicht für einen eben angelegten Typ (#38). */
    sichtFuerTyp(typ: Mappentyp): Promise<void>;
    /** Mitgelieferte Ansicht „Favoriten“ (#725), einmal. */
    sichereFavoritenSicht(): Promise<void>;
  };
  post: {
    /** Ansichten „Neue Post“, „Eingegangen“, „Versendet“ (#192), einmal. */
    sicherePostSichten(post: Mappentyp): Promise<void>;
  };
}

/**
 * Systemausstattung (#963): legt an, was jede Ablage braucht – Systemtypen, Systemrollen und die mitgelieferten
 * Ansichten. Ein Ablauf über den Fachbereichen (Werkzeug 4): ruft Mappentypen, Ansichten und Post nacheinander auf.
 *
 * Läuft beim Start (und damit nach jeder Wiederherstellung, die neu startet) über `sicherstellen()`; der Kern ruft
 * `anlegen()` als Rückfall, wenn beim Nachschlagen (`kern.system()`) etwas fehlt – Tests, Wiederherstellung und
 * Demo entfernen arbeiten ohne Start. Gleichzeitige Aufrufe teilen sich einen Lauf.
 */
export class Systemausstattung {
  private lauf?: Promise<void>;

  constructor(private readonly kern: Kern, private readonly schritte: Ausstattungsschritte) {}

  /** Anlegen, was fehlt, und die Systemtypen danach frisch nachschlagen. */
  async sicherstellen(): Promise<SystemIds> {
    await this.anlegen();
    this.kern.vergissSystem();
    return this.kern.system();
  }

  /** Nur anlegen (Rückfall des Kerns); ruft `kern.system()` nicht. */
  anlegen(): Promise<void> {
    this.lauf ??= this.nacheinander().finally(() => { this.lauf = undefined; });
    return this.lauf;
  }

  private async nacheinander(): Promise<void> {
    const { post, neu } = await this.schritte.mappentypen.sichereSystemtypen();
    // Die Ansicht des Typs vor den Ansichten der Post: „Eingegangen“ und „Versendet“ hängen unter ihr.
    for (const typ of neu) await this.schritte.sichten.sichtFuerTyp(typ);
    await this.schritte.post.sicherePostSichten(post);
    await this.schritte.sichten.sichereFavoritenSicht();
  }
}
