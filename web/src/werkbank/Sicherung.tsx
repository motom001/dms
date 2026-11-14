import { Feld, HakenFeld, Knopf, Schalter } from '../bausteine';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Symbol } from '../Symbol';
import { betriebApi, type ExternStand, type ExternZustand, type Notfallblattstand, type ProbeStand, type SicherungEintrag, type SicherungsPlan, type SicherungStand, type SicherungsZustand, type WhLauf } from '../api/betrieb';
import { t, tn } from '../sprache';
import { Schritte } from '../wiederherstellen';
import { Hilfe, useHandbuch } from '../Hilfe';
import { Link } from '../ort';
import { Speicherleiste, useEntwurf } from '../Speicherleiste';
import { gebietsschema } from '../../../shared/src/sprache';
import { NOTFALLBLATT_SEITE } from '../../../shared/src/werkbankansicht';
import { Kopf } from './Kopf';
import { useKontoOptional } from '../konto-kontext';
import { heikelLaden } from '../verwaltungsmodus';

/**
 * Werkbank → Sicherung (#103–#106): jetzt sichern, Liste mit Prüfsumme, Zeitplan und
 * Aufbewahrung, Speicherplatz und Speicherort. Das Notfallblatt steht nur unter Verschlüsselung (#993);
 * hier bleibt der Hinweis, wenn es fehlt oder nicht mehr gilt, mit Link dorthin (`NOTFALLBLATT_SEITE`).
 */

export const NOTFALLBLATT_URL = '/api/werkbank/notfallblatt';
const GEAENDERT = 'dms:sicherung';
export const meldeSicherung = () => dispatchEvent(new Event(GEAENDERT));

export const bytes = (b: number) => (b < 1024 ** 2 ? `${Math.max(1, Math.round(b / 1024))} KB` : b < 1024 ** 3 ? `${(b / 1024 ** 2).toFixed(0)} MB` : `${(b / 1024 ** 3).toFixed(1).replace('.', ',')} GB`);
export const zeit = (iso: string) => new Date(iso).toLocaleString(gebietsschema(), { dateStyle: 'medium', timeStyle: 'short' });
const ART = { manuell: t('werkbank.sicherung.von-hand'), automatisch: t('werkbank.sicherung.art.automatisch'), 'vor-wiederherstellung': t('werkbank.sicherung.vor-einer-wiederherstellung') } as Record<string, string>;
const TAGE = ['', t('werkbank.sicherung.montag'), t('werkbank.sicherung.dienstag'), t('werkbank.sicherung.mittwoch'), t('werkbank.sicherung.donnerstag'), t('werkbank.sicherung.freitag'), t('werkbank.sicherung.samstag'), t('werkbank.sicherung.sonntag')];

export function useSicherung(offen: boolean) {
  const [stand, setStand] = useState<SicherungStand | null>(null);
  const [fehler, setFehler] = useState<string>();
  const laden = useCallback(async () => {
    try { setStand(await betriebApi.sicherung()); setFehler(undefined); } catch (e) { setFehler((e as Error).message); }
  }, []);
  useEffect(() => {
    if (!offen) return;
    // laden fängt Fehler selbst ab (fehler); der Ereignis-Handler gibt kein Promise zurück (#1011).
    const neu = () => void laden();
    neu();
    addEventListener(GEAENDERT, neu);
    return () => removeEventListener(GEAENDERT, neu);
  }, [offen, laden]);
  // Während ein Lauf läuft: jede Sekunde den Fortschritt, am Ende alles neu.
  const laeuft = stand?.lauf?.status === 'laeuft';
  useEffect(() => {
    if (!laeuft) return;
    const timer = setInterval(() => {
      void betriebApi.sicherungLauf().then((lauf) => {
        setStand((s) => (s ? { ...s, lauf } : s));
        if (lauf?.status !== 'laeuft') void laden();
      }, () => {});
    }, 1000);
    return () => clearInterval(timer);
  }, [laeuft, laden]);
  // Probe-Wiederherstellung (#109): Schritte live.
  const probeLaeuft = stand?.probe?.art === 'probe' && stand.probe.status === 'laeuft';
  useEffect(() => {
    if (!probeLaeuft) return;
    const timer = setInterval(() => {
      void betriebApi.probeLauf().then((probe) => {
        setStand((s) => (s ? { ...s, probe } : s));
        if (probe?.status !== 'laeuft') void laden();
      }, () => {});
    }, 1000);
    return () => clearInterval(timer);
  }, [probeLaeuft, laden]);
  return { stand, setStand, fehler, laden };
}
export type SicherungZustand = ReturnType<typeof useSicherung>;

