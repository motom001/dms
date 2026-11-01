import { Vorschaubild } from './Vorschaubild';
import { useEffect, useRef, useState } from 'react';
import { auswahlText, darfErstellen, formatiere, POST_STAND, vorlageFelder, type Feld, type Mappe, type Mappentyp, type Wert, type Werte } from '../../../shared/src/model';
import { Fundstellen } from './Doppelt';
import { api, type Fundstelle, type MappeDetails, type PostErkennung } from '../api';
import { artVon } from '../../../shared/src/erkennung';
import { useDaten } from '../daten';
import { geheZu, Link } from '../ort';
import { titelOder } from '../seiten';
import { Hilfe } from '../Hilfe';
import { neuePost } from './NeuePost';
import { istTouch, postFotografieren } from './PostKamera';
import { Symbol } from '../Symbol';
import { istVersendet } from '../../../shared/src/model';
import { rueckfrage } from '../rueckfrage';

/**
 * Post (#192): „+ Post“ in den Sichten mit Post, die Leiste an einer Post-Mappe (Stand, Zuordnen,
 * Erledigt) und das Zuordnen zu einer vorhandenen oder neuen Mappe.
 */

const ohneEndung = (n: string) => n.replace(/\.[^.]{1,8}$/, '').trim() || n;
const dokumentenRegister = (t: Mappentyp | undefined) => (t?.register ?? []).filter((r) => r.art === 'dokumente');

/** „+ Post“ in den Sichten mit Post: Dateien wählen → eine Post-Mappe (#193, wie Ablegen und „+ Neu“). */
export function PostKnopf() {
  const eingabe = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" className="knopf gruen klein" onClick={() => eingabe.current?.click()} title="Dateien auswählen – sie kommen zusammen in eine neue Post">
        + Post
      </button>
      {/* Am Handy bietet die Auswahl auch die Kamera an. */}
      <input ref={eingabe} type="file" multiple hidden onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ''; neuePost(f); }} />
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
  const [zusammen, setZusammen] = useState(false);
  const [fehler, setFehler] = useState<string>();
  const versendet = istVersendet(m.werte);
  const pdf = details.dokumente.find((x) => x.mime === 'application/pdf');
  const zugeordnet = (Array.isArray(m.werte.bezug) ? m.werte.bezug : []) as string[];
  // Erkennung (#336): einmal nach dem Volltext gerechnet; neu laden, sobald sich der Stand der Texterkennung ändert.
  const [erkennung, setErkennung] = useState<PostErkennung | null>(null);
  const ocrStand = details.dokumente.map((x) => x.ocr?.stand ?? '').join(',');
  useEffect(() => {
    if (versendet) return;
    let aktuell = true;
    api.erkennung(m.id).then((e) => { if (aktuell) setErkennung(e); }, () => {});
    return () => { aktuell = false; };
  }, [m.id, ocrStand, versendet]);

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
        {/* #490: Rückseite vergessen? Seite mit der Kamera anhängen (Handy) bzw. eine zweite Post anhängen. */}
        {darf && !versendet && <div className="pk-postzeile">
          {istTouch() && <button type="button" className="knopf klein" onClick={() => postFotografieren({ mappeId: m.id, dokumentId: pdf?.id, titel: titelOder(m.titel), fertig: () => { void neuLaden(); void d.neuLaden(); } })}
            title={pdf ? `Foto als weitere Seite an „${pdf.name}“ anhängen` : 'Fotos als PDF an diese Post'}><Symbol name="kamera" /> Seite hinzufügen</button>}
          <button type="button" className={`textknopf klein ${zusammen ? 'an' : ''}`} aria-expanded={zusammen} onClick={() => setZusammen(!zusammen)} title="Die Seiten einer anderen Post hier anhängen – z. B. die Rückseite desselben Briefs">Mit anderer Post zusammenlegen …</button>
        </div>}
      </div>
      {fehler && <div className="hinweis schlecht" role="alert"><p>{fehler}</p></div>}
      {erkennung && !versendet && <Erkannt post={m} e={erkennung} darf={darf} neuLaden={neuLaden} neu={async () => setErkennung(await api.erkennung(m.id, true))} />}
      {offen && <ZuordnenMaske typ={typ} details={details} neuLaden={neuLaden} schliessen={() => setOffen(false)} erkennung={erkennung} />}
      {zusammen && <Zusammenlegen typ={typ} post={m} neuLaden={neuLaden} schliessen={() => setZusammen(false)} />}
    </>
  );
}

