import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api, type ProbeStand, type SicherungsPlan, type SicherungStand, type SicherungsZustand, type WhLauf } from '../api';
import { Schritte } from '../wiederherstellen';
import { Hilfe, useHandbuch } from '../Hilfe';
import { Link } from '../ort';
import { rueckfrage } from '../rueckfrage';
import { Speicherleiste, useEntwurf } from '../Speicherleiste';

/**
 * Werkbank → Sicherung (#103–#106): jetzt sichern, Liste mit Prüfsumme, Zeitplan und
 * Aufbewahrung, Speicherplatz, Speicherort und Notfallblatt.
 */

export const NOTFALLBLATT_URL = '/api/werkbank/notfallblatt';
const GEAENDERT = 'dms:sicherung';
export const meldeSicherung = () => dispatchEvent(new Event(GEAENDERT));

export const bytes = (b: number) => (b < 1024 ** 2 ? `${Math.max(1, Math.round(b / 1024))} KB` : b < 1024 ** 3 ? `${(b / 1024 ** 2).toFixed(0)} MB` : `${(b / 1024 ** 3).toFixed(1).replace('.', ',')} GB`);
const zeit = (iso: string) => new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
const ART = { manuell: 'von Hand', automatisch: 'automatisch', 'vor-wiederherstellung': 'vor einer Wiederherstellung' } as Record<string, string>;
const TAGE = ['', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

export function useSicherung(offen: boolean) {
  const [stand, setStand] = useState<SicherungStand | null>(null);
  const [fehler, setFehler] = useState<string>();
  const laden = useCallback(async () => {
    try { setStand(await api.sicherung()); setFehler(undefined); } catch (e) { setFehler((e as Error).message); }
  }, []);
  useEffect(() => {
    if (!offen) return;
    void laden();
    addEventListener(GEAENDERT, laden);
    return () => removeEventListener(GEAENDERT, laden);
  }, [offen, laden]);
  // Während ein Lauf läuft: jede Sekunde den Fortschritt, am Ende alles neu.
  const laeuft = stand?.lauf?.status === 'laeuft';
  useEffect(() => {
    if (!laeuft) return;
    const t = setInterval(() => {
      void api.sicherungLauf().then((lauf) => {
        setStand((s) => (s ? { ...s, lauf } : s));
        if (lauf?.status !== 'laeuft') void laden();
      }, () => {});
    }, 1000);
    return () => clearInterval(t);
  }, [laeuft, laden]);
  // Probe-Wiederherstellung (#109): Schritte live.
  const probeLaeuft = stand?.probe?.art === 'probe' && stand.probe.status === 'laeuft';
  useEffect(() => {
    if (!probeLaeuft) return;
    const t = setInterval(() => {
      void api.probeLauf().then((probe) => {
        setStand((s) => (s ? { ...s, probe } : s));
        if (probe?.status !== 'laeuft') void laden();
      }, () => {});
    }, 1000);
    return () => clearInterval(t);
  }, [probeLaeuft, laden]);
  return { stand, setStand, fehler, laden };
}
export type SicherungZustand = ReturnType<typeof useSicherung>;

/** Hinweise zur Sicherung – auch für die Übersicht der Werkbank (#105). */
export function sicherungsHinweise(z: SicherungsZustand): Array<{ art: 'schlecht' | 'warn' | 'info'; text: ReactNode }> {
  const h: Array<{ art: 'schlecht' | 'warn' | 'info'; text: ReactNode }> = [];
  if (!z.schluessel) return h; // Ohne Schlüssel weist schon die Verschlüsselung darauf hin.
  if (z.fehler) h.push({ art: 'schlecht', text: <><strong>Die letzte Sicherung ist fehlgeschlagen</strong> ({zeit(z.fehler.am)}): {z.fehler.grund}</> });
  if (!z.letzte) h.push({ art: 'warn', text: <><strong>Es gibt noch keine Sicherung.</strong> Lege eine an und schalte den Zeitplan ein.</> });
  else if (z.zuAlt) h.push({ art: 'warn', text: <><strong>Die letzte Sicherung ist älter als 2 Tage</strong> ({zeit(z.letzte.ende)}).</> });
  if (!z.notfallblatt.aktuell && (z.letzte || z.planAktiv || z.notfallblatt.am)) h.push({ art: 'warn', text: <><strong>{z.notfallblatt.am ? 'Das Notfallblatt gehört zu einem früheren Schlüssel.' : 'Das Notfallblatt fehlt.'}</strong> Ohne den Schlüssel darauf lassen sich die Sicherungen nicht wiederherstellen.</> });
  // Probe-Wiederherstellung (#109): Ampel.
  if (z.probe?.ampel === 'rot') h.push({ art: 'schlecht', text: <><strong>Die letzte Probe-Wiederherstellung ist fehlgeschlagen</strong> ({zeit(z.probe.letzte!.am)}): {z.probe.letzte!.info}</> });
  else if (z.probe?.ampel === 'gelb' && z.letzte) h.push({ art: 'info', text: <><strong>{z.probe.letzte ? `Die letzte Probe-Wiederherstellung ist vom ${zeit(z.probe.letzte.am)}.` : 'Noch keine Sicherung wurde probeweise wiederhergestellt.'}</strong> Erst eine Probe zeigt, dass sich eine Sicherung im Ernstfall einspielen lässt.</> });
  if (z.ort.volume === false) h.push({ art: 'warn', text: <><strong>Der Sicherungsordner ist kein eigenes Volume.</strong> Die Sicherungen liegen im Container und sind beim nächsten Update weg.</> });
  else if (z.ort.gleichePlatte) h.push({ art: 'info', text: <><strong>Die Sicherungen liegen auf derselben Platte wie die Dokumente.</strong> Fällt sie aus, sind beide weg – kopiere den Sicherungsordner auf eine andere Platte oder außer Haus.</> });
  return h;
}

/** Stand in einer Zeile (#366: früher die mittlere Spalte). */
function StandZeile({ s }: { s: SicherungStand }) {
  const z = s.zustand;
  const teile: ReactNode[] = [
    <>Letzte Sicherung {z.letzte ? zeit(z.letzte.ende) : 'noch keine'}{(z.fehler || z.zuAlt) && <span className="fehlertext"> ({z.fehler ? 'fehlgeschlagen' : 'zu alt'})</span>}</>,
    `${s.liste.length} ${s.liste.length === 1 ? 'Sicherung' : 'Sicherungen'} · ${bytes(s.speicher.sicherungenBytes)}`,
    s.plan.aktiv ? `nächste ${s.plan.haeufigkeit === 'taeglich' ? 'täglich' : TAGE[s.plan.wochentag]} ${s.plan.uhrzeit} Uhr` : 'Zeitplan aus',
    <>{s.speicher.frei === null ? 'Platz nicht feststellbar' : `${bytes(s.speicher.frei)} frei`}{s.speicher.knapp && <span className="fehlertext"> (knapp)</span>}</>,
    z.notfallblatt.aktuell && z.notfallblatt.am ? `Notfallblatt heruntergeladen ${zeit(z.notfallblatt.am)}` : <span className="fehlertext">Notfallblatt fehlt</span>,
  ];
  return <p className="klein standzeile">{teile.map((x, i) => <span key={i}>{i > 0 && ' · '}{x}</span>)}</p>;
}

export function SicherungPanel({ z }: { z: SicherungZustand }) {
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const handbuch = useHandbuch();
  const s = z.stand;
  if (z.fehler) return <div className="hinweis schlecht"><p>{z.fehler}</p></div>;
  if (!s) return <p className="leise">Lade …</p>;
  const lauf = s.lauf;
  const laeuft = lauf?.status === 'laeuft';
  const hinweise = sicherungsHinweise(s.zustand);
  // Sicherungen mit einem früheren Schlüssel (#47).
  const alte = s.liste.filter((x) => x.meta && s.zustand.fingerabdruck && x.meta.verschluesselung.fingerabdruck !== s.zustand.fingerabdruck);

  async function tu(f: () => Promise<unknown>, gut?: string) {
    setMeldung(undefined);
    try { await f(); await z.laden(); if (gut) setMeldung({ art: 'gut', text: gut }); } catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); }
  }

  return (
    <div className="einspaltig">
      <div className="mappenkopf">
        <p className="ueber">Werkbank</p>
        <h1>Sicherung</h1>
        <p className="leise">Eine Sicherung enthält die ganze Datenbank und alle Dateien zum selben Zeitpunkt – verschlüsselt mit dem Schlüssel aus <Link to="/werkbank/verschluesselung" className="verweis">Verschlüsselung</Link>. Daneben liegt eine lesbare Datei (.json) mit Version, Umfang und Prüfsumme. Mehr im <a href={handbuch('admin', 'sicherung/')} target="_blank" rel="noreferrer" className="verweis">Administratorhandbuch ↗</a>. <Hilfe ort="werkbank.sicherung" /></p>
      </div>

      {!s.zustand.schluessel && <div className="hinweis warn"><p><strong>Ohne Schlüssel keine Sicherung.</strong> Erzeuge ihn zuerst unter Verschlüsselung.</p><Link to="/werkbank/verschluesselung" className="knopf klein">Zur Verschlüsselung</Link></div>}
      {hinweise.map((h, i) => <div key={i} className={`hinweis ${h.art === 'info' ? 'info' : h.art}`}><p>{h.text}</p></div>)}

      <section className="blatt" id="jetzt">
        <h2 className="h3">Jetzt sichern</h2>
        <StandZeile s={s} />
        {laeuft ? (
          <div className="stapel">
            <p><strong>{lauf!.titel}</strong> – {lauf!.schritt}</p>
            <progress max={Math.max(lauf!.gesamt, lauf!.bytes, 1)} value={lauf!.bytes} />
            <p className="leise klein">{bytes(lauf!.bytes)}{lauf!.gesamt ? ` von etwa ${bytes(lauf!.gesamt)}` : ''} · seit {zeit(lauf!.gestartet)}. Du kannst die Seite verlassen; das DMS bleibt nutzbar.</p>
          </div>
        ) : (
          <>
            {lauf?.status === 'fehler' && <p className="fehlertext" role="alert">{lauf.titel} fehlgeschlagen: {lauf.fehler}</p>}
            {lauf?.status === 'fertig' && lauf.art === 'sicherung' && <p className="gutertext" role="status">{lauf.titel} fertig ({lauf.beendet ? zeit(lauf.beendet) : ''}).</p>}
            <p className="leise">Das DMS läuft dabei weiter. Zum Sichern muss niemand abgemeldet werden.</p>
            <div className="knoepfe"><button className="knopf primaer" disabled={!s.zustand.schluessel} onClick={() => void tu(() => api.sicherungJetzt())}>Jetzt sichern</button></div>
          </>
        )}
        {meldung && <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">{meldung.text}</p>}
      </section>

      <section className="blatt" id="liste">
        <h2 className="h3">Sicherungen</h2>
        {alte.length > 0 && (
          <div className="hinweis info">
            <p><strong>{alte.length === 1 ? 'Eine Sicherung ist' : `${alte.length} Sicherungen sind`} mit einem früheren Schlüssel verschlüsselt.</strong> Zum Wiederherstellen brauchst du das Notfallblatt zu diesem Schlüssel – bewahre es auf, solange es solche Sicherungen gibt.</p>
            <div className="knoepfe"><button type="button" className="knopf klein gefahr-rand" disabled={laeuft}
              onClick={async () => { if (await rueckfrage({ titel: `${alte.length === 1 ? 'Die Sicherung' : `Alle ${alte.length} Sicherungen`} mit früherem Schlüssel löschen?`, text: 'Sie sind danach endgültig weg; das alte Notfallblatt brauchst du dann nicht mehr.', ja: 'Endgültig löschen', gefahr: true })) void tu(async () => { for (const x of alte) await api.sicherungLoeschen(x.name); }, 'Sicherungen mit früherem Schlüssel gelöscht.'); }}>
              Sicherungen mit früherem Schlüssel löschen</button></div>
          </div>
        )}
        {!s.liste.length ? <p className="leise">Noch keine Sicherung im Ordner <span className="mono">{s.zustand.ort.ordner}</span>.</p> : (
          <div className="trefferliste"><table>
            <thead><tr><th>Zeitpunkt</th><th>Art</th><th className="rechts">Größe</th><th>Inhalt</th><th>Prüfsumme</th><th>Probe</th><th><span className="sr">Aktionen</span></th></tr></thead>
            <tbody>{s.liste.map((x) => (
              <tr key={x.name}>
                <td className="kurz" title={x.name}>{x.meta ? zeit(x.meta.beginn) : x.name}</td>
                <td>{x.meta ? ART[x.meta.art] ?? x.meta.art : <span className="fehlertext">Metadaten fehlen</span>}
                  {x.meta && s.zustand.fingerabdruck && x.meta.verschluesselung.fingerabdruck !== s.zustand.fingerabdruck && <> <span className="chip warn" title={`Schlüssel ${x.meta.verschluesselung.fingerabdruck} – braucht das Notfallblatt zu diesem Schlüssel`}>früherer Schlüssel</span></>}</td>
                <td className="rechts kurz">{bytes(x.bytes)}</td>
                <td>{x.meta ? `${x.meta.anzahl.mappen.toLocaleString('de-DE')} Mappen, ${x.meta.anzahl.dateien.toLocaleString('de-DE')} Dateien` : '–'}{x.meta && <span className="leise klein"> · DMS {x.meta.umgebung.dms}</span>}</td>
                <td>{x.pruefung ? <span className={`chip ${x.pruefung.ok ? 'gut' : 'schlecht'}`} title={`geprüft ${zeit(x.pruefung.am)}`}>{x.pruefung.ok ? 'unverändert' : 'weicht ab'}</span> : <span className="leise">–</span>}</td>
                <td>{x.probe ? <span className={`chip ${x.probe.ok ? 'gut' : 'schlecht'}`} title={`${zeit(x.probe.am)}: ${x.probe.info}`}>{x.probe.ok ? 'in Ordnung' : 'Fehler'}</span> : <span className="leise">–</span>}</td>
                <td className="kurz">
                  <button type="button" className="textknopf" disabled={laeuft || !x.meta} onClick={() => void tu(() => api.sicherungPruefen(x.name))}>Prüfen</button>{' · '}
                  <button type="button" className="textknopf" disabled={laeuft} onClick={async () => { if (await rueckfrage({ titel: `Sicherung vom ${x.meta ? zeit(x.meta.beginn) : x.name} löschen?`, text: 'Sie ist danach endgültig weg.', ja: 'Endgültig löschen', gefahr: true })) void tu(() => api.sicherungLoeschen(x.name), 'Sicherung gelöscht.'); }}>Löschen</button>
                </td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        <p className="leise klein">„Prüfen“ rechnet die Prüfsumme der Datei nach und vergleicht sie mit der in den Metadaten: So siehst du, ob die Datei seit dem Anlegen unverändert ist.</p>
      </section>

      {s.zustand.probe && <Probe stand={s.zustand.probe} lauf={s.probe ?? null} sicherungen={s.liste.some((x) => x.meta)} gesperrt={laeuft} neuLaden={() => void z.laden()} />}

      <Zeitplan key={JSON.stringify(s.plan)} plan={s.plan} notfallblatt={s.zustand.notfallblatt.aktuell} gespeichert={() => void z.laden()} />

      <section className="blatt" id="speicher">
        <h2 className="h3">Speicherplatz <Hilfe ort="sicherung.speicher" /></h2>
        <dl className="eigenschaften">
          <dt>Dokumente und Dateien heute</dt><dd>{bytes(s.speicher.dateienBytes)} ({s.speicher.dateien.toLocaleString('de-DE')} Dateien)</dd>
          <dt>Datenbank heute</dt><dd>{bytes(s.speicher.datenbankBytes)}</dd>
          <dt>Hochrechnung</dt><dd>bis zu {s.speicher.hochrechnung.stueck} Sicherungen ≈ {bytes(s.speicher.hochrechnung.bytes)} <span className="leise klein">(jede ist vollständig; die Datenbank wird gepackt, Dokumente kaum)</span></dd>
          <dt>Belegt durch Sicherungen</dt><dd>{bytes(s.speicher.sicherungenBytes)} in {s.speicher.anzahl} {s.speicher.anzahl === 1 ? 'Sicherung' : 'Sicherungen'}</dd>
          <dt>Frei im Sicherungsordner</dt><dd>{s.speicher.frei === null ? 'nicht feststellbar' : `${bytes(s.speicher.frei)}${s.speicher.gesamt ? ` von ${bytes(s.speicher.gesamt)}` : ''}`}</dd>
        </dl>
        {s.speicher.knapp && <div className="hinweis warn"><p><strong>Der Platz wird knapp.</strong> Weniger frei als {s.speicher.frei !== null && s.speicher.frei < s.speicher.mindestBytes ? 'der eingestellte Mindest-Speicherplatz' : 'zwei weitere Sicherungen brauchen'}. Verringere die Aufbewahrung oder schaffe Platz.</p></div>}
      </section>

      <section className="blatt" id="ort">
        <h2 className="h3">Speicherort <Hilfe ort="sicherung.ort" /></h2>
        <dl className="eigenschaften">
          <dt>Ordner</dt><dd className="mono">{s.zustand.ort.ordner}</dd>
          <dt>Eigenes Volume</dt><dd>{s.zustand.ort.volume === null ? 'nicht feststellbar' : s.zustand.ort.volume ? 'ja' : 'nein'}</dd>
          <dt>Andere Platte als die Dokumente</dt><dd>{s.zustand.ort.gleichePlatte === null ? 'nicht feststellbar' : s.zustand.ort.gleichePlatte ? 'nein – dieselbe Platte' : 'ja'}</dd>
        </dl>
        <p className="leise klein">Faustregel 3-2-1: drei Kopien, auf zwei verschiedenen Medien, eine davon außer Haus. Lass das NAS den Sicherungsordner weiterkopieren, z. B. auf eine USB-Platte oder in die Cloud – siehe <a href={`${handbuch('admin', 'sicherung/')}#speicherort`} target="_blank" rel="noreferrer" className="verweis">Handbuch ↗</a>.</p>
      </section>

      <Notfallblatt stand={s.zustand.notfallblatt} schluessel={s.zustand.schluessel} geladen={() => void z.laden()} />
    </div>
  );
}

function Zeitplan({ plan, notfallblatt, gespeichert }: { plan: SicherungsPlan; notfallblatt: boolean; gespeichert(): void }) {
  const [p, setP] = useState(plan);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const [sendet, setSendet] = useState(false);
  const ent = useEntwurf(plan, p, { zuruecksetzen: () => { setP(plan); setMeldung(undefined); } });
  const a = p.aufbewahrung;
  const setA = (k: keyof typeof a, v: string) => setP({ ...p, aufbewahrung: { ...a, [k]: Math.max(0, Math.trunc(Number(v) || 0)) } });
  async function speichern() {
    setMeldung(undefined); setSendet(true);
    try { await api.sicherungPlan(p); setMeldung({ art: 'gut', text: 'Gespeichert.' }); gespeichert(); }
    catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); } finally { setSendet(false); }
  }
  return (
    <form className="blatt" id="zeitplan" onSubmit={(x) => { x.preventDefault(); void speichern(); }} onKeyDown={ent.tasten}>
      <h2 className="h3">Zeitplan und Aufbewahrung <Hilfe ort="sicherung.zeitplan" /></h2>
      <label className="haken"><input type="checkbox" checked={p.aktiv} disabled={!p.aktiv && !notfallblatt} onChange={(e) => setP({ ...p, aktiv: e.target.checked })} /><span>Automatisch sichern</span></label>
      {!notfallblatt && !p.aktiv && <p className="leise klein">Erst einschaltbar, wenn du das Notfallblatt heruntergeladen hast – ohne den Schlüssel darauf ist eine Sicherung wertlos. <a className="knopf klein" href={NOTFALLBLATT_URL} download onClick={() => { setTimeout(gespeichert, 1500); setTimeout(meldeSicherung, 1500); }}>Notfallblatt herunterladen</a></p>}
      <div className="raster">
        <label className="eigenschaft"><span>Häufigkeit</span>
          <select value={p.haeufigkeit} onChange={(e) => setP({ ...p, haeufigkeit: e.target.value as SicherungsPlan['haeufigkeit'] })}><option value="taeglich">täglich</option><option value="woechentlich">wöchentlich</option></select></label>
        {p.haeufigkeit === 'woechentlich' && (
          <label className="eigenschaft"><span>Wochentag</span>
            <select value={p.wochentag} onChange={(e) => setP({ ...p, wochentag: Number(e.target.value) })}>{TAGE.slice(1).map((t, i) => <option key={t} value={i + 1}>{t}</option>)}</select></label>
        )}
        <label className="eigenschaft"><span>Uhrzeit</span><input type="time" value={p.uhrzeit} onChange={(e) => setP({ ...p, uhrzeit: e.target.value })} /></label>
      </div>
      <p className="leise klein">Aufbewahrt werden die neuesten automatischen Sicherungen: je Tag, je Woche und je Monat die jeweils letzte. Von Hand angelegte bleiben, bis du sie löschst.</p>
      <div className="raster">
        {p.haeufigkeit === 'taeglich' && <label className="eigenschaft"><span>Tägliche</span><input type="number" min={0} max={366} value={a.taeglich} onChange={(e) => setA('taeglich', e.target.value)} /></label>}
        <label className="eigenschaft"><span>Wöchentliche</span><input type="number" min={0} max={260} value={a.woechentlich} onChange={(e) => setA('woechentlich', e.target.value)} /></label>
        <label className="eigenschaft"><span>Monatliche</span><input type="number" min={0} max={240} value={a.monatlich} onChange={(e) => setA('monatlich', e.target.value)} /></label>
        <label className="eigenschaft"><span>Mindest-Speicherplatz in GB <small>darunter beginnt keine Sicherung</small></span><input type="number" min={0} value={p.mindestFreiGB} onChange={(e) => setP({ ...p, mindestFreiGB: Math.max(0, Math.trunc(Number(e.target.value) || 0)) })} /></label>
      </div>
      {meldung && <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">{meldung.text}</p>}
      <Speicherleiste ent={ent} gegenstand="Zeitplan" sendet={sendet} />
    </form>
  );
}

/** Notfallblatt (#106): herunterladen, Stand, Hinweis nach einem Schlüsselwechsel. */
export function Notfallblatt({ stand, schluessel, geladen }: { stand: SicherungsZustand['notfallblatt'] | null | undefined; schluessel: boolean; geladen(): void }) {
  return (
    <section className="blatt" id="notfallblatt">
      <h2 className="h3">Notfallblatt <Hilfe ort="sicherung.notfallblatt" /></h2>
      <p>Ein PDF mit allem, was du nach einem Ausfall brauchst: den <strong>Schlüssel</strong> (in Vierergruppen zum Abschreiben), seinen Fingerabdruck, die Haushalts-Id, wo die Sicherungen liegen, und die Schritte zur Wiederherstellung. Der Schlüssel steht in keiner Sicherung – bewahre das Blatt in einem Passwortsafe oder ausgedruckt an einem sicheren Ort auf, getrennt vom NAS.</p>
      {stand?.am && <p className="leise klein">Zuletzt heruntergeladen {zeit(stand.am)}{stand.von ? ` von ${stand.von}` : ''}.</p>}
      {stand && !stand.aktuell && stand.am && <div className="hinweis warn"><p><strong>Der Schlüssel hat sich seitdem geändert.</strong> Lade ein neues Notfallblatt herunter. Bewahre das alte auf, solange du ältere Sicherungen hast – sie brauchen den alten Schlüssel.</p></div>}
      <div className="knoepfe">
        {schluessel
          ? <a className="knopf primaer" href={NOTFALLBLATT_URL} download onClick={() => { setTimeout(geladen, 1500); setTimeout(meldeSicherung, 1500); }}>Notfallblatt herunterladen (PDF)</a>
          : <span className="leise">Erst möglich, wenn es einen Schlüssel gibt.</span>}
      </div>
    </section>
  );
}

/** Häkchen vor einem erledigten Schritt (#414). */
export function Erledigt() {
  return <span className="nfb-haken" role="img" aria-label="erledigt" title="erledigt">✓ </span>;
}

const AMPEL = { gruen: ['gut', 'in Ordnung'], gelb: ['warn', 'zu alt oder noch nie'], rot: ['schlecht', 'fehlgeschlagen'] } as const;

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
      onSubmit={(x) => { x.preventDefault(); setSendet(true); void tu(() => api.probePlan(plan), 'Gespeichert.').finally(() => setSendet(false)); }}>
      <h2 className="h3">Probe-Wiederherstellung <Hilfe ort="sicherung.probe" /></h2>
      <p>Spielt die neueste Sicherung in einen eigenen, vorübergehenden Bereich der Datenbank ein und prüft sie: Prüfsumme, Entschlüsselung, Prüfwort, Anzahl Mappen, Dokumente und Benutzer, Prüfwerte von bis zu 20 Dateien. Das laufende DMS bleibt unberührt; der Bereich wird danach entfernt.</p>
      <dl className="eigenschaften">
        <dt>Ampel</dt><dd>{stand.ampel ? <span className={`chip ${AMPEL[stand.ampel][0]}`}>{AMPEL[stand.ampel][1]}</span> : <span className="leise">noch keine Sicherung</span>}</dd>
        {stand.letzte && <><dt>Letzte Probe</dt><dd>{zeit(stand.letzte.am)} · {stand.letzte.name}{!stand.letzte.ok && <div className="fehlertext klein">{stand.letzte.info}</div>}</dd></>}
      </dl>
      {lauf?.art === 'probe' && (laeuft || lauf.status === 'fehler') && <Schritte schritte={lauf.schritte} />}
      <div className="raster">
        <label className="haken"><input type="checkbox" checked={plan.aktiv} onChange={(e) => setPlan({ ...plan, aktiv: e.target.checked })} /><span>Wöchentlich automatisch</span></label>
        <label className="eigenschaft"><span>Wochentag</span>
          <select value={plan.wochentag} onChange={(e) => setPlan({ ...plan, wochentag: Number(e.target.value) })}>{TAGE.slice(1).map((t, i) => <option key={t} value={i + 1}>{t}</option>)}</select></label>
        <label className="eigenschaft"><span>Uhrzeit</span><input type="time" value={plan.uhrzeit} onChange={(e) => setPlan({ ...plan, uhrzeit: e.target.value })} /></label>
      </div>
      {meldung && <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">{meldung.text}</p>}
      <div className="knoepfe">
        <button type="button" className="knopf" disabled={!sicherungen || laeuft || gesperrt} onClick={() => void tu(() => api.probeStarten())}>{laeuft ? 'Probe läuft …' : 'Jetzt probeweise wiederherstellen'}</button>
      </div>
      <Speicherleiste ent={ent} gegenstand="Probe-Zeitplan" sendet={sendet} />
    </form>
  );
}
