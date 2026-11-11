import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Symbol } from '../Symbol';
import { fortschrittText } from '../../../shared/src/auftrag';
import { ANREDE_BEISPIEL, ANREDE_NAME, ANREDEN, textDritte, type Anrede } from '../../../shared/src/anrede';
import { AUSKUNFT_PASSWORT_MIN, erwaehnungText, GRUND_MIN, istOffen, istRechteStandard, personenTypen, rechteStandard, tageBisFrist, type AuskunftAuswahl, type AuskunftEintrag, type AuskunftZustand, type AuskunftMappe, type AuskunftStand, type AuskunftVorschau, type Datenschutz } from '../../../shared/src/auskunft';
import { LinkZeile, Zustellen } from './Zustellen';
import { LoeschkonzeptBlatt, verweiseText } from './Loeschkonzept';
import { personenbezug } from '../../../shared/src/loeschkonzept';
import { LoeschprotokollBlatt } from './Loeschprotokoll';
import { BAUM_RICHTUNGEN, kinderVon, type BaumKnoten, type BaumRichtung } from '../../../shared/src/baum';
import { datumText } from '../../../shared/src/archiv';
import { api, type Auftrag, type DatenschutzStand } from '../api';
import { useDaten } from '../daten';
import { Hilfe } from '../Hilfe';
import { geheZu, Link } from '../ort';
import { Listenkopf } from '../Listenkopf';
import { t, tn } from '../sprache';
import { bereichName } from '../../../shared/src/werkbankansicht';
import { rueckfrage } from '../rueckfrage';
import { titelOder } from '../seiten';
import { Mehrfachauswahl } from '../ablage/Mehrfachauswahl';
import { formatiere, type Mappe, type Mappentyp } from '../../../shared/src/model';
import { falte } from '../../../shared/src/suche';
import { Speicherleiste, useEntwurf } from '../Speicherleiste';
import { zeitzone } from '../../../shared/src/region';
import { gebietsschema } from '../../../shared/src/sprache';
import { Knopf, KnopfLink } from '../bausteine';
import { Kopf } from './Kopf';

/**
 * Werkbank → Datenschutz (#396): Auskunft nach Art. 15 DSGVO als ZIP.
 *   1. Betroffenen wählen (Mappentypen „betrifft eine Person“), optional Frist als Aufgabe
 *   2. Sammeln über Verweise (Baum, Tiefe einstellbar, nur über Zugehörigkeit weiter) und prüfen: Häkchen je
 *      Mappe, Dokument, Notiz, Historie; Bezug-Mappen nur als Erwähnung, bewusst ganz aufnehmbar (#472)
 *   3. Erzeugen als Hintergrundauftrag, optional mit Passwort (AES); Download, danach gelöscht
 *   4. Zustellen (#455): per E-Mail (nur verschlüsselt) oder als Abruf-Link mit Abrufcode
 * Unten: bereitliegende Auskünfte, Abruf-Links (Nachweis), Löschkonzept erzeugen (#469), Löschprotokoll (#470) und die Einstellungen (Absender, Rechte, Zwecke je Mappentyp).
 */

