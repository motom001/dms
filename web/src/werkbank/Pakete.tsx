import { useCallback, useEffect, useState } from 'react';
import { Symbol } from '../Symbol';
import { hatSchnittstelle, herkunftText, laeuferZustandText, vergleicheVersion, type InstalliertesPaket, type Katalog, type KatalogPaket } from '../../../shared/src/pakete';
import { api, ApiFehler, type PaketlaeuferStand, type PaketQuelle, type PaketVorschau, type Sammeldatei } from '../api';
import { useDaten } from '../daten';
import { Hilfe } from '../Hilfe';
import { darfVerlassen, geheZu, Link } from '../ort';
import { PaketEinstellungen } from './PaketEinstellungen';
import { VektorStandBlock } from '../ablage/Aehnlich';
import { FragenGrenzenBlock } from './FragenGrenzen';
import { PaketErstellen } from './PaketErstellen';
import { rueckfrage } from '../rueckfrage';
import { useKonto } from '../konto';
import { sammelSeite, SammeldateiAnsicht, SammeldateiWahl } from './PaketeDazuholen';
import { PaketUmwandeln } from './PaketUmwandeln';
import { t as tx } from '../sprache';

/**
 * Werkbank → Pakete (#188): Konfigurationspakete aus dem offiziellen Katalog.
 * Den Katalog fragt das DMS nur auf Knopfdruck ab, nie im Hintergrund.
 * Expertenmodus (#189, #369): weitere Katalogadressen und Hochladen als Datei, in einem
 * aufklappbaren Abschnitt direkt unter den Knöpfen.
 */

const datum = (iso: string | null) => (iso ? new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) : '–');
const host = (url: string) => { try { return new URL(url).host; } catch { return url; } };
/** Kennung des hochgeladenen Pakets in der Adresse. */
export const UPLOAD = '~hochgeladen';
/** Assistent „Paket erstellen“ (#374). */
export const ERSTELLEN = '~erstellen';
/** Hochgeladene Sammeldatei mit mehreren Paketen (#461). */
export const SAMMEL = '~sammeldatei';

/**
 * Abschnitt „Expertenmodus“ auf- oder zugeklappt (#369): reiner Komfort, kein Recht – gemerkt im
 * Browser je Benutzer, standardmäßig zu. Er zeigt nur etwas an; welche Kataloge abgefragt werden,
 * bestimmen die Quellen selbst (eingeschaltet oder nicht), nicht der Abschnitt.
 */
function useExperteOffen(): [boolean, (offen: boolean) => void] {
  const { ich } = useKonto();
  const schluessel = `dms:pakete-experte:${ich.id}`;
  const [offen, setOffen] = useState(() => { try { return localStorage.getItem(schluessel) === '1'; } catch { return false; } });
  const setzen = (n: boolean) => {
    setOffen(n);
    try { if (n) localStorage.setItem(schluessel, '1'); else localStorage.removeItem(schluessel); } catch { /* nur für diese Sitzung */ }
  };
  return [offen, setzen];
}

type Abruf = { url: string; offiziell: boolean; katalog: Katalog | null; fehler: string | null };

export function usePakete(offen: boolean) {
  const [stand, setStand] = useState<{ installiert: InstalliertesPaket[]; katalogUrl: string; quellen: PaketQuelle[]; dms: string } | null>(null);
  const [kataloge, setKataloge] = useState<{ liste: Abruf[]; abgerufen: string } | null>(null);
  const [updates, setUpdates] = useState<Array<{ id: string; installiert: string; neu: string; changelog: string | null; quelle: string }> | null>(null);
  const [upload, setUpload] = useState<{ upload: string; vorschau: PaketVorschau; datei: string } | null>(null);
  const [sammel, setSammel] = useState<{ sammeldatei: Sammeldatei; datei: string } | null>(null);
  const [fehler, setFehler] = useState<string>();
  const [laedt, setLaedt] = useState(false);
  const laden = useCallback(async () => { try { setStand(await api.pakete()); setFehler(undefined); } catch (e) { setFehler((e as Error).message); } }, []);
  useEffect(() => { if (offen) void laden(); }, [offen, laden]);
  // Abgefragt werden der offizielle Katalog und die eingeschalteten weiteren Quellen (#369);
  // der Link aus der Katalog-Webseite (#191) fragt nur den offiziellen ab (alle = false).
  const abrufen = useCallback(async (alle = true) => {
    setLaedt(true); setFehler(undefined);
    try { const k = await api.paketKatalog(alle); setKataloge({ liste: k.kataloge, abgerufen: k.abgerufen }); } catch (e) { setFehler((e as Error).message); } finally { setLaedt(false); }
  }, []);
  const pruefen = useCallback(async () => {
    setLaedt(true); setFehler(undefined);
    try { setUpdates(await api.paketUpdates()); const k = await api.paketKatalog(true); setKataloge({ liste: k.kataloge, abgerufen: k.abgerufen }); } catch (e) { setFehler((e as Error).message); } finally { setLaedt(false); }
  }, []);
  /** Katalogpaket aus einer Quelle (ohne Angabe: offizieller Katalog). */
  const paketAus = (id: string, quelle?: string): { kp: KatalogPaket; url: string; offiziell: boolean } | undefined => {
    const k = kataloge?.liste.find((x) => (quelle ? x.url === quelle : x.offiziell));
    const kp = k?.katalog?.pakete.find((p) => p.id === id);
    return kp && k ? { kp, url: k.url, offiziell: k.offiziell } : undefined;
  };
  return { stand, kataloge, updates, upload, setUpload, sammel, setSammel, fehler, laedt, laden, abrufen, pruefen, paketAus, setStand };
}
export type PaketeZustand = ReturnType<typeof usePakete>;

