import { useEffect, useId, useRef, useState } from 'react';
import { abwesenheitWirkt } from '../../shared/src/model';
import { heuteIn } from '../../shared/src/sichten';
import { leseSchrift, setzeSchrift } from './design';
import { api } from './api';
import { Knopf, KnopfLink } from './bausteine';
import { Symbol } from './Symbol';
import { Ablage } from './ablage/Ablage';
import { useDaten } from './daten';
import { useKonto } from './konto';
import { geheZu, Link, useOrt } from './ort';
import { Messpanel } from './Messpanel';
import { logoUrl, Marke, schriftzugVon } from './Marke';
import { ApiDoku } from './profil/ApiDoku';
import { Profil } from './profil/Profil';
import { Werkbank } from './werkbank/Werkbank';
import { GeradeImModus } from './werkbank/GeradeImModus';
import { WartungsBanner } from './wartung';
import { NeuKnopf, PostAblage } from './ablage/NeuePost';
import { PostKamera } from './ablage/PostKamera';
import { ErreichbarkeitsBanner, useBeiWiederErreichbar } from './erreichbar';
import { useHandbuch } from './Hilfe';
import { Pikto } from './piktogramme';
import { UeberDms } from './UeberDms';
import { ADMIN_START, startseiteVon } from '../../shared/src/startseite';
import { t, tn } from './sprache';
import { gebietsschema } from '../../shared/src/sprache';
import { Entdecken } from './entdecken/Entdecken';
import { RundgangAnzeige } from './entdecken/Rundgang';
import { starteRundgang, useEntdecken } from './entdecken/stand';