/**
 * Zwei Posts zusammenlegen (#490): Die Seiten der gewählten Post kommen ans Ende des PDFs dieser Post,
 * die gewählte Post kommt in den Papierkorb. Zur Wahl stehen die letzten Posts mit Stand „Neu“.
 */
function Zusammenlegen({ typ, post, neuLaden, schliessen }: { typ: Mappentyp; post: Mappe; neuLaden: () => Promise<void>; schliessen(): void }) {
  const d = useDaten();
  const [liste, setListe] = useState<Mappe[] | null>(null);
  const [fehler, setFehler] = useState<string>();
  const [laeuft, setLaeuft] = useState(false);
  useEffect(() => {
    api.seite(typ.id, 0, 40, '', { spalte: '_erstellt', absteigend: true })
      .then((s) => setListe(s.mappen.filter((x) => x.id !== post.id && !x.verborgen && auswahlText(x.werte.stand) === POST_STAND.neu && auswahlText(x.werte.richtung) !== 'Ausgehend')))
      .catch((e) => setFehler((e as Error).message));
  }, [typ.id, post.id]);
  async function legen(q: Mappe) {
    if (!(await rueckfrage({ titel: `„${titelOder(q.titel)}“ hier anhängen?`, text: `Ihre Seiten kommen ans Ende des PDFs von „${titelOder(post.titel)}“. „${titelOder(q.titel)}“ kommt danach in den Papierkorb.`, ja: 'Zusammenlegen' }))) return;
    setLaeuft(true); setFehler(undefined);
    try { await api.postZusammenlegen(post.id, q.id); schliessen(); await neuLaden(); await d.neuLaden(); }
    catch (e) { setFehler((e as Error).message); } finally { setLaeuft(false); }
  }
  const zeit = (iso: string) => new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
  return (
    <section className="blatt pk-zusammen" aria-label="Mit anderer Post zusammenlegen">
      <div className="blattkopf zeile-zwischen"><h2 className="h3">Mit anderer Post zusammenlegen</h2><button type="button" className="textknopf" onClick={schliessen}>Schließen</button></div>
      <p className="leise">Welche Post gehört zu diesem Brief? Ihre Seiten kommen hier ans Ende, sie selbst in den Papierkorb.</p>
      {fehler && <p className="fehlertext" role="alert">{fehler}</p>}
      {liste === null ? !fehler && <p className="leise">Lade …</p> : !liste.length ? <p className="leise">Keine andere neue Post da.</p> : (
        <ul className="pk-postliste">{liste.map((q) => (
          <li key={q.id}><button type="button" className="knopf" disabled={laeuft} onClick={() => void legen(q)}>
            <span className="pk-postname">{titelOder(q.titel)}</span><span className="leise klein">{zeit(q.erstellt)}</span>
          </button></li>
        ))}</ul>
      )}
    </section>
  );
}

/**
 * Vorschläge für eine neue Zielmappe: Betreff und Datum der Post, dazu aus der Erkennung (#336) das Datum des
 * Schreibens, der Gesamtbetrag, passende Nummern (Feld „Rechnungsnummer“ ↔ „Rechnungs-Nr.“) und der Verweis
 * auf den erkannten Absender.
 */
