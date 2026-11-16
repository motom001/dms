import { ALLE_TYPEN, hatNetz, type PaketCode } from './pakete';

/**
 * Systemkonten als eingeklappte Gruppe oben (#817): Werkbank → Benutzer und überall, wo Systemkonten in Listen
 * erscheinen (Testlauf, #710). Die Kopfzeile nennt Anzahl und Zusammensetzung und zeigt Auffälligkeiten auch
 * eingeklappt: „Systemkonten (5) · 4 Pakete · 1 Automatisierung“, dazu z. B. „1 mit Fehler“.
 */

export type SystemkontoFehler = 'deaktiviert' | 'angehalten';

/** Einstellung je Person (Werkbank → Benutzer), ob die Gruppe aufgeklappt ist; Vorgabe: eingeklappt. */
export const SYSTEMKONTEN_AUF = 'benutzer_systemkonten_auf';

/**
 * Auffälligkeiten eines Kontos. Fehler: deaktiviert, obwohl es gebraucht wird, oder eine seiner Automatisierungen
 * ist angehalten. Das Konto eines entfernten Pakets (`paket === null`) bleibt nur für die Historie – kein Fehler.
 * Ebenso das Konto eines Pakets ohne Code (`ohneCode`, #1181): Es meldet sich nie an und ist bewusst aus; es steht nur
 * als Herkunft in der Historie (z. B. Ersteller der Vorgaben, #1038).
 * Weitreichend: Das Paket darf alle Mappentypen ändern, oder es darf alle lesen und dazu ins Netz – dann können
 * Daten die Ablage verlassen.
 */
export function systemkontoAuffaellig(k: {
  aktiv: boolean;
  rolle: 'systemkonto' | 'paket';
  paket?: string | null;
  ohneCode?: boolean;
  automatisierungen: Array<{ angehalten?: boolean }>;
  rechte?: PaketCode;
}): { fehler: SystemkontoFehler | null; weitreichend: boolean } {
  const entfernt = k.rolle === 'paket' && k.paket === null;
  const fehler: SystemkontoFehler | null = entfernt
    ? null
    : !k.aktiv && !k.ohneCode
      ? 'deaktiviert'
      : k.automatisierungen.some((a) => a.angehalten)
        ? 'angehalten'
        : null;
  const r = k.rechte?.rechte;
  const weitreichend =
    k.rolle === 'paket' && !entfernt && !!r && (r.schreiben.includes(ALLE_TYPEN) || (r.lesen.includes(ALLE_TYPEN) && hatNetz(k.rechte)));
  return { fehler, weitreichend };
}

export interface SystemkontenKopf {
  anzahl: number;
  pakete: number;
  automatisierung: number;
  fehler: number;
  weitreichend: number;
}

/** Zahlen für die Kopfzeile der Gruppe. */
export function systemkontenKopf(
  liste: Array<{ rolle: 'systemkonto' | 'paket'; fehler?: SystemkontoFehler | null; weitreichend?: boolean }>,
): SystemkontenKopf {
  return {
    anzahl: liste.length,
    pakete: liste.filter((k) => k.rolle === 'paket').length,
    automatisierung: liste.filter((k) => k.rolle === 'systemkonto').length,
    fehler: liste.filter((k) => k.fehler).length,
    weitreichend: liste.filter((k) => k.weitreichend).length,
  };
}
