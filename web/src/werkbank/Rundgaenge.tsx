import { useCallback, useEffect, useRef, useState } from 'react';
import { EIGEN, type WerkbankRundgaengeStand, type WerkbankRundgang, type ZeilenFehler } from '../../../shared/src/entdecken-werkbank';
import type { Fundquelle } from '../../../shared/src/listensuche';
import { rundgaengeApi } from '../api/rundgaenge';
import {
  FeldGruppe,
  Fundstellen,
  Hervorgehoben,
  KeineTreffer,
  Knopf,
  KnopfLink,
  ListenSuche,
  NurLesenFeld,
  PaketChip,
  PaketFilter,
  Schalter,
  Speicherleiste,
  useEntwurf,
  useListenSuche,
} from '../bausteine';
import { holeAnker, starteProbe, zielZeigen } from '../entdecken/werkzeuge';
import { Listenkopf } from '../Listenkopf';
import { geheZu, Link, loeseWache } from '../ort';
import { t } from '../sprache';
import { AnkerHilfe } from './AnkerHilfe';

/**
 * Werkbank → Rundgänge (#941), dreiteilig wie die übrigen Sammlungen. In der Mitte alle Rundgänge – von Ablago, aus
 * Paketen und eigene – mit Herkunft, Start, für wen und an/aus; rechts der gewählte: eigene als YAML-Datei zum
 * Bearbeiten (Variante B: Textfeld mit fester Zeichenbreite, Ankerhilfe, „Ziel zeigen“, „Prüfen“, „Ausprobieren“),
 * die übrigen zum Ansehen mit „Als eigenen kopieren“. An/aus gilt für alle und wirkt sofort (wie bei den
 * Automatisierungsvorlagen). Gespeichert wird nur ohne Fehler, mit Konfliktschutz wie bei Mappentypen (#917).
 */

export const RUNDGAENGE_PFAD = '/werkbank/rundgaenge';
const pfad = (schluessel: string) => `${RUNDGAENGE_PFAD}/${encodeURIComponent(schluessel)}`;
const lokal = (schluessel: string) => schluessel.slice(EIGEN.length + 1);

export function useRundgaenge(offen: boolean) {
  const [stand, setStand] = useState<WerkbankRundgaengeStand | null>(null);
  const [fehler, setFehler] = useState<string>();
  const laden = useCallback(async () => {
    try {
      setStand(await rundgaengeApi.stand());
      setFehler(undefined);
    } catch (e) {
      setFehler((e as Error).message);
    }
  }, []);
  useEffect(() => {
    if (offen) void laden();
  }, [offen, laden]);
  return { stand, fehler, laden };
}
export type RundgaengeZustand = ReturnType<typeof useRundgaenge>;

const paketId = (r: WerkbankRundgang) => (r.herkunft.startsWith('paket:') ? r.herkunft.slice(6) : null);
const herkunftText = (r: WerkbankRundgang) =>
  r.herkunft === 'ablago'
    ? t('werkbank.rundgaenge.ui.herkunft.ablago')
    : r.herkunft === EIGEN
      ? t('werkbank.rundgaenge.ui.herkunft.eigen')
      : (r.paketName ?? paketId(r) ?? '');
/** Start, für wen, Schritte – die Zeile unter dem Titel. */
const unterzeile = (r: WerkbankRundgang) =>
  [
    t.frei(`werkbank.rundgaenge.ui.start.${r.start.replace(/_/g, '-')}`),
    t.frei(`werkbank.rundgaenge.ui.fuer.${r.fuer}`),
    r.schritte ? t('werkbank.rundgaenge.ui.schritte', { anzahl: r.schritte }) : null,
  ]
    .filter(Boolean)
    .join(' · ');

function quellen(r: WerkbankRundgang): Fundquelle[] {
  return [
    { wo: '', text: r.titel, titel: true },
    { wo: t('werkbank.rundgaenge.ui.fund.beschreibung'), text: r.beschreibung },
    { wo: t('werkbank.rundgaenge.ui.fund.herkunft'), text: herkunftText(r) },
  ];
}

