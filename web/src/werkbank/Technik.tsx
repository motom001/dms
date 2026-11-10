import { Knopf } from '../bausteine';
import { Kopf } from './Kopf';
import { version as reactVersion } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { geraetText } from '../../../shared/src/model';
import { markdownZelle } from '../../../shared/src/maskieren';
import { api, type Systemuebersicht, type Vergleich } from '../api';
import { Hilfe, useHandbuch } from '../Hilfe';
import { useKonto } from '../konto';
import { t, tn } from '../sprache';
import { gebietsschema } from '../../../shared/src/sprache';

/**
 * Technik und Versionen (#15): installierte Komponenten, als Text für ein
 * GitHub-Issue kopierbar, und ein Abgleich mit neueren Versionen auf Knopfdruck.
 */
const groesse = (b: number) => (b < 1024 ** 2 ? `${Math.round(b / 1024)} KB` : b < 1024 ** 3 ? `${(b / 1024 ** 2).toFixed(1).replace('.', ',')} MB` : `${(b / 1024 ** 3).toFixed(2).replace('.', ',')} GB`);
const zeit = (iso: string | null) => (iso ? new Date(iso).toLocaleString(gebietsschema(), { dateStyle: 'medium', timeStyle: 'short' }) : '–');
const STATUS: Record<Vergleich['status'], { text: string; art: string }> = {
  aktuell: { text: t('werkbank.technik.aktuell-2'), art: 'gut' }, neuer: { text: t('werkbank.technik.neueres-verfuegbar'), art: 'warn' },
  veraltet: { text: t('werkbank.technik.nicht-mehr-unterstuetzt'), art: 'stufe-error' }, unbekannt: { text: t('werkbank.technik.unbekannt'), art: '' },
};

type Zeilen = Array<[string, Array<[string, string]>]>;

function zeilenAus(u: Systemuebersicht): Zeilen {
  const db = 'version' in u.datenbank ? u.datenbank : null;
  return [
    ['Ablago', [
      [t('werkbank.technik.version'), u.dms.version],
      [t('werkbank.technik.commit'), u.dms.commit ? u.dms.commit.slice(0, 7) : t('werkbank.technik.unbekannt-lokal-gebaut')],
      [t('werkbank.technik.image-gebaut'), zeit(u.dms.gebaut)],
      [t('werkbank.technik.image'), u.dms.variante === 'komplett' ? t('werkbank.technik.dms-komplett-mit-postgresql') : 'dms'],
    ]],
    [t('werkbank.technik.laufzeit'), [
      ['Node.js', u.laufzeit.node],
      [t('werkbank.technik.betriebssystem'), `${u.laufzeit.system}${u.laufzeit.alpine ? t('werkbank.technik.alpine', { alpine: u.laufzeit.alpine }) : ''}`],
      [t('werkbank.technik.architektur'), u.laufzeit.architektur],
      [t('werkbank.technik.container'), u.laufzeit.container ? t('werkbank.technik.ja') : t('werkbank.technik.nein')],
      [t('werkbank.technik.zeitzone'), u.laufzeit.zeitzone],
      [t('werkbank.technik.laeuft-seit'), zeit(u.laufzeit.laeuftSeit)],
    ]],
    [t('werkbank.technik.datenbank'), db ? [
      ['PostgreSQL', db.version],
      [t('werkbank.technik.ort'), u.dms.variante === 'komplett' ? t('werkbank.technik.im-container-dms-komplett') : t('werkbank.technik.eigener-datenbank-server-bzw')],
      [t('werkbank.technik.groesse'), groesse(db.groesseBytes)],
      [t('werkbank.technik.mappen-mappentypen-benutzer'), `${db.mappen.toLocaleString(gebietsschema())} / ${db.typen} / ${db.benutzer}`],
      [t('werkbank.technik.dokumente'), `${db.dokumente.toLocaleString(gebietsschema())} (${groesse(db.dokumenteBytes)})`],
    ] : [[t('werkbank.technik.fehler'), (u.datenbank as { fehler: string }).fehler]]],
    [t('werkbank.technik.bibliotheken-server'), Object.entries(u.bibliotheken).map(([k, v]) => [k, v ?? t('werkbank.technik.nicht-gefunden')])],
    [t('werkbank.technik.oberflaeche'), [['React', reactVersion], [t('werkbank.technik.browser'), geraetText(navigator.userAgent)]]],
    // Feste Ordner im Container (#115); wohin sie zeigen, bestimmen die Volumes der Compose-Datei.
    [t('werkbank.technik.ordner'), (u.ordner ?? []).map((o): [string, string] => [o.pfad, o.gesamt === null || o.frei === null ? t('werkbank.technik.nicht-messbar') : t('werkbank.technik.belegt-frei-von', { groesse: groesse(o.belegt ?? 0), groesse2: groesse(o.frei), groesse3: groesse(o.gesamt), wert: o.volume === false ? t('werkbank.technik.kein-eigenes-volume') : '' })])],
    [t('werkbank.technik.einstellungen'), [...Object.entries(u.einstellungen), ...(u.variablen ?? []).map((v): [string, string] => [v, t('werkbank.technik.ueberfluessig-aus-der-compose')])]],
  ];
}

