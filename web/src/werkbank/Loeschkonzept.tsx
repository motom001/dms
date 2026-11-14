import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Datenschutz } from '../../../shared/src/auskunft';
import { personenbezug, type Luecke, type Personenbezug, type Personenverweis } from '../../../shared/src/loeschkonzept';
import type { Mappentyp } from '../../../shared/src/model';
import { datenschutzApi } from '../api/datenschutz';
import { Feld, HakenFeld, Knopf, KnopfLink, liesOffen, merkeOffen } from '../bausteine';
import { useDaten } from '../daten';
import { Hilfe } from '../Hilfe';
import { Link } from '../ort';
import { Speicherleiste, useEntwurf } from '../Speicherleiste';
import { t } from '../sprache';
import type { DatenschutzZustand } from './Datenschutz';
import { Kopf } from './Kopf';

/** „über „Inhaber“ auf Person“, mehrere mit „und“ (#664). */
export function verweiseText(v: Personenverweis[]) {
  const teile = v.map((x) => t('werkbank.loeschkonzept.verweis', { feld: x.feld, ziel: x.ziel }));
  return teile.length <= 1 ? teile.join('') : `${teile.slice(0, -1).join(', ')} ${t('werkbank.loeschkonzept.und')} ${teile[teile.length - 1]}`;
}

/** Grund als Satzteil nach „weil …“ (#664). */
export function grundSatz(b: Pick<Personenbezug, 'bezug' | 'verweise'>) {
  return b.bezug === 'person' ? t('werkbank.loeschkonzept.grundPerson')
    : b.bezug === 'verweis' ? t('werkbank.loeschkonzept.grundVerweis', { verweise: verweiseText(b.verweise) })
    : t('werkbank.loeschkonzept.grundZweck');
}

/** Springt zum Zweck-Feld eines Mappentyps unter „Personendaten in Mappentypen“ und setzt den Fokus. */
function zumZweck(typId: string) {
  const feld = document.getElementById(`zweck-${typId}`) as HTMLInputElement | null;
  if (!feld) return;
  // Steht der Mappentyp in einem zugeklappten Abschnitt (#1184), erst aufklappen.
  const abschnitt = feld.closest('details');
  if (abschnitt && !abschnitt.open) abschnitt.open = true;
  feld.scrollIntoView({ behavior: 'smooth', block: 'center' });
  feld.focus({ preventScroll: true });
}

/** Zusammenfassung oben (#1184): Mappentypen mit Personendaten, vollständig bzw. mit Lücken. */
export interface Zusammenfassung { voll: number; luecken: number }

/**
 * Werkbank → Datenschutz → Löschkonzept (#469, eigener Eintrag seit #668, Gruppe Datenschutz seit #1184): oben die
 * Zusammenfassung („16 vollständig · 3 mit Lücken“) mit „Als PDF erzeugen“ und Word, darunter, was zu ergänzen ist – je
 * Mappentyp eine Zeile mit Grund und Knöpfen (#664); im Dokument steht es als [Platzhalter].
 */
export function LoeschkonzeptBlatt({ luecken, zusammenfassung }: { luecken: Luecke[]; zusammenfassung: Zusammenfassung }) {
  return (
    <section className="blatt" id="loeschkonzept">
      <h2 className="h3">{t('werkbank.loeschkonzept.loeschkonzept')} <Hilfe ort="werkbank.loeschkonzept" /></h2>
      <p data-anker="werkbank.loeschkonzept.zusammenfassung"><strong>{zusammenfassung.voll + zusammenfassung.luecken
        ? t('werkbank.loeschkonzept.zusammenfassung', { voll: zusammenfassung.voll, luecken: zusammenfassung.luecken })
        : t('werkbank.loeschkonzept.zusammenfassung.ohne')}</strong></p>
      <p className="knoepfe">
        <a className="knopf primaer" href="/api/werkbank/datenschutz/loeschkonzept?format=pdf">{t('werkbank.loeschkonzept.als-pdf-erzeugen')}</a>
        <a className="knopf" href="/api/werkbank/datenschutz/loeschkonzept?format=docx">{t('werkbank.loeschkonzept.als-word-datei-docx')}</a>
      </p>
      <p className="leise klein">{t('werkbank.loeschkonzept.ablago-fuellt-die-vorlage')}</p>
      <p className="leise klein">{t('werkbank.loeschkonzept.wann')}</p>
      {luecken.length > 0 && (
        <div className="hinweis info stapel" role="region" aria-label={t('werkbank.loeschkonzept.ergaenzen')}>
          <p><strong>{t('werkbank.loeschkonzept.ergaenzen')}</strong> – {t('werkbank.loeschkonzept.fertig')}</p>
          <ul className="stapel loeschkonzept-luecken">{luecken.map((l, i) => (
            <li key={l.typId ?? `${l.art}-${i}`}>
              {l.art === 'typ' ? <>
                <span><strong>{l.typ}</strong>{t('werkbank.loeschkonzept.luecke', {
                  grund: grundSatz(l),
                  fehlt: l.fehlt.map((f) => t(f === 'zweck' ? 'werkbank.loeschkonzept.fehltZweck' : 'werkbank.loeschkonzept.fehltFrist')).join(' · '),
                })}</span>
                <span className="knoepfe klein">
                  {l.fehlt.includes('zweck') && <Knopf groesse="klein" onClick={() => zumZweck(l.typId)}>{t('werkbank.loeschkonzept.zweckEintragen')}</Knopf>}
                  {l.fehlt.includes('frist') && <KnopfLink to={`/werkbank/typen/${l.typId}#archiv`} groesse="klein">{t('werkbank.loeschkonzept.fristFestlegen')}</KnopfLink>}
                </span>
              </> : l.art === 'verantwortlicher'
                ? <Link to="/werkbank/organisation" className="verweis">{l.text}</Link>
                : <a href="#personendaten" className="verweis">{l.text}</a>}
            </li>
          ))}</ul>
          {luecken.some((l) => l.art === 'typ' && l.fehlt.includes('frist')) && <p className="leise klein">{t('werkbank.loeschkonzept.fristHinweis')}</p>}
        </div>
      )}
    </section>
  );
}

