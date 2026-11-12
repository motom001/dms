import { useEffect, useRef, useState } from 'react';
import { auswahlText, darfErstellen, formatiere, jedeMappe, POST_STAND, zielErlaubt, type Feld, type Mappe, type Mappentyp, type Wert, type Werte } from '../../../shared/src/model';
import { api, type MappeDetails, type PostErkennung } from '../api';
import { artVon } from '../../../shared/src/erkennung';
import { betreffFeld } from '../../../shared/src/uebernehmen';
import { useDaten } from '../daten';
import { Link } from '../ort';
import { titelOder } from '../seiten';
import { Hilfe } from '../Hilfe';
import { neuePost } from './NeuePost';
import { istTouch, postFotografieren } from './PostKamera';
import { Symbol } from '../Symbol';
import { istVersendet } from '../../../shared/src/model';
import { rueckfrage } from '../rueckfrage';
import { t, tn } from '../sprache';
import { gebietsschema } from '../../../shared/src/sprache';
import { typName } from '../../../shared/src/beschriftung';
import { knopfAussehen } from '../bausteine';

/**
 * Post (#192): „+ Post“ in den Sichten mit Post und die Leiste an einer Post-Mappe (Stand, Zuordnen, Erledigt).
 * Zugeordnet wird auf der Seite „Dokument übernehmen“ (#934, Uebernehmen.tsx).
 */


/** „+ Post“ in den Sichten mit Post: Dateien wählen → eine Post-Mappe (#193, wie Ablegen und „+ Neu“). */
export function PostKnopf() {
  const eingabe = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" {...knopfAussehen({ art: 'anlegen', groesse: 'klein' })} onClick={() => eingabe.current?.click()} title={t('ablage.post.dateien-auswaehlen-sie-kommen')}>
        {t('ablage.post.post')}</button>
      {/* Am Handy bietet die Auswahl auch die Kamera an. */}
      <input ref={eingabe} type="file" multiple hidden onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ''; neuePost(f); }} />
    </>
  );
}

/**
 * Post aufgelöst (#936): Nach dem Speichern zeigt die Seite die nächste Post aus „Neue Post“; oben steht einmal, was
 * angelegt wurde. Gemerkt nur im Speicher der Seite – nach dem Neuladen ist der Hinweis weg.
 */
interface Aufloesung { fuer: string; id: string; typId: string; titel: string; /** In eine bestehende Mappe (#934). */ vorhanden?: boolean; /** Leerseiten (#997): so viele Seiten sind weggelassen. */ leerseiten?: number }
let letzteAufloesung: Aufloesung | null = null;
export function merkeAufloesung(x: Aufloesung) { letzteAufloesung = x; }

export function AufloesungHinweis({ postId }: { postId: string }) {
  const d = useDaten();
  const [x] = useState(() => (letzteAufloesung?.fuer === postId ? letzteAufloesung : null));
  useEffect(() => { if (x && letzteAufloesung === x) letzteAufloesung = null; }, [x]);
  if (!x) return null;
  const typ = d.typ(x.typId);
  return <div className="hinweis gut" role="status"><p>{tn(x.vorhanden ? 'ablage.post.uebernommen-naechste' : 'ablage.post.aufgeloest-naechste', { typ: typ ? typName(typ) : '', link: <Link to={`/ablage/${x.typId}/${x.id}`} className="verweis">{titelOder(x.titel)}</Link> })}
    {x.leerseiten ? <> {t('ablage.leerseiten.entfernt', { anzahl: x.leerseiten })}</> : null}</p></div>;
}

