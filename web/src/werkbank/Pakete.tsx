import { Feld, HakenFeld, Knopf, KnopfLink, Reiter, ReiterFlaeche, Schalter, type KnopfErgebnis } from '../bausteine';
import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Symbol } from '../Symbol';
import { ergaenzungenVon, hatNetz, hatSchnittstelle, istKiPaket, herkunftText, KATALOG_LINK_REL, katalogSeiteMitVersion, sammelSeiteMitVersion, laeuferZustandText, neueVersionen, vergleicheVersion, type AblaufErgebnis, type HerkunftPruefung, type NeueVersion, type InstalliertesPaket, type Katalog, type KatalogPaket, type KatalogVersion, rechtePunkte, rechteZeilen } from '../../../shared/src/pakete';
import { PAKET_ID } from '../../../shared/src/kennungen';
import { api, ApiFehler, type BeispielBehalten, type PaketlaeuferStand, type PaketQuelle, type PaketVorschau, type Sammeldatei } from '../api';
import { useDaten } from '../daten';
import { Hilfe } from '../Hilfe';
import { Listenkopf } from '../Listenkopf';
import { darfVerlassen, geheZu, Link } from '../ort';
import { PaketEinstellungen } from './PaketEinstellungen';
import { VektorStandBlock } from '../ablage/Aehnlich';
import { FragenGrenzenBlock } from './FragenGrenzen';
import { PaketExternBlock } from './ExterneDienste';
import { ErkennungPaketBlock, KlassifizierenBlock } from './ErkennungPaket';
import { KiTypenBlock } from './KiTypen';
import { MappenMenueBlock, PaketAktionenBlock } from './PaketAktionen';
import { PaketErstellen, SELBST } from './PaketErstellen';
import { SelbstErstelltAnsicht } from './SelbstErstellt';
import { rueckfrage } from '../rueckfrage';
import { useKonto } from '../konto';
import { SammeldateiAnsicht, SammeldateiWahl } from './PaketeDazuholen';
import { PaketAblauf } from './PaketAblauf';
import { PaketUmwandeln } from './PaketUmwandeln';
import { t as tx, t, tn } from '../sprache';
import { KEINE_LIZENZ, lizenzArtVon, type SelbstErstellt } from '../../../shared/src/paketerstellung';
import { HerkunftZeile } from './Herkunft';
import { EREIGNISKATALOG, ereignisSchluessel, istKatalogArt, KATALOG_ARTEN } from '../../../shared/src/ereignisse';
import { gebietsschema } from '../../../shared/src/sprache';
import { sprachname } from '../../../shared/src/beschriftung';
import { Kopf } from './Kopf';
import { Kurzanleitung, MitkommtInhalt } from './PaketMitkommt';
import { mitkommtAusKatalog } from '../../../shared/src/mitkommt';
import { AlleAktualisieren } from './PaketeAlle';
import { alsMeldung, Herausgeber, MeldungBox, SprachHerkunft, VorschauBlock, type Meldung } from './PaketVorschau';

/** Meldungen (#1168: jetzt in PaketVorschau.tsx) – hier weiter für bestehende Aufrufer. */
export { alsMeldung, MeldungBox, type Meldung };
import type { VorgabeFrage } from '../../../shared/src/vorgaben';

/**
 * Werkbank → Pakete (#188): Konfigurationspakete aus dem offiziellen Katalog.
 * Den Katalog fragt das DMS nur auf Knopfdruck ab, nie im Hintergrund.
 * Expertenmodus (#189, #369): weitere Katalogadressen und Hochladen als Datei, in einem
 * aufklappbaren Abschnitt direkt unter den Knöpfen.
 */

const datum = (iso: string | null) => (iso ? new Date(iso).toLocaleString(gebietsschema(), { dateStyle: 'medium', timeStyle: 'short' }) : '–');
const host = (url: string) => { try { return new URL(url).host; } catch { return url; } };
/** Kennung des hochgeladenen Pakets in der Adresse. */
export const UPLOAD = t('werkbank.pakete.hochgeladen');
/** Assistent „Paket erstellen“ (#374). */
export const ERSTELLEN = t('werkbank.pakete.erstellen');
/** Hochgeladene Sammeldatei mit mehreren Paketen (#461). */
export const SAMMEL = t('werkbank.pakete.sammeldatei');
/** Alle aktualisieren (#1168). */
export const ALLE = t('werkbank.pakete.alle-pfad');

/**
 * Abschnitt „Expertenmodus“ auf- oder zugeklappt (#369): reiner Komfort, kein Recht – gemerkt im
 * Browser je Benutzer, standardmäßig zu. Er zeigt nur etwas an; welche Kataloge abgefragt werden,
 * bestimmen die Quellen selbst (eingeschaltet oder nicht), nicht der Abschnitt.
 */
function useExperteOffen(): [boolean, (offen: boolean) => void] {
  const { ich } = useKonto();
  const schluessel = `dms:pakete-experte:${ich.id}`;
  const [offen, setOffen] = useState(() => { try { return localStorage.getItem(schluessel) === '1'; } catch { return false; } });
  const setzen = (n: boolean) => {
    setOffen(n);
    try { if (n) localStorage.setItem(schluessel, '1'); else localStorage.removeItem(schluessel); } catch { /* nur für diese Sitzung */ }
  };
  return [offen, setzen];
}

type Abruf = { url: string; offiziell: boolean; katalog: Katalog | null; fehler: string | null; pruefung?: HerkunftPruefung | null };

export function usePakete(offen: boolean) {
  const [stand, setStand] = useState<{ installiert: InstalliertesPaket[]; katalogUrl: string; quellen: PaketQuelle[]; dms: string } | null>(null);
  const [kataloge, setKataloge] = useState<{ liste: Abruf[]; abgerufen: string } | null>(null);
  const [upload, setUpload] = useState<{ upload: string; vorschau: PaketVorschau; datei: string } | null>(null);
  const [sammel, setSammel] = useState<{ sammeldatei: Sammeldatei; datei: string } | null>(null);
  const [fehler, setFehler] = useState<string>();
  const [laedt, setLaedt] = useState(false);
  // Selbst erstellte Pakete (#652) stehen unter „Installiert“ mit dem Zeichen „selbst erstellt“.
  const [selbst, setSelbst] = useState<SelbstErstellt[] | null>(null);
  const laden = useCallback(async () => {
    try { const [st, se] = await Promise.all([api.pakete(), api.selbstErstellt()]); setStand(st); setSelbst(se); setFehler(undefined); }
    catch (e) { setFehler((e as Error).message); }
  }, []);
  useEffect(() => { if (offen) void laden(); }, [offen, laden]);
  // Abgefragt werden der offizielle Katalog und die eingeschalteten weiteren Quellen (#369);
  // der Link aus der Katalog-Webseite (#191) fragt nur den offiziellen ab (alle = false).
  const abrufen = useCallback(async (alle = true) => {
    setLaedt(true); setFehler(undefined);
    try { const k = await api.paketKatalog(alle); setKataloge({ liste: k.kataloge, abgerufen: k.abgerufen }); } catch (e) { setFehler((e as Error).message); } finally { setLaedt(false); }
  }, []);
  // Neuere Versionen (#1167): aus den abgerufenen Katalogen und dem Stand der Installation abgeleitet, nicht gemerkt –
  // nach einem Update stimmt der Merker sofort, ohne erneut zu prüfen.
  const updates = neueVersionen(stand?.installiert ?? [], kataloge?.liste ?? []);
  /** Katalogpaket aus einer Quelle (ohne Angabe: offizieller Katalog). */
  const paketAus = (id: string, quelle?: string): { kp: KatalogPaket; url: string; offiziell: boolean } | undefined => {
    const k = kataloge?.liste.find((x) => (quelle ? x.url === quelle : x.offiziell));
    // Umgezogen (#1084): unter der neuen Id, die die installierte unter `ersetzt` nennt.
    const kp = k?.katalog?.pakete.find((p) => p.id === id) ?? k?.katalog?.pakete.find((p) => p.ersetzt?.includes(id));
    return kp && k ? { kp, url: k.url, offiziell: k.offiziell } : undefined;
  };
  /** Hat ein Katalog ein Paket mit derselben Id wie ein selbst erstelltes (#652)? */
  const konflikt = (id: string) => !!kataloge?.liste.some((k) => k.katalog?.pakete.some((p) => p.id === id));
  return { stand, selbst, kataloge, updates, upload, setUpload, sammel, setSammel, fehler, laedt, laden, abrufen, paketAus, setStand, konflikt };
}
export type PaketeZustand = ReturnType<typeof usePakete>;