/** Mappentypen mit einer Lücke im Löschkonzept (Zweck oder Frist fehlt). */
const typenMitLuecke = (luecken: Luecke[]) => new Set(luecken.flatMap((l) => (l.art === 'typ' ? [l.typId] : [])));

/** Mappentypen für die Personendaten: ohne die Systemtypen Benutzer und Rolle. */
const personenTypenAus = (typen: Mappentyp[]) => typen.filter((x) => x.system !== 'benutzer' && x.system !== 'rolle');

export function LoeschkonzeptPanel({ z }: { z: DatenschutzZustand }) {
  const d = useDaten();
  const s = z.stand;
  const luecken = useMemo(() => s?.loeschkonzept?.luecken ?? [], [s]);
  const zusammenfassung = useMemo(() => {
    const mit = personenTypenAus(d.typen).filter((x) => personenbezug(d.typen, { typen: s?.einstellung.typen ?? {} }).has(x.id));
    const offen = typenMitLuecke(luecken);
    return { voll: mit.filter((x) => !offen.has(x.id)).length, luecken: mit.filter((x) => offen.has(x.id)).length };
  }, [d.typen, s, luecken]);
  if (!s) return <p className="leise">{z.fehler ?? t('werkbank.datenschutz.lade')}</p>;
  return (
    <div className="einspaltig">
      <Kopf titel={t('werkbank.loeschkonzept.titel')} ueber={t('werkbank.gruppe.datenschutz')} hilfe="werkbank.loeschkonzept">
        <p className="leise">{t('werkbank.loeschkonzept.text')} <Link to="/werkbank/loeschprotokoll" className="verweis">{t('werkbank.loeschkonzept.zum-protokoll')}</Link></p>
      </Kopf>
      <LoeschkonzeptBlatt luecken={luecken} zusammenfassung={zusammenfassung} />
      <PersonendatenTypen z={z} luecken={luecken} />
    </div>
  );
}

/** Speichern der Personendaten: ändert nur ihren Teil der Datenschutz-Einstellung (Zwecke je Mappentyp). */
function useDatenschutzForm(z: DatenschutzZustand) {
  const gespeichert = z.stand!.einstellung;
  const [e, setE] = useState<Datenschutz>(gespeichert);
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  useEffect(() => { setE(gespeichert); }, [gespeichert]);
  const ent = useEntwurf(gespeichert, e, { zuruecksetzen: () => { setE(gespeichert); setMeldung(undefined); } });
  async function speichern(teil: (aktuell: Datenschutz) => Datenschutz) {
    setLaeuft(true); setMeldung(undefined);
    try { await datenschutzApi.setzeDatenschutz(teil(gespeichert)); await z.laden(); setMeldung({ art: 'gut', text: t('werkbank.datenschutz.gespeichert') }); }
    catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); } finally { setLaeuft(false); }
  }
  return { e, setE, laeuft, meldung, ent, speichern };
}

/** Abschnitte der Personendaten (#1184): mit Lücken, vollständig, ohne Personendaten. */
type Abschnitt = 'luecken' | 'voll' | 'ohne';
/** Vorgabe: nur die Mappentypen mit Lücken offen – dort ist etwas zu tun. */
const VORGABE_OFFEN: Abschnitt[] = ['luecken'];

/** Welche Abschnitte offen sind – gemerkt auf diesem Gerät (wie die Bereiche der Editoren). */
function useAbschnitte() {
  const [offen, setOffen] = useState<Set<Abschnitt>>(() => new Set(liesOffen<Abschnitt>('loeschkonzept', 'personendaten') ?? VORGABE_OFFEN));
  const setze = (a: Abschnitt, an: boolean) => setOffen((x) => {
    if (x.has(a) === an) return x;
    const n = new Set(x); if (an) n.add(a); else n.delete(a);
    merkeOffen('loeschkonzept', 'personendaten', n);
    return n;
  });
  return { offen, setze };
}

