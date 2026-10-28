import { version as reactVersion } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { geraetText } from '../../../shared/src/model';
import { api, type Systemuebersicht, type Vergleich } from '../api';

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
      ['Größe', groesse(db.groesseBytes)],
      ['Mappen / Typen / Benutzer', `${db.mappen.toLocaleString('de-DE')} / ${db.typen} / ${db.benutzer}`],
      ['Dokumente', `${db.dokumente.toLocaleString('de-DE')} (${groesse(db.dokumenteBytes)})`],
    ] : [['Fehler', (u.datenbank as { fehler: string }).fehler]]],
    ['Bibliotheken (Server)', Object.entries(u.bibliotheken).map(([k, v]) => [k, v ?? 'nicht gefunden'])],
    ['Oberfläche', [['React', reactVersion], ['Browser', geraetText(navigator.userAgent)]]],
    ['Einstellungen', Object.entries(u.einstellungen)],
  ];
}

/** Markdown für ein GitHub-Issue. */
function alsText(z: Zeilen, abgleich: Vergleich[] | null): string {
  const t = ['### Systemangaben (DMS)', '', '| Bereich | Angabe | Wert |', '| --- | --- | --- |'];
  for (const [g, liste] of z) for (const [k, v] of liste) t.push(`| ${g} | ${k} | ${v.replace(/\|/g, '\\|')} |`);
  if (abgleich) {
    t.push('', '#### Versionsabgleich', '', '| Komponente | Installiert | Aktuell | Status |', '| --- | --- | --- | --- |');
    for (const v of abgleich) t.push(`| ${v.komponente} | ${v.installiert ?? '–'} | ${v.aktuell ?? '–'} | ${STATUS[v.status].text} |`);
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
  return { u, fehler, abgleich, setAbgleich };
}
export type TechnikZustand = ReturnType<typeof useTechnik>;

export function TechnikListe({ t }: { t: TechnikZustand }) {
  return (
    <>
      <div className="listenkopf"><div><h1>Technik</h1><p className="leise klein">Was auf diesem System installiert ist.</p></div></div>
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
  const neuer = t.abgleich?.filter((v) => v.status === 'neuer' || v.status === 'veraltet').length ?? 0;
  return (
    <div className="einspaltig">
      <div className="mappenkopf">
        <p className="ueber">Werkbank</p>
        <h1>Technik und Versionen</h1>
        <p className="leise">Für Fragen an den Support: Übersicht kopieren und in ein <a className="verweis" href="https://github.com/motom001/dms/issues/new?template=wunsch.md" target="_blank" rel="noreferrer">GitHub-Issue</a> einfügen. Passwörter und Zugangsdaten stehen nicht darin. Wie alles zusammenhängt, beschreibt <a className="verweis" href="https://motom001.github.io/dms/admin/technik/" target="_blank" rel="noreferrer">das Administratorhandbuch</a>.</p>
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
        <p className="leise">Fragt GitHub (DMS), endoflife.date (Node.js, PostgreSQL, Alpine) und npm (Bibliotheken). Das DMS verbindet sich dafür nur jetzt, auf Knopfdruck, mit dem Internet.</p>
        <div className="knoepfe"><button className="knopf" disabled={laeuft} onClick={() => void pruefen()}>{laeuft ? 'Prüfe …' : t.abgleich ? 'Erneut prüfen' : 'Jetzt prüfen'}</button></div>
        {fehler && !fehler.startsWith('Kopieren') && <p className="fehlertext">{fehler}</p>}
        {t.abgleich && (
          <>
            <p className={neuer ? 'hinweis warn' : 'hinweis gut'}>{neuer ? `${neuer} ${neuer === 1 ? 'Komponente hat' : 'Komponenten haben'} Neueres oder wird nicht mehr unterstützt.` : 'Alles auf aktuellem Stand.'}</p>
            <div className="tabellenrahmen">
              <table className="tabelle">
                <thead><tr><th>Komponente</th><th>Installiert</th><th>Aktuell</th><th>Status</th></tr></thead>
                <tbody>
                  {t.abgleich.map((v) => (
                    <tr key={v.komponente}>
                      <td>{v.komponente}{v.hinweis && <span className="leise klein blockzeile">{v.hinweis}</span>}</td>
                      <td className="mono">{v.installiert ?? '–'}</td>
                      <td className="mono">{v.aktuell ?? '–'}</td>
                      <td><span className={`chip ${STATUS[v.status].art}`}>{STATUS[v.status].text}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="leise klein">Aktualisieren: Das Image <span className="mono">ghcr.io/motom001/dms:main</span> enthält Node.js, Alpine und die Bibliotheken. Neu ziehen und den Container neu starten genügt; PostgreSQL ist ein eigenes Image.</p>
          </>
        )}
      </div>
    </div>
  );
}
