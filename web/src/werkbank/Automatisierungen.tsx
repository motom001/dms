import { feldLabel, optionText } from '../../../shared/src/beschriftung';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AUTOMATISIERUNG_GRENZEN, automatisierungsProblemOrte, EREIGNIS_PERSON, PERSONEN_IM_EREIGNIS, kontextTyp, kurzform, paketKarteLeer, REIHENFOLGE, WENN_EREIGNISSE, WOCHENTAGE, zeitplanFuerPaket, zeitplanText,
  istBetrieb, istAufruf, PROTOKOLL_FILTER_MAX, PROTOKOLL_STUFEN, type WennBetrieb, aussenKarten, zielHost, type MailEmpfaenger,
  type AutomatisierungAnsicht, type AutomatisierungDaten, type AutomatisierungOrt, type DannKarte, type Empfaenger, type Fehlschlag, type Kontextdaten,
  type Lauf, type Schritt, type UndKarte, type WennKarte,
} from '../../../shared/src/automatisierung';
import { EREIGNISKATALOG, ereignisSchluessel, istBetriebWenn, type Ereignisgruppe } from '../../../shared/src/ereignisse';
import { MODULE } from '../../../shared/src/protokollmodule';
import { VORLAUF_EINHEITEN, WIEDERHOLUNGEN, type VorlaufEinheit } from '../../../shared/src/fristen';
import { einzigesZiel, jedeMappe, zieleVon, type Mappentyp } from '../../../shared/src/model';
import { bedingungsfelder, beschreibeBedingung, OPERATOREN_JE_ART, type Bedingung, type Bedingungsfeld } from '../../../shared/src/sichten';
import { automatisierungApi } from '../api/automatisierung';
import type { Bezuege } from '../api/mappen';
import { MappenWahl } from '../ablage/MappeFormular';
import { useDaten } from '../daten';
import { Listenkopf } from '../Listenkopf';
import { geheZu, Link, loeseWache } from '../ort';
import { t } from '../sprache';
import { Speicherleiste, useEntwurf } from '../Speicherleiste';
import { Ansage, umgestellt, useZiehen, Ziehgriff } from '../ziehen';
import { FeldBedingung } from './Sichten';
import { gebietsschema } from '../../../shared/src/sprache';
import { AufrufAdresse, AufrufParameterZeile, AufrufWenn } from './AutomatisierungAufruf';
import { EmailKarte, platzhalterGruppen, UrlKarte, Zustellungen } from './AutomatisierungAussen';
import { Eintragsliste, GeloeschteEintraege, Bereich, Fassungen, Feld, FeldGruppe, fehlerBereiche, HakenFeld, Knopf, KnopfLink, PaketChip, Schalter, Platzhalter, Suchfeld, useBereiche, usePlatzhalterEinsetzen, Wahlhaken, type BereichListe, type Klappe, type KnopfSperre, type Listeneintrag } from '../bausteine';
import { rueckfrage } from '../rueckfrage';
import { Symbol } from '../Symbol';
import type { InstalliertesPaket } from '../../../shared/src/pakete';
import { paketHerkunft } from './listensuche';

/**
 * Werkbank → Ablage aufbauen → Automatisierungen (#675): Mitte die Liste (Name, Kurzform, an/aus, letzter Lauf,
 * Herkunft; „nach Auslöser“ mit Reihenfolge zum Umsortieren), rechts der Editor mit Wenn · Und · Dann · Sonst wie bei Homey –
 * Karten aus dem Vorrat hineinziehen oder mit „+ Karte“ per Tastatur hinzufügen, aufklappen zum Einstellen, zuklappen
 * zur Kurzzeile. Darunter Wiedergeben (auch trocken), der Verlauf mit Live-Fortschritt und der Änderungsverlauf.
 * Sonst (#677): dieselben Karten wie Dann, wenn die Bedingungen nicht zutreffen. Werkbank-Karten (#677): Wenn „Fehler
 * gemeldet“, „Protokollmeldung“, „Neue Version verfügbar“ (ohne Mappe) und Dann „Sicherung anstoßen“. „Aufruf von
 * außen“ (#679): Parameter an der Karte, Adresse und Geheimnis darunter (`AutomatisierungAufruf.tsx`). Nach außen
 * (#671): Dann „URL aufrufen“ und „E-Mail senden“, Zustellungen und Ziele nach außen (`AutomatisierungAussen.tsx`).
 */

type Stand = { automatisierungen: AutomatisierungAnsicht[]; fehlgeschlagen: number; fehlschlaege: Fehlschlag[]; kontext: Kontextdaten; umgezogen?: { am: string; anzahl: number } | null };

export function useAutomatisierungen(offen: boolean) {
  const [stand, setStand] = useState<Stand | null>(null);
  const [fehler, setFehler] = useState<string>();
  const laden = useCallback(async () => { try { setStand(await automatisierungApi.automatisierungen()); setFehler(undefined); } catch (e) { setFehler((e as Error).message); } }, []);
  useEffect(() => { if (offen) void laden(); }, [offen, laden]);
  // Liste aktuell halten (letzter Lauf, angehalten) – mehrere Server: einfach regelmäßig nachfragen.
  useEffect(() => { if (!offen) return; const z = setInterval(() => void laden(), 15_000); return () => clearInterval(z); }, [offen, laden]);
  return { stand, fehler, laden };
}
export type AutomatisierungenZustand = ReturnType<typeof useAutomatisierungen>;

/** Für die Leiste: angehaltene oder fehlerhafte Automatisierungen. */
export const automatisierungWarnungen = (s: Stand | null) => s?.automatisierungen.filter((a) => a.aktiv && (a.angehalten || a.probleme.length)).length ?? 0;

const ereignisName = (art: string) => (art === 'datum' ? t('automatisierung.wenn.datum') : art === 'zeitplan' ? t('automatisierung.wenn.zeitplan') : art === 'aufruf' ? t('automatisierung.wenn.aufruf') : t.frei(`ereignisse.name.${ereignisSchluessel(art as never)}`));
/** Wenn-Karte ohne Mappe: Werkbank-Karten (#677) und „Aufruf von außen“ (#679). */
const ohneMappeWenn = (w: WennKarte) => istBetrieb(w) || istAufruf(w);
const zeit = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString(gebietsschema(), { dateStyle: 'short', timeStyle: 'short' }) : '');
const ZUSTAND_ART: Record<string, string> = { abgeschlossen: 'gut', unzutreffend: 'leise', uebersprungen: 'leise', fehlgeschlagen: 'schlecht', laeuft: 'info', wiederholt: 'leise' };

/** Angehalten oder mit Problem: Die Automatisierung ist an, läuft aber nicht. */
const haengt = (a: AutomatisierungAnsicht) => a.aktiv && !!(a.angehalten || a.probleme.length);
/** Angehalten (Wiederherstellung, Bremse, passt nicht mehr) – „Alle angehaltenen wieder einschalten“ (#1172). */
const istAngehalten = (a: AutomatisierungAnsicht) => a.aktiv && !!a.angehalten;

/**
 * Zustand als kleines Zeichen (#1172): an ein grüner Punkt, aus ein leerer Kreis, angehalten das Warnsymbol. Das Wort
 * steht für Screenreader dabei, der Grund im Tooltip der Zeile.
 */
function Zustandszeichen({ a }: { a: AutomatisierungAnsicht }) {
  const art = haengt(a) ? 'angehalten' : a.aktiv ? 'an' : 'aus';
  return (
    <span className={`auto-zustand ${art}`}>
      {art === 'angehalten' ? <Symbol name="warnung" /> : <span className="punkt" aria-hidden="true" />}
      <span className="sr">{t.frei(`automatisierung.ui.${art}`)}</span>
    </span>
  );
}

/** Tooltip einer Zeile: Grund fürs Anhalten bzw. Problem, Reihenfolge und letzter Lauf. */
const zeilenTipp = (a: AutomatisierungAnsicht) => [
  a.angehalten?.text ?? a.probleme[0] ?? a.rechte?.text ?? a.leer?.[0],
  [t('automatisierung.ui.liste.reihenfolge', { nr: a.reihenfolge }), a.letzterLauf && t('automatisierung.ui.liste.letzter', { zeit: zeit(a.letzterLauf.gestartet), zustand: t.frei(`automatisierung.ui.zustand.${a.letzterLauf.zustand}`) })].filter(Boolean).join(' · '),
].filter(Boolean).join('\n');

/** Gruppieren (#1172): ohne, nach Auslöser (mit Reihenfolge zum Umsortieren), nach Paket oder nach Ziel. */
type Gruppierung = 'ohne' | 'ausloeser' | 'paket' | 'ziel';
const GRUPPIERUNGEN: Gruppierung[] = ['ohne', 'ausloeser', 'paket', 'ziel'];

/**
 * Ziel einer Automatisierung (#1172): was sie bewirkt – abgeleitet aus der ersten Dann-Karte (ohne „Stopp“). Aufgabe
 * und Benachrichtigung sind verschiedene Ziele, ebenso alles, was nach außen meldet.
 */
export function zielVon(a: Pick<AutomatisierungAnsicht, 'dann'>): string {
  const k = a.dann.find((x) => x.art !== 'stopp');
  if (!k) return 'keins';
  if (k.art === 'aufgabe') return k.als === 'benachrichtigung' ? 'benachrichtigen' : 'aufgabe';
  if (k.art === 'zusammenfassung' || k.art === 'favoriten' || k.art === 'anmeldeschutz') return 'benachrichtigen';
  if (k.art === 'url' || k.art === 'email') return 'aussen';
  return k.art;
}

/* ---------- Liste ---------- */

/** Hinweise über der Liste: umgezogene Erinnerungen (#712) und fehlgeschlagene Läufe (#707). */
function ListenHinweise({ s, z, nurFehl, setNurFehl, setFehler }: { s: Stand; z: AutomatisierungenZustand; nurFehl: boolean; setNurFehl: (x: boolean) => void; setFehler: (x?: string) => void }) {
  return (
    <>
      {s.umgezogen && (
        <div className="hinweis info">
          <p><strong>{t('automatisierung.ui.umgezogen', { anzahl: s.umgezogen.anzahl })}</strong> {t('automatisierung.ui.umgezogen.text')}</p>
          <Knopf groesse="klein" onClick={async () => { try { await automatisierungApi.automatisierungUmzugGesehen(); await z.laden(); } catch (e) { setFehler((e as Error).message); } }}>{t('automatisierung.ui.umgezogen.ok')}</Knopf>
        </div>
      )}
      {!!s.fehlgeschlagen && (
        <div className="hinweis warn">
          {/* Welcher Lauf und wann (#707); bei mehreren „Anzeigen“ filtert die Liste. Probeläufe zählen nicht. */}
          <p>{s.fehlgeschlagen === 1 && s.fehlschlaege[0]
            ? <>{t('automatisierung.ui.fehlgeschlagen.einer', { name: s.fehlschlaege[0].name, zeit: zeit(s.fehlschlaege[0].gestartet) })} <Link to={`/werkbank/automatisierungen/${s.fehlschlaege[0].automatisierungId}`} className="verweis">{t('automatisierung.ui.fehlgeschlagen.anzeigen')}</Link></>
            : t('automatisierung.ui.fehlgeschlagen', { anzahl: s.fehlgeschlagen })}</p>
          <div className="knoepfe">
            {s.fehlgeschlagen > 1 && <Knopf groesse="klein" aria-pressed={nurFehl} onClick={() => setNurFehl(!nurFehl)}>{nurFehl ? t('automatisierung.ui.fehlgeschlagen.alle') : t('automatisierung.ui.fehlgeschlagen.anzeigen')}</Knopf>}
            <Knopf groesse="klein" onClick={async () => { try { await automatisierungApi.automatisierungenWiederholen(); setNurFehl(false); await z.laden(); } catch (e) { setFehler((e as Error).message); } }}>{t('automatisierung.ui.alle-wiederholen')}</Knopf>
            <Knopf groesse="klein" onClick={async () => { try { await automatisierungApi.automatisierungenNichtWiederholen(); setNurFehl(false); await z.laden(); } catch (e) { setFehler((e as Error).message); } }}>{t('automatisierung.ui.nicht-wiederholen.alle')}</Knopf>
          </div>
        </div>
      )}
    </>
  );
}


