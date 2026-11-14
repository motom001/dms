import { useCallback, useEffect, useState } from 'react';
import { api, type Notfallblattstand, type TresorStatus } from '../api';
import { useKonto } from '../konto';
import { Link } from '../ort';
import { Erledigt, NotfallblattGrund, NOTFALLBLATT_URL, meldeSicherung, zeit } from './Sicherung';
import { heikelHerunterladen } from '../verwaltungsmodus';
import { Hilfe } from '../Hilfe';
import { rueckfrage } from '../rueckfrage';
import { t, tn } from '../sprache';
import { gebietsschema } from '../../../shared/src/sprache';
import { Knopf } from '../bausteine';
import { Kopf } from './Kopf';
import { NotfallkontakteAbschnitt } from './Notfallkontakte';

/**
 * Schlüssel für verschlüsselte Zugangsdaten (#39): Status, Fingerabdruck, Erzeugen
 * und die Liste der Werte, die (noch) nicht lesbar sind. Das Notfallblatt (#106, Notfallcode #815) steht seit #993
 * nur hier; Sicherung, Übersicht und Anmeldeschutz verlinken auf den Abschnitt `#notfallblatt`. Darunter die
 * Notfallkontakte (#812) für „Wen fragen?“ – sie gehören zum Notfallblatt.
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
    // laden fängt Fehler selbst ab (fehler); der Ereignis-Handler gibt kein Promise zurück (#1011).
    const neu = () => void laden();
    neu();
    addEventListener(GEAENDERT, neu);
    return () => removeEventListener(GEAENDERT, neu);
  }, [aktiv, laden]);
  return { stand, setStand, fehler, laden };
}
export type TresorZustand = ReturnType<typeof useTresor>;

const TEXT: Record<TresorStatus['zustand'], string> = {
  vorhanden: 'vorhanden',
  fehlt: 'fehlt',
  verloren: 'verloren',
  falsch: t('werkbank.verschluesselung.passt-nicht'),
};

/** Banner über der ganzen Werkbank, solange etwas mit dem Schlüssel nicht stimmt. */
export function TresorBanner() {
  const { stand } = useTresor();
  if (!stand || (stand.zustand === 'vorhanden' && stand.eingebunden !== false && !stand.betroffen.length)) return null;
  let text;
  if (stand.zustand === 'fehlt') text = <>{tn('werkbank.verschluesselung.bis-dahin-lassen-sich', { b: <strong>{t('werkbank.verschluesselung.es-gibt-noch-keinen')}</strong> })}</>;
  else if (stand.zustand === 'verloren') text = <>{tn('werkbank.verschluesselung.gespeicherte-passwoerter-sind-nicht', { b: <strong>{t('werkbank.verschluesselung.der-schluessel-fuer-passwoerter')}</strong> })}</>;
  else if (stand.zustand === 'falsch') text = <>{tn('werkbank.verschluesselung.passwoerter-lassen-sich-erst', { b: <strong>{t('werkbank.verschluesselung.die-schluesseldatei-passt-nicht')}</strong> })}</>;
  else if (stand.eingebunden === false) text = <>{tn('werkbank.verschluesselung.wird-der-container-neu', { b: <strong>{t('werkbank.verschluesselung.die-schluesseldatei-liegt-nicht')}</strong> })}</>;
  else text = <><strong>{t('werkbank.verschluesselung.passwoerter-sind-nicht-lesbar', { anzahl: stand.betroffen.length })}</strong></>;
  return (
    <div className="hinweisbanner" role="alert">
      <p>{text}</p>
      <Link to="/werkbank/verschluesselung" className="knopf klein">{t('werkbank.verschluesselung.zur-verschluesselung')}</Link>
    </div>
  );
}

