import { Etikett, Feld, HakenFeld, Knopf } from '../../bausteine';
import { Angehalten } from './angehalten';
import { Beschaedigt } from './beschaedigt';
import {
  hatNetz,
  hatSchnittstelle,
  herkunftText,
  istKiPaket,
  KATALOG_LINK_REL,
  katalogSeiteMitVersion,
} from '../../../../shared/src/pakete';
import type { InstalliertesPaket } from '../../../../shared/src/pakete';
import { fragtPaketdatenAn } from '../../../../shared/src/paketdaten';
import { sprachname } from '../../../../shared/src/beschriftung';
import { paketeApi } from '../../api/pakete';
import { useDaten } from '../../daten';
import { Hilfe } from '../../Hilfe';
import { geheZu, Link } from '../../ort';
import { t as tx, t, tn } from '../../sprache';
import { Symbol } from '../../Symbol';
import { VektorStandBlock } from '../../ablage/Aehnlich';
import { KlassifizierenBlock } from '../ErkennungPaket';
import { KiTypenZeile } from '../KiTypen';
import { PaketAblauf } from '../PaketAblauf';
import { PaketAnzeigen } from '../PaketAnzeigen';
import { PaketDatenZeile } from '../PaketDaten';
import type { PaketeZustand } from '../paketeZustand';
import { Kurzanleitung } from '../PaketMitkommt';
import { PaketUmwandeln } from '../PaketUmwandeln';
import { LaeuferUebersicht } from '../PaketVerlauf';
import { Herausgeber, MeldungBox, SprachHerkunft, VorschauBlock } from '../PaketVorschau';
import { usePaketDetail, type DetailZustand } from './detail-zustand';
import { datum } from './pfade';
import { MitFlaeche, PaketReiterBlock } from './reiter';
import { BietetAn, bietetAn } from '../mitgeliefert/wer-macht';
import type { MitgeliefertZustand } from '../mitgeliefert/zustand';
import { ErgaenzungenBlock, fertigText, LizenzAngabe, PaketMitkommt } from './teile';

/**
 * Seite eines Pakets (#188; #1279 aus Pakete.tsx gezogen): Kopf, Reiter (#996), Übersicht mit Angaben, Zusätzen der
 * Pakete mit Code, „Gehört dazu“, Knöpfen, Entfernen, „Was mitkommt“, Ablauf zum Installieren und Update-Vorschau.
 */

/** Installiert und aktualisiert – wann und von wem. */
function Installation({ x }: { x: DetailZustand }) {
  const { inst } = x;
  return (
    <>
      {inst && (
        <>
          <dt>{t('werkbank.pakete.installiert')}</dt>
          <dd>
            {t('werkbank.pakete.version-4', {
              version: inst.version,
              datum: datum(inst.installiert),
              wert: inst.installiertVon ? t('werkbank.pakete.von-2', { installiertVon: inst.installiertVon }) : '',
            })}
          </dd>
        </>
      )}
      {inst?.aktualisiert && (
        <>
          <dt>{t('werkbank.pakete.aktualisiert')}</dt>
          <dd>
            {datum(inst.aktualisiert)}
            {inst.aktualisiertVon ? t('werkbank.pakete.von-3', { aktualisiertVon: inst.aktualisiertVon }) : ''}
          </dd>
        </>
      )}
    </>
  );
}

/** Herkunft und Stand im Katalog. */
function Herkunft({ x }: { x: DetailZustand }) {
  const { inst, aus, kp, neuer } = x;
  return (
    <>
      <dt>{t('werkbank.pakete.herkunft')}</dt>
      <dd>
        {inst
          ? herkunftText(inst.herkunft)
          : aus?.offiziell
            ? t('werkbank.pakete.offizieller-katalog-2')
            : t('werkbank.pakete.katalog', { url: String(aus?.url) })}
      </dd>
      {kp && (
        <>
          <dt>{t('werkbank.pakete.im-katalog')}</dt>
          <dd>
            {t('werkbank.pakete.version-5', { aktuell: kp.aktuell })}
            {neuer && (
              <>
                {' '}
                · <strong>{t('werkbank.pakete.neuer-als-installiert')}</strong>
              </>
            )}
          </dd>
        </>
      )}
    </>
  );
}