export function PaketeListe({ z, offen }: { z: PaketeZustand; offen?: string }) {
  const [experte, setExperte] = useExperteOffen();
  const installiert = z.stand?.installiert ?? [];
  const quelleOffen = new URLSearchParams(location.search).get('quelle');
  const verfuegbar = (z.kataloge?.liste ?? [])
    .flatMap((k) => (k.katalog?.pakete ?? []).filter((p) => !installiert.some((i) => i.id === p.id || p.ersetzt?.includes(i.id))).map((p) => ({ p, url: k.url, offiziell: k.offiziell })));
  const neuer = (id: string) => z.updates.find((u) => u.id === id);
  const abrufErgebnis = useMemo(() => ergebnisDesAbrufs(z.kataloge, z.updates, installiert.length > 0), [z.kataloge, z.updates, installiert.length]);
  const [hochFehler, setHochFehler] = useState<string>();
  async function hochladen(f: File | undefined) {
    if (!f) return;
    setHochFehler(undefined);
    try {
      const r = await api.paketHochladen(f);
      // Eine Sammeldatei (#461) erkennt das DMS selbst.
      if ('sammeldatei' in r) { z.setSammel({ sammeldatei: r.sammeldatei, datei: f.name }); geheZu(`/werkbank/pakete/${SAMMEL}`); }
      else { z.setUpload({ ...r, datei: f.name }); geheZu(`/werkbank/pakete/${UPLOAD}`); }
    }
    catch (e) { setHochFehler([(e as Error).message, ...(e instanceof ApiFehler ? e.gruende : [])].join(' ')); }
  }
  return (
    <>
      <Listenkopf titel={t('werkbank.pakete.pakete')} hilfe="werkbank.pakete" beschreibung={t('werkbank.pakete.fertige-mappentypen-und-ansichten')} />
      <div className="knoepfe">
        {/* Ein Knopf für Katalog und neue Versionen (#1168): holt alle Kataloge; „läuft“ und das Ergebnis mit Uhrzeit am Knopf (#986). */}
        <Knopf groesse="klein" laeuftText={t('werkbank.pakete.frage-ab')} onClick={() => z.abrufen()} ergebnis={abrufErgebnis} data-anker="werkbank.pakete.suchen">
          {installiert.length ? t('werkbank.pakete.nach-neuen-versionen-suchen') : t('werkbank.pakete.katalog-abrufen')}
        </Knopf>
        <KnopfLink to={`/werkbank/pakete/${ERSTELLEN}`} groesse="klein" className={offen === ERSTELLEN ? 'an' : undefined}>{t('werkbank.pakete.paket-erstellen')}</KnopfLink>
        <KnopfLink to={`/werkbank/pakete/${SAMMEL}`} groesse="klein" className={offen === SAMMEL ? 'an' : undefined}>{t('werkbank.pakete.ohne-internet')}</KnopfLink>
      </div>
      <section className="aufklappbereich">
        <Knopf art="link" className="aufklappkopf" aria-expanded={experte} aria-controls="pakete-experte" onClick={() => setExperte(!experte)}>
          <Symbol name={experte ? 'pfeil-unten' : 'pfeil-rechts'} className="zeichen" />
          <span>{t('werkbank.pakete.expertenmodus')}</span>
          <span className="leise klein">{t('werkbank.pakete.weitere-quellen-paket-oder')}</span>
        </Knopf>
        {experte && (
          <div id="pakete-experte" className="aufklappinhalt">
            <div className="hinweis warn klein"><p>{t('werkbank.pakete.pakete-ausserhalb-des-offiziellen')}</p></div>
            <h2 className="ueber">{t('werkbank.pakete.weitere-quellen')}</h2>
            <Quellen z={z} />
            <h2 className="ueber">{t('werkbank.pakete.paket-hochladen')}</h2>
            <p className="leise klein">{tn('werkbank.pakete.eine-datei-im-format', { code: <code>{'.zip'}</code> })}</p>
            <input type="file" accept=".zip,application/zip" aria-label={t('werkbank.pakete.paket-oder-sammeldatei-als')} onChange={(e) => { void hochladen(e.target.files?.[0]); e.target.value = ''; }} />
            {hochFehler && <p className="fehlertext klein">{hochFehler}</p>}
          </div>
        )}
      </section>
      {z.fehler && <div className="hinweis schlecht"><p>{z.fehler}</p></div>}
      <div className="zeile-zwischen">
        <h2 className="ueber">{t('werkbank.pakete.installiert')}</h2>
        {z.updates.length > 0 && <KnopfLink to={`/werkbank/pakete/${ALLE}`} art="haupt" className={offen === ALLE ? 'an' : undefined} anker="werkbank.pakete.alle">{t('werkbank.pakete.alle-aktualisieren', { anzahl: z.updates.length })}</KnopfLink>}
      </div>
      {!z.stand ? <p className="leise">{t('werkbank.pakete.lade')}</p> : !installiert.length && !z.selbst?.length ? <p className="leise leerliste">{t('werkbank.pakete.noch-keine-pakete-installiert')}</p> : (
        <ul className="mappenliste">
          {(z.selbst ?? []).map((p) => (
            <li key={`selbst|${p.id}`}><Link to={`/werkbank/pakete/${SELBST}${p.id}`} className={`eintrag werk ${offen === `${SELBST}${p.id}` ? 'an' : ''}`}>
              <span className="titel">{p.name} <span className="chip" title={tx('pakete.selbst.chipTitel')}>{tx('pakete.selbst.chip')}</span>{z.konflikt(p.id) && <> <span className="chip warn" title={tx('pakete.selbst.konflikt', { id: p.id })}>{tx('pakete.selbst.konfliktChip')}</span></>}</span>
              <span className="unter">{tx('pakete.selbst.unter', { version: p.version, datum: new Date(p.erstellt).toLocaleDateString(gebietsschema()) })}</span>
            </Link></li>
          ))}
          {installiert.map((p) => (
            <li key={p.id}><Link to={`/werkbank/pakete/${p.id}`} className={`eintrag werk ${offen === p.id ? 'an' : ''}`}>
              <span className="titel">{p.name}<Herausgeber wer={p.herausgeber} geprueft={p.herausgeberGeprueft} /> {neuer(p.id) && <span className="chip warn" title={t('werkbank.pakete.neuere-version-in-der')}>{neuer(p.id)!.neu}</span>}{p.einstellungenNoetig && <> <span className="chip warn" title={t('werkbank.pakete.pflichtfelder-in-den-einstellungen')}>{t('werkbank.pakete.einstellungen-noetig')}</span></>}</span>
              <span className="unter">{t('werkbank.pakete.version', { version: p.version, herkunftText: herkunftText(p.herkunft) })}</span>
            </Link></li>
          ))}
        </ul>
      )}
      <h2 className="ueber">{t('werkbank.pakete.verfuegbar')}</h2>
      <KatalogAnsehen z={z} />
      {z.kataloge?.liste.filter((k) => k.fehler).map((k) => <div key={k.url} className="hinweis warn klein"><p>{k.offiziell ? t('werkbank.pakete.offizieller-katalog') : host(k.url)}: {k.fehler}</p></div>)}
      {!z.kataloge ? <p className="leise klein">{t('werkbank.pakete.klicke-katalog-abrufen-um', { knopf: installiert.length ? t('werkbank.pakete.nach-neuen-versionen-suchen') : t('werkbank.pakete.katalog-abrufen') })}</p>
        : !verfuegbar.length ? <p className="leise leerliste">{t('werkbank.pakete.alle-pakete-des-katalogs')}</p> : (
          <ul className="mappenliste">
            {verfuegbar.map(({ p, url, offiziell }) => (
              <li key={`${url}|${p.id}`}><Link to={`/werkbank/pakete/${p.id}${offiziell ? '' : `?quelle=${encodeURIComponent(url)}`}`} className={`eintrag werk ${offen === p.id && (offiziell ? !quelleOffen : quelleOffen === url) ? 'an' : ''}`}>
                <span className="titel">{p.name}<Herausgeber wer={p.herausgeber} geprueft={offiziell} />{!offiziell && <> <span className="chip warn" title={t('werkbank.pakete.aus-nicht-vom-ablago', { url })}>{host(url)}</span></>}</span>
                <span className="unter">{p.aktuell} · {p.beschreibung}</span>
              </Link></li>
            ))}
          </ul>
        )}
      {/* Herkunft des offiziellen Katalogs (#594): signiert, nicht signiert (Stufe 1: nur Warnung) oder ungültig. */}
      <HerkunftZeile p={z.kataloge?.liste.find((k) => k.offiziell)?.pruefung} />
    </>
  );
}

/**
 * Rückmeldung nach dem Abruf (#1168), am Knopf: Uhrzeit und Ergebnis – „3 neue Versionen“, „Alles aktuell“ oder ohne
 * installierte Pakete nur „Katalog abgerufen“. Ist kein Katalog erreichbar, steht das dort; die Gründe stehen über der Liste.
 */
