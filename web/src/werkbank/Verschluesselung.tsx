import { useCallback, useEffect, useState } from 'react';
import { api, type TresorStatus } from '../api';
import { useKonto } from '../konto';
import { Link } from '../ort';
import { Notfallblatt } from './Sicherung';
import { Hilfe } from '../Hilfe';

/**
 * Schlüssel für verschlüsselte Zugangsdaten (#39): Status, Fingerabdruck, Erzeugen
 * und die Liste der Werte, die (noch) nicht lesbar sind.
 */

const GEAENDERT = 'dms:tresor';
const melde = () => dispatchEvent(new Event(GEAENDERT));

export function useTresor(aktiv = true) {
  const [stand, setStand] = useState<TresorStatus | null>(null);
  const [fehler, setFehler] = useState<string>();
  const laden = useCallback(async () => {
    try { setStand(await api.tresor()); setFehler(undefined); } catch (e) { setFehler((e as Error).message); }
  }, []);
  useEffect(() => {
    if (!aktiv) return;
    void laden();
    addEventListener(GEAENDERT, laden);
    return () => removeEventListener(GEAENDERT, laden);
  }, [aktiv, laden]);
  return { stand, setStand, fehler, laden };
}
export type TresorZustand = ReturnType<typeof useTresor>;

const TEXT: Record<TresorStatus['zustand'], string> = {
  vorhanden: 'vorhanden',
  fehlt: 'fehlt',
  verloren: 'verloren',
  falsch: 'passt nicht',
};

/** Banner über der ganzen Werkbank, solange etwas mit dem Schlüssel nicht stimmt. */
export function TresorBanner() {
  const { stand } = useTresor();
  if (!stand || (stand.zustand === 'vorhanden' && stand.eingebunden !== false && !stand.betroffen.length)) return null;
  let text;
  if (stand.zustand === 'fehlt') text = <><strong>Es gibt noch keinen Schlüssel für Passwörter.</strong> Bis dahin lassen sich keine Passwörter speichern (E-Mail-Versand, Passwortfelder).</>;
  else if (stand.zustand === 'verloren') text = <><strong>Der Schlüssel für Passwörter fehlt.</strong> Gespeicherte Passwörter sind nicht lesbar. Lege die Schlüsseldatei zurück oder erzeuge einen neuen Schlüssel und gib die Passwörter neu ein.</>;
  else if (stand.zustand === 'falsch') text = <><strong>Die Schlüsseldatei passt nicht zu den gespeicherten Passwörtern.</strong> Passwörter lassen sich erst wieder lesen und speichern, wenn die richtige Datei da ist.</>;
  else if (stand.eingebunden === false) text = <><strong>Die Schlüsseldatei liegt nicht auf einem eigenen Volume.</strong> Wird der Container neu erstellt (z. B. beim Update), ist sie weg.</>;
  else text = <><strong>{stand.betroffen.length === 1 ? 'Ein Passwort ist' : `${stand.betroffen.length} Passwörter sind`} nicht lesbar oder unverschlüsselt.</strong></>;
  return (
    <div className="hinweisbanner" role="alert">
      <p>{text}</p>
      <Link to="/werkbank/verschluesselung" className="knopf klein">Zur Verschlüsselung</Link>
    </div>
  );
}

export function TresorListe({ t }: { t: TresorZustand }) {
  const s = t.stand;
  return (
    <>
      <div className="listenkopf"><div><h1>Verschlüsselung</h1><p className="leise klein">Schlüssel für Passwörter, die das DMS speichert. <Hilfe ort="werkbank.verschluesselung" /></p></div></div>
      {s && (
        <ul className="mappenliste">
          <li><a className="eintrag werk" href="#schluessel">
            <span className="titel">Schlüssel</span>
            <span className="unter">{s.fingerabdruck ?? 'keiner'}</span>
            <span><span className={`chip ${s.zustand === 'vorhanden' ? 'gut' : 'schlecht'}`}>{TEXT[s.zustand]}</span></span>
          </a></li>
          <li><a className="eintrag werk" href="#betroffen">
            <span className="titel">Nicht lesbare Werte</span>
            <span className="unter">{s.betroffen.length ? `${s.betroffen.length} neu einzugeben` : 'keine'}</span>
          </a></li>
        </ul>
      )}
    </>
  );
}