export function PaketeListe({ z, offen }: { z: PaketeZustand; offen?: string }) {
  const [experte, setExperte] = useExperteOffen();
  const installiert = z.stand?.installiert ?? [];
  const quelleOffen = new URLSearchParams(location.search).get('quelle');
  const verfuegbar = (z.kataloge?.liste ?? [])
    .flatMap((k) => (k.katalog?.pakete ?? []).filter((p) => !installiert.some((i) => i.id === p.id)).map((p) => ({ p, url: k.url, offiziell: k.offiziell })));
  const neuer = (id: string) => z.updates?.find((u) => u.id === id);
  const [hochFehler, setHochFehler] = useState<string>();
  async function hochladen(f: File | undefined) {
    if (!f) return;
    setHochFehler(undefined);
    try {
      const r = await api.paketHochladen(f);
      // Eine Sammeldatei (#461) erkennt das DMS selbst.
      if ('sammeldatei' in r) { z.setSammel({ sammeldatei: r.sammeldatei, datei: f.name }); geheZu(`/werkbank/pakete/${SAMMEL}`); }
      else { z.setUpload({ ...r, datei: f.name }); geheZu(`/werkbank/pakete/${UPLOAD}`); }
    }
    catch (e) { setHochFehler([(e as Error).message, ...(e instanceof ApiFehler ? e.gruende : [])].join(' ')); }
  }
  return (
    <>
      <div className="listenkopf">
        <div><h1>Pakete</h1><p className="leise klein">Fertige Mappentypen und Ansichten aus dem offiziellen Katalog. <Hilfe ort="werkbank.pakete" /></p></div>
      </div>
      <div className="knoepfe">
        <button type="button" className="knopf klein" disabled={z.laedt} onClick={() => void z.abrufen()}>{z.laedt ? 'Frage ab …' : 'Katalog abrufen'}</button>
        {installiert.length > 0 && <button type="button" className="knopf klein" disabled={z.laedt} onClick={() => void z.pruefen()}>Auf neue Versionen prüfen</button>}
        <Link to={`/werkbank/pakete/${ERSTELLEN}`} className={`knopf klein ${offen === ERSTELLEN ? 'an' : ''}`}>Paket erstellen</Link>
        <Link to={`/werkbank/pakete/${SAMMEL}`} className={`knopf klein ${offen === SAMMEL ? 'an' : ''}`}>Ohne Internet …</Link>
      </div>
      <section className="aufklappbereich">
        <button type="button" className="aufklappkopf" aria-expanded={experte} aria-controls="pakete-experte" onClick={() => setExperte(!experte)}>
          <span className="zeichen" aria-hidden="true">{experte ? '▾' : '▸'}</span>
          <span>Expertenmodus</span>
          <span className="leise klein">Weitere Quellen, Paket oder Sammeldatei hochladen</span>
        </button>
        {experte && (
          <div id="pakete-experte" className="aufklappinhalt">
            <div className="hinweis warn klein"><p>Pakete außerhalb des offiziellen Katalogs – nur, wenn du der Quelle vertraust. Sie hat niemand vom DMS-Projekt geprüft.</p></div>
            <h2 className="ueber">Weitere Quellen</h2>
            <Quellen z={z} />
            <h2 className="ueber">Paket hochladen</h2>
            <p className="leise klein">Eine <code>.zip</code>-Datei im Format der Registry, z. B. zum Testen eines eigenen Pakets, oder eine Sammeldatei mit mehreren Paketen aus dem Katalog (ohne Internet).</p>
            <input type="file" accept=".zip,application/zip" aria-label="Paket oder Sammeldatei als ZIP hochladen" onChange={(e) => { void hochladen(e.target.files?.[0]); e.target.value = ''; }} />
            {hochFehler && <p className="fehlertext klein">{hochFehler}</p>}
          </div>
        )}
      </section>
      {z.fehler && <div className="hinweis schlecht"><p>{z.fehler}</p></div>}
      <h2 className="ueber">Installiert</h2>
      {!z.stand ? <p className="leise">Lade …</p> : !installiert.length ? <p className="leise leerliste">Noch keine Pakete installiert.</p> : (
        <ul className="mappenliste">
          {installiert.map((p) => (
            <li key={p.id}><Link to={`/werkbank/pakete/${p.id}`} className={`eintrag werk ${offen === p.id ? 'an' : ''}`}>
              <span className="titel">{p.name} {neuer(p.id) && <span className="chip warn" title="Neuere Version in der Quelle">{neuer(p.id)!.neu}</span>}{p.einstellungenNoetig && <> <span className="chip warn" title="Pflichtfelder in den Einstellungen fehlen">Einstellungen nötig</span></>}</span>
              <span className="unter">Version {p.version} · {herkunftText(p.herkunft)}</span>
            </Link></li>
          ))}
        </ul>
      )}
      <h2 className="ueber">Verfügbar</h2>
      {z.kataloge?.liste.filter((k) => k.fehler).map((k) => <div key={k.url} className="hinweis warn klein"><p>{k.offiziell ? 'Offizieller Katalog' : host(k.url)}: {k.fehler}</p></div>)}
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
              <button type="button" className="textknopf gefahr" onClick={async () => { if (await rueckfrage({ titel: 'Paketquelle entfernen?', text: q.url, ja: 'Entfernen', gefahr: true })) void tu(() => api.paketQuelleEntfernen(q.url)); }}>Entfernen</button>
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
        <p className="leise">Ein Paket bringt fertige Mappentypen, Ansichten und auf Wunsch Beispiel-Mappen mit – etwa eine „Organisation“ mit Kontakt und Anschrift. Pakete kommen aus dem offiziellen Katalog des DMS-Projekts; das DMS fragt ihn nur ab, wenn du „Katalog abrufen“ klickst.</p>
        <p className="leise">Ein Update ergänzt nur: neue Felder, Register und Ansichten. Was du selbst geändert hast, bleibt.</p>
        <p className="leise">Eigene Mappentypen und Ansichten nimmst du mit „Paket erstellen“ als Paket in ein anderes DMS mit.</p>
      </div>
    </div>
  );
  if (id === UPLOAD) return <UploadDetail z={z} />;
  if (id === SAMMEL) return <SammelDetail z={z} />;
  if (id === ERSTELLEN) return <PaketErstellen />;
  const quelle = new URLSearchParams(location.search).get('quelle') ?? undefined;
  return <PaketDetail key={`${id}|${quelle ?? ''}`} z={z} id={id} quelle={quelle} />;
}

