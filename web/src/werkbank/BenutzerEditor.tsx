import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { geraetText, istGeradeAktiv, KEINE_ABWESENHEIT, type Abwesenheit, type Benutzer, type Sitzung } from '../../../shared/src/model';
import { GESAMT, verwaltungsbaum } from '../../../shared/src/verwaltungsrecht';
import { bereichName } from '../../../shared/src/werkbankansicht';
import { gebietsschema } from '../../../shared/src/sprache';
import { AbwesenheitFelder, AufgabenUebergeben, uebergebenText } from '../profil/Abwesenheit';
import { kontoApi, type LinkErgebnis } from '../api/konto';
import { t, tn } from '../sprache';
import { useDaten } from '../daten';
import { useKonto } from '../konto';
import { geheZu, Link, loeseWache } from '../ort';
import { Speicherleiste, useEntwurf } from '../Speicherleiste';
import { Hilfe } from '../Hilfe';
import { Symbol } from '../Symbol';
import { rueckfrage } from '../rueckfrage';
import { Bereich, Feld, FeldGruppe, HakenFeld, Knopf, useBereiche, type BereicheZustand, type BereichListe } from '../bausteine';
import { WasSiehtBlatt } from './Berechtigungen';
import { PasskeysVon, ZweifaktorVon } from './AnmeldemittelVon';

/**
 * Werkbank → Benutzer, rechte Spalte (#1000): Sprungleiste und Bereiche wie beim Mappentyp, ein Speichern für Name,
 * Rollen, Verwaltungsrecht und Vertretung. Was sofort wirkt, bleibt sofort: Passwort-Link, Zwei-Faktor und Passkeys
 * zurücksetzen, Geräte abmelden, Aufgaben übergeben, Fehler nachstellen, sperren und wieder freigeben.
 */

export const datumZeit = (iso: string | null) => (iso ? new Date(iso).toLocaleString(gebietsschema(), { dateStyle: 'medium', timeStyle: 'short' }) : t('werkbank.benutzer.noch-nie'));
export const status = (b: Benutzer) => (!b.aktiv ? { text: t('werkbank.benutzer.status.deaktiviert'), art: '' } : !b.hatPasswort ? { text: t('werkbank.benutzer.status.eingeladen'), art: 'warn' } : { text: t('werkbank.benutzer.status.aktiv'), art: 'gut' });

type RolleEintrag = { id: string; name: string; system: boolean };

/** Rollen für die Auswahl; „weitere“ sind die selbst angelegten (ohne die Systemrolle Mitglied). */
function useRollen() {
  const d = useDaten();
  const [rollen, setRollen] = useState<RolleEintrag[] | null>(null);
  useEffect(() => { kontoApi.rollen().then(setRollen).catch(() => setRollen([])); }, [d.stand]);
  return { weitere: (rollen ?? []).filter((r) => !r.system), geladen: rollen !== null, typ: d.typen.find((mappentyp) => mappentyp.system === 'rolle') };
}

/** Rollen als Haken; die Systemrolle Mitglied hat jeder. Verwalten ist keine Rolle (#818), sondern ein Recht. */
export function WeitereRollen({ gewaehlt, setze, sperre }: { gewaehlt: string[]; setze: (ids: string[]) => void; sperre?: boolean }) {
  const r = useRollen();
  return (
    <FeldGruppe beschriftung={t('werkbank.benutzer.rollen')} hinweis={t('werkbank.benutzer.z-b-als-verantwortliche')} className="rollenwahl">
      <div className="haken-untereinander">
        {r.geladen && !r.weitere.length && <p className="leise klein">{t('werkbank.benutzer.noch-keine-rollen-angelegt')}</p>}
        {r.weitere.map((x) => (
          <label key={x.id} className="haken"><input type="checkbox" disabled={sperre} checked={gewaehlt.includes(x.id)}
            onChange={(e) => setze(e.target.checked ? [...gewaehlt, x.id] : gewaehlt.filter((y) => y !== x.id))} /><span>{x.name}</span></label>
        ))}
        {r.typ && <Link to={`/ablage/${r.typ.id}`} className="verweis klein">{t('werkbank.benutzer.rollen-in-der-ablage')}</Link>}
      </div>
    </FeldGruppe>
  );
}

