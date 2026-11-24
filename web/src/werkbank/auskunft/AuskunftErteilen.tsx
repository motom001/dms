import { fortschrittText } from '../../../../shared/src/auftrag';
import { AUSKUNFT_PASSWORT_MIN, personenTypen, type AuskunftStand, type Datenschutz } from '../../../../shared/src/auskunft';
import { BAUM_RICHTUNGEN, type BaumRichtung } from '../../../../shared/src/baum';
import type { Mappentyp } from '../../../../shared/src/model';
import { useDaten } from '../../daten';
import { Hilfe } from '../../Hilfe';
import { Link } from '../../ort';
import { t, tn } from '../../sprache';
import { titelOder } from '../../seiten';
import { Mehrfachauswahl } from '../../ablage/Mehrfachauswahl';
import { DatumEingabe, Feld, FeldGruppe, HakenFeld, Knopf } from '../../bausteine';
import { AuskunftFertig } from './AuskunftFertig';
import { erteilenAktionen, useAuskunftErteilen, type ErteilenZustand } from './erteilen-zustand';
import { groesse, heute } from './hilfen';
import { zeigeKnoten } from './knoten';
import { PersonWahl } from './PersonWahl';
import { auswahlVon, zufallsPasswort } from './wahl';

/* ---------- Auskunft erteilen ---------- */

type Daten = ReturnType<typeof useDaten>;
type Aktionen = ReturnType<typeof erteilenAktionen>;
type Auswahl = ReturnType<typeof auswahlVon>;

export function AuskunftErteilen({
  einstellung,
  nachher,
  zustellen,
}: {
  einstellung: Datenschutz;
  nachher(): Promise<void>;
  zustellen(id: string): void;
}) {
  const d = useDaten();
  const personTypen = personenTypen(einstellung)
    .map((id) => d.typ(id))
    .filter((eintrag) => !!eintrag);
  const x = useAuskunftErteilen(einstellung, nachher);
  const { betroffen, vorschau, meldung } = x;
  const w = auswahlVon(x.wahl, x.inhalte, vorschau);
  const a = erteilenAktionen(x, w.auswahl);
  const knoten = vorschau?.baum.knoten ?? [];
  const wurzel = knoten[0];

  return (
    <section className="blatt" id="auskunft">
      <h2 className="h3">
        {t('werkbank.datenschutz.auskunft-erteilen')} <Hilfe ort="werkbank.auskunft" />
      </h2>
      {!personTypen.length ? (
        <div className="hinweis info">
          <p>
            {tn('werkbank.datenschutz.lege-zuerst-unter-fest', {
              link: (
                <Link to="/werkbank/loeschkonzept#personendaten" className="verweis">
                  {t('werkbank.loeschkonzept.personendaten')}
                </Link>
              ),
            })}
          </p>
        </div>
      ) : !betroffen ? (
        personWaehlen(x, personTypen as Mappentyp[])
      ) : (
        gewaehltePerson(x, d, a)
      )}
      {meldung && (
        <div className={`hinweis ${meldung.art}`} role="status">
          <p>{meldung.text}</p>
        </div>
      )}

      {vorschau && wurzel && (
        <>
          <h3 className="h4">{t('werkbank.datenschutz.3-pruefen')}</h3>
          <p className="leise klein">
            {tn('werkbank.datenschutz.nur-was-angehakt-ist', {
              wert: vorschau.baum.kreise > 0 && t('werkbank.datenschutz.verweise-fuehren-auf-eine', { anzahl: vorschau.baum.kreise }),
              wert2: vorschau.baum.abgeschnitten && t('werkbank.datenschutz.es-gibt-mehr-mappen'),
              wert3: vorschau.baum.tieferMoeglich && t('werkbank.datenschutz.mit-mehr-ebenen-kaemen'),
            })}
          </p>
          <div className="hinweis warn">
            <p>
              {tn('werkbank.datenschutz.enthalten-dokumente-angaben-zu', { b: <strong>{t('werkbank.datenschutz.daten-dritter')}</strong> })}
            </p>
          </div>
          <ul className="auskunft-baum wurzel">{zeigeKnoten(wurzel, x, a)}</ul>
          {erzeugenSchritt(x, a, w, { zustellen, nachher })}
        </>
      )}
    </section>
  );
}

