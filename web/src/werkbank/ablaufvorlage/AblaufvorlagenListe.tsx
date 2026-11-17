import type { AblaufvorlageAnsicht } from '../../../../shared/src/ablaufvorlagen';
import { Listenkopf } from '../../Listenkopf';
import { Link } from '../../ort';
import { t } from '../../sprache';
import { GeloeschteEintraege, KnopfLink, PaketChip } from '../../bausteine';
import type { InstalliertesPaket } from '../../../../shared/src/pakete';
import { paketHerkunft } from '../listensuche';
import { pfad, type AblaufvorlagenZustand } from './zustand';

/**
 * Herkunft einer Vorlage (#1192): Paket mit Namen, „Ablago“ für die mitgelieferten, eigene ohne Chip. Ersetzt ein Paket
 * eine Vorlage von Ablago, steht sein Name da und der Tooltip sagt es.
 */
function Herkunft({ v, pakete }: { v: AblaufvorlageAnsicht; pakete: readonly InstalliertesPaket[] }) {
  const paket = paketHerkunft(v.paketId, pakete);
  if (v.ueberlagert)
    return (
      <PaketChip
        paket={paket ?? { id: v.ueberlagert, name: v.ueberlagert }}
        inLink
        titel={t('automatisierung.vorlage.ui.ueberlagert', { paket: v.ueberlagert })}
      />
    );
  return <PaketChip paket={v.herkunft === 'kern' ? 'ablago' : v.herkunft === 'paket' ? paket : null} inLink />;
}

/* ---------- Liste ---------- */

export function AblaufvorlagenListe({
  z,
  offen,
  pakete = [],
}: {
  z: AblaufvorlagenZustand;
  offen?: string;
  pakete?: InstalliertesPaket[];
}) {
  const s = z.stand;
  return (
    <>
      <Listenkopf
        titel={t('automatisierung.vorlage.ui.titel')}
        hilfe="werkbank.ablaufvorlagen"
        beschreibung={t('automatisierung.vorlage.ui.beschreibung')}>
        <KnopfLink to="/werkbank/ablaufvorlagen/neu" art="anlegen" groesse="klein">
          {t('automatisierung.vorlage.ui.neu')}
        </KnopfLink>
      </Listenkopf>
      {z.fehler && (
        <div className="hinweis schlecht">
          <p>{z.fehler}</p>
        </div>
      )}
      {!!s?.angehalten.length && (
        <div className="hinweis warn">
          <p>{t('automatisierung.vorlage.ui.angehalten', { anzahl: s.angehalten.length })}</p>
        </div>
      )}
      {!s ? (
        <p className="leise">{t('automatisierung.ui.lade')}</p>
      ) : (
        <ul className="mappenliste">
          {s.vorlagen.map((v) => (
            <li key={v.kennung}>
              <Link to={pfad(v.kennung)} className={`eintrag werk ${offen === v.kennung ? 'an' : ''}`}>
                <span className="titel">
                  {v.name}{' '}
                  <span className={`chip ${v.aktiv ? 'gut' : ''}`}>
                    {v.aktiv ? t('automatisierung.ui.an') : t('automatisierung.ui.aus')}
                  </span>{' '}
                  <Herkunft v={v} pakete={pakete} />
                </span>
                <span className="unter">{v.kurz}</span>
                <span className="leise klein">
                  {t('automatisierung.vorlage.ui.offen', { anzahl: v.offen })}
                  {v.angehalten > 0 && (
                    <>
                      {' '}
                      ·{' '}
                      <span className="chip schlecht klein">
                        {t('automatisierung.vorlage.ui.davon-angehalten', { anzahl: v.angehalten })}
                      </span>
                    </>
                  )}
                </span>
                {v.probleme[0] && <span className="problem">{v.probleme[0]}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <GeloeschteEintraege art="ablaufvorlage" />
    </>
  );
}