/** Lizenz (#651) und Autor mit GitHub-Namen. */
function Lizenz({ x }: { x: DetailZustand }) {
  const { inst, kp } = x;
  const autor = inst?.autor ?? kp?.autor;
  return (
    <>
      <dt>{t('werkbank.pakete.lizenz')}</dt>
      <dd>
        <LizenzAngabe lizenz={inst?.lizenz ?? kp?.lizenz ?? ''} />
      </dd>
      <dt>{t('werkbank.pakete.autor')}</dt>
      <dd>
        {autor?.name}
        {autor?.github && (
          <>
            {' '}
            (
            <a className="verweis" href={`https://github.com/${autor.github}`} target="_blank" rel="noreferrer">
              @{autor.github}
            </a>
            )
          </>
        )}
      </dd>
    </>
  );
}

/** Nötige Ablago-Version, Sprachpaket (#731) und Abhängigkeiten der gewählten Version. */
function VersionUndSprache({ z, x }: { z: PaketeZustand; x: DetailZustand }) {
  const { inst, v } = x;
  return (
    <>
      {v && (
        <>
          <dt>{t('werkbank.pakete.noetige-ablago-version')}</dt>
          <dd>{tn('werkbank.pakete.dieser-installation-2', { dms: v.dms, dms2: z.stand?.dms })}</dd>
        </>
      )}
      {/* Sprachpaket (#731): Sprache und wie übersetzt – aus dem Katalog bzw. vom installierten Paket. */}
      {(inst?.sprache || v?.sprache) && (
        <>
          <dt>{t('werkbank.pakete.sprache')}</dt>
          <dd>
            {inst?.sprache
              ? t('werkbank.pakete.sprache.info', {
                  sprache: sprachname(inst.sprache.kennung),
                  prozent: inst.spracheAbdeckung ?? '–',
                  ablago: inst.sprache.ablago,
                })
              : sprachname(v!.sprache!.kennung)}
            <SprachHerkunft
              maschinell={(inst?.sprache ?? v!.sprache!).maschinell}
              geprueftVon={(inst?.sprache ?? v!.sprache!).geprueftVon}
            />
          </dd>
        </>
      )}
      {v && (
        <>
          <dt>{t('werkbank.pakete.abhaengigkeiten')}</dt>
          <dd>
            {Object.keys(v.abhaengigkeiten).length
              ? Object.entries(v.abhaengigkeiten)
                  .map(([k, b]) => `${k} ${b}`)
                  .join(', ')
              : t('werkbank.pakete.keine')}
          </dd>
        </>
      )}
    </>
  );
}

/** README, Änderungen und – nur für Pakete aus dem offiziellen Katalog – die Paketseite dort (#622). */
function Mehr({ z, x, id }: { z: PaketeZustand; x: DetailZustand; id: string }) {
  const { inst, v, imKatalog } = x;
  const readme = v?.readme || inst?.links?.readme;
  const changelog = v?.changelog || inst?.links?.changelog;
  if (!readme && !imKatalog) return null;
  return (
    <>
      <dt>{t('werkbank.pakete.mehr')}</dt>
      <dd>
        {readme && (
          <a className="verweis" href={readme} target="_blank" rel="noreferrer">
            {t('werkbank.pakete.readme')}
          </a>
        )}
        {changelog && (
          <>
            {' '}
            ·{' '}
            <a className="verweis" href={changelog} target="_blank" rel="noreferrer">
              {t('werkbank.pakete.aenderungen')}
            </a>
          </>
        )}
        {/* Paketseite im offiziellen Katalog mit der Ablago-Version nur im Fragment (#622). */}
        {imKatalog && (
          <>
            {readme && ' · '}
            <a
              className="verweis"
              href={katalogSeiteMitVersion(z.stand?.dms ?? '', id)}
              target="_blank"
              rel={KATALOG_LINK_REL}
              title={tx('pakete.katalog.hinweis')}>
              {tx('pakete.katalog.ansehen')} <Symbol name="extern" />
            </a>
          </>
        )}
      </dd>
    </>
  );
}

