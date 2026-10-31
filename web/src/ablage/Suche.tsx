import { useEffect, useMemo, useState } from 'react';
import { abfrageAus, alsParameter, chipsVon, eingabeart, istGesetzt, kannLeer, liesSuche, ohneChip, suchfelder, SUCHE_PFAD, zeitraumVon, ZEITRAEUME, type Feldeingabe, type Suchformular, type Zeitraum } from '../../../shared/src/erweitertesuche';
import { heuteIn, type Bedingungsfeld } from '../../../shared/src/sichten';
import type { Mappentyp } from '../../../shared/src/model';
import { api, type Bezuege } from '../api';
import { useDaten } from '../daten';
import { Hilfe } from '../Hilfe';
import { geheZu, Link } from '../ort';
import { titelOder } from '../seiten';
import { MappenWahl } from './MappeFormular';

/**
 * Erweiterte Suche (#199): links das Formular statt der Sichten, in der Mitte die Treffer mit den
 * Bedingungen als Chips. Die Suche steht in der Adresse (/ablage/suche?…).
 */

/** Titel verwiesener Mappen für Formular und Chips – über Suchen hinweg gemerkt. */
const titelCache: Bezuege = {};

/** Mappentypen, die man lesen darf (wenigstens teils). */
function useLesbareTypen(): Mappentyp[] | null {
  const d = useDaten();
  const [ids, setIds] = useState<Set<string> | null>(null);
  useEffect(() => {
    let aktuell = true;
    api.meineRechte().then((r) => { if (aktuell) setIds(new Set(r.filter((x) => x.rechte.R !== 'nie').map((x) => x.typId))); }).catch(() => aktuell && setIds(new Set(d.typen.map((t) => t.id))));
    return () => { aktuell = false; };
  }, [d.typen]);
  return ids ? d.typen.filter((t) => ids.has(t.id)) : null;
}

const typSchluessel = (t: Mappentyp) => t.schluessel ?? t.id;

export function Suchformular({ suche, zeigeTreffer }: { suche: URLSearchParams; zeigeTreffer(): void }) {
  const d = useDaten();
  const lesbar = useLesbareTypen();
  const adresse = suche.toString();
  const [f, setF] = useState<Suchformular>(() => liesSuche(suche));
  // Zurück/Vor oder ein entfernter Chip: Formular folgt der Adresse.
  useEffect(() => { setF(liesSuche(new URLSearchParams(adresse))); }, [adresse]);
  const [, neu] = useState(0);
  const merke = (id: string, b: { titel: string; typId: string }) => { titelCache[id] = b; neu((n) => n + 1); };

  const gewaehlt = useMemo(() => abfrageAus(f, d.typen).typen, [f, d.typen]);
  const felder = useMemo(() => suchfelder(gewaehlt), [gewaehlt]);
  const entfallen = Object.entries(f.felder).filter(([k, e]) => istGesetzt(e) && !felder.some((x) => x.key === k)).map(([k]) => k);
  const setzeFeld = (key: string, e: Feldeingabe | undefined) => setF((x) => {
    const n = { ...x.felder };
    if (e && istGesetzt(e)) n[key] = e; else delete n[key];
    return { ...x, felder: n };
  });
  const umschalten = (t: Mappentyp) => setF((x) => {
    const k = typSchluessel(t);
    const an = gewaehlt.some((y) => y.id === t.id);
    return { ...x, typen: an ? x.typen.filter((y) => y !== k && y !== t.name && y !== t.id) : [...x.typen, k] };
  });

  function suchen(e?: React.FormEvent) {
    e?.preventDefault();
    // Felder, die es bei der Auswahl nicht gibt, kommen nicht in die Adresse.
    const ohne = { ...f, felder: Object.fromEntries(Object.entries(f.felder).filter(([k]) => felder.some((x) => x.key === k))) };
    geheZu(`${SUCHE_PFAD}?${alsParameter(ohne).toString()}`);
    zeigeTreffer();
  }

  return (
    <form className="suchformular stapel" onSubmit={suchen} aria-label="Erweiterte Suche">
      <Link to="/ablage/eingang" className="verweis klein">← zurück zu den Ansichten</Link>
      <h2 className="h3">Erweiterte Suche <Hilfe ort="ablage.erweitertesuche" /></h2>

      <fieldset className="suchgruppe">
        <legend>Mappentypen</legend>
        {!lesbar ? <p className="leise klein">Lade …</p> : (
          <div className="typwahl">
            {lesbar.map((t) => (
              <label key={t.id} className="haken klein"><input type="checkbox" checked={gewaehlt.some((y) => y.id === t.id)} onChange={() => umschalten(t)} /><span>{t.name}</span></label>
            ))}
          </div>
        )}
        <p className="leise klein">{gewaehlt.length ? (gewaehlt.length > 1 ? 'Angeboten werden die Felder, die alle gewählten Mappentypen haben.' : '') : 'Ohne Auswahl: alle Mappentypen, die du lesen darfst – dann nur mit den allgemeinen Feldern.'}</p>
      </fieldset>

      <fieldset className="suchgruppe">
        <legend>Felder</legend>
        {felder.map((x) => <Feldsuche key={x.key} feld={x} e={f.felder[x.key] ?? {}} setze={(e) => setzeFeld(x.key, e)} merke={merke} />)}
        {entfallen.length > 0 && (
          <div className="hinweis warn klein" role="status"><p>Entfallen bei dieser Auswahl: {entfallen.join(', ')}. Die Werte bleiben gemerkt, falls du die Auswahl zurückänderst.</p></div>
        )}
      </fieldset>

      <fieldset className="suchgruppe">
        <legend>Volltext <Hilfe ort="ablage.suchvolltext" /></legend>
        <input type="search" aria-label="Suchbegriff im Volltext" placeholder="z. B. Backofen" value={f.volltext} onChange={(e) => setF({ ...f, volltext: e.target.value })} />
        <div className="zeile">
          <label className="haken klein"><input type="checkbox" checked={f.inDokumenten} onChange={(e) => setF({ ...f, inDokumenten: e.target.checked })} /><span>in Dokumenten</span></label>
          <label className="haken klein"><input type="checkbox" checked={f.inNotizen} onChange={(e) => setF({ ...f, inNotizen: e.target.checked })} /><span>in Notizen</span></label>
        </div>
      </fieldset>

      <div className="knoepfe">
        <button type="submit" className="knopf primaer">Suchen</button>
        <button type="button" className="textknopf" onClick={() => setF({ ...f, felder: {}, volltext: '' })}>Leeren</button>
      </div>
    </form>
  );
}

