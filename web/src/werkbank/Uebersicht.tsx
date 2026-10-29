import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api, type WerkbankUebersicht } from '../api';
import { Link } from '../ort';
import { sicherungsHinweise } from './Sicherung';

/** Werkbank → Übersicht (#68): was zu tun ist, auf einen Blick; Gruppen der Leiste. */

export const ADMIN_HANDBUCH = 'https://motom001.github.io/dms/admin/';

const zahl = (n: number) => n.toLocaleString('de-DE');
const datum = (iso: string) => new Date(iso).toLocaleDateString('de-DE', { dateStyle: 'medium' });
const bytes = (b: number) => (b < 1024 ** 3 ? `${(b / 1024 ** 2).toFixed(0)} MB` : `${(b / 1024 ** 3).toFixed(1).replace('.', ',')} GB`);

export interface Hinweis { art: 'schlecht' | 'warn' | 'info'; text: ReactNode; ziel: string; knopf: string }

/** Die Hinweise, die in der Übersicht oben stehen (auch Zähler in der Leiste). */
export function hinweiseAus(u: WerkbankUebersicht): Hinweis[] {
  const h: Hinweis[] = [];
  const t = u.tresor;
  // Notfallzugang (#108): bis er umbenannt oder deaktiviert ist.
  for (const n of u.notfallzugaenge ?? []) h.push({ art: 'schlecht', text: <><strong>Notfallzugang „{n.name}“ ist aktiv.</strong> Er entstand über eine RESCUE-Datei am {datum(n.erstellt)}. Gib ihm einen richtigen Namen oder deaktiviere ihn – warst du das nicht, sofort deaktivieren.</>, ziel: `/werkbank/benutzer/${n.id}`, knopf: 'Zum Benutzer' });
  if (u.wartung && u.wartung.stufe !== 'aus') h.push({ art: 'warn', text: <><strong>Der Wartungsmodus ist {u.wartung.stufe === 'aktiv' ? 'aktiv' : 'angekündigt'}.</strong> {u.wartung.stufe === 'aktiv' ? 'Nur Administratoren können arbeiten.' : 'Bald werden alle anderen abgemeldet.'}</>, ziel: '/werkbank/wartungsmodus', knopf: 'Zum Wartungsmodus' });
  if (t && t.zustand === 'fehlt') h.push({ art: 'warn', text: <><strong>Es gibt noch keinen Schlüssel für Passwörter.</strong> Bis dahin lassen sich keine Passwörter speichern (E-Mail-Versand, Passwortfelder).</>, ziel: '/werkbank/verschluesselung', knopf: 'Zur Verschlüsselung' });
  else if (t && t.zustand === 'verloren') h.push({ art: 'schlecht', text: <><strong>Der Schlüssel für Passwörter fehlt.</strong> Gespeicherte Passwörter sind nicht lesbar.</>, ziel: '/werkbank/verschluesselung', knopf: 'Zur Verschlüsselung' });
  else if (t && t.zustand === 'falsch') h.push({ art: 'schlecht', text: <><strong>Die Schlüsseldatei passt nicht zu den gespeicherten Passwörtern.</strong></>, ziel: '/werkbank/verschluesselung', knopf: 'Zur Verschlüsselung' });
  else if (t && t.eingebunden === false) h.push({ art: 'warn', text: <><strong>Die Schlüsseldatei liegt nicht auf einem eigenen Volume.</strong> Wird der Container neu erstellt (z. B. beim Update), ist sie weg.</>, ziel: '/werkbank/verschluesselung', knopf: 'Zur Verschlüsselung' });
  else if (t && t.betroffen) h.push({ art: 'warn', text: <><strong>{t.betroffen === 1 ? 'Ein Passwort ist' : `${t.betroffen} Passwörter sind`} nicht lesbar oder unverschlüsselt.</strong></>, ziel: '/werkbank/verschluesselung', knopf: 'Zur Verschlüsselung' });
  // Sicherung (#105): fehlgeschlagen, zu alt, Notfallblatt, Speicherort.
  if (u.sicherung) for (const x of sicherungsHinweise(u.sicherung)) h.push({ ...x, ziel: '/werkbank/sicherung', knopf: 'Zur Sicherung' });
  if (!u.mail) h.push({ art: 'warn', text: <><strong>Der E-Mail-Versand ist nicht eingerichtet.</strong> Einladungen, die tägliche Zusammenfassung der Aufgaben und „Per E-Mail versenden“ gehen erst danach.</>, ziel: '/werkbank/betrieb', knopf: 'E-Mail einrichten' });
  if (u.fehlermeldungen) h.push({ art: 'warn', text: <><strong>{u.fehlermeldungen === 1 ? 'Eine offene Fehlermeldung' : `${zahl(u.fehlermeldungen)} offene Fehlermeldungen`}</strong> von Benutzern.</>, ziel: '/werkbank/fehlermeldungen', knopf: 'Ansehen' });
  if (u.texterkennung?.fehler) h.push({ art: 'warn', text: <><strong>{u.texterkennung.fehler === 1 ? 'Ein Dokument' : `${zahl(u.texterkennung.fehler)} Dokumente`}</strong> mit Fehler in der Texterkennung.</>, ziel: '/werkbank/texterkennung', knopf: 'Zur Texterkennung' });
  if (u.aufgaben.ohneEmpfaenger) h.push({ art: 'info', text: <><strong>{u.aufgaben.ohneEmpfaenger === 1 ? 'Eine Aufgabe' : `${zahl(u.aufgaben.ohneEmpfaenger)} Aufgaben`}</strong> für die Administratoren (ohne einzelnen Empfänger).</>, ziel: '/ablage/eingang', knopf: 'Zum Eingang' });
  if (u.unpassend) h.push({ art: 'info', text: <><strong>{u.unpassend === 1 ? 'Eine Mappe passt' : `${zahl(u.unpassend)} Mappen passen`}</strong> nicht zur aktuellen Definition ihres Mappentyps.</>, ziel: '/werkbank/typen', knopf: 'Zu den Mappentypen' });
  return h;
}

