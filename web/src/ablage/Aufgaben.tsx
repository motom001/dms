import { useEffect, useState, type ReactNode } from 'react';
import { Symbol } from '../Symbol';
import { AUFGABENARTEN, type Aufgabe } from '../../../shared/src/model';
import { datumDe } from '../../../shared/src/fristen';
import { laeuftAm, type MappenAblauf, type VorlageZumAnwenden } from '../../../shared/src/ablaufvorlagen';
import { Feld, Knopf } from '../bausteine';
import { heuteIn, verschiebe } from '../../../shared/src/sichten';
import { aufgabenBeschriftung, ausNotiz } from '../../../shared/src/mappenansicht';
import { api } from '../api';
import { nameMitAbwesenheit, useDaten } from '../daten';
import { useKonto } from '../konto';
import { Person } from '../Person';
import { Hilfe } from '../Hilfe';
import { rueckfrage } from '../rueckfrage';
import { t, tn } from '../sprache';
import { gebietsschema } from '../../../shared/src/sprache';

/** Aufgaben an einer Mappe (#54): offene als Hinweis über der Mappe; eigene erledigen oder weitergeben. */
const datum = (iso: string) => new Date(iso).toLocaleDateString(gebietsschema(), { dateStyle: 'short' });

/**
 * Person wählen (Aufgabe weitergeben, Erinnerung für …): im Feldrahmen (#1211). `label` steht als Beschriftung da, wenn
 * `sichtbar`; sonst nur für Screenreader (in einer Zeile, deren Text sie schon nennt).
 */
export function BenutzerWahl({ wert, setze, ohne, label, fokus, id, sichtbar, className }: { wert: string; setze: (id: string) => void; ohne?: string | null; label: string; fokus?: boolean; id?: string; sichtbar?: boolean; className?: string }) {
  const d = useDaten();
  return (
    <Feld beschriftung={label} beschriftungVerbergen={!sichtbar} id={id} className={className}>
      <select value={wert} autoFocus={fokus} onChange={(e) => setze(e.target.value)}>
        <option value="">{t('ablage.aufgaben.benutzer-waehlen')}</option>
        {d.personen.filter((p) => p.aktiv !== false && p.id !== ohne).map((p) => <option key={p.id} value={p.id}>{nameMitAbwesenheit(p)}</option>)}
      </select>
    </Feld>
  );
}

type Folge = { aufgabe: Aufgabe; datum: string };

/**
 * Zuweisen von Hand (#798): Darf der Empfänger die Mappe nicht lesen, erst Bescheid sagen – „Trotzdem zuweisen“ oder
 * „Abbrechen“. Rechte vergibt hier niemand; das kann nur der Admin in der Werkbank. Klappt die Prüfung nicht, geht es
 * weiter wie bisher (der Server antwortet dann mit einem Hinweis).
 */
export async function trotzdemZuweisen(mappeId: string, an: string, name: string): Promise<boolean> {
  try { if ((await api.darfLesen(mappeId, an)).lesen) return true; } catch { return true; }
  return rueckfrage({ titel: t('mappen.aufgabe.zuweisen.titel', { name }), text: t('mappen.aufgabe.zuweisen.text', { name }), ja: t('mappen.aufgabe.zuweisen.trotzdem'), nein: t('mappen.aufgabe.zuweisen.abbrechen') });
}

