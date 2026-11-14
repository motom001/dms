import { useEffect, useState, type FormEvent } from 'react';
import { installierenUrl } from '../../shared/src/hilfe';
import { api, ApiFehler, hatEinrichtungscode, setzeEinrichtungscode, type AnbindungEingabe, type AnbindungPruefung, type KontoStatus } from './api';
import { WiederherstellungsAssistent } from './wiederherstellen';
import { useKonto } from './konto';
import { t, tn } from './sprache';
import { nachDemLaden, nimmDatei, ladeDatei } from './assistent/datei';
import { Rahmen, Sammelassistent, SprachSchritt, unterbrochenerLauf, VOR, zurSprache, type Leiste } from './assistent/Schritte';
import { setzeStand, useAssistent } from './assistent/stand';
import { useNeuLadenBeiNeuerVersion } from './erreichbar';
import { Feld, Knopf } from './bausteine';

/**
 * Einrichtungsassistent (#119). Seit #804: Code, Datenbank und „Neu oder Sicherung“ wirken sofort, weil sie technisch
 * nötig sind. Danach sammelt der Assistent nur (Ablage, Dein Konto, Pakete, Optionales), zeigt eine
 * Zusammenfassung und legt erst mit „Jetzt einrichten“ etwas an – Schritte und Ablauf in assistent/Schritte.tsx.
 * Übersprungenes lässt sich in der Werkbank nachholen.
 */

