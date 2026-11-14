import { useEffect, useState } from 'react';
import { Symbol } from './Symbol';
import { messung, type Anfragemessung } from './messung';
import { t } from './sprache';
import { Knopf } from './bausteine';

const ms = (x: number | undefined) => (x === undefined ? '–' : `${x < 10 ? x.toFixed(1).replace('.', ',') : Math.round(x)} ms`);

/** Schwebende Anzeige der Zeitmessung (Entwicklermodus). */
export function Messpanel() {
  const [offen, setOffen] = useState(true);
  const [, setStand] = useState(0);
  useEffect(() => { messung.setzeAktiv(true); return () => messung.setzeAktiv(false); }, []);
  useEffect(() => messung.abonniere(() => setStand((x) => x + 1)), []);
  const s = messung.seite;
  const summe = (k: keyof Anfragemessung) => s.anfragen.reduce((a, m) => a + ((m[k] as number | undefined) ?? 0), 0);
  return (
    <aside className={`messpanel ${offen ? 'offen' : ''}`} aria-label={t('oberflaeche.messpanel.zeitmessung')}>
      {/* Aufklappkopf als Baustein Knopf (#1215); Aussehen über .textknopf.messkopf. */}
      <Knopf art="link" className="messkopf" onClick={() => setOffen(!offen)} aria-expanded={offen}>
        <span><Symbol name="stoppuhr" /> {s.bisAnzeige !== undefined ? t('oberflaeche.messpanel.bis-zur-anzeige', { ms: ms(s.bisAnzeige) }) : t('oberflaeche.messpanel.messung')}</span>
        <span className="leise">{s.anfragen.length} {t('oberflaeche.messpanel.anfragen', { anzahl: s.anfragen.length })}{s.anfragen.some((a) => a.dbAnzahl) ? t('oberflaeche.messpanel.db-zugriffe', { summe: summe('dbAnzahl') }) : ''}</span>
      </Knopf>
      {offen && (
        <div className="messinhalt">
          <p className="leise klein mono">{s.pfad}</p>
          {!s.anfragen.length && <p className="leise klein">{t('oberflaeche.messpanel.noch-keine-anfrage-auf')}</p>}
          {s.anfragen.length > 1 && <p className="leise klein">{t('oberflaeche.messpanel.summe-aller-anfragen')}{' '}{TEILE.filter((eintrag) => summe(eintrag.feld) >= 1).map((eintrag) => `${eintrag.name} ${ms(summe(eintrag.feld))}`).join(' · ')}</p>}
          {s.anfragen.map((m) => (
            <div key={m.nr} className="messung">
              <p className="mono klein"><strong>{m.methode}</strong> {m.url.replace(/^\/api/, '').replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, (x) => `${x.slice(0, 8)}…`)} <span className={m.status >= 400 ? 'fehlertext' : 'leise'}>{m.status}</span> · <strong>{ms(m.gesamt + (m.darstellung ?? 0))}</strong></p>
              <Balken m={m} />
              {m.extern && <Extern m={m} />}
              <ul className="klein">
                {TEILE.map((eintrag) => eintrag.k === 'db'
                  ? <li key={eintrag.k} className={eintrag.k}>{m.dbAnzahl ?? '?'} {m.dbAnzahl === 1 ? t('oberflaeche.messpanel.datenbankzugriff') : t('oberflaeche.messpanel.datenbankzugriffe')} {ms(m.db)}</li>
                  : <li key={eintrag.k} className={eintrag.k} title={eintrag.erklaerung}>{eintrag.name} {ms(m[eintrag.feld] as number | undefined)}</li>)}
              </ul>
            </div>
          ))}
          <p className="leise klein">{t('oberflaeche.messpanel.warten-browser-der-browser')}</p>
        </div>
      )}
    </aside>
  );
}

