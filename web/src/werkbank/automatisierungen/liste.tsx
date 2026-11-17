import { useMemo, useState } from 'react';
import { REIHENFOLGE, type AutomatisierungAnsicht } from '../../../../shared/src/automatisierung';
import type { InstalliertesPaket } from '../../../../shared/src/pakete';
import { automatisierungApi } from '../../api/automatisierung';
import { Feld, GeloeschteEintraege, HakenFeld, Knopf, KnopfLink, PaketChip, Suchfeld, Wahlhaken } from '../../bausteine';
import { Listenkopf } from '../../Listenkopf';
import { Link } from '../../ort';
import { rueckfrage } from '../../rueckfrage';
import { t } from '../../sprache';
import { Symbol } from '../../Symbol';
import { Ansage, umgestellt, useZiehen, Ziehgriff } from '../../ziehen';
import { paketHerkunft } from '../listensuche';
import { GRUPPIERUNGEN, haengt, istAngehalten, zeilenTipp, zeit, zielVon, type Gruppierung, type Stand } from './hilfen';
import type { AutomatisierungenZustand } from './zustand';

/**
 * Werkbank → Automatisierungen, die Liste (#675, #1172; #1279 aus Automatisierungen.tsx gezogen): Hinweise, Suche,
 * Mehrfachauswahl, Gruppieren und – nach Auslöser – Umsortieren.
 */

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

/* ---------- Liste ---------- */

/** Hinweise über der Liste: umgezogene Erinnerungen (#712) und fehlgeschlagene Läufe (#707). */
function ListenHinweise({
  s,
  z,
  nurFehl,
  setNurFehl,
  setFehler,
}: {
  s: Stand;
  z: AutomatisierungenZustand;
  nurFehl: boolean;
  setNurFehl: (x: boolean) => void;
  setFehler: (x?: string) => void;
}) {
  return (
    <>
      {s.umgezogen && (
        <div className="hinweis info">
          <p>
            <strong>{t('automatisierung.ui.umgezogen', { anzahl: s.umgezogen.anzahl })}</strong> {t('automatisierung.ui.umgezogen.text')}
          </p>
          <Knopf
            groesse="klein"
            onClick={async () => {
              try {
                await automatisierungApi.automatisierungUmzugGesehen();
                await z.laden();
              } catch (e) {
                setFehler((e as Error).message);
              }
            }}>
            {t('automatisierung.ui.umgezogen.ok')}
          </Knopf>
        </div>
      )}
      {!!s.fehlgeschlagen && (
        <div className="hinweis warn">
          {/* Welcher Lauf und wann (#707); bei mehreren „Anzeigen“ filtert die Liste. Probeläufe zählen nicht. */}
          <p>
            {s.fehlgeschlagen === 1 && s.fehlschlaege[0] ? (
              <>
                {t('automatisierung.ui.fehlgeschlagen.einer', { name: s.fehlschlaege[0].name, zeit: zeit(s.fehlschlaege[0].gestartet) })}{' '}
                <Link to={`/werkbank/automatisierungen/${s.fehlschlaege[0].automatisierungId}`} className="verweis">
                  {t('automatisierung.ui.fehlgeschlagen.anzeigen')}
                </Link>
              </>
            ) : (
              t('automatisierung.ui.fehlgeschlagen', { anzahl: s.fehlgeschlagen })
            )}
          </p>
          <div className="knoepfe">
            {s.fehlgeschlagen > 1 && (
              <Knopf groesse="klein" aria-pressed={nurFehl} onClick={() => setNurFehl(!nurFehl)}>
                {nurFehl ? t('automatisierung.ui.fehlgeschlagen.alle') : t('automatisierung.ui.fehlgeschlagen.anzeigen')}
              </Knopf>
            )}
            <Knopf
              groesse="klein"
              onClick={async () => {
                try {
                  await automatisierungApi.automatisierungenWiederholen();
                  setNurFehl(false);
                  await z.laden();
                } catch (e) {
                  setFehler((e as Error).message);
                }
              }}>
              {t('automatisierung.ui.alle-wiederholen')}
            </Knopf>
            <Knopf
              groesse="klein"
              onClick={async () => {
                try {
                  await automatisierungApi.automatisierungenNichtWiederholen();
                  setNurFehl(false);
                  await z.laden();
                } catch (e) {
                  setFehler((e as Error).message);
                }
              }}>
              {t('automatisierung.ui.nicht-wiederholen.alle')}
            </Knopf>
          </div>
        </div>
      )}
    </>
  );
}