export function TresorPanel({ t: eintrag }: { t: TresorZustand }) {
  const { aktualisieren } = useKonto();
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const [wechsel, setWechsel] = useState<{ alt: string; neu: string; umgeschluesselt: number; unlesbar: number; alteSicherungen: number }>();
  const [gesichert, setGesichert] = useState<{ ok: boolean; text: string }>();
  const [blattGeladen, setBlattGeladen] = useState(false);
  if (eintrag.fehler) return <div className="hinweis schlecht"><p>{eintrag.fehler}</p></div>;
  const s = eintrag.stand;
  if (!s) return <p className="leise">{t('werkbank.verschluesselung.lade')}</p>;

  async function erzeugen() {
    setLaeuft(true); setMeldung(undefined);
    try { eintrag.setStand(await api.tresorErzeugen()); melde(); await aktualisieren(); setMeldung({ art: 'gut', text: t('werkbank.verschluesselung.schluessel-erzeugt-passwoerter') }); }
    catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); }
    finally { setLaeuft(false); }
  }
  const erzeugbar = s.zustand === 'fehlt' || s.zustand === 'verloren';

  async function wechseln() {
    setLaeuft(true); setMeldung(undefined); setWechsel(undefined);
    try { const r = await api.tresorWechseln(); eintrag.setStand(r); setWechsel(r); melde(); await aktualisieren(); }
    catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); }
    finally { setLaeuft(false); }
  }

  return (
    <div className="einspaltig">
      <Kopf titel={t('werkbank.verschluesselung.verschluesselung')} ueber={t('werkbank.verschluesselung.werkbank')} hilfe="werkbank.verschluesselung">
        <p className="leise">{t('werkbank.verschluesselung.passwoerter-und-andere-geheimnisse')}</p>
      </Kopf>

      <section className="blatt" id="schluessel">
        <h2 className="h3">{t('werkbank.verschluesselung.schluessel')} <Hilfe ort="verschluesselung.schluessel" /></h2>
        <dl className="eigenschaften">
          <dt>{t('werkbank.verschluesselung.zustand')}</dt><dd><span className={`chip ${s.zustand === 'vorhanden' ? 'gut' : 'schlecht'}`}>{TEXT[s.zustand]}</span></dd>
          <dt>{t('werkbank.verschluesselung.fingerabdruck')}</dt><dd className="mono">{s.fingerabdruck ?? '–'}</dd>
          {s.erwartet && s.erwartet !== s.fingerabdruck && <><dt>{t('werkbank.verschluesselung.erwartet')}</dt><dd className="mono">{s.erwartet}</dd></>}
          {s.erstellt && <><dt>{t('werkbank.verschluesselung.erzeugt-am')}</dt><dd>{new Date(s.erstellt).toLocaleString(gebietsschema(), { dateStyle: 'medium', timeStyle: 'short' })}</dd></>}
          <dt>{t('werkbank.verschluesselung.datei')}</dt><dd className="mono">{s.datei}</dd>
          <dt>{t('werkbank.verschluesselung.eigenes-volume')}</dt><dd>{s.eingebunden === null ? t('werkbank.verschluesselung.nicht-feststellbar-laeuft-nicht') : s.eingebunden ? t('werkbank.verschluesselung.ja') : t('werkbank.verschluesselung.nein')}</dd>
        </dl>

        {s.zustand === 'fehlt' && <div className="hinweis warn"><p>{t('werkbank.verschluesselung.noch-kein-schluessel-solange')}</p></div>}
        {s.zustand === 'verloren' && (
          <div className="hinweis schlecht stapel">
            <p>{tn('werkbank.verschluesselung.liegt-die-datei-noch', { b: <strong>{tn('werkbank.verschluesselung.der-schluessel-mit-dem', { span: <span className="mono">{s.erwartet}</span> })}</strong>, span: <span className="mono">{s.datei}</span> })}</p>
            <p>{t('werkbank.verschluesselung.erzeugst-du-stattdessen-einen')}</p>
          </div>
        )}
        {s.zustand === 'falsch' && (
          <div className="hinweis schlecht"><p>{tn('werkbank.verschluesselung.unter-liegt-ein-anderer', { span: <span className="mono">{s.datei}</span>, span2: <span className="mono">{s.fingerabdruck}</span>, span3: <span className="mono">{s.erwartet}</span> })}</p></div>
        )}
        {s.eingebunden === false && (
          <div className="hinweis warn"><p>{tn('werkbank.verschluesselung.der-ordner-ist-kein', { span: <span className="mono">{s.datei.replace(/\/[^/]+$/, '')}</span>, span2: <span className="mono">{t('werkbank.verschluesselung.volumes')}</span>, span3: <span className="mono">{t('werkbank.verschluesselung.volume1-docker-dms-geheim', { replace: s.datei.replace(/\/[^/]+$/, '') })}</span> })}</p></div>
        )}
        <div className="hinweis info stapel">
          <p>{tn('werkbank.verschluesselung.eine-datenbanksicherung-laesst-sich', { b: <strong>{t('werkbank.verschluesselung.sichere-die-schluesseldatei-getrennt')}</strong> })}</p>
        </div>
        {meldung && <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">{meldung.text}</p>}
        {erzeugbar && (
          <div className="knoepfe">
            <Knopf art="haupt" gesperrt={laeuft} onClick={async () => {
              if (s.zustand === 'verloren' && !(await rueckfrage({ titel: t('werkbank.verschluesselung.neuen-schluessel-erzeugen'), text: t('werkbank.verschluesselung.die-bisher-gespeicherten-passwoerter'), ja: t('werkbank.verschluesselung.neuen-schluessel-erzeugen-2'), gefahr: true }))) return;
              void erzeugen();
            }}>{laeuft ? t('werkbank.verschluesselung.erzeuge') : s.zustand === 'verloren' ? t('werkbank.verschluesselung.neuen-schluessel-erzeugen-2') : t('werkbank.verschluesselung.schluessel-erzeugen')}</Knopf>
          </div>
        )}
      </section>

      {s.zustand === 'vorhanden' && (
        <section className="blatt" id="wechseln">
          <h2 className="h3">{t('werkbank.verschluesselung.schluessel-wechseln-2')} <Hilfe ort="verschluesselung.wechseln" /></h2>
          <p className="leise">{t('werkbank.verschluesselung.wenn-der-schluessel-bekannt')}</p>
          {!wechsel && <div className="knoepfe"><Knopf art="gefahr" symbol="neu-laden" laeuft={laeuft} laeuftText={t('werkbank.verschluesselung.wechsle')} onClick={wechseln}
            rueckfrage={{ titel: t('werkbank.verschluesselung.schluessel-jetzt-wechseln'), text: t('werkbank.verschluesselung.alle-gespeicherten-passwoerter-und'), ja: t('werkbank.verschluesselung.schluessel-wechseln'), bestaetigeMit: 'wechseln' }}>{t('werkbank.verschluesselung.schluessel-wechseln')}</Knopf></div>}
          {wechsel && (
            <div className="hinweis gut stapel" role="status">
              <p>{tn('werkbank.verschluesselung.werte-wurden-neu-verschluesselt', { anzahl: wechsel.umgeschluesselt, b: <strong>{t('werkbank.verschluesselung.schluessel-gewechselt')}</strong>, span: <span className="mono">{wechsel.alt}</span>, span2: <span className="mono">{wechsel.neu}</span>, wert: wechsel.unlesbar ? t('werkbank.verschluesselung.waren-schon-vorher-nicht', { unlesbar: wechsel.unlesbar }) : '' })}</p>
              <p><strong>{t('werkbank.verschluesselung.jetzt-noch-zwei-schritte')}</strong></p>
              <ol className="anleitung">
                <li className={blattGeladen ? 'erledigt' : ''}>
                  {blattGeladen && <Erledigt />}{tn('werkbank.verschluesselung.das-neue-notfallblatt-herunterladen', { link: <a className="knopf klein" href={NOTFALLBLATT_URL} download onClick={(e) => void heikelHerunterladen(e, NOTFALLBLATT_URL, () => { setBlattGeladen(true); setTimeout(() => void eintrag.laden(), 1500); setTimeout(meldeSicherung, 1500); })}>{t('werkbank.verschluesselung.notfallblatt-herunterladen')}</a> })}</li>
                <li className={gesichert?.ok ? 'erledigt' : ''}>
                  {gesichert?.ok && <Erledigt />}{t('werkbank.verschluesselung.eine-neue-sicherung-anlegen')}{' '}<Knopf groesse="klein" gesperrt={gesichert?.ok} onClick={() => api.sicherungJetzt().then(() => setGesichert({ ok: true, text: t('werkbank.verschluesselung.sicherung-laeuft-den-stand') })).catch((x) => setGesichert({ ok: false, text: (x as Error).message }))}>{t('werkbank.verschluesselung.jetzt-sichern')}</Knopf>
                  {gesichert && <span className={gesichert.ok ? 'leise klein' : 'fehlertext klein'}> {gesichert.text} <Link to="/werkbank/sicherung" className="verweis">{t('werkbank.verschluesselung.zur-sicherung')}</Link></span>}
                </li>
              </ol>
              {wechsel.alteSicherungen > 0 && <p>{tn('werkbank.verschluesselung.aeltere-sicherungen-sind-noch', { anzahl: wechsel.alteSicherungen, link: <Link to="/werkbank/sicherung" className="verweis">{t('werkbank.verschluesselung.sicherung')}</Link> })}</p>}
            </div>
          )}
        </section>
      )}

      <Notfallblatt stand={s.notfallblatt} schluessel={s.zustand === 'vorhanden'} geladen={() => void eintrag.laden()} />

      <NotfallkontakteAbschnitt geaendert={() => void eintrag.laden()} />

      {s.arten && s.arten.length > 0 && (
        <section className="blatt" id="arten">
          <h2 className="h3">{t('werkbank.verschluesselung.was-verschluesselt-ist')} <Hilfe ort="verschluesselung.arten" /></h2>
          <p className="leise klein">{t('werkbank.verschluesselung.alles-hier-verschluesselt-ablago')}</p>
          <table className="vs-arten">
            <thead><tr><th>{t('werkbank.verschluesselung.art')}</th><th className="vs-zahl">{t('werkbank.verschluesselung.anzahl')}</th></tr></thead>
            <tbody>{s.arten.map((a) => (
              <tr key={a.art}>
                <td>{a.name}</td>
                <td className="vs-zahl">{a.anzahl.toLocaleString(gebietsschema())}{a.unlesbar > 0 && <> <span className="chip schlecht" title={t('werkbank.verschluesselung.mit-dem-vorhandenen-schluessel')}>{t('werkbank.verschluesselung.nicht-lesbar', { unlesbar: a.unlesbar })}</span></>}</td>
              </tr>
            ))}</tbody>
          </table>
        </section>
      )}

      <section className="blatt" id="betroffen">
        <h2 className="h3">{t('werkbank.verschluesselung.nicht-lesbare-oder-unverschluesselte')}</h2>
        {!s.betroffen.length
          ? <p className="leise">{t('werkbank.verschluesselung.keine-alle-gespeicherten-passwoerter')}</p>
          : <ul className="liste-einfach">{s.betroffen.map((b, i) => <li key={i}><strong>{b.bereich}:</strong> {b.was}{b.wo ? <span className="leise"> – {b.wo}</span> : null}</li>)}</ul>}
      </section>
    </div>
  );
}

