import { Knopf } from '../bausteine';
import { Fragment, useCallback, useEffect, useState } from 'react';
import { Symbol } from '../Symbol';
import { ergaenzungenVon, hatNetz, hatSchnittstelle, inMB, istKiPaket, legtEtwasAn, herkunftText, KATALOG_LINK_REL, katalogSeiteMitVersion, sammelSeiteMitVersion, laeuferZustandText, vergleicheVersion, type AblaufErgebnis, type HerkunftPruefung, type InstalliertesPaket, type Katalog, type KatalogPaket } from '../../../shared/src/pakete';
import { PAKET_ID } from '../../../shared/src/kennungen';
import { api, ApiFehler, type BeispielBehalten, type PaketlaeuferStand, type PaketQuelle, type PaketVorschau, type Sammeldatei } from '../api';
import { useDaten } from '../daten';
import { Hilfe } from '../Hilfe';
import { Listenkopf } from '../Listenkopf';
import { darfVerlassen, geheZu, Link } from '../ort';
import { PaketEinstellungen } from './PaketEinstellungen';
import { VektorStandBlock } from '../ablage/Aehnlich';
import { FragenGrenzenBlock } from './FragenGrenzen';
import { ErkennungPaketBlock, KlassifizierenBlock } from './ErkennungPaket';
import { KiTypenBlock } from './KiTypen';
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
import { MITMACHEN_URL } from '../../../shared/src/sprachwahl';
import { Kopf } from './Kopf';

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
  const [updates, setUpdates] = useState<Array<{ id: string; installiert: string; neu: string; changelog: string | null; quelle: string }> | null>(null);
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
  const pruefen = useCallback(async () => {
    setLaedt(true); setFehler(undefined);
    try { setUpdates(await api.paketUpdates()); const k = await api.paketKatalog(true); setKataloge({ liste: k.kataloge, abgerufen: k.abgerufen }); } catch (e) { setFehler((e as Error).message); } finally { setLaedt(false); }
  }, []);
  /** Katalogpaket aus einer Quelle (ohne Angabe: offizieller Katalog). */
  const paketAus = (id: string, quelle?: string): { kp: KatalogPaket; url: string; offiziell: boolean } | undefined => {
    const k = kataloge?.liste.find((x) => (quelle ? x.url === quelle : x.offiziell));
    // Umgezogen (#1084): unter der neuen Id, die die installierte unter `ersetzt` nennt.
    const kp = k?.katalog?.pakete.find((p) => p.id === id) ?? k?.katalog?.pakete.find((p) => p.ersetzt?.includes(id));
    return kp && k ? { kp, url: k.url, offiziell: k.offiziell } : undefined;
  };
  /** Hat ein Katalog ein Paket mit derselben Id wie ein selbst erstelltes (#652)? */
  const konflikt = (id: string) => !!kataloge?.liste.some((k) => k.katalog?.pakete.some((p) => p.id === id));
  return { stand, selbst, kataloge, updates, upload, setUpload, sammel, setSammel, fehler, laedt, laden, abrufen, pruefen, paketAus, setStand, konflikt };
}
export type PaketeZustand = ReturnType<typeof usePakete>;