/**
 * Installieren per Link (#191): /werkbank/pakete?installieren=<id>@<version> zeigt die Vorschau genau
 * dieses Pakets – immer aus dem offiziellen Katalog; andere Parameter zählen nicht. Installiert wird
 * erst nach Klick auf „Installieren“.
 */
export function PaketLink({ z, wert }: { z: PaketeZustand; wert: string }) {
  const d = useDaten();
  const [id, version] = wert.split('@');
  const gueltig = /^[a-z][a-z0-9_]{1,19}$/.test(id ?? '') && (!version || /^\d+\.\d+\.\d+$/.test(version));
  const [vorschau, setVorschau] = useState<PaketVorschau | null>(null);
  const [meldung, setMeldung] = useState<Meldung>();
  useEffect(() => {
    if (!gueltig) return;
    let aktuell = true;
    api.paketVorschau({ id, version: version || undefined }).then((v) => aktuell && setVorschau(v), (e) => aktuell && setMeldung(alsMeldung(e)));
    return () => { aktuell = false; };
  }, [id, version, gueltig]);
  if (!gueltig) return <div className="leer"><p>Dieser Link ist ungültig. Erwartet ist <code>?installieren=paket@1.0.0</code>.</p></div>;
  const schon = !!vorschau?.installiert && vorschau.probleme.some((p) => p.includes('schon installiert'));
  return (
    <div className="einspaltig">
      <div className="mappenkopf">
        <p className="ueber">Paket aus dem offiziellen Katalog</p>
        <h1>{vorschau?.paket.name ?? id}{vorschau ? ` ${vorschau.paket.version}` : version ? ` ${version}` : ''}</h1>
        {vorschau && <p className="leise">{vorschau.paket.beschreibung}</p>}
      </div>
      <MeldungBox m={meldung} />
      {!vorschau && !meldung && <p className="leise">Frage den offiziellen Katalog ab …</p>}
      {vorschau && (
        <section className="blatt">
          <dl className="eigenschaften">
            <dt>Lizenz</dt><dd>{vorschau.paket.lizenz}</dd>
            <dt>Autor</dt><dd>{vorschau.paket.autor.name}{vorschau.paket.autor.github ? ` (@${vorschau.paket.autor.github})` : ''}</dd>
            <dt>Nötige DMS-Version</dt><dd>{vorschau.paket.dms} (dieses DMS: {vorschau.dmsVersion})</dd>
            {vorschau.installiert && <><dt>Installiert</dt><dd>Version {vorschau.installiert}</dd></>}
            {vorschau.paket.readme && <><dt>Mehr</dt><dd><a className="verweis" href={vorschau.paket.readme} target="_blank" rel="noreferrer">README ↗</a></dd></>}
          </dl>
        </section>
      )}
      {schon && (
        <div className="hinweis info"><p>„{vorschau!.paket.name}“ ist schon installiert (Version {vorschau!.installiert}). <button type="button" className="textknopf" onClick={() => { void z.abrufen(false); geheZu(`/werkbank/pakete/${id}`); }}>Zum Paket</button> – dort gibt es ggf. das Update.</p></div>
      )}
      {vorschau && !schon && (
        <VorschauBlock v={vorschau} warnung={null} abbrechen={() => geheZu('/werkbank/pakete')}
          los={async (x) => {
            try {
              const r = vorschau.update ? await api.paketAktualisieren(id, vorschau.paket.version, undefined, x.rechteBestaetigt) : await api.paketInstallieren({ id, version: vorschau.paket.version, ...x });
              await z.laden(); await d.neuLaden(); await z.abrufen(false);
              geheZu(`/werkbank/pakete/${r.id}`);
            } catch (e) { setMeldung(alsMeldung(e)); }
          }} />
      )}
    </div>
  );
}

