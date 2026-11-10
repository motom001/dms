import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { zielProblem, type WebhookAnsicht, type WebhookErgebnis, type WebhookVerlauf } from '../../../shared/src/webhook';
import { api } from '../api';
import { Hilfe } from '../Hilfe';
import { useKonto } from '../konto';
import { rueckfrage } from '../rueckfrage';
import { Symbol } from '../Symbol';
import { t } from '../sprache';
import { gebietsschema } from '../../../shared/src/sprache';
import { knopfAussehen } from '../bausteine';

/**
 * Webhooks im eigenen Profil (#627): Das DMS meldet geänderte Zahlen (neue Post, Zu erledigen, Fristen) sofort an
 * eine Adresse, z. B. Homey oder Node-RED. Anlegen, Probe senden, an/aus, Geheimnis erneuern, löschen; das
 * Geheimnis ist nur beim Anlegen bzw. Erneuern ganz sichtbar.
 */
export const zeitText = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString(gebietsschema(), { dateStyle: 'short', timeStyle: 'medium' }) : '–');

/** Letzte Zustellung oder Probe als kurze Zeile. */
export function ErgebnisZeile({ e }: { e: WebhookErgebnis | null }) {
  if (!e) return <span className="leise">{t('webhook.profil.noch-nichts')}</span>;
  return (
    <span className={e.ok ? 'gutertext' : 'fehlertext'}>
      <Symbol name={e.ok ? 'haken' : 'warnung'} /> {t(e.ok ? 'webhook.profil.letzte.ok' : 'webhook.profil.letzte.fehler', { zeit: zeitText(e.zeit), status: e.status ?? '–', art: e.art })}
      {e.fehler && <> – {e.fehler}</>}
    </span>
  );
}

/** Warum ein Webhook aus ist (nach Fehlschlägen oder durch einen Administrator). */
export function Abgeschaltet({ w }: { w: WebhookAnsicht }) {
  if (w.aktiv || !w.abgeschaltet) return null;
  const a = w.abgeschaltet;
  return (
    <p className="hinweis warn">{a.grund === 'fehler'
      ? t('webhook.profil.abgeschaltet.fehler', { zeit: zeitText(a.zeit), text: a.text ?? '' })
      : t('webhook.profil.abgeschaltet.admin', { zeit: zeitText(a.zeit) })}</p>
  );
}

export function WebhooksBlatt() {
  const { ich } = useKonto();
  const admin = ich.rolle === 'admin';
  const [stand, setStand] = useState<{ webhooks: WebhookAnsicht[]; ziele: string[] } | null>(null);
  const [neu, setNeu] = useState<{ name: string; geheimnis: string } | null>(null);
  const [fehler, setFehler] = useState<string>();
  const [probe, setProbe] = useState<Record<string, WebhookErgebnis>>({});
  const laden = useCallback(async () => { try { setStand(await api.webhooks()); } catch (e) { setFehler((e as Error).message); } }, []);
  useEffect(() => { void laden(); }, [laden]);

  async function aktion(fn: () => Promise<unknown>) {
    setFehler(undefined);
    try { await fn(); await laden(); return true; } catch (e) { setFehler((e as Error).message); return false; }
  }

  return (
    <div className="blatt" id="webhooks">
      <div className="blattkopf">
        <h2 className="h3">{t('webhook.profil.titel')} <Hilfe ort="profil.webhooks" /></h2>
        <p className="leise">{t('webhook.profil.text')}</p>
      </div>
      {fehler && <div className="hinweis schlecht"><p>{fehler}</p></div>}
      {neu && <NeuesGeheimnis name={neu.name} geheimnis={neu.geheimnis} schliessen={() => setNeu(null)} />}
      {stand && stand.webhooks.length > 0 && (
        <ul className="sitzungsliste">
          {stand.webhooks.map((w) => (
            <li key={w.id} className="stapel">
              <div>
                <strong>{w.name}</strong> <span className={`chip ${w.aktiv ? '' : 'warn'}`}>{w.aktiv ? t('webhook.an') : t('webhook.aus')}</span>
                <span className="mono klein umbrechen blockzeile">{w.url}</span>
                <span className="klein blockzeile"><ErgebnisZeile e={probe[w.id] ?? w.letzte} /></span>
                {w.offen && <span className="leise klein blockzeile">{t('webhook.profil.offen', { zeit: zeitText(w.offen.faellig), versuche: w.offen.versuche })}</span>}
              </div>
              <Abgeschaltet w={w} />
              <span className="zeilenaktionen">
                <button type="button" className="textknopf" onClick={() => void aktion(async () => { const e = await api.webhookProbe(w.id); setProbe((p) => ({ ...p, [w.id]: e })); })}>{t('webhook.profil.probe')}</button>
                <button type="button" className="textknopf" disabled={!w.aktiv && w.abgeschaltet?.grund === 'admin' && !admin}
                  onClick={() => void aktion(() => api.webhookAendern(w.id, { aktiv: !w.aktiv }))}>{w.aktiv ? t('webhook.ausschalten') : t('webhook.einschalten')}</button>
                <button type="button" className="textknopf" onClick={async () => {
                  if (await rueckfrage({ titel: t('webhook.profil.geheimnis.frage', { name: w.name }), text: t('webhook.profil.geheimnis.folge'), ja: t('webhook.profil.geheimnis.knopf') }))
                    void aktion(async () => setNeu({ name: w.name, geheimnis: (await api.webhookGeheimnis(w.id)).geheimnis }));
                }}>{t('webhook.profil.geheimnis.knopf')}</button>
                <button type="button" className="textknopf gefahr" onClick={async () => {
                  if (await rueckfrage({ titel: t('webhook.loeschen.frage', { name: w.name }), text: t('webhook.loeschen.folge'), ja: t('webhook.loeschen'), gefahr: true })) void aktion(() => api.webhookLoeschen(w.id));
                }}>{t('webhook.loeschen')}</button>
              </span>
              <Verlauf id={w.id} />
            </li>
          ))}
        </ul>
      )}
      {stand && !stand.webhooks.length && !neu && <p className="leise">{t('webhook.profil.keine')}</p>}
      {stand && (
        <details className="neuerschluessel">
          <summary {...knopfAussehen({ art: 'anlegen' })}>{t('webhook.profil.neu')}</summary>
          <WebhookFormular ziele={stand.ziele} admin={admin} senden={(name, url) => aktion(async () => { const r = await api.webhookAnlegen({ name, url }); setNeu({ name: r.name, geheimnis: r.geheimnis }); })} />
        </details>
      )}
    </div>
  );
}

