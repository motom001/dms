import { useContext, useEffect, useState } from 'react';
import { KATALOG_LINK_REL, sammelSeiteMitVersion, type AblaufErgebnis, type InstalliertesPaket, type Katalog } from '../../../shared/src/pakete';
import { ApiFehler } from '../api/anfrage';
import { paketeApi, type PaketVorschau, type Sammeldatei } from '../api/pakete';
import { Hilfe } from '../Hilfe';
import { Symbol } from '../Symbol';
import { HerkunftZeile } from './Herkunft';
import { PaketAblauf, PaketApiKontext, sammelStand, type PaketVorgabe, type PaketWahl } from './PaketAblauf';
import { t, tn } from '../sprache';
import { gebietsschema } from '../../../shared/src/sprache';
import { Knopf } from '../bausteine';

/**
 * Pakete dazuholen (#460): Auswahl aus dem offiziellen Katalog mit Abhängigkeiten und Ergänzungen (#405, z. B. weitere
 * Sprachen der Texterkennung), dann ein gemeinsamer Ablauf mit einer Rechte-Bestätigung für alle Pakete und einem Knopf.
 * Der Katalog wird erst abgefragt, wenn diese Ansicht erscheint.
 */

/**
 * Vorgewählt (#460): ohne Texterkennung werden gescannte Dokumente nicht durchsuchbar (#458); ohne Benachrichtigungen
 * kommt keine Tägliche Zusammenfassung (#678, dms-registry #109).
 */
export const VORAUSWAHL = ['texterkennung', 'benachrichtigungen'];

/**
 * Auswahl aus dem offiziellen Katalog und Installation, z. B. im Einrichtungsassistenten (#460).
 * Ist der Katalog nicht erreichbar: Sammeldatei hochladen (#461) oder überspringen.
 */