/** Bereiche eines Benutzers (#1000). „Zugang“ fehlt bei dir selbst, solange du aktiv bist – dort gäbe es nichts zu tun. */
export type BenutzerBereich = 'grunddaten' | 'rechte' | 'vertretung' | 'sicherheit' | 'zugang';
export function benutzerBereiche(mitZugang: boolean): BereichListe<BenutzerBereich> {
  return [
    ['grunddaten', t('werkbank.benutzer.bereich.grunddaten')], ['rechte', t('werkbank.benutzer.bereich.rechte')], ['vertretung', t('werkbank.benutzer.bereich.vertretung')],
    ['sicherheit', t('werkbank.benutzer.bereich.sicherheit')], ...(mitZugang ? [['zugang', t('werkbank.benutzer.bereich.zugang')] as const] : []),
  ];
}

/** Was die Speicherleiste des Benutzers speichert. Verwaltungsrechte sortiert, damit die Reihenfolge nichts ändert. */
interface Entwurf { name: string; rollen: string[]; verwaltung: string[]; abwesenheit: Abwesenheit }
const entwurfVon = (b: Benutzer): Entwurf => ({ name: b.name, rollen: [...(b.rollen ?? [])].sort(), verwaltung: [...(b.verwaltung ?? [])].sort(), abwesenheit: b.abwesenheit ?? KEINE_ABWESENHEIT });
/** Kurzinfo „Rollen und Rechte“: das Verwaltungsrecht, sonst die Zahl der Rollen. */
const rechteKurz = (e: Entwurf) => (!e.verwaltung.length ? t('werkbank.benutzer.bereich.rechte.kurz', { anzahl: e.rollen.length })
  : e.verwaltung.includes(GESAMT) ? t('werkbank.verwaltungsrecht.chip.gesamt') : t('werkbank.verwaltungsrecht.chip.teil'));
/** Kurzinfo „Vertretung“: wer vertritt, sonst „nicht abwesend“. */
const vertretungKurz = (a: Abwesenheit, person: (id: string | null) => string) => (a.an ? t('werkbank.benutzer.vertreten-durch', { person: person(a.vertreterId) }) : t('werkbank.benutzer.bereich.vertretung.aus'));
const gleich = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Teile, die „Benutzer speichern“ einzeln schickt – für die Meldung, was gespeichert ist und was nicht. */
type Teil = 'name' | 'rollen' | 'verwaltung' | 'vertretung';
const teilName = (teil: Teil) => t(`werkbank.benutzer.teil.${teil}`);

/**
 * Ein Speichern für den ganzen Benutzer (#1000): nacheinander nur die geänderten Teile – Name und Rollen, das
 * Verwaltungsrecht (mit frischer Anmeldung, #819) und die Vertretung. Scheitert ein Teil, ist das Vorige gespeichert;
 * der Fehler nennt seinen Bereich, den gescheiterten Teil und was schon gespeichert ist.
 */
async function speichereBenutzer(b: Benutzer, e: Entwurf, darfVerwaltung: boolean): Promise<void> {
  const alt = entwurfVon(b);
  const schritte: Array<[BenutzerBereich, Teil, boolean, () => Promise<unknown>]> = [
    ['grunddaten', 'name', alt.name !== e.name, () => kontoApi.benutzerAendern(b.id, { name: e.name })],
    ['rechte', 'rollen', !gleich(alt.rollen, [...e.rollen].sort()), () => kontoApi.benutzerAendern(b.id, { rollen: e.rollen })],
    ['rechte', 'verwaltung', darfVerwaltung && !gleich(alt.verwaltung, [...e.verwaltung].sort()), () => kontoApi.verwaltungSetzen(b.id, e.verwaltung)],
    ['vertretung', 'vertretung', !gleich(alt.abwesenheit, e.abwesenheit), () => kontoApi.benutzerAbwesenheit(b.id, e.abwesenheit)],
  ];
  const gespeichert: Teil[] = [];
  for (const [ort, teil, noetig, f] of schritte) {
    if (!noetig) continue;
    try { await f(); } catch (x) { throw Object.assign(x as Error, { ort, teil, gespeichert }); }
    gespeichert.push(teil);
  }
}