function WebhookFormular({ ziele, admin, senden }: { ziele: string[]; admin: boolean; senden: (name: string, url: string) => Promise<boolean> }) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const problem = url ? zielProblem(url) : null;
  async function los(e: FormEvent) {
    e.preventDefault();
    if (problem) return;
    if (await senden(name, url)) { setName(''); setUrl(''); }
  }
  return (
    <form className="raster schluesselformular" onSubmit={los}>
      <label className="eigenschaft"><span>{t('webhook.profil.name')} <small>{t('webhook.profil.name.beispiel')}</small></span><input value={name} onChange={(e) => setName(e.target.value)} required /></label>
      <label className="eigenschaft breit"><span>{t('webhook.profil.adresse')}</span>
        <input className="mono" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://homey.home.arpa/api/app/…" required aria-invalid={!!problem} aria-describedby="webhook-ziel-hilfe" /></label>
      <p id="webhook-ziel-hilfe" className={`eigenschaft breit ${problem ? 'fehlertext' : 'hilfe'}`}>
        {problem ?? (ziele.length ? t('webhook.profil.ziele', { ziele: ziele.join(', ') }) : admin ? t('webhook.profil.ziele.admin') : t('webhook.profil.ziele.keine'))}
      </p>
      <div className="knoepfe"><button className="knopf primaer" disabled={!!problem}>{t('webhook.profil.anlegen')}</button></div>
    </form>
  );
}

function NeuesGeheimnis({ name, geheimnis, schliessen }: { name: string; geheimnis: string; schliessen: () => void }) {
  const [kopiert, setKopiert] = useState(false);
  return (
    <div className="hinweis warn stapel" role="status">
      <p><strong>{t('webhook.profil.geheimnis.titel', { name })}</strong> {t('webhook.profil.geheimnis.einmal')}</p>
      <input className="mono" readOnly value={geheimnis} onFocus={(e) => e.target.select()} aria-label={t('webhook.profil.geheimnis.feld')} />
      <div className="knoepfe">
        <button type="button" className="knopf" onClick={() => void navigator.clipboard?.writeText(geheimnis).then(() => setKopiert(true), () => {})}>{kopiert ? t('webhook.kopiert') : t('webhook.kopieren')}</button>
        <button type="button" className="knopf" onClick={schliessen}>{t('webhook.profil.geheimnis.gesichert')}</button>
      </div>
    </div>
  );
}

/** Letzte Meldungen, aufklappbar (erst beim Öffnen geladen). */
function Verlauf({ id }: { id: string }) {
  const [liste, setListe] = useState<WebhookVerlauf[] | null>(null);
  return (
    <details onToggle={(e) => { if ((e.target as HTMLDetailsElement).open) void api.webhookVerlauf(id).then(setListe, () => setListe([])); }}>
      <summary className="klein">{t('webhook.profil.verlauf')}</summary>
      {!liste ? <p className="leise klein">{t('webhook.lade')}</p> : !liste.length ? <p className="leise klein">{t('webhook.profil.verlauf.leer')}</p> : (
        <ul className="klein">
          {liste.map((v) => (
            <li key={`${v.ereignisId}-${v.erstellt}`}>
              {zeitText(v.erstellt)} · {t.frei(`webhook.zustand.${v.zustand}`)} · {t('webhook.profil.versuche', { anzahl: v.versuche })}
              {v.status !== null && <> · {v.status}</>}{v.fehler && <span className="fehlertext"> – {v.fehler}</span>}
              <span className="mono leise"> {v.ereignisId.slice(0, 8)}</span>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