export function App() {
  const { pfad, suche } = useOrt();
  const d = useDaten();
  const { ich, abmelden, vertretung, hinweise, aktualisieren, version, zweifaktor, passkey, verwaltung, verwaltungsmodus, verwalten, verwaltungBeenden } = useKonto();
  // Nach einem Ausfall (#122): gemeinsame Daten neu holen; „Ansicht neu laden“ baut den Inhalt neu auf.
  const [ansicht, setAnsicht] = useState(0);
  useBeiWiederErreichbar(() => void d.neuLaden());
  // Verwaltungsmodus (#819): Der Server liefert `rolle: 'admin'` nur, solange er läuft.
  const admin = ich.rolle === 'admin';
  const teile = pfad.split('/').filter(Boolean);
  const bereich = teile[0] === 'werkbank' || teile[0] === 'profil' ? teile[0] : teile[0] === 'api-doku' ? 'profil' : 'ablage';
  // Titel und Symbol im Browser-Tab aus dem Design (#72).
  const marke = schriftzugVon(d.meinDesign) || 'Ablago';
  const symbol = logoUrl(d.meinDesign);
  const entdeckenSeite = teile[0] === 'entdecken';
  useEffect(() => {
    document.title = `${marke} – ${entdeckenSeite ? t('entdecken.menue') : { ablage: t('oberflaeche.app.ablage'), werkbank: t('oberflaeche.app.werkbank'), profil: t('oberflaeche.app.mein-konto') }[bereich]}`;
    setzeSymbol(symbol);
  }, [marke, symbol, bereich, entdeckenSeite]);
  // Rundgang bei der ersten Anmeldung (#831): nur neue Konten (der Server entscheidet: `starten`), nur in der Ablage,
  // nie in Vertretung – und je Laden der Seite höchstens einmal.
  const { stand: entdecken } = useEntdecken();
  const rundgangGestartet = useRef(false);
  useEffect(() => {
    if (rundgangGestartet.current || !entdecken?.starten || vertretung || !d.geladen || bereich !== 'ablage' || entdeckenSeite) return;
    rundgangGestartet.current = true;
    starteRundgang(entdecken.starten, true);
  }, [entdecken, vertretung, d.geladen, bereich, entdeckenSeite]);
  // Schriftgröße dieses Geräts (#69: gewählt in Profil → Darstellung).
  useEffect(() => { setzeSchrift(ich.id, leseSchrift(ich.id)); }, [ich.id]);

  useEffect(() => {
    // Startseite (#721, #819): im Verwaltungsmodus die Werkbank, sonst die Ablage.
    if (pfad === '/' || pfad.startsWith('/passwort/')) geheZu(admin && !vertretung ? ADMIN_START : '/ablage', true);
    // Zurück von der erneuten Anmeldung beim Anbieter (#241): Die Anmeldung ist frisch, der Modus beginnt ohne Abfrage.
    else if (teile[0] === 'werkbank' && new URLSearchParams(location.search).has('verwalten') && !admin && verwaltungsmodus.darf) void verwalten();
    // Frühere Adressen
    else if (teile[0] === 'einrichtung') geheZu(`/werkbank/typen${teile[1] ? `/${teile[1]}` : ''}`, true);
    else if (teile[0] === 'benutzer') geheZu('/werkbank/benutzer', true);
  }, [pfad]); // eslint-disable-line react-hooks/exhaustive-deps -- nur beim Wechsel der Adresse weiterleiten

  let inhalt;
  if (!d.geladen) inhalt = <p className="leise">{t('oberflaeche.app.lade')}</p>;
  else if (bereich === 'werkbank' && !admin) inhalt = <OhneModus paket={teile[1] === 'pakete' && new URLSearchParams(location.search).has('installieren')} />;
  else if (bereich === 'werkbank') inhalt = <Werkbank teile={teile} />;
  else if (teile[0] === 'api-doku') inhalt = <ApiDoku />;
  else if (entdeckenSeite) inhalt = <Entdecken />;
  else if (bereich === 'profil') inhalt = <Profil teile={teile} />;
  else inhalt = <Ablage teile={teile} suche={suche} />;

  return (
    <div className={`rahmen ${entdeckenSeite ? 'entdecken-seite' : bereich}`}>
      {vertretung && (
        <div className="vertretungsbanner" role="alert">
          <p>{tn('oberflaeche.app.seit-alles-was-du', { b: <strong>{t('oberflaeche.app.du-agierst-als', { adminName: vertretung.adminName, wert: ich.name || ich.email })}</strong>, email: ich.email, uhrzeit: uhrzeit(vertretung.beginn) })}</p>
          <Knopf groesse="klein" onClick={() => api.vertretungBeenden().then(() => { geheZu('/werkbank/benutzer', true); return aktualisieren(); })}>{t('oberflaeche.app.zurueck-zum-eigenen-konto')}</Knopf>
        </div>
      )}
      {!vertretung && hinweise.length > 0 && <Hinweise />}
      {/* Technische Aufgaben (#719, #819): außerhalb des Modus nur, dass etwas anliegt – keine Einzelheiten. */}
      {!vertretung && verwaltung && !admin && (
        <div className="hinweisbanner" role="status" id="verwaltung-hinweis">
          <p>{t('konten.verwaltung.hinweis')}</p>
          <Knopf groesse="klein" onClick={verwalten}>{t('konten.verwaltung.anmelden')}</Knopf>
        </div>
      )}
      {/* #416: Pflicht eingeschaltet, während diese Sitzung lief – weiterarbeiten, aber deutlich darauf hinweisen. */}
      {!vertretung && zweifaktor.ausstehend && (
        <div className="hinweisbanner" role="alert" id="zweifaktor-hinweis">
          <p>{tn('oberflaeche.app.richte-sie-jetzt-ein', { b: <strong>{t('oberflaeche.app.die-zwei-faktor-anmeldung')}</strong> })}</p>
          {!(bereich === 'profil' && teile[1] === 'sicherheit') && <KnopfLink to="/profil/sicherheit" groesse="klein">{t('oberflaeche.app.jetzt-einrichten')}</KnopfLink>}
        </div>
      )}
      {/* #811: Passkey vorgeschrieben, während diese Sitzung lief – wie bei der Zwei-Faktor-Anmeldung (#416). */}
      {!vertretung && passkey.ausstehend && (
        <div className="hinweisbanner" role="alert" id="passkey-hinweis">
          <p>{tn('oberflaeche.app.passkey.richte-ihn-ein', { b: <strong>{t('oberflaeche.app.passkey.vorgeschrieben')}</strong> })}</p>
          {!(bereich === 'profil' && teile[1] === 'sicherheit') && <KnopfLink to="/profil/sicherheit" groesse="klein">{t('oberflaeche.app.jetzt-einrichten')}</KnopfLink>}
        </div>
      )}
      <ErreichbarkeitsBanner version={version} ansichtNeuLaden={() => { setAnsicht((n) => n + 1); void d.neuLaden(); }} />
      <WartungsBanner admin={admin} abgemeldet={() => void aktualisieren()} />
      {/* Verwaltungsmodus (#819): roter Balken in Werkbank und Ablage, vorgelesen beim Erscheinen. */}
      {admin && !vertretung && (
        <section className="verwaltungsbalken" aria-labelledby="verwaltungsbalken-titel">
          <p role="status"><strong id="verwaltungsbalken-titel">{t('konten.verwaltung.balken.titel')}</strong> {t('konten.verwaltung.balken.text')}</p>
          <Knopf id="verwaltung-beenden" groesse="klein" onClick={verwaltungBeenden}>{t('konten.verwaltung.beenden')}</Knopf>
        </section>
      )}
      {/* #921: nur in der Werkbank und nur im Modus – wer außer mir gerade auch verwaltet. */}
      {admin && !vertretung && bereich === 'werkbank' && <GeradeImModus />}
      <header className="kopf">
        <Link to={startseiteVon(vertretung ? undefined : ich.rolle, d.einstellungen.startseite === false)} className="marke" title={t('oberflaeche.app.zur-startseite')}>
          <Marke logo={logoUrl(d.meinDesign)} schriftzug={schriftzugVon(d.meinDesign)} /><span className="sr">{t('oberflaeche.app.startseite', { wert: schriftzugVon(d.meinDesign) ? '' : schriftzugVon(null) })}</span>
        </Link>
        {/* #819: Kein Weg in die Werkbank aus der Ablage-Navigation – nur über das Benutzermenü („Ablago verwalten“).
            Im Verwaltungsmodus führt der Reiter zurück in die Werkbank. */}
        <nav className="bereiche" aria-label={t('oberflaeche.app.bereiche')}>
          <Link to="/ablage" className={bereich === 'ablage' ? 'an' : ''}>{t('oberflaeche.app.ablage')}</Link>
          {admin && !vertretung && <Link to="/werkbank" className={bereich === 'werkbank' ? 'an' : ''}>{t('oberflaeche.app.werkbank')}</Link>}
        </nav>
        {/* #649: „+ Neu“ nur in der Ablage – in der Werkbank wird eingerichtet, nicht abgelegt. */}
        {bereich === 'ablage' && <NeuKnopf />}
        <div className="konto">
          {/* Quellcode, Version und Lizenz stehen unter Benutzermenü → „Über Ablago“ (#430). */}
          <Benutzermenue an={bereich === 'profil'} abmelden={abmelden} />
        </div>
      </header>
      <main className="rumpf" key={ansicht}>
        {d.fehler && <div className="hinweis schlecht"><p>{d.fehler}</p><Knopf groesse="klein" onClick={() => d.neuLaden()}>{t('oberflaeche.app.erneut-versuchen')}</Knopf></div>}
        {inhalt}
      </main>
      <PostAblage werkbank={bereich === 'werkbank'} />
      <PostKamera />
      <RundgangAnzeige />
      {ich.entwicklermodus && <Messpanel />}
    </div>
  );
}