/** Meldung an der Speicherleiste nach einem Fehler: was gespeichert ist, was nicht und warum. */
function teilweiseText(x: { message: string; teil?: Teil; gespeichert?: Teil[] }): string {
  if (!x.teil) return x.message;
  const werte = { fehlt: teilName(x.teil), fehler: x.message };
  return x.gespeichert?.length
    ? t('werkbank.benutzer.teilweise-gespeichert', { ...werte, gespeichert: x.gespeichert.map(teilName).join(', ') })
    : t('werkbank.benutzer.nicht-gespeichert', werte);
}

export function BenutzerDetail({ b, neuLaden }: { b: Benutzer; neuLaden: () => Promise<void> }) {
  const { ich, aktualisieren, verwaltungsmodus } = useKonto();
  const d = useDaten();
  const benutzerTyp = d.typen.find((mappentyp) => mappentyp.system === 'benutzer');
  // Löschen nur, solange eine Einladung nie angenommen wurde; sonst deaktivieren (#26).
  const loeschbar = !b.hatPasswort && !b.letzteAnmeldung;
  const gespeichert = entwurfVon(b);
  const [e, setE] = useState<Entwurf>(gespeichert);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  // Fehler beim Speichern stehen nur an der Speicherleiste (B2), Meldungen der Sofortaktionen oben.
  const [speicherFehler, setSpeicherFehler] = useState<string>();
  const [ergebnis, setErgebnis] = useState<LinkErgebnis>();
  const [sendet, setSendet] = useState(false);
  const [fehlerOrt, setFehlerOrt] = useState<BenutzerBereich | null>(null);
  // Reihenfolge der Haken zählt nicht als Änderung.
  const ent = useEntwurf(gespeichert, { ...e, rollen: [...e.rollen].sort(), verwaltung: [...e.verwaltung].sort() }, { zuruecksetzen: () => { setE(gespeichert); setFehlerOrt(null); setSpeicherFehler(undefined); } });
  const selbst = b.id === ich.id;
  const s = status(b);
  // Verwaltungsrecht ändern darf nur, wer selbst „Gesamte Verwaltung“ hat (#818).
  const darfVerwaltung = verwaltungsmodus.bereiche === null && !b.art;
  const b2 = useBereiche(benutzerBereiche(!selbst || !b.aktiv), 'benutzer', b.id);
  // Nach dem Speichern den Stand des Servers übernehmen (z. B. gekürzter Name), sobald der Benutzer neu geladen ist.
  const uebernehmen = useRef(false);
  useEffect(() => { if (uebernehmen.current) { uebernehmen.current = false; setE(entwurfVon(b)); } }, [b]);

  async function aktion(fn: () => Promise<unknown>, gut?: string) {
    setMeldung(undefined);
    try { await fn(); if (gut) setMeldung({ art: 'gut', text: gut }); await neuLaden(); if (selbst) await aktualisieren(); }
    catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); }
  }
  async function speichern() {
    setSendet(true); setMeldung(undefined); setSpeicherFehler(undefined); setFehlerOrt(null);
    try {
      await speichereBenutzer(b, e, darfVerwaltung);
      setMeldung({ art: 'gut', text: t('werkbank.benutzer.gespeichert') });
      uebernehmen.current = true;
    } catch (x) {
      const ort = (x as { ort?: BenutzerBereich }).ort ?? 'grunddaten';
      setSpeicherFehler(teilweiseText(x as Error & { teil?: Teil; gespeichert?: Teil[] }));
      setFehlerOrt(ort); b2.oeffne([ort]);
    } finally {
      // Auch nach einem Fehler neu laden: Was davor gelang, ist gespeichert und zählt nicht mehr als Änderung.
      await neuLaden(); await d.neuLaden(); if (selbst) await aktualisieren();
      setSendet(false);
    }
  }
  const hatFehler = (k: BenutzerBereich) => fehlerOrt === k;

  return (
    <div className="editorform">
      <div className="mappenkopf">
        <p className="ueber">{t('werkbank.benutzer.ueber')}</p>
        <h1>{b.name || b.email}</h1>
        <dl className="index">
          <div><dt>{t('werkbank.benutzer.status')}</dt><dd><span className={`chip ${s.art}`}>{s.text}</span></dd></div>
          <div><dt>{t('werkbank.benutzer.angelegt')}</dt><dd>{datumZeit(b.erstellt)}</dd></div>
          <div><dt>{t('werkbank.benutzer.letzte-anmeldung-2')}</dt><dd>{datumZeit(b.letzteAnmeldung)}</dd></div>
          <div><dt>{t('werkbank.benutzer.zuletzt-aktiv')}</dt><dd>{datumZeit(b.zuletztAktiv ?? null)}{istGeradeAktiv(b.zuletztAktiv) && <> <span className="chip gut punkt">{t('werkbank.benutzer.gerade-aktiv')}</span></>}</dd></div>
        </dl>
        {benutzerTyp && <p className="leise klein"><Link to={`/ablage/${benutzerTyp.id}/${b.id}`} className="verweis">{t('werkbank.benutzer.mappe-in-der-ablage')}</Link></p>}
      </div>
      {b2.leiste(hatFehler, t('werkbank.benutzer.bereiche'))}
      {meldung && <div className={`hinweis ${meldung.art}`}><p>{meldung.text}</p></div>}
      {ergebnis && <LinkAnzeige e={ergebnis} schliessen={() => setErgebnis(undefined)} />}

      <form id="benutzer-formular" className="editorform" onKeyDown={ent.tasten} onSubmit={(x) => { x.preventDefault(); void speichern(); }}>
        <Bereich id="grunddaten" titel={t('werkbank.benutzer.bereich.grunddaten')} klappe={b2.klappe('grunddaten', hatFehler('grunddaten'))} kurz={`${e.name} · ${b.email}`}>
          <div className="raster">
            <Feld beschriftung={t('werkbank.benutzer.name')}><input id="benutzer-name" value={e.name} onChange={(x) => setE({ ...e, name: x.target.value })} /></Feld>
            <Feld beschriftung={t('werkbank.benutzer.e-mail-adresse-2')} hinweis={selbst ? t('werkbank.benutzer.aenderst-du-unter-mein') : t('werkbank.benutzer.aendert-der-benutzer-selbst')}><input value={b.email} readOnly /></Feld>
          </div>
        </Bereich>
        <Bereich id="rechte" titel={t('werkbank.benutzer.bereich.rechte')} klappe={b2.klappe('rechte', hatFehler('rechte'))}
          kurz={rechteKurz(e)}>
          <WeitereRollen gewaehlt={e.rollen} setze={(rollen) => setE({ ...e, rollen })} />
          {!b.art && <Verwaltungsrecht wahl={e.verwaltung} setWahl={(verwaltung) => setE((x) => ({ ...x, verwaltung: typeof verwaltung === 'function' ? verwaltung(x.verwaltung) : verwaltung }))} darfAendern={darfVerwaltung} sperre={sendet} />}
          <WasSiehtBlatt key={b.id} benutzerId={b.id} admin={false} />
        </Bereich>
        <Bereich id="vertretung" titel={t('werkbank.benutzer.bereich.vertretung')} hilfe={<Hilfe ort="benutzer.abwesenheit" />} klappe={b2.klappe('vertretung', hatFehler('vertretung'))}
          kurz={vertretungKurz(e.abwesenheit, d.person)}>
          <AbwesenheitFelder a={e.abwesenheit} setA={(abwesenheit) => setE({ ...e, abwesenheit })} wert={gespeichert.abwesenheit} wer={selbst ? 'du' : b.name || b.email} benutzerId={b.id} offeneAufgaben={b.offeneAufgaben ?? 0} />
          <div className="knoepfe">
            <AufgabenUebergeben wert={gespeichert.abwesenheit} offeneAufgaben={b.offeneAufgaben ?? 0} gesperrt={ent.geaendert}
              uebergeben={() => aktion(async () => { const r = await kontoApi.benutzerAufgabenAnVertreter(b.id); setMeldung({ art: 'gut', text: uebergebenText(r, d.person(gespeichert.abwesenheit.vertreterId)) }); await d.neuLaden(); })} />
          </div>
        </Bereich>
      </form>
      <Sicherheit b={b} b2={b2} aktion={aktion} setErgebnis={setErgebnis} neuLaden={neuLaden} loeschbar={loeschbar} />
      {(!selbst || !b.aktiv) && <Zugang b={b} b2={b2} selbst={selbst} loeschbar={loeschbar} aktion={aktion} />}
      <Speicherleiste ent={ent} gegenstand={t('werkbank.benutzer.ueber')} sendet={sendet} formular="benutzer-formular" meldung={speicherFehler ? { art: 'schlecht', text: speicherFehler } : undefined} />
    </div>
  );
}

