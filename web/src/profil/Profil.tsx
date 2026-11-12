import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { MeineAbwesenheit } from './Abwesenheit';
import { ZusammenfassungEinstellen } from './Zusammenfassung';
import { geraetText, istGeradeAktiv, PASSWORT_MINDESTLAENGE, type Sitzung } from '../../../shared/src/model';
import { darfVerwalten, hatGesamt } from '../../../shared/src/verwaltungsrecht';
import { bereichName } from '../../../shared/src/werkbankansicht';
import { api } from '../api';
import { bereicheZuruecksetzen } from '../bereiche';
import { ApiSchluesselBlatt } from './ApiSchluessel';
import { useDaten } from '../daten';
import { GRUNDLAGEN, leseSchrift, SCHRIFTEN, setzeSchrift, type Schrift } from '../design';
import { Link } from '../ort';
import { FehlerMelden } from './FehlerMelden';
import { ZweifaktorBlatt } from './Zweifaktor';
import { PasskeyBlatt } from './Passkeys';
import { DokumentPasswoerter } from './DokumentPasswoerter';
import { MeinExport } from './MeinExport';
import { LaufwerkBereich } from './Laufwerk';
import { Farbfelder } from '../werkbank/Designs';
import { useKonto } from '../konto';
import { Hilfe } from '../Hilfe';
import { RECHTE, RECHTE_LISTE } from '../../../shared/src/rechte';
import { rueckfrage } from '../rueckfrage';
import { t, tn, wechsleSprache } from '../sprache';
import { sprachname } from '../../../shared/src/beschriftung';
import { MITMACHEN_URL } from '../../../shared/src/sprachwahl';
import { gebietsschema } from '../../../shared/src/sprache';
import { abfangen, Knopf } from '../bausteine';

const STUFE = { immer: t('profil.profil.stufe.immer'), nie: t('profil.profil.stufe.nie'), teils: t('profil.profil.je-nach-mappe') } as const;

/** Was darf ich? (#126) Je Mappentyp und Recht: ja, nein oder je nach Mappe – ohne die Regeln selbst. */
function MeineRechte({ admin }: { admin: boolean }) {
  const [liste, setListe] = useState<Awaited<ReturnType<typeof api.meineRechte>>>();
  useEffect(() => { api.meineRechte().then(setListe).catch(() => setListe([])); }, []);
  return (
    <section className="blatt">
      <h2 className="h3">{tn('profil.profil.meine-rechte', { hilfe: <Hilfe ort="profil.rechte" /> })}</h2>
      {admin
        ? <p className="leise">{t('profil.rechte.verwaltungsmodus')}</p>
        : <p className="leise">{t('profil.profil.was-du-je-mappentyp')}</p>}
      {!liste ? <p className="leise">{t('profil.profil.lade')}</p> : (
        <div className="tabellenrahmen"><table>
          <thead><tr><th>{t('profil.profil.mappentyp')}</th>{RECHTE_LISTE.map((k) => <th key={k} title={RECHTE[k]}>{RECHTE[k]}</th>)}</tr></thead>
          <tbody>{liste.map((eintrag) => (
            <tr key={eintrag.typId}><td>{eintrag.name}</td>{RECHTE_LISTE.map((k) => <td key={k} className={eintrag.rechte[k] === 'nie' ? 'leise' : ''}>{STUFE[eintrag.rechte[k]]}</td>)}</tr>
          ))}</tbody>
        </table></div>
      )}
    </section>
  );
}

function useFormular(fn: () => Promise<string>) {
  const [sendet, setSendet] = useState(false);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  // abfangen (#1011): React bekommt kein Promise; ein Fehler steht wie bisher als Meldung am Formular.
  const absenden = abfangen(async (e: FormEvent) => {
    e.preventDefault();
    setSendet(true); setMeldung(undefined);
    try { setMeldung({ art: 'gut', text: await fn() }); } finally { setSendet(false); }
  }, (text) => setMeldung({ art: 'schlecht', text }));
  const anzeige: ReactNode = meldung ? <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">{meldung.text}</p> : null;
  return { sendet, absenden, anzeige };
}