/** Markdown für ein GitHub-Issue. */
/** #216: Was der Betreiber selbst aktualisiert – und was mit einem DMS-Update kommt. */
const GRUPPEN = [['selbst', t('werkbank.technik.von-dir-zu-aktualisieren')], ['dms', t('werkbank.technik.kommt-mit-ablago')]] as const;
function gruppiert(abgleich: Vergleich[]): Array<[string, Vergleich[]]> {
  return GRUPPEN.map(([g, titel]) => [titel, abgleich.filter((v) => (v.gruppe ?? 'selbst') === g)]);
}
/** In „Kommt mit dem DMS“ ist Neueres keine Aufgabe für den Betreiber; nicht mehr unterstützt bleibt eine Warnung. */
function statusVon(v: Vergleich): { text: string; art: string } {
  if (v.gruppe === 'dms' && v.status === 'neuer') return { text: t('werkbank.technik.kommt-mit-ablago-update'), art: '' };
  return STATUS[v.status];
}
const istAufgabe = (v: Vergleich) => ((v.gruppe ?? 'selbst') === 'selbst' && v.status === 'neuer') || v.status === 'veraltet';

function alsText(z: Zeilen, abgleich: Vergleich[] | null): string {
  const eintrag = [t('werkbank.technik.systemangaben-ablago'), '', t('werkbank.technik.bereich-angabe-wert'), '| --- | --- | --- |'];
  for (const [g, liste] of z) for (const [k, v] of liste) eintrag.push(`| ${g} | ${k} | ${markdownZelle(v)} |`);
  if (abgleich) {
    eintrag.push('', t('werkbank.technik.versionsabgleich'), '', t('werkbank.technik.komponente-installiert-aktuell'), '| --- | --- | --- | --- |');
    for (const [titel, liste] of gruppiert(abgleich)) {
      if (!liste.length) continue;
      eintrag.push(`| **${titel}** | | | |`);
      for (const v of liste) eintrag.push(`| ${v.bezeichnung ?? v.komponente} | ${v.installiert ?? '–'} | ${v.aktuell ?? '–'} | ${statusVon(v).text} |`);
    }
  }
  eintrag.push('', t('werkbank.technik.erstellt-am', { wert: new Date().toLocaleString(gebietsschema()) }));
  return eintrag.join('\n');
}

export function useTechnik(sichtbar: boolean) {
  const [u, setU] = useState<Systemuebersicht | null>(null);
  const [fehler, setFehler] = useState<string>();
  const [abgleich, setAbgleich] = useState<Vergleich[] | null>(null);
  const laden = useCallback(async () => { try { setU(await api.system()); setFehler(undefined); } catch (e) { setFehler((e as Error).message); } }, []);
  useEffect(() => { if (sichtbar) void laden(); }, [sichtbar, laden]);
  return { u, fehler, abgleich, setAbgleich, laden };
}
export type TechnikZustand = ReturnType<typeof useTechnik>;

/** Was installiert ist (#366: früher die mittlere Spalte), als Abschnitt unter „Neuere Versionen“. */
function Installiert({ t: eintrag }: { t: TechnikZustand }) {
  return (
    <section className="blatt" id="installiert">
      <h2 className="h3">{t('werkbank.technik.installiert')}</h2>
      {eintrag.fehler && <div className="hinweis schlecht"><p>{eintrag.fehler}</p></div>}
      {!eintrag.u ? <p className="leise">{t('werkbank.technik.lade')}</p> : zeilenAus(eintrag.u).map(([gruppe, liste]) => (
        <section key={gruppe} className="technikgruppe">
          <h3 className="ueber">{gruppe}</h3>
          <dl>{liste.map(([k, v]) => <div key={k}><dt>{k}</dt><dd className={/^\d|^[0-9a-f]{7}$/.test(v) ? 'mono' : ''}>{v}</dd></div>)}</dl>
        </section>
      ))}
    </section>
  );
}