/** Ergebnis einer Aktion mit ggf. Gründen. */
export type Meldung = { art: 'gut' | 'schlecht'; text: string; gruende?: string[] };
export const alsMeldung = (e: unknown): Meldung => ({ art: 'schlecht', text: (e as Error).message, gruende: e instanceof ApiFehler ? e.gruende : [] });

export function MeldungBox({ m }: { m?: Meldung }) {
  return m ? <div className={`hinweis ${m.art}`} role="status"><p>{m.text}</p>{!!m.gruende?.length && <ul>{m.gruende.map((g) => <li key={g}>{g}</li>)}</ul>}</div> : null;
}

/**
 * Pakete ohne Internet (#461): Sammeldatei aus der Katalog-Webseite hochladen, Inhalt ansehen und Paket für
 * Paket installieren.
 */
function SammelDetail({ z }: { z: PaketeZustand }) {
  const d = useDaten();
  const dms = z.stand?.dms ?? '';
  const s = z.sammel;
  return (
    <div className="einspaltig">
      <div className="mappenkopf"><p className="ueber">Pakete ohne Internet</p><h1>Sammeldatei hochladen</h1>
        <p className="leise">Kommt dein DMS nicht ins Internet, stellst du die Pakete an einem anderen Gerät auf der <a className="verweis" href={sammelSeite(dms)} target="_blank" rel="noreferrer">Katalog-Webseite ↗</a> zusammen – Abhängigkeiten kommen automatisch mit – und lädst die eine Datei hier hoch. <Hilfe ort="werkbank.pakete.sammeldatei" /></p>
      </div>
      {!s ? <SammeldateiWahl geladen={(x, datei) => z.setSammel({ sammeldatei: x, datei })} einzeln={(r, datei) => { z.setUpload({ ...r, datei }); geheZu(`/werkbank/pakete/${UPLOAD}`); }} />
        : <SammeldateiAnsicht key={s.sammeldatei.datei.sha256} s={s.sammeldatei} datei={s.datei} dms={dms}
            geaendert={() => { void z.laden(); void d.neuLaden(); }}
            abbrechen={() => z.setSammel(null)}
            fertig={() => { z.setSammel(null); void z.laden(); geheZu('/werkbank/pakete'); }} />}
    </div>
  );
}