export function PaketeListe({ z, offen }: { z: PaketeZustand; offen?: string }) {
  const [experte, setExperte] = useExperteOffen();
  const installiert = z.stand?.installiert ?? [];
  const quelleOffen = new URLSearchParams(location.search).get('quelle');
  const verfuegbar = (z.kataloge?.liste ?? [])
    .flatMap((k) => (k.katalog?.pakete ?? []).filter((p) => !installiert.some((i) => i.id === p.id || p.ersetzt?.includes(i.id))).map((p) => ({ p, url: k.url, offiziell: k.offiziell })));
  const neuer = (id: string) => z.updates?.find((u) => u.id === id);
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
        {/* „läuft“ am jeweiligen Knopf (#986); das Ergebnis ist die Liste darunter, ein Fehler steht über der Liste. */}
        <Knopf groesse="klein" laeuftText={t('werkbank.pakete.frage-ab')} onClick={() => z.abrufen()}>{t('werkbank.pakete.katalog-abrufen')}</Knopf>
        {installiert.length > 0 && <Knopf groesse="klein" laeuftText={t('werkbank.pakete.frage-ab')} onClick={z.pruefen}>{t('werkbank.pakete.auf-neue-versionen-pruefen')}</Knopf>}
        <Link to={`/werkbank/pakete/${ERSTELLEN}`} className={`knopf klein ${offen === ERSTELLEN ? 'an' : ''}`}>{t('werkbank.pakete.paket-erstellen')}</Link>
        <Link to={`/werkbank/pakete/${SAMMEL}`} className={`knopf klein ${offen === SAMMEL ? 'an' : ''}`}>{t('werkbank.pakete.ohne-internet')}</Link>
      </div>
      <section className="aufklappbereich">
        <button type="button" className="aufklappkopf" aria-expanded={experte} aria-controls="pakete-experte" onClick={() => setExperte(!experte)}>
          <span className="zeichen" aria-hidden="true">{experte ? '▾' : '▸'}</span>
          <span>{t('werkbank.pakete.expertenmodus')}</span>
          <span className="leise klein">{t('werkbank.pakete.weitere-quellen-paket-oder')}</span>
        </button>
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
      <h2 className="ueber">{t('werkbank.pakete.installiert')}</h2>
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
      {!z.kataloge ? <p className="leise klein">{t('werkbank.pakete.klicke-katalog-abrufen-um')}</p>
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
      {z.kataloge && <p className="leise klein">{t('werkbank.pakete.abgerufen', { datum: datum(z.kataloge.abgerufen) })}</p>}
      {/* Herkunft des offiziellen Katalogs (#594): signiert, nicht signiert (Stufe 1: nur Warnung) oder ungültig. */}
      <HerkunftZeile p={z.kataloge?.liste.find((k) => k.offiziell)?.pruefung} />
    </>
  );
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
              <label className="haken"><input type="checkbox" checked={q.aktiv} onChange={(e) => void tu(() => api.paketQuelleSchalten(q.url, e.target.checked))} /><span className="umbrechen">{q.url}</span></label>
              <span className="leise"> {q.von ? t('werkbank.pakete.von', { von: q.von }) : ''}{q.am ? t('werkbank.pakete.am', { datum: datum(q.am) }) : ''} · </span>
              <Knopf art="link" className="gefahr" onClick={async () => { if (await rueckfrage({ titel: t('werkbank.pakete.paketquelle-entfernen'), text: q.url, ja: t('werkbank.pakete.entfernen'), gefahr: true })) void tu(() => api.paketQuelleEntfernen(q.url)); }}>{t('werkbank.pakete.entfernen')}</Knopf>
              {q.gesperrt ? (
                <div className="hinweis warn" role="alert">
                  <p><Symbol name="warnung" className="sym-warn" /> {tx('pakete.quelle.gesperrt', { seit: datum(q.gesperrt.seit) })} <code className="fingerabdruck">{q.gesperrt.fingerabdruck}</code></p>
                  <button type="button" className="knopf klein" onClick={() => void mitSchluessel(q.url, (fp) => api.paketQuelleSchluessel(q.url, fp))}>{tx('pakete.quelle.pruefen')}</button>
                </div>
              ) : (
                <p className="leise">
                  {q.fingerabdruck ? <><Symbol name="schloss" /> {tx('pakete.quelle.schluessel')} <code className="fingerabdruck">{q.fingerabdruck}</code></> : tx('pakete.quelle.ohne')}
                  {' · '}<button type="button" className="textknopf" onClick={() => void mitSchluessel(q.url, (fp) => api.paketQuelleSchluessel(q.url, fp))}>{tx('pakete.quelle.pruefen')}</button>
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      <form className="zeile" onSubmit={(e) => { e.preventDefault(); const adresse = url.trim(); void mitSchluessel(adresse, async (fp) => { const r = await api.paketQuelleHinzu(adresse, fp); setUrl(''); return r; }); }}>
        <input type="url" placeholder="https://…/katalog.json" aria-label={t('werkbank.pakete.adresse-eines-weiteren-katalogs')} value={url} onChange={(e) => setUrl(e.target.value)} />
        <button type="submit" className="knopf klein" disabled={!url.trim()}>{t('werkbank.pakete.hinzufuegen')}</button>
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
    </div>
  );
  if (id === UPLOAD) return <UploadDetail z={z} />;
  if (id === SAMMEL) return <SammelDetail z={z} />;
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
        <div className="hinweis info"><p>{tn('werkbank.pakete.ist-schon-installiert-version', { name: vorschau!.paket.name, installiert: vorschau!.installiert })}{' '}<button type="button" className="textknopf" onClick={() => { void z.abrufen(false); geheZu(`/werkbank/pakete/${id}`); }}>{t('werkbank.pakete.zum-paket')}</button> {' '}{t('werkbank.pakete.dort-gibt-es-ggf')}</p></div>
      )}
      {vorschau && !schon && !vorschau.update && katalog && z.stand && (
        <PaketAblauf quelle={{ art: 'katalog', katalog, dms: z.stand.dms, installiert: z.stand.installiert }} start={[id]} nur={[id]} versionen={version ? { [id]: version } : {}}
          aktionen={<button type="button" className="textknopf" onClick={() => geheZu('/werkbank/pakete')}>{t('werkbank.pakete.abbrechen')}</button>}
          geaendert={() => { void z.laden(); void d.neuLaden(); }}
          fertig={(e) => { void z.abrufen(false); geheZu(e.installiert.some((x) => x.id === id) ? `/werkbank/pakete/${id}` : '/werkbank/pakete'); }} />
      )}
      {vorschau && !schon && vorschau.update && (
        <VorschauBlock v={vorschau} warnung={null} abbrechen={() => geheZu('/werkbank/pakete')}
          los={async (x) => {
            try {
              const r = vorschau.update ? await api.paketAktualisieren(id, vorschau.paket.version, x.bestaetigt, x.rechteBestaetigt, x.automatisierungen) : await api.paketInstallieren({ id, version: vorschau.paket.version, ...x });
              await z.laden(); await d.neuLaden(); await z.abrufen(false);
              geheZu(`/werkbank/pakete/${r.id}`);
            } catch (e) { setMeldung(alsMeldung(e)); }
          }} />
      )}
    </div>
  );
}