export function useUebersicht() {
  const [stand, setStand] = useState<WerkbankUebersicht | null>(null);
  const [fehler, setFehler] = useState<string>();
  const laden = useCallback(async () => {
    try { setStand(await api.uebersicht()); setFehler(undefined); } catch (e) { setFehler((e as Error).message); }
  }, []);
  useEffect(() => { void laden(); }, [laden]);
  const hinweise = stand ? hinweiseAus(stand).filter((h) => h.art !== 'info').length : 0;
  return { stand, fehler, laden, hinweise };
}
export type UebersichtZustand = ReturnType<typeof useUebersicht>;

export function UebersichtListe({ u }: { u: UebersichtZustand }) {
  const h = u.stand ? hinweiseAus(u.stand) : [];
  return (
    <>
      <div className="listenkopf"><div><h1>Übersicht</h1><p className="leise klein">Was in diesem DMS gerade zu tun ist.</p></div>
        <button type="button" className="knopf klein" onClick={() => void u.laden()}>Neu laden</button></div>
      {u.fehler && <div className="hinweis schlecht"><p>{u.fehler}</p></div>}
      {!u.stand ? <p className="leise">Lade …</p> : !h.length ? <p className="leise leerliste">Alles eingerichtet – nichts zu tun.</p> : (
        <ul className="mappenliste">
          {h.map((x, i) => <li key={i}><Link to={x.ziel} className="eintrag werk"><span className="titel">{x.knopf}</span><span className="unter">{x.text}</span></Link></li>)}
        </ul>
      )}
      {/* Am Handy steht die Übersicht in der Liste; die Kacheln gehören dann dazu. */}
      {u.stand && <div className="nur-schmal-block"><Kacheln s={u.stand} /></div>}
    </>
  );
}

export function UebersichtPanel({ u }: { u: UebersichtZustand }) {
  const s = u.stand;
  const h = s ? hinweiseAus(s) : [];
  return (
    <div className="einspaltig uebersicht">
      <div className="mappenkopf">
        <p className="ueber">Werkbank</p>
        <h1>Übersicht</h1>
        <p className="leise">Hinweise, Stand und Bestand auf einen Blick. Mehr steht im <a href={ADMIN_HANDBUCH} target="_blank" rel="noreferrer" className="verweis">Administratorhandbuch ↗</a>.</p>
      </div>
      {!s ? <p className="leise">Lade …</p> : (
        <>
          {h.length
            ? h.map((x, i) => <div key={i} className={`hinweis ${x.art === 'info' ? '' : x.art} hinweiszeile`}><p>{x.text}</p><Link to={x.ziel} className="knopf klein">{x.knopf}</Link></div>)
            : <div className="hinweis gut"><p><strong>Alles eingerichtet.</strong> Es gibt gerade nichts zu tun.</p></div>}
          <Kacheln s={s} />
        </>
      )}
    </div>
  );
}

