import { createContext } from 'react';
import type { AblaufEingabe, AblaufInstallation, AblaufPlan, InstalliertesPaket, Katalog } from '../../../../shared/src/pakete';
import { paketeApi, type PaketVorschau, type Sammeldatei } from '../../api/pakete';

/** Gemeinsame Typen und der Kontext des Paket-Ablaufs (#405, #804; #1279 aus PaketAblauf.tsx gezogen). */

/**
 * Welche Schnittstellen der Ablauf nutzt: in der Werkbank die des Administrators, im Einrichtungsassistenten (#804)
 * die mit Einrichtungscode – dort gibt es noch keinen Administrator, und es wird nichts installiert.
 */
export interface PaketApi {
  stand(): Promise<{ dms: string; installiert: InstalliertesPaket[] }>;
  katalog(): Promise<{ kataloge: Array<{ offiziell: boolean; katalog: Katalog | null; fehler: string | null }> }>;
  plan(e: AblaufEingabe): Promise<AblaufPlan<PaketVorschau>>;
}
export const PaketApiKontext = createContext<PaketApi>({
  stand: () => paketeApi.pakete(),
  katalog: () => paketeApi.paketKatalog(false),
  plan: (e) => paketeApi.paketAblaufPlan(e),
});

/**
 * Gesammelte Antworten des Ablaufs (#804): Was „Jetzt einrichten“ später installiert, dazu eine Kurzfassung für die
 * Zusammenfassung und die Konfigurationsdatei (#806).
 */
export interface PaketWahl {
  eingabe: AblaufInstallation;
  pakete: Array<{
    id: string;
    name: string;
    version: string;
    gewaehlt: boolean;
    beispiele: boolean;
    automatisierungen: Record<string, boolean>;
  }>;
  /** Neue Mappentypen aus den Paketen – dann keine Beispiel-Mappentypen dazu. */
  neueTypen: number;
  /** Mit Pflicht-Einstellungen: die Werte bleiben nur im Speicher (es kann Geheimes darunter sein). */
  mitEinstellungen: boolean;
}
/** Vorbelegte Antworten, z. B. aus einer Konfigurationsdatei (#806) oder beim „Ändern“ (#804). */
/** Vorgabe aus dem Assistenten bzw. der Einrichtungsdatei: „paket|schlüssel“ ausdrücklich aus bzw. an (#1082: der Rest wie im Paket). */
export interface PaketVorgabe {
  beispiele: string[];
  automatisierungenAus: string[];
  automatisierungenAn?: string[];
}

/** Woher die Pakete kommen. */
export type AblaufQuelle =
  | {
      art: 'katalog';
      katalog: Katalog;
      /** Adresse eines weiteren Katalogs; ohne: der offizielle. */ quelle?: string;
      dms: string;
      installiert: InstalliertesPaket[];
    }
  | { art: 'sammel'; sammeldatei: Sammeldatei; dms: string; installiert: InstalliertesPaket[] };
