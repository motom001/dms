import { fuelleErgebnis, PLATZHALTER, restMinuten, type LasttestLiveStand, type LasttestStand } from '../../shared/src/lasttest';
import type { Messpunkt } from '../../shared/src/systemlast';
import { einrichtungApi } from './api/einrichtung';
import { t } from './sprache';
import { gebietsschema } from '../../shared/src/sprache';
import { CpuKachel, SpeicherKachel } from './werkbank/Auslastung';
import { platz } from './werkbank/Speicherplatz';
import { useLasttest } from './lasttestseite/useLasttest';
import { Angaben, Ende, Ergebnis, LaufStand, zahl } from './lasttestseite/teile';
import { Ablauf } from './lasttestseite/ablauf';

/**
 * Lasttest-Modus (#612): die einzige Seite, die ein mit DMS_LASTTEST gestartetes DMS zeigt. Fortschritt und Restdauer,
 * Gerät und Speicher (gehen sofort in den Ergebnisblock), am Ende Bericht und Block zum Kopieren oder Herunterladen,
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

/** Durchgang mit Gleichzeitigkeit; vor den Durchgängen (#1117) „–“ mit dem laufenden Schritt. */
const durchgangText = (j: LasttestLiveStand['jetzt'], schritt: LasttestStand['schritt']) =>
  j.name === null
    ? t('lasttest.live.durchgang.keiner', { schritt: t.frei(`lasttest.schritt.${schritt}`) })
    : t('lasttest.live.durchgang.wert', { name: j.name, n: zahl(j.n ?? 0) });

/**
 * Live während des Laufs (#895): CPU und Arbeitsspeicher wie Werkbank → Systemzustand → Auslastung (dieselben Kacheln),
 * dazu Durchgang, Gleichzeitigkeit, p95 der letzten Sekunden, Warteschlange an der Datenbank, CPU je Gruppe und die
 * neuesten Warnungen und Fehler. Alles aus der Messung, die der Test ohnehin alle 2 Sekunden macht – seit #1117 schon
 * ab dem Einrichten; vor den Durchgängen steht statt des Durchgangs der Schritt, p95 bleibt „–“.
 */
function Live({ l, stufe, schritt }: { l: LasttestLiveStand; stufe: LasttestStand['stufe']; schritt: LasttestStand['schritt'] }) {
  const j = l.jetzt;
  const vorDemDurchgang = j.name === null;
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
        <div className="az-wert">
          <h3 className="az-titel">{t('lasttest.live.messung')}</h3>
          <dl className="eigenschaften klein">
            {stufe && (
              <>
                <dt>{t('lasttest.live.stufe')}</dt>
                <dd>{t.frei(`lasttest.stufe.${stufe}`)}</dd>
              </>
            )}
            <dt>{t('lasttest.live.durchgang')}</dt>
            <dd>{durchgangText(j, schritt)}</dd>
            <dt>{t('lasttest.live.p95')}</dt>
            <dd>{j.p95 === null ? '–' : t('lasttest.live.p95.wert', { ms: zahl(j.p95), anfragen: zahl(j.anfragen) })}</dd>
            <dt>{t('lasttest.live.warteschlange')}</dt>
            <dd>
              {j.warteschlange === null
                ? nv
                : t('lasttest.live.warteschlange.wert', {
                    wartend: zahl(j.warteschlange),
                    belegt: zahl(j.belegt ?? 0),
                    von: zahl(j.verbindungen ?? 0),
                  })}
            </dd>
          </dl>
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

/** Überschrift nennt die Auswahl (#1251), die laufende Stufe steht eindeutig benannt darunter. */
function Kopf({ stand, laeuft }: { stand: LasttestStand; laeuft: boolean }) {
  return (
    <>
      <h1>
        {stand.wahl === 'alle'
          ? t('lasttest.titel.alle')
          : t('lasttest.titel.eine', { stufe: t.frei(`lasttest.stufe.name.${stand.wahl}`) })}
      </h1>
      <Version wert={stand.version} />
      {laeuft && stand.stufe && (
        <p className="lasttest-laufend">
          <strong>
            {t('lasttest.stufe.laufend', { name: t.frei(`lasttest.stufe.name.${stand.stufe}`), nr: stand.nr, von: stand.von })}
          </strong>{' '}
          – {t.frei(`lasttest.stufe.zweck.${stand.stufe}`)}
        </p>
      )}
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
  const textDatei = stand.ergebnis ? `${stand.ergebnis.bericht}\n\n### ${t('lasttest.ergebnis')}\n\n${block}\n` : '';
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

  // Reihenfolge (#1251): Solange der Test läuft, steht „Beschreibe dein Gerät“ gleich unter der Überschrift – das ist das
  // Erste, was man tun soll; danach rückt das Ergebnis nach oben. Darunter Stand und Ablauf als Tabelle, solange er läuft
  // dann der Platz für das Ergebnis und die Live-Werte.
  const laeuft = zustand === 'laeuft';
  const angabenTeil = (
    <Angaben stand={stand} angaben={angaben} zustand={zustand} setGeraet={l.setGeraet} setSpeicher={l.setSpeicher} merke={merke} />
  );
  const ergebnisTeil = (
    <Ergebnis
      stand={stand}
      block={block}
      zeile={zeile}
      kopiert={kopiert}
      setKopiert={l.setKopiert}
      feld={l.feld}
      textDatei={textDatei}
      setGesichert={l.setGesichert}
    />
  );
  return (
    <div className="kartenseite">
      <div className="karte breit lasttest">
        <Kopf stand={stand} laeuft={laeuft} />
        {laeuft ? angabenTeil : ergebnisTeil}
        <p className="leise">{t('lasttest.unter')}</p>

        <LaufStand stand={stand} zustand={zustand} jetzt={jetzt} rest={rest} mitAblauf={!!stand.ablauf} />
        {fehler && (
          <div className="hinweis schlecht">
            <p>{fehler}</p>
          </div>
        )}
        {!laeuft && angabenTeil}
        {stand.ablauf && <Ablauf ablauf={stand.ablauf} stand={stand} jetzt={jetzt} />}
        {laeuft && ergebnisTeil}
        {laeuft && stand.live && <Live l={stand.live} stufe={stand.stufe} schritt={stand.schritt} />}

        {/* Ergebnis an Stelle des Knopfs (#697): nach der Rückfrage der Abschluss – er bleibt stehen, auch wenn der Server
            nicht mehr antwortet (das Herunterfahren ist ja gewollt; es wird nichts mehr abgefragt). */}
        <Ende zustand={zustand} herunterfahren={herunterfahren} beendenText={beendenText} />
      </div>
    </div>
  );
}
