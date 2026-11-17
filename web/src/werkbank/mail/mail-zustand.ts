import { useEffect, useRef, useState, type FormEvent, type MutableRefObject } from 'react';
import {
  absenderVorschlag,
  anbieterFuerAdresse,
  domainVon,
  OAUTH_VERSAND_SERVER,
  type MailAnbieter,
} from '../../../../shared/src/mailanbieter';
import { betriebApi, type BetriebAnsicht, type MailEingabe } from '../../api/betrieb';
import { einrichtungApi, type MailSuche } from '../../api/einrichtung';
import { useEntwurf } from '../../Speicherleiste';
import { t } from '../../sprache';
import { useRueckkehr, type Meldung } from '../Postfaecher';
import type { BetriebZustand } from '../betriebZustand';
import { adresseAus, type Feld, type MailGriff } from './hilfen';
import type { Probe } from '../../api/betrieb';

/** Zustand des Formulars: Eingaben, Vorschläge, Suche, Probe, Meldung, Entwurf für die Speicherleiste. */
export function useMailZustand(
  s: BetriebAnsicht,
  email: string,
  sammeln?: { griff: MutableRefObject<MailGriff | null>; passwort: string },
) {
  const assistent = !!sammeln;
  const start = (): MailEingabe & { passwort: string } => ({
    aktiv: s.mail.aktiv,
    host: s.mail.host,
    port: s.mail.port,
    verbindung: s.mail.verbindung,
    benutzer: s.mail.benutzer,
    absender: s.mail.absender,
    selbstsigniert: s.mail.selbstsigniert,
    anmeldung: s.mail.anmeldung ?? 'passwort',
    anbieter: s.mail.anbieter,
    passwort: sammeln?.passwort ?? '',
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
  const ent = useEntwurf(
    { ...start(), loeschen: false },
    { ...m, loeschen },
    {
      aus: assistent,
      zuruecksetzen: () => {
        setM(start());
        setLoeschen(false);
        setMeldung(undefined);
        setVorgeschlagen(new Set());
      },
    },
  );
  const eingabe = (): MailEingabe => ({ ...m, passwortLoeschen: loeschen || undefined });
  return {
    assistent,
    start,
    m,
    setM,
    adresse,
    setAdresse,
    vorgeschlagen,
    setVorgeschlagen,
    loeschen,
    setLoeschen,
    an,
    setAn,
    suche,
    setSuche,
    sucht,
    setSucht,
    laeuft,
    setLaeuft,
    probe,
    setProbe,
    meldung,
    setMeldung,
    erweitert,
    setErweitert,
    rueckkehr,
    gesucht,
    ent,
    eingabe,
  };
}
export type MailZustand = ReturnType<typeof useMailZustand>;

/** Eingabe von Hand und Vorschläge aus Adresse und Fund. */
export function mailVorschlaege(x: MailZustand, s: BetriebAnsicht, email: string) {
  const { m, setM, setMeldung, setProbe, vorgeschlagen, setVorgeschlagen, an, setAn } = x;
  /** Eingabe von Hand: ist kein Vorschlag mehr. */
  const setze = (p: Partial<typeof m>) => {
    setM((x) => ({ ...x, ...p }));
    setMeldung(undefined);
    setProbe(undefined);
    setVorgeschlagen((v) => {
      const n = new Set(v);
      for (const k of Object.keys(p)) n.delete(k as Feld);
      return n;
    });
  };

  /** Vorschläge aus Adresse und Fund – nur in leere oder selbst vorgeschlagene Felder. */
  function schlageVor(adr: string, fund: MailSuche['fund'] | MailAnbieter | null, lokalteil = false) {
    if (!domainVon(adr)) return;
    const n = { ...m };
    const neu = new Set(vorgeschlagen);
    const vor = (f: Feld, wert: unknown, setz: () => void) => {
      if (!wert || vorgeschlagen.has(f)) {
        setz();
        neu.add(f);
      }
    };
    vor('benutzer', m.benutzer, () => {
      n.benutzer = lokalteil ? adr.split('@')[0] : adr;
    });
    vor('absender', m.absender, () => {
      n.absender = absenderVorschlag(adr, s.ablage);
    });
    if (fund) {
      vor('host', m.host, () => {
        n.host = fund.host;
      });
      if (neu.has('host')) {
        n.port = fund.port;
        n.verbindung = fund.verbindung;
        neu.add('port');
        neu.add('verbindung');
      }
    } else if (vorgeschlagen.has('host')) {
      // Nichts gefunden: ein früherer Vorschlag (andere Domain) passt nicht mehr.
      n.host = '';
      n.port = 587;
      n.verbindung = 'starttls';
      for (const f of ['host', 'port', 'verbindung'] as Feld[]) neu.delete(f);
    }
    if (!m.aktiv && !s.mail.host && fund) {
      n.aktiv = true;
      neu.add('aktiv');
    }
    if (!an || an === email || vorgeschlagen.has('an')) {
      setAn(adr);
      neu.add('an');
    }
    setM(n);
    setVorgeschlagen(neu);
  }
  return { setze, schlageVor };
}

/** Beim Öffnen: Vorschlag aus der eingebauten Liste – ohne Netzaufruf. */
export function useStartVorschlag(
  x: MailZustand,
  s: BetriebAnsicht,
  schlageVor: (adr: string, fund: MailSuche['fund'] | MailAnbieter | null, lokalteil?: boolean) => void,
) {
  const { adresse, setSuche } = x;
  // Beim Öffnen: nur die eingebaute Liste – ohne Netzaufruf.
  useEffect(() => {
    if (s.mail.host) return;
    const a = anbieterFuerAdresse(adresse);
    if (a) {
      setSuche({
        domain: domainVon(adresse)!,
        gefragt: [],
        fund: { host: a.host, port: a.port, verbindung: a.verbindung, quelle: 'liste', anbieter: a.id, benutzer: 'adresse' },
      });
      schlageVor(adresse, a);
    } else if (domainVon(adresse)) schlageVor(adresse, null);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- Vorschlag nur beim ersten Anzeigen, spätere Eingaben nicht überschreiben
}

/** Server finden, Anmeldung wählen, speichern, prüfen und Testmail. */
export function mailAktionen(
  x: MailZustand,
  o: {
    b?: BetriebZustand;
    aktualisieren?: () => Promise<void>;
    oauthAnbieter: 'microsoft' | 'google' | undefined;
    setze: (p: Partial<MailZustand['m']>) => void;
    schlageVor: (adr: string, fund: MailSuche['fund'] | MailAnbieter | null, lokalteil?: boolean) => void;
  },
) {
  const { adresse, gesucht, setSucht, assistent, setSuche, setErweitert, setMeldung, m, setM, setLaeuft, setLoeschen } = x;
  const { setVorgeschlagen, eingabe, setProbe, an } = x;
  const { b, aktualisieren, oauthAnbieter, setze, schlageVor } = o;
  /** Server zur Adresse suchen (beim Verlassen des Felds); Thunderbird nur auf Knopfdruck. */
  async function finden(thunderbird = false) {
    const adr = adresse.trim();
    if (!domainVon(adr) || (!thunderbird && gesucht.current === adr)) return;
    gesucht.current = adr;
    setSucht(true);
    try {
      // Vor der Einrichtung mit Einrichtungscode statt Anmeldung (#804).
      const r = await (assistent ? einrichtungApi.einrichtungMailFinden : betriebApi.mailFinden)(adr, thunderbird);
      setSuche(r);
      schlageVor(adr, r.fund, r.fund?.benutzer === 'lokalteil');
      if (!r.fund && !thunderbird) setErweitert(true);
    } catch (x) {
      setMeldung({ art: 'schlecht', text: (x as Error).message });
    } finally {
      setSucht(false);
    }
  }
  function anmeldungWaehlen(art: 'passwort' | 'oauth') {
    if (art === 'oauth' && oauthAnbieter) {
      const host = OAUTH_VERSAND_SERVER[oauthAnbieter].includes(m.host.toLowerCase()) ? m.host : OAUTH_VERSAND_SERVER[oauthAnbieter][0];
      setze({
        anmeldung: 'oauth',
        anbieter: oauthAnbieter,
        host,
        verbindung: m.verbindung === 'keine' ? 'starttls' : m.verbindung,
        benutzer: m.benutzer.includes('@') ? m.benutzer : adresse,
        selbstsigniert: false,
      });
    } else setze({ anmeldung: 'passwort', anbieter: undefined });
  }

  async function speichern(ev?: FormEvent) {
    ev?.preventDefault();
    setLaeuft('speichern');
    try {
      b!.setStand({ ...b!.stand!, ...(await betriebApi.mailSpeichern(eingabe())) });
      setM((x) => ({ ...x, passwort: '' }));
      setLoeschen(false);
      setVorgeschlagen(new Set());
      await aktualisieren?.();
      setMeldung({ art: 'gut', text: t('werkbank.mail.gespeichert') });
    } catch (x) {
      setMeldung({ art: 'schlecht', text: (x as Error).message });
    } finally {
      setLaeuft(null);
    }
  }
  async function teste(was: 'pruefen' | 'testmail') {
    setLaeuft(was);
    setProbe(undefined);
    try {
      setProbe({ ...(was === 'pruefen' ? await betriebApi.mailPruefen(eingabe()) : await betriebApi.testmail(eingabe(), an)), was });
    } catch (x) {
      setProbe({ ok: false, meldung: (x as Error).message, was });
    } finally {
      setLaeuft(null);
    }
  }

  return { finden, anmeldungWaehlen, speichern, teste };
}
