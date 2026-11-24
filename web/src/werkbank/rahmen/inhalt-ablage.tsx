import type { InstalliertesPaket } from '../../../../shared/src/pakete';
import { PaketeListe, PaketLink, PaketePanel } from '../Pakete';
import { AutomatisierungEditor, AutomatisierungenListe } from '../Automatisierungen';
import { AussenZiele } from '../AutomatisierungAussen';
import { TypenDatei } from '../TypenDatei';
import type { ReactNode } from 'react';
import { useDaten } from '../../daten';
import { TypEditor } from '../../einrichtung/Einrichtung';
import { Link } from '../../ort';
import { t, tn } from '../../sprache';
import { Listenkopf } from '../../Listenkopf';
import { gebietsschema } from '../../../../shared/src/sprache';
import {
  Etikett,
  Fundstellen,
  GeloeschteEintraege,
  Hervorgehoben,
  KeineTreffer,
  KnopfLink,
  ListenSuche,
  PaketChip,
  PaketFilter,
  useListenSuche,
} from '../../bausteine';
import { herkunftTyp, paketHerkunft, paketVonTyp, paketWahl, quellenTyp } from '../listensuche';
import { uebergeordneterTyp } from '../../../../shared/src/teile';
import { typName } from '../../../../shared/src/beschriftung';
import type { Seiten } from './inhalt';

/* Inhalte der Bereiche, Ablage aufbauen (#819, Tabelle seit #1281): Mappentypen samt ihrer Liste, Pakete, Automatisierungen. */

export const ablageSeiten = {
  // Mappentypen (#978): Liste in der Mitte, rechts neu (auch als Kopie, #147), ein Typ oder der Weg zur Beispiel-Ablage.
  typen: ({ id, d, z: { pakete } }) => {
    let rechts: ReactNode;
    const liste = <TypenListe offen={id} pakete={pakete.stand?.installiert ?? []} />;
    if (id === 'neu') {
      // Mappentyp kopieren (#147): /werkbank/typen/neu?kopie=<id>
      const kopie = new URLSearchParams(location.search).get('kopie');
      const vorlage = kopie ? d.typ(kopie) : undefined;
      rechts = <TypEditor key={`neu-${vorlage?.id ?? ''}`} vorlage={vorlage && !vorlage.system ? vorlage : undefined} />;
    } else if (id === 'datei') {
      // Mappentypen als Datei (#1315): exportieren und einspielen.
      rechts = <TypenDatei pakete={pakete.stand?.installiert ?? []} />;
    } else if (id) {
      const eintrag = d.typ(id);
      rechts = eintrag ? (
        <TypEditor key={eintrag.id} typ={eintrag} />
      ) : (
        <div className="leer">
          <p>{t('werkbank.werkbank.diesen-mappentyp-gibt-es')}</p>
        </div>
      );
    } else if (!d.typen.length) {
      rechts = (
        <div className="platzhalter">
          <p>
            {tn('werkbank.werkbank.noch-keine-mappentypen-lege', {
              link: (
                <Link to="/werkbank/beispielablage" className="verweis">
                  {t('werkbank.bereich.beispielablage.name')}
                </Link>
              ),
            })}
          </p>
        </div>
      );
    }
    return { liste, rechts };
  },
  // Pakete: Installation über einen Link (?installieren=…) steht rechts, auch ohne gewähltes Paket.
  pakete: ({ id, installieren, z: { pakete } }) => ({
    liste: <PaketeListe z={pakete} offen={id} />,
    rechts: installieren ? <PaketLink key={installieren} z={pakete} wert={installieren} /> : <PaketePanel z={pakete} id={id} />,
  }),
  // Automatisierungen mit den Zielen nach außen (#671): eigene Seite rechts, neben der Liste.
  automatisierungen: ({ id, z: { automatisierungen, pakete } }) => ({
    liste: <AutomatisierungenListe z={automatisierungen} offen={id} pakete={pakete.stand?.installiert ?? []} />,
    rechts:
      id === 'ziele' ? (
        <AussenZiele nachher={() => void automatisierungen.laden()} />
      ) : id ? (
        <AutomatisierungEditor key={`${id}-${automatisierungen.stand ? 1 : 0}`} z={automatisierungen} id={id} />
      ) : (
        <div className="platzhalter">
          <p>{t('automatisierung.ui.waehlen')}</p>
        </div>
      ),
  }),
} satisfies Seiten;

