import { t, tn } from '../sprache';
import { useCallback, useEffect, useState } from 'react';
import { api, type OAuthAnbieter, type OAuthAppEingabe, type OAuthAppsStand, type OAuthStatus, type PostfachAnsicht, type PostfachEingabe } from '../api';
import { useDaten } from '../daten';
import { geheZu, Link, loeseWache } from '../ort';
import { Speicherleiste, useEntwurf } from '../Speicherleiste';
import { Hilfe } from '../Hilfe';
import { Listenkopf } from '../Listenkopf';
import { rueckfrage } from '../rueckfrage';
import { gebietsschema } from '../../../shared/src/sprache';
import { Bereich, fehlerBereiche, Knopf, KnopfLink, useBereiche, type BereichListe, type Klappe, type KnopfErgebnis } from '../bausteine';

/**
 * Werkbank → Postfächer (#196): Mails per IMAP abholen, jede Mail wird neue Post.
 * Das Passwort wird verschlüsselt gespeichert und nie wieder angezeigt.
 */

const zeit = (iso: string) => new Date(iso).toLocaleString(gebietsschema(), { dateStyle: 'short', timeStyle: 'short' });
const NEU: PostfachEingabe = {
  name: '', aktiv: true, server: '', port: 993, verschluesselung: 'ssl', benutzer: '', passwort: '', ordner: 'INBOX', abstand: 5,
  fuer: null, absender: '', nachher: 'verschieben', zielordner: 'Ablago', nurMitAnhang: false, original: true, anmeldung: 'passwort', anbieter: 'microsoft',
};
const PORT = { ssl: 993, starttls: 143, keine: 143 } as const;
/** OAuth 2.0 (#358): Voreinstellungen je Anbieter. */
const ANBIETER: Record<OAuthAnbieter, { name: string; server: string; geraet: boolean }> = {
  microsoft: { name: t('werkbank.postfaecher.microsoft-365-outlook-com'), server: 'outlook.office365.com', geraet: true },
  google: { name: t('werkbank.postfaecher.gmail-google-workspace'), server: 'imap.gmail.com', geraet: false },
  andere: { name: t('werkbank.postfaecher.anderer-anbieter'), server: '', geraet: true },
};
export type Meldung = { art: 'gut' | 'schlecht' | 'info'; text: string };
/** Feste Fehlercodes der Rückkehr (#358) – Text nie aus der Adresse übernehmen. */
const RUECKRUF_FEHLER: Record<string, string> = {
  abgelaufen: t('werkbank.postfaecher.die-anmeldung-ist-abgelaufen'),
  admin: t('konten.verwaltende.postfach.andere'),
  browser: t('werkbank.postfaecher.die-anmeldung-wurde-in'),
  abgelehnt: t('werkbank.postfaecher.der-anbieter-hat-die'),
  ohnecode: t('werkbank.postfaecher.der-anbieter-hat-keinen'),
  tausch: t('werkbank.postfaecher.der-anbieter-hat-keine'),
};
/** Rückruf-Adresse für „Im Browser anmelden“: https, http nur für localhost. */
const rueckrufOk = (r: string) => /^https:\/\//.test(r) || /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(r);
const gleicherServer = (a: Pick<PostfachEingabe, 'server' | 'port' | 'verschluesselung'>, b: Pick<PostfachEingabe, 'server' | 'port' | 'verschluesselung'>) =>
  a.server.toLowerCase() === b.server.toLowerCase() && Number(a.port) === Number(b.port) && a.verschluesselung === b.verschluesselung;

/** Meldung aus der Rückkehr vom Anbieter (?oauth=angemeldet bzw. ?oauthfehler=<Code>) – einmal zeigen, dann aus der Adresse nehmen. */
export function useRueckkehr(gut = t('werkbank.postfaecher.beim-anbieter-angemeldet-mit')): Meldung | undefined {
  const [m] = useState<Meldung | undefined>(() => {
    const q = new URLSearchParams(location.search);
    const f = q.get('oauthfehler');
    if (f) return { art: 'schlecht', text: t('werkbank.postfaecher.anmeldung-beim-anbieter', { wert: RUECKRUF_FEHLER[f] ?? t('werkbank.postfaecher.einzelheiten-stehen-im-protokoll') }) };
    if (q.get('oauth') === 'angemeldet') return { art: 'gut', text: gut };
    return undefined;
  });
  useEffect(() => { if (m) history.replaceState(null, '', location.pathname); }, [m]);
  return m;
}
/** Nur die Felder des Formulars – der Stand (letzter Abruf …) ändert sich beim Abfragen. */
const alsEingabe = (v: PostfachAnsicht): PostfachEingabe => ({
  ...(Object.fromEntries(Object.keys(NEU).map((k) => [k, (v as unknown as Record<string, unknown>)[k]])) as unknown as PostfachEingabe),
  absender: v.absender.join(', '), passwort: '', anmeldung: v.anmeldung ?? 'passwort', anbieter: v.anbieter ?? 'microsoft',
});

