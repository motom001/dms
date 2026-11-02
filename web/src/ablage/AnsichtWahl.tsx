import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ansichtAbschnitte, EINSTELLUNG_ANGEHEFTET, EINSTELLUNG_AUSGEBLENDET, EINSTELLUNG_ZULETZT, merkeZuletzt, umschalten } from '../../../shared/src/ansichtwahl';
import type { Sicht } from '../../../shared/src/sichten';
import { useDaten } from '../daten';
import { Link } from '../ort';
import { Symbol } from '../Symbol';
import { ZahlWarte } from './ZahlWarte';

/**
 * Ansicht wählen am Handy (#498): ein Knopf „<Ansicht> ▾“ statt einer Reiterleiste mit 40 Ansichten.
 * Er öffnet ein Blatt von unten: Suche, feste Einträge (Start, Zu erledigen …), „Meine Ansichten“
 * (Stern), „Zuletzt benutzt“ und die Ansichten nach Gruppen, zuklappbar. Ausblenden gilt nur für einen selbst.
 * Am Rechner bleibt die Liste; darüber filtert ein kleines Suchfeld (AnsichtFilter).
 */

const zahl = (n: number) => n.toLocaleString('de-DE');

export interface FesterEintrag { pfad: string; name: ReactNode; text: string; zahl?: number; /** Zahl kommt noch (#512). */ warte?: boolean; hervor?: boolean; an: boolean }
/** #507: Ansichten, die oben als fester Eintrag stehen (Neue Post), erscheinen nicht noch einmal in den Gruppen. */

function Zeile({ s, aktiv, angeheftet, tiefe = 0, pfad, anheften }: { s: Sicht; aktiv?: string; angeheftet: boolean; tiefe?: number; pfad?: string; anheften(id: string): void }) {
  const d = useDaten();
  const n = d.zaehler.sichten?.[s.id];
  return (
    <li className="aw-zeile" style={{ paddingLeft: `${tiefe * 16}px` }}>
      <Link to={`/ablage/${s.id}`} className={`aw-link ${aktiv === s.id ? 'an' : ''}`}>
        <span className="aw-name">{pfad && <span className="leise klein">{pfad} › </span>}{s.name}</span>
        {!d.zahlenDa ? <ZahlWarte /> : n !== undefined && <span className={s.id === d.zaehler.neuePost && n > 0 ? 'zaehler' : 'zahl'}>{zahl(n)}</span>}
      </Link>
      <button type="button" className={`aw-stern ${angeheftet ? 'an' : ''}`} aria-pressed={angeheftet} onClick={() => anheften(s.id)}
        aria-label={angeheftet ? `„${s.name}“ von „Meine Ansichten“ lösen` : `„${s.name}“ bei „Meine Ansichten“ anheften`}><Symbol name="stern" className={angeheftet ? 'sym-voll' : undefined} /></button>
    </li>
  );
}

