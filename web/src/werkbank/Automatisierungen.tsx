import { feldLabel, optionText } from '../../../shared/src/beschriftung';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AUTOMATISIERUNG_GRENZEN, automatisierungsProbleme, EREIGNIS_PERSON, PERSONEN_IM_EREIGNIS, kontextTyp, kurzform, platzhalterFuer, REIHENFOLGE, WENN_EREIGNISSE, WOCHENTAGE, zeitplanText,
  type AutomatisierungAnsicht, type AutomatisierungDaten, type DannKarte, type Empfaenger, type Fassung, type Fehlschlag, type Kontextdaten,
  type Lauf, type Schritt, type UndKarte, type WennKarte,
} from '../../../shared/src/automatisierung';
import { EREIGNISKATALOG, ereignisSchluessel, type Ereignisgruppe } from '../../../shared/src/ereignisse';
import { VORLAUF_EINHEITEN, WIEDERHOLUNGEN, type VorlaufEinheit } from '../../../shared/src/fristen';
import type { Mappentyp } from '../../../shared/src/model';
import { bedingungsfelder, beschreibeBedingung, OPERATOREN_JE_ART, type Bedingung, type Bedingungsfeld } from '../../../shared/src/sichten';
import { api, type Bezuege } from '../api';
import { MappenWahl } from '../ablage/MappeFormular';
import { Eintragsliste, type Listeneintrag } from '../ablage/Historie';
import { useDaten } from '../daten';
import { Listenkopf } from '../Listenkopf';
import { geheZu, Link, loeseWache } from '../ort';
import { rueckfrage } from '../rueckfrage';
import { t } from '../sprache';
import { Speicherleiste, useEntwurf } from '../Speicherleiste';
import { Ansage, umgestellt, useZiehen, ziehTasten } from '../ziehen';
import { FeldBedingung } from './Sichten';
import { gebietsschema } from '../../../shared/src/sprache';
import { Knopf, KnopfLink } from '../bausteine';

/**
 * Werkbank → Ablage aufbauen → Automatisierungen (#675): Mitte die Liste (Name, Kurzform, an/aus, letzter Lauf,
 * Herkunft; „nach Auslöser“ mit Reihenfolge zum Umsortieren), rechts der Editor mit Wenn · Und · Dann wie bei Homey –
 * Karten aus dem Vorrat hineinziehen oder mit „+ Karte“ per Tastatur hinzufügen, aufklappen zum Einstellen, zuklappen
 * zur Kurzzeile. Darunter Wiedergeben (auch trocken), der Verlauf mit Live-Fortschritt und der Änderungsverlauf.
 * Der Sonst-Zweig kommt mit Stufe 2 (#677) – gespeichert wird er schon, angezeigt noch nicht.
 */

type Stand = { automatisierungen: AutomatisierungAnsicht[]; fehlgeschlagen: number; fehlschlaege: Fehlschlag[]; kontext: Kontextdaten; umgezogen?: { am: string; anzahl: number } | null };

export function useAutomatisierungen(offen: boolean) {
  const [stand, setStand] = useState<Stand | null>(null);
  const [fehler, setFehler] = useState<string>();
  const laden = useCallback(async () => { try { setStand(await api.automatisierungen()); setFehler(undefined); } catch (e) { setFehler((e as Error).message); } }, []);
  useEffect(() => { if (offen) void laden(); }, [offen, laden]);
  // Liste aktuell halten (letzter Lauf, angehalten) – mehrere Server: einfach regelmäßig nachfragen.
  useEffect(() => { if (!offen) return; const z = setInterval(() => void laden(), 15_000); return () => clearInterval(z); }, [offen, laden]);
  return { stand, fehler, laden };
}
export type AutomatisierungenZustand = ReturnType<typeof useAutomatisierungen>;

/** Für die Leiste: angehaltene oder fehlerhafte Automatisierungen. */
export const automatisierungWarnungen = (s: Stand | null) => s?.automatisierungen.filter((a) => a.aktiv && (a.angehalten || a.probleme.length)).length ?? 0;

const ereignisName = (art: string) => (art === 'datum' ? t('automatisierung.wenn.datum') : art === 'zeitplan' ? t('automatisierung.wenn.zeitplan') : t.frei(`ereignisse.name.${ereignisSchluessel(art as never)}`));
const zeit = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString(gebietsschema(), { dateStyle: 'short', timeStyle: 'short' }) : '');
const ZUSTAND_ART: Record<string, string> = { abgeschlossen: 'gut', unzutreffend: 'leise', uebersprungen: 'leise', fehlgeschlagen: 'schlecht', laeuft: 'info', wiederholt: 'leise' };

function Zustandschip({ a }: { a: AutomatisierungAnsicht }) {
  if (a.aktiv && (a.angehalten || a.probleme.length)) return <span className="chip schlecht" title={a.angehalten?.text ?? a.probleme[0]}>{t('automatisierung.ui.angehalten')}</span>;
  return <span className={`chip ${a.aktiv ? 'gut' : ''}`}>{a.aktiv ? t('automatisierung.ui.an') : t('automatisierung.ui.aus')}</span>;
}

/* ---------- Liste ---------- */