/** Was Pakete mit Code zeigen: Läufer, Anzeigen (code.anzeigen bzw. Statusbereich), dann die Zusätze des Codes. */
function Zusaetze({ x }: { x: DetailZustand }) {
  const { inst, r } = x;
  if (!inst) return null;
  const l = inst.laeufer;
  return (
    <>
      {l && <LaeuferUebersicht inst={inst} zumVerlauf={() => r.zu('verlauf')} />}
      {/* Nur, wenn das Paket etwas meldet (code.anzeigen) oder einen Statusbereich hat (Einstellungen im Manifest). */}
      {(!!l?.reiter?.anzeigen?.length || !!inst.einstellungen) && <PaketAnzeigen paket={inst.id} />}
      {l && <CodeZusaetze id={inst.id} l={l} r={r} />}
    </>
  );
}

/** Vektoren, Klassifizieren, KI-Typen (#796, #996) und Paketdaten (#1054) – je nach Schnittstellen des Codes. */
function CodeZusaetze({ id, l, r }: { id: string; l: NonNullable<InstalliertesPaket['laeufer']>; r: DetailZustand['r'] }) {
  return (
    <>
      {hatSchnittstelle(l, 'dms:vektoren') && <VektorStandBlock />}
      {hatSchnittstelle(l, 'dms:klassifizieren') && <KlassifizierenBlock netz={hatNetz(l)} />}
      {/* KI-Dienste (#796, #996): nur, aus wie vielen Mappentypen das Paket Inhalte bekommt – zulassen in den Einstellungen. */}
      {istKiPaket(l) && (
        <>
          <h2 className="h3">{t('pakete.ki.titel')}</h2>
          <KiTypenZeile paket={id} aendern={() => r.zu('einstellungen', 'pakete.ki-typen')} />
        </>
      )}
      {/* Einrichtung und Nachweise (#1054): hier nur, was freigegeben ist – anhaken in den Einstellungen. */}
      {fragtPaketdatenAn(l) && <PaketDatenZeile paket={id} aendern={() => r.zu('einstellungen', 'pakete.paketdaten')} />}
    </>
  );
}