type Aktion = (fn: () => Promise<unknown>, gut?: string) => Promise<void>;

/** Anmeldung und Sicherheit (#1000): Passwort-Link bzw. Einladung, Zwei-Faktor, Passkeys und Geräte – alles Sofortaktionen. */
function Sicherheit({ b, b2, aktion, setErgebnis, neuLaden, loeschbar }: { b: Benutzer; b2: BereicheZustand<BenutzerBereich>; aktion: Aktion; setErgebnis: (e: LinkErgebnis) => void; neuLaden: () => Promise<void>; loeschbar: boolean }) {
  return (
    <Bereich id="sicherheit" titel={t('werkbank.benutzer.bereich.sicherheit')} klappe={b2.klappe('sicherheit')}
      kurz={b.hatPasswort ? t('werkbank.benutzer.bereich.sicherheit.kurz', { datumZeit: datumZeit(b.letzteAnmeldung) }) : t('werkbank.benutzer.status.eingeladen')}>
      <div>
        <h3 className="h4">{t('werkbank.benutzer.bereich.passwort')}</h3>
        <p className="leise">{b.hatPasswort
          ? t('werkbank.benutzer.ein-passwort-link-ist')
          : t('werkbank.benutzer.der-benutzer-hat-sein')}
          {' '}{loeschbar ? t('werkbank.benutzer.solange-die-einladung-nicht') : t('werkbank.benutzer.wer-schon-angemeldet-war')}</p>
        <div className="knoepfe">
          <Knopf onClick={() => aktion(async () => setErgebnis(await kontoApi.neuerLink(b.id)))}>{b.hatPasswort ? t('werkbank.benutzer.passwort-link-erzeugen') : t('werkbank.benutzer.einladung-erneut-senden')}</Knopf>
        </div>
      </div>
      <ZweifaktorVon b={b} />
      <PasskeysVon b={b} />
      <Sitzungen b={b} neuLaden={neuLaden} />
    </Bereich>
  );
}

