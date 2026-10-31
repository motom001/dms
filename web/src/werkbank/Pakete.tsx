import { useCallback, useEffect, useState } from 'react';
import { herkunftText, vergleicheVersion, type InstalliertesPaket, type Katalog, type KatalogPaket } from '../../../shared/src/pakete';
import { api, ApiFehler, type PaketQuelle, type PaketVorschau } from '../api';
import { useDaten } from '../daten';
import { Hilfe } from '../Hilfe';
import { geheZu, Link } from '../ort';

/**
 * Werkbank → Pakete (#188): Konfigurationspakete aus dem offiziellen Katalog.
 * Den Katalog fragt das DMS nur auf Knopfdruck ab, nie im Hintergrund.
 * Erweiterte Ansicht (#189): weitere Katalogadressen und Hochladen als Datei.
 */

const datum = (iso: string | null) => (iso ? new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) : '–');
const host = (url: string) => { try { return new URL(url).host; } catch { return url; } };
/** Kennung des hochgeladenen Pakets in der Adresse. */
export const UPLOAD = '~hochgeladen';

/**
 * Erweiterte Ansicht je Benutzer, standardmäßig aus. Ein späterer allgemeiner Expertenmodus der
 * Werkbank (Einstellung werkbank_experte) schaltet sie mit ein.
 */
export const erweiterteAnsicht = (e: Record<string, unknown>) => e.werkbank_experte === true || e.pakete_erweitert === true;

type Abruf = { url: string; offiziell: boolean; katalog: Katalog | null; fehler: string | null };

export function usePakete(offen: boolean) {
  const [stand, setStand] = useState<{ installiert: InstalliertesPaket[]; katalogUrl: string; quellen: PaketQuelle[]; dms: string } | null>(null);
  const [kataloge, setKataloge] = useState<{ liste: Abruf[]; abgerufen: string } | null>(null);
  const [updates, setUpdates] = useState<Array<{ id: string; installiert: string; neu: string; changelog: string | null; quelle: string }> | null>(null);
  const [upload, setUpload] = useState<{ upload: string; vorschau: PaketVorschau; datei: string } | null>(null);
  const [fehler, setFehler] = useState<string>();
  const [laedt, setLaedt] = useState(false);
  const laden = useCallback(async () => { try { setStand(await api.pakete()); setFehler(undefined); } catch (e) { setFehler((e as Error).message); } }, []);
  useEffect(() => { if (offen) void laden(); }, [offen, laden]);
  const abrufen = useCallback(async (alle: boolean) => {
    setLaedt(true); setFehler(undefined);
    try { const k = await api.paketKatalog(alle); setKataloge({ liste: k.kataloge, abgerufen: k.abgerufen }); } catch (e) { setFehler((e as Error).message); } finally { setLaedt(false); }
  }, []);
  const pruefen = useCallback(async (alle: boolean) => {
    setLaedt(true); setFehler(undefined);
    try { setUpdates(await api.paketUpdates()); const k = await api.paketKatalog(alle); setKataloge({ liste: k.kataloge, abgerufen: k.abgerufen }); } catch (e) { setFehler((e as Error).message); } finally { setLaedt(false); }
  }, []);
  /** Katalogpaket aus einer Quelle (ohne Angabe: offizieller Katalog). */
  const paketAus = (id: string, quelle?: string): { kp: KatalogPaket; url: string; offiziell: boolean } | undefined => {
    const k = kataloge?.liste.find((x) => (quelle ? x.url === quelle : x.offiziell));
    const kp = k?.katalog?.pakete.find((p) => p.id === id);
    return kp && k ? { kp, url: k.url, offiziell: k.offiziell } : undefined;
  };
  return { stand, kataloge, updates, upload, setUpload, fehler, laedt, laden, abrufen, pruefen, paketAus, setStand };
}
export type PaketeZustand = ReturnType<typeof usePakete>;

