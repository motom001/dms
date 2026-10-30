import { useEffect, useRef, useState } from 'react';
import { auswahlText, darfErstellen, POST_STAND, type Mappe, type Mappentyp, type Werte } from '../../../shared/src/model';
import { api, type MappeDetails } from '../api';
import { useDaten } from '../daten';
import { geheZu, Link } from '../ort';
import { titelOder } from '../seiten';
import { Hilfe } from '../Hilfe';

/**
 * Post (#192): „+ Post“ in den Sichten mit Post, die Leiste an einer Post-Mappe (Stand, Zuordnen,
 * Erledigt) und das Zuordnen zu einer vorhandenen oder neuen Mappe.
 */

const ohneEndung = (n: string) => n.replace(/\.[^.]{1,8}$/, '').trim() || n;
const dokumentenRegister = (t: Mappentyp | undefined) => (t?.register ?? []).filter((r) => r.art === 'dokumente');

/** „+ Post“: Dateien wählen → eine Post-Mappe mit allen Dateien, danach geöffnet. */
export function PostKnopf({ sicht, typ }: { sicht: string; typ: Mappentyp }) {
  const d = useDaten();
  const eingabe = useRef<HTMLInputElement>(null);
  const [laeuft, setLaeuft] = useState<string>();
  const [fehler, setFehler] = useState<string[]>([]);
  const register = dokumentenRegister(typ)[0]?.key;

  async function anlegen(dateien: File[]) {
    setFehler([]);
    setLaeuft('Lege Post an …');
    try {
      const betreff = dateien.length ? ohneEndung(dateien[0].name).slice(0, 250) : undefined;
      const m = await api.postAnlegen({ betreff });
      const schief: string[] = [];
      for (const [i, f] of dateien.entries()) {
        setLaeuft(`Lade hoch: ${f.name} (${i + 1} von ${dateien.length}) …`);
        if (!register) break;
        try { await api.ladeHoch(m.id, register, f); } catch (e) { schief.push(`„${f.name}“: ${(e as Error).message}`); }
      }
      setFehler(schief);
      await d.neuLaden();
      geheZu(`/ablage/${sicht}/${m.id}`);
    } catch (e) { setFehler([(e as Error).message]); } finally { setLaeuft(undefined); }
  }

  return (
    <>
      <button type="button" className="knopf gruen klein" disabled={!!laeuft} onClick={() => eingabe.current?.click()} title="Dateien auswählen – sie kommen zusammen in eine neue Post">
        + Post
      </button>
      {/* Am Handy bietet die Auswahl auch die Kamera an. */}
      <input ref={eingabe} type="file" multiple hidden onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ''; if (f.length) void anlegen(f); }} />
      {laeuft && <p className="leise klein" role="status">{laeuft}</p>}
      {fehler.length > 0 && <div className="hinweis schlecht" role="alert">{fehler.map((x) => <p key={x}>{x}</p>)}</div>}
    </>
  );
}

/** An einer Post-Mappe: Stand, „Zuordnen …“, „Erledigt“ bzw. „Wieder neu“. */
export function PostLeiste({ typ, details, neuLaden }: { typ: Mappentyp; details: MappeDetails; neuLaden: () => Promise<void> }) {
  const d = useDaten();
  const m = details.mappe;
  const stand = auswahlText(m.werte.stand) || POST_STAND.neu;
  const darf = details.rechte?.U !== false;
  const [offen, setOffen] = useState(false);
  const [fehler, setFehler] = useState<string>();
  const zugeordnet = (Array.isArray(m.werte.bezug) ? m.werte.bezug : []) as string[];

  async function setzeStand(s: string) {
    setFehler(undefined);
    try { await api.mappeAendern(m.id, { werte: { stand: s } }); await neuLaden(); await d.neuLaden(); }
    catch (e) { setFehler((e as Error).message); }
  }

  return (
    <>
      <div className="postleiste">
        <span className={`chip stand-${stand.toLowerCase()}`}>{stand}</span>
        {zugeordnet.length > 0 && (
          <span className="klein">zugeordnet zu {zugeordnet.map((id, i) => {
            const b = details.bezuege[id];
            return <span key={id}>{i > 0 && ', '}{b && !b.verborgen ? <Link to={`/ablage/${b.typId}/${id}`} className="verweis">{titelOder(b.titel)}</Link> : titelOder(b?.titel)}</span>;
          })}</span>
        )}
        <span className="luecke" aria-hidden="true" />
        {darf && <button type="button" className={`knopf klein ${offen ? 'an' : 'primaer'}`} aria-expanded={offen} onClick={() => setOffen(!offen)}>Zuordnen …</button>}
        {darf && stand !== POST_STAND.erledigt && <button type="button" className="knopf klein" onClick={() => void setzeStand(POST_STAND.erledigt)} title="Nichts mehr zu tun, z. B. Werbung oder schon erledigt">Erledigt</button>}
        {darf && stand !== POST_STAND.neu && <button type="button" className="textknopf klein" onClick={() => void setzeStand(POST_STAND.neu)}>Wieder neu</button>}
        <Hilfe ort="post.zuordnen" />
      </div>
      {fehler && <div className="hinweis schlecht" role="alert"><p>{fehler}</p></div>}
      {offen && <ZuordnenMaske typ={typ} details={details} neuLaden={neuLaden} schliessen={() => setOffen(false)} />}
    </>
  );
}

