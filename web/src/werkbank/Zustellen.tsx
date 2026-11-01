import { useState } from 'react';
import {
  auskunftMail, CODE_EIGEN_MIN, EMAIL_WARNUNG_BYTES, LINK_ABRUFE_MAX, LINK_ABRUFE_STANDARD, LINK_FEHLVERSUCHE_MAX, LINK_STATUS, LINK_TAGE_MAX, LINK_TAGE_STANDARD,
  linkStatus, normiereCode, zeigeCode, type AuskunftLink, type AuskunftStand,
} from '../../../shared/src/auskunft';
import { api, type DatenschutzStand } from '../api';
import { Link } from '../ort';
import { rueckfrage } from '../rueckfrage';
import { titelOder } from '../seiten';
import type { DatenschutzZustand } from './Datenschutz';

/**
 * Auskunft zustellen (#455) – an einer bereitliegenden Auskunft:
 *   Weg 1: ZIP per E-Mail über den Versand des DMS – nur verschlüsselt, Passwort auf anderem Weg.
 *   Weg 2: Abruf-Link auf die öffentliche Abrufseite, dazu ein Abrufcode für einen anderen Kanal.
 * Vorgabe ist Weg 2, wenn die Adresse des DMS nach Internet aussieht.
 */

const MAIL_MAX = 50_000_000;
const groesse = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB`);
const zeit = (iso: string) => new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
const tag = (iso: string) => new Date(iso).toLocaleDateString('de-DE', { dateStyle: 'medium' });

async function kopiere(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

export function Zustellen({ a, s, nachher }: { a: AuskunftStand; s: DatenschutzStand; nachher(): Promise<void> }) {
  const mailGeht = a.verschluesselt && s.mail && a.bytes <= MAIL_MAX;
  const [weg, setWeg] = useState<'link' | 'email'>(s.oeffentlich || !mailGeht ? 'link' : 'email');
  const links = s.links.filter((l) => l.auskunftId === a.id);
  return (
    <div className="auskunft-zustellen" role="group" aria-label="Auskunft zustellen">
      <div className="auskunft-wege" role="radiogroup" aria-label="Weg">
        <label className={`auskunft-weg${weg === 'link' ? ' gewaehlt' : ''}`}>
          <input type="radio" name={`weg-${a.id}`} checked={weg === 'link'} onChange={() => setWeg('link')} />
          <span><span className="auskunft-weg-titel"><strong>Abruf-Link mit Abrufcode</strong>{s.oeffentlich && <span className="chip gut">empfohlen</span>}</span>
            <small>Die Person lädt die Datei auf einer schlichten Seite deines DMS herunter – nachweisbar, mit Ablaufdatum. Den Code bekommt sie auf einem anderen Weg.</small></span>
        </label>
        <label className={`auskunft-weg${weg === 'email' ? ' gewaehlt' : ''}${a.verschluesselt ? '' : ' aus'}`}>
          <input type="radio" name={`weg-${a.id}`} checked={weg === 'email'} disabled={!a.verschluesselt} onChange={() => setWeg('email')} />
          <span><span className="auskunft-weg-titel"><strong>ZIP per E-Mail</strong>{!s.oeffentlich && mailGeht && <span className="chip gut">empfohlen</span>}</span>
            <small>{a.verschluesselt ? 'Als Anhang, verschlüsselt. Das Passwort teilst du getrennt mit (Telefon, Brief).' : 'Nur für Auskünfte mit Passwort – erzeuge sie dafür mit Passwort neu.'}</small></span>
        </label>
      </div>
      {weg === 'link' ? <LinkErstellen a={a} s={s} nachher={nachher} /> : <PerEmail a={a} s={s} nachher={nachher} />}
      {links.length > 0 && <ul className="auskunft-links">{links.map((l) => <LinkZeile key={l.id} l={l} nachher={nachher} />)}</ul>}
    </div>
  );
}

function LinkErstellen({ a, s, nachher }: { a: AuskunftStand; s: DatenschutzStand; nachher(): Promise<void> }) {
  const [an, setAn] = useState('');
  const [senden, setSenden] = useState(s.mail);
  const [tage, setTage] = useState(LINK_TAGE_STANDARD);
  const [abrufe, setAbrufe] = useState(LINK_ABRUFE_STANDARD);
  const [eigen, setEigen] = useState(false);
  const [code, setCode] = useState('');
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string>();
  const [neu, setNeu] = useState<{ url: string; code: string; gesendet: boolean } | null>(null);
  const [kopiert, setKopiert] = useState<string>();
  const aktiv = s.links.some((l) => l.auskunftId === a.id && linkStatus(l) === 'aktiv');
  const codeKurz = eigen && normiereCode(code).length < CODE_EIGEN_MIN;

  async function erstellen() {
    if (aktiv && !(await rueckfrage({ titel: 'Neuen Abruf-Link erstellen?', text: 'Der bisherige Link dieser Auskunft gilt dann nicht mehr – auch sein Abrufcode nicht.', ja: 'Neuen Link erstellen' }))) return;
    setLaeuft(true); setFehler(undefined); setNeu(null);
    try {
      const r = await api.auskunftLink(a.id, { tage, abrufe, senden: senden && s.mail, ...(an.trim() ? { an: an.trim() } : {}), ...(eigen ? { code } : {}) });
      setNeu({ url: r.url, code: r.code, gesendet: r.gesendet });
      await nachher();
    } catch (e) { setFehler((e as Error).message); } finally { setLaeuft(false); }
  }
  async function kopieren(was: string, text: string) { setKopiert((await kopiere(text)) ? was : undefined); }

  return (
    <div className="auskunft-weg-inhalt">
      {!s.oeffentlich && <div className="hinweis warn"><p><strong>Ist dein DMS aus dem Internet erreichbar?</strong> Die Adresse {s.adresse ? <code>{s.adresse}</code> : 'des DMS'} sieht nach einem Heimnetz aus. Den Link kann die Person nur öffnen, wenn dein DMS von außen erreichbar ist (Reverse Proxy, Tunnel oder Hosting). Sonst nimm den Weg per E-Mail. Die Adresse stellst du unter <Link to="/werkbank/betrieb" className="verweis">E-Mail und Adresse</Link> ein.</p></div>}
      {neu ? (
        <div className="hinweis gut auskunft-neu" role="status"><div className="auskunft-neu-inhalt">
          <p>{neu.gesendet ? <>Der Link ist per E-Mail an <strong>{an}</strong> unterwegs – ohne Abrufcode.</> : 'Der Link ist erstellt. Schicke ihn der Person, z. B. per E-Mail.'}</p>
          <label className="eigenschaft"><span>Link</span>
            <span className="zeile-umbruch"><input readOnly value={neu.url} className="mono auskunft-url" onFocus={(e) => e.currentTarget.select()} />
              <button type="button" className="knopf klein" onClick={() => void kopieren('link', neu.url)}>{kopiert === 'link' ? 'Kopiert' : 'Kopieren'}</button></span></label>
          <p className="auskunft-code-zeile"><span>Abrufcode</span> <strong className="mono auskunft-code">{zeigeCode(neu.code)}</strong>
            <button type="button" className="knopf klein" onClick={() => void kopieren('code', neu.code)}>{kopiert === 'code' ? 'Kopiert' : 'Kopieren'}</button></p>
          <p><strong>Teile den Abrufcode auf einem anderen Weg mit</strong> – per Brief, Telefon oder SMS, nie in derselben E-Mail wie den Link. Er wird nur jetzt angezeigt; geht er verloren, erstelle einen neuen Link.</p>
        </div></div>
      ) : (
        <>
          <div className="raster">
            <label className="eigenschaft"><span>E-Mail-Adresse der Person <small>{s.mail ? 'bekommt den Link (ohne Code)' : 'nur für den Nachweis; der E-Mail-Versand ist nicht eingerichtet'}</small></span>
              <input type="email" value={an} onChange={(e) => setAn(e.target.value)} placeholder="name@example.org" /></label>
            <label className="eigenschaft"><span>Gültig <small>Tage, höchstens {LINK_TAGE_MAX}</small></span>
              <input type="number" min={1} max={LINK_TAGE_MAX} value={tage} onChange={(e) => setTage(Number(e.target.value))} /></label>
            <label className="eigenschaft"><span>Abrufe <small>höchstens so oft herunterladen</small></span>
              <input type="number" min={1} max={LINK_ABRUFE_MAX} value={abrufe} onChange={(e) => setAbrufe(Number(e.target.value))} /></label>
          </div>
          {s.mail && <label className="haken"><input type="checkbox" checked={senden} onChange={(e) => setSenden(e.target.checked)} /><span>Link per E-Mail an diese Adresse schicken</span></label>}
          <fieldset className="auskunft-codewahl">
            <legend>Abrufcode</legend>
            <label className="haken"><input type="radio" name={`code-${a.id}`} checked={!eigen} onChange={() => setEigen(false)} /><span>Vom DMS erzeugen (empfohlen) – 8 Zeichen, nur jetzt sichtbar</span></label>
            <label className="haken"><input type="radio" name={`code-${a.id}`} checked={eigen} onChange={() => setEigen(true)} /><span>Eigener Code, den nur die Person kennt – z. B. die Vertragsnummer</span></label>
            {eigen && <>
              <input value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" spellCheck={false} className="mono" aria-label="Eigener Abrufcode" />
              <p className="leise klein">Mindestens {CODE_EIGEN_MIN} Zeichen; Groß-/Kleinschreibung, Leerzeichen und Bindestriche zählen nicht. <strong>Eine Kundennummer allein ist schwach</strong> – sie steht oft auf Briefen und Rechnungen.</p>
            </>}
          </fieldset>
          <p className="leise klein">Nach {LINK_FEHLVERSUCHE_MAX} falschen Codes ist der Link gesperrt; zusätzlich greift der Anmeldeschutz je Internetanschluss.</p>
          {fehler && <p className="fehlertext" role="alert">{fehler}</p>}
          <div className="knoepfe"><button type="button" className="knopf primaer" disabled={laeuft || codeKurz || (senden && s.mail && !an.trim())} onClick={() => void erstellen()}>{laeuft ? 'Wird erstellt …' : senden && s.mail ? 'Link erstellen und senden' : 'Abruf-Link erstellen'}</button></div>
        </>
      )}
    </div>
  );
}

function PerEmail({ a, s, nachher }: { a: AuskunftStand; s: DatenschutzStand; nachher(): Promise<void> }) {
  // Vorlage in der Anrede für Dritte (#474); Betreff und Text lassen sich ändern.
  const vorlage = auskunftMail.zip(s.einstellung.anrede);
  const [an, setAn] = useState('');
  const [betreff, setBetreff] = useState(vorlage.betreff);
  const [nachricht, setNachricht] = useState(vorlage.nachricht);
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const zuGross = a.bytes > MAIL_MAX;
  async function senden() {
    setLaeuft(true); setMeldung(undefined);
    try { const r = await api.auskunftEmail(a.id, { an, betreff, nachricht }); setMeldung({ art: 'gut', text: `Gesendet an ${r.an.join(', ')}. Teile jetzt das Passwort auf einem anderen Weg mit.` }); await nachher(); }
    catch (e) { setMeldung({ art: 'schlecht', text: (e as Error).message }); } finally { setLaeuft(false); }
  }
  return (
    <div className="auskunft-weg-inhalt">
      {!s.mail && <div className="hinweis warn"><p>Der E-Mail-Versand ist nicht eingerichtet (<Link to="/werkbank/betrieb" className="verweis">E-Mail und Adresse</Link>).</p></div>}
      {zuGross ? <div className="hinweis schlecht"><p>Mit {groesse(a.bytes)} ist die Auskunft zu groß für eine E-Mail. Nimm den Abruf-Link.</p></div>
        : a.bytes > EMAIL_WARNUNG_BYTES && <div className="hinweis warn"><p>{groesse(a.bytes)} – viele Mailserver nehmen nur 10 bis 25 MB an. Kommt die E-Mail nicht an, nimm den Abruf-Link.</p></div>}
      <div className="raster">
        <label className="eigenschaft"><span>An</span><input type="email" multiple value={an} onChange={(e) => setAn(e.target.value)} placeholder="name@example.org" /></label>
        <label className="eigenschaft breit"><span>Betreff</span><input value={betreff} onChange={(e) => setBetreff(e.target.value)} /></label>
        <label className="eigenschaft breit"><span>Nachricht <small>Schreib das Passwort nicht hinein.</small></span><textarea rows={8} value={nachricht} onChange={(e) => setNachricht(e.target.value)} /></label>
      </div>
      <p className="leise klein">Anhang: {groesse(a.bytes)}, mit Passwort verschlüsselt (AES-256). <strong>Das Passwort steht nicht in der E-Mail</strong> – teile es per Telefon, SMS oder Brief mit.</p>
      {meldung && <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">{meldung.text}</p>}
      <div className="knoepfe"><button type="button" className="knopf primaer" disabled={laeuft || zuGross || !s.mail || !an.trim()} onClick={() => void senden()}>{laeuft ? 'Wird gesendet …' : 'Per E-Mail senden'}</button></div>
    </div>
  );
}

function LinkZeile({ l, nachher, mitTitel }: { l: AuskunftLink; nachher(): Promise<void>; mitTitel?: boolean }) {
  const st = linkStatus(l);
  const [fehler, setFehler] = useState<string>();
  return (
    <li className={`auskunft-link status-${st}`}>
      <span>{mitTitel && <><strong>{titelOder(l.titel)}</strong> · </>}<span className={`chip auskunft-status-${st}`}>{LINK_STATUS[st]}</span>{' '}
        <span className="leise klein">erstellt {zeit(l.erstellt)}{l.empfaenger ? ` für ${l.empfaenger}` : ''} · gültig bis {tag(l.ablauf)} · {l.abrufe} von {l.maxAbrufe} abgerufen
          {l.abgerufen ? ` · zuletzt abgerufen am ${zeit(l.abgerufen)}` : ''}{l.fehlversuche ? ` · ${l.fehlversuche === 1 ? 'ein falscher Code' : `${l.fehlversuche} falsche Codes`}` : ''}{l.codeArt === 'eigen' ? ' · eigener Code' : ''}</span></span>
      {st === 'aktiv' && <button type="button" className="knopf klein gefahr-rand" onClick={async () => {
        if (!(await rueckfrage({ titel: 'Abruf-Link zurückziehen?', text: 'Der Link gilt sofort nicht mehr. Der Eintrag bleibt als Nachweis; die ZIP-Datei wird nach den üblichen 7 Tagen gelöscht.', ja: 'Zurückziehen', gefahr: true }))) return;
        try { await api.auskunftLinkWiderrufen(l.id); await nachher(); } catch (e) { setFehler((e as Error).message); }
      }}>Zurückziehen</button>}
      {fehler && <span className="fehlertext klein">{fehler}</span>}
    </li>
  );
}

/** Alle Abruf-Links als Nachweis – auch, wenn die ZIP-Datei längst gelöscht ist. */
export function Zustellungen({ z }: { z: DatenschutzZustand }) {
  const s = z.stand!;
  if (!s.links.length) return null;
  return (
    <section className="blatt" id="abruf-links">
      <h2 className="h3">Abruf-Links</h2>
      <p className="leise klein">Nachweis, wann eine Auskunft abgerufen wurde. Jeder Abruf und jeder falsche Code steht auch in der Historie der Person (ohne IP-Adresse).</p>
      <ul className="auskunft-links">{s.links.map((l) => <LinkZeile key={l.id} l={l} nachher={z.laden} mitTitel />)}</ul>
    </section>
  );
}