export function AutomatisierungenListe({ z, offen }: { z: AutomatisierungenZustand; offen?: string }) {
  const [nachAusloeser, setNachAusloeser] = useState(false);
  const [suche, setSuche] = useState('');
  const [ansage, setAnsage] = useState('');
  const [fehler, setFehler] = useState<string>();
  const s = z.stand;
  // „Anzeigen“ beim Hinweis über fehlgeschlagene Läufe (#707): nur die betroffenen Automatisierungen.
  const [nurFehl, setNurFehl] = useState(false);
  const betroffen = new Set((s?.fehlschlaege ?? []).map((f) => f.automatisierungId));
  const liste = (s?.automatisierungen ?? []).filter((a) => (!nurFehl || betroffen.has(a.id)) && (!suche.trim() || `${a.name} ${a.kurz}`.toLowerCase().includes(suche.trim().toLowerCase())));
  const gruppen = useMemo(() => {
    const m = new Map<string, AutomatisierungAnsicht[]>();
    for (const a of liste) m.set(a.ausloeser, [...(m.get(a.ausloeser) ?? []), a]);
    return [...m.entries()];
  }, [liste]);
  // Umsortieren in einer Gruppe: Nummern im Abstand 10 neu vergeben (Reihenfolge 1–99).
  async function sortiere(gruppe: AutomatisierungAnsicht[], neu: AutomatisierungAnsicht[]) {
    setFehler(undefined);
    try {
      const start = Math.max(REIHENFOLGE.min, Math.min(gruppe[0].reihenfolge, REIHENFOLGE.max - 10 * (neu.length - 1)));
      for (const [i, a] of neu.entries()) {
        const r = Math.min(REIHENFOLGE.max, start + i * 10);
        if (a.reihenfolge !== r) await api.automatisierungAendern(a.id, { reihenfolge: r, version: a.version });
      }
      setAnsage(t('automatisierung.ui.liste.sortiert'));
      await z.laden();
    } catch (e) { setFehler((e as Error).message); }
  }
  const zieh = useZiehen({
    erlaubt: (q, ziel) => gruppen.some(([, g]) => g.some((a) => a.id === q) && g.some((a) => a.id === ziel)),
    fertig: (q, ziel, ort) => {
      const g = gruppen.find(([, x]) => x.some((a) => a.id === q))?.[1];
      if (g) void sortiere(g, umgestellt(g, g.findIndex((a) => a.id === q), g.findIndex((a) => a.id === ziel), ort === 'in' ? 'nach' : ort));
    },
  });
  const eintrag = (a: AutomatisierungAnsicht, g?: AutomatisierungAnsicht[]) => {
    const i = g?.findIndex((x) => x.id === a.id) ?? -1;
    const e = g ? zieh.eintrag(a.id) : {};
    return (
      <li key={a.id} {...e}>
        {g && g.length > 1 && <button {...zieh.griff(a.id, a.name)} onKeyDown={(ev) => ziehTasten(ev, {
          hoch: i > 0 ? () => void sortiere(g, umgestellt(g, i, i - 1, 'vor')) : undefined,
          runter: i < g.length - 1 ? () => void sortiere(g, umgestellt(g, i, i + 1, 'nach')) : undefined,
        })}><span aria-hidden="true">⠿</span></button>}
        <Link to={`/werkbank/automatisierungen/${a.id}`} className={`eintrag werk ${offen === a.id ? 'an' : ''}`}>
          <span className="titel">{a.name} <Zustandschip a={a} />{a.herkunft !== 'eigen' && <> <span className="chip">{t.frei(`automatisierung.ui.herkunft.${a.herkunft}`)}</span></>}</span>
          <span className="unter">{a.kurz}</span>
          <span className="leise klein">{t('automatisierung.ui.liste.reihenfolge', { nr: a.reihenfolge })}{a.letzterLauf && <> · {t('automatisierung.ui.liste.letzter', { zeit: zeit(a.letzterLauf.gestartet), zustand: t.frei(`automatisierung.ui.zustand.${a.letzterLauf.zustand}`) })}</>}</span>
          {(a.probleme[0] || a.angehalten) && <span className="problem">{a.angehalten?.text ?? a.probleme[0]}</span>}
          {a.rechte && !a.probleme[0] && !a.angehalten && <span className="problem">{a.rechte.text}</span>}
        </Link>
      </li>
    );
  };
  return (
    <>
      <Listenkopf titel={t('automatisierung.ui.titel')} hilfe="werkbank.automatisierungen" beschreibung={t('automatisierung.ui.beschreibung')}>
        <KnopfLink to="/werkbank/automatisierungen/neu" art="anlegen" groesse="klein">{t('automatisierung.ui.neu')}</KnopfLink>
      </Listenkopf>
      {z.fehler && <div className="hinweis schlecht"><p>{z.fehler}</p></div>}
      {fehler && <div className="hinweis schlecht"><p>{fehler}</p></div>}
      {s?.umgezogen && (
        <div className="hinweis info">
          <p><strong>{t('automatisierung.ui.umgezogen', { anzahl: s.umgezogen.anzahl })}</strong> {t('automatisierung.ui.umgezogen.text')}</p>
          <Knopf groesse="klein" onClick={async () => { try { await api.automatisierungUmzugGesehen(); await z.laden(); } catch (e) { setFehler((e as Error).message); } }}>{t('automatisierung.ui.umgezogen.ok')}</Knopf>
        </div>
      )}
      {!!s?.fehlgeschlagen && (
        <div className="hinweis warn">
          {/* Welcher Lauf und wann (#707); bei mehreren „Anzeigen“ filtert die Liste. Probeläufe zählen nicht. */}
          <p>{s.fehlgeschlagen === 1 && s.fehlschlaege[0]
            ? <>{t('automatisierung.ui.fehlgeschlagen.einer', { name: s.fehlschlaege[0].name, zeit: zeit(s.fehlschlaege[0].gestartet) })} <Link to={`/werkbank/automatisierungen/${s.fehlschlaege[0].automatisierungId}`} className="verweis">{t('automatisierung.ui.fehlgeschlagen.anzeigen')}</Link></>
            : t('automatisierung.ui.fehlgeschlagen', { anzahl: s.fehlgeschlagen })}</p>
          <div className="knoepfe">
            {s.fehlgeschlagen > 1 && <button type="button" className="knopf klein" aria-pressed={nurFehl} onClick={() => setNurFehl(!nurFehl)}>{nurFehl ? t('automatisierung.ui.fehlgeschlagen.alle') : t('automatisierung.ui.fehlgeschlagen.anzeigen')}</button>}
            <Knopf groesse="klein" onClick={async () => { try { await api.automatisierungenWiederholen(); setNurFehl(false); await z.laden(); } catch (e) { setFehler((e as Error).message); } }}>{t('automatisierung.ui.alle-wiederholen')}</Knopf>
            <Knopf groesse="klein" onClick={async () => { try { await api.automatisierungenNichtWiederholen(); setNurFehl(false); await z.laden(); } catch (e) { setFehler((e as Error).message); } }}>{t('automatisierung.ui.nicht-wiederholen.alle')}</Knopf>
          </div>
        </div>
      )}
      <Ansage text={ansage} />
      {!s ? <p className="leise">{t('automatisierung.ui.lade')}</p> : !s.automatisierungen.length ? <p className="leise leerliste">{t('automatisierung.ui.leer')}</p> : <>
        <div className="zeile">
          <input aria-label={t('automatisierung.ui.suchen')} placeholder={t('automatisierung.ui.suchen')} value={suche} onChange={(x) => setSuche(x.target.value)} />
          <label className="haken klein"><input type="checkbox" checked={nachAusloeser} onChange={(x) => setNachAusloeser(x.target.checked)} /><span>{t('automatisierung.ui.nach-ausloeser')}</span></label>
        </div>
        {nachAusloeser
          ? gruppen.map(([k, g]) => (
              <section key={k} className="automatisierung-gruppe">
                <h2 className="h3 klein">{g[0].kurz.split(' →')[0]}{g.length > 1 && <span className="leise"> · {t('automatisierung.ui.liste.gruppe', { anzahl: g.length })}</span>}</h2>
                <ul className="mappenliste">{g.map((a) => eintrag(a, g))}</ul>
              </section>
            ))
          : <ul className="mappenliste">{liste.map((a) => eintrag(a))}</ul>}
      </>}
    </>
  );
}

/* ---------- Editor ---------- */

type Entwurf = AutomatisierungDaten & { aktiv: boolean };
// Neue Automatisierungen sind vorgegeben „an“ (#706) – wirksam erst mit dem Speichern.
const LEER: Entwurf = { name: '', beschreibung: '', reihenfolge: REIHENFOLGE.eigen, wenn: { art: 'mappe.geaendert', typ: null }, und: { modus: 'alle', karten: [] }, dann: [], sonst: [], aktiv: true };
const kopie = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const neueId = () => `k${Math.random().toString(36).slice(2, 8)}`;

/** Karten im Vorrat: Art und Name; „wenn“ ersetzt die Wenn-Karte, „und“/„dann“ hängen an. */
const VORRAT: Array<{ bereich: 'wenn' | 'und' | 'dann'; art: string }> = [
  { bereich: 'wenn', art: 'datum' }, { bereich: 'wenn', art: 'zeitplan' }, ...WENN_EREIGNISSE.map((a) => ({ bereich: 'wenn' as const, art: a })),
  { bereich: 'und', art: 'bedingung' }, { bereich: 'und', art: 'ansicht' }, { bereich: 'und', art: 'favorit' }, { bereich: 'und', art: 'gruppe' },
  { bereich: 'dann', art: 'feld' }, { bereich: 'dann', art: 'aufgabe' },
  // #678: Benachrichtigungen – passen nur zu ihrer Wenn-Karte (Zeitplan je Benutzer, Favorit geändert, Zeitplan bzw. Kontosperre).
  { bereich: 'dann', art: 'zusammenfassung' }, { bereich: 'dann', art: 'favoriten' }, { bereich: 'dann', art: 'anmeldeschutz' },
  { bereich: 'dann', art: 'stopp' },
];
/** Nach Wahl der Wenn-Karte nur passende Karten: „Feld ändern“ braucht einen Mappentyp, „in Ansicht“ eine Ansicht dafür. */
const sichtenFuer = (k: Kontextdaten, typ: Mappentyp | null) => k.sichten.filter((s) => !typ || !s.typen?.length || s.typen.includes(typ.id) || s.typen.includes('*'));
const passt = (v: { art: string }, typ: Mappentyp | null, k: Kontextdaten, w?: WennKarte) => (v.art === 'feld' ? !!typ : v.art === 'ansicht' ? sichtenFuer(k, typ).length > 0
  : v.art === 'zusammenfassung' ? w?.art === 'zeitplan' && w.jeBenutzer : v.art === 'favoriten' ? w?.art === 'favorit.geaendert'
    : v.art === 'anmeldeschutz' ? (w?.art === 'zeitplan' && !w.jeBenutzer) || w?.art === 'benutzer.gesperrt' : true);
const vorratName = (v: { bereich: string; art: string }) => (v.bereich === 'wenn' ? ereignisName(v.art) : t.frei(`automatisierung.ui.karte.${v.bereich}.${v.art}`));