/** Ziele nach außen (#671): wohin „URL aufrufen“ darf – eine eigene Seite rechts. */
function ZieleLink({ an, anzahl }: { an: boolean; anzahl: number }) {
  return (
    <p className="klein">
      <Link to="/werkbank/automatisierungen/ziele" className={`verweis tippziel${an ? ' an' : ''}`}>
        {t('automatisierung.ui.ziele.link', { anzahl })}
      </Link>
    </p>
  );
}

/** Mehrfachauswahl (#1172): Leiste mit Ein- und Ausschalten für die Auswahl, sobald etwas gewählt ist. */
function Auswahlleiste({ anzahl, schalte, aufheben }: { anzahl: number; schalte: (an: boolean) => Promise<void>; aufheben: () => void }) {
  if (!anzahl) return null;
  return (
    <div className="aktionsleiste auto-auswahl" role="region" aria-label={t('automatisierung.ui.liste.auswahl')}>
      <span>{t('automatisierung.ui.liste.gewaehlt', { anzahl })}</span>
      <Knopf groesse="klein" onClick={() => schalte(true)}>
        {t('automatisierung.ui.liste.einschalten')}
      </Knopf>
      <Knopf groesse="klein" onClick={() => schalte(false)}>
        {t('automatisierung.ui.liste.ausschalten')}
      </Knopf>
      <span className="luecke" />
      <Knopf art="link" groesse="klein" onClick={aufheben}>
        {t('automatisierung.ui.liste.auswahl-aufheben')}
      </Knopf>
    </div>
  );
}

