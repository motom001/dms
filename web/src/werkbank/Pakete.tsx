import { useCallback, useEffect, useState } from 'react';
import { herkunftText, vergleicheVersion, type InstalliertesPaket, type Katalog, type KatalogPaket } from '../../../shared/src/pakete';
import { api, ApiFehler, type PaketVorschau } from '../api';
import { useDaten } from '../daten';
import { Hilfe } from '../Hilfe';
import { geheZu, Link } from '../ort';

/**
 * Werkbank → Pakete (#188): Konfigurationspakete aus dem offiziellen Katalog.
 * Den Katalog fragt das DMS nur auf Knopfdruck ab, nie im Hintergrund.
 */

const datum = (iso: string | null) => (iso ? new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) : '–');

export function usePakete(offen: boolean) {
  const [stand, setStand] = useState<{ installiert: InstalliertesPaket[]; katalogUrl: string; dms: string } | null>(null);
  const [katalog, setKatalog] = useState<{ katalog: Katalog; abgerufen: string } | null>(null);
  const [updates, setUpdates] = useState<Array<{ id: string; installiert: string; neu: string; changelog: string | null }> | null>(null);
  const [fehler, setFehler] = useState<string>();
  const [laedt, setLaedt] = useState(false);
  const laden = useCallback(async () => { try { setStand(await api.pakete()); setFehler(undefined); } catch (e) { setFehler((e as Error).message); } }, []);
  useEffect(() => { if (offen) void laden(); }, [offen, laden]);
  const abrufen = useCallback(async () => {
    setLaedt(true); setFehler(undefined);
    try { const k = await api.paketKatalog(); setKatalog({ katalog: k.katalog, abgerufen: k.abgerufen }); } catch (e) { setFehler((e as Error).message); } finally { setLaedt(false); }
  }, []);
  const pruefen = useCallback(async () => {
    setLaedt(true); setFehler(undefined);
    try { setUpdates(await api.paketUpdates()); const k = await api.paketKatalog(); setKatalog({ katalog: k.katalog, abgerufen: k.abgerufen }); } catch (e) { setFehler((e as Error).message); } finally { setLaedt(false); }
  }, []);
  return { stand, katalog, updates, fehler, laedt, laden, abrufen, pruefen };
}
export type PaketeZustand = ReturnType<typeof usePakete>;

