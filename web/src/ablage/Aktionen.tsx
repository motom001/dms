import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { Symbol } from '../Symbol';
import { createPortal } from 'react-dom';
import { formatiere, standardRegister, type Dokument, type Feld, type Mappentyp } from '../../../shared/src/model';
import { gruppiere } from '../../../shared/src/anlagen';
import { HakenFeld } from '../bausteine';
import { AnlageMarke } from './Anlagen';
import { ausgeblendeteFelder, sichtbareRegister } from '../../../shared/src/darstellung';
import { api, type MappeDetails } from '../api';
import { useDaten } from '../daten';
import { useKonto } from '../konto';
import { Link } from '../ort';
import { titelOder } from '../seiten';
import { Formatiert } from './Formatiert';
import { NamenOhneLinks } from '../Person';
import { alsWunsch, stempelFehler, StempelFelder, stempelStart, useStempelVorlagen, type StempelWahl } from './Stempel';
import { VerkleinertWahl } from './VerkleinertWahl';
import type { Stufe } from '../../../shared/src/verkleinern';
import { FassungWahl, hatArchivfassung, type Fassung } from './FassungWahl';
import { t, tn } from '../sprache';
import { gebietsschema } from '../../../shared/src/sprache';
import { feldLabel } from '../../../shared/src/beschriftung';

/** Aktionen an der Mappe (#58): per E-Mail versenden, als PDF exportieren, Link kopieren (#98). */