function Zeile({ a, neuLaden, setBestaetigt, setFolge, zuNotizen }: { a: Aufgabe; neuLaden: () => Promise<void>; setBestaetigt: (text: string) => void; setFolge: (f: Folge) => void; zuNotizen?: () => void }) {
  const d = useDaten();
  const { ich, ohneEmpfaenger } = useKonto();
  const [weiter, setWeiter] = useState(false);
  const [an, setAn] = useState('');
  const [fehler, setFehler] = useState<string>();
  // Aufgaben ohne Empfänger (#719): auch beim gewählten Alltags-Benutzer.
  const meine = a.empfaengerId === ich.id || (!a.empfaengerId && ohneEmpfaenger);
  const darf = meine || ich.rolle === 'admin';
  async function tu(f: () => Promise<unknown>, meldung?: string) {
    setFehler(undefined);
    try {
      const r = await f() as { hinweis?: string; folgetermin?: string } | null;
      setWeiter(false); setAn('');
      // Wiederkehrende Frist (#130): nächsten Termin vorschlagen.
      if (r?.folgetermin) setFolge({ aufgabe: a, datum: r.folgetermin });
      // Empfänger darf die Mappe nicht lesen (#127): trotzdem vergeben, aber Bescheid sagen.
      if (meldung || r?.hinweis) setBestaetigt([meldung, r?.hinweis].filter(Boolean).join(' '));
      await neuLaden(); await d.neuLaden();
    } catch (e) { setFehler((e as Error).message); }
  }
  return (
    <li className={meine ? 'meine' : ''}>
      <div className="aufgabentext">
        {/* „Deine Aufgabe:“ (#427) – damit klar ist, dass Erledigt/Weitergeben rechts zur Aufgabe gehören. */}
        <strong>{meine ? aufgabenBeschriftung(a.art, true) : <>{aufgabenBeschriftung(a.art, false)} {a.empfaengerId ? <Person id={a.empfaengerId} /> : t('konten.verwaltende.ohneEmpfaenger')}</>}:</strong> {a.text}
        {a.art === 'frist' && a.datum && <span className={`chip ${a.datum <= heuteIn() ? 'schlecht' : 'warn'}`} title={t('ablage.aufgaben.frist')}>{noch(a.datum)}</span>}
        <span className="leise klein"> {' '}{t('ablage.aufgaben.seit', { AUFGABENARTEN: AUFGABENARTEN[a.art], datum: datum(a.erstellt) })}{a.erstelltVon && <> {' '}{t('ablage.aufgaben.von')}{' '}<Person id={a.erstelltVon} /></>}</span>
      </div>
      {darf && !weiter && (
        <div className="aufgabenaktionen">
          {zuNotizen && ausNotiz(a) && <Knopf art="link" groesse="klein" onClick={zuNotizen}>{t('ablage.aufgaben.zur-notiz')}</Knopf>}
          {/* Automatisch zugeordnet (#337): „Passt“ bestätigt, „Rückgängig“ nimmt die Zuordnung zurück. */}
          {a.art === 'zugeordnet' && <Knopf groesse="klein" onClick={async () => {
            if (await rueckfrage({ titel: t('ablage.aufgaben.zuordnung-rueckgaengig-machen'), text: t('ablage.aufgaben.die-dokumente-kommen-zurueck'), ja: t('ablage.aufgaben.rueckgaengig-machen') })) {
              await tu(() => api.zuordnungRueckgaengig(a.id), t('ablage.aufgaben.zuordnung-rueckgaengig-gemacht-die'));
            }
          }}>{t('ablage.aufgaben.rueckgaengig')}</Knopf>}
          {a.art !== 'passung' && <Knopf groesse="klein" art={a.art === 'zugeordnet' ? 'haupt' : 'neben'} symbol="haken" onClick={() => tu(() => api.aufgabeErledigt(a.id))}>{a.art === 'zugeordnet' ? t('ablage.aufgaben.passt') : t('ablage.aufgaben.erledigt')}</Knopf>}
          <Knopf groesse="klein" onClick={() => setWeiter(true)}>{t('ablage.aufgaben.weitergeben')}</Knopf>
        </div>
      )}
      {darf && weiter && (
        <form className="weitergeben" onSubmit={(e) => { e.preventDefault(); if (an) void (async () => { if (await trotzdemZuweisen(a.mappeId, an, d.person(an))) await tu(() => api.aufgabeDelegieren(a.id, an), t('ablage.aufgaben.an-weitergegeben', { person: d.person(an) })); })(); }}
          onKeyDown={(e) => { if (e.key === 'Escape') { setWeiter(false); setAn(''); } }}>
          <span className="leise klein">{t('ablage.aufgaben.weitergeben-an')}</span>
          <BenutzerWahl label={t('ablage.aufgaben.weitergeben-an')} wert={an} setze={setAn} ohne={a.empfaengerId} fokus />
          <Knopf art="haupt" groesse="klein" type="submit" gesperrt={!an}>{t('ablage.aufgaben.weitergeben')}</Knopf>
          <Knopf art="link" groesse="klein" onClick={() => { setWeiter(false); setAn(''); }}>{t('ablage.aufgaben.abbrechen')}</Knopf>
        </form>
      )}
      {fehler && <p className="fehlertext">{fehler}</p>}
    </li>
  );
}