function Abschnitt({ name, titel, anzahl, abschnitte, children }: { name: Abschnitt; titel: string; anzahl: number; abschnitte: ReturnType<typeof useAbschnitte>; children: ReactNode }) {
  if (!anzahl) return null;
  return (
    <details className="weitere-typen" id={`personendaten-${name}`} open={abschnitte.offen.has(name)} onToggle={(x) => abschnitte.setze(name, x.currentTarget.open)}>
      <summary>{titel} ({anzahl})</summary>
      {children}
    </details>
  );
}

/**
 * Personendaten in Mappentypen (#668, beim Löschkonzept): betrifft eine Person, Zweck. Typen, die über ein
 * Verweisfeld auf einen Personen-Typ zeigen, sind als solche gekennzeichnet (#664). Seit #1184 in drei Abschnitten:
 * aufgeklappt nur die Mappentypen mit Lücken, vollständige und solche ohne Personendaten zugeklappt; der Zustand je
 * Abschnitt bleibt auf diesem Gerät.
 */
function PersonendatenTypen({ z, luecken }: { z: DatenschutzZustand; luecken: Luecke[] }) {
  const d = useDaten();
  const { e, setE, laeuft, meldung, ent, speichern } = useDatenschutzForm(z);
  const abschnitte = useAbschnitte();
  const typen = personenTypenAus(d.typen);
  const typ = (id: string) => e.typen[id] ?? { person: false, zweck: '' };
  const bezug = useMemo(() => personenbezug(d.typen, { typen: e.typen }), [d.typen, e.typen]);
  const zeile = (ty: Mappentyp) => {
    const b = bezug.get(ty.id);
    const automatisch = b?.bezug === 'verweis' && !typ(ty.id).person;
    return (
      <li key={ty.id}>
        <HakenFeld beschriftung={<>{ty.name} <span className="leise klein">{automatisch ? t('werkbank.loeschkonzept.automatisch', { verweise: verweiseText(b!.verweise) }) : t('werkbank.loeschkonzept.betrifftPerson')}{ty.archiv ? ` · ${t('werkbank.loeschkonzept.aufbewahrung', { jahre: ty.archiv.jahre })}` : ''}</span></>}
          hinweis={automatisch ? t('werkbank.loeschkonzept.automatischTitel') : undefined}>
          <input type="checkbox" checked={typ(ty.id).person} onChange={(x) => setE({ ...e, typen: { ...e.typen, [ty.id]: { ...typ(ty.id), person: x.target.checked } } })} />
        </HakenFeld>
        <Feld beschriftung={t('werkbank.loeschkonzept.zweck')} className="einzug klein">
          <input id={`zweck-${ty.id}`} value={typ(ty.id).zweck} maxLength={500} placeholder={t('werkbank.loeschkonzept.zweckBeispiel')} onChange={(x) => setE({ ...e, typen: { ...e.typen, [ty.id]: { ...typ(ty.id), zweck: x.target.value } } })} />
        </Feld>
      </li>
    );
  };
  // Aufteilen nach dem gespeicherten Stand – sonst springt eine Zeile beim Tippen in die andere Liste.
  const gespeichert = z.stand?.einstellung.typen;
  const gruppe = useMemo(() => personenbezug(d.typen, { typen: gespeichert ?? {} }), [d.typen, gespeichert]);
  const offen = typenMitLuecke(luecken);
  const mit = typen.filter((ty) => gruppe.has(ty.id));
  const liste = (x: Mappentyp[]) => <ul className="stapel auskunft-typen">{x.map(zeile)}</ul>;
  return (
    <form className="blatt" id="personendaten" onSubmit={(x) => { x.preventDefault(); void speichern((g) => ({ ...g, typen: e.typen })); }} onKeyDown={ent.tasten}>
      <h2 className="h3">{t('werkbank.loeschkonzept.personendaten')}</h2>
      <p className="leise klein">{t('werkbank.loeschkonzept.personendatenText')}</p>
      <Abschnitt name="luecken" titel={t('werkbank.loeschkonzept.mit-luecken')} anzahl={mit.filter((ty) => offen.has(ty.id)).length} abschnitte={abschnitte}>{liste(mit.filter((ty) => offen.has(ty.id)))}</Abschnitt>
      <Abschnitt name="voll" titel={t('werkbank.loeschkonzept.vollstaendig')} anzahl={mit.filter((ty) => !offen.has(ty.id)).length} abschnitte={abschnitte}>{liste(mit.filter((ty) => !offen.has(ty.id)))}</Abschnitt>
      <Abschnitt name="ohne" titel={t('werkbank.loeschkonzept.weitere')} anzahl={typen.filter((ty) => !gruppe.has(ty.id)).length} abschnitte={abschnitte}>{liste(typen.filter((ty) => !gruppe.has(ty.id)))}</Abschnitt>
      <p className="leise klein">{t('werkbank.loeschkonzept.verantwortlicher')} <Link to="/werkbank/organisation" className="verweis">{t('werkbank.datenschutz.zur-organisation')}</Link></p>
      {meldung && <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">{meldung.text}</p>}
      <Speicherleiste ent={ent} gegenstand={t('werkbank.datenschutz.personendaten')} sendet={laeuft} />
    </form>
  );
}
