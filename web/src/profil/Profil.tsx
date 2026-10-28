import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { geraetText, istGeradeAktiv, PASSWORT_MINDESTLAENGE, ROLLEN, type Sitzung } from '../../../shared/src/model';
import { api } from '../api';
import { bereicheZuruecksetzen } from '../bereiche';
import { ApiSchluesselBlatt } from './ApiSchluessel';
import { useDaten } from '../daten';
import { GRUNDLAGEN, leseSchrift, SCHRIFTEN, setzeSchrift, type Schrift } from '../design';
import { Link } from '../ort';
import { FehlerMelden } from './FehlerMelden';
import { Farbfelder } from '../werkbank/Designs';
import { useKonto } from '../konto';

function useFormular(fn: () => Promise<string>) {
  const [sendet, setSendet] = useState(false);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const absenden = async (e: FormEvent) => {
    e.preventDefault();
    setSendet(true); setMeldung(undefined);
    try { setMeldung({ art: 'gut', text: await fn() }); } catch (err) { setMeldung({ art: 'schlecht', text: (err as Error).message }); } finally { setSendet(false); }
  };
  const anzeige: ReactNode = meldung ? <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">{meldung.text}</p> : null;
  return { sendet, absenden, anzeige };
}

/** Bereiche der Profilseite (#69); jeder mit eigener Adresse, /profil führt zu „Konto“. */
const BEREICHE = { konto: 'Konto', sicherheit: 'Sicherheit', darstellung: 'Darstellung', benachrichtigungen: 'Benachrichtigungen und Ablage' } as const;
type Bereich = keyof typeof BEREICHE | 'fehler-melden';

export function Profil({ teile = [] }: { teile?: string[] }) {
  const b = (teile[1] && (teile[1] in BEREICHE || teile[1] === 'fehler-melden') ? teile[1] : 'konto') as Bereich;
  return (
    <div className="zweispaltig profil">
      <aside className="leiste" aria-label="Bereiche des Profils">
        <nav className="typliste">
          {(Object.keys(BEREICHE) as Array<keyof typeof BEREICHE>).map((k) => (
            <Link key={k} to={`/profil/${k}`} className={`typeintrag ${b === k ? 'an' : ''}`}><span className="nm">{BEREICHE[k]}</span></Link>
          ))}
        </nav>
      </aside>
      <div className="inhalt">
        {b === 'fehler-melden' ? <FehlerMelden /> : <ProfilBereich bereich={b} />}
      </div>
    </div>
  );
}