/** Bereiche der Profilseite (#69); jeder mit eigener Adresse, /profil führt zu „Konto“. */
const BEREICHE = { konto: t('profil.profil.konto'), sicherheit: t('profil.profil.sicherheit'), darstellung: t('profil.profil.darstellung'), benachrichtigungen: t('profil.profil.benachrichtigungen') } as const;
type Bereich = keyof typeof BEREICHE | 'fehler-melden' | 'abwesenheit' | 'laufwerk';

export function Profil({ teile = [] }: { teile?: string[] }) {
  const { laufwerk } = useKonto();
  // Laufwerk (#720) nur, wenn eingeschaltet; sonst führt /profil/laufwerk zum Konto.
  const b = (teile[1] && (teile[1] in BEREICHE || teile[1] === 'fehler-melden' || teile[1] === 'abwesenheit' || (teile[1] === 'laufwerk' && laufwerk)) ? teile[1] : 'konto') as Bereich;
  return (
    <div className="zweispaltig profil">
      <aside className="leiste" aria-label={t('profil.profil.bereiche-des-profils')}>
        <nav className="typliste">
          {(Object.keys(BEREICHE) as Array<keyof typeof BEREICHE>).map((k) => (
            <Link key={k} to={`/profil/${k}`} className={`typeintrag ${b === k ? 'an' : ''}`}><span className="nm">{BEREICHE[k]}</span></Link>
          ))}
          <Link to="/profil/abwesenheit" anker="konto.abwesenheit" className={`typeintrag ${b === 'abwesenheit' ? 'an' : ''}`}><span className="nm">{t('profil.profil.abwesenheit')}</span></Link>
          {laufwerk && <Link to="/profil/laufwerk" className={`typeintrag ${b === 'laufwerk' ? 'an' : ''}`}><span className="nm">{t('profil.laufwerk.bereich')}</span></Link>}
        </nav>
      </aside>
      <div className="inhalt">
        {b === 'fehler-melden' ? <FehlerMelden /> : b === 'abwesenheit' ? <MeineAbwesenheit /> : b === 'laufwerk' ? <LaufwerkBereich /> : <ProfilBereich bereich={b} />}
      </div>
    </div>
  );
}

