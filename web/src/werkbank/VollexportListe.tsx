import { Knopf, type KnopfErgebnis } from '../bausteine';
import { useEffect, useState } from 'react';
import { betriebApi } from '../api/betrieb';
import type { VollexportStand } from '../api/konto';
import { t, tn } from '../sprache';
import { gebietsschema } from '../../../shared/src/sprache';

/**
 * Vorhandene Exporte (#254, #797) mit Prüfsummen (#1195): je Export zuerst „Prüfsummen (SHA256SUMS)“, dann „ZIP
 * herunterladen“ mit dem Hinweis, dass der Export danach auf dem Server gelöscht wird. Nach dem Herunterladen bleibt der
 * Eintrag mit der SHA-256 der ZIP (kopierbar) und den Prüfsummen stehen, bis die Frist um ist. Nach einem Klick auf
 * „ZIP herunterladen“ fragt die Seite alle paar Sekunden nach, bis der Server das Herunterladen gemeldet hat – so
 * aktualisiert sich die Liste ohne Neuladen.
 */

type Export = VollexportStand['exporte'][number];

export const mb = (b: number) => (b < 1024 ** 3 ? `${(b / 1024 ** 2).toFixed(b < 10 * 1024 ** 2 ? 1 : 0).replace('.', ',')} MB` : `${(b / 1024 ** 3).toFixed(1).replace('.', ',')} GB`);
const zeit = (iso: string) => new Date(iso).toLocaleString(gebietsschema(), { dateStyle: 'medium', timeStyle: 'short' });
const tag = (iso: string) => new Date(iso).toLocaleDateString(gebietsschema(), { dateStyle: 'medium' });

/** Nachfragen nach dem Klick auf „ZIP herunterladen“: alle 3 Sekunden, höchstens eine Stunde lang. */
const NACHFRAGEN_MS = 3000;
const NACHFRAGEN_BIS_MS = 3600 * 1000;

async function kopieren(text: string): Promise<KnopfErgebnis> {
  try { await navigator.clipboard.writeText(text); return { art: 'gut', text: t('werkbank.vollexport.zip.kopiert') }; }
  catch { return { art: 'schlecht', text: t('werkbank.vollexport.zip.kopieren-fehler') }; }
}