/** Ziele nach außen (#671): wohin „URL aufrufen“ darf – eine eigene Seite rechts. */
function ZieleLink({ an, anzahl }: { an: boolean; anzahl: number }) {
  return <p className="klein"><Link to="/werkbank/automatisierungen/ziele" className={`verweis tippziel${an ? ' an' : ''}`}>{t('automatisierung.ui.ziele.link', { anzahl })}</Link></p>;
}

/** Mehrfachauswahl (#1172): Leiste mit Ein- und Ausschalten für die Auswahl, sobald etwas gewählt ist. */
function Auswahlleiste({ anzahl, schalte, aufheben }: { anzahl: number; schalte: (an: boolean) => Promise<void>; aufheben: () => void }) {
  if (!anzahl) return null;
  return (
    <div className="aktionsleiste auto-auswahl" role="region" aria-label={t('automatisierung.ui.liste.auswahl')}>
      <span>{t('automatisierung.ui.liste.gewaehlt', { anzahl })}</span>
      <Knopf groesse="klein" onClick={() => schalte(true)}>{t('automatisierung.ui.liste.einschalten')}</Knopf>
      <Knopf groesse="klein" onClick={() => schalte(false)}>{t('automatisierung.ui.liste.ausschalten')}</Knopf>
      <span className="luecke" />
      <Knopf art="link" groesse="klein" onClick={aufheben}>{t('automatisierung.ui.liste.auswahl-aufheben')}</Knopf>
    </div>
  );
}

export function AutomatisierungenListe({ z, offen, pakete = [] }: { z: AutomatisierungenZustand; offen?: string; pakete?: InstalliertesPaket[] }) {
  const [gruppierung, setGruppierung] = useState<Gruppierung>('ohne');
  const [suche, setSuche] = useState('');
  const [ansage, setAnsage] = useState('');
  const [fehler, setFehler] = useState<string>();
  const [auswahl, setAuswahl] = useState<Set<string>>(new Set());
  const [schaltFehler, setSchaltFehler] = useState<string[]>([]);
  const s = z.stand;
  // „Anzeigen“ beim Hinweis über fehlgeschlagene Läufe (#707): nur die betroffenen Automatisierungen.
  const [nurFehl, setNurFehl] = useState(false);
  const betroffen = new Set((s?.fehlschlaege ?? []).map((f) => f.automatisierungId));
  const liste = (s?.automatisierungen ?? []).filter((a) => (!nurFehl || betroffen.has(a.id)) && (!suche.trim() || `${a.name} ${a.kurz}`.toLowerCase().includes(suche.trim().toLowerCase())));
  const herkunft = (a: AutomatisierungAnsicht) => (a.herkunft === 'dms' ? 'ablago' : a.herkunft === 'paket' ? paketHerkunft(a.paketId, pakete) : null);
  const gruppen = useMemo(() => {
    const schluessel = (a: AutomatisierungAnsicht) => (gruppierung === 'ausloeser' ? a.ausloeser : gruppierung === 'paket' ? (a.herkunft === 'paket' ? `paket:${a.paketId}` : a.herkunft) : zielVon(a));
    const m = new Map<string, AutomatisierungAnsicht[]>();
    for (const a of liste) m.set(schluessel(a), [...(m.get(schluessel(a)) ?? []), a]);
    return [...m.entries()];
  }, [liste, gruppierung]);
  const gruppenTitel = (k: string, g: AutomatisierungAnsicht[]) => {
    if (gruppierung === 'ausloeser') return g[0].kurz.split(' →')[0];
    if (gruppierung === 'ziel') return t.frei(`automatisierung.ui.liste.ziel.${k}`);
    if (k === 'eigen') return t('automatisierung.ui.liste.eigene');
    if (k === 'dms') return t('oberflaeche.paketchip.ablago');
    return paketHerkunft(g[0].paketId, pakete)?.name ?? g[0].paketId ?? '';
  };
  // Mehrfachauswahl (#1172): nur, was gerade in der Liste steht.
  const sichtbar = liste.map((a) => a.id);
  const gewaehlt = sichtbar.filter((id) => auswahl.has(id));
  const waehle = (id: string, an: boolean) => setAuswahl((x) => { const y = new Set(x); if (an) y.add(id); else y.delete(id); return y; });
  const angehaltene = (s?.automatisierungen ?? []).filter(istAngehalten);
  /** Ein- bzw. ausschalten, eine nach der anderen; was nicht geht (passt nicht mehr), bleibt mit Grund stehen. */
  async function schalte(ids: string[], an: boolean) {
    setFehler(undefined); setSchaltFehler([]);
    const nicht: string[] = [];
    let n = 0;
    for (const id of ids) {
      const a = s?.automatisierungen.find((x) => x.id === id);
      try { await automatisierungApi.automatisierungSchalten(id, an); n++; } catch (e) { nicht.push(`${a?.name ?? id}: ${(e as Error).message}`); }
    }
    setSchaltFehler(nicht);
    setAnsage(t(an ? 'automatisierung.ui.liste.eingeschaltet' : 'automatisierung.ui.liste.ausgeschaltet', { anzahl: n }));
    setAuswahl(new Set());
    await z.laden();
  }
  async function angehalteneEinschalten() {
    const ja = await rueckfrage({
      titel: t('automatisierung.ui.liste.angehaltene.frage', { anzahl: angehaltene.length }),
      text: <>{t('automatisierung.ui.liste.angehaltene.text')}<ul>{angehaltene.map((a) => <li key={a.id}>{a.name}</li>)}</ul></>,
      ja: t('automatisierung.ui.wieder-einschalten'),
    });
    if (ja) await schalte(angehaltene.map((a) => a.id), true);
  }
  // Umsortieren in einer Gruppe: Nummern im Abstand 10 neu vergeben (Reihenfolge 1–99).
  async function sortiere(gruppe: AutomatisierungAnsicht[], neu: AutomatisierungAnsicht[]) {
    setFehler(undefined);
    try {
      const start = Math.max(REIHENFOLGE.min, Math.min(gruppe[0].reihenfolge, REIHENFOLGE.max - 10 * (neu.length - 1)));
      for (const [i, a] of neu.entries()) {
        const r = Math.min(REIHENFOLGE.max, start + i * 10);
        if (a.reihenfolge !== r) await automatisierungApi.automatisierungAendern(a.id, { reihenfolge: r, version: a.version });
      }
      setAnsage(t('automatisierung.ui.liste.sortiert'));
      await z.laden();
    } catch (e) { setFehler((e as Error).message); }
  }
  const zieh = useZiehen({
    erlaubt: (q, ziel) => gruppierung === 'ausloeser' && gruppen.some(([, g]) => g.some((a) => a.id === q) && g.some((a) => a.id === ziel)),
    fertig: (q, ziel, ort) => {
      const g = gruppen.find(([, x]) => x.some((a) => a.id === q))?.[1];
      if (g) void sortiere(g, umgestellt(g, g.findIndex((a) => a.id === q), g.findIndex((a) => a.id === ziel), ort === 'in' ? 'nach' : ort));
    },
  });
  // Eine Zeile (#1172): höchstens zwei Zeilen – Zeichen, Name und Paket, darunter leise die Kurzform; der Grund im Tooltip.
  const eintrag = (a: AutomatisierungAnsicht, g?: AutomatisierungAnsicht[]) => {
    const i = g?.findIndex((x) => x.id === a.id) ?? -1;
    const e = g ? zieh.eintrag(a.id) : {};
    const { className, ...rest } = e as { className?: string };
    return (
      <li key={a.id} {...rest} className={`auto-zeile${auswahl.has(a.id) ? ' gewaehlt' : ''}${className ? ` ${className}` : ''}`}>
        <Wahlhaken an={auswahl.has(a.id)} beschriftung={t('automatisierung.ui.liste.waehlen', { name: a.name })} setze={(an) => waehle(a.id, an)} />
        {g && g.length > 1 && <Ziehgriff griff={zieh.griff(a.id, a.name)} tasten={{
          hoch: i > 0 ? () => void sortiere(g, umgestellt(g, i, i - 1, 'vor')) : undefined,
          runter: i < g.length - 1 ? () => void sortiere(g, umgestellt(g, i, i + 1, 'nach')) : undefined,
        }} />}
        <Link to={`/werkbank/automatisierungen/${a.id}`} className={`eintrag werk ${offen === a.id ? 'an' : ''}`} title={zeilenTipp(a)}>
          <span className="titel"><Zustandszeichen a={a} /><span className="name">{a.name}</span><PaketChip paket={herkunft(a)} inLink /></span>
          <span className="unter leise">{a.kurz}</span>
        </Link>
      </li>
    );
  };
  return (
    <>
      <Listenkopf titel={t('automatisierung.ui.titel')} hilfe="werkbank.automatisierungen" beschreibung={t('automatisierung.ui.beschreibung')}>
        <KnopfLink to="/werkbank/automatisierungen/neu" art="anlegen" groesse="klein">{t('automatisierung.ui.neu')}</KnopfLink>
      </Listenkopf>
      {/* Ziele nach außen (#671): wohin „URL aufrufen“ darf – eine eigene Seite rechts. */}
      <ZieleLink an={offen === 'ziele'} anzahl={s?.kontext.ziele?.length ?? 0} />
      {z.fehler && <div className="hinweis schlecht"><p>{z.fehler}</p></div>}
      {fehler && <div className="hinweis schlecht"><p>{fehler}</p></div>}
      {s && <ListenHinweise s={s} z={z} nurFehl={nurFehl} setNurFehl={setNurFehl} setFehler={setFehler} />}
      {/* Nach einer Wiederherstellung (#1172): alle angehaltenen auf einmal – mit Rückfrage, die sie nennt. */}
      {angehaltene.length > 0 && <div className="knoepfe"><Knopf onClick={angehalteneEinschalten}>{t('automatisierung.ui.liste.angehaltene', { anzahl: angehaltene.length })}</Knopf></div>}
      <Ansage text={ansage} />
      {schaltFehler.length > 0 && <div className="hinweis schlecht" role="alert"><p>{t('automatisierung.ui.liste.nicht-geschaltet')}</p><ul>{schaltFehler.map((x) => <li key={x}>{x}</li>)}</ul></div>}
      {!s ? <p className="leise">{t('automatisierung.ui.lade')}</p> : !s.automatisierungen.length ? <p className="leise leerliste">{t('automatisierung.ui.leer')}</p> : <>
        <Suchfeld wert={suche} setze={setSuche} beschriftung={t('automatisierung.ui.suchen')} platzhalter={t('automatisierung.ui.suchen')} />
        <div className="zeile auto-werkzeuge">
          <HakenFeld beschriftung={t('automatisierung.ui.liste.alle-waehlen')} className="klein">
            <input type="checkbox" checked={!!sichtbar.length && gewaehlt.length === sichtbar.length} onChange={(x) => setAuswahl(x.target.checked ? new Set(sichtbar) : new Set())} />
          </HakenFeld>
          {/* Eine Auswahl statt eines Umschalters: Vier Wahlen passen in die schmale Liste nicht nebeneinander. */}
          <Feld beschriftung={t('automatisierung.ui.liste.gruppieren')} beschriftungVerbergen className="klein">
            <select value={gruppierung} onChange={(x) => setGruppierung(x.target.value as Gruppierung)}>
              {GRUPPIERUNGEN.map((x) => <option key={x} value={x}>{t.frei(`automatisierung.ui.liste.gruppierung.${x}`)}</option>)}
            </select>
          </Feld>
        </div>
        <Auswahlleiste anzahl={gewaehlt.length} schalte={(an) => schalte(gewaehlt, an)} aufheben={() => setAuswahl(new Set())} />
        {gruppierung !== 'ohne'
          ? gruppen.map(([k, g]) => (
              <section key={k} className="automatisierung-gruppe" aria-label={gruppenTitel(k, g)}>
                <h2 className="h3 klein">{gruppenTitel(k, g)}{gruppierung === 'ausloeser' && g.length > 1 ? <span className="leise"> · {t('automatisierung.ui.liste.gruppe', { anzahl: g.length })}</span> : <span className="leise"> · {g.length}</span>}</h2>
                <ul className="mappenliste auto-liste">{g.map((a) => eintrag(a, gruppierung === 'ausloeser' ? g : undefined))}</ul>
              </section>
            ))
          : <ul className="mappenliste auto-liste">{liste.map((a) => eintrag(a))}</ul>}
      </>}
      <GeloeschteEintraege art="automatisierung" />
    </>
  );
}