function UploadDetail({ z }: { z: PaketeZustand }) {
  const d = useDaten();
  const [meldung, setMeldung] = useState<Meldung>();
  const u = z.upload;
  if (!u) return <div className="leer"><p>Kein hochgeladenes Paket. Lade im Expertenmodus eine .zip-Datei hoch.</p></div>;
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
  const [reiter, setReiter] = useState<'uebersicht' | 'einstellungen'>(() => (new URLSearchParams(location.search).get('reiter') === 'einstellungen' ? 'einstellungen' : 'uebersicht'));
  const [entfernenOffen, setEntfernenOffen] = useState(false);
  const [behalten, setBehalten] = useState(false);
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
  const entfernen = async () => {
    if (!inst) return;
    // Mit Einstellungen (#197): fragen, ob sie für eine spätere Neuinstallation bleiben sollen (Standard: nein).
    if (inst.einstellungen) { setEntfernenOffen(true); return; }
    if (!(await rueckfrage({ titel: `„${inst.name}“ entfernen?`, text: 'Seine Mappentypen und Ansichten verschwinden. Das geht nur, solange es keine Mappen dieser Mappentypen gibt.', ja: 'Entfernen', gefahr: true }))) return;
    void tu(async () => { await api.paketEntfernen(id); geheZu('/werkbank/pakete', true); return `${inst.name} ist entfernt.`; });
  };
  const entfernenBestaetigt = () => void tu(async () => { await api.paketEntfernen(id, behalten); setEntfernenOffen(false); geheZu('/werkbank/pakete', true); return `${inst!.name} ist entfernt${behalten ? ', die Einstellungen bleiben für eine spätere Neuinstallation' : ''}.`; });

  if (!inst && !kp) return (
    <div className="leer">
      <p>{z.kataloge ? 'Dieses Paket gibt es in dieser Quelle nicht (mehr).' : 'Lade …'}</p>
      {!z.kataloge && <button type="button" className="knopf" onClick={() => void z.abrufen()}>Katalog abrufen</button>}
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
      {inst?.einstellungen && (
        <div className="registertaben" role="tablist" aria-label="Paket">
          <button type="button" role="tab" aria-selected={reiter === 'uebersicht'} className={`registertab ${reiter === 'uebersicht' ? 'an' : ''}`} onClick={() => void darfVerlassen().then((ok) => { if (ok) setReiter('uebersicht'); })}>Übersicht</button>
          <button type="button" role="tab" aria-selected={reiter === 'einstellungen'} className={`registertab ${reiter === 'einstellungen' ? 'an' : ''}`} onClick={() => setReiter('einstellungen')}>Einstellungen{inst.einstellungenNoetig && <> <Symbol name="warnung" className="sym-warn" /><span className="sr-only">(Einstellungen nötig)</span></>}</button>
        </div>
      )}
      {inst?.einstellungen && reiter === 'einstellungen' ? <PaketEinstellungen id={id} gespeichert={() => void z.laden()} /> : <>

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
          {v && <><dt>Inhalt</dt><dd>Mappentypen: {v.inhalt.mappentypen.map((t) => t.name).join(', ') || '–'}<br />Ansichten: {v.inhalt.sichten.map((s) => s.name).join(', ') || '–'}{v.inhalt.beispiele ? <><br />{v.inhalt.beispiele} Beispiel-Mappen (optional)</> : null}</dd></>}
          {(v?.readme || inst?.links?.readme) && <><dt>Mehr</dt><dd><a className="verweis" href={v?.readme || inst!.links!.readme} target="_blank" rel="noreferrer">README ↗</a>{(v?.changelog || inst?.links?.changelog) && <> · <a className="verweis" href={v?.changelog || inst!.links!.changelog} target="_blank" rel="noreferrer">Änderungen ↗</a></>}</dd></>}
        </dl>
        {inst?.laeufer && <LaeuferStand paket={inst.id} />}
        {inst?.laeufer && hatSchnittstelle(inst.laeufer, 'dms:vektoren') && <VektorStandBlock />}
        {inst?.laeufer && hatSchnittstelle(inst.laeufer, 'dms:antworten') && <FragenGrenzenBlock />}
        {inst && (
          <>
            <h2 className="h3">Gehört dazu</h2>
            <ul className="klein">
              {Object.values(inst.typen).map((t) => <li key={t}>Mappentyp {d.typ(t) ? <Link to={`/werkbank/typen/${t}`} className="verweis">{d.typ(t)!.name}</Link> : <span className="leise">(gelöscht)</span>}</li>)}
              {Object.values(inst.sichten).map((s) => <li key={s}>Ansicht {d.sicht(s) ? <Link to={`/ablage/${s}`} className="verweis">{d.sicht(s)!.name}</Link> : <span className="leise">(gelöscht)</span>}</li>)}
            </ul>
          </>
        )}
        {/* Mit Versionsauswahl: Knöpfe bündig mit dem Auswahlfeld statt auf Beschriftung + Feld gestreckt (#448). */}
        <div className={`knoepfe${kp && kp.versionen.length > 1 && !inst ? ' feld-buendig' : ''}`}>
          {kp && kp.versionen.length > 1 && !inst && (
            <label className="klein">Version <select value={version || kp.aktuell} onChange={(e) => { setVersion(e.target.value); setVorschau(null); }}>{kp.versionen.map((x) => <option key={x.version} value={x.version}>{x.version}</option>)}</select></label>
          )}
          {!inst && kp && <button type="button" className="knopf primaer" disabled={laeuft} onClick={() => void zeigeVorschau(version || undefined)}>Installieren …</button>}
          {inst && neuer && <button type="button" className="knopf primaer" disabled={laeuft} onClick={() => void zeigeVorschau(neuer)}>Auf {neuer} aktualisieren …</button>}
          {inst && <button type="button" className="knopf gefahr-rand" disabled={laeuft} onClick={entfernen}>Entfernen</button>}
          {inst?.herkunft.art === 'hochgeladen' && <span className="leise klein">Ein hochgeladenes Paket aktualisierst du durch erneutes Hochladen einer höheren Version.</span>}
        </div>
        {entfernenOffen && inst && (
          <div className="hinweis warn" role="dialog" aria-label="Paket entfernen">
            <p>„{inst.name}“ entfernen? Seine Mappentypen und Ansichten verschwinden. Das geht nur, solange es keine Mappen dieser Mappentypen gibt.</p>
            <label className="haken"><input type="checkbox" checked={behalten} onChange={(e) => setBehalten(e.target.checked)} /><span>Einstellungen behalten (für eine spätere Neuinstallation)?</span></label>
            <div className="knoepfe"><button type="button" className="knopf gefahr" disabled={laeuft} onClick={entfernenBestaetigt}>Entfernen</button><button type="button" className="textknopf" onClick={() => setEntfernenOffen(false)}>Abbrechen</button></div>
          </div>
        )}
      </section>

      {inst && <PaketUmwandeln key={`${inst.id}|${inst.version}`} paket={inst.id} />}

      {vorschau && (
        <VorschauBlock v={vorschau} warnung={offiziell ? null : `Aus dem Katalog ${inst?.herkunft.art === 'katalog' ? inst.herkunft.url : quelle}`} abbrechen={() => setVorschau(null)}
          los={(x) => tu(async () => {
            if (vorschau.update) { const r = await api.paketAktualisieren(id, vorschau.paket.version, !offiziell, x.rechteBestaetigt); return `${r.name} ist jetzt auf Version ${r.version}.`; }
            const r = await api.paketInstallieren({ id, version: vorschau.paket.version, quelle, bestaetigt: !offiziell || undefined, ...x });
            return `${r.name} ${r.version} ist installiert.`;
          })} />
      )}
      </>}
    </div>
  );
}

