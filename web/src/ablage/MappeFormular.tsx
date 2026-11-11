import { abschnittTitel, feldHilfe, feldLabel, optionText, registerName, typName } from '../../../shared/src/beschriftung';
import { abschnittEinstellung, abschnittId, ausgeblendeteFelder, gruppiere, sichtbareRegister } from '../../../shared/src/darstellung';
import { abschnittName, anzeigestand, beschreibeAnzeige, typNameAus, type Anzeigestand } from '../../../shared/src/anzeige';
import { anzahlWerte, anzeigeImFormular, hatWert as mitWert } from './anzeige';
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent as ReactDragEvent, type ReactNode } from 'react';
import { Symbol } from '../Symbol';
import { Stern } from './Stern';
import { spaltenName, zelle } from './spalten';
import { eigeneFelderIm, vorbelegungAus } from '../../../shared/src/sichten';
import { datumText, inFrist } from '../../../shared/src/archiv';
import { deutschePlz, eingabemodus, formatFehler, mitSchema, pruefeFormate, telefonLink } from '../../../shared/src/feldformate';
import { darfErstellen, darfLoeschen, formatiere, istVersendet, trefferlistenVon, geschuetzteFelder, istLeer, istOk,  standardRegister, titelAus, VERWEISARTEN, verweisAusText, mehrereZiele, zieleVon, zielErlaubt, type Verweiskonflikt, type Dokument, type Feld, type Mappe, type Abschnitt, type Mappenkonflikt, type Mappentyp, type Pruefergebnis, type Register, type Wert, type Werte } from '../../../shared/src/model';
import type { PaketHinweis } from '../../../shared/src/berechnet';
import { rechtsbuendig } from '../../../shared/src/feldarten';
import { Knopf, NurLesenFeld, ProzentEingabe, ZeitraumEingabe } from '../bausteine';
import { api, ApiFehler, type Bezuege, type MappeDetails, type Rueckverweis } from '../api';
import { useDaten } from '../daten';
import { useKonto } from '../konto';
import { darfBereich } from '../../../shared/src/verwaltungsrecht';
import { ORGANISATION_BEREICH } from '../../../shared/src/organisation';
import { geheZu, Link, loeseWache, useUngespeichert } from '../ort';
import { ausRoh, leeresPasswort, rohAusWerten, standardRoh, werteAusRoh, zuRoh, type Roh, type RohBetrag, type RohPasswort, type RohWerte, type RohZeitraum } from '../werte';
import { titelOder } from '../seiten';
import { Mehrfachauswahl } from './Mehrfachauswahl';
import { TypMarke } from './TypMarke';
import { Formatiert, FormatiertEingabe } from './Formatiert';
import { Uebersetzbar } from './Uebersetzung';
import { Historie } from './Historie';
import { mitNotizen, NOTIZEN_REGISTER, startRegister, type AnsichtsRegister } from '../../../shared/src/mappenansicht';
import { Notizen } from './Notizen';
import { AufgabenHinweis, ErinnerungFormular, Erinnerungen, NeueAufgabe } from './Aufgaben';
import { Aktionsmenue, Druckansicht, EmailMaske } from './Aktionen';
import { LoeschBaum } from './LoeschBaum';
import { merkeAufloesung, PostLeiste } from './Post';
import { linkZuMappe } from '../../../shared/src/direktlink';
import { Ehemalig, Person } from '../Person';
import { Dokumente, type NeueDatei } from './Dokumente';
import { AehnlicheDokumente } from './Aehnlich';
import { hinweis, rueckfrage } from '../rueckfrage';
import { mitGrund } from './Loeschgrund';
import { AusDokument, type AusDokumentErgebnis } from './AusDokument';
import { ausDokumentKnopf, type Sicherheit } from '../../../shared/src/erkennung';
import type { TypVorschlaege } from '../api';
import { farbeVon, liesNutzlast, useBruecke, ziehtWert } from './bruecke';
import { altesFeldAusblenden } from '../../../shared/src/umwandlung';
import { enthaeltId, ersteId } from '../../../shared/src/folgtaus';
import { VerweisFenster } from './VerweisFenster';
import { Tabellenfeld } from './Tabellenfeld';
import { wertfelder } from '../../../shared/src/tabelle';
import { istTeiltyp, uebergeordneteId } from '../../../shared/src/teile';
import { t, tn } from '../sprache';
import { gebietsschema } from '../../../shared/src/sprache';

const zeit = (iso: string) => new Date(iso).toLocaleString(gebietsschema(), { dateStyle: 'medium', timeStyle: 'short' });

/** Register des Typs; ältere Typen ohne Register bekommen die Standardregister. Ausgeblendete (#655) zeigt die Mappe nicht. */
const registerVon = (mappentyp: Mappentyp): Register[] => sichtbareRegister(mappentyp.register?.length ? mappentyp.register : standardRegister(mappentyp.felder));

/**
 * Neue Mappe als Ziel von „Zuordnen“ (#192): danach wird die Post ihr zugeordnet. `aufloesen` (#936): aus der Post wird
 * diese Mappe (Dokumente und Historie wandern mit, die Post kommt in den Papierkorb) – true, wenn die Person die Post
 * löschen darf; false bleibt beim Zuordnen; undefined, solange es noch nicht feststeht.
 */
export interface ZuordnenNachher { post: string; register?: string; dokumente: string[]; kopieren: boolean; vorschlag: Record<string, Wert>; aufloesen?: boolean }

/**
 * Lässt sich die Post beim Speichern auflösen (#936)? Nicht mit „Kopie in der Post behalten“ und nicht bei versendeten
 * E-Mails (dann wie bisher zuordnen, ohne Hinweis); ohne Recht zum Löschen bleibt sie zugeordnet – mit Hinweis.
 */
/** Die nächste Post aus „Neue Post“ (#936) – wie die Ansicht sie zuerst zeigt; ohne Ansicht oder Post keine. */
async function naechstePost(sicht: string | null | undefined): Promise<Mappe | undefined> {
  if (!sicht) return undefined;
  try { return (await api.seite(sicht, 0, 1)).mappen.find((m) => !m.verborgen); } catch { return undefined; }
}

function useAufloesung(z: ZuordnenNachher | undefined) {
  const [x, setX] = useState<{ aufloesen?: boolean; gesperrt: boolean; dokumente: number } | null>(null);
  useEffect(() => {
    // Mit „Kopie in der Post behalten“ wird nicht aufgelöst (#936) – auch wenn der Haken erst später gesetzt wird (#934).
    if (!z || z.kopieren) { setX(null); return; }
    let aktuell = true;
    api.mappe(z.post).then((p) => {
      if (!aktuell) return;
      if (istVersendet(p.mappe.werte)) { setX({ gesperrt: false, dokumente: p.dokumente.length }); return; }
      const gesperrt = p.rechte?.D === false || p.loeschbar?.ok === false;
      setX({ aufloesen: !gesperrt, gesperrt, dokumente: p.dokumente.length });
    }, () => {});
    return () => { aktuell = false; };
  }, [z?.post, z?.kopieren]); // eslint-disable-line react-hooks/exhaustive-deps -- nur bei anderer Post neu laden
  return x;
}

/** Vorbelegung einer neuen Mappe (#172, #935): Auswahlfilter, erkannte Angaben – nur, was zur Feldart passt. */
function belegeVor(typ: Mappentyp, start: RohWerte, werte: Record<string, unknown>) {
  for (const [k, v] of Object.entries(werte)) {
    const f = typ.felder.find((x) => x.key === k);
    if (!f || f.typ === 'passwort' || f.typ === 'betrag' || f.ausgeblendet) continue;
    if (f.typ === 'janein' && typeof v === 'boolean') start[k] = v;
    // Zeitraum und Prozent (#1035): „P3M“, { anzahl, einheit } bzw. eine Zahl.
    else if (f.typ === 'zeitraum' || (f.typ === 'prozent' && typeof v === 'number')) start[k] = zuRoh(f, v as Wert);
    else if (Array.isArray(v) && f.mehrfach) start[k] = v.map(String);
    else if (typeof v === 'string' && !f.mehrfach) start[k] = v;
  }
}

export function NeueMappe({ typ, verweis, sicht, zuordnen, vorbelegen, vorschlagStart, kopf }: {
  typ: Mappentyp; verweis?: string; sicht: string; zuordnen?: ZuordnenNachher; vorbelegen?: string;
  /** Seite „Dokument übernehmen“ (#934): Vorschläge aus dem Dokument und ein eigener Kopf (Titel, wie er nach dem Speichern heißt). */
  vorschlagStart?: TypVorschlaege; kopf?: (werte: Werte, bekannt: Bezuege) => ReactNode;
}) {
  const start = standardRoh(typ);
  // ?vorbelegen={…} (#172): was sich aus dem Auswahlfilter eines Referenzfelds ergibt, z. B. Art = Arzt.
  try { belegeVor(typ, start, vorbelegen ? JSON.parse(vorbelegen) as Record<string, unknown> : {}); } catch { /* ohne Vorbelegung */ }
  // Vorschläge aus der Post (Betreff, Datum) und aus der Erkennung (#336: Betrag, Nummern, Verweis auf den Absender).
  const vorbelegt: string[] = [];
  for (const [k, v] of Object.entries(zuordnen?.vorschlag ?? {})) {
    const f = typ.felder.find((x) => x.key === k);
    if (!f || f.typ === 'passwort' || v == null) continue;
    if ((f.typ === 'text' || f.typ === 'langtext' || f.typ === 'datum' || f.typ === 'referenz') && typeof v !== 'string') continue;
    if (f.typ === 'betrag' && (typeof v !== 'object' || Array.isArray(v) || typeof (v as { betrag?: unknown }).betrag !== 'number')) continue;
    start[k] = zuRoh(f, v);
    vorbelegt.push(feldLabel(f));
  }
  // ?verweis=feldKey:mappeId belegt ein Referenzfeld vor („+ Vertrag anlegen“ beim Vertragspartner).
  if (verweis) {
    const [k, id] = verweis.split(':');
    const f = typ.felder.find((x) => x.key === k && x.typ === 'referenz');
    if (f && id) start[f.key] = f.mehrfach ? [id] : id;
  }
  const aufloesung = useAufloesung(zuordnen);
  const mitDoks = zuordnen?.dokumente.length ? t('ablage.mappeformular.ihre-dokumente-kommen-hierher', { anzahl: zuordnen.dokumente.length }) : '';
  // Abgetrennt (#936): Nicht gewählte Dokumente kommen als neue Post nach „Neue Post“.
  const uebrig = aufloesung?.aufloesen && zuordnen ? Math.max(0, aufloesung.dokumente - zuordnen.dokumente.length) : 0;
  // Auf der Seite „Dokument übernehmen“ (#934) zeigt der Kopf die Mappe; was mit der Post geschieht, sagt die Speicherleiste.
  if (kopf) return <Formular typ={typ} start={start} sicht={sicht} zuordnen={zuordnen && { ...zuordnen, aufloesen: aufloesung?.aufloesen }} vorschlagStart={vorschlagStart} kopf={kopf} />;
  return (
    <>
      <div className="mappenkopf">
        <p className="ueber">{typName(typ)}</p>
        <h1>{t('ablage.mappeformular.neue-mappe')}</h1>
      </div>
      {zuordnen && <div className="hinweis info"><p>
        {aufloesung?.aufloesen ? t('ablage.mappeformular.aus-der-post-wird', { wert: mitDoks }) : t('ablage.mappeformular.nach-dem-speichern-wird', { wert: mitDoks })}
        {uebrig > 0 && <> {' '}{t('ablage.mappeformular.uebrige-als-neue-post', { anzahl: uebrig })}</>}
        {vorbelegt.length > 0 && <> {' '}{t('ablage.mappeformular.als-vorschlag-aus-der', { vorbelegt: vorbelegt.join(', ') })}</>}</p></div>}
      <Formular typ={typ} start={start} sicht={sicht} zuordnen={zuordnen && { ...zuordnen, aufloesen: aufloesung?.aufloesen }} />
    </>
  );
}

/**
 * Verwaltungsmodus (#820): Diese Mappe dürfte die Person ohne Modus nicht lesen. Beim ersten Öffnen im Modus ein
 * deutlicher Hinweis (danach klein), dass es in der Historie der Mappe steht.
 */
function NurImModus({ mappeId }: { mappeId: string }) {
  const [erstes] = useState(() => {
    try { const k = `dms:nur-im-modus:${mappeId}`; const da = sessionStorage.getItem(k); sessionStorage.setItem(k, '1'); return !da; } catch { return true; }
  });
  return <div className={erstes ? 'hinweis warn' : 'leise klein'} role={erstes ? 'alert' : undefined} id="nur-im-verwaltungsmodus"><p>{t('mappen.verwaltungsmodus.hinweis')}</p></div>;
}

export function MappeAnsicht({ typ, details, sicht, anhang = '', neuLaden, vorschlagStart }: {
  typ: Mappentyp; details: MappeDetails; sicht: string; anhang?: string; neuLaden: () => Promise<void>;
  /** „Aus Dokument ausfüllen“ auf der Seite „Dokument übernehmen“ (#934): Vorschläge aus dem Dokument der Mitte. */
  vorschlagStart?: TypVorschlaege;
}) {
  const d = useDaten();
  const { ich } = useKonto();
  const mappe = details.mappe;
  const bekannt = new Set(typ.felder.map((f) => f.key));
  const verwaist = Object.entries(mappe.werte).filter(([k, v]) => !bekannt.has(k) && !istLeer(v));
  // Sprung auf einen Register von außen, z. B. „Zur Notiz“ im Aufgaben-Banner (#427).
  const [registerWunsch, setRegisterWunsch] = useState<{ key: string; n: number }>();
  const [aufgabeOffen, setAufgabeOffen] = useState(false);
  const [erinnernOffen, setErinnernOffen] = useState(false);
  const [emailOffen, setEmailOffen] = useState(false);
  const [drucken, setDrucken] = useState(false);
  const [loeschBaum, setLoeschBaum] = useState(false);
  // Handy (#489): „Mappe löschen“ steht im Menü „Mappe ▾“ statt in der Speicherleiste; der Formular-Teil löscht.
  const [loeschWunsch, setLoeschWunsch] = useState(0);
  const loeschbarHier = darfLoeschen(typ, mappe);
  const druckEnde = useCallback(() => setDrucken(false), []);
  // Sprechender Link (#98) über ein eindeutiges Feld oder die Titelfelder.
  const direktlink = linkZuMappe(typ, mappe);
  const [kopiert, setKopiert] = useState<{ link: string; ok: boolean } | null>(null);
  // Mit verknüpften Mappen löschen (#424): im Menü „Mappe ▾“ unter den Löschwegen (#427) und unter
  // „Warum nicht?“ am Löschknopf (#423); die Vorschau steht oben unter dem Kopf.
  const mitVerknuepften = darfLoeschen(typ, mappe) && details.rechte?.D !== false ? () => {
    setLoeschBaum(true);
    window.setTimeout(() => document.querySelector('.lb-blatt')?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 50);
  } : undefined;
  return (
    <>
      <div className="mappenkopf">
        <p className="ueber">{typName(typ)}</p>
        {/* Kopfzeile (#427): „Mappe ▾“ neben dem Stern – gehört sichtbar zur Mappe, nicht zum Aufgaben-Banner. */}
        <div className="titelzeile"><h1><Ehemalig id={mappe.id}>{titelOder(mappe.titel)}</Ehemalig></h1>
          <div className="mappenkopf-knoepfe">
            <Stern mappeId={mappe.id} an={!!details.favorit} anker="mappe.stern" />
            <Aktionsmenue aufgabe={() => setAufgabeOffen(true)} erinnern={() => setErinnernOffen(true)} email={details.exportierbar === false ? undefined : () => setEmailOffen(true)} drucken={details.exportierbar === false ? undefined : () => setDrucken(true)}
              link={direktlink ? () => { const l = location.origin + direktlink; void kopiere(l).then((ok) => setKopiert({ link: l, ok })); } : undefined}
              auskunft={details.auskunft ? () => geheZu(`/werkbank/auskuenfte/neu?mappe=${encodeURIComponent(details.mappe.id)}`) : undefined}
              loeschwege={[
                ...(loeschbarHier ? [{ text: t('ablage.mappeformular.mappe-loeschen'), tu: () => setLoeschWunsch((n) => n + 1), nurSchmal: true }] : []),
                ...(mitVerknuepften ? [{ text: t('ablage.mappeformular.mit-verknuepften-mappen-loeschen'), titel: t('ablage.mappeformular.diese-mappe-samt-allen'), tu: mitVerknuepften }] : []),
              ]} />
          </div>
        </div>
        <dl className="index">
          <div><dt>{t('ablage.mappeformular.angelegt')}</dt><dd>{t('ablage.mappeformular.von', { zeit: zeit(mappe.erstellt) })}{' '}<Person id={mappe.erstelltVon} /></dd></div>
          <div><dt>{t('ablage.mappeformular.zuletzt-geaendert')}</dt><dd>{t('ablage.mappeformular.von', { zeit: zeit(mappe.geaendert) })}{' '}<Person id={mappe.geaendertVon} /></dd></div>
          {/* Archivmodus (#212) */}
          {/* Die Frist läuft noch nicht (#1051): aufbewahren, ohne Datum. */}
          {details.fristBeginntMit !== undefined && <div><dt><span className="chip archiv" title={t('ablage.mappeformular.archivmodus-vor-fristende-nicht')}>{t('ablage.mappeformular.archiv')}</span></dt><dd>{t('ablage.mappeformular.aufbewahren-frist-beginnt-mit', { feld: details.fristBeginntMit })}</dd></div>}
          {details.aufbewahrenBis && <div><dt><span className="chip archiv" title={t('ablage.mappeformular.archivmodus-vor-fristende-nicht')}>{t('ablage.mappeformular.archiv')}</span></dt><dd>{inFrist(details.aufbewahrenBis) ? t('ablage.mappeformular.aufbewahren-bis') : t('ablage.mappeformular.frist-abgelaufen-am')} {datumText(details.aufbewahrenBis)}</dd></div>}
        </dl>
        {typ.system === 'benutzer' && ich.rolle === 'admin' && <p className="leise klein"><Link to={`/werkbank/benutzer/${mappe.id}`} className="verweis">{t('ablage.mappeformular.in-der-benutzerverwaltung-oeffnen')}</Link></p>}
        {mappe.systemKennung && <p className="leise klein"><span className="chip">{t('ablage.mappeformular.systemrolle')}</span> {t('mappen.systemrolle.hinweis')}</p>}
        {kopiert && <LinkKopiert {...kopiert} schliessen={() => setKopiert(null)} />}
      </div>
      <TeilVon typ={typ} details={details} />
      {details.nurImVerwaltungsmodus && <NurImModus mappeId={mappe.id} />}
      {typ.system === 'post' && <PostLeiste typ={typ} details={details} neuLaden={neuLaden} />}
      <AufgabenHinweis aufgaben={details.aufgaben ?? []} neuLaden={neuLaden} zuNotizen={() => setRegisterWunsch((w) => ({ key: NOTIZEN_REGISTER, n: (w?.n ?? 0) + 1 }))} />
      <Erinnerungen liste={details.erinnerungen ?? []} neuLaden={neuLaden} />
      {aufgabeOffen && <NeueAufgabe mappeId={mappe.id} neuLaden={neuLaden} schliessen={() => setAufgabeOffen(false)} />}
      {erinnernOffen && <ErinnerungFormular mappeId={mappe.id} neuLaden={neuLaden} schliessen={() => setErinnernOffen(false)} />}
      {loeschBaum && <LoeschBaum key={mappe.id} mappeId={mappe.id} titel={mappe.titel ?? ''} sicht={sicht} schliessen={() => setLoeschBaum(false)} neuLaden={neuLaden} />}
      {emailOffen && <EmailMaske key={mappe.id} typ={typ} details={details} neuLaden={neuLaden} schliessen={() => setEmailOffen(false)} />}
      {drucken && <Druckansicht typ={typ} details={details} fertig={druckEnde} />}
      {mappe.passt === false && (
        <div className="hinweis warn"><p>{t('ablage.mappeformular.diese-mappe-passt-nicht', { name: typ.name, wert: mappe.problem ? ` (${mappe.problem})` : '' })}</p></div>
      )}
      <Formular typ={typ} mappe={mappe} start={rohAusWerten(typ, mappe.werte)} sicht={sicht} anhang={anhang} details={details} neuLaden={neuLaden} registerWunsch={registerWunsch} mitVerknuepften={mitVerknuepften} loeschWunsch={loeschWunsch} vorschlagStart={vorschlagStart} />
      {verwaist.length > 0 && (
        <section className="blatt">
          <h2 className="h3">{t('ablage.mappeformular.werte-ohne-felddefinition')}</h2>
          <p className="leise">{t('ablage.mappeformular.diese-werte-stammen-aus')}</p>
          <ul className="verwaist">{verwaist.map(([k, v]) => <li key={k}><code>{k}</code>: {typeof v === 'object' ? JSON.stringify(v) : String(v)}</li>)}</ul>
        </section>
      )}
    </>
  );
}

