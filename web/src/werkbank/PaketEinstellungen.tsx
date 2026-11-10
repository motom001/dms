import { useEffect, useState } from 'react';
import { abschnittsfelder, EINTRAG_ID, listen, MEHRFACH_VERWEISE, zahlFehler, type EinstellungBlock, type EinstellungFeld, type FeldVerweis, type GeheimStand } from '../../../shared/src/paketeinstellungen';
import { Mehrfachauswahl } from '../ablage/Mehrfachauswahl';
import { Feld, FeldGruppe, type FeldVerknuepfung, HakenFeld, Knopf, type KnopfErgebnis } from '../bausteine';
import { api, ApiFehler, type PaketEinstellungenStand } from '../api';
import { rueckfrage } from '../rueckfrage';
import { Speicherleiste, useEntwurf } from '../Speicherleiste';
import { t, tn } from '../sprache';
import { gebietsschema } from '../../../shared/src/sprache';

/**
 * Werkbank → Pakete → Paket → Einstellungen (#197): Formular aus der Beschreibung im Manifest.
 * Höchstens zwei Ebenen (Abschnitte, Listen). Geheimnisse sieht man nach dem Speichern nie wieder.
 */

type Werte = Record<string, unknown>;
const zeit = (iso: string | null) => (iso ? new Date(iso).toLocaleString(gebietsschema(), { dateStyle: 'medium', timeStyle: 'short' }) : '–');
let zaehler = 0;
const neueId = () => `n${Date.now().toString(36)}${(zaehler++).toString(36)}`;

/** Gespeicherte Werte → Formular: Geheimnisse als „behalten“, wenn gesetzt. */
function zumFormular(s: PaketEinstellungenStand): Werte {
  const g = (f: EinstellungFeld, v: unknown) => (f.typ === 'geheim' ? ((v as GeheimStand)?.gesetzt ? { behalten: true } : null) : v);
  const w: Werte = {};
  for (const f of abschnittsfelder(s.beschreibung)) w[f.schluessel] = g(f, s.werte[f.schluessel]);
  for (const l of listen(s.beschreibung)) {
    w[l.schluessel] = ((s.werte[l.schluessel] as Werte[]) ?? []).map((e) => Object.fromEntries([[EINTRAG_ID, e[EINTRAG_ID]], ...l.felder.map((f) => [f.schluessel, g(f, e[f.schluessel])])]));
  }
  return w;
}

