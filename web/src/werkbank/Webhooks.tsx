import { useCallback, useEffect, useState } from 'react';
import { zielProblem, type WebhookWerkbank } from '../../../shared/src/webhook';
import { api } from '../api';
import { Abgeschaltet, ErgebnisZeile } from '../profil/Webhooks';
import { rueckfrage } from '../rueckfrage';
import { t } from '../sprache';
import { Knopf } from '../bausteine';
import { Kopf } from './Kopf';

/**
 * Werkbank → Webhooks (#627): freigegebene Ziele (nur dorthin dürfen Benutzer melden lassen), alle Webhooks mit
 * letzter Zustellung und Fehlern, abschalten, wieder einschalten und löschen. Anlegen tun Benutzer im Profil.
 */
export function useWebhooks(offen: boolean) {
  const [stand, setStand] = useState<{ webhooks: WebhookWerkbank[]; ziele: string[] } | null>(null);
  const [fehler, setFehler] = useState<string>();
  const laden = useCallback(async () => { try { setStand(await api.werkbankWebhooks()); setFehler(undefined); } catch (e) { setFehler((e as Error).message); } }, []);
  useEffect(() => { if (offen) void laden(); }, [offen, laden]);
  useEffect(() => {
    if (!offen) return;
    const z = setInterval(() => void laden(), 15_000);
    return () => clearInterval(z);
  }, [offen, laden]);
  return { stand, fehler, laden, setStand };
}
export type WebhooksZustand = ReturnType<typeof useWebhooks>;

/** Für die Leiste: Webhooks, die nach Fehlschlägen abgeschaltet sind oder gerade Fehler haben. */
export const webhookWarnungen = (s: WebhooksZustand['stand']) => s?.webhooks.filter((w) => w.abgeschaltet?.grund === 'fehler' || (w.aktiv && w.fehlerFolge > 0)).length ?? 0;

export function WebhooksPanel({ z }: { z: WebhooksZustand }) {
  const s = z.stand;
  const [ziele, setZiele] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  useEffect(() => { if (s && ziele === null) setZiele(s.ziele.join('\n')); }, [s, ziele]);
  if (!s) return z.fehler ? <div className="hinweis schlecht"><p>{z.fehler}</p></div> : <p className="leise">{t('webhook.lade')}</p>;
  const zeilen = (ziele ?? '').split('\n').map((x) => x.trim()).filter(Boolean);
  const problem = zeilen.map((x) => { const p = zielProblem(x); return p ? `${x}: ${p}` : null; }).find(Boolean) ?? null;
  async function aktion(fn: () => Promise<unknown>, gut?: string) {
    try { await fn(); await z.laden(); setMeldung(gut ? { art: 'gut', text: gut } : undefined); } catch (e) { setMeldung({ art: 'schlecht', text: (e as Error).message }); }
  }
  return (
    <div className="einspaltig">
      <Kopf titel={t('webhook.werkbank.titel')} ueber={t('werkbank.webhooks.werkbank')} hilfe="werkbank.webhooks">
        <p className="leise">{t('webhook.werkbank.text')}</p>
      </Kopf>
      {meldung && <div className={`hinweis ${meldung.art}`}><p>{meldung.text}</p></div>}
      <form className="blatt" onSubmit={(e) => { e.preventDefault(); if (!problem) void aktion(async () => { const r = await api.werkbankWebhookZiele(zeilen); setZiele(r.ziele.join('\n')); }, t('webhook.werkbank.ziele.gespeichert')); }}>
        <h2 className="h3">{t('webhook.werkbank.ziele')}</h2>
        <p className="leise">{t('webhook.werkbank.ziele.text')}</p>
        <label className="eigenschaft"><span>{t('webhook.werkbank.ziele.feld')}</span>
          <textarea className="mono" rows={4} value={ziele ?? ''} onChange={(e) => setZiele(e.target.value)} placeholder={'http://homey.home.arpa\nhttps://nodered.example.org'} aria-invalid={!!problem} /></label>
        {problem && <p className="fehlertext">{problem}</p>}
        <div className="knoepfe"><button className="knopf primaer" disabled={!!problem}>{t('webhook.werkbank.ziele.speichern')}</button></div>
      </form>
      <div className="blatt">
        <h2 className="h3">{t('webhook.werkbank.liste')}{s.webhooks.length > 0 && <> <span className="chip">{s.webhooks.length}</span></>}</h2>
        {!s.webhooks.length ? <p className="leise">{t('webhook.werkbank.keine')}</p> : (
          <ul className="sitzungsliste">
            {s.webhooks.map((w) => (
              <li key={w.id} className="stapel">
                <div>
                  <strong>{w.name}</strong> <span className="leise">· {w.benutzer.name}</span> <span className={`chip ${w.aktiv ? '' : 'warn'}`}>{w.aktiv ? t('webhook.an') : t('webhook.aus')}</span>
                  <span className="mono klein umbrechen blockzeile">{w.url}</span>
                  <span className="klein blockzeile"><ErgebnisZeile e={w.letzte} /></span>
                  {w.fehlerFolge > 0 && <span className="fehlertext klein blockzeile">{t('webhook.werkbank.fehlerfolge', { anzahl: w.fehlerFolge })}</span>}
                </div>
                <Abgeschaltet w={w} />
                <span className="zeilenaktionen">
                  <button type="button" className="textknopf" onClick={() => void aktion(() => api.werkbankWebhookSchalten(w.id, !w.aktiv))}>{w.aktiv ? t('webhook.ausschalten') : t('webhook.einschalten')}</button>
                  <Knopf art="link" className="gefahr" onClick={async () => {
                    if (await rueckfrage({ titel: t('webhook.loeschen.frage', { name: w.name }), text: t('webhook.loeschen.folge'), ja: t('webhook.loeschen'), gefahr: true })) void aktion(() => api.werkbankWebhookLoeschen(w.id));
                  }}>{t('webhook.loeschen')}</Knopf>
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="leise klein">{t('webhook.werkbank.hinweis')}</p>
      </div>
    </div>
  );
}