/* ---------- Editor ---------- */

type Entwurf = AutomatisierungDaten & { aktiv: boolean };
// Neue Automatisierungen sind vorgegeben „an“ (#706) – wirksam erst mit dem Speichern.
const LEER: Entwurf = { name: '', beschreibung: '', reihenfolge: REIHENFOLGE.eigen, wenn: { art: 'mappe.geaendert', typ: null }, und: { modus: 'alle', karten: [] }, dann: [], sonst: [], aktiv: true };
const kopie = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const neueId = () => `k${Math.random().toString(36).slice(2, 8)}`;

/** Karten im Vorrat: Art und Name; „wenn“ ersetzt die Wenn-Karte, „und“/„dann“ hängen an (Dann-Karten auch an Sonst). */
const VORRAT: Array<{ bereich: 'wenn' | 'und' | 'dann'; art: string }> = [
  { bereich: 'wenn', art: 'datum' }, { bereich: 'wenn', art: 'zeitplan' }, { bereich: 'wenn', art: 'aufruf' }, ...WENN_EREIGNISSE.map((a) => ({ bereich: 'wenn' as const, art: a })),
  { bereich: 'und', art: 'bedingung' }, { bereich: 'und', art: 'ansicht' }, { bereich: 'und', art: 'favorit' }, { bereich: 'und', art: 'merkmal' }, { bereich: 'und', art: 'gruppe' },
  { bereich: 'dann', art: 'feld' }, { bereich: 'dann', art: 'aufgabe' },
  // #678: Benachrichtigungen – passen nur zu ihrer Wenn-Karte (Zeitplan je Benutzer, Favorit geändert, Zeitplan bzw. Kontosperre).
  { bereich: 'dann', art: 'zusammenfassung' }, { bereich: 'dann', art: 'favoriten' }, { bereich: 'dann', art: 'anmeldeschutz' },
  // #1082: nur mit „Zeitplan“ (nicht für jeden Benutzer) und wenn ein Paket Zeitpläne annimmt.
  { bereich: 'dann', art: 'paket' },
  // #677: Werkbank-Recht des Systemkontos – passt zu jeder Wenn-Karte.
  { bereich: 'dann', art: 'sicherung' },
  // #671: nach außen – passen zu jeder Wenn-Karte.
  { bereich: 'dann', art: 'url' }, { bereich: 'dann', art: 'email' },
  { bereich: 'dann', art: 'stopp' },
];
type Zweig = 'dann' | 'sonst';
/** Nach Wahl der Wenn-Karte nur passende Karten: „Feld ändern“ braucht einen Mappentyp, „in Ansicht“ eine Ansicht dafür. */
const sichtenFuer = (k: Kontextdaten, typ: Mappentyp | null) => k.sichten.filter((s) => !typ || !s.typen?.length || s.typen.includes(typ.id) || s.typen.includes('*'));
// Werkbank-Karten ohne Mappe (#677) und Aufruf von außen (#679): als Bedingung nur ein Merkmal der Ablage.
const passt = (v: { art: string }, typ: Mappentyp | null, k: Kontextdaten, w?: WennKarte) => (w && ohneMappeWenn(w) && ['bedingung', 'ansicht', 'favorit', 'gruppe'].includes(v.art) ? false
  : v.art === 'feld' ? !!typ : v.art === 'ansicht' ? sichtenFuer(k, typ).length > 0
  : v.art === 'zusammenfassung' ? w?.art === 'zeitplan' && w.jeBenutzer : v.art === 'favoriten' ? w?.art === 'favorit.geaendert'
    : v.art === 'anmeldeschutz' ? (w?.art === 'zeitplan' && !w.jeBenutzer) || w?.art === 'benutzer.gesperrt'
      : v.art === 'paket' ? !!w && zeitplanFuerPaket(w) && (k.pakete ?? []).some((p) => p.zeitplan) : true);
const vorratName = (v: { bereich: string; art: string }) => (v.bereich === 'wenn' ? ereignisName(v.art) : t.frei(`automatisierung.ui.karte.${v.bereich}.${v.art}`));

/** Bereiche einer Automatisierung (#1000): neu Grunddaten, Wenn und Dann; gespeichert dazu Ausprobieren, Verlauf, Fassungen. */
type AutoBereich = 'grunddaten' | 'wenn' | 'dann' | 'ausprobieren' | 'verlauf' | 'zustellungen' | 'fassungen';
/** Zustellungen (#671) nur mit Karten nach außen. */
function automatisierungBereiche(gespeichert: boolean, aussen = false): BereichListe<AutoBereich> {
  return [
    ['grunddaten', t('automatisierung.ui.bereich.grunddaten')], ['wenn', t('automatisierung.ui.wenn')], ['dann', t('automatisierung.ui.dann')],
    ...(gespeichert ? [['ausprobieren', t('automatisierung.ui.wiedergeben')], ['verlauf', t('automatisierung.ui.verlauf')]] as const : []),
    ...(gespeichert && aussen ? [['zustellungen', t('automatisierung.ui.zustellungen')]] as const : []),
    ...(gespeichert ? [['fassungen', t('oberflaeche.fassungen.titel')]] as const : []),
  ];
}

