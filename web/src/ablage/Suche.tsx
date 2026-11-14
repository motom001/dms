import { istTeiltyp } from '../../../shared/src/teile';
import { optionText, typName } from '../../../shared/src/beschriftung';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ausgeblendeteFelder } from '../../../shared/src/darstellung';
import { abfrageAus, alsParameter, chipsVon, eingabeart, istGesetzt, kannLeer, liesSuche, ohneChip, suchfelder, SUCHE_PFAD, zeitraumVon, ZEITRAEUME, type Feldeingabe, type Suchformular, type Zeitraum } from '../../../shared/src/erweitertesuche';
import { heuteIn, type Bedingungsfeld } from '../../../shared/src/sichten';
import { inAllgemeinerSuche, zieleVon, type Mappentyp } from '../../../shared/src/model';
import { api, type Bezuege } from '../api';
import { useDaten } from '../daten';
import { Hilfe } from '../Hilfe';
import { geheZu } from '../ort';
import { t } from '../sprache';
import { Symbol } from '../Symbol';
import { titelOder } from '../seiten';
import { MappenWahl } from './MappeFormular';
import { Mehrfachauswahl } from './Mehrfachauswahl';
import { Feld, FeldGruppe, HakenFeld, Knopf } from '../bausteine';

/**
 * Erweiterte Suche (#199, #426): oben in der Mitte das Formular, darunter die Treffer mit den Bedingungen als
 * Chips; links bleibt die Navigation. Solange keine Mappe offen ist, reicht die Mitte bis an den rechten Rand.
 * Die Suche steht in der Adresse (/ablage/suche?…).
 */

/** Titel verwiesener Mappen für Formular und Chips – über Suchen hinweg gemerkt. */
const titelCache: Bezuege = {};

/** Mappentypen, die man lesen darf (wenigstens teils). */
function useLesbareTypen(): Mappentyp[] | null {
  const d = useDaten();
  const [ids, setIds] = useState<Set<string> | null>(null);
  useEffect(() => {
    let aktuell = true;
    api.meineRechte().then((r) => { if (aktuell) setIds(new Set(r.filter((x) => x.rechte.R !== 'nie').map((x) => x.typId))); }).catch(() => aktuell && setIds(new Set(d.typen.map((mappentyp) => mappentyp.id))));
    return () => { aktuell = false; };
  }, [d.typen]);
  // Teile (#1031) nicht: Sie erscheinen in der Suche über ihre übergeordnete Mappe.
  return ids ? d.typen.filter((mappentyp) => ids.has(mappentyp.id) && !istTeiltyp(mappentyp)) : null;
}

const typSchluessel = (mappentyp: Mappentyp) => mappentyp.schluessel ?? mappentyp.id;

/**
 * Kopf der erweiterten Suche (#426): oben in der Mitte, über den Treffern. Offen das Formular, zugeklappt die
 * Zusammenfassung der Bedingungen – ein Klick darauf öffnet das Formular an dieser Stelle. Am Handy ist das
 * offene Formular ein eigener Schritt („Filter“), die Treffer stehen erst danach.
 */
export function Suchkopf({ suche, offen, formular, setFormular }: { suche: URLSearchParams; offen?: string; formular: boolean; setFormular(an: boolean): void }) {
  const [fokus, setFokus] = useState<string>();
  const hatSuche = !!suche.toString();
  if (formular) return <Suchformular suche={suche} fokus={fokus} zeigeTreffer={() => setFormular(false)} einklappen={hatSuche ? () => setFormular(false) : undefined} />;
  return (
    <>
    <div className="suchzusammenfassung">
      <Suchchips suche={suche} offen={offen} aendern={(k) => { setFokus(k); setFormular(true); }} />
      <Knopf groesse="klein" className="sz-aendern" onClick={() => { setFokus(undefined); setFormular(true); }}>
        <span className="nur-breit-inline">{t('suche.aendern')}</span><span className="nur-schmal">{t('suche.filter')}</span>
      </Knopf>
    </div>
    <OhneAllgemeineSuche typen={liesSuche(suche).typen} />
    </>
  );
}

/**
 * „In der allgemeinen Suche zeigen: nein“ (#1220): Ohne gewählten Mappentyp fehlen diese Typen in der Suche – ein Satz
 * sagt, welche, und wie man sie findet (den Typ wählen).
 */
function OhneAllgemeineSuche({ typen }: { typen: readonly string[] }) {
  const d = useDaten();
  const ohne = typen.length ? [] : d.typen.filter((x) => !istTeiltyp(x) && !inAllgemeinerSuche(x));
  if (!ohne.length) return null;
  return <p className="leise klein">{t('suche.typen.ohne-allgemeine', { namen: ohne.map((x) => typName(x)).join(', ') })}</p>;
}