/**
 * Zugang (#1000): Fehler nachstellen (#146) und Zugang sperren (#77) – deaktivieren nur mit Vertreter und ohne offene
 * Aufgaben (#78); der Vertreter wirkt danach dauerhaft. Löschen bleibt für Einladungen, die nie angenommen wurden.
 */
function Zugang({ b, b2, selbst, loeschbar, aktion }: { b: Benutzer; b2: BereicheZustand<BenutzerBereich>; selbst: boolean; loeschbar: boolean; aktion: Aktion }) {
  const d = useDaten();
  const { aktualisieren } = useKonto();
  const name = b.name || b.email;
  const vertreter = b.abwesenheit?.vertreterId ? d.person(b.abwesenheit.vertreterId) : null;
  const offen = b.offeneAufgaben ?? 0;
  if (!b.aktiv) return (
    <Bereich id="zugang" titel={t('werkbank.benutzer.zugang-wieder-freigeben')} klappe={b2.klappe('zugang')} kurz={t('werkbank.benutzer.status.deaktiviert')}>
      <p className="leise">{t('werkbank.benutzer.ist-deaktiviert-aktivieren-gibt', { name, wert: b.deaktiviert ? t('werkbank.benutzer.seit', { datumZeit: datumZeit(b.deaktiviert) }) : '', wert2: vertreter ? t('werkbank.benutzer.aufgaben-die-noch-fuer', { name, vertreter }) : '' })}</p>
      <div className="knoepfe"><Knopf art="haupt" onClick={() => aktion(() => kontoApi.benutzerAendern(b.id, { aktiv: true }), t('werkbank.benutzer.aktiviert'))}>{t('werkbank.benutzer.benutzer-aktivieren')}</Knopf></div>
    </Bereich>
  );
  if (selbst) return null;
  // „im Bereich Vertretung“ als Sprung: öffnet ihn, rollt hin und setzt den Fokus auf seinen Kopf.
  const bereich = <Knopf art="link" onClick={() => b2.oeffne(['vertretung'], true, true)}>{t('werkbank.benutzer.bereich.vertretung')}</Knopf>;
  const gruende: Array<[string, ReactNode]> = [];
  if (!vertreter) gruende.push(['vertreter', tn('werkbank.benutzer.es-ist-kein-vertreter', { bereich })]);
  if (offen > 0) gruende.push(['aufgaben', tn('werkbank.benutzer.hat-noch-offene-aufgaben', { anzahl: offen, name, wert: vertreter ? tn('werkbank.benutzer.gib-sie-oben-an', { vertreter, bereich }) : '.' })]);
  // Kein Rot für den Bereich (Musterkatalog C15): Rot heißt hier „Fehler beim Speichern“; die Gefahr zeigen der rote
  // Knopf (C14) und die Rückfrage (B4).
  return (
    <Bereich id="zugang" titel={t('werkbank.benutzer.bereich.zugang')} klappe={b2.klappe('zugang')} kurz={t('werkbank.benutzer.bereich.zugang.kurz')}>
      <div>
        <h3 className="h4">{t('werkbank.benutzer.fehler-nachstellen')}</h3>
        <p className="leise">{t('werkbank.benutzer.du-siehst-und-bedienst', { wert: name })}</p>
        <div className="knoepfe"><Knopf onClick={async () => {
          if (await rueckfrage({ titel: t('werkbank.benutzer.als-anmelden', { wert: name }), text: t('werkbank.benutzer.deine-eigene-sitzung-endet'), ja: t('werkbank.benutzer.anmelden') })) {
            void aktion(async () => { await kontoApi.vertreten(b.id); geheZu('/ablage', true); await aktualisieren(); });
          }
        }}>{t('werkbank.benutzer.als-anmelden-2', { wert: name })}</Knopf></div>
      </div>
      <div>
        <h3 className="h4">{t('werkbank.benutzer.zugang-sperren')} <Hilfe ort="benutzer.sperren" /></h3>
        <ul className="leise">
          <li>{t('werkbank.benutzer.der-zugang-ist-sofort')}</li>
          <li>{t('werkbank.benutzer.die-mappe-bleibt-erhalten')}</li>
          <li>{t('werkbank.benutzer.der-vertreter-bleibt-hinterlegt', { name })}</li>
          <li>{tn('werkbank.benutzer.macht-es-jederzeit-rueckgaengig', { b: <strong>{t('werkbank.benutzer.aktivieren')}</strong> })}</li>
        </ul>
        {gruende.length > 0 && <div className="hinweis warn stapel"><p>{t('konten.sperren.nochnicht')}</p><ul>{gruende.map(([k, g]) => <li key={k}>{g}</li>)}</ul></div>}
        <div className="knoepfe">
          {loeschbar && <Knopf art="gefahr" symbol="geloescht" onClick={() => { void aktion(async () => { await kontoApi.benutzerLoeschen(b.id); loeseWache(); geheZu('/werkbank/benutzer'); }); }}
            rueckfrage={{ titel: t('werkbank.benutzer.einladung-loeschen'), text: t('werkbank.benutzer.die-einladung-an-wird', { email: b.email }), ja: t('werkbank.benutzer.einladung-loeschen-2') }}>{t('werkbank.benutzer.einladung-loeschen-2')}</Knopf>}
          <Knopf art="gefahr" symbol="verboten" gesperrt={gruende.length > 0}
            rueckfrage={{ titel: t('werkbank.benutzer.deaktivieren', { name }), text: t('werkbank.benutzer.der-zugang-ist-sofort-2', { name, vertreter: String(vertreter) }), ja: t('werkbank.benutzer.deaktivieren-2') }}
            onClick={() => { void aktion(() => kontoApi.benutzerAendern(b.id, { aktiv: false }), t('werkbank.benutzer.deaktiviert-alle-sitzungen-beendet')); }}>{t('werkbank.benutzer.benutzer-deaktivieren')}</Knopf>
        </div>
      </div>
    </Bereich>
  );
}