function ProfilBereich({ bereich }: { bereich: keyof typeof BEREICHE }) {
  const { ich, mail, aktualisieren, favoritenBenachrichtigung } = useKonto();
  const d = useDaten();
  const [name, setName] = useState(ich.name);
  const [email, setEmail] = useState(ich.email);
  const [pwEmail, setPwEmail] = useState('');
  const [alt, setAlt] = useState('');
  const [neu, setNeu] = useState('');
  const [neu2, setNeu2] = useState('');
  const [entwickler, setEntwickler] = useState(!!ich.entwicklermodus);
  const [ansicht, setAnsicht] = useState(false);

  const fName = useFormular(async () => { await api.profil(name); await aktualisieren(); return t('profil.profil.name-gespeichert'); });
  const fEmail = useFormular(async () => {
    await api.emailAendern(email, pwEmail); setPwEmail(''); await aktualisieren();
    return mail ? t('profil.profil.e-mail-adresse-geaendert') : t('profil.profil.e-mail-adresse-geaendert-2');
  });
  const fPw = useFormular(async () => {
    if (neu !== neu2) throw new Error(t('profil.profil.die-beiden-neuen-passwoerter'));
    await api.passwortAendern(alt, neu); setAlt(''); setNeu(''); setNeu2('');
    return t('profil.profil.passwort-geaendert-alle-anderen');
  });

  return (
    <div className="einspaltig schmal">
      <div className="mappenkopf">
        <p className="ueber">{t('profil.profil.mein-konto', { BEREICHE: BEREICHE[bereich] })}</p>
        <h1>{ich.name || ich.email}</h1>
        <dl className="index">{darfVerwalten(ich) && <div><dt>{t('profil.verwaltung.titel')}</dt><dd>{hatGesamt(ich) ? t('werkbank.verwaltungsrecht.chip.gesamt') : (ich.verwaltung ?? []).map(bereichName).join(', ')}</dd></div>}<div><dt>{t('profil.profil.e-mail')}</dt><dd>{ich.email}</dd></div></dl>
      </div>

      {bereich === 'konto' && <>
      <form className="blatt" onSubmit={fName.absenden}>
        <h2 className="h3">{t('profil.profil.name')}</h2>
        <label className="eigenschaft"><span>{t('profil.profil.so-erscheinst-du-bei')}</span><input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>
        {fName.anzeige}
        <div className="knoepfe"><button className="knopf primaer" disabled={fName.sendet || !name.trim() || name === ich.name}>{t('profil.profil.speichern')}</button></div>
      </form>

      <SpracheWaehlen />

      <form className="blatt" onSubmit={fEmail.absenden}>
        <h2 className="h3">{t('profil.profil.e-mail-adresse')}</h2>
        <p className="leise">{t('profil.profil.damit-meldest-du-dich', { wert: mail ? t('profil.profil.und-bekommst-links-zum') : '' })}</p>
        <div className="raster">
          <label className="eigenschaft"><span>{t('profil.profil.neue-adresse')}</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required /></label>
          <label className="eigenschaft"><span>{t('profil.profil.aktuelles-passwort')}</span><input type="password" value={pwEmail} onChange={(e) => setPwEmail(e.target.value)} autoComplete="current-password" required /></label>
        </div>
        {fEmail.anzeige}
        <div className="knoepfe"><button className="knopf primaer" disabled={fEmail.sendet || email === ich.email || !pwEmail}>{t('profil.profil.adresse-aendern')}</button></div>
      </form>

      {/* Nur zum Nachlesen – deshalb unter den Formularen (#198). */}
      <MeineRechte admin={ich.rolle === 'admin'} />

      <MeinExport />

      </>}

      {bereich === 'sicherheit' && <>
      <form className="blatt" onSubmit={fPw.absenden}>
        <h2 className="h3">{t('profil.profil.passwort')}</h2>
        <input type="email" value={ich.email} autoComplete="username" readOnly hidden />
        <div className="raster">
          <label className="eigenschaft"><span>{t('profil.profil.aktuelles-passwort')}</span><input type="password" value={alt} onChange={(e) => setAlt(e.target.value)} autoComplete="current-password" required /></label>
          <label className="eigenschaft"><span>{tn('profil.profil.neues-passwort', { klein: <small>{t('profil.profil.mindestens-zeichen', { PASSWORT_MINDESTLAENGE })}</small> })}</span><input type="password" value={neu} onChange={(e) => setNeu(e.target.value)} autoComplete="new-password" required /></label>
          <label className="eigenschaft"><span>{t('profil.profil.neues-passwort-wiederholen')}</span><input type="password" value={neu2} onChange={(e) => setNeu2(e.target.value)} autoComplete="new-password" required /></label>
        </div>
        {fPw.anzeige}
        <div className="knoepfe"><button className="knopf primaer" disabled={fPw.sendet || !alt || !neu}>{t('profil.profil.passwort-aendern')}</button></div>
      </form>

      <PasskeyBlatt />

      <ZweifaktorBlatt />

      <MeineGeraete />

      <DokumentPasswoerter />

      <ApiSchluesselBlatt />

      {/* #420: Löschen gehört zur Sicherheit. */}
      {(!!d.zaehler.papierkorbTage || d.einstellungen.papierkorb_beim_abmelden === true) && (
        <div className="blatt">
          <h2 className="h3">{t('profil.profil.papierkorb')}</h2>
          <p className="leise">{t('profil.profil.was-du-loeschst-bleibt', { wert: d.zaehler.papierkorbTage === 1 ? t('profil.profil.einen-tag') : t('profil.profil.tage', { wert: d.zaehler.papierkorbTage ?? 0 }) })}</p>
          <label className="haken"><input type="checkbox" checked={d.einstellungen.papierkorb_beim_abmelden === true}
            onChange={(e) => d.setzeEinstellung('papierkorb_beim_abmelden', e.target.checked || null)} />
            <span>{tn('profil.profil.beim-abmelden-leeren', { klein: <small className="hilfe">{t('profil.profil.deine-geloeschten-mappen-werden')}</small> })}</span></label>
        </div>
      )}
      </>}

      {bereich === 'darstellung' && <>
      <div className="blatt">
        <h2 className="h3">{t('profil.profil.design')}</h2>
        <p className="leise">{t('profil.profil.gilt-fuer-dein-konto')}</p>
        <div className="designwahl" role="radiogroup" aria-label={t('profil.profil.design')}>
          <label>
            <input type="radio" name="design" checked={!d.einstellungen.design || !d.designs.some((x) => x.id === d.einstellungen.design)} onChange={() => d.setzeEinstellung('design', null)} />
            <span className="nm"><strong>{t('profil.profil.standard')}</strong><span className="leise klein">{t('profil.profil.zurzeit')}{' '}{d.designs.find((x) => x.id === d.standardDesign)?.name ?? '–'}</span></span>
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

      {/* #420: Die Startseite steuert, was du siehst – deshalb unter Darstellung. */}
      <div className="blatt" data-anker="konto.startseite">
        <h2 className="h3">{t('profil.profil.startseite')}</h2>
        <p className="leise">{t('profil.profil.die-startseite-der-ablage')}</p>
        <label className="haken"><input type="checkbox" checked={d.einstellungen.startseite !== false}
          onChange={(e) => d.setzeEinstellung('startseite', e.target.checked ? null : false)} />
          <span>{tn('profil.profil.mit-der-startseite-beginnen', { klein: <small className="hilfe">{t('profil.profil.aus-nach-der-anmeldung')}</small> })}</span></label>
        {d.einstellungen.startseite !== false && (
          <label className="eigenschaft"><span>{t('profil.profil.vierte-kachel')}</span>
            <select value={typeof d.einstellungen.startseite_kachel === 'string' ? d.einstellungen.startseite_kachel : 'favoriten'}
              onChange={(e) => d.setzeEinstellung('startseite_kachel', e.target.value === 'favoriten' ? null : e.target.value)}>
              <option value="favoriten">{t('profil.profil.favoriten')}</option>
              {d.sichten.filter((s) => s.typen.length > 0).map((s) => <option key={s.id} value={s.id}>{t('profil.profil.ansicht', { name: s.name })}</option>)}
            </select></label>
        )}
        {/* Tipp des Tages (#832): an (Vorgabe) oder aus; „Ablago entdecken“ zeigt alle Tipps trotzdem. */}
        <label className="haken" data-anker="konto.tipps"><input type="checkbox" checked={d.einstellungen.tipps !== false}
          onChange={(e) => d.setzeEinstellung('tipps', e.target.checked ? null : false)} />
          <span>{tn('entdecken.konto.tipps', { klein: <small className="hilfe">{t('entdecken.konto.tipps.hilfe')}</small> })}</span></label>
      </div>

      {/* #725: Darstellung, keine Benachrichtigung – deshalb hier statt unter Benachrichtigungen. */}
      <div className="blatt">
        <h2 className="h3">{t('profil.profil.geaenderte-mappen')}</h2>
        <label className="haken"><input type="checkbox" checked={d.einstellungen.geaenderte_hervorheben !== false}
          onChange={(e) => d.setzeEinstellung('geaenderte_hervorheben', e.target.checked ? null : false)} />
          <span>{tn('profil.profil.geaenderte-favoriten-und-eigene', { klein: <small className="hilfe">{t('profil.profil.mit-einem-punkt-vor')}</small> })}</span></label>
      </div>

      <div className="blatt">
        <h2 className="h3">{t('profil.profil.darstellung-auf-diesem-geraet')}</h2>
        <p className="leise">{t('profil.profil.die-breite-der-bereiche')}</p>
        <div className="knoepfe"><button type="button" className="knopf" onClick={() => { bereicheZuruecksetzen(ich.id); setAnsicht(true); }}>{t('profil.profil.standard-darstellung')}</button></div>
        {ansicht && <p className="gutertext" role="status">{t('profil.profil.breiten-zurueckgesetzt')}</p>}
      </div>

      <div className="blatt">
        <h2 className="h3">{t('profil.profil.entwicklermodus')}</h2>
        <p className="leise">{t('profil.profil.zeigt-unten-rechts-bei')}</p>
        <label className="haken"><input type="checkbox" checked={entwickler}
          onChange={(e) => { const an = e.target.checked; setEntwickler(an); void api.entwicklermodus(an).then(aktualisieren).catch(() => setEntwickler(!an)); }} /><span>{t('profil.profil.zeitmessung-anzeigen')}</span></label>
      </div>
      </>}

      {bereich === 'benachrichtigungen' && <>
      <div className="blatt" data-anker="konto.zusammenfassung">
        <h2 className="h3">{tn('profil.profil.aufgaben', { hilfe: <Hilfe ort="profil.benachrichtigungen" /> })}</h2>
        <p className="leise">{tn('profil.profil.mappen-mit-offenen-aufgaben', { b: <strong>{t('profil.profil.taegliche-zusammenfassung')}</strong> })}</p>
        <ZusammenfassungEinstellen />
      </div>

      {/* Favorit = Abo (#422): Stern an einer Mappe heißt auch „bei Änderungen benachrichtigen“. */}
      <div className="blatt" id="favoriten">
        <h2 className="h3">{tn('profil.profil.favoriten-2', { hilfe: <Hilfe ort="profil.favoriten" /> })}</h2>
        <p className="leise">{tn('profil.profil.was-dir-wichtig-ist', { b: <strong>{t('profil.profil.eine')}</strong> })}</p>
        {/* #506: Hat die Werkbank die Benachrichtigung für dich abgeschaltet, fehlt der Schalter; die Einstellung bleibt. */}
        {favoritenBenachrichtigung
          ? <label className="haken"><input type="checkbox" checked={d.einstellungen.favoriten_benachrichtigen !== false}
              onChange={(e) => d.setzeEinstellung('favoriten_benachrichtigen', e.target.checked ? null : false)} />
              <span>{t('profil.profil.bei-aenderungen-an-meinen')}</span></label>
          : <p className="hinweis info">{t('profil.favoriten.abgeschaltet')}</p>}
      </div>
      </>}
    </div>
  );
}

