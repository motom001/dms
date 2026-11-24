import { Kopf } from './Kopf';
import { WerkzeugeHinweis } from './Werkzeuge';
import { OCR_STAENDE } from '../../../shared/src/model';
import type { OcrStatus } from '../api/suche';
import { Link } from '../ort';
import { Hilfe } from '../Hilfe';
import { sprachname, sprachvorschlaege } from '../../../shared/src/textsprache';
import { TEXTERKENNUNG_PAKET } from '../../../shared/src/volltext';
import { t as tx, t, tn } from '../sprache';
import { PauseHinweis, Warteschlange, zahl } from './texterkennung/teile';
import { Auftraege } from './texterkennung/Auftraege';
import { Zeitgrenze } from './texterkennung/Zeitgrenze';
import type { TexterkennungZustand } from './texterkennung/zustand';
import { KnopfLink } from '../bausteine';

/**
 * Werkbank → Texterkennung (#45, #459): Übersicht – welches Paket die Texterkennung übernimmt, woher der Text der
 * Dokumente kommt, erkannte Sprachen, Warteschlange und Aufträge. Einstellungen der Erkennung stehen beim Paket.
 * Eingebaute Werkzeuge (Poppler, qpdf) erscheinen nur, wenn eins fehlt (#1189).
 * Werkbank → Wartungsoperationen: Volltext neu erzeugen (#458), alle Dateien prüfen (#212),
 * Nummern nachträglich vergeben. Sicherung, Wiederherstellung und Export sind eigene Bereiche.
 *
 * Teile in texterkennung/ (#1279): Zustand, Warteschlange und Pausen-Hinweis, Aufträge, Wartungsoperationen.
 */
export { useTexterkennung, type TexterkennungZustand } from './texterkennung/zustand';
export { WartungPanel } from './texterkennung/Wartung';

export function TexterkennungPanel({ t: eintrag, wartungAn }: { t: TexterkennungZustand; wartungAn?: boolean }) {
  if (eintrag.fehler)
    return (
      <div className="hinweis schlecht">
        <p>{eintrag.fehler}</p>
      </div>
    );
  if (!eintrag.stand) return <p className="leise">{t('werkbank.texterkennung.lade')}</p>;
  const s = eintrag.stand;
  return (
    <div className="einspaltig">
      <Kopf titel={tx('volltext.werkbank.titel')} ueber={t('werkbank.texterkennung.werkbank')} hilfe="werkbank.texterkennung">
        <p className="leise">{tx('volltext.werkbank.einleitung')}</p>
      </Kopf>
      <PauseHinweis t={eintrag} wartungAn={wartungAn} />
      {/* Eingebaute Werkzeuge (#1189): nur, wenn eins fehlt – oben, mit Folge und Abhilfe. */}
      <WerkzeugeHinweis werkzeuge={s.werkzeuge} pruefen={() => eintrag.laden(true)} />

      <PaketBlock s={s} />

      <HerkunftBlock s={s} />

      <UmwandlungBlock s={s} />

      <ArchivBlock s={s} />

      <ErkannteSprachen s={s} />

      <section className="blatt" id="warteschlange">
        <h2 className="h3">{t('werkbank.texterkennung.warteschlange')}</h2>
        <p>
          {tn('werkbank.texterkennung.mit-fehler', {
            b: <strong>{t('werkbank.texterkennung.offen', { zahl: zahl(s.zaehler.wartet + s.zaehler.laeuft) })}</strong>,
            zahl: zahl(s.zaehler.fehler),
            wert: !s.einstellungen.aktiv
              ? t('werkbank.texterkennung.ausgeschaltet')
              : wartungAn
                ? t('werkbank.texterkennung.pausiert-wartungsmodus')
                : '',
          })}
        </p>
        <Warteschlange s={s} />
        <p className="leise klein">
          {tx('volltext.werkbank.neu')}{' '}
          <Link to="/werkbank/wartung#operationen" className="verweis">
            {tx('volltext.werkbank.neu.link')}
          </Link>
        </p>
      </section>

      <Zeitgrenze t={eintrag} />

      <Auftraege t={eintrag} />
    </div>
  );
}