export function PaketeDazuholen({ weiter, ueberspringen, geaendert, erneut, zurueck, sammeln, start, vorgabe, empfohlen = VORAUSWAHL }: {
  weiter(e: AblaufErgebnis): void; ueberspringen(): void;
  /** Einrichtungsassistent (#804): nur sammeln, installiert wird erst mit „Jetzt einrichten“. */
  sammeln?(w: PaketWahl): void;
  /** Vorgewählt statt der Empfehlung, z. B. beim „Ändern“ oder aus einer Konfigurationsdatei (#806). */
  start?: string[];
  vorgabe?: PaketVorgabe;
  /** Als „empfohlen“ markiert und oben (#1045: je nach Antwort auf „Wofür nutzt du Ablago?“); Vorgabe VORAUSWAHL. */
  empfohlen?: string[];
  /** Im Assistenten erneut geöffnet (#647): Installiertes oben zeigen, „Überspringen“ heißt „Weiter“. */
  erneut?: boolean;
  /** „Zurück“ im Assistenten (#647). */
  zurueck?(): void;
  /** Nach der Installation (z. B. Daten neu laden). */
  geaendert?(): void;
}) {
  const [stand, setStand] = useState<{ dms: string; installiert: InstalliertesPaket[] } | null>(null);
  const [katalog, setKatalog] = useState<Katalog | null>(null);
  const [fehler, setFehler] = useState<string>();
  const [versuch, setVersuch] = useState(0);
  const [sammel, setSammel] = useState<{ s: Sammeldatei; datei: string } | null>(null);
  const pa = useContext(PaketApiKontext);
  useEffect(() => {
    let aktuell = true;
    setFehler(undefined); setKatalog(null);
    void (async () => {
      try {
        const st = await pa.stand();
        if (!aktuell) return;
        setStand({ dms: st.dms, installiert: st.installiert });
        // Nur der offizielle Katalog – und erst jetzt, weil der Schritt angezeigt wird (keine Verbindung ohne Anlass).
        const k = (await pa.katalog()).kataloge.find((x) => x.offiziell);
        if (!aktuell) return;
        if (!k?.katalog) throw new Error(k?.fehler ?? t('werkbank.paketedazuholen.der-katalog-laesst-sich'));
        setKatalog(k.katalog);
      } catch (e) { if (aktuell) setFehler((e as Error).message); }
    })();
    return () => { aktuell = false; };
  }, [versuch]);

  if (sammel && stand) return (
    <SammeldateiAnsicht s={sammel.s} datei={sammel.datei} dms={stand.dms} installiert={stand.installiert} geaendert={geaendert} abbrechen={() => setSammel(null)} fertig={weiter} />
  );
  if (fehler) return (
    <>
      <div className="hinweis warn" role="status">
        <p>{tn('werkbank.paketedazuholen.ohne-internet-fehlen-die', { b: <strong>{t('werkbank.paketedazuholen.der-paketkatalog-ist-gerade')}</strong> })}</p>
        <p className="leise klein">{fehler}</p>
      </div>
      {/* Im Assistenten gibt es noch keinen Administrator, der eine Sammeldatei hochladen dürfte (#804). */}
      {sammeln ? <p className="leise">{t('einrichtung.pakete.offline')}</p> : <section className="stapel" aria-label={t('werkbank.paketedazuholen.ohne-internet')}>
        <h2 className="h3">{t('werkbank.paketedazuholen.ohne-internet-sammeldatei-hochladen')} <Hilfe ort="werkbank.pakete.sammeldatei" /></h2>
        <p className="leise">{tn('werkbank.paketedazuholen.stell-die-pakete-an', { link: <a className="verweis" href={sammelSeiteMitVersion(stand?.dms ?? '')} target="_blank" rel={KATALOG_LINK_REL}>{tn('werkbank.paketedazuholen.katalog-webseite', { symbol: <Symbol name="extern" /> })}</a> })}</p>
        <p className="leise klein">{t('pakete.katalog.hinweis')}</p>
        {stand && <SammeldateiWahl geladen={(x, datei) => setSammel({ s: x, datei })} />}
      </section>}
      <div className="knoepfe">
        <Knopf onClick={ueberspringen}>{t('werkbank.paketedazuholen.ueberspringen')}</Knopf>
        <Knopf onClick={() => setVersuch((n) => n + 1)}>{t('werkbank.paketedazuholen.nochmal-versuchen')}</Knopf>
      </div>
    </>
  );
  if (!katalog || !stand) return <p className="leise">{t('werkbank.paketedazuholen.frage-den-offiziellen-paketkatalog')}</p>;
  const zurueckKnopf = zurueck ? <Knopf onClick={zurueck}>{tn('werkbank.paketedazuholen.zurueck', { symbol: <Symbol name="pfeil-links" /> })}</Knopf> : null;
  const schonDa = erneut && stand.installiert.length > 0
    ? <div className="hinweis gut klein" role="status"><p><strong>{t('werkbank.paketedazuholen.schon-installiert')}</strong> {stand.installiert.map((p) => p.name).join(', ')}{t('werkbank.paketedazuholen.waehle-weitere-pakete-oder')}</p></div> : null;
  // Vorauswahl: Texterkennung, wenn sie hier passt und noch fehlt; empfohlene oben, sonst wie im Katalog nach Namen.
  const sortiert: Katalog = { ...katalog, pakete: [...katalog.pakete].sort((a, b) => Number(empfohlen.includes(b.id)) - Number(empfohlen.includes(a.id))) };
  return (
    <>
      {schonDa}
      <PaketAblauf quelle={{ art: 'katalog', katalog: sortiert, dms: stand.dms, installiert: stand.installiert }} start={start ?? (erneut ? [] : empfohlen)} empfohlen={empfohlen} sammeln={sammeln} vorgabe={vorgabe}
        aktionen={<>{zurueckKnopf}<Knopf onClick={ueberspringen}>{erneut ? t('werkbank.paketedazuholen.weiter-ohne-weitere-pakete') : t('werkbank.paketedazuholen.ueberspringen')}</Knopf></>}
        geaendert={geaendert} fertig={weiter} />
    </>
  );
}

/* ---------- Sammeldatei (#461) ---------- */