/** 1. Person wählen: Suche über die Mappentypen, die eine Person betreffen. */
function personWaehlen(x: ErteilenZustand, personTypen: Mappentyp[]) {
  const { setBetroffen, setVorschau } = x;
  return (
    <>
      <label className="eigenschaft" htmlFor="auskunft-person">
        <span>{t('werkbank.datenschutz.1-person-die-nach')}</span>
      </label>
      <PersonWahl
        typen={personTypen}
        waehle={(m) => {
          setBetroffen(m);
          setVorschau(null);
        }}
      />
      <p className="leise klein">
        {t('werkbank.auskunft.neu.typen')}{' '}
        <Link to="/werkbank/loeschkonzept#personendaten" className="verweis">
          {t('werkbank.loeschkonzept.personendaten')}
        </Link>
        .
      </p>
    </>
  );
}

/** Gewählte Person, Eingang der Anfrage mit Frist, 2. Sammeln mit Tiefe und Richtungen. */
function gewaehltePerson(x: ErteilenZustand, d: Daten, a: Aktionen) {
  const betroffen = x.betroffen!;
  const { setBetroffen, setVorschau, setAuftrag, eingang, setEingang, tiefe, setTiefe, richtungen, setRichtungen, laeuft, vorschau } = x;
  const { frist, sammeln } = a;
  return (
    <>
      {/* Gewählte Person als Eintrag wie im Verweisfeld (#667); „Entfernen“ führt zurück zur Suche. */}
      <Mehrfachauswahl
        name={t('werkbank.datenschutz.person')}
        platzhalter=""
        eingabe=""
        setEingabe={() => {}}
        offen={false}
        setOffen={() => {}}
        vorschlaege={[]}
        leerText=""
        waehle={() => {}}
        ohneSuche
        className="betroffen"
        gewaehlt={[
          {
            id: betroffen.id,
            inhalt: (
              <>
                <Link to={`/ablage/${betroffen.typId}/${betroffen.id}`} className="verweis">
                  {titelOder(betroffen.titel)}
                </Link>{' '}
                <span className="leise klein">{d.typ(betroffen.typId)?.name}</span>
              </>
            ),
            entfernenText: t('werkbank.datenschutz.entfernen-andere-person-waehlen', { titelOder: titelOder(betroffen.titel) }),
          },
        ]}
        entferne={() => {
          setBetroffen(null);
          setVorschau(null);
          setAuftrag(null);
        }}
      />
      <div className="zeile-umbruch">
        <Feld beschriftung={t('werkbank.datenschutz.anfrage-eingegangen-am')}>
          <DatumEingabe wert={eingang} max={heute()} setze={setEingang} />
        </Feld>
        <Knopf onClick={() => frist()} title={t('werkbank.datenschutz.aufgabe-fuer-dich-faellig')}>
          {t('werkbank.datenschutz.frist-als-aufgabe-anlegen')}
        </Knopf>
      </div>
      <p className="leise klein">{t('werkbank.datenschutz.2-sammeln-alle-mappen')}</p>
      <div className="zeile-umbruch">
        <Feld beschriftung={t('werkbank.datenschutz.tiefe')}>
          <select value={tiefe} onChange={(e) => setTiefe(Number(e.target.value))}>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n} {t('werkbank.datenschutz.ebenen', { anzahl: n })}
              </option>
            ))}
          </select>
        </Feld>
        <FeldGruppe beschriftung={t('werkbank.datenschutz.richtungen')}>
          {(Object.keys(BAUM_RICHTUNGEN) as BaumRichtung[]).map((r) => (
            <label key={r} className="haken">
              <input
                type="checkbox"
                checked={richtungen.includes(r)}
                onChange={(e) => setRichtungen(e.target.checked ? [...richtungen, r] : richtungen.filter((x) => x !== r))}
              />
              <span>{BAUM_RICHTUNGEN[r]}</span>
            </label>
          ))}
        </FeldGruppe>
        <Knopf
          art="haupt"
          gesperrt={!richtungen.length}
          laeuft={laeuft}
          laeuftText={t('werkbank.datenschutz.sammle')}
          onClick={() => void sammeln()}>
          {vorschau ? t('werkbank.datenschutz.neu-sammeln') : t('werkbank.datenschutz.sammeln')}
        </Knopf>
      </div>
    </>
  );
}

