import { darfVerwalten } from '../../../shared/src/verwaltungsrecht';
import { useEffect, useRef, useState } from 'react';
import { datumDe, type Termin } from '../../../shared/src/fristen';
import { t, tn } from '../sprache';
import { aufgabenApi } from '../api/aufgaben';
import { mappenApi } from '../api/mappen';
import { useDaten } from '../daten';
import { useHandbuch } from '../Hilfe';
import { Listenkopf } from '../Listenkopf';
import { useKonto } from '../konto';
import { Link } from '../ort';
import { titelOder } from '../seiten';
import { neuePost } from './NeuePost';
import { istTouch, postFotografieren } from './PostKamera';
import { AnsichtSymbol, Symbol } from '../Symbol';
import { darfPostAnlegen } from '../../../shared/src/model';
import { gebietsschema } from '../../../shared/src/sprache';
import { sichtName } from '../../../shared/src/beschriftung';
import { Kachel, Kacheln, Knopf } from '../bausteine';

/**
 * Startseite der Ablage (#334), ruhig seit #1219: Begrüßung, vier Kacheln mit je einer Zahl und „Zuletzt geöffnet“.
 * Gesucht wird im Feld oben in der Kopfzeile (#1218); Fragen, Tipp des Tages und Handbuch stehen im Assistenten unten
 * rechts (#1219). Die Kacheln (Baustein Kachel, #1271) sind einheitlich neutral, nur die Zahl steht in der Akzentfarbe;
 * grün mit Haken nur, wenn leer „erledigt“ heißt – „Noch keine Favoriten“ steht leise (#1271).
 * Zu erledigen, Neue Post, Nächster Termin (#725, öffnet den Monat), eine wählbare Kachel (Favoriten oder eine Ansicht) und
 * „Zuletzt geöffnet“ (daneben „Alle anzeigen ›“ öffnet die Liste der letzten 25, #940). In einer leeren
 * Installation stattdessen drei Einstiege.
 * Abschalten und Kachel wählen: im Profil (Einstellungen „startseite“, „startseite_kachel“).
 *
 * Ohne geöffnete Mappe nutzt sie Mitte und rechten Bereich zusammen (#429, `breit`): ein Raster,
 * in dem jede Kachel einen festen Schlüssel (`data-kachel`) hat – Grundlage dafür, sie später
 * frei anzuordnen (#421). Mit geöffneter Mappe steht sie wie jede Liste in der Mitte.
 */
type Startdaten = { zuletzt: Array<{ id: string; typId: string; titel: string; am: string | null }>; leer: boolean };

/** Kachel „Nächster Termin“ (#725): Datum und Mappe des nächsten Termins; öffnet den Monat in „Zu erledigen“. */
function TerminKachel({ z }: { z: { termin: Termin | null; ueberfaellig: number } | null }) {
  const d = useDaten();
  const zumMonat = () => {
    if (d.einstellungen.erledigen_ansicht !== 'monat' && d.einstellungen.erledigen_ansicht !== 'jahr')
      d.setzeEinstellung('erledigen_ansicht', 'monat');
  };
  const x = z?.termin;
  return (
    <Kachel
      name="termin"
      anker="startseite.termin"
      vorher={zumMonat}
      to="/ablage/eingang"
      titel={t('termine.kachel')}
      wert={!z ? null : x ? datumDe(x.datum) : 0}
      leer={t('termine.kachel.leer')}
      leerGut
      unter={x && `${t.frei(`termine.art.${x.art}`)}: ${titelOder(x.mappeTitel)}`}
      zusatz={!!z?.ueberfaellig && t('termine.kachel.ueberfaellig', { anzahl: z.ueberfaellig })}
    />
  );
}

