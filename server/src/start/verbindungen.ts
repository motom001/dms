/**
 * Start (#1278, aus `ablago.ts`): Zahl der Verbindungen zur Datenbank (#544) und ihre Aufteilung auf mehrere Prozesse
 * (#874).
 */
import {
  verbindungenAus,
  verbinde,
  verbindungsaufteilung,
  verbindungenFuer,
  VERBINDUNGEN_RESERVE,
  VERBINDUNGEN_LEITER_MIN,
  VERBINDUNGEN_MIN,
} from '../datenbank/db';
import type { vorbereiten } from './vorbereiten';
import type { bindeDatenbankAn } from './anbindung';

/** Was teileVerbindungen von früher braucht. */
type Bisher = Pick<Awaited<ReturnType<typeof vorbereiten>>, 'verbund' | 'leiter' | 'log'> &
  Pick<Awaited<ReturnType<typeof bindeDatenbankAn>>, 'datenbankUrl'> & { env: NodeJS.ProcessEnv };

/** Verbindungen zur Datenbank zählen und aufteilen. */
export async function teileVerbindungen(bisher: Bisher) {
  const { env, verbund, leiter, log, datenbankUrl } = bisher;
  // Verbindungen zur Datenbank (#544): Vorgabe 10, für größere Installationen DMS_DB_VERBINDUNGEN.
  // Mehrere Prozesse (#874): DMS_DB_VERBINDUNGEN gilt für alle zusammen und wird aufgeteilt (verbindungsaufteilung);
  // zusammen nie mehr, als die Datenbank erlaubt.
  const verbindungsZahl = verbindungenAus(env, verbund.anzahl);
  if (verbindungsZahl.fehler && leiter) log.warn(verbindungsZahl.fehler);
  let erlaubteVerbindungen: number | null = null;
  if (verbund.mehrere) {
    const probe = verbinde(datenbankUrl, 1);
    try {
      erlaubteVerbindungen = Number((await probe`SHOW max_connections`)[0].max_connections) || null;
    } catch {
      /* dann ohne Abgleich */
    } finally {
      await probe.end({ timeout: 5 });
    }
  }
  const verbindungsteile = verbindungsaufteilung(verbindungsZahl.max, verbund.anzahl, erlaubteVerbindungen);
  const eigeneVerbindungen = verbindungenFuer(verbindungsteile, verbund.nr);
  if (verbindungsteile.gekuerzt && leiter)
    log.warn(
      `Verbindungen zur Datenbank: ${verbindungsZahl.max} wären mehr, als die Datenbank erlaubt (max_connections ${erlaubteVerbindungen}, ${VERBINDUNGEN_RESERVE} bleiben frei) – Ablago nimmt zusammen ${verbindungsteile.gesamt}`,
    );
  if (verbindungsteile.angehoben && leiter)
    log.warn(
      `Verbindungen zur Datenbank: ${verbindungsZahl.max} sind für ${verbund.anzahl} Prozesse zu wenig (der Leiter braucht ${VERBINDUNGEN_LEITER_MIN}, jeder weitere ${VERBINDUNGEN_MIN}) – Ablago nimmt zusammen ${verbindungsteile.gesamt}`,
    );
  return { verbindungsZahl, verbindungsteile, eigeneVerbindungen };
}