/** Nach dem Übernehmen der Datenbank ist der Server kurz weg; danach meldet er die nächste Phase. */
async function warteBisGestartet(abbrechen: () => boolean = () => false) {
  for (let i = 0; i < 240 && !abbrechen(); i++) {
    try { const st = await api.status(); if (st.einrichtung?.phase !== 'startet' && st.einrichtung?.phase !== 'datenbank') return; } catch { /* startet noch */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
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

/** Vor dem Sammeln: Code und Datenbank sind gesperrt (mit Grund), alles danach noch nicht erreicht. */
const VORHER: Leiste = {
  erledigt: (i) => i < VOR.wahl,
  klick: (i) => (i === VOR.sprache ? zurSprache : null),
  gesperrt: (i) => (i === VOR.code ? t('einrichtung.gesperrt.code') : i === VOR.datenbank ? t('einrichtung.gesperrt.datenbank') : null),
};

/* ---------- Ohne Anmeldung: Code, Datenbank, Neu oder Sicherung, dann sammeln ---------- */

export function Einrichtungsassistent({ status, fertig }: { status: KontoStatus; fertig: () => Promise<void> }) {
  const e = status.einrichtung;
  const phase = e?.phase ?? 'konto';
  const [codeOk, setCodeOk] = useState(!e?.code || false);
  const [sicherung, setSicherung] = useState(false);
  const st = useAssistent();
  // Neue Version (#933): ohne Rückfrage neu laden – der Stand liegt im Browser, nur Passwörter gehen verloren. Nicht,
  // solange „Jetzt einrichten“ läuft.
  useNeuLadenBeiNeuerVersion(!!st.lauf?.laeuft, `${phase}-${codeOk}-${st.spracheGewaehlt}-${st.neu}-${sicherung}-${st.aendern ?? st.sammlung.ansicht}`);

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

  // Konfigurationsdatei (#806): auf dem Code-Schritt gewählt, oder vor der Datenbank geladen – jetzt prüfen.
  useEffect(() => {
    if (!codeOk || phase === 'startet') return;
    const wartend = nimmDatei();
    if (wartend) { void ladeDatei(wartend, phase === 'datenbank').catch(() => {}); return; }
    if (phase === 'konto' && st.sammlung.pruefungOffen) void nachDemLaden().catch(() => {});
  }, [codeOk, phase]); // eslint-disable-line react-hooks/exhaustive-deps -- nur bei gültigem Code oder neuer Phase

  if (phase === 'startet') return <Rahmen aktiv={VOR.datenbank} titel={t('einrichtung.assistent.ablago-startet')} leiste={VORHER}><p className="leise">{t('einrichtung.assistent.die-datenbank-ist-verbunden')}</p></Rahmen>;
  // Sprache zuerst (#729).
  if (!st.spracheGewaehlt && !st.lauf) return <SprachSchritt leiste={{ erledigt: () => false, gesperrt: (i) => (i > VOR.sprache ? t('einrichtung.gesperrt.sprache') : null) }} />;
  if (e?.code && !codeOk) return <CodeSchritt ok={() => { setCodeOk(true); void fertig(); }} />;
  // Bisherige Anbindung und Fehler liefert der Server erst mit Code – dann neu vorbelegen.
  if (phase === 'datenbank') return <DatenbankSchritt key={`${e?.anbindung ? 'mit' : 'ohne'}-${st.sammlung.datenbank ? 'datei' : ''}`} status={status} weiter={fertig} />;
  const zurWahl = () => setzeStand((x) => ({ ...x, neu: false }));
  // Läuft „Jetzt einrichten“ schon, bleibt es bei dieser Oberfläche – auch wenn das eigene Konto schon angelegt ist.
  if (st.neu || st.lauf) return <Sammelassistent zurWahl={zurWahl} abschliessen={fertig} />;
  if (sicherung) return (
    <Rahmen aktiv={VOR.wahl} titel={t('einrichtung.assistent.aus-sicherung-wiederherstellen')} leiste={VORHER} unter={t('einrichtung.assistent.waehle-eine-sicherung-aus')}>
      <WiederherstellungsAssistent frisch gestartet={() => void fertig()} abbrechen={() => setSicherung(false)} />
    </Rahmen>
  );
  return (
    <Rahmen aktiv={VOR.wahl} titel={t('einrichtung.assistent.neu-einrichten-oder-wiederherstellen')} unter={t('einrichtung.assistent.die-datenbank-ist-verbunden-2')} leiste={VORHER} datei={{}}>
      <div className="wahlkarten">
        {/* Zwei Wege als Karten (#1215: Baustein Knopf, Aussehen der Karte über .textknopf.wahlkarte). */}
        <Knopf art="link" className="wahlkarte" onClick={() => setzeStand((x) => ({ ...x, neu: true }))}>
          <strong>{t('einrichtung.assistent.neu-einrichten')}</strong><span className="leise">{t('einrichtung.wahl.neu')}</span>
        </Knopf>
        <Knopf art="link" className="wahlkarte" onClick={() => setSicherung(true)}>
          <strong>{t('einrichtung.assistent.aus-einer-sicherung-wiederherstellen')}</strong><span className="leise">{t('einrichtung.assistent.neues-nas-alte-sicherung')}</span>
        </Knopf>
      </div>
    </Rahmen>
  );
}

function CodeSchritt({ ok }: { ok: () => void }) {
  const [code, setCode] = useState('');
  const s = useSenden();
  return (
    <Rahmen aktiv={VOR.code} titel={t('einrichtung.assistent.einrichtungscode')} leiste={{ erledigt: (i) => i === VOR.sprache, klick: (i) => (i === VOR.sprache ? zurSprache : null) }} datei={{ ohneCode: true }} unter={t('einrichtung.assistent.damit-niemand-sonst-im')}>
      <ol className="anleitung">
        <li>{tn('einrichtung.assistent.in-der-docker-oberflaeche', { b: <strong>{t('einrichtung.assistent.im-protokoll-des-containers')}</strong>, span: <span className="mono">{t('einrichtung.assistent.app')}</span>, i: <em>{t('einrichtung.assistent.docker-container-dms-app')}</em>, i2: <em>{t('einrichtung.assistent.container-manager-container-details')}</em>, span2: <span className="mono">{t('einrichtung.assistent.docker-compose-logs-app')}</span>, span3: <span className="mono">{t('einrichtung.assistent.einrichtungscode-fuer-ablago-xxxx')}</span> })}</li>
        <li>{tn('einrichtung.assistent.namens-im-ordner-fuer', { b: <strong>{t('einrichtung.assistent.in-einer-datei')}</strong>, span: <span className="mono">{t('einrichtung.assistent.einrichtungscode-2')}</span>, span2: <span className="mono">{'/volume1/docker/dms/geheim'}</span> })}</li>
      </ol>
      <form className="stapel" onSubmit={(ev) => { ev.preventDefault(); void s.los(async () => {
        setzeEinrichtungscode(code.trim());
        try { await api.einrichtungCode(); ok(); } catch (x) { setzeEinrichtungscode(null); throw x; }
      }); }}>
        <Feld beschriftung={t('einrichtung.assistent.einrichtungscode')} fehler={s.fehler}><input className="mono" value={code} onChange={(x) => setCode(x.target.value)} placeholder="XXXX-XXXX-XXXX" autoComplete="off" autoCapitalize="characters" spellCheck={false} autoFocus required /></Feld>
        <div className="knoepfe"><Knopf art="haupt" type="submit" laeuft={s.sendet} laeuftText={t('einrichtung.assistent.pruefe')} gesperrt={!code.trim()}>{t('einrichtung.assistent.weiter')}</Knopf></div>
      </form>
      <p className="klein">{tn('einrichtung.assistent.wo-das-bei-deinem', { link: <a className="verweis" href={installierenUrl()} target="_blank" rel="noreferrer">{t('einrichtung.assistent.wie-komme-ich-an')}</a> })}</p>
      <p className="leise klein">{t('einrichtung.assistent.nach-der-einrichtung-ist')}</p>
    </Rahmen>
  );
}

export const STANDARD_DB: AnbindungEingabe = { host: 'db', port: 5432, datenbank: 'dms', benutzer: 'dms', passwort: '' };

/** Formular der Anbindung – im Assistenten und in der Werkbank. */
export function AnbindungFormular({ wert, setWert, passwortGesetzt, felder }: { wert: AnbindungEingabe; setWert: (a: AnbindungEingabe) => void; passwortGesetzt: boolean; felder?: Record<string, string> }) {
  const feld = (k: keyof AnbindungEingabe, name: string, hilfe: string, typ = 'text') => (
    <Feld beschriftung={name} hinweis={hilfe} fehler={felder?.[k]}>
      <input type={typ} value={String(wert[k])} onChange={(x) => setWert({ ...wert, [k]: k === 'port' ? Number(x.target.value) : x.target.value })}
        autoComplete={k === 'passwort' ? 'new-password' : 'off'} spellCheck={false} />
    </Feld>
  );
  return (
    <div className="raster">
      {feld('host', t('einrichtung.assistent.server'), t('einrichtung.assistent.name-des-datenbank-containers'))}
      {feld('port', t('einrichtung.assistent.port'), t('einrichtung.assistent.meist-5432'), 'number')}
      {feld('datenbank', t('einrichtung.assistent.datenbank'), t('einrichtung.assistent.meist-dms'))}
      {feld('benutzer', t('einrichtung.assistent.benutzer'), t('einrichtung.assistent.meist-dms'))}
      {feld('passwort', t('einrichtung.assistent.passwort'), passwortGesetzt ? t('einrichtung.assistent.leer-lassen-bisheriges-behalten') : t('einrichtung.assistent.db-password-aus-der'), 'password')}
    </div>
  );
}

export function PruefungAnzeige({ p }: { p: AnbindungPruefung }) {
  if (p.ok) return <div className="hinweis gut"><p>{tn('einrichtung.assistent.postgresql', { b: <strong>{t('einrichtung.assistent.verbindung-klappt')}</strong>, split: p.postgres.split(' ')[0], wert: p.eingerichtet ? t('einrichtung.assistent.darin-gibt-es-schon', { anzahl: p.benutzer }) : t('einrichtung.assistent.die-datenbank-ist-leer') })}</p></div>;
  return <div className="hinweis schlecht"><p><strong>{p.text}</strong></p><details><summary className="leise klein">{t('einrichtung.assistent.technische-meldung')}</summary><p className="mono klein">{p.technisch}</p></details></div>;
}

function DatenbankSchritt({ status, weiter }: { status: KontoStatus; weiter: () => Promise<void> }) {
  const e = status.einrichtung!;
  const v = e.anbindung;
  // Aus einer Konfigurationsdatei (#806) vorbelegt – das Passwort steht nie darin.
  const datei = useAssistent().sammlung.datenbank;
  const [a, setA] = useState<AnbindungEingabe>(datei ? { host: datei.host, port: datei.port, datenbank: datei.datenbank, benutzer: datei.benutzer, passwort: '' }
    : v ? { host: v.host, port: v.port, datenbank: v.datenbank, benutzer: v.benutzer, passwort: '' } : STANDARD_DB);
  const [p, setP] = useState<AnbindungPruefung | null>(null);
  const [felder, setFelder] = useState<Record<string, string>>();
  const [startet, setStartet] = useState(false);
  const s = useSenden();
  const tu = (f: () => Promise<void>) => s.los(async () => {
    setFelder(undefined);
    try { await f(); } catch (x) { if (x instanceof ApiFehler) setFelder((x.details as { felder?: Record<string, string> })?.felder); throw x; }
  });
  if (startet) return <Rahmen aktiv={VOR.datenbank} titel={t('einrichtung.assistent.ablago-startet')} leiste={VORHER}><p className="leise">{t('einrichtung.assistent.die-datenbank-ist-verbunden')}</p></Rahmen>;
  return (
    <Rahmen aktiv={VOR.datenbank} titel={t('einrichtung.assistent.datenbank')} leiste={{ erledigt: (i) => i < VOR.datenbank, klick: (i) => (i === VOR.sprache ? zurSprache : null), gesperrt: (i) => (i === VOR.code ? t('einrichtung.gesperrt.code') : null) }} datei={{ imEinrichtungsmodus: true }} unter={t('einrichtung.assistent.ablago-speichert-alles-ausser')}>
      {e.fehler && <div className="hinweis warn"><p><strong>{t('einrichtung.assistent.klappt-es-nicht', { wert: e.quelle === 'umgebung' ? t('einrichtung.assistent.mit-database-url-aus') : e.quelle === 'datei' ? t('einrichtung.assistent.mit-der-gespeicherten-anbindung') : t('einrichtung.assistent.die-verbindung') })}</strong> {e.fehler}</p><p className="leise klein">{t('einrichtung.assistent.korrigiere-die-angaben-hier')}</p></div>}
      <form className="stapel" onSubmit={(ev: FormEvent) => { ev.preventDefault(); void tu(async () => setP(await api.einrichtungDbPruefen(a))); }}>
        {datei && <p className="leise klein">{t('einrichtung.datenbank.datei')}</p>}
        <AnbindungFormular wert={a} setWert={(x) => { setA(x); setP(null); }} passwortGesetzt={!!v?.passwortGesetzt} felder={felder} />
        {p && <PruefungAnzeige p={p} />}
        {s.fehler && <p className="fehlertext">{s.fehler}</p>}
        <div className="knoepfe">
          <Knopf art={p?.ok ? 'neben' : 'haupt'} type="submit" laeuft={s.sendet} laeuftText={t('einrichtung.assistent.pruefe')}>{t('einrichtung.assistent.verbindung-pruefen')}</Knopf>
          {p && !p.ok && p.art === 'datenbank_fehlt' && p.anlegenMoeglich && <Knopf gesperrt={s.sendet} onClick={() => void tu(async () => setP(await api.einrichtungDbAnlegen(a)))}>{t('einrichtung.assistent.datenbank-anlegen', { datenbank: a.datenbank })}</Knopf>}
          {p?.ok && <Knopf art="haupt" gesperrt={s.sendet} onClick={() => void tu(async () => { await api.einrichtungDbUebernehmen(a); setStartet(true); await warteBisGestartet(); await weiter(); })}>{t('einrichtung.assistent.uebernehmen-und-weiter')}</Knopf>}
        </div>
        {p && !p.ok && p.art === 'datenbank_fehlt' && !p.anlegenMoeglich && <p className="leise klein">{t('einrichtung.assistent.dieser-benutzer-darf-keine')}</p>}
      </form>
    </Rahmen>
  );
}


/* ---------- Angemeldet mit „Gesamte Verwaltung“: „Jetzt einrichten“ läuft weiter bzw. Abschluss ---------- */

/**
 * Nach dem Anlegen des eigenen Kontos (auch nach Neuladen): Fortschritt, Fehler und Abschluss aus dem gespeicherten
 * Stand. Ohne Stand (anderer Browser oder ein Assistent aus einer älteren Version) bleiben nur Schlüssel und
 * Notfallblatt – den Rest holt man in der Werkbank nach.
 */
export function AssistentAngemeldet() {
  const { aktualisieren, version } = useKonto();
  const st = useAssistent();
  useNeuLadenBeiNeuerVersion(!!st.lauf?.laeuft, `${st.lauf?.fertig}-${st.aendern ?? st.sammlung.ansicht}`);
  useEffect(() => { if (!st.lauf) unterbrochenerLauf(); }, []); // eslint-disable-line react-hooks/exhaustive-deps -- nur beim ersten Anzeigen prüfen
  if (!st.lauf) return <p className="leise mittig">{t('einrichtung.assistent.lade')}</p>;
  return <Sammelassistent zurWahl={() => {}} abschliessen={aktualisieren} version={version} />;
}