/** Hinweise zur Sicherung – auch für die Übersicht der Werkbank (#105). */
/** Hinweise zur Sicherung; `schluessel` und `datum` für die Übersicht (#816: Sortierung, Akzeptieren). */
export interface SicherungsHinweis {
  art: 'schlecht' | 'warn' | 'info'; text: ReactNode; schluessel: string; datum?: string | null;
  /** Eigenes Ziel statt der Sicherung (#993: Notfallblatt → Verschlüsselung) mit Text für den Knopf. */
  ziel?: string; knopf?: string;
}
/** `mitNotfallblatt`: nur wer die Verschlüsselung verwaltet, erfährt hier vom Notfallblatt (#993, Thomas 10.11.2026). */
export function sicherungsHinweise(z: SicherungsZustand, mitNotfallblatt: boolean): SicherungsHinweis[] {
  const h: SicherungsHinweis[] = [];
  if (!z.schluessel) return h; // Ohne Schlüssel weist schon die Verschlüsselung darauf hin.
  if (z.fehler) h.push({ schluessel: 'sicherung.fehler', datum: z.fehler.am, art: 'schlecht', text: <><strong>{t('werkbank.sicherung.die-letzte-sicherung-ist')}</strong> ({zeit(z.fehler.am)}): {z.fehler.grund}</> });
  if (!z.letzte) h.push({ schluessel: 'sicherung.keine', art: 'warn', text: <>{tn('werkbank.sicherung.lege-eine-an-und', { b: <strong>{t('werkbank.sicherung.es-gibt-noch-keine')}</strong> })}</> });
  else if (z.zuAlt) h.push({ schluessel: 'sicherung.alt', datum: z.letzte.ende, art: 'warn', text: <><strong>{t('werkbank.sicherung.die-letzte-sicherung-ist-2')}</strong> ({zeit(z.letzte.ende)}).</> });
  // Seit #815 auch: Der Notfallcode darauf wurde benutzt, oder das Blatt stammt aus der Zeit vor dem Notfallcode.
  const nb = z.notfallblatt;
  // Das Notfallblatt selbst steht unter Verschlüsselung (#993) – der Hinweis führt dorthin.
  if (mitNotfallblatt && !nb.aktuell && (z.letzte || z.planAktiv || nb.am)) h.push({ schluessel: 'sicherung.notfallblatt', art: 'warn', ziel: NOTFALLBLATT_SEITE, knopf: t('werkbank.sicherung.zum-notfallblatt'), text: nb.grund === 'benutzt' || nb.grund === 'ohne-code'
    ? <NotfallblattGrund n={nb} />
    : <>{tn('werkbank.sicherung.ohne-den-schluessel-darauf', { b: <strong>{nb.am ? t('werkbank.sicherung.das-notfallblatt-gehoert-zu') : t('werkbank.sicherung.das-notfallblatt-fehlt')}</strong> })}</> });
  // Probe-Wiederherstellung (#109): Ampel.
  if (z.probe?.ampel === 'rot') h.push({ schluessel: 'sicherung.probe-fehler', datum: z.probe.letzte?.am, art: 'schlecht', text: <><strong>{t('werkbank.sicherung.die-letzte-probe-wiederherstellung')}</strong> ({zeit(z.probe.letzte!.am)}): {z.probe.letzte!.info}</> });
  else if (z.probe?.ampel === 'gelb' && z.letzte) h.push({ schluessel: 'sicherung.probe', art: 'info', text: <>{tn('werkbank.sicherung.erst-eine-probe-zeigt', { b: <strong>{z.probe.letzte ? t('werkbank.sicherung.die-letzte-probe-wiederherstellung-2', { zeit: zeit(z.probe.letzte.am) }) : t('werkbank.sicherung.noch-keine-sicherung-wurde')}</strong> })}</> });
  if (z.ort.volume === false) h.push({ schluessel: 'sicherung.volume', art: 'warn', text: <>{tn('werkbank.sicherung.die-sicherungen-liegen-im', { b: <strong>{t('werkbank.sicherung.der-sicherungsordner-ist-kein')}</strong> })}</> });
  else if (z.ort.gleichePlatte) h.push({ schluessel: 'sicherung.gleiche-platte', art: 'info', text: <>{tn('werkbank.sicherung.faellt-sie-aus-sind', { b: <strong>{t('werkbank.sicherung.die-sicherungen-liegen-auf')}</strong> })}</> });
  // Sicherung außer Haus (#585): fehlgeschlagen bzw. mehr als 2 Tage im Rückstand.
  const x = z.extern;
  if (x?.fehler) h.push({ schluessel: 'sicherung.extern-fehler', datum: x.fehler.beginn, art: 'schlecht', text: <><strong>{t('werkbank.sicherung.extern.hinweis.fehler', { datum: zeit(x.fehler.beginn) })}</strong> {zielName(x, x.fehler.paket)}: {x.fehler.stand.grund ?? '–'}</> });
  else if (x?.zuAlt) h.push({ schluessel: 'sicherung.extern-alt', art: 'warn', text: <><strong>{t('werkbank.sicherung.extern.hinweis.alt')}</strong> {x.letzte ? t('werkbank.sicherung.extern.hinweis.letzte', { datum: zeit(x.letzte.beginn) }) : t('werkbank.sicherung.extern.hinweis.nie')}</> });
  return h;
}

/* ---------- Sicherung außer Haus (#585) ---------- */

const zielName = (x: ExternZustand, id: string) => x.ziele.find((z) => z.id === id)?.name ?? id;

/** Stand der Kopie außer Haus in Worten ohne „extern“: „geprüft“, „hochgeladen, Größe bestätigt“, „fehlgeschlagen“ … */
function externStatus(s: ExternStand): string {
  if (s.status === 'geprueft') return t(s.pruefung === 'stichprobe' ? 'werkbank.sicherung.extern.stichprobe' : 'werkbank.sicherung.extern.geprueft');
  if (s.status === 'hochgeladen') return t(s.pruefung === 'groesse' ? 'werkbank.sicherung.extern.groesse' : 'werkbank.sicherung.extern.hochgeladen');
  if (s.status === 'laeuft') return s.gesamt ? t('werkbank.sicherung.extern.laeuft.prozent', { prozent: Math.min(99, Math.floor(((s.bytes ?? 0) / s.gesamt) * 100)) }) : t('werkbank.sicherung.extern.laeuft');
  if (s.status === 'fehlgeschlagen') return t('werkbank.sicherung.extern.fehlgeschlagen');
  return t('werkbank.sicherung.extern.offen');
}
/** „extern geprüft“ usw. */
export const externText = (s: ExternStand) => `${t('werkbank.sicherung.extern.extern')} ${externStatus(s)}`;