/** An einer Post-Mappe: Stand, „Zuordnen …“ (öffnet die Seite „Dokument übernehmen“, #934), „Erledigt“ bzw. „Wieder neu“. */
export function PostLeiste({ typ, details, neuLaden }: { typ: Mappentyp; details: MappeDetails; neuLaden: () => Promise<void> }) {
  const d = useDaten();
  const m = details.mappe;
  const stand = auswahlText(m.werte.stand) || POST_STAND.neu;
  const darf = details.rechte?.U !== false;
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
      <AufloesungHinweis postId={m.id} />
      <div className="postleiste">
        <span className={`chip stand-${stand.toLowerCase()}`}>{stand}</span>
        {zugeordnet.length > 0 && (
          <span className="klein">{t('ablage.post.zugeordnet-zu')}{' '}{zugeordnet.map((id, i) => {
            const b = details.bezuege[id];
            return <span key={id}>{i > 0 && ', '}{b && !b.verborgen ? <Link to={`/ablage/${b.typId}/${id}`} className="verweis">{titelOder(b.titel)}</Link> : titelOder(b?.titel)}</span>;
          })}</span>
        )}
        <span className="luecke" aria-hidden="true" />
        {darf && !versendet && <Link to={`/ablage/${d.zaehler.neuePost ?? typ.id}/${m.id}/uebernehmen`} className="knopf klein primaer">{t('ablage.post.zuordnen')}</Link>}
        {darf && stand !== POST_STAND.erledigt && <button type="button" className="knopf klein" onClick={() => void setzeStand(POST_STAND.erledigt)} title={t('ablage.post.nichts-mehr-zu-tun')}>{t('ablage.post.erledigt')}</button>}
        {darf && stand !== POST_STAND.neu && <button type="button" className="textknopf klein" onClick={() => void setzeStand(POST_STAND.neu)}>{t('ablage.post.wieder-neu')}</button>}
        <Hilfe ort="post.zuordnen" />
        {/* #490: Rückseite vergessen? Seite mit der Kamera anhängen (Handy) bzw. eine zweite Post anhängen. */}
        {darf && !versendet && <div className="pk-postzeile">
          {istTouch() && <button type="button" className="knopf klein" onClick={() => postFotografieren({ mappeId: m.id, dokumentId: pdf?.id, titel: titelOder(m.titel), fertig: () => { void neuLaden(); void d.neuLaden(); } })}
            title={pdf ? t('ablage.post.foto-als-weitere-seite', { name: pdf.name }) : t('ablage.post.fotos-als-pdf-an')}>{tn('ablage.post.seite-hinzufuegen', { symbol: <Symbol name="kamera" /> })}</button>}
          <button type="button" className={`textknopf klein ${zusammen ? 'an' : ''}`} aria-expanded={zusammen} onClick={() => setZusammen(!zusammen)} title={t('ablage.post.die-seiten-einer-anderen')}>{t('ablage.post.mit-anderer-post-zusammenlegen')}</button>
        </div>}
      </div>
      {fehler && <div className="hinweis schlecht" role="alert"><p>{fehler}</p></div>}
      {erkennung && !versendet && <Erkannt post={m} e={erkennung} darf={darf} neuLaden={neuLaden} neu={async () => setErkennung(await api.erkennung(m.id, true))} />}
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
    if (!(await rueckfrage({ titel: t('ablage.post.hier-anhaengen', { titelOder: titelOder(q.titel) }), text: t('ablage.post.ihre-seiten-kommen-ans', { titelOder: titelOder(post.titel), titelOder2: titelOder(q.titel) }), ja: t('ablage.post.zusammenlegen') }))) return;
    setLaeuft(true); setFehler(undefined);
    try { await api.postZusammenlegen(post.id, q.id); schliessen(); await neuLaden(); await d.neuLaden(); }
    catch (e) { setFehler((e as Error).message); } finally { setLaeuft(false); }
  }
  const zeit = (iso: string) => new Date(iso).toLocaleString(gebietsschema(), { dateStyle: 'short', timeStyle: 'short' });
  return (
    <section className="blatt pk-zusammen" aria-label={t('ablage.post.mit-anderer-post-zusammenlegen-2')}>
      <div className="blattkopf zeile-zwischen"><h2 className="h3">{t('ablage.post.mit-anderer-post-zusammenlegen-2')}</h2><button type="button" className="textknopf" onClick={schliessen}>{t('ablage.post.schliessen')}</button></div>
      <p className="leise">{t('ablage.post.welche-post-gehoert-zu')}</p>
      {fehler && <p className="fehlertext" role="alert">{fehler}</p>}
      {liste === null ? !fehler && <p className="leise">{t('ablage.post.lade')}</p> : !liste.length ? <p className="leise">{t('ablage.post.keine-andere-neue-post')}</p> : (
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
  // Betreff (#934, Patch): nur ins erste Titelfeld und nur, wenn es ein Textfeld ohne festes Format ist – sonst bleibt es leer.
  const text = betreffFeld(ziel);
  if (text && betreff) v[text.key] = betreff.slice(0, text.maxLen ?? 250);
  const dat = ziel.felder.find((f) => f.typ === 'datum');
  if (dat && datum) v[dat.key] = datum;
  if (!e) return v;
  const stamm = (s: string) => s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/[^a-z]/g, '').replace(/(nummer|nr)$/, '');
  const absender = e.absender.find((x) => x.mappeId === e.eindeutig) ?? e.absender.find((x) => x.stark);
  for (const f of ziel.felder) {
    if (v[f.key] !== undefined || f.typ === 'passwort') continue;
    const art = artVon(f);
    // Gutschrift (#1043): negativ, wo das Feld es erlaubt.
    if (art === 'betrag' && f.typ === 'betrag' && e.angaben.betrag) v[f.key] = e.angaben.gutschrift && f.negativ && e.angaben.betrag.wert.betrag > 0 ? { ...e.angaben.betrag.wert, betrag: -e.angaben.betrag.wert.betrag } : e.angaben.betrag.wert;
    else if (art === 'nummer' && f.typ === 'text') { const n = e.angaben.nummern.find((x) => stamm(x.label) && (stamm(x.label) === stamm(f.label) || stamm(x.label) === stamm(f.key))); if (n) v[f.key] = n.wert; }
    // „von“ und „an“ (#1043): Bei eigener Post (ausgehend) ist der Erkannte die Gegenseite – dann „an“, sonst „von“.
    else if (art === 'verweis' && absender && zielErlaubt(f, absender.typId) && !jedeMappe(f) && !(f.key === 'von' && e.ausgehend) && !(f.key === 'an' && !e.ausgehend)) v[f.key] = f.mehrfach ? [absender.mappeId] : absender.mappeId;
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
    <section className="er-blatt" aria-label={t('ablage.post.erkannt')}>
      <div className="er-kopf">
        <strong>{t('ablage.post.erkannt')}</strong>
        <span className="leise klein">{t('ablage.post.vorschlaege-aus-dem-text')}</span>
        <span className="luecke" aria-hidden="true" />
        <button type="button" className="textknopf klein" disabled={laeuft} onClick={() => { setLaeuft(true); void neu().finally(() => setLaeuft(false)); }} title={t('ablage.post.nach-einer-neuen-organisation')}>{t('ablage.post.neu-erkennen')}</button>
        <Hilfe ort="post.erkennung" />
      </div>
      {e.auto && <p className="klein er-auto">{e.auto.rueckgaengig ? t('ablage.post.die-automatische-zuordnung-wurde') : t('ablage.post.automatisch-zugeordnet')}
        {e.bezuege[e.auto.ziel] && <> {e.auto.rueckgaengig ? t('ablage.post.von') : t('ablage.post.zu')} <Link to={`/ablage/${e.bezuege[e.auto.ziel].typId}/${e.auto.ziel}`} className="verweis">{titelOder(e.bezuege[e.auto.ziel].titel)}</Link></>}
        {!e.auto.rueckgaengig && <span className="leise"> – {e.auto.grund}</span>}</p>}
      {e.ausgehend && <p className="klein er-auto"><span className="chip warn">{t('ablage.post.ausgehend')}</span>{' '}{e.ausgehend.titel ? t('ablage.post.ausgehend-text', { titel: e.ausgehend.titel }) : t('ablage.post.ausgehend-text-ohne')}
        {e.ausgehend.fundstelle && <span className="leise"> – „{e.ausgehend.fundstelle}“</span>}</p>}
      {leer ? <p className="leise klein">{t('ablage.post.im-text-dieser-post')}</p> : (
        <dl className="er-liste">
          {absender && <div className="er-paar">
            <dt>{t('ablage.post.absender')}</dt>
            <dd>
              <span className="chip">{t('ablage.post.vorschlag')}</span>{' '}
              <Link to={`/ablage/${absender.typId}/${absender.mappeId}`} className="verweis">{titelOder(absender.titel)}</Link>
              <span className="leise klein"> {' '}{t('ablage.post.gefunden', { gruende: absender.gruende.join(', '), wert: !absender.stark || !e.eindeutig ? t('ablage.post.unsicher') : '' })}</span>
              {darf && auswahlText(post.werte.von) !== absender.titel && <> <button type="button" className="textknopf klein" disabled={laeuft} onClick={() => void eintragen({ von: absender.titel })}>{t('ablage.post.als-absender-eintragen')}</button></>}
              {weitere.length > 0 && <span className="leise klein er-weitere"> {' '}{t('ablage.post.auch-moeglich')}{' '}{weitere.map((x, i) => <span key={x.mappeId}>{i > 0 && ', '}<Link to={`/ablage/${x.typId}/${x.mappeId}`} className="verweis">{titelOder(x.titel)}</Link></span>)}</span>}
            </dd>
          </div>}
          {!absender && e.neuerAbsender && <div className="er-paar">
            <dt>{t('ablage.post.absender')}</dt>
            <dd>
              <span className="chip">{t('ablage.post.neu')}</span>{' '}
              {Object.values(e.neuerAbsender.werte).join(', ')}
              <span className="leise klein"> {' '}{t('ablage.post.aus-dem-briefkopf-noch', { wert: orgTyp?.name ?? t('ablage.post.mappe') })}</span>
              {neuLink && darfErstellen(orgTyp) && <> <Link to={neuLink} className="textknopf klein">{t('ablage.post.als-neue-anlegen', { name: orgTyp!.name })}</Link></>}
            </dd>
          </div>}
          {datum && <div className="er-paar">
            <dt>{t('ablage.post.datum')}</dt>
            <dd>{formatiere({ key: 'd', label: '', typ: 'datum' } as Feld, datum)}<span className="leise klein"> – {e.angaben.datum!.fundstelle}</span>
              {darf && auswahlText(post.werte.datum) !== datum && <> <button type="button" className="textknopf klein" disabled={laeuft} onClick={() => void eintragen({ datum })}>{t('ablage.post.als-datum-der-post')}</button></>}</dd>
          </div>}
          {e.angaben.betrag && <div className="er-paar"><dt>{t('ablage.post.betrag')}</dt><dd>{betragText}<span className="leise klein"> – {e.angaben.betrag.fundstelle}</span></dd></div>}
          {e.angaben.nummern.slice(0, 4).map((n) => <div key={`${n.label}:${n.wert}`} className="er-paar"><dt>{n.label}</dt><dd className="mono">{n.wert}</dd></div>)}
        </dl>
      )}
      {fehler && <p className="fehlertext" role="alert">{fehler}</p>}
    </section>
  );
}
