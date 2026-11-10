import { useState } from 'react';
import {
  auskunftMail, CODE_EIGEN_MIN, EMAIL_WARNUNG_BYTES, LINK_ABRUFE_MAX, LINK_ABRUFE_STANDARD, LINK_FEHLVERSUCHE_MAX, LINK_STATUS, LINK_TAGE_MAX, LINK_TAGE_STANDARD,
  linkStatus, normiereCode, zeigeCode, type AuskunftLink, type AuskunftStand,
} from '../../../shared/src/auskunft';
import { api, type DatenschutzStand } from '../api';
import { Link } from '../ort';
import { rueckfrage } from '../rueckfrage';
import { titelOder } from '../seiten';
import { t, tn } from '../sprache';
import { gebietsschema } from '../../../shared/src/sprache';
import { Knopf } from '../bausteine';

/**
 * Auskunft zustellen (#455) – an einer bereitliegenden Auskunft:
 *   Weg 1: ZIP per E-Mail über den Versand des DMS – nur verschlüsselt, Passwort auf anderem Weg.
 *   Weg 2: Abruf-Link auf die öffentliche Abrufseite, dazu ein Abrufcode für einen anderen Kanal.
 * Vorgabe ist Weg 2, wenn die Adresse des DMS nach Internet aussieht.
 */

