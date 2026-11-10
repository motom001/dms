import { useEffect, useMemo, useRef, useState, type FormEvent, type MutableRefObject } from 'react';
import { absenderVorschlag, anbieterFuerAdresse, domainVon, MAIL_ANBIETER, OAUTH_VERSAND_SERVER, type MailAnbieter } from '../../../shared/src/mailanbieter';
import { PLAN_VERBINDUNGEN } from '../../../shared/src/einrichtungsplan';
import { api, type BetriebAnsicht, type MailEingabe, type MailSuche, type Probe, type Verbindung } from '../api';
import { useKonto } from '../konto';
import { Link } from '../ort';
import { Speicherleiste, useEntwurf } from '../Speicherleiste';
import { Hilfe } from '../Hilfe';
import { t } from '../sprache';
import { OAuthBereich, useRueckkehr, type Meldung } from './Postfaecher';
import type { BetriebZustand } from './Betrieb';

/**
 * E-Mail-Versand einrichten (#813) – derselbe Aufbau im Einrichtungsassistenten und in Werkbank → E-Mail und Adresse:
 *
 * 1. Einfacher Weg: eigene Adresse und Passwort. Benutzer, Absender, Testmail-Empfänger und Server schlägt Ablago
 *    daraus vor und kennzeichnet sie als Vorschlag; übernommen wird nur, was sichtbar dasteht.
 * 2. Server finden: eingebaute Liste (ohne Netz), beim Verlassen des Adressfelds DNS und Autoconfig der eigenen Domain,
 *    die Thunderbird-Datenbank nur auf Knopfdruck. Wen Ablago gefragt hat, steht darunter.
 * 3. Anbieter-Hinweise mit Link, „Verbindung prüfen“ gleich nach dem Passwort, verständliche Fehler.
 * 4. Erweitert (eingeklappt): alle Felder. OAuth für Microsoft 365 und Google mit der Anmeldung der Postfächer.
 *
 * Im Einrichtungsassistenten (`MailSammeln`, #803/#804) gibt es keine Speichern-Knöpfe und nichts wird gespeichert:
 * „Weiter“ holt mit `griff.current.sammle()` die sichtbaren Angaben in den Sammelstand, angewendet werden sie erst mit
 * „Jetzt einrichten“. „Verbindung prüfen“ und die Testmail brauchen eine Anmeldung und fehlen dort; die Server-Suche
 * läuft über /api/einrichtung/mail/finden (mit Einrichtungscode).
 */

/** Angaben, wie sie im Formular stehen – das Passwort nur im Speicher des Assistenten, nie in sessionStorage. */
export type MailAngaben = Pick<MailEingabe, 'aktiv' | 'host' | 'port' | 'verbindung' | 'benutzer' | 'absender' | 'selbstsigniert'> & { passwort: string };
export interface MailGriff {
  /** Die sichtbaren Angaben für den Sammelstand (#804) – speichert nichts. */
  sammle(): MailAngaben;
}

type Feld = 'host' | 'port' | 'verbindung' | 'benutzer' | 'absender' | 'an' | 'aktiv';
const portFuer = (v: Verbindung) => (v === 'ssl' ? 465 : v === 'starttls' ? 587 : 25);
const adresseAus = (absender: string, benutzer: string) => /<([^>]+)>\s*$/.exec(absender)?.[1] ?? (benutzer.includes('@') ? benutzer : absender.includes('@') ? absender.trim() : '');
const QUELLE: Record<NonNullable<MailSuche['fund']>['quelle'], string> = {
  liste: 'werkbank.mail.quelle.liste', dns: 'werkbank.mail.quelle.dns', mx: 'werkbank.mail.quelle.mx', autoconfig: 'werkbank.mail.quelle.autoconfig', thunderbird: 'werkbank.mail.quelle.thunderbird',
};

/** Werkbank → E-Mail und Adresse: speichert über die Leiste unten. */
export function MailVersand({ b }: { b: BetriebZustand }) {
  const { ich, aktualisieren } = useKonto();
  return <MailFormular s={b.stand!} email={ich.email} b={b} aktualisieren={aktualisieren} />;
}