export function AnsichtWahl({ aktiv, aktuell, feste, ohne = [] }: { aktiv?: string; aktuell: string; feste: FesterEintrag[]; ohne?: string[] }) {
  const d = useDaten();
  const [offen, setOffen] = useState(false);
  const [suche, setSuche] = useState('');
  const [verwalten, setVerwalten] = useState(false);
  const [aufgeklappt, setAufgeklappt] = useState<Set<string>>(new Set());
  const angeheftet = d.einstellungen[EINSTELLUNG_ANGEHEFTET];
  const ausgeblendet = d.einstellungen[EINSTELLUNG_AUSGEBLENDET];
  const zuletzt = d.einstellungen[EINSTELLUNG_ZULETZT];

  // Zuletzt benutzt: jede geöffnete eingerichtete Ansicht (auch am Rechner).
  const letzte = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!aktiv || letzte.current === aktiv || !d.sicht(aktiv)) return;
    letzte.current = aktiv;
    const alt = Array.isArray(zuletzt) ? zuletzt : [];
    if (alt[0] !== aktiv) d.setzeEinstellung(EINSTELLUNG_ZULETZT, merkeZuletzt(alt, aktiv));
  }, [aktiv, d, zuletzt]);
  // Nach dem Wählen schließen (die Adresse ändert sich).
  useEffect(() => { setOffen(false); setSuche(''); setVerwalten(false); }, [aktiv]);
  useEffect(() => {
    if (!offen) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOffen(false); };
    addEventListener('keydown', esc);
    return () => removeEventListener('keydown', esc);
  }, [offen]);

  const a = ansichtAbschnitte(d.sichten, { angeheftet, ausgeblendet, zuletzt, suche, ohne });
  const anIds = new Set(Array.isArray(angeheftet) ? angeheftet as string[] : []);
  const wegIds = new Set(Array.isArray(ausgeblendet) ? ausgeblendet as string[] : []);
  const anheften = (id: string) => d.setzeEinstellung(EINSTELLUNG_ANGEHEFTET, umschalten(angeheftet, id));
  const schliessen = () => setOffen(false);
  // Gruppe mit der aktiven Ansicht ist offen; bei höchstens zwei Gruppen alle.
  const istOffen = (schluessel: string, ids: string[]) => aufgeklappt.has(schluessel) !== (a.gruppen.length <= 2 || (!!aktiv && ids.includes(aktiv)));
  const klappe = (schluessel: string) => setAufgeklappt((x) => { const n = new Set(x); if (n.has(schluessel)) n.delete(schluessel); else n.add(schluessel); return n; });

  return (
    <div className="aw">
      <button type="button" className="aw-knopf" aria-haspopup="dialog" aria-expanded={offen} onClick={() => setOffen(true)}>
        <span className="ueber">Ansicht</span><span className="aw-aktuell">{aktuell}</span><span aria-hidden="true">▾</span>
      </button>
      {offen && <>
        <div className="aw-schleier" aria-hidden="true" onClick={schliessen} />
        <section className="aw-blatt" role="dialog" aria-modal="true" aria-label="Ansicht wählen">
          <div className="aw-kopf">
            <input type="search" className="aw-suche" placeholder="Ansicht suchen …" aria-label="Ansicht suchen" enterKeyHint="search" value={suche} onChange={(e) => setSuche(e.target.value)} />
            <button type="button" className="textknopf" onClick={schliessen}>Schließen</button>
          </div>
          {verwalten ? <>
            <p className="leise klein">Ausgeblendete Ansichten fehlen nur in deiner Auswahl hier – für alle anderen bleibt alles, wie es ist. Über die Suche findest du sie trotzdem.</p>
            <ul className="aw-liste">{d.sichten.filter((s) => !suche || s.name.toLocaleLowerCase('de-DE').includes(suche.toLocaleLowerCase('de-DE'))).map((s) => (
              <li key={s.id} className="aw-zeile"><label className="haken aw-haken"><input type="checkbox" checked={!wegIds.has(s.id)}
                onChange={() => d.setzeEinstellung(EINSTELLUNG_AUSGEBLENDET, umschalten(ausgeblendet, s.id))} /><span>{s.name}</span></label></li>
            ))}</ul>
            <button type="button" className="knopf aw-gross" onClick={() => setVerwalten(false)}>Fertig</button>
          </> : a.treffer ? (
            a.treffer.length ? <ul className="aw-liste">{a.treffer.map((t) => <Zeile key={t.sicht.id} s={t.sicht} pfad={t.pfad} aktiv={aktiv} angeheftet={anIds.has(t.sicht.id)} anheften={anheften} />)}</ul>
              : <p className="leise">Keine Ansicht heißt so.</p>
          ) : <>
            <ul className="aw-liste aw-feste">{feste.map((f) => (
              <li key={f.pfad} className="aw-zeile"><Link to={f.pfad} className={`aw-link ${f.an ? 'an' : ''}`}><span className="aw-name">{f.name}</span>{f.warte ? <ZahlWarte /> : !!f.zahl && <span className={f.hervor ? 'zaehler' : 'zahl'}>{zahl(f.zahl)}</span>}</Link></li>
            ))}</ul>
            {a.meine.length > 0 && <><h3 className="ueber aw-abschnitt">Meine Ansichten</h3>
              <ul className="aw-liste">{a.meine.map((s) => <Zeile key={s.id} s={s} aktiv={aktiv} angeheftet anheften={anheften} />)}</ul></>}
            {a.zuletzt.length > 0 && <><h3 className="ueber aw-abschnitt">Zuletzt benutzt</h3>
              <ul className="aw-liste">{a.zuletzt.map((s) => <Zeile key={s.id} s={s} aktiv={aktiv} angeheftet={anIds.has(s.id)} anheften={anheften} />)}</ul></>}
            {a.gruppen.map((g) => {
              const auf = istOffen(g.schluessel, g.eintraege.map((e) => e.sicht.id));
              return (
                <div key={g.schluessel} className="aw-gruppe">
                  <button type="button" className="aw-gruppenkopf" aria-expanded={auf} onClick={() => klappe(g.schluessel)}>
                    <span aria-hidden="true">{auf ? '▾' : '▸'}</span> {g.name} <span className="leise klein">{g.eintraege.length}</span>
                  </button>
                  {auf && <ul className="aw-liste">{g.eintraege.map((e) => <Zeile key={e.sicht.id} s={e.sicht} tiefe={e.tiefe} aktiv={aktiv} angeheftet={anIds.has(e.sicht.id)} anheften={anheften} />)}</ul>}
                </div>
              );
            })}
            <button type="button" className="textknopf klein aw-verwalten" onClick={() => setVerwalten(true)}>
              Ansichten ausblenden …{a.ausgeblendet > 0 && ` (${a.ausgeblendet} ausgeblendet)`}
            </button>
          </>}
        </section>
      </>}
    </div>
  );
}

/** Am Rechner: kleines Suchfeld über der Ansichten-Liste; mit Begriff eine flache Trefferliste statt des Baums. */
export function AnsichtFilter({ aktiv, baum }: { aktiv?: string; baum: ReactNode }) {
  const d = useDaten();
  const [suche, setSuche] = useState('');
  const a = suche.trim() ? ansichtAbschnitte(d.sichten, { suche }) : null;
  return (
    <>
      {d.sichten.length > 12 && <input type="search" className="aw-filter" placeholder="Ansicht suchen …" aria-label="Ansicht suchen" value={suche} onChange={(e) => setSuche(e.target.value)} />}
      {a?.treffer ? a.treffer.map((t) => (
        <Link key={t.sicht.id} to={`/ablage/${t.sicht.id}`} className={`sicht ${aktiv === t.sicht.id ? 'an' : ''}`} title={t.pfad || undefined}>
          <span className="nm">{t.sicht.name}</span>{!d.zahlenDa ? <ZahlWarte /> : d.zaehler.sichten?.[t.sicht.id] !== undefined && <span className="zahl">{zahl(d.zaehler.sichten[t.sicht.id])}</span>}
        </Link>
      )) : baum}
      {a?.treffer && !a.treffer.length && <p className="leise klein">Keine Ansicht heißt so.</p>}
    </>
  );
}