/** Hinweis über der Mappe mit allen offenen Aufgaben. */
export function AufgabenHinweis({ aufgaben, neuLaden, zuNotizen }: { aufgaben: Aufgabe[]; neuLaden: () => Promise<void>; zuNotizen?: () => void }) {
  const offen = aufgaben.filter((a) => !a.erledigt);
  const [bestaetigt, setBestaetigt] = useState<string>();
  const [folge, setFolge] = useState<Folge>();
  useEffect(() => { if (!bestaetigt) return; const timer = window.setTimeout(() => setBestaetigt(undefined), 6000); return () => window.clearTimeout(timer); }, [bestaetigt]);
  const vorschlag = folge && <Folgetermin f={folge} neuLaden={neuLaden} fertig={(eintrag) => { setFolge(undefined); if (eintrag) setBestaetigt(eintrag); }} />;
  if (!offen.length) return bestaetigt || vorschlag ? <>{vorschlag}{bestaetigt && <div className="hinweis gut" role="status"><p>{bestaetigt}</p></div>}</> : null;
  return (
    <>
      {vorschlag}
      <div className="hinweis warn stapel aufgabenhinweis" role="status">
        <ul>{offen.map((a) => <Zeile key={a.id} a={a} neuLaden={neuLaden} setBestaetigt={setBestaetigt} setFolge={setFolge} zuNotizen={zuNotizen} />)}</ul>
        {bestaetigt && <p className="gutertext klein">{bestaetigt}</p>}
      </div>
    </>
  );
}

/** „noch 12 Tage“, „heute“, „seit 3 Tagen“ bis zur Frist. */
function noch(iso: string): string {
  const tage = Math.round((Date.parse(iso) - Date.parse(heuteIn())) / 86_400_000);
  return tage === 0 ? t('ablage.aufgaben.heute') : tage === 1 ? t('ablage.aufgaben.morgen') : tage > 0 ? t('ablage.aufgaben.noch-tage', { tage }) : tage === -1 ? t('ablage.aufgaben.seit-gestern') : t('ablage.aufgaben.seit-tagen', { wert: -tage });
}

/** Wiederkehrende Frist erledigt (#130): „Datum auf … setzen“ – nie automatisch. */
function Folgetermin({ f, neuLaden, fertig }: { f: Folge; neuLaden: () => Promise<void>; fertig: (meldung?: string) => void }) {
  const d = useDaten();
  const [fehler, setFehler] = useState<string>();
  async function setzen() {
    try { const r = await api.folgetermin(f.aufgabe.id); await neuLaden(); await d.neuLaden(); fertig(r.hinweis ?? t('ablage.aufgaben.naechster-termin-eingetragen', { datumDe: datumDe(f.datum) })); }
    catch (e) { setFehler((e as Error).message); }
  }
  return (
    <div className="hinweis info folgetermin" role="status">
      <p>{tn('ablage.aufgaben.erledigt-der-termin-wiederholt', { b: <strong>{t('ablage.aufgaben.naechsten-termin-auf-setzen', { datumDe: datumDe(f.datum) })}</strong> })}</p>
      <div className="knoepfe">
        <Knopf art="haupt" groesse="klein" onClick={() => setzen()}>{t('ablage.aufgaben.datum-auf-setzen', { datumDe: datumDe(f.datum) })}</Knopf>
        <Knopf art="link" groesse="klein" onClick={() => fertig()}>{t('ablage.aufgaben.nein-danke')}</Knopf>
      </div>
      {fehler && <p className="fehlertext">{fehler}</p>}
    </div>
  );
}

/**
 * Bereich „Geplant“ (#1044, früher die noch nicht fälligen Erinnerungen #131): offene Mappen-Abläufe aus
 * Automatisierungsvorlagen – „Erinnern“, Wiedervorlage und eigene. Ändern und löschen: wer ihn angelegt hat, der
 * Empfänger oder ein Administrator. Angehaltene (Rechte der Person fehlen) stehen mit Grund da.
 */