/**
 * Wer Scans und Bilder erkennt (#458, #459): das Paket (mit Link zu seinen Einstellungen) – oder der deutliche
 * Hinweis, dass es fehlt, mit dem direkten Weg zur Installation.
 */
function PaketBlock({ s }: { s: OcrStatus }) {
  const p = s.paket;
  const wartet = s.zaehler.paket ?? 0;
  return (
    <section className="blatt" id="paket">
      <h2 className="h3">{tx('volltext.werkbank.paket.titel')}</h2>
      {p ? (
        <>
          <p>{tx('volltext.werkbank.paket.da', { paket: `${p.name} ${p.version}` })}</p>
          {wartet > 0 && <p className="leise">{tx('volltext.werkbank.paket.wartet', { anzahl: wartet })}</p>}
          <div className="knoepfe">
            <KnopfLink to={`/werkbank/pakete/${p.id}`} groesse="klein">
              {tx('volltext.werkbank.paket.einstellungen')}
            </KnopfLink>
          </div>
        </>
      ) : (
        <div className="hinweis warn hinweiszeile" role="status">
          <p>
            <strong>{tx('volltext.werkbank.paket.fehlt')}</strong> {tx('volltext.werkbank.paket.fehlt.text')}
            {wartet > 0 ? ` ${tx('volltext.werkbank.paket.ohne', { anzahl: wartet })}` : ''}
          </p>
          <KnopfLink to={`/werkbank/pakete/${TEXTERKENNUNG_PAKET}`} art="haupt" groesse="klein">
            {tx('volltext.werkbank.paket.installieren')}
          </KnopfLink>
        </div>
      )}
    </section>
  );
}

