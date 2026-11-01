import { useCallback, useEffect, useState } from 'react';
import { BUNDESLAENDER } from '../../../shared/src/feiertage';
import { AUFGABENARTEN, formatiere, type Aufgabe, type Aufgabenart } from '../../../shared/src/model';
import { FAELLIGKEITEN, filterAktiv, filterInAdresse, filtereAufgaben, type AufgabenFilter, type Faelligkeit } from '../../../shared/src/aufgabenfilter';
import { api, type MailEinstellung, type MappeDetails } from '../api';
import { BenutzerWahl } from '../ablage/Aufgaben';
import { useDaten } from '../daten';
import { geheZu, Link } from '../ort';
import { titelOder } from '../seiten';
import { Person } from '../Person';
import { Hilfe } from '../Hilfe';
import { Speicherleiste, useEntwurf } from '../Speicherleiste';
import { SammelHaken, SammelKopf, SammelLeiste, useSammelauswahl } from '../ablage/Sammelweitergabe';
import { t } from '../sprache';

/**
 * Werkbank → Einstellungen → Benachrichtigungen und Aufgaben (#54, #366, #354): Mitte oben die tägliche Zusammenfassung (zuklappbar, #415), darunter alle
 * Aufgaben mit Filter (in der Adresse) und Mehrfachauswahl zum gesammelten Weitergeben (#415); rechts die Mappe
 * der gewählten Aufgabe – mit „Weitergeben an“.
 */
const datum = (iso: string) => new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
const tag = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('de-DE');

export function useAufgaben(aktiv: boolean, erledigt = false) {
  const [liste, setListe] = useState<Aufgabe[] | null>(null);
  const [mail, setMail] = useState<MailEinstellung | null>(null);
  const [unlesbar, setUnlesbar] = useState<Set<string>>(new Set());
  const [fehler, setFehler] = useState<string>();
  const laden = useCallback(async () => {
    try { const r = await api.aufgabenWerkbank(erledigt); setListe(r.aufgaben); setMail(r.mail); setUnlesbar(new Set(r.unlesbar ?? [])); setFehler(undefined); } catch (e) { setFehler((e as Error).message); }
  }, [erledigt]);
  useEffect(() => { if (aktiv) void laden(); }, [aktiv, laden]);
  return { liste, mail, setMail, erledigt, fehler, laden, unlesbar };
}
export type AufgabenZustand = ReturnType<typeof useAufgaben>;

/** Abwesend (oder deaktiviert) und niemand vertritt: Aufgaben bleiben liegen. */
function useOhneVertretung() {
  const d = useDaten();
  return useCallback((id: string) => {
    const p = d.personen.find((x) => x.id === id);
    if (!p) return false;
    return ((p.abwesend?.wirkt ?? false) || p.aktiv === false) && !p.abwesend?.vertreter;
  }, [d.personen]);
}