export function Geplant({ liste, vorlagen = [], neuLaden }: { liste: MappenAblauf[]; vorlagen?: VorlageZumAnwenden[]; neuLaden: () => Promise<void> }) {
  const { ich } = useKonto();
  const [bearbeiten, setBearbeiten] = useState<string>();
  const [fehler, setFehler] = useState<string>();
  if (!liste.length) return null;
  async function loeschen(e: MappenAblauf) {
    try { await api.ablaufLoeschen(e.id); await neuLaden(); } catch (x) { setFehler((x as Error).message); }
  }
  return (
    <div className="hinweis info stapel erinnerungen" role="status" data-anker="mappe.geplant">
      <p className="klein"><strong>{t('ablage.aufgaben.geplant')}</strong></p>
      <ul>{liste.map((e) => {
        const darf = e.erstelltVon === ich.id || e.empfaengerId === ich.id || ich.rolle === 'admin';
        const an = e.empfaengerId ?? e.erstelltVon;
        const vorlage = vorlagen.find((v) => v.kennung === e.vorlage);
        return bearbeiten === e.id
          ? <li key={e.id}><ErinnerungFormular mappeId={e.mappeId} e={e} vorlage={vorlage} neuLaden={neuLaden} schliessen={() => setBearbeiten(undefined)} eingebettet /></li>
          : (
            <li key={e.id}>
              <div className="aufgabentext">{tn('ablage.aufgaben.fuer', { symbol: <Symbol name="erinnern" />, b: <strong>{datumDe(e.datum)}</strong> })}{' '}{an === ich.id ? t('ablage.aufgaben.dich') : <Person id={an} />}: {e.text || e.vorlageName}
                {e.vorlage !== 'erinnern' && <> <span className="chip klein">{e.vorlageName ?? e.vorlage}</span></>}
                {e.angehalten && <> <span className="chip schlecht klein" title={e.angehalten.text}>{t('ablage.aufgaben.angehalten')}</span></>}
              </div>
              {darf && <div className="aufgabenaktionen">
                <Knopf groesse="klein" onClick={() => setBearbeiten(e.id)}>{t('ablage.aufgaben.aendern')}</Knopf>
                <Knopf art="gefahr" groesse="klein" symbol="geloescht" onClick={() => loeschen(e)}
                  rueckfrage={{ titel: e.vorlage === 'erinnern' ? t('ablage.aufgaben.erinnerung-loeschen') : t('ablage.aufgaben.ablauf-loeschen', { name: e.vorlageName ?? e.vorlage }), text: e.text ? `„${e.text}“` : '', ja: t('ablage.aufgaben.loeschen') }}>{t('ablage.aufgaben.loeschen')}</Knopf>
              </div>}
            </li>
          );
      })}</ul>
      {fehler && <p className="fehlertext">{fehler}</p>}
    </div>
  );
}

/**
 * Erinnern (#131) – seit #1044 die Automatisierungsvorlage „Erinnern“ (bzw. die eines Pakets, das sie ersetzt): Datum,
 * Text, für mich oder jemand anderen. Fragt die Vorlage etwas nicht, fehlt das Feld. Auch zum Ändern geplanter Abläufe.
 */