function ProfilBereich({ bereich }: { bereich: keyof typeof BEREICHE }) {
  const { ich, mail, aktualisieren } = useKonto();
  const d = useDaten();
  const [name, setName] = useState(ich.name);
  const [email, setEmail] = useState(ich.email);
  const [pwEmail, setPwEmail] = useState('');
  const [alt, setAlt] = useState('');
  const [neu, setNeu] = useState('');
  const [neu2, setNeu2] = useState('');
  const [entwickler, setEntwickler] = useState(!!ich.entwicklermodus);
  const [ansicht, setAnsicht] = useState(false);

  const fName = useFormular(async () => { await api.profil(name); await aktualisieren(); return 'Name gespeichert.'; });
  const fEmail = useFormular(async () => {
    await api.emailAendern(email, pwEmail); setPwEmail(''); await aktualisieren();
    return mail ? 'E-Mail-Adresse geändert. Die bisherige Adresse hat einen Hinweis bekommen.' : 'E-Mail-Adresse geändert.';
  });
  const fPw = useFormular(async () => {
    if (neu !== neu2) throw new Error('Die beiden neuen Passwörter stimmen nicht überein.');
    await api.passwortAendern(alt, neu); setAlt(''); setNeu(''); setNeu2('');
    return 'Passwort geändert. Alle anderen Anmeldungen wurden beendet.';
  });

  return (
    <div className="einspaltig schmal">
      <div className="mappenkopf">
        <p className="ueber">Profil · {BEREICHE[bereich]}</p>
        <h1>{ich.name || ich.email}</h1>
        <dl className="index"><div><dt>Rolle</dt><dd>{ROLLEN[ich.rolle]}</dd></div><div><dt>E-Mail</dt><dd>{ich.email}</dd></div></dl>
      </div>

      {bereich === 'konto' && <>
      <form className="blatt" onSubmit={fName.absenden}>
        <h2 className="h3">Name</h2>
        <label className="eigenschaft"><span>So erscheinst du bei „angelegt von“</span><input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>
        {fName.anzeige}
        <div className="knoepfe"><button className="knopf primaer" disabled={fName.sendet || !name.trim() || name === ich.name}>Speichern</button></div>
      </form>

      <form className="blatt" onSubmit={fEmail.absenden}>
        <h2 className="h3">E-Mail-Adresse</h2>
        <p className="leise">Damit meldest du dich an{mail ? ' und bekommst Links zum Zurücksetzen des Passworts' : ''}.</p>
        <div className="raster">
          <label className="eigenschaft"><span>Neue Adresse</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required /></label>
          <label className="eigenschaft"><span>Aktuelles Passwort</span><input type="password" value={pwEmail} onChange={(e) => setPwEmail(e.target.value)} autoComplete="current-password" required /></label>
        </div>
        {fEmail.anzeige}
        <div className="knoepfe"><button className="knopf primaer" disabled={fEmail.sendet || email === ich.email || !pwEmail}>Adresse ändern</button></div>
      </form>

      </>}

      {bereich === 'sicherheit' && <>
      <form className="blatt" onSubmit={fPw.absenden}>
        <h2 className="h3">Passwort</h2>
        <input type="email" value={ich.email} autoComplete="username" readOnly hidden />
        <div className="raster">
          <label className="eigenschaft"><span>Aktuelles Passwort</span><input type="password" value={alt} onChange={(e) => setAlt(e.target.value)} autoComplete="current-password" required /></label>
          <label className="eigenschaft"><span>Neues Passwort <small>mindestens {PASSWORT_MINDESTLAENGE} Zeichen</small></span><input type="password" value={neu} onChange={(e) => setNeu(e.target.value)} autoComplete="new-password" required /></label>
          <label className="eigenschaft"><span>Neues Passwort wiederholen</span><input type="password" value={neu2} onChange={(e) => setNeu2(e.target.value)} autoComplete="new-password" required /></label>
        </div>
        {fPw.anzeige}
        <div className="knoepfe"><button className="knopf primaer" disabled={fPw.sendet || !alt || !neu}>Passwort ändern</button></div>
      </form>

      <MeineGeraete />

      <ApiSchluesselBlatt />
      </>}

      {bereich === 'darstellung' && <>
      <div className="blatt">
        <h2 className="h3">Design</h2>
        <p className="leise">Gilt für dein Konto auf allen Geräten und wird sofort angewendet.</p>
        <div className="designwahl" role="radiogroup" aria-label="Design">
          <label>
            <input type="radio" name="design" checked={!d.einstellungen.design || !d.designs.some((x) => x.id === d.einstellungen.design)} onChange={() => d.setzeEinstellung('design', null)} />
            <span className="nm"><strong>Standard</strong><span className="leise klein">zurzeit {d.designs.find((x) => x.id === d.standardDesign)?.name ?? '–'}</span></span>
          </label>
          {d.designs.map((x) => (
            <label key={x.id}>
              <input type="radio" name="design" checked={d.einstellungen.design === x.id} onChange={() => d.setzeEinstellung('design', x.id)} />
              <span className="nm"><strong>{x.name}</strong><span className="leise klein"><Farbfelder d={x} /> {GRUNDLAGEN[x.grundlage]}</span></span>
            </label>
          ))}
        </div>
      </div>

      <SchriftWahl />

      <div className="blatt">
        <h2 className="h3">Ansicht auf diesem Gerät</h2>
        <p className="leise">Die Breite der Bereiche in Ablage und Werkbank und eingeklappte Bereiche merkt sich dieses Gerät für dich. Falls etwas nicht mehr zu finden ist:</p>
        <div className="knoepfe"><button type="button" className="knopf" onClick={() => { bereicheZuruecksetzen(ich.id); setAnsicht(true); }}>Standard-Ansicht wiederherstellen</button></div>
        {ansicht && <p className="gutertext" role="status">Breiten zurückgesetzt.</p>}
      </div>

      <div className="blatt">
        <h2 className="h3">Entwicklermodus</h2>
        <p className="leise">Zeigt unten rechts bei jedem Seitenaufruf, wie lange die einzelnen Schritte gedauert haben: Netzwerk, Aufbereitung auf dem Server, Datenbankzugriffe, Übertragung, Auswerten und Darstellung im Browser. Gilt nur für dich.</p>
        <label className="haken"><input type="checkbox" checked={entwickler}
          onChange={(e) => { const an = e.target.checked; setEntwickler(an); void api.entwicklermodus(an).then(aktualisieren).catch(() => setEntwickler(!an)); }} /><span>Zeitmessung anzeigen</span></label>
      </div>
      </>}

      {bereich === 'benachrichtigungen' && <>
      <div className="blatt">
        <h2 className="h3">Aufgaben</h2>
        <p className="leise">Mappen mit offenen Aufgaben für dich stehen im Eingang. Zusätzlich schickt das DMS einmal am Tag eine Übersicht per E-Mail, wenn der Versand eingerichtet ist.</p>
        <label className="haken"><input type="checkbox" checked={d.einstellungen.aufgaben_mail !== false}
          onChange={(e) => d.setzeEinstellung('aufgaben_mail', e.target.checked ? null : false)} /><span>Tägliche Zusammenfassung meiner Aufgaben per E-Mail</span></label>
      </div>

      {(!!d.zaehler.papierkorbTage || d.einstellungen.papierkorb_beim_abmelden === true) && (
        <div className="blatt">
          <h2 className="h3">Papierkorb</h2>
          <p className="leise">Was du löschst, bleibt {d.zaehler.papierkorbTage === 1 ? 'einen Tag' : `${d.zaehler.papierkorbTage ?? 0} Tage`} im Papierkorb der Ablage, bevor es endgültig gelöscht wird.</p>
          <label className="haken"><input type="checkbox" checked={d.einstellungen.papierkorb_beim_abmelden === true}
            onChange={(e) => d.setzeEinstellung('papierkorb_beim_abmelden', e.target.checked || null)} />
            <span>Beim Abmelden leeren<small className="hilfe">Deine gelöschten Mappen werden beim Abmelden endgültig gelöscht.</small></span></label>
        </div>
      )}

      </>}
    </div>
  );
}

