import { version as reactVersion } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { geraetText } from '../../../shared/src/model';
import { api, type Systemuebersicht, type Vergleich } from '../api';
import { Hilfe, useHandbuch } from '../Hilfe';
import { useKonto } from '../konto';

/**
 * Technik und Versionen (#15): installierte Komponenten, als Text für ein
 * GitHub-Issue kopierbar, und ein Abgleich mit neueren Versionen auf Knopfdruck.
 */
const groesse = (b: number) => (b < 1024 ** 2 ? `${Math.round(b / 1024)} KB` : b < 1024 ** 3 ? `${(b / 1024 ** 2).toFixed(1).replace('.', ',')} MB` : `${(b / 1024 ** 3).toFixed(2).replace('.', ',')} GB`);
const zeit = (iso: string | null) => (iso ? new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) : '–');
const STATUS: Record<Vergleich['status'], { text: string; art: string }> = {
  aktuell: { text: 'aktuell', art: 'gut' }, neuer: { text: 'Neueres verfügbar', art: 'warn' },
  veraltet: { text: 'nicht mehr unterstützt', art: 'stufe-error' }, unbekannt: { text: 'unbekannt', art: '' },
};

type Zeilen = Array<[string, Array<[string, string]>]>;

function zeilenAus(u: Systemuebersicht): Zeilen {
  const db = 'version' in u.datenbank ? u.datenbank : null;
  return [
    ['DMS', [
      ['Version', u.dms.version],
      ['Commit', u.dms.commit ? u.dms.commit.slice(0, 7) : 'unbekannt (lokal gebaut)'],
      ['Image gebaut', zeit(u.dms.gebaut)],
      ['Image', u.dms.variante === 'komplett' ? 'dms-komplett (mit PostgreSQL im Container)' : 'dms'],
    ]],
    ['Laufzeit', [
      ['Node.js', u.laufzeit.node],
      ['Betriebssystem', `${u.laufzeit.system}${u.laufzeit.alpine ? ` (Alpine ${u.laufzeit.alpine})` : ''}`],
      ['Architektur', u.laufzeit.architektur],
      ['Container', u.laufzeit.container ? 'ja' : 'nein'],
      ['Zeitzone', u.laufzeit.zeitzone],
      ['Läuft seit', zeit(u.laufzeit.laeuftSeit)],
    ]],
    ['Datenbank', db ? [
      ['PostgreSQL', db.version],
      ['Ort', u.dms.variante === 'komplett' ? 'im Container (dms-komplett)' : 'eigener Datenbank-Server bzw. Container'],
      ['Größe', groesse(db.groesseBytes)],
      ['Mappen / Typen / Benutzer', `${db.mappen.toLocaleString('de-DE')} / ${db.typen} / ${db.benutzer}`],
      ['Dokumente', `${db.dokumente.toLocaleString('de-DE')} (${groesse(db.dokumenteBytes)})`],
    ] : [['Fehler', (u.datenbank as { fehler: string }).fehler]]],
    ['Bibliotheken (Server)', Object.entries(u.bibliotheken).map(([k, v]) => [k, v ?? 'nicht gefunden'])],
    ['Oberfläche', [['React', reactVersion], ['Browser', geraetText(navigator.userAgent)]]],
    // Feste Ordner im Container (#115); wohin sie zeigen, bestimmen die Volumes der Compose-Datei.
    ['Ordner', (u.ordner ?? []).map((o): [string, string] => [o.pfad, o.gesamt === null || o.frei === null ? 'nicht messbar' : `${groesse(o.belegt ?? 0)} belegt, ${groesse(o.frei)} frei von ${groesse(o.gesamt)}${o.volume === false ? ' – kein eigenes Volume!' : ''}`])],
    ['Einstellungen', [...Object.entries(u.einstellungen), ...(u.variablen ?? []).map((v): [string, string] => [v, 'überflüssig – aus der Compose-Datei entfernen'])]],
  ];
}