export function Startseite({ offen, breit = false }: { offen?: string; breit?: boolean }) {
  const d = useDaten();
  const { ich } = useKonto();
  const handbuch = useHandbuch();
  const heute = new Date().toLocaleDateString(gebietsschema(), { weekday: 'long', day: 'numeric', month: 'long' });
  const [daten, setDaten] = useState<Startdaten | null>(null);
  const datei = useRef<HTMLInputElement>(null);
  // Von selbst nachgeladen (#919, `d.frisch`): ruhig wechseln. Die alten Werte bleiben stehen, bis die neuen da sind;
  // ein Fehler beim Nachladen lässt sie stehen. „Zuletzt geöffnet“ sortiert nicht unter dem Mauszeiger oder dem Fokus um.
  const zuletzt = useRef<HTMLElement>(null);
  const zurueck = useRef<Startdaten | null>(null);
  const startStand = useRef(-1);
  useEffect(() => {
    let aktuell = true;
    // Gleicher `stand`, anderes `frisch`: nachgeladen, nicht neu aufgebaut.
    const nachgeladen = startStand.current === d.stand;
    startStand.current = d.stand;
    mappenApi.startseite().then(
      (x) => {
        if (!aktuell) return;
        if (nachgeladen && zuletzt.current?.matches(':hover, :focus-within')) zurueck.current = x;
        else {
          zurueck.current = null;
          setDaten(x);
        }
      },
      () => {
        if (aktuell && !nachgeladen) setDaten({ zuletzt: [], leer: false });
      },
    );
    return () => {
      aktuell = false;
    };
  }, [d.stand, d.frisch]);
  const loslassen = () => {
    if (zurueck.current) {
      setDaten(zurueck.current);
      zurueck.current = null;
    }
  };
  // Nächster Termin (#725): eigene Aufgaben mit Datum, Erinnerungen, Fristen an lesbaren Mappen.
  const [termin, setTermin] = useState<{ termin: Termin | null; ueberfaellig: number } | null>(null);
  const terminStand = useRef(-1);
  useEffect(() => {
    let aktuell = true;
    const nachgeladen = terminStand.current === d.stand;
    terminStand.current = d.stand;
    aufgabenApi.naechsterTermin().then(
      (x) => {
        if (aktuell) setTermin(x);
      },
      () => {
        if (aktuell && !nachgeladen) setTermin({ termin: null, ueberfaellig: 0 });
      },
    );
    return () => {
      aktuell = false;
    };
  }, [d.stand, d.frisch]);

  const postSicht = d.zaehler.neuePost ? d.sicht(d.zaehler.neuePost) : undefined;
  // Zahlen kommen nach (#512): bis dahin „…“ in der Kachel.
  const z = (n: number) => (d.zahlenDa ? n : null);
  const wahl = typeof d.einstellungen.startseite_kachel === 'string' ? d.einstellungen.startseite_kachel : 'favoriten';
  const lieblings = wahl !== 'favoriten' ? d.sicht(wahl) : undefined;
  const postTyp = d.typen.find((mappentyp) => mappentyp.system === 'post');
  const kamera = istTouch() && darfPostAnlegen(postTyp) && !!postTyp?.register.some((r) => r.art === 'dokumente');

  return (
    <>
      <Listenkopf titel={t('ablage.startseite.gruss', { name: ich.name?.split(/\s+/)[0] || ich.email })} beschreibung={heute} />
      <div className={`listenrumpf startseite${breit ? ' start-breit' : ''}`}>
        {/* Handy (#490): mit einem Tipp in die Kamera – mehrseitig, ein PDF, eine Post. Nur mit Touch. */}
        {kamera && (
          <Knopf art="haupt" className="pk-start" onClick={() => postFotografieren()}>
            {tn('ablage.startseite.post-fotografieren', { symbol: <Symbol name="kamera" /> })}
          </Knopf>
        )}
        {daten?.leer ? (
          <div className="einstiege">
            <p>{t('ablage.startseite.noch-ist-die-ablage')}</p>
            {/* Kachel als Sonderform des Knopfs (#1269); eigener Baustein „Kachel“ folgt in #1270. */}
            <Knopf art="eigen" className="kachel post" onClick={() => datei.current?.click()}>
              <span className="kacheltitel">{t('ablage.startseite.erste-post-ablegen')}</span>
              <span className="kachelunter">{t('ablage.startseite.brief-scannen-oder-fotografieren')}</span>
            </Knopf>
            <input
              ref={datei}
              type="file"
              multiple
              hidden
              accept="application/pdf,image/*"
              onChange={(e) => {
                neuePost([...(e.target.files ?? [])]);
                e.target.value = '';
              }}
            />
            {/* #818: Wer verwalten darf, kommt darüber in den Verwaltungsmodus. */}
            {(ich.rolle === 'admin' || darfVerwalten(ich)) && (
              <Link to="/werkbank/pakete" className="kachel ruhig">
                <span className="kacheltitel">{t('ablage.startseite.paket-haushalt-installieren')}</span>
                <span className="kachelunter">{t('ablage.startseite.fertige-mappentypen-fuer-konten')}</span>
              </Link>
            )}
            <a href={handbuch('benutzer', 'erste-schritte/')} target="_blank" rel="noreferrer" className="kachel ruhig">
              <span className="kacheltitel">{t('ablage.startseite.hilfe-so-faengst-du')}</span>
              <span className="kachelunter">{t('ablage.startseite.die-ersten-schritte-im')}</span>
            </a>
          </div>
        ) : (
          <Kacheln className="start-raster">
            <Kachel
              name="eingang"
              anker="startseite.zu-erledigen"
              to="/ablage/eingang"
              titel={t('ablage.startseite.zu-erledigen')}
              wert={z(d.zaehler.eingang)}
              leer={t('ablage.startseite.nichts-zu-erledigen')}
              leerGut
              unter={t('ablage.startseite.aufgaben-und-mappen-an')}
            />
            {postSicht && (
              <Kachel
                name="post"
                anker="startseite.neue-post"
                to={`/ablage/${postSicht.id}`}
                titel={sichtName(postSicht)}
                wert={z(d.zaehler.sichten?.[postSicht.id] ?? 0)}
                leer={t('ablage.startseite.keine-neue-post')}
                leerGut
                unter={t('ablage.startseite.noch-nicht-zugeordnet')}
              />
            )}
            <TerminKachel z={termin} />
            {lieblings ? (
              <Kachel
                name="wahl"
                to={`/ablage/${lieblings.id}`}
                titel={
                  lieblings.symbol ? (
                    <>
                      <AnsichtSymbol name={lieblings.symbol} /> {lieblings.name}
                    </>
                  ) : (
                    lieblings.name
                  )
                }
                wert={z(d.zaehler.sichten?.[lieblings.id] ?? 0)}
                leer={t('ablage.startseite.leer')}
              />
            ) : (
              <Kachel
                name="wahl"
                to="/ablage/favoriten"
                titel={t('ablage.startseite.favoriten')}
                wert={z(d.zaehler.favoriten ?? 0)}
                leer={t('ablage.startseite.noch-keine-der-stern')}
              />
            )}
          </Kacheln>
        )}
        {daten && daten.zuletzt.length > 0 && (
          <section
            className="zuletzt"
            data-kachel="zuletzt"
            ref={zuletzt}
            aria-labelledby="zuletzt-titel"
            onPointerLeave={loslassen}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) loslassen();
            }}>
            {/* #940, #1219: eine normale Überschrift, daneben ein Link zur Liste der letzten 25. */}
            <div className="zl-kopf">
              <h2 id="zuletzt-titel" className="h3">
                {t('ablage.startseite.zuletzt-geoeffnet')}
              </h2>
              <Link to="/ablage/zuletzt" className="verweis klein" anker="startseite.zuletzt">
                {t('ablage.startseite.alle-anzeigen')}
              </Link>
            </div>
            <ul className="mappenliste">
              {daten.zuletzt.map((m) => (
                <li key={m.id}>
                  <Link to={`/ablage/start/${m.id}`} className={`eintrag ${offen === m.id ? 'an' : ''}`}>
                    <span className="titel">{titelOder(m.titel)}</span>
                    <span className="unter">{d.typ(m.typId)?.name ?? ''}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}