/** Paket mit Code (#338): läuft es, was ist zuletzt passiert, offene und aufgegebene Ereignisse. */
function LaeuferStand({ paket }: { paket: string }) {
  const [s, setS] = useState<PaketlaeuferStand | null | undefined>(undefined);
  const laden = useCallback(() => { api.paketLaeufer().then(setS, () => setS(null)); }, []);
  useEffect(() => { laden(); }, [laden]);
  const p = s?.pakete.find((x) => x.id === paket) ?? null;
  // Zustand passend zu dem, was der Läufer tut (#403); solange er startet, von selbst nachfragen.
  const stand = s ? laeuferZustandText({ zustand: s.zustand, absturz: s.absturz, paket: p }, datum) : null;
  useEffect(() => {
    if (!stand?.wartet) return;
    const uhr = setTimeout(laden, 2000);
    return () => clearTimeout(uhr);
  }, [s, stand?.wartet, laden]);
  if (s === undefined) return null;
  return (
    <>
      <h2 className="h3">Paket-Läufer</h2>
      {!s || !stand ? <p className="leise">Der Paket-Läufer läuft nicht.</p> : !p ? <p className="leise">{stand.text}</p> : (
        <>
          <dl className="eigenschaften">
            <dt>Stand</dt><dd>{stand.fehler ? <span className="fehlertext">{stand.text}</span> : stand.text}</dd>
            <dt>Dienstkonto</dt><dd>{p.dienstkonto ?? '–'}</dd>
            <dt>Aufrufe</dt><dd>{p.aufrufe}{p.fehlgeschlagen ? `, davon ${p.fehlgeschlagen} fehlgeschlagen` : ''}{p.dauerMs !== null ? ` · zuletzt ${Math.round(p.dauerMs / 100) / 10} s, ${p.speicherMB} MB` : ''}</dd>
            <dt>Ereignisse</dt><dd>{p.ereignisse.zugestellt} zugestellt · {p.ereignisse.offen} offen{p.ereignisse.aufgegeben ? <> · <strong>{p.ereignisse.aufgegeben} aufgegeben</strong></> : ''}</dd>
            <dt>Grenzen</dt><dd>{s.grenzen.speicherMB} MB Speicher, {s.grenzen.sekunden} s je Aufruf, {s.grenzen.parallel} gleichzeitig</dd>
          </dl>
          {p.letzte.length > 0 && <ul className="klein">{p.letzte.slice(0, 10).map((x) => <li key={x.zeit + x.art}>{datum(x.zeit)} · {x.art} · {x.ok ? 'ok' : <span className="fehlertext">{x.text}</span>}{x.ok && x.text ? ` – ${x.text}` : ''}</li>)}</ul>}
          {p.protokoll.length > 0 && <details className="klein"><summary>Ausgaben des Pakets</summary><ul>{p.protokoll.slice(0, 30).map((x, i) => <li key={i} className={x.stufe >= 2 ? 'fehlertext' : undefined}>{datum(x.zeit)} · {x.text}</li>)}</ul></details>}
          <button type="button" className="textknopf" onClick={laden}>Aktualisieren</button>
        </>
      )}
    </>
  );
}