/** Schriftgröße je Gerät (#69: aus dem Benutzermenü hierher). */
function SchriftWahl() {
  const { ich } = useKonto();
  const [schrift, setSchrift] = useState<Schrift>(() => leseSchrift(ich.id));
  return (
    <div className="blatt" data-anker="konto.schrift">
      <h2 className="h3">{t('profil.profil.schriftgroesse-auf-diesem-geraet')}</h2>
      <p className="leise">{t('profil.profil.gilt-nur-fuer-das')}</p>
      <div className="segmente" role="radiogroup" aria-label={t('profil.profil.schriftgroesse')}>
        {(Object.keys(SCHRIFTEN) as Schrift[]).map((k) => (
          <button key={k} type="button" role="radio" aria-checked={schrift === k} className={schrift === k ? 'an' : ''} onClick={() => { setSchrift(k); setzeSchrift(ich.id, k); }}
            style={{ fontSize: `${13 * SCHRIFTEN[k].skala}px` }}>{SCHRIFTEN[k].name}</button>
        ))}
      </div>
    </div>
  );
}

const datumZeit = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString(gebietsschema(), { dateStyle: 'medium', timeStyle: 'short' }) : '–');

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
      <h2 className="h3">{t('profil.profil.meine-angemeldeten-geraete')}</h2>
      <p className="leise">{t('profil.profil.ueberall-wo-du-gerade')}</p>
      {liste === null ? <p className="leise">{t('profil.profil.lade')}</p> : (
        <ul className="sitzungsliste">
          {liste.map((s) => (
            <li key={s.id}>
              <div>
                <strong>{geraetText(s.geraet)}</strong>
                {s.aktuell && <> <span className="chip">{t('profil.profil.dieses-geraet')}</span></>}
                {s.vertretungId && <> <span className="chip warn">{t('konten.verwaltende.vertretung.chip')}</span></>}
                {istGeradeAktiv(s.zuletztAktiv) && <> <span className="chip gut punkt">{t('profil.profil.gerade-aktiv')}</span></>}
                <span className="leise klein blockzeile">{t('profil.profil.zuletzt-aktiv-angemeldet-seit', { datumZeit: datumZeit(s.zuletztAktiv), datumZeit2: datumZeit(s.erstellt), wert: s.ip ? ` · ${s.ip}` : '' })}</span>
              </div>
              {!s.aktuell && !vertretung && <button type="button" className="textknopf gefahr" onClick={() => void tu(async () => { await api.meineSitzungBeenden(s.id); return t('profil.profil.geraet-abgemeldet'); })}>{t('profil.profil.abmelden')}</button>}
            </li>
          ))}
        </ul>
      )}
      {meldung && <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">{meldung.text}</p>}
      {andere.length > 0 && !vertretung && (
        <div className="knoepfe"><Knopf className="gefahr-rand" onClick={async () => {
          if (await rueckfrage({ titel: t('profil.profil.auf-allen-anderen-geraeten', { anzahl: andere.length }), ja: t('profil.profil.abmelden'), gefahr: true })) void tu(async () => { const r = await api.andereSitzungenBeenden(); return t('profil.profil.geraete-abgemeldet', { anzahl: r.beendet }); });
        }}>{t('profil.profil.alle-anderen-abmelden')}</Knopf></div>
      )}
    </div>
  );
}

