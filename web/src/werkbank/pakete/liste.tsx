import { useMemo, useState } from 'react';
import { Aufklapper, Etikett, Feld, Knopf, type KnopfErgebnis, KnopfLink, Schalter } from '../../bausteine';
import {
  herkunftText,
  KATALOG_LINK_REL,
  katalogSeiteMitVersion,
  type InstalliertesPaket,
  type NeueVersion,
} from '../../../../shared/src/pakete';
import { gebietsschema } from '../../../../shared/src/sprache';
import { ApiFehler } from '../../api/anfrage';
import { paketeApi, type PaketQuelle } from '../../api/pakete';
import { Hilfe } from '../../Hilfe';
import { useKonto } from '../../konto';
import { Listenkopf } from '../../Listenkopf';
import { geheZu, Link } from '../../ort';
import { rueckfrage } from '../../rueckfrage';
import { t as tx, t, tn } from '../../sprache';
import { Symbol } from '../../Symbol';
import { HerkunftZeile } from '../Herkunft';
import { ERSTELLEN, SELBST } from '../PaketErstellen';
import { PaketeVerfuegbar } from '../PaketeVerfuegbar';
import type { PaketeZustand } from '../paketeZustand';
import { Herausgeber } from '../PaketVorschau';
import { ALLE, datum, SAMMEL, UPLOAD } from './pfade';

/**
 * Werkbank → Pakete, die Liste (#188; #1279 aus Pakete.tsx gezogen): Abruf, Paket erstellen, ohne Internet,
 * Expertenmodus mit weiteren Quellen und Hochladen, installierte und verfügbare Pakete.
 */

const host = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

/**
 * Abschnitt „Expertenmodus“ auf- oder zugeklappt (#369): reiner Komfort, kein Recht – gemerkt im
 * Browser je Benutzer, standardmäßig zu. Er zeigt nur etwas an; welche Kataloge abgefragt werden,
 * bestimmen die Quellen selbst (eingeschaltet oder nicht), nicht der Abschnitt.
 */
function useExperteOffen(): [boolean, (offen: boolean) => void] {
  const { ich } = useKonto();
  const schluessel = `dms:pakete-experte:${ich.id}`;
  const [offen, setOffen] = useState(() => {
    try {
      return localStorage.getItem(schluessel) === '1';
    } catch {
      return false;
    }
  });
  const setzen = (n: boolean) => {
    setOffen(n);
    try {
      if (n) localStorage.setItem(schluessel, '1');
      else localStorage.removeItem(schluessel);
    } catch {
      /* nur für diese Sitzung */
    }
  };
  return [offen, setzen];
}

