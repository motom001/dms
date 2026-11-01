import { useEffect, useState } from 'react';
import { auswahlMitAbhaengigkeiten, dmsPasst, herkunftText, KATALOG_SEITE, vergleicheVersion, type InstalliertesPaket, type Katalog, type KatalogPaket, type KatalogVersion, type RechtePunkt } from '../../../shared/src/pakete';
import { api, ApiFehler, type PaketVorschau, type Sammeldatei, type SammelPaket } from '../api';
import { Hilfe } from '../Hilfe';
import { alsMeldung, MeldungBox, VorschauBlock, type Meldung } from './Pakete';

/**
 * Pakete dazuholen (#460): Auswahl aus dem offiziellen Katalog mit Abhängigkeiten, danach Paket für Paket
 * installieren – jedes mit seiner eigenen Vorschau und, bei Code, seiner eigenen Rechte-Bestätigung (#449).
 * Keine Sammelbestätigung. Der Katalog wird erst abgefragt, wenn diese Ansicht erscheint.
 */

/** Ein Paket, das nacheinander installiert wird: Vorschau holen, installieren. */
export interface Schritt {
  schluessel: string; name: string; version: string;
  /** Kommt als Abhängigkeit mit (für die Überschrift). */
  fuer?: string[];
  vorschau(): Promise<PaketVorschau>;
  installieren(x: { namen: Record<string, string>; sichtNamen: Record<string, string>; beispiele: boolean; mitAbhaengigkeiten: boolean; rechteBestaetigt?: boolean }): Promise<InstalliertesPaket>;
}
export type Ergebnis = { schluessel: string; name: string; version: string; art: 'installiert' | 'ausgelassen' };

/** Vorgewählt (#460): ohne Texterkennung werden gescannte Dokumente nicht durchsuchbar (#458). */
export const VORAUSWAHL = ['texterkennung'];

/** Paket für Paket installieren; danach fertig(ergebnisse). */
export function Nacheinander({ schritte, warnung, fertig }: { schritte: Schritt[]; warnung?: string | null; fertig(e: Ergebnis[]): void }) {
  const [i, setI] = useState(0);
  const [ergebnisse, setErgebnisse] = useState<Ergebnis[]>([]);
  const [vorschau, setVorschau] = useState<PaketVorschau | null>(null);
  const [meldung, setMeldung] = useState<Meldung>();
  const [laden, setLaden] = useState(0);
  const s = schritte[i];
  useEffect(() => {
    if (!s) return;
    let aktuell = true;
    setVorschau(null); setMeldung(undefined);
    s.vorschau().then((v) => aktuell && setVorschau(v), (e) => aktuell && setMeldung(alsMeldung(e)));
    return () => { aktuell = false; };
    // Je Paket (i) bzw. nach „Nochmal versuchen“ neu – nicht bei jedem Neuzeichnen der Liste.
  }, [i, laden]);
  const naechster = (e: Ergebnis) => {
    const alle = [...ergebnisse, e];
    setErgebnisse(alle);
    if (i + 1 >= schritte.length) fertig(alle); else setI(i + 1);
  };
  if (!s) return null;
  const auslassen = () => naechster({ schluessel: s.schluessel, name: s.name, version: s.version, art: 'ausgelassen' });
  return (
    <div className="stapel">
      <ol className="pd-fortschritt" aria-label="Pakete">
        {schritte.map((x, j) => {
          const e = ergebnisse[j];
          return <li key={x.schluessel} className={j === i ? 'aktiv' : e ? e.art : ''} aria-current={j === i ? 'step' : undefined}>{x.name} {x.version}{e && <span className="leise"> – {e.art}</span>}</li>;
        })}
      </ol>
      <MeldungBox m={meldung} />
      {!vorschau && !meldung && <p className="leise">Prüfe „{s.name}“ {s.version} …</p>}
      {!vorschau && meldung && (
        <div className="knoepfe"><button type="button" className="knopf" onClick={() => setLaden((n) => n + 1)}>Nochmal versuchen</button><button type="button" className="textknopf" onClick={auslassen}>Auslassen</button></div>
      )}
      {vorschau && (
        <VorschauBlock key={s.schluessel} v={vorschau} warnung={warnung ?? null} abbrechenText="Auslassen" abbrechen={auslassen}
          titel={`Paket ${i + 1} von ${schritte.length}: ${vorschau.paket.name} ${vorschau.paket.version}${s.fuer?.length ? ` (gebraucht von ${s.fuer.join(', ')})` : ''}`}
          los={async (x) => {
            setMeldung(undefined);
            try { const r = await s.installieren(x); naechster({ schluessel: s.schluessel, name: r.name, version: r.version, art: 'installiert' }); }
            catch (e) { setMeldung(alsMeldung(e)); }
          }} />
      )}
    </div>
  );
}