/** Eine Zeile je Feld: die passende Eingabe, dazu „leer“ bzw. „nicht leer“, wo es das gibt. */
function Feldsuche({ feld, e, setze, merke }: { feld: Bedingungsfeld; e: Feldeingabe; setze(e: Feldeingabe | undefined): void; merke(id: string, b: { titel: string; typId: string }): void }) {
  const d = useDaten();
  const art = eingabeart(feld);
  const id = `such-${feld.key}`;
  const leerArten = (['leer', 'nichtLeer'] as const).filter((o) => kannLeer(feld, o));
  const werte = e.werte ?? [];
  let eingabe: React.ReactNode = null;
  if (art === 'datum' || art === 'zahl') {
    const typ = art === 'datum' ? 'date' : 'text';
    eingabe = (
      <div className="vonbis">
        <input id={id} type={typ} inputMode={art === 'zahl' ? 'decimal' : undefined} aria-label={`${feld.label} von`} placeholder="von" value={e.von ?? ''} onChange={(x) => setze({ ...e, von: x.target.value })} />
        <span aria-hidden="true">–</span>
        <input type={typ} inputMode={art === 'zahl' ? 'decimal' : undefined} aria-label={`${feld.label} bis`} placeholder="bis" value={e.bis ?? ''} onChange={(x) => setze({ ...e, bis: x.target.value })} />
        {art === 'datum' && (
          <select aria-label={`${feld.label}: Zeitraum wählen`} value="" onChange={(x) => { if (!x.target.value) return; const [von, bis] = zeitraumVon(x.target.value as Zeitraum, heuteIn()); setze({ ...e, von, bis }); }}>
            <option value="">Zeitraum …</option>
            {(Object.keys(ZEITRAEUME) as Zeitraum[]).map((z) => <option key={z} value={z}>{ZEITRAEUME[z]}</option>)}
          </select>
        )}
      </div>
    );
  } else if (art === 'verweis') {
    const ziel = d.typ(feld.feld?.zielTyp ?? '');
    eingabe = ziel
      ? <MappenWahl id={id} ziel={ziel} mehrfach wert={werte} bekannt={titelCache} merke={merke} setze={(v) => setze({ ...e, werte: Array.isArray(v) ? v.map(String) : v ? [String(v)] : [] })} />
      : <p className="leise klein">Der Zieltyp fehlt.</p>;
  } else if (art === 'person') {
    eingabe = (
      <select id={id} multiple size={Math.min(4, Math.max(2, d.personen.length))} value={werte} onChange={(x) => setze({ ...e, werte: [...x.target.selectedOptions].map((o) => o.value) })}>
        {d.personen.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    );
  } else if (art === 'auswahl') {
    eingabe = (
      <div className="zeile umbruch">
        {(feld.feld?.optionen ?? []).map((o) => (
          <label key={o} className="haken klein"><input type="checkbox" checked={werte.includes(o)} onChange={(x) => setze({ ...e, werte: x.target.checked ? [...werte, o] : werte.filter((w) => w !== o) })} /><span>{o}</span></label>
        ))}
      </div>
    );
  } else if (art === 'janein') {
    eingabe = (
      <div className="zeile" role="radiogroup" aria-label={feld.label}>
        {[['', 'egal'], ['ja', 'ja'], ['nein', 'nein']].map(([w, t]) => (
          <label key={w} className="haken klein"><input type="radio" name={id} checked={(werte[0] ?? '') === w} onChange={() => setze({ ...e, werte: w ? [w] : [] })} /><span>{t}</span></label>
        ))}
      </div>
    );
  } else if (art === 'text') {
    eingabe = <input id={id} type="text" placeholder="enthält …" value={werte[0] ?? ''} onChange={(x) => setze({ ...e, werte: x.target.value ? [x.target.value] : [] })} />;
  }
  return (
    <div className={`feldsuche${istGesetzt(e) ? ' gesetzt' : ''}`}>
      <div className="feldsuchkopf">
        <label htmlFor={id} className="klein">{feld.label}</label>
        {leerArten.length > 0 && (
          <select className="klein" aria-label={`${feld.label}: leer`} value={e.leer ?? ''} onChange={(x) => setze(x.target.value ? { leer: x.target.value as 'leer' | 'nichtLeer' } : {})}>
            <option value="">Wert</option>
            {leerArten.map((o) => <option key={o} value={o}>{o === 'leer' ? 'ist leer' : 'ist nicht leer'}</option>)}
          </select>
        )}
      </div>
      {!e.leer && eingabe}
    </div>
  );
}

/** Chips über der Trefferliste; × entfernt eine Bedingung und sucht sofort neu. */
export function Suchchips({ suche, offen }: { suche: URLSearchParams; offen?: string }) {
  const d = useDaten();
  const f = liesSuche(suche);
  const [, neu] = useState(0);
  // Titel verwiesener Mappen nachladen.
  const fehlend = Object.values(f.felder).flatMap((e) => e.werte ?? []).filter((x) => /^[0-9a-f-]{36}$/i.test(x) && !titelCache[x]).join(',');
  useEffect(() => {
    let aktuell = true;
    for (const x of fehlend ? fehlend.split(',') : []) {
      api.mappe(x).then((r) => { titelCache[x] = { titel: r.mappe.titel ?? '', typId: r.mappe.typId }; }).catch(() => { titelCache[x] = { titel: 'nicht sichtbare Mappe', typId: '' }; })
        .finally(() => aktuell && neu((n) => n + 1));
    }
    return () => { aktuell = false; };
  }, [fehlend]);
  const chips = chipsVon(f, d.typen, (id) => titelOder(titelCache[id]?.titel ?? '…'), d.person);
  if (!chips.length) return <p className="leise klein">Noch keine Bedingung – es werden alle Mappen gezeigt, die du lesen darfst.</p>;
  return (
    <ul className="suchchips" aria-label="Bedingungen der Suche">
      {chips.map((c) => (
        <li key={c.key} className="chip suchchip">{c.text}
          <button type="button" className="chipweg" aria-label={`Bedingung „${c.text}“ entfernen`} title="Bedingung entfernen"
            onClick={() => geheZu(`${SUCHE_PFAD}${offen ? `/${offen}` : ''}?${alsParameter(ohneChip(f, c.key)).toString()}`)}>×</button>
        </li>
      ))}
    </ul>
  );
}

/** Mappentypen der Suche in der Adresse (für Spalten und Sortierung). */
export function suchTypen(suche: URLSearchParams, typen: Mappentyp[]): Mappentyp[] {
  return abfrageAus(liesSuche(suche), typen).typen;
}
/** Fehler der Suche in der Adresse, z. B. ein Typ, den es nicht gibt. */
export function suchFehler(suche: URLSearchParams, typen: Mappentyp[]): string[] {
  return abfrageAus(liesSuche(suche), typen).fehler;
}
