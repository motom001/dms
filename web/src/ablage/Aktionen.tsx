import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { formatiere, standardRegister, type Dokument, type Feld as FeldDefinition, type Mappentyp } from '../../../shared/src/model';
import { gruppiere } from '../../../shared/src/anlagen';
import { Feld, FeldGruppe, HakenFeld, Knopf, KnopfLink, Menue, type GefahrRueckfrage, type MenuePunkt } from '../bausteine';
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

/** Ein weiterer Löschweg im Menü (#424), z. B. „Mit verknüpften Mappen löschen …“ – Gefahr mit Rückfrage (#1210, Leitsatz 5). */
export interface Loeschweg { text: string; titel?: string; tu(): void; rueckfrage: GefahrRueckfrage }

/** Aktion eines Pakets im Menü (#1039): immer mit dem Namen des Pakets; gesperrt = Bedingung trifft nicht zu, mit Grund. */
export interface PaketEintrag { key: string; name: string; paket: string; titel?: string; gesperrt?: string; tu(): void }

/**
 * Menü „Mappe“ (#427, früher „Aktionen“): steht in der Kopfzeile neben dem Stern und betrifft die ganze Mappe – nicht die
 * eigene Aufgabe im Banner darunter. Baustein `Menue` (#1211); `loeschwege` erscheinen abgetrennt am Ende (Platz für
 * #424), als Gefahr mit Rückfrage. „Mappe löschen“ selbst steht in der Speicherleiste – auch am Handy (#1211).
 */