/** Ergebnis lesbar: „Installiert: … · Ausgelassen: …“. */
export function ErgebnisListe({ e }: { e: Ergebnis[] }) {
  const inst = e.filter((x) => x.art === 'installiert'), aus = e.filter((x) => x.art === 'ausgelassen');
  return (
    <div className={`hinweis ${inst.length ? 'gut' : 'info'}`} role="status">
      {inst.length > 0 && <p><strong>Installiert:</strong> {inst.map((x) => `${x.name} ${x.version}`).join(', ')}.</p>}
      {aus.length > 0 && <p>Ausgelassen: {aus.map((x) => x.name).join(', ')}. Das holst du jederzeit unter Werkbank → Pakete nach.</p>}
      {!e.length && <p>Keine Pakete installiert.</p>}
    </div>
  );
}

/** Neueste Version eines Katalogpakets, die zu dieser DMS-Version passt. */
const passende = (p: KatalogPaket, dms: string): KatalogVersion | undefined =>
  [...p.versionen].sort((a, b) => vergleicheVersion(b.version, a.version)).find((v) => dmsPasst(dms, v.dms));

/** Rechte eines Pakets mit Code – erst auf Wunsch geladen (dafür holt das DMS das Paket aus dem Katalog). */
function RechteAufWunsch({ id, version }: { id: string; version: string }) {
  const [rechte, setRechte] = useState<RechtePunkt[] | null>(null);
  const [fehler, setFehler] = useState<string>();
  const [offen, setOffen] = useState(false);
  useEffect(() => {
    if (!offen || rechte || fehler) return;
    api.paketVorschau({ id, version }).then((v) => setRechte(v.laeufer?.rechte ?? []), (e) => setFehler((e as Error).message));
  }, [offen, id, version, rechte, fehler]);
  return (
    <details className="pd-rechte" onToggle={(e) => setOffen((e.target as HTMLDetailsElement).open)}>
      <summary className="klein">Was darf das Paket?</summary>
      {fehler ? <p className="fehlertext klein">{fehler}</p> : !rechte ? <p className="leise klein">Lade …</p> : (
        <ul className="klein">{rechte.map((r) => <li key={r.text}>{r.text} <Hilfe ort={r.hilfe} />{r.unter && <ul>{r.unter.map((u) => <li key={u.text}>{u.text}</li>)}</ul>}</li>)}</ul>
      )}
    </details>
  );
}

/**
 * Auswahl aus dem offiziellen Katalog und Installation, z. B. im Einrichtungsassistenten (#460).
 * Ist der Katalog nicht erreichbar: Sammeldatei hochladen (#461) oder überspringen.
 */