/**
 * Register-Reihe (#427): Am Handy ist sie breiter als der Bildschirm und rollt waagerecht.
 * Ein Schatten am Rand zeigt, dass es weitergeht; der aktive Register rollt immer in den Blick.
 */
function RegisterReihe({ aktiv, children }: { aktiv?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [rand, setRand] = useState({ links: false, rechts: false });
  const messe = useCallback(() => {
    const e = ref.current;
    if (!e) return;
    const links = e.scrollLeft > 2, rechts = e.scrollLeft + e.clientWidth < e.scrollWidth - 2;
    setRand((r) => (r.links === links && r.rechts === rechts ? r : { links, rechts }));
  }, []);
  useEffect(() => {
    const e = ref.current;
    if (!e) return;
    messe();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(messe);
    ro?.observe(e);
    return () => ro?.disconnect();
  }, [messe]);
  useEffect(() => {
    const e = ref.current, eintrag = e?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!e || !eintrag || e.scrollWidth <= e.clientWidth) return;
    // Nur waagerecht rollen – scrollIntoView würde auch die Seite verschieben.
    if (eintrag.offsetLeft < e.scrollLeft) e.scrollLeft = eintrag.offsetLeft - 16;
    else if (eintrag.offsetLeft + eintrag.offsetWidth > e.scrollLeft + e.clientWidth) e.scrollLeft = eintrag.offsetLeft + eintrag.offsetWidth - e.clientWidth + 16;
    messe();
  }, [aktiv, messe]);
  return (
    <div className={`registerreihe${rand.links ? ' registerreihe-links' : ''}${rand.rechts ? ' registerreihe-rechts' : ''}`}>
      <div className="registertaben" role="tablist" aria-label={t('ablage.mappeformular.register')} ref={ref} onScroll={messe}>{children}</div>
    </div>
  );
}

/** In die Zwischenablage; ohne HTTPS (z. B. http://nas:8080) über ein unsichtbares Textfeld. */
async function kopiere(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* weiter mit dem Rückfall */ }
  const hTMLTextAreaElement = document.createElement('textarea');
  hTMLTextAreaElement.value = text; hTMLTextAreaElement.setAttribute('readonly', ''); hTMLTextAreaElement.style.position = 'fixed'; hTMLTextAreaElement.style.opacity = '0';
  document.body.appendChild(hTMLTextAreaElement); hTMLTextAreaElement.select();
  try { return document.execCommand('copy'); } catch { return false; } finally { hTMLTextAreaElement.remove(); }
}

/** Rückmeldung zu „Link kopieren“ (#98); klappt das Kopieren nicht, steht der Link markiert zum Kopieren da. */
function LinkKopiert({ link, ok, schliessen }: { link: string; ok: boolean; schliessen(): void }) {
  return (
    <div className={`hinweis ${ok ? 'gut' : 'warn'} linkkopiert`} role="status">
      <p>{ok ? t('ablage.mappeformular.link-kopiert') : t('ablage.mappeformular.kopieren-ging-nicht-markiere')}</p>
      <input type="text" readOnly value={link} aria-label={t('ablage.mappeformular.link-auf-diese-mappe')} onFocus={(e) => e.target.select()} autoFocus={!ok} />
      <button type="button" className="textknopf" onClick={schliessen}>{t('ablage.mappeformular.schliessen')}</button>
    </div>
  );
}

let zaehler = 0;

/** Felder, die aus diesem Verweisfeld folgen (#886). */
const folgendeAus = (typ: Mappentyp, key: string) => typ.felder.filter((x) => x.typ === 'referenz' && x.folgtAus?.feld === key).map((x) => x.key);

/** „passt nicht zu „Organisation““ bzw. „passt nicht zur Auswahlregel dieses Felds“ (#887) – nie „Filter“. */
/**
 * Teil einer anderen Mappe (#1031, Hinweis Qualität E7): Wer einen Teil direkt öffnet, sieht oben deutlich „Teil von
 * ‹Rechnung …›“ mit dem Weg zurück. Ist die übergeordnete Mappe nicht lesbar, steht nur, dass sie nicht sichtbar ist.
 */
function TeilVon({ typ, details }: { typ: Mappentyp; details: MappeDetails }) {
  const d = useDaten();
  const id = istTeiltyp(typ) ? uebergeordneteId(typ, details.mappe.werte) : null;
  if (!id) return null;
  const b = details.bezuege[id];
  const eltern = b ? d.typ(b.typId) : undefined;
  return (
    <div className="hinweis info teil-von" data-anker="mappe.teil-von">
      <p>{b && !b.verborgen
        ? tn('ablage.teile.teil-von', { mappe: <Link to={`/ablage/${b.typId}/${id}`} className="verweis">{eltern ? `${typName(eltern)} „${titelOder(b.titel)}“` : titelOder(b.titel)}</Link> })
        : t('ablage.teile.teil-von-verborgen')}</p>
    </div>
  );
}

export function unpassendText(felder: Feld[], keys: string[]): string {
  const namen = keys.map((k) => felder.find((f) => f.key === k)).filter((f): f is Feld => !!f).map((f) => `„${feldLabel(f)}“`);
  return namen.length ? t('felder.verweis.unpassend', { felder: new Intl.ListFormat(gebietsschema(), { type: 'conjunction' }).format(namen) }) : t('felder.verweis.unpassend.regel');
}

/** Mappen, die laut Register hierher verweisen (alle oder nur gewählte Quellen). */
function verknuepfungsGruppen(d: ReturnType<typeof useDaten>, mappe: Mappe | undefined, typId: string, register: Register, details?: MappeDetails | null) {
  const gewaehlt = register.quellen ?? [];
  return d.typen.flatMap((mappentyp) => mappentyp.felder
    .filter((f) => f.typ === 'referenz' && zielErlaubt(f, typId))
    .filter((f) => !gewaehlt.length || gewaehlt.some((q) => q.typId === mappentyp.id && q.feldKey === f.key))
    .map((f) => ({
      t: mappentyp, f,
      // Trefferliste dieser Quelle (#75); fehlt sie (mehr), einfache Liste.
      liste: trefferlistenVon(mappentyp).find((l) => l.key === gewaehlt.find((q) => q.typId === mappentyp.id && q.feldKey === f.key)?.trefferliste),
      treffer: !mappe || !details ? [] as Rueckverweis[] : details.rueckverweise.filter((r) => r.quelleTypId === mappentyp.id && r.feldKey === f.key),
    })));
}