/** Expertenmodus (#189, #369): weitere Quellen und Hochladen als Datei (ein Paket oder eine Sammeldatei, #461). */
function Expertenbereich({ z }: { z: PaketeZustand }) {
  const [experte, setExperte] = useExperteOffen();
  const [hochFehler, setHochFehler] = useState<string>();
  async function hochladen(f: File | undefined) {
    if (!f) return;
    setHochFehler(undefined);
    try {
      const r = await paketeApi.paketHochladen(f);
      // Eine Sammeldatei (#461) erkennt das DMS selbst.
      if ('sammeldatei' in r) {
        z.setSammel({ sammeldatei: r.sammeldatei, datei: f.name });
        geheZu(`/werkbank/pakete/${SAMMEL}`);
      } else {
        z.setUpload({ ...r, datei: f.name });
        geheZu(`/werkbank/pakete/${UPLOAD}`);
      }
    } catch (e) {
      setHochFehler([(e as Error).message, ...(e instanceof ApiFehler ? e.gruende : [])].join(' '));
    }
  }
  return (
    <section className="aufklappbereich">
      <Aufklapper offen={experte} steuert="pakete-experte" umschalten={() => setExperte(!experte)}>
        <span>{t('werkbank.pakete.expertenmodus')}</span>
        <span className="leise klein">{t('werkbank.pakete.weitere-quellen-paket-oder')}</span>
      </Aufklapper>
      {experte && (
        <div id="pakete-experte" className="aufklappinhalt">
          <div className="hinweis warn klein">
            <p>{t('werkbank.pakete.pakete-ausserhalb-des-offiziellen')}</p>
          </div>
          <h2 className="ueber">{t('werkbank.pakete.weitere-quellen')}</h2>
          <Quellen z={z} />
          <h2 className="ueber">{t('werkbank.pakete.paket-hochladen')}</h2>
          <p className="leise klein">{tn('werkbank.pakete.eine-datei-im-format', { code: <code>{'.zip'}</code> })}</p>
          <input
            type="file"
            accept=".zip,application/zip"
            aria-label={t('werkbank.pakete.paket-oder-sammeldatei-als')}
            onChange={(e) => {
              void hochladen(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          {hochFehler && <p className="fehlertext klein">{hochFehler}</p>}
        </div>
      )}
    </section>
  );
}

/** Installiert: selbst erstellte (#652) und installierte Pakete mit neuer Version und „Einstellungen nötig“. */
function Installiert({ z, offen }: { z: PaketeZustand; offen?: string }) {
  const installiert = z.stand?.installiert ?? [];
  const neuer = (id: string) => z.updates.find((u) => u.id === id);
  if (!z.stand) return <p className="leise">{t('werkbank.pakete.lade')}</p>;
  if (!installiert.length && !z.selbst?.length)
    return <p className="leise leerliste">{t('werkbank.pakete.noch-keine-pakete-installiert')}</p>;
  return (
    <ul className="mappenliste">
      {(z.selbst ?? []).map((p) => (
        <li key={`selbst|${p.id}`}>
          <Link to={`/werkbank/pakete/${SELBST}${p.id}`} className={`eintrag werk ${offen === `${SELBST}${p.id}` ? 'an' : ''}`}>
            <span className="titel">
              {p.name} <Etikett title={tx('pakete.selbst.chipTitel')}>{tx('pakete.selbst.chip')}</Etikett>
              {z.konflikt(p.id) && (
                <>
                  {' '}
                  <Etikett art="warn" title={tx('pakete.selbst.konflikt', { id: p.id })}>
                    {tx('pakete.selbst.konfliktChip')}
                  </Etikett>
                </>
              )}
            </span>
            <span className="unter">
              {tx('pakete.selbst.unter', { version: p.version, datum: new Date(p.erstellt).toLocaleDateString(gebietsschema()) })}
            </span>
          </Link>
        </li>
      ))}
      {installiert.map((p) => (
        <li key={p.id}>
          <Link to={`/werkbank/pakete/${p.id}`} className={`eintrag werk ${offen === p.id ? 'an' : ''}`}>
            <span className="titel">
              {p.name}
              <Herausgeber wer={p.herausgeber} geprueft={p.herausgeberGeprueft} />{' '}
              {neuer(p.id) && (
                <Etikett art="warn" title={t('werkbank.pakete.neuere-version-in-der')}>
                  {neuer(p.id)!.neu}
                </Etikett>
              )}
              {p.einstellungenNoetig && (
                <>
                  {' '}
                  <Etikett art="warn" title={t('werkbank.pakete.pflichtfelder-in-den-einstellungen')}>
                    {t('werkbank.pakete.einstellungen-noetig')}
                  </Etikett>
                </>
              )}
            </span>
            <span className="unter">{t('werkbank.pakete.version', { version: p.version, herkunftText: herkunftText(p.herkunft) })}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function PaketeListe({ z, offen }: { z: PaketeZustand; offen?: string }) {
  const installiert: InstalliertesPaket[] = z.stand?.installiert ?? [];
  const abrufErgebnis = useMemo(
    () => ergebnisDesAbrufs(z.kataloge, z.updates, installiert.length > 0),
    [z.kataloge, z.updates, installiert.length],
  );
  return (
    <>
      <Listenkopf
        titel={t('werkbank.pakete.pakete')}
        hilfe="werkbank.pakete"
        beschreibung={t('werkbank.pakete.fertige-mappentypen-und-ansichten')}
      />
      <div className="knoepfe">
        {/* Ein Knopf für Katalog und neue Versionen (#1168): holt alle Kataloge; „läuft“ und das Ergebnis mit Uhrzeit am Knopf (#986). */}
        <Knopf
          groesse="klein"
          laeuftText={t('werkbank.pakete.frage-ab')}
          onClick={() => z.abrufen()}
          ergebnis={abrufErgebnis}
          data-anker="werkbank.pakete.suchen">
          {installiert.length ? t('werkbank.pakete.nach-neuen-versionen-suchen') : t('werkbank.pakete.katalog-abrufen')}
        </Knopf>
        <KnopfLink to={`/werkbank/pakete/${ERSTELLEN}`} groesse="klein" className={offen === ERSTELLEN ? 'an' : undefined}>
          {t('werkbank.pakete.paket-erstellen')}
        </KnopfLink>
        <KnopfLink to={`/werkbank/pakete/${SAMMEL}`} groesse="klein" className={offen === SAMMEL ? 'an' : undefined}>
          {t('werkbank.pakete.ohne-internet')}
        </KnopfLink>
      </div>
      <Expertenbereich z={z} />
      {z.fehler && (
        <div className="hinweis schlecht">
          <p>{z.fehler}</p>
        </div>
      )}
      <div className="zeile-zwischen">
        <h2 className="ueber">{t('werkbank.pakete.installiert')}</h2>
        {z.updates.length > 0 && (
          <KnopfLink to={`/werkbank/pakete/${ALLE}`} art="haupt" className={offen === ALLE ? 'an' : undefined} anker="werkbank.pakete.alle">
            {t('werkbank.pakete.alle-aktualisieren', { anzahl: z.updates.length })}
          </KnopfLink>
        )}
      </div>
      <Installiert z={z} offen={offen} />
      <h2 className="ueber">{t('werkbank.pakete.verfuegbar')}</h2>
      <KatalogAnsehen z={z} />
      {z.kataloge?.liste
        .filter((k) => k.fehler)
        .map((k) => (
          <div key={k.url} className="hinweis warn klein">
            <p>
              {k.offiziell ? t('werkbank.pakete.offizieller-katalog') : host(k.url)}: {k.fehler}
            </p>
          </div>
        ))}
      {/* Verfügbar (#1048): empfohlen, weitere Pakete, Sprachen über den Filter, Ergänzungen beim Hauptpaket, Suche. */}
      <PaketeVerfuegbar z={z} offen={offen} />
      {/* Herkunft des offiziellen Katalogs (#594): signiert, nicht signiert (Stufe 1: nur Warnung) oder ungültig. */}
      <HerkunftZeile p={z.kataloge?.liste.find((k) => k.offiziell)?.pruefung} />
    </>
  );
}

/**
 * Rückmeldung nach dem Abruf (#1168), am Knopf: Uhrzeit und Ergebnis – „3 neue Versionen“, „Alles aktuell“ oder ohne
 * installierte Pakete nur „Katalog abgerufen“. Ist kein Katalog erreichbar, steht das dort; die Gründe stehen über der Liste.
 */
function ergebnisDesAbrufs(k: PaketeZustand['kataloge'], updates: NeueVersion[], mitInstalliert: boolean): KnopfErgebnis | null {
  if (!k) return null;
  const zeit = new Date(k.abgerufen).toLocaleTimeString(gebietsschema(), { timeStyle: 'short' });
  if (!k.liste.some((x) => x.katalog)) return { art: 'warn', text: t('werkbank.pakete.abruf.fehler', { zeit }) };
  if (!mitInstalliert) return { art: 'gut', text: t('werkbank.pakete.abruf.katalog', { zeit }) };
  return updates.length
    ? { art: 'info', text: t('werkbank.pakete.abruf.neu', { zeit, anzahl: updates.length }) }
    : { art: 'gut', text: t('werkbank.pakete.abruf.aktuell', { zeit }) };
}

/**
 * „Im Katalog ansehen“ (#622): öffnet die Katalog-Webseite mit der DMS-Version nur im Fragment
 * (`#dms=…`, geht an keinen Server). Ist der offizielle Katalog nicht erreichbar, steht statt des
 * Links der Hinweis auf „Ohne Internet …“. Eigene Kataloge haben keine bekannte Webseite – nur der offizielle.
 */
function KatalogAnsehen({ z }: { z: PaketeZustand }) {
  if (z.kataloge?.liste.some((k) => k.offiziell && k.fehler)) return <p className="leise klein">{tx('pakete.katalog.ohneinternet')}</p>;
  return (
    <p className="leise klein">
      <a className="verweis" href={katalogSeiteMitVersion(z.stand?.dms ?? '')} target="_blank" rel={KATALOG_LINK_REL}>
        {tx('pakete.katalog.ansehen')} <Symbol name="extern" />
      </a>
      {' – '}
      {tx('pakete.katalog.hinweis')} <Hilfe ort="werkbank.pakete.katalog" />
    </p>
  );
}

/** Fingerabdruck aus einer Rückfrage des Servers (409, #594): Katalog mit eigenem Schlüssel. */
const fingerabdruckAus = (e: unknown): string | null => {
  const d =
    e instanceof ApiFehler && e.status === 409 ? (e.details as { schluessel?: boolean; fingerabdruck?: string } | undefined) : undefined;
  return d?.schluessel && d.fingerabdruck ? d.fingerabdruck : null;
};

/** Eine weitere Quelle: an/aus, entfernen, Schlüssel (#594) – gesperrt nach einem Schlüsselwechsel. */
function QuelleZeile({
  q,
  tu,
  mitSchluessel,
}: {
  q: PaketQuelle;
  tu(f: () => Promise<PaketQuelle[]>): Promise<void>;
  mitSchluessel(adresse: string, senden: (fp?: string) => Promise<PaketQuelle[]>): Promise<void>;
}) {
  return (
    <li key={q.url}>
      <Schalter
        an={q.aktiv}
        setze={(an) => tu(() => paketeApi.paketQuelleSchalten(q.url, an))}
        beschriftung={q.url}
        className="umbrechen"
        hinweis={
          `${q.von ? t('werkbank.pakete.von', { von: q.von }) : ''}${q.am ? t('werkbank.pakete.am', { datum: datum(q.am) }) : ''}`.trim() ||
          undefined
        }
      />
      <Knopf
        art="gefahr"
        groesse="klein"
        symbol="geloescht"
        onClick={() => tu(() => paketeApi.paketQuelleEntfernen(q.url))}
        rueckfrage={{ titel: t('werkbank.pakete.paketquelle-entfernen'), text: q.url, ja: t('werkbank.pakete.entfernen') }}>
        {t('werkbank.pakete.entfernen')}
      </Knopf>
      {q.gesperrt ? (
        <div className="hinweis warn" role="alert">
          <p>
            <Symbol name="warnung" className="sym-warn" /> {tx('pakete.quelle.gesperrt', { seit: datum(q.gesperrt.seit) })}{' '}
            <code className="fingerabdruck">{q.gesperrt.fingerabdruck}</code>
          </p>
          <Knopf groesse="klein" onClick={() => mitSchluessel(q.url, (fp) => paketeApi.paketQuelleSchluessel(q.url, fp))}>
            {tx('pakete.quelle.pruefen')}
          </Knopf>
        </div>
      ) : (
        <p className="leise">
          {q.fingerabdruck ? (
            <>
              <Symbol name="schloss" /> {tx('pakete.quelle.schluessel')} <code className="fingerabdruck">{q.fingerabdruck}</code>
            </>
          ) : (
            tx('pakete.quelle.ohne')
          )}
          {' · '}
          <Knopf onClick={() => mitSchluessel(q.url, (fp) => paketeApi.paketQuelleSchluessel(q.url, fp))}>
            {tx('pakete.quelle.pruefen')}
          </Knopf>
        </p>
      )}
    </li>
  );
}

/**
 * Weitere Katalogadressen (#189): hinzufügen, abschalten, entfernen. Hat ein Katalog einen eigenen Schlüssel
 * (#594), zeigt das DMS beim Hinzufügen den Fingerabdruck und übernimmt ihn erst nach Bestätigung – wie beim
 * ersten Kontakt mit SSH. Nach einem Schlüsselwechsel ist die Quelle gesperrt, bis du den neuen bestätigst.
 */
function Quellen({ z }: { z: PaketeZustand }) {
  const [url, setUrl] = useState('');
  const [fehler, setFehler] = useState<string>();
  const weitere = (z.stand?.quellen ?? []).filter((q) => !q.offiziell);
  async function tu(f: () => Promise<PaketQuelle[]>) {
    setFehler(undefined);
    try {
      const quellen = await f();
      z.setStand((s) => (s ? { ...s, quellen } : s));
    } catch (e) {
      setFehler((e as Error).message);
    }
  }
  /** Erst ohne Fingerabdruck fragen; meldet der Server einen Schlüssel, zeigen und nach Bestätigung erneut senden. */
  const mitSchluessel = (adresse: string, senden: (fp?: string) => Promise<PaketQuelle[]>) =>
    tu(async () => {
      try {
        return await senden();
      } catch (e) {
        const fp = fingerabdruckAus(e);
        if (!fp) throw e;
        const ja = await rueckfrage({
          titel: tx('pakete.quelle.bestaetigen.titel'),
          ja: tx('pakete.quelle.bestaetigen.ja'),
          text: (
            <>
              <span className="umbrechen">{adresse}</span>
              <br />
              <code className="fingerabdruck">{fp}</code>
              <br />
              {tx('pakete.quelle.bestaetigen.text')}
            </>
          ),
        });
        if (!ja) return z.stand?.quellen ?? [];
        return senden(fp);
      }
    });
  return (
    <div className="stapel klein">
      <p className="leise">
        {tx('pakete.quelle.erklaerung')} <Hilfe ort="werkbank.pakete.schluessel" />
      </p>
      {!weitere.length ? (
        <p className="leise">{t('werkbank.pakete.keine-weiteren-kataloge')}</p>
      ) : (
        <ul className="stapel">
          {weitere.map((q) => (
            <QuelleZeile key={q.url} q={q} tu={tu} mitSchluessel={mitSchluessel} />
          ))}
        </ul>
      )}
      <form
        className="zeile"
        onSubmit={(e) => {
          e.preventDefault();
          const adresse = url.trim();
          void mitSchluessel(adresse, async (fp) => {
            const r = await paketeApi.paketQuelleHinzu(adresse, fp);
            setUrl('');
            return r;
          });
        }}>
        <Feld beschriftung={t('werkbank.pakete.adresse-eines-weiteren-katalogs')} beschriftungVerbergen>
          <input type="url" placeholder="https://…/katalog.json" value={url} onChange={(e) => setUrl(e.target.value)} />
        </Feld>
        <Knopf art="haupt" type="submit" gesperrt={!url.trim()}>
          {t('werkbank.pakete.hinzufuegen')}
        </Knopf>
      </form>
      {fehler && <p className="fehlertext">{fehler}</p>}
    </div>
  );
}