/** Zelle „Wo“: „lokal ✓ · extern ✓ geprüft“ – je Paket ein Teil, Einzelheiten im Titel. */
function OrtZelle({ e, extern }: { e: SicherungEintrag; extern: ExternZustand | null | undefined }) {
  const staende = Object.entries(e.extern ?? {});
  const mehrere = staende.length > 1;
  return (
    <span className="ort-zelle">
      <span className="gutertext">{t('werkbank.sicherung.extern.lokal')} <Symbol name="haken" /></span>
      {staende.map(([id, s]) => {
        const ok = s.status === 'geprueft' || s.status === 'hochgeladen';
        const name = extern ? zielName(extern, id) : id;
        const titel = [name, s.ziel, s.grund, t('werkbank.sicherung.extern.stand', { datum: zeit(s.am) })].filter(Boolean).join(' – ');
        return (
          <span key={id} title={titel}>{' · '}
            <span className={s.status === 'fehlgeschlagen' ? 'fehlertext' : s.status === 'geprueft' ? 'gutertext' : ok ? '' : 'leise'}>
              {mehrere ? `${name}: ` : ''}{t('werkbank.sicherung.extern.extern')} {s.status === 'fehlgeschlagen' ? <Symbol name="warnung" /> : s.status === 'geprueft' ? <Symbol name="haken" /> : s.status === 'offen' || s.status === 'laeuft' ? <Symbol name="stoppuhr" /> : null} {externStatus(s)}
            </span>
          </span>
        );
      })}
    </span>
  );
}

/** Abschnitt „Außer Haus“: Ziele (Pakete), letzte Kopie; ohne Paket ein Hinweis auf die Möglichkeiten. Das Handbuch nur über das Hilfesymbol (#1193). */
function AusserHaus({ x }: { x: ExternZustand | null | undefined }) {
  return (
    <section className="blatt" id="ausser-haus">
      <h2 className="h3">{t('werkbank.sicherung.extern.titel')} <Hilfe ort="sicherung.extern" /></h2>
      {!x?.ziele.length ? (
        <p className="leise">{t('werkbank.sicherung.extern.ohne')} <Link to="/werkbank/pakete" className="verweis">{t('werkbank.sicherung.extern.pakete')}</Link></p>
      ) : (
        <>
          <dl className="eigenschaften">
            {x.ziele.flatMap((z) => [<dt key={`n${z.id}`}>{z.name}</dt>, <dd key={`a${z.id}`} className="mono">{z.adresse ?? z.ziel ?? '–'}</dd>])}
            <dt>{t('werkbank.sicherung.extern.letzte')}</dt>
            <dd>{x.letzte ? <>{t('werkbank.sicherung.extern.letzte.wert', { datum: zeit(x.letzte.beginn) })} · {externText(x.letzte.stand)}</> : <span className="leise">{t('werkbank.sicherung.extern.letzte.keine')}</span>}</dd>
          </dl>
          <p className="leise klein">{t('werkbank.sicherung.extern.erklaerung')}</p>
        </>
      )}
    </section>
  );
}

/** Stand in einer Zeile (#366: früher die mittlere Spalte). */
/** Ohne Notfallblatt (#1193): Das gehört zur Verschlüsselung; fehlt es oder gilt nicht mehr, warnt `sicherungsHinweise`. */
function StandZeile({ s }: { s: SicherungStand }) {
  const z = s.zustand;
  const teile: ReactNode[] = [
    <>{tn('werkbank.sicherung.letzte-sicherung', { wert: z.letzte ? zeit(z.letzte.ende) : t('werkbank.sicherung.noch-keine'), wert2: (z.fehler || z.zuAlt) && <span className="fehlertext"> ({z.fehler ? t('werkbank.sicherung.fehlgeschlagen') : t('werkbank.sicherung.zu-alt')})</span> })}</>,
    t('werkbank.sicherung.sicherungen', { anzahl: s.liste.length, bytes: bytes(s.speicher.sicherungenBytes) }),
    s.plan.aktiv ? t('werkbank.sicherung.naechste-uhr', { wert: s.plan.haeufigkeit === 'taeglich' ? t('werkbank.sicherung.taeglich') : TAGE[s.plan.wochentag], uhrzeit: s.plan.uhrzeit }) : t('werkbank.sicherung.zeitplan-aus'),
    <>{s.speicher.frei === null ? t('werkbank.sicherung.platz-nicht-feststellbar') : t('werkbank.sicherung.frei', { bytes: bytes(s.speicher.frei) })}{s.speicher.knapp && <span className="fehlertext"> {' '}{t('werkbank.sicherung.knapp')}</span>}</>,
    ...(z.extern?.ziele.length ? [<>{z.extern.letzte ? t('werkbank.sicherung.extern.zeile', { datum: zeit(z.extern.letzte.stand.am) }) : t('werkbank.sicherung.extern.zeile.keine')}{(z.extern.fehler || z.extern.zuAlt) && <span className="fehlertext"> ({z.extern.fehler ? t('werkbank.sicherung.extern.kurz.fehler') : t('werkbank.sicherung.extern.kurz.alt')})</span>}</>] : []),
  ];
  return <p className="klein standzeile">{teile.map((x, i) => <span key={i}>{i > 0 && ' · '}{x}</span>)}</p>;
}