/** Angemeldete Geräte des Benutzers; einzeln oder alle abmelden. */
function Sitzungen({ b, neuLaden }: { b: Benutzer; neuLaden: () => Promise<void> }) {
  const [liste, setListe] = useState<Sitzung[] | null>(null);
  const [fehler, setFehler] = useState<string>();
  const laden = useCallback(async () => { try { setListe(await kontoApi.sitzungen(b.id)); } catch (e) { setFehler((e as Error).message); } }, [b.id]);
  useEffect(() => { void laden(); }, [laden]);
  async function beende(fn: () => Promise<unknown>, eigene: boolean) {
    try { await fn(); } catch (e) { setFehler((e as Error).message); }
    if (eigene) location.reload(); else { await laden(); await neuLaden(); }
  }
  return (
    <div>
      <h3 className="h4">{t('werkbank.benutzer.angemeldet-auf', { wert: liste?.length ?? '…', wert2: liste?.length === 1 ? t('werkbank.benutzer.geraet') : t('werkbank.benutzer.geraeten') })}</h3>
      {fehler && <p className="fehlertext">{fehler}</p>}
      {liste && !liste.length && <p className="leise">{t('werkbank.benutzer.gerade-nirgends-angemeldet')}</p>}
      {liste && liste.length > 0 && (
        <ul className="sitzungsliste">
          {liste.map((s) => (
            <li key={s.id}>
              <div>
                <strong>{geraetText(s.geraet)}</strong>
                {s.aktuell && <> <span className="chip">{t('werkbank.benutzer.diese-sitzung')}</span></>}
                {s.vertretungId && <> <span className="chip warn">{t('werkbank.verwaltungsrecht.vertretung')}</span></>}
                {istGeradeAktiv(s.zuletztAktiv) && <> <span className="chip gut punkt">{t('werkbank.benutzer.gerade-aktiv')}</span></>}
                <span className="leise klein blockzeile">{t('werkbank.benutzer.zuletzt-aktiv-angemeldet-seit', { datumZeit: datumZeit(s.zuletztAktiv), datumZeit2: datumZeit(s.erstellt), wert: s.ip ? ` · ${s.ip}` : '' })}</span>
              </div>
              <Knopf art="gefahr" groesse="klein" symbol="abmelden" onClick={() => beende(() => kontoApi.sitzungBeenden(b.id, s.id), !!s.aktuell)}
                rueckfrage={{ titel: t('werkbank.benutzer.abmelden.frage'), text: t('werkbank.benutzer.abmelden.frage.text', { geraet: geraetText(s.geraet) }), ja: t('werkbank.benutzer.abmelden') }}>{t('werkbank.benutzer.abmelden')}</Knopf>
            </li>
          ))}
        </ul>
      )}
      {liste && liste.length > 1 && (
        <div className="knoepfe"><Knopf art="gefahr" symbol="abmelden" onClick={() => beende(() => kontoApi.alleSitzungenBeenden(b.id), liste.some((s) => s.aktuell))}
          rueckfrage={{ titel: t('werkbank.benutzer.auf-allen-geraeten-abmelden', { wert: b.name || b.email, liste: liste.length }), ja: t('werkbank.benutzer.ueberall-abmelden') }}>{t('werkbank.benutzer.ueberall-abmelden')}</Knopf></div>
      )}
    </div>
  );
}

