import type { ExternStand, ExternZustand } from '../api/betrieb';
import { t } from '../sprache';
import { gebietsschema } from '../../../shared/src/sprache';

/** Größen und Zeiten der Sicherung – gemeinsam für die Seite, die Liste (#1169) und die Übersicht. */
export const bytes = (b: number) => (b < 1024 ** 2 ? `${Math.max(1, Math.round(b / 1024))} KB` : b < 1024 ** 3 ? `${(b / 1024 ** 2).toFixed(0)} MB` : `${(b / 1024 ** 3).toFixed(1).replace('.', ',')} GB`);
export const zeit = (iso: string) => new Date(iso).toLocaleString(gebietsschema(), { dateStyle: 'medium', timeStyle: 'short' });

export const zielName = (x: ExternZustand, id: string) => x.ziele.find((z) => z.id === id)?.name ?? id;

/** Stand der Kopie außer Haus in Worten ohne „extern“: „geprüft“, „hochgeladen, Größe bestätigt“, „fehlgeschlagen“ … */
export function externStatus(s: ExternStand): string {
  if (s.status === 'geprueft') return t(s.pruefung === 'stichprobe' ? 'werkbank.sicherung.extern.stichprobe' : 'werkbank.sicherung.extern.geprueft');
  if (s.status === 'hochgeladen') return t(s.pruefung === 'groesse' ? 'werkbank.sicherung.extern.groesse' : 'werkbank.sicherung.extern.hochgeladen');
  if (s.status === 'laeuft') return s.gesamt ? t('werkbank.sicherung.extern.laeuft.prozent', { prozent: Math.min(99, Math.floor(((s.bytes ?? 0) / s.gesamt) * 100)) }) : t('werkbank.sicherung.extern.laeuft');
  if (s.status === 'fehlgeschlagen') return t('werkbank.sicherung.extern.fehlgeschlagen');
  return t('werkbank.sicherung.extern.offen');
}
/** „extern geprüft“ usw. */
export const externText = (s: ExternStand) => `${t('werkbank.sicherung.extern.extern')} ${externStatus(s)}`;