export function vorschlagFuer(ziel: Mappentyp, post: Werte, e?: PostErkennung | null): Record<string, Wert> {
  const v: Record<string, Wert> = {};
  const betreff = auswahlText(post.betreff);
  const datum = e?.angaben.datum?.wert ?? auswahlText(post.datum);
  // Das erste Textfeld der Titel-Vorlage, sonst das erste Textfeld überhaupt.
  const imTitel = vorlageFelder(ziel.titelVorlage ?? '');
  const text = ziel.felder.find((f) => f.typ === 'text' && imTitel.includes(f.key) && !f.eindeutig) ?? ziel.felder.find((f) => f.typ === 'text' && !f.eindeutig);
  if (text && betreff) v[text.key] = betreff.slice(0, text.maxLen ?? 250);
  const dat = ziel.felder.find((f) => f.typ === 'datum');
  if (dat && datum) v[dat.key] = datum;
  if (!e) return v;
  const stamm = (s: string) => s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/[^a-z]/g, '').replace(/(nummer|nr)$/, '');
  const absender = e.absender.find((x) => x.mappeId === e.eindeutig) ?? e.absender.find((x) => x.stark);
  for (const f of ziel.felder) {
    if (v[f.key] !== undefined || f.typ === 'passwort') continue;
    const art = artVon(f);
    if (art === 'betrag' && f.typ === 'betrag' && e.angaben.betrag) v[f.key] = e.angaben.betrag.wert;
    else if (art === 'nummer' && f.typ === 'text') { const n = e.angaben.nummern.find((x) => stamm(x.label) && (stamm(x.label) === stamm(f.label) || stamm(x.label) === stamm(f.key))); if (n) v[f.key] = n.wert; }
    else if (art === 'verweis' && absender && f.zielTyp === absender.typId) v[f.key] = f.mehrfach ? [absender.mappeId] : absender.mappeId;
  }
  return v;
}

/**
 * Was die Erkennung an einer Post gefunden hat (#336): Absender mit Begründung (oder „neue Organisation
 * anlegen“), Datum, Betrag und Nummern. Nur Vorschläge – ein Klick trägt sie ein, alles bleibt änderbar.
 */