const groesse = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB`);
const zeit = (iso: string) => new Date(iso).toLocaleString(gebietsschema(), { dateStyle: 'medium', timeStyle: 'short' });
const heute = () => new Intl.DateTimeFormat('sv-SE', { timeZone: zeitzone() }).format(new Date());

export function useDatenschutz(offen: boolean) {
  const [stand, setStand] = useState<DatenschutzStand | null>(null);
  const [fehler, setFehler] = useState<string>();
  const laden = useCallback(async () => { try { setStand(await api.datenschutz()); setFehler(undefined); } catch (e) { setFehler((e as Error).message); } }, []);
  useEffect(() => { if (offen) void laden(); }, [offen, laden]);
  return { stand, fehler, laden };
}
export type DatenschutzZustand = ReturnType<typeof useDatenschutz>;

/* ---------- Datenschutz-Auskünfte (#668): Liste in der Mitte, rechts eine Auskunft, der Assistent oder die Einstellungen ---------- */

const ZUSTAND_CHIP: Record<AuskunftZustand, string> = { angefragt: 'warn', inArbeit: 'warn', bereit: 'gut', zugestellt: '', abgerufen: '', geloescht: 'aus' };

/** Antwortfrist als kurzer Text („noch 12 Tage“, überfällig rot). */
function FristText({ frist }: { frist: string }) {
  const n = tageBisFrist(frist, heute());
  const text = n > 0 ? t('werkbank.auskunft.frist.noch', { anzahl: n }) : n === 0 ? t('werkbank.auskunft.frist.heute') : t('werkbank.auskunft.frist.ueber', { anzahl: -n });
  return <span className={n < 0 ? 'frist-ueber' : n <= 7 ? 'frist-bald' : ''} title={t('werkbank.auskunft.frist.bis', { datum: datumText(frist) })}>{text}</span>;
}

export function AuskuenfteListe({ z, offen }: { z: DatenschutzZustand; offen?: string }) {
  const [alle, setAlle] = useState(false);
  const [suche, setSuche] = useState('');
  const liste = (z.stand?.verzeichnis ?? []).filter((e) => (alle || istOffen(e.zustand)) && (!suche.trim() || falte(e.titel).includes(falte(suche.trim()))));
  return (
    <>
      <Listenkopf titel={bereichName('auskuenfte')} hilfe="werkbank.auskunft" beschreibung={t('werkbank.auskunft.liste.beschreibung')}>
        <KnopfLink to="/werkbank/auskuenfte/neu" art="anlegen" groesse="klein">{t('werkbank.auskunft.liste.neu')}</KnopfLink>
      </Listenkopf>
      <div className="zeile-umbruch listenfilter">
        <span className="segmente" role="group">
          <button type="button" className={alle ? '' : 'an'} aria-pressed={!alle} onClick={() => setAlle(false)}>{t('werkbank.auskunft.liste.offen')}</button>
          <button type="button" className={alle ? 'an' : ''} aria-pressed={alle} onClick={() => setAlle(true)}>{t('werkbank.auskunft.liste.alle')}</button>
        </span>
        <input type="search" value={suche} placeholder={t('werkbank.auskunft.liste.suche')} aria-label={t('werkbank.auskunft.liste.suche')} onChange={(e) => setSuche(e.target.value)} />
        <Link to="/werkbank/auskuenfte/einstellungen" className={`verweis klein${offen === 'einstellungen' ? ' an' : ''}`}>{t('werkbank.auskunft.liste.einstellungen')}</Link>
      </div>
      {z.fehler && <div className="hinweis schlecht"><p>{z.fehler}</p></div>}
      {!z.stand ? <p className="leise">{t('werkbank.datenschutz.lade')}</p> : !liste.length ? <p className="leise leerliste">{alle ? t('werkbank.auskunft.liste.leer.alle') : t('werkbank.auskunft.liste.leer.offen')}</p> : (
        <ul className="mappenliste">
          {liste.map((e) => (
            <li key={e.id}>
              <Link to={`/werkbank/auskuenfte/${e.id}`} className={`eintrag werk ${offen === e.id ? 'an' : ''}`}>
                <span className="titel">{titelOder(e.titel)}</span>
                <span className="unter">
                  <span className={`chip ${ZUSTAND_CHIP[e.zustand]}`}>{t(`werkbank.auskunft.zustand.${e.zustand}`)}</span>{' '}
                  {zeit(e.zeit)}{e.mappen !== undefined ? ` · ${t('werkbank.auskunft.liste.mappen', { anzahl: e.mappen })}` : ''}
                  {e.frist && istOffen(e.zustand) && <> · <FristText frist={e.frist} /></>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** Rechte Spalte: „neu“ = Assistent, „einstellungen“ = Einstellungen der Auskunft, sonst eine Auskunft (auch Anfrage oder Auftrag). */
export function AuskunftRechts({ z, id }: { z: DatenschutzZustand; id?: string }) {
  const s = z.stand;
  // Alte Links aus der Mappe der Person (/werkbank/datenschutz?mappe=…) führen in den Assistenten.
  const mappe = new URLSearchParams(location.search).get('mappe');
  useEffect(() => { if (!id && mappe) geheZu(`/werkbank/auskuenfte/neu?mappe=${encodeURIComponent(mappe)}`, true); }, [id, mappe]);
  if (!s) return <p className="leise">{z.fehler ?? t('werkbank.datenschutz.lade')}</p>;
  if (id === 'neu') return (
    <div className="einspaltig">
      <Kopf titel={t('werkbank.auskunft.neu.titel')} ueber={bereichName('auskuenfte')} hilfe="werkbank.datenschutz">
        <p className="leise">{t('werkbank.datenschutz.fragt-ein-kunde-mieter')}</p>
      </Kopf>
      <AuskunftErteilen einstellung={s.einstellung} nachher={z.laden} zustellen={(aid) => geheZu(`/werkbank/auskuenfte/${aid}?zustellen=1`)} />
    </div>
  );
  if (id === 'einstellungen') return (
    <div className="einspaltig">
      <div className="mappenkopf"><p className="ueber">{bereichName('auskuenfte')}</p><h1>{t('werkbank.auskunft.einstellungen.titel')}</h1><p className="leise">{t('werkbank.auskunft.einstellungen.text')}</p></div>
      <AuskunftEinstellungen z={z} />
    </div>
  );
  if (!id) return <div className="platzhalter"><p>{t('werkbank.auskunft.rechts.waehlen')}</p></div>;
  const e = s.verzeichnis.find((x) => x.id === id);
  if (!e) return <div className="leer"><p>{t('werkbank.auskunft.rechts.fehlt')}</p></div>;
  return <AuskunftDetail key={e.id} e={e} z={z} />;
}

function AuskunftDetail({ e, z }: { e: AuskunftEintrag; z: DatenschutzZustand }) {
  const s = z.stand!;
  const d = useDaten();
  const [zustellen, setZustellen] = useState(() => new URLSearchParams(location.search).get('zustellen') === '1');
  const [fehler, setFehler] = useState<string>();
  const links = s.links.filter((l) => l.auskunftId === e.id);
  const b = e.bereit;
  return (
    <div className="einspaltig">
      <div className="mappenkopf">
        <p className="ueber">{t('werkbank.auskunft.detail.ueber')}</p>
        <h1>{titelOder(e.titel)}</h1>
        <p><span className={`chip ${ZUSTAND_CHIP[e.zustand]}`}>{t(`werkbank.auskunft.zustand.${e.zustand}`)}</span>{e.frist && istOffen(e.zustand) && <> · <FristText frist={e.frist} /></>}</p>
      </div>
      <section className="blatt">
        <h2 className="h3">{t('werkbank.auskunft.detail.angaben')}</h2>
        <dl className="eigenschaften">
          {e.mappeId && <><dt>{t('werkbank.auskunft.detail.person')}</dt><dd><PersonVerweis id={e.mappeId} titel={e.titel} /></dd></>}
          <dt>{e.art === 'anfrage' ? t('werkbank.auskunft.detail.angefragt') : t('werkbank.auskunft.detail.erstellt')}</dt><dd>{zeit(e.zeit)}</dd>
          {e.frist && <><dt>{t('werkbank.auskunft.detail.frist')}</dt><dd>{datumText(e.frist)}{istOffen(e.zustand) && <> (<FristText frist={e.frist} />)</>}</dd></>}
          {e.mappen !== undefined && <><dt>{t('werkbank.auskunft.detail.inhalt')}</dt><dd>{t('werkbank.auskunft.detail.inhaltText', { mappen: t('werkbank.auskunft.liste.mappen', { anzahl: e.mappen }), dokumente: t('werkbank.auskunft.detail.dokumente', { anzahl: e.dokumente ?? 0 }) })}{b ? `, ${groesse(b.bytes)}` : ''}{e.verschluesselt ? ` · ${t('werkbank.auskunft.detail.passwort')}` : ''}</dd></>}
        </dl>
        {e.art === 'anfrage' && <><p>{t('werkbank.auskunft.detail.anfrage')}</p>
          <p className="knoepfe"><Link to={`/werkbank/auskuenfte/neu?mappe=${encodeURIComponent(e.mappeId ?? '')}`} className="knopf primaer">{t('werkbank.auskunft.detail.erzeugen')}</Link></p></>}
        {e.art === 'auftrag' && <p className="leise">{t('werkbank.auskunft.detail.auftrag')}</p>}
        {e.art === 'auskunft' && (b ? <p className="leise klein">{t('werkbank.auskunft.detail.bis', { zeit: zeit(b.bis) })}</p> : <p className="leise klein">{t('werkbank.auskunft.detail.weg')}</p>)}
        {e.fristAufgabe && e.mappeId && d.typen.length > 0 && <p className="klein"><Link to={`/ablage/eingang/${e.fristAufgabe}`} className="verweis">{t('werkbank.auskunft.detail.aufgabe')}</Link></p>}
        {fehler && <p className="fehlertext">{fehler}</p>}
        {b && (
          <p className="knoepfe">
            <button type="button" className={`knopf${zustellen ? '' : ' primaer'}`} aria-expanded={zustellen} onClick={() => setZustellen(!zustellen)}>{zustellen ? t('werkbank.auskunft.detail.zustellenZu') : t('werkbank.auskunft.detail.zustellen')}</button>
            <a className="knopf" href={`/api/werkbank/auskunft/${b.id}/zip`} onClick={() => window.setTimeout(() => void z.laden(), 3000)}>{t('werkbank.auskunft.detail.herunterladen')}</a>
            <Knopf className="gefahr-rand" onClick={async () => {
              if (!(await rueckfrage({ titel: t('werkbank.auskunft.detail.loeschenFrage'), text: t('werkbank.auskunft.detail.loeschenText', { titel: titelOder(b.titel), zeit: zeit(b.erstellt) }), ja: t('werkbank.auskunft.detail.loeschen'), gefahr: true }))) return;
              try { await api.auskunftLoeschen(b.id); await z.laden(); } catch (x) { setFehler((x as Error).message); }
            }}>{t('werkbank.auskunft.detail.loeschen')}</Knopf>
          </p>
        )}
        {b && zustellen && <Zustellen a={b} s={s} nachher={z.laden} />}
      </section>
      {links.length > 0 && (
        <section className="blatt">
          <h2 className="h3">{t('werkbank.auskunft.detail.links')} <Hilfe ort="werkbank.auskunft.zustellen" /></h2>
          <ul className="auskunft-links">{links.map((l) => <LinkZeile key={l.id} l={l} nachher={z.laden} />)}</ul>
        </section>
      )}
      {e.art === 'auskunft' && (
        <section className="blatt">
          <h2 className="h3">{t('werkbank.auskunft.detail.verlauf')}</h2>
          {!e.verlauf.length ? <p className="leise">{t('werkbank.auskunft.detail.verlaufLeer')}</p> : (
            <ul className="stapel auskunft-verlauf">{e.verlauf.map((v, i) => (
              <li key={i} className={v.erfolg === false ? 'fehlertext' : undefined}><span className="leise klein">{zeit(v.zeit)}{v.von ? ` · ${v.von}` : ''}</span><br />{v.text}</li>
            ))}</ul>
          )}
        </section>
      )}
    </div>
  );
}

/** Verweis auf die Mappe der Person – der Typ kommt aus den geladenen Daten, sonst nur der Titel. */
function PersonVerweis({ id, titel }: { id: string; titel: string }) {
  const [typId, setTypId] = useState<string>();
  useEffect(() => { api.mappe(id).then((x) => setTypId(x.mappe.typId), () => {}); }, [id]);
  return typId ? <Link to={`/ablage/${typId}/${id}`} className="verweis">{titelOder(titel)}</Link> : <span>{titelOder(titel)}</span>;
}

/* ---------- Löschkonzept (#668): eigener Werkbank-Eintrag ---------- */

export function LoeschkonzeptPanel({ z }: { z: DatenschutzZustand }) {
  const s = z.stand;
  if (!s) return <p className="leise">{z.fehler ?? t('werkbank.datenschutz.lade')}</p>;
  return (
    <div className="einspaltig">
      <Kopf titel={t('werkbank.loeschkonzept.titel')} ueber={t('werkbank.datenschutz.werkbank')} hilfe="werkbank.loeschkonzept">
        <p className="leise">{t('werkbank.loeschkonzept.text')}</p>
      </Kopf>
      <LoeschkonzeptBlatt luecken={s.loeschkonzept?.luecken ?? []} />
      <PersonendatenTypen z={z} />
      <LoeschprotokollBlatt />
    </div>
  );
}

/* ---------- Auskunft erteilen ---------- */

/** Steht ein Suchwort nicht im Titel, das erste Feld, in dem es vorkommt („Firma: Muster GmbH“, #667). */
function grundVon(typ: Mappentyp | undefined, m: Mappe, eingabe: string): string | null {
  const woerter = falte(eingabe).split(/\s+/).filter(Boolean);
  if (!typ || !woerter.length || woerter.every((w) => falte(m.titel ?? '').includes(w))) return null;
  for (const f of typ.felder) {
    if (f.typ === 'passwort' || f.typ === 'referenz') continue;
    const text = formatiere(f, m.werte[f.key]);
    if (text && woerter.some((w) => falte(text).includes(w))) return `${f.label}: ${text}`;
  }
  return null;
}

/**
 * Person wählen wie in einem Verweisfeld (#667): gemeinsame Auswahl aus #602, Suche beim Tippen über alle
 * Mappentypen, die eine Person betreffen; je Treffer der Mappentyp und – wenn nicht der Name trifft – das Feld.
 */
function PersonWahl({ typen, waehle }: { typen: Mappentyp[]; waehle(m: { id: string; typId: string; titel: string }): void }) {
  const [eingabe, setEingabe] = useState('');
  const [offen, setOffen] = useState(false);
  const [treffer, setTreffer] = useState<Mappe[] | null>(null);
  const [gesamt, setGesamt] = useState(0);
  const ids = typen.map((mappentyp) => mappentyp.id).join(',');
  useEffect(() => {
    if (!offen) return;
    let aktuell = true;
    const timer = setTimeout(() => {
      Promise.all(ids.split(',').map((id) => api.seite(`typ:${id}`, 0, 20, eingabe.trim())))
        .then((r) => { if (!aktuell) return; setTreffer(r.flatMap((x) => x.mappen).slice(0, 20)); setGesamt(r.reduce((n, x) => n + x.gesamt, 0)); })
        .catch(() => aktuell && setTreffer([]));
    }, 200);
    return () => { aktuell = false; clearTimeout(timer); };
  }, [offen, eingabe, ids]);
  const typ = (id: string) => typen.find((mappentyp) => mappentyp.id === id);
  return (
    <Mehrfachauswahl id="auskunft-person" name={t('werkbank.datenschutz.person')} platzhalter={t('werkbank.datenschutz.suchen', { map: typen.map((mappentyp) => mappentyp.name).join(', ') })}
      eingabe={eingabe} setEingabe={setEingabe} offen={offen} setOffen={setOffen}
      vorschlaege={treffer === null ? null : treffer.map((m) => {
        const grund = grundVon(typ(m.typId), m, eingabe);
        return { id: m.id, text: <span>{titelOder(m.titel)} <span className="leise klein">{typ(m.typId)?.name}{grund ? ` · ${grund}` : ''}</span></span> };
      })}
      leerText={eingabe ? t('werkbank.datenschutz.nichts-gefunden') : t('werkbank.datenschutz.noch-keine-mappe-dieser')}
      fuss={gesamt > (treffer?.length ?? 0) && <p className="leise klein">{t('werkbank.datenschutz.insgesamt-tippe-um-einzugrenzen', { gesamt: gesamt.toLocaleString(gebietsschema()) })}</p>}
      waehle={(id) => { const m = treffer?.find((x) => x.id === id); if (m) waehle({ id: m.id, typId: m.typId, titel: m.titel ?? '' }); }}
      gewaehlt={[]} entferne={() => {}} />
  );
}

interface Wahl { mappen: Set<string>; dokumente: Set<string>; notizen: Set<string>; historie: Set<string>; gruende: Record<string, string>; erwaehnungen: Set<string> }
const LEER: Wahl = { mappen: new Set(), dokumente: new Set(), notizen: new Set(), historie: new Set(), gruende: {}, erwaehnungen: new Set() };

/** Vorgabe: alles an – außer Originalen, zu denen es eine geschwärzte Fassung gibt. */
function vorgabe(inhalte: Record<string, AuskunftMappe>, ids: string[], w: Wahl = LEER): Wahl {
  const n: Wahl = { mappen: new Set(w.mappen), dokumente: new Set(w.dokumente), notizen: new Set(w.notizen), historie: new Set(w.historie), gruende: { ...w.gruende }, erwaehnungen: new Set(w.erwaehnungen) };
  for (const id of ids) {
    const x = inhalte[id]; if (!x) continue;
    n.mappen.add(id); n.historie.add(id);
    for (const d of x.dokumente) if (!d.geschwaerzteFassung) n.dokumente.add(d.id);
    for (const auskunftNotiz of x.notizen) n.notizen.add(auskunftNotiz.id);
  }
  return n;
}

function AuskunftErteilen({ einstellung, nachher, zustellen }: { einstellung: Datenschutz; nachher(): Promise<void>; zustellen(id: string): void }) {
  const d = useDaten();
  const personTypen = personenTypen(einstellung).map((id) => d.typ(id)).filter((eintrag) => !!eintrag);
  const [betroffen, setBetroffen] = useState<{ id: string; typId: string; titel: string } | null>(null);
  const [tiefe, setTiefe] = useState(2);
  const [richtungen, setRichtungen] = useState<BaumRichtung[]>(['verwiesenVon', 'verweistAuf']);
  const [vorschau, setVorschau] = useState<AuskunftVorschau | null>(null);
  const [wahl, setWahl] = useState<Wahl>(LEER);
  const [eingang, setEingang] = useState(heute());
  const [empfaenger, setEmpfaenger] = useState(einstellung.empfaenger);
  const [anmerkung, setAnmerkung] = useState('');
  const [passwort, setPasswort] = useState('');
  const [geprueft, setGeprueft] = useState(false);
  const [auftrag, setAuftrag] = useState<Auftrag | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht' | 'info'; text: string }>();

  // Aus der Mappe („Aktionen → Auskunft erstellen …“) oder einer Anfrage: /werkbank/auskuenfte/neu?mappe=<id>
  useEffect(() => {
    const id = new URLSearchParams(location.search).get('mappe');
    if (!id) return;
    api.mappe(id).then((x) => setBetroffen({ id: x.mappe.id, typId: x.mappe.typId, titel: x.mappe.titel ?? '' }), () => {});
  }, []);
  useEffect(() => {
    if (auftrag?.status !== 'laeuft') return;
    const timer = setInterval(() => void api.auftrag().then((a) => { setAuftrag(a); if (a?.status !== 'laeuft') void nachher(); }), 1000);
    return () => clearInterval(timer);
  }, [auftrag?.status, nachher]);

  async function sammeln() {
    if (!betroffen) return;
    setLaeuft(true); setMeldung(undefined); setVorschau(null); setGeprueft(false); setAuftrag(null);
    try {
      const v = await api.auskunftVorschau({ mappeId: betroffen.id, tiefe, richtungen });
      setVorschau(v);
      // Zugehörige Mappen ganz; Bezug-Mappen (#472) nur als Erwähnung – ganz aufnehmen nur bewusst.
      setWahl({ ...vorgabe(v.mappen, v.baum.knoten.filter((k) => !k.nurBezug).map((k) => k.id)), erwaehnungen: new Set(v.baum.knoten.filter((k) => k.nurBezug).map((k) => k.id)) });
    } catch (e) { setMeldung({ art: 'schlecht', text: (e as Error).message }); } finally { setLaeuft(false); }
  }
  async function frist() {
    if (!betroffen) return;
    try { const a = await api.auskunftFrist({ mappeId: betroffen.id, eingang }); setMeldung({ art: 'gut', text: t('werkbank.datenschutz.aufgabe-angelegt', { text: a.text }) }); }
    catch (e) { setMeldung({ art: 'schlecht', text: (e as Error).message }); }
  }

  const inhalte = useMemo(() => vorschau?.mappen ?? {}, [vorschau]);
  const schalte = (art: 'mappen' | 'dokumente' | 'notizen' | 'historie' | 'erwaehnungen', id: string, an: boolean) => setWahl((w) => { const n = new Set(w[art]); if (an) n.add(id); else n.delete(id); setGeprueft(false); return { ...w, [art]: n }; });
  /** Bezug-Mappe (#472) bewusst ganz aufnehmen – mit Dokumenten, Notizen und allen Angaben. */
  const ganz = (id: string, an: boolean) => {
    setWahl((w) => (an ? vorgabe(inhalte, [id], w) : { ...w, mappen: new Set([...w.mappen].filter((x) => x !== id)) }));
    setGeprueft(false);
  };
  const gewaehlt = [...wahl.mappen].filter((id) => inhalte[id]);
  const auswahl: AuskunftAuswahl = {
    mappen: gewaehlt,
    dokumente: gewaehlt.flatMap((id) => inhalte[id].dokumente.filter((x) => wahl.dokumente.has(x.id)).map((x) => x.id)),
    notizen: gewaehlt.flatMap((id) => inhalte[id].notizen.filter((x) => wahl.notizen.has(x.id)).map((x) => x.id)),
    historie: gewaehlt.filter((id) => wahl.historie.has(id)),
    ohneNotizen: gewaehlt.flatMap((id) => inhalte[id].notizen.filter((x) => !wahl.notizen.has(x.id)).map((x) => ({ id: x.id, grund: wahl.gruende[x.id] ?? '' }))),
    erwaehnungen: [...wahl.erwaehnungen].filter((id) => !wahl.mappen.has(id) && vorschau?.baum.knoten.some((k) => k.id === id && k.nurBezug)),
  };
  const ohneGrund = auswahl.ohneNotizen.filter((x) => x.grund.trim().length < GRUND_MIN).length;
  const pwFehler = passwort && passwort.length < AUSKUNFT_PASSWORT_MIN;
  const bytes = gewaehlt.flatMap((id) => inhalte[id].dokumente).filter((x) => wahl.dokumente.has(x.id)).reduce((s, x) => s + x.groesse, 0);
  const fertig = auftrag?.status === 'fertig' && auftrag.art === 'auskunft' ? auftrag.ergebnis as AuskunftStand : null;

  async function erzeugen() {
    if (!betroffen || !vorschau) return;
    if (!passwort && !(await rueckfrage({ titel: t('werkbank.datenschutz.ohne-passwort-erzeugen'), text: t('werkbank.datenschutz.die-zip-datei-ist'), ja: t('werkbank.datenschutz.ohne-passwort-erzeugen-2') }))) return;
    setMeldung(undefined);
    try { setAuftrag(await api.auskunftStarten({ mappeId: betroffen.id, tiefe, richtungen, auswahl, geprueft, passwort, empfaenger, anmerkung })); }
    catch (e) { setMeldung({ art: 'schlecht', text: (e as Error).message }); }
  }

  const knoten = vorschau?.baum.knoten ?? [];
  const wurzel = knoten[0];
  const zeigeKnoten = (k: BaumKnoten): ReactNode => (k.nurBezug && k.ueber ? (
    <li key={k.id}>
      <div className={`auskunft-mappe ${wahl.erwaehnungen.has(k.id) || wahl.mappen.has(k.id) ? '' : 'aus'}`}>
        <label className="haken"><input type="checkbox" checked={wahl.erwaehnungen.has(k.id) || wahl.mappen.has(k.id)} disabled={wahl.mappen.has(k.id)} onChange={(e) => schalte('erwaehnungen', k.id, e.target.checked)} />
          <span>{erwaehnungText({ typ: k.typ, titel: titelOder(k.titel), feld: k.ueber.feld, richtung: k.ueber.richtung })}{' '}
            <span className="chip" title={t('werkbank.datenschutz.nur-ueber-einen-verweis')}>{t('werkbank.datenschutz.bezug')}</span>{' '}
            <a href={`/ablage/${k.typId}/${k.id}`} className="verweis klein" target="_blank" rel="noreferrer">{t('werkbank.datenschutz.oeffnen')}</a></span></label>
        <label className="haken klein auskunft-ganz"><input type="checkbox" checked={wahl.mappen.has(k.id)} onChange={(e) => ganz(k.id, e.target.checked)} />
          <span>{tn('werkbank.datenschutz.ganz-aufnehmen', { span: <span className="leise">{t('werkbank.datenschutz.mit-dokumenten-notizen-und')}</span> })}</span></label>
        {wahl.mappen.has(k.id) && <MappeEintrag id={k.id} titel={k.titel} typ={k.typ} typId={k.typId} inhalt={inhalte[k.id]} wahl={wahl} schalte={schalte} nurInhalt
          setGrund={(id, g) => setWahl((w) => ({ ...w, gruende: { ...w.gruende, [id]: g } }))} />}
      </div>
    </li>
  ) : (
    <li key={k.id}>
      <MappeEintrag id={k.id} titel={k.titel} typ={k.typ} typId={k.typId} inhalt={inhalte[k.id]} wahl={wahl} schalte={schalte}
        setGrund={(id, g) => setWahl((w) => ({ ...w, gruende: { ...w.gruende, [id]: g } }))}
        info={<>{k.ueber && <span className="leise klein"> · {k.ueber.richtung === 'verwiesenVon' ? t('werkbank.datenschutz.verweist-ueber-darauf', { feld: k.ueber.feld }) : t('werkbank.datenschutz.ueber', { feld: k.ueber.feld })}</span>}
          {k.auchUeber.length > 0 && <span className="chip" title={t('werkbank.datenschutz.diese-mappe-ist-auf')}>↻ {k.auchUeber.length}</span>}
          {k.gesperrt && k.aufbewahrenBis && <span className="chip" title={t('werkbank.datenschutz.archivmodus-aufbewahrungsfrist')}>{tn('werkbank.datenschutz.bis', { symbol: <Symbol name="schloss" />, datumText: datumText(k.aufbewahrenBis) })}</span>}
          {/* Die Frist läuft noch nicht (#1051): gesperrt ohne Datum. */}
          {k.gesperrt && !k.aufbewahrenBis && <span className="chip" title={t('werkbank.datenschutz.archivmodus-aufbewahrungsfrist')}>{tn('werkbank.datenschutz.frist-offen', { symbol: <Symbol name="schloss" /> })}</span>}</>} />
      {kinderVon(vorschau!.baum, k.id).length > 0 && <ul className="auskunft-baum">{kinderVon(vorschau!.baum, k.id).map(zeigeKnoten)}</ul>}
    </li>
  ));

  return (
    <section className="blatt" id="auskunft">
      <h2 className="h3">{t('werkbank.datenschutz.auskunft-erteilen')} <Hilfe ort="werkbank.auskunft" /></h2>
      {!personTypen.length ? (
        <div className="hinweis info"><p>{tn('werkbank.datenschutz.lege-zuerst-unter-fest', { link: <Link to="/werkbank/loeschkonzept#personendaten" className="verweis">{t('werkbank.loeschkonzept.personendaten')}</Link> })}</p></div>
      ) : !betroffen ? (
        <>
          <label className="eigenschaft" htmlFor="auskunft-person"><span>{t('werkbank.datenschutz.1-person-die-nach')}</span></label>
          <PersonWahl typen={personTypen as Mappentyp[]} waehle={(m) => { setBetroffen(m); setVorschau(null); }} />
          <p className="leise klein">{t('werkbank.auskunft.neu.typen')} <Link to="/werkbank/loeschkonzept#personendaten" className="verweis">{t('werkbank.loeschkonzept.personendaten')}</Link>.</p>
        </>
      ) : (
        <>
          {/* Gewählte Person als Eintrag wie im Verweisfeld (#667); „Entfernen“ führt zurück zur Suche. */}
          <Mehrfachauswahl name={t('werkbank.datenschutz.person')} platzhalter="" eingabe="" setEingabe={() => {}} offen={false} setOffen={() => {}} vorschlaege={[]} leerText="" waehle={() => {}} ohneSuche
            className="betroffen"
            gewaehlt={[{ id: betroffen.id, inhalt: <><Link to={`/ablage/${betroffen.typId}/${betroffen.id}`} className="verweis">{titelOder(betroffen.titel)}</Link> <span className="leise klein">{d.typ(betroffen.typId)?.name}</span></>, entfernenText: t('werkbank.datenschutz.entfernen-andere-person-waehlen', { titelOder: titelOder(betroffen.titel) }) }]}
            entferne={() => { setBetroffen(null); setVorschau(null); setAuftrag(null); }} />
          <div className="zeile-umbruch">
            <label className="inline">{t('werkbank.datenschutz.anfrage-eingegangen-am')}{' '}<input type="date" value={eingang} max={heute()} onChange={(e) => setEingang(e.target.value)} /></label>
            <button type="button" className="knopf klein" onClick={() => void frist()} title={t('werkbank.datenschutz.aufgabe-fuer-dich-faellig')}>{t('werkbank.datenschutz.frist-als-aufgabe-anlegen')}</button>
          </div>
          <p className="leise klein">{t('werkbank.datenschutz.2-sammeln-alle-mappen')}</p>
          <div className="zeile-umbruch">
            <label className="inline">{t('werkbank.datenschutz.tiefe')}{' '}<select value={tiefe} onChange={(e) => setTiefe(Number(e.target.value))}>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} {t('werkbank.datenschutz.ebenen', { anzahl: n })}</option>)}</select></label>
            {(Object.keys(BAUM_RICHTUNGEN) as BaumRichtung[]).map((r) => (
              <label key={r} className="haken inline"><input type="checkbox" checked={richtungen.includes(r)} onChange={(e) => setRichtungen(e.target.checked ? [...richtungen, r] : richtungen.filter((x) => x !== r))} /><span>{BAUM_RICHTUNGEN[r]}</span></label>
            ))}
            <button type="button" className="knopf klein primaer" disabled={laeuft || !richtungen.length} onClick={() => void sammeln()}>{laeuft ? t('werkbank.datenschutz.sammle') : vorschau ? t('werkbank.datenschutz.neu-sammeln') : t('werkbank.datenschutz.sammeln')}</button>
          </div>
        </>
      )}
      {meldung && <div className={`hinweis ${meldung.art}`} role="status"><p>{meldung.text}</p></div>}

      {vorschau && wurzel && (
        <>
          <h3 className="h4">{t('werkbank.datenschutz.3-pruefen')}</h3>
          <p className="leise klein">{tn('werkbank.datenschutz.nur-was-angehakt-ist', { wert: vorschau.baum.kreise > 0 && t('werkbank.datenschutz.verweise-fuehren-auf-eine', { anzahl: vorschau.baum.kreise }), wert2: vorschau.baum.abgeschnitten && t('werkbank.datenschutz.es-gibt-mehr-mappen'), wert3: vorschau.baum.tieferMoeglich && t('werkbank.datenschutz.mit-mehr-ebenen-kaemen') })}</p>
          <div className="hinweis warn"><p>{tn('werkbank.datenschutz.enthalten-dokumente-angaben-zu', { b: <strong>{t('werkbank.datenschutz.daten-dritter')}</strong> })}</p></div>
          <ul className="auskunft-baum wurzel">{zeigeKnoten(wurzel)}</ul>
          <h3 className="h4">{t('werkbank.datenschutz.4-erzeugen')}</h3>
          <p>{auswahl.mappen.length} {t('werkbank.datenschutz.mappen', { anzahl: auswahl.mappen.length })}{auswahl.erwaehnungen.length ? t('werkbank.datenschutz.und-erwaehnungen', { anzahl: auswahl.erwaehnungen.length }) : ''}, {auswahl.dokumente.length} {t('werkbank.datenschutz.dokumente', { anzahl: auswahl.dokumente.length })} ({groesse(bytes)}), {auswahl.notizen.length} {t('werkbank.datenschutz.notizen', { anzahl: auswahl.notizen.length })}{auswahl.ohneNotizen.length ? t('werkbank.datenschutz.zurueckgehalten', { ohneNotizen: auswahl.ohneNotizen.length }) : ''}.</p>
          <div className="raster">
            <label className="eigenschaft breit"><span>{tn('werkbank.datenschutz.empfaenger-der-daten', { klein: <small>{t('werkbank.datenschutz.steht-auf-dem-deckblatt')}</small> })}</span><textarea rows={2} value={empfaenger} onChange={(e) => setEmpfaenger(e.target.value)} /></label>
            <label className="eigenschaft breit"><span>{tn('werkbank.datenschutz.anmerkung', { klein: <small>{t('werkbank.datenschutz.optional-steht-auf-dem')}</small> })}</span><textarea rows={2} value={anmerkung} onChange={(e) => setAnmerkung(e.target.value)} /></label>
            <label className="eigenschaft"><span>{tn('werkbank.datenschutz.passwort-fuer-die-zip', { klein: <small>{t('werkbank.datenschutz.optional-aes-256-mindestens', { AUSKUNFT_PASSWORT_MIN })}</small> })}</span>
              <span className="zeile-umbruch"><input type="text" autoComplete="off" spellCheck={false} value={passwort} onChange={(e) => setPasswort(e.target.value)} className="mono" />
                <button type="button" className="knopf klein" onClick={() => setPasswort(zufallsPasswort())}>{t('werkbank.datenschutz.vorschlagen')}</button></span></label>
          </div>
          {pwFehler && <p className="fehlertext klein">{t('werkbank.datenschutz.mindestens-zeichen', { AUSKUNFT_PASSWORT_MIN })}</p>}
          {passwort && !pwFehler && <p className="leise klein">{t('werkbank.datenschutz.teile-das-passwort-getrennt')}</p>}
          <label className="haken"><input type="checkbox" checked={geprueft} onChange={(e) => setGeprueft(e.target.checked)} /><span>{t('werkbank.datenschutz.ich-habe-die-auswahl')}</span></label>
          {ohneGrund > 0 && <p className="fehlertext klein">{t('werkbank.datenschutz.abgewaehlte-notizen-brauchen-eine', { anzahl: ohneGrund })}</p>}
          {auftrag?.status === 'laeuft' && <p className="leise" role="status">{fortschrittText(auftrag)}</p>}
          {auftrag?.status === 'fehler' && <p className="fehlertext" role="alert">{auftrag.fehler}</p>}
          {/* #665: Das Ergebnis steht an der Stelle des Knopfs – darüber verschiebt sich nichts; ein zweites Erzeugen nur über „Neue Auskunft erstellen“. */}
          {fertig ? <AuskunftFertig f={fertig} zustellen={zustellen} nachher={nachher} neu={() => { setAuftrag(null); setGeprueft(false); }} />
            : <div className="knoepfe"><button type="button" className="knopf primaer" disabled={!geprueft || !auswahl.mappen.length || ohneGrund > 0 || !!pwFehler || auftrag?.status === 'laeuft'} onClick={() => void erzeugen()}>
            {auftrag?.status === 'laeuft' ? t('werkbank.datenschutz.wird-erzeugt') : t('werkbank.datenschutz.auskunft-erzeugen')}</button></div>}
        </>
      )}
    </section>
  );
}

const anzahl = (n: number, eins: string, viele: string) => `${n} ${n === 1 ? eins : viele}`;

/** Ergebnis von „Auskunft erzeugen“ (#665): Text und Knöpfe untereinander, Fokus darauf, darunter „Neue Auskunft erstellen“. */
function AuskunftFertig({ f, zustellen, nachher, neu }: { f: AuskunftStand; zustellen(id: string): void; nachher(): Promise<void>; neu(): void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <div className="auskunft-fertig">
      <div ref={ref} tabIndex={-1} className="hinweis gut stapel" role="status">
        <p><strong>{t('werkbank.datenschutz.auskunft-ist-fertig')}</strong> – {anzahl(f.mappen, t('werkbank.datenschutz.mappe'), t('werkbank.datenschutz.mappen-2'))}, {anzahl(f.dokumente, t('werkbank.datenschutz.dokument'), t('werkbank.datenschutz.dokumente-2'))} ({groesse(f.bytes)}){f.verschluesselt ? t('werkbank.datenschutz.mit-passwort') : ''}.</p>
        <p>{t('werkbank.datenschutz.wie-soll-sie-zur')}</p>
        <p className="knoepfe"><button type="button" className="knopf primaer" onClick={() => zustellen(f.id)}>{t('werkbank.datenschutz.zustellen')}</button>
          <a className="knopf" href={`/api/werkbank/auskunft/${f.id}/zip`} onClick={() => window.setTimeout(() => void nachher(), 3000)}>{t('werkbank.datenschutz.herunterladen')}</a></p>
        <p className="leise klein">{t('werkbank.datenschutz.ohne-abruf-link-wird', { zeit: zeit(f.bis) })}</p>
      </div>
      <p><button type="button" className="textknopf klein" onClick={neu}>{t('werkbank.datenschutz.neue-auskunft-erstellen')}</button></p>
    </div>
  );
}

function zufallsPasswort() {
  // 32 gut unterscheidbare Zeichen (ohne I, O, 0, 1): 5 Bit je Zeichen per Bitmaske – gleichverteilt, ohne Modulo-Bias; 16 Zeichen = 80 Bit.
  const z = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const b = crypto.getRandomValues(new Uint8Array(16));
  return [...b].map((x) => z[x & 31]).join('').replace(/(.{4})(?!$)/g, '$1-');
}

function MappeEintrag({ id, titel, typ, typId, inhalt, wahl, schalte, setGrund, info, nurInhalt }: {
  id: string; titel: string; typ: string; typId: string; inhalt?: AuskunftMappe; wahl: Wahl; info?: ReactNode; nurInhalt?: boolean;
  schalte(art: 'mappen' | 'dokumente' | 'notizen' | 'historie' | 'erwaehnungen', id: string, an: boolean): void; setGrund(id: string, g: string): void;
}) {
  const an = wahl.mappen.has(id);
  return (
    <div className={`auskunft-mappe ${an ? '' : 'aus'}`}>
      {!nurInhalt && <label className="haken"><input type="checkbox" checked={an} onChange={(e) => schalte('mappen', id, e.target.checked)} />
        <span><a href={`/ablage/${typId}/${id}`} className="verweis" target="_blank" rel="noreferrer">{titelOder(titel)}</a> <span className="leise klein">{typ}</span>{info}</span></label>}
      {an && inhalt && (
        <div className="auskunft-inhalt">
          {inhalt.dritte.length > 0 && <p className="klein auskunft-dritte">{t('werkbank.datenschutz.daten-dritter-haengt-auch', { dritte: inhalt.dritte.slice(0, 4).join(', '), wert: inhalt.dritte.length > 4 ? ' …' : '' })}</p>}
          {inhalt.dokumente.map((x) => (
            <label key={x.id} className="haken klein"><input type="checkbox" checked={wahl.dokumente.has(x.id)} onChange={(e) => schalte('dokumente', x.id, e.target.checked)} />
              <span><Symbol name="dokument" /> {x.name} <span className="leise">{x.register} · {groesse(x.groesse)}</span>
                {x.geschwaerzt && <span className="chip">{t('werkbank.datenschutz.geschwaerzt')}</span>}
                {x.geschwaerzteFassung && <span className="leise"> {' '}{t('werkbank.datenschutz.geschwaerzte-fassung-vorhanden')}</span>}
                {!x.geschwaerzt && x.schwaerzbar && <> · <a href={`/ablage/${typId}/${id}`} className="verweis" target="_blank" rel="noreferrer" title={t('werkbank.datenschutz.mappe-in-einem-neuen')}>{t('werkbank.datenschutz.schwaerzen')}</a></>}</span></label>
          ))}
          {inhalt.notizen.map((n) => (
            <div key={n.id}>
              <label className="haken klein"><input type="checkbox" checked={wahl.notizen.has(n.id)} onChange={(e) => schalte('notizen', n.id, e.target.checked)} />
                <span><Symbol name="notiz" /> {n.text.length > 120 ? `${n.text.slice(0, 120)} …` : n.text} <span className="leise">{zeit(n.erstellt)}</span></span></label>
              {!wahl.notizen.has(n.id) && <label className="eigenschaft einzug klein"><span>{tn('werkbank.datenschutz.warum-zurueckhalten', { klein: <small>{t('werkbank.datenschutz.pflicht-z-b-interne')}</small> })}</span>
                <input value={wahl.gruende[n.id] ?? ''} maxLength={500} onChange={(e) => setGrund(n.id, e.target.value)} /></label>}
            </div>
          ))}
          {inhalt.historie > 0 && <label className="haken klein"><input type="checkbox" checked={wahl.historie.has(id)} onChange={(e) => schalte('historie', id, e.target.checked)} /><span>{tn('werkbank.datenschutz.historie-eintraege', { anzahl: inhalt.historie, symbol: <Symbol name="historie" /> })}</span></label>}
          {inhalt.ohneFelder.length > 0 && <p className="leise klein">{t('werkbank.datenschutz.nie-enthalten', { ohneFelder: inhalt.ohneFelder.join(', ') })}</p>}
        </div>
      )}
    </div>
  );
}

/* ---------- Einstellungen ---------- */

/** Gemeinsames Speichern: beide Formulare (Auskunft, Personendaten) ändern dieselbe Einstellung, je nur ihren Teil. */
function useDatenschutzForm(z: DatenschutzZustand) {
  const gespeichert = z.stand!.einstellung;
  const [e, setE] = useState<Datenschutz>(gespeichert);
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  useEffect(() => { setE(gespeichert); }, [gespeichert]);
  const ent = useEntwurf(gespeichert, e, { zuruecksetzen: () => { setE(gespeichert); setMeldung(undefined); } });
  async function speichern(teil: (aktuell: Datenschutz) => Datenschutz) {
    setLaeuft(true); setMeldung(undefined);
    try { await api.setzeDatenschutz(teil(gespeichert)); await z.laden(); setMeldung({ art: 'gut', text: t('werkbank.datenschutz.gespeichert') }); }
    catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); } finally { setLaeuft(false); }
  }
  return { e, setE, laeuft, meldung, ent, speichern };
}

/** Einstellungen der Auskunft (#668): Verantwortlicher, Empfänger, Rechte der Person, Anrede. */
function AuskunftEinstellungen({ z }: { z: DatenschutzZustand }) {
  const { e, setE, laeuft, meldung, ent, speichern } = useDatenschutzForm(z);
  return (
    <form className="blatt" id="datenschutz-einstellungen" onSubmit={(x) => { x.preventDefault(); void speichern((g) => ({ ...g, verantwortlicher: e.verantwortlicher, empfaenger: e.empfaenger, rechte: e.rechte, anrede: e.anrede })); }} onKeyDown={ent.tasten}>
      <div className="raster">
        <label className="eigenschaft breit"><span>{tn('werkbank.datenschutz.verantwortlicher', { klein: <small>{t('werkbank.datenschutz.name-und-anschrift-steht')}</small> })}</span><textarea rows={3} value={e.verantwortlicher} onChange={(x) => setE({ ...e, verantwortlicher: x.target.value })} /></label>
        <label className="eigenschaft breit"><span>{tn('werkbank.datenschutz.empfaenger', { klein: <small>{t('werkbank.datenschutz.vorschlag-fuer-jede-auskunft')}</small> })}</span><textarea rows={2} value={e.empfaenger} onChange={(x) => setE({ ...e, empfaenger: x.target.value })} /></label>
        <label className="eigenschaft breit"><span>{tn('werkbank.datenschutz.rechte-der-person', { klein: <small>{t('werkbank.datenschutz.text-auf-dem-deckblatt')}</small> })}</span><textarea rows={4} value={e.rechte} onChange={(x) => setE({ ...e, rechte: x.target.value })} /></label>
      </div>
      <AnredeWahl anrede={e.anrede} setAnrede={(anrede) => setE({ ...e, anrede, rechte: istRechteStandard(e.rechte) ? rechteStandard(anrede) : e.rechte })} />
      {meldung && <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">{meldung.text}</p>}
      <Speicherleiste ent={ent} gegenstand={t('werkbank.datenschutz.einstellungen')} sendet={laeuft} />
    </form>
  );
}

/**
 * Personendaten in Mappentypen (#668, beim Löschkonzept): betrifft eine Person, Zweck. Typen, die über ein
 * Verweisfeld auf einen Personen-Typ zeigen, sind als solche gekennzeichnet (#664); Typen ohne Personendaten
 * stehen eingeklappt darunter.
 */
function PersonendatenTypen({ z }: { z: DatenschutzZustand }) {
  const d = useDaten();
  const { e, setE, laeuft, meldung, ent, speichern } = useDatenschutzForm(z);
  const typen = d.typen.filter((mappentyp) => mappentyp.system !== 'benutzer' && mappentyp.system !== 'rolle');
  const typ = (id: string) => e.typen[id] ?? { person: false, zweck: '' };
  const bezug = useMemo(() => personenbezug(d.typen, { typen: e.typen }), [d.typen, e.typen]);
  const zeile = (ty: Mappentyp) => {
    const b = bezug.get(ty.id);
    const automatisch = b?.bezug === 'verweis' && !typ(ty.id).person;
    return (
      <li key={ty.id}>
        <label className="haken" title={automatisch ? t('werkbank.loeschkonzept.automatischTitel') : undefined}>
          <input type="checkbox" checked={typ(ty.id).person} onChange={(x) => setE({ ...e, typen: { ...e.typen, [ty.id]: { ...typ(ty.id), person: x.target.checked } } })} />
          <span>{ty.name} <span className="leise klein">{automatisch ? t('werkbank.loeschkonzept.automatisch', { verweise: verweiseText(b!.verweise) }) : t('werkbank.loeschkonzept.betrifftPerson')}{ty.archiv ? ` · ${t('werkbank.loeschkonzept.aufbewahrung', { jahre: ty.archiv.jahre })}` : ''}</span></span></label>
        <label className="eigenschaft einzug klein"><span>{t('werkbank.loeschkonzept.zweck')}</span><input id={`zweck-${ty.id}`} value={typ(ty.id).zweck} maxLength={500} placeholder={t('werkbank.loeschkonzept.zweckBeispiel')} onChange={(x) => setE({ ...e, typen: { ...e.typen, [ty.id]: { ...typ(ty.id), zweck: x.target.value } } })} /></label>
      </li>
    );
  };
  // Aufteilen nach dem gespeicherten Stand – sonst springt eine Zeile beim Tippen in die andere Liste.
  const gespeichert = z.stand?.einstellung.typen;
  const gruppe = useMemo(() => personenbezug(d.typen, { typen: gespeichert ?? {} }), [d.typen, gespeichert]);
  const mit = typen.filter((ty) => gruppe.has(ty.id));
  const ohne = typen.filter((ty) => !gruppe.has(ty.id));
  return (
    <form className="blatt" id="personendaten" onSubmit={(x) => { x.preventDefault(); void speichern((g) => ({ ...g, typen: e.typen })); }} onKeyDown={ent.tasten}>
      <h2 className="h3">{t('werkbank.loeschkonzept.personendaten')}</h2>
      <p className="leise klein">{t('werkbank.loeschkonzept.personendatenText')}</p>
      {mit.length > 0 && <ul className="stapel auskunft-typen">{mit.map(zeile)}</ul>}
      {ohne.length > 0 && (
        <details className="weitere-typen" open={mit.length === 0}>
          <summary>{t('werkbank.loeschkonzept.weitere')} ({ohne.length})</summary>
          <ul className="stapel auskunft-typen">{ohne.map(zeile)}</ul>
        </details>
      )}
      <p className="leise klein">{t('werkbank.loeschkonzept.verantwortlicher')} <Link to="/werkbank/auskuenfte/einstellungen" className="verweis">{t('werkbank.auskunft.einstellungen.titel')}</Link></p>
      {meldung && <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">{meldung.text}</p>}
      <Speicherleiste ent={ent} gegenstand={t('werkbank.datenschutz.personendaten')} sendet={laeuft} />
    </form>
  );
}

/**
 * Anrede in Unterlagen für Dritte (#474): du oder Sie für alles, was an die Person geht – Deckblatt, Übersicht,
 * LIESMICH, Abrufseite, E-Mails. Die Oberfläche bleibt beim „du“. Vorschau: ein Satz in beiden Formen.
 */
function AnredeWahl({ anrede, setAnrede }: { anrede: Anrede; setAnrede(a: Anrede): void }) {
  return (
    <fieldset className="anrede-dritte" id="anrede">
      <legend>{tn('werkbank.datenschutz.anrede-in-unterlagen-fuer', { hilfe: <Hilfe ort="werkbank.datenschutz.anrede" /> })}</legend>
      <p className="leise klein">{t('werkbank.datenschutz.gilt-fuer-alles-was')}</p>
      <div className="anrede-dritte-wahl" role="radiogroup" aria-label={t('werkbank.datenschutz.anrede')}>
        {ANREDEN.map((a) => (
          <label key={a} className={`anrede-dritte-form${a === anrede ? ' gewaehlt' : ''}`}>
            <span className="anrede-dritte-kopf"><input type="radio" name="anrede-dritte" checked={a === anrede} onChange={() => setAnrede(a)} /><strong>{ANREDE_NAME[a]}</strong>{a === 'du' && <span className="leise klein"> {' '}{t('werkbank.datenschutz.vorgabe')}</span>}</span>
            <q className="klein">{textDritte(a, ANREDE_BEISPIEL)}</q>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