function Formular({ typ, mappe, start, sicht, anhang = '', details, neuLaden, zuordnen, registerWunsch, mitVerknuepften, loeschWunsch = 0, vorschlagStart, kopf, imFenster }: {
  typ: Mappentyp; mappe?: Mappe; start: RohWerte; sicht: string; anhang?: string; details?: MappeDetails | null; neuLaden?: () => Promise<void>; zuordnen?: ZuordnenNachher;
  /** Fenster „+ … anlegen“ (#935): nach dem Speichern die neue Mappe zurückgeben statt die Seite zu wechseln; „Abbrechen“ schließt. */
  imFenster?: { gespeichert(m: Mappe): void; abbrechen(): void };
  /** Seite „Dokument übernehmen“ (#934): Vorschläge aus dem Dokument, eingetragen wie bei „Aus Dokument ausfüllen“. */
  vorschlagStart?: TypVorschlaege;
  /** Kopf über dem Formular mit den aktuellen Werten (neue Mappe auf der Seite „Dokument übernehmen“). */
  kopf?: (werte: Werte, bekannt: Bezuege) => ReactNode;
  /** „Mit verknüpften Mappen löschen …“ (#424) – als weiterer Weg unter „Warum nicht?“ (#423). */
  mitVerknuepften?: () => void;
  /** Register von außen öffnen (#427); `n` zählt, damit derselbe Wunsch erneut wirkt. */
  registerWunsch?: { key: string; n: number };
  /** „Mappe löschen …“ aus dem Menü „Mappe ▾“ (Handy, #489): zählt hoch, jeder neue Wert löscht (mit Rückfrage). */
  loeschWunsch?: number;
}) {
  const d = useDaten();
  const { ich } = useKonto();
  // Register des Typs plus System-Register „Notizen“ vor der Historie (#427).
  const register = mitNotizen(registerVon(typ));
  // Nur lesbar: Systemfelder von Benutzern, Name einer Systemrolle (#26, #27) – und berechnete Felder (#1034): die schreibt
  // nur ihr Paket. So lassen auch „folgt aus“ und „Aus Dokument ausfüllen“ sie aus („nie überschreiben“).
  // Geschützte Felder (#995), z. B. das Merkmal „eigene Organisation“: Der Server sagt je Mappe, was diese Person nicht
  // ändern darf; bei einer neuen Mappe gilt: nur im Verwaltungsmodus mit dem Bereich „Eigene Organisation“.
  const geschuetzt = { ...geschuetzteFelder(typ, mappe), ...berechnetGesperrt(typ), ...schreibschutzGesperrt(typ, mappe ? details?.schreibschutz ?? [] : (ich.rolle === 'admin' && darfBereich(ich, ORGANISATION_BEREICH) ? [] : null)) };
  // Berechtigungen (#126): ohne „Bearbeiten“ nur ansehen; Löschen und Passwörter je nach Recht.
  const rechte = mappe ? details?.rechte : undefined;
  const nurLesen = !!rechte && !rechte.U;
  const darfLoeschenHier = !rechte || rechte.D;
  // „Mappe löschen“ (#423): nie kommentarlos grau – warum nicht, steht auf Klick direkt am Knopf.
  const loeschenZeigen = !!mappe && darfLoeschen(typ, mappe);
  const loeschSperre: Loeschsperre | undefined = !loeschenZeigen ? undefined
    : !darfLoeschenHier ? { grund: t('ablage.mappeformular.mappen-dieses-mappentyps-darfst') }
    : details?.loeschbar?.ok === false ? { grund: details.loeschbar.grund ?? t('ablage.mappeformular.diese-mappe-laesst-sich'), rueckverweise: details.loeschbar.rueckverweise }
    : undefined;
  // Weitere Löschwege trotz Sperre (z. B. „Mit verknüpften Mappen löschen …“, #424) kommen über `wege` dazu.
  // Post auflösen (#936): Vor dem Speichern sagt die Speicherleiste, was mit der Post geschieht.
  const aufloesenHinweis = zuordnen?.aufloesen === true
    ? (d.zaehler.papierkorbTage ? t('ablage.mappeformular.aufloesen-hinweis') : t('ablage.mappeformular.aufloesen-hinweis-ohne-korb'))
    : zuordnen?.aufloesen === false ? t('ablage.mappeformular.aufloesen-gesperrt') : '';
  const loeschKnopf = loeschenZeigen ? <LoeschKnopf sperre={loeschSperre} loeschen={() => void loeschen()}
    wege={mitVerknuepften && <button type="button" className="textknopf gefahr klein" onClick={mitVerknuepften}>{t('ablage.mappeformular.mit-verknuepften-mappen-loeschen')}</button>} /> : <span />;
  // Sprung aus der Suche nach einer Archivnummer (#345): ?register=… öffnet das Register.
  // Erwähnung in einer Notiz (#427): gleich den Register „Notizen“.
  const [aktiv, setAktiv] = useState(() => startRegister(register, new URLSearchParams(location.search).get('register'), details?.aufgaben, ich.id));
  useEffect(() => { if (registerWunsch) setAktiv(registerWunsch.key); }, [registerWunsch]);
  const [basis, setBasis] = useState(() => JSON.stringify(start));
  const basisRoh = useMemo(() => JSON.parse(basis) as RohWerte, [basis]);
  // Gleichzeitig bearbeiten (#609): Stand der Mappe, auf dem `basis` beruht – geht beim Speichern mit.
  const [stand, setStand] = useState(mappe?.geaendert);
  const [konflikt, setKonflikt] = useState<Mappenkonflikt & { wahl: Record<string, 'meins' | 'seins'> }>();
  const [roh, setRoh] = useState<RohWerte>(start);
  const [neueDateien, setNeueDateien] = useState<NeueDatei[]>([]);
  const [entfernt, setEntfernt] = useState<string[]>([]);
  const [fehler, setFehler] = useState<Pruefergebnis | null>(null);
  const [meldung, setMeldung] = useState<string>();
  const [hinweise, setHinweise] = useState<Array<{ art: 'warn' | 'schlecht'; text: ReactNode }>>([]);
  const [sendet, setSendet] = useState(false);
  // „Aus Dokument ausfüllen“ (#391): Vorschläge je Feld – eingetragen (Feld war leer) oder als Alternative.
  const bruecke = useBruecke();
  // Auf der Seite „Dokument übernehmen“ (#934) steht „Aus Dokument ausfüllen“ nicht – das Dokument ist schon da.
  const knopf = nurLesen || bruecke || imFenster ? null : ausDokumentKnopf(typ);
  // Hat die Mappe ein Dokument mit Text, öffnet der Knopf die Seite mit diesem Dokument in der Mitte (#934); sonst der Dialog (Foto, Datei).
  const mitText = mappe ? (details?.dokumente ?? []).filter((x) => x.ocr?.stand === 'fertig') : [];
  const [adOffen, setAdOffen] = useState(false);
  const [vorschlaege, setVorschlaege] = useState<Record<string, FeldVorschlag>>({});
  const [adNeu, setAdNeu] = useState<TypVorschlaege['neu']>({});
  const [adMeldung, setAdMeldung] = useState<string>();
  // Titel und Typ der Mappen, auf die verwiesen wird (vom Server und aus der Auswahl).
  const [bekannt, setBekannt] = useState<Bezuege>(details?.bezuege ?? {});
  useEffect(() => { if (details) setBekannt((b) => ({ ...b, ...details.bezuege })); }, [details]);
  const merke = (id: string, b: { titel: string; typId: string }) => setBekannt((x) => (x[id]?.titel === b.titel ? x : { ...x, [id]: b }));
  // Folgt aus (#886): für Rückfragen nach einer Antwort des Servers immer der aktuelle Stand.
  const rohRef = useRef(roh); rohRef.current = roh;
  const bekanntRef = useRef(bekannt); bekanntRef.current = bekannt;
  /** Felder, die sich aus ihrer Quelle gefüllt haben (#886) – markiert „aus …“, solange der Wert so bleibt. */
  const [gefolgt, setGefolgt] = useState<Record<string, { quelle: string; wert: string }>>({});
  /**
   * Beim Auswählen übernehmen (#1037): Felder, in die eine gewählte Mappe einen Wert vorgeschlagen hat – markiert
   * „vorgeschlagen aus …“, solange der Wert so bleibt. `feld`/`mappe`: woher; `vorher`: der leere Wert davor.
   */
  const [vorbelegt, setVorbelegt] = useState<Record<string, Vorbelegt>>({});
  const vorbelegtRef = useRef(vorbelegt); vorbelegtRef.current = vorbelegt;
  const werteGeaendert = JSON.stringify(roh) !== basis;
  // Hat sich die Mappe anderswo geändert (z. B. „Datum auf … setzen“, #130) und ist hier nichts ungespeichert: übernehmen.
  const startJson = JSON.stringify(start);
  useEffect(() => {
    if (mappe && !werteGeaendert && startJson !== basis) { setBasis(startJson); setRoh(JSON.parse(startJson)); }
    // Mit den Werten auch ihren Stand übernehmen (#609) – solange hier nichts ungespeichert ist.
    if (mappe && !werteGeaendert) setStand(mappe.geaendert);
  }, [startJson, mappe?.geaendert]); // eslint-disable-line react-hooks/exhaustive-deps -- nur übernehmen, wenn sich die gespeicherten Werte ändern (#609)
  const dokumenteGeaendert = neueDateien.length > 0 || entfernt.length > 0;
  const geaendert = werteGeaendert || dokumenteGeaendert || !mappe;
  useUngespeichert(werteGeaendert || dokumenteGeaendert);

  const dokumenteIn = (key: string) => (details?.dokumente ?? []).filter((x) => x.registerKey === key);
  const anzahl = (r: AnsichtsRegister): number | undefined => {
    if (r.art === 'notizen') return mappe ? details?.notizen?.length ?? 0 : undefined;
    if (r.art === 'dokumente') return dokumenteIn(r.key).filter((x) => !entfernt.includes(x.id)).length + neueDateien.filter((n) => n.register === r.key).length;
    if (r.art === 'verknuepfungen') return verknuepfungsGruppen(d, mappe, typ.id, r, details).reduce((a, g) => a + g.treffer.length, 0);
    return undefined;
  };
  const verwerfen = () => {
    setKonflikt(undefined); setRoh(JSON.parse(vorschlagStart && !mappe ? startJson : basis)); setNeueDateien([]); setEntfernt([]); setFehler(null); setMeldung(undefined); setHinweise([]); setVorschlaege({}); setAdNeu({}); setAdMeldung(undefined); setGefolgt({}); setVorbelegt({});
    // Seite „Dokument übernehmen“ (#934): zurück auf die Vorschläge aus dem Dokument.
    if (vorschlagStart) setVorschlagRunde((n) => n + 1);
  };

  const reg = register.find((r) => r.key === aktiv) ?? register[0];
  // Ausgeblendete Felder (#655) zeigt die Mappe nicht; ihre Werte bleiben, wie sie sind.
  const ausgeblendet = useMemo(() => ausgeblendeteFelder(typ), [typ]);
  /*
   * Anzeigen, wenn … (#1033): Was bei den eingegebenen Werten zu sehen ist – sofort beim Ausfüllen, mit derselben
   * Auswertung wie der Server (Pflicht). Ausgeblendete Werte bleiben, wie sie sind; eine ruhige Zeile sagt es, und
   * „anzeigen“ holt Feld oder Abschnitt für diese Mappe zurück (`aufgedeckt`, nur bis zum Verlassen).
   */
  const merkmale = d.zaehler.merkmale;
  const eigene = d.zaehler.eigeneOrganisationen;
  const anz: Anzeigestand = useMemo(() => anzeigeImFormular(typ, roh, { merkmale, eigene, bekannt }), [typ, roh, merkmale, eigene, bekannt]);
  const [aufgedeckt, setAufgedeckt] = useState<Set<string>>(() => new Set());
  const decke = (k: string) => setAufgedeckt((x) => new Set([...x, k]));
  const hatWert = (f: Feld) => mitWert(f, roh);
  const alleAuf = (r: Register) => typ.felder.filter((f) => r.felder?.includes(f.key));
  const felderAuf = (r: Register) => alleAuf(r).filter((f) => !ausgeblendet.has(f.key));
  const fehlerAuf = (r: AnsichtsRegister) => (r.art === 'felder' ? felderAuf(r).filter((f) => fehler?.felder[f.key]).length : 0);

  /*
   * Abschnitte (#890): offen oder eingeklappt. Vorgabe aus dem Mappentyp, gemerkt je Person (persönliche Einstellung je
   * Typ, auf allen Geräten). Ablago klappt selbst auf, wo ein Pflichtfeld leer ist, die Suche oder ein Link auf ein Feld
   * zeigt (beides beim Öffnen) und wo ein Fehler beim Speichern oder ein Vorschlag aus „Aus Dokument ausfüllen“ steckt.
   */
  const gemerkt = (d.einstellungen[abschnittEinstellung(typ.id)] ?? {}) as Record<string, boolean>;
  const abschnittVon = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of registerVon(typ)) {
      if (r.art !== 'felder') continue;
      for (const g of gruppiere(r.abschnitte, alleAuf(r), (f) => !ausgeblendet.has(f.key))) if (g.abschnitt?.titel) for (const f of g.felder) m.set(f.key, abschnittId(r.key, g.abschnitt));
    }
    return m;
  }, [typ, ausgeblendet]); // eslint-disable-line react-hooks/exhaustive-deps -- hängt am Typ und den ausgeblendeten Feldern, Hilfsfunktionen sind fest
  const [jetzt, setJetzt] = useState<Record<string, boolean>>(() => {
    const such = new URLSearchParams(location.search);
    const gesucht = new Set([...such.keys()].map((k) => k.split('.')[0]).concat(such.getAll('feld')));
    const auf: Record<string, boolean> = {};
    for (const f of typ.felder) {
      const id = abschnittVon.get(f.key);
      if (id && ((f.pflicht && f.typ !== 'janein' && istLeer(ausRoh(f, start[f.key]))) || gesucht.has(f.key))) auf[id] = true;
    }
    return auf;
  });
  const oeffneAbschnitte = (keys: string[]) => {
    const ids = keys.map((k) => abschnittVon.get(k)).filter((x): x is string => !!x);
    if (ids.length) setJetzt((x) => ({ ...x, ...Object.fromEntries(ids.map((id) => [id, true])) }));
  };
  const abschnittOffen = (r: Register, a: Abschnitt) => {
    const id = abschnittId(r.key, a);
    return jetzt[id] ?? gemerkt[id] ?? !a.eingeklappt;
  };
  const umschaltenAbschnitt = (r: Register, a: Abschnitt) => {
    const id = abschnittId(r.key, a);
    const offen = !abschnittOffen(r, a);
    setJetzt((x) => ({ ...x, [id]: offen }));
    // Gemerkt wird nur, was von der Vorgabe abweicht; Abschnitte, die es nicht mehr gibt, fallen dabei weg.
    const neu = Object.fromEntries(Object.entries({ ...gemerkt, [id]: offen }).filter(([k, v]) => [...abschnittVon.values()].includes(k) && v !== !alleAbschnitte.get(k)?.eingeklappt));
    d.setzeEinstellung(abschnittEinstellung(typ.id), Object.keys(neu).length ? neu : null);
  };
  const alleAbschnitte = useMemo(() => new Map(registerVon(typ).flatMap((r) => (r.abschnitte ?? []).map((a) => [abschnittId(r.key, a), a] as const))), [typ]);

  /**
   * Werte dieser Mappe, mit denen ein Verweis zusammenpassen muss: die Felder, aus denen der Auswahlfilter Werte nimmt
   * (#173), und die Felder, die aus diesem Verweis folgen (#886).
   */
  const eigeneWerte = (f: Feld): Werte | undefined => {
    const keys = [...new Set([...eigeneFelderIm(f.auswahlFilter), ...folgendeAus(typ, f.key)])];
    if (!keys.length) return undefined;
    const w = werteAusRoh(typ, roh);
    return Object.fromEntries(keys.map((k) => [k, w[k] ?? null]));
  };
  const setze = (k: string, v: Roh) => {
    setRoh((r) => ({ ...r, [k]: v }));
    if (fehler?.felder[k]) setFehler((f) => f && { ...f, felder: Object.fromEntries(Object.entries(f.felder).filter(([x]) => x !== k)) });
    void folge(k, v);
    void vorbelege(k, v);
  };

  /**
   * Beim Auswählen übernehmen (#1037) nach einer Eingabe im Verweisfeld `k` (von Hand, über „folgt aus“ oder die Brücke).
   * Erst fallen die Vorschläge der vorher gewählten Mappe weg, die noch unverändert dastehen – so bleibt kein
   * „Mobilfunk: 3 Monate“ an einem Stromvertrag hängen; selbst getippte Werte bleiben. Dann schlägt die neue Mappe ihre
   * Werte vor: nur in leere, sichtbare, beschreibbare Felder, markiert und änderbar. Die Werte liefert der Server mit den
   * Rechten der Person (nur lesbare Mappen, nie Passwörter, nie berechnete Felder).
   */
  async function vorbelege(k: string, v: Roh) {
    const f = typ.felder.find((x) => x.key === k);
    if (!f || f.typ !== 'referenz' || !f.vorbelegen?.length || nurLesen) return;
    const id = ersteId(ausRoh(f, v));
    vorbelegungAufheben(k, id);
    if (!id || Object.values(vorbelegtRef.current).some((e) => e.feld === k && e.mappe === id)) return;
    const r = await api.vorbelegen(typ.id, k, id).catch(() => null);
    if (r && ersteId(ausRoh(f, rohRef.current[k])) === id) vorbelegungEintragen(f, id, r);
  }
  /** Unveränderte Vorschläge aus dem Verweisfeld `k`, die nicht von der Mappe `id` stammen, wieder leeren (#1037). */
  function vorbelegungAufheben(k: string, id: string) {
    const alt = Object.entries(vorbelegtRef.current).filter(([, e]) => e.feld === k && e.mappe !== id);
    if (!alt.length) return;
    const zurueck = Object.fromEntries(alt.filter(([n, e]) => gleichRoh(rohRef.current[n], e.wert)).map(([n, e]) => [n, e.vorher] as const));
    const vorher = vorbelegtRef.current;
    rohRef.current = { ...rohRef.current, ...zurueck };
    setRoh((x) => ({ ...x, ...Object.fromEntries(Object.entries(zurueck).filter(([n]) => gleichRoh(x[n], vorher[n]?.wert))) }));
    const ohne = Object.fromEntries(Object.entries(vorher).filter(([n]) => !alt.some(([a]) => a === n)));
    vorbelegtRef.current = ohne;
    setVorbelegt(ohne);
  }
  /** Vorschläge der Mappe `id` in leere, sichtbare, beschreibbare Felder eintragen und markieren (#1037). */
  function vorbelegungEintragen(f: Feld, id: string, r: Awaited<ReturnType<typeof api.vorbelegen>>) {
    for (const [b, x] of Object.entries(r.bezuege)) merke(b, x);
    const neu = leereVorschlaege(typ, r.felder, rohRef.current, (n) => geschuetzt[n] === undefined && !ausgeblendet.has(n));
    // Anzeigen, wenn … (#1033): mit den neuen Werten zusammen – „Verlängert sich um“ zeigt sich erst mit „Danach“.
    const mitNeuen: Bezuege = { ...bekanntRef.current, ...r.bezuege, [id]: { titel: r.titel, typId: r.typId } };
    const sicht = anzeigeImFormular(typ, { ...rohRef.current, ...neu }, { merkmale, eigene, bekannt: mitNeuen });
    for (const n of Object.keys(neu)) if (sicht.verborgen.has(n)) delete neu[n];
    if (!Object.keys(neu).length) return;
    const text = t('ablage.vorbelegen.aus', { feld: feldLabel(f), titel: titelOder(r.titel) });
    const marken = Object.fromEntries(Object.entries(neu).map(([n, w]) => [n, { feld: f.key, mappe: id, wert: w, vorher: rohRef.current[n] ?? leerRoh(typ, n), text }] as const));
    rohRef.current = { ...rohRef.current, ...neu };
    setRoh((x) => ({ ...x, ...leereVorschlaege(typ, neu, x, () => true, false) }));
    vorbelegtRef.current = { ...vorbelegtRef.current, ...marken };
    setVorbelegt((x) => ({ ...x, ...marken }));
    oeffneAbschnitte(Object.keys(neu));
  }
  function vorbelegungZuruecknehmen(k: string) {
    const e = vorbelegt[k];
    if (e) setRoh((x) => ({ ...x, [k]: e.vorher }));
    setVorbelegt((x) => Object.fromEntries(Object.entries(x).filter(([y]) => y !== k)));
  }
  // Neue Mappe mit schon gewähltem Verweis (z. B. „+ Neu“ aus der Vertragsart): gleich vorschlagen, einmal beim Öffnen.
  useEffect(() => {
    if (mappe || vorschlagStart || nurLesen) return;
    for (const f of typ.felder) if (f.typ === 'referenz' && f.vorbelegen?.length && ersteId(ausRoh(f, start[f.key]))) void vorbelege(f.key, start[f.key]);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- nur beim Öffnen einer neuen Mappe

  /**
   * Folgt aus (#886) nach einer Eingabe von Hand (Auswahl, Ziehen, Anklicken) – nie beim Öffnen und nie durch
   * Vorschläge. Quelle gewählt: ein leeres Feld, das aus ihr folgt, füllt sich und ist markiert; steht dort etwas
   * anderes, erst nach Rückfrage. Ein solches Feld von Hand geändert und die Quelle passt nicht mehr: Rückfrage, ob die
   * Quelle geleert werden soll – nie still löschen. Hat das Ziel keinen Wert oder darf man es nicht lesen: nichts.
   */
  async function folge(k: string, v: Roh, vonHand = true) {
    const f = typ.felder.find((x) => x.key === k);
    if (!f || f.typ !== 'referenz' || nurLesen) return;
    if (vonHand) setGefolgt((g) => (g[k] ? Object.fromEntries(Object.entries(g).filter(([x]) => x !== k)) : g));
    const id = ersteId(ausRoh(f, v));
    if (!id) return;
    const titel = (x: string) => titelOder(bekanntRef.current[x]?.titel);
    const ziele = typ.felder.filter((x) => x.typ === 'referenz' && x.folgtAus?.feld === k && geschuetzt[x.key] === undefined && !ausgeblendet.has(x.key));
    if (ziele.length) {
      const r = await api.folgen(typ.id, { [k]: id }).catch(() => null);
      if (!r || ersteId(ausRoh(f, rohRef.current[k])) !== id) return;
      for (const z of ziele) {
        const e = r.felder[z.key];
        if (!e?.wert) continue;
        const soll = e.wert;
        merke(soll, { titel: e.titel ?? '', typId: e.typId ?? '' });
        const jetzt = ausRoh(z, rohRef.current[z.key]);
        if (enthaeltId(jetzt, soll)) continue;
        if (!istLeer(jetzt)) {
          const ok = await rueckfrage({
            titel: t('ablage.folgen.aendern-titel', { feld: feldLabel(z) }),
            text: t('ablage.folgen.aendern-text', { quelle: feldLabel(f), quelleTitel: titel(id), titel: titelOder(e.titel), jetzt: titel(ersteId(jetzt)) }),
            ja: t('ablage.folgen.aendern-ja', { feld: feldLabel(z) }), nein: t('ablage.folgen.lassen'),
          });
          if (!ok || ersteId(ausRoh(f, rohRef.current[k])) !== id) continue;
        }
        const neu: Roh = z.mehrfach ? [...new Set([...(Array.isArray(rohRef.current[z.key]) ? rohRef.current[z.key] as string[] : []), soll])] : soll;
        setRoh((x) => ({ ...x, [z.key]: neu }));
        setGefolgt((g) => ({ ...g, [z.key]: { quelle: k, wert: soll } }));
        oeffneAbschnitte([z.key]);
        // Eine Kette (a aus b, b aus c) füllt sich weiter – und schlägt vor, was die gefolgte Mappe mitbringt (#1037).
        void folge(z.key, neu, false);
        void vorbelege(z.key, neu);
      }
    }
    const qf = vonHand && f.folgtAus ? typ.felder.find((x) => x.key === f.folgtAus!.feld && x.typ === 'referenz') : undefined;
    if (!qf || geschuetzt[qf.key] !== undefined) return;
    const qid = ersteId(ausRoh(qf, rohRef.current[qf.key]));
    if (!qid) return;
    const r = await api.folgen(typ.id, { [qf.key]: qid }).catch(() => null);
    const soll = r?.felder[k]?.wert;
    if (!soll || enthaeltId(ausRoh(f, rohRef.current[k]), soll) || ersteId(ausRoh(qf, rohRef.current[qf.key])) !== qid) return;
    const ok = await rueckfrage({
      titel: t('ablage.folgen.leeren-titel', { quelle: feldLabel(qf) }),
      text: t('ablage.folgen.leeren-text', { quelle: feldLabel(qf), quelleTitel: titel(qid), soll: titelOder(r!.felder[k].titel), neu: titel(id) }),
      ja: t('ablage.folgen.leeren-ja', { quelle: feldLabel(qf) }), nein: t('ablage.folgen.behalten'),
    });
    if (ok && ersteId(ausRoh(qf, rohRef.current[qf.key])) === qid) setRoh((x) => ({ ...x, [qf.key]: '' }));
  }

  /** Vorschläge eintragen (#391): leere Felder bekommen den Wert, gefüllte eine Alternative; nichts ist gespeichert. */
  function uebernimmVorschlaege({ r, dateien, ablegen }: AusDokumentErgebnis): RohWerte {
    const neu: Record<string, FeldVorschlag> = {};
    const werte: RohWerte = {};
    for (const [k, v] of Object.entries(r.vorschlaege)) {
      const f = typ.felder.find((x) => x.key === k);
      // Ausgeblendete Felder (#655) bekommen nichts – den Vorschlag sähe niemand.
      if (!f || geschuetzt[k] !== undefined || ausgeblendet.has(k) || v.aus) continue;
      const vorschlag = zuRoh(f, v.wert);
      if (istLeer(ausRoh(f, roh[k]))) { werte[k] = vorschlag; neu[k] = { ...v, art: 'eingetragen', vorher: roh[k] }; }
      else if (JSON.stringify(roh[k]) !== JSON.stringify(vorschlag)) neu[k] = { ...v, art: 'alternative' };
    }
    // Beim Auswählen übernehmen (#1037): Werte aus einer vorgeschlagenen Mappe.
    const vb = vorbelegtAusVorschlaegen(typ, r, roh, werte, (k) => geschuetzt[k] === undefined && !ausgeblendet.has(k));
    Object.assign(werte, vb.werte);
    const marken = vb.marken;
    for (const [id, b] of Object.entries(r.bezuege)) merke(id, b);
    setRoh((x) => ({ ...x, ...werte }));
    setVorschlaege(neu);
    setVorbelegt((x) => ({ ...x, ...marken }));
    // Abschnitte mit Vorschlägen klappen auf (#890).
    oeffneAbschnitte([...Object.keys(neu), ...Object.keys(marken)]);
    setAdNeu(Object.fromEntries(Object.entries(r.neu).filter(([k]) => istLeer(ausRoh(typ.felder.find((x) => x.key === k)!, roh[k])))));
    if (ablegen && dateien.length) setNeueDateien((x) => [...x, ...dateien.map((datei) => ({ uid: `n${++zaehler}`, datei, register: ablegen }))]);
    const n = Object.values(neu).filter((v) => v.art === 'eingetragen').length + Object.keys(marken).length;
    const alt = Object.values(neu).filter((v) => v.art === 'alternative').length;
    const teile = [n ? t('ablage.mappeformular.felder-als-vorschlag-eingetragen', { anzahl: n }) : '', alt ? t('ablage.mappeformular.alternativen-zu-ausgefuellten', { anzahl: alt }) : ''].filter(Boolean);
    // Erkennung per Paket (#511): womit erkannt wurde bzw. warum die eingebaute übernahm.
    // Gekürzt (#564): Der KI-Dienst hat nur einen Teil des Texts gelesen – das sagen, nie still abschneiden.
    const herkunft = [r.engine?.art === 'paket' ? t('erkennung.ergebnis.paket', { name: r.engine.name }) : '', r.gekuerzt ? t('erkennung.ergebnis.gekuerzt') : '', r.hinweis ?? ''].filter(Boolean).join(' ');
    setAdMeldung(`${teile.length ? t('ablage.mappeformular.verstanden-bitte-pruefen-und', { teile: teile.join(', ') }) : t('ablage.mappeformular.gelesen-aber-keine-passenden')}${herkunft ? ` ${herkunft}` : ''}`);
    setAdOffen(false);
    // Zum ersten Feldregister mit einem Vorschlag.
    const ziel = register.find((x) => x.art === 'felder' && felderAuf(x).some((f) => neu[f.key]));
    if (ziel) setAktiv(ziel.key);
    return werte;
  }
  function vorschlagZuruecknehmen(k: string) {
    const v = vorschlaege[k];
    if (v?.art === 'eingetragen') setRoh((x) => ({ ...x, [k]: v.vorher ?? zuRoh(typ.felder.find((f) => f.key === k)!, null) }));
    setVorschlaege((x) => Object.fromEntries(Object.entries(x).filter(([y]) => y !== k)));
  }
  function alternativeUebernehmen(k: string) {
    const v = vorschlaege[k]; const f = typ.felder.find((x) => x.key === k);
    if (!v || !f) return;
    const vorher = roh[k];
    setze(k, zuRoh(f, v.wert));
    setVorschlaege((x) => ({ ...x, [k]: { ...v, art: 'eingetragen', vorher } }));
  }
  // Seite „Dokument übernehmen“ (#934): Vorschläge aus dem Dokument eintragen, sobald sie da sind (und nach „Verwerfen“ wieder).
  const [vorschlagRunde, setVorschlagRunde] = useState(0);
  useEffect(() => {
    if (!vorschlagStart) return;
    const werte = uebernimmVorschlaege({ r: vorschlagStart, dateien: [], ablegen: null });
    // Neue Mappe: Die Vorschläge sind der Ausgangsstand – erst eigene Eingaben sind „ungespeichert“ (Blättern ohne Rückfrage).
    if (!mappe) setBasis(JSON.stringify({ ...roh, ...werte }));
  }, [vorschlagStart, vorschlagRunde]); // eslint-disable-line react-hooks/exhaustive-deps -- Vorschläge nur in einer neuen Runde übernehmen, nicht bei jeder Eingabe
  // Die Brücke setzt Werte vom Dokument und zeigt Felder; über Refs immer mit dem aktuellen Stand.
  const anschluss = useRef({ roh, register, felderAuf, oeffneAbschnitte, geschuetzt, nurLesen, merke, setFehler, folge, vorbelege });
  anschluss.current = { roh, register, felderAuf, oeffneAbschnitte, geschuetzt, nurLesen, merke, setFehler, folge, vorbelege };
  useEffect(() => bruecke?.anschliessen({
    setze(k, wert, bezug) {
      const a = anschluss.current;
      const f = typ.felder.find((x) => x.key === k);
      if (!f || a.nurLesen || a.geschuetzt[k] !== undefined) return;
      if (bezug) a.merke(bezug.id, { titel: bezug.titel, typId: bezug.typId });
      const neu = zuRoh(f, wert);
      const alt = a.roh[k];
      // Mehrfachfelder: dazunehmen statt ersetzen.
      const roh = f.mehrfach && Array.isArray(alt) && Array.isArray(neu) ? [...new Set([...alt as string[], ...neu as string[]])] : neu;
      setRoh((r) => ({ ...r, [k]: roh }));
      a.setFehler((x) => x && x.felder[k] ? { ...x, felder: Object.fromEntries(Object.entries(x.felder).filter(([y]) => y !== k)) } : x);
      // Folgt aus (#886) und beim Auswählen übernehmen (#1037): wie bei einer Eingabe von Hand.
      void a.folge(k, roh);
      void a.vorbelege(k, roh);
    },
    zeige(k) {
      const a = anschluss.current;
      const r = a.register.find((x) => x.art === 'felder' && a.felderAuf(x).some((f) => f.key === k));
      if (r) setAktiv(r.key);
      a.oeffneAbschnitte([k]);
      window.setTimeout(() => document.querySelector(`.spalte.mappe [data-anker="mappe.feld:${k}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 30);
    },
  }), [bruecke?.anschliessen, typ]); // eslint-disable-line react-hooks/exhaustive-deps -- die Brücke liest über anschluss.current immer den aktuellen Stand

  async function neuAnlegen(k: string) {
    const n = adNeu[k]; const f = typ.felder.find((x) => x.key === k); const ziel = d.typ(n?.typId);
    if (!n || !f || !ziel) return;
    const liste = Object.entries(n.werte).map(([key, w]) => `${((f2) => (f2 ? feldLabel(f2) : key))(ziel.felder.find((x) => x.key === key))}: ${w}`).join(' · ');
    if (!(await rueckfrage({ titel: t('ablage.mappeformular.neue-mappe-anlegen', { name: typName(ziel) }), text: t('ablage.mappeformular.mit-diesen-angaben-du', { liste }), ja: t('ablage.mappeformular.anlegen') }))) return;
    try {
      const m = await api.mappeAnlegen({ typId: ziel.id, werte: n.werte });
      merke(m.id, { titel: m.titel ?? '', typId: m.typId });
      const vorher = roh[k];
      setze(k, f.mehrfach ? [m.id] : m.id);
      setVorschlaege((x) => ({ ...x, [k]: { wert: m.id, sicherheit: 'mittel', fundstelle: t('ablage.mappeformular.neu-angelegt', { titelOder: titelOder(m.titel) }), art: 'eingetragen', vorher } }));
      setAdNeu((x) => Object.fromEntries(Object.entries(x).filter(([y]) => y !== k)));
      await d.neuLaden();
    } catch (e) { await hinweis({ titel: t('ablage.mappeformular.nicht-angelegt'), text: (e as Error).message }); }
  }
  /** Hinweis am Feld: Vorschlag (solange der Wert noch so ist) bzw. Alternative aus dem Dokument. */
  function vorschlagAm(f: Feld): ReactNode {
    const v = vorschlaege[f.key];
    if (!v) return null;
    const sicher = v.sicherheit === 'hoch' ? 'sicher' : v.sicherheit === 'mittel' ? 'wahrscheinlich' : 'unsicher';
    if (v.art === 'eingetragen') {
      if (JSON.stringify(roh[f.key]) !== JSON.stringify(zuRoh(f, v.wert))) return null;
      return <p className="ad-hinweis"><span className="chip">{t('ablage.mappeformular.vorschlag')}</span> <span className="leise">{sicher}{v.fundstelle ? <> – „{v.fundstelle}“</> : null}</span> <button type="button" className="textknopf klein" onClick={() => vorschlagZuruecknehmen(f.key)}>{t('ablage.mappeformular.zuruecknehmen')}</button></p>;
    }
    const text = f.typ === 'referenz' ? titelOder(bekannt[String(Array.isArray(v.wert) ? v.wert[0] : v.wert)]?.titel) : formatiere(f, v.wert);
    return <p className="ad-hinweis"><span className="chip">{t('ablage.mappeformular.im-dokument')}</span> <strong>{text}</strong> <span className="leise">({sicher})</span> <button type="button" className="textknopf klein" onClick={() => alternativeUebernehmen(f.key)}>{t('ablage.mappeformular.uebernehmen')}</button> <button type="button" className="textknopf klein" onClick={() => vorschlagZuruecknehmen(f.key)}>{t('ablage.mappeformular.verwerfen')}</button></p>;
  }
  const alternativen = Object.entries(vorschlaege).filter(([, v]) => v.art === 'alternative').map(([k]) => k);
  /** Altes Textfeld nach einem Paket-Update (#534): leer ausgeblendet, sonst mit Hinweis auf die Umwandlung. */
  const altesFeld = (f: Feld) => verweisAusText(typ, f);
  const sichtbar = (f: Feld) => !altesFeldAusblenden(f, mappe?.werte[f.key], altesFeld(f));
  function hinweisAm(f: Feld): ReactNode {
    const v = altesFeld(f);
    const g = gefolgt[f.key];
    const q = g && enthaeltId(ausRoh(f, roh[f.key]), g.wert) ? typ.felder.find((x) => x.key === g.quelle) : undefined;
    // Beim Auswählen übernehmen (#1037): gleiche Kennzeichnung wie im Einrichtungsassistenten, solange der Wert so bleibt.
    const vb = vorbelegt[f.key];
    const vorbelegtHier = vb && JSON.stringify(roh[f.key] ?? null) === JSON.stringify(vb.wert ?? null);
    const zusatz = <>{vorschlagAm(f)}{q && <p className="ad-hinweis folgt"><span className="chip">{t('ablage.folgen.aus', { feld: feldLabel(q) })}</span></p>}
      {vorbelegtHier && !nurLesen && <p className="ad-hinweis vorbelegt"><span className="chip">{vb.text}</span> <Knopf art="link" groesse="klein" onClick={() => vorbelegungZuruecknehmen(f.key)}>{t('ablage.mappeformular.zuruecknehmen')}</Knopf></p>}</>;
    if (!v || istLeer(mappe?.werte[f.key])) return zusatz;
    return <>{zusatz}<small className="hilfe">{t('pakete.formular.alttext', { feld: v.label })}</small></>;
  }

  /** Hinweiszeile (#887): ins Register des Felds, Abschnitt auf, hinrollen und den Fokus aufs Feld. */
  function springeZu(k: string) {
    const r = register.find((x) => x.art === 'felder' && felderAuf(x).some((f) => f.key === k));
    if (r) setAktiv(r.key);
    oeffneAbschnitte([k]);
    window.setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`form.mitregistern [data-anker="mappe.feld:${k}"]`);
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el?.querySelector<HTMLElement>('input, select, textarea, button, a')?.focus({ preventScroll: true });
    }, 40);
  }

  function zeigeFehler(p: Pruefergebnis) {
    setFehler(p);
    oeffneAbschnitte(Object.keys(p.felder));
    // Zum ersten Register mit Fehler springen, falls das aktuelle keinen hat.
    if (reg?.art === 'felder' && felderAuf(reg).some((f) => p.felder[f.key])) return;
    const ziel = register.find((r) => r.art === 'felder' && felderAuf(r).some((f) => p.felder[f.key]));
    if (ziel) setAktiv(ziel.key);
  }

  /**
   * Speichern. Gleichzeitig bearbeiten (#609): An den Server gehen nur die Felder, die hier geändert wurden,
   * dazu der Stand, auf dem sie beruhen. Hat jemand anderes dasselbe Feld inzwischen geändert, antwortet er
   * mit 409 – dann fragt das Formular je Feld (`konflikt`). `nochmal`: nach der Antwort, mit dem neuen Stand;
   * Felder in `seins` bleiben, wie sie auf dem Server stehen.
   */
  async function speichern(nochmal?: { stand: string; seins: Record<string, Roh> }) {
    setMeldung(undefined);
    setKonflikt(undefined);
    const rohJetzt: RohWerte = nochmal ? { ...roh, ...nochmal.seins } : roh;
    if (nochmal) setRoh(rohJetzt);
    const werte = werteAusRoh(typ, rohJetzt);
    const geaenderteFelder = typ.felder.map((f) => f.key).filter((k) => JSON.stringify(rohJetzt[k] ?? null) !== JSON.stringify(basisRoh[k] ?? null) && !(nochmal && k in nochmal.seins));
    const zuSenden = Object.fromEntries(geaenderteFelder.map((k) => [k, werte[k] ?? null]));
    const p = d.pruefe(typ, werte, (id) => bekannt[id]?.typId);
    // Formate und Datumsgrenzen (#535): neue Mappe ganz, sonst nur, was sich ändert.
    for (const [k, m] of Object.entries(pruefeFormate(typ, werte, mappe?.werte))) p.felder[k] ??= m;
    // Ausgeblendete Felder (#655): Was dort unverändert steht, hält das Speichern nicht auf (wie auf dem Server).
    // Genauso, was eine Anzeige-Bedingung gerade ausblendet (#1033).
    const verborgen = anzeigestand(typ, werte, { merkmale, typVon: (id) => bekannt[id]?.typId, eigeneOrganisation: (id) => !!eigene?.includes(id) }).verborgen;
    for (const k of Object.keys(p.felder)) if ((ausgeblendet.has(k) || verborgen.has(k)) && !geaenderteFelder.includes(k)) delete p.felder[k];
    if (!istOk(p)) { zeigeFehler(p); setMeldung(t('ablage.mappeformular.bitte-die-markierten-felder')); return; }
    // Würde man sich mit diesen Werten selbst das Lesen oder Bearbeiten entziehen? Dann erst fragen (#126).
    if (mappe && werteGeaendert && ich.rolle !== 'admin') {
      const r = await api.rechteVorschau(mappe.id, werte).catch(() => null);
      if (r && !r.R && !(await rueckfrage({ titel: t('ablage.mappeformular.trotzdem-speichern'), text: t('ablage.mappeformular.nach-dem-speichern-kannst'), ja: t('ablage.mappeformular.trotzdem-speichern-2'), gefahr: true }))) return;
      if (r && r.R && !r.U && !(await rueckfrage({ titel: t('ablage.mappeformular.trotzdem-speichern'), text: t('ablage.mappeformular.nach-dem-speichern-kannst-2'), ja: t('ablage.mappeformular.trotzdem-speichern-2'), gefahr: true }))) return;
    }
    setSendet(true); setHinweise([]);
    let gespeichert: (Mappe & { hinweis?: string }) | undefined = mappe;
    try {
      // Berechnete Felder (#1034) schickt die Oberfläche nie – auch nicht leer oder mit einem Standardwert.
      if (!mappe) gespeichert = await api.mappeAnlegen({ typId: typ.id, werte: Object.fromEntries(Object.entries(werte).filter(([k]) => !typ.felder.find((f) => f.key === k)?.berechnetVon)) });
      else if (geaenderteFelder.length) gespeichert = await api.mappeAendern(mappe.id, { werte: zuSenden, stand: nochmal?.stand ?? stand });
      setFehler(null); setBasis(JSON.stringify(rohJetzt));
      if (gespeichert) setStand(gespeichert.geaendert);
    } catch (e) {
      const f = e as ApiFehler;
      const k = f.status === 409 ? f.details as Mappenkonflikt | undefined : undefined;
      if (k && Array.isArray(k.konflikte) && k.konflikte.length) {
        setKonflikt({ ...k, wahl: {} });
        setMeldung(t('mappen.konflikt.status'));
        window.setTimeout(() => document.querySelector('.mappenkonflikt')?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 50);
      } else {
        if (f.pruefung) zeigeFehler(f.pruefung);
        setMeldung(f.message);
      }
      setSendet(false);
      return;
    }
    // Dokumente erst jetzt: hochladen, was neu ist, und entfernen, was markiert ist.
    const neu: typeof hinweise = [];
    const offen: NeueDatei[] = [];
    for (const n of neueDateien) {
      try {
        // Gleicher Name (#194): Standard mit Versionierung „neue Version“, sonst „mit Zähler“.
        const gleich = (details?.dokumente ?? []).some((x) => x.registerKey === n.register && !entfernt.includes(x.id) && x.name.toLowerCase() === n.datei.name.toLowerCase());
        const versioniert = !!typ.register.find((r) => r.key === n.register)?.versionierung;
        const r = await api.ladeHoch(gespeichert!.id, n.register, n.datei, gleich ? n.gleicherName ?? (versioniert ? 'version' : 'zaehler') : undefined);
        const anderswo = r.gleicherInhalt.filter((g) => g.mappeId !== gespeichert!.id);
        if (anderswo.length) neu.push({ art: 'warn', text: <>{t('ablage.mappeformular.hat-denselben-inhalt-wie', { name: n.datei.name })}{' '}{anderswo.map((g, j) => { return <span key={j}>{tn('ablage.mappeformular.in', { wert: j > 0 && ', ', name: g.name, wert2: g.typId ? <Link to={`/ablage/${g.typId}/${g.mappeId}`} className="verweis">{titelOder(g.titel)}</Link> : t('ablage.mappeformular.einer-anderen-mappe') })}</span>; })}{t('ablage.mappeformular.gespeichert-ist-die-datei')}</> });
      } catch (e) {
        offen.push(n);
        neu.push({ art: 'schlecht', text: t('ablage.mappeformular.wurde-nicht-hochgeladen', { name: n.datei.name, message: (e as Error).message }) });
      }
    }
    // Zuordnen (#192): Die Post gehört jetzt zu dieser neuen Mappe – bzw. wird zu ihr (#936, aufgelöst).
    let aufgeloest = false;
    if (!mappe && zuordnen) {
      try {
        const r = await api.zuordnen(zuordnen.post, { ziel: gespeichert!.id, register: zuordnen.register, dokumente: zuordnen.dokumente, kopieren: zuordnen.kopieren, aufloesen: zuordnen.aufloesen === true });
        aufgeloest = r.aufgeloest;
        if (r.hinweis) await hinweis({ titel: t('ablage.mappeformular.post-bleibt-zugeordnet'), text: r.hinweis });
      } catch (e) { await hinweis({ titel: t('ablage.mappeformular.post-nicht-zugeordnet'), text: t('ablage.mappeformular.die-mappe-ist-angelegt', { message: (e as Error).message }) }); }
    }
    const nichtEntfernt: string[] = [];
    for (const id of entfernt) {
      try { await api.dokumentLoeschen(id); } catch (e) { nichtEntfernt.push(id); neu.push({ art: 'schlecht', text: (e as Error).message }); }
    }
    setNeueDateien(offen); setEntfernt(nichtEntfernt); setHinweise(neu);
    setVorschlaege({}); setAdNeu({}); setAdMeldung(undefined); setGefolgt({}); setVorbelegt({});
    // Fenster „+ … anlegen“ (#935): die neue Mappe geht ans Verweisfeld; die Mappe dahinter bleibt, wie sie ist.
    if (imFenster && gespeichert) { await d.neuLaden(); setSendet(false); imFenster.gespeichert(gespeichert); return; }
    if (!offen.length && !nichtEntfernt.length) loeseWache();
    // Lesen verloren (#126): zurück zur Liste, mit Hinweis.
    const verloren = gespeichert?.hinweis?.includes('nicht mehr sehen');
    if (verloren) { loeseWache(); await hinweis({ titel: t('ablage.mappeformular.gespeichert'), text: gespeichert!.hinweis }); await d.neuLaden(); geheZu(`/ablage/${sicht}${anhang}`); return; }
    await d.neuLaden();
    await neuLaden?.();
    setSendet(false);
    // Aufgelöst (#936): weiter mit der nächsten Post aus „Neue Post“; oben steht, was angelegt wurde.
    const naechste = aufgeloest ? await naechstePost(d.zaehler.neuePost) : undefined;
    if (naechste && d.zaehler.neuePost) {
      merkeAufloesung({ fuer: naechste.id, id: gespeichert!.id, typId: typ.id, titel: gespeichert!.titel ?? '' });
      geheZu(`/ablage/${d.zaehler.neuePost}/${naechste.id}/uebernehmen`);
    } else if (!mappe) geheZu(`/ablage/${sicht}/${gespeichert!.id}`);
    else setMeldung(gespeichert?.hinweis ?? (offen.length || nichtEntfernt.length ? t('ablage.mappeformular.teilweise-gespeichert') : t('ablage.mappeformular.gespeichert-2')));
  }

  /** Rückfrage beantwortet (#609): „meins“ geht mit dem neuen Stand noch einmal mit, „seins“ wird übernommen. */
  function konfliktEntscheiden() {
    if (!konflikt) return;
    const seins: Record<string, Roh> = {};
    for (const k of konflikt.konflikte) {
      if (konflikt.wahl[k.feld] !== 'seins') continue;
      const f = typ.felder.find((x) => x.key === k.feld);
      if (f) seins[k.feld] = k.geheim ? basisRoh[k.feld] ?? zuRoh(f, null) : zuRoh(f, k.wert ?? null);
    }
    void speichern({ stand: konflikt.stand, seins });
  }

  async function loeschen() {
    if (!mappe) return;
    const n = details?.dokumente.length ?? 0;
    const korb = d.zaehler.papierkorbTage ?? 0;
    // Teile (#1031) gehen mit – das steht vorher da.
    const teile = details?.loeschbar?.teile ?? 0;
    const mit = (x: string) => (teile ? `${t(korb ? 'ablage.teile.kommen-mit' : 'ablage.teile.werden-mitgeloescht', { anzahl: teile })}${x}` : x);
    // Grund fürs Löschprotokoll (#470).
    const anlass = await mitGrund(korb
      ? { titel: t('ablage.mappeformular.mappe-in-den-papierkorb', { titelOder: titelOder(mappe.titel) }), text: t('ablage.mappeformular.dort-laesst-sie-sich', { anzahl: korb, wert: mit(n ? t('ablage.mappeformular.ihre-dokumente-kommen-mit', { anzahl: n }) : '') }), ja: t('ablage.mappeformular.in-den-papierkorb'), gefahr: true }
      : { titel: t('ablage.mappeformular.mappe-endgueltig-loeschen', { titelOder: titelOder(mappe.titel) }), text: t('ablage.mappeformular.das-laesst-sich-nicht', { wert: mit(n ? t('ablage.mappeformular.ihre-dokumente-werden-mitgeloescht', { anzahl: n }) : '') }), ja: t('ablage.mappeformular.endgueltig-loeschen'), gefahr: true });
    if (!anlass) return;
    try {
      await api.mappeLoeschen(mappe.id, anlass);
      loeseWache(); await d.neuLaden(); geheZu(`/ablage/${sicht}${anhang}`);
    } catch (e) { setMeldung((e as Error).message); }
  }

  const loeschenRef = useRef({ loeschen, loeschSperre });
  loeschenRef.current = { loeschen, loeschSperre };
  const ersterLoeschWunsch = useRef(loeschWunsch);
  useEffect(() => {
    if (loeschWunsch === ersterLoeschWunsch.current) return;
    const { loeschen: tu, loeschSperre: sperre } = loeschenRef.current;
    if (sperre) void hinweis({ titel: t('ablage.mappeformular.loeschen-nicht-moeglich'), text: sperre.grund });
    else void tu();
  }, [loeschWunsch]);

  let inhalt: ReactNode = null;
  if (!reg) inhalt = <p className="leise">{t('ablage.mappeformular.dieser-mappentyp-hat-keine')}</p>;
  else if (reg.art === 'felder') {
    const r = reg;
    const anzeigeNamen = { typ: typNameAus(d.typen), mappe: (id: string) => titelOder(bekannt[id]?.titel) };
    const nurBei = (r2: Parameters<typeof beschreibeAnzeige>[0]) => beschreibeAnzeige(r2, typ, anzeigeNamen);
    // Ausgeblendetes Feld mit Wert (#1033): ruhige Zeile statt der Eingabe; aufgedeckt mit dem Satz „nur bei …“.
    // Tabelle (#1030): verweisende Mappen zwischen den Feldern – kein Wert, keine Eingabe; „+ Neu“ im Fenster (#935).
    // Steht die Tabelle gleich unter einer gleichlautenden Abschnittsüberschrift („Positionen“), genügt die eine.
    const tabelle = (f: Feld, ueber?: string) => <Tabellenfeld key={f.key} feld={f} mappe={mappe} nurLesen={nurLesen || !!imFenster} ohneUeberschrift={!!ueber && ueber === feldLabel(f)}
      neuesFormular={(ziel, v, fertig) => <Formular typ={ziel} start={startMitVerweis(ziel, v)} sicht={ziel.id} kopf={(w, b) => <FensterKopf typ={ziel} werte={w} bekannt={b} />} imFenster={fertig} />} />;
    const eingabe = (f: Feld, ueber?: string) => (f.typ === 'tabelle' && !(anz.felder.has(f.key) && !aufgedeckt.has(`f:${f.key}`)) ? tabelle(f, ueber) : anz.felder.has(f.key) && !aufgedeckt.has(`f:${f.key}`)
      ? <AusgeblendetZeile key={f.key} text={t('ablage.anzeige.feld', { feld: feldLabel(f) })} anzeigen={() => decke(`f:${f.key}`)} />
      : feldEingabe(f, anz.felder.has(f.key) ? <p className="anzeigehinweis leise klein"><Symbol name="auge-aus" /> {t('ablage.anzeige.gerade-aus', { bedingung: nurBei(f.anzeigen) })}</p> : undefined));
    const feldEingabe = (f: Feld, anzeige?: ReactNode) => <FeldEingabe key={f.key} feld={f} roh={roh[f.key]} fehler={fehler?.felder[f.key]?.[0]} setze={(v) => setze(f.key, v)} eigeneId={mappe?.id} bekannt={bekannt} merke={merke}
      typId={typ.id} typFelder={typ.felder} unpassend={details?.unpassend?.[f.key]} gruende={grundAus(details?.konflikte, f.key)} eigene={eigeneWerte(f)}
      neu={f.typ === 'referenz' && zielErlaubt(f, adNeu[f.key]?.typId) ? adNeu[f.key].werte : undefined}
      gesperrt={geschuetzt[f.key] ?? (nurLesen && f.typ !== 'passwort' ? '' : undefined)} nurLesen={nurLesen} plzDeutsch={f.format === 'plz' ? deutschePlz(f, typ.felder, roh as Werte) : undefined} passwortSehen={!rechte || rechte.P} zusatz={anzeige ? <>{anzeige}{hinweisAm(f)}</> : hinweisAm(f)} gespeichert={mappe ? mappe.werte[f.key] : undefined} />;
    // Abschnitte (#890): jede Gruppe ein eigenes Raster – so beginnt nach jedem Abschnitt eine neue Zeile.
    // Anzeige-Bedingungen (#1033): Felder ausgeblendeter Abschnitte bleiben in der Gruppe (für die ruhige Zeile);
    // ein selbst ausgeblendetes Feld nur, wenn es einen Wert hat.
    const gruppen = gruppiere(r.abschnitte, alleAuf(r), (f) => !ausgeblendet.has(f.key) && sichtbar(f) && (!anz.felder.has(f.key) || hatWert(f) || aufgedeckt.has(`f:${f.key}`)));
    const abschnittAus = (a: Abschnitt) => anz.abschnitte.some((x) => x.register === r.key && x.abschnitt.vor === a.vor) && !aufgedeckt.has(`a:${r.key}.${a.vor}`);
    const abschnittAufgedeckt = (a: Abschnitt) => anz.abschnitte.some((x) => x.register === r.key && x.abschnitt.vor === a.vor) && aufgedeckt.has(`a:${r.key}.${a.vor}`);
    const sichtbareGruppen = gruppen.filter((g) => !g.abschnitt || !abschnittAus(g.abschnitt) || g.felder.some(hatWert));
    inhalt = sichtbareGruppen.length
      ? <div className="feldgruppen">{sichtbareGruppen.map((g) => {
          const a = g.abschnitt;
          // Abschnitt ausgeblendet, aber mit Werten: eine ruhige Zeile an seiner Stelle – nichts verschwindet heimlich.
          if (a && abschnittAus(a)) {
            const n = anzahlWerte(typ, g.felder.map((f) => f.key), roh);
            return <AusgeblendetZeile key={a.vor} text={t('ablage.anzeige.abschnitt', { name: abschnittName(a, typ), anzahl: n })} anzeigen={() => decke(`a:${r.key}.${a.vor}`)} />;
          }
          const gerade = a && abschnittAufgedeckt(a) ? <p className="anzeigehinweis leise klein"><Symbol name="auge-aus" /> {t('ablage.anzeige.gerade-aus', { bedingung: nurBei(a.anzeigen) })}</p> : null;
          if (!a?.titel) return <div key={a?.vor ?? '_'} className={`formular${a ? ' nach-umbruch' : ''}`}>{gerade}{g.felder.map((f) => eingabe(f))}</div>;
          const offen = abschnittOffen(r, a);
          const id = `abschnitt-${r.key}-${a.vor}`;
          // Tabellen (#1030) haben keinen Wert und zählen nicht mit.
          const mitWerten = wertfelder(g.felder);
          const gefuellt = mitWerten.filter((f) => !istLeer(ausRoh(f, roh[f.key]))).length;
          const mitFehler = g.felder.filter((f) => fehler?.felder[f.key]).length;
          return (
            <section key={a.vor} className={`feldabschnitt${offen ? ' offen' : ''}`} aria-labelledby={`${id}-kopf`}>
              <h3 className="abschnittkopf">
                <button type="button" id={`${id}-kopf`} aria-expanded={offen} aria-controls={id} onClick={() => umschaltenAbschnitt(r, a)}>
                  <Symbol name="pfeil-rechts" />
                  <span className="abschnitttitel">{abschnittTitel(a)}</span>
                  {!offen && mitWerten.length > 0 && <span className="leise klein"><span aria-hidden="true">· </span>{t('ablage.abschnitt.ausgefuellt', { gefuellt, anzahl: mitWerten.length })}</span>}
                  {mitFehler > 0 && <span className="fehlerpunkt" title={t('ablage.mappeformular.felder-mit-fehler', { anzahl: mitFehler })}>{mitFehler}</span>}
                </button>
              </h3>
              <div id={id} className="formular" hidden={!offen}>{gerade}{g.felder.map((f, i) => eingabe(f, i === 0 ? abschnittTitel(a) : undefined))}</div>
            </section>
          );
        })}</div>
      : <p className="leise">{t('ablage.mappeformular.auf-diesem-register-liegen')}</p>;
  } else if (reg.art === 'dokumente') {
    inhalt = mappe && !details ? <p className="leise">{t('ablage.mappeformular.lade')}</p> : (
      <Dokumente key={reg.key} register={reg} dokumente={dokumenteIn(reg.key)} neue={neueDateien.filter((n) => n.register === reg.key)} entfernt={entfernt}
        hinzufuegen={(dateien) => setNeueDateien((x) => [...x, ...dateien.map((datei) => ({ uid: `n${++zaehler}`, datei, register: reg.key }))])}
        entferne={(id) => setEntfernt((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]))}
        entferneMehrere={(ids) => setEntfernt((x) => [...x, ...ids.filter((id) => !x.includes(id))])}
        vergiss={(uid) => setNeueDateien((x) => x.filter((n) => n.uid !== uid))} nurLesen={nurLesen}
        setzeNeue={(uid, patch) => setNeueDateien((x) => x.map((n) => (n.uid === uid ? { ...n, ...patch } : n)))}
        neuLaden={mappe ? async () => { await neuLaden?.(); await d.neuLaden(); } : undefined} post={typ.system === 'post'} typ={typ} mappeTitel={mappe?.titel ?? ''}
        mitnehmen={details?.exportierbar !== false} />
    );
    // Ähnliche Dokumente (#442): nur mit einem Paket mit dms:vektoren und wenn hier Dokumente liegen.
    if (mappe && details && dokumenteIn(reg.key).length > 0) inhalt = <>{inhalt}<AehnlicheDokumente mappeId={mappe.id} /></>;
  } else if (reg.art === 'notizen') {
    inhalt = !mappe ? <p className="leise">{t('ablage.mappeformular.notizen-gehen-nach-dem')}</p>
      : !details ? <p className="leise">{t('ablage.mappeformular.lade')}</p>
      : <Notizen mappeId={mappe.id} notizen={details.notizen ?? []} neuLaden={async () => { await neuLaden?.(); }} />;
  } else if (reg.art === 'protokoll') {
    inhalt = mappe ? <Historie key={reg.key} mappeId={mappe.id} stand={mappe.geaendert} typ={typ} register={reg} /> : <p className="leise">{t('ablage.mappeformular.die-historie-beginnt-mit')}</p>;
  } else if (!mappe) {
    inhalt = <p className="leise">{t('ablage.mappeformular.verknuepfungen-entstehen-sobald')}</p>;
  } else if (!details) {
    inhalt = <p className="leise">{t('ablage.mappeformular.lade')}</p>;
  } else {
    inhalt = <Verknuepfungen mappe={mappe} gruppen={verknuepfungsGruppen(d, mappe, typ.id, reg, details)} />;
  }

  return (
    <>
    {kopf?.(werteAusRoh(typ, roh), bekannt)}
    {knopf && (adOffen
      ? <AusDokument typ={typ} titel={knopf} mappeId={mappe?.id} dokumente={(details?.dokumente ?? []).filter((x) => x.ocr?.stand === 'fertig')} fertig={uebernimmVorschlaege} schliessen={() => setAdOffen(false)} />
      : <div className="ad-leiste"><button type="button" className="knopf klein" onClick={() => (mappe && mitText.length ? geheZu(`/ablage/${sicht}/${mappe.id}/uebernehmen`) : setAdOffen(true))}><Symbol name="kamera" /> {knopf}</button>
          {mappe && mitText.length > 0 && <button type="button" className="textknopf klein" onClick={() => setAdOffen(true)}>{t('ablage.uebernehmen.foto-oder-datei')}</button>}</div>)}
    {(adMeldung || Object.keys(adNeu).length > 0) && (
      <div className="hinweis info ad-ergebnis" role="status">
        {adMeldung && <p>{adMeldung}</p>}
        {Object.entries(adNeu).map(([k, n]) => {
          const f = typ.felder.find((x) => x.key === k); const ziel = d.typ(n.typId);
          return f && ziel ? <p key={k}>{t('ablage.mappeformular.fuer-gibt-es-noch', { label: feldLabel(f), values: Object.values(n.werte).slice(0, 3).join(', ') })}{' '}{darfErstellen(ziel) && <button type="button" className="textknopf" onClick={() => void neuAnlegen(k)}>{t('ablage.mappeformular.mit-diesen-angaben-anlegen', { name: ziel.name })}</button>}</p> : null;
        })}
        {(alternativen.length > 0 || Object.keys(vorschlaege).length > 0) && <div className="knoepfe">
          {alternativen.length > 0 && <button type="button" className="knopf klein" onClick={() => alternativen.forEach(alternativeUebernehmen)}>{t('ablage.mappeformular.alle-alternativen-uebernehmen')}</button>}
          <button type="button" className="textknopf klein" onClick={() => { Object.keys(vorschlaege).forEach(vorschlagZuruecknehmen); setAdMeldung(undefined); setAdNeu({}); }}>{t('ablage.mappeformular.alle-vorschlaege-zuruecknehmen')}</button>
        </div>}
      </div>
    )}
    <form className="blatt mitregistern" onSubmit={(e) => { e.preventDefault(); void speichern(); }} noValidate>
      {mappe && !nurLesen && <KonfliktZeile konflikte={(details?.konflikte ?? []).filter((k) => JSON.stringify(roh[k.feld] ?? null) === JSON.stringify(basisRoh[k.feld] ?? null))} felder={typ.felder} zeige={springeZu} />}
      {mappe && <PaketHinweisZeile hinweise={details?.hinweise ?? []} />}
      {mappe && details?.vorgabe && <VorgabeZeile paketName={details.vorgabe.paketName} />}
      <RegisterReihe aktiv={reg?.key}>
        {register.map((r) => {
          const n = fehlerAuf(r);
          const zahl = anzahl(r);
          return (
            <button key={r.key} type="button" role="tab" data-anker={`mappe.register:${r.key}`} aria-selected={r.key === reg?.key} className={`registertab art-${r.art} ${r.key === reg?.key ? 'an' : ''}`}
              onClick={() => setAktiv(r.key)}>
              {registerName(r)}
              {n > 0 && <span className="fehlerpunkt" title={t('ablage.mappeformular.felder-mit-fehler', { anzahl: n })}>{n}</span>}
              {zahl !== undefined && <span className="anzahl">{zahl}</span>}
            </button>
          );
        })}
      </RegisterReihe>
      {fehler?.allgemein.length ? <div className="hinweis schlecht"><p>{fehler.allgemein.join(' ')}</p></div> : null}
      {hinweise.map((h, i) => <div key={i} className={`hinweis ${h.art}`}><p>{h.text}</p></div>)}
      <div className="registerinhalt" role="tabpanel">{inhalt}</div>
      {konflikt && <Konfliktfrage konflikt={konflikt} ich={ich.id} sendet={sendet}
        waehle={(feld, w) => setKonflikt((k) => k && { ...k, wahl: { ...k.wahl, [feld]: w } })}
        speichern={konfliktEntscheiden} abbrechen={() => { setKonflikt(undefined); setMeldung(undefined); }} />}
      {nurLesen ? <div className="speicherleiste">
        <span className="hy-nur-breit">{loeschKnopf}</span>
        <span className="status" role="status">{meldung ?? t('ablage.mappeformular.nur-lesen-bearbeiten-darfst')}</span>
        <span />
      </div> : <div className={`speicherleiste${mappe && !werteGeaendert && !dokumenteGeaendert && !sendet && !meldung ? ' hy-ruhig' : ''}`}>
        <span className="hy-nur-breit">{loeschKnopf}</span>
        <span className={`status ${meldung && fehler ? 'schlecht' : ''}`} role="status">{sendet ? t('ablage.mappeformular.speichere') : meldung ?? (mappe && (werteGeaendert || dokumenteGeaendert) ? t('ablage.mappeformular.ungespeicherte-aenderungen') : !mappe ? aufloesenHinweis : '')}</span>
        <div className="knoepfe">
          {mappe
            ? <button type="button" className="knopf" disabled={!(werteGeaendert || dokumenteGeaendert) || sendet} onClick={verwerfen}><span className="hy-nur-breit">{t('ablage.mappeformular.aenderungen-verwerfen')}</span><span className="hy-nur-schmal">{t('ablage.mappeformular.verwerfen')}</span></button>
            : imFenster ? <button type="button" className="knopf" disabled={sendet} onClick={imFenster.abbrechen}>{t('ablage.mappeformular.abbrechen')}</button>
            : kopf ? <button type="button" className="knopf" disabled={sendet} onClick={verwerfen}><span className="hy-nur-breit">{t('ablage.mappeformular.aenderungen-verwerfen')}</span><span className="hy-nur-schmal">{t('ablage.mappeformular.verwerfen')}</span></button>
            : <Link to={`/ablage/${sicht}`} className="knopf">{t('ablage.mappeformular.abbrechen')}</Link>}
          <button type="submit" className="knopf gruen" disabled={sendet}>{sendet ? t('ablage.mappeformular.speichere') : <><span className="hy-nur-breit">{t('ablage.mappeformular.mappe-speichern')}</span><span className="hy-nur-schmal">{t('ablage.mappeformular.speichern')}</span></>}</button>
        </div>
      </div>}
    </form>
    </>
  );
}

/** Gründe je unpassender Mappe aus den Konflikten der gespeicherten Mappe (#887). */
const grundAus = (k: Verweiskonflikt[] | undefined, feld: string): Record<string, string[]> | undefined => {
  const x = k?.find((y) => y.feld === feld);
  return x ? Object.fromEntries(x.ids.map((id) => [id, x.eigeneFelder])) : undefined;
};

/**
 * Ruhige Zeile (#1033, Hinweis Qualität): Ein Feld oder Abschnitt ist gerade ausgeblendet, hat aber Werte – „Abschnitt
 * Miete ist ausgeblendet – 3 Werte bleiben gespeichert · anzeigen“. So glaubt niemand, die Werte seien weg.
 */
function AusgeblendetZeile({ text, anzeigen }: { text: string; anzeigen(): void }) {
  return (
    <p className="ausgeblendetzeile leise klein" data-anker="mappe.ausgeblendet">
      <Symbol name="auge-aus" /><span>{text}</span><span aria-hidden="true">·</span>
      <Knopf art="link" groesse="klein" onClick={anzeigen}>{t('ablage.anzeige.anzeigen')}</Knopf>
    </p>
  );
}

/**
 * Hinweiszeile über den Registern (#887): Verweise, die nicht zu anderen Angaben der Mappe passen – gelb, ein Hinweis
 * und kein Fehler; ein Klick springt zum Feld. Nur für Personen, die die Mappe bearbeiten dürfen; sie verschwindet,
 * sobald es passt (nach dem Speichern) oder solange man das Feld gerade ändert.
 */
function KonfliktZeile({ konflikte, felder, zeige }: { konflikte: Verweiskonflikt[]; felder: Feld[]; zeige(k: string): void }) {
  if (!konflikte.length) return null;
  const knopf = (k: Verweiskonflikt) => {
    const f = felder.find((x) => x.key === k.feld);
    return <button type="button" className="textknopf" onClick={() => zeige(k.feld)}>{t('ablage.konflikt.zeile', { feld: f ? feldLabel(f) : k.feld, grund: unpassendText(felder, k.eigeneFelder) })}</button>;
  };
  return (
    <div className="hinweis warn konfliktzeile" role="group" aria-label={t('ablage.konflikt.titel')} data-anker="mappe.konflikte">
      <Symbol name="warnung" />
      {konflikte.length === 1 ? <p>{knopf(konflikte[0])}</p> : <ul>{konflikte.map((k) => <li key={k.feld}>{knopf(k)}</li>)}</ul>}
    </div>
  );
}

/**
 * Hinweise von Paketen (#1034) in der Hinweiszeile über den Registern – für alle, die die Mappe lesen. Ruhig (gelb,
 * Hinweis Qualität), nie rot; vor jedem Hinweis steht das Paket als Marke mit Symbol, damit er nie wie eine Meldung von
 * Ablago selbst aussieht (Ergänzung Sicherheit). Nur Text – der Server lässt nichts anderes zu, und hier wird nichts
 * als HTML, Markdown oder Link gedeutet. Speichern hindern sie nie.
 */
function PaketHinweisZeile({ hinweise }: { hinweise: PaketHinweis[] }) {
  if (!hinweise.length) return null;
  const eintrag = (h: PaketHinweis) => (
    <><span className="paketmarke" title={t('ablage.paket-hinweis.marke-titel', { paket: h.paketName })}><Symbol name="paket" />{h.paketName}</span> <span className="pakettext">{h.text}</span></>
  );
  return (
    <div className="hinweis warn konfliktzeile pakethinweise" role="group" aria-label={t('ablage.paket-hinweis.titel')} data-anker="mappe.pakethinweise">
      {hinweise.length === 1 ? <p>{eintrag(hinweise[0])}</p> : <ul>{hinweise.map((h) => <li key={`${h.paket}|${h.schluessel}`}>{eintrag(h)}</li>)}</ul>}
    </div>
  );
}

/**
 * Vorgabe aus einem Paket (#1038): dieselbe Kennzeichnung „Paket …“ wie bei Hinweisen und Beispielen – ruhig, ohne Warnfarbe.
 * Die Mappe ist eine gewöhnliche Mappe; die Zeile sagt nur, woher sie kommt.
 */
function VorgabeZeile({ paketName }: { paketName: string }) {
  return (
    <p className="leise klein" data-anker="mappe.vorgabe">
      {t('ablage.vorgabe.zeile')} <span className="paketmarke" title={t('ablage.vorgabe.marke-titel', { paket: paketName })}><Symbol name="paket" />{paketName}</span>
    </p>
  );
}

/** Geschützte Felder (#995): nur lesbar mit dem Hinweis, wer sie ändert. `null` = alle geschützten Felder des Typs. */
function schreibschutzGesperrt(typ: Mappentyp, gesperrt: string[] | null): Record<string, string> {
  return Object.fromEntries(typ.felder.filter((f) => f.schreibschutz && (gesperrt === null || gesperrt.includes(f.key))).map((f) => [f.key, t('felder.schreibschutz.nur-verwaltung')]));
}

/** Berechnete Felder (#1034): nur lesbar, darunter „berechnet von …“ bzw. „nicht mehr berechnet“ mit dem Paketnamen. */
function berechnetGesperrt(typ: Mappentyp): Record<string, string> {
  return Object.fromEntries(typ.felder.filter((f) => f.berechnetVon).map((f) => {
    const b = typ.berechnung?.[f.berechnetVon!];
    const paket = b?.name ?? f.berechnetVon!;
    return [f.key, b?.aktiv === false ? t('felder.berechnet.nicht-mehr', { paket }) : t('felder.berechnet.von', { paket })];
  }));
}

/** „um 17:04“ (heute) bzw. „am 01.11.2026 um 17:04“. */
function wann(iso: string): string {
  const d = new Date(iso);
  const uhrzeit = d.toLocaleTimeString(gebietsschema(), { hour: '2-digit', minute: '2-digit' });
  return d.toDateString() === new Date().toDateString()
    ? t('mappen.konflikt.heute', { uhrzeit })
    : t('mappen.konflikt.am', { datum: d.toLocaleDateString(gebietsschema(), { day: '2-digit', month: '2-digit', year: 'numeric' }), uhrzeit });
}

/**
 * Rückfrage beim gleichzeitigen Bearbeiten (#609): je Feld, wer es wann worauf geändert hat und was du
 * eintragen wolltest – mit „Meins übernehmen“ und „Wert von … behalten“. Alles andere ist schon zusammengeführt.
 */
function Konfliktfrage({ konflikt, ich, sendet, waehle, speichern, abbrechen }: {
  konflikt: Mappenkonflikt & { wahl: Record<string, 'meins' | 'seins'> }; ich: string; sendet: boolean;
  waehle: (feld: string, w: 'meins' | 'seins') => void; speichern: () => void; abbrechen: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const alle = konflikt.konflikte.every((k) => konflikt.wahl[k.feld]);
  const text = (v: string) => (v ? `„${v}“` : t('mappen.konflikt.leer'));
  return (
    <div className="hinweis warn mappenkonflikt" role="group" aria-labelledby="mappenkonflikt-titel" tabIndex={-1} ref={ref}>
      <h2 className="h3" id="mappenkonflikt-titel"><Symbol name="warnung" /> {t('mappen.konflikt.titel')}</h2>
      <p>{t('mappen.konflikt.einleitung')}</p>
      {konflikt.konflikte.map((k) => {
        const selbst = k.von === ich;
        const werte = { name: k.name, feld: k.label, wann: wann(k.zeit), aktuell: text(k.aktuell), deins: text(k.deins) };
        const satz = k.geheim ? t(selbst ? 'mappen.konflikt.selbstGeheim' : 'mappen.konflikt.andererGeheim', werte) : t(selbst ? 'mappen.konflikt.selbst' : 'mappen.konflikt.anderer', werte);
        return (
          <fieldset key={k.feld} className="mk-feld">
            <legend>{t('mappen.konflikt.frage', { feld: k.label })}</legend>
            <p>{satz}</p>
            <div className="mk-wahl">
              <label className="haken"><input type="radio" name={`mk-${k.feld}`} checked={konflikt.wahl[k.feld] === 'meins'} onChange={() => waehle(k.feld, 'meins')} />
                <span>{selbst ? t('mappen.konflikt.hier') : t('mappen.konflikt.meins')}{!k.geheim && <span className="leise"> – {text(k.deins)}</span>}</span></label>
              <label className="haken"><input type="radio" name={`mk-${k.feld}`} checked={konflikt.wahl[k.feld] === 'seins'} onChange={() => waehle(k.feld, 'seins')} />
                <span>{selbst ? t('mappen.konflikt.dort') : t('mappen.konflikt.seins', { name: k.name })}{!k.geheim && <span className="leise"> – {text(k.aktuell)}</span>}</span></label>
            </div>
          </fieldset>
        );
      })}
      {!alle && <p className="leise klein">{t('mappen.konflikt.fehlt')}</p>}
      <div className="knoepfe">
        <button type="button" className="knopf" onClick={abbrechen} disabled={sendet}>{t('mappen.konflikt.abbrechen')}</button>
        <button type="button" className="knopf gruen" onClick={speichern} disabled={!alle || sendet}>{t('mappen.konflikt.speichern')}</button>
      </div>
    </div>
  );
}

/** Beim Auswählen übernehmen (#1037): ein vorgeschlagener Wert aus der Mappe `mappe` im Verweisfeld `feld`. */
interface Vorbelegt { feld: string; mappe: string; wert: Roh; vorher: Roh; text: string }

/** Leerer Rohwert des Felds `k` (für „Zurücknehmen“). */
const leerRoh = (typ: Mappentyp, k: string): Roh => { const f = typ.felder.find((x) => x.key === k); return f ? zuRoh(f, null) : ''; };
/** Gleicher Rohwert (leer = null)? */
const gleichRoh = (a: Roh | undefined, b: Roh | undefined) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Beim Auswählen übernehmen (#1037): von den Werten `werte` nur die für Felder, die in `roh` leer sind und `frei` – als
 * Rohwert fürs Formular (`umwandeln`) oder so, wie sie sind.
 */
function leereVorschlaege(typ: Mappentyp, werte: Record<string, Wert | Roh>, roh: RohWerte, frei: (k: string) => boolean, umwandeln = true): RohWerte {
  const aus: RohWerte = {};
  for (const [k, w] of Object.entries(werte)) {
    const f = typ.felder.find((x) => x.key === k);
    if (f && frei(k) && istLeer(ausRoh(f, roh[k]))) aus[k] = umwandeln ? zuRoh(f, w as Wert) : w as Roh;
  }
  return aus;
}

/**
 * Beim Auswählen übernehmen (#1037) aus „Aus Dokument ausfüllen“: Vorschläge mit `aus` (Werte einer vorgeschlagenen
 * Mappe) nur in leere Felder und nur, wenn das Verweisfeld danach auf diese Mappe zeigt – nicht bei einer Alternative.
 */
function vorbelegtAusVorschlaegen(typ: Mappentyp, r: TypVorschlaege, roh: RohWerte, werte: RohWerte, frei: (k: string) => boolean): { werte: RohWerte; marken: Record<string, Vorbelegt> } {
  const neu: RohWerte = {};
  const marken: Record<string, Vorbelegt> = {};
  for (const [k, v] of Object.entries(r.vorschlaege)) {
    const f = typ.felder.find((x) => x.key === k);
    const q = v.aus ? typ.felder.find((x) => x.key === v.aus!.feld) : undefined;
    if (!f || !q || !v.aus || !frei(k) || !istLeer(ausRoh(f, roh[k]))) continue;
    if (ersteId(ausRoh(q, q.key in werte ? werte[q.key] : roh[q.key])) !== v.aus.mappe) continue;
    neu[k] = zuRoh(f, v.wert);
    marken[k] = { feld: q.key, mappe: v.aus.mappe, wert: neu[k], vorher: roh[k] ?? zuRoh(f, null), text: v.fundstelle };
  }
  return { werte: neu, marken };
}

/** Ein Vorschlag aus „Aus Dokument ausfüllen“ (#391) am Feld. */
interface FeldVorschlag { wert: Wert; sicherheit: Sicherheit; fundstelle: string; art: 'eingetragen' | 'alternative'; vorher?: Roh }

function FeldEingabe({ feld: f, roh, fehler, setze, eigeneId, bekannt, merke, gesperrt, nurLesen, passwortSehen = true, typId, typFelder = [], unpassend, gruende, eigene, neu, zusatz, plzDeutsch, gespeichert }: {
  feld: Feld; roh: Roh | undefined; fehler?: string; setze: (v: Roh) => void; eigeneId?: string;
  /** Gespeicherter Wert (#732): Übersetzt wird immer nur er, nie die Eingabe. */
  gespeichert?: Wert;
  /** Format PLZ (#535): gilt die deutsche Regel? Dann am Handy die Zifferntastatur. */
  plzDeutsch?: boolean;
  /** Unter dem Feld, z. B. ein Vorschlag aus „Aus Dokument ausfüllen“ (#391). */
  zusatz?: ReactNode;
  /** Typ der Mappe und Verweise, die nicht (mehr) zum Auswahlfilter passen (#172); Felder des Typs für den Grund (#887). */
  typId?: string; typFelder?: Feld[]; unpassend?: string[];
  /** Je unpassender Mappe die eigenen Felder, mit denen sie nicht zusammenpasst (#887). */
  gruende?: Record<string, string[]>;
  /** Erkannte Angaben für eine neue Mappe des Zieltyps (#935): füllen das Fenster „+ … anlegen“ vor. */
  neu?: Record<string, unknown>;
  /** Werte dieser Mappe, von denen der Auswahlfilter abhängt (#173). */
  eigene?: Werte;
  bekannt: Bezuege; merke: (id: string, b: { titel: string; typId: string }) => void;
  /** Grund, warum das Feld hier nur angezeigt wird. */
  gesperrt?: string;
  /** Berechtigungen (#126): ohne „Bearbeiten“ bzw. ohne „Passwörter sehen“. */
  nurLesen?: boolean; passwortSehen?: boolean;
}) {
  const d = useDaten();
  const id = `feld-${f.key}`;
  const ue = useUebernahmeFeld(f, gesperrt !== undefined);
  // Übersetzung anzeigen (#732): unter dem Feld, nur lesbar – bearbeitet wird weiter das Original im Feld.
  const uebersetzung = eigeneId && typeof gespeichert === 'string' && feldUebersetzbar(f, gespeichert)
    ? <Uebersetzbar quelle={{ art: 'feld', mappe: eigeneId, feld: f.key }} original={gespeichert} ersetzen={false}
        darstellen={(x) => (f.typ === 'formatiert' ? <Formatiert text={x} /> : <span className="mehrzeilig">{x}</span>)}>{null}</Uebersetzbar>
    : null;
  let ctl: ReactNode;
  let breit = false;
  let mitLabelFor = true;

  if (gesperrt !== undefined) {
    mitLabelFor = false;
    const ids = f.typ === 'referenz' ? (Array.isArray(roh) ? roh as string[] : roh ? [String(roh)] : []) : [];
    ctl = f.typ === 'referenz'
      ? <ul>{ids.map((x) => <li key={x}>{bekannt[x]?.typId && !bekannt[x].verborgen ? <><Link to={`/ablage/${bekannt[x].typId}/${x}`} className="verweis"><Ehemalig id={x}>{titelOder(bekannt[x].titel)}</Ehemalig></Link>{mehrereZiele(f) && <TypMarke typId={bekannt[x].typId} />}</> : <span className={bekannt[x]?.verborgen ? 'verborgen-titel' : ''}>{titelOder(bekannt[x]?.titel)}</span>}
          {/* Wer nur liest, sieht die Markierung am Feld, aber keine Aufforderung (#887). */}
          {unpassend?.includes(x) && <> <span className="chip warn" title={t('felder.verweis.unpassend.titel')}>{unpassendText(typFelder, gruende?.[x] ?? [])}</span></>}</li>)}</ul>
      : f.typ === 'janein' ? (roh ? t('ablage.mappeformular.ja') : t('ablage.mappeformular.nein')) : f.typ === 'formatiert' ? (roh ? <Formatiert text={String(roh)} /> : null)
      : f.typ === 'datum' ? formatiere(f, String(roh ?? '')) : f.typ === 'zeitraum' || f.typ === 'prozent' || f.typ === 'betrag' ? formatiere(f, ausRoh(f, roh)) : f.typ === 'langtext' ? (roh ? <span className="mehrzeilig">{String(roh)}</span> : null)
      : f.typ === 'text' && f.format && roh ? <FormatWert f={f} wert={String(roh)} /> : String(roh ?? '');
    // Nur lesen (#1034): ein Aussehen für geschützte und berechnete Felder – nur die Herkunft darunter unterscheidet sich.
    return (
      <NurLesenFeld beschriftung={feldLabel(f)} herkunft={gesperrt || undefined} symbol={f.berechnetVon ? 'rechnen' : 'schloss'}
        breit={f.typ === 'langtext' || f.typ === 'formatiert'} className="feld" anker={`mappe.feld:${f.key}`}
        unter={uebersetzung || fehler ? <>{uebersetzung}{fehler && <p className="fehlertext">{fehler}</p>}</> : undefined}>{ctl}</NurLesenFeld>
    );
  }

  switch (f.typ) {
    case 'langtext':
      breit = true;
      ctl = <textarea id={id} rows={3} value={String(roh ?? '')} onChange={(e) => setze(e.target.value)} />;
      break;
    case 'zahl':
      ctl = <input id={id} inputMode="decimal" value={String(roh ?? '')} onChange={(e) => setze(e.target.value)} />;
      break;
    case 'prozent':
      // Prozent (#1035): „19“, „19 %“ und „19,0“ ergeben dasselbe.
      ctl = <ProzentEingabe id={id} wert={String(roh ?? '')} setze={setze} aria-invalid={fehler ? true : undefined} />;
      break;
    case 'zeitraum':
      // Zeitraum (#1035): Zahl und Einheit, „1 Monat“ / „3 Monate“.
      ctl = <ZeitraumEingabe id={id} wert={(roh ?? { anzahl: '', einheit: 'monate' }) as RohZeitraum} setze={setze} aria-invalid={fehler ? true : undefined} />;
      break;
    case 'betrag': {
      const b = (roh ?? { betrag: '', waehrung: 'EUR' }) as RohBetrag;
      ctl = (
        <div className="betrag">
          <input id={id} inputMode="decimal" placeholder={f.negativ ? '-0,00' : '0,00'} value={b.betrag} onChange={(e) => setze({ ...b, betrag: e.target.value })}
            aria-describedby={f.negativ ? `${id}-negativ` : undefined} />
          <input aria-label={t('ablage.mappeformular.waehrung')} className="mono" maxLength={3} value={b.waehrung} onChange={(e) => setze({ ...b, waehrung: e.target.value.toUpperCase() })} />
        </div>
      );
      break;
    }
    case 'datum':
      ctl = <input id={id} type="date" value={String(roh ?? '')} onChange={(e) => setze(e.target.value)} />;
      break;
    case 'janein':
      mitLabelFor = false;
      ctl = <label className="haken"><input id={id} type="checkbox" checked={!!roh} onChange={(e) => setze(e.target.checked)} /><span>{t('ablage.mappeformular.ja')}</span></label>;
      break;
    case 'auswahl': {
      const optionen = f.optionen ?? [];
      if (f.mehrfach) {
        mitLabelFor = false;
        const gewaehlt = (roh as string[]) ?? [];
        ctl = <div className="auswahlliste">{optionen.map((o) => (
          <label key={o} className="haken"><input type="checkbox" checked={gewaehlt.includes(o)} onChange={(e) => setze(e.target.checked ? [...gewaehlt, o] : gewaehlt.filter((x) => x !== o))} /><span>{optionText(f, o)}</span></label>
        ))}</div>;
      } else {
        const r = String(roh ?? '');
        ctl = <select id={id} value={r} onChange={(e) => setze(e.target.value)}>
          <option value="">{t('ablage.mappeformular.keine-angabe')}</option>
          {/* Gespeichert wird der feste Wert, gezeigt die Beschriftung (#728). */}
          {optionen.map((o) => <option key={o} value={o}>{optionText(f, o)}</option>)}
          {r && !optionen.includes(r) && <option value={r}>{r}</option>}
        </select>;
      }
      break;
    }
    case 'referenz': {
      // Mehrere Zieltypen (#1036): alle, die die Person kennt; nur aus Paketen ohne installierten Zieltyp: Hinweis.
      const ziele = zieleVon(f).map((z) => d.typ(z)).filter((x): x is Mappentyp => !!x);
      const ziel = ziele[0];
      if (!ziel) { ctl = <p className="leise">{f.zielOptional?.length && !zieleVon(f).length ? t('felder.verweis.noch-kein-ziel') : t('ablage.mappeformular.der-ziel-mappentyp-existiert')}</p>; break; }
      mitLabelFor = !f.mehrfach;
      ctl = <MappenWahl id={id} ziel={ziel} ziele={ziele} gleicherTyp={!!f.gleicherTyp} mehrfach={!!f.mehrfach} wert={roh as string | string[] | undefined} eigeneId={eigeneId}
        bekannt={bekannt} merke={merke} setze={setze}
        sicht={(f.auswahlFilter?.length || ziele.length > 1) && typId ? `feld:${typId}:${f.key}` : undefined}
        pruefen={typId && (f.auswahlFilter?.length || typFelder.some((x) => x.folgtAus?.feld === f.key)) ? { typId, feldKey: f.key } : undefined}
        vorbelegen={{ ...neu, ...(f.auswahlFilter?.length ? vorbelegungAus(f.auswahlFilter, ziel) : {}) }}
        unpassend={unpassend} gruende={gruende} eigene={eigene} typFelder={typFelder} />;
      break;
    }
    case 'formatiert':
      breit = true;
      mitLabelFor = false;
      ctl = <FormatiertEingabe id={id} wert={String(roh ?? '')} setze={setze} />;
      break;
    case 'passwort':
      ctl = <PasswortEingabe id={id} feld={f} roh={(roh ?? leeresPasswort) as RohPasswort} setze={setze} mappeId={eigeneId} nurLesen={nurLesen} sehen={passwortSehen} />;
      break;
    default:
      ctl = <input id={id} value={String(roh ?? '')} onChange={(e) => setze(e.target.value)}
        inputMode={eingabemodus(f, plzDeutsch)} {...(f.format === 'iban' ? { autoCapitalize: 'characters', spellCheck: false } : f.format ? { autoCapitalize: 'off', autoCorrect: 'off', spellCheck: false } : {})} />;
      // E-Mail, Telefon, Internetseite (#535): daneben direkt antippen, sobald die Angabe passt.
      if (f.format === 'email' || f.format === 'telefon' || f.format === 'internetseite') {
        const w = String(roh ?? '').trim();
        ctl = <div className="ff-eingabe">{ctl}{w && !formatFehler(f, w, { felder: [], werte: {} }) && <FormatLink f={f} wert={w} nurSymbol />}</div>;
      }
  }

  return (
    <div className={`feld ${breit ? 'breit' : ''} ${fehler ? 'fehlerhaft' : ''}${ue.klasse}`} data-anker={`mappe.feld:${f.key}`} {...ue.props}>
      <div className="feldkopf">
        {mitLabelFor ? <label htmlFor={id}>{feldLabel(f)}{f.pflicht && <span className="pflicht">*</span>}</label> : <span className="label">{feldLabel(f)}{f.pflicht && <span className="pflicht">*</span>}</span>}
        {ue.nummern}
        {f.typ === 'referenz' && <span className="chip">{VERWEISARTEN[f.verweisart ?? 'bezug']}</span>}
      </div>
      {ctl}
      {uebersetzung}
      {zusatz}
      {ue.unter}
      {f.hilfe && <span className="hilfe">{feldHilfe(f)}</span>}
      {/* Negativer Betrag (#1035): nur, wenn das Feld ihn erlaubt. */}
      {f.typ === 'betrag' && f.negativ && <span className="hilfe" id={`${id}-negativ`}>{t('felder.eingabe.betrag-negativ')}</span>}
      {fehler && <p className="fehlertext">{fehler}</p>}
    </div>
  );
}


/**
 * Feld auf der Seite „Dokument übernehmen“ (#934): leuchtet auf, wenn man über seinen Rahmen am Dokument fährt (und
 * lässt beim Überfahren seine Rahmen aufleuchten), merkt sich als zuletzt gewähltes Feld, nimmt Werte vom Dokument
 * an (Ziehen) und zeigt die Nummern seiner Rahmen. Ohne Seite (überall sonst) nichts davon.
 */
function useUebernahmeFeld(f: Feld, gesperrt: boolean) {
  const b = useBruecke();
  const [drueber, setDrueber] = useState(false);
  if (!b || gesperrt) return { klasse: '', props: {}, nummern: null, unter: null };
  const marken = b.marken.filter((m) => m.feldKey === f.key);
  return {
    klasse: `${b.hervor === f.key ? ' ue-hervor' : ''}${b.aktiv === f.key ? ' ue-aktiv' : ''}${drueber ? ' ue-drueber' : ''}`,
    props: {
      onMouseEnter: () => b.setHervor(f.key), onMouseLeave: () => b.setHervor(null),
      onFocusCapture: () => b.setAktiv(f.key), onPointerDownCapture: () => b.setAktiv(f.key),
      onDragOver: (e: ReactDragEvent) => { if (!ziehtWert(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; if (!drueber) setDrueber(true); },
      onDragLeave: (e: ReactDragEvent) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDrueber(false); },
      onDrop: (e: ReactDragEvent) => { const n = ziehtWert(e) ? liesNutzlast(e) : null; if (!n) return; e.preventDefault(); setDrueber(false); b.setAktiv(f.key); b.nimm(f, n); },
    },
    nummern: marken.length ? <span className="ue-nummern">{marken.map((m) => <span key={m.nr} className={`ue-nr ${farbeVon(m.nr)}`} title={t('ablage.uebernehmen.rahmen-nr', { nr: m.nr })}>{m.nr}</span>)}</span> : null,
    unter: b.unterFeld(f),
  };
}

/**
 * Lohnt eine Übersetzung (#732)? Lange Texte und formatierte Texte immer; einzeilige Textfelder nur ohne Format (keine
 * E-Mail, IBAN, Telefonnummer) und erst ab vier Wörtern – Namen und Nummern übersetzt niemand.
 */
function feldUebersetzbar(f: Feld, wert: string): boolean {
  if (!wert.trim()) return false;
  if (f.typ === 'langtext' || f.typ === 'formatiert') return true;
  return f.typ === 'text' && !f.format && wert.trim().split(/\s+/).length >= 4;
}

/** Link zu einer Angabe mit Format (#535): mailto:, tel: oder die Internetseite (neuer Tab). */
function FormatLink({ f, wert, nurSymbol }: { f: Feld; wert: string; nurSymbol?: boolean }) {
  const href = f.format === 'email' ? `mailto:${wert}` : f.format === 'telefon' ? telefonLink(wert) : mitSchema(wert);
  const text = t(f.format === 'email' ? 'felder.eingabe.link.email' : f.format === 'telefon' ? 'felder.eingabe.link.telefon' : 'felder.eingabe.link.internetseite', { wert });
  const extern = f.format === 'internetseite' ? { target: '_blank', rel: 'noopener noreferrer' } : {};
  return nurSymbol
    ? <a href={href} className="ff-link" aria-label={text} title={text} {...extern}><Symbol name={f.format === 'email' ? 'email' : f.format === 'telefon' ? 'telefon' : 'extern'} /></a>
    : <a href={href} className="verweis" title={text} {...extern}>{wert}</a>;
}

/** Nur lesbare Angabe mit Format (#535): E-Mail, Telefon und Internetseite als Link, IBAN in Vierergruppen. */
function FormatWert({ f, wert }: { f: Feld; wert: string }) {
  if (!wert) return null;
  if ((f.format === 'email' || f.format === 'telefon' || f.format === 'internetseite') && !formatFehler(f, wert, { felder: [], werte: {} })) return <FormatLink f={f} wert={wert} />;
  return <>{formatiere(f, wert)}</>;
}

/**
 * Passwortfeld (#46): Das gespeicherte Passwort kommt nie mit der Mappe. Das Auge holt es
 * einzeln vom Server (steht im Protokoll); zum Ändern wird ein neues eingegeben.
 */
function PasswortEingabe({ id, feld: f, roh: p, setze, mappeId, nurLesen, sehen = true }: { id: string; feld: Feld; roh: RohPasswort; setze: (v: Roh) => void; mappeId?: string; nurLesen?: boolean; sehen?: boolean }) {
  const { passwoerterMoeglich } = useKonto();
  const [klartext, setKlartext] = useState<string | null>(null);
  const [zeigen, setZeigen] = useState(false);
  const [laedt, setLaedt] = useState(false);
  const [fehler, setFehler] = useState<string>();
  const [aendern, setAendern] = useState(false);
  // Nach dem Speichern (neuer Stand vom Server) die Anzeige zurücksetzen.
  useEffect(() => { if (!p.neu) { setKlartext(null); setAendern(false); setZeigen(false); } }, [p.gesetzt, p.lesbar]); // eslint-disable-line react-hooks/exhaustive-deps -- nur zurücksetzen, wenn sich der gespeicherte Wert ändert
  const auge = (an: boolean) => <Symbol name={an ? 'auge-aus' : 'auge'} />;

  if (p.entfernen) return (
    <div className="passwort">
      <span className="festwert leise">{t('ablage.mappeformular.wird-beim-speichern-entfernt')}</span>
      <button type="button" className="knopf klein" onClick={() => setze({ ...p, entfernen: false })}>{t('ablage.mappeformular.rueckgaengig')}</button>
    </div>
  );

  if (nurLesen && !p.gesetzt) return <span id={id} className="festwert leise">{t('ablage.mappeformular.kein-passwort-gespeichert')}</span>;
  if (p.gesetzt && (!aendern || nurLesen) && !p.neu) {
    async function umschalten() {
      if (klartext !== null) { setKlartext(null); return; }
      if (!mappeId) return;
      setLaedt(true); setFehler(undefined);
      try { setKlartext((await api.passwortAnzeigen(mappeId, f.key)).wert); } catch (e) { setFehler((e as Error).message); } finally { setLaedt(false); }
    }
    return (
      <>
        <div className="passwort">
          <span id={id} className={`festwert mono ${p.lesbar ? '' : 'leise'}`} aria-live="polite">{!p.lesbar ? t('ablage.mappeformular.nicht-lesbar-bitte-neu') : klartext ?? '••••••••'}</span>
          {p.lesbar && mappeId && sehen && <button type="button" className="knopf klein" disabled={laedt} onClick={() => void umschalten()} title={klartext === null ? t('ablage.mappeformular.passwort-anzeigen-wird-protokolliert') : t('ablage.mappeformular.passwort-verbergen')} aria-label={klartext === null ? t('ablage.mappeformular.passwort-anzeigen') : t('ablage.mappeformular.passwort-verbergen')}>{auge(klartext !== null)}</button>}
          {!nurLesen && <button type="button" className="knopf klein" disabled={!passwoerterMoeglich} onClick={() => { setKlartext(null); setAendern(true); }}>{t('ablage.mappeformular.aendern')}</button>}
          {!nurLesen && <button type="button" className="knopf klein" onClick={() => { setKlartext(null); setze({ ...p, entfernen: true }); }} title={t('ablage.mappeformular.wird-erst-mit-mappe')}>{t('ablage.mappeformular.passwort-entfernen')}</button>}
        </div>
        {fehler && <p className="fehlertext">{fehler}</p>}
        {!sehen && p.lesbar && <span className="hilfe">{t('ablage.mappeformular.passwoerter-dieser-mappe-darfst')}</span>}
        {!passwoerterMoeglich && !nurLesen && <span className="hilfe">{t('ablage.mappeformular.aendern-geht-erst-wieder')}</span>}
      </>
    );
  }

  if (!passwoerterMoeglich) return (
    <>
      <input id={id} type="password" disabled placeholder={t('ablage.mappeformular.nicht-moeglich')} />
      <span className="hilfe">{t('ablage.mappeformular.passwoerter-lassen-sich-erst')}</span>
    </>
  );

  return (
    <div className="passwort">
      <input id={id} type={zeigen ? 'text' : 'password'} value={p.neu} autoComplete="new-password" spellCheck={false}
        placeholder={p.gesetzt ? t('ablage.mappeformular.neues-passwort') : ''} onChange={(e) => setze({ ...p, neu: e.target.value })} />
      <button type="button" className="knopf klein" onClick={() => setZeigen(!zeigen)} aria-label={zeigen ? t('ablage.mappeformular.eingabe-verbergen') : t('ablage.mappeformular.eingabe-anzeigen')} title={zeigen ? t('ablage.mappeformular.eingabe-verbergen') : t('ablage.mappeformular.eingabe-anzeigen')}>{auge(zeigen)}</button>
      {p.gesetzt && <button type="button" className="knopf klein" onClick={() => { setze({ ...p, neu: '' }); setAendern(false); setZeigen(false); }}>{t('ablage.mappeformular.abbrechen')}</button>}
    </div>
  );
}

/* ---------- Verknüpfungsregister ---------- */

/** Warum sich die Mappe nicht löschen lässt: Grund und ggf. die Mappen, die noch verweisen (#79). */
interface Loeschsperre { grund: string; rueckverweise?: Rueckverweis[] }

/**
 * „Mappe löschen“ mit der Begründung auf Klick (#423): Ist Löschen gesperrt (Verweise, Archivmodus,
 * fehlendes Recht), steht neben dem grauen Knopf „Warum nicht?“ und klappt die Begründung direkt
 * am Knopf auf. Bildschirmleser hören den Grund über aria-describedby schon am Knopf.
 *
 * `wege`: weitere Löschwege, die trotz Sperre gehen – sie stehen in der aufgeklappten Begründung
 * unter „Stattdessen“ (z. B. „Mit verknüpften Mappen löschen …“, #424).
 */
function LoeschKnopf({ sperre, loeschen, wege }: { sperre?: Loeschsperre; loeschen(): void; wege?: ReactNode }) {
  const d = useDaten();
  const [offen, setOffen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!offen) return;
    const zu = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOffen(false);
    };
    document.addEventListener('mousedown', zu); document.addEventListener('keydown', zu);
    return () => { document.removeEventListener('mousedown', zu); document.removeEventListener('keydown', zu); };
  }, [offen]);
  useEffect(() => { if (!sperre) setOffen(false); }, [sperre]);
  if (!sperre) return <button type="button" className="textknopf gefahr" onClick={loeschen}>{t('ablage.mappeformular.mappe-loeschen-2')}</button>;
  const quellen = [...new Map((sperre.rueckverweise ?? []).map((r) => [r.quelleId, r])).values()];
  const zeige = quellen.slice(0, 8);
  return (
    <div className="loeschwahl" ref={ref}>
      {/* Gesperrt als Knopf erkennbar (#648): Rahmen, gedämpft, Schloss; der Grund steht sichtbar daneben. */}
      <button type="button" className="knopf klein loeschwahl-gesperrt" aria-disabled="true" aria-describedby="loeschwahl-grund" onClick={() => setOffen(!offen)}>
        <Symbol name="schloss" /> {t('mappen.loeschen.knopf')}
      </button>
      <span id="loeschwahl-grund" className="klein leise loeschwahl-grund">{t('mappen.loeschen.gesperrt', { grund: sperre.grund })}</span>
      <button type="button" className="textknopf klein loeschwahl-warum" aria-expanded={offen} aria-controls="loeschwahl-begruendung" onClick={() => setOffen(!offen)}>
        <Symbol name="info" /> {t('mappen.loeschen.warum')}
      </button>
      {offen && (
        <div className="loeschwahl-begruendung klein" id="loeschwahl-begruendung" role="region" aria-label={t('ablage.mappeformular.warum-sich-die-mappe')}>
          <p><strong>{t('ablage.mappeformular.loeschen-nicht-moeglich-2')}</strong> {sperre.grund}</p>
          {zeige.length > 0 && <ul>{zeige.map((r) => (
            <li key={r.quelleId}>{r.verborgen ? <span className="verborgen-titel">{r.titel}</span> : <Link to={`/ablage/${r.quelleTypId}/${r.quelleId}`} className="verweis"><Ehemalig id={r.quelleId}>{titelOder(r.titel)}</Ehemalig></Link>} <span className="leise">({d.typ(r.quelleTypId)?.name ?? t('ablage.mappeformular.mappe')})</span></li>
          ))}{quellen.length > zeige.length && <li className="leise">{t('ablage.mappeformular.und-weitere', { wert: quellen.length - zeige.length })}</li>}</ul>}
          {wege && <div className="loeschwahl-wege"><p className="leise">{t('ablage.mappeformular.stattdessen')}</p>{wege}</div>}
        </div>
      )}
    </div>
  );
}

function Verknuepfungen({ mappe, gruppen }: { mappe: Mappe; gruppen: ReturnType<typeof verknuepfungsGruppen> }) {
  const d = useDaten();
  if (!gruppen.length) return <p className="leise">{tn('ablage.mappeformular.kein-mappentyp-verweist-auf', { name: d.typ(mappe.typId)?.name })}</p>;
  return (
    <div className="gruppen">
      {gruppen.map(({ t: mappentyp, f, treffer, liste }) => (
        <section key={`${mappentyp.id}-${f.key}`} className="gruppe">
          <header>
            <span><strong>{typName(mappentyp)}</strong> <span className="leise">{t('ablage.mappeformular.ueber', { label: feldLabel(f) })}</span> <span className="chip">{VERWEISARTEN[f.verweisart ?? 'bezug']}</span> <span className="anzahl">{treffer.length}</span></span>
            {darfErstellen(mappentyp) && <Link to={`/ablage/${mappentyp.id}/neu?verweis=${encodeURIComponent(`${f.key}:${mappe.id}`)}`} className="knopf klein">{t('ablage.mappeformular.anlegen-2', { name: mappentyp.name })}</Link>}
          </header>
          {!treffer.length ? <p className="leise">{t('ablage.mappeformular.noch-keine')}</p>
            : liste?.spalten.length ? <VerweisTabelle mappeId={mappe.id} typ={mappentyp} feldKey={f.key} spalten={liste.spalten} anzahl={treffer.length} />
            : <Trefferliste treffer={treffer} />}
        </section>
      ))}
    </div>
  );
}

/** Verweisende Mappen als Tabelle mit den Spalten einer Trefferliste (#75). */
function VerweisTabelle({ mappeId, typ, feldKey, spalten, anzahl }: { mappeId: string; typ: Mappentyp; feldKey: string; spalten: string[]; anzahl: number }) {
  const d = useDaten();
  const [daten, setDaten] = useState<{ gesamt: number; mappen: Mappe[]; bezuege: Bezuege } | null>(null);
  const [fehler, setFehler] = useState<string>();
  useEffect(() => { api.verweisende(mappeId, typ.id, feldKey).then(setDaten, (e: Error) => setFehler(e.message)); }, [mappeId, typ.id, feldKey, anzahl, d.stand]);
  if (fehler) return <p className="fehlertext klein">{fehler}</p>;
  if (!daten) return <p className="leise klein">{t('ablage.mappeformular.lade')}</p>;
  const rechts = (k: string) => rechtsbuendig(typ.felder.find((x) => x.key === k)?.typ);
  return (
    <div className="trefferliste verweistabelle">
      <table>
        <thead><tr>{spalten.map((k) => <th key={k} className={rechts(k) ? 'rechts' : ''}>{spaltenName(k, typ)}</th>)}</tr></thead>
        <tbody>
          {daten.mappen.map((m) => {
            const ziel = `/ablage/${typ.id}/${m.id}`;
            return (
              <tr key={m.id} onClick={(e) => { if (!(e.target as HTMLElement).closest('a, button')) geheZu(ziel); }}>
                {spalten.map((k, i) => {
                  const text = zelle(k, m, typ, daten.bezuege, d.person);
                  return <td key={k} className={rechts(k) ? 'rechts' : ''}>{i === 0 ? <Link to={ziel}>{text || titelOder(m.titel)}</Link> : text}</td>;
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      {daten.gesamt > daten.mappen.length && <p className="leise klein">{t('ablage.mappeformular.die-ersten-von', { mappen: daten.mappen.length.toLocaleString(gebietsschema()), gesamt: daten.gesamt.toLocaleString(gebietsschema()) })}</p>}
    </div>
  );
}

/** Verweisende Mappen; bei sehr vielen erst die ersten 100. */
function Trefferliste({ treffer }: { treffer: Rueckverweis[] }) {
  const [alle, setAlle] = useState(false);
  const sichtbar = alle ? treffer : treffer.slice(0, 100);
  return (
    <>
      <ul>{sichtbar.map((r) => <li key={r.quelleId + r.feldKey}><Link to={`/ablage/${r.quelleTypId}/${r.quelleId}`} className="verweis"><Ehemalig id={r.quelleId}>{titelOder(r.titel)}</Ehemalig></Link></li>)}</ul>
      {sichtbar.length < treffer.length && <button type="button" className="textknopf" onClick={() => setAlle(true)}>{t('ablage.mappeformular.alle-zeigen', { treffer: treffer.length.toLocaleString(gebietsschema()) })}</button>}
    </>
  );
}

/* ---------- Auswahl verwiesener Mappen (mit Suche statt langer Klappliste) ---------- */

export function MappenWahl({ id, ziel, ziele, gleicherTyp, mehrfach, wert, eigeneId, bekannt, merke, setze, sicht, pruefen, vorbelegen, unpassend: vomServer = [], gruende: gruendeVomServer, eigene, typFelder = [], ohneAnlegen, platzhalter, quelle, leer }: {
  id: string; ziel: Mappentyp; mehrfach: boolean; wert: string | string[] | undefined; eigeneId?: string;
  /**
   * Mehrere Zieltypen (#1036): alle, auf die das Feld zeigen darf (`ziel` ist der erste). Die Vorschläge kommen dann über
   * `sicht` („feld:<typ>:<feld>“) aus allen, stehen je Typ unter einer Überschrift – zuletzt geöffnete zuerst – und die
   * gewählten Mappen zeigen ihren Typ.
   */
  ziele?: Mappentyp[];
  /** „Alle vom selben Typ“ (#1036): nach der ersten Mappe nur noch Mappen ihres Typs anbieten (der Server prüft es auch). */
  gleicherTyp?: boolean;
  bekannt: Bezuege; merke: (id: string, b: { titel: string; typId: string }) => void; setze: (v: Roh) => void;
  /** Auswahlfilter (#172): Sicht „feld:<typ>:<feld>“; Vorbelegung für „+ anlegen“ (Auswahlfilter, erkannte Angaben #935). */
  sicht?: string; vorbelegen?: Record<string, unknown>; unpassend?: string[]; eigene?: Werte;
  /** Gewählte Mappen schon vor dem Speichern prüfen (#173, #886): Typ und Feld; mit den Gründen (#887). */
  pruefen?: { typId: string; feldKey: string }; gruende?: Record<string, string[]>; typFelder?: Feld[];
  /** Ohne „+ … anlegen“, z. B. im Testlauf der Werkbank (#371). */
  ohneAnlegen?: boolean;
  /** Eigener Platzhalter statt „<Typ> suchen …“, z. B. „Mappe suchen …“ für die Testmappe (#710). */
  platzhalter?: string;
  /** Eigene Vorschläge statt der Seite des Zieltyps, z. B. nur Mappen, die eine Automatisierung sehen darf (#709). */
  quelle?: (suche: string) => Promise<{ mappen: Array<Pick<Mappe, 'id' | 'titel' | 'typId'>>; gesamt: number }>;
  /** Text, wenn es gar keine Vorschläge gibt. */
  leer?: string;
}) {
  const eigeneText = eigene ? JSON.stringify(eigene) : '';
  const gewaehlt = (Array.isArray(wert) ? wert : wert ? [wert] : []).filter(Boolean);
  const [offen, setOffen] = useState(false);
  const [eingabe, setEingabe] = useState('');
  const [treffer, setTreffer] = useState<Mappe[] | null>(null);
  const [gesamt, setGesamt] = useState(0);
  const [aendern, setAendern] = useState(false);
  const zeigeSuche = mehrfach || !gewaehlt.length || aendern;
  const alle = ziele?.length ? ziele : [ziel];
  const mehrere = alle.length > 1;
  const alleIds = alle.map((x) => x.id).join(',');
  // Zuletzt geöffnet (#940, #1036): bei mehreren Zieltypen stehen diese Mappen in ihrer Gruppe oben.
  const [zuletzt, setZuletzt] = useState<Map<string, number> | null>(null);
  useEffect(() => {
    if (!mehrere || !offen || zuletzt) return;
    let aktuell = true;
    api.zuletztGeoeffnet().then((l) => aktuell && setZuletzt(new Map(l.map((x, i) => [x.id, i]))), () => aktuell && setZuletzt(new Map()));
    return () => { aktuell = false; };
  }, [mehrere, offen, zuletzt]);

  // Titel unbekannter Verweise nachladen (z. B. vorbelegt über ?verweis=…).
  const fehlend = gewaehlt.filter((x) => !bekannt[x]).join(',');
  useEffect(() => {
    for (const x of fehlend ? fehlend.split(',') : []) {
      api.mappe(x).then((r) => merke(x, { titel: r.mappe.titel ?? '', typId: r.mappe.typId })).catch(() => merke(x, { titel: t('ablage.mappeformular.geloeschte-mappe'), typId: '' }));
    }
  }, [fehlend]); // eslint-disable-line react-hooks/exhaustive-deps -- Namen nur nachladen, wenn sich die Liste der fehlenden Mappen ändert

  useEffect(() => {
    if (!offen) return;
    let aktuell = true;
    const timer = setTimeout(() => {
      const eigen = eigeneText ? JSON.parse(eigeneText) as Werte : undefined;
      // Mehrere Zieltypen ohne Feld-Auswahl (#1036, z. B. erweiterte Suche): je Typ eine Seite, zusammen.
      const jeTyp = () => Promise.all(alleIds.split(',').map((x) => api.seite(`typ:${x}`, 0, 15, eingabe.trim(), undefined, false, false, undefined, eigen)))
        .then((l) => ({ mappen: l.flatMap((x) => x.mappen), gesamt: l.reduce((n, x) => n + x.gesamt, 0) }));
      (quelle ? quelle(eingabe.trim()) as Promise<{ mappen: Mappe[]; gesamt: number }> : !sicht && mehrere ? jeTyp() : api.seite(sicht ?? `typ:${ziel.id}`, 0, mehrere ? 30 : 20, eingabe.trim(), undefined, false, false, undefined, eigen)).then((s) => { if (aktuell) { setTreffer(s.mappen); setGesamt(s.gesamt); } }).catch(() => aktuell && setTreffer([]));
    }, 200);
    return () => { aktuell = false; clearTimeout(timer); };
  }, [offen, eingabe, ziel.id, sicht, eigeneText, quelle, mehrere, alleIds]);

  // Passen die gewählten Mappen noch zu den Werten dieser Mappe (#173, #886)? Hinweis mit Grund (#887) schon vor dem Speichern.
  const gewaehltText = gewaehlt.join(',');
  const [live, setLive] = useState<{ unpassend: string[]; gruende: Record<string, string[]> } | null>(null);
  const pruefTyp = pruefen?.typId ?? (sicht?.startsWith('feld:') ? sicht.split(':')[1] : undefined);
  const pruefFeld = pruefen?.feldKey ?? (sicht?.startsWith('feld:') ? sicht.split(':')[2] : undefined);
  useEffect(() => {
    if (!pruefTyp || !pruefFeld || !gewaehltText) { setLive(null); return; }
    let aktuell = true;
    const timer = setTimeout(() => { api.auswahlPruefen(pruefTyp, pruefFeld, gewaehltText.split(','), eigeneText ? JSON.parse(eigeneText) as Werte : {}).then((r) => aktuell && setLive({ unpassend: r.unpassend, gruende: r.gruende ?? {} })).catch(() => {}); }, 300);
    return () => { aktuell = false; clearTimeout(timer); };
  }, [pruefTyp, pruefFeld, gewaehltText, eigeneText]);
  const unpassend = live?.unpassend ?? vomServer;
  const gruende = live?.gruende ?? gruendeVomServer ?? {};

  // „+ … anlegen“ (#935): im verschiebbaren Fenster statt auf einer neuen Seite; danach steht die Mappe im Feld.
  const [fenster, setFenster] = useState<Mappentyp | null>(null);
  const [angelegt, setAngelegt] = useState<string>();
  useEffect(() => { if (!angelegt) return; const z = window.setTimeout(() => setAngelegt(undefined), 6000); return () => window.clearTimeout(z); }, [angelegt]);
  const anlegenRef = useRef<HTMLButtonElement>(null);

  function waehle(m: Mappe) {
    merke(m.id, { titel: m.titel ?? '', typId: m.typId });
    setze(mehrfach ? [...gewaehlt, m.id] : m.id);
    setEingabe(''); setOffen(false); setAendern(false);
  }
  // „Alle vom selben Typ“ (#1036): nach der ersten Mappe nur ihr Typ – solange die Oberfläche ihn kennt (sichtbare Mappe).
  const festerTyp = gleicherTyp && mehrfach && mehrere && gewaehlt.length ? bekannt[gewaehlt[0]]?.typId || undefined : undefined;
  const moeglich = festerTyp ? alle.filter((x) => x.id === festerTyp) : alle;
  const roh = (treffer ?? []).filter((m) => m.id !== eigeneId && !gewaehlt.includes(m.id) && (!mehrere || moeglich.some((x) => x.id === m.typId)));
  // Mehrere Zieltypen (#1036): je Typ in der Reihenfolge des Felds, darin zuletzt geöffnete zuerst; Gruppen ohne Anzahl.
  const rang = (mid: string) => zuletzt?.get(mid) ?? Number.MAX_SAFE_INTEGER;
  const auswahl = mehrere ? moeglich.flatMap((typ) => roh.filter((m) => m.typId === typ.id).sort((a, b) => rang(a.id) - rang(b.id))) : roh;
  // Rechte wie sonst: nur, wenn die Person im Zieltyp anlegen darf – bei mehreren je Typ ein Knopf.
  const anlegbar = ohneAnlegen ? [] : moeglich.filter((x) => darfErstellen(x));
  const anlegen = anlegbar.length ? anlegbar.map((x, i) => <button key={x.id} ref={i === 0 ? anlegenRef : undefined} type="button" className="textknopf klein" aria-haspopup="dialog" aria-expanded={fenster?.id === x.id} onClick={() => setFenster(x)}>{t('ablage.mappeformular.anlegen-2', { name: typName(x) })}</button>) : null;
  const neuTyp = fenster ?? ziel;
  const start = useMemo(() => { const r = standardRoh(neuTyp); belegeVor(neuTyp, r, vorbelegen ?? {}); return r; }, [neuTyp, fenster]); // eslint-disable-line react-hooks/exhaustive-deps -- Startwerte neu je Fenster; vorbelegen gilt beim Öffnen
  const namen = alle.map((x) => typName(x)).join(', ');

  return (
    <Mehrfachauswahl id={id} name={t('felder.verweis.gewaehlt')} platzhalter={platzhalter ?? t('felder.verweis.suchen', { typ: mehrere ? namen : typName(ziel) })}
      eingabe={eingabe} setEingabe={setEingabe} offen={offen} setOffen={setOffen} schliessen={() => setAendern(false)} ohneSuche={!zeigeSuche}
      vorschlaege={treffer === null ? null : auswahl.map((m) => ({ id: m.id, text: titelOder(m.titel), ...(mehrere ? { gruppe: typName(alle.find((x) => x.id === m.typId) ?? ziel) } : {}) }))}
      leerText={eingabe ? t('felder.verweis.nichts') : leer ?? t('felder.verweis.leer', { typ: mehrere ? namen : typName(ziel) })}
      fuss={gesamt > (treffer?.length ?? 0) && <p className="leise klein">{t('felder.verweis.mehr', { zahl: gesamt.toLocaleString(gebietsschema()) })}</p>}
      waehle={(mid) => { const m = auswahl.find((x) => x.id === mid); if (m) waehle(m); }}
      gewaehlt={gewaehlt.map((x) => ({
        id: x,
        // Mehrere Zieltypen (#1036): mit Typ-Symbol und -Name; nicht sichtbare Mappen nur als „(nicht sichtbar)“, ohne Typ.
        inhalt: bekannt[x]?.typId && !bekannt[x].verborgen ? <><Link to={`/ablage/${bekannt[x].typId}/${x}`} className="verweis"><Ehemalig id={x}>{titelOder(bekannt[x].titel)}</Ehemalig></Link>{mehrere && <TypMarke typId={bekannt[x].typId} />}</> : <span className={bekannt[x]?.verborgen ? 'verborgen-titel' : 'leise'}>{bekannt[x]?.titel ?? t('felder.auswahl.lade')}</span>,
        zusatz: unpassend.includes(x) && <span className="chip warn" title={t('felder.verweis.unpassend.titel')}>{unpassendText(typFelder, gruende[x] ?? [])}</span>,
        aktionen: !mehrfach && !aendern && <button type="button" className="textknopf klein" onClick={() => { setAendern(true); setOffen(true); }}>{t('felder.verweis.aendern')}</button>,
        entfernenText: bekannt[x] ? t('felder.verweis.entfernen', { titel: titelOder(bekannt[x].titel) }) : t('felder.verweis.entfernen.ohne'),
      }))}
      entferne={(x) => setze(mehrfach ? gewaehlt.filter((y) => y !== x) : '')}
      darunter={<>
        {anlegen && <div className="zeile">{anlegen}</div>}
        {angelegt && <p className="hinweis gut klein vf-angelegt" role="status">{t('ablage.fenster.angelegt', { titel: angelegt })}</p>}
        {fenster && <VerweisFenster ziel={fenster} zurueck={anlegenRef} schliessen={() => setFenster(null)}>
          <Formular typ={fenster} start={start} sicht={fenster.id} kopf={(w, b) => <FensterKopf typ={fenster} werte={w} bekannt={b} />}
            imFenster={{
              gespeichert: (m) => { waehle(m); setAngelegt(titelOder(m.titel)); setFenster(null); },
              abbrechen: () => setFenster(null),
            }} />
        </VerweisFenster>}
      </>} />
  );
}

/** Startwerte einer neuen Mappe aus „+ Neu“ unter einer Tabelle (#1030): Vorgaben des Typs, das Verweisfeld zeigt hierher. */
function startMitVerweis(typ: Mappentyp, v: { feldKey: string; mappeId: string }): RohWerte {
  const r = standardRoh(typ);
  const f = typ.felder.find((x) => x.key === v.feldKey && x.typ === 'referenz');
  if (f) r[f.key] = f.mehrfach ? [v.mappeId] : v.mappeId;
  return r;
}

/** Kopf der neuen Mappe im Fenster (#935): Typ und Titel, wie er nach dem Speichern heißt. */
function FensterKopf({ typ, werte, bekannt }: { typ: Mappentyp; werte: Werte; bekannt: Bezuege }) {
  const titel = titelAus(typ, werte, (id) => bekannt[id]?.titel ?? '');
  return (
    <div className="mappenkopf">
      <p className="ueber">{typName(typ)}</p>
      <p className={`vf-mappentitel${titel ? '' : ' leise'}`}>{titel || t('ablage.mappeformular.neue-mappe')}</p>
    </div>
  );
}
