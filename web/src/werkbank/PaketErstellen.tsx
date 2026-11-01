import { useEffect, useMemo, useRef, useState } from 'react';
import { Symbol } from '../Symbol';
import { BESCHREIBUNG_LAENGE, LIZENZEN, naechsteVersion, paketIdAus, type ErstellenStand, type PaketEntwurf, type PaketErstellenEingabe, type PaketPruefung } from '../../../shared/src/paketerstellung';
import { api, ApiFehler } from '../api';
import { Hilfe } from '../Hilfe';
import { geheZu } from '../ort';

/**
 * Werkbank → Pakete → Paket erstellen (#374): eigene Mappentypen und Ansichten als Paket im Format der
 * Registry, zum Mitnehmen in ein anderes DMS („Paket hochladen“ im Expertenmodus).
 * Prüfung und Erzeugung macht der Server; hier wird nur ausgewählt, angezeigt und heruntergeladen.
 */

const SCHRITTE = ['Auswählen', 'Prüfen', 'Angaben', 'Exportieren'] as const;
/** Probleme, die zu den Angaben gehören (Schritt 3), statt zur Auswahl. */
const istAngabe = (p: string) => /^(Id|Name|Version|Beschreibung|Autor|GitHub|Lizenz|DMS-Version):/.test(p);
const groesse = (b: number) => (b < 1024 ? `${b} Bytes` : `${(b / 1024).toLocaleString('de-DE', { maximumFractionDigits: 1 })} KB`);