/** Werkbank ohne Verwaltungsmodus (#819): der Weg hinein, für alle anderen ein klarer Satz. */
function OhneModus({ paket }: { paket: boolean }) {
  const { verwaltungsmodus, verwalten } = useKonto();
  if (!verwaltungsmodus.darf) return <div className="leer"><p>{paket ? t('konten.verwaltung.werkbank.paket') : t('konten.verwaltung.werkbank.nicht')}</p></div>;
  return (
    <div className="leer">
      <p>{t('konten.verwaltung.werkbank.text')}</p>
      <Knopf art="haupt" onClick={verwalten}>{t('konten.verwaltung.menue.verwalten')}</Knopf>
    </div>
  );
}

/** Symbol im Browser-Tab: eigenes Logo oder das ursprüngliche (#72). */
let ursprungsSymbol: string | null = null;
export function setzeSymbol(url: string | null) {
  const el = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!el) return;
  ursprungsSymbol ??= el.href;
  el.href = url ?? ursprungsSymbol;
}


const uhrzeit = (iso: string) => new Date(iso).toLocaleString(gebietsschema(), { dateStyle: 'short', timeStyle: 'short' });

/** Hinweis an den Benutzer: Ein Administrator hat als er agiert. */
function Hinweise() {
  const { hinweise, aktualisieren } = useKonto();
  const [weg, setWeg] = useState(false);
  if (weg) return null;
  return (
    <div className="hinweisbanner" role="status">
      <div>
        <p>{tn('oberflaeche.app.um-einen-fehler-nachzustellen', { b: <strong>{t('konten.verwaltende.vertretung', { anzahl: hinweise.length })}</strong> })}</p>
        <ul>{hinweise.map((h) => <li key={h.id}>{t('oberflaeche.app.bis', { adminName: h.adminName, uhrzeit: uhrzeit(h.beginn), wert: h.ende ? uhrzeit(h.ende) : t('oberflaeche.app.jetzt-noch-nicht-beendet') })}</li>)}</ul>
      </div>
      <Knopf groesse="klein" onClick={() => { setWeg(true); void api.hinweiseGesehen().then(aktualisieren); }}>{t('oberflaeche.app.verstanden')}</Knopf>
    </div>
  );
}