/** Vorschläge für eine neue Zielmappe aus Betreff und Datum der Post. */
export function vorschlagFuer(ziel: Mappentyp, post: Werte): Record<string, string> {
  const v: Record<string, string> = {};
  const betreff = auswahlText(post.betreff);
  const datum = auswahlText(post.datum);
  // Das erste Textfeld der Titel-Vorlage, sonst das erste Textfeld überhaupt.
  const imTitel = [...(ziel.titelVorlage ?? '').matchAll(/\{(\w+)\}/g)].map((x) => x[1]);
  const text = ziel.felder.find((f) => f.typ === 'text' && imTitel.includes(f.key) && !f.eindeutig) ?? ziel.felder.find((f) => f.typ === 'text' && !f.eindeutig);
  if (text && betreff) v[text.key] = betreff.slice(0, text.maxLen ?? 250);
  const dat = ziel.felder.find((f) => f.typ === 'datum');
  if (dat && datum) v[dat.key] = datum;
  return v;
}

function ZuordnenMaske({ typ, details, neuLaden, schliessen }: { typ: Mappentyp; details: MappeDetails; neuLaden: () => Promise<void>; schliessen(): void }) {
  const d = useDaten();
  const post = details.mappe;
  const ziele = d.typen.filter((t) => t.system !== 'post');
  const [art, setArt] = useState<'vorhanden' | 'neu'>('vorhanden');
  const [typId, setTypId] = useState(() => ziele.find((t) => dokumentenRegister(t).length)?.id ?? ziele[0]?.id ?? '');
  const zielTyp = d.typ(typId);
  const regs = dokumentenRegister(zielTyp);
  const [register, setRegister] = useState('');
  useEffect(() => { setRegister(regs[0]?.key ?? ''); }, [typId]); // eslint-disable-line react-hooks/exhaustive-deps
  const [gewaehlt, setGewaehlt] = useState<Set<string>>(() => new Set(details.dokumente.map((x) => x.id)));
  const [kopieren, setKopieren] = useState(false);
  const [ziel, setZiel] = useState<Mappe>();
  const [suche, setSuche] = useState('');
  const [treffer, setTreffer] = useState<Mappe[] | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string>();
  const [fertig, setFertig] = useState<Mappe>();

  useEffect(() => {
    if (art !== 'vorhanden' || !typId) return;
    let aktuell = true;
    const t = setTimeout(() => {
      api.seite(`typ:${typId}`, 0, 20, suche.trim()).then((s) => { if (aktuell) setTreffer(s.mappen); }).catch(() => aktuell && setTreffer([]));
    }, 200);
    return () => { aktuell = false; clearTimeout(t); };
  }, [art, typId, suche]);
  useEffect(() => { setZiel(undefined); }, [typId, art]);

  const umschalten = (id: string) => setGewaehlt((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const mitDokumenten = gewaehlt.size > 0;
  const fehltRegister = mitDokumenten && !regs.length;

  async function zuordnen() {
    if (!ziel) return;
    setFehler(undefined); setLaeuft(true);
    try {
      await api.zuordnen(post.id, { ziel: ziel.id, register: mitDokumenten ? register : undefined, dokumente: [...gewaehlt], kopieren });
      setFertig(ziel);
      await neuLaden(); await d.neuLaden();
    } catch (e) { setFehler((e as Error).message); } finally { setLaeuft(false); }
  }

  function zumFormular() {
    if (!zielTyp) return;
    const q = new URLSearchParams({ zuordnen: post.id, dokumente: [...gewaehlt].join(','), vorschlag: JSON.stringify(vorschlagFuer(zielTyp, post.werte)) });
    if (mitDokumenten && register) q.set('register', register);
    if (kopieren) q.set('kopieren', '1');
    geheZu(`/ablage/${zielTyp.id}/neu?${q.toString()}`);
  }

  if (fertig) {
    return (
      <section className="blatt" aria-label="Zuordnen">
        <div className="blattkopf zeile-zwischen"><h2 className="h3">Zugeordnet</h2><button type="button" className="textknopf" onClick={schliessen}>Schließen</button></div>
        <p className="gutertext" role="status">Die Post gehört jetzt zu „{titelOder(fertig.titel)}“.</p>
        <div className="knoepfe"><Link to={`/ablage/${fertig.typId}/${fertig.id}`} className="knopf">Mappe öffnen</Link><button type="button" className="textknopf" onClick={() => setFertig(undefined)}>Weitere Mappe zuordnen</button></div>
      </section>
    );
  }

  return (
    <section className="blatt" aria-label="Zuordnen">
      <div className="blattkopf zeile-zwischen"><h2 className="h3">Zuordnen</h2><button type="button" className="textknopf" onClick={schliessen}>Schließen</button></div>
      <p className="leise">Zu welcher Mappe gehört diese Post? Die Dokumente kommen in ein Register dieser Mappe, die Post verweist auf sie.</p>
      <div className="raster">
        <label className="eigenschaft"><span>Mappentyp</span>
          <select value={typId} onChange={(e) => setTypId(e.target.value)}>
            {ziele.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <fieldset className="eigenschaft wahl">
          <legend>Mappe</legend>
          <label className="haken"><input type="radio" name="zuordnen-art" checked={art === 'vorhanden'} onChange={() => setArt('vorhanden')} /><span>vorhandene wählen</span></label>
          <label className="haken"><input type="radio" name="zuordnen-art" checked={art === 'neu'} onChange={() => setArt('neu')} disabled={!darfErstellen(zielTyp)} /><span>neue anlegen</span></label>
        </fieldset>
      </div>

      {art === 'vorhanden' && (
        <div className="zuordnen-suche">
          <label className="suche"><span className="sr">Mappe suchen</span>
            <input type="search" placeholder={`${zielTyp?.name ?? 'Mappe'} suchen …`} value={suche} onChange={(e) => setSuche(e.target.value)} autoFocus />
          </label>
          {treffer === null ? <p className="leise klein">Lade …</p>
            : !treffer.length ? <p className="leise klein">Keine Mappe gefunden.</p>
            : <ul className="zuordnen-treffer">{treffer.map((x) => (
                <li key={x.id}><button type="button" className={ziel?.id === x.id ? 'an' : ''} aria-pressed={ziel?.id === x.id} onClick={() => setZiel(x)}>{titelOder(x.titel)}</button></li>
              ))}</ul>}
        </div>
      )}

      {details.dokumente.length > 0 && (
        <fieldset className="eigenschaft">
          <legend>Dokumente</legend>
          {details.dokumente.map((x) => (
            <label key={x.id} className="haken"><input type="checkbox" checked={gewaehlt.has(x.id)} onChange={() => umschalten(x.id)} /><span>{x.name}</span></label>
          ))}
          {mitDokumenten && regs.length > 1 && (
            <label className="eigenschaft"><span>in das Register</span>
              <select value={register} onChange={(e) => setRegister(e.target.value)}>{regs.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}</select>
            </label>
          )}
          {mitDokumenten && regs.length === 1 && <p className="leise klein">kommen ins Register „{regs[0].name}“</p>}
          {mitDokumenten && <label className="haken klein"><input type="checkbox" checked={kopieren} onChange={(e) => setKopieren(e.target.checked)} /><span>Kopie in der Post behalten (gleiche Datei, kein zusätzlicher Platz)</span></label>}
        </fieldset>
      )}
      {fehltRegister && <div className="hinweis warn"><p>„{zielTyp?.name}“ hat kein Dokumentenregister. Wähle die Dokumente ab oder einen anderen Mappentyp.</p></div>}
      {fehler && <div className="hinweis schlecht" role="alert"><p>{fehler}</p></div>}
      <div className="knoepfe">
        {art === 'vorhanden'
          ? <button type="button" className="knopf primaer" disabled={!ziel || laeuft || fehltRegister} onClick={() => void zuordnen()}>{laeuft ? 'Ordne zu …' : ziel ? `Zu „${titelOder(ziel.titel)}“ zuordnen` : 'Mappe wählen'}</button>
          : <button type="button" className="knopf primaer" disabled={fehltRegister || !darfErstellen(zielTyp)} onClick={zumFormular}>Weiter: neue Mappe ausfüllen</button>}
      </div>
    </section>
  );
}