const MAIL_MAX = 50_000_000;
const groesse = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB`);
const zeit = (iso: string) => new Date(iso).toLocaleString(gebietsschema(), { dateStyle: 'medium', timeStyle: 'short' });
const tag = (iso: string) => new Date(iso).toLocaleDateString(gebietsschema(), { dateStyle: 'medium' });

async function kopiere(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

export function Zustellen({ a, s, nachher }: { a: AuskunftStand; s: DatenschutzStand; nachher(): Promise<void> }) {
  const mailGeht = a.verschluesselt && s.mail && a.bytes <= MAIL_MAX;
  const [weg, setWeg] = useState<'link' | 'email'>(s.oeffentlich || !mailGeht ? 'link' : 'email');
  const links = s.links.filter((l) => l.auskunftId === a.id);
  return (
    <div className="auskunft-zustellen" role="group" aria-label={t('werkbank.zustellen.auskunft-zustellen')}>
      <div className="auskunft-wege" role="radiogroup" aria-label={t('werkbank.zustellen.weg')}>
        <label className={`auskunft-weg${weg === 'link' ? ' gewaehlt' : ''}`}>
          <input type="radio" name={`weg-${a.id}`} checked={weg === 'link'} onChange={() => setWeg('link')} />
          <span><span className="auskunft-weg-titel"><strong>{t('werkbank.zustellen.abruf-link-mit-abrufcode')}</strong>{s.oeffentlich && <span className="chip gut">{t('werkbank.zustellen.empfohlen')}</span>}</span>
            <small>{t('werkbank.zustellen.die-person-laedt-die')}</small></span>
        </label>
        <label className={`auskunft-weg${weg === 'email' ? ' gewaehlt' : ''}${a.verschluesselt ? '' : ' aus'}`}>
          <input type="radio" name={`weg-${a.id}`} checked={weg === 'email'} disabled={!a.verschluesselt} onChange={() => setWeg('email')} />
          <span><span className="auskunft-weg-titel"><strong>{t('werkbank.zustellen.zip-per-e-mail')}</strong>{!s.oeffentlich && mailGeht && <span className="chip gut">{t('werkbank.zustellen.empfohlen')}</span>}</span>
            <small>{a.verschluesselt ? t('werkbank.zustellen.als-anhang-verschluesselt-das') : t('werkbank.zustellen.nur-fuer-auskuenfte-mit')}</small></span>
        </label>
      </div>
      {weg === 'link' ? <LinkErstellen a={a} s={s} nachher={nachher} /> : <PerEmail a={a} s={s} nachher={nachher} />}
      {links.length > 0 && <ul className="auskunft-links">{links.map((l) => <LinkZeile key={l.id} l={l} nachher={nachher} />)}</ul>}
    </div>
  );
}

function LinkErstellen({ a, s, nachher }: { a: AuskunftStand; s: DatenschutzStand; nachher(): Promise<void> }) {
  const [an, setAn] = useState('');
  // E-Mail ist freiwillig (#666): ohne Haken genügt der Link, die Adresse dient nur dem Nachweis.
  const [senden, setSenden] = useState(false);
  const [tage, setTage] = useState(LINK_TAGE_STANDARD);
  const [abrufe, setAbrufe] = useState(LINK_ABRUFE_STANDARD);
  const [eigen, setEigen] = useState(false);
  const [code, setCode] = useState('');
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string>();
  const [neu, setNeu] = useState<{ url: string; code: string; eigen: boolean; gesendet: boolean; an: string } | null>(null);
  const [kopiert, setKopiert] = useState<string>();
  const aktiv = s.links.some((l) => l.auskunftId === a.id && linkStatus(l) === 'aktiv');
  const codeKurz = eigen && normiereCode(code).length < CODE_EIGEN_MIN;

  async function erstellen() {
    if (aktiv && !(await rueckfrage({ titel: t('werkbank.zustellen.neuen-abruf-link-erstellen'), text: t('werkbank.zustellen.der-bisherige-link-dieser'), ja: t('werkbank.zustellen.neuen-link-erstellen') }))) return;
    setLaeuft(true); setFehler(undefined); setNeu(null);
    try {
      const r = await api.auskunftLink(a.id, { tage, abrufe, senden: senden && s.mail, ...(an.trim() ? { an: an.trim() } : {}), ...(eigen ? { code } : {}) });
      setNeu({ url: r.url, code: r.code, eigen, gesendet: r.gesendet, an: an.trim() });
      await nachher();
    } catch (e) { setFehler((e as Error).message); } finally { setLaeuft(false); }
  }
  async function kopieren(was: string, text: string) { setKopiert((await kopiere(text)) ? was : undefined); }

  return (
    <div className="auskunft-weg-inhalt">
      {!s.oeffentlich && <div className="hinweis warn"><p>{tn('werkbank.zustellen.die-adresse-sieht-nach', { b: <strong>{t('werkbank.zustellen.ist-dein-ablago-aus')}</strong>, wert: s.adresse ? <code>{s.adresse}</code> : t('werkbank.zustellen.von-ablago'), link: <Link to="/werkbank/betrieb" className="verweis">{t('werkbank.zustellen.e-mail-und-adresse')}</Link> })}</p></div>}
      {neu ? (
        <div className="hinweis gut auskunft-neu" role="status"><div className="auskunft-neu-inhalt">
          <p>{neu.gesendet ? <>{tn('werkbank.zustellen.link-per-e-mail', { b: <strong>{neu.an}</strong> })}</> : <>{t('werkbank.zustellen.nicht-per-e-mail')}</>}</p>
          <label className="eigenschaft"><span>{t('werkbank.zustellen.link')}</span>
            <span className="zeile-umbruch"><input readOnly value={neu.url} className="mono auskunft-url" onFocus={(e) => e.currentTarget.select()} />
              <button type="button" className="knopf klein" onClick={() => void kopieren('link', neu.url)}>{kopiert === 'link' ? t('werkbank.zustellen.kopiert') : t('werkbank.zustellen.kopieren')}</button></span></label>
          <p className="auskunft-code-zeile"><span>{t('werkbank.zustellen.abrufcode')}</span> <strong className="mono auskunft-code">{neu.eigen ? neu.code : zeigeCode(neu.code)}</strong>
            <button type="button" className="knopf klein" onClick={() => void kopieren('code', neu.code)}>{kopiert === 'code' ? t('werkbank.zustellen.kopiert') : t('werkbank.zustellen.kopieren')}</button></p>
          <p>{tn('werkbank.zustellen.per-brief-telefon-oder', { b: <strong>{t('werkbank.zustellen.teile-den-abrufcode-auf')}</strong> })}</p>
        </div></div>
      ) : (
        <>
          <div className="raster">
            <label className="eigenschaft"><span>{tn('werkbank.zustellen.e-mail-adresse-der', { wert: senden ? '' : t('werkbank.zustellen.optional'), klein: <small>{s.mail ? t('werkbank.zustellen.nur-fuer-den-nachweis') : t('werkbank.zustellen.nur-fuer-den-nachweis-2')}</small> })}</span>
              <input type="email" value={an} required={senden && s.mail} onChange={(e) => setAn(e.target.value)} placeholder="name@example.org" /></label>
            <label className="eigenschaft"><span>{tn('werkbank.zustellen.gueltig', { klein: <small>{t('werkbank.zustellen.tage-hoechstens', { LINK_TAGE_MAX })}</small> })}</span>
              <input type="number" min={1} max={LINK_TAGE_MAX} value={tage} onChange={(e) => setTage(Number(e.target.value))} /></label>
            <label className="eigenschaft"><span>{tn('werkbank.zustellen.abrufe', { klein: <small>{t('werkbank.zustellen.hoechstens-so-oft-herunterladen')}</small> })}</span>
              <input type="number" min={1} max={LINK_ABRUFE_MAX} value={abrufe} onChange={(e) => setAbrufe(Number(e.target.value))} /></label>
          </div>
          {s.mail && <label className="haken"><input type="checkbox" checked={senden} onChange={(e) => setSenden(e.target.checked)} /><span>{t('werkbank.zustellen.link-per-e-mail-2')}</span></label>}
          <fieldset className="auskunft-codewahl">
            <legend>{t('werkbank.zustellen.abrufcode')}</legend>
            <label className="haken"><input type="radio" name={`code-${a.id}`} checked={!eigen} onChange={() => setEigen(false)} /><span>{t('werkbank.zustellen.von-ablago-erzeugen-empfohlen')}</span></label>
            <label className="haken"><input type="radio" name={`code-${a.id}`} checked={eigen} onChange={() => setEigen(true)} /><span>{t('werkbank.zustellen.eigener-code-den-nur')}</span></label>
            {eigen && <>
              <input value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" spellCheck={false} className="mono" aria-label={t('werkbank.zustellen.eigener-abrufcode')} />
              <p className="leise klein">{tn('werkbank.zustellen.mindestens-zeichen-er-wird', { CODE_EIGEN_MIN, b: <strong>{t('werkbank.zustellen.eine-kundennummer-allein-ist')}</strong> })}</p>
            </>}
          </fieldset>
          <p className="leise klein">{t('werkbank.zustellen.nach-falschen-codes-ist', { LINK_FEHLVERSUCHE_MAX })}</p>
          {fehler && <p className="fehlertext" role="alert">{fehler}</p>}
          <div className="knoepfe"><button type="button" className="knopf primaer" disabled={laeuft || codeKurz || (senden && s.mail && !an.trim())} onClick={() => void erstellen()}>{laeuft ? t('werkbank.zustellen.wird-erstellt') : senden && s.mail ? t('werkbank.zustellen.link-erstellen-und-senden') : t('werkbank.zustellen.abruf-link-erstellen')}</button></div>
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
    try { const r = await api.auskunftEmail(a.id, { an, betreff, nachricht }); setMeldung({ art: 'gut', text: t('werkbank.zustellen.gesendet-an-teile-jetzt', { an: r.an.join(', ') }) }); await nachher(); }
    catch (e) { setMeldung({ art: 'schlecht', text: (e as Error).message }); } finally { setLaeuft(false); }
  }
  return (
    <div className="auskunft-weg-inhalt">
      {!s.mail && <div className="hinweis warn"><p>{tn('werkbank.zustellen.der-e-mail-versand', { link: <Link to="/werkbank/betrieb" className="verweis">{t('werkbank.zustellen.e-mail-und-adresse')}</Link> })}</p></div>}
      {zuGross ? <div className="hinweis schlecht"><p>{t('werkbank.zustellen.mit-ist-die-auskunft', { groesse: groesse(a.bytes) })}</p></div>
        : a.bytes > EMAIL_WARNUNG_BYTES && <div className="hinweis warn"><p>{t('werkbank.zustellen.viele-mailserver-nehmen-nur', { groesse: groesse(a.bytes) })}</p></div>}
      <div className="raster">
        <label className="eigenschaft"><span>{t('werkbank.zustellen.an')}</span><input type="email" multiple value={an} onChange={(e) => setAn(e.target.value)} placeholder="name@example.org" /></label>
        <label className="eigenschaft breit"><span>{t('werkbank.zustellen.betreff')}</span><input value={betreff} onChange={(e) => setBetreff(e.target.value)} /></label>
        <label className="eigenschaft breit"><span>{tn('werkbank.zustellen.nachricht', { klein: <small>{t('werkbank.zustellen.schreib-das-passwort-nicht')}</small> })}</span><textarea rows={8} value={nachricht} onChange={(e) => setNachricht(e.target.value)} /></label>
      </div>
      <p className="leise klein">{tn('werkbank.zustellen.anhang-mit-passwort-verschluesselt', { groesse: groesse(a.bytes), b: <strong>{t('werkbank.zustellen.das-passwort-steht-nicht')}</strong> })}</p>
      {meldung && <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">{meldung.text}</p>}
      <div className="knoepfe"><button type="button" className="knopf primaer" disabled={laeuft || zuGross || !s.mail || !an.trim()} onClick={() => void senden()}>{laeuft ? t('werkbank.zustellen.wird-gesendet') : t('werkbank.zustellen.per-e-mail-senden')}</button></div>
    </div>
  );
}

export function LinkZeile({ l, nachher, mitTitel }: { l: AuskunftLink; nachher(): Promise<void>; mitTitel?: boolean }) {
  const st = linkStatus(l);
  const [fehler, setFehler] = useState<string>();
  return (
    <li className={`auskunft-link status-${st}`}>
      <span>{mitTitel && <><strong>{titelOder(l.titel)}</strong> · </>}<span className={`chip auskunft-status-${st}`}>{LINK_STATUS[st]}</span>{' '}
        <span className="leise klein">{t('werkbank.zustellen.erstellt-gueltig-bis-von', { zeit: zeit(l.erstellt), wert: l.empfaenger ? t('werkbank.zustellen.fuer', { empfaenger: l.empfaenger }) : '', tag: tag(l.ablauf), abrufe: l.abrufe, maxAbrufe: l.maxAbrufe, wert2: l.abgerufen ? t('werkbank.zustellen.zuletzt-abgerufen-am', { zeit: zeit(l.abgerufen) }) : '', wert3: l.fehlversuche ? t('werkbank.zustellen.falsche-codes', { anzahl: l.fehlversuche }) : '', wert4: l.codeArt === 'eigen' ? t('werkbank.zustellen.eigener-code') : '' })}</span></span>
      {st === 'aktiv' && <Knopf groesse="klein" className="gefahr-rand" onClick={async () => {
        if (!(await rueckfrage({ titel: t('werkbank.zustellen.abruf-link-zurueckziehen'), text: t('werkbank.zustellen.der-link-gilt-sofort'), ja: t('werkbank.zustellen.zurueckziehen'), gefahr: true }))) return;
        try { await api.auskunftLinkWiderrufen(l.id); await nachher(); } catch (e) { setFehler((e as Error).message); }
      }}>{t('werkbank.zustellen.zurueckziehen')}</Knopf>}
      {fehler && <span className="fehlertext klein">{fehler}</span>}
    </li>
  );
}