/**
 * Sprache (#729): Jede Person wählt aus den Sprachen, die der Administrator erlaubt hat; „Wie die Ablage“ folgt der
 * Sprache der Installation. Die Oberfläche lädt danach neu, damit alle Texte in der neuen Sprache entstehen.
 */
function SpracheWaehlen() {
  const { ich, sprachen } = useKonto();
  const [wahl, setWahl] = useState(ich.sprache && sprachen.erlaubt.includes(ich.sprache) ? ich.sprache : '');
  const [fehler, setFehler] = useState<string>();
  const [sendet, setSendet] = useState(false);
  const gilt = wahl || sprachen.standard;
  const name = (s: string) => sprachname(s, s);
  async function speichern(neu: string) {
    setWahl(neu); setSendet(true); setFehler(undefined);
    try { await api.eigeneSprache(neu || null); wechsleSprache(neu || sprachen.standard); }
    catch (e) { setFehler((e as Error).message); setWahl(ich.sprache ?? ''); }
    finally { setSendet(false); }
  }
  return (
    <div className="blatt">
      <h2 className="h3">{tn('profil.sprache.titel', { hilfe: <Hilfe ort="profil.sprache" /> })}</h2>
      <label className="eigenschaft"><span>{t('profil.sprache.wahl')}</span>
        <select id="profil-sprache" value={wahl} disabled={sendet} onChange={(e) => void speichern(e.target.value)}>
          <option value="">{t('profil.sprache.wie-ablage', { sprache: name(sprachen.standard) })}</option>
          {sprachen.erlaubt.map((s) => <option key={s} value={s} lang={s}>{name(s)}</option>)}
        </select></label>
      {/* Sprachpaket entfernt (#731): Die Wahl bleibt gespeichert, es gilt die Sprache der Ablage – das sagen wir. */}
      {ich.sprache && !sprachen.erlaubt.includes(ich.sprache) && (
        <div className="hinweis info"><p>{t('profil.sprache.weg', { sprache: name(ich.sprache), ablage: name(sprachen.standard) })}</p></div>
      )}
      {sprachen.maschinell.includes(gilt) && (
        <p className="leise klein">{tn('profil.sprache.maschinell', { link: <a href={MITMACHEN_URL} target="_blank" rel="noreferrer">{t('profil.sprache.mitmachen')}</a> })}</p>
      )}
      <UebersetzenWahl />
      {fehler && <div className="hinweis schlecht"><p>{fehler}</p></div>}
    </div>
  );
}