function Erkannt({ post, e, darf, neuLaden, neu }: { post: Mappe; e: PostErkennung; darf: boolean; neuLaden: () => Promise<void>; neu: () => Promise<void> }) {
  const d = useDaten();
  const [fehler, setFehler] = useState<string>();
  const [laeuft, setLaeuft] = useState(false);
  const absender = e.absender.find((x) => x.mappeId === e.eindeutig) ?? e.absender[0];
  const weitere = e.absender.filter((x) => x !== absender);
  const leer = !absender && !e.neuerAbsender && !e.angaben.datum && !e.angaben.betrag && !e.angaben.nummern.length;
  if (leer && !e.dokumente) return null;
  const datum = e.angaben.datum?.wert;
  const eintragen = async (werte: Werte) => {
    setFehler(undefined); setLaeuft(true);
    try { await api.mappeAendern(post.id, { werte }); await neuLaden(); await d.neuLaden(); }
    catch (x) { setFehler((x as Error).message); } finally { setLaeuft(false); }
  };
  const orgTyp = e.neuerAbsender ? d.typ(e.neuerAbsender.typId) : undefined;
  const neuLink = e.neuerAbsender && orgTyp ? `/ablage/${orgTyp.id}/neu?vorbelegen=${encodeURIComponent(JSON.stringify(e.neuerAbsender.werte))}` : null;
  const betragText = e.angaben.betrag ? formatiere({ key: 'b', label: '', typ: 'betrag' } as Feld, e.angaben.betrag.wert) : '';
  return (
    <section className="er-blatt" aria-label="Erkannt">
      <div className="er-kopf">
        <strong>Erkannt</strong>
        <span className="leise klein">Vorschläge aus dem Text – nichts ist eingetragen, bis du es übernimmst</span>
        <span className="luecke" aria-hidden="true" />
        <button type="button" className="textknopf klein" disabled={laeuft} onClick={() => { setLaeuft(true); void neu().finally(() => setLaeuft(false)); }} title="Nach einer neuen Organisation oder Änderungen an Kundennummern noch einmal suchen">Neu erkennen</button>
        <Hilfe ort="post.erkennung" />
      </div>
      {leer ? <p className="leise klein">Im Text dieser Post hat die Erkennung nichts gefunden.</p> : (
        <dl className="er-liste">
          {absender && <div className="er-paar">
            <dt>Absender</dt>
            <dd>
              <span className="chip">Vorschlag</span>{' '}
              <Link to={`/ablage/${absender.typId}/${absender.mappeId}`} className="verweis">{titelOder(absender.titel)}</Link>
              <span className="leise klein"> – gefunden: {absender.gruende.join(', ')}{!absender.stark || !e.eindeutig ? ' (unsicher)' : ''}</span>
              {darf && auswahlText(post.werte.absender) !== absender.titel && <> <button type="button" className="textknopf klein" disabled={laeuft} onClick={() => void eintragen({ absender: absender.titel })}>Als Absender eintragen</button></>}
              {weitere.length > 0 && <span className="leise klein er-weitere"> Auch möglich: {weitere.map((x, i) => <span key={x.mappeId}>{i > 0 && ', '}<Link to={`/ablage/${x.typId}/${x.mappeId}`} className="verweis">{titelOder(x.titel)}</Link></span>)}</span>}
            </dd>
          </div>}
          {!absender && e.neuerAbsender && <div className="er-paar">
            <dt>Absender</dt>
            <dd>
              <span className="chip">neu</span>{' '}
              {Object.values(e.neuerAbsender.werte).join(', ')}
              <span className="leise klein"> – aus dem Briefkopf; noch keine passende {orgTyp?.name ?? 'Mappe'}</span>
              {neuLink && darfErstellen(orgTyp) && <> <Link to={neuLink} className="textknopf klein">Als neue {orgTyp!.name} anlegen</Link></>}
            </dd>
          </div>}
          {datum && <div className="er-paar">
            <dt>Datum</dt>
            <dd>{formatiere({ key: 'd', label: '', typ: 'datum' } as Feld, datum)}<span className="leise klein"> – {e.angaben.datum!.fundstelle}</span>
              {darf && auswahlText(post.werte.datum) !== datum && <> <button type="button" className="textknopf klein" disabled={laeuft} onClick={() => void eintragen({ datum })}>Als Datum der Post eintragen</button></>}</dd>
          </div>}
          {e.angaben.betrag && <div className="er-paar"><dt>Betrag</dt><dd>{betragText}<span className="leise klein"> – {e.angaben.betrag.fundstelle}</span></dd></div>}
          {e.angaben.nummern.slice(0, 4).map((n) => <div key={`${n.label}:${n.wert}`} className="er-paar"><dt>{n.label}</dt><dd className="mono">{n.wert}</dd></div>)}
        </dl>
      )}
      {fehler && <p className="fehlertext" role="alert">{fehler}</p>}
    </section>
  );
}