export function TresorPanel({ t }: { t: TresorZustand }) {
  const { aktualisieren } = useKonto();
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const [wechsel, setWechsel] = useState<{ alt: string; neu: string; umgeschluesselt: number; unlesbar: number; alteSicherungen: number }>();
  const [gesichert, setGesichert] = useState<string>();
  if (t.fehler) return <div className="hinweis schlecht"><p>{t.fehler}</p></div>;
  const s = t.stand;
  if (!s) return <p className="leise">Lade …</p>;

  async function erzeugen() {
    setLaeuft(true); setMeldung(undefined);
    try { t.setStand(await api.tresorErzeugen()); melde(); await aktualisieren(); setMeldung({ art: 'gut', text: 'Schlüssel erzeugt. Passwörter lassen sich jetzt speichern.' }); }
    catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); }
    finally { setLaeuft(false); }
  }
  const erzeugbar = s.zustand === 'fehlt' || s.zustand === 'verloren';

  async function wechseln() {
    if (!confirm('Schlüssel jetzt wechseln?\n\nAlle gespeicherten Passwörter werden mit einem neuen Schlüssel verschlüsselt – ganz oder gar nicht. Danach brauchst du ein neues Notfallblatt. Ältere Sicherungen bleiben mit dem bisherigen Schlüssel verschlüsselt: Bewahre das alte Notfallblatt auf, solange du sie brauchst.')) return;
    setLaeuft(true); setMeldung(undefined); setWechsel(undefined);
    try { const r = await api.tresorWechseln(); t.setStand(r); setWechsel(r); melde(); await aktualisieren(); }
    catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); }
    finally { setLaeuft(false); }
  }

  return (
    <div className="einspaltig">
      <div className="mappenkopf">
        <p className="ueber">Werkbank</p>
        <h1>Verschlüsselung</h1>
        <p className="leise">Passwörter (E-Mail-Versand, Passwortfelder in Mappen) speichert das DMS verschlüsselt. Den Schlüssel dazu hält es in einer eigenen Datei, nie in der Datenbank.</p>
      </div>

      <section className="blatt" id="schluessel">
        <h2 className="h3">Schlüssel <Hilfe ort="verschluesselung.schluessel" /></h2>
        <dl className="eigenschaften">
          <dt>Zustand</dt><dd><span className={`chip ${s.zustand === 'vorhanden' ? 'gut' : 'schlecht'}`}>{TEXT[s.zustand]}</span></dd>
          <dt>Fingerabdruck</dt><dd className="mono">{s.fingerabdruck ?? '–'}</dd>
          {s.erwartet && s.erwartet !== s.fingerabdruck && <><dt>Erwartet</dt><dd className="mono">{s.erwartet}</dd></>}
          {s.erstellt && <><dt>Erzeugt am</dt><dd>{new Date(s.erstellt).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })}</dd></>}
          <dt>Datei</dt><dd className="mono">{s.datei}</dd>
          <dt>Eigenes Volume</dt><dd>{s.eingebunden === null ? 'nicht feststellbar (läuft nicht im Container)' : s.eingebunden ? 'ja' : 'nein'}</dd>
        </dl>

        {s.zustand === 'fehlt' && <div className="hinweis warn"><p>Noch kein Schlüssel. Solange er fehlt, lassen sich keine Passwörter speichern.</p></div>}
        {s.zustand === 'verloren' && (
          <div className="hinweis schlecht stapel">
            <p><strong>Der Schlüssel mit dem Fingerabdruck <span className="mono">{s.erwartet}</span> fehlt.</strong> Liegt die Datei noch in einer Sicherung, lege sie wieder unter <span className="mono">{s.datei}</span> ab und starte das DMS neu – dann sind alle Passwörter wieder lesbar.</p>
            <p>Erzeugst du stattdessen einen neuen Schlüssel, sind die bisher gespeicherten Passwörter verloren und müssen neu eingegeben werden (Liste unten).</p>
          </div>
        )}
        {s.zustand === 'falsch' && (
          <div className="hinweis schlecht"><p>Unter <span className="mono">{s.datei}</span> liegt ein anderer Schlüssel (<span className="mono">{s.fingerabdruck}</span>) als der, mit dem die Passwörter verschlüsselt sind (<span className="mono">{s.erwartet}</span>). Lege die richtige Datei ab und starte das DMS neu. Ist sie verloren, entferne die falsche Datei, starte neu und erzeuge hier einen neuen Schlüssel.</p></div>
        )}
        {s.eingebunden === false && (
          <div className="hinweis warn"><p>Der Ordner <span className="mono">{s.datei.replace(/\/[^/]+$/, '')}</span> ist kein eigenes Volume. Ergänze in der docker-compose.yml unter <span className="mono">volumes</span> z. B. <span className="mono">- /volume1/docker/dms/geheim:{s.datei.replace(/\/[^/]+$/, '')}</span>, sonst geht der Schlüssel beim nächsten Update verloren.</p></div>
        )}
        <div className="hinweis info stapel">
          <p><strong>Sichere die Schlüsseldatei getrennt von der Datenbank.</strong> Eine Datenbanksicherung lässt sich nur mit diesem Schlüssel vollständig wiederherstellen; ohne ihn sind die Passwörter darin nicht lesbar. Liegen beide zusammen, schützt die Verschlüsselung die Sicherung nicht.</p>
        </div>
        {meldung && <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">{meldung.text}</p>}
        {erzeugbar && (
          <div className="knoepfe">
            <button className="knopf primaer" disabled={laeuft} onClick={() => {
              if (s.zustand === 'verloren' && !confirm('Die bisher gespeicherten Passwörter werden damit endgültig unlesbar. Neuen Schlüssel erzeugen?')) return;
              void erzeugen();
            }}>{laeuft ? 'Erzeuge …' : s.zustand === 'verloren' ? 'Neuen Schlüssel erzeugen' : 'Schlüssel erzeugen'}</button>
          </div>
        )}
      </section>

      {s.zustand === 'vorhanden' && (
        <section className="blatt" id="wechseln">
          <h2 className="h3">Schlüssel wechseln <Hilfe ort="verschluesselung.wechseln" /></h2>
          <p className="leise">Wenn der Schlüssel bekannt geworden sein könnte – etwa weil ein ausgedrucktes Notfallblatt verloren ging – oder du ihn turnusmäßig erneuern willst. Alle Passwörter werden mit einem neuen Schlüssel verschlüsselt, ganz oder gar nicht; bricht etwas ab, gilt weiter der bisherige. Der alte Schlüssel wird nicht aufbewahrt.</p>
          {!wechsel && <div className="knoepfe"><button type="button" className="knopf gefahr-rand" disabled={laeuft} onClick={() => void wechseln()}>{laeuft ? 'Wechsle …' : 'Schlüssel wechseln'}</button></div>}
          {wechsel && (
            <div className="hinweis gut stapel" role="status">
              <p><strong>Schlüssel gewechselt:</strong> <span className="mono">{wechsel.alt}</span> → <span className="mono">{wechsel.neu}</span>. {wechsel.umgeschluesselt === 1 ? 'Ein Wert wurde' : `${wechsel.umgeschluesselt} Werte wurden`} neu verschlüsselt{wechsel.unlesbar ? `; ${wechsel.unlesbar} waren schon vorher nicht lesbar und bleiben es` : ''}.</p>
              <p><strong>Jetzt noch zwei Schritte:</strong></p>
              <ol>
                <li>Das <a href="#notfallblatt" className="verweis">neue Notfallblatt</a> herunterladen und sicher aufbewahren.</li>
                <li>Eine neue Sicherung anlegen – sie ist mit dem neuen Schlüssel verschlüsselt. <button type="button" className="knopf klein" disabled={!!gesichert} onClick={() => void api.sicherungJetzt().then(() => setGesichert('Sicherung läuft – den Stand siehst du unter Sicherung.')).catch((x) => setGesichert((x as Error).message))}>Jetzt sichern</button>{gesichert && <span className="leise klein"> {gesichert} <Link to="/werkbank/sicherung" className="verweis">Zur Sicherung</Link></span>}</li>
              </ol>
              {wechsel.alteSicherungen > 0 && <p>{wechsel.alteSicherungen === 1 ? 'Eine ältere Sicherung ist' : `${wechsel.alteSicherungen} ältere Sicherungen sind`} noch mit dem alten Schlüssel verschlüsselt. Bewahre das alte Notfallblatt auf, solange du sie brauchst – oder lösche sie unter <Link to="/werkbank/sicherung" className="verweis">Sicherung</Link>.</p>}
            </div>
          )}
        </section>
      )}

      <Notfallblatt stand={s.notfallblatt} schluessel={s.zustand === 'vorhanden'} geladen={() => void t.laden()} />

      <section className="blatt" id="betroffen">
        <h2 className="h3">Nicht lesbare oder unverschlüsselte Werte</h2>
        {!s.betroffen.length
          ? <p className="leise">Keine – alle gespeicherten Passwörter sind mit dem vorhandenen Schlüssel lesbar.</p>
          : <ul className="liste-einfach">{s.betroffen.map((b, i) => <li key={i}><strong>{b.bereich}:</strong> {b.was}{b.wo ? <span className="leise"> – {b.wo}</span> : null}</li>)}</ul>}
      </section>
    </div>
  );
}