export function usePostfaecher(offen: boolean) {
  const [liste, setListe] = useState<PostfachAnsicht[] | null>(null);
  const [fehler, setFehler] = useState<string>();
  const laden = useCallback(async () => { try { setListe(await api.postfaecher()); setFehler(undefined); } catch (e) { setFehler((e as Error).message); } }, []);
  useEffect(() => { if (offen) void laden(); }, [offen, laden]);
  useEffect(() => {
    if (!offen) return;
    const timer = setInterval(() => void laden(), 30_000);
    return () => clearInterval(timer);
  }, [offen, laden]);
  return { liste, fehler, laden, setListe };
}
export type PostfachZustand = ReturnType<typeof usePostfaecher>;

export function PostfaecherListe({ z, offen }: { z: PostfachZustand; offen?: string }) {
  const rueckkehr = useRueckkehr();
  return (
    <>
      <Listenkopf titel={t('werkbank.postfaecher.postfaecher')} hilfe="werkbank.postfaecher" beschreibung={t('werkbank.postfaecher.mails-abholen-jede-mail')}>
        <KnopfLink to="/werkbank/postfaecher/neu" art="anlegen" groesse="klein">{t('werkbank.postfaecher.neu')}</KnopfLink>
      </Listenkopf>
      {z.fehler && <div className="hinweis schlecht"><p>{z.fehler}</p></div>}
      {!offen && rueckkehr && <div className={`hinweis ${rueckkehr.art}`} role="status"><p>{rueckkehr.text}</p></div>}
      {!z.liste ? <p className="leise">{t('werkbank.postfaecher.lade')}</p> : !z.liste.length ? <p className="leise leerliste">{t('werkbank.postfaecher.noch-kein-postfach')}</p> : (
        <ul className="mappenliste">
          {z.liste.map((p) => (
            <li key={p.id}><Link to={`/werkbank/postfaecher/${p.id}`} className={`eintrag werk ${offen === p.id ? 'an' : ''}`}>
              <span className="titel">{p.name}</span>
              <span className="unter">{p.benutzer} · {p.aktiv ? (p.stand.letzterAbruf ? t('werkbank.postfaecher.zuletzt', { zeit: zeit(p.stand.letzterAbruf) }) : t('werkbank.postfaecher.noch-nicht-abgerufen')) : t('werkbank.postfaecher.aus')}</span>
              {p.oauth && p.oauth.zustand !== 'ok' ? <span className="problem">{p.oauth.zustand === 'abgelaufen' ? t('werkbank.postfaecher.anmeldung-abgelaufen') : t('werkbank.postfaecher.nicht-angemeldet')}</span>
                : p.stand.fehlerFolge > 0 && <span className="problem">{t('werkbank.postfaecher.fehler')}</span>}
            </Link></li>
          ))}
        </ul>
      )}
    </>
  );
}

/** Bereiche eines Postfachs (#1000): Anmeldung beim Anbieter nur mit OAuth, der Stand erst nach dem Anlegen. */
type PostfachBereich = 'grunddaten' | 'verbindung' | 'abholen' | 'anbieter' | 'stand';
function postfachBereiche(oauth: boolean, gespeichert: boolean): BereichListe<PostfachBereich> {
  return [
    ['grunddaten', t('werkbank.postfaecher.bereich.grunddaten')], ['verbindung', t('werkbank.postfaecher.bereich.verbindung')], ['abholen', t('werkbank.postfaecher.bereich.abholen')],
    ...(oauth ? [['anbieter', t('werkbank.postfaecher.anmeldung-per-oauth-2')] as const] : []),
    ...(gespeichert ? [['stand', t('werkbank.postfaecher.stand')] as const] : []),
  ];
}