/** Verwaltet die Person die Verschlüsselung (oder alles)? Nur dann erfährt sie hier vom Notfallblatt (#993). */
export function useVerwaltetVerschluesselung(): boolean {
  const b = useKontoOptional()?.verwaltungsmodus.bereiche;
  return b === null || (b?.includes('verschluesselung') ?? false);
}

export function SicherungPanel({ z }: { z: SicherungZustand }) {
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const [prueft, setPrueft] = useState<string>();
  // Herunterladen (#975): Name der zuletzt geladenen Sicherung – darunter Hinweis, Größe und Prüfsumme.
  const [geladen, setGeladen] = useState<string>();
  const mitNotfallblatt = useVerwaltetVerschluesselung();
  const s = z.stand;
  if (z.fehler) return <div className="hinweis schlecht"><p>{z.fehler}</p></div>;
  if (!s) return <p className="leise">{t('werkbank.sicherung.lade')}</p>;
  const lauf = s.lauf;
  const laeuft = lauf?.status === 'laeuft';
  const hinweise = sicherungsHinweise(s.zustand, mitNotfallblatt);
  // Sicherungen mit einem früheren Schlüssel (#47).
  const alte = s.liste.filter((x) => x.meta && s.zustand.fingerabdruck && x.meta.verschluesselung.fingerabdruck !== s.zustand.fingerabdruck);
  // Spalte „Wo“ (#585), sobald es ein Ziel außer Haus gibt oder eine Sicherung schon einen Stand hat.
  const ortSpalte = !!s.zustand.extern?.ziele.length || s.liste.some((x) => x.extern);

  async function tu(f: () => Promise<unknown>, gut?: string) {
    setMeldung(undefined);
    try { await f(); await z.laden(); if (gut) setMeldung({ art: 'gut', text: gut }); } catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); }
  }
  // „Prüfen“ (#986): läuft und Fehler in der Zeile; das Ergebnis steht danach in der Spalte „Geprüft“.
  const pruefKnopf = (name: string, moeglich: boolean) => (
    <Knopf art="link" gesperrt={(laeuft && prueft !== name) || !moeglich} laeuft={laeuft && prueft === name} laeuftText={t('werkbank.sicherung.prueft')}
      onClick={async () => { setPrueft(name); await betriebApi.sicherungPruefen(name); await z.laden(); }}>{t('werkbank.sicherung.pruefen')}</Knopf>
  );

  // „Herunterladen“ (#975): heikle Handlung (frische Anmeldung), dann lädt der Browser selbst – mit Fortschritt und Abbrechen.
  const loeschFrage = (x: { name: string; meta?: { beginn: string } | null }) => ({ titel: t('werkbank.sicherung.sicherung-vom-loeschen', { wert: x.meta ? zeit(x.meta.beginn) : x.name }), text: t('werkbank.sicherung.sie-ist-danach-endgueltig'), ja: t('werkbank.sicherung.endgueltig-loeschen') });
  const ladeKnopf = (name: string) => (
    <Knopf art="link" onClick={async () => { if (await heikelLaden(betriebApi.sicherungDateiUrl(name))) setGeladen(name); }}>{t('werkbank.sicherung.herunterladen')}</Knopf>
  );
  const gewaehlt = geladen ? s.liste.find((x) => x.name === geladen) : undefined;

  return (
    <div className="einspaltig">
      <Kopf titel={t('werkbank.sicherung.sicherung')} ueber={t('werkbank.sicherung.werkbank')} hilfe="werkbank.sicherung">
        <p className="leise">{tn('werkbank.sicherung.eine-sicherung-enthaelt-die', { link: <Link to="/werkbank/verschluesselung" className="verweis">{t('werkbank.sicherung.verschluesselung')}</Link> })}</p>
      </Kopf>

      {!s.zustand.schluessel && <div className="hinweis warn"><p>{tn('werkbank.sicherung.erzeuge-ihn-zuerst-unter', { b: <strong>{t('werkbank.sicherung.ohne-schluessel-keine-sicherung')}</strong> })}</p><Link to="/werkbank/verschluesselung" className="knopf klein">{t('werkbank.sicherung.zur-verschluesselung')}</Link></div>}
      {hinweise.map((h, i) => <div key={i} className={`hinweis ${h.art === 'info' ? 'info' : h.art}`}><p>{h.text}</p>{h.ziel && <Link to={h.ziel} className="knopf klein">{h.knopf}</Link>}</div>)}

      <section className="blatt" id="jetzt">
        <h2 className="h3">{t('werkbank.sicherung.jetzt-sichern')}</h2>
        <StandZeile s={s} />
        {laeuft ? (
          <div className="stapel">
            <p><strong>{lauf!.titel}</strong> – {lauf!.schritt}</p>
            <progress max={Math.max(lauf!.gesamt, lauf!.bytes, 1)} value={lauf!.bytes} />
            <p className="leise klein">{t('werkbank.sicherung.seit-du-kannst-die', { bytes: bytes(lauf!.bytes), wert: lauf!.gesamt ? t('werkbank.sicherung.von-etwa', { bytes: bytes(lauf!.gesamt) }) : '', zeit: zeit(lauf!.gestartet) })}</p>
          </div>
        ) : (
          <>
            <p className="leise">{t('werkbank.sicherung.ablago-laeuft-dabei-weiter')}</p>
            <div className="knoepfe"><Knopf art="haupt" gesperrt={!s.zustand.schluessel} onClick={() => tu(() => betriebApi.sicherungJetzt())}>{t('werkbank.sicherung.jetzt-sichern')}</Knopf></div>
            {/* Ergebnis unter dem Knopf (#986). */}
            {lauf?.status === 'fehler' && <p className="fehlertext" role="alert">{tn('werkbank.sicherung.fehlgeschlagen-2', { titel: lauf.titel, fehler: lauf.fehler })}</p>}
            {lauf?.status === 'fertig' && lauf.art === 'sicherung' && <p className="gutertext" role="status">{t('werkbank.sicherung.fertig', { titel: lauf.titel, wert: lauf.beendet ? zeit(lauf.beendet) : '' })}</p>}
          </>
        )}
        {meldung && <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">{meldung.text}</p>}
      </section>

      <section className="blatt" id="liste">
        <h2 className="h3">{t('werkbank.sicherung.sicherungen-2')}</h2>
        {alte.length > 0 && (
          <div className="hinweis info">
            <p>{tn('werkbank.sicherung.zum-wiederherstellen-brauchst-du', { b: <strong>{t('werkbank.sicherung.sicherungen-sind-mit-einem', { anzahl: alte.length })}</strong> })}</p>
            <div className="knoepfe"><Knopf art="gefahr" symbol="geloescht" groesse="klein" gesperrt={laeuft}
              rueckfrage={{ titel: t('werkbank.sicherung.alle-sicherungen-mit-frueherem', { anzahl: alte.length }), text: t('werkbank.sicherung.sie-sind-danach-endgueltig'), ja: t('werkbank.sicherung.endgueltig-loeschen') }}
              onClick={() => { void tu(async () => { for (const x of alte) await betriebApi.sicherungLoeschen(x.name); }, t('werkbank.sicherung.sicherungen-mit-frueherem-schluessel')); }}>
              {t('werkbank.sicherung.sicherungen-mit-frueherem-schluessel-2')}</Knopf></div>
          </div>
        )}
        {!s.liste.length ? <p className="leise">{tn('werkbank.sicherung.noch-keine-sicherung-im', { span: <span className="mono">{s.zustand.ort.ordner}</span> })}</p> : (
          <div className="trefferliste"><table>
            <thead><tr><th>{t('werkbank.sicherung.zeitpunkt')}</th><th>{t('werkbank.sicherung.art')}</th><th className="rechts">{t('werkbank.sicherung.groesse')}</th><th>{t('werkbank.sicherung.inhalt')}</th>{ortSpalte && <th>{t('werkbank.sicherung.extern.spalte')}</th>}<th>{t('werkbank.sicherung.pruefsumme')}</th><th>{t('werkbank.sicherung.probe')}</th><th><span className="sr">{t('werkbank.sicherung.aktionen')}</span></th></tr></thead>
            <tbody>{s.liste.map((x) => (
              <tr key={x.name} className={geladen === x.name ? 'an' : undefined}>
                <td className="kurz" title={x.name}>{x.meta ? zeit(x.meta.beginn) : x.schlank ? zeit(x.schlank.beginn) : x.name}</td>
                <td>{x.meta ? ART[x.meta.art] ?? x.meta.art : x.schlank ? <span className="leise">{t('werkbank.sicherung.extern.zurueck')}</span> : <span className="fehlertext">{t('werkbank.sicherung.metadaten-fehlen')}</span>}
                  {x.meta && s.zustand.fingerabdruck && x.meta.verschluesselung.fingerabdruck !== s.zustand.fingerabdruck && <> <span className="chip warn" title={t('werkbank.sicherung.schluessel-braucht-das-notfallblatt', { fingerabdruck: x.meta.verschluesselung.fingerabdruck })}>{t('werkbank.sicherung.frueherer-schluessel')}</span></>}</td>
                <td className="rechts kurz">{bytes(x.bytes)}</td>
                <td>{x.meta ? t('werkbank.sicherung.mappen-dateien', { mappen: x.meta.anzahl.mappen.toLocaleString(gebietsschema()), dateien: x.meta.anzahl.dateien.toLocaleString(gebietsschema()) }) : '–'}{x.meta && <span className="leise klein"> {' '}{t('werkbank.sicherung.ablago', { dms: x.meta.umgebung.dms })}</span>}</td>
                {ortSpalte && <td><OrtZelle e={x} extern={s.zustand.extern} /></td>}
                <td>{x.pruefung ? <span className={`chip ${x.pruefung.ok ? 'gut' : 'schlecht'}`} title={t('werkbank.sicherung.geprueft', { zeit: zeit(x.pruefung.am) })}>{x.pruefung.ok ? t('werkbank.sicherung.unveraendert') : t('werkbank.sicherung.weicht-ab')}</span> : <span className="leise">–</span>}</td>
                <td>{x.probe ? <span className={`chip ${x.probe.ok ? 'gut' : 'schlecht'}`} title={`${zeit(x.probe.am)}: ${x.probe.info}`}>{x.probe.ok ? t('werkbank.sicherung.in-ordnung') : t('werkbank.sicherung.fehler')}</span> : <span className="leise">–</span>}</td>
                <td className="kurz">
                  {ladeKnopf(x.name)}{' · '}
                  {pruefKnopf(x.name, !!(x.meta || x.schlank))}{' · '}
                  <Knopf art="gefahr" symbol="geloescht" groesse="klein" gesperrt={laeuft} rueckfrage={loeschFrage(x)} onClick={() => { void tu(() => betriebApi.sicherungLoeschen(x.name), t('werkbank.sicherung.sicherung-geloescht')); }}>{t('werkbank.sicherung.loeschen')}</Knopf>
                </td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        {gewaehlt && <Heruntergeladen e={gewaehlt} schliessen={() => setGeladen(undefined)} />}
        <p className="leise klein">{t('werkbank.sicherung.pruefen-rechnet-die-pruefsumme')}</p>
      </section>

      {s.zustand.probe && <Probe stand={s.zustand.probe} lauf={s.probe ?? null} sicherungen={s.liste.some((x) => x.meta)} gesperrt={laeuft} neuLaden={() => void z.laden()} />}

      <Zeitplan key={JSON.stringify(s.plan)} plan={s.plan} notfallblatt={s.zustand.notfallblatt.aktuell} mitNotfallblatt={mitNotfallblatt} gespeichert={() => void z.laden()} />

      <section className="blatt" id="speicher">
        <h2 className="h3">{t('werkbank.sicherung.speicherplatz')} <Hilfe ort="sicherung.speicher" /></h2>
        <dl className="eigenschaften">
          <dt>{t('werkbank.sicherung.dokumente-und-dateien-heute')}</dt><dd>{t('werkbank.sicherung.dateien', { bytes: bytes(s.speicher.dateienBytes), dateien: s.speicher.dateien.toLocaleString(gebietsschema()) })}</dd>
          <dt>{t('werkbank.sicherung.datenbank-heute')}</dt><dd>{bytes(s.speicher.datenbankBytes)}</dd>
          <dt>{t('werkbank.sicherung.hochrechnung')}</dt><dd>{tn('werkbank.sicherung.bis-zu-sicherungen', { stueck: s.speicher.hochrechnung.stueck, bytes: bytes(s.speicher.hochrechnung.bytes), span: <span className="leise klein">{t('werkbank.sicherung.jede-ist-vollstaendig-die')}</span> })}</dd>
          <dt>{t('werkbank.sicherung.belegt-durch-sicherungen')}</dt><dd>{t('werkbank.sicherung.in-sicherungen', { anzahl: s.speicher.anzahl, bytes: bytes(s.speicher.sicherungenBytes) })}</dd>
          <dt>{t('werkbank.sicherung.frei-im-sicherungsordner')}</dt><dd>{s.speicher.frei === null ? t('werkbank.sicherung.nicht-feststellbar') : `${bytes(s.speicher.frei)}${s.speicher.gesamt ? t('werkbank.sicherung.von', { bytes: bytes(s.speicher.gesamt) }) : ''}`}</dd>
        </dl>
        {s.speicher.knapp && <div className="hinweis warn"><p>{tn('werkbank.sicherung.weniger-frei-als-verringere', { b: <strong>{t('werkbank.sicherung.der-platz-wird-knapp')}</strong>, wert: s.speicher.frei !== null && s.speicher.frei < s.speicher.mindestBytes ? t('werkbank.sicherung.der-eingestellte-mindest') : t('werkbank.sicherung.zwei-weitere-sicherungen-brauchen') })}</p></div>}
      </section>

      <section className="blatt" id="ort">
        <h2 className="h3">{t('werkbank.sicherung.speicherort')} <Hilfe ort="sicherung.ort" /></h2>
        <dl className="eigenschaften">
          <dt>{t('werkbank.sicherung.ordner')}</dt><dd className="mono">{s.zustand.ort.ordner}</dd>
          <dt>{t('werkbank.sicherung.eigenes-volume')}</dt><dd>{s.zustand.ort.volume === null ? t('werkbank.sicherung.nicht-feststellbar') : s.zustand.ort.volume ? t('werkbank.sicherung.ja') : t('werkbank.sicherung.nein')}</dd>
          <dt>{t('werkbank.sicherung.andere-platte-als-die')}</dt><dd>{s.zustand.ort.gleichePlatte === null ? t('werkbank.sicherung.nicht-feststellbar') : s.zustand.ort.gleichePlatte ? t('werkbank.sicherung.nein-dieselbe-platte') : t('werkbank.sicherung.ja')}</dd>
        </dl>
        <p className="leise klein">{t('werkbank.sicherung.faustregel-3-2-1')}</p>
      </section>

      <AusserHaus x={s.zustand.extern} />
    </div>
  );
}

/**
 * Nach „Herunterladen“ (#975): der Hinweis auf das Notfallblatt, Größe und Prüfsumme zum späteren Prüfen der Kopie und
 * die Metadaten (.json), ohne die sich die Sicherung auf einem neuen Gerät nicht einspielen lässt.
 */
function Heruntergeladen({ e, schliessen }: { e: SicherungEintrag; schliessen(): void }) {
  const handbuch = useHandbuch();
  const sha = e.meta?.sha256 ?? e.schlank?.sha256 ?? null;
  const beginn = e.meta?.beginn ?? e.schlank?.beginn;
  return (
    <div className="hinweis info" role="status">
      <p><strong>{t('werkbank.sicherung.laden.notfallblatt')}</strong> {t('werkbank.sicherung.laden.text', { zeit: beginn ? zeit(beginn) : e.name })}</p>
      <dl className="eigenschaften">
        <dt>{t('werkbank.sicherung.laden.datei')}</dt><dd className="mono">{`${e.name}.dms-sicherung`}</dd>
        <dt>{t('werkbank.sicherung.groesse')}</dt><dd>{t('werkbank.sicherung.laden.bytes', { bytes: bytes(e.bytes), genau: e.bytes.toLocaleString(gebietsschema()) })}</dd>
        <dt>{t('werkbank.sicherung.laden.sha256')}</dt><dd className="mono umbruch">{sha ?? t('werkbank.sicherung.metadaten-fehlen')}</dd>
      </dl>
      {(e.meta || e.schlank) && <p>{tn('werkbank.sicherung.laden.metadaten', { link: <a href={betriebApi.sicherungMetadatenUrl(e.name)} download className="verweis">{t('werkbank.sicherung.laden.metadaten-link')}</a> })}</p>}
      <div className="knoepfe">
        <a href={`${handbuch('admin', 'sicherung/')}#kopie-prufen`} target="_blank" rel="noreferrer" className="verweis">{t('werkbank.sicherung.laden.handbuch')}</a>
        <Knopf groesse="klein" onClick={schliessen}>{t('werkbank.sicherung.laden.schliessen')}</Knopf>
      </div>
    </div>
  );
}

function Zeitplan({ plan, notfallblatt, mitNotfallblatt, gespeichert }: { plan: SicherungsPlan; notfallblatt: boolean; mitNotfallblatt: boolean; gespeichert(): void }) {
  const [p, setP] = useState(plan);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const [sendet, setSendet] = useState(false);
  const ent = useEntwurf(plan, p, { zuruecksetzen: () => { setP(plan); setMeldung(undefined); } });
  const a = p.aufbewahrung;
  const setA = (k: keyof typeof a, v: string) => setP({ ...p, aufbewahrung: { ...a, [k]: Math.max(0, Math.trunc(Number(v) || 0)) } });
  async function speichern() {
    setMeldung(undefined); setSendet(true);
    try { await betriebApi.sicherungPlan(p); setMeldung({ art: 'gut', text: t('werkbank.sicherung.gespeichert') }); gespeichert(); }
    catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); } finally { setSendet(false); }
  }
  return (
    <form className="blatt" id="zeitplan" onSubmit={(x) => { x.preventDefault(); void speichern(); }} onKeyDown={ent.tasten}>
      <h2 className="h3">{t('werkbank.sicherung.zeitplan-und-aufbewahrung')} <Hilfe ort="sicherung.zeitplan" /></h2>
      <Schalter an={p.aktiv} gesperrt={!p.aktiv && !notfallblatt} setze={(an) => setP({ ...p, aktiv: an })} beschriftung={t('werkbank.sicherung.schalter')} />
      {/* #993 (Thomas 10.11.2026): ohne das Wort „Notfallblatt“; der Link nur für die, die die Verschlüsselung verwalten. */}
      {!notfallblatt && !p.aktiv && <p className="leise klein">{t('werkbank.sicherung.erst-wenn-verschluesselung-fertig')}{' '}
        {mitNotfallblatt ? <Link to={NOTFALLBLATT_SEITE} className="knopf klein">{t('werkbank.sicherung.zur-verschluesselung')}</Link> : t('werkbank.sicherung.keine-berechtigung-verschluesselung')}</p>}
      <div className="raster">
        <Feld beschriftung={t('werkbank.sicherung.haeufigkeit')}>
          <select value={p.haeufigkeit} onChange={(e) => setP({ ...p, haeufigkeit: e.target.value as SicherungsPlan['haeufigkeit'] })}><option value="taeglich">{t('werkbank.sicherung.taeglich')}</option><option value="woechentlich">{t('werkbank.sicherung.woechentlich')}</option></select>
        </Feld>
        {p.haeufigkeit === 'woechentlich' && (
          <Feld beschriftung={t('werkbank.sicherung.wochentag')}>
            <select value={p.wochentag} onChange={(e) => setP({ ...p, wochentag: Number(e.target.value) })}>{TAGE.slice(1).map((text, i) => <option key={text} value={i + 1}>{text}</option>)}</select>
          </Feld>
        )}
        <Feld beschriftung={t('werkbank.sicherung.uhrzeit')}>
          <input type="time" value={p.uhrzeit} onChange={(e) => setP({ ...p, uhrzeit: e.target.value })} />
        </Feld>
      </div>
      <p className="leise klein">{t('werkbank.sicherung.aufbewahrt-werden-die-neuesten')}</p>
      <HakenFeld beschriftung={t('werkbank.sicherung.extern.nurneueste')} hinweis={t('werkbank.sicherung.extern.nurneueste.hilfe')}>
        <input type="checkbox" checked={!!p.nurNeueste} onChange={(e) => setP({ ...p, nurNeueste: e.target.checked })} />
      </HakenFeld>
      <div className="raster">
        {p.haeufigkeit === 'taeglich' && <Feld beschriftung={t('werkbank.sicherung.taegliche')}>
          <input type="number" min={0} max={366} value={a.taeglich} disabled={!!p.nurNeueste} onChange={(e) => setA('taeglich', e.target.value)} />
        </Feld>}
        <Feld beschriftung={t('werkbank.sicherung.woechentliche')}>
          <input type="number" min={0} max={260} value={a.woechentlich} disabled={!!p.nurNeueste} onChange={(e) => setA('woechentlich', e.target.value)} />
        </Feld>
        <Feld beschriftung={t('werkbank.sicherung.monatliche')}>
          <input type="number" min={0} max={240} value={a.monatlich} disabled={!!p.nurNeueste} onChange={(e) => setA('monatlich', e.target.value)} />
        </Feld>
        <Feld beschriftung={t('werkbank.sicherung.mindest-speicherplatz-in-gb')} hinweis={t('werkbank.sicherung.darunter-beginnt-keine-sicherung')}>
          <input type="number" min={0} value={p.mindestFreiGB} onChange={(e) => setP({ ...p, mindestFreiGB: Math.max(0, Math.trunc(Number(e.target.value) || 0)) })} />
        </Feld>
      </div>
      {meldung && <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">{meldung.text}</p>}
      <Speicherleiste ent={ent} gegenstand={t('werkbank.sicherung.zeitplan')} sendet={sendet} />
    </form>
  );
}

/** Warum ein heruntergeladenes Notfallblatt nicht mehr gilt (#47 Schlüssel, #815 Notfallcode). */
export function NotfallblattGrund({ n }: { n: Notfallblattstand }) {
  if (n.grund === 'benutzt') return <><strong>{t('werkbank.sicherung.notfallblatt.benutzt')}</strong> {t('werkbank.sicherung.notfallblatt.benutzt.text')}</>;
  if (n.grund === 'ohne-code') return <><strong>{t('werkbank.sicherung.notfallblatt.ohne-code')}</strong> {t('werkbank.sicherung.notfallblatt.ohne-code.text')}</>;
  return <>{tn('werkbank.sicherung.lade-ein-neues-notfallblatt', { b: <strong>{t('werkbank.sicherung.der-schluessel-hat-sich')}</strong> })}</>;
}

/** Häkchen vor einem erledigten Schritt (#414). */
export function Erledigt() {
  return <span className="nfb-haken" role="img" aria-label={t('werkbank.sicherung.erledigt')} title={t('werkbank.sicherung.erledigt')}><Symbol name="haken" /> </span>;
}

const AMPEL = { gruen: ['gut', t('werkbank.sicherung.in-ordnung')], gelb: ['warn', t('werkbank.sicherung.zu-alt-oder-noch')], rot: ['schlecht', 'fehlgeschlagen'] } as const;

/** Probe-Wiederherstellung (#109): Ampel, letzte Probe, Zeitplan, jetzt prüfen. */
function Probe({ stand, lauf, sicherungen, gesperrt, neuLaden }: { stand: ProbeStand; lauf: WhLauf | null; sicherungen: boolean; gesperrt: boolean; neuLaden(): void }) {
  const [plan, setPlan] = useState(stand.plan);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const [sendet, setSendet] = useState(false);
  const ent = useEntwurf(stand.plan, plan, { zuruecksetzen: () => { setPlan(stand.plan); setMeldung(undefined); } });
  const laeuft = lauf?.art === 'probe' && lauf.status === 'laeuft';
  async function tu(f: () => Promise<unknown>, gut?: string) {
    setMeldung(undefined);
    try { await f(); neuLaden(); if (gut) setMeldung({ art: 'gut', text: gut }); } catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); }
  }
  return (
    <form className="blatt" id="probe" onKeyDown={ent.tasten}
      onSubmit={(x) => { x.preventDefault(); setSendet(true); void tu(() => betriebApi.probePlan(plan), t('werkbank.sicherung.gespeichert')).finally(() => setSendet(false)); }}>
      <h2 className="h3">{t('werkbank.sicherung.probe-wiederherstellung')} <Hilfe ort="sicherung.probe" /></h2>
      <p>{t('werkbank.sicherung.spielt-die-neueste-sicherung')}</p>
      <dl className="eigenschaften">
        <dt>{t('werkbank.sicherung.ampel')}</dt><dd>{stand.ampel ? <span className={`chip ${AMPEL[stand.ampel][0]}`}>{AMPEL[stand.ampel][1]}</span> : <span className="leise">{t('werkbank.sicherung.noch-keine-sicherung')}</span>}</dd>
        {stand.letzte && <><dt>{t('werkbank.sicherung.letzte-probe')}</dt><dd>{zeit(stand.letzte.am)} · {stand.letzte.name}{!stand.letzte.ok && <div className="fehlertext klein">{stand.letzte.info}</div>}</dd></>}
      </dl>
      {lauf?.art === 'probe' && (laeuft || lauf.status === 'fehler') && <Schritte schritte={lauf.schritte} />}
      <div className="raster">
        <Schalter an={plan.aktiv} setze={(an) => setPlan({ ...plan, aktiv: an })} beschriftung={t('werkbank.sicherung.woechentlich-automatisch')} />
        <Feld beschriftung={t('werkbank.sicherung.wochentag')}>
          <select value={plan.wochentag} onChange={(e) => setPlan({ ...plan, wochentag: Number(e.target.value) })}>{TAGE.slice(1).map((text, i) => <option key={text} value={i + 1}>{text}</option>)}</select>
        </Feld>
        <Feld beschriftung={t('werkbank.sicherung.uhrzeit')}>
          <input type="time" value={plan.uhrzeit} onChange={(e) => setPlan({ ...plan, uhrzeit: e.target.value })} />
        </Feld>
      </div>
      <div className="knoepfe">
        <Knopf gesperrt={!sicherungen || gesperrt} laeuft={laeuft} laeuftText={t('werkbank.sicherung.probe-laeuft')} onClick={() => tu(() => betriebApi.probeStarten())}>{t('werkbank.sicherung.jetzt-probeweise-wiederherstellen')}</Knopf>
      </div>
      {/* Ergebnis unter dem Knopf (#986): darüber verschiebt sich nichts. */}
      {meldung && <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">{meldung.text}</p>}
      <Speicherleiste ent={ent} gegenstand={t('werkbank.sicherung.probe-zeitplan')} sendet={sendet} />
    </form>
  );
}