export function AutomatisierungEditor({ z, id }: { z: AutomatisierungenZustand; id: string }) {
  const d = useDaten();
  const neu = id === 'neu';
  const a = neu ? undefined : z.stand?.automatisierungen.find((x) => x.id === id);
  const k = z.stand?.kontext;
  const gespeichert: Entwurf = a ? { name: a.name, beschreibung: a.beschreibung, reihenfolge: a.reihenfolge, wenn: a.wenn, und: a.und, dann: a.dann, sonst: a.sonst, aktiv: a.aktiv } : LEER;
  const [e, setE] = useState<Entwurf>(() => kopie(gespeichert));
  const [offenKarte, setOffenKarte] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const [schaltRueckmeldung, setSchaltRueckmeldung] = useState<string | null>(null);
  const [sendet, setSendet] = useState(false);
  const [vorratOffen, setVorratOffen] = useState(false);
  const [ansage, setAnsage] = useState('');
  const ent = useEntwurf(gespeichert, e, { neu, zuruecksetzen: () => setE(kopie(gespeichert)), liste: '/werkbank/automatisierungen' });
  // Karten aus dem Vorrat in Wenn, Und oder Dann ziehen; Dann-Karten untereinander umsortieren.
  const ablage = useZiehen({ erlaubt: (quelle, ziel) => quelle.startsWith(`${ziel}|`), fertig: (quelle, ziel) => { const [b, art] = quelle.split('|'); if (b === ziel) fuegeHinzu(b, art); } });
  const reihe = useZiehen({
    fertig: (q, ziel, ort) => setE((x) => ({ ...x, dann: umgestellt(x.dann, x.dann.findIndex((y) => y.id === q), x.dann.findIndex((y) => y.id === ziel), ort === 'in' ? 'nach' : ort) })),
  });
  if (!k) return z.fehler ? <div className="hinweis schlecht"><p>{z.fehler}</p></div> : <p className="leise">{t('automatisierung.ui.lade')}</p>;
  if (!neu && !a) return <div className="platzhalter"><p>{t('automatisierung.nicht-gefunden')}</p></div>;
  const typ = kontextTyp(e.wenn, k.typen);
  const probleme = automatisierungsProbleme(e, k);
  const gleiche = z.stand!.automatisierungen.filter((x) => x.ausloeser === (a?.ausloeser ?? '') && x.aktiv);
  const position = a ? gleiche.findIndex((x) => x.id === a.id) + 1 : 0;

  function fuegeHinzu(bereich: string, art: string) {
    if (bereich === 'wenn') setE({ ...e, wenn: neueWenn(art, e.wenn, typ, k!) });
    if (bereich === 'und') setE({ ...e, und: { ...e.und, karten: [...e.und.karten, neueUnd(art, typ)] } });
    if (bereich === 'dann') { const n = neueDann(art, e.wenn); setE({ ...e, dann: [...e.dann, n] }); setOffenKarte(n.id); }
    setAnsage(t('automatisierung.ui.hinzugefuegt', { name: vorratName({ bereich, art }) }));
  }

  const speichern = async () => {
    setSendet(true); setMeldung(undefined);
    try {
      const x = neu ? await api.automatisierungAnlegen(e) : await api.automatisierungAendern(a!.id, { ...e, version: a!.version });
      await z.laden();
      loeseWache();
      if (neu) geheZu(`/werkbank/automatisierungen/${x.id}`, true);
      setMeldung({ art: 'gut', text: t('automatisierung.ui.gespeichert') });
    } catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); } finally { setSendet(false); }
  };
  async function aktion(f: () => Promise<unknown>, gut: string) {
    setMeldung(undefined);
    try { await f(); await z.laden(); setMeldung({ art: 'gut', text: gut }); } catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); }
  }

  return (
    <div className="einspaltig automatisierung">
      <div className="mappenkopf">
        <p className="ueber">{t('automatisierung.ui.ueber')}</p>
        <h1>{neu ? t('automatisierung.ui.neu.titel') : a!.name} {a && <Zustandschip a={a} />}</h1>
        {/* Kann nie laufen, weil das Konto „Automatisierung“ den Mappentyp nicht lesen darf (#709): Hinweis mit Weg zum Testlauf (#710). */}
        {a?.rechte && <div className="hinweis warn" role="status"><p>{a.rechte.text} <Link to={`/werkbank/typen/${a.rechte.typId}${a.rechte.kontoId ? `?testkonto=${a.rechte.kontoId}` : ''}#testlauf`} className="verweis">{t('automatisierung.ui.rechte.link')}</Link></p></div>}
        {a && <p className="leise">{a.kurz}{position > 0 && gleiche.length > 1 && <> · {t('automatisierung.ui.position', { nr: position, anzahl: gleiche.length })}</>}</p>}
        {/* An/aus an einer Stelle (#706): neu wirkt der Schalter mit dem Speichern, sonst sofort; angehalten mit Grund. */}
        <div className="zeile handlungen">
          {a?.angehalten ? <>
            <div className="hinweis schlecht"><p>{t('automatisierung.ui.angehalten')}: {a.angehalten.text}</p></div>
            <button type="button" className="knopf klein" onClick={() => void aktion(() => api.automatisierungSchalten(a.id, true), t('automatisierung.ui.eingeschaltet'))}>{t('automatisierung.ui.wieder-einschalten')}</button>
          </> : schaltRueckmeldung ? <p className="gut" role="status">{schaltRueckmeldung}</p>
            : <Schalter an={a ? a.aktiv : e.aktiv} beschriftung={t('automatisierung.ui.schalter')} onChange={(an) => {
              if (!a) { setE({ ...e, aktiv: an }); return; }
              void (async () => {
                try { await api.automatisierungSchalten(a.id, an); await z.laden(); setSchaltRueckmeldung(an ? t('automatisierung.ui.eingeschaltet') : t('automatisierung.ui.ausgeschaltet')); setTimeout(() => setSchaltRueckmeldung(null), 2500); }
                catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); }
              })();
            }} />}
          {neu && <span className="leise klein">{t('automatisierung.ui.schalter.neu')}</span>}
          {a && <button type="button" className="knopf klein" onClick={() => void aktion(async () => { const x = await api.automatisierungKopieren(a.id); geheZu(`/werkbank/automatisierungen/${x.id}`); }, t('automatisierung.ui.kopiert'))}>{t('automatisierung.ui.kopieren')}</button>}
        </div>
      </div>
      {meldung && <div className={`hinweis ${meldung.art}`}><p>{meldung.text}</p></div>}
      <Ansage text={ansage} />
      <form className="blatt" onSubmit={(x) => { x.preventDefault(); void speichern(); }} onKeyDown={ent.tasten}>
        <div className="raster">
          <label className="eigenschaft"><span>{t('automatisierung.ui.name')}</span><input id="auto-name" value={e.name} maxLength={AUTOMATISIERUNG_GRENZEN.name} onChange={(x) => setE({ ...e, name: x.target.value })} required /></label>
          <label className="eigenschaft"><span>{t('automatisierung.ui.reihenfolge')} <small>{t('automatisierung.ui.reihenfolge.hilfe')}</small></span>
            <input id="auto-reihenfolge" type="number" min={REIHENFOLGE.min} max={REIHENFOLGE.max} value={e.reihenfolge} onChange={(x) => setE({ ...e, reihenfolge: Number(x.target.value) })} /></label>
          <label className="eigenschaft breit"><span>{t('automatisierung.ui.beschreibung.feld')}</span><textarea rows={2} value={e.beschreibung} onChange={(x) => setE({ ...e, beschreibung: x.target.value })} /></label>
        </div>

        <div className="zeile"><button type="button" className="textknopf klein" aria-expanded={vorratOffen} onClick={() => setVorratOffen(!vorratOffen)}>{t('automatisierung.ui.vorrat')}</button></div>
        {vorratOffen && <Vorrat ablage={ablage} fuegeHinzu={fuegeHinzu} passend={(v) => passt(v, typ, k, e.wenn)} />}

        <Bereichskasten titel={t('automatisierung.ui.wenn')} hinweis={t('automatisierung.ui.wenn.hinweis')} ablage={ablage.ablage('wenn')}>
          <WennEditor w={e.wenn} k={k} setze={(w) => setE({ ...e, wenn: w })} />
        </Bereichskasten>
        <div className="automatisierung-pfeil" aria-hidden="true">↓</div>
        <Bereichskasten titel={t('automatisierung.ui.und')} hinweis={e.und.karten.length ? undefined : t('automatisierung.ui.und.leer')} ablage={ablage.ablage('und')}
          kopf={e.und.karten.length > 1 && <select aria-label={t('automatisierung.ui.und.modus')} value={e.und.modus} onChange={(x) => setE({ ...e, und: { ...e.und, modus: x.target.value as 'alle' | 'eine' } })}>
            <option value="alle">{t('automatisierung.ui.und.alle')}</option><option value="eine">{t('automatisierung.ui.und.eine')}</option>
          </select>}
          fuss={<KarteHinzu bereich="und" fuegeHinzu={fuegeHinzu} passend={(v) => passt(v, typ, k, e.wenn)} />}>
          <UndListe karten={e.und.karten} typ={typ} k={k} setze={(karten) => setE({ ...e, und: { ...e.und, karten } })} />
        </Bereichskasten>
        <div className="automatisierung-pfeil" aria-hidden="true">↓</div>
        <Bereichskasten titel={t('automatisierung.ui.dann')} hinweis={e.dann.length ? undefined : t('automatisierung.ui.dann.leer')} ablage={ablage.ablage('dann')} fuss={<KarteHinzu bereich="dann" fuegeHinzu={fuegeHinzu} passend={(v) => passt(v, typ, k, e.wenn)} />}>
          <ol className="automatisierung-karten">
            {e.dann.map((karte, i) => (
              <li key={karte.id} {...reihe.eintrag(karte.id)}>
                <div className="karte-kopf">
                  <button {...reihe.griff(karte.id, vorratName({ bereich: 'dann', art: karte.art }))} onKeyDown={(ev) => ziehTasten(ev, {
                    hoch: i > 0 ? () => setE({ ...e, dann: umgestellt(e.dann, i, i - 1, 'vor') }) : undefined,
                    runter: i < e.dann.length - 1 ? () => setE({ ...e, dann: umgestellt(e.dann, i, i + 1, 'nach') }) : undefined,
                  })}><span aria-hidden="true">⠿</span></button>
                  <button type="button" className="textknopf" aria-expanded={offenKarte === karte.id} onClick={() => setOffenKarte(offenKarte === karte.id ? null : karte.id)}>
                    <strong>{vorratName({ bereich: 'dann', art: karte.art })}</strong> <span className="leise">{dannKurz(karte, typ, k)}</span>
                  </button>
                  <button type="button" className="textknopf gefahr klein" onClick={() => setE({ ...e, dann: e.dann.filter((x) => x.id !== karte.id) })}>{t('automatisierung.ui.entfernen')}</button>
                </div>
                {offenKarte === karte.id && <DannEditor karte={karte} typ={typ} wenn={e.wenn} k={k} setze={(n) => setE({ ...e, dann: e.dann.map((x) => (x.id === karte.id ? n : x)) })} />}
              </li>
            ))}
          </ol>
        </Bereichskasten>
        {probleme.length > 0 && <ul className="fehlertext klein">{probleme.map((p) => <li key={p}>{p}</li>)}</ul>}
        <Speicherleiste ent={ent} gegenstand={t('automatisierung.ui.gegenstand')} sendet={sendet} ungueltig={probleme.length > 0}
          links={a && a.herkunft === 'eigen' && <Knopf art="link" className="gefahr" onClick={async () => {
            if (await rueckfrage({ titel: t('automatisierung.ui.loeschen.frage', { name: a.name }), text: t('automatisierung.ui.loeschen.text'), ja: t('automatisierung.ui.loeschen'), gefahr: true })) {
              void aktion(async () => { await api.automatisierungLoeschen(a.id); loeseWache(); geheZu('/werkbank/automatisierungen', true); }, t('automatisierung.ui.geloescht'));
            }
          }}>{t('automatisierung.ui.loeschen')}</Knopf>} />
      </form>
      {a && <>
        <Wiedergeben a={a} typ={kontextTyp(a.wenn, k.typen)} nachher={() => void z.laden()} />
        <Verlauf a={a} k={k} d={d.typ} />
        <Fassungen a={a} k={k} nachher={() => void z.laden()} />
      </>}
    </div>
  );
}