/** Ein Export: bereit (Prüfsummen, ZIP, Prüfen, Löschen) oder heruntergeladen (ZIP-Prüfsumme, Prüfsummen, Entfernen). */
function Eintrag({ e, laden, geladen, melde }: { e: Export; laden(): Promise<void>; geladen(): void; melde(text: string, art: 'gut' | 'schlecht'): void }) {
  const h = e.heruntergeladen;
  const loeschen = async () => {
    try { await betriebApi.vollexportLoeschen(e.name); await laden(); melde(t('werkbank.vollexport.export-geloescht'), 'gut'); } catch (x) { melde((x as Error).message, 'schlecht'); }
  };
  const pruefsummen = <a className="knopf klein" href={betriebApi.vollexportPruefsummenUrl(e.name)} download>{t('werkbank.vollexport.pruefsummen')}</a>;
  return (
    <li className={e.passwoerter ? 'mitpasswoertern' : undefined}>
      <strong>{e.erstellt ? zeit(e.erstellt) : e.name}</strong>{' '}
      {h
        ? <span className="leise klein">{t('werkbank.vollexport.zip.heruntergeladen', { am: zeit(h.am), bis: tag(e.bis) })}</span>
        : <span className="leise klein">{t('werkbank.vollexport.dateien', { mb: mb(e.bytes), dateien: e.dateien, wert: e.mappen !== null ? t('werkbank.vollexport.mappen', { mappen: e.mappen }) : '', wert2: t('werkbank.export.bis', { datum: tag(e.bis) }) })}</span>}
      {/* #366: liegt unverschlüsselt im Export-Ordner – deutlich markieren. */}
      {e.passwoerter && !h && <span className="fehlertext klein blockzeile">{tn('werkbank.vollexport.nach-dem-import-in', { b: <strong>{t('werkbank.vollexport.enthaelt-passwoerter-im-klartext')}</strong> })}</span>}
      {h ? (
        <>
          <dl className="eigenschaften">
            <dt>{t('werkbank.vollexport.zip.sha256')}</dt><dd className="mono umbruch">{h.sha256}</dd>
            <dt>{t('werkbank.vollexport.zip.groesse')}</dt><dd>{t('werkbank.vollexport.zip.bytes', { mb: mb(h.bytes), genau: h.bytes.toLocaleString(gebietsschema()) })}</dd>
          </dl>
          <p className="leise klein">{t('werkbank.vollexport.zip.erklaerung')}</p>
          <span className="knoepfe">
            <Knopf groesse="klein" onClick={() => kopieren(h.sha256)}>{t('werkbank.vollexport.zip.kopieren')}</Knopf>
            {pruefsummen}
            <Knopf art="gefahr" symbol="geloescht" groesse="klein" rueckfrage={{ titel: t('werkbank.vollexport.zip.entfernen-frage'), text: t('werkbank.vollexport.zip.entfernen-text'), ja: t('werkbank.vollexport.zip.entfernen') }} onClick={() => { void loeschen(); }}>{t('werkbank.vollexport.zip.entfernen')}</Knopf>
          </span>
        </>
      ) : (
        <>
          <p className="leise klein">{t('werkbank.vollexport.zip.hinweis')}</p>
          <span className="knoepfe">
            {pruefsummen}
            <a className="knopf klein" href={betriebApi.vollexportZipUrl(e.name)} onClick={geladen}>{t('werkbank.vollexport.als-zip-herunterladen')}</a>
            {/* „Prüfen“ (#986): Ergebnis in der Zeile des Exports, nicht oben auf der Seite. */}
            <Knopf groesse="klein" laeuftText={t('werkbank.vollexport.prueft')} onClick={async (): Promise<KnopfErgebnis> => {
              const r = await betriebApi.vollexportPruefen(e.name);
              return r.ok ? { art: 'gut', text: t('werkbank.vollexport.alle-dateien-vollstaendig-und', { dateien: r.dateien }) }
                : { art: 'schlecht', text: t('werkbank.vollexport.abweichungen', { wert: [...r.fehlend.map((x) => t('werkbank.vollexport.fehlt', { x })), ...r.abweichend.map((x) => t('werkbank.vollexport.veraendert', { x }))].slice(0, 5).join(', '), wert2: r.fehlend.length + r.abweichend.length > 5 ? ' …' : '' }) };
            }}>{t('werkbank.vollexport.pruefen')}</Knopf>
            <Knopf art="gefahr" symbol="geloescht" groesse="klein" rueckfrage={{ titel: t('werkbank.vollexport.diesen-export-loeschen'), text: e.name, ja: t('werkbank.vollexport.loeschen') }} onClick={() => { void loeschen(); }}>{t('werkbank.vollexport.loeschen')}</Knopf>
          </span>
        </>
      )}
    </li>
  );
}

export function VollexportListe({ exporte, laden, melde }: { exporte: Export[]; laden(): Promise<void>; melde(text: string, art: 'gut' | 'schlecht'): void }) {
  // Exporte, deren ZIP gerade heruntergeladen wird: Name → seit wann.
  const [warte, setWarte] = useState<Record<string, number>>({});
  const offen = Object.keys(warte).filter((n) => exporte.some((e) => e.name === n && !e.heruntergeladen));
  useEffect(() => {
    if (!offen.length) return;
    const timer = setInterval(() => {
      const jetzt = Date.now();
      setWarte((w) => Object.fromEntries(Object.entries(w).filter(([, seit]) => jetzt - seit < NACHFRAGEN_BIS_MS)));
      void laden();
    }, NACHFRAGEN_MS);
    return () => clearInterval(timer);
  }, [offen.join('|'), laden]); // eslint-disable-line react-hooks/exhaustive-deps -- nur neu starten, wenn sich die wartenden Exporte ändern
  return (
    <div className="blatt" id="exporte">
      <h2 className="h3">{t('werkbank.vollexport.vorhandene-exporte')}</h2>
      {!exporte.length ? <p className="leise">{t('werkbank.vollexport.noch-kein-export')}</p> : <ul className="stapel">
        {exporte.map((e) => <Eintrag key={e.name} e={e} laden={laden} melde={melde} geladen={() => setWarte((w) => ({ ...w, [e.name]: Date.now() }))} />)}
      </ul>}
    </div>
  );
}