export function PostfachEditor({ z, id }: { z: PostfachZustand; id: string }) {
  const d = useDaten();
  const vorhanden = id !== 'neu' ? z.liste?.find((p) => p.id === id) : undefined;
  const gespeichert = vorhanden ? alsEingabe(vorhanden) : NEU;
  const [e, setE] = useState<PostfachEingabe>(gespeichert);
  const rueckkehr = useRueckkehr();
  const [meldung, setMeldung] = useState<Meldung | undefined>(rueckkehr);
  const [bestaetigt, setBestaetigt] = useState(false);
  const [sendet, setSendet] = useState(false);
  const [fehlerOrte, setFehlerOrte] = useState<Set<PostfachBereich>>(new Set());
  const ent = useEntwurf(gespeichert, e, { neu: !vorhanden, liste: '/werkbank/postfaecher', zuruecksetzen: () => { setE(gespeichert); setBestaetigt(false); setMeldung(undefined); setFehlerOrte(new Set()); } });
  const liste = postfachBereiche(e.anmeldung === 'oauth', !!vorhanden);
  // Sprungleiste und Bereiche (#1000) wie beim Mappentyp; gemerkt je Postfach. Zurück vom Anbieter: dessen Bereich offen.
  const b = useBereiche(liste, 'postfach', vorhanden ? id : null);
  useEffect(() => { if (rueckkehr && e.anmeldung === 'oauth') b.oeffne(['anbieter']); }, []); // eslint-disable-line react-hooks/exhaustive-deps -- nur beim Zurückkommen vom Anbieter
  if (id !== 'neu' && !vorhanden) return z.liste ? <div className="leer"><p>{t('werkbank.postfaecher.dieses-postfach-gibt-es')}</p></div> : <p className="leise">{t('werkbank.postfaecher.lade')}</p>;
  const setze = (x: Partial<PostfachEingabe>) => setE({ ...e, ...x });
  const eingabe = { ...e, unverschluesseltBestaetigt: bestaetigt };

  async function speichern() {
    setSendet(true); setFehlerOrte(new Set());
    try {
      const l = vorhanden ? await api.postfachAendern(vorhanden.id, eingabe) : await api.postfachAnlegen(eingabe);
      z.setListe(l);
      setMeldung({ art: 'gut', text: t('werkbank.postfaecher.gespeichert') });
      const n = vorhanden && l.find((p) => p.id === vorhanden.id);
      setE(n ? alsEingabe(n) : { ...e, passwort: '' });
      if (!vorhanden) { b.merke(l[l.length - 1].id); loeseWache(); geheZu(`/werkbank/postfaecher/${l[l.length - 1].id}`, true); }
    } catch (x) {
      setMeldung({ art: 'schlecht', text: (x as Error).message });
      // Fehlermeldungen öffnen den betroffenen Bereich (#1000): der Server nennt ihn, sonst die Verbindung.
      const orte = fehlerBereiche(x, liste, ['verbindung']);
      setFehlerOrte(new Set(orte)); b.oeffne(orte);
    } finally { setSendet(false); }
  }
  // „Verbindung testen“ und „Jetzt abrufen“ (#986): Ergebnis und Fehler stehen unter den Knöpfen, nicht oben.
  async function testen(): Promise<KnopfErgebnis> {
    // Gespeichertes Geheimnis nur an den gespeicherten Server (#358) – der Server lehnt es sonst ebenso ab.
    if (vorhanden && !gleicherServer(e, vorhanden) && (e.anmeldung === 'oauth' || !e.passwort)) {
      return { art: 'schlecht', text: e.anmeldung === 'oauth'
        ? t('werkbank.postfaecher.server-port-oder-verschluesselung')
        : t('werkbank.postfaecher.server-port-oder-verschluesselung-2') };
    }
    const r = await api.postfachTesten({ ...eingabe, id: vorhanden?.id });
    return { art: r.ok ? 'gut' : 'schlecht', text: r.text };
  }
  async function abrufen(): Promise<KnopfErgebnis | undefined> {
    if (!vorhanden) return;
    try {
      const r = await api.postfachAbrufen(vorhanden.id);
      await d.neuLaden();
      return { art: 'gut', text: r.uebernommen ? t('werkbank.postfaecher.mails-uebernommen', { anzahl: r.uebernommen }) : t('werkbank.postfaecher.keine-neuen-mails') };
    } finally { await z.laden(); }
  }
  async function loeschen() {
    if (!vorhanden || !(await rueckfrage({ titel: t('werkbank.postfaecher.postfach-entfernen', { name: vorhanden.name }), text: t('werkbank.postfaecher.die-mails-im-postfach'), ja: t('werkbank.postfaecher.entfernen'), gefahr: true }))) return;
    try { await api.postfachLoeschen(vorhanden.id); await z.laden(); loeseWache(); geheZu('/werkbank/postfaecher'); } catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); }
  }

  const hatFehler = (k: PostfachBereich) => fehlerOrte.has(k);
  const klappe = (k: PostfachBereich) => b.klappe(k, hatFehler(k));
  return (
    <div className="editorform">
      <div className="mappenkopf">
        <p className="ueber">{t('werkbank.postfaecher.werkbank-postfaecher')}</p>
        <h1>{vorhanden?.name || t('werkbank.postfaecher.neues-postfach')}</h1>
        <p className="leise">{tn('werkbank.postfaecher.am-besten-ein-eigenes', { code: <code>{t('werkbank.postfaecher.dms')}</code>, b: <strong>{t('werkbank.postfaecher.app-passwort')}</strong>, b2: <strong>{t('werkbank.postfaecher.oauth-2-0')}</strong> })}</p>
      </div>
      {b.leiste(hatFehler, t('werkbank.postfaecher.bereiche'))}
      {meldung && <div className={`hinweis ${meldung.art}`} role="status"><p>{meldung.text}</p></div>}
      <form id="pf-formular" className="editorform" onSubmit={(x) => { x.preventDefault(); void speichern(); }} onKeyDown={ent.tasten}>
        <Bereich id="grunddaten" titel={t('werkbank.postfaecher.bereich.grunddaten')} klappe={klappe('grunddaten')}
          kurz={[e.name, e.aktiv ? t('werkbank.postfaecher.bereich.an') : t('werkbank.postfaecher.aus')].filter(Boolean).join(' · ')}>
          <label className="haken"><input id="pf-aktiv" type="checkbox" checked={e.aktiv} onChange={(x) => setze({ aktiv: x.target.checked })} /><span>{t('werkbank.postfaecher.abrufen')}</span></label>
          <div className="raster">
            <label className="eigenschaft"><span>{t('werkbank.postfaecher.name')}</span><input id="pf-name" value={e.name} maxLength={80} placeholder={t('werkbank.postfaecher.z-b-rechnungen')} onChange={(x) => setze({ name: x.target.value })} /></label>
            <label className="eigenschaft"><span>{tn('werkbank.postfaecher.fuer', { klein: <small>{t('werkbank.postfaecher.optional-steht-an-jeder')}</small> })}</span>
              <select id="pf-fuer" value={e.fuer ?? ''} onChange={(x) => setze({ fuer: x.target.value || null })}>
                <option value="">{t('werkbank.postfaecher.niemand')}</option>
                {d.personen.filter((p) => p.aktiv !== false).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select></label>
          </div>
        </Bereich>
        <Verbindung e={e} vorhanden={vorhanden} setze={setze} bestaetigt={bestaetigt} setBestaetigt={setBestaetigt} klappe={klappe('verbindung')} testen={testen} />
        <Bereich id="abholen" titel={t('werkbank.postfaecher.bereich.abholen')} klappe={klappe('abholen')}
          kurz={t('werkbank.postfaecher.bereich.abholen.kurz', { ordner: e.ordner, anzahl: e.abstand })}>
          <div className="raster">
            <label className="eigenschaft"><span>{t('werkbank.postfaecher.ordner')}</span><input id="pf-ordner" value={e.ordner} onChange={(x) => setze({ ordner: x.target.value })} /></label>
            <label className="eigenschaft"><span>{tn('werkbank.postfaecher.abrufabstand', { klein: <small>{t('werkbank.postfaecher.in-minuten')}</small> })}</span><input id="pf-abstand" type="number" min={1} max={1440} value={e.abstand} onChange={(x) => setze({ abstand: Number(x.target.value) })} /></label>
            <label className="eigenschaft"><span>{tn('werkbank.postfaecher.nur-von-diesen-absendern', { klein: <small>{t('werkbank.postfaecher.adressen-oder-domains-durch')}</small> })}</span>
              <input id="pf-absender" value={Array.isArray(e.absender) ? e.absender.join(', ') : e.absender} placeholder={t('werkbank.postfaecher.rechnung-stadtwerke-example-bank')} onChange={(x) => setze({ absender: x.target.value })} /></label>
            <label className="eigenschaft"><span>{t('werkbank.postfaecher.nach-dem-uebernehmen')}</span>
              <select id="pf-nachher" value={e.nachher} onChange={(x) => setze({ nachher: x.target.value as PostfachEingabe['nachher'] })}>
                <option value="verschieben">{t('werkbank.postfaecher.in-einen-ordner-verschieben')}</option><option value="gelesen">{t('werkbank.postfaecher.nur-als-gelesen-markieren')}</option><option value="loeschen">{t('werkbank.postfaecher.loeschen')}</option>
              </select></label>
            {e.nachher === 'verschieben' && <label className="eigenschaft"><span>{tn('werkbank.postfaecher.ordner-fuer-uebernommenes', { klein: <small>{t('werkbank.postfaecher.wird-bei-bedarf-angelegt')}</small> })}</span><input id="pf-zielordner" value={e.zielordner} onChange={(x) => setze({ zielordner: x.target.value })} /></label>}
          </div>
          <label className="haken"><input id="pf-anhang" type="checkbox" checked={e.nurMitAnhang} onChange={(x) => setze({ nurMitAnhang: x.target.checked })} /><span>{tn('werkbank.postfaecher.nur-mails-mit-anhang', { klein: <small className="leise">{t('werkbank.postfaecher.andere-bleiben-unveraendert-im')}</small> })}</span></label>
          <label className="haken"><input id="pf-original" type="checkbox" checked={e.original} onChange={(x) => setze({ original: x.target.checked })} /><span>{t('werkbank.postfaecher.original-mail-als-eml')}</span></label>
        </Bereich>
      </form>
      {/* Die App beim Anbieter gilt für alle Postfächer (und den E-Mail-Versand) – darum mit eigenem Speichern (#370). */}
      {e.anmeldung === 'oauth' && (
        <Bereich id="anbieter" titel={t('werkbank.postfaecher.anmeldung-per-oauth-2')} hilfe={<Hilfe ort="werkbank.postfaecher.oauth" />} klappe={klappe('anbieter')}
          kurz={vorhanden?.oauth?.zustand === 'ok' ? t('werkbank.postfaecher.bereich.angemeldet') : t('werkbank.postfaecher.nicht-angemeldet')}>
          <OAuthBereich anbieter={e.anbieter ?? 'microsoft'} ziel={vorhanden?.anmeldung === 'oauth' ? postfachZiel(vorhanden, z) : undefined} geaendert={ent.geaendert} setMeldung={setMeldung} eingebettet />
        </Bereich>
      )}
      {vorhanden && <PostfachStand p={vorhanden} klappe={klappe('stand')} geaendert={ent.geaendert} abrufen={abrufen} />}
      <Speicherleiste ent={ent} gegenstand={t('werkbank.postfaecher.postfach')} sendet={sendet} formular="pf-formular"
        links={vorhanden && <Knopf art="link" className="gefahr" onClick={loeschen}>{t('werkbank.postfaecher.postfach-entfernen-2')}</Knopf>} />
    </div>
  );
}