export function AutomatisierungEditor({ z, id }: { z: AutomatisierungenZustand; id: string }) {
  const d = useDaten();
  const neu = id === 'neu';
  const a = neu ? undefined : z.stand?.automatisierungen.find((x) => x.id === id);
  const k = z.stand?.kontext;
  const gespeichert: Entwurf = a ? { name: a.name, beschreibung: a.beschreibung, reihenfolge: a.reihenfolge, wenn: a.wenn, und: a.und, dann: a.dann, sonst: a.sonst, aktiv: a.aktiv } : LEER;
  const [e, setE] = useState<Entwurf>(() => kopie(gespeichert));
  const [offenKarte, setOffenKarte] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const [sendet, setSendet] = useState(false);
  const [vorratOffen, setVorratOffen] = useState(false);
  const [ansage, setAnsage] = useState('');
  const [fehlerOrte, setFehlerOrte] = useState<Set<AutoBereich>>(new Set());
  const ent = useEntwurf(gespeichert, e, { neu, zuruecksetzen: () => { setE(kopie(gespeichert)); setFehlerOrte(new Set()); }, liste: '/werkbank/automatisierungen' });
  // Sprungleiste und Bereiche (#1000) wie beim Mappentyp; Ausprobieren, Verlauf und Fassungen erst nach dem Anlegen.
  const liste = automatisierungBereiche(!!a, !!a && aussenKarten(a).length > 0);
  const b = useBereiche(liste, 'automatisierung', a ? id : null);
  // Karten aus dem Vorrat in Wenn, Und, Dann oder Sonst ziehen (Sonst nimmt die Dann-Karten); umsortieren in KartenListe.
  const vorratFuer = (ziel: string) => (ziel === 'sonst' ? 'dann' : ziel);
  const ablage = useZiehen({ erlaubt: (quelle, ziel) => quelle.startsWith(`${vorratFuer(ziel)}|`), fertig: (quelle, ziel) => { const [b, art] = quelle.split('|'); if (b === vorratFuer(ziel)) fuegeHinzu(ziel, art); } });
  if (!k) return z.fehler ? <div className="hinweis schlecht"><p>{z.fehler}</p></div> : <p className="leise">{t('automatisierung.ui.lade')}</p>;
  if (!neu && !a) return <div className="platzhalter"><p>{t('automatisierung.nicht-gefunden')}</p></div>;
  const typ = kontextTyp(e.wenn, k.typen);
  const probleme = automatisierungsProblemOrte(e, k);
  // Bereiche mit Fehler (#1000): vom Server gemeldet oder – bei gespeicherten Automatisierungen – schon beim Bearbeiten.
  const hatFehler = (x: AutoBereich) => fehlerOrte.has(x) || (!neu && probleme.some((p) => p.ort === x));
  const klappe = (x: AutoBereich) => b.klappe(x, hatFehler(x));
  const kurzWenn = kurzform({ ...e, dann: [] }, k, ereignisName).replace(/ → .*$/, '');
  const gleiche = z.stand!.automatisierungen.filter((x) => x.ausloeser === (a?.ausloeser ?? '') && x.aktiv);
  const position = a ? gleiche.findIndex((x) => x.id === a.id) + 1 : 0;

  function fuegeHinzu(bereich: string, art: string) {
    if (bereich === 'wenn') setE({ ...e, wenn: neueWenn(art, e.wenn, typ, k!) });
    if (bereich === 'und') setE({ ...e, und: { ...e.und, karten: [...e.und.karten, neueUnd(art, typ)] } });
    if (bereich === 'dann' || bereich === 'sonst') { const n = neueDann(art, e.wenn, k!); setE({ ...e, [bereich]: [...e[bereich], n] }); setOffenKarte(n.id); }
    setAnsage(t('automatisierung.ui.hinzugefuegt', { name: vorratName({ bereich: bereich === 'sonst' ? 'dann' : bereich, art }) }));
  }

  const speichern = async () => {
    setSendet(true); setMeldung(undefined);
    try {
      const x = neu ? await automatisierungApi.automatisierungAnlegen(e) : await automatisierungApi.automatisierungAendern(a!.id, { ...e, version: a!.version });
      await z.laden();
      loeseWache();
      if (neu) { b.merke(x.id); geheZu(`/werkbank/automatisierungen/${x.id}`, true); }
      setMeldung({ art: 'gut', text: t('automatisierung.ui.gespeichert') }); setFehlerOrte(new Set());
    } catch (x) {
      setMeldung({ art: 'schlecht', text: (x as Error).message });
      const orte = fehlerBereiche(x, liste, []);
      setFehlerOrte(new Set(orte)); b.oeffne(orte);
    } finally { setSendet(false); }
  };
  async function aktion(f: () => Promise<unknown>, gut: string) {
    setMeldung(undefined);
    try { await f(); await z.laden(); setMeldung({ art: 'gut', text: gut }); } catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); }
  }

  return (
    <div className="editorform automatisierung">
      <div className="mappenkopf">
        <p className="ueber">{t('automatisierung.ui.ueber')}</p>
        <h1>{neu ? t('automatisierung.ui.neu.titel') : a!.name}</h1>
        {/* Kann nie laufen, weil das Konto „Automatisierung“ den Mappentyp nicht lesen darf (#709): Hinweis mit Weg zum Testlauf (#710). */}
        {/* „Paket nach Zeitplan ausführen“ läuft ins Leere (#1082): Paket entfernt oder ohne das Ereignis – kein Fehler. */}
        {a?.leer?.map((x) => <div key={x} className="hinweis warn" role="status"><p>{x}</p></div>)}
        {a?.rechte && <div className="hinweis warn" role="status"><p>{a.rechte.text} <Link to={`/werkbank/typen/${a.rechte.typId}${a.rechte.kontoId ? `?testkonto=${a.rechte.kontoId}` : ''}#testlauf`} className="verweis">{t('automatisierung.ui.rechte.link')}</Link></p></div>}
        {a && <p className="leise">{a.kurz}{position > 0 && gleiche.length > 1 && <> · {t('automatisierung.ui.position', { nr: position, anzahl: gleiche.length })}</>}</p>}
        {/* An/aus an einer Stelle (#706): neu wirkt der Schalter mit dem Speichern, sonst sofort. Er steht immer hier (#1173):
            angehalten ist er aus, der Grund steht einmal daneben, und Wieder-Einschalten ist das Umlegen. Keine Meldung
            danach – der Schalter zeigt den Zustand selbst; nur ein Fehler steht am Schalter. */}
        <div className="zeile handlungen">
          <Schalter an={a ? a.aktiv && !a.angehalten : e.aktiv} beschriftung={t('automatisierung.ui.schalter')} beschriftungVerbergen
            hinweis={a?.aktiv && a.angehalten ? a.angehalten.text : neu ? t('automatisierung.ui.schalter.neu') : undefined}
            setze={(an) => { if (!a) { setE({ ...e, aktiv: an }); return; } return automatisierungApi.automatisierungSchalten(a.id, an).then(() => z.laden()); }} />
          {a && <Knopf onClick={() => aktion(async () => { const x = await automatisierungApi.automatisierungKopieren(a.id); geheZu(`/werkbank/automatisierungen/${x.id}`); }, t('automatisierung.ui.kopiert'))}>{t('automatisierung.ui.kopieren')}</Knopf>}
        </div>
      </div>
      {b.leiste(hatFehler, t('automatisierung.ui.bereiche'))}
      {meldung && <div className={`hinweis ${meldung.art}`}><p>{meldung.text}</p></div>}
      <Ansage text={ansage} />
      <form id="auto-formular" className="editorform" onSubmit={(x) => { x.preventDefault(); void speichern(); }} onKeyDown={ent.tasten}>
        <Bereich id="grunddaten" titel={t('automatisierung.ui.bereich.grunddaten')} klappe={klappe('grunddaten')} kurz={[e.name, t('automatisierung.ui.bereich.reihenfolge', { reihenfolge: e.reihenfolge })].filter(Boolean).join(' · ')}>
          <div className="raster">
            <Feld beschriftung={t('automatisierung.ui.name')}><input id="auto-name" value={e.name} maxLength={AUTOMATISIERUNG_GRENZEN.name} onChange={(x) => setE({ ...e, name: x.target.value })} required /></Feld>
            <Feld beschriftung={<>{t('automatisierung.ui.reihenfolge')} <small>{t('automatisierung.ui.reihenfolge.hilfe')}</small></>}>
              <input id="auto-reihenfolge" type="number" min={REIHENFOLGE.min} max={REIHENFOLGE.max} value={e.reihenfolge} onChange={(x) => setE({ ...e, reihenfolge: Number(x.target.value) })} /></Feld>
            <Feld beschriftung={t('automatisierung.ui.beschreibung.feld')} className="breit"><textarea rows={2} value={e.beschreibung} onChange={(x) => setE({ ...e, beschreibung: x.target.value })} /></Feld>
          </div>
          <Probleme liste={probleme} ort="grunddaten" />
        </Bereich>
        {/* Wenn mit den Und-Bedingungen (#1000): was die Automatisierung auslöst und wann sie weitermacht. */}
        <Bereich id="wenn" titel={t('automatisierung.ui.wenn')} klappe={klappe('wenn')} kurz={kurzWenn}>
          <div className="zeile"><Knopf art="link" groesse="klein" aria-expanded={vorratOffen} onClick={() => setVorratOffen(!vorratOffen)}>{t('automatisierung.ui.vorrat')}</Knopf></div>
          {vorratOffen && <Vorrat ablage={ablage} fuegeHinzu={fuegeHinzu} passend={(v) => passt(v, typ, k, e.wenn)} />}
          <Bereichskasten hinweis={t('automatisierung.ui.wenn.hinweis')} ablage={ablage.ablage('wenn')}>
            <WennEditor w={e.wenn} k={k} setze={(w) => setE({ ...e, wenn: w })} />
          </Bereichskasten>
          {/* Aufruf von außen (#679): Adresse und Geheimnis erst an einer gespeicherten Karte. */}
          {istAufruf(e.wenn) && (a && istAufruf(a.wenn) ? <AufrufAdresse a={a} parameter={e.wenn.parameter} nachher={z.laden} /> : <p className="leise klein">{t('automatisierung.ui.aufruf.erst-speichern')}</p>)}
          <div className="automatisierung-pfeil" aria-hidden="true"><Symbol name="sortiert-ab" /></div>
          <Bereichskasten titel={t('automatisierung.ui.und')} hinweis={e.und.karten.length ? undefined : t('automatisierung.ui.und.leer')} ablage={ablage.ablage('und')}
            kopf={e.und.karten.length > 1 && <Feld beschriftung={t('automatisierung.ui.und.modus')} beschriftungVerbergen><select value={e.und.modus} onChange={(x) => setE({ ...e, und: { ...e.und, modus: x.target.value as 'alle' | 'eine' } })}>
              <option value="alle">{t('automatisierung.ui.und.alle')}</option><option value="eine">{t('automatisierung.ui.und.eine')}</option>
            </select></Feld>}
            fuss={<KarteHinzu bereich="und" fuegeHinzu={fuegeHinzu} passend={(v) => passt(v, typ, k, e.wenn)} />}>
            <UndListe karten={e.und.karten} typ={typ} k={k} setze={(karten) => setE({ ...e, und: { ...e.und, karten } })} />
          </Bereichskasten>
          <Probleme liste={probleme} ort="wenn" />
        </Bereich>
        {/* Dann und Sonst (#677): Sonst läuft, wenn Und nicht zutrifft. */}
        <Bereich id="dann" titel={t('automatisierung.ui.dann')} klappe={klappe('dann')}
          kurz={[e.dann.length ? e.dann.map((x) => vorratName({ bereich: 'dann', art: x.art })).join(' · ') : t('automatisierung.ui.dann.leer'),
            ...(e.sonst.length ? [t('automatisierung.ui.sonst.kurz', { karten: e.sonst.map((x) => vorratName({ bereich: 'dann', art: x.art })).join(' · ') })] : [])].join('; ')}>
          {(['dann', 'sonst'] as const).map((zweig) => (
            <Bereichskasten key={zweig} titel={zweig === 'sonst' ? t('automatisierung.ui.sonst') : undefined} hinweis={e[zweig].length ? (zweig === 'sonst' ? t('automatisierung.ui.sonst.hinweis') : undefined) : t.frei(`automatisierung.ui.${zweig}.leer`)}
              ablage={ablage.ablage(zweig)} fuss={<KarteHinzu bereich={zweig} fuegeHinzu={fuegeHinzu} passend={(v) => passt(v, typ, k, e.wenn)} />}>
              <KartenListe zweig={zweig} karten={e[zweig]} setze={(x) => setE((alt) => ({ ...alt, [zweig]: x }))} offen={offenKarte} setOffen={setOffenKarte}
                editor={(karte, setze) => <DannEditor karte={karte} typ={typ} wenn={e.wenn} k={k} a={a} eigenesPaket={a?.herkunft === 'paket' ? a.paketId ?? null : undefined} setze={setze} />}
                kurz={(karte) => dannKurz(karte, typ, k)} />
            </Bereichskasten>
          ))}
          <Probleme liste={probleme} ort="dann" />
        </Bereich>
      </form>
      {a && <>
        <Wiedergeben a={a} typ={kontextTyp(a.wenn, k.typen)} nachher={() => void z.laden()} klappe={klappe('ausprobieren')} />
        <Verlauf a={a} k={k} d={d.typ} klappe={klappe('verlauf')} />
        {aussenKarten(a).length > 0 && <Zustellungen a={a} klappe={klappe('zustellungen')} />}
        <Fassungen art="automatisierung" eintrag={a.id} stand={a.version} nachher={() => z.laden()} klappe={klappe('fassungen')} />
      </>}
      <Speicherleiste ent={ent} gegenstand={t('automatisierung.ui.gegenstand')} sendet={sendet} ungueltig={probleme.length > 0} formular="auto-formular"
        meldung={meldung?.art === 'schlecht' ? meldung : undefined}
        loeschen={a ? {
          text: t('automatisierung.ui.loeschen'),
          rueckfrage: { titel: t('automatisierung.ui.loeschen.frage', { name: a.name }), text: t('automatisierung.ui.loeschen.text'), ja: t('automatisierung.ui.loeschen') },
          onClick: () => { void aktion(async () => { await automatisierungApi.automatisierungLoeschen(a.id); loeseWache(); geheZu('/werkbank/automatisierungen', true); }, t('automatisierung.ui.geloescht')); },
          // Mitgeliefert (#1174): nicht löschbar – das Paket legte sie wieder an. Statt eines fehlenden Knopfs die Erklärung.
          gesperrt: a.herkunft === 'eigen' ? null : mitgeliefertSperre(a, k),
        } : undefined} />
    </div>
  );
}

/**
 * Warum sich eine mitgelieferte Automatisierung nicht löschen lässt (#1174): Sie kommt aus einem Paket (bzw. mit Ablago),
 * das sie beim nächsten Update wieder anlegte. Statt zu löschen: ausschalten – aus bleibt aus, auch nach Updates.
 */
function mitgeliefertSperre(a: AutomatisierungAnsicht, k: Kontextdaten): KnopfSperre {
  if (a.herkunft !== 'paket' || !a.paketId) return { titel: t('automatisierung.ui.loeschen.gesperrt'), grund: t('automatisierung.ui.loeschen.ablago') };
  const name = k.pakete?.find((p) => p.id === a.paketId)?.name ?? a.paketId;
  return {
    titel: t('automatisierung.ui.loeschen.gesperrt'), grund: t('automatisierung.ui.loeschen.paket', { paket: name }),
    stattdessen: <KnopfLink to={`/werkbank/pakete/${encodeURIComponent(a.paketId)}`} groesse="klein">{t('automatisierung.ui.loeschen.zum-paket', { paket: name })}</KnopfLink>,
  };
}

/** Probleme eines Bereichs (#1000) stehen in ihm – nicht gesammelt am Ende des Formulars. */
function Probleme({ liste, ort }: { liste: Array<{ ort: AutomatisierungOrt; text: string }>; ort: AutomatisierungOrt }) {
  const hier = [...new Set(liste.filter((x) => x.ort === ort).map((x) => x.text))];
  return hier.length ? <ul className="fehlertext klein">{hier.map((p) => <li key={p}>{p}</li>)}</ul> : null;
}

