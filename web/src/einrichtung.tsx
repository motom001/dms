import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Symbol } from './Symbol';
import { BUNDESLAENDER } from '../../shared/src/feiertage';
import { handbuchUrl, HILFE, hilfeOnlineUrl, INSTALLIEREN_URL, type Hilfeort } from '../../shared/src/hilfe';
import { PASSWORT_MINDESTLAENGE } from '../../shared/src/model';
import { api, ApiFehler, hatEinrichtungscode, setzeEinrichtungscode, type AnbindungEingabe, type AnbindungPruefung, type EinrichtungSchritt, type EinrichtungStand, type KontoStatus, type LinkErgebnis, type MailEinstellung, type TresorStatus } from './api';
import { WiederherstellungsAssistent } from './wiederherstellen';
import { BetriebPanel, useBetrieb } from './werkbank/Betrieb';
import { Erledigt } from './werkbank/Sicherung';
import { useKonto } from './konto';
import { PaketeDazuholen } from './werkbank/PaketeDazuholen';
import { geheZu } from './ort';

/**
 * Einrichtungsassistent (#119): führt beim ersten Aufruf durch die Einrichtung.
 *
 *   1 Code · 2 Datenbank · 3 Neu oder Sicherung · 4 Mandant · 5 Administrator
 *   – ab hier angemeldet als Administrator –
 *   6 Erster Benutzer · 7 Schlüssel und Notfallblatt · 8 Pakete (#460) · 9 Optionales · 10 Fertig
 *
 * Übersprungenes lässt sich in der Werkbank nachholen.
 */
export const SCHRITTE = ['Code', 'Datenbank', 'Neu oder Sicherung', 'Haushalt', 'Administrator', 'Erster Benutzer', 'Schlüssel', 'Pakete', 'Optionales', 'Fertig'] as const;
const REPO = 'https://github.com/motom001/dms';