/** Menü unter dem eigenen Namen (#69): Konto, Einstellungen, Hilfe, Fehler melden, Über das DMS (#430), Abmelden. */
function Benutzermenue({ an, abmelden }: { an: boolean; abmelden: () => Promise<void> }) {
  const { ich, vertretung, laufwerk, verwaltungsmodus, verwalten, verwaltungBeenden } = useKonto();
  const handbuch = useHandbuch();
  const [offen, setOffen] = useState(false);
  const [ueber, setUeber] = useState(false);
  const abwesend = abwesenheitWirkt(ich.abwesenheit, heuteIn());
  const rahmen = useRef<HTMLDivElement>(null);
  const menueId = useId();
  useEffect(() => {
    if (!offen) return;
    const zu = (e: Event) => { if (!rahmen.current?.contains(e.target as Node)) setOffen(false); };
    const taste = (e: KeyboardEvent) => { if (e.key === 'Escape') setOffen(false); };
    const weg = () => setOffen(false);
    addEventListener('pointerdown', zu); addEventListener('keydown', taste); addEventListener('popstate', weg);
    return () => { removeEventListener('pointerdown', zu); removeEventListener('keydown', taste); removeEventListener('popstate', weg); };
  }, [offen]);
  return (
    <div className="benutzermenue" ref={rahmen}>
      {/* Baustein Knopf (#1215) im Aussehen der Kopfzeile (.textknopf.wer); der Pfeil ist ein Symbol (D5). */}
      {/* Aufklapper (#1215): Links und Handlungen, kein ARIA-Menü – ohne role="menu", das nur Menüpunkte enthalten dürfte. */}
      <Knopf art="link" className={`wer ${an ? 'an' : ''}`} data-anker="benutzermenue" aria-expanded={offen} aria-controls={offen ? menueId : undefined} onClick={() => setOffen(!offen)}>
        <span className="wer-name">{ich.name || ich.email}</span>{abwesend && <span className="abwesend-punkt" title={t('oberflaeche.app.du-bist-abwesend')} aria-label={t('oberflaeche.app.abwesend')} />}<Symbol name="pfeil-unten" />
      </Knopf>
      {offen && <div className="hy-schleier" aria-hidden="true" onClick={() => setOffen(false)} />}
      {offen && (
        <div className="menue" id={menueId}>
          <div className="menuekopf">
            <strong>{ich.name || ich.email}</strong>
            <span className="leise klein">{ich.email}{verwaltungsmodus.darf ? ` · ${t(verwaltungsmodus.aktiv ? 'konten.verwaltung.menue.aktiv' : 'konten.verwaltung.menue.darf')}` : ''}</span>
            {vertretung && <span className="chip warn">{t('oberflaeche.app.als-angemeldet', { wert: ich.name || ich.email })}</span>}
            {abwesend && <Link to="/profil/abwesenheit" className="chip warn">{t('oberflaeche.app.du-bist-abwesend-2', { wert: ich.abwesenheit?.bis ? t('oberflaeche.app.bis-2', { reverse: ich.abwesenheit.bis.split('-').reverse().join('.') }) : '' })}</Link>}
          </div>
          {/* #418: Kein „Zurück zum eigenen Konto“ hier – der Rückweg ist nur der gelbe Banner. In Vertretung zeigt
              „Mein Konto“ das Konto des vertretenen Benutzers; damit es nicht verwechselt wird, heißt es dann so. */}
          {/* Jeder Weg nur einmal (#175): Darstellung, Abwesenheit usw. sind Reiter unter „Mein Konto“. */}
          <Link to="/profil/konto" className="menuepunkt"><Pikto name="person" />{vertretung ? t('oberflaeche.app.konto-von', { wert: ich.name || ich.email }) : t('oberflaeche.app.mein-konto')}</Link>
          {/* #819: direkt unter „Mein Konto“, nur für Personen mit Verwaltungsrecht; im Modus „Verwaltung beenden“. */}
          {verwaltungsmodus.darf && !vertretung && (verwaltungsmodus.aktiv
            ? <Knopf art="link" id="menue-verwaltung-beenden" className="menuepunkt" onClick={() => { setOffen(false); void verwaltungBeenden(); }}><Pikto name="beenden" />{t('konten.verwaltung.beenden')}</Knopf>
            : <Knopf art="link" id="menue-verwalten" className="menuepunkt" onClick={() => { setOffen(false); void verwalten(); }}><Pikto name="verwalten" />{t('konten.verwaltung.menue.verwalten')}</Knopf>)}
          {laufwerk && <Link to="/profil/laufwerk" className="menuepunkt"><Pikto name="laufwerk" />{t('profil.laufwerk.menue')}</Link>}
          <a href={handbuch('benutzer')} target="_blank" rel="noreferrer" className="menuepunkt" onClick={() => setOffen(false)}><Pikto name="hilfe" />{tn('oberflaeche.app.hilfe', { span: <Symbol name="extern" className="menuepunkt-extern" /> })}</a>
          {/* #832: Rundgänge und Tipps zum Stöbern – bei der Hilfe, ohne eigenen Menüpunkt „Rundgang starten“. */}
          <Link to="/entdecken" className="menuepunkt"><Pikto name="entdecken" />{t('entdecken.menue')}</Link>
          <Link to="/profil/fehler-melden" className="menuepunkt"><Pikto name="fehler" />{t('oberflaeche.app.fehler-melden')}</Link>
          <Knopf art="link" className="menuepunkt" onClick={() => { setOffen(false); setUeber(true); }}><Pikto name="info" />{t('oberflaeche.app.ueber-ablago')}</Knopf>
          <Knopf art="link" className="menuepunkt" onClick={abmelden}><Pikto name="abmelden" />{t('oberflaeche.app.abmelden')}</Knopf>
        </div>
      )}
      {ueber && <UeberDms schliessen={() => setUeber(false)} />}
    </div>
  );
}