function ergebnisDesAbrufs(k: PaketeZustand['kataloge'], updates: NeueVersion[], mitInstalliert: boolean): KnopfErgebnis | null {
  if (!k) return null;
  const zeit = new Date(k.abgerufen).toLocaleTimeString(gebietsschema(), { timeStyle: 'short' });
  if (!k.liste.some((x) => x.katalog)) return { art: 'warn', text: t('werkbank.pakete.abruf.fehler', { zeit }) };
  if (!mitInstalliert) return { art: 'gut', text: t('werkbank.pakete.abruf.katalog', { zeit }) };
  return updates.length ? { art: 'info', text: t('werkbank.pakete.abruf.neu', { zeit, anzahl: updates.length }) } : { art: 'gut', text: t('werkbank.pakete.abruf.aktuell', { zeit }) };
}

/**
 * „Im Katalog ansehen“ (#622): öffnet die Katalog-Webseite mit der DMS-Version nur im Fragment
 * (`#dms=…`, geht an keinen Server). Ist der offizielle Katalog nicht erreichbar, steht statt des
 * Links der Hinweis auf „Ohne Internet …“. Eigene Kataloge haben keine bekannte Webseite – nur der offizielle.
 */
function KatalogAnsehen({ z }: { z: PaketeZustand }) {
  if (z.kataloge?.liste.some((k) => k.offiziell && k.fehler)) return <p className="leise klein">{tx('pakete.katalog.ohneinternet')}</p>;
  return (
    <p className="leise klein">
      <a className="verweis" href={katalogSeiteMitVersion(z.stand?.dms ?? '')} target="_blank" rel={KATALOG_LINK_REL}>{tx('pakete.katalog.ansehen')} <Symbol name="extern" /></a>
      {' – '}{tx('pakete.katalog.hinweis')} <Hilfe ort="werkbank.pakete.katalog" />
    </p>
  );
}

/** Fingerabdruck aus einer Rückfrage des Servers (409, #594): Katalog mit eigenem Schlüssel. */
const fingerabdruckAus = (e: unknown): string | null => {
  const d = e instanceof ApiFehler && e.status === 409 ? e.details as { schluessel?: boolean; fingerabdruck?: string } | undefined : undefined;
  return d?.schluessel && d.fingerabdruck ? d.fingerabdruck : null;
};

/** Beispiel-Mappen, die beim Entfernen blieben (#878), als Satz hinter der Meldung. */
const behaltenText = (l?: BeispielBehalten[]) => (l?.length ? ` ${t('werkbank.pakete.beispiele-behalten', { anzahl: l.length, titel: l.map((b) => `„${b.titel}“`).join(', ') })}` : '');
/** Vorgaben (#1038), die nach dem Entfernen als gewöhnliche Mappen bleiben. */
const vorgabenText = (l?: Array<{ titel: string }>) => (l?.length ? ` ${t('werkbank.pakete.vorgaben-behalten', { anzahl: l.length, titel: l.map((b) => `„${b.titel}“`).join(', ') })}` : '');

/**
 * Entfernen mit den Rückfragen des Servers (409): Sprachpaket in Gebrauch (#731) – nur auf ausdrücklichen Wunsch;
 * unbenutzte Vorgaben in Mappentypen anderer Pakete (#1038) – mit entfernen oder als gewöhnliche Mappen behalten.
 */
async function entferneMitFragen(id: string, einstellungenBehalten: boolean) {
  let sprache = false;
  let vorgaben: 'entfernen' | 'behalten' | undefined;
  for (;;) {
    try { return await api.paketEntfernen(id, einstellungenBehalten, sprache, vorgaben); } catch (e) {
      const d = e instanceof ApiFehler && e.status === 409 ? e.details as { sprache?: unknown; vorgaben?: VorgabeFrage[] } | undefined : undefined;
      if (d?.sprache && !sprache) {
        if (!(await rueckfrage({ titel: (e as Error).message, text: (e as ApiFehler).gruende.join(' '), ja: t('werkbank.pakete.sprache.entfernen'), gefahr: true }))) throw e;
        sprache = true;
      } else if (d?.vorgaben?.length && !vorgaben) {
        const ja = await rueckfrage({ titel: (e as Error).message, text: <><p>{t('werkbank.pakete.vorgaben-frage.text')}</p><ul>{d.vorgaben.map((v) => <li key={v.id}>{v.titel}{v.typ && <span className="leise"> · {v.typ}</span>}</li>)}</ul></>, ja: t('werkbank.pakete.vorgaben-frage.entfernen'), nein: t('werkbank.pakete.vorgaben-frage.behalten'), gefahr: true });
        vorgaben = ja ? 'entfernen' : 'behalten';
      } else throw e;
    }
  }
}

/**
 * Weitere Katalogadressen (#189): hinzufügen, abschalten, entfernen. Hat ein Katalog einen eigenen Schlüssel
 * (#594), zeigt das DMS beim Hinzufügen den Fingerabdruck und übernimmt ihn erst nach Bestätigung – wie beim
 * ersten Kontakt mit SSH. Nach einem Schlüsselwechsel ist die Quelle gesperrt, bis du den neuen bestätigst.
 */