/** Nach dem Übernehmen der Datenbank ist der Server kurz weg; danach meldet er die nächste Phase. */
async function warteBisGestartet(abbrechen: () => boolean = () => false) {
  for (let i = 0; i < 240 && !abbrechen(); i++) {
    try { const st = await api.status(); if (st.einrichtung?.phase !== 'startet' && st.einrichtung?.phase !== 'datenbank') return; } catch { /* startet noch */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
}

function Fortschritt({ aktiv }: { aktiv: number }) {
  return (
    <ol className="assistent-schritte" aria-label={`Schritt ${aktiv + 1} von ${SCHRITTE.length}: ${SCHRITTE[aktiv]}`}>
      {SCHRITTE.map((s, i) => (
        <li key={s} className={i < aktiv ? 'erledigt' : i === aktiv ? 'aktiv' : ''} aria-current={i === aktiv ? 'step' : undefined}>
          <span className="nr" aria-hidden="true">{i < aktiv ? <Symbol name="haken" /> : i + 1}</span><span className="name">{s}</span>
        </li>
      ))}
    </ol>
  );
}

/** Hilfe je Schritt (#278): der passende Abschnitt im Online-Handbuch, mit Bildern. */
const HILFE_JE_SCHRITT: Hilfeort[] = ['einrichtung.code', 'einrichtung.datenbank', 'einrichtung.wahl', 'einrichtung.mandant', 'einrichtung.administrator', 'einrichtung.benutzer', 'einrichtung.schluessel', 'einrichtung.pakete', 'einrichtung.optional', 'einrichtung.fertig'];

function SchrittHilfe({ aktiv }: { aktiv: number }) {
  const z = HILFE[HILFE_JE_SCHRITT[aktiv]];
  return (
    <a className="assistent-hilfe" href={hilfeOnlineUrl(z)} target="_blank" rel="noreferrer" title={`Hilfe zu „${z.titel}“ im Administratorhandbuch`} aria-label="Hilfe zu diesem Schritt im Handbuch, mit Bildern (öffnet in neuem Tab)">
      <span className="hilfesymbol" aria-hidden="true">?</span> Hilfe mit Bildern
    </a>
  );
}

function Rahmen({ aktiv, titel, unter, children }: { aktiv: number; titel: string; unter?: ReactNode; children: ReactNode }) {
  return (
    <div className="kartenseite">
      <div className="karte breit assistent">
        <div className="assistent-kopf">
          <p className="ueber">Einrichtung · Schritt {aktiv + 1} von {SCHRITTE.length}</p>
          <SchrittHilfe aktiv={aktiv} />
        </div>
        <Fortschritt aktiv={aktiv} />
        <h1>{titel}</h1>
        {unter && <p className="leise">{unter}</p>}
        {children}
      </div>
    </div>
  );
}

function useSenden() {
  const [sendet, setSendet] = useState(false);
  const [fehler, setFehler] = useState<string>();
  const los = async (f: () => Promise<void>) => {
    setSendet(true); setFehler(undefined);
    try { await f(); } catch (e) { setFehler((e as Error).message); } finally { setSendet(false); }
  };
  return { sendet, fehler, setFehler, los };
}

/* ---------- Schritte 1–5: ohne Anmeldung ---------- */

export function Einrichtungsassistent({ status, fertig }: { status: KontoStatus; fertig: () => Promise<void> }) {
  const e = status.einrichtung;
  const phase = e?.phase ?? 'konto';
  const [codeOk, setCodeOk] = useState(!e?.code || false);
  const [wahl, setWahl] = useState<'neu' | 'sicherung' | null>(null);
  const [mandant, setMandant] = useState('');
  const [mandantFertig, setMandantFertig] = useState(false);

  // Gespeicherten Code (sessionStorage) beim Laden prüfen.
  useEffect(() => {
    if (!e?.code || !hatEinrichtungscode() || phase === 'startet') return;
    api.einrichtungCode().then(() => { if (!codeOk) { setCodeOk(true); void fertig(); } }, () => setzeEinrichtungscode(null));
  }, [e?.code, phase]);

  // DMS startet nach dem Übernehmen der Datenbank im selben Prozess: Stand abfragen, bis es da ist.
  useEffect(() => {
    if (phase !== 'startet') return;
    let aus = false;
    void warteBisGestartet(() => aus).then(() => { if (!aus) void fertig(); });
    return () => { aus = true; };
  }, [phase, fertig]);

  if (phase === 'startet') return <Rahmen aktiv={1} titel="Das DMS startet …"><p className="leise">Die Datenbank ist verbunden. Jetzt legt das DMS seine Tabellen an – das dauert einen Moment.</p></Rahmen>;
  if (e?.code && !codeOk) return <CodeSchritt ok={() => { setCodeOk(true); void fertig(); }} />;
  // Bisherige Anbindung und Fehler liefert der Server erst mit Code – dann neu vorbelegen.
  if (phase === 'datenbank') return <DatenbankSchritt key={e?.anbindung ? 'mit' : 'ohne'} status={status} weiter={fertig} />;
  if (!wahl) return (
    <Rahmen aktiv={2} titel="Neu einrichten oder wiederherstellen?" unter="Die Datenbank ist verbunden und noch leer.">
      <div className="wahlkarten">
        <button type="button" className="wahlkarte" onClick={() => setWahl('neu')}>
          <strong>Neu einrichten</strong><span className="leise">Ein leeres DMS – du legst Haushalt, Administrator und Benutzer an.</span>
        </button>
        <button type="button" className="wahlkarte" onClick={() => setWahl('sicherung')}>
          <strong>Aus einer Sicherung wiederherstellen</strong><span className="leise">Neues NAS, alte Sicherung: Lege sie in den Sicherungsordner und halte das Notfallblatt bereit. Danach meldest du dich mit den bisherigen Zugangsdaten an.</span>
        </button>
      </div>
    </Rahmen>
  );
  if (wahl === 'sicherung') return (
    <Rahmen aktiv={2} titel="Aus Sicherung wiederherstellen" unter="Wähle eine Sicherung aus dem Sicherungsordner. Danach meldest du dich mit den Zugangsdaten an, die zur Zeit der Sicherung galten – ein neuer Administrator ist nicht nötig.">
      <WiederherstellungsAssistent frisch gestartet={() => void fertig()} abbrechen={() => setWahl(null)} />
    </Rahmen>
  );
  if (!mandantFertig) return (
    <Rahmen aktiv={3} titel="Willkommen" unter="Wie heißt dein DMS? Meist der Name der Familie oder der Firma.">
      <form className="stapel" onSubmit={(ev) => { ev.preventDefault(); if (mandant.trim()) setMandantFertig(true); }}>
        <label className="eigenschaft"><span>Name des Haushalts <small>z. B. „Familie Mustermann“</small></span>
          <input value={mandant} onChange={(x) => setMandant(x.target.value)} maxLength={30} autoFocus required /></label>
        <p className="leise klein">Er erscheint als Schriftzug in der Kopfzeile, im Browser-Tab und auf der Anmeldeseite. Ändern lässt er sich jederzeit unter Werkbank → Designs → Logo und Schriftzug.</p>
        <div className="knoepfe"><button type="button" className="knopf" onClick={() => setWahl(null)}>Zurück</button><button className="knopf primaer" disabled={!mandant.trim()}>Weiter</button></div>
      </form>
    </Rahmen>
  );
  return <AdminSchritt mandant={mandant.trim()} zurueck={() => setMandantFertig(false)} fertig={fertig} />;
}

function CodeSchritt({ ok }: { ok: () => void }) {
  const [code, setCode] = useState('');
  const s = useSenden();
  return (
    <Rahmen aktiv={0} titel="Einrichtungscode" unter="Damit niemand sonst im Netz dein DMS einrichtet, fragt es zuerst nach einem Code. Den hat das DMS beim Start an zwei Stellen hinterlegt:">
      <ol className="anleitung">
        <li><strong>Im Protokoll des Containers.</strong> In der Docker-Oberfläche des NAS den Container <span className="mono">app</span> des Projekts öffnen (bei UGREEN: <em>Docker → Container → dms-app → Protokoll</em>, bei Synology: <em>Container Manager → Container → Details → Protokoll</em>) oder auf der Kommandozeile <span className="mono">docker compose logs app</span>. Gesucht ist die Zeile <span className="mono">Einrichtungscode für das DMS: XXXX-XXXX-XXXX</span>.</li>
        <li><strong>In einer Datei</strong> namens <span className="mono">EINRICHTUNGSCODE</span> im Ordner für den Schlüssel, in der Vorlage <span className="mono">/volume1/docker/dms/geheim</span>.</li>
      </ol>
      <form className="stapel" onSubmit={(ev) => { ev.preventDefault(); void s.los(async () => {
        setzeEinrichtungscode(code.trim());
        try { await api.einrichtungCode(); ok(); } catch (x) { setzeEinrichtungscode(null); throw x; }
      }); }}>
        <label className="eigenschaft"><span>Einrichtungscode</span><input className="mono" value={code} onChange={(x) => setCode(x.target.value)} placeholder="XXXX-XXXX-XXXX" autoComplete="off" autoCapitalize="characters" spellCheck={false} autoFocus required /></label>
        {s.fehler && <p className="fehlertext">{s.fehler}</p>}
        <button className="knopf primaer" disabled={s.sendet || !code.trim()}>{s.sendet ? 'Prüfe …' : 'Weiter'}</button>
      </form>
      <p className="klein">Wo das bei deinem Gerät ist, zeigt die Anleitung deiner Plattform mit Bildern: <a className="verweis" href={INSTALLIEREN_URL} target="_blank" rel="noreferrer">Wie komme ich an ein DMS? ↗</a></p>
      <p className="leise klein">Nach der Einrichtung ist der Code wertlos; das DMS löscht die Datei.</p>
    </Rahmen>
  );
}

export const STANDARD_DB: AnbindungEingabe = { host: 'db', port: 5432, datenbank: 'dms', benutzer: 'dms', passwort: '' };

/** Formular der Anbindung – im Assistenten und in der Werkbank. */
export function AnbindungFormular({ wert, setWert, passwortGesetzt, felder }: { wert: AnbindungEingabe; setWert: (a: AnbindungEingabe) => void; passwortGesetzt: boolean; felder?: Record<string, string> }) {
  const feld = (k: keyof AnbindungEingabe, name: string, hilfe: string, typ = 'text') => (
    <label className="eigenschaft"><span>{name} <small>{hilfe}</small></span>
      <input type={typ} value={String(wert[k])} onChange={(x) => setWert({ ...wert, [k]: k === 'port' ? Number(x.target.value) : x.target.value })}
        autoComplete={k === 'passwort' ? 'new-password' : 'off'} spellCheck={false} aria-invalid={!!felder?.[k]} />
      {felder?.[k] && <small className="fehlertext">{felder[k]}</small>}
    </label>
  );
  return (
    <div className="raster">
      {feld('host', 'Server', 'Name des Datenbank-Containers, meist „db“')}
      {feld('port', 'Port', 'meist 5432', 'number')}
      {feld('datenbank', 'Datenbank', 'meist „dms“')}
      {feld('benutzer', 'Benutzer', 'meist „dms“')}
      {feld('passwort', 'Passwort', passwortGesetzt ? 'leer lassen = bisheriges behalten' : 'DB_PASSWORD aus der .env', 'password')}
    </div>
  );
}

export function PruefungAnzeige({ p }: { p: AnbindungPruefung }) {
  if (p.ok) return <div className="hinweis gut"><p><strong>Verbindung klappt.</strong> PostgreSQL {p.postgres.split(' ')[0]}{p.eingerichtet ? ` – darin gibt es schon ein DMS (${p.benutzer} ${p.benutzer === 1 ? 'Benutzer' : 'Benutzer'}).` : ' – die Datenbank ist leer; das DMS legt seine Tabellen selbst an.'}</p></div>;
  return <div className="hinweis schlecht"><p><strong>{p.text}</strong></p><details><summary className="leise klein">Technische Meldung</summary><p className="mono klein">{p.technisch}</p></details></div>;
}

function DatenbankSchritt({ status, weiter }: { status: KontoStatus; weiter: () => Promise<void> }) {
  const e = status.einrichtung!;
  const v = e.anbindung;
  const [a, setA] = useState<AnbindungEingabe>(v ? { host: v.host, port: v.port, datenbank: v.datenbank, benutzer: v.benutzer, passwort: '' } : STANDARD_DB);
  const [p, setP] = useState<AnbindungPruefung | null>(null);
  const [felder, setFelder] = useState<Record<string, string>>();
  const [startet, setStartet] = useState(false);
  const s = useSenden();
  const tu = (f: () => Promise<void>) => s.los(async () => {
    setFelder(undefined);
    try { await f(); } catch (x) { if (x instanceof ApiFehler) setFelder((x.details as { felder?: Record<string, string> })?.felder); throw x; }
  });
  if (startet) return <Rahmen aktiv={1} titel="Das DMS startet …"><p className="leise">Die Datenbank ist verbunden. Jetzt legt das DMS seine Tabellen an – das dauert einen Moment.</p></Rahmen>;
  return (
    <Rahmen aktiv={1} titel="Datenbank" unter="Das DMS speichert alles außer den Dateien in PostgreSQL. In der Compose-Vorlage läuft die Datenbank als eigener Container „db“; das Passwort steht in der Datei .env daneben.">
      {e.fehler && <div className="hinweis warn"><p><strong>{e.quelle === 'umgebung' ? 'Mit DATABASE_URL aus der Compose-Datei' : e.quelle === 'datei' ? 'Mit der gespeicherten Anbindung' : 'Die Verbindung'} klappt es nicht:</strong> {e.fehler}</p><p className="leise klein">Korrigiere die Angaben hier – sie werden in /data/geheim gespeichert und gelten ab dann, auch wenn DATABASE_URL anders lautet.</p></div>}
      <form className="stapel" onSubmit={(ev: FormEvent) => { ev.preventDefault(); void tu(async () => setP(await api.einrichtungDbPruefen(a))); }}>
        <AnbindungFormular wert={a} setWert={(x) => { setA(x); setP(null); }} passwortGesetzt={!!v?.passwortGesetzt} felder={felder} />
        {p && <PruefungAnzeige p={p} />}
        {s.fehler && <p className="fehlertext">{s.fehler}</p>}
        <div className="knoepfe">
          <button className="knopf" disabled={s.sendet}>{s.sendet ? 'Prüfe …' : 'Verbindung prüfen'}</button>
          {p && !p.ok && p.art === 'datenbank_fehlt' && p.anlegenMoeglich && <button type="button" className="knopf" disabled={s.sendet} onClick={() => void tu(async () => setP(await api.einrichtungDbAnlegen(a)))}>Datenbank „{a.datenbank}“ anlegen</button>}
          {p?.ok && <button type="button" className="knopf primaer" disabled={s.sendet} onClick={() => void tu(async () => { await api.einrichtungDbUebernehmen(a); setStartet(true); await warteBisGestartet(); await weiter(); })}>Übernehmen und weiter</button>}
        </div>
        {p && !p.ok && p.art === 'datenbank_fehlt' && !p.anlegenMoeglich && <p className="leise klein">Dieser Benutzer darf keine Datenbanken anlegen. Lege sie in PostgreSQL an oder nimm den Benutzer aus der Compose-Vorlage.</p>}
      </form>
    </Rahmen>
  );
}

function AdminSchritt({ mandant, zurueck, fertig }: { mandant: string; zurueck: () => void; fertig: () => Promise<void> }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const s = useSenden();
  return (
    <Rahmen aktiv={4} titel="Administrator" unter={<>Der Administrator richtet das DMS ein – Mappentypen, Benutzer, Sicherung. <strong>In der Ablage arbeitet er nicht</strong>; dafür legst du im nächsten Schritt einen normalen Benutzer an, z. B. dich selbst mit einer zweiten Adresse.</>}>
      <form className="stapel" onSubmit={(ev) => { ev.preventDefault(); void s.los(async () => {
        if (pw !== pw2) throw new Error('Die beiden Passwörter stimmen nicht überein.');
        await api.einrichten({ mandant, name, email, passwort: pw });
        setzeEinrichtungscode(null);
        await fertig();
      }); }}>
        <label className="eigenschaft"><span>Name</span><input value={name} onChange={(x) => setName(x.target.value)} autoComplete="name" placeholder="z. B. Admin" autoFocus /></label>
        <label className="eigenschaft"><span>E-Mail-Adresse <small>damit meldest du dich als Administrator an</small></span><input type="email" value={email} onChange={(x) => setEmail(x.target.value)} autoComplete="email" required /></label>
        <label className="eigenschaft"><span>Passwort <small>mindestens {PASSWORT_MINDESTLAENGE} Zeichen</small></span><input type="password" value={pw} onChange={(x) => setPw(x.target.value)} autoComplete="new-password" required /></label>
        <label className="eigenschaft"><span>Passwort wiederholen</span><input type="password" value={pw2} onChange={(x) => setPw2(x.target.value)} autoComplete="new-password" required /></label>
        {s.fehler && <p className="fehlertext">{s.fehler}</p>}
        <div className="knoepfe"><button type="button" className="knopf" onClick={zurueck}>Zurück</button><button className="knopf primaer" disabled={s.sendet}>{s.sendet ? 'Lege an …' : 'Administrator anlegen'}</button></div>
      </form>
    </Rahmen>
  );
}

/* ---------- Schritte 6–10: angemeldet als Administrator ---------- */

const NACH: Record<EinrichtungSchritt, number> = { benutzer: 5, schluessel: 6, pakete: 7, optional: 8, fertig: 9 };

export function AssistentAngemeldet() {
  const { aktualisieren } = useKonto();
  const [stand, setStand] = useState<EinrichtungStand | null>(null);
  const [fehler, setFehler] = useState<string>();
  const laden = useCallback(async () => { try { setStand(await api.einrichtungStand()); } catch (e) { setFehler((e as Error).message); } }, []);
  useEffect(() => { void laden(); }, [laden]);
  const merke = async (s: EinrichtungSchritt, uebersprungen = false) => {
    const neu = await api.einrichtungSchritt(s, uebersprungen);
    setStand(neu);
    if (!neu.offen) { geheZu('/werkbank', true); await aktualisieren(); }
  };
  if (fehler) return <Rahmen aktiv={5} titel="Einrichtung"><p className="fehlertext">{fehler}</p></Rahmen>;
  if (!stand) return <p className="leise mittig">Lade …</p>;
  const fertig = new Set([...stand.erledigt, ...stand.uebersprungen]);
  const schritt = (['benutzer', 'schluessel', 'pakete', 'optional', 'fertig'] as const).find((s) => !fertig.has(s)) ?? 'fertig';
  if (schritt === 'benutzer') return <BenutzerSchritt weiter={(u) => merke('benutzer', u)} />;
  if (schritt === 'schluessel') return <SchluesselSchritt weiter={(u) => merke('schluessel', u)} />;
  if (schritt === 'pakete') return <PaketeSchritt weiter={(u) => merke('pakete', u)} />;
  if (schritt === 'optional') return <OptionalSchritt weiter={(u) => merke('optional', u)} />;
  return <FertigSchritt stand={stand} weiter={() => merke('fertig')} />;
}

function Weiter({ weiter, kannWeiter, ueberspringen = true, text = 'Weiter' }: { weiter: (uebersprungen: boolean) => Promise<void>; kannWeiter: boolean; ueberspringen?: boolean; text?: string }) {
  const s = useSenden();
  return (
    <>
      {s.fehler && <p className="fehlertext">{s.fehler}</p>}
      <div className="knoepfe">
        {ueberspringen && <button type="button" className="knopf" disabled={s.sendet} onClick={() => void s.los(() => weiter(true))}>Überspringen</button>}
        <button type="button" className="knopf primaer" disabled={s.sendet || !kannWeiter} onClick={() => void s.los(() => weiter(false))}>{text}</button>
      </div>
    </>
  );
}

function BenutzerSchritt({ weiter }: { weiter: (uebersprungen: boolean) => Promise<void> }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [r, setR] = useState<LinkErgebnis | null>(null);
  const [kopiert, setKopiert] = useState(false);
  const s = useSenden();
  return (
    <Rahmen aktiv={NACH.benutzer} titel="Erster Benutzer" unter="Mit diesem Konto arbeitest du in der Ablage. Der Administrator bleibt für die Werkbank – so trennt das DMS Einrichten und Arbeiten.">
      {!r ? (
        <form className="stapel" onSubmit={(ev) => { ev.preventDefault(); void s.los(async () => setR(await api.benutzerAnlegen({ name, email, rolle: 'mitglied' }))); }}>
          <label className="eigenschaft"><span>Name</span><input value={name} onChange={(x) => setName(x.target.value)} autoComplete="off" autoFocus /></label>
          <label className="eigenschaft"><span>E-Mail-Adresse <small>eine andere als die des Administrators</small></span><input type="email" value={email} onChange={(x) => setEmail(x.target.value)} autoComplete="off" required /></label>
          {s.fehler && <p className="fehlertext">{s.fehler}</p>}
          <div className="knoepfe"><button type="button" className="knopf" onClick={() => void s.los(() => weiter(true))}>Überspringen</button><button className="knopf primaer" disabled={s.sendet}>{s.sendet ? 'Lege an …' : 'Benutzer anlegen'}</button></div>
        </form>
      ) : (
        <>
          <div className="hinweis gut"><p><strong>{r.benutzer.name || r.benutzer.email} ist angelegt.</strong> {r.mailVerschickt ? 'Die Einladung ist per E-Mail unterwegs.' : 'Mit diesem Link legt er sein Passwort fest – öffne ihn nach der Einrichtung, am besten in einem anderen Browser oder privaten Fenster:'}</p></div>
          {r.link && (
            <div className="zeile">
              <input className="mono" readOnly value={r.link} onFocus={(x) => x.target.select()} style={{ flex: 1 }} aria-label="Einladungslink" />
              <button type="button" className="knopf" onClick={() => void navigator.clipboard?.writeText(r.link!).then(() => setKopiert(true), () => {})}>{kopiert ? 'Kopiert' : 'Kopieren'}</button>
            </div>
          )}
          <p className="leise klein">Weitere Benutzer lädst du später unter Werkbank → Benutzer ein.</p>
          <Weiter weiter={weiter} kannWeiter ueberspringen={false} />
        </>
      )}
    </Rahmen>
  );
}

function SchluesselSchritt({ weiter }: { weiter: (uebersprungen: boolean) => Promise<void> }) {
  const [t, setT] = useState<TresorStatus | null>(null);
  const [geladen, setGeladen] = useState(false);
  const s = useSenden();
  useEffect(() => { void api.tresor().then(setT, () => {}); }, []);
  const da = t?.zustand === 'vorhanden';
  return (
    <Rahmen aktiv={NACH.schluessel} titel="Schlüssel und Notfallblatt" unter="Passwörter (z. B. das des Mailservers) und alle Sicherungen verschlüsselt das DMS mit einem Schlüssel. Er liegt als Datei im Ordner geheim – nie in der Datenbank.">
      {!t ? <p className="leise">Lade …</p> : (
        <>
          {t.eingebunden === false && <div className="hinweis warn"><p><strong>Der Ordner /data/geheim ist kein eigenes Volume.</strong> Der Schlüssel ginge beim Neuerstellen des Containers verloren – ergänze das Volume in der Compose-Datei.</p></div>}
          <ol className="anleitung">
            <li className={da ? 'erledigt' : ''}>
              {da && <Erledigt />}<strong>Schlüssel erzeugen.</strong> {da ? <>Erledigt – Fingerabdruck <span className="mono">{t.fingerabdruck}</span>.</> : <button type="button" className="knopf klein" disabled={s.sendet} onClick={() => void s.los(async () => setT(await api.tresorErzeugen()))}>Schlüssel erzeugen</button>}
            </li>
            <li className={geladen ? 'erledigt' : ''}>
              {geladen && <Erledigt />}<strong>Notfallblatt herunterladen, ausdrucken und sicher aufbewahren.</strong> Es enthält den Schlüssel – ohne ihn lässt sich keine Sicherung wiederherstellen, wenn das NAS ausfällt.{' '}
              {da ? <a className="knopf klein" href="/api/werkbank/notfallblatt" download onClick={() => setGeladen(true)}>Notfallblatt herunterladen</a> : <span className="leise">(erst nach dem Schlüssel)</span>}
            </li>
          </ol>
          {s.fehler && <p className="fehlertext">{s.fehler}</p>}
          <Weiter weiter={weiter} kannWeiter={da} />
          {da && !geladen && <p className="leise klein">Ohne Notfallblatt weiter? Du findest es später unter Werkbank → Sicherung; die Übersicht erinnert daran.</p>}
        </>
      )}
    </Rahmen>
  );
}

/**
 * Pakete dazuholen (#460): Auswahl aus dem offiziellen Katalog, Texterkennung vorausgewählt. Der Katalog wird
 * erst abgefragt, wenn dieser Schritt erscheint. Rechte bestätigst du je Paket.
 */
function PaketeSchritt({ weiter }: { weiter: (uebersprungen: boolean) => Promise<void> }) {
  const s = useSenden();
  return (
    <Rahmen aktiv={NACH.pakete} titel="Pakete dazuholen" unter="Pakete bringen fertige Mappentypen, Ansichten und Funktionen wie die Texterkennung mit. Wähle, was du gleich brauchst – alles andere holst du später unter Werkbank → Pakete.">
      <PaketeDazuholen ueberspringen={() => void s.los(() => weiter(true))} weiter={(e) => void s.los(() => weiter(!e.some((x) => x.art === 'installiert')))} />
      {s.fehler && <p className="fehlertext">{s.fehler}</p>}
    </Rahmen>
  );
}

function OptionalSchritt({ weiter }: { weiter: (uebersprungen: boolean) => Promise<void> }) {
  const betrieb = useBetrieb();
  const [adresse, setAdresse] = useState(location.origin);
  const [mail, setMail] = useState<MailEinstellung | null>(null);
  const [demo, setDemo] = useState(false);
  const [meldung, setMeldung] = useState<Record<string, string>>({});
  const s = useSenden();
  useEffect(() => { void api.aufgabenWerkbank().then((r) => setMail(r.mail ?? { aktiv: true, uhrzeit: '07:00', bundesland: null }), () => {}); }, []);
  useEffect(() => { if (betrieb.stand?.adresse) setAdresse(betrieb.stand.adresse); }, [betrieb.stand?.adresse]);
  const gut = (k: string, t: string) => setMeldung((m) => ({ ...m, [k]: t }));
  return (
    <Rahmen aktiv={NACH.optional} titel="Optionales" unter="Alles hier lässt sich auch später in der Werkbank einstellen.">
      <section className="blatt">
        <h2 className="h3">Adresse des DMS</h2>
        <p className="leise klein">Unter dieser Adresse öffnen die Benutzer das DMS; sie steht in den Links der E-Mails. Vorbelegt mit der Adresse, unter der du es gerade aufrufst.</p>
        <div className="zeile"><input value={adresse} onChange={(x) => setAdresse(x.target.value)} style={{ flex: 1 }} aria-label="Adresse des DMS" />
          <button type="button" className="knopf" disabled={s.sendet} onClick={() => void s.los(async () => { await api.adresseSpeichern(adresse); gut('adresse', 'Gespeichert.'); await betrieb.laden(); })}>Speichern</button></div>
        {meldung.adresse && <p className="gutertext klein">{meldung.adresse}</p>}
      </section>
      <section className="blatt">
        <h2 className="h3">Bundesland</h2>
        <p className="leise klein">An gesetzlichen Feiertagen kommt keine tägliche Zusammenfassung der Aufgaben.</p>
        <div className="zeile">
          <select value={mail?.bundesland ?? ''} onChange={(x) => mail && setMail({ ...mail, bundesland: x.target.value || null })} aria-label="Bundesland">
            <option value="">keins – Feiertage nicht berücksichtigen</option>
            {Object.entries(BUNDESLAENDER).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button type="button" className="knopf" disabled={s.sendet || !mail} onClick={() => void s.los(async () => { setMail(await api.aufgabenMailSpeichern(mail!)); gut('land', 'Gespeichert.'); })}>Speichern</button>
        </div>
        {meldung.land && <p className="gutertext klein">{meldung.land}</p>}
      </section>
      <section className="blatt">
        <h2 className="h3">Beispiele</h2>
        <p className="leise klein">Ein paar fertige Mappentypen (z. B. Verträge, Rechnungen) als Ausgangspunkt. Sie lassen sich anpassen oder löschen.</p>
        {demo ? <p className="gutertext klein">Beispiel-Mappentypen geladen.</p> : <button type="button" className="knopf" disabled={s.sendet} onClick={() => void s.los(async () => { await api.beispiele(); setDemo(true); })}>Beispiel-Mappentypen laden</button>}
      </section>
      <details className="blatt">
        <summary><strong>E-Mail-Versand einrichten</strong> <span className="leise klein">– für Einladungen, Passwort-Links und die tägliche Zusammenfassung</span></summary>
        <BetriebPanel b={betrieb} />
      </details>
      {s.fehler && <p className="fehlertext">{s.fehler}</p>}
      <Weiter weiter={weiter} kannWeiter />
    </Rahmen>
  );
}

function FertigSchritt({ stand, weiter }: { stand: EinrichtungStand; weiter: () => Promise<void> }) {
  const { version } = useKonto();
  const umgebung = `Version ${version ?? 'unbekannt'}, Browser ${navigator.userAgent}`;
  const issue = `${REPO}/issues/new?${new URLSearchParams({ title: 'Problem bei der Einrichtung', body: `**Was ist passiert?**\n\n\n**Was hätte ich erwartet?**\n\n\n---\n${umgebung}` })}`;
  return (
    <Rahmen aktiv={NACH.fertig} titel={`${stand.mandant ?? 'Dein DMS'} ist eingerichtet`} unter="Melde dich mit dem Benutzer aus Schritt 6 an, um in der Ablage zu arbeiten. Als Administrator geht es in der Werkbank weiter – dort legst du Mappentypen und Ansichten an.">
      {stand.uebersprungen.length > 0 && <div className="hinweis info"><p>Übersprungen: {stand.uebersprungen.map((s) => SCHRITTE[NACH[s]]).join(', ')}. Das lässt sich in der Werkbank nachholen; die Übersicht erinnert daran.</p></div>}
      <ul className="linkliste">
        <li><a className="verweis" href={handbuchUrl('benutzer', version)} target="_blank" rel="noreferrer">Benutzerhandbuch ↗</a> – Ablage, Dokumente, Aufgaben.</li>
        <li><a className="verweis" href={handbuchUrl('admin', version)} target="_blank" rel="noreferrer">Administratorhandbuch ↗</a> – Mappentypen, Sicherung, Wartung.</li>
        <li><a className="verweis" href={issue} target="_blank" rel="noreferrer">Problem melden ↗</a> – als vorbereitetes GitHub-Issue mit Version und Umgebung.</li>
        <li><a className="verweis" href="https://github.com/sponsors/motom001" target="_blank" rel="noreferrer">Projekt unterstützen ↗</a> – freiwillig, Betrag frei wählbar.</li>
      </ul>
      <Weiter weiter={() => weiter()} kannWeiter ueberspringen={false} text="Zur Werkbank" />
    </Rahmen>
  );
}