export function PaketEinstellungen({ id, gespeichert }: { id: string; gespeichert?: () => void }) {
  const [stand, setStand] = useState<PaketEinstellungenStand | null>(null);
  const [werte, setWerte] = useState<Werte>({});
  const [fehler, setFehler] = useState<Record<string, string>>({});
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht' | 'info'; text: string }>();
  const [laeuft, setLaeuft] = useState(false);
  // Neu aufbauen beim Verwerfen: Geheimnis-Felder merken sich „neu eingeben“ selbst.
  const [runde, setRunde] = useState(0);
  const gespeichertWerte = stand ? zumFormular(stand) : null;
  const ent = useEntwurf(gespeichertWerte, werte, { aus: !stand, zuruecksetzen: () => { if (stand) setWerte(zumFormular(stand)); setFehler({}); setMeldung(undefined); setRunde((r) => r + 1); } });
  useEffect(() => {
    let aktuell = true;
    api.paketEinstellungen(id).then((s) => { if (aktuell) { setStand(s); setWerte(zumFormular(s)); } }, (e) => aktuell && setMeldung({ art: 'schlecht', text: (e as Error).message }));
    return () => { aktuell = false; };
  }, [id]);
  if (!stand) return meldung ? <div className="hinweis schlecht"><p>{meldung.text}</p></div> : <p className="leise">{t('werkbank.paketeinstellungen.lade')}</p>;

  async function speichern(adresseBestaetigt = false) {
    setLaeuft(true); setMeldung(undefined); setFehler({});
    try {
      const s = await api.paketEinstellungenSpeichern(id, werte, adresseBestaetigt);
      setStand(s); setWerte(zumFormular(s));
      setMeldung({ art: 'gut', text: t('werkbank.paketeinstellungen.gespeichert') });
      gespeichert?.();
    } catch (e) {
      // Dienst-Adresse (#444): erst bestätigen – dorthin schickt das Paket Daten.
      const adresse = e instanceof ApiFehler && e.status === 409 ? (e.details as { adresse?: Array<{ feld: string; wert: string }> } | undefined)?.adresse : undefined;
      if (adresse?.length && !adresseBestaetigt) {
        setLaeuft(false);
        if (await rueckfrage({ titel: t('fragen.adresse.titel'), text: t('fragen.adresse.text', { adresse: adresse.map((a) => a.wert).join(', ') }), ja: t('fragen.adresse.ja') })) await speichern(true);
        return;
      }
      const ff = e instanceof ApiFehler ? (e.details as { felderFehler?: Record<string, string> } | undefined)?.felderFehler : undefined;
      if (ff) setFehler(ff);
      setMeldung({ art: 'schlecht', text: (e as Error).message });
    } finally { setLaeuft(false); }
  }
  // Aktionen des Pakets, z. B. „Verbindung testen“ (#986): Ergebnis und Fehler stehen unter den Knöpfen, nicht oben.
  async function aktion(a: { schluessel: string; name: string; bestaetigen?: boolean }): Promise<KnopfErgebnis | undefined> {
    if (a.bestaetigen && !(await rueckfrage({ titel: t('werkbank.paketeinstellungen.jetzt-ausfuehren', { name: a.name }), ja: t('werkbank.paketeinstellungen.ausfuehren') }))) return;
    const r = await api.paketAktion(id, a.schluessel);
    return { art: r.ok ? 'gut' : 'schlecht', text: r.text };
  }
  const b = stand.beschreibung;
  return (
    <div className="stapel paketeinstellungen" onKeyDown={ent.tasten}>
      {stand.fehlend.length > 0 && <div className="hinweis warn" role="status"><p>{tn('werkbank.paketeinstellungen.es-fehlen-erst-danach', { b: <strong>{t('werkbank.paketeinstellungen.einstellungen-noetig')}</strong>, fehlend: stand.fehlend.join(', ') })}</p></div>}
      {meldung && <div className={`hinweis ${meldung.art}`} role="status"><p>{meldung.text}</p></div>}
      {b.bloecke.map((blk, i) => <Block key={`${runde}-${i}`} blk={blk} werte={werte} setze={setWerte} fehler={fehler} auswahl={stand.auswahl} />)}
      <Speicherleiste ent={ent} gegenstand={t('werkbank.paketeinstellungen.einstellungen')} sendet={laeuft} speicherbar={stand.fehlend.length > 0} speichern={() => void speichern()} />
      {b.aktionen.length > 0 && (
        <section className="blatt">
          <h2 className="h3">{t('werkbank.paketeinstellungen.aktionen')}</h2>
          {!stand.laeufer && <p className="leise klein">{t('werkbank.paketeinstellungen.pakete-mit-code-laufen')}</p>}
          <div className="knoepfe">
            {b.aktionen.map((a) => <Knopf key={a.schluessel} gesperrt={laeuft} title={a.hilfe} onClick={() => aktion(a)}>{a.name}</Knopf>)}
          </div>
        </section>
      )}
      <section className="blatt" aria-label={t('werkbank.paketeinstellungen.status')}>
        <h2 className="h3">{t('werkbank.paketeinstellungen.status')}</h2>
        <p className="leise klein">{t('werkbank.paketeinstellungen.schreibt-nur-das-paket')}</p>
        <dl className="eigenschaften"><dt>{t('werkbank.paketeinstellungen.letzter-lauf')}</dt><dd>{zeit(stand.status?.letzterLauf ?? null)}</dd></dl>
        {stand.status?.meldungen.length ? <ul className="klein">{stand.status.meldungen.map((m, i) => <li key={i}>{m}</li>)}</ul> : <p className="leise klein">{t('werkbank.paketeinstellungen.noch-keine-meldungen')}</p>}
      </section>
    </div>
  );
}

export type Auswahl = PaketEinstellungenStand['auswahl'];

/** Mögliche Einträge eines Verweises (Mappentyp, Benutzer, Rolle, Ansicht). */
const optionenVon = (f: EinstellungFeld, a: Auswahl): Array<{ id: string; name: string }> =>
  f.typ === 'mappentyp' ? a.typen : f.typ === 'benutzer' ? a.benutzer : f.typ === 'rolle' ? a.rollen : f.typ === 'sicht' ? a.sichten : [];

