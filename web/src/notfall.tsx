import { useEffect, useState, type FormEvent } from 'react';
import { NOTFALL_SPERRE_SEKUNDEN, NOTFALLCODE_LAENGE, normiereNotfallcode } from '../../shared/src/notfallcode';
import { PASSWORT_MINDESTLAENGE } from '../../shared/src/model';
import { Marke } from './Marke';
import { t } from './sprache';
import { Symbol } from './Symbol';
import { Feld, Knopf } from './bausteine';
import { sprache } from '../../shared/src/sprache';

/**
 * Notfallzugang mit dem Notfallcode vom Notfallblatt (#815), auf `/notfall` – ohne Anmeldung, zuerst fürs Handy gebaut.
 *
 *   1 Notfallcode eingeben · 2 Konto wählen (erst nach richtigem Code) · 3 neues Passwort · 4 neues Notfallblatt · anmelden
 *
 * Jede Fehleingabe sperrt die Eingabe 30 Sekunden mit sichtbarem Countdown (der Server zählt je Adressbereich). Die
 * Seite lädt keinen Kontostatus und schickt keine Cookies mit; der Code bleibt nur im Speicher dieser Seite.
 */

interface Konto { id: string; name: string; email: string }
type Schritt = { art: 'code' } | { art: 'konto'; konten: Konto[] } | { art: 'passwort'; konto: Konto } | { art: 'blatt'; email: string; blatt: string };

