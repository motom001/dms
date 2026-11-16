import { KATALOG_ALT_TAGE, type HerkunftPruefung } from '../../../shared/src/pakete';
import { Hilfe } from '../Hilfe';
import { t } from '../sprache';
import { Symbol } from '../Symbol';
import { gebietsschema } from '../../../shared/src/sprache';

/**
 * Zeile „Herkunft“ (#594): was die Signatur über ein Paket sagt – signiert vom DMS-Projekt, vom Anbieter eines
 * eigenen Katalogs, nicht signiert oder ungültig. Für die Vorschau und die Sammeldatei.
 */
const datum = (iso?: string) => {
  const d = new Date(iso ?? '');
  return Number.isNaN(d.getTime()) ? (iso ?? '–') : d.toLocaleDateString(gebietsschema(), { dateStyle: 'medium' });
};

/** Herkunft in einem Satzteil, z. B. „signiert vom DMS-Projekt (Katalog vom 1. Nov. 2026)“. */
export function herkunftPruefungText(p: HerkunftPruefung, sammel = false): string {
  switch (p.art) {
    case 'projekt':
      return t(sammel ? 'pakete.herkunft.sammel' : 'pakete.herkunft.projekt', { stand: datum(p.stand) });
    case 'anbieter':
      return t('pakete.herkunft.anbieter', { fingerabdruck: p.fingerabdruck ?? '–' });
    case 'ungueltig':
      return t('pakete.herkunft.ungueltig');
    case 'nichtgeprueft':
      return t('pakete.herkunft.nichtgeprueft');
    case 'datei':
      return p.katalogversion ? t('pakete.herkunft.katalogversion', { version: p.katalogversion }) : t('pakete.herkunft.datei');
    default:
      return t('pakete.herkunft.unsigniert');
  }
}

/** Hinweise zur Herkunft, die nicht in die Zeile passen: alter Stand, Testschlüssel, Schlüsselwechsel. */
export function herkunftHinweise(p: HerkunftPruefung): string[] {
  return [
    p.alt ? t('pakete.herkunft.alt', { tage: KATALOG_ALT_TAGE }) : '',
    p.wechsel ? t('pakete.herkunft.wechsel') : '',
    p.test ? t('pakete.herkunft.test') : '',
  ].filter(Boolean);
}

const gut = (p: HerkunftPruefung) => p.art === 'projekt' || p.art === 'anbieter';

/** Zeile „Herkunft“ mit Symbol; darunter die Hinweise. */
export function HerkunftZeile({ p, sammel = false }: { p: HerkunftPruefung | null | undefined; sammel?: boolean }) {
  if (!p) return null;
  const hinweise = herkunftHinweise(p);
  return (
    <div className={`herkunft klein ${gut(p) ? 'gut' : 'warn'}`}>
      <p>
        <Symbol name={gut(p) ? 'schloss' : 'warnung'} className={gut(p) ? undefined : 'sym-warn'} />{' '}
        <strong>{t('pakete.herkunft.titel')}:</strong> {herkunftPruefungText(p, sammel)} <Hilfe ort="werkbank.pakete.herkunft" />
      </p>
      {hinweise.map((h) => (
        <p key={h} className="leise">
          {h}
        </p>
      ))}
    </div>
  );
}