/**
 * Verwaltungsrecht an der Person (#818): Haken „Darf Ablago verwalten“, darunter der Baum der Werkbank-Bereiche aus
 * `BEREICHE`, ganz oben „Gesamte Verwaltung“ (auch künftige Bereiche). Ändern darf nur, wer selbst „Gesamte
 * Verwaltung“ hat – der Server verlangt dafür eine frische Anmeldung (der Dialog fragt sie ab). Seit #1000 speichert
 * die Speicherleiste des Benutzers mit.
 */
function Verwaltungsrecht({ wahl, setWahl, darfAendern, sperre }: { wahl: string[]; setWahl: (w: string[] | ((w: string[]) => string[])) => void; darfAendern: boolean; sperre: boolean }) {
  const an = wahl.length > 0;
  const gesamt = wahl.includes(GESAMT);
  const baum = verwaltungsbaum();
  const umschalten = (pfad: string, x: boolean) => setWahl((w) => (x ? [...w.filter((y) => y !== GESAMT), pfad] : w.filter((y) => y !== pfad)));
  return (
    <div className="verwaltungsrecht" id="verwaltungsrecht">
      <h3 className="h4">{t('werkbank.verwaltungsrecht.titel')} <Hilfe ort="werkbank.verwaltungsrecht" /></h3>
      <p className="leise">{t('werkbank.verwaltungsrecht.text')}</p>
      {!darfAendern && <p className="hinweis info"><span>{t('werkbank.verwaltungsrecht.nurGesamt')}</span></p>}
      <fieldset disabled={!darfAendern || sperre} className="wahl">
        <legend className="sr">{t('werkbank.verwaltungsrecht.titel')}</legend>
        <HakenFeld beschriftung={t('werkbank.verwaltungsrecht.darf')}>
          <input id="darf-verwalten" type="checkbox" checked={an} onChange={(e) => setWahl(e.target.checked ? [GESAMT] : [])} />
        </HakenFeld>
        {an && <div className="verwaltungsbaum">
          <HakenFeld beschriftung={t('werkbank.verwaltungsrecht.gesamt')} hinweis={t('werkbank.verwaltungsrecht.gesamt.text')}>
            <input id="gesamte-verwaltung" type="checkbox" checked={gesamt} onChange={(e) => setWahl(e.target.checked ? [GESAMT] : baum.flatMap((a) => a.bereiche.map((x) => x.pfad)))} />
          </HakenFeld>
          {baum.map((a) => (
            <FeldGruppe key={a.gruppe} beschriftung={a.name} className="verwaltungsgruppe">
              <div className="verwaltungsast">
                {a.bereiche.map((x) => (
                  <label key={x.pfad} className="haken"><input type="checkbox" checked={gesamt || wahl.includes(x.pfad)} disabled={gesamt} onChange={(e) => umschalten(x.pfad, e.target.checked)} />
                    <span>{bereichName(x.pfad)}{x.heikel && <> <span className="chip warn klein" title={t('werkbank.verwaltungsrecht.heikel.titel')}><Symbol name="warnung" /> {t('werkbank.verwaltungsrecht.heikel')}</span></>}</span></label>
                ))}
              </div>
            </FeldGruppe>
          ))}
        </div>}
      </fieldset>
      {an && !gesamt && <p className="leise klein">{t('werkbank.verwaltungsrecht.ordnung')}</p>}
    </div>
  );
}