/**
 * Verweise als Mehrfachauswahl (#658) – dieselbe Bedienung wie bei Verweisfeldern (#602): suchen, die Auswahl steht
 * unter dem Feld, je mit „Entfernen“. `ausgeschlossen`: im anderen Feld gewählt (schliesst_aus), hier nicht angeboten.
 */
function VerweisWahl({ id, name, optionen, gewaehlt, setze, ausgeschlossen = [] }: { id: string; name: string; optionen: Array<{ id: string; name: string }>; gewaehlt: string[]; setze: (l: string[]) => void; ausgeschlossen?: string[] }) {
  const [eingabe, setEingabe] = useState('');
  const [offen, setOffen] = useState(false);
  const such = eingabe.trim().toLowerCase();
  const frei = optionen.filter((o) => !gewaehlt.includes(o.id) && !ausgeschlossen.includes(o.id) && (!such || o.name.toLowerCase().includes(such)));
  const nameVon = (x: string) => optionen.find((o) => o.id === x)?.name ?? t('pakete.einstellungen.verweis-weg');
  return (
    <Mehrfachauswahl id={id} name={name} platzhalter={t('pakete.einstellungen.suchen')} eingabe={eingabe} setEingabe={setEingabe} offen={offen} setOffen={setOffen}
      vorschlaege={frei.slice(0, 50).map((o) => ({ id: o.id, text: o.name }))} leerText={t('pakete.einstellungen.nichts-frei')}
      waehle={(x) => { setze([...gewaehlt, x]); setEingabe(''); }} entferne={(x) => setze(gewaehlt.filter((y) => y !== x))}
      gewaehlt={gewaehlt.map((x) => ({ id: x, inhalt: nameVon(x), entfernenText: t('pakete.einstellungen.entfernen', { name: nameVon(x) }) }))} />
  );
}
/** Übergang (#658): Eine Liste mit genau einem Verweisfeld zeigt das DMS wie eine Mehrfachauswahl; gespeichert bleibt die Liste. */
const alsMehrfach = (blk: EinstellungBlock) => blk.art === 'liste' && blk.felder.length === 1 && MEHRFACH_VERWEISE.includes(blk.felder[0].typ);

