import type { WerkbankUebersicht } from '../../api/betrieb';
import { Link } from '../../ort';
import { t, tn } from '../../sprache';
import { useHandbuch } from '../../Hilfe';
import { Listenkopf } from '../../Listenkopf';
import { Etikett, etikettArt, Knopf, KnopfLink } from '../../bausteine';
import { Akzeptieren, BewusstAkzeptiert } from './Akzeptieren';
import { bytes, datum, zahl } from './hilfen';
import type { UebersichtZustand } from './zustand';

export function UebersichtListe({ u }: { u: UebersichtZustand }) {
  const h = u.geordnet?.offen ?? [];
  return (
    <>
      <Listenkopf
        titel={t('werkbank.uebersicht.uebersicht')}
        hilfe="werkbank.uebersicht"
        beschreibung={t('werkbank.uebersicht.was-in-dieser-installation')}>
        <Knopf groesse="klein" symbol="neu-laden" onClick={() => u.laden()}>
          {t('werkbank.uebersicht.neu-laden')}
        </Knopf>
      </Listenkopf>
      {u.fehler && (
        <div className="hinweis schlecht">
          <p>{u.fehler}</p>
        </div>
      )}
      {/* Am Handy steht die Übersicht in der Liste: zuerst die Kacheln (#816), darunter die Meldungen. */}
      {u.stand && (
        <div className="nur-schmal-block">
          <Kacheln s={u.stand} />
        </div>
      )}
      {!u.stand ? (
        <p className="leise">{t('werkbank.uebersicht.lade')}</p>
      ) : !h.length ? (
        <p className="leise leerliste">{t('werkbank.uebersicht.alles-eingerichtet-nichts-zu')}</p>
      ) : (
        <ul className="mappenliste meldungsliste">
          {h.map((x) => (
            <li key={x.schluessel} className={`meldung ${x.art}`}>
              <Link to={x.ziel} className="eintrag werk">
                <span className="titel">
                  <Etikett art={etikettArt(x.art === 'info' ? '' : x.art)}>{t.frei(`werkbank.uebersicht.schwere.${x.art}`)}</Etikett>{' '}
                  {x.knopf}
                </span>
                <span className="unter">{x.text}</span>
              </Link>
              <div className="meldung-akzeptieren nur-schmal-block">
                <Akzeptieren h={x} u={u} />
              </div>
            </li>
          ))}
        </ul>
      )}
      {u.stand && (
        <div className="nur-schmal-block">
          <BewusstAkzeptiert u={u} />
        </div>
      )}
    </>
  );
}

export function UebersichtPanel({ u }: { u: UebersichtZustand }) {
  const handbuch = useHandbuch();
  const s = u.stand;
  const h = u.geordnet?.offen ?? [];
  return (
    <div className="einspaltig uebersicht">
      <div className="mappenkopf">
        <p className="ueber">{t('werkbank.uebersicht.werkbank')}</p>
        <h1>{t('werkbank.uebersicht.uebersicht')}</h1>
        <p className="leise">
          {tn('werkbank.uebersicht.hinweise-stand-und-bestand', {
            link: (
              <a href={handbuch('admin')} target="_blank" rel="noreferrer" className="verweis">
                {t('werkbank.uebersicht.administratorhandbuch')}
              </a>
            ),
            link2: (
              <Link to="/werkbank/ansicht" className="verweis">
                {t('werkbank.uebersicht.werkbank-anpassen')}
              </Link>
            ),
          })}
        </p>
      </div>
      {!s ? (
        <p className="leise">{t('werkbank.uebersicht.lade')}</p>
      ) : (
        <>
          {/* Erst, was alles zu tun ist (Kacheln), darunter die konkreten Meldungen – rot, gelb, Hinweise (#816). */}
          <Kacheln s={s} />
          {h.length ? (
            h.map((x) => (
              <div key={x.schluessel} className={`hinweis ${x.art === 'info' ? '' : x.art} hinweiszeile`}>
                <p>{x.text}</p>
                <div className="knoepfe">
                  <KnopfLink to={x.ziel} groesse="klein">
                    {x.knopf}
                  </KnopfLink>
                </div>
                <Akzeptieren h={x} u={u} />
              </div>
            ))
          ) : (
            <div className="hinweis gut">
              <p>
                {tn('werkbank.uebersicht.es-gibt-gerade-nichts', { b: <strong>{t('werkbank.uebersicht.alles-eingerichtet')}</strong> })}
              </p>
            </div>
          )}
          <BewusstAkzeptiert u={u} />
        </>
      )}
    </div>
  );
}

function Kacheln({ s }: { s: WerkbankUebersicht }) {
  return (
    <div className="kacheln">
      <Kachel
        titel={t('werkbank.uebersicht.aufgaben-2')}
        ziel="/werkbank/aufgaben"
        wert={zahl(s.aufgaben.offen)}
        unter={t('werkbank.uebersicht.offen')}
      />
      <Kachel
        titel={t('werkbank.uebersicht.texterkennung')}
        ziel="/werkbank/texterkennung"
        wert={s.texterkennung ? zahl(s.texterkennung.wartet + s.texterkennung.laeuft) : '–'}
        unter={
          s.texterkennung
            ? t('werkbank.uebersicht.in-der-warteschlange-mit', { zahl: zahl(s.texterkennung.fehler) })
            : t('werkbank.uebersicht.nicht-eingerichtet')
        }
      />
      <Kachel
        titel={t('werkbank.uebersicht.papierkorb')}
        ziel="/werkbank/papierkorb"
        wert={zahl(s.papierkorb.anzahl)}
        unter={
          s.papierkorb.tage
            ? s.papierkorb.aeltester
              ? t('werkbank.uebersicht.aelteste-vom-tage', { datum: datum(s.papierkorb.aeltester), tage: s.papierkorb.tage })
              : t('werkbank.uebersicht.tage-aufbewahrung', { tage: s.papierkorb.tage })
            : t('werkbank.uebersicht.ausgeschaltet')
        }
      />
      <Kachel
        titel={t('werkbank.uebersicht.gemeldete-fehler-2')}
        ziel="/werkbank/fehlermeldungen"
        wert={s.fehlermeldungen === null ? '–' : zahl(s.fehlermeldungen)}
        unter={t('werkbank.uebersicht.offen')}
      />
      {s.bestand && (
        <Kachel
          titel={t('werkbank.uebersicht.bestand')}
          ziel="/werkbank/anbindung"
          wert={zahl(s.bestand.mappen)}
          unter={t('werkbank.uebersicht.mappen-dokumente-benutzer', {
            zahl: zahl(s.bestand.dokumente),
            bytes: bytes(s.bestand.dokumenteBytes),
            zahl2: zahl(s.bestand.benutzer),
          })}
        />
      )}
      <Kachel
        titel={t('werkbank.uebersicht.version')}
        ziel="/werkbank/systemzustand#version"
        wert={s.version.version}
        unter={
          s.version.commit
            ? t('werkbank.uebersicht.build-unter-systemzustand-auf', { commit: s.version.commit.slice(0, 7) })
            : t('werkbank.uebersicht.unter-systemzustand-auf-updates')
        }
      />
    </div>
  );
}

function Kachel({ titel, wert, unter, ziel }: { titel: string; wert: string; unter: string; ziel: string }) {
  return (
    <Link to={ziel} className="kachel">
      <span className="ueber">{titel}</span>
      <span className="wert">{wert}</span>
      <span className="leise klein">{unter}</span>
    </Link>
  );
}