export function PaketeListe({ z, offen }: { z: PaketeZustand; offen?: string }) {
  const d = useDaten();
  const erweitert = erweiterteAnsicht(d.einstellungen);
  const installiert = z.stand?.installiert ?? [];
  const quelleOffen = new URLSearchParams(location.search).get('quelle');
  const verfuegbar = (z.kataloge?.liste ?? []).filter((k) => erweitert || k.offiziell)
    .flatMap((k) => (k.katalog?.pakete ?? []).filter((p) => !installiert.some((i) => i.id === p.id)).map((p) => ({ p, url: k.url, offiziell: k.offiziell })));
  const neuer = (id: string) => z.updates?.find((u) => u.id === id);
  const [hochFehler, setHochFehler] = useState<string>();
  async function hochladen(f: File | undefined) {
    if (!f) return;
    setHochFehler(undefined);
    try { const r = await api.paketHochladen(f); z.setUpload({ ...r, datei: f.name }); geheZu(`/werkbank/pakete/${UPLOAD}`); }
    catch (e) { setHochFehler([(e as Error).message, ...(e instanceof ApiFehler ? e.gruende : [])].join(' ')); }
  }
  return (
    <>
      <div className="listenkopf">
        <div><h1>Pakete</h1><p className="leise klein">Fertige Mappentypen und Sichten aus dem offiziellen Katalog. <Hilfe ort="werkbank.pakete" /></p></div>
      </div>
      <div className="knoepfe">
        <button type="button" className="knopf klein" disabled={z.laedt} onClick={() => void z.abrufen(erweitert)}>{z.laedt ? 'Frage ab …' : 'Katalog abrufen'}</button>
        {installiert.length > 0 && <button type="button" className="knopf klein" disabled={z.laedt} onClick={() => void z.pruefen(erweitert)}>Auf neue Versionen prüfen</button>}
      </div>
      <label className="haken klein" title="Weitere Katalogadressen und Hochladen als Datei – für Paketentwickler und DMS ohne Internet">
        <input type="checkbox" checked={erweitert} onChange={(e) => void d.setzeEinstellung('pakete_erweitert', e.target.checked || null)} /><span>Erweiterte Ansicht</span>
      </label>
      {z.fehler && <div className="hinweis schlecht"><p>{z.fehler}</p></div>}
      <h2 className="ueber">Installiert</h2>
      {!z.stand ? <p className="leise">Lade …</p> : !installiert.length ? <p className="leise leerliste">Noch keine Pakete installiert.</p> : (
        <ul className="mappenliste">
          {installiert.map((p) => (
            <li key={p.id}><Link to={`/werkbank/pakete/${p.id}`} className={`eintrag werk ${offen === p.id ? 'an' : ''}`}>
              <span className="titel">{p.name} {neuer(p.id) && <span className="chip warn" title="Neuere Version in der Quelle">{neuer(p.id)!.neu}</span>}</span>
              <span className="unter">Version {p.version} · {herkunftText(p.herkunft)}</span>
            </Link></li>
          ))}
        </ul>
      )}
      <h2 className="ueber">Verfügbar</h2>
      {z.kataloge?.liste.filter((k) => k.fehler && (erweitert || k.offiziell)).map((k) => <div key={k.url} className="hinweis warn klein"><p>{k.offiziell ? 'Offizieller Katalog' : host(k.url)}: {k.fehler}</p></div>)}
      {!z.kataloge ? <p className="leise klein">Klicke „Katalog abrufen“, um die Pakete des offiziellen Katalogs zu sehen.</p>
        : !verfuegbar.length ? <p className="leise leerliste">Alle Pakete des Katalogs sind installiert.</p> : (
          <ul className="mappenliste">
            {verfuegbar.map(({ p, url, offiziell }) => (
              <li key={`${url}|${p.id}`}><Link to={`/werkbank/pakete/${p.id}${offiziell ? '' : `?quelle=${encodeURIComponent(url)}`}`} className={`eintrag werk ${offen === p.id && (offiziell ? !quelleOffen : quelleOffen === url) ? 'an' : ''}`}>
                <span className="titel">{p.name}{!offiziell && <> <span className="chip warn" title={`Aus ${url} – nicht vom DMS-Projekt geprüft`}>{host(url)}</span></>}</span>
                <span className="unter">{p.aktuell} · {p.beschreibung}</span>
              </Link></li>
            ))}
          </ul>
        )}
      {z.kataloge && <p className="leise klein">Abgerufen {datum(z.kataloge.abgerufen)}.</p>}
      {erweitert && (
        <>
          <h2 className="ueber">Weitere Quellen</h2>
          <Quellen z={z} />
          <h2 className="ueber">Paket hochladen</h2>
          <p className="leise klein">Eine <code>.zip</code>-Datei im Format der Registry, z. B. zum Testen eines eigenen Pakets oder ohne Internet.</p>
          <input type="file" accept=".zip,application/zip" aria-label="Paket als ZIP hochladen" onChange={(e) => { void hochladen(e.target.files?.[0]); e.target.value = ''; }} />
          {hochFehler && <p className="fehlertext klein">{hochFehler}</p>}
        </>
      )}
    </>
  );
}