/** Zustand der Liste: Suche, Gruppen, Auswahl, Schalten, Umsortieren (#1172). */
function useListe(z: AutomatisierungenZustand, pakete: InstalliertesPaket[]) {
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
  const liste = (s?.automatisierungen ?? []).filter(
    (a) => (!nurFehl || betroffen.has(a.id)) && (!suche.trim() || `${a.name} ${a.kurz}`.toLowerCase().includes(suche.trim().toLowerCase())),
  );
  const herkunft = (a: AutomatisierungAnsicht) =>
    a.herkunft === 'dms' ? 'ablago' : a.herkunft === 'paket' ? paketHerkunft(a.paketId, pakete) : null;
  const gruppen = useMemo(() => {
    const schluessel = (a: AutomatisierungAnsicht) =>
      gruppierung === 'ausloeser'
        ? a.ausloeser
        : gruppierung === 'paket'
          ? a.herkunft === 'paket'
            ? `paket:${a.paketId}`
            : a.herkunft
          : zielVon(a);
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
  const waehle = (id: string, an: boolean) =>
    setAuswahl((x) => {
      const y = new Set(x);
      if (an) y.add(id);
      else y.delete(id);
      return y;
    });
  const angehaltene = (s?.automatisierungen ?? []).filter(istAngehalten);
  const { schalte, angehalteneEinschalten, sortiere } = listenAktionen({
    z,
    s,
    angehaltene,
    setFehler,
    setSchaltFehler,
    setAnsage,
    setAuswahl,
  });
  const zieh = useZiehen({
    erlaubt: (q, ziel) => gruppierung === 'ausloeser' && gruppen.some(([, g]) => g.some((a) => a.id === q) && g.some((a) => a.id === ziel)),
    fertig: (q, ziel, ort) => {
      const g = gruppen.find(([, x]) => x.some((a) => a.id === q))?.[1];
      if (g)
        void sortiere(
          g,
          umgestellt(
            g,
            g.findIndex((a) => a.id === q),
            g.findIndex((a) => a.id === ziel),
            ort === 'in' ? 'nach' : ort,
          ),
        );
    },
  });
  return {
    gruppierung,
    setGruppierung,
    suche,
    setSuche,
    ansage,
    fehler,
    setFehler,
    auswahl,
    setAuswahl,
    schaltFehler,
    nurFehl,
    setNurFehl,
    s,
    liste,
    herkunft,
    gruppen,
    gruppenTitel,
    sichtbar,
    gewaehlt,
    waehle,
    angehaltene,
    schalte,
    angehalteneEinschalten,
    sortiere,
    zieh,
  };
}
type ListenZustand = ReturnType<typeof useListe>;

/** Schalten (eine nach der anderen), alle angehaltenen einschalten (#1172) und Umsortieren in einer Gruppe. */
function listenAktionen(c: {
  z: AutomatisierungenZustand;
  s: Stand | null;
  angehaltene: AutomatisierungAnsicht[];
  setFehler(f?: string): void;
  setSchaltFehler(l: string[]): void;
  setAnsage(a: string): void;
  setAuswahl(a: Set<string>): void;
}) {
  const { z, s, angehaltene, setFehler, setSchaltFehler, setAnsage, setAuswahl } = c;
  /** Ein- bzw. ausschalten, eine nach der anderen; was nicht geht (passt nicht mehr), bleibt mit Grund stehen. */
  async function schalte(ids: string[], an: boolean) {
    setFehler(undefined);
    setSchaltFehler([]);
    const nicht: string[] = [];
    let n = 0;
    for (const id of ids) {
      const a = s?.automatisierungen.find((x) => x.id === id);
      try {
        await automatisierungApi.automatisierungSchalten(id, an);
        n++;
      } catch (e) {
        nicht.push(`${a?.name ?? id}: ${(e as Error).message}`);
      }
    }
    setSchaltFehler(nicht);
    setAnsage(t(an ? 'automatisierung.ui.liste.eingeschaltet' : 'automatisierung.ui.liste.ausgeschaltet', { anzahl: n }));
    setAuswahl(new Set());
    await z.laden();
  }
  async function angehalteneEinschalten() {
    const ja = await rueckfrage({
      titel: t('automatisierung.ui.liste.angehaltene.frage', { anzahl: angehaltene.length }),
      text: (
        <>
          {t('automatisierung.ui.liste.angehaltene.text')}
          <ul>
            {angehaltene.map((a) => (
              <li key={a.id}>{a.name}</li>
            ))}
          </ul>
        </>
      ),
      ja: t('automatisierung.ui.wieder-einschalten'),
    });
    if (ja)
      await schalte(
        angehaltene.map((a) => a.id),
        true,
      );
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
    } catch (e) {
      setFehler((e as Error).message);
    }
  }
  return { schalte, angehalteneEinschalten, sortiere };
}

/** Eine Zeile (#1172): höchstens zwei Zeilen – Zeichen, Name und Paket, darunter leise die Kurzform; der Grund im Tooltip. */
function Zeile({ l, a, g, offen }: { l: ListenZustand; a: AutomatisierungAnsicht; g?: AutomatisierungAnsicht[]; offen?: string }) {
  const { auswahl, zieh, waehle, sortiere, herkunft } = l;
  const i = g?.findIndex((x) => x.id === a.id) ?? -1;
  const e = g ? zieh.eintrag(a.id) : {};
  const { className, ...rest } = e as { className?: string };
  return (
    <li {...rest} className={`auto-zeile${auswahl.has(a.id) ? ' gewaehlt' : ''}${className ? ` ${className}` : ''}`}>
      <Wahlhaken
        an={auswahl.has(a.id)}
        beschriftung={t('automatisierung.ui.liste.waehlen', { name: a.name })}
        setze={(an) => waehle(a.id, an)}
      />
      {g && g.length > 1 && (
        <Ziehgriff
          griff={zieh.griff(a.id, a.name)}
          tasten={{
            hoch: i > 0 ? () => void sortiere(g, umgestellt(g, i, i - 1, 'vor')) : undefined,
            runter: i < g.length - 1 ? () => void sortiere(g, umgestellt(g, i, i + 1, 'nach')) : undefined,
          }}
        />
      )}
      <Link to={`/werkbank/automatisierungen/${a.id}`} className={`eintrag werk ${offen === a.id ? 'an' : ''}`} title={zeilenTipp(a)}>
        <span className="titel">
          <Zustandszeichen a={a} />
          <span className="name">{a.name}</span>
          <PaketChip paket={herkunft(a)} inLink />
        </span>
        <span className="unter leise">{a.kurz}</span>
      </Link>
    </li>
  );
}

/** Suche, „Alle auswählen“, Gruppieren, Auswahlleiste und die Liste – gruppiert oder nicht. */
function Inhalt({ l, offen }: { l: ListenZustand; offen?: string }) {
  const { suche, setSuche, sichtbar, gewaehlt, setAuswahl, gruppierung, setGruppierung, gruppen, gruppenTitel, liste, schalte } = l;
  return (
    <>
      <Suchfeld wert={suche} setze={setSuche} beschriftung={t('automatisierung.ui.suchen')} platzhalter={t('automatisierung.ui.suchen')} />
      <div className="zeile auto-werkzeuge">
        <HakenFeld beschriftung={t('automatisierung.ui.liste.alle-waehlen')} className="klein">
          <input
            type="checkbox"
            checked={!!sichtbar.length && gewaehlt.length === sichtbar.length}
            onChange={(x) => setAuswahl(x.target.checked ? new Set(sichtbar) : new Set())}
          />
        </HakenFeld>
        {/* Eine Auswahl statt eines Umschalters: Vier Wahlen passen in die schmale Liste nicht nebeneinander. */}
        <Feld beschriftung={t('automatisierung.ui.liste.gruppieren')} beschriftungVerbergen className="klein">
          <select value={gruppierung} onChange={(x) => setGruppierung(x.target.value as Gruppierung)}>
            {GRUPPIERUNGEN.map((x) => (
              <option key={x} value={x}>
                {t.frei(`automatisierung.ui.liste.gruppierung.${x}`)}
              </option>
            ))}
          </select>
        </Feld>
      </div>
      <Auswahlleiste anzahl={gewaehlt.length} schalte={(an) => schalte(gewaehlt, an)} aufheben={() => setAuswahl(new Set())} />
      {gruppierung !== 'ohne' ? (
        gruppen.map(([k, g]) => (
          <section key={k} className="automatisierung-gruppe" aria-label={gruppenTitel(k, g)}>
            <h2 className="h3 klein">
              {gruppenTitel(k, g)}
              {gruppierung === 'ausloeser' && g.length > 1 ? (
                <span className="leise"> · {t('automatisierung.ui.liste.gruppe', { anzahl: g.length })}</span>
              ) : (
                <span className="leise"> · {g.length}</span>
              )}
            </h2>
            <ul className="mappenliste auto-liste">
              {g.map((a) => (
                <Zeile key={a.id} l={l} a={a} g={gruppierung === 'ausloeser' ? g : undefined} offen={offen} />
              ))}
            </ul>
          </section>
        ))
      ) : (
        <ul className="mappenliste auto-liste">
          {liste.map((a) => (
            <Zeile key={a.id} l={l} a={a} offen={offen} />
          ))}
        </ul>
      )}
    </>
  );
}

export function AutomatisierungenListe({
  z,
  offen,
  pakete = [],
}: {
  z: AutomatisierungenZustand;
  offen?: string;
  pakete?: InstalliertesPaket[];
}) {
  const l = useListe(z, pakete);
  const { s, fehler, setFehler, nurFehl, setNurFehl, angehaltene, angehalteneEinschalten, ansage, schaltFehler } = l;
  return (
    <>
      <Listenkopf
        titel={t('automatisierung.ui.titel')}
        hilfe="werkbank.automatisierungen"
        beschreibung={t('automatisierung.ui.beschreibung')}>
        <KnopfLink to="/werkbank/automatisierungen/neu" art="anlegen" groesse="klein">
          {t('automatisierung.ui.neu')}
        </KnopfLink>
      </Listenkopf>
      {/* Ziele nach außen (#671): wohin „URL aufrufen“ darf – eine eigene Seite rechts. */}
      <ZieleLink an={offen === 'ziele'} anzahl={s?.kontext.ziele?.length ?? 0} />
      {z.fehler && (
        <div className="hinweis schlecht">
          <p>{z.fehler}</p>
        </div>
      )}
      {fehler && (
        <div className="hinweis schlecht">
          <p>{fehler}</p>
        </div>
      )}
      {s && <ListenHinweise s={s} z={z} nurFehl={nurFehl} setNurFehl={setNurFehl} setFehler={setFehler} />}
      {/* Nach einer Wiederherstellung (#1172): alle angehaltenen auf einmal – mit Rückfrage, die sie nennt. */}
      {angehaltene.length > 0 && (
        <div className="knoepfe">
          <Knopf onClick={angehalteneEinschalten}>{t('automatisierung.ui.liste.angehaltene', { anzahl: angehaltene.length })}</Knopf>
        </div>
      )}
      <Ansage text={ansage} />
      {schaltFehler.length > 0 && (
        <div className="hinweis schlecht" role="alert">
          <p>{t('automatisierung.ui.liste.nicht-geschaltet')}</p>
          <ul>
            {schaltFehler.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
      )}
      {!s ? (
        <p className="leise">{t('automatisierung.ui.lade')}</p>
      ) : !s.automatisierungen.length ? (
        <p className="leise leerliste">{t('automatisierung.ui.leer')}</p>
      ) : (
        <Inhalt l={l} offen={offen} />
      )}
      <GeloeschteEintraege art="automatisierung" />
    </>
  );
}