function Quellen({ z }: { z: PaketeZustand }) {
  const [url, setUrl] = useState('');
  const [fehler, setFehler] = useState<string>();
  const weitere = (z.stand?.quellen ?? []).filter((q) => !q.offiziell);
  async function tu(f: () => Promise<PaketQuelle[]>) {
    setFehler(undefined);
    try { const quellen = await f(); z.setStand((s) => (s ? { ...s, quellen } : s)); } catch (e) { setFehler((e as Error).message); }
  }
  /** Erst ohne Fingerabdruck fragen; meldet der Server einen Schlüssel, zeigen und nach Bestätigung erneut senden. */
  const mitSchluessel = (adresse: string, senden: (fp?: string) => Promise<PaketQuelle[]>) => tu(async () => {
    try { return await senden(); } catch (e) {
      const fp = fingerabdruckAus(e);
      if (!fp) throw e;
      const ja = await rueckfrage({
        titel: tx('pakete.quelle.bestaetigen.titel'), ja: tx('pakete.quelle.bestaetigen.ja'),
        text: <><span className="umbrechen">{adresse}</span><br /><code className="fingerabdruck">{fp}</code><br />{tx('pakete.quelle.bestaetigen.text')}</>,
      });
      if (!ja) return z.stand?.quellen ?? [];
      return senden(fp);
    }
  });
  return (
    <div className="stapel klein">
      <p className="leise">{tx('pakete.quelle.erklaerung')} <Hilfe ort="werkbank.pakete.schluessel" /></p>
      {!weitere.length ? <p className="leise">{t('werkbank.pakete.keine-weiteren-kataloge')}</p> : (
        <ul className="stapel">
          {weitere.map((q) => (
            <li key={q.url}>
              <Schalter an={q.aktiv} setze={(an) => tu(() => api.paketQuelleSchalten(q.url, an))} beschriftung={q.url} className="umbrechen"
                hinweis={`${q.von ? t('werkbank.pakete.von', { von: q.von }) : ''}${q.am ? t('werkbank.pakete.am', { datum: datum(q.am) }) : ''}`.trim() || undefined} />
              <Knopf art="gefahr" groesse="klein" symbol="geloescht" onClick={() => tu(() => api.paketQuelleEntfernen(q.url))}
                rueckfrage={{ titel: t('werkbank.pakete.paketquelle-entfernen'), text: q.url, ja: t('werkbank.pakete.entfernen') }}>{t('werkbank.pakete.entfernen')}</Knopf>
              {q.gesperrt ? (
                <div className="hinweis warn" role="alert">
                  <p><Symbol name="warnung" className="sym-warn" /> {tx('pakete.quelle.gesperrt', { seit: datum(q.gesperrt.seit) })} <code className="fingerabdruck">{q.gesperrt.fingerabdruck}</code></p>
                  <Knopf groesse="klein" onClick={() => mitSchluessel(q.url, (fp) => api.paketQuelleSchluessel(q.url, fp))}>{tx('pakete.quelle.pruefen')}</Knopf>
                </div>
              ) : (
                <p className="leise">
                  {q.fingerabdruck ? <><Symbol name="schloss" /> {tx('pakete.quelle.schluessel')} <code className="fingerabdruck">{q.fingerabdruck}</code></> : tx('pakete.quelle.ohne')}
                  {' · '}<Knopf art="link" onClick={() => mitSchluessel(q.url, (fp) => api.paketQuelleSchluessel(q.url, fp))}>{tx('pakete.quelle.pruefen')}</Knopf>
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      <form className="zeile" onSubmit={(e) => { e.preventDefault(); const adresse = url.trim(); void mitSchluessel(adresse, async (fp) => { const r = await api.paketQuelleHinzu(adresse, fp); setUrl(''); return r; }); }}>
        <Feld beschriftung={t('werkbank.pakete.adresse-eines-weiteren-katalogs')} beschriftungVerbergen>
          <input type="url" placeholder="https://…/katalog.json" value={url} onChange={(e) => setUrl(e.target.value)} />
        </Feld>
        <Knopf art="haupt" type="submit" gesperrt={!url.trim()}>{t('werkbank.pakete.hinzufuegen')}</Knopf>
      </form>
      {fehler && <p className="fehlertext">{fehler}</p>}
    </div>
  );
}

export function PaketePanel({ z, id }: { z: PaketeZustand; id?: string }) {
  if (!id) return (
    <div className="einspaltig">
      <div className="mappenkopf"><p className="ueber">{t('werkbank.pakete.werkbank')}</p><h1>{t('werkbank.pakete.pakete')}</h1>
        <p className="leise">{t('werkbank.pakete.ein-paket-bringt-fertige')}</p>
        <p className="leise">{t('werkbank.pakete.ein-update-ergaenzt-nur')}</p>
        <p className="leise">{t('werkbank.pakete.eigene-mappentypen-und-ansichten')}</p>
      </div>
      {/* Menü „Mappe“ (#1039): eingebaute Aktionen an einer Stelle, Aktionen der Pakete im Überblick. */}
      {z.stand && <MappenMenueBlock pakete={z.stand.installiert} />}
    </div>
  );
  if (id === UPLOAD) return <UploadDetail z={z} />;
  if (id === SAMMEL) return <SammelDetail z={z} />;
  if (id === ALLE) return <AlleAktualisieren z={z} />;
  if (id === ERSTELLEN) return <PaketErstellen key={location.search} onErstellt={() => void z.laden()} />;
  if (id.startsWith(SELBST)) return <SelbstErstelltAnsicht id={id.slice(SELBST.length)} konflikt={z.konflikt(id.slice(SELBST.length))} onGeaendert={() => void z.laden()} />;
  const quelle = new URLSearchParams(location.search).get('quelle') ?? undefined;
  return <PaketDetail key={`${id}|${quelle ?? ''}`} z={z} id={id} quelle={quelle} />;
}

/**
 * Installieren per Link (#191): /werkbank/pakete?installieren=<id>@<version> zeigt die Vorschau genau
 * dieses Pakets – immer aus dem offiziellen Katalog; andere Parameter zählen nicht. Installiert wird
 * erst nach Klick auf „Installieren“.
 */
export function PaketLink({ z, wert }: { z: PaketeZustand; wert: string }) {
  const d = useDaten();
  const [id, version] = wert.split('@');
  const gueltig = PAKET_ID.test(id ?? '') && (!version || /^\d+\.\d+\.\d+$/.test(version));
  const [vorschau, setVorschau] = useState<PaketVorschau | null>(null);
  const [meldung, setMeldung] = useState<Meldung>();
  // Neu installieren (#405): im gemeinsamen Ablauf – dafür der offizielle Katalog (Abhängigkeiten, Ergänzungen).
  const [katalog, setKatalog] = useState<Katalog | null>(null);
  useEffect(() => {
    if (!gueltig) return;
    let aktuell = true;
    api.paketVorschau({ id, version: version || undefined }).then((v) => aktuell && setVorschau(v), (e) => aktuell && setMeldung(alsMeldung(e)));
    return () => { aktuell = false; };
  }, [id, version, gueltig]);
  useEffect(() => {
    if (!vorschau || vorschau.installiert) return;
    let aktuell = true;
    api.paketKatalog(false).then((k) => { const o = k.kataloge.find((x) => x.offiziell); if (aktuell && o?.katalog) setKatalog(o.katalog); else if (aktuell) setMeldung({ art: 'schlecht', text: o?.fehler ?? t('werkbank.pakete.der-katalog-laesst-sich') }); }, (e) => aktuell && setMeldung(alsMeldung(e)));
    return () => { aktuell = false; };
  }, [vorschau]);
  if (!gueltig) return <div className="leer"><p>{tn('werkbank.pakete.dieser-link-ist-ungueltig', { code: <code>{'?installieren=paket@1.0.0'}</code> })}</p></div>;
  // Fester Fehlercode statt Text des Servers (#729): gilt in jeder Sprache.
  const schon = !!vorschau?.installiert && !!vorschau.fehlercodes?.includes('schon-installiert');
  return (
    <div className="einspaltig">
      <div className="mappenkopf">
        <p className="ueber">{t('werkbank.pakete.paket-aus-dem-offiziellen')}</p>
        <h1>{vorschau?.paket.name ?? id}{vorschau ? ` ${vorschau.paket.version}` : version ? ` ${version}` : ''}</h1>
        {vorschau && <p className="leise">{vorschau.paket.beschreibung}</p>}
      </div>
      <MeldungBox m={meldung} />
      {!vorschau && !meldung && <p className="leise">{t('werkbank.pakete.frage-den-offiziellen-katalog')}</p>}
      {vorschau && (
        <section className="blatt">
          <dl className="eigenschaften">
            <dt>{t('werkbank.pakete.lizenz')}</dt><dd><LizenzAngabe lizenz={vorschau.paket.lizenz} /></dd>
            <dt>{t('werkbank.pakete.autor')}</dt><dd>{vorschau.paket.autor.name}{vorschau.paket.autor.github ? ` (@${vorschau.paket.autor.github})` : ''}</dd>
            <dt>{t('werkbank.pakete.noetige-ablago-version')}</dt><dd>{t('werkbank.pakete.dieser-installation', { dms: vorschau.paket.dms, dmsVersion: vorschau.dmsVersion })}</dd>
            {vorschau.installiert && <><dt>{t('werkbank.pakete.installiert')}</dt><dd>{t('werkbank.pakete.version-2', { installiert: vorschau.installiert })}</dd></>}
            {vorschau.paket.readme && <><dt>{t('werkbank.pakete.mehr')}</dt><dd><a className="verweis" href={vorschau.paket.readme} target="_blank" rel="noreferrer">{t('werkbank.pakete.readme')}</a></dd></>}
          </dl>
        </section>
      )}
      {schon && (
        <div className="hinweis info"><p>{tn('werkbank.pakete.ist-schon-installiert-version', { name: vorschau!.paket.name, installiert: vorschau!.installiert })}{' '}<Knopf art="link" onClick={() => { void z.abrufen(false); geheZu(`/werkbank/pakete/${id}`); }}>{t('werkbank.pakete.zum-paket')}</Knopf> {' '}{t('werkbank.pakete.dort-gibt-es-ggf')}</p></div>
      )}
      {vorschau && !schon && !vorschau.update && katalog && z.stand && (
        <PaketAblauf quelle={{ art: 'katalog', katalog, dms: z.stand.dms, installiert: z.stand.installiert }} start={[id]} nur={[id]} versionen={version ? { [id]: version } : {}}
          aktionen={<KnopfLink to="/werkbank/pakete">{t('werkbank.pakete.abbrechen')}</KnopfLink>}
          geaendert={() => { void z.laden(); void d.neuLaden(); }}
          fertig={(e) => { void z.abrufen(false); geheZu(e.installiert.some((x) => x.id === id) ? `/werkbank/pakete/${id}?${NEU}` : '/werkbank/pakete'); }} />
      )}
      {vorschau && !schon && vorschau.update && (
        <VorschauBlock v={vorschau} warnung={null} abbrechen={() => geheZu('/werkbank/pakete')}
          los={async (x) => {
            try {
              const r = vorschau.update ? await api.paketAktualisieren(id, vorschau.paket.version, x.bestaetigt, x.rechteBestaetigt, { automatisierungen: x.automatisierungen, herausgeberBestaetigt: x.herausgeberBestaetigt, umbauBestaetigt: x.umbauBestaetigt, umbauEntscheidungen: x.umbauEntscheidungen, sichtenErsetzen: x.sichtenErsetzen }) : await api.paketInstallieren({ id, version: vorschau.paket.version, ...x });
              await z.laden(); await d.neuLaden(); await z.abrufen(false);
              geheZu(`/werkbank/pakete/${r.id}`);
            } catch (e) { setMeldung(alsMeldung(e)); }
          }} />
      )}
    </div>
  );
}

/** Frisch installiert (#1047): Die Paketseite zeigt einmal die Kurzanleitung, bis man sie schließt. */
const NEU = 'neu=1';

/**
 * Pakete ohne Internet (#461): Sammeldatei aus der Katalog-Webseite hochladen, Inhalt ansehen und Paket für
 * Paket installieren.
 */
function SammelDetail({ z }: { z: PaketeZustand }) {
  const d = useDaten();
  const dms = z.stand?.dms ?? '';
  const s = z.sammel;
  return (
    <div className="einspaltig">
      <Kopf titel={t('werkbank.pakete.sammeldatei-hochladen')} ueber={t('werkbank.pakete.pakete-ohne-internet')} hilfe="werkbank.pakete.sammeldatei">
        <p className="leise">{tn('werkbank.pakete.kommt-dein-ablago-nicht', { link: <a className="verweis" href={sammelSeiteMitVersion(dms)} target="_blank" rel={KATALOG_LINK_REL}>{tn('werkbank.pakete.katalog-webseite', { symbol: <Symbol name="extern" /> })}</a> })}</p>
        <p className="leise klein">{tx('pakete.katalog.hinweis')}</p>
      </Kopf>
      {!s ? <SammeldateiWahl geladen={(x, datei) => z.setSammel({ sammeldatei: x, datei })} einzeln={(r, datei) => { z.setUpload({ ...r, datei }); geheZu(`/werkbank/pakete/${UPLOAD}`); }} />
        : <SammeldateiAnsicht key={s.sammeldatei.datei.sha256} s={s.sammeldatei} datei={s.datei} dms={dms} installiert={z.stand?.installiert ?? []}
            geaendert={() => { void z.laden(); void d.neuLaden(); }}
            abbrechen={() => z.setSammel(null)}
            fertig={() => { z.setSammel(null); void z.laden(); geheZu('/werkbank/pakete'); }} />}
    </div>
  );
}

function UploadDetail({ z }: { z: PaketeZustand }) {
  const d = useDaten();
  const [meldung, setMeldung] = useState<Meldung>();
  const u = z.upload;
  if (!u) return <div className="leer"><p>{t('werkbank.pakete.kein-hochgeladenes-paket-lade')}</p></div>;
  const p = u.vorschau.paket;
  return (
    <div className="einspaltig">
      <div className="mappenkopf"><p className="ueber">{t('werkbank.pakete.hochgeladenes-paket')}</p><h1>{p.name} {p.version}<Herausgeber wer={p.herausgeber} geprueft={p.herausgeberGeprueft} /></h1><p className="leise">{p.beschreibung}</p></div>
      <MeldungBox m={meldung} />
      <section className="blatt">
        <dl className="eigenschaften">
          <dt>{t('werkbank.pakete.datei')}</dt><dd>{u.datei}</dd>
          <dt>{t('werkbank.pakete.lizenz')}</dt><dd><LizenzAngabe lizenz={p.lizenz} /></dd>
          <dt>{t('werkbank.pakete.autor')}</dt><dd>{p.autor.name}{p.autor.github ? ` (@${p.autor.github})` : ''}</dd>
          <dt>{t('werkbank.pakete.noetige-ablago-version')}</dt><dd>{t('werkbank.pakete.dieser-installation', { dms: p.dms, dmsVersion: u.vorschau.dmsVersion })}</dd>
          {u.vorschau.installiert && <><dt>{t('werkbank.pakete.installiert')}</dt><dd>{t('werkbank.pakete.version-3', { installiert: u.vorschau.installiert, wert: u.vorschau.herkunft ? ` · ${herkunftText(u.vorschau.herkunft)}` : '' })}</dd></>}
        </dl>
      </section>
      <VorschauBlock v={u.vorschau} warnung={t('werkbank.pakete.hochgeladen-aus-der-datei', { datei: u.datei })}
        abbrechen={() => { z.setUpload(null); geheZu('/werkbank/pakete'); }}
        los={async (x) => {
          try {
            const r = await api.paketInstallieren({ upload: u.upload, bestaetigt: true, ...x });
            z.setUpload(null); await z.laden(); await d.neuLaden();
            geheZu(`/werkbank/pakete/${r.id}?${NEU}`);
          } catch (e) { setMeldung(alsMeldung(e)); }
        }} />
    </div>
  );
}

/** Register des Pakets (#1214, Baustein Reiter): Übersicht und Einstellungen; ein Warnsymbol, wenn Einstellungen fehlen. */
function PaketReiter({ reiter, setze, noetig }: { reiter: 'uebersicht' | 'einstellungen'; setze(r: 'uebersicht' | 'einstellungen'): void; noetig: boolean }) {
  return <Reiter id="paket" wert={reiter} setze={setze} beschriftung={t('werkbank.pakete.paket')} wahlen={[{ wert: 'uebersicht', text: t('werkbank.pakete.uebersicht') },
    { wert: 'einstellungen', text: <>{t('werkbank.pakete.einstellungen')}{noetig && <> <Symbol name="warnung" className="sym-warn" /><span className="sr">{t('werkbank.pakete.einstellungen-noetig-2')}</span></>}</> }]} />;
}
/** Inhalt unter dem Register – ohne Register (Paket ohne Einstellungen) ohne Fläche. */
function MitFlaeche({ an, wert, children }: { an: boolean; wert: string; children: ReactNode }) {
  return an ? <ReiterFlaeche id="paket" wert={wert}>{children}</ReiterFlaeche> : <>{children}</>;
}

/**
 * Kurzanleitung (#1047) einmal direkt nach der Installation: im Ablauf der Paketseite gesetzt oder über ?neu=1 (Link,
 * Hochladen) – der Merker verschwindet gleich aus der Adresse, damit ein Neuladen ihn nicht wieder zeigt.
 */
function useAnleitungNeu(): [boolean, (an: boolean) => void] {
  const [neu, setNeu] = useState(() => new URLSearchParams(location.search).has('neu'));
  useEffect(() => { if (new URLSearchParams(location.search).has('neu')) geheZu(location.pathname, true); }, []);
  return [neu, setNeu];
}

function PaketDetail({ z, id, quelle }: { z: PaketeZustand; id: string; quelle?: string }) {
  const d = useDaten();
  const inst = z.stand?.installiert.find((p) => p.id === id) ?? null;
  // Installierte Pakete: Updates nur aus ihrer Quelle.
  const eigeneQuelle = inst?.herkunft.art === 'katalog' && inst.herkunft.url !== z.stand?.katalogUrl ? inst.herkunft.url : undefined;
  const aus = z.paketAus(id, quelle ?? eigeneQuelle);
  const kp = aus?.kp;
  const offiziell = inst ? inst.herkunft.art === 'katalog' && inst.herkunft.url === z.stand?.katalogUrl : !quelle || quelle === z.stand?.katalogUrl;
  const [version, setVersion] = useState<string>('');
  const [vorschau, setVorschau] = useState<PaketVorschau | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<Meldung>();
  const [reiter, setReiter] = useState<'uebersicht' | 'einstellungen'>(() => (new URLSearchParams(location.search).get('reiter') === 'einstellungen' ? 'einstellungen' : 'uebersicht'));
  const [entfernenOffen, setEntfernenOffen] = useState(false);
  const [behalten, setBehalten] = useState(false);
  // Installieren im gemeinsamen Ablauf (#405): mit Abhängigkeiten (auch mit Code) und Ergänzungen in einem Schritt.
  const [ablauf, setAblauf] = useState(false);
  const [anleitungNeu, setAnleitungNeu] = useAnleitungNeu();
  const katalog = aus ? z.kataloge?.liste.find((k) => k.url === aus.url)?.katalog ?? null : null;
  const v = kp?.versionen.find((x) => x.version === (version || kp.aktuell)) ?? kp?.versionen[0];
  const neuer = inst && inst.herkunft.art === 'katalog' && kp && vergleicheVersion(kp.aktuell, inst.version) > 0 ? kp.aktuell : null;
  // Paketseite im Katalog (#622): nur für Pakete aus dem offiziellen Katalog, nicht für hochgeladene.
  const imKatalog = offiziell && (inst ? inst.herkunft.art === 'katalog' : !!kp);

  async function zeigeVorschau(ver?: string) {
    setMeldung(undefined); setLaeuft(true);
    try { setVorschau(await api.paketVorschau({ id, version: ver, quelle: inst ? eigeneQuelle : quelle })); }
    catch (e) { setMeldung(alsMeldung(e)); }
    finally { setLaeuft(false); }
  }
  async function tu(f: () => Promise<string>) {
    setMeldung(undefined); setLaeuft(true);
    try { const text2 = await f(); setVorschau(null); await z.laden(); await d.neuLaden(); setMeldung({ art: 'gut', text: text2 }); }
    catch (e) { setMeldung(alsMeldung(e)); }
    finally { setLaeuft(false); }
  }
  const entfernen = () => {
    if (!inst) return;
    // Mit Einstellungen (#197): fragen, ob sie für eine spätere Neuinstallation bleiben sollen (Standard: nein).
    if (inst.einstellungen) { setEntfernenOffen(true); return; }
    void tu(async () => {
      const r = await entferneMitFragen(id, false);
      geheZu('/werkbank/pakete', true); return t('werkbank.pakete.ist-entfernt', { name: inst.name }) + behaltenText(r.beispieleBehalten) + vorgabenText(r.vorgabenBehalten);
    });
  };
  const entfernenBestaetigt = () => void tu(async () => { const r = await entferneMitFragen(id, behalten); setEntfernenOffen(false); geheZu('/werkbank/pakete', true); return t('werkbank.pakete.ist-entfernt-2', { name: inst!.name, wert: behalten ? t('werkbank.pakete.die-einstellungen-bleiben-fuer') : '' }) + behaltenText(r.beispieleBehalten) + vorgabenText(r.vorgabenBehalten); });
  // Beispiele entfernen (#878): unveränderte Beispiel-Mappen samt Dokumenten; geänderte bleiben und werden genannt.
  const beispieleEntfernen = () => {
    void tu(async () => { const r = await api.paketBeispieleEntfernen(id); return t('werkbank.pakete.beispiele-entfernt', { anzahl: r.entfernt }) + behaltenText(r.behalten); });
  };

  if (!inst && !kp) return (
    <div className="leer">
      <p>{z.kataloge ? t('werkbank.pakete.dieses-paket-gibt-es') : t('werkbank.pakete.lade')}</p>
      {!z.kataloge && <Knopf onClick={() => z.abrufen()}>{t('werkbank.pakete.katalog-abrufen')}</Knopf>}
    </div>
  );
  const autor = inst?.autor ?? kp?.autor;
  return (
    <div className="einspaltig">
      <div className="mappenkopf">
        <p className="ueber">{t('werkbank.pakete.paket')}{!offiziell && <> · <span className="chip warn">{t('werkbank.pakete.nicht-vom-ablago-projekt')}</span></>}</p>
        <h1>{inst?.name ?? kp!.name}<Herausgeber wer={inst?.herausgeber ?? kp?.herausgeber} geprueft={inst ? inst.herausgeberGeprueft : offiziell} /></h1>
        <p className="leise">{inst?.beschreibung ?? kp?.beschreibung}</p>
      </div>
      <MeldungBox m={meldung} />{inst && anleitungNeu && <Kurzanleitung k={inst.kurzanleitung} neu schliessen={() => setAnleitungNeu(false)} />}
      {inst?.einstellungen && (
        <PaketReiter reiter={reiter} noetig={!!inst.einstellungenNoetig} setze={(r) => { if (r === 'einstellungen') setReiter(r); else void darfVerlassen().then((ok) => { if (ok) setReiter(r); }); }} />
      )}
      {inst?.einstellungen && reiter === 'einstellungen' ? <ReiterFlaeche id="paket" wert={reiter}><PaketEinstellungen id={id} gespeichert={() => void z.laden()} /></ReiterFlaeche> : <MitFlaeche an={!!inst?.einstellungen} wert={reiter}>

      <section className="blatt">
        <dl className="eigenschaften">
          {inst && <><dt>{t('werkbank.pakete.installiert')}</dt><dd>{t('werkbank.pakete.version-4', { version: inst.version, datum: datum(inst.installiert), wert: inst.installiertVon ? t('werkbank.pakete.von-2', { installiertVon: inst.installiertVon }) : '' })}</dd></>}
          {inst?.aktualisiert && <><dt>{t('werkbank.pakete.aktualisiert')}</dt><dd>{datum(inst.aktualisiert)}{inst.aktualisiertVon ? t('werkbank.pakete.von-3', { aktualisiertVon: inst.aktualisiertVon }) : ''}</dd></>}
          <dt>{t('werkbank.pakete.herkunft')}</dt><dd>{inst ? herkunftText(inst.herkunft) : aus?.offiziell ? t('werkbank.pakete.offizieller-katalog-2') : t('werkbank.pakete.katalog', { url: String(aus?.url) })}</dd>
          {kp && <><dt>{t('werkbank.pakete.im-katalog')}</dt><dd>{t('werkbank.pakete.version-5', { aktuell: kp.aktuell })}{neuer && <> · <strong>{t('werkbank.pakete.neuer-als-installiert')}</strong></>}</dd></>}
          <dt>{t('werkbank.pakete.lizenz')}</dt><dd><LizenzAngabe lizenz={inst?.lizenz ?? kp?.lizenz ?? ''} /></dd>
          <dt>{t('werkbank.pakete.autor')}</dt><dd>{autor?.name}{autor?.github && <> (<a className="verweis" href={`https://github.com/${autor.github}`} target="_blank" rel="noreferrer">@{autor.github}</a>)</>}</dd>
          {v && <><dt>{t('werkbank.pakete.noetige-ablago-version')}</dt><dd>{tn('werkbank.pakete.dieser-installation-2', { dms: v.dms, dms2: z.stand?.dms })}</dd></>}
          {/* Sprachpaket (#731): Sprache und wie übersetzt – aus dem Katalog bzw. vom installierten Paket. */}
          {(inst?.sprache || v?.sprache) && <><dt>{t('werkbank.pakete.sprache')}</dt><dd>
            {inst?.sprache ? t('werkbank.pakete.sprache.info', { sprache: sprachname(inst.sprache.kennung), prozent: inst.spracheAbdeckung ?? '–', ablago: inst.sprache.ablago }) : sprachname(v!.sprache!.kennung)}
            <SprachHerkunft maschinell={(inst?.sprache ?? v!.sprache!).maschinell} geprueftVon={(inst?.sprache ?? v!.sprache!).geprueftVon} />
          </dd></>}
          {v && <><dt>{t('werkbank.pakete.abhaengigkeiten')}</dt><dd>{Object.keys(v.abhaengigkeiten).length ? Object.entries(v.abhaengigkeiten).map(([k, b]) => `${k} ${b}`).join(', ') : t('werkbank.pakete.keine')}</dd></>}
          {(v?.readme || inst?.links?.readme || imKatalog) && <><dt>{t('werkbank.pakete.mehr')}</dt><dd>{(v?.readme || inst?.links?.readme) && <a className="verweis" href={v?.readme || inst!.links!.readme} target="_blank" rel="noreferrer">{t('werkbank.pakete.readme')}</a>}{(v?.changelog || inst?.links?.changelog) && <> · <a className="verweis" href={v?.changelog || inst!.links!.changelog} target="_blank" rel="noreferrer">{t('werkbank.pakete.aenderungen')}</a></>}
            {/* Paketseite im offiziellen Katalog mit der Ablago-Version nur im Fragment (#622). */}
            {imKatalog && <>{(v?.readme || inst?.links?.readme) && ' · '}<a className="verweis" href={katalogSeiteMitVersion(z.stand?.dms ?? '', id)} target="_blank" rel={KATALOG_LINK_REL} title={tx('pakete.katalog.hinweis')}>{tx('pakete.katalog.ansehen')} <Symbol name="extern" /></a></>}</dd></>}
        </dl>
        {inst?.laeufer && <LaeuferStand paket={inst.id} abonniert={inst.laeufer.ereignisse} netz={hatNetz(inst.laeufer)} />}
        {inst?.laeufer && hatSchnittstelle(inst.laeufer, 'dms:vektoren') && <VektorStandBlock />}
        {inst?.laeufer && hatSchnittstelle(inst.laeufer, 'dms:antworten') && <FragenGrenzenBlock />}
        {inst?.laeufer && hatSchnittstelle(inst.laeufer, 'dms:erkennen') && <ErkennungPaketBlock paket={inst.id} />}
        {inst?.laeufer && hatSchnittstelle(inst.laeufer, 'dms:klassifizieren') && <KlassifizierenBlock netz={hatNetz(inst.laeufer)} />}
        {/* KI-Dienste (#796): welche Mappentypen das Paket bekommt; zulassen und sperren. */}
        {inst?.laeufer && istKiPaket(inst.laeufer) && <KiTypenBlock paket={inst.id} />}{!!inst?.mappenaktionen?.length && <PaketAktionenBlock paket={inst} />}
        {inst && (Object.keys(inst.typen).length > 0 || Object.keys(inst.sichten).length > 0) && (
          <>
            <h2 className="h3">{t('werkbank.pakete.gehoert-dazu')}</h2>
            <ul className="klein">
              {Object.values(inst.typen).map((text) => <li key={text}>{tn('werkbank.pakete.mappentyp', { wert: d.typ(text) ? <Link to={`/werkbank/typen/${text}`} className="verweis">{d.typ(text)!.name}</Link> : <span className="leise">{t('werkbank.pakete.geloescht')}</span> })}</li>)}
              {Object.values(inst.sichten).map((s) => <li key={s}>{tn('werkbank.pakete.ansicht', { wert: d.sicht(s) ? <Link to={`/ablage/${s}`} className="verweis">{d.sicht(s)!.name}</Link> : <span className="leise">{t('werkbank.pakete.geloescht')}</span> })}</li>)}
            </ul>
          </>
        )}
        {/* Mit Versionsauswahl: Knöpfe bündig mit dem Auswahlfeld statt auf Beschriftung + Feld gestreckt (#448). */}
        <div className={`knoepfe${kp && kp.versionen.length > 1 && !inst ? ' feld-buendig' : ''}`}>
          {kp && kp.versionen.length > 1 && !inst && (
            <Feld beschriftung={t('werkbank.pakete.version-6')}><select value={version || kp.aktuell} onChange={(e) => { setVersion(e.target.value); setVorschau(null); }}>{kp.versionen.map((x) => <option key={x.version} value={x.version}>{x.version}</option>)}</select></Feld>
          )}
          {!inst && kp && <Knopf art="haupt" gesperrt={laeuft || ablauf || !katalog} onClick={() => setAblauf(true)}>{t('werkbank.pakete.installieren')}</Knopf>}
          {inst && neuer && <Knopf art="haupt" gesperrt={laeuft} onClick={() => void zeigeVorschau(neuer)}>{t('werkbank.pakete.auf-aktualisieren', { neuer })}</Knopf>}
          {inst && (inst.beispielMappen?.length ?? 0) > 0 && <Knopf art="gefahr" symbol="geloescht" gesperrt={laeuft} onClick={beispieleEntfernen} rueckfrage={{ titel: t('werkbank.pakete.beispiele-entfernen.frage', { name: inst.name }), text: t('werkbank.pakete.beispiele-entfernen.text'), ja: t('werkbank.pakete.beispiele-entfernen') }}>{t('werkbank.pakete.beispiele-entfernen')}</Knopf>}
          {/* Mit Einstellungen öffnet „Entfernen“ erst die Wahl „Einstellungen behalten“ (#197); entfernt wird dort nach Rückfrage. */}
          {inst && (inst.einstellungen ? <Knopf symbol="geloescht" gesperrt={laeuft} aria-expanded={entfernenOffen} onClick={entfernen}>{t('werkbank.pakete.entfernen')}</Knopf>
            : <Knopf art="gefahr" symbol="geloescht" gesperrt={laeuft} onClick={entfernen} rueckfrage={{ titel: t('werkbank.pakete.entfernen-2', { name: inst.name }), text: t('werkbank.pakete.seine-mappentypen-und-ansichten'), ja: t('werkbank.pakete.entfernen') }}>{t('werkbank.pakete.entfernen')}</Knopf>)}
          {inst?.herkunft.art === 'hochgeladen' && <span className="leise klein">{t('werkbank.pakete.ein-hochgeladenes-paket')}</span>}
        </div>
        {entfernenOffen && inst && (
          <div className="hinweis warn" role="dialog" aria-label={t('werkbank.pakete.paket-entfernen')}>
            <p>{t('werkbank.pakete.entfernen-seine-mappentypen-und', { name: inst.name })}</p>
            <HakenFeld beschriftung={t('werkbank.pakete.einstellungen-behalten-fuer-eine')}>
              <input type="checkbox" checked={behalten} onChange={(e) => setBehalten(e.target.checked)} />
            </HakenFeld>
            <div className="knoepfe"><Knopf art="gefahr" symbol="geloescht" gesperrt={laeuft} onClick={entfernenBestaetigt} rueckfrage={{ titel: t('werkbank.pakete.entfernen-2', { name: inst.name }), text: t('werkbank.pakete.seine-mappentypen-und-ansichten'), ja: t('werkbank.pakete.entfernen') }}>{t('werkbank.pakete.entfernen')}</Knopf><Knopf onClick={() => setEntfernenOffen(false)}>{t('werkbank.pakete.abbrechen')}</Knopf></div>
          </div>
        )}
      </section>

      <PaketMitkommt inst={inst} v={inst ? null : v} installiert={z.stand?.installiert ?? []} />
      {inst && <PaketUmwandeln key={`${inst.id}|${inst.version}`} paket={inst.id} />}

      {/* Auch nach der Installation sichtbar, bis „Weiter“ – sonst verschwände das Ergebnis mit dem Neuladen. */}
      {kp && ablauf && katalog && z.stand && (
        <section className="blatt stapel" aria-label={tx('pakete.ablauf.zusammenfassung')}>
          <h2 className="h3">{tx('pakete.ablauf.titel', { name: kp.name })} <Hilfe ort="werkbank.pakete.ablauf" /></h2>
          <PaketAblauf direkt quelle={{ art: 'katalog', katalog, quelle: aus?.offiziell ? undefined : aus?.url, dms: z.stand.dms, installiert: z.stand.installiert }} start={[id]} nur={[id]} versionen={version ? { [id]: version } : {}}
            aktionen={<Knopf onClick={() => setAblauf(false)}>{t('werkbank.pakete.abbrechen')}</Knopf>}
            geaendert={() => { void z.laden(); void d.neuLaden(); }}
            fertig={(e) => { setAblauf(false); if (e.installiert.some((x) => x.id === id)) { setMeldung({ art: 'gut', text: fertigText(e) }); setAnleitungNeu(true); } }} />
        </section>
      )}
      {inst && katalog && z.stand && <ErgaenzungenBlock z={z} inst={inst} katalog={katalog} quelle={aus?.offiziell ? undefined : aus?.url} />}

      {vorschau && (
        <VorschauBlock v={vorschau} warnung={offiziell || vorschau.pruefung?.bestaetigen === false ? null : t('werkbank.pakete.aus-dem-katalog', { wert: String(inst?.herkunft.art === 'katalog' ? inst.herkunft.url : quelle) })} abbrechen={() => setVorschau(null)}
          los={(x) => tu(async () => {
            if (vorschau.update) {
              const r = await api.paketAktualisieren(id, vorschau.paket.version, x.bestaetigt, x.rechteBestaetigt, { automatisierungen: x.automatisierungen, herausgeberBestaetigt: x.herausgeberBestaetigt, umbauBestaetigt: x.umbauBestaetigt, umbauEntscheidungen: x.umbauEntscheidungen, sichtenErsetzen: x.sichtenErsetzen });
              // Umzug (#1084): Das Paket heißt jetzt anders – dorthin.
              if (r.id !== id) geheZu(`/werkbank/pakete/${r.id}`);
              return t('werkbank.pakete.ist-jetzt-auf-version', { name: r.name, version: r.version });
            }
            const r = await api.paketInstallieren({ id, version: vorschau.paket.version, quelle, ...x });
            return t('werkbank.pakete.ist-installiert', { name: r.name, version: r.version });
          })} />
      )}
      </MitFlaeche>}
    </div>
  );
}

/**
 * „Was mitkommt“ auf der Paketseite (#1047): installiert, was diese Version mitbrachte, dazu die Rechte des Codes und die
 * Kurzanleitung; vor der Installation, was der Katalog verrät (alles Weitere zeigt die Vorschau). Installationen vor #1047
 * kennen es erst nach dem nächsten Update.
 */
function PaketMitkommt({ inst, v, installiert }: { inst: InstalliertesPaket | null; v: KatalogVersion | null | undefined; installiert: InstalliertesPaket[] }) {
  const d = useDaten();
  const m = inst?.mitkommt ?? (v ? mitkommtAusKatalog(v) : null);
  if (!m) return null;
  // Mappentyp eines Verweises im Code (eigener Schlüssel oder paket:typ) – wie in der Vorschau.
  const typName = (vw: string) => {
    const [p, k] = vw.includes(':') ? vw.split(':') : [inst?.id ?? '', vw];
    return d.typ((p === inst?.id ? inst.typen : installiert.find((x) => x.id === p)?.typen)?.[k] ?? '')?.name ?? k;
  };
  const rechte = inst?.laeufer ? rechteZeilen(rechtePunkte(inst.laeufer, typName)) : undefined;
  return (
    <section className="blatt stapel" aria-label={t('werkbank.pakete.mitkommt.titel')} data-anker="pakete.mitkommt">
      <h2 className="h3">{t('werkbank.pakete.mitkommt.titel')} <Hilfe ort="werkbank.pakete.mitkommt" /></h2>
      {!inst?.mitkommt && <p className="leise klein">{inst ? t('werkbank.pakete.mitkommt.alt') : t('werkbank.pakete.mitkommt.katalog')}</p>}
      <MitkommtInhalt m={m} rechte={inst?.mitkommt ? rechte : undefined} />
      {inst && !anleitungLeer(inst) && <Kurzanleitung k={inst.kurzanleitung} />}
    </section>
  );
}
const anleitungLeer = (inst: InstalliertesPaket) => !inst.kurzanleitung || !Object.keys(inst.kurzanleitung).length;

/** Erfolgsmeldung oben (#659): „… ist installiert“, bei Pflicht-Einstellungen mit dem Hinweis darauf. */
function fertigText(e: AblaufErgebnis) {
  const namen = e.installiert.map((x) => `${x.name} ${x.version}`).join(', ');
  const spaeter = e.installiert.filter((x) => x.einstellungen === 'spaeter' || x.einstellungen === 'fehler');
  return spaeter.length ? `${tx('pakete.ablauf.fertig', { namen })} ${tx('pakete.ablauf.fertig.einstellen', { namen: spaeter.map((x) => x.name).join(', ') })}` : tx('pakete.ablauf.fertig', { namen });
}

/**
 * Ergänzungen eines installierten Pakets nachträglich (#405), z. B. weitere Sprachen der Texterkennung: Häkchen, dann
 * derselbe Ablauf wie beim Installieren.
 */
function ErgaenzungenBlock({ z, inst, katalog, quelle }: { z: PaketeZustand; inst: InstalliertesPaket; katalog: Katalog; quelle?: string }) {
  const d = useDaten();
  const [offen, setOffen] = useState(false);
  const [meldung, setMeldung] = useState<Meldung>();
  const stand = z.stand!;
  const erg = ergaenzungenVon(katalog, inst.id, stand.dms, stand.installiert);
  if (!erg.length && !meldung && !offen) return null;
  const gruppen = [...new Set(erg.map((x) => x.gruppe ?? tx('pakete.ablauf.ergaenzungen')))];
  return (
    <section className="blatt stapel" aria-label={tx('pakete.ablauf.ergaenzungen')}>
      <h2 className="h3">{gruppen.join(', ')} <Hilfe ort="werkbank.pakete.ablauf" /></h2>
      <MeldungBox m={meldung} />
      {!offen ? (
        <>
          {erg.length > 0 && <p className="leise">{tx('pakete.ablauf.nachtraeglich', { anzahl: erg.length, namen: erg.slice(0, 4).map((x) => x.name.includes(' – ') ? x.name.slice(x.name.lastIndexOf(' – ') + 3) : x.name).join(', ') })}</p>}
          {erg.length > 0 && <div className="knoepfe"><Knopf onClick={() => { setMeldung(undefined); setOffen(true); }}>{tx('pakete.ablauf.nachtraeglich.knopf')}</Knopf></div>}
        </>
      ) : (
        <PaketAblauf quelle={{ art: 'katalog', katalog, quelle, dms: stand.dms, installiert: stand.installiert }} start={[]} nur={[inst.id]}
          aktionen={<Knopf onClick={() => setOffen(false)}>{t('werkbank.pakete.abbrechen')}</Knopf>}
          geaendert={() => { void z.laden(); void d.neuLaden(); }}
          fertig={(e) => { setOffen(false); if (e.installiert.length) setMeldung({ art: 'gut', text: fertigText(e) }); }} />
      )}
    </section>
  );
}

/** Name eines Ereignisses aus dem Katalog (#670); Pakete-eigene Arten (z. B. `volltext.fertig` alt) bleiben, wie sie sind. */
function ereignisName(art: string) { return istKatalogArt(art) ? tx(`ereignisse.name.${ereignisSchluessel(art)}`) : art; }

/** Der Ereigniskatalog (#670) zum Nachschlagen: Gruppe, Name, Beschreibung. */
export function EreignisKatalogListe() {
  const gruppen = [...new Set(KATALOG_ARTEN.map((a) => EREIGNISKATALOG[a].gruppe))];
  return (
    <details className="klein">
      <summary><Symbol name="info" /> {tx('ereignisse.katalog.titel')}</summary>
      {gruppen.map((g) => (
        <div key={g}>
          <h3 className="h4">{tx(`ereignisse.gruppe.${g}`)}</h3>
          <dl className="eigenschaften">{KATALOG_ARTEN.filter((a) => EREIGNISKATALOG[a].gruppe === g).map((a) => <Fragment key={a}><dt>{tx(`ereignisse.name.${ereignisSchluessel(a)}`)}</dt><dd>{tx(`ereignisse.text.${ereignisSchluessel(a)}`)} <code>{a}</code></dd></Fragment>)}</dl>
        </div>
      ))}
    </details>
  );
}

/** Paket mit Code (#338): läuft es, was ist zuletzt passiert, offene und aufgegebene Ereignisse. */
/** netz: Das Paket darf ins Netz – dann seine Messwerte als externer Dienst (#565). */
function LaeuferStand({ paket, abonniert = [], netz = false }: { paket: string; abonniert?: readonly string[]; netz?: boolean }) {
  const [s, setS] = useState<PaketlaeuferStand | null | undefined>(undefined);
  const laden = useCallback(() => { api.paketLaeufer().then(setS, () => setS(null)); }, []);
  useEffect(() => { laden(); }, [laden]);
  const p = s?.pakete.find((x) => x.id === paket) ?? null;
  // Zustand passend zu dem, was der Läufer tut (#403); solange er startet, von selbst nachfragen.
  const stand = s ? laeuferZustandText({ zustand: s.zustand, absturz: s.absturz, paket: p }, datum) : null;
  useEffect(() => {
    if (!stand?.wartet) return;
    const uhr = setTimeout(laden, 2000);
    return () => clearTimeout(uhr);
  }, [s, stand?.wartet, laden]);
  if (s === undefined) return null;
  return (
    <>
      {/* „Aktualisieren“ heißt in der Paketverwaltung nur das Update (#659); hier lädt der Knopf den Stand neu. */}
      <div className="zeile-zwischen"><h2 className="h3">{t('werkbank.pakete.paket-laeufer')}</h2>{s && stand && p && <Knopf art="link" onClick={laden}>{tn('werkbank.pakete.stand-neu-laden', { symbol: <Symbol name="neu-laden" /> })}</Knopf>}</div>
      {!s || !stand ? <p className="leise">{t('werkbank.pakete.der-paket-laeufer-laeuft')}</p> : !p ? <p className="leise">{stand.text}</p> : (
        <>
          <dl className="eigenschaften">
            <dt>{t('werkbank.pakete.stand')}</dt><dd>{stand.fehler ? <span className="fehlertext">{stand.text}</span> : stand.text}</dd>
            <dt>{t('werkbank.pakete.dienstkonto')}</dt><dd>{p.dienstkonto ?? '–'}</dd>
            <dt>{t('werkbank.pakete.aufrufe')}</dt><dd>{p.aufrufe}{p.fehlgeschlagen ? t('werkbank.pakete.davon-fehlgeschlagen', { fehlgeschlagen: p.fehlgeschlagen }) : ''}{p.dauerMs !== null ? t('werkbank.pakete.zuletzt-s-mb', { wert: Math.round(p.dauerMs / 100) / 10, speicherMB: String(p.speicherMB) }) : ''}</dd>
            <dt>{t('werkbank.pakete.ereignisse')}</dt><dd>{t('werkbank.pakete.zugestellt-offen', { zugestellt: p.ereignisse.zugestellt, offen: p.ereignisse.offen })}{p.ereignisse.aufgegeben ? <> · <strong>{t('werkbank.pakete.aufgegeben', { aufgegeben: p.ereignisse.aufgegeben })}</strong></> : ''} · {p.ereignisse.zuletzt ? tx('ereignisse.pakete.zuletzt', { zeit: datum(p.ereignisse.zuletzt) }) : tx('ereignisse.pakete.nie')}</dd>
            {abonniert.length > 0 && <><dt>{t('werkbank.pakete.abonniert')}</dt><dd>{abonniert.map(ereignisName).join(', ')}</dd></>}
            <dt>{t('werkbank.pakete.grenzen')}</dt><dd>{t('werkbank.pakete.mb-speicher-s-je', { speicherMB: s.grenzen.speicherMB, sekunden: s.grenzen.sekunden, parallel: s.grenzen.parallel })}</dd>
          </dl>
          {p.letzte.length > 0 && <ul className="klein">{p.letzte.slice(0, 10).map((x) => <li key={x.zeit + x.art}>{datum(x.zeit)} · {ereignisName(x.art)} · {x.ok ? t('werkbank.pakete.ok') : <span className="fehlertext">{x.text}</span>}{x.ok && x.text ? ` – ${x.text}` : ''}</li>)}</ul>}
          {p.protokoll.length > 0 && <details className="klein"><summary>{t('werkbank.pakete.ausgaben-des-pakets')}</summary><ul>{p.protokoll.slice(0, 30).map((x, i) => <li key={i} className={x.stufe >= 2 ? 'fehlertext' : undefined}>{datum(x.zeit)} · {x.text}</li>)}</ul></details>}
        </>
      )}
      {netz && <PaketExternBlock paket={paket} />}
      <EreignisKatalogListe />
    </>
  );
}

/** Lizenz eines Pakets (#651): bei eigener oder fehlender Lizenz mit sachlichem Hinweis. */
function LizenzAngabe({ lizenz }: { lizenz: string }) {
  const art = lizenzArtVon(lizenz);
  if (art === 'frei') return <>{lizenz}</>;
  return <>{art === 'keine' || lizenz === KEINE_LIZENZ ? tx('pakete.erstellen.lizenz.keine') : lizenz.replace(/^LicenseRef-/, '').replace(/-/g, ' ')}
    <small className="leise" style={{ display: 'block' }}>{tx(art === 'keine' ? 'pakete.vorschau.lizenz.keine' : 'pakete.vorschau.lizenz.eigen')}</small></>;
}