function ZuordnenMaske({ typ, details, neuLaden, schliessen, erkennung }: { typ: Mappentyp; details: MappeDetails; neuLaden: () => Promise<void>; schliessen(): void; erkennung?: PostErkennung | null }) {
  const d = useDaten();
  const post = details.mappe;
  const ziele = d.typen.filter((t) => t.system !== 'post');
  // Vorschläge der Erkennung (#336) für Mappen, die man bearbeiten könnte; der beste ist vorausgewählt.
  const vorschlaege = (erkennung?.ziele ?? []).filter((z) => ziele.some((t) => t.id === z.typId));
  const erster = vorschlaege[0];
  const [art, setArt] = useState<'vorhanden' | 'neu'>('vorhanden');
  const [typId, setTypId] = useState(() => erster?.typId ?? ziele.find((t) => dokumentenRegister(t).length)?.id ?? ziele[0]?.id ?? '');
  const zielTyp = d.typ(typId);
  const regs = dokumentenRegister(zielTyp);
  const [register, setRegister] = useState('');
  useEffect(() => { setRegister(regs[0]?.key ?? ''); }, [typId]); // eslint-disable-line react-hooks/exhaustive-deps
  const [gewaehlt, setGewaehlt] = useState<Set<string>>(() => new Set(details.dokumente.map((x) => x.id)));
  // Doppelte Dateien (#333): Liegt ein Dokument dieser Post schon anderswo (in Mappen, die ich lesen darf)?
  const [doppelt, setDoppelt] = useState<Record<string, Fundstelle[]>>({});
  useEffect(() => {
    const werte = [...new Set(details.dokumente.map((x) => x.sha256))];
    if (!werte.length) return;
    let aus = false;
    api.gleicheDateien(werte.slice(0, 100), post.id).then((r) => { if (!aus) setDoppelt(r.fundstellen); }, () => {});
    return () => { aus = true; };
  }, [details.dokumente, post.id]);
  const [kopieren, setKopieren] = useState(false);
  const alsMappe = (z: { mappeId: string; typId: string; titel: string }) => ({ id: z.mappeId, typId: z.typId, titel: z.titel, werte: {}, erstellt: '', geaendert: '' }) as unknown as Mappe;
  const [ziel, setZiel] = useState<Mappe | undefined>(() => (erster ? alsMappe(erster) : undefined));
  const [vorgeschlagen, setVorgeschlagen] = useState(!!erster);
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
  useEffect(() => { setZiel((z) => (z && z.typId === typId && art === 'vorhanden' ? z : undefined)); }, [typId, art]);
  const waehleVorschlag = (z: (typeof vorschlaege)[number]) => { setArt('vorhanden'); setTypId(z.typId); setZiel(alsMappe(z)); setVorgeschlagen(true); };

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
    const q = new URLSearchParams({ zuordnen: post.id, dokumente: [...gewaehlt].join(','), vorschlag: JSON.stringify(vorschlagFuer(zielTyp, post.werte, erkennung)) });
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
      {vorschlaege.length > 0 && (
        <div className="er-ziele" role="group" aria-label="Vorschläge">
          <p className="klein"><strong>Vorschläge</strong> <span className="leise">aus dem Text der Post</span></p>
          <ul>{vorschlaege.slice(0, 5).map((z) => {
            const an = vorgeschlagen && ziel?.id === z.mappeId;
            return (
              <li key={z.mappeId}><button type="button" className={an ? 'an' : ''} aria-pressed={an} onClick={() => waehleVorschlag(z)}>
                <span className="er-zieltitel">{titelOder(z.titel)} <span className="leise klein">{d.typ(z.typId)?.name}</span>{an && <span className="chip">Vorschlag</span>}</span>
                <span className="leise klein">{z.gruende.join(' · ')}</span>
              </button></li>
            );
          })}</ul>
        </div>
      )}
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
                <li key={x.id}><button type="button" className={ziel?.id === x.id ? 'an' : ''} aria-pressed={ziel?.id === x.id} onClick={() => { setZiel(x); setVorgeschlagen(false); }}>{titelOder(x.titel)}</button></li>
              ))}</ul>}
        </div>
      )}

      {details.dokumente.length > 0 && (
        <fieldset className="eigenschaft">
          <legend>Dokumente</legend>
          {details.dokumente.map((x) => (
            <div key={x.id} className="mitdoppelt">
              <label className="haken mitvorschau"><input type="checkbox" checked={gewaehlt.has(x.id)} onChange={() => umschalten(x.id)} /><Vorschaubild d={x} /><span>{x.name}</span></label>
              {doppelt[x.sha256] && <Fundstellen f={doppelt[x.sha256]} />}
            </div>
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