/** 4. Erzeugen: Umfang, Empfänger, Anmerkung, Passwort, „geprüft“ – danach das Ergebnis an der Stelle des Knopfs. */
function erzeugenSchritt(
  x: ErteilenZustand,
  a: Aktionen,
  { auswahl, ohneGrund, bytes }: Auswahl,
  { zustellen, nachher }: { zustellen(id: string): void; nachher(): Promise<void> },
) {
  const { empfaenger, setEmpfaenger, anmerkung, setAnmerkung, passwort, setPasswort, geprueft, setGeprueft, auftrag, setAuftrag } = x;
  const { erzeugen } = a;
  const pwFehler = passwort && passwort.length < AUSKUNFT_PASSWORT_MIN;
  const fertig = auftrag?.status === 'fertig' && auftrag.art === 'auskunft' ? (auftrag.ergebnis as AuskunftStand) : null;
  return (
    <>
      <h3 className="h4">{t('werkbank.datenschutz.4-erzeugen')}</h3>
      <p>
        {auswahl.mappen.length} {t('werkbank.datenschutz.mappen', { anzahl: auswahl.mappen.length })}
        {auswahl.erwaehnungen.length ? t('werkbank.datenschutz.und-erwaehnungen', { anzahl: auswahl.erwaehnungen.length }) : ''},{' '}
        {auswahl.dokumente.length} {t('werkbank.datenschutz.dokumente', { anzahl: auswahl.dokumente.length })} ({groesse(bytes)}),{' '}
        {auswahl.notizen.length} {t('werkbank.datenschutz.notizen', { anzahl: auswahl.notizen.length })}
        {auswahl.ohneNotizen.length ? t('werkbank.datenschutz.zurueckgehalten', { ohneNotizen: auswahl.ohneNotizen.length }) : ''}.
      </p>
      <div className="raster">
        <Feld
          beschriftung={t('werkbank.datenschutz.empfaenger-der-daten')}
          hinweis={t('werkbank.datenschutz.steht-auf-dem-deckblatt')}
          className="breit">
          <textarea rows={2} value={empfaenger} onChange={(e) => setEmpfaenger(e.target.value)} />
        </Feld>
        <Feld
          beschriftung={t('werkbank.datenschutz.anmerkung')}
          optional
          hinweis={t('werkbank.datenschutz.optional-steht-auf-dem')}
          className="breit">
          <textarea rows={2} value={anmerkung} onChange={(e) => setAnmerkung(e.target.value)} />
        </Feld>
        <Feld
          beschriftung={t('werkbank.datenschutz.passwort-fuer-die-zip')}
          optional
          hinweis={t('werkbank.datenschutz.optional-aes-256-mindestens', { AUSKUNFT_PASSWORT_MIN })}>
          {(v) => (
            <span className="zeile-umbruch">
              <input
                {...v}
                type="text"
                autoComplete="off"
                spellCheck={false}
                value={passwort}
                onChange={(e) => setPasswort(e.target.value)}
                className="mono"
              />
              <Knopf groesse="klein" onClick={() => setPasswort(zufallsPasswort())}>
                {t('werkbank.datenschutz.vorschlagen')}
              </Knopf>
            </span>
          )}
        </Feld>
      </div>
      {pwFehler && <p className="fehlertext klein">{t('werkbank.datenschutz.mindestens-zeichen', { AUSKUNFT_PASSWORT_MIN })}</p>}
      {passwort && !pwFehler && <p className="leise klein">{t('werkbank.datenschutz.teile-das-passwort-getrennt')}</p>}
      <HakenFeld beschriftung={t('werkbank.datenschutz.ich-habe-die-auswahl')}>
        <input type="checkbox" checked={geprueft} onChange={(e) => setGeprueft(e.target.checked)} />
      </HakenFeld>
      {ohneGrund > 0 && (
        <p className="fehlertext klein">{t('werkbank.datenschutz.abgewaehlte-notizen-brauchen-eine', { anzahl: ohneGrund })}</p>
      )}
      {auftrag?.status === 'laeuft' && (
        <p className="leise" role="status">
          {fortschrittText(auftrag)}
        </p>
      )}
      {auftrag?.status === 'fehler' && (
        <p className="fehlertext" role="alert">
          {auftrag.fehler}
        </p>
      )}
      {/* #665: Das Ergebnis steht an der Stelle des Knopfs – darüber verschiebt sich nichts; ein zweites Erzeugen nur über „Neue Auskunft erstellen“. */}
      {fertig ? (
        <AuskunftFertig
          f={fertig}
          zustellen={zustellen}
          nachher={nachher}
          neu={() => {
            setAuftrag(null);
            setGeprueft(false);
          }}
        />
      ) : (
        <div className="knoepfe">
          <Knopf
            art="haupt"
            gesperrt={!geprueft || !auswahl.mappen.length || ohneGrund > 0 || !!pwFehler}
            laeuft={auftrag?.status === 'laeuft'}
            laeuftText={t('werkbank.datenschutz.wird-erzeugt')}
            onClick={() => void erzeugen()}>
            {t('werkbank.datenschutz.auskunft-erzeugen')}
          </Knopf>
        </div>
      )}
    </>
  );
}