/** Ergebnis einer Aktion mit ggf. Gründen. */
export type Meldung = { art: 'gut' | 'schlecht'; text: string; gruende?: string[] };
export const alsMeldung = (e: unknown): Meldung => ({ art: 'schlecht', text: (e as Error).message, gruende: e instanceof ApiFehler ? e.gruende : [] });

export function MeldungBox({ m }: { m?: Meldung }) {
  return m ? <div className={`hinweis ${m.art}`} role="status"><p>{m.text}</p>{!!m.gruende?.length && <ul>{m.gruende.map((g) => <li key={g}>{g}</li>)}</ul>}</div> : null;
}

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
            geheZu(`/werkbank/pakete/${r.id}`);
          } catch (e) { setMeldung(alsMeldung(e)); }
        }} />
    </div>
  );
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
  const entfernen = async () => {
    if (!inst) return;
    // Mit Einstellungen (#197): fragen, ob sie für eine spätere Neuinstallation bleiben sollen (Standard: nein).
    if (inst.einstellungen) { setEntfernenOffen(true); return; }
    if (!(await rueckfrage({ titel: t('werkbank.pakete.entfernen-2', { name: inst.name }), text: t('werkbank.pakete.seine-mappentypen-und-ansichten'), ja: t('werkbank.pakete.entfernen'), gefahr: true }))) return;
    void tu(async () => {
      let bestaetigt = false;
      let r: { beispieleBehalten: BeispielBehalten[] } | null = null;
      try { r = await api.paketEntfernen(id); } catch (e) {
        // Sprachpaket in Gebrauch (#731): sagen, wen es betrifft, und nur auf ausdrücklichen Wunsch entfernen.
        const s = e instanceof ApiFehler && e.status === 409 ? (e.details as { sprache?: unknown } | undefined)?.sprache : undefined;
        if (!s || !(await rueckfrage({ titel: (e as Error).message, text: (e as ApiFehler).gruende.join(' '), ja: t('werkbank.pakete.sprache.entfernen'), gefahr: true }))) throw e;
        bestaetigt = true;
      }
      if (bestaetigt) r = await api.paketEntfernen(id, false, true);
      geheZu('/werkbank/pakete', true); return t('werkbank.pakete.ist-entfernt', { name: inst.name }) + behaltenText(r?.beispieleBehalten);
    });
  };
  const entfernenBestaetigt = () => void tu(async () => { const r = await api.paketEntfernen(id, behalten); setEntfernenOffen(false); geheZu('/werkbank/pakete', true); return t('werkbank.pakete.ist-entfernt-2', { name: inst!.name, wert: behalten ? t('werkbank.pakete.die-einstellungen-bleiben-fuer') : '' }) + behaltenText(r.beispieleBehalten); });
  // Beispiele entfernen (#878): unveränderte Beispiel-Mappen samt Dokumenten; geänderte bleiben und werden genannt.
  const beispieleEntfernen = async () => {
    if (!inst || !(await rueckfrage({ titel: t('werkbank.pakete.beispiele-entfernen.frage', { name: inst.name }), text: t('werkbank.pakete.beispiele-entfernen.text'), ja: t('werkbank.pakete.beispiele-entfernen'), gefahr: true }))) return;
    void tu(async () => { const r = await api.paketBeispieleEntfernen(id); return t('werkbank.pakete.beispiele-entfernt', { anzahl: r.entfernt }) + behaltenText(r.behalten); });
  };

  if (!inst && !kp) return (
    <div className="leer">
      <p>{z.kataloge ? t('werkbank.pakete.dieses-paket-gibt-es') : t('werkbank.pakete.lade')}</p>
      {!z.kataloge && <button type="button" className="knopf" onClick={() => void z.abrufen()}>{t('werkbank.pakete.katalog-abrufen')}</button>}
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
      <MeldungBox m={meldung} />
      {inst?.einstellungen && (
        <div className="registertaben" role="tablist" aria-label={t('werkbank.pakete.paket')}>
          <button type="button" role="tab" aria-selected={reiter === 'uebersicht'} className={`registertab ${reiter === 'uebersicht' ? 'an' : ''}`} onClick={() => void darfVerlassen().then((ok) => { if (ok) setReiter('uebersicht'); })}>{t('werkbank.pakete.uebersicht')}</button>
          <button type="button" role="tab" aria-selected={reiter === 'einstellungen'} className={`registertab ${reiter === 'einstellungen' ? 'an' : ''}`} onClick={() => setReiter('einstellungen')}>{t('werkbank.pakete.einstellungen')}{inst.einstellungenNoetig && <> <Symbol name="warnung" className="sym-warn" /><span className="sr">{t('werkbank.pakete.einstellungen-noetig-2')}</span></>}</button>
        </div>
      )}
      {inst?.einstellungen && reiter === 'einstellungen' ? <PaketEinstellungen id={id} gespeichert={() => void z.laden()} /> : <>

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
          {v && (v.inhalt.mappentypen.length > 0 || v.inhalt.sichten.length > 0 || v.inhalt.beispiele > 0) && <><dt>{t('werkbank.pakete.inhalt')}</dt><dd>{t('werkbank.pakete.mappentypen')}{' '}{v.inhalt.mappentypen.map((benannt) => benannt.name).join(', ') || '–'}{tn('werkbank.pakete.ansichten', { umbruch: <br /> })}{' '}{v.inhalt.sichten.map((s) => s.name).join(', ') || '–'}{v.inhalt.beispiele ? <>{tn('werkbank.pakete.beispiel-mappen-optional', { umbruch: <br />, beispiele: v.inhalt.beispiele })}</> : null}</dd></>}
          {(v?.readme || inst?.links?.readme || imKatalog) && <><dt>{t('werkbank.pakete.mehr')}</dt><dd>{(v?.readme || inst?.links?.readme) && <a className="verweis" href={v?.readme || inst!.links!.readme} target="_blank" rel="noreferrer">{t('werkbank.pakete.readme')}</a>}{(v?.changelog || inst?.links?.changelog) && <> · <a className="verweis" href={v?.changelog || inst!.links!.changelog} target="_blank" rel="noreferrer">{t('werkbank.pakete.aenderungen')}</a></>}
            {/* Paketseite im offiziellen Katalog mit der Ablago-Version nur im Fragment (#622). */}
            {imKatalog && <>{(v?.readme || inst?.links?.readme) && ' · '}<a className="verweis" href={katalogSeiteMitVersion(z.stand?.dms ?? '', id)} target="_blank" rel={KATALOG_LINK_REL} title={tx('pakete.katalog.hinweis')}>{tx('pakete.katalog.ansehen')} <Symbol name="extern" /></a></>}</dd></>}
        </dl>
        {inst?.laeufer && <LaeuferStand paket={inst.id} abonniert={inst.laeufer.ereignisse} />}
        {inst?.laeufer && hatSchnittstelle(inst.laeufer, 'dms:vektoren') && <VektorStandBlock />}
        {inst?.laeufer && hatSchnittstelle(inst.laeufer, 'dms:antworten') && <FragenGrenzenBlock />}
        {inst?.laeufer && hatSchnittstelle(inst.laeufer, 'dms:erkennen') && <ErkennungPaketBlock paket={inst.id} />}
        {inst?.laeufer && hatSchnittstelle(inst.laeufer, 'dms:klassifizieren') && <KlassifizierenBlock netz={hatNetz(inst.laeufer)} />}
        {/* KI-Dienste (#796): welche Mappentypen das Paket bekommt; zulassen und sperren. */}
        {inst?.laeufer && istKiPaket(inst.laeufer) && <KiTypenBlock paket={inst.id} />}
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
            <label className="klein">{t('werkbank.pakete.version-6')}{' '}<select value={version || kp.aktuell} onChange={(e) => { setVersion(e.target.value); setVorschau(null); }}>{kp.versionen.map((x) => <option key={x.version} value={x.version}>{x.version}</option>)}</select></label>
          )}
          {!inst && kp && <button type="button" className="knopf primaer" disabled={laeuft || ablauf || !katalog} onClick={() => setAblauf(true)}>{t('werkbank.pakete.installieren')}</button>}
          {inst && neuer && <button type="button" className="knopf primaer" disabled={laeuft} onClick={() => void zeigeVorschau(neuer)}>{t('werkbank.pakete.auf-aktualisieren', { neuer })}</button>}
          {inst && (inst.beispielMappen?.length ?? 0) > 0 && <button type="button" className="knopf" disabled={laeuft} onClick={() => void beispieleEntfernen()}>{t('werkbank.pakete.beispiele-entfernen')}</button>}
          {inst && <Knopf className="gefahr-rand" gesperrt={laeuft} onClick={entfernen}>{t('werkbank.pakete.entfernen')}</Knopf>}
          {inst?.herkunft.art === 'hochgeladen' && <span className="leise klein">{t('werkbank.pakete.ein-hochgeladenes-paket')}</span>}
        </div>
        {entfernenOffen && inst && (
          <div className="hinweis warn" role="dialog" aria-label={t('werkbank.pakete.paket-entfernen')}>
            <p>{t('werkbank.pakete.entfernen-seine-mappentypen-und', { name: inst.name })}</p>
            <label className="haken"><input type="checkbox" checked={behalten} onChange={(e) => setBehalten(e.target.checked)} /><span>{t('werkbank.pakete.einstellungen-behalten-fuer-eine')}</span></label>
            <div className="knoepfe"><button type="button" className="knopf gefahr" disabled={laeuft} onClick={entfernenBestaetigt}>{t('werkbank.pakete.entfernen')}</button><button type="button" className="textknopf" onClick={() => setEntfernenOffen(false)}>{t('werkbank.pakete.abbrechen')}</button></div>
          </div>
        )}
      </section>

      {inst && <PaketUmwandeln key={`${inst.id}|${inst.version}`} paket={inst.id} />}

      {/* Auch nach der Installation sichtbar, bis „Weiter“ – sonst verschwände das Ergebnis mit dem Neuladen. */}
      {kp && ablauf && katalog && z.stand && (
        <section className="blatt stapel" aria-label={tx('pakete.ablauf.zusammenfassung')}>
          <h2 className="h3">{tx('pakete.ablauf.titel', { name: kp.name })} <Hilfe ort="werkbank.pakete.ablauf" /></h2>
          <PaketAblauf direkt quelle={{ art: 'katalog', katalog, quelle: aus?.offiziell ? undefined : aus?.url, dms: z.stand.dms, installiert: z.stand.installiert }} start={[id]} nur={[id]} versionen={version ? { [id]: version } : {}}
            aktionen={<button type="button" className="textknopf" onClick={() => setAblauf(false)}>{t('werkbank.pakete.abbrechen')}</button>}
            geaendert={() => { void z.laden(); void d.neuLaden(); }}
            fertig={(e) => { setAblauf(false); if (e.installiert.some((x) => x.id === id)) setMeldung({ art: 'gut', text: fertigText(e) }); }} />
        </section>
      )}
      {inst && katalog && z.stand && <ErgaenzungenBlock z={z} inst={inst} katalog={katalog} quelle={aus?.offiziell ? undefined : aus?.url} />}

      {vorschau && (
        <VorschauBlock v={vorschau} warnung={offiziell || vorschau.pruefung?.bestaetigen === false ? null : t('werkbank.pakete.aus-dem-katalog', { wert: String(inst?.herkunft.art === 'katalog' ? inst.herkunft.url : quelle) })} abbrechen={() => setVorschau(null)}
          los={(x) => tu(async () => {
            if (vorschau.update) {
              const r = await api.paketAktualisieren(id, vorschau.paket.version, x.bestaetigt, x.rechteBestaetigt, x.automatisierungen);
              // Umzug (#1084): Das Paket heißt jetzt anders – dorthin.
              if (r.id !== id) geheZu(`/werkbank/pakete/${r.id}`);
              return t('werkbank.pakete.ist-jetzt-auf-version', { name: r.name, version: r.version });
            }
            const r = await api.paketInstallieren({ id, version: vorschau.paket.version, quelle, ...x });
            return t('werkbank.pakete.ist-installiert', { name: r.name, version: r.version });
          })} />
      )}
      </>}
    </div>
  );
}

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
          {erg.length > 0 && <div className="knoepfe"><button type="button" className="knopf" onClick={() => { setMeldung(undefined); setOffen(true); }}>{tx('pakete.ablauf.nachtraeglich.knopf')}</button></div>}
        </>
      ) : (
        <PaketAblauf quelle={{ art: 'katalog', katalog, quelle, dms: stand.dms, installiert: stand.installiert }} start={[]} nur={[inst.id]}
          aktionen={<button type="button" className="textknopf" onClick={() => setOffen(false)}>{t('werkbank.pakete.abbrechen')}</button>}
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
function LaeuferStand({ paket, abonniert = [] }: { paket: string; abonniert?: readonly string[] }) {
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
      <div className="zeile-zwischen"><h2 className="h3">{t('werkbank.pakete.paket-laeufer')}</h2>{s && stand && p && <button type="button" className="textknopf" onClick={laden}>{tn('werkbank.pakete.stand-neu-laden', { symbol: <Symbol name="neu-laden" /> })}</button>}</div>
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
      <EreignisKatalogListe />
    </>
  );
}