/** Weitere Katalogadressen (#189): hinzufügen, abschalten, entfernen. */
function Quellen({ z }: { z: PaketeZustand }) {
  const [url, setUrl] = useState('');
  const [fehler, setFehler] = useState<string>();
  const weitere = (z.stand?.quellen ?? []).filter((q) => !q.offiziell);
  async function tu(f: () => Promise<PaketQuelle[]>) {
    setFehler(undefined);
    try { const quellen = await f(); z.setStand((s) => (s ? { ...s, quellen } : s)); } catch (e) { setFehler((e as Error).message); }
  }
  return (
    <div className="stapel klein">
      {!weitere.length ? <p className="leise">Keine weiteren Kataloge.</p> : (
        <ul className="stapel">
          {weitere.map((q) => (
            <li key={q.url}>
              <label className="haken"><input type="checkbox" checked={q.aktiv} onChange={(e) => void tu(() => api.paketQuelleSchalten(q.url, e.target.checked))} /><span className="umbrechen">{q.url}</span></label>
              <span className="leise"> {q.von ? `von ${q.von}` : ''}{q.am ? ` am ${datum(q.am)}` : ''} · </span>
              <button type="button" className="textknopf gefahr" onClick={() => { if (confirm(`Quelle ${q.url} entfernen?`)) void tu(() => api.paketQuelleEntfernen(q.url)); }}>Entfernen</button>
            </li>
          ))}
        </ul>
      )}
      <form className="zeile" onSubmit={(e) => { e.preventDefault(); void tu(async () => { const r = await api.paketQuelleHinzu(url.trim()); setUrl(''); return r; }); }}>
        <input type="url" placeholder="https://…/katalog.json" aria-label="Adresse eines weiteren Katalogs" value={url} onChange={(e) => setUrl(e.target.value)} />
        <button type="submit" className="knopf klein" disabled={!url.trim()}>Hinzufügen</button>
      </form>
      {fehler && <p className="fehlertext">{fehler}</p>}
    </div>
  );
}

export function PaketePanel({ z, id }: { z: PaketeZustand; id?: string }) {
  if (!id) return (
    <div className="einspaltig">
      <div className="mappenkopf"><p className="ueber">Werkbank</p><h1>Pakete</h1>
        <p className="leise">Ein Paket bringt fertige Mappentypen, Sichten und auf Wunsch Beispiel-Mappen mit – etwa eine „Organisation“ mit Kontakt und Anschrift. Pakete kommen aus dem offiziellen Katalog des DMS-Projekts; das DMS fragt ihn nur ab, wenn du „Katalog abrufen“ klickst.</p>
        <p className="leise">Ein Update ergänzt nur: neue Felder, Register und Sichten. Was du selbst geändert hast, bleibt.</p>
      </div>
    </div>
  );
  if (id === UPLOAD) return <UploadDetail z={z} />;
  const quelle = new URLSearchParams(location.search).get('quelle') ?? undefined;
  return <PaketDetail key={`${id}|${quelle ?? ''}`} z={z} id={id} quelle={quelle} />;
}

/** Ergebnis einer Aktion mit ggf. Gründen. */
type Meldung = { art: 'gut' | 'schlecht'; text: string; gruende?: string[] };
const alsMeldung = (e: unknown): Meldung => ({ art: 'schlecht', text: (e as Error).message, gruende: e instanceof ApiFehler ? e.gruende : [] });