/** Markdown für ein GitHub-Issue. */
/** #216: Was der Betreiber selbst aktualisiert – und was mit einem DMS-Update kommt. */
const GRUPPEN = [['selbst', 'Von dir zu aktualisieren'], ['dms', 'Kommt mit dem DMS']] as const;
function gruppiert(abgleich: Vergleich[]): Array<[string, Vergleich[]]> {
  return GRUPPEN.map(([g, titel]) => [titel, abgleich.filter((v) => (v.gruppe ?? 'selbst') === g)]);
}
/** In „Kommt mit dem DMS“ ist Neueres keine Aufgabe für den Betreiber; nicht mehr unterstützt bleibt eine Warnung. */
function statusVon(v: Vergleich): { text: string; art: string } {
  if (v.gruppe === 'dms' && v.status === 'neuer') return { text: 'kommt mit DMS-Update', art: '' };
  return STATUS[v.status];
}
const istAufgabe = (v: Vergleich) => ((v.gruppe ?? 'selbst') === 'selbst' && v.status === 'neuer') || v.status === 'veraltet';

function alsText(z: Zeilen, abgleich: Vergleich[] | null): string {
  const t = ['### Systemangaben (DMS)', '', '| Bereich | Angabe | Wert |', '| --- | --- | --- |'];
  for (const [g, liste] of z) for (const [k, v] of liste) t.push(`| ${g} | ${k} | ${v.replace(/\|/g, '\\|')} |`);
  if (abgleich) {
    t.push('', '#### Versionsabgleich', '', '| Komponente | Installiert | Aktuell | Status |', '| --- | --- | --- | --- |');
    for (const [titel, liste] of gruppiert(abgleich)) {
      if (!liste.length) continue;
      t.push(`| **${titel}** | | | |`);
      for (const v of liste) t.push(`| ${v.bezeichnung ?? v.komponente} | ${v.installiert ?? '–'} | ${v.aktuell ?? '–'} | ${statusVon(v).text} |`);
    }
  }
  t.push('', `_Erstellt am ${new Date().toLocaleString('de-DE')}_`);
  return t.join('\n');
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

export function TechnikListe({ t }: { t: TechnikZustand }) {
  return (
    <>
      <div className="listenkopf"><div><h1>Technik</h1><p className="leise klein">Was auf diesem System installiert ist. <Hilfe ort="werkbank.technik" /></p></div></div>
      {t.fehler && <div className="hinweis schlecht"><p>{t.fehler}</p></div>}
      {!t.u ? <p className="leise">Lade …</p> : zeilenAus(t.u).map(([gruppe, liste]) => (
        <section key={gruppe} className="technikgruppe">
          <h2 className="ueber">{gruppe}</h2>
          <dl>{liste.map(([k, v]) => <div key={k}><dt>{k}</dt><dd className={/^\d|^[0-9a-f]{7}$/.test(v) ? 'mono' : ''}>{v}</dd></div>)}</dl>
        </section>
      ))}
    </>
  );
}

export function TechnikPanel({ t }: { t: TechnikZustand }) {
  const handbuch = useHandbuch();
  const { version } = useKonto();
  const release = /^\d+\.\d+\.\d+$/.test(version ?? '');
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string>();
  const [kopiert, setKopiert] = useState(false);
  async function pruefen() {
    setLaeuft(true); setFehler(undefined);
    try { t.setAbgleich(await api.versionsabgleich({ react: reactVersion })); } catch (e) { setFehler((e as Error).message); } finally { setLaeuft(false); }
  }
  async function kopieren() {
    if (!t.u) return;
    const text = alsText(zeilenAus(t.u), t.abgleich);
    try { await navigator.clipboard.writeText(text); setKopiert(true); setTimeout(() => setKopiert(false), 2500); }
    catch { setFehler('Kopieren nicht möglich (der Browser erlaubt die Zwischenablage nur über HTTPS oder localhost). Der Text steht unten zum Markieren.'); }
  }
  const aufgaben = t.abgleich?.filter(istAufgabe) ?? [];
  const komplett = t.u?.dms.variante === 'komplett';
  const imageName = komplett ? 'ghcr.io/motom001/dms-komplett' : 'ghcr.io/motom001/dms';
  return (
    <div className="einspaltig">
      <div className="mappenkopf">
        <p className="ueber">Werkbank</p>
        <h1>Technik und Versionen</h1>
        <p className="leise">Für Fragen an den Support: Übersicht kopieren und in ein <a className="verweis" href="https://github.com/motom001/dms/issues/new?template=wunsch.md" target="_blank" rel="noreferrer">GitHub-Issue</a> einfügen. Passwörter und Zugangsdaten stehen nicht darin. Wie alles zusammenhängt, beschreibt <a className="verweis" href={handbuch('admin', 'technik/')} target="_blank" rel="noreferrer">das Administratorhandbuch</a>.</p>
      </div>
      <div className="blatt">
        <h2 className="h3">Für den Support</h2>
        <div className="knoepfe">
          <button className="knopf primaer" disabled={!t.u} onClick={() => void kopieren()}>{kopiert ? 'Kopiert' : 'Übersicht für GitHub kopieren'}</button>
        </div>
        {fehler?.startsWith('Kopieren') && t.u && <textarea className="mono klein" rows={8} readOnly value={alsText(zeilenAus(t.u), t.abgleich)} onFocus={(e) => e.target.select()} />}
      </div>
      <div className="blatt">
        <h2 className="h3">Neuere Versionen</h2>
        {release && <p>Was sich seit deiner Version {version} geändert hat: <a className="verweis" href={handbuch('admin', 'neu/')} target="_blank" rel="noreferrer">Neu in dieser Version</a> im Handbuch, <a className="verweis" href="https://github.com/motom001/dms/releases" target="_blank" rel="noreferrer">alle Releases</a> und <a className="verweis" href={`https://github.com/motom001/dms/compare/v${version}...main`} target="_blank" rel="noreferrer">alle Änderungen seit {version}</a> auf GitHub.</p>}
        <p className="leise">Fragt GitHub (DMS), endoflife.date (Node.js, PostgreSQL, Alpine) und npm (Bibliotheken). Das DMS verbindet sich dafür nur jetzt, auf Knopfdruck, mit dem Internet.</p>
        <div className="knoepfe"><button className="knopf" disabled={laeuft} onClick={() => void pruefen()}>{laeuft ? 'Prüfe …' : t.abgleich ? 'Erneut prüfen' : 'Jetzt prüfen'}</button></div>
        {fehler && !fehler.startsWith('Kopieren') && <p className="fehlertext">{fehler}</p>}
        {t.abgleich && (
          <>
            <p className={aufgaben.length ? 'hinweis warn' : 'hinweis gut'}>{aufgaben.length
              ? aufgaben.map((v) => v.status === 'veraltet' ? `${v.bezeichnung ?? v.komponente} wird nicht mehr unterstützt.` : v.komponente === 'DMS' ? 'Eine neuere DMS-Version ist verfügbar.' : `Für ${v.bezeichnung ?? v.komponente} gibt es ein Update.`).join(' ')
              : 'Für dich ist nichts zu tun.'}</p>
            {gruppiert(t.abgleich).map(([titel, liste]) => liste.length > 0 && (
              <div key={titel}>
                <p className="ueber abstand-oben">{titel}</p>
                <div className="tabellenrahmen">
                  <table className="tabelle">
                    <thead><tr><th>Komponente</th><th>Installiert</th><th>Aktuell</th><th>Status</th></tr></thead>
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
            <p className="leise klein">Aktualisieren: Das Image <span className="mono">{imageName}</span> enthält Node.js, Alpine und die Bibliotheken{komplett ? ' – und PostgreSQL' : ''}. Neu ziehen und den Container neu starten genügt.{komplett ? '' : ' PostgreSQL ist ein eigenes Image (postgres:17), das du getrennt neu ziehst.'} Die Bibliotheken aktualisiert das Projekt; sie kommen mit dem nächsten DMS-Update.</p>
          </>
        )}
      </div>
    </div>
  );
}