function Block({ blk, werte, setze, fehler, auswahl }: { blk: EinstellungBlock; werte: Werte; setze: (f: (w: Werte) => Werte) => void; fehler: Record<string, string>; auswahl: Auswahl }) {
  if (blk.art === 'abschnitt') return (
    <section className="blatt">
      {blk.titel && <h2 className="h3">{blk.titel}</h2>}
      {blk.hilfe && <p className="leise klein">{blk.hilfe}</p>}
      {blk.felder.map((f) => <Eingabe key={f.schluessel} f={f} wert={werte[f.schluessel]} fehler={fehler[f.schluessel]} auswahl={auswahl} id={`pe-${f.schluessel}`}
        ausgeschlossen={[...blk.felder.filter((g) => g.schliesstAus === f.schluessel).map((g) => g.schluessel), ...(f.schliesstAus ? [f.schliesstAus] : [])].flatMap((k) => { const v = werte[k]; return Array.isArray(v) ? v.map(String) : v ? [String(v)] : []; })}
        setze={(v) => setze((w) => ({ ...w, [f.schluessel]: v }))} />)}
    </section>
  );
  if (alsMehrfach(blk)) {
    const f = blk.felder[0];
    const eintraege = (werte[blk.schluessel] as Werte[] | undefined) ?? [];
    const ids = eintraege.map((e) => String(e[f.schluessel] ?? '')).filter(Boolean);
    const fehlerHier = Object.entries(fehler).filter(([k]) => k.startsWith(`${blk.schluessel}.`)).map(([, v]) => v)[0];
    return (
      <section className="blatt">
        <div className={`eigenschaft${fehlerHier ? ' fehlerhaft' : ''}`}>
          <label htmlFor={`pe-${blk.schluessel}`} className="h3">{blk.name}</label>
          <VerweisWahl id={`pe-${blk.schluessel}`} name={blk.name} optionen={optionenVon(f, auswahl)} gewaehlt={ids}
            setze={(l) => setze((w) => ({ ...w, [blk.schluessel]: l.map((x) => eintraege.find((e) => String(e[f.schluessel]) === x) ?? { [EINTRAG_ID]: neueId(), [f.schluessel]: x }) }))} />
          {blk.hilfe && <small className="leise">{blk.hilfe}</small>}
          {fehlerHier && <small className="fehlertext">{fehlerHier}</small>}
        </div>
      </section>
    );
  }
  const eintraege = (werte[blk.schluessel] as Werte[] | undefined) ?? [];
  const setzeListe = (n: Werte[]) => setze((w) => ({ ...w, [blk.schluessel]: n }));
  const schiebe = (i: number, d: number) => { const n = [...eintraege]; [n[i], n[i + d]] = [n[i + d], n[i]]; setzeListe(n); };
  return (
    <section className="blatt">
      <h2 className="h3">{blk.name}</h2>
      {blk.hilfe && <p className="leise klein">{blk.hilfe}</p>}
      {!eintraege.length && <p className="leise klein">{t('werkbank.paketeinstellungen.noch-keine-eintraege')}</p>}
      <ol className="stapel paketliste">
        {eintraege.map((e, i) => (
          <li key={String(e[EINTRAG_ID])} className="paketeintrag">
            <div className="zeile-zwischen">
              <strong className="klein">{blk.eintrag} {i + 1}</strong>
              <span className="knoepfe">
                {blk.sortierbar && <><button type="button" className="textknopf klein" disabled={i === 0} aria-label={t('werkbank.paketeinstellungen.nach-oben', { eintrag: blk.eintrag, wert: i + 1 })} onClick={() => schiebe(i, -1)}>↑</button>
                  <button type="button" className="textknopf klein" disabled={i === eintraege.length - 1} aria-label={t('werkbank.paketeinstellungen.nach-unten', { eintrag: blk.eintrag, wert: i + 1 })} onClick={() => schiebe(i, 1)}>↓</button></>}
                <button type="button" className="textknopf klein gefahr" onClick={() => setzeListe(eintraege.filter((_, j) => j !== i))}>{t('werkbank.paketeinstellungen.loeschen')}</button>
              </span>
            </div>
            {blk.felder.map((f) => <Eingabe key={f.schluessel} f={f} wert={e[f.schluessel]} fehler={fehler[`${blk.schluessel}.${i + 1}.${f.schluessel}`]} auswahl={auswahl}
              id={`pe-${blk.schluessel}-${i}-${f.schluessel}`} setze={(v) => setzeListe(eintraege.map((x, j) => (j === i ? { ...x, [f.schluessel]: v } : x)))} />)}
          </li>
        ))}
      </ol>
      <button type="button" className="knopf klein" onClick={() => setzeListe([...eintraege, Object.fromEntries([[EINTRAG_ID, neueId()], ...blk.felder.filter((f) => f.standard !== undefined).map((f) => [f.schluessel, f.standard])])])}>+ {blk.eintrag}</button>
    </section>
  );
}