export function PaketErstellen() {
  const [stand, setStand] = useState<ErstellenStand | null>(null);
  const [e, setE] = useState<PaketErstellenEingabe | null>(null);
  const [idAuto, setIdAuto] = useState(true);
  const [schritt, setSchritt] = useState(0);
  const [pruefung, setPruefung] = useState<PaketPruefung | null>(null);
  const [prueft, setPrueft] = useState(false);
  const [suche, setSuche] = useState('');
  const [fehler, setFehler] = useState<string>();
  const [fertig, setFertig] = useState<string>();
  const [sendet, setSendet] = useState(false);
  const lauf = useRef(0);

  useEffect(() => {
    api.paketErstellenStand().then((s) => { setStand(s); setE(s.vorschlag); setIdAuto(!s.vorschlag.id); }, (x) => setFehler((x as Error).message));
  }, []);

  // Automatische Prüfung bei jeder Änderung (kurz verzögert); die letzte Antwort gewinnt.
  useEffect(() => {
    if (!e) return;
    const nr = ++lauf.current;
    setPrueft(true);
    const t = setTimeout(() => {
      api.paketErstellenPruefen(e).then((p) => { if (nr === lauf.current) { setPruefung(p); setFehler(undefined); } }, (x) => { if (nr === lauf.current) setFehler((x as Error).message); })
        .finally(() => { if (nr === lauf.current) setPrueft(false); });
    }, 350);
    return () => clearTimeout(t);
  }, [e]);

  if (fehler && !stand) return <div className="leer"><p>{fehler}</p></div>;
  if (!stand || !e) return <div className="leer"><p>Lade …</p></div>;

  const setze = (x: Partial<PaketErstellenEingabe>) => { setFertig(undefined); setE({ ...e, ...x }); };
  const umschalten = (liste: 'typen' | 'sichten' | 'beispiele', id: string, an: boolean) => setze({ [liste]: an ? [...e[liste], id] : e[liste].filter((x) => x !== id) });
  const ausEntwurf = (x: PaketEntwurf) => { setIdAuto(false); setze({ ...x, version: naechsteVersion(x.version), dms: stand.vorschlag.dms, aenderungen: '' }); };

  const p = pruefung;
  const auswahlProbleme = p?.probleme.filter((x) => !istAngabe(x)) ?? [];
  const angabeProbleme = p?.probleme.filter(istAngabe) ?? [];

  async function exportieren() {
    if (!e) return;
    setSendet(true); setFehler(undefined); setFertig(undefined);
    try {
      const r = await api.paketExportieren(e);
      setFertig(`Gespeichert als „${r.name}“ (${groesse(r.bytes)}). Im anderen DMS: Werkbank → Pakete → Expertenmodus → Paket hochladen.`);
      setStand(await api.paketErstellenStand());
    } catch (x) { setFehler([(x as Error).message, ...(x instanceof ApiFehler ? x.gruende : [])].join(' ')); }
    finally { setSendet(false); }
  }

  return (
    <div className="einspaltig">
      <div className="mappenkopf">
        <p className="ueber">Werkbank · Pakete</p>
        <h1>Paket erstellen</h1>
        <p className="leise">Mach aus deinen eigenen Mappentypen und Ansichten ein Paket, das du in einem anderen DMS mit „Paket hochladen“ installierst. Mappen, Dokumente, Benutzer und Passwörter kommen nicht mit. <Hilfe ort="werkbank.pakete.erstellen" /></p>
      </div>
      <ol className="assistent-schritte" aria-label={`Schritt ${schritt + 1} von ${SCHRITTE.length}: ${SCHRITTE[schritt]}`}>
        {SCHRITTE.map((s, i) => (
          <li key={s} className={i < schritt ? 'erledigt' : i === schritt ? 'aktiv' : ''} aria-current={i === schritt ? 'step' : undefined}>
            <button type="button" className="textknopf" onClick={() => setSchritt(i)}><span className="nr" aria-hidden="true">{i < schritt ? <Symbol name="haken" /> : i + 1}</span><span className="name">{s}</span></button>
          </li>
        ))}
      </ol>

      {schritt === 0 && <Auswahl stand={stand} e={e} suche={suche} setSuche={setSuche} umschalten={umschalten} pruefung={p} />}

      {schritt === 1 && (
        <section className="blatt" aria-label="Prüfung">
          <h2 className="h3">Automatische Prüfung</h2>
          {!p ? <p className="leise">Prüfe …</p> : <>
            {auswahlProbleme.length > 0 && <div className="hinweis schlecht"><ul>{auswahlProbleme.map((x) => <li key={x}>{x}</li>)}</ul></div>}
            {p.fehlend.length > 0 && (
              <div className="hinweis warn">
                <p>Nicht gewählt, aber gebraucht:</p>
                <ul>{p.fehlend.map((f) => (
                  <li key={f.id}>{f.art === 'typ' ? 'Mappentyp' : 'Ansicht'} „{f.name}“ <span className="leise">({f.grund})</span> <button type="button" className="textknopf" onClick={() => umschalten(f.art === 'typ' ? 'typen' : 'sichten', f.id, true)}>Mit aufnehmen</button></li>
                ))}</ul>
              </div>
            )}
            {p.hinweise.length > 0 && <div className="hinweis info"><ul>{p.hinweise.map((x) => <li key={x}>{x}</li>)}</ul></div>}
            {!auswahlProbleme.length && !p.fehlend.length && <p className="gut">Die Auswahl passt.</p>}
            <Inhalt p={p} />
          </>}
        </section>
      )}

      {schritt === 2 && (
        <section className="blatt" aria-label="Angaben">
          <h2 className="h3">Angaben</h2>
          <div className="raster">
          {stand.entwuerfe.length > 0 && (
            <label className="eigenschaft breit"><span>Früher exportiert</span>
              <select value="" onChange={(x) => { const w = stand.entwuerfe.find((y) => y.id === x.target.value); if (w) ausEntwurf(w); }}>
                <option value="">– Angaben übernehmen –</option>
                {stand.entwuerfe.map((w) => <option key={w.id} value={w.id}>{w.name} ({w.id}) · {w.version} · {new Date(w.exportiert).toLocaleDateString('de-DE')}</option>)}
              </select>
              <small className="leise">Dieselbe Id mit höherer Version – dann aktualisiert das andere DMS das Paket.</small>
            </label>
          )}
          <label className="eigenschaft"><span>Name</span><input value={e.name} maxLength={60} onChange={(x) => setze({ name: x.target.value, ...(idAuto ? { id: paketIdAus(x.target.value) } : {}) })} /></label>
          <label className="eigenschaft"><span>Id</span><input value={e.id} maxLength={20} onChange={(x) => { setIdAuto(false); setze({ id: x.target.value }); }} />
            <small className="leise">Kleinbuchstaben, Ziffern und _, z. B. <code>vertraege_familie</code>. Bleibt bei jeder Version gleich.</small></label>
          <label className="eigenschaft"><span>Version</span><input value={e.version} onChange={(x) => setze({ version: x.target.value })} /></label>
          <label className="eigenschaft breit"><span>Beschreibung</span><textarea rows={3} value={e.beschreibung} maxLength={BESCHREIBUNG_LAENGE.max} onChange={(x) => setze({ beschreibung: x.target.value })} />
            <small className="leise">Ein, zwei Sätze: was das Paket bringt und für wen ({BESCHREIBUNG_LAENGE.min}–{BESCHREIBUNG_LAENGE.max} Zeichen). Daraus wird auch die README.</small></label>
          <label className="eigenschaft"><span>Autor</span><input value={e.autor.name} onChange={(x) => setze({ autor: { ...e.autor, name: x.target.value } })} /></label>
          <label className="eigenschaft"><span>GitHub-Name (optional)</span><input value={e.autor.github} onChange={(x) => setze({ autor: { ...e.autor, github: x.target.value } })} /></label>
          <label className="eigenschaft"><span>Lizenz</span>
            <select value={e.lizenz} onChange={(x) => setze({ lizenz: x.target.value })}>{LIZENZEN.map((l) => <option key={l} value={l}>{l}</option>)}</select>
            <small className="leise">Die Lizenzen der Registry; der volle Text kommt als LICENSE ins Paket. Im Zweifel MIT.</small></label>
          <label className="eigenschaft"><span>Nötige DMS-Version</span><input value={e.dms} onChange={(x) => setze({ dms: x.target.value })} />
            <small className="leise">Vorschlag: dieses DMS ({stand.dms}) oder neuer.</small></label>
          <label className="eigenschaft breit"><span>Was ist neu in dieser Version?</span><textarea rows={2} value={e.aenderungen} onChange={(x) => setze({ aenderungen: x.target.value })} placeholder="z. B. Feld Kundennummer am Vertrag" />
            <small className="leise">Steht im CHANGELOG; leer: „Erste Fassung.“ bzw. „Neue Version …“.</small></label>
          </div>
          {angabeProbleme.length > 0 && <div className="hinweis schlecht"><ul>{angabeProbleme.map((x) => <li key={x}>{x}</li>)}</ul></div>}
        </section>
      )}

      {schritt === 3 && (
        <section className="blatt" aria-label="Exportieren">
          <h2 className="h3">Exportieren</h2>
          {!p ? <p className="leise">Prüfe …</p> : p.einspielbar ? <>
            <div className="hinweis gut"><p>Das Paket hat dieselbe Prüfung bestanden wie beim Hochladen – es lässt sich so in einem anderen DMS installieren{Object.keys(p.abhaengigkeiten).length ? ', wenn dort die Abhängigkeiten installiert sind' : ''}.</p></div>
            <dl className="eigenschaften">
              <dt>Paket</dt><dd>{e.name} ({e.id}) · Version {e.version} · {e.lizenz}</dd>
              <dt>Datei</dt><dd>{p.datei?.name} · {groesse(p.datei?.bytes ?? 0)}</dd>
            </dl>
            <Inhalt p={p} />
          </> : <div className="hinweis schlecht"><p>So lässt sich das Paket noch nicht exportieren:</p><ul>{p.probleme.map((x) => <li key={x}>{x}</li>)}</ul></div>}
          {fertig && <div className="hinweis gut" role="status"><p>{fertig}</p></div>}
        </section>
      )}

      {fehler && <div className="hinweis schlecht" role="alert"><p>{fehler}</p></div>}

      <div className="speicherleiste">
        <button type="button" className="textknopf" onClick={() => geheZu('/werkbank/pakete')}>Abbrechen</button>
        <span className="status" role="status">{prueft ? 'Prüfe …' : p ? (p.einspielbar ? 'Bereit zum Export' : `${p.probleme.length} ${p.probleme.length === 1 ? 'Punkt' : 'Punkte'} offen`) : ''}</span>
        <div className="knoepfe">
          {schritt > 0 && <button type="button" className="knopf" onClick={() => setSchritt(schritt - 1)}>Zurück</button>}
          {schritt < SCHRITTE.length - 1
            ? <button type="button" className="knopf primaer" onClick={() => setSchritt(schritt + 1)}>Weiter</button>
            : <button type="button" className="knopf primaer" disabled={sendet || prueft || !p?.einspielbar} onClick={() => void exportieren()}>{sendet ? 'Erstelle …' : 'Als .zip exportieren'}</button>}
        </div>
      </div>
    </div>
  );
}