/** Verbindung zum IMAP-Server (#196, #358): Server, Anmeldung, Passwort – mit „Verbindung testen“. */
function Verbindung({ e, vorhanden, setze, bestaetigt, setBestaetigt, klappe, testen }: {
  e: PostfachEingabe; vorhanden?: PostfachAnsicht; setze: (x: Partial<PostfachEingabe>) => void; bestaetigt: boolean; setBestaetigt: (x: boolean) => void; klappe: Klappe; testen: () => Promise<KnopfErgebnis>;
}) {
  return (
    <Bereich id="verbindung" titel={t('werkbank.postfaecher.bereich.verbindung')} klappe={klappe}
      kurz={[e.benutzer, e.server, e.anmeldung === 'oauth' ? t('werkbank.postfaecher.oauth-2-0') : ''].filter(Boolean).join(' · ')}>
      <div className="raster">
        <label className="eigenschaft"><span>{t('werkbank.postfaecher.server')}</span><input id="pf-server" value={e.server} placeholder="imap.example.org" onChange={(x) => setze({ server: x.target.value.trim() })} /></label>
        <label className="eigenschaft"><span>{t('werkbank.postfaecher.verschluesselung')}</span>
          <select id="pf-verschluesselung" value={e.verschluesselung} onChange={(x) => { const v = x.target.value as PostfachEingabe['verschluesselung']; setze({ verschluesselung: v, port: PORT[v] }); }}>
            <option value="ssl">{t('werkbank.postfaecher.ssl-tls-meist-port')}</option><option value="starttls">{t('werkbank.postfaecher.starttls-meist-port-143')}</option><option value="keine" disabled={e.anmeldung === 'oauth'}>{t('werkbank.postfaecher.keine-unsicher')}</option>
          </select></label>
        <label className="eigenschaft"><span>{t('werkbank.postfaecher.port')}</span><input id="pf-port" type="number" min={1} max={65535} value={e.port} onChange={(x) => setze({ port: Number(x.target.value) })} /></label>
        <label className="eigenschaft"><span>{tn('werkbank.postfaecher.anmeldung', { hilfe: <Hilfe ort="werkbank.postfaecher.oauth" /> })}</span>
          <select id="pf-anmeldung" value={e.anmeldung ?? 'passwort'} onChange={(x) => {
            const anmeldung = x.target.value as 'passwort' | 'oauth';
            const vor = ANBIETER[e.anbieter ?? 'microsoft'].server;
            setze({ anmeldung, ...(anmeldung === 'oauth' && vor && !e.server ? { server: vor, port: 993, verschluesselung: 'ssl' } : anmeldung === 'oauth' && e.verschluesselung === 'keine' ? { verschluesselung: 'ssl', port: 993 } : {}) });
          }}>
            <option value="passwort">{t('werkbank.postfaecher.passwort-oder-app-passwort')}</option><option value="oauth">{t('werkbank.postfaecher.oauth-2-0-microsoft')}</option>
          </select></label>
        {e.anmeldung === 'oauth' && <label className="eigenschaft"><span>{t('werkbank.postfaecher.anbieter')}</span>
          <select id="pf-anbieter" value={e.anbieter ?? 'microsoft'} onChange={(x) => {
            const anbieter = x.target.value as OAuthAnbieter;
            const vor = ANBIETER[anbieter].server;
            // Server nur vorbelegen, wenn er leer ist oder noch die Voreinstellung eines anderen Anbieters trägt.
            const ersetzen = vor && (!e.server || Object.values(ANBIETER).some((a) => a.server === e.server));
            setze({ anbieter, ...(ersetzen ? { server: vor, port: 993, verschluesselung: 'ssl' } : {}) });
          }}>
            {(Object.keys(ANBIETER) as OAuthAnbieter[]).map((a) => <option key={a} value={a}>{ANBIETER[a].name}</option>)}
          </select></label>}
        <label className="eigenschaft"><span>{tn('werkbank.postfaecher.benutzername', { wert: e.anmeldung === 'oauth' && <small>{t('werkbank.postfaecher.die-mail-adresse-des')}</small> })}</span><input id="pf-benutzer" value={e.benutzer} autoComplete="off" onChange={(x) => setze({ benutzer: x.target.value })} /></label>
        {e.anmeldung !== 'oauth' && <label className="eigenschaft"><span>{tn('werkbank.postfaecher.passwort', { klein: <small>{vorhanden?.passwortGesetzt ? (gleicherServer(e, vorhanden) ? t('werkbank.postfaecher.gespeichert-leer-lassen-um') : t('werkbank.postfaecher.server-geaendert-bitte-neu')) : t('werkbank.postfaecher.wird-verschluesselt-gespeichert')}</small> })}</span>
          <input id="pf-passwort" type="password" autoComplete="new-password" value={e.passwort ?? ''} onChange={(x) => setze({ passwort: x.target.value })} /></label>}
      </div>
      {e.verschluesselung === 'keine' && vorhanden?.verschluesselung !== 'keine' && (
        <div className="hinweis schlecht"><p>{t('werkbank.postfaecher.ohne-verschluesselung-gehen-passwort')}</p>
          <label className="haken"><input id="pf-unsicher" type="checkbox" checked={bestaetigt} onChange={(x) => setBestaetigt(x.target.checked)} /><span>{t('werkbank.postfaecher.trotzdem-ohne-verschluesselung')}</span></label></div>
      )}
      <div className="knoepfe"><Knopf onClick={testen} laeuftText={t('werkbank.postfaecher.verbinde')}>{t('werkbank.postfaecher.verbindung-testen')}</Knopf></div>
    </Bereich>
  );
}