export function Aktionsmenue({ aufgabe, erinnern, vorlagen = [], email, drucken, brief, link, auskunft, loeschwege = [], aus = [], pakete = [] }: { aufgabe?: () => void; erinnern?: () => void; /** Weitere Automatisierungsvorlagen (#1044), z. B. „Wiedervorlage“. */ vorlagen?: Array<{ key: string; name: string; titel?: string; tu(): void }>; email?: () => void; drucken?: () => void; /** Brief aus Vorlage (#1040). */ brief?: () => void; link?: () => void; auskunft?: () => void; loeschwege?: Loeschweg[];
  /** Eingebaute Aktionen, die die Werkbank ausgeblendet hat (#1039). */ aus?: readonly string[]; /** Aktionen von Paketen (#1039). */ pakete?: PaketEintrag[] }) {
  // Einträge als Liste (#1040: „Brief aus Vorlage“ dazu) – ein Menüpunkt, ein Aussehen.
  // Paket-Aktionen (#1039) reihen sich nach den eingebauten ein – gekennzeichnet mit dem Paket; ausgeblendete fehlen.
  const eintraege = ([
    aufgabe && { key: 'aufgabe', tu: aufgabe, symbol: 'aufgabe', inhalt: t('ablage.aktionen.aufgabe-vergeben') },
    erinnern && { key: 'erinnern', tu: erinnern, symbol: 'erinnern', titel: t('ablage.aktionen.zu-einem-datum-an'), inhalt: t('ablage.aktionen.erinnern') },
    // Automatisierungsvorlagen (#1044): gleich hinter „Erinnern“ – sie gehören zu denselben Abläufen.
    ...vorlagen.map((v): MenuePunkt => ({ key: `vorlage:${v.key}`, tu: v.tu, symbol: 'erinnern', ...(v.titel ? { titel: v.titel } : {}), inhalt: v.name })),
    email && { key: 'email', tu: email, symbol: 'email', inhalt: t('ablage.aktionen.per-e-mail-versenden') },
    drucken && { key: 'drucken', tu: drucken, symbol: 'pdf', inhalt: t('ablage.aktionen.als-pdf-exportieren') },
    brief && { key: 'brief', tu: brief, symbol: 'dokument', titel: t('ablage.aktionen.brief-titel'), inhalt: t('ablage.aktionen.brief-aus-vorlage') },
    link && { key: 'link', tu: link, symbol: 'link', titel: t('ablage.aktionen.link-ueber-mappentyp-und'), inhalt: t('ablage.aktionen.link-kopieren') },
    auskunft && { key: 'auskunft', tu: auskunft, symbol: 'auskunft', titel: t('ablage.aktionen.alles-zu-dieser-person'), inhalt: t('ablage.aktionen.auskunft-erstellen') },
  ] as Array<MenuePunkt | false | undefined | null | ''>).filter((e): e is MenuePunkt => !!e && !aus.includes(e.key));
  // Paket-Aktionen in einer eigenen Gruppe; gesperrte mit Grund darunter.
  const alle: MenuePunkt[] = [...eintraege, ...pakete.map((p): MenuePunkt => ({
    key: `paket:${p.key}`, tu: p.tu, titel: p.titel, gesperrt: p.gesperrt, symbol: 'paket', gruppe: t('ablage.aktionen.pakete'),
    inhalt: <>{p.name}{' '}<span className="chip klein">{p.paket}</span></>,
  })), ...loeschwege.map((w): MenuePunkt => ({ key: `loeschen:${w.text}`, tu: w.tu, titel: w.titel, symbol: 'geloescht', inhalt: w.text, gefahr: w.rueckfrage }))];
  return (
    <div className="aktionsmenue">
      <Menue beschriftung={t('ablage.aktionen.mappe')} titel={t('ablage.aktionen.was-du-mit-dieser')} anker="mappe.aktionen" punkte={alle} />
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
      <div className="blattkopf zeile-zwischen"><h2 className="h3">{t('ablage.aktionen.per-e-mail-versenden-2')}</h2><Knopf art="link" onClick={schliessen}>{t('ablage.aktionen.schliessen')}</Knopf></div>
      {fertig ? (
        <>
          <p className="gutertext" role="status">{t('ablage.aktionen.die-e-mail-ist')}</p>
          <p className="leise">{t('ablage.aktionen.sie-ist-als-post')}</p>
          <div className="knoepfe"><KnopfLink to={`/ablage/${fertig.typId}/${fertig.id}`}>{t('ablage.aktionen.e-mail-oeffnen')}</KnopfLink></div>
        </>
      ) : bereit === false ? (
        <div className="hinweis warn"><p>{t('ablage.aktionen.der-e-mail-versand')}{ich?.rolle === 'admin' ? <> {' '}{tn('ablage.aktionen.das-geht-unter', { link: <Link to="/werkbank/betrieb" className="verweis">{t('ablage.aktionen.werkbank-e-mail-und')}</Link> })}</> : t('ablage.aktionen.bitte-einen-administrator-ihn')}</p></div>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); void senden(); }}>
          <div className="raster">
            <Feld beschriftung={t('ablage.aktionen.an-2')} hinweis={t('ablage.aktionen.mehrere-durch-komma-getrennt')} className="eigenschaft breit"><input type="text" inputMode="email" autoComplete="email" value={an} onChange={(e) => setAn(e.target.value)} placeholder="name@example.org" required /></Feld>
            <Feld beschriftung={t('ablage.aktionen.betreff')} className="eigenschaft breit"><input value={betreff} maxLength={250} onChange={(e) => setBetreff(e.target.value)} required /></Feld>
            <Feld beschriftung={t('ablage.aktionen.nachricht')} optional className="eigenschaft breit"><textarea rows={5} value={nachricht} onChange={(e) => setNachricht(e.target.value)} /></Feld>
          </div>
          <fieldset className="anhaenge">
            <legend>{t('ablage.aktionen.anhaenge')}</legend>
            {!details.dokumente.length ? <p className="leise klein">{t('ablage.aktionen.diese-mappe-hat-keine')}</p> : (
              <FeldGruppe beschriftung={t('ablage.aktionen.anhaenge')} beschriftungVerbergen className="anhangwahl"><ul>
                {liste.map((x) => (
                  <li key={x.id} className={x.anlageZu ? 'eingerueckt' : undefined}><label className="haken"><input type="checkbox" checked={istGewaehlt(x)} disabled={folgt(x) && !(emlWahl(x) && gewaehlt.has(x.anlageZu!))} data-original-email={emlWahl(x) ? '' : undefined}
                    onChange={() => (emlWahl(x) ? setEml(!eml) : umschalten(x.id))} /><span>{x.name} <AnlageMarke d={x} /> <small className="leise">{groesse(x.groesse)}</small></span></label>
                  {x.originalEmail && istGewaehlt(x) && <p className="leise klein">{t('ablage.anlagen.original-mit-hinweis')}</p>}</li>
                ))}
              </ul></FeldGruppe>
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
          <div className="knoepfe"><Knopf art="haupt" type="submit" gesperrt={stempelProblem || (zuGross && t('ablage.aktionen.das-ist-zu-gross').trim()) || bereit === null || !an.trim() || !betreff.trim()} laeuft={laeuft} laeuftText={t('ablage.aktionen.wird-verschickt')}>{t('ablage.aktionen.senden')}</Knopf></div>
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
        const felder = (r.felder ?? []).filter((k) => !aus.has(k)).map((k) => typ.felder.find((f) => f.key === k)).filter((f): f is FeldDefinition => !!f && f.typ !== 'tabelle');
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