/** Mappentypen und Ansichten des Pakets – gelöschte leise. */
function GehoertDazu({ x }: { x: DetailZustand }) {
  const { inst } = x;
  const d = useDaten();
  return (
    <>
      {inst && (Object.keys(inst.typen).length > 0 || Object.keys(inst.sichten).length > 0) && (
        <>
          <h2 className="h3">{t('werkbank.pakete.gehoert-dazu')}</h2>
          <ul className="klein">
            {Object.values(inst.typen).map((text) => (
              <li key={text}>
                {tn('werkbank.pakete.mappentyp', {
                  wert: d.typ(text) ? (
                    <Link to={`/werkbank/typen/${text}`} className="verweis">
                      {d.typ(text)!.name}
                    </Link>
                  ) : (
                    <span className="leise">{t('werkbank.pakete.geloescht')}</span>
                  ),
                })}
              </li>
            ))}
            {Object.values(inst.sichten).map((s) => (
              <li key={s}>
                {tn('werkbank.pakete.ansicht', {
                  wert: d.sicht(s) ? (
                    <Link to={`/ablage/${s}`} className="verweis">
                      {d.sicht(s)!.name}
                    </Link>
                  ) : (
                    <span className="leise">{t('werkbank.pakete.geloescht')}</span>
                  ),
                })}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

/** Version wählen, Installieren, Aktualisieren, Beispiele entfernen (#878), Entfernen (mit Einstellungen erst die Wahl, #197). */
function Knoepfe({ x }: { x: DetailZustand }) {
  const { inst, kp, version, setVersion, setVorschau, laeuft, ablauf, katalog, neuer } = x;
  return (
    <div className={`knoepfe${kp && kp.versionen.length > 1 && !inst ? ' feld-buendig' : ''}`}>
      {kp && kp.versionen.length > 1 && !inst && (
        <Feld beschriftung={t('werkbank.pakete.version-6')}>
          <select
            value={version || kp.aktuell}
            onChange={(e) => {
              setVersion(e.target.value);
              setVorschau(null);
            }}>
            {kp.versionen.map((x) => (
              <option key={x.version} value={x.version}>
                {x.version}
              </option>
            ))}
          </select>
        </Feld>
      )}
      {!inst && kp && (
        <Knopf art="haupt" gesperrt={laeuft || ablauf || !katalog} onClick={() => x.setAblauf(true)}>
          {t('werkbank.pakete.installieren')}
        </Knopf>
      )}
      {inst && neuer && (
        <Knopf art="haupt" gesperrt={laeuft} onClick={() => void x.zeigeVorschau(neuer)}>
          {t('werkbank.pakete.auf-aktualisieren', { neuer })}
        </Knopf>
      )}
      {inst && <Entfernen x={x} inst={inst} />}
    </div>
  );
}

/** Beispiele entfernen (#878) und Entfernen – mit Einstellungen erst die Wahl (#197); Hinweis bei hochgeladenen. */
function Entfernen({ x, inst }: { x: DetailZustand; inst: InstalliertesPaket }) {
  const { laeuft, entfernenOffen } = x;
  return (
    <>
      {(inst.beispielMappen?.length ?? 0) > 0 && (
        <Knopf
          art="gefahr"
          symbol="geloescht"
          gesperrt={laeuft}
          onClick={x.beispieleEntfernen}
          rueckfrage={{
            titel: t('werkbank.pakete.beispiele-entfernen.frage', { name: inst.name }),
            text: t('werkbank.pakete.beispiele-entfernen.text'),
            ja: t('werkbank.pakete.beispiele-entfernen'),
          }}>
          {t('werkbank.pakete.beispiele-entfernen')}
        </Knopf>
      )}
      {/* Mit Einstellungen öffnet „Entfernen“ erst die Wahl „Einstellungen behalten“ (#197); entfernt wird dort nach Rückfrage. */}
      {inst.einstellungen ? (
        <Knopf symbol="geloescht" gesperrt={laeuft} aria-expanded={entfernenOffen} onClick={x.entfernen}>
          {t('werkbank.pakete.entfernen')}
        </Knopf>
      ) : (
        <Knopf
          art="gefahr"
          symbol="geloescht"
          gesperrt={laeuft}
          onClick={x.entfernen}
          rueckfrage={{
            titel: t('werkbank.pakete.entfernen-2', { name: inst.name }),
            text: t('werkbank.pakete.seine-mappentypen-und-ansichten'),
            ja: t('werkbank.pakete.entfernen'),
          }}>
          {t('werkbank.pakete.entfernen')}
        </Knopf>
      )}
      {inst.herkunft.art === 'hochgeladen' && <span className="leise klein">{t('werkbank.pakete.ein-hochgeladenes-paket')}</span>}
    </>
  );
}

/** Entfernen mit Einstellungen (#197): Einstellungen für eine spätere Neuinstallation behalten? */
function EntfernenWahl({ x }: { x: DetailZustand }) {
  const { inst, laeuft, behalten } = x;
  if (!x.entfernenOffen || !inst) return null;
  return (
    <div className="hinweis warn" role="dialog" aria-label={t('werkbank.pakete.paket-entfernen')}>
      <p>{t('werkbank.pakete.entfernen-seine-mappentypen-und', { name: inst.name })}</p>
      <HakenFeld beschriftung={t('werkbank.pakete.einstellungen-behalten-fuer-eine')}>
        <input type="checkbox" checked={behalten} onChange={(e) => x.setBehalten(e.target.checked)} />
      </HakenFeld>
      <div className="knoepfe">
        <Knopf
          art="gefahr"
          symbol="geloescht"
          gesperrt={laeuft}
          onClick={x.entfernenBestaetigt}
          rueckfrage={{
            titel: t('werkbank.pakete.entfernen-2', { name: inst.name }),
            text: t('werkbank.pakete.seine-mappentypen-und-ansichten'),
            ja: t('werkbank.pakete.entfernen'),
          }}>
          {t('werkbank.pakete.entfernen')}
        </Knopf>
        <Knopf onClick={() => x.setEntfernenOffen(false)}>{t('werkbank.pakete.abbrechen')}</Knopf>
      </div>
    </div>
  );
}

/** Installieren im gemeinsamen Ablauf (#405) – auch nach der Installation sichtbar, bis „Weiter“. */
function Installieren({ z, x, id }: { z: PaketeZustand; x: DetailZustand; id: string }) {
  const d = useDaten();
  const { kp, aus, version, ablauf, katalog } = x;
  if (!kp || !ablauf || !katalog || !z.stand) return null;
  return (
    <section className="blatt stapel" aria-label={tx('pakete.ablauf.zusammenfassung')}>
      <h2 className="h3">
        {tx('pakete.ablauf.titel', { name: kp.name })} <Hilfe ort="werkbank.pakete.ablauf" />
      </h2>
      <PaketAblauf
        direkt
        quelle={{
          art: 'katalog',
          katalog,
          quelle: aus?.offiziell ? undefined : aus?.url,
          dms: z.stand.dms,
          installiert: z.stand.installiert,
        }}
        start={[id]}
        nur={[id]}
        versionen={version ? { [id]: version } : {}}
        aktionen={<Knopf onClick={() => x.setAblauf(false)}>{t('werkbank.pakete.abbrechen')}</Knopf>}
        geaendert={() => {
          void z.laden();
          void d.neuLaden();
        }}
        fertig={(e) => {
          x.setAblauf(false);
          if (e.installiert.some((x) => x.id === id)) {
            x.setMeldung({ art: 'gut', text: fertigText(e) });
            x.setAnleitungNeu(true);
          }
        }}
      />
    </section>
  );
}

/** Vorschau vor Installieren bzw. Update aus dem Katalog; nach einem Umzug (#1084) zur neuen Id. */
function Update({ x: zustand, id, quelle }: { x: DetailZustand; id: string; quelle?: string }) {
  const { vorschau, offiziell, inst, tu, setVorschau } = zustand;
  if (!vorschau) return null;
  return (
    <VorschauBlock
      v={vorschau}
      warnung={
        offiziell || vorschau.pruefung?.bestaetigen === false
          ? null
          : t('werkbank.pakete.aus-dem-katalog', { wert: String(inst?.herkunft.art === 'katalog' ? inst.herkunft.url : quelle) })
      }
      abbrechen={() => setVorschau(null)}
      los={(x) =>
        tu(async () => {
          if (vorschau.update) {
            const r = await paketeApi.paketAktualisieren(id, vorschau.paket.version, x.bestaetigt, x.rechteBestaetigt, {
              automatisierungen: x.automatisierungen,
              herausgeberBestaetigt: x.herausgeberBestaetigt,
              umbauBestaetigt: x.umbauBestaetigt,
              umbauEntscheidungen: x.umbauEntscheidungen,
              sichtenErsetzen: x.sichtenErsetzen,
            });
            // Umzug (#1084): Das Paket heißt jetzt anders – dorthin.
            if (r.id !== id) geheZu(`/werkbank/pakete/${r.id}`);
            return t('werkbank.pakete.ist-jetzt-auf-version', { name: r.name, version: r.version });
          }
          const r = await paketeApi.paketInstallieren({ id, version: vorschau.paket.version, quelle, ...x });
          return t('werkbank.pakete.ist-installiert', { name: r.name, version: r.version });
        })
      }
    />
  );
}
/** Kopf: „Paket“ (mit Hinweis, wenn nicht vom Ablago-Projekt), Name mit Herausgeber (#1084), Beschreibung. */
function PaketKopf({ x }: { x: DetailZustand }) {
  const { inst, kp, offiziell } = x;
  return (
    <div className="mappenkopf">
      <p className="ueber">
        {t('werkbank.pakete.paket')}
        {!offiziell && (
          <>
            {' '}
            · <Etikett art="warn">{t('werkbank.pakete.nicht-vom-ablago-projekt')}</Etikett>
          </>
        )}
      </p>
      <h1>
        {inst?.name ?? kp!.name}
        <Herausgeber wer={inst?.herausgeber ?? kp?.herausgeber} geprueft={inst ? inst.herausgeberGeprueft : offiziell} />
      </h1>
      <p className="leise">{inst?.beschreibung ?? kp?.beschreibung}</p>
    </div>
  );
}

export function PaketDetail({
  z,
  id,
  quelle,
  mitgeliefert,
}: {
  z: PaketeZustand;
  id: string;
  quelle?: string;
  /** Für den Reiter „Bietet an“ (#1570): Tätigkeiten, die das Paket für Ablago übernehmen kann. */
  mitgeliefert?: MitgeliefertZustand;
}) {
  const x = usePaketDetail(z, id, quelle, bietetAn(mitgeliefert, id).length > 0);
  const { inst, kp, r, meldung, anleitungNeu, setAnleitungNeu, v, aus, katalog } = x;
  if (!inst && !kp)
    return (
      <div className="leer">
        <p>{z.kataloge ? t('werkbank.pakete.dieses-paket-gibt-es') : t('werkbank.pakete.lade')}</p>
        {!z.kataloge && <Knopf onClick={() => z.abrufen()}>{t('werkbank.pakete.katalog-abrufen')}</Knopf>}
      </div>
    );
  return (
    <div className="einspaltig">
      <PaketKopf x={x} />
      <MeldungBox m={meldung} />
      {inst && anleitungNeu && <Kurzanleitung k={inst.kurzanleitung} neu schliessen={() => setAnleitungNeu(false)} />}
      <PaketReiterBlock r={r} inst={inst} z={z} bietetAn={<BietetAn z={mitgeliefert} paket={id} />} />
      {r.reiter === 'uebersicht' && (
        <MitFlaeche an={r.liste.length > 1} wert={r.reiter}>
          <section className="blatt">
            <dl className="eigenschaften">
              <Installation x={x} />
              <Herkunft x={x} />
              <Lizenz x={x} />
              <VersionUndSprache z={z} x={x} />
              <Mehr z={z} x={x} id={id} />
            </dl>
            <Zusaetze x={x} />
            <GehoertDazu x={x} />
            <Beschaedigt x={x} />
            <Angehalten x={x} />
            <Knoepfe x={x} />
            <EntfernenWahl x={x} />
          </section>

          <PaketMitkommt
            inst={inst}
            v={inst ? kp?.versionen.find((x) => x.version === inst.version) : v}
            installiert={z.stand?.installiert ?? []}
          />
          {inst && <PaketUmwandeln key={`${inst.id}|${inst.version}`} paket={inst.id} />}

          <Installieren z={z} x={x} id={id} />
          {inst && katalog && z.stand && (
            <ErgaenzungenBlock z={z} inst={inst} katalog={katalog} quelle={aus?.offiziell ? undefined : aus?.url} />
          )}

          <Update x={x} id={id} quelle={quelle} />
        </MitFlaeche>
      )}
    </div>
  );
}