/** Ein Feld mit den Bausteinen der Oberfläche; Verweise als Auswahllisten (gespeichert wird die Id). Rahmen: `Feld` (#967). */
export function Eingabe({ f, wert, setze, fehler, auswahl, id, ausgeschlossen }: { f: EinstellungFeld; wert: unknown; setze: (v: unknown) => void; fehler?: string; auswahl: Auswahl; id: string; ausgeschlossen?: string[] }) {
  const [geheimNeu, setGeheimNeu] = useState(false);
  const [warGesetzt] = useState(!!wert && typeof wert === 'object');
  // Muster A6: Pflicht ist der Normalfall und bleibt unmarkiert; ohne `pflicht` im Manifest steht „(optional)“ hinter
  // der Beschriftung (nicht beim Haken – der ist immer an oder aus). Der Rahmen setzt Hinweis, Fehler und aria.
  const name = f.name;
  const optional = !f.pflicht;
  const hinweis = [f.typ === 'adresse' ? t('fragen.adresse.feld') : null, f.hilfe];
  // Zahl (#657): die Prüfung am Feld zeigt der Rahmen wie jeden anderen Fehler.
  const zahl = f.typ === 'zahl' && wert != null ? String(wert).replace('.', ',').trim() : '';
  const meldung = fehler ?? (zahl ? zahlFehler(f, zahl) : null);
  if (f.typ === 'janein') return (
    <HakenFeld beschriftung={name} hinweis={f.hilfe} fehler={meldung}>
      <input id={id} type="checkbox" checked={wert === true} onChange={(e) => setze(e.target.checked)} />
    </HakenFeld>
  );
  if (f.typ === 'mehrfachauswahl') {
    const l = Array.isArray(wert) ? wert.map(String) : [];
    return (
      <FeldGruppe beschriftung={name} optional={optional} hinweis={f.hilfe} fehler={meldung}>
        {(f.optionen ?? []).map((o) => <label key={o} className="haken klein"><input type="checkbox" checked={l.includes(o)} onChange={(e) => setze(e.target.checked ? [...l, o] : l.filter((x) => x !== o))} /><span>{o}</span></label>)}
      </FeldGruppe>
    );
  }
  if (f.typ === 'geheim' && !!wert && typeof wert === 'object' && !geheimNeu) return (
    <FeldGruppe beschriftung={name} optional={optional} hinweis={f.hilfe} fehler={meldung}>
      <span className="chip gut">{t('werkbank.paketeinstellungen.gesetzt')}</span>
      <button type="button" className="textknopf klein" onClick={() => setGeheimNeu(true)}>{t('werkbank.paketeinstellungen.aendern')}</button>
      <button type="button" className="textknopf klein gefahr" onClick={() => setze(null)}>{t('werkbank.paketeinstellungen.loeschen')}</button>
    </FeldGruppe>
  );
  return (
    <Feld beschriftung={name} optional={optional} hinweis={hinweis} fehler={meldung} id={id}>
      {(v) => <Steuerelement f={f} wert={wert} setze={setze} auswahl={auswahl} v={v} ausgeschlossen={ausgeschlossen} geheim={{ neu: geheimNeu, warGesetzt }} />}
    </Feld>
  );
}

const VERWEISE: EinstellungFeld['typ'][] = ['mappentyp', 'benutzer', 'rolle', 'sicht'];