function MeldungBox({ m }: { m?: Meldung }) {
  return m ? <div className={`hinweis ${m.art}`} role="status"><p>{m.text}</p>{!!m.gruende?.length && <ul>{m.gruende.map((g) => <li key={g}>{g}</li>)}</ul>}</div> : null;
}

function UploadDetail({ z }: { z: PaketeZustand }) {
  const d = useDaten();
  const [meldung, setMeldung] = useState<Meldung>();
  const u = z.upload;
  if (!u) return <div className="leer"><p>Kein hochgeladenes Paket. Lade in der erweiterten Ansicht eine .zip-Datei hoch.</p></div>;
  const p = u.vorschau.paket;
  return (
    <div className="einspaltig">
      <div className="mappenkopf"><p className="ueber">Hochgeladenes Paket</p><h1>{p.name} {p.version}</h1><p className="leise">{p.beschreibung}</p></div>
      <MeldungBox m={meldung} />
      <section className="blatt">
        <dl className="eigenschaften">
          <dt>Datei</dt><dd>{u.datei}</dd>
          <dt>Lizenz</dt><dd>{p.lizenz}</dd>
          <dt>Autor</dt><dd>{p.autor.name}{p.autor.github ? ` (@${p.autor.github})` : ''}</dd>
          <dt>Nötige DMS-Version</dt><dd>{p.dms} (dieses DMS: {u.vorschau.dmsVersion})</dd>
          {u.vorschau.installiert && <><dt>Installiert</dt><dd>Version {u.vorschau.installiert}{u.vorschau.herkunft ? ` · ${herkunftText(u.vorschau.herkunft)}` : ''}</dd></>}
        </dl>
      </section>
      <VorschauBlock v={u.vorschau} warnung={`Hochgeladen aus der Datei „${u.datei}“`}
        abbrechen={() => { z.setUpload(null); geheZu('/werkbank/pakete'); }}
        los={async (x) => {
          try {
            const r = await api.paketInstallieren({ upload: u.upload, bestaetigt: true, ...x });
            z.setUpload(null); await z.laden(); await d.neuLaden();
            geheZu(`/werkbank/pakete/${r.id}`);
          } catch (e) { setMeldung(alsMeldung(e)); }
        }} />
    </div>
  );
}