/**
 * Vorschau mit Namen, Abhängigkeiten und Beispielen. Bei Paketen außerhalb des offiziellen
 * Katalogs (#189) eine deutliche Warnung, die man ausdrücklich bestätigen muss.
 * Auch im Einrichtungsassistenten und für Sammeldateien (#460, #461): je Paket ein Block, eigene Überschrift
 * und „Auslassen“ statt „Abbrechen“.
 */
export function VorschauBlock({ v, warnung, los, abbrechen, titel, abbrechenText = 'Abbrechen' }: {
  v: PaketVorschau; warnung: string | null; abbrechen(): void; titel?: string; abbrechenText?: string;
  los(x: { namen: Record<string, string>; sichtNamen: Record<string, string>; beispiele: boolean; mitAbhaengigkeiten: boolean; rechteBestaetigt?: boolean }): Promise<void>;
}) {
  const [namen, setNamen] = useState<Record<string, string>>(() => Object.fromEntries(v.typen.filter((t) => !t.vorhanden).map((t) => [t.schluessel, t.vorschlag ?? t.name])));
  const [sichtNamen, setSichtNamen] = useState<Record<string, string>>(() => Object.fromEntries(v.sichten.filter((s) => !s.vorhanden).map((s) => [s.schluessel, s.vorschlag ?? s.name])));
  const [beispiele, setBeispiele] = useState(false);
  const [mit, setMit] = useState(true);
  const [ok, setOk] = useState(false);
  const [rechteOk, setRechteOk] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const rechteFehlen = !!v.laeufer?.bestaetigen && !rechteOk;
  const fehlend = v.abhaengigkeiten.filter((a) => !a.installiert);
  const konflikt = v.typen.some((t) => !t.vorhanden && t.konflikt && (namen[t.schluessel] ?? '').trim().toLowerCase() === t.name.toLowerCase())
    || v.sichten.some((s) => !s.vorhanden && s.konflikt && (sichtNamen[s.schluessel] ?? '').trim().toLowerCase() === s.name.toLowerCase());
  const leer = Object.values(namen).some((n) => !n.trim()) || Object.values(sichtNamen).some((n) => !n.trim());
  return (
    <section className="blatt" aria-label="Vorschau">
      <h2 className="h3">{titel ?? (v.update ? `Update auf ${v.paket.version}` : `Vorschau: ${v.paket.name} ${v.paket.version}`)}</h2>
      {warnung && (
        <div className="hinweis warn" role="alert">
          <p><strong>Nicht vom DMS-Projekt geprüft.</strong> {warnung}. Installiere nur Pakete, deren Herkunft du kennst und der du vertraust.</p>
          <label className="haken"><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} /><span>Ich weiß, woher das Paket stammt, und installiere es auf eigene Verantwortung.</span></label>
        </div>
      )}
      {v.laeufer && (
        // Erst lesen, dann bestätigen (#449): Liste, darunter links der Haken – untereinander, auch am Handy.
        <div className={`hinweis stapel ${v.laeufer.bestaetigen ? 'warn' : 'info'}`} role={v.laeufer.bestaetigen ? 'alert' : undefined}>
          <p><strong>Das Paket enthält Code.</strong> Er läuft im Paket-Läufer des DMS, abgeschottet und mit einem eigenen Dienstkonto – nur mit diesen Rechten:</p>
          <ul>
            {v.laeufer.rechte.map((r) => (
              <li key={r.text}>
                {r.text} <Hilfe ort={r.hilfe} />
                {r.unter && <ul>{r.unter.map((u) => <li key={u.text}>{u.text} <Hilfe ort={u.hilfe} /></li>)}</ul>}
              </li>
            ))}
          </ul>
          {v.laeufer.bestaetigen
            ? <label className="haken"><input type="checkbox" checked={rechteOk} onChange={(e) => setRechteOk(e.target.checked)} /><span>{v.update ? 'Die Rechte haben sich geändert. Ich erlaube sie.' : 'Ich erlaube dem Paket diese Rechte.'}</span></label>
            : <p className="leise">Die Rechte sind dieselben wie bisher.</p>}
          {/* Dienst-Adresse (#444): Hinweis auf die Vertrauensbeziehung schon bei der Installation. */}
          {v.laeufer.rechte.some((r) => r.hilfe === 'pakete.recht.adresse') && <p>{tx('fragen.adresse.installation')}</p>}
        </div>
      )}
      {v.probleme.length > 0 && <div className="hinweis schlecht"><ul>{v.probleme.map((p) => <li key={p}>{p}</li>)}</ul></div>}
      {v.hinweise?.length > 0 && <div className="hinweis info"><ul>{v.hinweise.map((p) => <li key={p}>{p}</li>)}</ul></div>}
      {v.einstellungen && (v.einstellungen.neu.length > 0 || v.einstellungen.weg.length > 0) && (
        <div className="hinweis info"><p>Einstellungen:{v.update && v.einstellungen.neu.length > 0 && <> neu (mit Vorgabe) {v.einstellungen.neu.join(', ')}.</>}{!v.update && <> das Paket hat Einstellungen; Vorgaben werden gesetzt, Pflichtfelder füllst du danach im Bereich „Einstellungen“.</>}{v.einstellungen.weg.length > 0 && <> <strong>Fallen weg:</strong> {v.einstellungen.weg.join(', ')} – ihre Werte werden entfernt.</>}</p></div>
      )}
      {v.update
        ? <p className="leise">Ein Update ergänzt nur. Es löscht nichts und überschreibt nichts, was du selbst geändert hast.</p>
        : <p className="leise">Das wird angelegt. Gibt es einen Namen schon, wähle einen anderen.</p>}
      {v.typen.length > 0 && <h3>Mappentypen</h3>}
      <ul className="stapel">
        {v.typen.map((t) => (
          <li key={t.schluessel}>
            {t.vorhanden
              ? <span><strong>{t.name}</strong> – {t.neueFelder.length || t.neueRegister.length || t.erkennung?.length || t.formate?.length ? [t.neueFelder.length || t.neueRegister.length ? `neu: ${[...t.neueFelder.map((f) => `Feld „${f}“`), ...t.neueRegister.map((r) => `Register „${r}“`)].join(', ')}` : '', t.erkennung?.length ? `für die Erkennung: ${t.erkennung.map((f) => `„${f}“`).join(', ')}` : '', t.formate?.length ? tx('felder.paket.formate', { felder: t.formate.map((f) => `„${f}“`).join(', ') }) : ''].filter(Boolean).join('; ') : 'keine Änderung'}</span>
              : t.geloescht ? <span className="leise">{t.name}: hast du gelöscht – bleibt weg.</span>
              : <label className="paketname"><span>{t.felder} Felder, Kennung <code>{t.dmsSchluessel}</code></span>
                  <input value={namen[t.schluessel] ?? t.name} aria-label={`Name für ${t.name}`} onChange={(e) => setNamen({ ...namen, [t.schluessel]: e.target.value })} />
                  {t.konflikt && (namen[t.schluessel] ?? '').trim().toLowerCase() === t.name.toLowerCase() && <span className="fehlertext klein">{t.konflikt}</span>}
                </label>}
            {/* Text → Verweis (#534): Das Update ändert vorhandene Angaben nicht; umgewandelt wird danach mit Vorschau. */}
            {t.vorhanden && t.umwandeln?.filter((u) => u.anzahl > 0).map((u) => <p key={u.feld} className="leise klein">{tx('pakete.update.umwandeln', { feld: u.feld, aus: u.aus, anzahl: u.anzahl })}</p>)}
          </li>
        ))}
      </ul>
      {v.sichten.length > 0 && <h3>Ansichten</h3>}
      <ul className="stapel">
        {v.sichten.map((s) => (
          <li key={s.schluessel}>
            {s.vorhanden ? <span className="leise">{s.name} – vorhanden</span>
              : <label className="paketname"><span>{s.eltern ? `unter „${v.sichten.find((x) => x.schluessel === s.eltern)?.name ?? s.eltern}“` : 'oberste Ebene'}</span>
                  <input value={sichtNamen[s.schluessel] ?? s.name} aria-label={`Name für Ansicht ${s.name}`} onChange={(e) => setSichtNamen({ ...sichtNamen, [s.schluessel]: e.target.value })} />
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
        <button type="button" className="knopf primaer" disabled={laeuft || v.probleme.length > 0 || konflikt || leer || (!!warnung && !ok) || rechteFehlen}
          onClick={() => { setLaeuft(true); void los({ namen, sichtNamen, beispiele, mitAbhaengigkeiten: mit, ...(rechteOk ? { rechteBestaetigt: true } : {}) }).finally(() => setLaeuft(false)); }}>
          {laeuft ? (v.update ? 'Aktualisiere …' : 'Installiere …') : v.update ? 'Aktualisieren' : 'Installieren'}
        </button>
        <button type="button" className="textknopf" onClick={abbrechen}>{abbrechenText}</button>
      </div>
    </section>
  );
}