/** Das Eingabeelement eines Felds; `v` (id, aria) kommt vom Rahmen. */
function Steuerelement({ f, wert, setze, auswahl, v, ausgeschlossen, geheim }: { f: EinstellungFeld; wert: unknown; setze: (v: unknown) => void; auswahl: Auswahl; v: FeldVerknuepfung; ausgeschlossen?: string[]; geheim: { neu: boolean; warGesetzt: boolean } }) {
  const liste = (optionen: Array<{ id: string; name: string }>) => (
    <select {...v} value={String(wert ?? '')} onChange={(e) => setze(e.target.value || null)}>
      <option value="">{t('werkbank.paketeinstellungen.keine-auswahl')}</option>
      {optionen.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
    </select>
  );
  if (VERWEISE.includes(f.typ) && !f.mehrfach) return liste(optionenVon(f, auswahl));
  if (f.mehrfach) return <VerweisWahl id={v.id} name={f.name} optionen={optionenVon(f, auswahl)} gewaehlt={Array.isArray(wert) ? wert.map(String) : wert ? [String(wert)] : []} setze={setze} ausgeschlossen={ausgeschlossen} />;
  switch (f.typ) {
    // Dienst-Adresse (#444): nie voreingestellt, nur ein Beispiel im leeren Feld; beim Speichern bestätigen.
    case 'adresse': return <input {...v} type="url" inputMode="url" autoComplete="off" spellCheck={false} placeholder={f.beispiel} value={String(wert ?? '')} onChange={(e) => setze(e.target.value || null)} />;
    case 'mehrzeilig': return <textarea {...v} rows={4} value={String(wert ?? '')} onChange={(e) => setze(e.target.value)} />;
    case 'zahl': return <ZahlEingabe f={f} wert={wert} setze={setze} v={v} />;
    case 'datum': return <input {...v} type="date" value={String(wert ?? '')} onChange={(e) => setze(e.target.value || null)} />;
    case 'auswahl': return liste((f.optionen ?? []).map((o) => ({ id: o, name: o })));
    case 'geheim': return <GeheimEingabe wert={wert} setze={setze} v={v} geheim={geheim} />;
    case 'feld': return <FeldWahl wert={wert as FeldVerweis | null} setze={setze} auswahl={auswahl} v={v} />;
    case 'text': return <input {...v} type="text" value={String(wert ?? '')} onChange={(e) => setze(e.target.value)} />;
    default: return null;
  }
}

/** Geheimnis neu eingeben: leer = nicht gesetzt, oder (beim Ändern) das gespeicherte behalten. */
function GeheimEingabe({ wert, setze, v, geheim }: { wert: unknown; setze: (v: unknown) => void; v: FeldVerknuepfung; geheim: { neu: boolean; warGesetzt: boolean } }) {
  return (
    <input {...v} type="password" autoComplete="new-password" placeholder={wert === null && !geheim.neu ? t('werkbank.paketeinstellungen.nicht-gesetzt') : t('werkbank.paketeinstellungen.neuer-wert')}
      value={typeof wert === 'string' ? wert : ''} onChange={(e) => setze(e.target.value || (geheim.warGesetzt && geheim.neu ? { behalten: true } : null))} />
  );
}

/** Feld eines Mappentyps (Typ „feld“): gespeichert als { typ, feld }. */
function FeldWahl({ wert, setze, auswahl, v }: { wert: FeldVerweis | null; setze: (v: unknown) => void; auswahl: Auswahl; v: FeldVerknuepfung }) {
  const optionen = auswahl.typen.flatMap((eintrag) => eintrag.felder.map((g) => ({ id: `${eintrag.id}|${g.key}`, name: `${eintrag.name} › ${g.label}` })));
  return (
    <select {...v} value={wert ? `${wert.typ}|${wert.feld}` : ''} onChange={(e) => { const [typ, feld] = e.target.value.split('|'); setze(e.target.value ? { typ, feld } : null); }}>
      <option value="">{t('werkbank.paketeinstellungen.keine-auswahl')}</option>{optionen.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
    </select>
  );
}

/**
 * Zahl (#657): nur Ziffern und ein Komma; min/max/schritt prüft Eingabe und zeigt die Meldung im Rahmen. Mit
 * `vorschlaege` eine Auswahl mit Beschriftung; „Eigener Wert …“ öffnet das Zahlenfeld (innerhalb von min/max).
 * `v` (id, aria) bekommt das gerade sichtbare Bedienelement, das die Beschriftung meint.
 */
function ZahlEingabe({ f, wert, setze, v }: { f: EinstellungFeld; wert: unknown; setze: (v: unknown) => void; v: FeldVerknuepfung }) {
  const text = wert == null ? '' : String(wert).replace('.', ',');
  const passend = f.vorschlaege?.find((x) => String(x.wert) === String(wert));
  const [eigen, setEigen] = useState(!!f.vorschlaege && wert != null && wert !== '' && !passend);
  const ganz = f.schritt !== undefined && Number.isInteger(f.schritt) && Number.isInteger(f.min ?? 0);
  const feld = (
    <input {...(eigen || !f.vorschlaege ? v : {})} type="text" inputMode={ganz ? 'numeric' : 'decimal'} autoComplete="off" value={text}
      placeholder={f.min !== undefined && f.max !== undefined ? `${f.min}–${f.max}` : undefined}
      onChange={(e) => setze(e.target.value.replace(/[^0-9,.-]/g, '').replace('.', ',') || null)} />
  );
  return (
    <>
      {f.vorschlaege ? (
        <select {...(eigen ? {} : v)} value={eigen ? '__eigen' : passend ? String(passend.wert) : ''} onChange={(e) => {
          if (e.target.value === '__eigen') { setEigen(true); return; }
          setEigen(false); setze(e.target.value === '' ? null : Number(e.target.value));
        }}>
          {!f.pflicht && <option value="">{t('pakete.einstellung.zahl.keine')}</option>}
          {f.vorschlaege.map((x) => <option key={x.wert} value={String(x.wert)}>{String(x.wert).replace('.', ',')} – {x.name}</option>)}
          <option value="__eigen">{t('pakete.einstellung.zahl.eigen')}</option>
        </select>
      ) : feld}
      {f.vorschlaege && eigen && feld}
    </>
  );
}