/**
 * Vorschau mit Namen, Abhängigkeiten und Beispielen. Bei Paketen außerhalb des offiziellen
 * Katalogs (#189) eine deutliche Warnung, die man ausdrücklich bestätigen muss.
 * Auch im Einrichtungsassistenten und für Sammeldateien (#460, #461): je Paket ein Block, eigene Überschrift
 * und „Auslassen“ statt „Abbrechen“.
 */
export function VorschauBlock({ v, warnung, los, abbrechen, titel, abbrechenText = t('werkbank.pakete.abbrechen'), herkunftBestaetigt = false }: {
  v: PaketVorschau; warnung: string | null; abbrechen(): void; titel?: string; abbrechenText?: string;
  /** Herkunft schon vorher bestätigt (Sammeldatei): kein zweiter Haken. */
  herkunftBestaetigt?: boolean;
  los(x: { namen: Record<string, string>; sichtNamen: Record<string, string>; beispiele: boolean; mitAbhaengigkeiten: boolean; rechteBestaetigt?: boolean; bestaetigt?: boolean; automatisierungen: string[] }): Promise<void>;
}) {
  // Mitgelieferte Automatisierungen (#712): Vorgabe ja, abgewählte bleiben aus.
  const neueAutos = (v.automatisierungen ?? []).filter((a) => a.neu);
  const [ohneAuto, setOhneAuto] = useState<string[]>([]);
  const [namen, setNamen] = useState<Record<string, string>>(() => Object.fromEntries(v.typen.filter((eintrag) => !eintrag.vorhanden).map((eintrag) => [eintrag.schluessel, eintrag.vorschlag ?? eintrag.name])));
  const [sichtNamen, setSichtNamen] = useState<Record<string, string>>(() => Object.fromEntries(v.sichten.filter((s) => !s.vorhanden && !s.ausgelassen).map((s) => [s.schluessel, s.vorschlag ?? s.name])));
  const [beispiele, setBeispiele] = useState(false);
  const [mit, setMit] = useState(true);
  const [ok, setOk] = useState(false);
  const [rechteOk, setRechteOk] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const rechteFehlen = !!v.laeufer?.bestaetigen && !rechteOk;
  const fehlend = v.abhaengigkeiten.filter((a) => !a.installiert);
  const konflikt = v.typen.some((eintrag) => !eintrag.vorhanden && eintrag.konflikt && (namen[eintrag.schluessel] ?? '').trim().toLowerCase() === eintrag.name.toLowerCase())
    || v.sichten.some((s) => !s.vorhanden && !s.ausgelassen && s.konflikt && (sichtNamen[s.schluessel] ?? '').trim().toLowerCase() === s.name.toLowerCase());
  const leer = Object.values(namen).some((n) => !n.trim()) || Object.values(sichtNamen).some((n) => !n.trim());
  // Herkunft bestätigen (#189, #594): außerhalb des offiziellen Katalogs bzw. ohne gültige Signatur.
  const pruefWarnung = warnung ?? (v.pruefung?.bestaetigen ? (v.pruefung.art === 'ungueltig' ? tx('pakete.herkunft.warnung.ungueltig') : '') : null);
  const bestaetigen = pruefWarnung !== null && !herkunftBestaetigt;
  return (
    <section className="blatt" aria-label={t('werkbank.pakete.vorschau')}>
      <h2 className="h3">{titel ?? (v.update ? t('werkbank.pakete.update-auf', { version: v.paket.version }) : t('werkbank.pakete.vorschau-2', { name: v.paket.name, version: v.paket.version }))}<Herausgeber wer={v.paket.herausgeber} geprueft={v.paket.herausgeberGeprueft} /></h2>
      <HerkunftZeile p={v.pruefung} />
      {bestaetigen && (
        <div className="hinweis warn" role="alert">
          <p>{tn('werkbank.pakete.installiere-nur-pakete-deren', { b: <strong>{t('werkbank.pakete.nicht-vom-ablago-projekt-2')}</strong>, wert: pruefWarnung ? `${pruefWarnung.replace(/\.$/, '')}. ` : '' })}</p>
          <label className="haken"><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} /><span>{t('werkbank.pakete.ich-weiss-woher-das')}</span></label>
        </div>
      )}
      {v.laeufer && (
        // Erst lesen, dann bestätigen (#449): Liste, darunter links der Haken – untereinander, auch am Handy.
        <div className={`hinweis stapel ${v.laeufer.bestaetigen ? 'warn' : 'info'}`} role={v.laeufer.bestaetigen ? 'alert' : undefined}>
          <p>{tn('werkbank.pakete.er-laeuft-im-paket', { b: <strong>{t('werkbank.pakete.das-paket-enthaelt-code')}</strong> })}</p>
          <ul>
            {v.laeufer.rechte.map((r) => (
              <li key={r.text}>
                {r.text} <Hilfe ort={r.hilfe} />
                {r.unter && <ul>{r.unter.map((u) => <li key={u.text}>{u.text} <Hilfe ort={u.hilfe} /></li>)}</ul>}
              </li>
            ))}
          </ul>
          {v.laeufer.bestaetigen
            ? <label className="haken"><input type="checkbox" checked={rechteOk} onChange={(e) => setRechteOk(e.target.checked)} /><span>{v.update ? t('werkbank.pakete.die-rechte-haben-sich') : t('werkbank.pakete.ich-erlaube-dem-paket')}</span></label>
            : <p className="leise">{t('werkbank.pakete.die-rechte-sind-dieselben')}</p>}
          {/* Dienst-Adresse (#444): Hinweis auf die Vertrauensbeziehung schon bei der Installation. */}
          {v.laeufer.rechte.some((r) => r.hilfe === 'pakete.recht.adresse') && <p>{tx('fragen.adresse.installation')}</p>}
        </div>
      )}
      {v.probleme.length > 0 && <div className="hinweis schlecht"><ul>{v.probleme.map((p) => <li key={p}>{p}</li>)}</ul></div>}
      {v.hinweise?.length > 0 && <div className="hinweis info"><ul>{v.hinweise.map((p) => <li key={p}>{p}</li>)}</ul></div>}
      {v.sprache && <SprachVorschau s={v.sprache} />}
      {v.einstellungen && (v.einstellungen.neu.length > 0 || v.einstellungen.weg.length > 0) && (
        <div className="hinweis info"><p>{t('werkbank.pakete.einstellungen-2')}{v.update && v.einstellungen.neu.length > 0 && <> {' '}{t('werkbank.pakete.neu-mit-vorgabe', { neu: v.einstellungen.neu.join(', ') })}</>}{!v.update && <> {' '}{t('werkbank.pakete.das-paket-hat-einstellungen')}</>}{v.einstellungen.weg.length > 0 && <> {' '}{tn('werkbank.pakete.ihre-werte-werden-entfernt', { b: <strong>{t('werkbank.pakete.fallen-weg')}</strong>, weg: v.einstellungen.weg.join(', ') })}</>}</p></div>
      )}
      {/* Nur, wenn wirklich etwas angelegt wird (#643); Namenskonflikte stehen direkt am betroffenen Namen. */}
      {v.update
        ? <p className="leise">{tx('pakete.vorschau.update')}</p>
        : legtEtwasAn(v) ? <p className="leise">{tx('pakete.vorschau.anlegen')}</p>
        : v.paket.beschreibung ? <p>{v.paket.beschreibung}</p> : null}
      {v.typen.length > 0 && <h3>{t('werkbank.pakete.mappentypen-2')}</h3>}
      <ul className="stapel">
        {v.typen.map((eintrag) => (
          <li key={eintrag.schluessel}>
            {eintrag.vorhanden
              ? <span><strong>{eintrag.name}</strong> – {eintrag.neueFelder.length || eintrag.neueRegister.length || eintrag.erkennung?.length || eintrag.wiederfinden?.length || eintrag.typAngaben || eintrag.formate?.length || eintrag.beschriftungen || eintrag.abschnitte?.length ? [eintrag.neueFelder.length || eintrag.neueRegister.length ? t('werkbank.pakete.neu', { wert: [...eintrag.neueFelder.map((f) => t('werkbank.pakete.feld', { f })), ...eintrag.neueRegister.map((r) => t('werkbank.pakete.register', { r }))].join(', ') }) : '', eintrag.erkennung?.length ? t('werkbank.pakete.aus-dokument-fuellen', { map: eintrag.erkennung.map((f) => `„${f}“`).join(', ') }) : '', eintrag.wiederfinden?.length ? t('werkbank.pakete.zum-wiederfinden', { map: eintrag.wiederfinden.map((f) => `„${f}“`).join(', ') }) : '', eintrag.typAngaben ? t('werkbank.pakete.dokument-uebernehmen') : '', eintrag.formate?.length ? tx('felder.paket.formate', { felder: eintrag.formate.map((f) => `„${f}“`).join(', ') }) : '', eintrag.beschriftungen ? t('werkbank.pakete.beschriftungen', { anzahl: eintrag.beschriftungen }) : '', eintrag.abschnitte?.length ? t('werkbank.pakete.abschnitte', { map: eintrag.abschnitte.map((r) => `„${r}“`).join(', ') }) : ''].filter(Boolean).join('; ') : t('werkbank.pakete.keine-aenderung')}</span>
              : eintrag.geloescht ? <span className="leise">{t('werkbank.pakete.hast-du-geloescht-bleibt', { name: eintrag.name })}</span>
              : <label className="paketname"><span>{tn('werkbank.pakete.felder-kennung', { felder: eintrag.felder, code: <code>{eintrag.dmsSchluessel}</code> })}</span>
                  <input value={namen[eintrag.schluessel] ?? eintrag.name} aria-label={t('werkbank.pakete.name-fuer', { name: eintrag.name })} onChange={(e) => setNamen({ ...namen, [eintrag.schluessel]: e.target.value })} />
                  {eintrag.konflikt && (namen[eintrag.schluessel] ?? '').trim().toLowerCase() === eintrag.name.toLowerCase() && <span className="fehlertext klein">{eintrag.konflikt}</span>}
                </label>}
            {/* Text → Verweis (#534): Das Update ändert vorhandene Angaben nicht; umgewandelt wird danach mit Vorschau. */}
            {eintrag.vorhanden && eintrag.umwandeln?.filter((u) => u.anzahl > 0).map((u) => <p key={u.feld} className="leise klein">{tx('pakete.update.umwandeln', { feld: u.feld, aus: u.aus, anzahl: u.anzahl })}</p>)}
          </li>
        ))}
      </ul>
      {v.sichten.length > 0 && <h3>{t('werkbank.pakete.ansichten-2')}</h3>}
      <ul className="stapel">
        {v.sichten.map((s) => (
          <li key={s.schluessel}>
            {s.vorhanden ? <span className="leise">{t('werkbank.pakete.vorhanden', { name: s.name })}</span>
              : s.ausgelassen ? <span className="leise">{s.ausgelassen}</span>
              : <label className="paketname"><span>{s.eltern ? t('werkbank.pakete.unter', { wert: v.sichten.find((x) => x.schluessel === s.eltern)?.name ?? s.eltern }) : t('werkbank.pakete.oberste-ebene')}</span>
                  <input value={sichtNamen[s.schluessel] ?? s.name} aria-label={t('werkbank.pakete.name-fuer-ansicht', { name: s.name })} onChange={(e) => setSichtNamen({ ...sichtNamen, [s.schluessel]: e.target.value })} />
                  {s.konflikt && (sichtNamen[s.schluessel] ?? '').trim().toLowerCase() === s.name.toLowerCase() && <span className="fehlertext klein">{s.konflikt}</span>}
                </label>}
          </li>
        ))}
      </ul>
      {v.abhaengigkeiten.length > 0 && (
        <>
          <h3>{t('werkbank.pakete.abhaengigkeiten')}</h3>
          <ul className="klein">{v.abhaengigkeiten.map((a) => <li key={a.id}>{a.id} {a.bereich}: {a.installiert ? t('werkbank.pakete.installiert-2', { installiert: a.installiert, wert: a.ok ? '' : t('werkbank.pakete.passt-nicht') }) : a.verfuegbar ? t('werkbank.pakete.fehlt-im-katalog-gibt', { verfuegbar: a.verfuegbar }) : t('werkbank.pakete.fehlt-und-ist-nicht')}</li>)}</ul>
          {!v.update && fehlend.length > 0 && <label className="haken"><input type="checkbox" checked={mit} onChange={(e) => setMit(e.target.checked)} /><span>{t('werkbank.pakete.fehlende-pakete-mitinstallieren')}</span></label>}
        </>
      )}
      {!v.update && v.beispiele > 0 && <label className="haken"><input type="checkbox" checked={beispiele} onChange={(e) => setBeispiele(e.target.checked)} /><span>{t('werkbank.pakete.beispiel-mappen-anlegen', { beispiele: v.beispiele })}{v.beispielDokumente?.anzahl ? ` ${t('werkbank.pakete.mit-beispiel-dokumenten', { anzahl: v.beispielDokumente.anzahl, mb: inMB(v.beispielDokumente.bytes) })}` : ''}</span></label>}
      {neueAutos.length > 0 && (
        <fieldset className="stapel">
          <legend><strong>{tx('pakete.ablauf.automatisierungen')}</strong></legend>
          <p className="leise klein">{tx('pakete.ablauf.automatisierungen.text')}</p>
          {neueAutos.map((a) => (
            <label key={a.schluessel} className="haken"><input type="checkbox" checked={!ohneAuto.includes(a.schluessel)} onChange={(e) => setOhneAuto(e.target.checked ? ohneAuto.filter((x) => x !== a.schluessel) : [...ohneAuto, a.schluessel])} />
              <span>{a.name}{a.beschreibung && <small className="hilfe">{a.beschreibung}</small>}</span></label>
          ))}
        </fieldset>
      )}
      <div className="knoepfe">
        <button type="button" className="knopf primaer" disabled={laeuft || v.probleme.length > 0 || konflikt || leer || (bestaetigen && !ok) || rechteFehlen}
          onClick={() => { setLaeuft(true); void los({ namen, sichtNamen, beispiele, mitAbhaengigkeiten: mit, automatisierungen: neueAutos.map((a) => a.schluessel).filter((k) => !ohneAuto.includes(k)), ...(rechteOk ? { rechteBestaetigt: true } : {}), ...(bestaetigen && ok ? { bestaetigt: true } : {}) }).finally(() => setLaeuft(false)); }}>
          {laeuft ? (v.update ? t('werkbank.pakete.aktualisiere') : t('werkbank.pakete.installiere')) : v.update ? t('werkbank.pakete.aktualisieren') : t('werkbank.pakete.installieren-2')}
        </button>
        <button type="button" className="textknopf" onClick={abbrechen}>{abbrechenText}</button>
      </div>
    </section>
  );
}