/** Abschnitte in Reihenfolge des Ablaufs, je mit eigener Farbe (styles.css: .messpanel .m-…). */
const TEILE: Array<{ k: string; feld: keyof Anfragemessung; name: string; erklaerung: string }> = [
  { k: 'm-wbrow', feld: 'wartenBrowser', name: t('oberflaeche.messpanel.warten-browser'), erklaerung: t('oberflaeche.messpanel.die-anfrage-wartete-im') },
  { k: 'netz', feld: 'leitung', name: t('oberflaeche.messpanel.leitung'), erklaerung: t('oberflaeche.messpanel.hin-und-rueckweg-ohne') },
  { k: 'm-wserv', feld: 'wartenServer', name: t('oberflaeche.messpanel.warten-server'), erklaerung: t('oberflaeche.messpanel.vom-eingang-der-anfrage') },
  { k: 'm-rechte', feld: 'rechte', name: t('oberflaeche.messpanel.rechte'), erklaerung: t('oberflaeche.messpanel.berechtigungen-auswerten-ohne-die') },
  { k: 'db', feld: 'db', name: t('oberflaeche.messpanel.datenbank'), erklaerung: '' },
  { k: 'aufb', feld: 'aufbereitung', name: t('oberflaeche.messpanel.aufbereitung'), erklaerung: t('oberflaeche.messpanel.uebrige-zeit-im-server') },
  { k: 'm-json', feld: 'json', name: 'JSON', erklaerung: t('oberflaeche.messpanel.antwort-im-server-in') },
  { k: 'ueb', feld: 'uebertragung', name: t('oberflaeche.messpanel.uebertragung'), erklaerung: t('oberflaeche.messpanel.antwort-an-den-browser') },
  { k: 'ausw', feld: 'auswerten', name: t('oberflaeche.messpanel.auswerten'), erklaerung: t('oberflaeche.messpanel.antwort-im-browser-lesen') },
  { k: 'darst', feld: 'darstellung', name: t('oberflaeche.messpanel.darstellung'), erklaerung: t('oberflaeche.messpanel.bis-der-browser-das') },
];

const groesse = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB` : b >= 1024 ? `${Math.round(b / 1024)} KB` : `${b} B`);

/**
 * Externe Dienste (#565): Worauf der Server in dieser Anfrage wartete – je Aufruf Dienst (bei Paketen mit Kennung), Dauer
 * bis zur ersten Antwort, Gesamtdauer, Größe und Ergebnis. Die Zeit ist ein Teil von „Aufbereitung“ (der Server wartet im
 * Handler); bei Antworten als Strom („Frag deine Ablage“) steht sie als eigene Zeile.
 */
function Extern({ m }: { m: Anfragemessung }) {
  return (
    <div className="messextern klein">
      <p><strong>{t('oberflaeche.messpanel.externe-dienste')}</strong> {ms(m.externMs)}</p>
      <ul>
        {m.extern!.map((x, i) => (
          <li key={i} className={x.ergebnis === 'ok' ? undefined : 'fehlertext'}>
            {t.frei(`systemzustand.extern.dienst.${x.dienst}`)}{x.paket ? <span className="mono"> {x.paket}</span> : null}
            {' · '}{t('oberflaeche.messpanel.erste-antwort', { ms: ms(x.ersteMs ?? undefined) })}
            {' · '}{t('oberflaeche.messpanel.gesamt', { ms: ms(x.ms) })}
            {x.bytes ? ` · ${groesse(x.bytes)}` : ''}
            {x.ergebnis === 'ok' ? '' : ` · ${t.frei(`systemzustand.extern.ergebnis.${x.ergebnis}`)}`}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Balken({ m }: { m: Anfragemessung }) {
  const teile = TEILE.map((eintrag) => ({ k: eintrag.k, w: m[eintrag.feld] as number | undefined }));
  const ges = teile.reduce((a, eintrag) => a + (eintrag.w ?? 0), 0) || 1;
  return <div className="messbalken" aria-hidden="true">{teile.map((eintrag) => <span key={eintrag.k} className={eintrag.k} style={{ width: `${((eintrag.w ?? 0) / ges) * 100}%` }} />)}</div>;
}