/**
 * Mappentypen in der Mitte (#978): Suche wie in der Ablage (Baustein Suche) in Name, Beschreibung, Feldern, Trefferlisten,
 * Registern, Berechtigungen, Paket und übergeordnetem Typ; jeder Treffer zeigt, wo gefunden wurde. Filter nach Paket.
 */
function TypenListe({ offen, pakete }: { offen?: string; pakete: InstalliertesPaket[] }) {
  const d = useDaten();
  const z = useListenSuche(d.typen, {
    quellen: (typ) => quellenTyp(typ, { pakete, typen: d.typen, person: d.person }),
    herkunft: (typ) => herkunftTyp(typ, pakete),
  });
  return (
    <>
      <Listenkopf
        titel={t('werkbank.werkbank.mappentypen')}
        hilfe="werkbank.typen"
        beschreibung={t('werkbank.werkbank.welche-arten-von-mappen')}>
        <KnopfLink to="/werkbank/typen/neu" art="anlegen" groesse="klein">
          {t('werkbank.werkbank.neu')}
        </KnopfLink>
        <KnopfLink to="/werkbank/typen/datei" groesse="klein">
          {t('werkbank.typendatei.knopf')}
        </KnopfLink>
      </Listenkopf>
      {d.typen.length > 0 && (
        <ListenSuche
          wert={z.eingabe}
          setze={z.setEingabe}
          beschriftung={t('werkbank.listensuche.typen.beschriftung')}
          platzhalter={t('werkbank.listensuche.typen.platzhalter')}
          anker="werkbank.typen.suche"
          treffer={z.treffer.length}
          aktiv={z.aktiv}
          anzahl={t('werkbank.listensuche.typen.anzahl', { anzahl: d.typen.length })}
          filter={<PaketFilter wert={z.paket} setze={z.setPaket} pakete={paketWahl(z.paketeDa, pakete)} eigene={z.eigeneDa} />}
        />
      )}
      {!d.typen.length ? (
        <p className="leise leerliste">{t('werkbank.werkbank.noch-keine-mappentypen')}</p>
      ) : !z.treffer.length && offen !== 'neu' ? (
        <KeineTreffer zuruecksetzen={z.zuruecksetzen} />
      ) : (
        <ul className="mappenliste">
          {offen === 'neu' && (
            <li>
              <span className="eintrag an werk">
                <span className="titel">{t('werkbank.werkbank.neuer-mappentyp')}</span>
                <span className="unter">{t('werkbank.werkbank.noch-nicht-gespeichert')}</span>
              </span>
            </li>
          )}
          {z.treffer.map(({ eintrag: mappentyp, funde, titel }) => {
            const zz = d.zaehler.typen[mappentyp.id];
            const anzahl = zz?.anzahl ?? 0;
            const unpassend = zz?.unpassend ?? 0;
            // Teile (#1031): „Teil von Rechnung“ – sie erscheinen in der Ablage nur an der übergeordneten Mappe.
            const eltern = d.typ(uebergeordneterTyp(mappentyp));
            return (
              <li key={mappentyp.id}>
                <Link to={`/werkbank/typen/${mappentyp.id}`} className={`eintrag werk ${offen === mappentyp.id ? 'an' : ''}`}>
                  <span className="titel">
                    <Hervorgehoben teile={titel} text={mappentyp.name} />
                    {mappentyp.system && (
                      <Etikett title={t('werkbank.werkbank.systemmappentyp-laesst-sich')}>{t('werkbank.werkbank.system')}</Etikett>
                    )}
                    <PaketChip paket={paketHerkunft(paketVonTyp(mappentyp, pakete), pakete)} inLink />
                  </span>
                  <span className="unter">
                    {t('werkbank.werkbank.felder-register', { felder: mappentyp.felder.length, register: mappentyp.register.length })}
                    {d.zahlenDa && (
                      <>
                        {' '}
                        · {anzahl.toLocaleString(gebietsschema())} {t('werkbank.werkbank.mappen', { anzahl })}
                      </>
                    )}
                    {eltern && <> · {t('werkbank.listensuche.teil-von', { name: typName(eltern) })}</>}
                  </span>
                  {unpassend > 0 && <span className="problem">{t('werkbank.werkbank.passen-nicht-zur-definition', { unpassend })}</span>}
                  <Fundstellen funde={funde} />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <GeloeschteEintraege art="typ" />
    </>
  );
}