function PaketDetail({ z, id, quelle }: { z: PaketeZustand; id: string; quelle?: string }) {
  const d = useDaten();
  const erweitert = erweiterteAnsicht(d.einstellungen);
  const inst = z.stand?.installiert.find((p) => p.id === id) ?? null;
  // Installierte Pakete: Updates nur aus ihrer Quelle.
  const eigeneQuelle = inst?.herkunft.art === 'katalog' && inst.herkunft.url !== z.stand?.katalogUrl ? inst.herkunft.url : undefined;
  const aus = z.paketAus(id, quelle ?? eigeneQuelle);
  const kp = aus?.kp;
  const offiziell = inst ? inst.herkunft.art === 'katalog' && inst.herkunft.url === z.stand?.katalogUrl : !quelle || quelle === z.stand?.katalogUrl;
  const [version, setVersion] = useState<string>('');
  const [vorschau, setVorschau] = useState<PaketVorschau | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<Meldung>();
  const v = kp?.versionen.find((x) => x.version === (version || kp.aktuell)) ?? kp?.versionen[0];
  const neuer = inst && inst.herkunft.art === 'katalog' && kp && vergleicheVersion(kp.aktuell, inst.version) > 0 ? kp.aktuell : null;

  async function zeigeVorschau(ver?: string) {
    setMeldung(undefined); setLaeuft(true);
    try { setVorschau(await api.paketVorschau({ id, version: ver, quelle: inst ? eigeneQuelle : quelle })); }
    catch (e) { setMeldung(alsMeldung(e)); }
    finally { setLaeuft(false); }
  }
  async function tu(f: () => Promise<string>) {
    setMeldung(undefined); setLaeuft(true);
    try { const t = await f(); setVorschau(null); await z.laden(); await d.neuLaden(); setMeldung({ art: 'gut', text: t }); }
    catch (e) { setMeldung(alsMeldung(e)); }
    finally { setLaeuft(false); }
  }
  const entfernen = () => {
    if (!inst || !confirm(`„${inst.name}“ entfernen? Seine Mappentypen und Sichten verschwinden. Das geht nur, solange es keine Mappen dieser Typen gibt.`)) return;
    void tu(async () => { await api.paketEntfernen(id); geheZu('/werkbank/pakete', true); return `${inst.name} ist entfernt.`; });
  };

  if (!inst && !kp) return (
    <div className="leer">
      <p>{z.kataloge ? 'Dieses Paket gibt es in dieser Quelle nicht (mehr).' : 'Lade …'}</p>
      {!z.kataloge && <button type="button" className="knopf" onClick={() => void z.abrufen(erweitert)}>Katalog abrufen</button>}
    </div>
  );
  const autor = inst?.autor ?? kp?.autor;
  return (
    <div className="einspaltig">
      <div className="mappenkopf">
        <p className="ueber">Paket{!offiziell && <> · <span className="chip warn">nicht vom DMS-Projekt geprüft</span></>}</p>
        <h1>{inst?.name ?? kp!.name}</h1>
        <p className="leise">{inst?.beschreibung ?? kp?.beschreibung}</p>
      </div>
      <MeldungBox m={meldung} />

      <section className="blatt">
        <dl className="eigenschaften">
          {inst && <><dt>Installiert</dt><dd>Version {inst.version} · {datum(inst.installiert)}{inst.installiertVon ? ` von ${inst.installiertVon}` : ''}</dd></>}
          {inst?.aktualisiert && <><dt>Aktualisiert</dt><dd>{datum(inst.aktualisiert)}{inst.aktualisiertVon ? ` von ${inst.aktualisiertVon}` : ''}</dd></>}
          <dt>Herkunft</dt><dd>{inst ? herkunftText(inst.herkunft) : aus?.offiziell ? 'offizieller Katalog' : `Katalog ${aus?.url}`}</dd>
          {kp && <><dt>Im Katalog</dt><dd>Version {kp.aktuell}{neuer && <> · <strong>neuer als installiert</strong></>}</dd></>}
          <dt>Lizenz</dt><dd>{inst?.lizenz ?? kp?.lizenz}</dd>
          <dt>Autor</dt><dd>{autor?.name}{autor?.github && <> (<a className="verweis" href={`https://github.com/${autor.github}`} target="_blank" rel="noreferrer">@{autor.github}</a>)</>}</dd>
          {v && <><dt>Nötige DMS-Version</dt><dd>{v.dms} (dieses DMS: {z.stand?.dms})</dd></>}
          {v && <><dt>Abhängigkeiten</dt><dd>{Object.keys(v.abhaengigkeiten).length ? Object.entries(v.abhaengigkeiten).map(([k, b]) => `${k} ${b}`).join(', ') : 'keine'}</dd></>}
          {v && <><dt>Inhalt</dt><dd>Mappentypen: {v.inhalt.mappentypen.map((t) => t.name).join(', ') || '–'}<br />Sichten: {v.inhalt.sichten.map((s) => s.name).join(', ') || '–'}{v.inhalt.beispiele ? <><br />{v.inhalt.beispiele} Beispiel-Mappen (optional)</> : null}</dd></>}
          {(v?.readme || inst?.links?.readme) && <><dt>Mehr</dt><dd><a className="verweis" href={v?.readme || inst!.links!.readme} target="_blank" rel="noreferrer">README ↗</a>{(v?.changelog || inst?.links?.changelog) && <> · <a className="verweis" href={v?.changelog || inst!.links!.changelog} target="_blank" rel="noreferrer">Änderungen ↗</a></>}</dd></>}
        </dl>
        {inst && (
          <>
            <h2 className="h3">Gehört dazu</h2>
            <ul className="klein">
              {Object.values(inst.typen).map((t) => <li key={t}>Mappentyp {d.typ(t) ? <Link to={`/werkbank/typen/${t}`} className="verweis">{d.typ(t)!.name}</Link> : <span className="leise">(gelöscht)</span>}</li>)}
              {Object.values(inst.sichten).map((s) => <li key={s}>Sicht {d.sicht(s) ? <Link to={`/ablage/${s}`} className="verweis">{d.sicht(s)!.name}</Link> : <span className="leise">(gelöscht)</span>}</li>)}
            </ul>
          </>
        )}
        <div className="knoepfe">
          {kp && kp.versionen.length > 1 && !inst && (
            <label className="klein">Version <select value={version || kp.aktuell} onChange={(e) => { setVersion(e.target.value); setVorschau(null); }}>{kp.versionen.map((x) => <option key={x.version} value={x.version}>{x.version}</option>)}</select></label>
          )}
          {!inst && kp && <button type="button" className="knopf primaer" disabled={laeuft} onClick={() => void zeigeVorschau(version || undefined)}>Installieren …</button>}
          {inst && neuer && <button type="button" className="knopf primaer" disabled={laeuft} onClick={() => void zeigeVorschau(neuer)}>Auf {neuer} aktualisieren …</button>}
          {inst && <button type="button" className="knopf gefahr-rand" disabled={laeuft} onClick={entfernen}>Entfernen</button>}
          {inst?.herkunft.art === 'hochgeladen' && <span className="leise klein">Ein hochgeladenes Paket aktualisierst du durch erneutes Hochladen einer höheren Version.</span>}
        </div>
      </section>

      {vorschau && (
        <VorschauBlock v={vorschau} warnung={offiziell ? null : `Aus dem Katalog ${inst?.herkunft.art === 'katalog' ? inst.herkunft.url : quelle}`} abbrechen={() => setVorschau(null)}
          los={(x) => tu(async () => {
            if (vorschau.update) { const r = await api.paketAktualisieren(id, vorschau.paket.version, !offiziell); return `${r.name} ist jetzt auf Version ${r.version}.`; }
            const r = await api.paketInstallieren({ id, version: vorschau.paket.version, quelle, bestaetigt: !offiziell || undefined, ...x });
            return `${r.name} ${r.version} ist installiert.`;
          })} />
      )}
    </div>
  );
}