/** Notfallblatt (#106): herunterladen, Stand, Hinweis nach einem Schlüsselwechsel oder benutztem Notfallcode (#815). */
export function Notfallblatt({ stand, schluessel, geladen }: { stand: Notfallblattstand | null | undefined; schluessel: boolean; geladen(): void }) {
  return (
    <section className="blatt" id="notfallblatt">
      <h2 className="h3">{t('werkbank.sicherung.notfallblatt')} <Hilfe ort="verschluesselung.notfallblatt" /></h2>
      <p>{t('werkbank.notfallblatt.ui.text')}</p>
      {stand?.am && <p className="leise klein">{t('werkbank.sicherung.zuletzt-heruntergeladen', { zeit: zeit(stand.am), wert: stand.von ? t('werkbank.sicherung.von-2', { von: stand.von }) : '' })}</p>}
      {stand && !stand.aktuell && stand.am && <div className="hinweis warn"><p><NotfallblattGrund n={stand} /></p></div>}
      {schluessel && stand && !stand.am && <div className="hinweis warn"><p><strong>{t('werkbank.sicherung.das-notfallblatt-fehlt')}</strong></p></div>}
      {stand?.am && stand.aktuell && stand.kontakteGeaendert && <div className="hinweis warn" role="status"><p>{t('werkbank.notfallkontakte.blatt-neu')}</p></div>}
      <div className="knoepfe">
        {schluessel
          ? <a className="knopf primaer" href={NOTFALLBLATT_URL} download onClick={(e) => void heikelHerunterladen(e, NOTFALLBLATT_URL, () => { setTimeout(geladen, 1500); setTimeout(meldeSicherung, 1500); })}>{t('werkbank.sicherung.notfallblatt-herunterladen-pdf')}</a>
          : <span className="leise">{t('werkbank.sicherung.erst-moeglich-wenn-es')}</span>}
      </div>
    </section>
  );
}