/** Sprachpaket in der Vorschau (#731): Sprache, Abdeckung, maschinell/geprüft, Beschriftungen für andere Pakete. */
function SprachVorschau({ s }: { s: NonNullable<PaketVorschau['sprache']> }) {
  return (
    <div className="hinweis info stapel">
      <p>{t('werkbank.pakete.sprache.vorschau', { sprache: sprachname(s.kennung), prozent: s.abdeckung.prozent, vorhanden: s.abdeckung.vorhanden, gesamt: s.abdeckung.gesamt, ablago: s.ablago })}</p>
      <SprachHerkunft maschinell={s.maschinell} geprueftVon={s.geprueftVon} />
      {s.pakete.length > 0 && <p>{t('werkbank.pakete.sprache.beschriftungen', { pakete: s.pakete.join(', ') })}</p>}
      <p className="leise klein">{t('werkbank.pakete.sprache.erlauben')}</p>
    </div>
  );
}
/** „Maschinell übersetzt – Verbesserungen willkommen“ bzw. „Geprüft von …“ (#731) – wie in Mein Konto. */
function SprachHerkunft({ maschinell, geprueftVon }: { maschinell: boolean; geprueftVon?: string }) {
  if (geprueftVon) return <p className="leise klein">{t('werkbank.pakete.sprache.geprueft', { wer: geprueftVon })}</p>;
  if (!maschinell) return null;
  return <p className="leise klein">{tn('werkbank.pakete.sprache.maschinell', { link: <a href={MITMACHEN_URL} target="_blank" rel="noreferrer">{t('werkbank.pakete.sprache.mitmachen')}</a> })}</p>;
}

