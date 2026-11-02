import { useEffect, useState, type ReactNode } from 'react';
import { auswahlMitAbhaengigkeiten, dmsPasst, vergleicheVersion, type InstalliertesPaket, type Katalog, type KatalogPaket, type KatalogVersion, type RechtePunkt } from '../../../shared/src/pakete';
import { api, type PaketVorschau } from '../api';
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
 * ohneKatalog: Inhalt, wenn der Katalog nicht erreichbar ist (z. B. Sammeldatei hochladen, #461).
 */
export function PaketeDazuholen({ weiter, ueberspringen, ohneKatalog, geaendert }: {
  weiter(e: Ergebnis[]): void; ueberspringen(): void; ohneKatalog?: ReactNode;
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

  if (fehler) return (
    <>
      <div className="hinweis warn" role="status">
        <p><strong>Der Paketkatalog ist gerade nicht erreichbar.</strong> Ohne Internet fehlen die Pakete – etwa die Texterkennung, ohne die gescannte Dokumente nicht durchsuchbar sind.</p>
        <p className="leise klein">{fehler}</p>
      </div>
      {ohneKatalog ?? <p className="leise">Du kannst Pakete später unter Werkbank → Pakete holen, sobald das DMS ins Internet kommt.</p>}
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
  if (phase === 'fertig') return (
    <>
      <ErgebnisListe e={ergebnisse} />
      <div className="knoepfe"><button type="button" className="knopf primaer" onClick={() => weiter(ergebnisse)}>Weiter</button></div>
    </>
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
