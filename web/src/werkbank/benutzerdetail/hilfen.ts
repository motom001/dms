import type { Benutzer } from '../../../../shared/src/model';
import { gebietsschema } from '../../../../shared/src/sprache';
import { t } from '../../sprache';
import type { BereichListe } from '../../bausteine';

export const datumZeit = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(gebietsschema(), { dateStyle: 'medium', timeStyle: 'short' }) : t('werkbank.benutzer.noch-nie');
export const status = (b: Benutzer) =>
  !b.aktiv
    ? { text: t('werkbank.benutzer.status.deaktiviert'), art: '' }
    : !b.hatPasswort
      ? { text: t('werkbank.benutzer.status.eingeladen'), art: 'warn' }
      : { text: t('werkbank.benutzer.status.aktiv'), art: 'gut' };

/** Bereiche eines Benutzers (#1000). „Zugang“ fehlt bei dir selbst, solange du aktiv bist – dort gäbe es nichts zu tun. */
export type BenutzerBereich = 'grunddaten' | 'rechte' | 'vertretung' | 'sicherheit' | 'zugang';
export function benutzerBereiche(mitZugang: boolean): BereichListe<BenutzerBereich> {
  return [
    ['grunddaten', t('werkbank.benutzer.bereich.grunddaten')],
    ['rechte', t('werkbank.benutzer.bereich.rechte')],
    ['vertretung', t('werkbank.benutzer.bereich.vertretung')],
    ['sicherheit', t('werkbank.benutzer.bereich.sicherheit')],
    ...(mitZugang ? [['zugang', t('werkbank.benutzer.bereich.zugang')] as const] : []),
  ];
}

export type Aktion = (fn: () => Promise<unknown>, gut?: string) => Promise<void>;