export function TechnikPanel({ t: eintrag, abschnitt }: { t: TechnikZustand; abschnitt?: boolean }) {
  const handbuch = useHandbuch();
  const { version } = useKonto();
  const release = /^\d+\.\d+\.\d+$/.test(version ?? '');
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string>();
  const [kopiert, setKopiert] = useState(false);
  async function pruefen() {
    setLaeuft(true); setFehler(undefined);
    try { eintrag.setAbgleich(await api.versionsabgleich({ react: reactVersion })); } catch (e) { setFehler((e as Error).message); } finally { setLaeuft(false); }
  }
  async function kopieren() {
    if (!eintrag.u) return;
    const text = alsText(zeilenAus(eintrag.u), eintrag.abgleich);
    try { await navigator.clipboard.writeText(text); setKopiert(true); setTimeout(() => setKopiert(false), 2500); }
    catch { setFehler(t('werkbank.technik.kopieren-nicht-moeglich-der')); }
  }
  const aufgaben = eintrag.abgleich?.filter(istAufgabe) ?? [];
  const komplett = eintrag.u?.dms.variante === 'komplett';
  const imageName = komplett ? 'ghcr.io/motom001/dms-komplett' : 'ghcr.io/motom001/dms';
  return (
    <div className="einspaltig">
      <Kopf titel={t('werkbank.technik.version-und-updates')} abschnitt={abschnitt} id="version">
        <p className="leise">{tn('werkbank.technik.fuer-fragen-an-den', { link: <a className="verweis" href="https://github.com/motom001/dms/issues/new?template=wunsch.md" target="_blank" rel="noreferrer">{t('werkbank.technik.github-issue')}</a>, link2: <a className="verweis" href={handbuch('admin', 'technik/')} target="_blank" rel="noreferrer">{t('werkbank.technik.das-administratorhandbuch')}</a>, hilfe: <Hilfe ort="werkbank.technik" /> })}</p>
      </Kopf>
      <div className="blatt">
        <h2 className="h3">{t('werkbank.technik.fuer-den-support')}</h2>
        <div className="knoepfe">
          <button className="knopf primaer" disabled={!eintrag.u} onClick={() => void kopieren()}>{kopiert ? t('werkbank.technik.kopiert') : t('werkbank.technik.uebersicht-fuer-github-kopieren')}</button>
        </div>
        {fehler === t('werkbank.technik.kopieren-nicht-moeglich-der') && eintrag.u && <textarea className="mono klein" rows={8} readOnly value={alsText(zeilenAus(eintrag.u), eintrag.abgleich)} onFocus={(e) => e.target.select()} />}
      </div>
      <div className="blatt">
        <h2 className="h3">{t('werkbank.technik.neuere-versionen')}</h2>
        {release && <p>{tn('werkbank.technik.was-sich-seit-deiner', { version, link: <a className="verweis" href={handbuch('admin', 'neu/')} target="_blank" rel="noreferrer">{t('werkbank.technik.neu-in-dieser-version')}</a>, link2: <a className="verweis" href="https://github.com/motom001/dms/releases" target="_blank" rel="noreferrer">{t('werkbank.technik.alle-releases')}</a>, link3: <a className="verweis" href={`https://github.com/motom001/dms/compare/v${version}...main`} target="_blank" rel="noreferrer">{tn('werkbank.technik.alle-aenderungen-seit', { version })}</a> })}</p>}
        <p className="leise">{t('werkbank.technik.fragt-github-ablago-endoflife')}</p>
        <div className="knoepfe"><Knopf laeuft={laeuft} laeuftText={t('werkbank.technik.pruefe')} onClick={pruefen}>{eintrag.abgleich ? t('werkbank.technik.erneut-pruefen') : t('werkbank.technik.jetzt-pruefen')}</Knopf></div>
        {fehler && fehler !== t('werkbank.technik.kopieren-nicht-moeglich-der') && <p className="fehlertext">{fehler}</p>}
        {eintrag.abgleich && (
          <>
            <p className={aufgaben.length ? 'hinweis warn' : 'hinweis gut'}>{aufgaben.length
              ? aufgaben.map((v) => v.status === 'veraltet' ? t('werkbank.technik.wird-nicht-mehr-unterstuetzt', { wert: v.bezeichnung ?? v.komponente }) : v.komponente === 'Ablago' ? t('werkbank.technik.eine-neuere-ablago-version') : t('werkbank.technik.fuer-gibt-es-ein', { wert: v.bezeichnung ?? v.komponente })).join(' ')
              : t('werkbank.technik.fuer-dich-ist-nichts')}</p>
            {gruppiert(eintrag.abgleich).map(([titel, liste]) => liste.length > 0 && (
              <div key={titel}>
                <p className="ueber abstand-oben">{titel}</p>
                <div className="tabellenrahmen">
                  <table className="tabelle">
                    <thead><tr><th>{t('werkbank.technik.komponente')}</th><th>{t('werkbank.technik.installiert')}</th><th>{t('werkbank.technik.aktuell')}</th><th>{t('werkbank.technik.status')}</th></tr></thead>
                    <tbody>
                      {liste.map((v) => { const s = statusVon(v); return (
                        <tr key={v.komponente}>
                          <td>{v.bezeichnung ?? v.komponente}{v.hinweis && <span className="leise klein blockzeile">{v.hinweis}</span>}</td>
                          <td className="mono">{v.installiert ?? '–'}</td>
                          <td className="mono">{v.aktuell ?? '–'}</td>
                          <td><span className={`chip ${s.art}`}>{s.text}</span></td>
                        </tr>
                      ); })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
            <p className="leise klein">{tn('werkbank.technik.aktualisieren-das-image-enthaelt', { span: <span className="mono">{imageName}</span>, wert: komplett ? t('werkbank.technik.und-postgresql') : '', wert2: komplett ? '' : t('werkbank.technik.postgresql-ist-ein-eigenes') })}</p>
          </>
        )}
      </div>
      <Installiert t={eintrag} />
    </div>
  );
}
