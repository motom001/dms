import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api, type WerkbankUebersicht } from '../api';
import { Link } from '../ort';
import { Hilfe, useHandbuch } from '../Hilfe';
import { sicherungsHinweise } from './Sicherung';
import { GRUPPEN, type Gruppe } from '../../../shared/src/werkbankansicht';

/** Werkbank → Übersicht (#68): was zu tun ist, auf einen Blick; Gruppen der Leiste. */



const zahl = (n: number) => n.toLocaleString('de-DE');
const datum = (iso: string) => new Date(iso).toLocaleDateString('de-DE', { dateStyle: 'medium' });
const bytes = (b: number) => (b < 1024 ** 3 ? `${(b / 1024 ** 2).toFixed(0)} MB` : `${(b / 1024 ** 3).toFixed(1).replace('.', ',')} GB`);

const platzText = (o: Array<{ frei: number | null }>) => {
  const f = Math.min(...o.map((x) => x.frei ?? Infinity));
  return Number.isFinite(f) ? bytes(f) : 'genug Platz';
};

export interface Hinweis { art: 'schlecht' | 'warn' | 'info'; text: ReactNode; ziel: string; knopf: string }

/** Die Hinweise, die in der Übersicht oben stehen (auch Zähler in der Leiste). */
export function hinweiseAus(u: WerkbankUebersicht): Hinweis[] {
  const h: Hinweis[] = [];
  const t = u.tresor;
  // Notfallzugang (#108): bis er umbenannt oder deaktiviert ist.
  for (const n of u.notfallzugaenge ?? []) h.push({ art: 'schlecht', text: <><strong>Notfallzugang „{n.name}“ ist aktiv.</strong> Er entstand über eine RESCUE-Datei am {datum(n.erstellt)}. Gib ihm einen richtigen Namen oder deaktiviere ihn – warst du das nicht, sofort deaktivieren.</>, ziel: `/werkbank/benutzer/${n.id}`, knopf: 'Zum Benutzer' });
  // Speicherplatz (#116): Grenze, Warnschwelle, wieder genug Platz bei laufender Wartung.
  const sp = u.speicherplatz;
  if (sp?.zustand === 'grenze') h.push({ art: 'schlecht', text: <><strong>Speicherplatzlimit erreicht.</strong> Hochladen ist gesperrt{u.wartung?.ausloeser === 'speicherplatz' ? (u.wartung.stufe === 'aktiv' ? ', der Wartungsmodus läuft' : ', der Wartungsmodus beginnt gleich') : ''}. Schaffe Platz und beende danach den Wartungsmodus.</>, ziel: '/werkbank/speicherplatz', knopf: 'Zum Speicherplatz' });
  else if (sp?.zustand === 'warnung') h.push({ art: 'warn', text: <><strong>Der Speicherplatz wird knapp.</strong> Noch {platzText(sp.ordner)} frei – unter der Grenze wird das Hochladen gesperrt.</>, ziel: '/werkbank/speicherplatz', knopf: 'Zum Speicherplatz' });
  if (sp?.wartungBeenden) h.push({ art: 'warn', text: <><strong>Wieder {platzText(sp.ordner)} frei.</strong> Der Wartungsmodus wegen des Speicherplatzes endet nicht von selbst – Wartung beenden?</>, ziel: '/werkbank/speicherplatz', knopf: 'Wartung beenden' });
  if (u.wartung && u.wartung.stufe !== 'aus' && !sp?.wartungBeenden) h.push({ art: 'warn', text: <><strong>Der Wartungsmodus ist {u.wartung.stufe === 'aktiv' ? 'aktiv' : 'angekündigt'}.</strong> {u.wartung.stufe === 'aktiv' ? 'Nur Administratoren können arbeiten.' : 'Bald werden alle anderen abgemeldet.'}</>, ziel: '/werkbank/wartungsmodus', knopf: 'Zum Wartungsmodus' });
  if (t && t.zustand === 'fehlt') h.push({ art: 'warn', text: <><strong>Es gibt noch keinen Schlüssel für Passwörter.</strong> Bis dahin lassen sich keine Passwörter speichern (E-Mail-Versand, Passwortfelder).</>, ziel: '/werkbank/verschluesselung', knopf: 'Zur Verschlüsselung' });
  else if (t && t.zustand === 'verloren') h.push({ art: 'schlecht', text: <><strong>Der Schlüssel für Passwörter fehlt.</strong> Gespeicherte Passwörter sind nicht lesbar.</>, ziel: '/werkbank/verschluesselung', knopf: 'Zur Verschlüsselung' });
  else if (t && t.zustand === 'falsch') h.push({ art: 'schlecht', text: <><strong>Die Schlüsseldatei passt nicht zu den gespeicherten Passwörtern.</strong></>, ziel: '/werkbank/verschluesselung', knopf: 'Zur Verschlüsselung' });
  else if (t && t.eingebunden === false) h.push({ art: 'warn', text: <><strong>Die Schlüsseldatei liegt nicht auf einem eigenen Volume.</strong> Wird der Container neu erstellt (z. B. beim Update), ist sie weg.</>, ziel: '/werkbank/verschluesselung', knopf: 'Zur Verschlüsselung' });
  else if (t && t.betroffen) h.push({ art: 'warn', text: <><strong>{t.betroffen === 1 ? 'Ein Passwort ist' : `${t.betroffen} Passwörter sind`} nicht lesbar oder unverschlüsselt.</strong></>, ziel: '/werkbank/verschluesselung', knopf: 'Zur Verschlüsselung' });
  // Sicherung (#105): fehlgeschlagen, zu alt, Notfallblatt, Speicherort.
  if (u.sicherung) for (const x of sicherungsHinweise(u.sicherung)) h.push({ ...x, ziel: '/werkbank/sicherung', knopf: 'Zur Sicherung' });
  // #128: API-Schlüssel gehören zu normalen Benutzern.
  if (u.adminSchluessel) h.push({ art: 'warn', text: <><strong>{u.adminSchluessel === 1 ? 'Ein API-Schlüssel gehört' : `${u.adminSchluessel} API-Schlüssel gehören`} einem Administrator.</strong> Administratoren bekommen keine neuen Schlüssel mehr. Lege für das Programm einen normalen Benutzer an, erzeuge damit einen neuen Schlüssel und lösche den alten (Profil → API-Schlüssel des Administrators).</>, ziel: '/werkbank/benutzer/neu', knopf: 'Benutzer anlegen' });
  // Datenbank-Anbindung (#119)
  if (u.anbindung?.umgebung === 'abweichend') h.push({ art: 'warn', text: <><strong>DATABASE_URL weicht von der Datenbank-Anbindung ab und wird ignoriert.</strong> Führend ist die Anbindung unter /data/geheim; entferne die Variable aus der Compose-Datei.</>, ziel: '/werkbank/anbindung', knopf: 'Zur Anbindung' });
  if (u.anbindung?.neustartNoetig) h.push({ art: 'warn', text: <><strong>Die Datenbank-Anbindung ist geändert</strong> und gilt erst nach einem Neustart des DMS.</>, ziel: '/werkbank/anbindung', knopf: 'Zur Anbindung' });
  // Im Einrichtungsassistenten übersprungen (#119): hier nachholen.
  const nachholen: Record<string, { text: string; ziel: string; knopf: string }> = {
    benutzer: { text: 'einen normalen Benutzer für die Ablage anlegen – Administratoren arbeiten nicht in der Ablage', ziel: '/werkbank/benutzer/neu', knopf: 'Benutzer anlegen' },
    optional: { text: 'Adresse, E-Mail-Versand und Bundesland einstellen', ziel: '/werkbank/betrieb', knopf: 'Zu E-Mail und Adresse' },
  };
  for (const x of u.einrichtung?.uebersprungen ?? []) if (nachholen[x] && !(x === 'optional' && u.mail) && !(x === 'benutzer' && (u.bestand?.benutzer ?? 0) > 1)) h.push({ art: 'info', text: <><strong>Aus der Einrichtung übersprungen:</strong> {nachholen[x].text}.</>, ziel: nachholen[x].ziel, knopf: nachholen[x].knopf });
  // Feste Ordner (#115): frühere Variablen mit dem festen Wert sind überflüssig.
  if (u.variablen?.length) h.push({ art: 'info', text: <><strong>{u.variablen.length === 1 ? 'Eine Umgebungsvariable ist' : `${u.variablen.length} Umgebungsvariablen sind`} nicht mehr nötig:</strong> <span className="mono">{u.variablen.join(', ')}</span>. Die Ordner im Container sind fest – entferne sie beim nächsten Update aus der Compose-Datei.</>, ziel: '/werkbank/technik', knopf: 'Zur Technik' });
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
      <div className="listenkopf"><div><h1>Übersicht</h1><p className="leise klein">Was in diesem DMS gerade zu tun ist. <Hilfe ort="werkbank.uebersicht" /></p></div>
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
  const handbuch = useHandbuch();
  const s = u.stand;
  const h = s ? hinweiseAus(s) : [];
  return (
    <div className="einspaltig uebersicht">
      <div className="mappenkopf">
        <p className="ueber">Werkbank</p>
        <h1>Übersicht</h1>
        <p className="leise">Hinweise, Stand und Bestand auf einen Blick. Mehr steht im <a href={handbuch('admin')} target="_blank" rel="noreferrer" className="verweis">Administratorhandbuch ↗</a>. Zu viele Bereiche links? <Link to="/werkbank/ansicht" className="verweis">Werkbank anpassen</Link></p>
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

export { GRUPPEN, type Gruppe };
export interface WerkbankEintrag { pfad: string; name: string; gruppe: Gruppe | null; zahl?: number; warn?: string | number; warnTitel?: string }

/**
 * Leiste der Werkbank. Ausgeblendete Bereiche (#281) fehlen – außer dem offenen und solchen mit Hinweis.
 * Unten: wie viele ausgeblendet sind, zum Aufklappen, und der Weg zu „Werkbank anpassen“.
 */
export function WerkbankNavigation({ bereich, eintraege, zeigen = () => true, benutzt: eingerichtet = [] }: { bereich: string; eintraege: WerkbankEintrag[]; zeigen?: (pfad: string) => boolean; benutzt?: string[] }) {
  const [alleZeigen, setAlleZeigen] = useState(false);
  const ausgeblendet = eintraege.filter((e) => e.pfad !== 'uebersicht' && !zeigen(e.pfad));
  const sichtbar = (e: WerkbankEintrag) => alleZeigen || zeigen(e.pfad) || e.pfad === bereich || !!e.warn;
  const liste = eintraege.filter(sichtbar);
  const gruppen = (Object.keys(GRUPPEN) as Gruppe[]).filter((g) => liste.some((e) => e.gruppe === g));
  const aktiv = liste.find((e) => e.pfad === bereich)?.gruppe ?? null;
  // Am Handy: erst die Gruppe, dann ihre Einträge; vorausgewählt ist die Gruppe des offenen Bereichs.
  const [gewaehlt, setGewaehlt] = useState<Gruppe | null>(aktiv);
  useEffect(() => { setGewaehlt(aktiv); }, [aktiv]);
  const eintrag = (e: WerkbankEintrag) => {
    const aus = !zeigen(e.pfad);
    return (
      <Link key={e.pfad} to={e.pfad === 'uebersicht' ? '/werkbank' : `/werkbank/${e.pfad}`} className={`sicht ${bereich === e.pfad ? 'an' : ''} ${aus ? 'ausgeblendet' : ''}`}
        title={aus ? (e.warn ? 'Ausgeblendet – steht hier wegen eines Hinweises' : 'Ausgeblendet') : undefined}>
        <span className="nm">{e.name}</span>
        {e.warn ? <span className="zaehler" title={e.warnTitel}>{e.warn}</span> : e.zahl ? <span className="zahl">{e.zahl}</span> : null}
      </Link>
    );
  };
  const warnIn = (g: Gruppe) => liste.some((e) => e.gruppe === g && e.warn);
  const benutzt = ausgeblendet.filter((e) => eingerichtet.includes(e.pfad)).length;
  return (
    <>
      <div className="gruppenwahl" role="tablist" aria-label="Bereiche der Werkbank">
        {liste.filter((e) => !e.gruppe).map(eintrag)}
        {gruppen.map((g) => (
          <button key={g} type="button" role="tab" aria-selected={gewaehlt === g} className={`sicht ${gewaehlt === g ? 'an' : ''}`} onClick={() => setGewaehlt(g)}>
            <span className="nm">{GRUPPEN[g]}</span>{warnIn(g) && <span className="zaehler" aria-label="mit Hinweis">!</span>}
          </button>
        ))}
      </div>
      <nav className="sichtliste werkbankleiste">
        {liste.filter((e) => !e.gruppe).map((e) => <div key={e.pfad} className="wbgruppe ohne">{eintrag(e)}</div>)}
        {gruppen.map((g) => (
          <div key={g} className={`wbgruppe ${gewaehlt === g ? 'gewaehlt' : ''}`}>
            <h3 className="gruppentitel">{GRUPPEN[g]}</h3>
            {liste.filter((e) => e.gruppe === g).map(eintrag)}
          </div>
        ))}
        <p className="ausgeblendet-fuss leise klein">
          {ausgeblendet.length > 0 && <>
            <button type="button" className="verweis" aria-expanded={alleZeigen} onClick={() => setAlleZeigen(!alleZeigen)}>
              {alleZeigen ? 'Ausgeblendete verbergen' : `${ausgeblendet.length === 1 ? 'Ein Bereich' : `${ausgeblendet.length} Bereiche`} ausgeblendet${benutzt ? `, ${benutzt} davon eingerichtet` : ''}`}
            </button>{' · '}</>}
          <Link to="/werkbank/ansicht" className="verweis">Werkbank anpassen</Link>
        </p>
      </nav>
    </>
  );
}