/**
 * Vorschau mit Namen, Abhängigkeiten und Beispielen. Bei Paketen außerhalb des offiziellen
 * Katalogs (#189) eine deutliche Warnung, die man ausdrücklich bestätigen muss.
 */
function VorschauBlock({ v, warnung, los, abbrechen }: {
  v: PaketVorschau; warnung: string | null; abbrechen(): void;
  los(x: { namen: Record<string, string>; sichtNamen: Record<string, string>; beispiele: boolean; mitAbhaengigkeiten: boolean }): Promise<void>;
}) {
  const [namen, setNamen] = useState<Record<string, string>>(() => Object.fromEntries(v.typen.filter((t) => !t.vorhanden).map((t) => [t.schluessel, t.vorschlag ?? t.name])));
  const [sichtNamen, setSichtNamen] = useState<Record<string, string>>(() => Object.fromEntries(v.sichten.filter((s) => !s.vorhanden).map((s) => [s.schluessel, s.vorschlag ?? s.name])));
  const [beispiele, setBeispiele] = useState(false);
  const [mit, setMit] = useState(true);
  const [ok, setOk] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const fehlend = v.abhaengigkeiten.filter((a) => !a.installiert);
  const konflikt = v.typen.some((t) => !t.vorhanden && t.konflikt && (namen[t.schluessel] ?? '').trim().toLowerCase() === t.name.toLowerCase())
    || v.sichten.some((s) => !s.vorhanden && s.konflikt && (sichtNamen[s.schluessel] ?? '').trim().toLowerCase() === s.name.toLowerCase());
  const leer = Object.values(namen).some((n) => !n.trim()) || Object.values(sichtNamen).some((n) => !n.trim());
  return (
    <section className="blatt" aria-label="Vorschau">
      <h2 className="h3">{v.update ? `Update auf ${v.paket.version}` : `Vorschau: ${v.paket.name} ${v.paket.version}`}</h2>
      {warnung && (
        <div className="hinweis warn" role="alert">
          <p><strong>Nicht vom DMS-Projekt geprüft.</strong> {warnung}. Installiere nur Pakete, deren Herkunft du kennst und der du vertraust.</p>
          <label className="haken"><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} /><span>Ich weiß, woher das Paket stammt, und installiere es auf eigene Verantwortung.</span></label>
        </div>
      )}
      {v.probleme.length > 0 && <div className="hinweis schlecht"><ul>{v.probleme.map((p) => <li key={p}>{p}</li>)}</ul></div>}
      {v.update
        ? <p className="leise">Ein Update ergänzt nur. Es löscht nichts und überschreibt nichts, was du selbst geändert hast.</p>
        : <p className="leise">Das wird angelegt. Gibt es einen Namen schon, wähle einen anderen.</p>}
      <h3>Mappentypen</h3>
      <ul className="stapel">
        {v.typen.map((t) => (
          <li key={t.schluessel}>
            {t.vorhanden
              ? <span><strong>{t.name}</strong> – {t.neueFelder.length || t.neueRegister.length ? `neu: ${[...t.neueFelder.map((f) => `Feld „${f}“`), ...t.neueRegister.map((r) => `Register „${r}“`)].join(', ')}` : 'keine Änderung'}</span>
              : t.geloescht ? <span className="leise">{t.name}: hast du gelöscht – bleibt weg.</span>
              : <label className="paketname"><span>{t.felder} Felder, Schlüssel <code>{t.dmsSchluessel}</code></span>
                  <input value={namen[t.schluessel] ?? t.name} aria-label={`Name für ${t.name}`} onChange={(e) => setNamen({ ...namen, [t.schluessel]: e.target.value })} />
                  {t.konflikt && (namen[t.schluessel] ?? '').trim().toLowerCase() === t.name.toLowerCase() && <span className="fehlertext klein">{t.konflikt}</span>}
                </label>}
          </li>
        ))}
      </ul>
      <h3>Sichten</h3>
      <ul className="stapel">
        {v.sichten.map((s) => (
          <li key={s.schluessel}>
            {s.vorhanden ? <span className="leise">{s.name} – vorhanden</span>
              : <label className="paketname"><span>{s.eltern ? `unter „${v.sichten.find((x) => x.schluessel === s.eltern)?.name ?? s.eltern}“` : 'oberste Ebene'}</span>
                  <input value={sichtNamen[s.schluessel] ?? s.name} aria-label={`Name für Sicht ${s.name}`} onChange={(e) => setSichtNamen({ ...sichtNamen, [s.schluessel]: e.target.value })} />
                  {s.konflikt && (sichtNamen[s.schluessel] ?? '').trim().toLowerCase() === s.name.toLowerCase() && <span className="fehlertext klein">{s.konflikt}</span>}
                </label>}
          </li>
        ))}
      </ul>
      {v.abhaengigkeiten.length > 0 && (
        <>
          <h3>Abhängigkeiten</h3>
          <ul className="klein">{v.abhaengigkeiten.map((a) => <li key={a.id}>{a.id} {a.bereich}: {a.installiert ? `installiert (${a.installiert})${a.ok ? '' : ' – passt nicht'}` : a.verfuegbar ? `fehlt – im Katalog gibt es ${a.verfuegbar}` : 'fehlt und ist nicht im Katalog'}</li>)}</ul>
          {!v.update && fehlend.length > 0 && <label className="haken"><input type="checkbox" checked={mit} onChange={(e) => setMit(e.target.checked)} /><span>Fehlende Pakete mitinstallieren</span></label>}
        </>
      )}
      {!v.update && v.beispiele > 0 && <label className="haken"><input type="checkbox" checked={beispiele} onChange={(e) => setBeispiele(e.target.checked)} /><span>{v.beispiele} Beispiel-Mappen anlegen</span></label>}
      <div className="knoepfe">
        <button type="button" className="knopf primaer" disabled={laeuft || v.probleme.length > 0 || konflikt || leer || (!!warnung && !ok)}
          onClick={() => { setLaeuft(true); void los({ namen, sichtNamen, beispiele, mitAbhaengigkeiten: mit }).finally(() => setLaeuft(false)); }}>
          {laeuft ? (v.update ? 'Aktualisiere …' : 'Installiere …') : v.update ? 'Aktualisieren' : 'Installieren'}
        </button>
        <button type="button" className="textknopf" onClick={abbrechen}>Abbrechen</button>
      </div>
    </section>
  );
}