/** Woher der Volltext der Dokumente kommt (#459): aus dem PDF, vom Paket, ohne Text, mit Fehler. */
function HerkunftBlock({ s }: { s: OcrStatus }) {
  const h = s.herkunft;
  if (!h) return null;
  const zeilen: Array<[string, number]> = [
    [tx('volltext.herkunft.pdf'), h.pdf],
    [tx('volltext.werkbank.herkunft.paket'), h.paket],
    ...(h.eingebaut ? [[tx('volltext.werkbank.herkunft.eingebaut'), h.eingebaut] as [string, number]] : []),
    ...(h.api ? [[tx('volltext.herkunft.api'), h.api] as [string, number]] : []),
    ...(h.sonst ? [[tx('volltext.werkbank.herkunft.sonst'), h.sonst] as [string, number]] : []),
    [OCR_STAENDE.paket, s.zaehler.paket ?? 0],
    [tx('volltext.werkbank.herkunft.ohne'), h.ohneText + s.zaehler.keiner],
    [OCR_STAENDE.fehler, s.zaehler.fehler],
  ];
  return (
    <section className="blatt" id="herkunft">
      <h2 className="h3">{tx('volltext.werkbank.herkunft.titel')}</h2>
      <dl className="eigenschaften">
        {zeilen.map(([k, n]) => (
          <div key={k} style={{ display: 'contents' }}>
            <dt>{k}</dt>
            <dd>{zahl(n)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/**
 * Andere Dateitypen (#577): je Typ, wie viele Dokumente es gibt und ob ein Paket sie umwandelt – sonst welches Paket
 * aus dem Katalog es könnte, mit dem Weg zur Installation.
 */
function UmwandlungBlock({ s }: { s: OcrStatus }) {
  const u = s.umwandlung;
  if (!u) return null;
  return (
    <section className="blatt" id="umwandlung">
      <h2 className="h3">
        {tx('volltext.werkbank.umwandlung.titel')} <Hilfe ort="werkbank.texterkennung.umwandlung" />
      </h2>
      <p className="leise">{tx('volltext.werkbank.umwandlung.einleitung')}</p>
      {!u.typen.length ? (
        <p className="leise">{tx('volltext.werkbank.umwandlung.keine')}</p>
      ) : (
        <table className="tabelle klein">
          <thead>
            <tr>
              <th>{tx('volltext.werkbank.umwandlung.typ')}</th>
              <th className="zahlzelle">{tx('volltext.werkbank.umwandlung.anzahl')}</th>
              <th>{tx('volltext.werkbank.umwandlung.paket')}</th>
            </tr>
          </thead>
          <tbody>
            {u.typen.map((x) => (
              <tr key={x.mime}>
                <td>
                  {x.name} {x.name !== x.mime && <span className="leise mono">{x.mime}</span>}
                </td>
                <td className="zahlzelle">{zahl(x.anzahl)}</td>
                <td>
                  {x.paket ? (
                    <Link to={`/werkbank/pakete/${x.paket.id}`} className="verweis">
                      {tx('volltext.werkbank.umwandlung.durch', { paket: x.paket.name })}
                    </Link>
                  ) : x.katalog ? (
                    <>
                      {tx('volltext.werkbank.umwandlung.katalog', { paket: x.katalog.name })}{' '}
                      <Link to={`/werkbank/pakete/${x.katalog.id}`} className="verweis">
                        {tx('volltext.werkbank.umwandlung.installieren')}
                      </Link>
                    </>
                  ) : x.volltext || x.volltextKatalog ? null : (
                    <span className="leise">{tx('volltext.werkbank.umwandlung.keins')}</span>
                  )}
                  {/* Volltext aus Paketen (#614): eigenes Paket für den Text, z. B. Office und E-Mail. */}
                  {x.volltext && x.volltext.id !== x.paket?.id && (
                    <>
                      {x.paket || x.katalog ? <br /> : null}
                      <Link to={`/werkbank/pakete/${x.volltext.id}`} className="verweis">
                        {tx('volltext.werkbank.umwandlung.volltext', { paket: x.volltext.name })}
                      </Link>
                    </>
                  )}
                  {!x.volltext && !x.paket && x.volltextKatalog && (
                    <>
                      {x.katalog ? <br /> : null}
                      {tx('volltext.werkbank.umwandlung.volltext-katalog', { paket: x.volltextKatalog.name })}{' '}
                      <Link to={`/werkbank/pakete/${x.volltextKatalog.id}`} className="verweis">
                        {tx('volltext.werkbank.umwandlung.installieren')}
                      </Link>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {u.typen.some((x) => (!x.paket && x.katalog) || (!x.volltext && x.volltextKatalog)) && (
        <p className="leise klein">{tx('volltext.werkbank.umwandlung.nachholen')}</p>
      )}
    </section>
  );
}

/** Statistik der erkannten Sprachen mit Vorschlägen für fehlende Sprach-Zusatzpakete (#395, #459). */
/** Archivfassung (PDF/A, #631): Paket, Anzahl je Stand und Dokumente mit Fehler oder ausgelassen (mit Grund). */
function ArchivBlock({ s }: { s: OcrStatus }) {
  const a = s.archivfassung;
  if (!a) return null;
  return (
    <section className="blatt" id="archivfassung">
      <h2 className="h3">
        {tx('volltext.werkbank.archiv.titel')} <Hilfe ort="werkbank.texterkennung.archivfassung" />
      </h2>
      <p className="leise">{tx('volltext.werkbank.archiv.einleitung')}</p>
      {!a.pakete.length ? (
        <p className="leise">{tx('volltext.werkbank.archiv.keins')}</p>
      ) : (
        <>
          <p>
            {a.pakete.map((p) => (
              <Link key={p.id} to={`/werkbank/pakete/${p.id}`} className="verweis">
                {tx('volltext.werkbank.archiv.paket', { paket: `${p.name} ${p.version}` })}
              </Link>
            ))}
          </p>
          <p className="klein">
            {tx('volltext.werkbank.archiv.zaehler', {
              fertig: a.zaehler.fertig,
              wartet: a.zaehler.wartet,
              ausgelassen: a.zaehler.ausgelassen,
              fehler: a.zaehler.fehler,
            })}
          </p>
        </>
      )}
      {/* Nachlauf der Vorschaubilder für den Bestand (#1216): Fortschritt, danach das Ergebnis des letzten Laufs. */}
      {a.vorschau &&
        (a.vorschau.offen > 0 ? (
          <p className="leise klein" role="status">
            {tx('volltext.werkbank.archiv.vorschau', { erledigt: zahl(a.vorschau.erledigt), offen: zahl(a.vorschau.offen) })}
          </p>
        ) : (
          a.vorschau.erledigt + a.vorschau.ohne > 0 && (
            <p className="leise klein">
              {tx('volltext.werkbank.archiv.vorschau.fertig', { erledigt: zahl(a.vorschau.erledigt), ohne: zahl(a.vorschau.ohne) })}
            </p>
          )
        ))}
      {a.pakete.length > 0 &&
        (!a.liste.length ? (
          <p className="leise klein">{tx('volltext.werkbank.archiv.keine')}</p>
        ) : (
          <table className="tabelle klein">
            <thead>
              <tr>
                <th>{tx('volltext.werkbank.archiv.dokument')}</th>
                <th>{tx('volltext.werkbank.archiv.grund')}</th>
              </tr>
            </thead>
            <tbody>
              {a.liste.map((x) => (
                <tr key={`${x.dokument}-${x.zeit}`}>
                  <td>
                    <Link to={`/ablage/eingang/${x.mappeId}?dokument=${x.dokument}`} className="verweis">
                      {x.name}
                    </Link>
                  </td>
                  <td className={x.stand === 'fehler' ? 'fehlertext' : 'leise'}>{x.info}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
    </section>
  );
}

function ErkannteSprachen({ s }: { s: OcrStatus }) {
  const erkannt = s.erkannteSprachen ?? {};
  const liste = Object.entries(erkannt).sort((a, b) => b[1] - a[1]);
  const da = s.paket?.sprachen;
  const vorschlaege = da ? sprachvorschlaege(erkannt, da) : [];
  return (
    <section className="blatt" id="sprachen">
      <h2 className="h3">{t('werkbank.texterkennung.erkannte-sprachen')}</h2>
      {!liste.length ? (
        <p className="leise">{t('werkbank.texterkennung.noch-keine-die-sprache')}</p>
      ) : (
        <table className="tabelle klein">
          <thead>
            <tr>
              <th>{t('werkbank.texterkennung.sprache')}</th>
              <th className="zahlzelle">{t('werkbank.texterkennung.dokumente')}</th>
              {da && <th>{tx('volltext.werkbank.sprachdaten')}</th>}
            </tr>
          </thead>
          <tbody>
            {liste.map(([k, n]) => (
              <tr key={k}>
                <td>
                  {sprachname(k)} <span className="leise mono">{k}</span>
                </td>
                <td className="zahlzelle">{zahl(n)}</td>
                {da && (
                  <td>
                    {da.includes(k) ? (
                      tx('volltext.werkbank.sprachdaten.da')
                    ) : (
                      <span className="fehlertext">{tx('volltext.werkbank.sprachdaten.fehlt')}</span>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {vorschlaege.map((v) => (
        <div key={v.sprache} className="hinweis info hinweiszeile">
          <p>
            {tx('volltext.werkbank.sprachdaten.vorschlag', { anzahl: v.anzahl, sprache: sprachname(v.sprache), paket: v.paket })}{' '}
            <Hilfe ort="werkbank.texterkennung.sprachpakete" />
          </p>
          <KnopfLink to={`/werkbank/pakete/${v.paket}`} groesse="klein">
            {tx('volltext.werkbank.sprachdaten.paket')}
          </KnopfLink>
        </div>
      ))}
    </section>
  );
}
