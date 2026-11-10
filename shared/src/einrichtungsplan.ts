/**
 * Einrichtungsplan (#804, #806): alles, was der Einrichtungsassistent sammelt, bevor er mit „Jetzt einrichten“
 * etwas anlegt – und was in der Konfigurationsdatei steht. Weboberfläche und Server teilen diese Form.
 *
 * Geheimnisse gehören nie hierher: Passwörter stehen höchstens als Verweis auf eine Umgebungsvariable da
 * (`${DMS_KONTO_PASSWORT}`), für eine spätere Einrichtung ohne Oberfläche. Den Schlüssel erzeugt Ablago immer neu.
 *
 * Seit #821 gibt es nur noch „Dein Konto“: die Person, die einrichtet, mit „Gesamte Verwaltung“. Ein Administrator und
 * ein „erster Benutzer“ daneben entfallen; weitere Personen lädt man nach der Einrichtung ein.
 */

/** Formatversion der Konfigurationsdatei (Kopfzeile `ablago-einrichtung: 1`). */
export const EINRICHTUNG_FORMAT = 1;

/** Verweis auf eine Umgebungsvariable statt eines Passworts, z. B. `${DMS_KONTO_PASSWORT}`. */
export const VERWEIS_MUSTER = '^\\$\\{[A-Z][A-Z0-9_]{0,63}\\}$';
export const istVerweis = (v: unknown): v is string => typeof v === 'string' && new RegExp(VERWEIS_MUSTER).test(v);

export type PlanVerbindung = 'starttls' | 'ssl' | 'keine';
export const PLAN_VERBINDUNGEN: readonly PlanVerbindung[] = ['starttls', 'ssl', 'keine'];

export interface PlanDatenbank { host: string; port: number; datenbank: string; benutzer: string; /** nur ein Verweis */ passwort?: string }
export interface PlanMail {
  aktiv: boolean; host: string; port: number; verbindung: PlanVerbindung; benutzer: string; absender: string; selbstsigniert: boolean;
  /** nur ein Verweis */
  passwort?: string;
}
export interface PlanPaket {
  id: string;
  /** Beispiel-Mappen des Pakets anlegen. */
  beispiele: boolean;
  /** Mitgelieferte Automatisierungen (#712): Schlüssel → eingeschaltet. */
  automatisierungen: Record<string, boolean>;
}

export interface Einrichtungsplan {
  datenbank: PlanDatenbank | null;
  /** Name der Ablage (Mandant). */
  ablage: string;
  /** „Dein Konto“ (#821): die Person, die einrichtet – mit „Gesamte Verwaltung“. */
  konto: { name: string; email: string; /** nur ein Verweis */ passwort?: string };
  /** null: noch nicht festgelegt bzw. übersprungen; []: bewusst keine. */
  pakete: PlanPaket[] | null;
  optional: {
    /** null: keine Adresse gepflegt – Links nutzen die Adresse der Anfrage. */
    adresse: string | null;
    /** Bundesland für die Feiertage (#726); null: keins. */
    bundesland: string | null;
    /** Beispiel-Mappentypen laden. */
    beispiele: boolean;
    mail: PlanMail | null;
    /**
     * Merkmal „beruflich genutzt“ (#1032); fehlt = nein. Der Assistent fragt es mit #1045 ab, bis dahin kommt es nur aus
     * der Datei und steht in der Zusammenfassung.
     */
    beruflich?: boolean;
  };
}

/** Ein Fehler in der Datei: Zeile (ab 1, wenn bekannt), Feld wie `konto.email` oder `pakete[1].id`, Text. */
export interface DateiFehler { zeile: number | null; feld: string; text: string }

/** Die Schritte, die der Assistent sammelt – in dieser Reihenfolge. */
export const SAMMELSCHRITTE = ['ablage', 'konto', 'pakete', 'optional'] as const;
export type Sammelschritt = (typeof SAMMELSCHRITTE)[number];
/** Was in einem Schritt nicht passt – je Schritt die Gründe. */
export type Planprobleme = Partial<Record<Sammelschritt, string[]>>;