export function PaketeDazuholen({ weiter, ueberspringen, geaendert }: {
  weiter(e: Ergebnis[]): void; ueberspringen(): void;
  /** Nach jeder Installation (z. B. Daten neu laden). */
  geaendert?(): void;
}) {
  const [stand, setStand] = useState<{ dms: string; installiert: InstalliertesPaket[] } | null>(null);
  const [katalog, setKatalog] = useState<Katalog | null>(null);
  const [fehler, setFehler] = useState<string>();
  const [versuch, setVersuch] = useState(0);
  const [gewaehlt, setGewaehlt] = useState<string[] | null>(null);
  const [phase, setPhase] = useState<'auswahl' | 'installieren' | 'fertig'>('auswahl');
  const [ergebnisse, setErgebnisse] = useState<Ergebnis[]>([]);
  const [sammel, setSammel] = useState<{ s: Sammeldatei; datei: string } | null>(null);
  useEffect(() => {
    let aktuell = true;
    setFehler(undefined); setKatalog(null);
    void (async () => {
      try {
        const st = await api.pakete();
        if (!aktuell) return;
        setStand({ dms: st.dms, installiert: st.installiert });
        // Nur der offizielle Katalog – und erst jetzt, weil der Schritt angezeigt wird (keine Verbindung ohne Anlass).
        const k = (await api.paketKatalog(false)).kataloge.find((x) => x.offiziell);
        if (!aktuell) return;
        if (!k?.katalog) throw new Error(k?.fehler ?? 'Der Katalog lässt sich nicht abrufen.');
        setKatalog(k.katalog);
      } catch (e) { if (aktuell) setFehler((e as Error).message); }
    })();
    return () => { aktuell = false; };
  }, [versuch]);

  if (phase === 'fertig') return (
    <>
      <ErgebnisListe e={ergebnisse} />
      <div className="knoepfe"><button type="button" className="knopf primaer" onClick={() => weiter(ergebnisse)}>Weiter</button></div>
    </>
  );
  if (sammel && stand) return (
    // Die Ansicht zeigt das Ergebnis schon selbst – „Weiter“ dort führt direkt zum nächsten Schritt.
    <SammeldateiAnsicht s={sammel.s} datei={sammel.datei} dms={stand.dms} geaendert={geaendert} abbrechen={() => setSammel(null)} fertig={weiter} />
  );
  if (fehler) return (
    <>
      <div className="hinweis warn" role="status">
        <p><strong>Der Paketkatalog ist gerade nicht erreichbar.</strong> Ohne Internet fehlen die Pakete – etwa die Texterkennung, ohne die gescannte Dokumente nicht durchsuchbar sind.</p>
        <p className="leise klein">{fehler}</p>
      </div>
      <section className="stapel" aria-label="Ohne Internet">
        <h2 className="h3">Ohne Internet: Sammeldatei hochladen</h2>
        <p className="leise">Stell die Pakete an einem Gerät mit Internet auf der <a className="verweis" href={sammelSeite(stand?.dms ?? '')} target="_blank" rel="noreferrer">Katalog-Webseite ↗</a> zusammen (die Texterkennung ist dort vorausgewählt) und lade die heruntergeladene Datei hier hoch. Oder überspring den Schritt und hol die Pakete später unter Werkbank → Pakete. <Hilfe ort="werkbank.pakete.sammeldatei" /></p>
        {stand && <SammeldateiWahl geladen={(x, datei) => setSammel({ s: x, datei })} />}
      </section>
      <div className="knoepfe">
        <button type="button" className="knopf" onClick={ueberspringen}>Überspringen</button>
        <button type="button" className="knopf" onClick={() => setVersuch((n) => n + 1)}>Nochmal versuchen</button>
      </div>
    </>
  );
  if (!katalog || !stand) return <p className="leise">Frage den offiziellen Paketkatalog ab …</p>;

  const dms = stand.dms;
  const da = (id: string) => stand.installiert.some((p) => p.id === id);
  // Empfohlene (Texterkennung) oben, sonst wie im Katalog nach Namen.
  const angebot = katalog.pakete.filter((p) => !da(p.id)).sort((a, b) => Number(VORAUSWAHL.includes(b.id)) - Number(VORAUSWAHL.includes(a.id)));
  // Vorauswahl: Texterkennung, wenn sie hier passt und noch fehlt.
  const wahl = gewaehlt ?? VORAUSWAHL.filter((id) => { const p = angebot.find((x) => x.id === id); return p && passende(p, dms); });
  const plan = auswahlMitAbhaengigkeiten(katalog, wahl, dms, stand.installiert);
  const schalten = (id: string, an: boolean) => setGewaehlt(an ? [...wahl, id] : wahl.filter((x) => x !== id));
  const name = (id: string) => katalog.pakete.find((p) => p.id === id)?.name ?? id;

  if (phase === 'installieren') return (
    <Nacheinander
      schritte={plan.pakete.map((p): Schritt => ({
        schluessel: p.id, name: p.name, version: p.version, fuer: p.gewaehlt ? undefined : p.fuer.map(name),
        vorschau: () => api.paketVorschau({ id: p.id, version: p.version }),
        installieren: async (x) => { const r = await api.paketInstallieren({ id: p.id, version: p.version, ...x }); geaendert?.(); return r; },
      }))}
      fertig={(e) => { setErgebnisse(e); setPhase('fertig'); }} />
  );
  return (
    <>
      {!angebot.length ? <p className="leise">Alle Pakete des Katalogs sind schon installiert.</p> : (
        <ul className="pd-liste" aria-label="Pakete im Katalog">
          {angebot.map((p) => {
            const v = passende(p, dms);
            const imPlan = plan.pakete.find((x) => x.id === p.id);
            const mit = !!imPlan && !imPlan.gewaehlt;
            const an = wahl.includes(p.id) || mit;
            const zeigen = v ?? p.versionen[0];
            return (
              <li key={p.id} className={an ? 'an' : undefined}>
                <label className="haken">
                  <input type="checkbox" checked={an} disabled={!v || mit} onChange={(e) => schalten(p.id, e.target.checked)} aria-describedby={`pd-${p.id}`} />
                  <span>
                    <span><strong>{p.name}</strong> <span className="leise klein">{zeigen.version}</span>
                      {VORAUSWAHL.includes(p.id) && v && <> <span className="chip gut">empfohlen</span></>}
                      {mit && <> <span className="chip">kommt mit – gebraucht von {imPlan!.fuer.map(name).join(', ')}</span></>}</span>
                    <span className="klein">{p.beschreibung}</span>
                  </span>
                </label>
                <div className="pd-darf klein leise" id={`pd-${p.id}`}>
                  {!v ? <span className="fehlertext">Braucht DMS {p.versionen[0].dms} – dieses DMS hat {dms}.</span>
                    : zeigen.code ? <>Enthält Code: läuft abgeschottet im Paket-Läufer mit eigenen Rechten. Die zeigt dir die Installation, und du bestätigst sie für dieses Paket einzeln.</>
                    : <>Kein Code – legt nur an: {[zeigen.inhalt.mappentypen.length ? `Mappentypen ${zeigen.inhalt.mappentypen.map((t) => t.name).join(', ')}` : '', zeigen.inhalt.sichten.length ? `Ansichten ${zeigen.inhalt.sichten.map((t) => t.name).join(', ')}` : ''].filter(Boolean).join(' · ') || 'Einstellungen'}.</>}
                  {VORAUSWAHL.includes(p.id) && v && <> Vorausgewählt, weil gescannte Dokumente sonst nicht durchsuchbar sind.</>}
                </div>
                {v?.code && <RechteAufWunsch id={p.id} version={v.version} />}
              </li>
            );
          })}
        </ul>
      )}
      {plan.probleme.length > 0 && <div className="hinweis warn"><ul>{plan.probleme.map((p) => <li key={p}>{p}</li>)}</ul></div>}
      <p className="leise klein">Abhängigkeiten kommen automatisch mit. Jedes Paket zeigt vor der Installation, was es anlegt; Pakete mit Code fragen einzeln nach ihren Rechten.</p>
      <div className="knoepfe">
        <button type="button" className="knopf" onClick={ueberspringen}>Überspringen</button>
        <button type="button" className="knopf primaer" disabled={!plan.pakete.length} onClick={() => setPhase('installieren')}>
          {plan.pakete.length ? `${plan.pakete.length} ${plan.pakete.length === 1 ? 'Paket' : 'Pakete'} installieren …` : 'Pakete installieren …'}
        </button>
      </div>
    </>
  );
}