export function PaketeListe({ z, offen }: { z: PaketeZustand; offen?: string }) {
  const installiert = z.stand?.installiert ?? [];
  const verfuegbar = (z.katalog?.katalog.pakete ?? []).filter((p) => !installiert.some((i) => i.id === p.id));
  const neuer = (id: string) => z.updates?.find((u) => u.id === id);
  return (
    <>
      <div className="listenkopf">
        <div><h1>Pakete</h1><p className="leise klein">Fertige Mappentypen und Sichten aus dem offiziellen Katalog. <Hilfe ort="werkbank.pakete" /></p></div>
      </div>
      <div className="knoepfe">
        <button type="button" className="knopf klein" disabled={z.laedt} onClick={() => void z.abrufen()}>{z.laedt ? 'Frage ab …' : 'Katalog abrufen'}</button>
        {installiert.length > 0 && <button type="button" className="knopf klein" disabled={z.laedt} onClick={() => void z.pruefen()}>Auf neue Versionen prüfen</button>}
      </div>
      {z.fehler && <div className="hinweis schlecht"><p>{z.fehler}</p></div>}
      <h2 className="ueber">Installiert</h2>
      {!z.stand ? <p className="leise">Lade …</p> : !installiert.length ? <p className="leise leerliste">Noch keine Pakete installiert.</p> : (
        <ul className="mappenliste">
          {installiert.map((p) => (
            <li key={p.id}><Link to={`/werkbank/pakete/${p.id}`} className={`eintrag werk ${offen === p.id ? 'an' : ''}`}>
              <span className="titel">{p.name} {neuer(p.id) && <span className="chip warn" title="Neuere Version im Katalog">{neuer(p.id)!.neu}</span>}</span>
              <span className="unter">Version {p.version} · {herkunftText(p.herkunft)}</span>
            </Link></li>
          ))}
        </ul>
      )}
      <h2 className="ueber">Verfügbar</h2>
      {!z.katalog ? <p className="leise klein">Klicke „Katalog abrufen“, um die Pakete des offiziellen Katalogs zu sehen.</p>
        : !verfuegbar.length ? <p className="leise leerliste">Alle Pakete des Katalogs sind installiert.</p> : (
          <ul className="mappenliste">
            {verfuegbar.map((p) => (
              <li key={p.id}><Link to={`/werkbank/pakete/${p.id}`} className={`eintrag werk ${offen === p.id ? 'an' : ''}`}>
                <span className="titel">{p.name}</span>
                <span className="unter">{p.aktuell} · {p.beschreibung}</span>
              </Link></li>
            ))}
          </ul>
        )}
      {z.katalog && <p className="leise klein">Katalog abgerufen {datum(z.katalog.abgerufen)}.</p>}
    </>
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
  return <PaketDetail key={id} z={z} id={id} />;
}

function PaketDetail({ z, id }: { z: PaketeZustand; id: string }) {
  const d = useDaten();
  const inst = z.stand?.installiert.find((p) => p.id === id) ?? null;
  const kp: KatalogPaket | undefined = z.katalog?.katalog.pakete.find((p) => p.id === id);
  const [version, setVersion] = useState<string>('');
  const [vorschau, setVorschau] = useState<PaketVorschau | null>(null);
  const [namen, setNamen] = useState<Record<string, string>>({});
  const [sichtNamen, setSichtNamen] = useState<Record<string, string>>({});
  const [beispiele, setBeispiele] = useState(false);
  const [mit, setMit] = useState(true);
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string; gruende?: string[] }>();
  const v = kp?.versionen.find((x) => x.version === (version || kp.aktuell)) ?? kp?.versionen[0];
  const neuer = inst && kp && vergleicheVersion(kp.aktuell, inst.version) > 0 ? kp.aktuell : null;

  async function zeigeVorschau(ver?: string) {
    setMeldung(undefined); setLaeuft(true);
    try {
      const p = await api.paketVorschau(id, ver);
      setVorschau(p);
      setNamen(Object.fromEntries(p.typen.filter((t) => !t.vorhanden).map((t) => [t.schluessel, t.vorschlag ?? t.name])));
      setSichtNamen(Object.fromEntries(p.sichten.filter((s) => !s.vorhanden).map((s) => [s.schluessel, s.vorschlag ?? s.name])));
    } catch (e) { setMeldung({ art: 'schlecht', text: (e as Error).message, gruende: e instanceof ApiFehler ? e.gruende : [] }); }
    finally { setLaeuft(false); }
  }
  async function tu(f: () => Promise<string>) {
    setMeldung(undefined); setLaeuft(true);
    try { const t = await f(); setVorschau(null); await z.laden(); await d.neuLaden(); setMeldung({ art: 'gut', text: t }); }
    catch (e) { setMeldung({ art: 'schlecht', text: (e as Error).message, gruende: e instanceof ApiFehler ? e.gruende : [] }); }
    finally { setLaeuft(false); }
  }
  const installieren = () => tu(async () => {
    const r = await api.paketInstallieren({ id, version: vorschau!.paket.version, namen, sichtNamen, beispiele, mitAbhaengigkeiten: mit });
    return `${r.name} ${r.version} ist installiert.`;
  });
  const aktualisieren = () => tu(async () => { const r = await api.paketAktualisieren(id, vorschau!.paket.version); return `${r.name} ist jetzt auf Version ${r.version}.`; });
  const entfernen = () => {
    if (!inst || !confirm(`„${inst.name}“ entfernen? Seine Mappentypen und Sichten verschwinden. Das geht nur, solange es keine Mappen dieser Typen gibt.`)) return;
    void tu(async () => { await api.paketEntfernen(id); geheZu('/werkbank/pakete', true); return `${inst.name} ist entfernt.`; });
  };

  if (!inst && !kp) return <div className="leer"><p>{z.katalog ? 'Dieses Paket gibt es nicht (mehr).' : 'Lade …'}</p>{!z.katalog && <button type="button" className="knopf" onClick={() => void z.abrufen()}>Katalog abrufen</button>}</div>;
  const name = inst?.name ?? kp!.name;
  const fehlend = vorschau?.abhaengigkeiten.filter((a) => !a.installiert) ?? [];
  const konflikt = !!vorschau && [...vorschau.typen, ...vorschau.sichten].some((x) => !x.vorhanden && ('dmsSchluessel' in x ? namen[x.schluessel] : sichtNamen[x.schluessel])?.trim().toLowerCase() === x.name.toLowerCase() && x.konflikt);

  return (
    <div className="einspaltig">
      <div className="mappenkopf">
        <p className="ueber">Paket</p>
        <h1>{name}</h1>
        <p className="leise">{inst?.beschreibung ?? kp?.beschreibung}</p>
      </div>
      {meldung && <div className={`hinweis ${meldung.art}`} role="status"><p>{meldung.text}</p>{!!meldung.gruende?.length && <ul>{meldung.gruende.map((g) => <li key={g}>{g}</li>)}</ul>}</div>}

      <section className="blatt">
        <dl className="eigenschaften">
          {inst && <><dt>Installiert</dt><dd>Version {inst.version} · {datum(inst.installiert)}{inst.installiertVon ? ` von ${inst.installiertVon}` : ''}</dd></>}
          {inst?.aktualisiert && <><dt>Aktualisiert</dt><dd>{datum(inst.aktualisiert)}{inst.aktualisiertVon ? ` von ${inst.aktualisiertVon}` : ''}</dd></>}
          {inst && <><dt>Herkunft</dt><dd>{herkunftText(inst.herkunft)}</dd></>}
          {kp && <><dt>Im Katalog</dt><dd>Version {kp.aktuell}{neuer && <> · <strong>neuer als installiert</strong></>}</dd></>}
          <dt>Lizenz</dt><dd>{inst?.lizenz ?? kp?.lizenz}</dd>
          <dt>Autor</dt><dd>{(inst?.autor ?? kp?.autor)?.name}{(inst?.autor ?? kp?.autor)?.github && <> (<a className="verweis" href={`https://github.com/${(inst?.autor ?? kp?.autor)!.github}`} target="_blank" rel="noreferrer">@{(inst?.autor ?? kp?.autor)!.github}</a>)</>}</dd>
          {v && <><dt>Nötige DMS-Version</dt><dd>{v.dms} (dieses DMS: {z.stand?.dms})</dd></>}
          {v && <><dt>Abhängigkeiten</dt><dd>{Object.keys(v.abhaengigkeiten).length ? Object.entries(v.abhaengigkeiten).map(([k, b]) => `${k} ${b}`).join(', ') : 'keine'}</dd></>}
          {v && <><dt>Inhalt</dt><dd>Mappentypen: {v.inhalt.mappentypen.map((t) => t.name).join(', ') || '–'}<br />Sichten: {v.inhalt.sichten.map((s) => s.name).join(', ') || '–'}{v.inhalt.beispiele ? <><br />{v.inhalt.beispiele} Beispiel-Mappen (optional)</> : null}</dd></>}
          {(v?.readme || inst?.links?.readme) && <><dt>Mehr</dt><dd><a className="verweis" href={v?.readme ?? inst!.links!.readme} target="_blank" rel="noreferrer">README ↗</a>{(v?.changelog || inst?.links?.changelog) && <> · <a className="verweis" href={v?.changelog ?? inst!.links!.changelog} target="_blank" rel="noreferrer">Änderungen ↗</a></>}</dd></>}
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
          {inst && !kp && <button type="button" className="textknopf" onClick={() => void z.pruefen()}>Auf neue Versionen prüfen</button>}
        </div>
      </section>

      {vorschau && (
        <section className="blatt" aria-label="Vorschau">
          <h2 className="h3">{vorschau.update ? `Update auf ${vorschau.paket.version}` : `Vorschau: ${vorschau.paket.name} ${vorschau.paket.version}`}</h2>
          {vorschau.probleme.length > 0 && <div className="hinweis schlecht"><ul>{vorschau.probleme.map((p) => <li key={p}>{p}</li>)}</ul></div>}
          {vorschau.update
            ? <p className="leise">Ein Update ergänzt nur. Es löscht nichts und überschreibt nichts, was du selbst geändert hast.</p>
            : <p className="leise">Das wird angelegt. Gibt es einen Namen schon, wähle einen anderen.</p>}
          <h3>Mappentypen</h3>
          <ul className="stapel">
            {vorschau.typen.map((t) => (
              <li key={t.schluessel}>
                {t.vorhanden
                  ? <span><strong>{t.name}</strong> – {t.neueFelder.length || t.neueRegister.length ? `neu: ${[...t.neueFelder.map((f) => `Feld „${f}“`), ...t.neueRegister.map((r) => `Register „${r}“`)].join(', ')}` : 'keine Änderung'}</span>
                  : t.geloescht ? <span className="leise">{t.name}: hast du gelöscht – bleibt weg.</span>
                  : <label className="paketname"><span>{t.felder} Felder, Schlüssel <code>{t.dmsSchluessel}</code></span>
                      <input value={namen[t.schluessel] ?? t.name} aria-label={`Name für ${t.name}`} onChange={(e) => setNamen({ ...namen, [t.schluessel]: e.target.value })} />
                      {t.konflikt && (namen[t.schluessel] ?? t.name).trim().toLowerCase() === t.name.toLowerCase() && <span className="fehlertext klein">{t.konflikt}</span>}
                    </label>}
              </li>
            ))}
          </ul>
          <h3>Sichten</h3>
          <ul className="stapel">
            {vorschau.sichten.map((s) => (
              <li key={s.schluessel}>
                {s.vorhanden ? <span className="leise">{s.name} – vorhanden</span>
                  : <label className="paketname"><span>{s.eltern ? `unter „${vorschau.sichten.find((x) => x.schluessel === s.eltern)?.name ?? s.eltern}“` : 'oberste Ebene'}</span>
                      <input value={sichtNamen[s.schluessel] ?? s.name} aria-label={`Name für Sicht ${s.name}`} onChange={(e) => setSichtNamen({ ...sichtNamen, [s.schluessel]: e.target.value })} />
                      {s.konflikt && (sichtNamen[s.schluessel] ?? s.name).trim().toLowerCase() === s.name.toLowerCase() && <span className="fehlertext klein">{s.konflikt}</span>}
                    </label>}
              </li>
            ))}
          </ul>
          {vorschau.abhaengigkeiten.length > 0 && (
            <>
              <h3>Abhängigkeiten</h3>
              <ul className="klein">{vorschau.abhaengigkeiten.map((a) => <li key={a.id}>{a.id} {a.bereich}: {a.installiert ? `installiert (${a.installiert})${a.ok ? '' : ' – passt nicht'}` : a.verfuegbar ? `fehlt – im Katalog gibt es ${a.verfuegbar}` : 'fehlt und ist nicht im Katalog'}</li>)}</ul>
              {!vorschau.update && fehlend.length > 0 && <label className="haken"><input type="checkbox" checked={mit} onChange={(e) => setMit(e.target.checked)} /><span>Fehlende Pakete mitinstallieren</span></label>}
            </>
          )}
          {!vorschau.update && vorschau.beispiele > 0 && <label className="haken"><input type="checkbox" checked={beispiele} onChange={(e) => setBeispiele(e.target.checked)} /><span>{vorschau.beispiele} Beispiel-Mappen anlegen</span></label>}
          <div className="knoepfe">
            {vorschau.update
              ? <button type="button" className="knopf primaer" disabled={laeuft || vorschau.probleme.length > 0} onClick={() => void aktualisieren()}>{laeuft ? 'Aktualisiere …' : 'Aktualisieren'}</button>
              : <button type="button" className="knopf primaer" disabled={laeuft || vorschau.probleme.length > 0 || konflikt} onClick={() => void installieren()}>{laeuft ? 'Installiere …' : 'Installieren'}</button>}
            <button type="button" className="textknopf" onClick={() => setVorschau(null)}>Abbrechen</button>
          </div>
        </section>
      )}
    </div>
  );
}
