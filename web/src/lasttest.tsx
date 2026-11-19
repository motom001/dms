import {
  fuelleErgebnis,
  ganzesErgebnis,
  PLATZHALTER,
  restMinuten,
  verbindungenProzent,
  type LasttestLiveStand,
  type LasttestStand,
} from '../../shared/src/lasttest';
import type { Messpunkt } from '../../shared/src/systemlast';
import { einrichtungApi } from './api/einrichtung';
import { t } from './sprache';
import { gebietsschema } from '../../shared/src/sprache';
import { AnteilKachel, CpuKachel, SpeicherKachel } from './werkbank/Auslastung';
import { platz } from './werkbank/Speicherplatz';
import { useLasttest } from './lasttestseite/useLasttest';
import { Angaben, Ende, Ergebnis, ergaenzenAus, LaufStand, zahl } from './lasttestseite/teile';
import { Ablauf } from './lasttestseite/ablauf';

/**
 * Lasttest-Modus (#612): die einzige Seite, die ein mit DMS_LASTTEST gestartetes DMS zeigt. Fortschritt und Restdauer,
 * Gerät und Speicher (gehen sofort in den Ergebnisblock), am Ende ein Ergebnis (#1452) zum Kopieren oder Herunterladen,
 * Links zum Formular und zum Sammel-Issue und der Knopf zum Herunterfahren. Keine Zugangsdaten, keine Adressen.
 * Seit #1279 in Teilen: Stand (lasttestseite/useLasttest.ts) und Abschnitte (lasttestseite/teile.tsx).
 */

/** `<Dauer>` im Text einer Meldung (#909): höchste und mittlere Dauer, bei gleichen nur eine. */
const mitDauer = (text: string, d?: { max: number; mittel: number }) =>
  !text.includes('<Dauer>')
    ? text
    : text.replace(
        '<Dauer>',
        !d
          ? t('lasttest.live.dauer.ohne')
          : d.max === d.mittel
            ? t('lasttest.live.dauer.eine', { ms: zahl(d.max) })
            : t('lasttest.live.dauer', { max: zahl(d.max), mittel: zahl(d.mittel) }),
      );

const MB = 1024 ** 2;
const uhr = (iso: string) => new Date(iso).toLocaleTimeString(gebietsschema(), { timeStyle: 'medium' });

/**
 * Live während des Laufs (#895): CPU und Arbeitsspeicher wie Werkbank → Systemzustand → Auslastung (dieselben Kacheln),
 * seit #1452 als dritte Kurve die belegten Datenbank-Verbindungen mit den wartenden Abfragen darunter; dazu p95 der
 * letzten Sekunden, CPU je Gruppe und die neuesten Warnungen und Fehler. Stufe und Durchgang stehen im Ablauf. Alles aus
 * der Messung, die der Test ohnehin alle 2 Sekunden macht – seit #1117 schon ab dem Einrichten; vor den Durchgängen
 * bleibt p95 „–“.
 */