/** Stand des Abrufs (#196): letzter und nächster Abruf, „Jetzt abrufen“ (Sofortaktion), zuletzt Übernommenes und Fehler. */
function PostfachStand({ p, klappe, geaendert, abrufen }: { p: PostfachAnsicht; klappe: Klappe; geaendert: boolean; abrufen: () => Promise<KnopfErgebnis | undefined> }) {
  const s = p.stand;
  return (
    <Bereich id="stand" titel={t('werkbank.postfaecher.stand')} klappe={klappe}
      kurz={[s.letzterAbruf ? t('werkbank.postfaecher.zuletzt', { zeit: zeit(s.letzterAbruf) }) : t('werkbank.postfaecher.noch-nicht-abgerufen'), s.fehlerFolge > 0 ? t('werkbank.postfaecher.fehler') : ''].filter(Boolean).join(' · ')}>
      <dl className="eigenschaften">
        <dt>{t('werkbank.postfaecher.letzter-abruf')}</dt><dd>{s.letzterAbruf ? zeit(s.letzterAbruf) : '–'}</dd>
        {s.naechsterAbruf && <><dt>{t('werkbank.postfaecher.naechster-versuch')}</dt><dd>{zeit(s.naechsterAbruf)}{s.fehlerFolge > 1 ? t('werkbank.postfaecher.nach-fehlern-mit-laengerem', { fehlerFolge: s.fehlerFolge }) : ''}</dd></>}
      </dl>
      <div className="knoepfe"><Knopf gesperrt={geaendert && t('werkbank.postfaecher.erst-speichern')} onClick={abrufen} laeuftText={t('werkbank.postfaecher.rufe-ab')}>{t('werkbank.postfaecher.jetzt-abrufen')}</Knopf></div>
      {s.uebernommen.length > 0 && <><h3 className="h4">{t('werkbank.postfaecher.zuletzt-uebernommen')}</h3>
        <ul>{s.uebernommen.map((u) => <li key={`${u.zeit}-${u.mappeId}`}>{zeit(u.zeit)}: {u.mappeId ? <Link to={`/ablage/eingang/${u.mappeId}`} className="verweis">{u.betreff || t('werkbank.postfaecher.ohne-betreff')}</Link> : u.betreff} <span className="leise">– {u.absender}</span></li>)}</ul></>}
      {s.fehler.length > 0 && <><h3 className="h4">{t('werkbank.postfaecher.fehler')}</h3><ul>{s.fehler.map((f) => <li key={f.zeit}>{zeit(f.zeit)}: {f.fehler}</li>)}</ul></>}
    </Bereich>
  );
}

