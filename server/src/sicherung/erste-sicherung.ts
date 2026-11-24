/**
 * Erste Sicherung nach der Einrichtung (#1509): Mit „Einrichtung abschließen“ schaltet Ablago die automatische
 * Sicherung ein (jede Nacht um 02:00, Vorbelegung `PLAN_NEU`), erstellt gleich im Hintergrund die erste Sicherung und
 * stellt sie danach probeweise wieder her. Geprüft wird der ganze Weg: Ordner beschreibbar, Rechte, Verschlüsselung,
 * Zurückholen. Die Probe läuft wie jede Probe in einem eigenen Schema und räumt danach auf, auch wenn sie scheitert.
 *
 * - Nur Neueinrichtung: vorgemerkt wird nur, wenn noch kein Plan gespeichert ist und es noch keine Sicherung gibt.
 * - Erst nach dem Notfallblatt: „Einrichtung abschließen“ geht nur mit heruntergeladenem Blatt (#804); ohne Abschluss
 *   gibt es keinen Merker und damit keine automatische Sicherung.
 * - Der Merker `sicherung_erste` steht in der Datenbank: Läuft gerade ein anderer Prozess (#745), macht der Leiter den
 *   Lauf beim nächsten Blick (höchstens eine Minute später). Wer den Merker von „offen“ auf „läuft“ setzt, macht ihn.
 */
import { PLAN_NEU, log, ortszeit, ERSTE, liesErste, type Erststand, type Sicherungsart } from './sicherung-hilfen';
import type { Einstellungen } from '../einstellungen/einstellungen';
import { t } from '../sprache/sprache';

/** Was der Lauf von der Sicherung braucht (schmal, ohne die Klasse einzubinden). */
interface Sichern {
  readonly einstellungen: Einstellungen;
  liste(): Promise<unknown[]>;
  starte(art: Sicherungsart, von: string): Promise<{ fertig: Promise<{ datei: string } | null> }>;
  aktuellerLauf(): { fehler?: string } | null;
}
/** Was der Lauf von der Wiederherstellung braucht: die Probe. */
interface Proben {
  starteProbe(name: string, von: string): Promise<{ fertig: Promise<boolean> }>;
  aktuellerLauf(): { fehler?: string } | null;
}

/**
 * Bei „Einrichtung abschließen“: Sicherung einschalten und die erste vormerken – nur auf einer neu eingerichteten
 * Ablage (kein gespeicherter Plan, keine Sicherung). Der Merker der automatischen Sicherung steht auf heute: Die
 * erste Sicherung zählt für heute, die nächste kommt zur eingestellten Uhrzeit.
 */
export async function vormerkeErste(s: Sichern, von: string, jetzt = new Date()): Promise<boolean> {
  const e = s.einstellungen;
  if ((await e.lies('sicherung_plan')) || (await liesErste(s)) || (await s.liste()).length) return false;
  await e.schreibe('sicherung_plan', { ...PLAN_NEU, aktivSeit: jetzt.toISOString() });
  await e.schreibe('sicherung_zuletzt_auto', ortszeit(jetzt).datum);
  const stand: Erststand = { status: 'offen', seit: jetzt.toISOString(), von };
  await e.schreibe(ERSTE, stand);
  log.info('Automatische Sicherung eingeschaltet (Neueinrichtung), erste Sicherung vorgemerkt', { von, uhrzeit: PLAN_NEU.uhrzeit });
  return true;
}

/**
 * Den vorgemerkten Lauf machen: erst die Sicherung, dann die Probe mit genau dieser Sicherung. Liefert false, wenn
 * nichts vorgemerkt ist oder ein anderer Prozess den Lauf schon macht. Das Ergebnis steht im Merker und – wie bei
 * jeder Sicherung und Probe – im Systemprotokoll.
 */
export async function laufeErste(s: Sichern, wh: Proben, jetzt: () => Date = () => new Date()): Promise<boolean> {
  const alt = await liesErste(s);
  if (alt?.status !== 'offen') return false;
  const laeuft: Erststand = { ...alt, status: 'laeuft' };
  if (s.einstellungen.tausche && !(await s.einstellungen.tausche(ERSTE, alt, laeuft))) return false;
  if (!s.einstellungen.tausche) await s.einstellungen.schreibe(ERSTE, laeuft);
  const ende = async (x: Partial<Erststand>) => {
    const neu: Erststand = { ...laeuft, ...x, am: jetzt().toISOString() };
    await s.einstellungen.schreibe(ERSTE, neu);
    if (neu.status === 'ok') log.info('Erste Sicherung und Probe-Wiederherstellung erfolgreich', { sicherung: neu.sicherung });
    else log.error('Erste Sicherung oder Probe-Wiederherstellung fehlgeschlagen', { schritt: neu.schritt, grund: neu.grund });
  };
  let name: string;
  try {
    const { fertig } = await s.starte('automatisch', t('meldungen.sicherung.erste.von'));
    const meta = await fertig;
    if (!meta) throw new Error(s.aktuellerLauf()?.fehler ?? t('meldungen.sicherung.erste.unbekannt'));
    name = meta.datei.replace(/\.dms-sicherung$/, '');
  } catch (x) {
    await ende({ status: 'fehler', schritt: 'sicherung', grund: (x as Error).message });
    return true;
  }
  try {
    const { fertig } = await wh.starteProbe(name, t('meldungen.sicherung.erste.von'));
    const ok = await fertig;
    const lauf = wh.aktuellerLauf();
    if (!ok) throw new Error(lauf?.fehler ?? t('meldungen.sicherung.erste.unbekannt'));
    await ende({ status: 'ok', sicherung: name });
  } catch (x) {
    await ende({ status: 'fehler', schritt: 'probe', sicherung: name, grund: (x as Error).message });
  }
  return true;
}