/** Schritt 1: Mappentypen, Ansichten und (optional) Beispiel-Mappen wählen. */
function Auswahl({ stand, e, suche, setSuche, umschalten, pruefung }: {
  stand: ErstellenStand; e: PaketErstellenEingabe; suche: string; setSuche(s: string): void; pruefung: PaketPruefung | null;
  umschalten(liste: 'typen' | 'sichten' | 'beispiele', id: string, an: boolean): void;
}) {
  const s = suche.trim().toLowerCase();
  const passt = (n: string) => !s || n.toLowerCase().includes(s);
  // Ansichten als Baum (eingerückt), Reihenfolge wie in der Ablage.
  const baum = useMemo(() => {
    const erg: Array<{ s: ErstellenStand['sichten'][number]; tiefe: number }> = [];
    const besuche = (eltern: string | null, tiefe: number, gesehen: Set<string>) => {
      for (const x of stand.sichten.filter((y) => y.elternId === eltern)) {
        if (gesehen.has(x.id)) continue;
        gesehen.add(x.id); erg.push({ s: x, tiefe }); besuche(x.id, tiefe + 1, gesehen);
      }
    };
    besuche(null, 0, new Set());
    return erg;
  }, [stand.sichten]);
  return (
    <>
      <div className="zeile"><input type="search" placeholder="Suchen …" aria-label="Mappentypen und Ansichten durchsuchen" value={suche} onChange={(x) => setSuche(x.target.value)} /></div>
      <section className="blatt" aria-label="Mappentypen">
        <h2 className="h3">Mappentypen</h2>
        <ul className="stapel">
          {stand.typen.filter((t) => passt(t.name)).map((t) => (
            <li key={t.id}><label className="haken"><input type="checkbox" checked={e.typen.includes(t.id)} onChange={(x) => umschalten('typen', t.id, x.target.checked)} />
              <span>{t.name}{t.paket && <> <span className="chip" title="Kommt beim Export als Abhängigkeit mit, nicht als Kopie">aus {t.paket.name} {t.paket.version}</span></>}{t.geaendert && <> <span className="chip warn" title="Nach der Installation des Pakets geändert">geändert</span></>}
                {t.beschreibung && <small className="leise">{t.beschreibung}</small>}</span></label></li>
          ))}
          {!stand.typen.length && <li className="leise">Keine Mappentypen.</li>}
        </ul>
      </section>
      <section className="blatt" aria-label="Ansichten">
        <h2 className="h3">Ansichten</h2>
        <ul className="stapel">
          {baum.filter(({ s: x }) => passt(x.name)).map(({ s: x, tiefe }) => (
            <li key={x.id} style={{ paddingLeft: `${s ? 0 : tiefe * 1.4}em` }}><label className="haken"><input type="checkbox" checked={e.sichten.includes(x.id)} onChange={(y) => umschalten('sichten', x.id, y.target.checked)} />
              <span>{x.name}{x.paket && <> <span className="chip">aus {x.paket.name}</span></>}</span></label></li>
          ))}
          {!stand.sichten.length && <li className="leise">Keine Ansichten.</li>}
        </ul>
      </section>
      <section className="blatt" aria-label="Beispiel-Mappen">
        <h2 className="h3">Beispiel-Mappen (optional)</h2>
        <p className="leise klein">Ohne Auswahl enthält das Paket keine Mappen. Wählst du Mappen, kommen ihre Feldwerte als Beispiele ins Paket – nimm nur Mappen mit erfundenen Daten, z. B. Demo-Mappen. Passwörter, Dokumente, Notizen und Verweise auf nicht gewählte Mappen bleiben draußen.</p>
        {!pruefung ? <p className="leise klein">Lade …</p> : !pruefung.beispielMappen.length ? <p className="leise klein">Wähle zuerst eigene Mappentypen.</p> : pruefung.beispielMappen.map((b) => (
          <details key={b.typId} open={b.mappen.some((m) => e.beispiele.includes(m.id))}>
            <summary>{b.typ} <span className="leise klein">({b.mappen.filter((m) => e.beispiele.includes(m.id)).length} von {b.mappen.length}{b.mehr ? '+' : ''} gewählt)</span></summary>
            <ul className="stapel">
              {b.mappen.filter((m) => passt(m.titel)).map((m) => (
                <li key={m.id}><label className="haken"><input type="checkbox" checked={e.beispiele.includes(m.id)} onChange={(x) => umschalten('beispiele', m.id, x.target.checked)} /><span>{m.titel}{m.demo && <> <span className="chip gut">Demo</span></>}</span></label></li>
              ))}
              {!b.mappen.length && <li className="leise klein">Keine Mappen.</li>}
            </ul>
          </details>
        ))}
      </section>
    </>
  );
}

/** Was ins Paket kommt („würde installieren …“). */
function Inhalt({ p }: { p: PaketPruefung }) {
  const abh = Object.entries(p.abhaengigkeiten);
  return (
    <dl className="eigenschaften">
      <dt>Mappentypen</dt><dd>{p.inhalt.typen.map((t) => t.name).join(', ') || '–'}</dd>
      <dt>Ansichten</dt><dd>{p.inhalt.sichten.map((s) => (s.eltern ? `${p.inhalt.sichten.find((x) => x.schluessel === s.eltern)?.name} → ${s.name}` : s.name)).join(', ') || '–'}</dd>
      <dt>Beispiele</dt><dd>{p.inhalt.beispiele || 'keine'}</dd>
      <dt>Abhängigkeiten</dt><dd>{abh.length ? abh.map(([k, v]) => `${k} ${v}`).join(', ') : 'keine'}</dd>
    </dl>
  );
}