/** Was angemeldet wird: ein Postfach (#358) oder der E-Mail-Versand (#813). */
export interface OAuthZiel {
  oauth: OAuthStatus | null | undefined;
  start(): Promise<{ url: string }>;
  geraet(): Promise<{ code: string; adresse: string; bis: string; intervall: number }>;
  geraetPruefen(): Promise<{ fertig: boolean; text: string }>;
  abmelden(): Promise<void>;
  neuLaden(): Promise<void>;
}

function postfachZiel(p: PostfachAnsicht, z: PostfachZustand): OAuthZiel {
  return {
    oauth: p.oauth,
    start: () => api.postfachOAuthStart(p.id),
    geraet: () => api.postfachOAuthGeraet(p.id),
    geraetPruefen: () => api.postfachOAuthGeraetPruefen(p.id),
    abmelden: async () => { z.setListe(await api.postfachOAuthAbmelden(p.id)); },
    neuLaden: z.laden,
  };
}

/**
 * OAuth 2.0 (#358): App-Registrierung des Anbieters (je Installation) und Anmeldung des Postfachs –
 * im Browser (Autorisierungscode mit PKCE) oder mit Gerätecode. Token sieht die Oberfläche nie.
 * Seit #813 auch für den E-Mail-Versand (`versand`): dieselbe App, eigene Anmeldung.
 */