export function AufgabenListe({ z, filter, offen, mailAn }: { z: AufgabenZustand; filter: AufgabenFilter; offen?: string; mailAn?: boolean }) {
  const d = useDaten();
  const ohneVertretung = useOhneVertretung();
  const [fehler, setFehler] = useState<string>();
  const alle = z.liste ?? [];
  const liste = filtereAufgaben(alle, filter, { jetzt: new Date(), ohneVertretung });
  const suche = filterInAdresse(filter);
  const setze = (neu: Partial<AufgabenFilter>) => geheZu(`/werkbank/aufgaben${offen ? `/${offen}` : ''}${filterInAdresse({ ...filter, ...neu })}`, true);
  const wahl = useSammelauswahl(z.erledigt ? [] : liste.map((a) => a.id));
  const titelVon = (id: string) => { const a = alle.find((x) => x.id === id); return a ? `${titelOder(a.mappeTitel)} – ${a.text}` : 'Aufgabe'; };
  async function weiter(a: Aufgabe, an: string) {
    setFehler(undefined);
    try { await api.aufgabeDelegieren(a.id, an); await z.laden(); await d.neuLaden(); } catch (e) { setFehler((e as Error).message); }
  }
  return (
    <>
      <div className="listenkopf">
        <div><h1>{t('werkbank.bereich.aufgaben.name')}</h1><p className="leise klein">{t('werkbank.aufgaben.unter')} <Hilfe ort="werkbank.aufgaben" /></p></div>
      </div>
      <Zusammenfassung z={z} mailAn={mailAn} />
      <section className="aufgabenfilter stapel" aria-label="Filter">
        <h2 className="h3">{z.erledigt ? 'Erledigte Aufgaben' : 'Offene Aufgaben'}</h2>
        <input type="search" aria-label="Im Titel suchen" placeholder="Im Titel suchen …" value={filter.text ?? ''} onChange={(e) => setze({ text: e.target.value || undefined })} />
        <div className="filterraster">
          <label className="eigenschaft klein"><span>Empfänger</span>
            <select value={filter.empfaenger ?? ''} onChange={(e) => setze({ empfaenger: e.target.value || undefined })}>
              <option value="">alle</option>
              <option value="admins">Administratoren</option>
              <option value="ohne-vertretung">abwesend, ohne Vertretung</option>
              {d.personen.map((p) => <option key={p.id} value={p.id}>{p.name}{p.aktiv === false ? ' (deaktiviert)' : ''}</option>)}
            </select></label>
          <label className="eigenschaft klein"><span>Art</span>
            <select value={filter.art ?? ''} onChange={(e) => setze({ art: (e.target.value || undefined) as Aufgabenart | undefined })}>
              <option value="">alle</option>
              {Object.entries(AUFGABENARTEN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select></label>
          <label className="eigenschaft klein"><span>Mappentyp</span>
            <select value={filter.typ ?? ''} onChange={(e) => setze({ typ: e.target.value || undefined })}>
              <option value="">alle</option>
              {d.typen.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select></label>
          <label className="eigenschaft klein"><span>Fälligkeit</span>
            <select value={filter.faellig ?? ''} onChange={(e) => setze({ faellig: (e.target.value || undefined) as Faelligkeit | undefined })}>
              <option value="">alle</option>
              {Object.entries(FAELLIGKEITEN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select></label>
        </div>
        <label className="haken"><input type="checkbox" checked={!!filter.erledigt} onChange={(e) => geheZu(`/werkbank/aufgaben${filterInAdresse({ ...filter, erledigt: e.target.checked })}`, true)} /><span>Erledigte zeigen</span></label>
        <p className="listenzahl leise klein" role="status">
          {z.liste === null ? 'Lade …' : filterAktiv(filter) ? `${liste.length} von ${alle.length} ${alle.length === 1 ? 'Aufgabe' : 'Aufgaben'}` : `${alle.length} ${alle.length === 1 ? 'Aufgabe' : 'Aufgaben'}`}
          {filterAktiv(filter) && <> · <button type="button" className="verweis" onClick={() => geheZu(`/werkbank/aufgaben${filterInAdresse({ erledigt: filter.erledigt })}`, true)}>Filter zurücksetzen</button></>}
        </p>
        {!z.erledigt && <SammelKopf s={wahl} />}
      </section>
      {!z.erledigt && <SammelLeiste s={wahl} titel={titelVon} erledigen nachher={async () => { await z.laden(); await d.neuLaden(); }} />}
      {(z.fehler || fehler) && <div className="hinweis schlecht"><p>{z.fehler ?? fehler}</p></div>}
      {!z.erledigt && z.unlesbar.size > 0 && <div className="hinweis warn"><p>{z.unlesbar.size === 1 ? 'Eine Frist oder Erinnerung ging' : `${z.unlesbar.size} Fristen oder Erinnerungen gingen`} an jemanden, der die Mappe nach den Berechtigungen nicht lesen darf. Gib sie weiter oder passe die Berechtigungen an.</p></div>}
      {/* Kästchen auch am Handy sichtbar (#415) – deshalb immer „mit-auswahl“. */}
      <div className={`listenrumpf${z.erledigt ? '' : ' mit-auswahl'}`}>
        {z.liste === null ? null : !liste.length ? <p className="leise leerliste">{alle.length ? 'Keine Aufgabe passt zum Filter.' : z.erledigt ? 'Noch nichts erledigt.' : 'Keine offenen Aufgaben.'}</p> : (
          <ul className={`mappenliste${z.erledigt ? '' : ' sammel-liste'}`}>
            {liste.map((a) => (
              <li key={a.id} className={z.erledigt ? undefined : `mit-haken${wahl.ist(a.id) ? ' gewaehlt' : ''}`}>
                {!z.erledigt && <SammelHaken s={wahl} id={a.id} titel={`${titelOder(a.mappeTitel)}: ${a.text}`} />}
                <Link to={`/werkbank/aufgaben/${a.id}${suche}`} className={`eintrag ${offen === a.id ? 'an' : ''}`}>
                  <span className="titel">{titelOder(a.mappeTitel)}</span>
                  <span className="unter">{d.typ(a.typId ?? '')?.name} · {AUFGABENARTEN[a.art]}{a.datum ? ` · ${tag(a.datum)}` : ''} · {datum(z.erledigt && a.erledigt ? a.erledigt : a.erstellt)}</span>
                  <span className="unter">{a.text}</span>
                  {!z.erledigt && z.unlesbar.has(a.id) && <span className="problem">Empfänger darf die Mappe nicht lesen</span>}
                </Link>
                <div className="aufgabenzeile">
                  {z.erledigt
                    ? <span className="leise klein">erledigt von {a.erledigtVon ? <Person id={a.erledigtVon} /> : 'selbst (Mappe passt wieder)'}</span>
                    : <><span className="leise klein">für {a.empfaengerId ? <Person id={a.empfaengerId} /> : 'Administratoren'} · weitergeben an</span>
                        <BenutzerWahl label={`Aufgabe „${a.text}“ weitergeben an`} wert="" setze={(an) => { if (an) void weiter(a, an); }} ohne={a.empfaengerId} /></>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

/** Tägliche Zusammenfassung (#92): Einstellungen oben in der Mitte (#366). */
const ZUSAMMENFASSUNG_ZU = 'werkbank_zusammenfassung_zu';
function Zusammenfassung({ z, mailAn }: { z: AufgabenZustand; mailAn?: boolean }) {
  const d = useDaten();
  const [e, setE] = useState<MailEinstellung>(z.mail ?? { aktiv: true, uhrzeit: '07:00', bundesland: null });
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const [sendet, setSendet] = useState(false);
  useEffect(() => { if (z.mail) setE(z.mail); }, [z.mail]);
  const ent = useEntwurf(z.mail, e, { aus: !z.mail, zuruecksetzen: () => { if (z.mail) setE(z.mail); setMeldung(undefined); } });
  async function speichern() {
    setSendet(true);
    try { z.setMail(await api.aufgabenMailSpeichern(e)); setMeldung({ art: 'gut', text: 'Gespeichert.' }); } catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); } finally { setSendet(false); }
  }
  async function senden() {
    try { const r = await api.aufgabenMailSenden(); setMeldung({ art: 'gut', text: r.verschickt ? `${r.verschickt} ${r.verschickt === 1 ? 'Mail' : 'Mails'} verschickt.` : 'Niemand hat gerade offene Aufgaben (oder alle haben abbestellt).' }); }
    catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); }
  }
  // Auf- und zuklappen (#415), je Benutzer gemerkt; zugeklappt steht der Stand in der Kopfzeile.
  const zu = d.einstellungen[ZUSAMMENFASSUNG_ZU] === true;
  const wirktNicht = e.aktiv && mailAn === false;
  const warnung = <><strong>Der E-Mail-Versand ist ausgeschaltet</strong> – es wird nichts verschickt.</>;
  return (
    <form className="blatt sammel-zusammenfassung" id="zusammenfassung" onSubmit={(ev) => { ev.preventDefault(); void speichern(); }} onKeyDown={ent.tasten}>
      <h2 className="h3">
        <button type="button" className="sammel-aufklapper" aria-expanded={!zu} aria-controls="zusammenfassung-inhalt"
          onClick={() => d.setzeEinstellung(ZUSAMMENFASSUNG_ZU, zu ? null : true)}>
          <span className="sammel-pfeil" aria-hidden="true">{zu ? '▸' : '▾'}</span>Tägliche Zusammenfassung
        </button>
        {zu && <span className="leise klein sammel-stand">{z.mail ? `Standard ${z.mail.uhrzeit} · ${z.mail.aktiv ? 'an' : 'aus'}` : ''}</span>}
      </h2>
      {zu && wirktNicht && (
        <div className="hinweis warn hinweiszeile"><p>{warnung}</p><Link to="/werkbank/betrieb" className="knopf klein">E-Mail einrichten</Link></div>
      )}
      <div id="zusammenfassung-inhalt" className="sammel-inhalt" hidden={zu}>
      <p className="leise klein">Statt einer Mail je Aufgabe bekommt jeder mit offenen Aufgaben die Tägliche Zusammenfassung. Jeder kann sie im Profil anpassen (Uhrzeit, Wochentage, Feiertage) oder abbestellen.</p>
      {wirktNicht && (
        <div className="hinweis warn hinweiszeile"><p>{warnung}</p><Link to="/werkbank/betrieb" className="knopf klein">E-Mail einrichten</Link></div>
      )}
      <label className="haken"><input type="checkbox" checked={e.aktiv} onChange={(x) => setE({ ...e, aktiv: x.target.checked })} /><span>Zusammenfassung verschicken</span></label>
      <label className="eigenschaft"><span>Standard-Uhrzeit <small>für alle ohne eigene im Profil</small></span><input type="time" step={900} value={e.uhrzeit} onChange={(x) => setE({ ...e, uhrzeit: x.target.value })} /></label>
      <label className="eigenschaft"><span>Bundesland <small>für Feiertage ohne Zusammenfassung; nur landesweite Feiertage</small></span>
        <select value={e.bundesland ?? ''} onChange={(x) => setE({ ...e, bundesland: x.target.value || null })}>
          <option value="">keins – ohne Feiertage</option>
          {Object.entries(BUNDESLAENDER).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select></label>
      {meldung && <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">{meldung.text}</p>}
      <div className="knoepfe">
        <button type="button" className="knopf klein" onClick={() => void senden()}>Jetzt senden</button>
      </div>
      </div>
      {(!zu || ent.geaendert) && <Speicherleiste ent={ent} gegenstand="Zusammenfassung" sendet={sendet} />}
    </form>
  );
}

/** Rechts: die Mappe der gewählten Aufgabe (#366), ohne Auswahl ein kurzer Leerzustand. */
export function AufgabenPanel({ z, id }: { z: AufgabenZustand; id?: string }) {
  if (!id) return (
    <div className="platzhalter"><p>Wähle links eine Aufgabe aus, um ihre Mappe anzusehen oder die Aufgabe weiterzugeben.<br />
      <span className="leise klein">Aufgaben entstehen, wenn eine Mappe nicht mehr zur Definition passt, bei Erwähnungen, Fristen und Erinnerungen oder von Hand. Jede Mappe mit offener Aufgabe steht unter „Zu erledigen“ ihres Empfängers.</span></p></div>
  );
  const a = z.liste?.find((x) => x.id === id);
  if (!a) return z.liste === null ? <p className="leise">Lade …</p> : <div className="leer"><p>Diese Aufgabe gibt es hier nicht (mehr) – vielleicht ist sie erledigt.</p></div>;
  return <AufgabeMappe key={a.id} a={a} z={z} />;
}

function AufgabeMappe({ a, z }: { a: Aufgabe; z: AufgabenZustand }) {
  const d = useDaten();
  const [an, setAn] = useState('');
  const [sendet, setSendet] = useState(false);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  /** Weitergeben rechts (#415): wie in der Liste; danach Liste und rechte Seite neu. */
  async function weitergeben() {
    const name = d.personen.find((p) => p.id === an)?.name ?? '';
    setSendet(true); setMeldung(undefined);
    try {
      const r = await api.aufgabeDelegieren(a.id, an);
      setAn(''); setMeldung({ art: 'gut', text: [`An ${name} weitergegeben.`, r.hinweis].filter(Boolean).join(' ') });
      await z.laden(); await d.neuLaden();
    } catch (e) { setMeldung({ art: 'schlecht', text: (e as Error).message }); }
    finally { setSendet(false); }
  }
  const [m, setM] = useState<MappeDetails | null | 'fehlt'>(null);
  useEffect(() => { api.mappe(a.mappeId).then(setM, () => setM('fehlt')); }, [a.mappeId]);
  const typ = d.typ(a.typId ?? '');
  const ablage = `/ablage/${a.typId}/${a.mappeId}`;
  const felder = (typ?.felder ?? []).filter((f) => f.typ !== 'passwort' && f.typ !== 'formatiert' && f.typ !== 'langtext');
  return (
    <div className="einspaltig">
      <div className="mappenkopf">
        <p className="ueber">{typ?.name ?? 'Mappe'} · Aufgabe</p>
        <h1>{titelOder(a.mappeTitel)}</h1>
        <dl className="index">
          <div><dt>Art</dt><dd>{AUFGABENARTEN[a.art]}</dd></div>
          <div><dt>Für</dt><dd>{a.empfaengerId ? <Person id={a.empfaengerId} /> : 'Administratoren'}</dd></div>
          {a.datum && <div><dt>Datum</dt><dd>{tag(a.datum)}</dd></div>}
          <div><dt>Seit</dt><dd>{datum(a.erstellt)}{a.erstelltVon && <> von <Person id={a.erstelltVon} /></>}</dd></div>
          {a.erledigt && <div><dt>Erledigt</dt><dd>{datum(a.erledigt)}</dd></div>}
        </dl>
      </div>
      {a.text && <p>{a.text}</p>}
      {m === null ? <p className="leise">Lade …</p> : m === 'fehlt'
        ? <div className="hinweis info"><p>Die Mappe lässt sich hier nicht anzeigen – nach den Berechtigungen darfst du sie nicht lesen, oder es gibt sie nicht mehr.</p></div>
        : (
          <section className="blatt">
            <dl className="eigenschaften">
              {felder.map((f) => {
                const v = m.mappe.werte[f.key];
                const text = formatiere(f, v, (id) => titelOder(m.bezuege[id]?.titel));
                return <div key={f.key} style={{ display: 'contents' }}><dt>{f.label}</dt><dd>{text || <span className="leise">–</span>}</dd></div>;
              })}
              <dt>Dokumente</dt><dd>{m.dokumente.length || <span className="leise">keine</span>}</dd>
              <dt>Offene Aufgaben</dt><dd>{m.aufgaben.filter((x) => !x.erledigt).length || <span className="leise">keine</span>}</dd>
            </dl>
          </section>
        )}
      <div className="knoepfe sammel-rechts">
        <Link to={ablage} className="knopf primaer">In der Ablage öffnen</Link>
        {!a.erledigt && (
          <span className="sammel-ziel">
            <span className="klein">Weitergeben an</span>
            <BenutzerWahl label={`Aufgabe „${a.text}“ weitergeben an`} wert={an} setze={setAn} ohne={a.empfaengerId} />
            <button type="button" className="knopf" disabled={!an || sendet} onClick={() => void weitergeben()}>Weitergeben</button>
          </span>
        )}
      </div>
      {meldung && <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">{meldung.text}</p>}
    </div>
  );
}