/** Mitte: alle Rundgänge mit Suche und Filter nach Herkunft. */
export function RundgaengeListe({ z, offen }: { z: RundgaengeZustand; offen?: string }) {
  const liste = z.stand?.rundgaenge ?? [];
  const such = useListenSuche(liste, { quellen, herkunft: (r) => paketId(r) ?? (r.herkunft === 'ablago' ? 'ablago' : null) });
  const pakete = such.paketeDa.map((id) => ({
    id,
    name: id === 'ablago' ? t('werkbank.rundgaenge.ui.herkunft.ablago') : (liste.find((r) => paketId(r) === id)?.paketName ?? id),
  }));
  return (
    <>
      <Listenkopf
        titel={t('werkbank.rundgaenge.ui.titel')}
        hilfe="werkbank.rundgaenge"
        beschreibung={t('werkbank.rundgaenge.ui.beschreibung')}>
        <KnopfLink to={`${RUNDGAENGE_PFAD}/neu`} art="anlegen" groesse="klein">
          {t('werkbank.rundgaenge.ui.neu')}
        </KnopfLink>
      </Listenkopf>
      {z.fehler && (
        <div className="hinweis schlecht">
          <p>{z.fehler}</p>
        </div>
      )}
      {liste.length > 0 && (
        <ListenSuche
          wert={such.eingabe}
          setze={such.setEingabe}
          beschriftung={t('werkbank.rundgaenge.ui.suche.beschriftung')}
          platzhalter={t('werkbank.rundgaenge.ui.suche.platzhalter')}
          treffer={such.treffer.length}
          aktiv={such.aktiv}
          anzahl={t('werkbank.rundgaenge.ui.anzahl', { anzahl: liste.length })}
          filter={
            <PaketFilter
              wert={such.paket}
              setze={such.setPaket}
              pakete={pakete}
              eigene={such.eigeneDa}
              beschriftung={t('werkbank.rundgaenge.ui.herkunft')}
            />
          }
        />
      )}
      {!z.stand ? (
        <p className="leise">{t('werkbank.rundgaenge.ui.lade')}</p>
      ) : !such.treffer.length && offen !== 'neu' ? (
        <KeineTreffer zuruecksetzen={such.zuruecksetzen} />
      ) : (
        <ul className="mappenliste">
          {offen === 'neu' && (
            <li>
              <span className="eintrag an werk">
                <span className="titel">{t('werkbank.rundgaenge.ui.neuer')}</span>
                <span className="unter">{t('werkbank.rundgaenge.ui.ungespeichert')}</span>
              </span>
            </li>
          )}
          {such.treffer.map(({ eintrag: r, titel, funde }) => (
            <li key={r.schluessel}>
              <Link to={pfad(r.schluessel)} className={`eintrag werk ${offen === r.schluessel ? 'an' : ''} ${r.an ? '' : 'ausgeblendet'}`}>
                <span className="titel">
                  <Hervorgehoben teile={titel} text={r.titel} />
                  <PaketChip
                    paket={r.herkunft === 'ablago' ? 'ablago' : paketId(r) ? { id: paketId(r)!, name: r.paketName } : null}
                    inLink
                  />
                </span>
                <span className="unter">
                  {unterzeile(r)}
                  {!r.an && <> · {t('werkbank.rundgaenge.ui.aus')}</>}
                </span>
                {r.fehler && <span className="problem">{t('werkbank.rundgaenge.ui.ungueltig')}</span>}
                <Fundstellen funde={funde.filter((f) => f.wo !== t('werkbank.rundgaenge.ui.fund.herkunft'))} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** Rechts: neuer, eigener (bearbeiten) oder fremder Rundgang (ansehen). */
export function RundgaengeRechts({ z, schluessel }: { z: RundgaengeZustand; schluessel?: string }) {
  if (!schluessel)
    return (
      <div className="platzhalter">
        <p>{t('werkbank.rundgaenge.ui.waehlen')}</p>
      </div>
    );
  if (!z.stand)
    return z.fehler ? (
      <div className="leer">
        <p>{z.fehler}</p>
      </div>
    ) : (
      <p className="leise">{t('werkbank.rundgaenge.ui.lade')}</p>
    );
  if (schluessel === 'neu') {
    const kopie = new URLSearchParams(location.search).get('kopie');
    const vorlage = kopie ? z.stand.rundgaenge.find((r) => r.schluessel === kopie) : undefined;
    return <RundgangEditor key={`neu-${vorlage?.schluessel ?? ''}`} z={z} stand={z.stand} kopieVon={vorlage} />;
  }
  const r = z.stand.rundgaenge.find((x) => x.schluessel === schluessel);
  if (!r)
    return (
      <div className="leer">
        <p>{t('werkbank.rundgaenge.fehler.gibt-es-nicht')}</p>
      </div>
    );
  return r.herkunft === EIGEN ? <RundgangEditor key={r.schluessel} z={z} stand={z.stand} rundgang={r} /> : <FremderRundgang z={z} r={r} />;
}

/** Kopf: Titel, Herkunft und – für Gespeichertes – an/aus für alle (wirkt sofort). */
function Kopf({ z, r, titel }: { z: RundgaengeZustand; r?: WerkbankRundgang; titel: string }) {
  return (
    <div className="mappenkopf">
      <p className="ueber">{t('werkbank.rundgaenge.ui.titel')}</p>
      <div className="zeile-zwischen">
        <h1>{titel}</h1>
        {r && (
          <Schalter
            an={r.an}
            beschriftung={t('werkbank.rundgaenge.ui.schalter')}
            beschriftungVerbergen
            setze={async (an) => {
              await rundgaengeApi.schalten(r.schluessel, an);
              await z.laden();
            }}
          />
        )}
      </div>
      {r && (
        <p className="leise">
          {herkunftText(r)} · {unterzeile(r)}
        </p>
      )}
      {r && !r.an && <p className="leise klein">{t('werkbank.rundgaenge.ui.schalter.aus')}</p>}
    </div>
  );
}

/** Rundgang von Ablago oder aus einem Paket: Datei zum Ansehen, ausprobieren, als eigenen kopieren. */
function FremderRundgang({ z, r }: { z: RundgaengeZustand; r: WerkbankRundgang }) {
  const [meldung, setMeldung] = useState<string>();
  return (
    <div className="einspaltig">
      <Kopf z={z} r={r} titel={r.titel} />
      {meldung && (
        <div className="hinweis schlecht" role="status">
          <p>{meldung}</p>
        </div>
      )}
      <div className="blatt stapel">
        <p>{r.beschreibung}</p>
        <NurLesenFeld
          beschriftung={t('werkbank.rundgaenge.ui.datei')}
          herkunft={
            r.herkunft === 'ablago'
              ? t('werkbank.rundgaenge.ui.datei.ablago')
              : t('werkbank.rundgaenge.ui.datei.paket', { paket: herkunftText(r) })
          }
          symbol={r.herkunft === 'ablago' ? 'info' : 'paket'}
          breit>
          {/* Rollt die Datei, erreicht man sie mit der Tastatur (#1290, axe scrollable-region-focusable). */}
          <pre className="yaml-datei" tabIndex={0} role="region" aria-label={t('werkbank.rundgaenge.ui.datei')}>
            {r.yaml}
          </pre>
        </NurLesenFeld>
        <div className="knoepfe">
          <KnopfLink to={`${RUNDGAENGE_PFAD}/neu?kopie=${encodeURIComponent(r.schluessel)}`} art="haupt">
            {t('werkbank.rundgaenge.ui.kopieren')}
          </KnopfLink>
          <Knopf onClick={async () => setMeldung(await probieren(r.yaml))} title={t('werkbank.rundgaenge.ui.ausprobieren.titel')}>
            {t('werkbank.rundgaenge.ui.ausprobieren')}
          </Knopf>
        </div>
      </div>
    </div>
  );
}

/** Prüfen und im neuen Fenster nur für mich starten; liefert eine Meldung, wenn das nicht geht. */
async function probieren(yaml: string): Promise<string | undefined> {
  try {
    const p = await rundgaengeApi.pruefen(yaml);
    if (p.fehler.length || !p.rundgang) return t('werkbank.rundgaenge.fehler.pruefung');
    return starteProbe(p.rundgang, p.pfad) ? undefined : t('werkbank.rundgaenge.ui.fenster.blockiert');
  } catch (x) {
    return (x as Error).message;
  }
}

/** Kopie eines fremden Rundgangs: eigene starten nie von selbst. */
const alsKopie = (yaml: string) => yaml.replace(/^start: .*$/m, 'start: manuell');

function RundgangEditor({
  z,
  stand,
  rundgang,
  kopieVon,
}: {
  z: RundgaengeZustand;
  stand: WerkbankRundgaengeStand;
  rundgang?: WerkbankRundgang;
  kopieVon?: WerkbankRundgang;
}) {
  const neu = !rundgang;
  const start = rundgang?.yaml ?? (kopieVon ? alsKopie(kopieVon.yaml) : t('werkbank.rundgaenge.ui.vorlage'));
  const [basis, setBasis] = useState(start);
  const [text, setText] = useState(start);
  // Gleichzeitig bearbeiten (#917): der Stand, auf dem diese Bearbeitung beruht.
  const [stand917, setStand917] = useState(rundgang?.geaendert);
  const [fehler, setFehler] = useState<ZeilenFehler[] | null>(null);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const [sendet, setSendet] = useState(false);
  const feld = useRef<HTMLTextAreaElement>(null);
  const zuruecksetzen = () => {
    setText(rundgang?.yaml ?? start);
    setBasis(rundgang?.yaml ?? start);
    setStand917(rundgang?.geaendert);
    setFehler(null);
    setMeldung(undefined);
  };
  const ent = useEntwurf(basis, text, { neu, liste: RUNDGAENGE_PFAD, zuruecksetzen });

  // Anker an der Schreibmarke einsetzen (Ankerhilfe und „Ziel zeigen“).
  const einsetzen = (anker: string) => {
    const el = feld.current;
    const von = el?.selectionStart ?? text.length,
      bis = el?.selectionEnd ?? von;
    setText(text.slice(0, von) + anker + text.slice(bis));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(von + anker.length, von + anker.length);
    });
  };
  // Zur Zeile eines Fehlers springen.
  const zurZeile = (zeile: number) => {
    const el = feld.current;
    if (!el) return;
    const pos = text
      .split('\n')
      .slice(0, zeile - 1)
      .reduce((n, z2) => n + z2.length + 1, 0);
    el.focus();
    el.setSelectionRange(pos, pos);
  };

  async function pruefen() {
    try {
      const p = await rundgaengeApi.pruefen(text);
      setFehler(p.fehler);
      setMeldung(p.fehler.length ? undefined : { art: 'gut', text: t('werkbank.rundgaenge.ui.geprueft') });
    } catch (x) {
      setMeldung({ art: 'schlecht', text: (x as Error).message });
    }
  }
  async function speichern() {
    setSendet(true);
    setMeldung(undefined);
    try {
      const p = await rundgaengeApi.pruefen(text);
      setFehler(p.fehler);
      if (p.fehler.length) return;
      const r = neu ? await rundgaengeApi.neu(text) : await rundgaengeApi.aendern(lokal(rundgang.schluessel), text, stand917);
      await z.laden();
      loeseWache();
      setBasis(text);
      setStand917(r.geaendert);
      if (neu || `${EIGEN}:${r.schluessel}` !== rundgang?.schluessel) {
        geheZu(pfad(`${EIGEN}:${r.schluessel}`), true);
        return;
      }
      setMeldung({ art: 'gut', text: t('werkbank.rundgaenge.ui.gespeichert') });
    } catch (x) {
      setMeldung({ art: 'schlecht', text: (x as Error).message });
      if ((x as { status?: number }).status === 409) await z.laden();
    } finally {
      setSendet(false);
    }
  }

  return (
    <form
      className="einspaltig"
      onSubmit={(x) => {
        x.preventDefault();
        void speichern();
      }}
      onKeyDown={ent.tasten}
      noValidate>
      <Kopf
        z={z}
        r={rundgang}
        titel={
          rundgang
            ? rundgang.titel
            : kopieVon
              ? t('werkbank.rundgaenge.ui.kopie', { titel: kopieVon.titel })
              : t('werkbank.rundgaenge.ui.neuer')
        }
      />
      {meldung && (
        <div className={`hinweis ${meldung.art}`} role="status">
          <p>{meldung.text}</p>
        </div>
      )}
      {rundgang?.fehler && !fehler && (
        <div className="hinweis schlecht">
          <p>{t('werkbank.rundgaenge.ui.ungueltig')}</p>
        </div>
      )}
      <div className="blatt rundgang-editor">
        <div className="rundgang-datei">
          <FeldGruppe
            beschriftung={t('werkbank.rundgaenge.ui.datei')}
            hinweis={t('werkbank.rundgaenge.ui.datei.hinweis')}
            fehler={fehler?.length ? <ZeilenFehlerListe fehler={fehler} zurZeile={zurZeile} /> : undefined}>
            <textarea
              ref={feld}
              className="yaml-datei"
              value={text}
              spellCheck={false}
              rows={24}
              aria-label={t('werkbank.rundgaenge.ui.datei')}
              aria-invalid={fehler?.length ? true : undefined}
              onChange={(e) => {
                setText(e.target.value);
                setFehler(null);
              }}
            />
          </FeldGruppe>
          <div className="knoepfe">
            <Knopf onClick={() => void pruefen()}>{t('werkbank.rundgaenge.ui.pruefen')}</Knopf>
            <Knopf
              onClick={async () => {
                const m = await probieren(text);
                if (m) setMeldung({ art: 'schlecht', text: m });
              }}
              title={t('werkbank.rundgaenge.ui.ausprobieren.titel')}>
              {t('werkbank.rundgaenge.ui.ausprobieren')}
            </Knopf>
            <Knopf
              onClick={() => {
                if (!zielZeigen()) setMeldung({ art: 'schlecht', text: t('werkbank.rundgaenge.ui.fenster.blockiert') });
                else void holeAnker().then((a) => a && einsetzen(a));
              }}
              title={t('werkbank.rundgaenge.ui.ziel-zeigen.titel')}>
              {t('werkbank.rundgaenge.ui.ziel-zeigen')}
            </Knopf>
          </div>
        </div>
        <AnkerHilfe anker={stand.anker} typen={stand.typen} bereiche={stand.bereiche} einsetzen={einsetzen} />
        <Speicherleiste
          ent={ent}
          gegenstand={t('werkbank.rundgaenge.ui.gegenstand')}
          sendet={sendet}
          speicherbar={!!kopieVon}
          loeschen={
            !neu
              ? {
                  text: t('werkbank.rundgaenge.ui.loeschen'),
                  rueckfrage: {
                    titel: t('werkbank.rundgaenge.ui.loeschen.frage'),
                    text: rundgang.titel,
                    ja: t('werkbank.rundgaenge.ui.loeschen'),
                  },
                  onClick: async () => {
                    await rundgaengeApi.loeschen(lokal(rundgang.schluessel));
                    await z.laden();
                    loeseWache();
                    geheZu(RUNDGAENGE_PFAD, true);
                  },
                }
              : undefined
          }
        />
      </div>
    </form>
  );
}

/** Fehler der Prüfung mit Zeile; ein Klick auf die Zeile setzt die Schreibmarke dorthin. */
function ZeilenFehlerListe({ fehler, zurZeile }: { fehler: ZeilenFehler[]; zurZeile(zeile: number): void }) {
  return (
    <ul className="zeilenfehler">
      {fehler.map((f, i) => (
        <li key={i}>
          {f.zeile !== null && (
            <>
              <Knopf onClick={() => zurZeile(f.zeile!)}>{t('werkbank.rundgaenge.ui.zeile', { zeile: f.zeile })}</Knopf>:{' '}
            </>
          )}
          {f.text}
        </li>
      ))}
    </ul>
  );
}