/**
 * Einrichtungsassistent (#803, #804, #813): dasselbe Formular, aber nur zum Sammeln. Es gibt noch keine Anmeldung –
 * darum weder `useKonto` noch Betriebsstand; vorbelegt mit dem Gesammelten (oder der Datei, #806) und der Adresse aus
 * „Dein Konto“ (#821). Der Schlüssel für das Passwort entsteht bei „Jetzt einrichten“ vor dem E-Mail-Versand.
 */
export function MailSammeln({ wert, passwort, email, ablage, griff }: {
  wert: Omit<MailAngaben, 'passwort'> | null; passwort: string; email: string; ablage: string; griff: MutableRefObject<MailGriff | null>;
}) {
  const [s] = useState((): BetriebAnsicht => ({
    mail: {
      aktiv: wert?.aktiv ?? true, host: wert?.host ?? '', port: wert?.port ?? 587, verbindung: wert?.verbindung ?? 'starttls', benutzer: wert?.benutzer ?? '',
      absender: wert?.absender ?? '', selbstsigniert: wert?.selbstsigniert ?? false, anmeldung: 'passwort', passwortGesetzt: false, passwortLesbar: true, passwortUnverschluesselt: false,
    },
    adresse: '', vorschlag: null, passwoerterMoeglich: true, ablage: ablage.trim() || null,
    verbindungen: Object.fromEntries(PLAN_VERBINDUNGEN.map((v) => [v, t(`einrichtung.optional.mail.verbindung.${v}`)])) as Record<Verbindung, string>,
  }));
  return <MailFormular s={s} email={email} sammeln={{ griff, passwort }} />;
}

