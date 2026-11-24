import type { WerkbankUebersicht } from '../../api/betrieb';
import { Link } from '../../ort';
import { t, tn } from '../../sprache';
import { useHandbuch } from '../../Hilfe';
import { Listenkopf } from '../../Listenkopf';
import { Kachel, Kacheln, Knopf, KnopfLink } from '../../bausteine';
import { Akzeptieren, BewusstAkzeptiert, ZuletztAkzeptiert } from './Akzeptieren';
import { WasAblagoDarf } from './WasAblagoDarf';
import { bytes, datum, zahl } from './hilfen';
import type { UebersichtZustand } from './zustand';

/**
 * Übersicht der Werkbank (#68, #816), zweigeteilt wie die Startseite der Ablage (#1284): links die Navigation, rechts
 * breit diese Seite – oben die Kacheln, darunter die Hinweise nach Schwere (rot → gelb → Hinweis), je Hinweis der Weg
 * dorthin und „Zur Kenntnis nehmen“, ganz unten „Bewusst akzeptiert“. Jeder Hinweis steht genau einmal; vorher stand
 * er in der Mitte als Liste und rechts noch einmal als Meldung. Am Handy dieselbe Reihenfolge untereinander.
 */
export function UebersichtSeite({ u }: { u: UebersichtZustand }) {
  const s = u.stand;
  return (
    <>
      <Listenkopf
        titel={t('werkbank.uebersicht.uebersicht')}
        hilfe="werkbank.uebersicht"
        beschreibung={t('werkbank.uebersicht.was-in-dieser-installation')}>
        {/* Die Hinweise laden sich beim Zurückkommen selbst neu (#1513); der Knopf bleibt für Ungeduldige. */}
        <Knopf groesse="klein" symbol="neu-laden" title={t('werkbank.uebersicht.neu-laden.titel')} onClick={() => u.laden()}>
          {t('werkbank.uebersicht.neu-laden')}
        </Knopf>
      </Listenkopf>
      <div className="listenrumpf uebersicht">
        {u.fehler && (
          <div className="hinweis schlecht">
            <p>{u.fehler}</p>
          </div>
        )}
        {!s ? (
          <p className="leise">{t('werkbank.uebersicht.lade')}</p>
        ) : (
          <>
            <WasAblagoDarf u={u} />
            <UebersichtKacheln s={s} />
            <Hinweise u={u} />
            <BewusstAkzeptiert u={u} />
          </>
        )}
        <Wege />
      </div>
    </>
  );
}

/**
 * Die Hinweise nach Schwere, jeder genau einmal – ein Muster für alle (#1511): Titel und ein bis zwei Sätze, darunter
 * der Hauptknopf mit der Handlung und daneben „Zur Kenntnis nehmen“ (bzw. „Nein, danke“ bei einer echten Frage).
 */
function Hinweise({ u }: { u: UebersichtZustand }) {
  const h = u.geordnet?.offen ?? [];
  return (
    <section className="uebersicht-hinweise" aria-labelledby="uebersicht-hinweise-titel">
      <h2 id="uebersicht-hinweise-titel" className="h3">
        {t('werkbank.uebersicht.hinweise-titel')}
      </h2>
      <ZuletztAkzeptiert u={u} />
      {h.length ? (
        <ul className="uebersicht-hinweisliste">
          {h.map((x) => (
            <li key={x.schluessel} className={`hinweis ${x.art === 'info' ? '' : x.art} hinweiszeile`} data-schwere={x.art}>
              <p>
                <span className="sr">{t.frei(`werkbank.uebersicht.schwere.${x.art}`)}: </span>
                {x.text}
              </p>
              <div className="knoepfe">
                {!x.eigeneKnoepfe && (
                  <KnopfLink to={x.ziel} groesse="klein" art="haupt">
                    {x.knopf}
                  </KnopfLink>
                )}
                <Akzeptieren h={x} u={u} />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="hinweis gut">
          <p>{tn('werkbank.uebersicht.es-gibt-gerade-nichts', { b: <strong>{t('werkbank.uebersicht.alles-eingerichtet')}</strong> })}</p>
        </div>
      )}
    </section>
  );
}

/** Ganz unten, leise: Handbuch und „Werkbank anpassen“. */
function Wege() {
  const handbuch = useHandbuch();
  return (
    <p className="leise klein">
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
  );
}

/** Kacheln der Übersicht (#816) – derselbe Baustein wie auf der Startseite der Ablage (#1271, #1284). */
function UebersichtKacheln({ s }: { s: WerkbankUebersicht }) {
  return (
    <Kacheln>
      <Kachel
        titel={t('werkbank.uebersicht.aufgaben-2')}
        to="/werkbank/aufgaben"
        wert={s.aufgaben.offen}
        unter={t('werkbank.uebersicht.offen')}
      />
      <Kachel
        titel={t('werkbank.uebersicht.texterkennung')}
        to="/werkbank/texterkennung"
        wert={s.texterkennung ? s.texterkennung.wartet + s.texterkennung.laeuft : '–'}
        unter={
          s.texterkennung
            ? t('werkbank.uebersicht.in-der-warteschlange-mit', { zahl: zahl(s.texterkennung.fehler) })
            : t('werkbank.uebersicht.nicht-eingerichtet')
        }
      />
      <Kachel
        titel={t('werkbank.uebersicht.papierkorb')}
        to="/werkbank/papierkorb"
        wert={s.papierkorb.anzahl}
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
        to="/werkbank/fehlermeldungen"
        wert={s.fehlermeldungen === null ? '–' : s.fehlermeldungen}
        unter={t('werkbank.uebersicht.offen')}
      />
      {s.bestand && (
        <Kachel
          titel={t('werkbank.uebersicht.bestand')}
          to="/werkbank/anbindung"
          wert={s.bestand.mappen}
          unter={t('werkbank.uebersicht.mappen-dokumente-benutzer', {
            zahl: zahl(s.bestand.dokumente),
            bytes: bytes(s.bestand.dokumenteBytes),
            zahl2: zahl(s.bestand.benutzer),
          })}
        />
      )}
      <Kachel
        titel={t('werkbank.uebersicht.version')}
        to="/werkbank/systemzustand#version"
        wert={s.version.version}
        unter={
          s.version.commit
            ? t('werkbank.uebersicht.build-unter-systemzustand-auf', { commit: s.version.commit.slice(0, 7) })
            : t('werkbank.uebersicht.unter-systemzustand-auf-updates')
        }
      />
    </Kacheln>
  );
}