export function ErinnerungFormular({ mappeId, e, vorlage, neuLaden, schliessen, eingebettet }: { mappeId: string; e?: MappenAblauf; vorlage?: VorlageZumAnwenden; neuLaden: () => Promise<void>; schliessen: () => void; eingebettet?: boolean }) {
  const d = useDaten();
  const { ich } = useKonto();
  const fragen = vorlage?.fragen ?? ['datum', 'empfaenger', 'text'];
  const mitText = fragen.includes('text');
  const mitEmpfaenger = fragen.includes('empfaenger');
  const [datum, setDatum] = useState(e?.datum ?? verschiebe(heuteIn(), 7));
  const [text, setText] = useState(e?.text ?? '');
  const [an, setAn] = useState(e?.empfaengerId ?? ich.id);
  const [fehler, setFehler] = useState<string>();
  const [hinweis, setHinweis] = useState<string>();
  async function senden() {
    setFehler(undefined);
    try {
      const x = { datum, ...(mitText ? { text } : {}), ...(mitEmpfaenger ? { empfaengerId: an || undefined } : {}) };
      const r = e ? await api.ablaufAendern(e.id, x) : await api.ablaufAnwenden(mappeId, vorlage?.kennung ?? 'erinnern', x);
      await neuLaden(); await d.neuLaden();
      if (r.hinweis) setHinweis(r.hinweis); else schliessen();
    } catch (x) { setFehler((x as Error).message); }
  }
  const t_ = erinnernTexte(vorlage, !!e);
  const inhalt = (
    <>
      <div className="raster">
        <Feld beschriftung={t('ablage.aufgaben.am')}><input type="date" value={datum} onChange={(x) => setDatum(x.target.value)} /></Feld>
        {mitEmpfaenger && <BenutzerWahl label={t('ablage.aufgaben.fuer-2')} sichtbar wert={an} setze={setAn} />}
        {mitText && <Feld beschriftung={t('ablage.aufgaben.woran')} className="breit"><input value={text} maxLength={500} onChange={(x) => setText(x.target.value)} placeholder={t('ablage.aufgaben.z-b-angebote-vergleichen')} autoFocus /></Feld>}
      </div>
      <p className="leise klein">{t('ablage.aufgaben.am-gewaehlten-tag-steht', { wert: an === ich.id ? '' : t('ablage.aufgaben.des-empfaengers') })}</p>
      {fehler && <p className="fehlertext">{fehler}</p>}
      {hinweis && <div className="hinweis warn"><p>{hinweis}</p></div>}
      <div className="knoepfe">
        {eingebettet && <Knopf art="link" onClick={schliessen}>{t('ablage.aufgaben.abbrechen')}</Knopf>}
        <Knopf art="haupt" gesperrt={!datum || (mitText && !text.trim()) || (mitEmpfaenger && !an)} onClick={senden}>{t_.knopf}</Knopf>
      </div>
    </>
  );
  if (eingebettet) return <div className="erinnerungformular">{inhalt}</div>;
  return (
    <section className="blatt" aria-label={t_.name}>
      <div className="blattkopf zeile-zwischen"><h2 className="h3">{t_.titel}</h2><Knopf art="link" onClick={schliessen}>{t('ablage.aufgaben.schliessen')}</Knopf></div>
      {inhalt}
    </section>
  );
}

/** Beschriftungen des Erinnern-Dialogs: bei „Erinnern“ wie bisher, bei einer anderen Vorlage mit ihrem Namen. */
function erinnernTexte(vorlage: VorlageZumAnwenden | undefined, aendern: boolean): { name: string; titel: ReactNode; knopf: string } {
  const andere = !!vorlage && vorlage.kennung !== 'erinnern';
  const name = vorlage?.name ?? t('ablage.aufgaben.erinnern');
  const knopf = aendern ? (andere ? t('ablage.aufgaben.ablauf-aendern') : t('ablage.aufgaben.erinnerung-aendern')) : name;
  return { name, knopf, titel: andere ? name : tn('ablage.aufgaben.erinnern-2', { hilfe: <Hilfe ort="ablage.erinnern" /> }) };
}

/** Aufgabe von Hand vergeben – seit #1044 die Automatisierungsvorlage „Aufgabe vergeben“ (sofort, genauso schnell). */
export function NeueAufgabe({ mappeId, vorlage, neuLaden, schliessen }: { mappeId: string; vorlage?: VorlageZumAnwenden; neuLaden: () => Promise<void>; schliessen: () => void }) {
  const d = useDaten();
  const fragen = vorlage?.fragen ?? ['empfaenger', 'text'];
  const [an, setAn] = useState('');
  const [text, setText] = useState('');
  const [fehler, setFehler] = useState<string>();
  const [hinweis, setHinweis] = useState<string>();
  const fehlt = (fragen.includes('empfaenger') && !an) || (fragen.includes('text') && !text.trim());
  async function senden() {
    setFehler(undefined);
    if (an && !(await trotzdemZuweisen(mappeId, an, d.person(an)))) return;
    try {
      const r = await api.ablaufAnwenden(mappeId, vorlage?.kennung ?? 'aufgabe_vergeben', { ...(fragen.includes('empfaenger') ? { empfaengerId: an } : {}), ...(fragen.includes('text') ? { text } : {}) });
      await neuLaden(); await d.neuLaden();
      // Empfänger darf die Mappe nicht lesen (#127): Maske offen lassen, Hinweis zeigen.
      if (r.hinweis) { setHinweis(r.hinweis); setText(''); setAn(''); } else schliessen();
    } catch (e) { setFehler((e as Error).message); }
  }
  const titel = vorlage?.name ?? t('ablage.aufgaben.aufgabe-vergeben');
  return (
    <section className="blatt" aria-label={titel}>
      <div className="blattkopf zeile-zwischen"><h2 className="h3">{titel}</h2><Knopf art="link" onClick={schliessen}>{t('ablage.aufgaben.schliessen')}</Knopf></div>
      <div className="raster">
        {fragen.includes('empfaenger') && <BenutzerWahl label={t('ablage.aufgaben.fuer-2')} sichtbar wert={an} setze={setAn} />}
        {fragen.includes('text') && <Feld beschriftung={t('ablage.aufgaben.was-ist-zu-tun')} className="breit"><input value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} placeholder={t('ablage.aufgaben.z-b-bitte-rechnung')} /></Feld>}
      </div>
      <p className="leise klein">{t('ablage.aufgaben.die-mappe-erscheint-beim')}</p>
      {fehler && <p className="fehlertext">{fehler}</p>}
      {hinweis && <div className="hinweis warn" role="status"><p>{hinweis}</p></div>}
      <div className="knoepfe"><Knopf art="haupt" gesperrt={fehlt} onClick={senden}>{titel}</Knopf></div>
    </section>
  );
}

