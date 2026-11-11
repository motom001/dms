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

/**
 * „Wofür nutzt du Ablago?“ (#1045): privat, beruflich oder beides. Beruflich und beides setzen das Merkmal „beruflich
 * genutzt“ (#1032, `optional.beruflich`) – das bleibt die einzige Stelle, die die Ablage danach kennt. Die Antwort selbst
 * wählt nur Pakete vor und entscheidet, ob der Assistent nach der eigenen Organisation fragt.
 */
export const NUTZUNGEN = ['privat', 'beruflich', 'beides'] as const;
export type Nutzung = (typeof NUTZUNGEN)[number];
export const istNutzung = (v: unknown): v is Nutzung => typeof v === 'string' && (NUTZUNGEN as readonly string[]).includes(v);
/** Merkmal „beruflich genutzt“ zur Antwort. */
export const beruflichBei = (n: Nutzung) => n !== 'privat';

/**
 * Pakete, die der Assistent je Antwort vorwählt (#1045) – nur, was es im Katalog gibt, zählt; der Rest fällt still weg.
 * Basis ist immer dabei: Personen und Organisationen braucht jede Ablage, die eigene Organisation sowieso.
 */
export const PAKETE_JE_NUTZUNG: Record<Nutzung, readonly string[]> = {
  privat: ['basis', 'haushalt', 'vertraege', 'rechnungen'],
  beruflich: ['basis', 'vertraege', 'rechnungen', 'compliance'],
  beides: ['basis', 'haushalt', 'vertraege', 'rechnungen', 'compliance'],
};
/** Ohne dieses Paket gibt es keinen Mappentyp mit dem Merkmal „eigene Organisation“ (#995). */
export const PAKET_ORGANISATION = 'basis';

/**
 * „Deine Organisation“ (#1045, nur bei beruflich und beides): wenige Angaben, nur der Name ist Pflicht. „Jetzt
 * einrichten“ legt daraus eine Mappe vom Typ Organisation (Paket Basis) mit dem Merkmal „eigene Organisation“ an (#995).
 * Leere Angaben sind '' – in der Datei fehlen sie.
 */
export interface PlanOrganisation { name: string; strasse: string; hausnummer: string; plz: string; ort: string; email: string; telefon: string }
export const ORGANISATION_ANGABEN = ['name', 'strasse', 'hausnummer', 'plz', 'ort', 'email', 'telefon'] as const satisfies ReadonlyArray<keyof PlanOrganisation>;
/** Höchstlängen wie an den Feldern der Basis (Organisation). */
export const ORGANISATION_MAX: Record<keyof PlanOrganisation, number> = { name: 120, strasse: 120, hausnummer: 10, plz: 10, ort: 80, email: 200, telefon: 40 };
export const leereOrganisation = (): PlanOrganisation => ({ name: '', strasse: '', hausnummer: '', plz: '', ort: '', email: '', telefon: '' });
/** „Deine Organisation“ in fester Form: nur Text, Leerraum zusammengezogen, gekürzt wie die Felder; kein Objekt = keine. */
export function liesPlanOrganisation(x: unknown): PlanOrganisation | undefined {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return undefined;
  const o = x as Record<string, unknown>;
  const text = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
  return Object.fromEntries(ORGANISATION_ANGABEN.map((k) => [k, text(o[k], ORGANISATION_MAX[k])])) as unknown as PlanOrganisation;
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
     * Merkmal „beruflich genutzt“ (#1032); fehlt = nein. Seit #1045 folgt es der Antwort auf „Wofür nutzt du Ablago?“
     * (`nutzung`); ältere Dateien ohne `nutzung` setzen es hier direkt.
     */
    beruflich?: boolean;
  };
  /** „Wofür nutzt du Ablago?“ (#1045); fehlt = noch nicht beantwortet (ältere Datei), der Assistent fragt. */
  nutzung?: Nutzung;
  /** Eigene Organisation (#1045, #995) – nur bei beruflich und beides. */
  organisation?: PlanOrganisation;
}

/** Ein Fehler in der Datei: Zeile (ab 1, wenn bekannt), Feld wie `konto.email` oder `pakete[1].id`, Text. */
export interface DateiFehler { zeile: number | null; feld: string; text: string }

/** Die Schritte, die der Assistent sammelt – in dieser Reihenfolge. */
export const SAMMELSCHRITTE = ['ablage', 'konto', 'nutzung', 'pakete', 'optional'] as const;
export type Sammelschritt = (typeof SAMMELSCHRITTE)[number];
/** Was in einem Schritt nicht passt – je Schritt die Gründe. */
export type Planprobleme = Partial<Record<Sammelschritt, string[]>>;