/* ---------- Sammeldatei (#461) ---------- */

/** Adresse der Katalog-Webseite zum Zusammenstellen einer Sammeldatei – mit der Version dieses DMS. */
export const sammelSeite = (dms: string) => `${KATALOG_SEITE}sammeldatei.html${/^\d+\.\d+\.\d+$/.test(dms) ? `?dms=${encodeURIComponent(dms)}` : ''}`;

/** Datei wählen und hochladen: eine Sammeldatei (oder ein einzelnes Paket, falls gewollt). */
export function SammeldateiWahl({ geladen, einzeln }: { geladen(s: Sammeldatei, datei: string): void; einzeln?(r: { upload: string; vorschau: PaketVorschau }, datei: string): void }) {
  const [fehler, setFehler] = useState<string>();
  const [laedt, setLaedt] = useState(false);
  async function hochladen(f: File | undefined) {
    if (!f) return;
    setFehler(undefined); setLaedt(true);
    try {
      const r = await api.paketHochladen(f);
      if ('sammeldatei' in r) geladen(r.sammeldatei, f.name);
      else if (einzeln) einzeln(r, f.name);
      else setFehler('Das ist ein einzelnes Paket, keine Sammeldatei. Einzelne Pakete lädst du unter Werkbank → Pakete → Expertenmodus hoch.');
    } catch (e) { setFehler([(e as Error).message, ...(e instanceof ApiFehler ? e.gruende : [])].join(' ')); }
    finally { setLaedt(false); }
  }
  return (
    <div className="stapel">
      <label className="pd-datei">
        <span className="knopf">{laedt ? 'Prüfe …' : 'Sammeldatei wählen …'}</span>
        <input type="file" accept=".zip,application/zip" disabled={laedt} aria-label="Sammeldatei (.zip) hochladen" onChange={(e) => { void hochladen(e.target.files?.[0]); e.target.value = ''; }} />
      </label>
      {fehler && <p className="fehlertext klein" role="alert">{fehler}</p>}
    </div>
  );
}