async function sende<T>(url: string, body?: unknown): Promise<{ ok: true; daten: T } | { ok: false; fehler: string; warten?: number }> {
  try {
    const r = await fetch(url, {
      method: body === undefined ? 'GET' : 'POST', credentials: 'omit', cache: 'no-store',
      headers: { 'x-dms': '1', 'x-sprache': sprache(), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const d = await r.json().catch(() => null) as (T & { fehler?: string; details?: { warten?: number } }) | null;
    if (!r.ok) return { ok: false, fehler: d?.fehler ?? t('konten.notfall.seite.fehler'), warten: d?.details?.warten };
    return { ok: true, daten: d as T };
  } catch { return { ok: false, fehler: t('konten.notfall.seite.verbindung') }; }
}

export function Notfallseite() {
  const [stand, setStand] = useState<{ erlaubt: boolean; warten: number } | null>(null);
  const [schritt, setSchritt] = useState<Schritt>({ art: 'code' });
  const [code, setCode] = useState('');
  const [fehler, setFehler] = useState<string>();
  const [warten, setWarten] = useState(0);
  const [laeuft, setLaeuft] = useState(false);

  useEffect(() => {
    document.title = t('konten.notfall.seite.titel');
    const robots = document.createElement('meta'); robots.name = 'robots'; robots.content = 'noindex, nofollow';
    document.head.appendChild(robots);
    void sende<{ erlaubt: boolean; warten: number }>('/api/notfall').then((r) => {
      if (r.ok) { setStand(r.daten); setWarten(r.daten.warten); } else { setStand({ erlaubt: false, warten: 0 }); setFehler(r.fehler); }
    });
  }, []);
  // Sichtbarer Countdown von 30 auf 0; erst danach geht eine neue Eingabe.
  useEffect(() => {
    if (warten <= 0) return;
    const z = setTimeout(() => setWarten((w) => Math.max(0, w - 1)), 1000);
    return () => clearTimeout(z);
  }, [warten]);

  const falsch = (r: { fehler: string; warten?: number }) => {
    setFehler(r.fehler);
    if (r.warten) setWarten(r.warten);
  };

  async function pruefen(e: FormEvent) {
    e.preventDefault();
    setLaeuft(true); setFehler(undefined);
    const r = await sende<{ konten: Konto[] }>('/api/notfall/pruefen', { code });
    setLaeuft(false);
    if (!r.ok) { falsch(r); return; }
    setSchritt({ art: 'konto', konten: r.daten.konten });
  }

  const codeOk = !!normiereNotfallcode(code);
  return (
    <main className="kartenseite notfall-seite">
      <div className="karte notfall-karte">
        <div className="marke"><Marke logo={null} schriftzug="Ablago" /></div>
        <h1>{t('konten.notfall.seite.titel')}</h1>
        {!stand ? <p className="leise" aria-busy="true">…</p>
          : !stand.erlaubt ? (
            <div className="stapel">
              <p className="hinweis schlecht" role="alert">{fehler ?? t('konten.notfall.fehler.heimnetz')}</p>
              <p className="leise klein">{t('konten.notfall.seite.heimnetz.rat')}</p>
            </div>
          ) : schritt.art === 'code' ? (
            <form className="notfall-form" onSubmit={(e) => void pruefen(e)}>
              <p>{t('konten.notfall.seite.einleitung')}</p>
              <Feld beschriftung={t('konten.notfall.seite.code')} hinweis={t('konten.notfall.seite.code.hinweis', { anzahl: NOTFALLCODE_LAENGE })}>
                <input value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" autoCapitalize="characters" autoCorrect="off" spellCheck={false}
                  required maxLength={60} placeholder={t('konten.notfall.seite.code.platzhalter')} className="mono notfall-code" autoFocus
                  aria-invalid={!!fehler} disabled={warten > 0} /></Feld>
              {(fehler || warten > 0) && (
                <div className="hinweis schlecht" role="alert">
                  {fehler && <p>{fehler}</p>}
                  {warten > 0 && <p className="notfall-countdown" aria-live="polite">{t('konten.notfall.seite.countdown', { sekunden: warten })}</p>}
                </div>
              )}
              <Knopf art="haupt" type="submit" laeuft={laeuft} laeuftText={t('konten.notfall.seite.pruefe')} gesperrt={warten > 0 || !codeOk}>{t('konten.notfall.seite.weiter')}</Knopf>
              <p className="leise klein">{t('konten.notfall.seite.schluessel', { sekunden: NOTFALL_SPERRE_SEKUNDEN })}</p>
            </form>
          ) : schritt.art === 'konto' ? (
            <KontoWahl konten={schritt.konten} weiter={(k) => { setFehler(undefined); setSchritt({ art: 'passwort', konto: k }); }} />
          ) : schritt.art === 'passwort' ? (
            <NeuesPasswort konto={schritt.konto} code={code} zurueck={() => setSchritt({ art: 'code' })}
              fertig={(email, blatt) => { setCode(''); setSchritt({ art: 'blatt', email, blatt }); }} />
          ) : <NeuesBlatt email={schritt.email} blatt={schritt.blatt} />}
      </div>
    </main>
  );
}

/** Schritt 2: nur Personen, die Ablago verwalten dürfen – erst nach richtigem Code zu sehen. */
function KontoWahl({ konten, weiter }: { konten: Konto[]; weiter: (k: Konto) => void }) {
  if (!konten.length) return <p className="hinweis warn">{t('konten.notfall.seite.keine')}</p>;
  return (
    <div className="stapel">
      <p>{t('konten.notfall.seite.konto')}</p>
      <ul className="notfall-konten">
        {konten.map((k) => (
          <li key={k.id}><Knopf art="link" className="wahlkarte" onClick={() => weiter(k)}><strong>{k.name}</strong><span className="leise">{k.email}</span></Knopf></li>
        ))}
      </ul>
    </div>
  );
}

/** Schritt 3: neues Passwort direkt setzen. Zwei-Faktor und alle Anmeldungen des Kontos fallen weg. */
function NeuesPasswort({ konto, code, zurueck, fertig }: { konto: Konto; code: string; zurueck: () => void; fertig: (email: string, blatt: string) => void }) {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [fehler, setFehler] = useState<string>();
  const [laeuft, setLaeuft] = useState(false);
  async function setzen(e: FormEvent) {
    e.preventDefault();
    if (pw !== pw2) { setFehler(t('konten.notfall.seite.ungleich')); return; }
    setLaeuft(true); setFehler(undefined);
    const r = await sende<{ email: string; blatt: string }>('/api/notfall/einloesen', { code, konto: konto.id, passwort: pw });
    setLaeuft(false);
    if (!r.ok) { setFehler(r.fehler); return; }
    fertig(r.daten.email, r.daten.blatt);
  }
  return (
    <form className="notfall-form" onSubmit={(e) => void setzen(e)}>
      <p>{t('konten.notfall.seite.passwort', { name: konto.name })}</p>
      <input type="email" value={konto.email} autoComplete="username" readOnly hidden />
      <Feld beschriftung={t('konten.notfall.seite.passwort.neu')} hinweis={t('konten.notfall.seite.passwort.laenge', { anzahl: PASSWORT_MINDESTLAENGE })}>
        <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" minLength={PASSWORT_MINDESTLAENGE} required autoFocus /></Feld>
      <Feld beschriftung={t('konten.notfall.seite.passwort.wieder')}>
        <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" required /></Feld>
      <div className="hinweis warn"><p>{t('konten.notfall.seite.folgen')}</p></div>
      {fehler && <p className="hinweis schlecht" role="alert">{fehler}</p>}
      <Knopf art="haupt" type="submit" laeuft={laeuft} laeuftText={t('konten.notfall.seite.setze')}>{t('konten.notfall.seite.setzen')}</Knopf>
      <Knopf art="link" onClick={zurueck}>{t('konten.notfall.seite.abbrechen')}</Knopf>
    </form>
  );
}

/** Schritt 4: Der alte Code gilt nicht mehr – ein neues Notfallblatt (mit neuem Code) ist Pflicht, dann anmelden. */
function NeuesBlatt({ email, blatt }: { email: string; blatt: string }) {
  const [geladen, setGeladen] = useState(false);
  return (
    <div className="stapel" role="status">
      <p className="hinweis gut"><Symbol name="haken" /> {t('konten.notfall.seite.gesetzt', { email })}</p>
      <p>{t('konten.notfall.seite.blatt')}</p>
      <a className={`knopf${geladen ? '' : ' primaer'}`} href={`/api/notfall/blatt?schluessel=${encodeURIComponent(blatt)}`} download onClick={() => setGeladen(true)}><Symbol name="herunterladen" />{t('konten.notfall.seite.blatt.knopf')}</a>
      {geladen ? <p className="gutertext klein">{t('konten.notfall.seite.blatt.geladen')}</p> : <p className="leise klein">{t('konten.notfall.seite.blatt.pflicht')}</p>}
      <Knopf art="haupt" gesperrt={geladen ? false : t('konten.notfall.seite.blatt.pflicht')} onClick={() => location.assign('/')}>{t('konten.notfall.seite.anmelden')}</Knopf>
    </div>
  );
}
