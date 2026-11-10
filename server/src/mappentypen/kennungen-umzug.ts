/**
 * Protokoll des Umzugs der Kennungen (#1084, Sicherheit A): Migration 093 merkt sich je Haushalt, welche Kennung von
 * `<paket>_<schluessel>` auf `paket:schluessel` umgestellt wurde. Beim nächsten Start schreibt Ablago je Kennung eine
 * Zeile alt → neu und eine Zusammenfassung ins Systemprotokoll und vergisst die Liste – so lässt sich nachvollziehen,
 * was die Migration getan hat.
 */
import type { Einstellungen } from '../einstellungen';
import { protokoll } from '../protokoll';

export const UMZUG_SCHLUESSEL = 'kennungen_umzug';

export async function protokolliereKennungsUmzug(e: Einstellungen): Promise<number> {
  const liste = await e.lies(UMZUG_SCHLUESSEL);
  if (!Array.isArray(liste)) return 0;
  const log = protokoll.modul('datenbank');
  for (const x of liste as Array<{ id?: unknown; alt?: unknown; neu?: unknown }>) log.info('Kennung umgestellt', { typ: String(x.id ?? ''), alt: String(x.alt ?? '–'), neu: String(x.neu ?? '') });
  log.info('Kennungen der Mappentypen aus Paketen umgestellt (#1084)', { anzahl: liste.length });
  await e.schreibe(UMZUG_SCHLUESSEL, null);
  return liste.length;
}