/** Schriftgröße je Gerät (#69: aus dem Benutzermenü hierher). */
function SchriftWahl() {
  const { ich } = useKonto();
  const [schrift, setSchrift] = useState<Schrift>(() => leseSchrift(ich.id));
  return (
    <div className="blatt">
      <h2 className="h3">Schriftgröße auf diesem Gerät</h2>
      <p className="leise">Gilt nur für das Gerät, an dem du gerade sitzt – am Smartphone kannst du eine andere wählen als am PC.</p>
      <div className="segmente" role="radiogroup" aria-label="Schriftgröße">
        {(Object.keys(SCHRIFTEN) as Schrift[]).map((k) => (
          <button key={k} type="button" role="radio" aria-checked={schrift === k} className={schrift === k ? 'an' : ''} onClick={() => { setSchrift(k); setzeSchrift(ich.id, k); }}
            style={{ fontSize: `${13 * SCHRIFTEN[k].skala}px` }}>{SCHRIFTEN[k].name}</button>
        ))}
      </div>
    </div>
  );
}

const datumZeit = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) : '–');

/** Meine angemeldeten Geräte (#69): ansehen, einzeln oder alle anderen abmelden. */
function MeineGeraete() {
  const { vertretung } = useKonto();
  const [liste, setListe] = useState<Sitzung[] | null>(null);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const laden = useCallback(async () => { try { setListe(await api.meineSitzungen()); } catch (e) { setMeldung({ art: 'schlecht', text: (e as Error).message }); } }, []);
  useEffect(() => { void laden(); }, [laden]);
  async function tu(f: () => Promise<string>) {
    setMeldung(undefined);
    try { setMeldung({ art: 'gut', text: await f() }); await laden(); } catch (e) { setMeldung({ art: 'schlecht', text: (e as Error).message }); }
  }
  const andere = (liste ?? []).filter((s) => !s.aktuell);
  return (
    <div className="blatt">
      <h2 className="h3">Meine angemeldeten Geräte</h2>
      <p className="leise">Überall, wo du gerade angemeldet bist. Erkennst du ein Gerät nicht oder hast eines verloren, melde es hier ab – und ändere am besten dein Passwort.</p>
      {liste === null ? <p className="leise">Lade …</p> : (
        <ul className="sitzungsliste">
          {liste.map((s) => (
            <li key={s.id}>
              <div>
                <strong>{geraetText(s.geraet)}</strong>
                {s.aktuell && <> <span className="chip">dieses Gerät</span></>}
                {s.vertretungId && <> <span className="chip warn">Administrator agiert als du</span></>}
                {istGeradeAktiv(s.zuletztAktiv) && <> <span className="chip gut punkt">gerade aktiv</span></>}
                <span className="leise klein blockzeile">Zuletzt aktiv {datumZeit(s.zuletztAktiv)} · angemeldet seit {datumZeit(s.erstellt)}{s.ip ? ` · ${s.ip}` : ''}</span>
              </div>
              {!s.aktuell && !vertretung && <button type="button" className="textknopf gefahr" onClick={() => void tu(async () => { await api.meineSitzungBeenden(s.id); return 'Gerät abgemeldet.'; })}>Abmelden</button>}
            </li>
          ))}
        </ul>
      )}
      {meldung && <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">{meldung.text}</p>}
      {andere.length > 0 && !vertretung && (
        <div className="knoepfe"><button type="button" className="knopf gefahr-rand" onClick={() => {
          if (confirm(`Auf ${andere.length === 1 ? 'dem anderen Gerät' : `allen ${andere.length} anderen Geräten`} abmelden?`)) void tu(async () => { const r = await api.andereSitzungenBeenden(); return `${r.beendet} ${r.beendet === 1 ? 'Gerät' : 'Geräte'} abgemeldet.`; });
        }}>Alle anderen abmelden</button></div>
      )}
    </div>
  );
}