function Kacheln({ s }: { s: WerkbankUebersicht }) {
  return (
          <div className="kacheln">
            <Kachel titel="Aufgaben" ziel="/werkbank/aufgaben" wert={zahl(s.aufgaben.offen)} unter="offen" />
            <Kachel titel="Texterkennung" ziel="/werkbank/texterkennung" wert={s.texterkennung ? zahl(s.texterkennung.wartet + s.texterkennung.laeuft) : '–'} unter={s.texterkennung ? `in der Warteschlange · ${zahl(s.texterkennung.fehler)} mit Fehler` : 'nicht eingerichtet'} />
            <Kachel titel="Papierkorb" ziel="/werkbank/papierkorb" wert={zahl(s.papierkorb.anzahl)} unter={s.papierkorb.tage ? (s.papierkorb.aeltester ? `älteste vom ${datum(s.papierkorb.aeltester)} · ${s.papierkorb.tage} Tage` : `${s.papierkorb.tage} Tage Aufbewahrung`) : 'ausgeschaltet'} />
            <Kachel titel="Fehlermeldungen" ziel="/werkbank/fehlermeldungen" wert={s.fehlermeldungen === null ? '–' : zahl(s.fehlermeldungen)} unter="offen" />
            {s.bestand && <Kachel titel="Bestand" ziel="/werkbank/datenbank" wert={zahl(s.bestand.mappen)} unter={`Mappen · ${zahl(s.bestand.dokumente)} Dokumente (${bytes(s.bestand.dokumenteBytes)}) · ${zahl(s.bestand.benutzer)} Benutzer`} />}
            <Kachel titel="Version" ziel="/werkbank/technik" wert={s.version.version} unter={s.version.commit ? `Build ${s.version.commit.slice(0, 7)} · unter Technik auf Updates prüfen` : 'unter Technik auf Updates prüfen'} />
          </div>
  );
}

function Kachel({ titel, wert, unter, ziel }: { titel: string; wert: string; unter: string; ziel: string }) {
  return (
    <Link to={ziel} className="kachel">
      <span className="ueber">{titel}</span>
      <span className="wert">{wert}</span>
      <span className="leise klein">{unter}</span>
    </Link>
  );
}

/* ---------- Leiste mit Gruppen (#68) ---------- */

export const GRUPPEN = { ablage: 'Ablage einrichten', benutzer: 'Benutzer und Zusammenarbeit', einstellungen: 'Einstellungen', wartung: 'Wartung und Fehlersuche' } as const;
export type Gruppe = keyof typeof GRUPPEN;
export interface WerkbankEintrag { pfad: string; name: string; gruppe: Gruppe | null; zahl?: number; warn?: string | number; warnTitel?: string }

export function WerkbankNavigation({ bereich, eintraege }: { bereich: string; eintraege: WerkbankEintrag[] }) {
  const aktiv = eintraege.find((e) => e.pfad === bereich)?.gruppe ?? null;
  // Am Handy: erst die Gruppe, dann ihre Einträge; vorausgewählt ist die Gruppe des offenen Bereichs.
  const [gewaehlt, setGewaehlt] = useState<Gruppe | null>(aktiv);
  useEffect(() => { setGewaehlt(aktiv); }, [aktiv]);
  const eintrag = (e: WerkbankEintrag) => (
    <Link key={e.pfad} to={e.pfad === 'uebersicht' ? '/werkbank' : `/werkbank/${e.pfad}`} className={`sicht ${bereich === e.pfad ? 'an' : ''}`}>
      <span className="nm">{e.name}</span>
      {e.warn ? <span className="zaehler" title={e.warnTitel}>{e.warn}</span> : e.zahl ? <span className="zahl">{e.zahl}</span> : null}
    </Link>
  );
  const warnIn = (g: Gruppe) => eintraege.some((e) => e.gruppe === g && e.warn);
  return (
    <>
      <div className="gruppenwahl" role="tablist" aria-label="Bereiche der Werkbank">
        {eintraege.filter((e) => !e.gruppe).map(eintrag)}
        {(Object.keys(GRUPPEN) as Gruppe[]).map((g) => (
          <button key={g} type="button" role="tab" aria-selected={gewaehlt === g} className={`sicht ${gewaehlt === g ? 'an' : ''}`} onClick={() => setGewaehlt(g)}>
            <span className="nm">{GRUPPEN[g]}</span>{warnIn(g) && <span className="zaehler" aria-label="mit Hinweis">!</span>}
          </button>
        ))}
      </div>
      <nav className="sichtliste werkbankleiste">
        {eintraege.filter((e) => !e.gruppe).map((e) => <div key={e.pfad} className="wbgruppe ohne">{eintrag(e)}</div>)}
        {(Object.keys(GRUPPEN) as Gruppe[]).map((g) => (
          <div key={g} className={`wbgruppe ${gewaehlt === g ? 'gewaehlt' : ''}`}>
            <h3 className="gruppentitel">{GRUPPEN[g]}</h3>
            {eintraege.filter((e) => e.gruppe === g).map(eintrag)}
          </div>
        ))}
      </nav>
    </>
  );
}