/**
 * Übersetzung anzeigen (#732): Jede Person kann den Knopf an Feldern, Notizen und Volltexten für sich abschalten.
 * Den Schalter gibt es nur, wenn der Administrator das Übersetzen anbietet und ein Paket dafür läuft.
 */
function UebersetzenWahl() {
  const { uebersetzen, aktualisieren } = useKonto();
  const [sendet, setSendet] = useState(false);
  const [fehler, setFehler] = useState<string>();
  if (!uebersetzen) return null;
  async function schalte(an: boolean) {
    setSendet(true); setFehler(undefined);
    try { await api.eigenesUebersetzen(an); await aktualisieren(); } catch (e) { setFehler((e as Error).message); } finally { setSendet(false); }
  }
  return (
    <>
      <label className="haken">
        <input type="checkbox" id="profil-uebersetzen" checked={!uebersetzen.aus} disabled={sendet} onChange={(e) => void schalte(e.target.checked)} />
        <span>{tn('profil.uebersetzen.anbieten', { hilfe: <Hilfe ort="profil.uebersetzen" /> })}</span>
      </label>
      <p className="leise klein">{uebersetzen.netz
        ? t('profil.uebersetzen.netz', { paket: uebersetzen.paket.name, ziele: uebersetzen.netz.join(', ') })
        : t('profil.uebersetzen.lokal', { paket: uebersetzen.paket.name })}</p>
      {fehler && <div className="hinweis schlecht"><p>{fehler}</p></div>}
    </>
  );
}