/**
 * Weitere Automatisierungsvorlagen im Menü „Mappe“ (#1044), z. B. „Wiedervorlage“ aus dem Paket Benachrichtigungen: ein
 * kleiner Dialog mit genau den Fragen der Vorlage; was sie nicht fragt, steht als Satz da („Läuft am …“).
 */
export function AblaufFormular({ mappeId, vorlage, neuLaden, schliessen }: { mappeId: string; vorlage: VorlageZumAnwenden; neuLaden: () => Promise<void>; schliessen: () => void }) {
  const d = useDaten();
  const { ich } = useKonto();
  const [an, setAn] = useState(vorlage.wann.art === 'sofort' ? '' : ich.id);
  const [datum, setDatum] = useState(verschiebe(heuteIn(), 7));
  const [text, setText] = useState('');
  const [fehler, setFehler] = useState<string>();
  const [hinweis, setHinweis] = useState<string>();
  const f = vorlage.fragen;
  const am = vorlage.wann.art === 'in' ? laeuftAm(vorlage.wann, heuteIn()) : null;
  const fehlt = (f.includes('empfaenger') && !an) || (f.includes('text') && !text.trim()) || (f.includes('datum') && !datum);
  async function senden() {
    setFehler(undefined);
    if (f.includes('empfaenger') && an && an !== ich.id && !(await trotzdemZuweisen(mappeId, an, d.person(an)))) return;
    try {
      const r = await api.ablaufAnwenden(mappeId, vorlage.kennung, { ...(f.includes('empfaenger') ? { empfaengerId: an } : {}), ...(f.includes('datum') ? { datum } : {}), ...(f.includes('text') ? { text } : {}) });
      await neuLaden(); await d.neuLaden();
      if (r.hinweis) setHinweis(r.hinweis); else schliessen();
    } catch (e) { setFehler((e as Error).message); }
  }
  return (
    <section className="blatt" aria-label={vorlage.name}>
      <div className="blattkopf zeile-zwischen"><h2 className="h3">{vorlage.name}</h2><Knopf art="link" onClick={schliessen}>{t('ablage.aufgaben.schliessen')}</Knopf></div>
      {vorlage.beschreibung && <p className="leise">{vorlage.beschreibung}</p>}
      <div className="raster">
        {f.includes('datum') && <Feld beschriftung={t('ablage.aufgaben.am')}><input type="date" value={datum} onChange={(x) => setDatum(x.target.value)} /></Feld>}
        {f.includes('empfaenger') && <BenutzerWahl label={t('ablage.aufgaben.fuer-2')} sichtbar wert={an} setze={setAn} />}
        {f.includes('text') && <Feld beschriftung={t('ablage.aufgaben.text')} className="breit"><input value={text} maxLength={2000} onChange={(x) => setText(x.target.value)} /></Feld>}
      </div>
      <p className="leise klein">{am ? t('ablage.aufgaben.laeuft-am', { datum: datumDe(am) }) : vorlage.wann.art === 'sofort' ? t('ablage.aufgaben.laeuft-sofort') : t('ablage.aufgaben.laeuft-am-gewaehlten')}</p>
      {fehler && <p className="fehlertext">{fehler}</p>}
      {hinweis && <div className="hinweis warn" role="status"><p>{hinweis}</p></div>}
      <div className="knoepfe"><Knopf art="haupt" gesperrt={fehlt} onClick={senden}>{vorlage.name}</Knopf></div>
    </section>
  );
}