/**
 * Ablagestelle für Karten in „Wenn“ (mit „Und“) und „Dann“. Kein Kasten und keine zweite Überschrift (#1000,
 * Musterkatalog C15): Der Bereich trägt die `h2`; nur „Und“ als Abschnitt darin bekommt eine `h3`.
 */
function Bereichskasten({ titel, hinweis, ablage, kopf, fuss, children }: { titel?: string; hinweis?: string; ablage: Record<string, unknown>; kopf?: ReactNode; fuss?: ReactNode; children: ReactNode }) {
  const { className, ...rest } = ablage as { className?: string };
  const Huelle = titel ? 'section' : 'div';
  return (
    <Huelle className={`automatisierung-bereich ${className ?? ''}`} {...rest}>
      {(titel || kopf) && <div className="zeile">{titel && <h3 className="h4">{titel}</h3>}{kopf}</div>}
      {hinweis && <p className="leise klein">{hinweis}</p>}
      {children}
      {fuss}
    </Huelle>
  );
}

/** Karten eines Zweigs (Dann oder Sonst, #677): umsortieren, aufklappen, entfernen. */
function KartenListe({ zweig, karten, setze, offen, setOffen, editor, kurz }: {
  zweig: Zweig; karten: DannKarte[]; setze: (k: DannKarte[]) => void; offen: string | null; setOffen: (id: string | null) => void;
  editor: (karte: DannKarte, setze: (n: DannKarte) => void) => ReactNode; kurz: (karte: DannKarte) => string;
}) {
  const reihe = useZiehen({
    erlaubt: (q, ziel) => karten.some((x) => x.id === q) && karten.some((x) => x.id === ziel),
    fertig: (q, ziel, ort) => setze(umgestellt(karten, karten.findIndex((y) => y.id === q), karten.findIndex((y) => y.id === ziel), ort === 'in' ? 'nach' : ort)),
  });
  return (
    <ol className="automatisierung-karten" data-zweig={zweig}>
      {karten.map((karte, i) => (
        <li key={karte.id} {...reihe.eintrag(karte.id)}>
          <div className="karte-kopf">
            <Ziehgriff griff={reihe.griff(karte.id, vorratName({ bereich: 'dann', art: karte.art }))} tasten={{
              hoch: i > 0 ? () => setze(umgestellt(karten, i, i - 1, 'vor')) : undefined,
              runter: i < karten.length - 1 ? () => setze(umgestellt(karten, i, i + 1, 'nach')) : undefined,
            }} />
            <Knopf art="link" aria-expanded={offen === karte.id} onClick={() => setOffen(offen === karte.id ? null : karte.id)}>
              <strong>{vorratName({ bereich: 'dann', art: karte.art })}</strong> <span className="leise">{kurz(karte)}</span>
            </Knopf>
            <Knopf art="link" groesse="klein" symbol="schliessen" onClick={() => setze(karten.filter((x) => x.id !== karte.id))}>{t('automatisierung.ui.entfernen')}</Knopf>
          </div>
          {offen === karte.id && editor(karte, (n) => setze(karten.map((x) => (x.id === karte.id ? n : x))))}
        </li>
      ))}
    </ol>
  );
}

function Vorrat({ ablage, fuegeHinzu, passend }: { ablage: ReturnType<typeof useZiehen>; fuegeHinzu: (b: string, art: string) => void; passend: (v: { art: string }) => boolean }) {
  const [suche, setSuche] = useState('');
  const treffer = VORRAT.filter((v) => passend(v)).filter((v) => !suche.trim() || vorratName(v).toLowerCase().includes(suche.trim().toLowerCase()));
  return (
    <div className="automatisierung-vorrat">
      <Suchfeld wert={suche} setze={setSuche} beschriftung={t('automatisierung.ui.vorrat.suchen')} platzhalter={t('automatisierung.ui.vorrat.suchen')} />
      <p className="leise klein">{t('automatisierung.ui.vorrat.hinweis')}</p>
      {(['wenn', 'und', 'dann'] as const).map((b) => {
        const liste = treffer.filter((v) => v.bereich === b);
        return liste.length ? (
          <div key={b}>
            <p className="klein"><strong>{t.frei(`automatisierung.ui.${b}`)}</strong></p>
            <ul className="stapel">
              {liste.map((v) => (
                <li key={`${v.bereich}|${v.art}`} className="vorratkarte">
                  <Ziehgriff griff={ablage.griff(`${v.bereich}|${v.art}`, vorratName(v))} tasten={{}} />
                  <Knopf art="link" onClick={() => fuegeHinzu(v.bereich, v.art)}>{vorratName(v)}</Knopf>
                </li>
              ))}
            </ul>
          </div>
        ) : null;
      })}
    </div>
  );
}

function KarteHinzu({ bereich, fuegeHinzu, passend }: { bereich: 'und' | Zweig; fuegeHinzu: (b: string, art: string) => void; passend: (v: { art: string }) => boolean }) {
  return (
    <Feld beschriftung={t('automatisierung.ui.karte.hinzu')} beschriftungVerbergen className="klein">
      <select value="" onChange={(x) => { if (x.target.value) fuegeHinzu(bereich, x.target.value); }}>
        <option value="">{t('automatisierung.ui.karte.hinzu')}</option>
        {VORRAT.filter((v) => v.bereich === (bereich === 'sonst' ? 'dann' : bereich) && passend(v)).map((v) => <option key={v.art} value={v.art}>{vorratName(v)}</option>)}
      </select>
    </Feld>
  );
}

/* ---------- Wenn ---------- */