function MailFormular({ s, email, b, aktualisieren, sammeln }: {
  s: BetriebAnsicht; email: string; b?: BetriebZustand; aktualisieren?: () => Promise<void>;
  sammeln?: { griff: MutableRefObject<MailGriff | null>; passwort: string };
}) {
  const assistent = !!sammeln;
  const start = (): MailEingabe & { passwort: string } => ({
    aktiv: s.mail.aktiv, host: s.mail.host, port: s.mail.port, verbindung: s.mail.verbindung, benutzer: s.mail.benutzer, absender: s.mail.absender,
    selbstsigniert: s.mail.selbstsigniert, anmeldung: s.mail.anmeldung ?? 'passwort', anbieter: s.mail.anbieter, passwort: sammeln?.passwort ?? '',
  });
  const [m, setM] = useState(start);
  const [adresse, setAdresse] = useState(() => adresseAus(s.mail.absender, s.mail.benutzer) || email);
  const [vorgeschlagen, setVorgeschlagen] = useState<Set<Feld>>(new Set());
  const [loeschen, setLoeschen] = useState(false);
  const [an, setAn] = useState(email);
  const [suche, setSuche] = useState<MailSuche | null>(null);
  const [sucht, setSucht] = useState(false);
  const [laeuft, setLaeuft] = useState<string | null>(null);
  const [probe, setProbe] = useState<Probe & { was: string }>();
  // Rückkehr von der Anmeldung beim Anbieter (?oauth=angemeldet bzw. ?oauthfehler=…).
  const rueckkehr = useRueckkehr(t('werkbank.mail.oauth.angemeldet'));
  const [meldung, setMeldung] = useState<Meldung | undefined>(rueckkehr);
  const [erweitert, setErweitert] = useState(!!s.mail.host && !assistent);
  const gesucht = useRef('');
  const ent = useEntwurf({ ...start(), loeschen: false }, { ...m, loeschen }, { aus: assistent, zuruecksetzen: () => { setM(start()); setLoeschen(false); setMeldung(undefined); setVorgeschlagen(new Set()); } });
  const eingabe = (): MailEingabe => ({ ...m, passwortLoeschen: loeschen || undefined });

  /** Eingabe von Hand: ist kein Vorschlag mehr. */
  const setze = (p: Partial<typeof m>) => {
    setM((x) => ({ ...x, ...p })); setMeldung(undefined); setProbe(undefined);
    setVorgeschlagen((v) => { const n = new Set(v); for (const k of Object.keys(p)) n.delete(k as Feld); return n; });
  };

  /** Vorschläge aus Adresse und Fund – nur in leere oder selbst vorgeschlagene Felder. */
  function schlageVor(adr: string, fund: MailSuche['fund'] | MailAnbieter | null, lokalteil = false) {
    if (!domainVon(adr)) return;
    const n = { ...m };
    const neu = new Set(vorgeschlagen);
    const vor = (f: Feld, wert: unknown, setz: () => void) => { if (!wert || vorgeschlagen.has(f)) { setz(); neu.add(f); } };
    vor('benutzer', m.benutzer, () => { n.benutzer = lokalteil ? adr.split('@')[0] : adr; });
    vor('absender', m.absender, () => { n.absender = absenderVorschlag(adr, s.ablage); });
    if (fund) {
      vor('host', m.host, () => { n.host = fund.host; });
      if (neu.has('host')) { n.port = fund.port; n.verbindung = fund.verbindung; neu.add('port'); neu.add('verbindung'); }
    } else if (vorgeschlagen.has('host')) {
      // Nichts gefunden: ein früherer Vorschlag (andere Domain) passt nicht mehr.
      n.host = ''; n.port = 587; n.verbindung = 'starttls';
      for (const f of ['host', 'port', 'verbindung'] as Feld[]) neu.delete(f);
    }
    if (!m.aktiv && !s.mail.host && fund) { n.aktiv = true; neu.add('aktiv'); }
    if (!an || an === email || vorgeschlagen.has('an')) { setAn(adr); neu.add('an'); }
    setM(n);
    setVorgeschlagen(neu);
  }

  // Beim Öffnen: nur die eingebaute Liste – ohne Netzaufruf.
  useEffect(() => {
    if (s.mail.host) return;
    const a = anbieterFuerAdresse(adresse);
    if (a) { setSuche({ domain: domainVon(adresse)!, gefragt: [], fund: { host: a.host, port: a.port, verbindung: a.verbindung, quelle: 'liste', anbieter: a.id, benutzer: 'adresse' } }); schlageVor(adresse, a); }
    else if (domainVon(adresse)) schlageVor(adresse, null);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- Vorschlag nur beim ersten Anzeigen, spätere Eingaben nicht überschreiben

  /** Server zur Adresse suchen (beim Verlassen des Felds); Thunderbird nur auf Knopfdruck. */
  async function finden(thunderbird = false) {
    const adr = adresse.trim();
    if (!domainVon(adr) || (!thunderbird && gesucht.current === adr)) return;
    gesucht.current = adr;
    setSucht(true);
    try {
      // Vor der Einrichtung mit Einrichtungscode statt Anmeldung (#804).
      const r = await (assistent ? api.einrichtungMailFinden : api.mailFinden)(adr, thunderbird);
      setSuche(r);
      schlageVor(adr, r.fund, r.fund?.benutzer === 'lokalteil');
      if (!r.fund && !thunderbird) setErweitert(true);
    } catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); } finally { setSucht(false); }
  }

  const anbieter = useMemo(() => MAIL_ANBIETER.find((a) => a.id === suche?.fund?.anbieter) ?? MAIL_ANBIETER.find((a) => a.host === m.host.toLowerCase()) ?? null, [suche, m.host]);
  const oauthAnbieter = anbieter?.oauth ?? (m.anmeldung === 'oauth' ? m.anbieter : undefined);
  const oauth = m.anmeldung === 'oauth';

  function anmeldungWaehlen(art: 'passwort' | 'oauth') {
    if (art === 'oauth' && oauthAnbieter) {
      const host = OAUTH_VERSAND_SERVER[oauthAnbieter].includes(m.host.toLowerCase()) ? m.host : OAUTH_VERSAND_SERVER[oauthAnbieter][0];
      setze({ anmeldung: 'oauth', anbieter: oauthAnbieter, host, verbindung: m.verbindung === 'keine' ? 'starttls' : m.verbindung, benutzer: m.benutzer.includes('@') ? m.benutzer : adresse, selbstsigniert: false });
    } else setze({ anmeldung: 'passwort', anbieter: undefined });
  }

  async function speichern(ev?: FormEvent) {
    ev?.preventDefault();
    setLaeuft('speichern');
    try {
      b!.setStand({ ...b!.stand!, ...await api.mailSpeichern(eingabe()) });
      setM((x) => ({ ...x, passwort: '' })); setLoeschen(false); setVorgeschlagen(new Set()); await aktualisieren?.();
      setMeldung({ art: 'gut', text: t('werkbank.mail.gespeichert') });
    } catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); } finally { setLaeuft(null); }
  }
  // Assistent (#803, #804): „Weiter“ übernimmt, was sichtbar dasteht – in den Sammelstand, gespeichert wird nichts.
  if (sammeln) sammeln.griff.current = {
    sammle: () => ({ aktiv: m.aktiv, host: m.host, port: m.port, verbindung: m.verbindung, benutzer: m.benutzer, absender: m.absender, selbstsigniert: m.selbstsigniert, passwort: m.passwort }),
  };

  async function teste(was: 'pruefen' | 'testmail') {
    setLaeuft(was); setProbe(undefined);
    try { setProbe({ ...(was === 'pruefen' ? await api.mailPruefen(eingabe()) : await api.testmail(eingabe(), an)), was }); }
    catch (x) { setProbe({ ok: false, meldung: (x as Error).message, was }); }
    finally { setLaeuft(null); }
  }

  const vor = (f: Feld) => vorgeschlagen.has(f) && <small className="vorschlag">{t('werkbank.mail.vorgeschlagen')}</small>;
  const domain = domainVon(adresse);
  const ergebnis = probe && (
    <div className={`hinweis ${probe.ok ? 'gut' : 'schlecht'}`} role="status"><p>{probe.ok && probe.was === 'pruefen' ? `${t('werkbank.mail.geprueft')} ${probe.meldung}` : probe.meldung}</p>
      {probe.technisch && <details className="klein"><summary>{t('werkbank.mail.antwort-server')}</summary><p className="mono">{probe.technisch}</p></details>}</div>
  );

  const inhalt = (
    <>
      {!assistent && <label className="haken"><input type="checkbox" checked={m.aktiv} onChange={(e) => setze({ aktiv: e.target.checked })} /><span><span className="haken-titel">{t('werkbank.mail.aktiv')}</span>{vor('aktiv')}</span></label>}
      <div className="raster">
        <label className="eigenschaft" htmlFor="mail-adresse"><span>{t('werkbank.mail.adresse')}</span>
          <input id="mail-adresse" type="email" value={adresse} autoComplete="off" spellCheck={false} onChange={(e) => setAdresse(e.target.value)} onBlur={() => void finden()} />
          <small className="hilfe">{t('werkbank.mail.adresse.hilfe')}</small></label>
        {!oauth && <label className="eigenschaft" htmlFor="mail-passwort"><span>{t('werkbank.mail.passwort')} <small>{s.mail.passwortGesetzt && !loeschen ? t('werkbank.mail.passwort.gesetzt') : t('werkbank.mail.passwort.app')}</small></span>
          <input id="mail-passwort" type="password" value={m.passwort} disabled={!s.passwoerterMoeglich} onChange={(e) => { setze({ passwort: e.target.value }); setLoeschen(false); }} autoComplete="new-password" placeholder={s.mail.passwortGesetzt && !loeschen ? '••••••••' : ''} /></label>}
        {oauthAnbieter && (
          <label className="eigenschaft" htmlFor="mail-anmeldung"><span>{t('werkbank.mail.anmeldung')} {!assistent && <Hilfe ort="werkbank.mail.oauth" />}</span>
            <select id="mail-anmeldung" value={m.anmeldung} disabled={assistent} onChange={(e) => anmeldungWaehlen(e.target.value as 'passwort' | 'oauth')}>
              <option value="passwort">{t('werkbank.mail.anmeldung.passwort')}</option>
              <option value="oauth">{oauthAnbieter === 'microsoft' ? t('werkbank.mail.anmeldung.microsoft') : t('werkbank.mail.anmeldung.google')}</option>
            </select>
            {assistent && <small className="hilfe">{t('werkbank.mail.anmeldung.spaeter')}</small>}</label>
        )}
      </div>
      <div className="knoepfe">
        {/* Prüfen und Testmail brauchen eine Anmeldung – im Assistenten erst danach in der Werkbank (#803). */}
        {!assistent && <button type="button" className="knopf" disabled={!!laeuft || !m.host} onClick={() => void teste('pruefen')}>{laeuft === 'pruefen' ? t('werkbank.mail.pruefe') : t('werkbank.mail.pruefen')}</button>}
        {sucht && <span className="leise klein" role="status">{t('werkbank.mail.sucht')}</span>}
      </div>
      {probe?.was === 'pruefen' && ergebnis}

      {/* Was der Assistent vorschlägt – alles sichtbar, nichts Verstecktes. */}
      {(m.host || suche) && (
        <div className="hinweis info mail-vorschlag">
          {m.host
            ? <p><strong>{anbieter ? t('werkbank.mail.ueber', { anbieter: anbieter.name }) : t('werkbank.mail.ueber-server')}</strong> <span className="mono">{m.host}:{m.port}</span> ({s.verbindungen[m.verbindung]}){vor('host')}
              {suche?.fund && vorgeschlagen.has('host') && <> <span className="leise klein">– {t.frei(QUELLE[suche.fund.quelle])}</span></>}</p>
            : <p><strong>{t('werkbank.mail.nicht-gefunden', { domain: suche?.domain ?? '' })}</strong> {t('werkbank.mail.nicht-gefunden.text')}</p>}
          {suche && <p className="leise klein">{suche.gefragt.length ? t('werkbank.mail.gefragt', { wen: suche.gefragt.join(', ') }) : t('werkbank.mail.ohne-netz')}</p>}
          {suche && !suche.fund && !sucht && domain && (
            <p className="klein"><button type="button" className="knopf klein" onClick={() => void finden(true)}>{t('werkbank.mail.thunderbird')}</button> <span className="leise">{t('werkbank.mail.thunderbird.text', { domain })}</span></p>
          )}
          {anbieter?.hinweise.map((h) => <p key={h.text}>{t.frei(h.text, { anbieter: anbieter.name })}{h.link && <> <a className="verweis" href={h.link} target="_blank" rel="noreferrer noopener">{t('werkbank.mail.hilfe-anbieter', { anbieter: anbieter.name })} ↗</a></>}</p>)}
          {m.benutzer && <p className="klein">{t('werkbank.mail.benutzer')}: <span className="mono">{m.benutzer}</span>{vor('benutzer')}</p>}
          {m.absender && <p className="klein">{t('werkbank.mail.absender')}: <span className="mono">{m.absender}</span>{vor('absender')}</p>}
        </div>
      )}

      <details className="erweitert" open={erweitert} onToggle={(e) => setErweitert((e.target as HTMLDetailsElement).open)}>
        <summary>{t('werkbank.mail.erweitert')}</summary>
        <div className="raster">
          <label className="eigenschaft"><span>{t('werkbank.mail.server')} <small>{t('werkbank.mail.server.beispiel')}</small></span><input value={m.host} disabled={oauth} onChange={(e) => setze({ host: e.target.value })} autoComplete="off" spellCheck={false} /></label>
          <label className="eigenschaft"><span>{t('werkbank.mail.verbindung')}</span>
            <select value={m.verbindung} onChange={(e) => { const v = e.target.value as Verbindung; setze({ verbindung: v, port: m.port === portFuer(m.verbindung) ? portFuer(v) : m.port }); }}>
              {(Object.entries(s.verbindungen) as Array<[Verbindung, string]>).map(([k, v]) => <option key={k} value={k} disabled={oauth && k === 'keine'}>{v}</option>)}
            </select></label>
          <label className="eigenschaft"><span>{t('werkbank.mail.port')}</span><input type="number" min={1} max={65535} value={m.port} onChange={(e) => setze({ port: Number(e.target.value) })} /></label>
          <label className="eigenschaft"><span>{t('werkbank.mail.benutzer')} <small>{oauth ? t('werkbank.mail.benutzer.oauth') : t('werkbank.mail.benutzer.leer')}</small></span><input value={m.benutzer} onChange={(e) => setze({ benutzer: e.target.value })} autoComplete="off" spellCheck={false} /></label>
          <label className="eigenschaft"><span>{t('werkbank.mail.absender')} <small>{t('werkbank.mail.absender.beispiel')}</small></span><input value={m.absender} onChange={(e) => setze({ absender: e.target.value })} autoComplete="off" spellCheck={false} /></label>
        </div>
        {s.mail.passwortGesetzt && !oauth && <label className="haken"><input type="checkbox" checked={loeschen} onChange={(e) => { setLoeschen(e.target.checked); if (e.target.checked) setze({ passwort: '' }); }} /><span>{t('werkbank.mail.passwort.entfernen')}</span></label>}
        {!oauth && <label className="haken"><input type="checkbox" checked={m.selbstsigniert} onChange={(e) => setze({ selbstsigniert: e.target.checked })} />
          <span><span className="haken-titel">{t('werkbank.mail.selbstsigniert')}</span><small className="hilfe">{t('werkbank.mail.selbstsigniert.hilfe')}</small></span></label>}
      </details>

      {!s.passwoerterMoeglich
        ? <div className="hinweis warn"><p>{t('werkbank.mail.schluessel-fehlt')} <Link to="/werkbank/verschluesselung" className="verweis">{t('werkbank.mail.schluessel-erzeugen')}</Link>.{s.mail.passwortUnverschluesselt ? ` ${t('werkbank.mail.passwort.unverschluesselt')}` : ''}</p></div>
        : !s.mail.passwortLesbar
          ? <div className="hinweis schlecht"><p>{t('werkbank.mail.passwort.unlesbar')}</p></div>
          : !oauth && <p className="leise klein">{t('werkbank.mail.passwort.verschluesselt')}</p>}

      {!assistent && <><h3 className="zwischen">{t('werkbank.mail.testen')}</h3>
      <div className="raster">
        <label className="eigenschaft"><span>{t('werkbank.mail.testmail-an')} {vorgeschlagen.has('an') && <small className="vorschlag">{t('werkbank.mail.vorgeschlagen')}</small>}</span>
          <input type="email" value={an} onChange={(e) => { setAn(e.target.value); setVorgeschlagen((v) => { const n = new Set(v); n.delete('an'); return n; }); }} /></label>
        <div className="eigenschaft unten"><div className="knoepfe">
          <button type="button" className="knopf" disabled={!!laeuft || !m.host || !an} onClick={() => void teste('testmail')}>{laeuft === 'testmail' ? t('werkbank.mail.sende') : t('werkbank.mail.testmail')}</button>
        </div></div>
      </div></>}
      {probe?.was === 'testmail' && ergebnis}
      {meldung && <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">{meldung.text}</p>}
    </>
  );

  if (assistent || !b) return <div className="stapel">{inhalt}</div>;
  return (
    <>
      <form className="blatt" id="mail" onSubmit={(e) => void speichern(e)} onKeyDown={ent.tasten} noValidate>
        <h2 className="h3">{t('werkbank.mail.titel')} <Hilfe ort="werkbank.mail" /></h2>
        <p className="leise">{t('werkbank.mail.unter')}</p>
        {inhalt}
        <Speicherleiste ent={ent} gegenstand={t('werkbank.mail.gegenstand')} sendet={laeuft === 'speichern'} />
      </form>
      {oauth && m.anbieter && (
        <OAuthBereich anbieter={m.anbieter} versand geaendert={ent.geaendert || s.mail.anmeldung !== 'oauth'} setMeldung={setMeldung}
          ziel={s.mail.anmeldung === 'oauth' ? {
            oauth: s.oauth, start: api.mailOAuthStart, geraet: api.mailOAuthGeraet, geraetPruefen: api.mailOAuthGeraetPruefen,
            abmelden: async () => { b.setStand({ ...b.stand!, ...await api.mailOAuthAbmelden() }); }, neuLaden: b.laden,
          } : undefined} />
      )}
    </>
  );
}