const groesse = (b: number) => (b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB`);
/** Ab hier lehnen manche Mailserver ab; die Oberfläche warnt, der Server erlaubt bis 50 MB. */
export const EMAIL_WARNUNG = 20 * 1024 * 1024;
const EMAIL_HOECHSTENS = 50_000_000;

/** Ein weiterer Löschweg im Menü (#424), z. B. „Mit verknüpften Mappen löschen …“. */
export interface Loeschweg { text: string; titel?: string; tu(): void; /** Nur auf dem Handy (#489), z. B. „Mappe löschen …“ statt in der Speicherleiste. */ nurSchmal?: boolean }

/**
 * Menü „Mappe ▾“ (#427, früher „Aktionen“): steht in der Kopfzeile neben dem Stern und betrifft
 * die ganze Mappe – nicht die eigene Aufgabe im Banner darunter. `loeschwege` erscheinen
 * abgetrennt am Ende (Platz für #424).
 */
/** Aktion eines Pakets im Menü (#1039): immer mit dem Namen des Pakets; gesperrt = Bedingung trifft nicht zu, mit Grund. */
export interface PaketEintrag { key: string; name: string; paket: string; titel?: string; gesperrt?: string; tu(): void }

export function Aktionsmenue({ aufgabe, erinnern, vorlagen = [], email, drucken, brief, link, auskunft, loeschwege = [], aus = [], pakete = [] }: { aufgabe?: () => void; erinnern?: () => void; /** Weitere Automatisierungsvorlagen (#1044), z. B. „Wiedervorlage“. */ vorlagen?: Array<{ key: string; name: string; titel?: string; tu(): void }>; email?: () => void; drucken?: () => void; /** Brief aus Vorlage (#1040). */ brief?: () => void; link?: () => void; auskunft?: () => void; loeschwege?: Loeschweg[];
  /** Eingebaute Aktionen, die die Werkbank ausgeblendet hat (#1039). */ aus?: readonly string[]; /** Aktionen von Paketen (#1039). */ pakete?: PaketEintrag[] }) {
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
  const waehle = (f: () => void) => () => { setOffen(false); f(); };
  // Einträge als Liste (#1040: „Brief aus Vorlage“ dazu) – ein Menüpunkt, ein Aussehen.
  // Paket-Aktionen (#1039) reihen sich nach den eingebauten ein – gekennzeichnet mit dem Paket; ausgeblendete fehlen.
  type Eintrag = { key: string; tu: () => void; titel?: string; inhalt: ReactNode };
  const eintraege = ([
    aufgabe && { key: 'aufgabe', tu: aufgabe, inhalt: tn('ablage.aktionen.aufgabe-vergeben', { symbol: <Symbol name="aufgabe" /> }) },
    erinnern && { key: 'erinnern', tu: erinnern, titel: t('ablage.aktionen.zu-einem-datum-an'), inhalt: tn('ablage.aktionen.erinnern', { symbol: <Symbol name="erinnern" /> }) },
    // Automatisierungsvorlagen (#1044): gleich hinter „Erinnern“ – sie gehören zu denselben Abläufen.
    ...vorlagen.map((v): Eintrag => ({ key: `vorlage:${v.key}`, tu: v.tu, ...(v.titel ? { titel: v.titel } : {}), inhalt: <><Symbol name="erinnern" />{' '}{v.name}</> })),
    email && { key: 'email', tu: email, inhalt: tn('ablage.aktionen.per-e-mail-versenden', { symbol: <Symbol name="email" /> }) },
    drucken && { key: 'drucken', tu: drucken, inhalt: tn('ablage.aktionen.als-pdf-exportieren', { symbol: <Symbol name="pdf" /> }) },
    brief && { key: 'brief', tu: brief, titel: t('ablage.aktionen.brief-titel'), inhalt: tn('ablage.aktionen.brief-aus-vorlage', { symbol: <Symbol name="dokument" /> }) },
    link && { key: 'link', tu: link, titel: t('ablage.aktionen.link-ueber-mappentyp-und'), inhalt: tn('ablage.aktionen.link-kopieren', { symbol: <Symbol name="link" /> }) },
    auskunft && { key: 'auskunft', tu: auskunft, titel: t('ablage.aktionen.alles-zu-dieser-person'), inhalt: tn('ablage.aktionen.auskunft-erstellen', { symbol: <Symbol name="auskunft" /> }) },
  ] as Array<Eintrag | false | undefined | null | ''>).filter((e): e is Eintrag => !!e && !aus.includes(e.key));
  // Paket-Aktionen in derselben Liste – ein Menüpunkt, ein Aussehen; davor ein Trenner, gesperrte mit Grund.
  const alle: Array<{ key: string; tu: () => void; titel?: string; inhalt: ReactNode; gesperrt?: string; trenner?: boolean }> = [...eintraege, ...pakete.map((p, i) => ({
    key: `paket:${p.key}`, tu: p.tu, titel: p.gesperrt ?? p.titel, gesperrt: p.gesperrt, trenner: i === 0,
    inhalt: <><Symbol name="paket" />{' '}{p.name}{' '}<span className="chip klein">{p.paket}</span>{p.gesperrt && <small className="aktionsmenue-grund">{p.gesperrt}</small>}</>,
  }))];
  return (
    <div className="aktionsmenue" ref={ref}>
      <button type="button" className={`knopf klein ${offen ? 'an' : ''}`} data-anker="mappe.aktionen" aria-haspopup="menu" aria-expanded={offen} onClick={() => setOffen(!offen)} title={t('ablage.aktionen.was-du-mit-dieser')}>
        {tn('ablage.aktionen.mappe', { span: <span aria-hidden="true">▾</span> })}</button>
      {offen && <div className="hy-schleier" aria-hidden="true" onClick={() => setOffen(false)} />}
      {offen && (
        <div className="menue" role="menu">
          {alle.map((e) => <Fragment key={e.key}>{e.trenner && <div role="separator" className="aktionsmenue-trenner" />}
            <button type="button" role="menuitem" aria-disabled={e.gesperrt ? true : undefined} className={e.gesperrt ? 'aktionsmenue-gesperrt' : undefined} onClick={e.gesperrt ? undefined : waehle(e.tu)} title={e.titel}>{e.inhalt}</button></Fragment>)}
          {loeschwege.length > 0 && <div role="separator" className={`aktionsmenue-trenner${loeschwege.every((w) => w.nurSchmal) ? ' hy-nur-schmal' : ''}`} />}
          {loeschwege.map((w) => <button key={w.text} type="button" role="menuitem" className={`aktionsmenue-gefahr${w.nurSchmal ? ' hy-nur-schmal' : ''}`} onClick={waehle(w.tu)} title={w.titel}>{w.text}</button>)}
        </div>
      )}
    </div>
  );
}

export function EmailMaske({ typ, details, neuLaden, schliessen }: { typ: Mappentyp; details: MappeDetails; neuLaden: () => Promise<void>; schliessen(): void }) {
  const d = useDaten();
  const { ich } = useKonto();
  const mappe = details.mappe;
  const [bereit, setBereit] = useState<boolean | null>(null);
  const [an, setAn] = useState('');
  const [betreff, setBetreff] = useState(`${typ.name}: ${titelOder(mappe.titel)}`);
  const [nachricht, setNachricht] = useState('');
  const [gewaehlt, setGewaehlt] = useState<Set<string>>(() => new Set(details.dokumente.map((x) => x.id)));
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string>();
  const [fertig, setFertig] = useState<{ id: string; typId: string }>();
  useEffect(() => { api.emailBereit().then((r) => setBereit(r.bereit), () => setBereit(false)); }, []);
  // Anlagen (#998): „mit Anlagen?“ (Vorgabe ja) – dann gehen sie mit ihrem Hauptdokument; ohne einzeln wählbar.
  const [mitAnlagen, setMitAnlagen] = useState(true);
  const liste = gruppiere(details.dokumente).flatMap((g) => [g.haupt, ...g.anlagen]);
  // Original-E-Mail (#999): geht als Anlage mit, steht aber mit eigenem Haken in der Liste – ein Klick wählt sie ab.
  const [eml, setEml] = useState(true);
  const folgt = (x: Dokument) => mitAnlagen && !!x.anlageZu && details.dokumente.some((y) => y.id === x.anlageZu);
  const istGewaehlt = (x: Dokument) => (folgt(x) ? gewaehlt.has(x.anlageZu!) && (eml || !x.originalEmail) : gewaehlt.has(x.id));
  const emlWahl = (x: Dokument) => folgt(x) && !!x.originalEmail;
  const summe = details.dokumente.filter(istGewaehlt).reduce((a, x) => a + x.groesse, 0);
  // Verkleinert senden (#393): die Größe danach kennt erst der Server; er prüft sie vor dem Versand.
  const [klein, setKlein] = useState<Stufe | null>(null);
  // Archivfassung oder Original (#715), Vorgabe wie beim Herunterladen.
  const [fassung, setFassung] = useState<Fassung>('archiv');
  const mitPdf = details.dokumente.some((x) => istGewaehlt(x) && (x.mime === 'application/pdf' || (fassung === 'archiv' && hatArchivfassung(x))));
  const zuGross = summe > EMAIL_HOECHSTENS && !(klein && mitPdf);
  // Stempel (#394): Vorschlag oder Pflicht des Mappentyps; {empfänger} ohne Angabe = die Adressen.
  const vorlagen = useStempelVorlagen();
  const [stempel, setStempel] = useState<StempelWahl | null>(null);
  useEffect(() => { if (vorlagen && !stempel) setStempel(stempelStart(vorlagen, typ.stempel)); }, [vorlagen, stempel, typ.stempel]);
  const stempelProblem = gewaehlt.size ? stempelFehler(stempel && (stempel.an || typ.stempel?.modus === 'pflicht') ? { ...stempel, an: true } : stempel, an) : null;
  const umschalten = (id: string) => setGewaehlt((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  async function senden() {
    setFehler(undefined); setLaeuft(true);
    try {
      setFertig(await api.emailSenden(mappe.id, { an, betreff, nachricht, dokumente: liste.filter(istGewaehlt).map((x) => x.id), mitAnlagen, originalEmail: eml, stempel: alsWunsch(stempel), verkleinern: mitPdf ? klein : null, fassung }));
      await neuLaden(); await d.neuLaden();
    } catch (e) { setFehler((e as Error).message); } finally { setLaeuft(false); }
  }

  return (
    <section className="blatt" aria-label={t('ablage.aktionen.per-e-mail-versenden-2')}>
      <div className="blattkopf zeile-zwischen"><h2 className="h3">{t('ablage.aktionen.per-e-mail-versenden-2')}</h2><button type="button" className="textknopf" onClick={schliessen}>{t('ablage.aktionen.schliessen')}</button></div>
      {fertig ? (
        <>
          <p className="gutertext" role="status">{t('ablage.aktionen.die-e-mail-ist')}</p>
          <p className="leise">{t('ablage.aktionen.sie-ist-als-post')}</p>
          <div className="knoepfe"><Link to={`/ablage/${fertig.typId}/${fertig.id}`} className="knopf">{t('ablage.aktionen.e-mail-oeffnen')}</Link></div>
        </>
      ) : bereit === false ? (
        <div className="hinweis warn"><p>{t('ablage.aktionen.der-e-mail-versand')}{ich?.rolle === 'admin' ? <> {' '}{tn('ablage.aktionen.das-geht-unter', { link: <Link to="/werkbank/betrieb" className="verweis">{t('ablage.aktionen.werkbank-e-mail-und')}</Link> })}</> : t('ablage.aktionen.bitte-einen-administrator-ihn')}</p></div>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); void senden(); }}>
          <div className="raster">
            <label className="eigenschaft breit"><span>{tn('ablage.aktionen.an', { klein: <small>{t('ablage.aktionen.mehrere-durch-komma-getrennt')}</small> })}</span><input type="text" inputMode="email" autoComplete="email" value={an} onChange={(e) => setAn(e.target.value)} placeholder="name@example.org" required /></label>
            <label className="eigenschaft breit"><span>{t('ablage.aktionen.betreff')}</span><input value={betreff} maxLength={250} onChange={(e) => setBetreff(e.target.value)} required /></label>
            <label className="eigenschaft breit"><span>{t('ablage.aktionen.nachricht')}</span><textarea rows={5} value={nachricht} onChange={(e) => setNachricht(e.target.value)} /></label>
          </div>
          <fieldset className="anhaenge">
            <legend>{t('ablage.aktionen.anhaenge')}</legend>
            {!details.dokumente.length ? <p className="leise klein">{t('ablage.aktionen.diese-mappe-hat-keine')}</p> : (
              <ul>
                {liste.map((x) => (
                  <li key={x.id} className={x.anlageZu ? 'eingerueckt' : undefined}><label className="haken"><input type="checkbox" checked={istGewaehlt(x)} disabled={folgt(x) && !(emlWahl(x) && gewaehlt.has(x.anlageZu!))} data-original-email={emlWahl(x) ? '' : undefined}
                    onChange={() => (emlWahl(x) ? setEml(!eml) : umschalten(x.id))} /><span>{x.name} <AnlageMarke d={x} /> <small className="leise">{groesse(x.groesse)}</small></span></label>
                  {x.originalEmail && istGewaehlt(x) && <p className="leise klein">{t('ablage.anlagen.original-mit-hinweis')}</p>}</li>
                ))}
              </ul>
            )}
            {details.dokumente.some((x) => x.anlageZu) && <HakenFeld beschriftung={t('ablage.anlagen.email-mit')} hinweis={t('ablage.anlagen.email-mit-hinweis')} hilfe="dokumente.anlagen">
              <input type="checkbox" checked={mitAnlagen} onChange={(e) => setMitAnlagen(e.target.checked)} />
            </HakenFeld>}
            {details.dokumente.length > 0 && stempel && vorlagen && <StempelFelder wahl={stempel} setze={setStempel} vorlagen={vorlagen} pflicht={typ.stempel?.modus === 'pflicht'}
              mappe={titelOder(mappe.titel)} empfaengerErsatz={an.trim() || t('ablage.aktionen.die-adressen-unter-an')} id="email-stempel" />}
            {gewaehlt.size > 0 && <FassungWahl wert={fassung} setze={setFassung} dokumente={details.dokumente.filter(istGewaehlt)} id="email-fassung" />}
            {mitPdf && <VerkleinertWahl wert={klein} setze={setKlein} id="email-verkleinert" />}
            {details.dokumente.length > 0 && <p className={`klein ${summe > EMAIL_WARNUNG && !(klein && mitPdf) ? 'fehlertext' : 'leise'}`}>
              {t('ablage.aktionen.zusammen', { groesse: groesse(summe), wert: klein && mitPdf ? t('ablage.aktionen.vor-dem-verkleinern') : '', wert2: zuGross ? t('ablage.aktionen.das-ist-zu-gross') : summe > EMAIL_WARNUNG && !(klein && mitPdf) ? t('ablage.aktionen.viele-mailserver-nehmen-e', { wert: mitPdf ? t('ablage.aktionen.tipp-pdfs-verkleinert-senden') : '' }) : '' })}</p>}
          </fieldset>
          <p className="leise klein">{t('ablage.aktionen.absender-ist-die-adresse', { email: ich?.email })}</p>
          {fehler && <p className="fehlertext" role="alert">{fehler}</p>}
          <div className="knoepfe">{stempelProblem && <p className="leise klein">{stempelProblem}</p>}<button className="knopf primaer" disabled={laeuft || bereit === null || !an.trim() || !betreff.trim() || zuGross || !!stempelProblem}>{laeuft ? t('ablage.aktionen.wird-verschickt') : t('ablage.aktionen.senden')}</button></div>
        </form>
      )}
    </section>
  );
}

/**
 * Druckansicht (#58): alle Felder, Dokumente und Notizen der Mappe auf Papier-Maß;
 * der Browser speichert sie über „Als PDF speichern“.
 */
export function Druckansicht({ typ, details, fertig }: { typ: Mappentyp; details: MappeDetails; fertig(): void }) {
  const d = useDaten();
  const mappe = details.mappe;
  useEffect(() => {
    document.body.classList.add('druckt');
    const ende = () => fertig();
    window.addEventListener('afterprint', ende);
    const timer = window.setTimeout(() => window.print(), 50);
    return () => { window.clearTimeout(timer); window.removeEventListener('afterprint', ende); document.body.classList.remove('druckt'); };
  }, [fertig]);
  const titelVon = (id: string) => titelOder(details.bezuege[id]?.titel);
  // Wie die Mappe (#655): ohne ausgeblendete Register und Felder. Abschnitte (#890) spielen keine Rolle – gedruckt wird alles.
  const register = sichtbareRegister(typ.register?.length ? typ.register : standardRegister(typ.felder));
  const aus = ausgeblendeteFelder(typ);
  const zeit = (iso: string) => new Date(iso).toLocaleString(gebietsschema(), { dateStyle: 'medium', timeStyle: 'short' });
  return createPortal(
    <NamenOhneLinks><article className="druckansicht">
      <p className="ueber">{typ.name}</p>
      <h1>{titelOder(mappe.titel)}</h1>
      <p className="klein">{t('ablage.aktionen.angelegt-von-zuletzt-geaendert', { zeit: zeit(mappe.erstellt), person: d.person(mappe.erstelltVon), zeit2: zeit(mappe.geaendert), person2: d.person(mappe.geaendertVon) })}</p>
      {register.filter((r) => r.art === 'felder').map((r) => {
        // Tabellen (#1030) haben keinen Wert; ihre Mappen druckt jede für sich.
        const felder = (r.felder ?? []).filter((k) => !aus.has(k)).map((k) => typ.felder.find((f) => f.key === k)).filter((f): f is Feld => !!f && f.typ !== 'tabelle');
        return (
          <section key={r.key}>
            {register.filter((x) => x.art === 'felder').length > 1 && <h2>{r.name}</h2>}
            <table><tbody>
              {felder.map((f) => (
                <tr key={f.key}><th>{feldLabel(f)}</th><td>{f.typ === 'formatiert' && mappe.werte[f.key] ? <Formatiert text={String(mappe.werte[f.key])} /> : formatiere(f, mappe.werte[f.key], titelVon, { felder: typ.felder, werte: mappe.werte }) || '–'}</td></tr>
              ))}
            </tbody></table>
          </section>
        );
      })}
      {details.dokumente.length > 0 && <section><h2>{t('ablage.aktionen.dokumente')}</h2><ul>{details.dokumente.map((x) => <li key={x.id}>{x.name} ({groesse(x.groesse)})</li>)}</ul></section>}
      {(details.notizen ?? []).length > 0 && <section><h2>{t('ablage.aktionen.notizen')}</h2>{details.notizen.map((n) => <div key={n.id} className="notiz"><p className="klein">{zeit(n.erstellt)} · {d.person(n.erstelltVon)}</p><Formatiert text={n.text} /></div>)}</section>}
      <p className="klein fuss">{t('ablage.aktionen.gedruckt-am', { wert: new Date().toLocaleString(gebietsschema(), { dateStyle: 'medium', timeStyle: 'short' }) })}</p>
    </article></NamenOhneLinks>,
    document.body,
  );
}