const ZEITPLAN_NEU: WennKarte = { art: 'zeitplan', uhrzeit: '07:00', tage: [1, 2, 3, 4, 5], feiertage: false, jeBenutzer: false };
/** Neue Wenn-Karte aus dem Vorrat bzw. der Auswahl; der Mappentyp bleibt, wo er passt. */
function neueWenn(art: string, alt: WennKarte, typ: Mappentyp | null, k: Kontextdaten): WennKarte {
  if (art === 'datum') return { art: 'datum', typ: typ?.id ?? k.typen.find((x) => x.system !== 'benutzer' && x.system !== 'rolle')?.id ?? '', feld: '', vorlauf: 7, einheit: 'tage', uhrzeit: '07:00', wiederholung: null };
  if (art === 'zeitplan') return { ...ZEITPLAN_NEU };
  // Werkbank-Karten (#677): ohne Mappentyp; „Protokollmeldung“ zunächst ab Fehler, alle Module.
  if (art === 'protokoll.meldung') return { art, stufe: 'error', modul: null, enthaelt: null };
  if (istBetriebWenn(art)) return { art } as WennBetrieb;
  // Aufruf von außen (#679): zunächst ohne Parameter; Adresse und Geheimnis nach dem Speichern.
  if (art === 'aufruf') return { art: 'aufruf', parameter: [] };
  return { art: art as never, typ: alt.art === 'zeitplan' || ohneMappeWenn(alt) ? null : alt.art === 'datum' ? alt.typ : alt.typ ?? null };
}
const TAG_NAMEN = ['', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

/** Wenn-Karte „Zeitplan“ (#678): Wochentage, Uhrzeit, Feiertage, „für jeden Benutzer (der Rolle …)“, Uhrzeit aus dem Profil. */
function ZeitplanEditor({ w, k, setze }: { w: Extract<WennKarte, { art: 'zeitplan' }>; k: Kontextdaten; setze: (w: WennKarte) => void }) {
  const profil = w.jeBenutzer && w.profilzeit;
  return <>
    {!profil && <>
      <FeldGruppe beschriftung={t('automatisierung.ui.wenn.zeitplan.tage')}>
        {WOCHENTAGE.map((d) => <label key={d} className="haken klein"><input type="checkbox" checked={w.tage.includes(d)} onChange={(x) => setze({ ...w, tage: x.target.checked ? [...w.tage, d].sort() : w.tage.filter((y) => y !== d) })} /><span>{TAG_NAMEN[d]}</span></label>)}
      </FeldGruppe>
      <Feld beschriftung={t('automatisierung.ui.wenn.uhrzeit')}><input type="time" step={900} value={w.uhrzeit} onChange={(x) => setze({ ...w, uhrzeit: x.target.value || '07:00' })} /></Feld>
      <HakenFeld beschriftung={t('automatisierung.ui.wenn.zeitplan.feiertage')}><input type="checkbox" checked={w.feiertage} onChange={(x) => setze({ ...w, feiertage: x.target.checked })} /></HakenFeld>
    </>}
    <HakenFeld beschriftung={t('automatisierung.ui.wenn.zeitplan.je-benutzer')} className="breit"><input type="checkbox" checked={w.jeBenutzer} onChange={(x) => setze(x.target.checked ? { ...w, jeBenutzer: true, rolle: null, profilzeit: false } : { art: 'zeitplan', uhrzeit: w.uhrzeit, tage: w.tage, feiertage: w.feiertage, jeBenutzer: false })} /></HakenFeld>
    {w.jeBenutzer && <>
      <Feld beschriftung={t('automatisierung.ui.wenn.zeitplan.rolle')}>
        <select value={w.rolle ?? ''} onChange={(x) => setze({ ...w, rolle: x.target.value || null })}>
          <option value="">{t('automatisierung.ui.wenn.zeitplan.alle')}</option>
          {k.rollen.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select></Feld>
      <HakenFeld beschriftung={t('automatisierung.ui.wenn.zeitplan.profilzeit')} className="breit"><input type="checkbox" checked={!!w.profilzeit} onChange={(x) => setze({ ...w, profilzeit: x.target.checked })} /></HakenFeld>
    </>}
  </>;
}

const GRUPPEN_FOLGE: Ereignisgruppe[] = ['mappe', 'zeit', 'person', 'benutzer', 'verarbeitung', 'betrieb'];

function WennEditor({ w, k, setze }: { w: WennKarte; k: Kontextdaten; setze: (w: WennKarte) => void }) {
  const typen = k.typen.filter((x) => x.system !== 'benutzer' && x.system !== 'rolle');
  const typ = kontextTyp(w, k.typen);
  const benutzerGruppe = w.art === 'zeitplan' || ohneMappeWenn(w) || (w.art !== 'datum' && EREIGNISKATALOG[w.art].gruppe === 'benutzer');
  return (
    <div className="karte offen">
      <div className="raster">
        <Feld beschriftung={t('automatisierung.ui.wenn.ereignis')}>
          <select value={w.art} onChange={(x) => setze(neueWenn(x.target.value, w, typ, k))}>
            <option value="datum">{ereignisName('datum')}</option>
            <option value="zeitplan">{ereignisName('zeitplan')}</option>
            <option value="aufruf">{ereignisName('aufruf')}</option>
            {GRUPPEN_FOLGE.map((g) => (
              <optgroup key={g} label={t.frei(`ereignisse.gruppe.${g}`)}>
                {WENN_EREIGNISSE.filter((a) => EREIGNISKATALOG[a].gruppe === g).map((a) => <option key={a} value={a}>{ereignisName(a)}</option>)}
              </optgroup>
            ))}
          </select>
        </Feld>
        {!benutzerGruppe && (
          <Feld beschriftung={t('automatisierung.ui.wenn.typ')}>
            <select value={w.typ ?? ''} onChange={(x) => setze(w.art === 'datum' ? { ...w, typ: x.target.value, feld: '' } : { ...w, typ: x.target.value || null, felder: [] })}>
              {w.art !== 'datum' && <option value="">{t('automatisierung.ui.wenn.alle-typen')}</option>}
              {typen.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </Feld>
        )}
        {w.art === 'zeitplan' && <ZeitplanEditor w={w} k={k} setze={setze} />}
        {w.art === 'protokoll.meldung' && <ProtokollFilter w={w} setze={setze} />}
        {w.art === 'aufruf' && <AufrufWenn w={w} setze={setze} />}
        {w.art === 'datum' && <>
          <Feld beschriftung={t('automatisierung.ui.wenn.feld')}>
            <select value={w.feld} onChange={(x) => setze({ ...w, feld: x.target.value })}>
              <option value="">–</option>
              {(typ?.felder ?? []).filter((f) => f.typ === 'datum').map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
          </Feld>
          <Feld beschriftung={<>{t('automatisierung.ui.wenn.vorlauf')} <small>{t('automatisierung.ui.wenn.vorlauf.hilfe')}</small></>}>
            <span className="zeile">
              <input type="number" min={-3650} max={3650} value={w.vorlauf} onChange={(x) => setze({ ...w, vorlauf: Number(x.target.value) })} />
              <Feld beschriftung={t('automatisierung.ui.wenn.einheit')} beschriftungVerbergen><select value={w.einheit} onChange={(x) => setze({ ...w, einheit: x.target.value as VorlaufEinheit })}>
                {Object.entries(VORLAUF_EINHEITEN).map(([key, name]) => <option key={key} value={key}>{name}</option>)}
              </select></Feld>
            </span></Feld>
          <Feld beschriftung={<>{t('automatisierung.ui.wenn.wiederholung')} <small>{t('automatisierung.ui.wenn.wiederholung.hilfe')}</small></>}>
            <select value={w.wiederholung ?? ''} onChange={(x) => setze({ ...w, wiederholung: x.target.value ? Number(x.target.value) : null })}>
              <option value="">{t('automatisierung.ui.wenn.einmalig')}</option>
              {Object.entries(WIEDERHOLUNGEN).map(([m, name]) => <option key={m} value={m}>{name}</option>)}
            </select></Feld>
          <Feld beschriftung={t('automatisierung.ui.wenn.uhrzeit')}><input type="time" value={w.uhrzeit} onChange={(x) => setze({ ...w, uhrzeit: x.target.value || '07:00' })} /></Feld>
        </>}
        {w.art === 'mappe.geaendert' && typ && (
          <FeldGruppe beschriftung={t('automatisierung.ui.wenn.felder')} className="breit">
            {typ.felder.map((f) => (
              <label key={f.key} className="haken klein"><input type="checkbox" checked={!!w.felder?.includes(f.key)} onChange={(x) => setze({ ...w, felder: x.target.checked ? [...(w.felder ?? []), f.key] : (w.felder ?? []).filter((y) => y !== f.key) })} /><span>{f.label}</span></label>
            ))}
          </FeldGruppe>
        )}
        {/* #1001: „neue Post oder ‚An‘ geändert“ ist eine Karte – auch beim Anlegen auslösen. */}
        {w.art === 'mappe.geaendert' && (
          <HakenFeld beschriftung={t('automatisierung.ui.wenn.angelegt')} hinweis={t('automatisierung.ui.wenn.angelegt.hilfe')} className="breit">
            <input type="checkbox" checked={w.angelegt === true} onChange={(x) => setze({ ...w, angelegt: x.target.checked || undefined })} />
          </HakenFeld>
        )}
      </div>
      <p className="leise klein">{w.art === 'datum' ? t('automatisierung.ui.wenn.datum.text') : w.art === 'zeitplan' ? `${zeitplanText(w)}. ${t('automatisierung.ui.wenn.zeitplan.text')}` : w.art === 'aufruf' ? t('automatisierung.ui.aufruf.text') : t.frei(`ereignisse.text.${ereignisSchluessel(w.art)}`)}</p>
    </div>
  );
}

/**
 * Wenn-Karte „Protokollmeldung“ (#677): ab Warnung oder ab Fehler, wahlweise nur ein Modul und ein Text. Bei Fehlern im
 * Modul „E-Mail“ hilft eine E-Mail meist nicht – der Hinweis schlägt Aufgabe oder Benachrichtigung im DMS vor.
 */
function ProtokollFilter({ w, setze }: { w: Extract<WennBetrieb, { art: 'protokoll.meldung' }>; setze: (w: WennKarte) => void }) {
  return <>
    <Feld beschriftung={t('automatisierung.ui.wenn.protokoll.stufe')}>
      <select value={w.stufe} onChange={(x) => setze({ ...w, stufe: x.target.value === 'warn' ? 'warn' : 'error' })}>
        {PROTOKOLL_STUFEN.map((s) => <option key={s} value={s}>{t.frei(`automatisierung.ui.wenn.protokoll.ab-${s}`)}</option>)}
      </select>
    </Feld>
    <Feld beschriftung={t('automatisierung.ui.wenn.protokoll.modul')}>
      <select value={w.modul ?? ''} onChange={(x) => setze({ ...w, modul: x.target.value || null })}>
        <option value="">{t('automatisierung.ui.wenn.protokoll.alle-module')}</option>
        {MODULE.filter((m) => m !== 'automatisierung' && m !== 'ereignisse').map((m) => <option key={m} value={m}>{t.frei(`werkbank.protokoll.modul.${m}`)}</option>)}
      </select>
    </Feld>
    <Feld beschriftung={t('automatisierung.ui.wenn.protokoll.enthaelt')} hinweis={t('automatisierung.ui.wenn.protokoll.enthaelt.hilfe')} className="breit">
      <input value={w.enthaelt ?? ''} maxLength={PROTOKOLL_FILTER_MAX} onChange={(x) => setze({ ...w, enthaelt: x.target.value || null })} />
    </Feld>
    {/* #671: „URL aufrufen“ (z. B. Push über die Hausautomatisierung) statt einer E-Mail – der Text nennt beides. */}
    {w.modul === 'mail' && <div className="hinweis info breit" role="status"><p>{t('automatisierung.ui.wenn.protokoll.mail')}</p></div>}
  </>;
}

/* ---------- Und ---------- */

function neueUnd(art: string, typ: Mappentyp | null): UndKarte {
  if (art === 'ansicht') return { art: 'ansicht', sicht: '' };
  if (art === 'favorit') return { art: 'favorit', von: { art: 'person', id: '' } };
  if (art === 'gruppe') return { art: 'gruppe', modus: 'eine', karten: [] };
  // Merkmal der Ablage (#1032): „Ablage wird beruflich genutzt“, umkehrbar über „nicht“.
  if (art === 'merkmal') return { art: 'bedingung', bedingung: { art: 'merkmal', merkmal: 'beruflich' } };
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
            <HakenFeld beschriftung={t('automatisierung.ui.und.nicht')} className="klein"><input type="checkbox" title={t('automatisierung.ui.und.nicht.hilfe')} checked={u.nicht === true} onChange={(x) => aendere(i, { ...u, nicht: x.target.checked || undefined })} /></HakenFeld>
            {u.art === 'bedingung' && u.bedingung.art === 'feld' && (() => {
              const feld = felder.find((f) => f.key === (u.bedingung as Extract<Bedingung, { art: 'feld' }>).feld) as Bedingungsfeld | undefined;
              return <>
                <Feld beschriftung={t('automatisierung.ui.und.feld')} beschriftungVerbergen><select value={feld?.key ?? ''} onChange={(x) => { const f = felder.find((y) => y.key === x.target.value); if (f) aendere(i, { ...u, bedingung: { art: 'feld', feld: f.key, op: OPERATOREN_JE_ART[f.art][0] } }); }}>
                  {!feld && <option value="">–</option>}
                  {felder.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                </select></Feld>
                {feld && <FeldBedingung b={u.bedingung} feld={feld} setze={(b) => aendere(i, { ...u, bedingung: b })} titel={titel} merke={merke} />}
              </>;
            })()}
            {u.art === 'ansicht' && (
              <Feld beschriftung={t('automatisierung.ui.karte.und.ansicht')} beschriftungVerbergen><select value={u.sicht} onChange={(x) => aendere(i, { ...u, sicht: x.target.value })}>
                <option value="">{t('automatisierung.ui.und.ansicht.waehlen')}</option>
                {sichtenFuer(k, typ).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select></Feld>
            )}
            {u.art === 'favorit' && <EmpfaengerWahl e={u.von} typ={typ} k={k} setze={(v) => aendere(i, { ...u, von: v as Empfaenger })} />}
            {u.art === 'gruppe' && (
              <Feld beschriftung={t('automatisierung.ui.und.modus')} beschriftungVerbergen><select value={u.modus} onChange={(x) => aendere(i, { ...u, modus: x.target.value as 'alle' | 'eine' })}>
                <option value="alle">{t('automatisierung.ui.und.alle')}</option><option value="eine">{t('automatisierung.ui.und.eine')}</option>
              </select></Feld>
            )}
            <Knopf art="link" groesse="klein" symbol="schliessen" onClick={() => setze(karten.filter((_, j) => j !== i))}>{t('automatisierung.ui.entfernen')}</Knopf>
          </div>
          <p className="leise klein">{undKurz(u, typ, k, (mid) => titel[mid] ?? d.person(mid))}</p>
          {u.art === 'gruppe' && tief === 0 && <div className="einzug">
            <UndListe karten={u.karten} typ={typ} k={k} setze={(x) => aendere(i, { ...u, karten: x })} tief={1} />
            <Feld beschriftung={t('automatisierung.ui.karte.hinzu')} beschriftungVerbergen><select value="" onChange={(x) => { if (x.target.value) aendere(i, { ...u, karten: [...u.karten, neueUnd(x.target.value, typ)] }); }}>
              <option value="">{t('automatisierung.ui.karte.hinzu')}</option>
              {['bedingung', 'ansicht', 'favorit', 'merkmal'].map((art) => <option key={art} value={art}>{t.frei(`automatisierung.ui.karte.und.${art}`)}</option>)}
            </select></Feld>
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

/** `extra` (#671, E-Mail): weitere Optionen – „Adresse eingeben“ (`adresse:`) und E-Mail-Felder (`feld:…`). */
function EmpfaengerWahl({ e, typ, k, setze, wenn, extra }: { e: Empfaenger; typ: Mappentyp | null; k: Kontextdaten; setze: (e: Empfaenger | MailEmpfaenger) => void; wenn?: WennKarte; extra?: ReactNode }) {
  const benutzerTyp = k.typen.find((x) => x.system === 'benutzer');
  const felder = (typ?.felder ?? []).filter((f) => f.typ === 'referenz' && ((!zieleVon(f).length && !jedeMappe(f)) || einzigesZiel(f) === benutzerTyp?.id));
  const ausEreignis = wenn ? PERSONEN_IM_EREIGNIS[wenn.art] ?? [] : [];
  // Werkbank-Karten (#677) haben keine Mappe: kein Ersteller, keine Felder.
  const ohneMappe = !!wenn && ohneMappeWenn(wenn);
  const wert = e.art === 'feld' ? `feld:${e.feld}` : e.art === 'ereignis' ? `ereignis:${e.feld}` : e.art === 'ersteller' ? 'ersteller:' : `${e.art}:${e.id}`;
  return (
    <Feld beschriftung={t('automatisierung.ui.empfaenger')} beschriftungVerbergen><select value={wert} onChange={(x) => {
      const [art, ...rest] = x.target.value.split(':');
      const v = rest.join(':');
      setze(art === 'adresse' ? { art: 'adresse', adresse: '' } : art === 'feld' ? { art: 'feld', feld: v } : art === 'ereignis' ? { art: 'ereignis', feld: v } : art === 'ersteller' ? { art: 'ersteller' } : { art: art as 'person' | 'rolle', id: v });
    }}>
      <option value="person:">{t('automatisierung.ui.empfaenger.waehlen')}</option>
      {extra}
      {!ohneMappe && <option value="ersteller:">{t('automatisierung.ui.empfaenger.ersteller')}</option>}
      {ausEreignis.length > 0 && <optgroup label={t('automatisierung.ui.empfaenger.ereignis')}>{ausEreignis.map((p) => <option key={p} value={`ereignis:${p}`}>{EREIGNIS_PERSON[p] ?? p}</option>)}</optgroup>}
      {felder.length > 0 && <optgroup label={t('automatisierung.ui.empfaenger.felder')}>{felder.map((f) => <option key={f.key} value={`feld:${f.key}`}>{f.label}</option>)}</optgroup>}
      <optgroup label={t('automatisierung.ui.empfaenger.personen')}>{k.benutzer.filter((b) => b.aktiv !== false).map((b) => <option key={b.id} value={`person:${b.id}`}>{b.name}</option>)}</optgroup>
      <optgroup label={t('automatisierung.ui.empfaenger.rollen')}>{k.rollen.map((r) => <option key={r.id} value={`rolle:${r.id}`}>{r.name}</option>)}</optgroup>
    </select></Feld>
  );
}

/* ---------- Dann ---------- */

function neueDann(art: string, w?: WennKarte, k?: Kontextdaten): DannKarte {
  if (art === 'paket') return { id: neueId(), art: 'paket', paket: (k?.pakete ?? []).find((p) => p.zeitplan)?.id ?? '', aufgabe: null };
  if (art === 'feld') return { id: neueId(), art: 'feld', werte: {} };
  if (art === 'zusammenfassung' || art === 'favoriten' || art === 'sicherung') return { id: neueId(), art };
  // Nach außen (#671): Adresse vorbelegt mit dem ersten freigegebenen Ziel; Inhalt „nur Meldung“.
  if (art === 'url') return { id: neueId(), art: 'url', adresse: k?.ziele?.[0]?.adresse ?? '', methode: 'POST', parameter: [], inhalt: 'meldung' };
  if (art === 'email') return { id: neueId(), art: 'email', an: [], betreff: '', text: '' };
  if (art === 'anmeldeschutz') return { id: neueId(), art: 'anmeldeschutz', was: w?.art === 'benutzer.gesperrt' ? 'konto' : 'sammel' };
  if (art === 'aufgabe') return { id: neueId(), art: 'aufgabe', als: 'aufgabe', empfaenger: [], text: '', faellig: 7 };
  return { id: neueId(), art: 'stopp' };
}

function dannKurz(k: DannKarte, typ: Mappentyp | null, kx: Kontextdaten): string {
  if (k.art === 'favoriten') return k.rollen?.length ? t('automatisierung.ui.karte.dann.favoriten.nur', { rollen: k.rollen.map((r) => kx.rollen.find((x) => x.id === r)?.name ?? '?').join(', ') }) : '';
  if (k.art === 'stopp' || k.art === 'zusammenfassung' || k.art === 'sicherung') return '';
  if (k.art === 'anmeldeschutz') return t.frei(`automatisierung.ui.karte.dann.anmeldeschutz.${k.was}`);
  if (k.art === 'paket') return `${kx.pakete?.find((p) => p.id === k.paket)?.name ?? k.paket}${k.aufgabe ? ` · ${k.aufgabe}` : ''}`;
  if (k.art === 'url') return `${k.methode} ${k.adresse ? zielHost(k.adresse) : '?'} · ${t.frei(`automatisierung.ui.karte.dann.url.inhalt.${k.inhalt}`)}`;
  if (k.art === 'email') return `${k.betreff || '?'} → ${k.an.map((e) => (e.art === 'adresse' ? e.adresse : empfaengerName(e, typ, kx))).join(', ') || '?'}`;
  if (k.art === 'feld') return Object.entries(k.werte).map(([key, v]) => `${typ?.felder.find((f) => f.key === key)?.label ?? key} = ${String(v ?? '')}`).join(', ');
  return `${t.frei(`automatisierung.karte.aufgabe.als-${k.als}`)} → ${k.empfaenger.map((e) => empfaengerName(e, typ, kx)).join(', ') || '?'}`;
}

/** „Feld ändern“: gewählte Felder mit ihrem Wert; Platzhalter an der Schreibmarke des zuletzt benutzten Werts (#1177). */
function FeldKarte({ karte, typ, wenn, setze }: { karte: Extract<DannKarte, { art: 'feld' }>; typ: Mappentyp | null; wenn: WennKarte; setze: (k: DannKarte) => void }) {
  const ein = usePlatzhalterEinsetzen();
  // Berechnete Felder (#1034) schreibt nur ihr Paket – nicht zur Wahl (bereits gewählte zeigt die Prüfung als Problem).
  // Zusammengesetzte (#1050) setzt Ablago aus ihren Teilen – auch nicht.
  const felder = (typ?.felder ?? []).filter((f) => f.typ !== 'passwort' && f.typ !== 'zusammengesetzt');
  const waehlbar = felder.filter((f) => !f.berechnetVon);
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
              <Feld beschriftung={f ? feldLabel(f) : key} beschriftungVerbergen>
                {f?.typ === 'auswahl' ? <select value={String(v ?? '')} onChange={(x) => setze({ ...karte, werte: { ...karte.werte, [key]: x.target.value } })}><option value="">–</option>{(f.optionen ?? []).map((o) => <option key={o} value={o}>{optionText(f, o)}</option>)}</select>
                  : f?.typ === 'janein' ? <select value={v === true ? 'ja' : v === false ? 'nein' : ''} onChange={(x) => setze({ ...karte, werte: { ...karte.werte, [key]: x.target.value === 'ja' } })}><option value="ja">{t('automatisierung.ui.ja')}</option><option value="nein">{t('automatisierung.ui.nein')}</option></select>
                    : <input {...ein.feld(key, String(v ?? ''), (w) => setze({ ...karte, werte: { ...karte.werte, [key]: w } }))} value={String(v ?? '')} placeholder={f?.typ === 'datum' ? t('automatisierung.ui.karte.dann.feld.datum') : ''} onChange={(x) => setze({ ...karte, werte: { ...karte.werte, [key]: x.target.value } })} />}
              </Feld>
              <Knopf art="link" groesse="klein" symbol="schliessen" onClick={() => { const w = { ...karte.werte }; delete w[key]; setze({ ...karte, werte: w }); }}>{t('automatisierung.ui.entfernen')}</Knopf>
            </li>
          );
        })}
      </ul>
      {typ && <Feld beschriftung={t('automatisierung.ui.karte.dann.feld.waehlen')} beschriftungVerbergen><select value="" onChange={(x) => { if (x.target.value) setze({ ...karte, werte: { ...karte.werte, [x.target.value]: '' } }); }}>
        <option value="">{t('automatisierung.ui.karte.dann.feld.waehlen')}</option>
        {waehlbar.filter((f) => !gewaehlt.includes(f.key)).map((f) => <option key={f.key} value={f.key}>{feldLabel(f)}</option>)}
      </select></Feld>}
      {gewaehlt.length > 0 && <Platzhalter einsetzen={ein.einsetzen} gruppen={platzhalterGruppen(wenn, typ)} />}
    </div>
  );
}

function DannEditor({ karte, typ, wenn, k, a, eigenesPaket, setze }: { karte: DannKarte; typ: Mappentyp | null; wenn: WennKarte; k: Kontextdaten; a?: AutomatisierungAnsicht; eigenesPaket?: string | null; setze: (k: DannKarte) => void }) {
  // Platzhalter zum Anklicken (#1177): an der Schreibmarke des zuletzt benutzten Felds.
  const ein = usePlatzhalterEinsetzen();
  if (karte.art === 'paket') return <PaketKarte karte={karte} k={k} eigenesPaket={eigenesPaket} setze={setze} />;
  // Nach außen (#671).
  if (karte.art === 'url') return <UrlKarte karte={karte} wenn={wenn} typ={typ} k={k} a={a} setze={setze} />;
  if (karte.art === 'email') return <EmailKarte karte={karte} wenn={wenn} typ={typ} ohneMappe={ohneMappeWenn(wenn)} setze={setze}
    wahl={(e, s, extra) => <EmpfaengerWahl e={e} typ={typ} k={k} wenn={wenn} setze={s} extra={extra} />} />;
  if (karte.art === 'stopp') return <p className="leise klein">{t('automatisierung.ui.karte.dann.stopp.text')}</p>;
  if (karte.art === 'zusammenfassung') return <p className="leise klein">{t('automatisierung.ui.karte.dann.zusammenfassung.text')}</p>;
  if (karte.art === 'sicherung') return <p className="leise klein">{t('automatisierung.ui.karte.dann.sicherung.text')}</p>;
  // #1001: Wer Favoriten-Änderungen bekommt und die Vorgabe für neue Benutzer – früher unter Werkbank → Aufgaben.
  if (karte.art === 'favoriten') return (
    <div className="karte offen">
      <p className="leise klein">{t('automatisierung.ui.karte.dann.favoriten.text')}</p>
      <FeldGruppe beschriftung={t('automatisierung.ui.karte.dann.favoriten.rollen')} hinweis={t('automatisierung.ui.karte.dann.favoriten.rollen.hilfe')}>
        {k.rollen.map((r) => (
          <label key={r.id} className="haken"><input type="checkbox" checked={!!karte.rollen?.includes(r.id)} onChange={(x) => {
            const neu = x.target.checked ? [...(karte.rollen ?? []), r.id] : (karte.rollen ?? []).filter((y) => y !== r.id);
            setze({ ...karte, rollen: neu.length ? neu : undefined });
          }} /><span>{r.name}</span></label>
        ))}
      </FeldGruppe>
      <HakenFeld beschriftung={t('automatisierung.ui.karte.dann.favoriten.vorgabe')} hinweis={t('automatisierung.ui.karte.dann.favoriten.vorgabe.hilfe')}>
        <input type="checkbox" checked={karte.vorgabe !== false} onChange={(x) => setze({ ...karte, vorgabe: x.target.checked ? undefined : false })} />
      </HakenFeld>
    </div>
  );
  if (karte.art === 'anmeldeschutz') return (
    <div className="karte offen">
      <Feld beschriftung={t('automatisierung.ui.karte.dann.anmeldeschutz.was')}>
        <select value={karte.was} onChange={(x) => setze({ ...karte, was: x.target.value === 'konto' ? 'konto' : 'sammel' })}>
          <option value="sammel">{t('automatisierung.ui.karte.dann.anmeldeschutz.sammel')}</option>
          <option value="konto">{t('automatisierung.ui.karte.dann.anmeldeschutz.konto')}</option>
        </select></Feld>
      <p className="leise klein">{t.frei(`automatisierung.ui.karte.dann.anmeldeschutz.${karte.was}.text`)}</p>
    </div>
  );
  if (karte.art === 'feld') return <FeldKarte karte={karte} typ={typ} wenn={wenn} setze={setze} />;
  return (
    <div className="karte offen">
      <div className="raster">
        <Feld beschriftung={t('automatisierung.ui.karte.dann.aufgabe.als')}>
          <select value={karte.als} onChange={(x) => setze({ ...karte, als: x.target.value as 'aufgabe' | 'benachrichtigung' })}>
            <option value="aufgabe">{t('automatisierung.karte.aufgabe.als-aufgabe')}</option><option value="benachrichtigung">{t('automatisierung.karte.aufgabe.als-benachrichtigung')}</option>
          </select></Feld>
        {karte.als === 'aufgabe' && wenn.art !== 'datum' && <Feld beschriftung={t('automatisierung.ui.karte.dann.aufgabe.faellig')}>
          <input type="number" min={0} max={3650} value={karte.faellig ?? ''} onChange={(x) => setze({ ...karte, faellig: x.target.value === '' ? null : Number(x.target.value) })} /></Feld>}
        {karte.als === 'aufgabe' && wenn.art === 'datum' && <p className="leise breit">{t('automatisierung.ui.karte.dann.aufgabe.frist')}</p>}
      </div>
      <fieldset className="eigenschaft breit"><legend>{t('automatisierung.ui.empfaenger')}</legend>
        <ul className="stapel">
          {karte.empfaenger.map((e, i) => (
            <li key={i} className="bedingungszeile">
              <EmpfaengerWahl e={e} typ={typ} k={k} wenn={wenn} setze={(n) => setze({ ...karte, empfaenger: karte.empfaenger.map((x, j) => (j === i ? n as Empfaenger : x)) })} />
              <Knopf art="link" groesse="klein" symbol="schliessen" onClick={() => setze({ ...karte, empfaenger: karte.empfaenger.filter((_, j) => j !== i) })}>{t('automatisierung.ui.entfernen')}</Knopf>
            </li>
          ))}
        </ul>
        <Knopf groesse="klein" onClick={() => setze({ ...karte, empfaenger: [...karte.empfaenger, { art: 'person', id: '' }] })}>{t('automatisierung.ui.empfaenger.hinzu')}</Knopf>
      </fieldset>
      <Feld beschriftung={t('automatisierung.ui.karte.dann.aufgabe.text')} className="breit">
        <textarea {...ein.feld('text', karte.text, (x) => setze({ ...karte, text: x }))} rows={3} value={karte.text} maxLength={AUTOMATISIERUNG_GRENZEN.text} onChange={(x) => setze({ ...karte, text: x.target.value })} /></Feld>
      <Platzhalter einsetzen={ein.einsetzen} gruppen={platzhalterGruppen(wenn, typ)} />
      <p className="leise klein">{ohneMappeWenn(wenn) ? t('automatisierung.ui.karte.dann.aufgabe.ohne-mappe') : t('automatisierung.ui.karte.dann.aufgabe.rechte')}</p>
    </div>
  );
}

/**
 * „Paket nach Zeitplan ausführen“ (#1082): Paket und optional eine Aufgabe. Zur Wahl stehen nur Pakete, die Zeitpläne
 * annehmen; eine mitgelieferte Automatisierung ruft nur ihr eigenes Paket (fest). Aufgaben: die Kennungen, die die
 * mitgelieferten Automatisierungen des Pakets benutzen.
 */
function PaketKarte({ karte, k, eigenesPaket, setze }: { karte: Extract<DannKarte, { art: 'paket' }>; k: Kontextdaten; eigenesPaket?: string | null; setze: (k: DannKarte) => void }) {
  const pakete = k.pakete ?? [];
  const fest = eigenesPaket !== undefined;
  const ziel = fest ? eigenesPaket ?? '' : karte.paket;
  const waehlbar = pakete.filter((p) => p.zeitplan || p.id === ziel);
  const gewaehlt = pakete.find((p) => p.id === ziel);
  const aufgaben = [...new Set([...(gewaehlt?.aufgaben ?? []), ...(karte.aufgabe ? [karte.aufgabe] : [])])];
  const leer = ziel ? paketKarteLeer(ziel, pakete) : null;
  return (
    <div className="karte offen">
      <div className="raster">
        <Feld beschriftung={t('automatisierung.ui.karte.dann.paket.paket')}>
          <select value={ziel} disabled={fest} onChange={(x) => setze({ ...karte, paket: x.target.value, aufgabe: null })}>
            {!ziel && <option value="">{t('automatisierung.ui.karte.dann.paket.waehlen')}</option>}
            {!gewaehlt && ziel && <option value={ziel}>{ziel}</option>}
            {waehlbar.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Feld>
        <Feld beschriftung={t('automatisierung.ui.karte.dann.paket.aufgabe')}>
          <select value={karte.aufgabe ?? ''} onChange={(x) => setze({ ...karte, aufgabe: x.target.value || null })}>
            <option value="">{t('automatisierung.ui.karte.dann.paket.ohne-aufgabe')}</option>
            {aufgaben.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </Feld>
      </div>
      {fest && <p className="leise klein">{t('automatisierung.ui.karte.dann.paket.fest')}</p>}
      {!fest && !pakete.some((p) => p.zeitplan) && <p className="leise klein">{t('automatisierung.ui.karte.dann.paket.keine')}</p>}
      {leer && <p className="fehlertext klein">{leer}</p>}
      <p className="leise klein">{t('automatisierung.ui.karte.dann.paket.text')}</p>
    </div>
  );
}

/* ---------- Wiedergeben, Verlauf, Änderungsverlauf ---------- */

/** Karte · Ergebnis · Einzelheiten je Schritt (#707) – für Verlauf, Live-Fortschritt und Ausprobieren gleich. */
function Schritte({ l, a }: { l: Lauf; a: AutomatisierungAnsicht }) {
  const name = (x: Schritt) => x.teil === 'dann' || x.teil === 'sonst'
    ? `${x.teil === 'sonst' ? `${t('automatisierung.ui.sonst')}: ` : ''}${vorratName({ bereich: 'dann', art: a[x.teil].find((k) => k.id === x.karte)?.art ?? 'stopp' })}`
    : t.frei(`automatisierung.ui.${x.teil}`);
  return (<>
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
    {/* Aufruf von außen (#679): mitgeschickte Parameter (nur für Verwaltende von „Automatisierungen“). */}
    <AufrufParameterZeile l={l} />
    </>
  );
}

const SCHRITT_ART: Record<string, string> = { ok: 'gut', fehler: 'schlecht', laeuft: 'info', nein: 'leise', uebersprungen: 'leise', offen: 'leise' };

function Wiedergeben({ a, typ, nachher, klappe }: { a: AutomatisierungAnsicht; typ: Mappentyp | null; nachher: () => void; klappe: Klappe }) {
  const [mappe, setMappe] = useState('');
  const [bekannt, setBekannt] = useState<Bezuege>({});
  const [trocken, setTrocken] = useState(true);
  const [lauf, setLauf] = useState<Lauf | null>(null);
  const [fehler, setFehler] = useState<string>();
  // Auswahl wie ein Verweisfeld (#709); vorgeschlagen werden nur Mappen, die die Automatisierung sehen darf.
  const quelle = useCallback((suche: string) => automatisierungApi.automatisierungTestmappen(a.id, suche), [a.id]);
  return (
    <Bereich id="ausprobieren" titel={t('automatisierung.ui.wiedergeben')} klappe={klappe}>
      {/* Werkbank-Karten (#677): ohne Mappe, mit einer Beispielmeldung. */}
      <p className="leise klein">{ohneMappeWenn(a.wenn) ? t('automatisierung.ui.wiedergeben.beispiel') : t('automatisierung.ui.wiedergeben.text')}</p>
      <div className="zeile">
        {ohneMappeWenn(a.wenn) ? null : typ ? <div className="feld">
            <label htmlFor="ausprobieren-mappe" className="sr">{t('automatisierung.ui.wiedergeben.suchen')}</label>
            <MappenWahl id="ausprobieren-mappe" ziel={typ} mehrfach={false} wert={mappe || undefined} bekannt={bekannt} ohneAnlegen
              merke={(id, x) => setBekannt((y) => ({ ...y, [id]: x }))} setze={(v) => setMappe(typeof v === 'string' ? v : '')}
              platzhalter={t('automatisierung.ui.wiedergeben.suchen')} quelle={quelle} leer={t('automatisierung.ui.wiedergeben.leer', { typ: typ.name })} />
          </div>
          : <p className="leise klein">{t('automatisierung.ui.wiedergeben.ohne-typ')}</p>}
        <HakenFeld beschriftung={t('automatisierung.ui.trocken')} hinweis={t('automatisierung.ui.trocken.hilfe')} className="klein"><input type="checkbox" checked={trocken} onChange={(x) => setTrocken(x.target.checked)} /></HakenFeld>
        <Knopf groesse="klein" gesperrt={!mappe && !ohneMappeWenn(a.wenn)} onClick={async () => {
          setFehler(undefined);
          try { setLauf(await automatisierungApi.automatisierungWiedergeben(a.id, mappe, trocken)); nachher(); } catch (e) { setFehler((e as Error).message); }
        }}>{t('automatisierung.ui.wiedergeben.los')}</Knopf>
      </div>
      {fehler && <p className="fehlertext">{fehler}</p>}
      {lauf && <Schritte l={lauf} a={a} />}
    </Bereich>
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
function Verlauf({ a, klappe }: { a: AutomatisierungAnsicht; k: Kontextdaten; d: unknown; klappe: Klappe }) {
  const d = useDaten();
  const [laeufe, setLaeufe] = useState<Lauf[] | null>(null);
  const [fehler, setFehler] = useState<string>();
  const laden = useCallback(async () => { try { setLaeufe(await automatisierungApi.automatisierungLaeufe(a.id)); } catch (e) { setFehler((e as Error).message); } }, [a.id]);
  useEffect(() => { void laden(); const z = setInterval(() => void laden(), 2_000); return () => clearInterval(z); }, [laden]);
  const handle = async (f: () => Promise<unknown>) => { try { await f(); await laden(); } catch (e) { setFehler((e as Error).message); } };
  const laufend = laeufe?.some((l) => l.zustand === 'laeuft');
  const eintraege: Listeneintrag[] = (laeufe ?? []).map((l) => {
    const offenFuerWiederholen = l.zustand === 'fehlgeschlagen' && !l.trocken && !l.nichtWiederholt;
    const zusammen = l.fehler ?? l.schritte.filter((x) => (x.teil === 'dann' || x.teil === 'sonst') && x.text).map((x) => x.text).join(' · ');
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
          <Knopf onClick={() => handle(() => automatisierungApi.automatisierungLaufWiederholen(l.id))}>{t('automatisierung.ui.wiederholen')}</Knopf>
          <Knopf onClick={() => handle(() => automatisierungApi.automatisierungLaufNichtWiederholen(l.id))}>{t('automatisierung.ui.nicht-wiederholen')}</Knopf>
        </div>}
      </>,
    };
  });
  return (
    <Bereich id="verlauf" titel={t('automatisierung.ui.verlauf')} klappe={klappe}
      kurz={laufend ? t('automatisierung.ui.verlauf.laeuft') : laeufe?.length ? t('automatisierung.ui.bereich.zuletzt', { zeit: zeit(laeufe[0].gestartet) }) : t('automatisierung.ui.verlauf.leer')}>
      {fehler && <p className="fehlertext">{fehler}</p>}
      {laufend && <p className="leise klein" role="status">{t('automatisierung.ui.verlauf.laeuft')}</p>}
      {!laeufe ? <p className="leise">{t('automatisierung.ui.lade')}</p> : !laeufe.length ? <p className="leise">{t('automatisierung.ui.verlauf.leer')}</p> : <Eintragsliste eintraege={eintraege} />}
    </Bereich>
  );
}

