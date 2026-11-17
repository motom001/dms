import { t } from '../../sprache';

/** Wochentage für Zeitplan, Probe und Stand; Index 1 = Montag. */
export const TAGE = [
  '',
  t('werkbank.sicherung.montag'),
  t('werkbank.sicherung.dienstag'),
  t('werkbank.sicherung.mittwoch'),
  t('werkbank.sicherung.donnerstag'),
  t('werkbank.sicherung.freitag'),
  t('werkbank.sicherung.samstag'),
  t('werkbank.sicherung.sonntag'),
];

export const AMPEL = {
  gruen: ['gut', t('werkbank.sicherung.in-ordnung')],
  gelb: ['warn', t('werkbank.sicherung.zu-alt-oder-noch')],
  rot: ['schlecht', 'fehlgeschlagen'],
} as const;