function Bereichskasten({ titel, hinweis, ablage, kopf, fuss, children }: { titel: string; hinweis?: string; ablage: Record<string, unknown>; kopf?: ReactNode; fuss?: ReactNode; children: ReactNode }) {
  const { className, ...rest } = ablage as { className?: string };
  return (
    <section className={`automatisierung-bereich ${className ?? ''}`} {...rest}>
      <div className="zeile"><h2 className="h3">{titel}</h2>{kopf}</div>
      {hinweis && <p className="leise klein">{hinweis}</p>}
      {children}
      {fuss}
    </section>
  );
}

function Vorrat({ ablage, fuegeHinzu, passend }: { ablage: ReturnType<typeof useZiehen>; fuegeHinzu: (b: string, art: string) => void; passend: (v: { art: string }) => boolean }) {
  const [suche, setSuche] = useState('');
  const treffer = VORRAT.filter((v) => passend(v)).filter((v) => !suche.trim() || vorratName(v).toLowerCase().includes(suche.trim().toLowerCase()));
  return (
    <div className="automatisierung-vorrat">
      <input aria-label={t('automatisierung.ui.vorrat.suchen')} placeholder={t('automatisierung.ui.vorrat.suchen')} value={suche} onChange={(x) => setSuche(x.target.value)} />
      <p className="leise klein">{t('automatisierung.ui.vorrat.hinweis')}</p>
      {(['wenn', 'und', 'dann'] as const).map((b) => {
        const liste = treffer.filter((v) => v.bereich === b);
        return liste.length ? (
          <div key={b}>
            <p className="klein"><strong>{t.frei(`automatisierung.ui.${b}`)}</strong></p>
            <ul className="stapel">
              {liste.map((v) => (
                <li key={`${v.bereich}|${v.art}`} className="vorratkarte">
                  <button {...ablage.griff(`${v.bereich}|${v.art}`, vorratName(v))}><span aria-hidden="true">⠿</span></button>
                  <button type="button" className="textknopf" onClick={() => fuegeHinzu(v.bereich, v.art)}>{vorratName(v)}</button>
                </li>
              ))}
            </ul>
          </div>
        ) : null;
      })}
    </div>
  );
}

function KarteHinzu({ bereich, fuegeHinzu, passend }: { bereich: 'und' | 'dann'; fuegeHinzu: (b: string, art: string) => void; passend: (v: { art: string }) => boolean }) {
  return (
    <label className="eigenschaft klein">
      <span className="sr">{t('automatisierung.ui.karte.hinzu')}</span>
      <select value="" onChange={(x) => { if (x.target.value) fuegeHinzu(bereich, x.target.value); }}>
        <option value="">{t('automatisierung.ui.karte.hinzu')}</option>
        {VORRAT.filter((v) => v.bereich === bereich && passend(v)).map((v) => <option key={v.art} value={v.art}>{vorratName(v)}</option>)}
      </select>
    </label>
  );
}

/* ---------- Wenn ---------- */

