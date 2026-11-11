import { feldLabel } from '../../../shared/src/beschriftung';
import type { Feld as FeldDef } from '../../../shared/src/model';
import { taugtAlsTeil, VORLAGE_MAX } from '../../../shared/src/zusammengesetzt';
import { Feld, Knopf } from '../bausteine';
import { t } from '../sprache';

/** Trenner zwischen zwei Platzhaltern, wenn man einen per Knopf anhängt. */
const TRENNER = ' · ';

/**
 * Einstellungen der Feldart Zusammengesetzt (#1050) im Mappentyp-Editor: die Vorlage aus Platzhaltern (wie die
 * Titel-Vorlage) und darunter je geeignetem Feld ein Knopf, der seinen Platzhalter anhängt. „Eindeutig“ steht wie bei
 * Text und Zahl bei den allgemeinen Eigenschaften; ob die Vorlage passt, sagt die Prüfung beim Speichern.
 */
export function ZusammengesetztEditor({ f, id, felder, setze }: {
  f: Pick<FeldDef, 'key' | 'vorlage'>;
  id: (x: string) => string;
  /** Die Felder dieses Typs, wie sie im Editor gerade stehen. */
  felder: FeldDef[];
  setze(patch: { vorlage: string }): void;
}) {
  const vorlage = f.vorlage ?? '';
  const teile = felder.filter((x) => x.key !== f.key && x.key && taugtAlsTeil(x));
  const anhaengen = (key: string) => setze({ vorlage: vorlage.trim() ? `${vorlage.trimEnd()}${TRENNER}{${key}}` : `{${key}}` });
  return (
    <div className="raster">
      <Feld beschriftung={t('mappentypen.zusammengesetzt.vorlage')} id={id('vorlage')} hinweis={t('mappentypen.zusammengesetzt.vorlage-hilfe')}>
        <input className="mono" maxLength={VORLAGE_MAX} placeholder={teile.slice(0, 2).map((x) => `{${x.key}}`).join(TRENNER)} value={vorlage} onChange={(e) => setze({ vorlage: e.target.value })} />
      </Feld>
      {teile.length > 0 && (
        <div className="eigenschaft" role="group" aria-label={t('mappentypen.zusammengesetzt.einfuegen')}>
          <span>{t('mappentypen.zusammengesetzt.einfuegen')}</span>
          <span className="chips">{teile.map((x) => <Knopf key={x.key} art="neben" groesse="klein" onClick={() => anhaengen(x.key)}>{feldLabel(x)}</Knopf>)}</span>
        </div>
      )}
      <p className="leise klein">{t('mappentypen.zusammengesetzt.hinweis')}</p>
    </div>
  );
}