/** Datei wählen und hochladen: eine Sammeldatei (oder ein einzelnes Paket, falls gewollt). */
export function SammeldateiWahl({ geladen, einzeln }: { geladen(s: Sammeldatei, datei: string): void; einzeln?(r: { upload: string; vorschau: PaketVorschau }, datei: string): void }) {
  const [fehler, setFehler] = useState<string>();
  const [laedt, setLaedt] = useState(false);
  async function hochladen(f: File | undefined) {
    if (!f) return;
    setFehler(undefined); setLaedt(true);
    try {
      const r = await paketeApi.paketHochladen(f);
      if ('sammeldatei' in r) geladen(r.sammeldatei, f.name);
      else if (einzeln) einzeln(r, f.name);
      else setFehler(t('werkbank.paketedazuholen.das-ist-ein-einzelnes'));
    } catch (e) { setFehler([(e as Error).message, ...(e instanceof ApiFehler ? e.gruende : [])].join(' ')); }
    finally { setLaedt(false); }
  }
  return (
    <div className="stapel">
      <label className="pd-datei">
        <span className="knopf">{laedt ? t('werkbank.paketedazuholen.pruefe') : t('werkbank.paketedazuholen.sammeldatei-waehlen')}</span>
        <input type="file" accept=".zip,application/zip" disabled={laedt} aria-label={t('werkbank.paketedazuholen.sammeldatei-zip-hochladen')} onChange={(e) => { void hochladen(e.target.files?.[0]); e.target.value = ''; }} />
      </label>
      {fehler && <p className="fehlertext klein" role="alert">{fehler}</p>}
    </div>
  );
}

/**
 * Inhalt einer Sammeldatei zeigen und im gemeinsamen Ablauf installieren (#461, #405). Die Prüfsummen hat der Server
 * schon geprüft; die Herkunft bestätigst du einmal für alle Pakete, die Rechte ebenso.
 */
export function SammeldateiAnsicht({ s, datei, dms, installiert, fertig, abbrechen, geaendert }: {
  s: Sammeldatei; datei: string; dms: string; installiert: InstalliertesPaket[]; fertig(e: AblaufErgebnis): void; abbrechen(): void; geaendert?(): void;
}) {
  const abgeglichen = s.pakete.every((p) => p.katalog === 'gleich');
  const datum = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? iso || '–' : d.toLocaleString(gebietsschema(), { dateStyle: 'medium', timeStyle: 'short' }); };
  const herkunftNoetig = s.pakete.some((p) => sammelStand(p).installierbar && p.vorschau.pruefung?.bestaetigen !== false);
  return (
    <section className="blatt stapel" aria-label={t('werkbank.paketedazuholen.sammeldatei')}>
      <h2 className="h3">{t('werkbank.paketedazuholen.sammeldatei-2', { datei })}</h2>
      <dl className="eigenschaften">
        <dt>{t('werkbank.paketedazuholen.zusammengestellt')}</dt><dd>{t('werkbank.paketedazuholen.dieser-installation', { datum: datum(s.datei.erstellt), wert: s.datei.dms ? t('werkbank.paketedazuholen.fuer-ablago', { dms: s.datei.dms }) : '', dms })}</dd>
        <dt>{t('werkbank.paketedazuholen.pruefwert-der-datei')}</dt><dd><code className="pd-pruefwert" title={s.datei.sha256}>{t('werkbank.paketedazuholen.sha-256', { sha256: s.datei.sha256 })}</code></dd>
      </dl>
      <HerkunftZeile p={s.datei.pruefung} sammel />
      <div className="hinweis gut klein"><p>{tn('werkbank.paketedazuholen.jedes-archiv-hat-genau', { b: <strong>{t('werkbank.paketedazuholen.geprueft')}</strong>, wert: abgeglichen ? t('werkbank.paketedazuholen.alle-pruefsummen-stimmen-ausserdem') : t('werkbank.paketedazuholen.mit-dem-offiziellen-katalog') })}</p></div>
      {!herkunftNoetig && <div className="hinweis gut klein"><p>{t('pakete.herkunft.sammel.ok')}</p></div>}
      {herkunftNoetig && s.datei.nichtImKatalog.length > 0 && <div className="hinweis info klein"><p>{t('pakete.herkunft.sammel.fehlen', { namen: s.datei.nichtImKatalog.join(', ') })}</p></div>}
      <PaketAblauf quelle={{ art: 'sammel', sammeldatei: s, dms, installiert }} start={s.pakete.filter((p) => p.gewaehlt).map((p) => p.upload)}
        aktionen={<Knopf onClick={abbrechen}>{t('werkbank.paketedazuholen.abbrechen')}</Knopf>}
        geaendert={geaendert} fertig={fertig} />
    </section>
  );
}