const ZEITPLAN_NEU: WennKarte = { art: 'zeitplan', uhrzeit: '07:00', tage: [1, 2, 3, 4, 5], feiertage: false, jeBenutzer: false };
/** Neue Wenn-Karte aus dem Vorrat bzw. der Auswahl; der Mappentyp bleibt, wo er passt. */
function neueWenn(art: string, alt: WennKarte, typ: Mappentyp | null, k: Kontextdaten): WennKarte {
  if (art === 'datum') return { art: 'datum', typ: typ?.id ?? k.typen.find((x) => x.system !== 'benutzer' && x.system !== 'rolle')?.id ?? '', feld: '', vorlauf: 7, einheit: 'tage', uhrzeit: '07:00', wiederholung: null };
  if (art === 'zeitplan') return { ...ZEITPLAN_NEU };
  return { art: art as never, typ: alt.art === 'zeitplan' ? null : alt.art === 'datum' ? alt.typ : alt.typ ?? null };
}
const TAG_NAMEN = ['', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

/** Wenn-Karte „Zeitplan“ (#678): Wochentage, Uhrzeit, Feiertage, „für jeden Benutzer (der Rolle …)“, Uhrzeit aus dem Profil. */
function ZeitplanEditor({ w, k, setze }: { w: Extract<WennKarte, { art: 'zeitplan' }>; k: Kontextdaten; setze: (w: WennKarte) => void }) {
  const profil = w.jeBenutzer && w.profilzeit;
  return <>
    {!profil && <>
      <fieldset className="eigenschaft"><legend>{t('automatisierung.ui.wenn.zeitplan.tage')}</legend>
        <div className="zeile">
          {WOCHENTAGE.map((d) => <label key={d} className="haken klein"><input type="checkbox" checked={w.tage.includes(d)} onChange={(x) => setze({ ...w, tage: x.target.checked ? [...w.tage, d].sort() : w.tage.filter((y) => y !== d) })} /><span>{TAG_NAMEN[d]}</span></label>)}
        </div>
      </fieldset>
      <label className="eigenschaft"><span>{t('automatisierung.ui.wenn.uhrzeit')}</span><input type="time" step={900} value={w.uhrzeit} onChange={(x) => setze({ ...w, uhrzeit: x.target.value || '07:00' })} /></label>
      <label className="haken"><input type="checkbox" checked={w.feiertage} onChange={(x) => setze({ ...w, feiertage: x.target.checked })} /><span>{t('automatisierung.ui.wenn.zeitplan.feiertage')}</span></label>
    </>}
    <label className="haken breit"><input type="checkbox" checked={w.jeBenutzer} onChange={(x) => setze(x.target.checked ? { ...w, jeBenutzer: true, rolle: null, profilzeit: false } : { art: 'zeitplan', uhrzeit: w.uhrzeit, tage: w.tage, feiertage: w.feiertage, jeBenutzer: false })} /><span>{t('automatisierung.ui.wenn.zeitplan.je-benutzer')}</span></label>
    {w.jeBenutzer && <>
      <label className="eigenschaft"><span>{t('automatisierung.ui.wenn.zeitplan.rolle')}</span>
        <select value={w.rolle ?? ''} onChange={(x) => setze({ ...w, rolle: x.target.value || null })}>
          <option value="">{t('automatisierung.ui.wenn.zeitplan.alle')}</option>
          {k.rollen.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select></label>
      <label className="haken breit"><input type="checkbox" checked={!!w.profilzeit} onChange={(x) => setze({ ...w, profilzeit: x.target.checked })} /><span>{t('automatisierung.ui.wenn.zeitplan.profilzeit')}</span></label>
    </>}
  </>;
}

const GRUPPEN_FOLGE: Ereignisgruppe[] = ['mappe', 'zeit', 'person', 'benutzer', 'verarbeitung'];

function WennEditor({ w, k, setze }: { w: WennKarte; k: Kontextdaten; setze: (w: WennKarte) => void }) {
  const typen = k.typen.filter((x) => x.system !== 'benutzer' && x.system !== 'rolle');
  const typ = kontextTyp(w, k.typen);
  const benutzerGruppe = w.art === 'zeitplan' || (w.art !== 'datum' && EREIGNISKATALOG[w.art].gruppe === 'benutzer');
  return (
    <div className="karte offen">
      <div className="raster">
        <label className="eigenschaft"><span>{t('automatisierung.ui.wenn.ereignis')}</span>
          <select value={w.art} onChange={(x) => setze(neueWenn(x.target.value, w, typ, k))}>
            <option value="datum">{ereignisName('datum')}</option>
            <option value="zeitplan">{ereignisName('zeitplan')}</option>
            {GRUPPEN_FOLGE.map((g) => (
              <optgroup key={g} label={t.frei(`ereignisse.gruppe.${g}`)}>
                {WENN_EREIGNISSE.filter((a) => EREIGNISKATALOG[a].gruppe === g).map((a) => <option key={a} value={a}>{ereignisName(a)}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
        {!benutzerGruppe && (
          <label className="eigenschaft"><span>{t('automatisierung.ui.wenn.typ')}</span>
            <select value={w.typ ?? ''} onChange={(x) => setze(w.art === 'datum' ? { ...w, typ: x.target.value, feld: '' } : { ...w, typ: x.target.value || null, felder: [] })}>
              {w.art !== 'datum' && <option value="">{t('automatisierung.ui.wenn.alle-typen')}</option>}
              {typen.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </label>
        )}
        {w.art === 'zeitplan' && <ZeitplanEditor w={w} k={k} setze={setze} />}
        {w.art === 'datum' && <>
          <label className="eigenschaft"><span>{t('automatisierung.ui.wenn.feld')}</span>
            <select value={w.feld} onChange={(x) => setze({ ...w, feld: x.target.value })}>
              <option value="">–</option>
              {(typ?.felder ?? []).filter((f) => f.typ === 'datum').map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
          </label>
          <label className="eigenschaft"><span>{t('automatisierung.ui.wenn.vorlauf')} <small>{t('automatisierung.ui.wenn.vorlauf.hilfe')}</small></span>
            <span className="zeile">
              <input type="number" min={-3650} max={3650} value={w.vorlauf} onChange={(x) => setze({ ...w, vorlauf: Number(x.target.value) })} />
              <select aria-label={t('automatisierung.ui.wenn.einheit')} value={w.einheit} onChange={(x) => setze({ ...w, einheit: x.target.value as VorlaufEinheit })}>
                {Object.entries(VORLAUF_EINHEITEN).map(([key, name]) => <option key={key} value={key}>{name}</option>)}
              </select>
            </span></label>
          <label className="eigenschaft"><span>{t('automatisierung.ui.wenn.wiederholung')} <small>{t('automatisierung.ui.wenn.wiederholung.hilfe')}</small></span>
            <select value={w.wiederholung ?? ''} onChange={(x) => setze({ ...w, wiederholung: x.target.value ? Number(x.target.value) : null })}>
              <option value="">{t('automatisierung.ui.wenn.einmalig')}</option>
              {Object.entries(WIEDERHOLUNGEN).map(([m, name]) => <option key={m} value={m}>{name}</option>)}
            </select></label>
          <label className="eigenschaft"><span>{t('automatisierung.ui.wenn.uhrzeit')}</span><input type="time" value={w.uhrzeit} onChange={(x) => setze({ ...w, uhrzeit: x.target.value || '07:00' })} /></label>
        </>}
        {w.art === 'mappe.geaendert' && typ && (
          <fieldset className="eigenschaft breit"><legend>{t('automatisierung.ui.wenn.felder')}</legend>
            <div className="zeile">
              {typ.felder.map((f) => (
                <label key={f.key} className="haken klein"><input type="checkbox" checked={!!w.felder?.includes(f.key)} onChange={(x) => setze({ ...w, felder: x.target.checked ? [...(w.felder ?? []), f.key] : (w.felder ?? []).filter((y) => y !== f.key) })} /><span>{f.label}</span></label>
              ))}
            </div>
          </fieldset>
        )}
      </div>
      <p className="leise klein">{w.art === 'datum' ? t('automatisierung.ui.wenn.datum.text') : w.art === 'zeitplan' ? `${zeitplanText(w)}. ${t('automatisierung.ui.wenn.zeitplan.text')}` : t.frei(`ereignisse.text.${ereignisSchluessel(w.art)}`)}</p>
    </div>
  );
}

/* ---------- Und ---------- */

function neueUnd(art: string, typ: Mappentyp | null): UndKarte {
  if (art === 'ansicht') return { art: 'ansicht', sicht: '' };
  if (art === 'favorit') return { art: 'favorit', von: { art: 'person', id: '' } };
  if (art === 'gruppe') return { art: 'gruppe', modus: 'eine', karten: [] };
  const f = bedingungsfelder(typ ? [typ] : [])[0];
  return { art: 'bedingung', bedingung: { art: 'feld', feld: f.key, op: OPERATOREN_JE_ART[f.art][0] } };
}

function UndListe({ karten, typ, k, setze, tief = 0 }: { karten: UndKarte[]; typ: Mappentyp | null; k: Kontextdaten; setze: (k: UndKarte[]) => void; tief?: number }) {
  const d = useDaten();
  const [titel, setTitel] = useState<Record<string, string>>({});
  const merke = (mid: string, x: string) => setTitel((y) => ({ ...y, [mid]: x }));
  const felder = useMemo(() => bedingungsfelder(typ ? [typ] : []), [typ]);
  const aendere = (i: number, n: UndKarte) => setze(karten.map((x, j) => (j === i ? n : x)));
  if (!karten.length) return null;
  return (
    <ol className="bedingungen">
      {karten.map((u, i) => (
        <li key={i} className="karte">
          <div className="bedingungszeile">
            <label className="haken klein" title={t('automatisierung.ui.und.nicht.hilfe')}><input type="checkbox" checked={u.nicht === true} onChange={(x) => aendere(i, { ...u, nicht: x.target.checked || undefined })} /><span>{t('automatisierung.ui.und.nicht')}</span></label>
            {u.art === 'bedingung' && u.bedingung.art === 'feld' && (() => {
              const feld = felder.find((f) => f.key === (u.bedingung as Extract<Bedingung, { art: 'feld' }>).feld) as Bedingungsfeld | undefined;
              return <>
                <select aria-label={t('automatisierung.ui.und.feld')} value={feld?.key ?? ''} onChange={(x) => { const f = felder.find((y) => y.key === x.target.value); if (f) aendere(i, { ...u, bedingung: { art: 'feld', feld: f.key, op: OPERATOREN_JE_ART[f.art][0] } }); }}>
                  {!feld && <option value="">–</option>}
                  {felder.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                </select>
                {feld && <FeldBedingung b={u.bedingung} feld={feld} setze={(b) => aendere(i, { ...u, bedingung: b })} titel={titel} merke={merke} />}
              </>;
            })()}
            {u.art === 'ansicht' && (
              <select aria-label={t('automatisierung.ui.karte.und.ansicht')} value={u.sicht} onChange={(x) => aendere(i, { ...u, sicht: x.target.value })}>
                <option value="">{t('automatisierung.ui.und.ansicht.waehlen')}</option>
                {sichtenFuer(k, typ).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
            {u.art === 'favorit' && <EmpfaengerWahl e={u.von} typ={typ} k={k} setze={(v) => aendere(i, { ...u, von: v })} />}
            {u.art === 'gruppe' && (
              <select aria-label={t('automatisierung.ui.und.modus')} value={u.modus} onChange={(x) => aendere(i, { ...u, modus: x.target.value as 'alle' | 'eine' })}>
                <option value="alle">{t('automatisierung.ui.und.alle')}</option><option value="eine">{t('automatisierung.ui.und.eine')}</option>
              </select>
            )}
            <button type="button" className="textknopf gefahr klein" onClick={() => setze(karten.filter((_, j) => j !== i))}>{t('automatisierung.ui.entfernen')}</button>
          </div>
          <p className="leise klein">{undKurz(u, typ, k, (mid) => titel[mid] ?? d.person(mid))}</p>
          {u.art === 'gruppe' && tief === 0 && <div className="einzug">
            <UndListe karten={u.karten} typ={typ} k={k} setze={(x) => aendere(i, { ...u, karten: x })} tief={1} />
            <select value="" aria-label={t('automatisierung.ui.karte.hinzu')} onChange={(x) => { if (x.target.value) aendere(i, { ...u, karten: [...u.karten, neueUnd(x.target.value, typ)] }); }}>
              <option value="">{t('automatisierung.ui.karte.hinzu')}</option>
              {['bedingung', 'ansicht', 'favorit'].map((art) => <option key={art} value={art}>{t.frei(`automatisierung.ui.karte.und.${art}`)}</option>)}
            </select>
          </div>}
        </li>
      ))}
    </ol>
  );
}

function empfaengerName(e: Empfaenger, typ: Mappentyp | null, k: Kontextdaten) {
  if (e.art === 'person') return k.benutzer.find((b) => b.id === e.id)?.name ?? '?';
  if (e.art === 'rolle') return t('automatisierung.ui.empfaenger.rolle-name', { name: k.rollen.find((r) => r.id === e.id)?.name ?? '?' });
  if (e.art === 'ersteller') return t('automatisierung.ui.empfaenger.ersteller');
  if (e.art === 'ereignis') return t('automatisierung.ui.empfaenger.ereignis-name', { name: EREIGNIS_PERSON[e.feld] ?? e.feld });
  return t('automatisierung.ui.empfaenger.feld-name', { name: typ?.felder.find((f) => f.key === e.feld)?.label ?? e.feld });
}

function undKurz(u: UndKarte, typ: Mappentyp | null, k: Kontextdaten, titelVon: (id: string) => string): string {
  const nicht = u.nicht ? `${t('automatisierung.ui.und.nicht')}: ` : '';
  if (u.art === 'bedingung') return nicht + beschreibeBedingung(u.bedingung, typ ? [typ] : [], titelVon);
  if (u.art === 'ansicht') return nicht + t('automatisierung.ui.und.ansicht.kurz', { name: k.sichten.find((s) => s.id === u.sicht)?.name ?? '?' });
  if (u.art === 'favorit') return nicht + t('automatisierung.ui.und.favorit.kurz', { wer: empfaengerName(u.von, typ, k) });
  return nicht + t.frei(`automatisierung.ui.und.gruppe.${u.modus}`, { anzahl: u.karten.length });
}

function EmpfaengerWahl({ e, typ, k, setze, wenn }: { e: Empfaenger; typ: Mappentyp | null; k: Kontextdaten; setze: (e: Empfaenger) => void; wenn?: WennKarte }) {
  const benutzerTyp = k.typen.find((x) => x.system === 'benutzer');
  const felder = (typ?.felder ?? []).filter((f) => f.typ === 'referenz' && (!f.zielTyp || f.zielTyp === benutzerTyp?.id));
  const ausEreignis = wenn ? PERSONEN_IM_EREIGNIS[wenn.art] ?? [] : [];
  const wert = e.art === 'feld' ? `feld:${e.feld}` : e.art === 'ereignis' ? `ereignis:${e.feld}` : e.art === 'ersteller' ? 'ersteller:' : `${e.art}:${e.id}`;
  return (
    <select aria-label={t('automatisierung.ui.empfaenger')} value={wert} onChange={(x) => {
      const [art, ...rest] = x.target.value.split(':');
      const v = rest.join(':');
      setze(art === 'feld' ? { art: 'feld', feld: v } : art === 'ereignis' ? { art: 'ereignis', feld: v } : art === 'ersteller' ? { art: 'ersteller' } : { art: art as 'person' | 'rolle', id: v });
    }}>
      <option value="person:">{t('automatisierung.ui.empfaenger.waehlen')}</option>
      <option value="ersteller:">{t('automatisierung.ui.empfaenger.ersteller')}</option>
      {ausEreignis.length > 0 && <optgroup label={t('automatisierung.ui.empfaenger.ereignis')}>{ausEreignis.map((p) => <option key={p} value={`ereignis:${p}`}>{EREIGNIS_PERSON[p] ?? p}</option>)}</optgroup>}
      {felder.length > 0 && <optgroup label={t('automatisierung.ui.empfaenger.felder')}>{felder.map((f) => <option key={f.key} value={`feld:${f.key}`}>{f.label}</option>)}</optgroup>}
      <optgroup label={t('automatisierung.ui.empfaenger.personen')}>{k.benutzer.filter((b) => b.aktiv !== false).map((b) => <option key={b.id} value={`person:${b.id}`}>{b.name}</option>)}</optgroup>
      <optgroup label={t('automatisierung.ui.empfaenger.rollen')}>{k.rollen.map((r) => <option key={r.id} value={`rolle:${r.id}`}>{r.name}</option>)}</optgroup>
    </select>
  );
}

/* ---------- Dann ---------- */

function neueDann(art: string, w?: WennKarte): DannKarte {
  if (art === 'feld') return { id: neueId(), art: 'feld', werte: {} };
  if (art === 'zusammenfassung' || art === 'favoriten') return { id: neueId(), art };
  if (art === 'anmeldeschutz') return { id: neueId(), art: 'anmeldeschutz', was: w?.art === 'benutzer.gesperrt' ? 'konto' : 'sammel' };
  if (art === 'aufgabe') return { id: neueId(), art: 'aufgabe', als: 'aufgabe', empfaenger: [], text: '', faellig: 7 };
  return { id: neueId(), art: 'stopp' };
}

function dannKurz(k: DannKarte, typ: Mappentyp | null, kx: Kontextdaten): string {
  if (k.art === 'stopp' || k.art === 'zusammenfassung' || k.art === 'favoriten') return '';
  if (k.art === 'anmeldeschutz') return t.frei(`automatisierung.ui.karte.dann.anmeldeschutz.${k.was}`);
  if (k.art === 'feld') return Object.entries(k.werte).map(([key, v]) => `${typ?.felder.find((f) => f.key === key)?.label ?? key} = ${String(v ?? '')}`).join(', ');
  return `${t.frei(`automatisierung.karte.aufgabe.als-${k.als}`)} → ${k.empfaenger.map((e) => empfaengerName(e, typ, kx)).join(', ') || '?'}`;
}

function Platzhalter({ wenn, typ, einfuegen }: { wenn: WennKarte; typ: Mappentyp | null; einfuegen: (x: string) => void }) {
  return (
    <p className="klein platzhalterleiste">
      <span className="leise">{t('automatisierung.ui.platzhalter')} </span>
      {platzhalterFuer(wenn, typ).map((p) => <button key={p.key} type="button" className="chip" title={p.label} onClick={() => einfuegen(`{${p.key}}`)}>{`{${p.key}}`}</button>)}
    </p>
  );
}

function DannEditor({ karte, typ, wenn, k, setze }: { karte: DannKarte; typ: Mappentyp | null; wenn: WennKarte; k: Kontextdaten; setze: (k: DannKarte) => void }) {
  if (karte.art === 'stopp') return <p className="leise klein">{t('automatisierung.ui.karte.dann.stopp.text')}</p>;
  if (karte.art === 'zusammenfassung' || karte.art === 'favoriten') return <p className="leise klein">{t.frei(`automatisierung.ui.karte.dann.${karte.art}.text`)}</p>;
  if (karte.art === 'anmeldeschutz') return (
    <div className="karte offen">
      <label className="eigenschaft"><span>{t('automatisierung.ui.karte.dann.anmeldeschutz.was')}</span>
        <select value={karte.was} onChange={(x) => setze({ ...karte, was: x.target.value === 'konto' ? 'konto' : 'sammel' })}>
          <option value="sammel">{t('automatisierung.ui.karte.dann.anmeldeschutz.sammel')}</option>
          <option value="konto">{t('automatisierung.ui.karte.dann.anmeldeschutz.konto')}</option>
        </select></label>
      <p className="leise klein">{t.frei(`automatisierung.ui.karte.dann.anmeldeschutz.${karte.was}.text`)}</p>
    </div>
  );
  if (karte.art === 'feld') {
    const felder = (typ?.felder ?? []).filter((f) => f.typ !== 'passwort');
    const gewaehlt = Object.keys(karte.werte);
    return (
      <div className="karte offen">
        {!typ && <p className="fehlertext klein">{t('automatisierung.ui.karte.dann.feld.ohne-typ')}</p>}
        <ul className="stapel">
          {gewaehlt.map((key) => {
            const f = felder.find((x) => x.key === key);
            const v = karte.werte[key];
            return (
              <li key={key} className="bedingungszeile">
                <strong>{f ? feldLabel(f) : key}</strong>
                {f?.typ === 'auswahl' ? <select value={String(v ?? '')} onChange={(x) => setze({ ...karte, werte: { ...karte.werte, [key]: x.target.value } })}><option value="">–</option>{(f.optionen ?? []).map((o) => <option key={o} value={o}>{optionText(f, o)}</option>)}</select>
                  : f?.typ === 'janein' ? <select value={v === true ? 'ja' : v === false ? 'nein' : ''} onChange={(x) => setze({ ...karte, werte: { ...karte.werte, [key]: x.target.value === 'ja' } })}><option value="ja">{t('automatisierung.ui.ja')}</option><option value="nein">{t('automatisierung.ui.nein')}</option></select>
                    : <input value={String(v ?? '')} placeholder={f?.typ === 'datum' ? t('automatisierung.ui.karte.dann.feld.datum') : ''} onChange={(x) => setze({ ...karte, werte: { ...karte.werte, [key]: x.target.value } })} />}
                <button type="button" className="textknopf gefahr klein" onClick={() => { const w = { ...karte.werte }; delete w[key]; setze({ ...karte, werte: w }); }}>{t('automatisierung.ui.entfernen')}</button>
              </li>
            );
          })}
        </ul>
        {typ && <select value="" aria-label={t('automatisierung.ui.karte.dann.feld.waehlen')} onChange={(x) => { if (x.target.value) setze({ ...karte, werte: { ...karte.werte, [x.target.value]: '' } }); }}>
          <option value="">{t('automatisierung.ui.karte.dann.feld.waehlen')}</option>
          {felder.filter((f) => !gewaehlt.includes(f.key)).map((f) => <option key={f.key} value={f.key}>{feldLabel(f)}</option>)}
        </select>}
        <Platzhalter wenn={wenn} typ={typ} einfuegen={(x) => { const letzt = gewaehlt[gewaehlt.length - 1]; if (letzt) setze({ ...karte, werte: { ...karte.werte, [letzt]: `${String(karte.werte[letzt] ?? '')}${x}` } }); }} />
      </div>
    );
  }
  return (
    <div className="karte offen">
      <div className="raster">
        <label className="eigenschaft"><span>{t('automatisierung.ui.karte.dann.aufgabe.als')}</span>
          <select value={karte.als} onChange={(x) => setze({ ...karte, als: x.target.value as 'aufgabe' | 'benachrichtigung' })}>
            <option value="aufgabe">{t('automatisierung.karte.aufgabe.als-aufgabe')}</option><option value="benachrichtigung">{t('automatisierung.karte.aufgabe.als-benachrichtigung')}</option>
          </select></label>
        {karte.als === 'aufgabe' && wenn.art !== 'datum' && <label className="eigenschaft"><span>{t('automatisierung.ui.karte.dann.aufgabe.faellig')}</span>
          <input type="number" min={0} max={3650} value={karte.faellig ?? ''} onChange={(x) => setze({ ...karte, faellig: x.target.value === '' ? null : Number(x.target.value) })} /></label>}
        {karte.als === 'aufgabe' && wenn.art === 'datum' && <p className="leise breit">{t('automatisierung.ui.karte.dann.aufgabe.frist')}</p>}
      </div>
      <fieldset className="eigenschaft breit"><legend>{t('automatisierung.ui.empfaenger')}</legend>
        <ul className="stapel">
          {karte.empfaenger.map((e, i) => (
            <li key={i} className="bedingungszeile">
              <EmpfaengerWahl e={e} typ={typ} k={k} wenn={wenn} setze={(n) => setze({ ...karte, empfaenger: karte.empfaenger.map((x, j) => (j === i ? n : x)) })} />
              <button type="button" className="textknopf gefahr klein" onClick={() => setze({ ...karte, empfaenger: karte.empfaenger.filter((_, j) => j !== i) })}>{t('automatisierung.ui.entfernen')}</button>
            </li>
          ))}
        </ul>
        <button type="button" className="knopf klein" onClick={() => setze({ ...karte, empfaenger: [...karte.empfaenger, { art: 'person', id: '' }] })}>{t('automatisierung.ui.empfaenger.hinzu')}</button>
      </fieldset>
      <label className="eigenschaft breit"><span>{t('automatisierung.ui.karte.dann.aufgabe.text')}</span>
        <textarea rows={3} value={karte.text} maxLength={AUTOMATISIERUNG_GRENZEN.text} onChange={(x) => setze({ ...karte, text: x.target.value })} /></label>
      <Platzhalter wenn={wenn} typ={typ} einfuegen={(x) => setze({ ...karte, text: karte.text + x })} />
      <p className="leise klein">{t('automatisierung.ui.karte.dann.aufgabe.rechte')}</p>
    </div>
  );
}

/* ---------- Wiedergeben, Verlauf, Änderungsverlauf ---------- */

/** Karte · Ergebnis · Einzelheiten je Schritt (#707) – für Verlauf, Live-Fortschritt und Ausprobieren gleich. */
function Schritte({ l, a }: { l: Lauf; a: AutomatisierungAnsicht }) {
  const name = (x: Schritt) => x.teil === 'dann' ? vorratName({ bereich: 'dann', art: a.dann.find((k) => k.id === x.karte)?.art ?? 'stopp' }) : t.frei(`automatisierung.ui.${x.teil}`);
  return (
    <table className="aenderungen automatisierung-schritte">
      <thead><tr><th>{t('automatisierung.ui.schritte.karte')}</th><th>{t('automatisierung.ui.schritte.ergebnis')}</th><th>{t('automatisierung.ui.schritte.einzelheiten')}</th></tr></thead>
      <tbody>{l.schritte.map((x, i) => (
        <tr key={i} className={`laufschritt ${x.zustand}`}>
          <td>{name(x)}</td>
          <td><span className={`chip ${SCHRITT_ART[x.zustand] ?? ''}`}>{t.frei(`automatisierung.ui.schritt.${x.zustand}`)}</span></td>
          <td className={x.text ? '' : 'leise'}>{x.text || '–'}</td>
        </tr>
      ))}</tbody>
    </table>
  );
}

const SCHRITT_ART: Record<string, string> = { ok: 'gut', fehler: 'schlecht', laeuft: 'info', nein: 'leise', uebersprungen: 'leise', offen: 'leise' };

function Wiedergeben({ a, typ, nachher }: { a: AutomatisierungAnsicht; typ: Mappentyp | null; nachher: () => void }) {
  const [mappe, setMappe] = useState('');
  const [bekannt, setBekannt] = useState<Bezuege>({});
  const [trocken, setTrocken] = useState(true);
  const [lauf, setLauf] = useState<Lauf | null>(null);
  const [fehler, setFehler] = useState<string>();
  // Auswahl wie ein Verweisfeld (#709); vorgeschlagen werden nur Mappen, die die Automatisierung sehen darf.
  const quelle = useCallback((suche: string) => api.automatisierungTestmappen(a.id, suche), [a.id]);
  return (
    <div className="blatt">
      <h2 className="h3">{t('automatisierung.ui.wiedergeben')}</h2>
      <p className="leise klein">{t('automatisierung.ui.wiedergeben.text')}</p>
      <div className="zeile">
        {typ ? <div className="feld">
            <label htmlFor="ausprobieren-mappe" className="sr">{t('automatisierung.ui.wiedergeben.suchen')}</label>
            <MappenWahl id="ausprobieren-mappe" ziel={typ} mehrfach={false} wert={mappe || undefined} bekannt={bekannt} ohneAnlegen
              merke={(id, x) => setBekannt((y) => ({ ...y, [id]: x }))} setze={(v) => setMappe(typeof v === 'string' ? v : '')}
              platzhalter={t('automatisierung.ui.wiedergeben.suchen')} quelle={quelle} leer={t('automatisierung.ui.wiedergeben.leer', { typ: typ.name })} />
          </div>
          : <p className="leise klein">{t('automatisierung.ui.wiedergeben.ohne-typ')}</p>}
        <label className="haken klein" title={t('automatisierung.ui.trocken.hilfe')}><input type="checkbox" checked={trocken} onChange={(x) => setTrocken(x.target.checked)} /><span>{t('automatisierung.ui.trocken')}</span></label>
        <Knopf groesse="klein" gesperrt={!mappe} onClick={async () => {
          setFehler(undefined);
          try { setLauf(await api.automatisierungWiedergeben(a.id, mappe, trocken)); nachher(); } catch (e) { setFehler((e as Error).message); }
        }}>{t('automatisierung.ui.wiedergeben.los')}</Knopf>
      </div>
      {fehler && <p className="fehlertext">{fehler}</p>}
      {lauf && <Schritte l={lauf} a={a} />}
    </div>
  );
}

/** Wodurch ein Lauf ausgelöst wurde (#707): Ereignis, Probelauf, von Hand oder Wiederholung. */
function ausloeserText(l: Lauf): string {
  if (l.test) return l.trocken ? t('automatisierung.ui.trocken.kurz') : t('automatisierung.ui.verlauf.von-hand');
  if (l.wiederholtVon) return t('automatisierung.ui.verlauf.wiederholung');
  return ereignisName(l.art);
}

/**
 * Verlauf mit Live-Fortschritt (#707): dieselbe Darstellung wie die Historie einer Mappe; ein laufender Durchgang ist
 * aufgeklappt, noch nicht erreichte Karten stehen auf „wartet“. Solange der Editor offen ist, alle 2 s nachsehen
 * (mehrere Server: aus der Datenbank).
 */
function Verlauf({ a }: { a: AutomatisierungAnsicht; k: Kontextdaten; d: unknown }) {
  const d = useDaten();
  const [laeufe, setLaeufe] = useState<Lauf[] | null>(null);
  const [fehler, setFehler] = useState<string>();
  const laden = useCallback(async () => { try { setLaeufe(await api.automatisierungLaeufe(a.id)); } catch (e) { setFehler((e as Error).message); } }, [a.id]);
  useEffect(() => { void laden(); const z = setInterval(() => void laden(), 2_000); return () => clearInterval(z); }, [laden]);
  const handle = async (f: () => Promise<unknown>) => { try { await f(); await laden(); } catch (e) { setFehler((e as Error).message); } };
  const laufend = laeufe?.some((l) => l.zustand === 'laeuft');
  const eintraege: Listeneintrag[] = (laeufe ?? []).map((l) => {
    const offenFuerWiederholen = l.zustand === 'fehlgeschlagen' && !l.trocken && !l.nichtWiederholt;
    const zusammen = l.fehler ?? l.schritte.filter((x) => x.teil === 'dann' && x.text).map((x) => x.text).join(' · ');
    return {
      id: l.id, wann: zeit(l.gestartet), wer: ausloeserText(l),
      was: <>{zusammen}{l.nichtWiederholt && <span className="leise"> {t('automatisierung.ui.verlauf.nicht-wiederholt', { wer: l.nichtWiederholt.von ? d.person(l.nichtWiederholt.von) : '–', zeit: zeit(l.nichtWiederholt.zeit) })}</span>}</>,
      zustand: <span className={`chip ${ZUSTAND_ART[l.zustand] ?? ''}`}>{t.frei(`automatisierung.ui.zustand.${l.zustand}`)}</span>,
      mehr: t('automatisierung.ui.verlauf.karten', { anzahl: l.schritte.length }),
      label: t('automatisierung.ui.verlauf.eintrag', { zeit: zeit(l.gestartet), zustand: t.frei(`automatisierung.ui.zustand.${l.zustand}`) }),
      offen: l.zustand === 'laeuft',
      inhalt: <>
        <Schritte l={l} a={a} />
        {offenFuerWiederholen && <div className="knoepfe">
          <button type="button" className="knopf klein" onClick={() => void handle(() => api.automatisierungLaufWiederholen(l.id))}>{t('automatisierung.ui.wiederholen')}</button>
          <button type="button" className="knopf klein" onClick={() => void handle(() => api.automatisierungLaufNichtWiederholen(l.id))}>{t('automatisierung.ui.nicht-wiederholen')}</button>
        </div>}
      </>,
    };
  });
  return (
    <div className="blatt">
      <h2 className="h3">{t('automatisierung.ui.verlauf')}</h2>
      {fehler && <p className="fehlertext">{fehler}</p>}
      {laufend && <p className="leise klein" role="status">{t('automatisierung.ui.verlauf.laeuft')}</p>}
      {!laeufe ? <p className="leise">{t('automatisierung.ui.lade')}</p> : !laeufe.length ? <p className="leise">{t('automatisierung.ui.verlauf.leer')}</p> : <Eintragsliste eintraege={eintraege} />}
    </div>
  );
}

type FassungDaten = Fassung['daten'];

/** Was sich zwischen zwei Versionen geändert hat (#707): Name, Beschreibung, Reihenfolge, an/aus, Wenn, Und, je Dann- und Sonst-Karte. */
function unterschiede(alt: FassungDaten | null, neu: FassungDaten, k: Kontextdaten, titelVon: (id: string) => string): Array<{ was: string; vorher: string; nachher: string }> {
  const zeilen: Array<{ was: string; vorher: string; nachher: string }> = [];
  const neben = (was: string, v: string, n: string) => { if (v !== n) zeilen.push({ was, vorher: v, nachher: n }); };
  const typA = alt ? kontextTyp(alt.wenn, k.typen) : null;
  const typN = kontextTyp(neu.wenn, k.typen);
  const wenn = (x: FassungDaten) => kurzform({ ...x, und: { modus: 'alle', karten: [] }, dann: [] }, k, ereignisName).replace(/^Wenn /, '').replace(/ → .*$/, '');
  const und = (x: FassungDaten, typ: Mappentyp | null) => x.und.karten.map((u) => undKurz(u, typ, k, titelVon)).join(x.und.modus === 'alle' ? ' · ' : ` ${t('automatisierung.ui.verlauf.oder')} `);
  const karte = (x: DannKarte | undefined, typ: Mappentyp | null) => !x ? '' : x.art === 'aufgabe' ? `${dannKurz(x, typ, k)}${x.text ? ` · „${x.text}“` : ''}` : x.art === 'stopp' ? vorratName({ bereich: 'dann', art: 'stopp' }) : dannKurz(x, typ, k);
  neben(t('automatisierung.ui.verlauf.name'), alt?.name ?? '', neu.name);
  neben(t('automatisierung.ui.verlauf.beschreibung'), alt?.beschreibung ?? '', neu.beschreibung);
  neben(t('automatisierung.ui.verlauf.reihenfolge'), alt ? String(alt.reihenfolge) : '', String(neu.reihenfolge));
  neben(t('automatisierung.ui.verlauf.anaus'), alt ? (alt.aktiv ? t('automatisierung.ui.an') : t('automatisierung.ui.aus')) : '', neu.aktiv ? t('automatisierung.ui.an') : t('automatisierung.ui.aus'));
  neben(t('automatisierung.ui.wenn'), alt ? wenn(alt) : '', wenn(neu));
  neben(t('automatisierung.ui.und'), alt ? und(alt, typA) : '', und(neu, typN));
  for (const bereich of ['dann', 'sonst'] as const) {
    const ids = [...new Set([...(alt?.[bereich] ?? []).map((x) => x.id), ...neu[bereich].map((x) => x.id)])];
    for (const id of ids) {
      const v = alt?.[bereich].find((x) => x.id === id) as DannKarte | undefined;
      const n = neu[bereich].find((x) => x.id === id) as DannKarte | undefined;
      const art = (n ?? v)!.art;
      neben(`${t.frei(`automatisierung.ui.${bereich}`)}: ${vorratName({ bereich: 'dann', art })}`, karte(v, typA), karte(n, typN));
    }
    const reihe = (x: FassungDaten | null) => (x?.[bereich] ?? []).map((y) => y.id).join(',');
    if (alt && reihe(alt) !== reihe(neu) && alt[bereich].length === neu[bereich].length) zeilen.push({ was: t.frei(`automatisierung.ui.${bereich}`), vorher: t('automatisierung.ui.verlauf.reihenfolge-alt'), nachher: t('automatisierung.ui.verlauf.reihenfolge-neu') });
  }
  return zeilen;
}

/** Änderungsverlauf (#707): Versionen wie die Historie einer Mappe; aufgeklappt Was · Vorher · Nachher und „Wiederherstellen“. */
function Fassungen({ a, k, nachher }: { a: AutomatisierungAnsicht; k: Kontextdaten; nachher: () => void }) {
  const d = useDaten();
  const [liste, setListe] = useState<Fassung[] | null>(null);
  const [fehler, setFehler] = useState<string>();
  useEffect(() => { api.automatisierungFassungen(a.id).then(setListe).catch((e) => setFehler((e as Error).message)); }, [a.id, a.version]);
  const neueste = liste?.[0]?.version ?? a.version;
  const eintraege: Listeneintrag[] = (liste ?? []).map((f, i) => {
    const vorher = liste![i + 1]?.daten ?? null;
    const zeilen = unterschiede(vorher, f.daten, k, (id) => d.person(id));
    const aktuell = f.version === a.version;
    return {
      id: f.version, wann: zeit(f.zeit), wer: f.von ? d.person(f.von) : '–',
      was: <><strong>{t('automatisierung.ui.version', { version: f.version })}</strong>{vorher ? (zeilen.length ? `: ${t('automatisierung.ui.verlauf.geaendert', { was: zeilen.map((z) => z.was).join(', ') })}` : '') : `: ${t('automatisierung.ui.verlauf.angelegt')}`}</>,
      zustand: aktuell ? <span className="chip gut">{t('automatisierung.ui.version.aktuell')}</span> : undefined,
      mehr: vorher ? t('automatisierung.ui.verlauf.aenderungen', { anzahl: zeilen.length }) : undefined,
      label: t('automatisierung.ui.version', { version: f.version }),
      inhalt: <>
        {zeilen.length > 0 && (
          <table className="aenderungen">
            <thead><tr><th>{t('automatisierung.ui.verlauf.was')}</th><th>{t('automatisierung.ui.verlauf.vorher')}</th><th>{t('automatisierung.ui.verlauf.nachher')}</th></tr></thead>
            <tbody>{zeilen.map((z, j) => <tr key={j}><td>{z.was}</td><td className={z.vorher ? '' : 'leise'}>{z.vorher || '–'}</td><td className={z.nachher ? '' : 'leise'}>{z.nachher || '–'}</td></tr>)}</tbody>
          </table>
        )}
        {!aktuell && <div className="knoepfe"><Knopf groesse="klein" onClick={async () => {
          if (!(await rueckfrage({ titel: t('automatisierung.ui.version.frage', { version: f.version }), text: t('automatisierung.ui.version.text', { version: f.version, neu: neueste + 1 }), ja: t('automatisierung.ui.version.ja') }))) return;
          try { await api.automatisierungFassungWiederherstellen(a.id, f.version); nachher(); } catch (e) { setFehler((e as Error).message); }
        }}>{t('automatisierung.ui.version.ja')}</Knopf></div>}
      </>,
    };
  });
  return (
    <div className="blatt">
      <h2 className="h3">{t('automatisierung.ui.fassungen')}</h2>
      {fehler && <p className="fehlertext">{fehler}</p>}
      {!liste ? <p className="leise">{t('automatisierung.ui.lade')}</p> : <Eintragsliste eintraege={eintraege} />}
    </div>
  );
}

/** Schalter an/aus (#706): echtes Schaltelement (`role="switch"`), Zustand als Text wie in der Liste. */
function Schalter({ an, beschriftung, onChange }: { an: boolean; beschriftung: string; onChange: (an: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={an} aria-label={beschriftung} className={`schalter${an ? ' an' : ''}`} onClick={() => onChange(!an)}>
      <span className="schalter-spur" aria-hidden="true"><span className="schalter-knopf" /></span>
      <span>{an ? t('automatisierung.ui.an') : t('automatisierung.ui.aus')}</span>
    </button>
  );
}