export function OAuthBereich({ anbieter, ziel, geaendert, setMeldung, versand = false, eingebettet = false }: { anbieter: OAuthAnbieter; ziel?: OAuthZiel; geaendert: boolean; setMeldung: (m: Meldung | undefined) => void; versand?: boolean; eingebettet?: boolean }) {
  const [stand, setStand] = useState<OAuthAppsStand>();
  const appAus = (st: OAuthAppsStand | undefined): OAuthAppEingabe => {
    const a = st?.apps[anbieter];
    return { clientId: a?.clientId ?? '', clientSecret: '', tenant: a?.tenant ?? (anbieter === 'microsoft' ? 'common' : ''), autorisierung: a?.autorisierung ?? '', token: a?.token ?? '', geraet: a?.geraet ?? '', bereich: a?.bereich ?? '' };
  };
  const appGespeichert = appAus(stand);
  const [app, setApp] = useState<OAuthAppEingabe>(appGespeichert);
  const [sendet, setSendet] = useState(false);
  // App-Registrierung (#370): eigenes Formular mit Speicherleiste; gilt für alle Postfächer dieses Anbieters.
  const appEnt = useEntwurf(appGespeichert, app, { neu: !stand?.apps[anbieter], aus: !stand, zuruecksetzen: () => setApp(appGespeichert) });
  const [geraet, setGeraet] = useState<{ code: string; adresse: string; bis: string; intervall: number }>();
  useEffect(() => {
    void api.postfachOAuthApps().then((st) => { setStand(st); setApp(appAus(st)); })
      .catch((x) => setMeldung({ art: 'schlecht', text: (x as Error).message }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- appAus hängt nur am Anbieter
  }, [anbieter, setMeldung]);
  // Gerätecode: im angegebenen Abstand nachfragen, bis angemeldet, abgelehnt oder abgelaufen.
  const neuLaden = ziel?.neuLaden;
  const geraetPruefen = ziel?.geraetPruefen;
  useEffect(() => {
    if (!geraet || !geraetPruefen) return;
    let aus = false;
    const uhr = setInterval(() => {
      if (aus) return;
      if (Date.parse(geraet.bis) < Date.now()) { setGeraet(undefined); setMeldung({ art: 'schlecht', text: t('werkbank.postfaecher.der-geraetecode-ist-abgelaufen') }); return; }
      void geraetPruefen().then(async (r) => {
        if (r.fertig && !aus) { aus = true; setGeraet(undefined); setMeldung({ art: 'gut', text: versand ? t('werkbank.mail.oauth.angemeldet') : t('werkbank.postfaecher.beim-anbieter-angemeldet-mit') }); await neuLaden?.(); }
      }).catch((x) => { aus = true; setGeraet(undefined); setMeldung({ art: 'schlecht', text: (x as Error).message }); });
    }, Math.max(geraet.intervall, 2) * 1000);
    return () => { aus = true; clearInterval(uhr); };
  }, [geraet, geraetPruefen, setMeldung, neuLaden, versand]);

  const gespeichert = stand?.apps[anbieter];
  async function appSpeichern() {
    setSendet(true);
    try { const st = await api.postfachOAuthApp(anbieter, app); setStand(st); setApp(appAus(st)); setMeldung({ art: 'gut', text: t('werkbank.postfaecher.app-gespeichert') }); } catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); } finally { setSendet(false); }
  }
  async function imBrowser() {
    if (!ziel) return;
    try {
      const { url } = await ziel.start();
      if (!/^https?:\/\//.test(url)) throw new Error(t('werkbank.postfaecher.unerwartete-adresse-des-anbieters'));
      location.assign(url);
    } catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); }
  }
  async function mitGeraetecode() {
    if (!ziel) return;
    try { setGeraet(await ziel.geraet()); setMeldung(undefined); } catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); }
  }
  async function abmelden() {
    if (!ziel || !(await rueckfrage({ titel: t('werkbank.postfaecher.anmeldung-entfernen'), text: versand ? t('werkbank.mail.oauth.abmelden.text') : t('werkbank.postfaecher.ablago-loescht-die-gespeicherten'), ja: t('werkbank.postfaecher.abmelden'), gefahr: true }))) return;
    try { await ziel.abmelden(); setMeldung({ art: 'gut', text: t('werkbank.postfaecher.abgemeldet') }); } catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); }
  }

  const o = ziel?.oauth;
  const zeitpunkt = (iso: string | null) => (iso ? zeit(iso) : '–');
  const inhalt = (
    <>
      {versand && <p className="leise klein">{anbieter === 'microsoft' ? t('werkbank.mail.oauth.app.microsoft') : t('werkbank.mail.oauth.app.google')}</p>}
      {anbieter === 'google' && <div className="hinweis"><p>{tn('werkbank.postfaecher.dann-ist-ein-einfacher', { b: <strong>{t('werkbank.postfaecher.privates-gmail-konto')}</strong>, b2: <strong>{t('werkbank.postfaecher.app-passwort')}</strong> })}</p></div>}
      <form onSubmit={(x) => { x.preventDefault(); void appSpeichern(); }} onKeyDown={appEnt.tasten}>
      <h3 className="h4">{tn('werkbank.postfaecher.app-beim-anbieter', { klein: <small className="leise">{versand ? t('werkbank.mail.oauth.app.gilt') : t('werkbank.postfaecher.gilt-fuer-alle-postfaecher')}</small> })}</h3>
      <div className="raster">
        <label className="eigenschaft"><span>{tn('werkbank.postfaecher.client-id', { klein: <small>{t('werkbank.postfaecher.anwendungs-id')}</small> })}</span><input id="pf-oauth-client" value={app.clientId} autoComplete="off" onChange={(x) => setApp({ ...app, clientId: x.target.value })} /></label>
        <label className="eigenschaft"><span>{tn('werkbank.postfaecher.client-geheimnis', { klein: <small>{gespeichert?.secretGesetzt ? t('werkbank.postfaecher.gespeichert-leer-lassen-um') : t('werkbank.postfaecher.wird-verschluesselt-gespeichert-leer')}</small> })}</span>
          <input id="pf-oauth-geheimnis" type="password" autoComplete="new-password" value={app.clientSecret ?? ''} onChange={(x) => setApp({ ...app, clientSecret: x.target.value })} /></label>
        {anbieter === 'microsoft' && <label className="eigenschaft"><span>{tn('werkbank.postfaecher.mandant-tenant', { klein: <small>{t('werkbank.postfaecher.common-consumers-nur-outlook')}</small> })}</span><input id="pf-oauth-tenant" value={app.tenant ?? ''} onChange={(x) => setApp({ ...app, tenant: x.target.value.trim() })} /></label>}
        {anbieter === 'andere' && <>
          <label className="eigenschaft"><span>{t('werkbank.postfaecher.autorisierungs-endpunkt')}</span><input id="pf-oauth-autorisierung" value={app.autorisierung ?? ''} placeholder="https://…/authorize" onChange={(x) => setApp({ ...app, autorisierung: x.target.value.trim() })} /></label>
          <label className="eigenschaft"><span>{t('werkbank.postfaecher.token-endpunkt')}</span><input id="pf-oauth-token" value={app.token ?? ''} placeholder="https://…/token" onChange={(x) => setApp({ ...app, token: x.target.value.trim() })} /></label>
          <label className="eigenschaft"><span>{tn('werkbank.postfaecher.geraetecode-endpunkt', { klein: <small>{t('werkbank.postfaecher.optional')}</small> })}</span><input id="pf-oauth-geraet" value={app.geraet ?? ''} onChange={(x) => setApp({ ...app, geraet: x.target.value.trim() })} /></label>
          <label className="eigenschaft"><span>{tn('werkbank.postfaecher.bereich-scope', { klein: <small>{t('werkbank.postfaecher.mit-leerzeichen-getrennt-meist')}</small> })}</span><input id="pf-oauth-bereich" value={app.bereich ?? ''} onChange={(x) => setApp({ ...app, bereich: x.target.value })} /></label>
        </>}
      </div>
      <p className="leise klein">{t('werkbank.postfaecher.umleitungs-uri-fuer-die')}{' '}{stand?.rueckruf ? <><code>{stand.rueckruf}</code>{!rueckrufOk(stand.rueckruf) && t('werkbank.postfaecher.ohne-https-geht-die')}</> : <>{tn('werkbank.postfaecher.erst-nach-eintrag-der', { link: <Link to="/werkbank/betrieb" className="verweis">{t('werkbank.postfaecher.e-mail-und-adresse')}</Link>, wert: ANBIETER[anbieter].geraet ? t('werkbank.postfaecher.oder-mit-geraetecode-anmelden') : '' })}</>}</p>
      <Speicherleiste ent={appEnt} gegenstand={t('werkbank.postfaecher.app')} sendet={sendet} />
      </form>

      <h3 className="h4">{versand ? t('werkbank.mail.oauth.anmelden') : t('werkbank.postfaecher.postfach-anmelden')}</h3>
      {!ziel || geaendert ? <p className="leise">{versand ? t('werkbank.mail.oauth.erst-speichern') : t('werkbank.postfaecher.erst-das-postfach-speichern')}</p> : (
        <>
          <dl className="eigenschaften">
            <dt>{t('werkbank.postfaecher.zustand')}</dt><dd>{o?.zustand === 'ok' ? t('werkbank.postfaecher.angemeldet-am', { zeitpunkt: zeitpunkt(o.angemeldetAm), wert: o.von ? t('werkbank.postfaecher.von', { von: o.von }) : '' }) : o?.zustand === 'abgelaufen' ? <strong>{t('werkbank.postfaecher.abgelaufen-oder-entzogen-bitte')}</strong> : t('werkbank.postfaecher.nicht-angemeldet')}</dd>
            {o?.fehler && <><dt>{t('werkbank.postfaecher.grund')}</dt><dd>{o.fehler}</dd></>}
          </dl>
          {geraet && <div className="hinweis info" role="status"><p>{tn('werkbank.postfaecher.oeffne-auf-einem-beliebigen', { link: <a href={geraet.adresse} target="_blank" rel="noreferrer noopener" className="verweis">{geraet.adresse} ↗</a>, b: <strong className="mono">{geraet.code}</strong>, zeit: zeit(geraet.bis) })}</p></div>}
          <div className="knoepfe">
            <button type="button" className="knopf primaer" disabled={!gespeichert?.clientId || !stand?.rueckruf || !rueckrufOk(stand.rueckruf) || appEnt.geaendert} title={!stand?.rueckruf ? t('werkbank.postfaecher.ohne-adresse-von-ablago') : !rueckrufOk(stand.rueckruf) ? t('werkbank.postfaecher.nur-mit-https-adresse') : appEnt.geaendert ? t('werkbank.postfaecher.erst-die-app-speichern') : undefined} onClick={() => void imBrowser()}>{t('werkbank.postfaecher.im-browser-anmelden')}</button>
            {ANBIETER[anbieter].geraet && <button type="button" className="knopf" disabled={!gespeichert?.clientId || !!geraet || appEnt.geaendert} onClick={() => void mitGeraetecode()}>{t('werkbank.postfaecher.mit-geraetecode-anmelden')}</button>}
            {o && o.zustand !== 'abgemeldet' && <button type="button" className="knopf gefahr-rand" onClick={() => void abmelden()}>{t('werkbank.postfaecher.abmelden')}</button>}
          </div>
        </>
      )}
    </>
  );
  // Im Postfach-Editor (#1000) steht der Inhalt in seinem Bereich, der Titel und Hilfe trägt.
  if (eingebettet) return inhalt;
  return (
    <div className="blatt">
      <h2 className="h3">{t('werkbank.postfaecher.anmeldung-per-oauth-2')} <Hilfe ort="werkbank.postfaecher.oauth" /></h2>
      {inhalt}
    </div>
  );
}