export function LinkAnzeige({ e, schliessen }: { e: LinkErgebnis; schliessen?: () => void }) {
  const [kopiert, setKopiert] = useState(false);
  if (e.mailVerschickt) return <div className="hinweis gut"><p>{t('werkbank.benutzer.e-mail-an-ist', { email: e.benutzer.email })}</p>{schliessen && <Knopf art="link" onClick={schliessen}>{t('werkbank.benutzer.schliessen')}</Knopf>}</div>;
  return (
    <div className="hinweis info stapel">
      <p>{t('werkbank.benutzer.er-funktioniert-nur-einmal', { wert: e.mailFehler ? t('werkbank.benutzer.die-e-mail-an', { email: e.benutzer.email, mailFehler: e.mailFehler }) : t('werkbank.benutzer.schicke-diesen-link-an', { email: e.benutzer.email }) })}</p>
      <div className="linkzeile">
        <Feld beschriftung={t('werkbank.benutzer.link-zum-passwort-setzen')} beschriftungVerbergen>
          <input readOnly value={e.link} onFocus={(ev) => ev.target.select()} className="mono" />
        </Feld>
        <Knopf groesse="klein" onClick={async () => { try { await navigator.clipboard.writeText(e.link!); setKopiert(true); } catch { /* Feld ist markierbar */ } }}>{kopiert ? t('werkbank.benutzer.kopiert') : t('werkbank.benutzer.kopieren')}</Knopf>
      </div>
      {schliessen && <Knopf art="link" onClick={schliessen}>{t('werkbank.benutzer.schliessen')}</Knopf>}
    </div>
  );
}