function Live({ l }: { l: LasttestLiveStand }) {
  const j = l.jetzt;
  const vorDemDurchgang = j.name === null;
  const db = verbindungenProzent(j.belegt, j.verbindungen);
  const verlauf: Messpunkt[] = l.verlauf.map((p) => ({ zeit: p.zeit, cpu: p.cpu, speicher: p.speicher, rx: null, tx: null }));
  const nv = t('systemzustand.auslastung.nicht-verfuegbar');
  const gruppe = (g: NonNullable<typeof j.gruppen>[number]) =>
    g.art !== 'ablago'
      ? t.frei(`lasttest.gruppe.${g.art}`)
      : g.nr === 0
        ? t('lasttest.gruppe.haupt')
        : g.rolle === 'leiter'
          ? t('lasttest.gruppe.leiter', { nr: g.nr ?? 1 })
          : t('lasttest.gruppe.prozess', { nr: g.nr ?? 0 });
  return (
    <section className="lasttest-live" aria-labelledby="lasttest-live">
      <h2 id="lasttest-live">{t('lasttest.live.titel')}</h2>
      <p className="klein leise">{t(vorDemDurchgang ? 'lasttest.live.text.vorbereitung' : 'lasttest.live.text', { zeit: uhr(j.zeit) })}</p>
      <div className="az-raster">
        <CpuKachel jetzt={j.cpu} verlauf={verlauf} art="live">
          <p className="leise klein">
            {j.kerne === null
              ? nv
              : j.kerneBegrenzt
                ? t('systemzustand.cpu.kerne', { anzahl: j.kerne })
                : t('systemzustand.cpu.kerne.ohne', { anzahl: j.kerne })}
          </p>
        </CpuKachel>
        <SpeicherKachel jetzt={j.speicher} verlauf={verlauf} art="live">
          <p className="leise klein">
            {j.speicherMb === null || j.grenzeMb === null
              ? nv
              : j.ohneGrenze
                ? t('systemzustand.speicher.ohne-grenze', { belegt: platz(j.speicherMb * MB), grenze: platz(j.grenzeMb * MB) })
                : t('systemzustand.speicher.belegt', { belegt: platz(j.speicherMb * MB), grenze: platz(j.grenzeMb * MB) })}
          </p>
        </SpeicherKachel>
        <AnteilKachel titel={t('lasttest.live.datenbank')} jetzt={db} verlauf={l.verlauf} wert={(p) => p.db ?? null} art="live">
          <p className="leise klein">
            {j.warteschlange === null
              ? nv
              : t('lasttest.live.warteschlange.wert', {
                  wartend: zahl(j.warteschlange),
                  belegt: zahl(j.belegt ?? 0),
                  von: zahl(j.verbindungen ?? 0),
                })}
          </p>
        </AnteilKachel>
        {/* p95 der letzten Sekunden (#1452 geprüft): zeigt, wie schnell Ablago gerade antwortet – im Ablauf steht p95
            erst, wenn der Durchgang fertig ist. */}
        <div className="az-wert">
          <h3 className="az-titel">
            {t('lasttest.live.p95')}{' '}
            <span className="az-jetzt">
              {j.p95 === null ? '–' : t('lasttest.live.p95.wert', { ms: zahl(j.p95), anfragen: zahl(j.anfragen) })}
            </span>
          </h3>
          <p className="leise klein">{t('lasttest.live.p95.wofuer')}</p>
        </div>
      </div>
      <h3 className="az-titel">{t('lasttest.live.gruppen')}</h3>
      {!j.gruppen ? (
        <p className="klein leise">{t('lasttest.live.gruppen.nicht')}</p>
      ) : (
        <div className="tabellenrahmen">
          <table className="tabelle klein">
            <thead>
              <tr>
                <th>{t('lasttest.live.gruppe')}</th>
                <th>{t('lasttest.live.prozesse')}</th>
                <th>{t('lasttest.live.cpu')}</th>
                <th>{t('lasttest.live.speicher')}</th>
              </tr>
            </thead>
            <tbody>
              {j.gruppen.map((g) => (
                <tr key={`${g.art}-${g.nr ?? ''}`}>
                  <td>{gruppe(g)}</td>
                  <td>{zahl(g.anzahl)}</td>
                  <td>{g.cpu === null ? '–' : `${zahl(g.cpu)} %`}</td>
                  <td>{platz(g.mb * MB)}</td>
                </tr>
              ))}
              {j.postgresExtern && !j.gruppen.some((g) => g.art === 'postgres') && (
                <tr>
                  <td>{t('lasttest.gruppe.postgres')}</td>
                  <td colSpan={3} className="leise">
                    {t('lasttest.live.postgres-extern')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <p className="klein leise">{t('lasttest.live.gruppen.text')}</p>
      <h3 className="az-titel">{t('lasttest.live.meldungen')}</h3>
      {!j.meldungen.length ? (
        <p className="klein leise">{t('lasttest.live.meldungen.keine')}</p>
      ) : (
        <ul className="klein lasttest-meldungen">
          {j.meldungen.map((m, i) => (
            <li key={i}>
              <span className={`lasttest-art ${m.stufe === 'warn' ? 'warn' : 'fehler'}`}>{t.frei(`lasttest.live.art.${m.stufe}`)}</span>{' '}
              {t('lasttest.live.meldung', { anzahl: zahl(m.anzahl), modul: m.modul, text: mitDauer(m.text, m.dauer), zeit: uhr(m.letzte) })}
              {m.ausnahme ? ` (${m.ausnahme})` : ''}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** #1117: welcher Container misst – im Kopf, von Anfang an und auch nach „Beenden“. */
function Version({ wert }: { wert?: string }) {
  return wert ? <p className="klein leise">{t('lasttest.version', { version: wert })}</p> : null;
}

/** Überschrift nennt die Auswahl (#1251); darunter nur die Version (#1452: die laufende Stufe zeigt der Ablauf). */
function Kopf({ stand }: { stand: LasttestStand }) {
  return (
    <>
      <h1>
        {stand.wahl === 'alle'
          ? t('lasttest.titel.alle')
          : t('lasttest.titel.eine', { stufe: t.frei(`lasttest.stufe.name.${stand.wahl}`) })}
      </h1>
      <Version wert={stand.version} />
    </>
  );
}

export function LasttestSeite() {
  const l = useLasttest();
  const { stand, fehler, geraet, speicher, kopiert, beendet, gesichert, senden, geholt } = l;
  if (!stand) {
    return (
      <div className="kartenseite">
        <div className="karte breit">
          <h1>{t('lasttest.titel')}</h1>
          {fehler ? (
            <div className="hinweis schlecht">
              <p>{fehler}</p>
            </div>
          ) : (
            <p className="leise">{t('anmeldung.lade')}</p>
          )}
        </div>
      </div>
    );
  }

  // Eingaben gehen sofort in den Block; der Server bekommt sie kurz danach (für die Datei unter /data/ergebnis).
  const angaben = { geraet: geraet ?? stand.angaben.geraet, speicher: speicher === undefined ? stand.angaben.speicher : speicher };
  const merke = (a: Partial<LasttestStand['angaben']>) => {
    clearTimeout(senden.current);
    senden.current = setTimeout(() => {
      void einrichtungApi.lasttestAngaben(a).catch(() => {});
    }, 400);
  };
  const block = stand.ergebnis ? fuelleErgebnis(stand.ergebnis.vorlage, angaben, stand.speicherErkannt) : '';
  const zeile = fuelleErgebnis(`${PLATZHALTER.geraet}\n${PLATZHALTER.speicher}`, angaben, stand.speicherErkannt).split('\n');
  const jetzt = stand.jetzt + (Date.now() - geholt.current);
  const rest = restMinuten({ ...stand, jetzt });
  const zustand = beendet ? 'beendet' : stand.zustand;
  // Ein Ergebnis (#1452): Block oben, Bericht darunter – so wird es gezeigt, kopiert und heruntergeladen.
  const text = stand.ergebnis ? ganzesErgebnis(block, stand.ergebnis.bericht) : '';
  async function herunterfahren() {
    try {
      await einrichtungApi.lasttestBeenden();
      l.setBeendet(true);
      l.setFehler(undefined);
    } catch (e) {
      l.setFehler((e as Error).message);
    }
  }
  // Herunterfahren ist Gefahr (#1215): immer mit Rückfrage. Läuft der Test noch, fällt alles weg; ist das Ergebnis
  // noch nicht kopiert oder heruntergeladen, sagt die Rückfrage das (#697).
  const beendenText =
    zustand === 'laeuft'
      ? t('lasttest.beenden.frage.laeuft')
      : stand.ergebnis && kopiert !== 'ja' && !gesichert
        ? t('lasttest.beenden.ungesichert')
        : t('lasttest.beenden.frage.fertig');

  // Feste Reihenfolge (#1452), die sich beim Wechsel von „läuft“ auf „fertig“ nicht umbaut: Kopf → Stand → Gerät und
  // Speicher → Ergebnis (der Platz ist von Anfang an da, solange es läuft mit Hinweis) → Ablauf → Jetzt gemessen.
  const laeuft = zustand === 'laeuft';
  return (
    <div className="kartenseite">
      <div className="karte breit lasttest">
        <Kopf stand={stand} />
        <LaufStand stand={stand} zustand={zustand} jetzt={jetzt} rest={rest} mitAblauf={!!stand.ablauf} />
        {fehler && (
          <div className="hinweis schlecht">
            <p>{fehler}</p>
          </div>
        )}
        <Angaben stand={stand} angaben={angaben} zustand={zustand} setGeraet={l.setGeraet} setSpeicher={l.setSpeicher} merke={merke} />
        <Ergebnis
          stand={stand}
          text={text}
          zeile={zeile}
          ergaenzen={ergaenzenAus(angaben)}
          kopiert={kopiert}
          setKopiert={l.setKopiert}
          setGesichert={l.setGesichert}
        />
        {stand.ablauf && <Ablauf ablauf={stand.ablauf} stand={stand} jetzt={jetzt} />}
        {laeuft && stand.live && <Live l={stand.live} />}
        <p className="leise">{t('lasttest.unter')}</p>

        {/* Ergebnis an Stelle des Knopfs (#697): nach der Rückfrage der Abschluss – er bleibt stehen, auch wenn der Server
            nicht mehr antwortet (das Herunterfahren ist ja gewollt; es wird nichts mehr abgefragt). */}
        <Ende zustand={zustand} herunterfahren={herunterfahren} beendenText={beendenText} />
      </div>
    </div>
  );
}