/** Lizenz eines Pakets (#651): bei eigener oder fehlender Lizenz mit sachlichem Hinweis. */
function LizenzAngabe({ lizenz }: { lizenz: string }) {
  const art = lizenzArtVon(lizenz);
  if (art === 'frei') return <>{lizenz}</>;
  return <>{art === 'keine' || lizenz === KEINE_LIZENZ ? tx('pakete.erstellen.lizenz.keine') : lizenz.replace(/^LicenseRef-/, '').replace(/-/g, ' ')}
    <small className="leise" style={{ display: 'block' }}>{tx(art === 'keine' ? 'pakete.vorschau.lizenz.keine' : 'pakete.vorschau.lizenz.eigen')}</small></>;
}

/**
 * Herausgeber neben dem Namen (#1084): „Verträge · app.ablago“, immer vollständig (nie gekürzt – sonst sähe
 * app.ablago-community wie app.ablago aus). Nicht belegte als „Herausgeber laut Paket: … – nicht geprüft“.
 */
function Herausgeber({ wer, geprueft }: { wer?: string | null; geprueft?: boolean }) {
  if (!wer) return null;
  return <span className="leise" title={t('werkbank.pakete.herausgeber')}> · {geprueft ? wer : t('werkbank.pakete.herausgeber-ungeprueft', { wer })}</span>;
}