/** Was mit einem Paket der Sammeldatei passiert. */
function sammelStand(p: SammelPaket): { text: string; chip: 'gut' | 'warn' | '' ; installierbar: boolean } {
  if (p.stand === 'gleich') return { text: `schon installiert (${p.installiert})`, chip: '', installierbar: false };
  if (p.stand === 'aelter') return { text: `älter als installiert (${p.installiert})`, chip: '', installierbar: false };
  if (!p.vorschau.dmsOk) return { text: `braucht DMS ${p.vorschau.paket.dms}`, chip: 'warn', installierbar: false };
  if (p.stand === 'neuer' && p.vorschau.herkunft?.art === 'katalog') return { text: `Update von ${p.installiert} – stammt aus dem Katalog, Updates nur von dort`, chip: 'warn', installierbar: false };
  if (p.stand === 'neuer') return { text: `Update von ${p.installiert}`, chip: 'gut', installierbar: true };
  return { text: 'neu', chip: 'gut', installierbar: true };
}

/**
 * Inhalt einer Sammeldatei zeigen und nacheinander installieren (#461). Die Prüfsummen hat der Server schon
 * geprüft; die Herkunft bestätigst du einmal für die Datei, die Rechte je Paket mit Code.
 */
export function SammeldateiAnsicht({ s, datei, dms, fertig, abbrechen, geaendert }: {
  s: Sammeldatei; datei: string; dms: string; fertig(e: Ergebnis[]): void; abbrechen(): void; geaendert?(): void;
}) {
  const [herkunftOk, setHerkunftOk] = useState(false);
  const [phase, setPhase] = useState<'inhalt' | 'installieren' | 'fertig'>('inhalt');
  const [ergebnisse, setErgebnisse] = useState<Ergebnis[]>([]);
  const zuInstallieren = s.pakete.filter((p) => sammelStand(p).installierbar);
  const abgeglichen = s.pakete.every((p) => p.katalog === 'gleich');
  const name = (id: string) => s.pakete.find((p) => p.id === id)?.name ?? id;
  const datum = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? iso || '–' : d.toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }); };

  if (phase === 'installieren') return (
    <Nacheinander
      schritte={zuInstallieren.map((p): Schritt => ({
        schluessel: p.upload, name: p.name, version: p.version, fuer: p.gewaehlt ? undefined : s.pakete.filter((x) => p.id in x.abhaengigkeiten).map((x) => x.name),
        vorschau: () => api.paketVorschau({ upload: p.upload }),
        installieren: async (x) => { const r = await api.paketInstallieren({ upload: p.upload, bestaetigt: true, ...x, mitAbhaengigkeiten: false }); geaendert?.(); return r; },
      }))}
      fertig={(e) => { setErgebnisse(e); setPhase('fertig'); }} />
  );
  if (phase === 'fertig') return (
    <>
      <ErgebnisListe e={ergebnisse} />
      <div className="knoepfe"><button type="button" className="knopf primaer" onClick={() => fertig(ergebnisse)}>Weiter</button></div>
    </>
  );
  return (
    <section className="blatt stapel" aria-label="Sammeldatei">
      <h2 className="h3">Sammeldatei „{datei}“</h2>
      <dl className="eigenschaften">
        <dt>Zusammengestellt</dt><dd>{datum(s.datei.erstellt)}{s.datei.dms ? ` für DMS ${s.datei.dms}` : ''} (dieses DMS: {dms})</dd>
        <dt>Prüfwert der Datei</dt><dd><code className="pd-pruefwert" title={s.datei.sha256}>SHA-256 {s.datei.sha256}</code></dd>
      </dl>
      <div className="hinweis gut klein"><p><strong>Geprüft:</strong> Jedes Archiv hat genau die Größe und Prüfsumme aus dem Verzeichnis der Sammeldatei, jedes Paket ist gültig, und es liegt nichts anderes darin.
        {abgeglichen ? ' Alle Prüfsummen stimmen außerdem mit dem offiziellen Katalog überein.' : ' Mit dem offiziellen Katalog konnte das DMS sie nicht abgleichen (nicht abgerufen oder ohne Internet).'}</p></div>
      <ul className="pd-liste" aria-label="Pakete in der Sammeldatei">
        {s.pakete.map((p) => {
          const st = sammelStand(p);
          const fuer = s.pakete.filter((x) => p.id in x.abhaengigkeiten).map((x) => x.name);
          return (
            <li key={p.upload} className={st.installierbar ? 'an' : undefined}>
              <span><strong>{p.name}</strong> <span className="leise klein">{p.version}</span> <span className={`chip ${st.chip}`}>{st.text}</span>
                {p.vorschau.laeufer && <> <span className="chip">mit Code</span></>}</span>
              <div className="klein leise">{p.vorschau.paket.beschreibung}</div>
              {(!p.gewaehlt || fuer.length > 0) && <div className="klein leise">{!p.gewaehlt ? 'Als Abhängigkeit dabei' : 'Gebraucht'}{fuer.length ? ` – gebraucht von ${fuer.join(', ')}` : ''}.</div>}
              {Object.keys(p.abhaengigkeiten).length > 0 && <div className="klein leise">Braucht: {Object.entries(p.abhaengigkeiten).map(([k, b]) => `${name(k)} ${b}`).join(', ')}</div>}
              {p.vorschau.herkunft && p.stand !== 'neu' && <div className="klein leise">Installiert: {herkunftText(p.vorschau.herkunft)}</div>}
            </li>
          );
        })}
      </ul>
      {zuInstallieren.length > 0 ? (
        <div className="hinweis warn" role="alert">
          <p><strong>Nicht über das Internet vom DMS-Projekt bestätigt.</strong> Die Prüfsummen zeigen, dass die Datei vollständig und seit dem Zusammenstellen unverändert ist – nicht, wer sie zusammengestellt hat. Installiere nur eine Sammeldatei, die du selbst aus dem offiziellen Paketkatalog geladen hast oder deren Herkunft du kennst.</p>
          <label className="haken"><input type="checkbox" checked={herkunftOk} onChange={(e) => setHerkunftOk(e.target.checked)} /><span>Ich weiß, woher die Sammeldatei stammt, und installiere auf eigene Verantwortung.</span></label>
        </div>
      ) : <p className="leise">In dieser Sammeldatei ist nichts zu installieren.</p>}
      <p className="leise klein">Installiert wird Paket für Paket, Abhängigkeiten zuerst. Jedes zeigt vorher, was es anlegt; Pakete mit Code fragen einzeln nach ihren Rechten. Als Herkunft steht danach „hochgeladen von … am …“.</p>
      <div className="knoepfe">
        <button type="button" className="knopf primaer" disabled={!zuInstallieren.length || !herkunftOk} onClick={() => setPhase('installieren')}>
          {zuInstallieren.length ? `${zuInstallieren.length} ${zuInstallieren.length === 1 ? 'Paket' : 'Pakete'} nacheinander installieren …` : 'Installieren'}
        </button>
        <button type="button" className="textknopf" onClick={abbrechen}>Abbrechen</button>
      </div>
    </section>
  );
}