export function Suchformular({ suche, fokus, zeigeTreffer, einklappen }: { suche: URLSearchParams; fokus?: string; zeigeTreffer(): void; einklappen?: () => void }) {
  const d = useDaten();
  const lesbar = useLesbareTypen();
  const adresse = suche.toString();
  const [f, setF] = useState<Suchformular>(() => liesSuche(suche));
  // Bedingungen nur bei Bedarf (#426): sichtbar sind die Felder, die man mit „+ Bedingung“ gewählt hat.
  const [aktiv, setAktiv] = useState<string[]>(() => Object.keys(liesSuche(suche).felder));
  // Zurück/Vor oder ein entfernter Chip: Formular folgt der Adresse.
  useEffect(() => { const n = liesSuche(new URLSearchParams(adresse)); setF(n); setAktiv(Object.keys(n.felder)); }, [adresse]);
  const [, neu] = useState(0);
  const merke = (id: string, b: { titel: string; typId: string }) => { titelCache[id] = b; neu((n) => n + 1); };
  const formRef = useRef<HTMLFormElement>(null);
  const [springe, setSpringe] = useState<string | undefined>(fokus);
  useEffect(() => {
    if (!springe) return;
    const el = formRef.current?.querySelector<HTMLElement>(springe === 'typ' ? '#such-typen' : springe === 'volltext' ? '#such-volltext' : `[data-feld="${CSS.escape(springe)}"] input, [data-feld="${CSS.escape(springe)}"] select`);
    if (el) { el.focus(); el.scrollIntoView?.({ block: 'nearest' }); setSpringe(undefined); }
  });

  const gewaehlt = useMemo(() => abfrageAus(f, d.typen).typen, [f, d.typen]);
  const felder = useMemo(() => suchfelder(gewaehlt), [gewaehlt]);
  const sichtbar = aktiv.map((k) => felder.find((x) => x.key === k)).filter((x): x is Bedingungsfeld => !!x);
  // Ausgeblendete Felder (#655) nicht zum Hinzufügen; was die Adresse schon nennt, bleibt.
  const aus = useMemo(() => new Set(gewaehlt.flatMap((x) => [...ausgeblendeteFelder(x)])), [gewaehlt]);
  const frei = felder.filter((x) => !aktiv.includes(x.key) && !aus.has(x.key));
  const entfallen = Object.entries(f.felder).filter(([k, e]) => istGesetzt(e) && !felder.some((x) => x.key === k)).map(([k]) => k);
  const setzeFeld = (key: string, e: Feldeingabe | undefined) => setF((x) => {
    const n = { ...x.felder };
    if (e && istGesetzt(e)) n[key] = e; else delete n[key];
    return { ...x, felder: n };
  });
  const dazu = (key: string) => { if (!key) return; setAktiv((a) => (a.includes(key) ? a : [...a, key])); setSpringe(key); };
  const weg = (key: string) => { setAktiv((a) => a.filter((k) => k !== key)); setzeFeld(key, undefined); };

  function suchen(e?: React.FormEvent) {
    e?.preventDefault();
    // Felder, die es bei der Auswahl nicht gibt, kommen nicht in die Adresse.
    const ohne = { ...f, felder: Object.fromEntries(Object.entries(f.felder).filter(([k]) => felder.some((x) => x.key === k))) };
    geheZu(`${SUCHE_PFAD}?${alsParameter(ohne).toString()}`);
    zeigeTreffer();
  }

  return (
    <form ref={formRef} className="suchformular blatt" onSubmit={suchen} aria-label={t('suche.titel')}>
      <fieldset className="suchgruppe">
        <legend>{t('suche.typen')}</legend>
        {!lesbar ? <p className="leise klein">{t('suche.lade')}</p>
          : <TypWahl lesbar={lesbar} gewaehlt={gewaehlt} setze={(l) => setF((x) => ({ ...x, typen: l.map(typSchluessel) }))} />}
        <p className="leise klein">{gewaehlt.length ? (gewaehlt.length > 1 ? t('suche.typen.gemeinsam') : '') : t('suche.typen.alle')}</p>
        <OhneAllgemeineSuche typen={f.typen} />
      </fieldset>

      <fieldset className="suchgruppe sg-bedingungen">
        <legend>{t('suche.bedingungen')}</legend>
        {!sichtbar.length && <p className="leise klein">{t('suche.bedingungen.leer')}</p>}
        {sichtbar.map((x) => <Feldsuche key={x.key} feld={x} e={f.felder[x.key] ?? {}} setze={(e) => setzeFeld(x.key, e)} merke={merke} weg={() => weg(x.key)} />)}
        {frei.length > 0
          ? (
            <Feld beschriftung={t('suche.bedingung.feld')} beschriftungVerbergen className="bedingungneu">
              <select value="" onChange={(e) => dazu(e.target.value)}>
                <option value="">{t('suche.bedingung.neu')}</option>
                {frei.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
              </select>
            </Feld>
          )
          : <p className="leise klein">{t('suche.bedingung.keine')}</p>}
        {entfallen.length > 0 && (
          <div className="hinweis warn klein" role="status"><p>{t('suche.entfallen', { felder: entfallen.join(', ') })}</p></div>
        )}
      </fieldset>

      <fieldset className="suchgruppe sg-volltext">
        <legend>{t('suche.volltext')} <Hilfe ort="ablage.suchvolltext" /></legend>
        <Feld id="such-volltext" beschriftung={t('suche.volltext.feld')} beschriftungVerbergen>
          <input type="search" placeholder={t('suche.volltext.beispiel')} value={f.volltext} onChange={(e) => setF({ ...f, volltext: e.target.value })} />
        </Feld>
        <div className="zeile">
          {/* Titel und Felder (#1218): Enter im Suchfeld oben kommt mit allen drei Orten hierher. */}
          <HakenFeld beschriftung={t('suche.volltext.felder')}><input type="checkbox" checked={f.inFeldern} onChange={(e) => setF({ ...f, inFeldern: e.target.checked })} /></HakenFeld>
          <HakenFeld beschriftung={t('suche.volltext.dokumente')}><input type="checkbox" checked={f.inDokumenten} onChange={(e) => setF({ ...f, inDokumenten: e.target.checked })} /></HakenFeld>
          <HakenFeld beschriftung={t('suche.volltext.notizen')}><input type="checkbox" checked={f.inNotizen} onChange={(e) => setF({ ...f, inNotizen: e.target.checked })} /></HakenFeld>
        </div>
      </fieldset>

      <div className="knoepfe">
        <Knopf art="haupt" type="submit" symbol="suche">{t('suche.suchen')}</Knopf>
        <Knopf onClick={() => { setF({ ...f, felder: {}, volltext: '' }); setAktiv([]); }}>{t('suche.leeren')}</Knopf>
        {einklappen && <Knopf art="link" onClick={einklappen}>{t('suche.einklappen')}</Knopf>}
      </div>
    </form>
  );
}

/**
 * Mappentypen wählen (#426) mit derselben Mehrfachauswahl wie ein Verweisfeld (#602): Suchfeld mit Vorschlägen,
 * die gewählten Typen darunter, je mit „Entfernen“. Ohne Auswahl gelten alle lesbaren Mappentypen.
 */
function TypWahl({ lesbar, gewaehlt, setze }: { lesbar: Mappentyp[]; gewaehlt: Mappentyp[]; setze(l: Mappentyp[]): void }) {
  const [eingabe, setEingabe] = useState('');
  const [offen, setOffen] = useState(false);
  const q = eingabe.trim().toLowerCase();
  const auswahl = lesbar.filter((x) => !gewaehlt.some((y) => y.id === x.id) && (!q || typName(x).toLowerCase().includes(q)));
  const waehle = (id: string) => { const x = auswahl.find((y) => y.id === id); if (!x) return; setze([...gewaehlt, x]); setEingabe(''); setOffen(false); };
  return (
    <Mehrfachauswahl id="such-typen" name={t('suche.typen')} platzhalter={t('suche.typen.suchen')} eingabeLabel={t('suche.typen.suchen')}
      eingabe={eingabe} setEingabe={setEingabe} offen={offen} setOffen={setOffen}
      vorschlaege={auswahl.map((x) => ({ id: x.id, text: typName(x) }))} leerText={t('suche.typen.keine')} waehle={waehle}
      gewaehlt={gewaehlt.map((x) => ({ id: x.id, inhalt: typName(x), entfernenText: t('suche.typen.entfernen', { name: typName(x) }) }))}
      entferne={(id) => setze(gewaehlt.filter((y) => y.id !== id))} />
  );
}

/** Eine Zeile je Feld: die passende Eingabe, dazu „leer“ bzw. „nicht leer“, wo es das gibt. */
function Feldsuche({ feld, e, setze, merke, weg }: { feld: Bedingungsfeld; e: Feldeingabe; setze(e: Feldeingabe | undefined): void; merke(id: string, b: { titel: string; typId: string }): void; weg(): void }) {
  const d = useDaten();
  const art = eingabeart(feld);
  const id = `such-${feld.key}`;
  const leerArten = (['leer', 'nichtLeer'] as const).filter((o) => kannLeer(feld, o));
  const werte = e.werte ?? [];
  let eingabe: React.ReactNode = null;
  if (art === 'datum' || art === 'zahl' || art === 'zeitraum') {
    // Zeitraum (#1035): von–bis als Text („1 Monat“ – „6 Monate“).
    const typ = art === 'datum' ? 'date' : 'text';
    eingabe = (
      <FeldGruppe beschriftung={feld.label} beschriftungVerbergen className="vonbis">
        <Feld id={id} beschriftung={t('ablage.suche.von', { label: feld.label })} beschriftungVerbergen>
          <input type={typ} inputMode={art === 'zahl' ? 'decimal' : undefined} placeholder={t('ablage.suche.von-2')} value={e.von ?? ''} onChange={(x) => setze({ ...e, von: x.target.value })} />
        </Feld>
        <span aria-hidden="true">–</span>
        <Feld beschriftung={t('ablage.suche.bis', { label: feld.label })} beschriftungVerbergen>
          <input type={typ} inputMode={art === 'zahl' ? 'decimal' : undefined} placeholder={t('ablage.suche.bis-2')} value={e.bis ?? ''} onChange={(x) => setze({ ...e, bis: x.target.value })} />
        </Feld>
        {art === 'datum' && (
          <Feld beschriftung={t('ablage.suche.zeitraum-waehlen', { label: feld.label })} beschriftungVerbergen>
            <select value="" onChange={(x) => { if (!x.target.value) return; const [von, bis] = zeitraumVon(x.target.value as Zeitraum, heuteIn()); setze({ ...e, von, bis }); }}>
              <option value="">{t('ablage.suche.zeitraum')}</option>
              {(Object.keys(ZEITRAEUME) as Zeitraum[]).map((z) => <option key={z} value={z}>{ZEITRAEUME[z]}</option>)}
            </select>
          </Feld>
        )}
      </FeldGruppe>
    );
  } else if (art === 'verweis') {
    // Mehrere Zieltypen (#1036): Mappen aus allen, dazu „vom Typ …“ zum Ankreuzen (in der Adresse „feld.typ=…“).
    const ziele = (feld.feld ? zieleVon(feld.feld) : []).map((z) => d.typ(z)).filter((x): x is Mappentyp => !!x);
    const ziel = ziele[0];
    const typen = e.typen ?? [];
    const kennung = (x: Mappentyp) => x.schluessel ?? x.id;
    eingabe = ziel
      ? <>
          <Feld id={id} beschriftung={feld.label} beschriftungVerbergen>{(v) => (
            <MappenWahl id={v.id} ziel={ziel} ziele={ziele} mehrfach wert={werte} bekannt={titelCache} merke={merke} setze={(w) => setze({ ...e, werte: Array.isArray(w) ? w.map(String) : w ? [String(w)] : [] })} />
          )}</Feld>
          {ziele.length > 1 && <FeldGruppe beschriftung={t('ablage.suche.vom-typ')} className="such-zieltypen">
            <span className="zeile umbruch">{ziele.map((x) => <label key={x.id} className="haken klein"><input type="checkbox" checked={typen.includes(kennung(x))} onChange={(c) => setze({ ...e, typen: c.target.checked ? [...typen, kennung(x)] : typen.filter((w) => w !== kennung(x)) })} /><span>{typName(x)}</span></label>)}</span>
          </FeldGruppe>}
        </>
      : <p className="leise klein">{t('ablage.suche.der-zieltyp-fehlt')}</p>;
  } else if (art === 'person') {
    eingabe = (
      <Feld id={id} beschriftung={feld.label} beschriftungVerbergen>
        <select multiple size={Math.min(4, Math.max(2, d.personen.length))} value={werte} onChange={(x) => setze({ ...e, werte: [...x.target.selectedOptions].map((o) => o.value) })}>
          {d.personen.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </Feld>
    );
  } else if (art === 'auswahl') {
    eingabe = (
      <FeldGruppe beschriftung={feld.label} beschriftungVerbergen>
        {(feld.feld?.optionen ?? []).map((o) => (
          <label key={o} className="haken klein"><input type="checkbox" checked={werte.includes(o)} onChange={(x) => setze({ ...e, werte: x.target.checked ? [...werte, o] : werte.filter((w) => w !== o) })} /><span>{feld.feld ? optionText(feld.feld, o) : o}</span></label>
        ))}
      </FeldGruppe>
    );
  } else if (art === 'janein') {
    eingabe = (
      <FeldGruppe beschriftung={feld.label} beschriftungVerbergen>
        {[['', t('ablage.suche.egal')], ['ja', t('ablage.suche.ja')], ['nein', t('ablage.suche.nein')]].map(([w, text]) => (
          <label key={w} className="haken klein"><input type="radio" name={id} checked={(werte[0] ?? '') === w} onChange={() => setze({ ...e, werte: w ? [w] : [] })} /><span>{text}</span></label>
        ))}
      </FeldGruppe>
    );
  } else if (art === 'text') {
    eingabe = <Feld id={id} beschriftung={feld.label} beschriftungVerbergen><input type="text" placeholder={t('ablage.suche.enthaelt')} value={werte[0] ?? ''} onChange={(x) => setze({ ...e, werte: x.target.value ? [x.target.value] : [] })} /></Feld>;
  }
  return (
    <div className={`feldsuche${istGesetzt(e) ? ' gesetzt' : ''}`} data-feld={feld.key}>
      <div className="feldsuchkopf">
        {/* Sichtbarer Name; die Eingaben darunter tragen ihn als Beschriftung für Screenreader (Feldrahmen, #1212). */}
        <span className="feldsuchname" aria-hidden="true">{feld.label}</span>
        {leerArten.length > 0 && (
          <Feld beschriftung={t('ablage.suche.leer', { label: feld.label })} beschriftungVerbergen className="feldsuchleer">
            <select value={e.leer ?? ''} onChange={(x) => setze(x.target.value ? { leer: x.target.value as 'leer' | 'nichtLeer' } : {})}>
              <option value="">{t('ablage.suche.wert')}</option>
              {leerArten.map((o) => <option key={o} value={o}>{o === 'leer' ? t('ablage.suche.ist-leer') : t('ablage.suche.ist-nicht-leer')}</option>)}
            </select>
          </Feld>
        )}
        <Knopf art="link" className="chipweg" nurSymbol={t('suche.bedingung.entfernen', { feld: feld.label })} onClick={weg}><Symbol name="schliessen" /></Knopf>
      </div>
      {!e.leer && eingabe}
    </div>
  );
}

/**
 * Zusammenfassung über der Trefferliste (#199, #426): je Bedingung ein Chip. Ein Klick auf den Text öffnet das
 * Formular an dieser Stelle, das Kreuz entfernt die Bedingung und sucht sofort neu.
 */
export function Suchchips({ suche, offen, aendern }: { suche: URLSearchParams; offen?: string; aendern?: (key: string) => void }) {
  const d = useDaten();
  const f = liesSuche(suche);
  const [, neu] = useState(0);
  // Titel verwiesener Mappen nachladen.
  const fehlend = Object.values(f.felder).flatMap((e) => e.werte ?? []).filter((x) => /^[0-9a-f-]{36}$/i.test(x) && !titelCache[x]).join(',');
  useEffect(() => {
    let aktuell = true;
    for (const x of fehlend ? fehlend.split(',') : []) {
      api.mappe(x).then((r) => { titelCache[x] = { titel: r.mappe.titel ?? '', typId: r.mappe.typId }; }).catch(() => { titelCache[x] = { titel: t('ablage.suche.nicht-sichtbare-mappe'), typId: '' }; })
        .finally(() => aktuell && neu((n) => n + 1));
    }
    return () => { aktuell = false; };
  }, [fehlend]);
  const chips = chipsVon(f, d.typen, (id) => titelOder(titelCache[id]?.titel ?? '…'), d.person);
  if (!chips.length) return <p className="leise klein">{t('suche.zusammenfassung.leer')}</p>;
  return (
    <ul className="suchchips" aria-label={t('suche.zusammenfassung')}>
      {chips.map((c) => (
        <li key={c.key} className="chip suchchip">
          {aendern
            ? <Knopf art="link" className="chiptext" title={t('suche.zusammenfassung.aendern', { text: c.text })} onClick={() => aendern(c.key)}>{c.text}</Knopf>
            : c.text}
          <Knopf art="link" className="chipweg" nurSymbol={t('suche.chip.entfernen', { text: c.text })}
            onClick={() => geheZu(`${SUCHE_PFAD}${offen ? `/${offen}` : ''}?${alsParameter(ohneChip(f, c.key)).toString()}`)}><Symbol name="schliessen" /></Knopf>
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
