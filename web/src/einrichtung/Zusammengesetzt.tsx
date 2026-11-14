import { feldLabel } from '../../../shared/src/beschriftung';
import type { Feld as FeldDef } from '../../../shared/src/model';
import { taugtAlsTeil, VORLAGE_MAX } from '../../../shared/src/zusammengesetzt';
import { Feld, Platzhalter, usePlatzhalterEinsetzen } from '../bausteine';
import { t } from '../sprache';

/** Trenner zwischen zwei Platzhaltern, wenn man einen am Ende einsetzt. */
const TRENNER = ' · ';

/**
 * Einstellungen der Feldart Zusammengesetzt (#1050) im Mappentyp-Editor: die Vorlage aus Platzhaltern (wie die
 * Titel-Vorlage) und darunter die Felder als Platzhalter zum Anklicken (Baustein Platzhalter, #1177): an der
 * Schreibmarke, am Ende mit „ · “ davor. „Eindeutig“ steht wie bei
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
  const ein = usePlatzhalterEinsetzen({ trenner: TRENNER });
  return (
    <div className="raster">
      <Feld beschriftung={t('mappentypen.zusammengesetzt.vorlage')} id={id('vorlage')} hinweis={t('mappentypen.zusammengesetzt.vorlage-hilfe')}>
        <input {...ein.feld('vorlage', vorlage, (x) => setze({ vorlage: x }))} className="mono" maxLength={VORLAGE_MAX} placeholder={teile.slice(0, 2).map((x) => `{${x.key}}`).join(TRENNER)} value={vorlage} onChange={(e) => setze({ vorlage: e.target.value })} />
      </Feld>
      <Platzhalter beschriftung={t('mappentypen.zusammengesetzt.einfuegen')} einsetzen={ein.einsetzen} className="breit"
        gruppen={[{ eintraege: teile.map((x) => ({ key: x.key, text: feldLabel(x) })) }]} />
      <p className="leise klein">{t('mappentypen.zusammengesetzt.hinweis')}</p>
    </div>
  );
}
