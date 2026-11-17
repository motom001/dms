import type { AuskunftZustand } from '../../../../shared/src/auskunft';
import { zeitzone } from '../../../../shared/src/region';
import { gebietsschema } from '../../../../shared/src/sprache';

export const groesse = (b: number) =>
  b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
export const zeit = (iso: string) => new Date(iso).toLocaleString(gebietsschema(), { dateStyle: 'medium', timeStyle: 'short' });
export const heute = () => new Intl.DateTimeFormat('sv-SE', { timeZone: zeitzone() }).format(new Date());

export const ZUSTAND_CHIP: Record<AuskunftZustand, string> = {
  angefragt: 'warn',
  inArbeit: 'warn',
  bereit: 'gut',
  zugestellt: '',
  abgerufen: '',
  geloescht: 'aus',
};

/** Vorgaben für jede Auskunft (#1183): auf der Seite „Eigene Organisation“. */
export const VORGABEN_SEITE = '/werkbank/organisation#auskunft-vorgaben';
