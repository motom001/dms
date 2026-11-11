import { rechtsbuendig } from '../../../shared/src/feldarten';
import { sichtBeschreibung, sichtName, typBeschreibung, typName } from '../../../shared/src/beschriftung';
import { aufbewahrenBis, datumText, gesperrt, stichtagName } from '../../../shared/src/archiv';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { beschreibeBedingung, kinderVon, mitNachkommen, spaltenDerSicht, wirksameTypen, type Sicht } from '../../../shared/src/sichten';
import { liesDirektlink, type Direktlink } from '../../../shared/src/direktlink';
import { auswahlText, darfErstellen, POST_RICHTUNG, darfPostAnlegen, formatiere, GEMISCHTE_SPALTEN, sortierbar, standardliste, TREFFER_ANFANG, TREFFER_ENDE, vorlageFelder, wirksameVorlage, type Ausschnitt, type Mappe, type Mappentyp, type Sortierung, type Wert } from '../../../shared/src/model';
import { ausgeblendeteFelder } from '../../../shared/src/darstellung';
import { api, verborgeneAufgaben, type Bezuege, type MappeDetails } from '../api';
import type { Aufgabe } from '../../../shared/src/model';
import { istTeiltyp, uebergeordneterTyp } from '../../../shared/src/teile';
import { AufgabenHinweis } from './Aufgaben';
import { useAblageStand, useDaten } from '../daten';
import { useKonto } from '../konto';
import { geheZu, Link } from '../ort';
import { Dreiteilung } from '../bereiche';
import { titelOder, useSeiten } from '../seiten';
import { MappeAnsicht, NeueMappe } from './MappeFormular';
import { oeffnetUebernehmen, UebernehmenSeite } from './Uebernehmen';
import { PapierkorbDetail, PapierkorbListe, usePapierkorb } from './Papierkorb';
import { Startseite } from './Startseite';
import { ZuletztListe } from './Zuletzt';
import { t, tn } from '../sprache';
import { AnsichtSymbol, Symbol, type SymbolName } from '../Symbol';
import { AnsichtFilter, AnsichtWahl } from './AnsichtWahl';
import { Stern } from './Stern';
import { spaltenName, zelle } from './spalten';
import { Listenkopf } from '../Listenkopf';
import { ExportDialog } from './Export';
import { EmailMehrere } from './EmailMehrere';
import { PostKnopf } from './Post';
import type { Hilfeort } from '../../../shared/src/hilfe';
import { Suchkopf, suchFehler, suchTypen } from './Suche';
import { UnscharfHinweis } from './Unscharf';
import { mitGrund } from './Loeschgrund';
import { rueckfrage } from '../rueckfrage';
import { ZahlWarte } from './ZahlWarte';
import { AufgabenWeitergeben } from '../profil/Abwesenheit';
import { ErledigenUmschalter, MeineAufgabenWeitergeben, TermineSicht, useErledigenAnsicht } from './Termine';
import { Ehemalig } from '../Person';
import { gebietsschema } from '../../../shared/src/sprache';
import { KnopfLink } from '../bausteine';

/**
 * Ablage in drei Spalten, von groß nach klein:
 *   Sichten  →  Mappen der Sicht  →  eine Mappe
 *
 * /ablage/zuletzt                   „Zuletzt geöffnet“ (#940): die letzten 25, nur über die Startseite erreichbar
 * /ablage/:sicht                    „eingang“ (Zu erledigen mit Liste · Monat · Jahr, #725; /ablage/anstehend leitet dorthin), „favoriten“ (#62), „papierkorb“ (#43), eine verwaltete Sicht (#38) oder die Id eines Mappentyps
 * /ablage/:sicht/:mappeId           Mappe rechts geöffnet (neue Post: weiter zu …/uebernehmen, außer mit ?als=post)
 * /ablage/:sicht/:mappeId/uebernehmen  „Dokument übernehmen“ (#934): Dokument in der Mitte, Mappe rechts
 * /ablage/:typId/neu?verweis=k:id   neue Mappe, optional mit vorbelegtem Verweis
 * /ablage/link?typ=…&feld=…         sprechender Link (#98); geöffnet: /ablage/link/:mappeId?typ=…
 * /ablage/suche?typ=…&feld.von=…    erweiterte Suche (#199, #426): Formular oben in der Mitte; geöffnet: /ablage/suche/:mappeId?…
 *
 * Die Liste lädt je 100 Mappen nach Titel sortiert und beim Scrollen die nächsten.
 */
const zahl = (n: number) => n.toLocaleString(gebietsschema());

export function Ablage({ teile, suche }: { teile: string[]; suche: URLSearchParams }) {
  const d = useDaten();
  const { ich } = useKonto();
  const [, sicht, dritt, viert] = teile;
  // #919: Zähler der Seitenleiste (Neue Post, Zu erledigen) und Startseite holen sich den neuen Stand selbst.
  useAblageStand();

  // Startseite (#334): Standard, außer der Benutzer hat sie im Profil abgeschaltet.
  const mitStart = d.einstellungen.startseite !== false;
  useEffect(() => { if (!sicht) geheZu(mitStart ? '/ablage/start' : '/ablage/eingang', true); }, [sicht, mitStart]);
  // Erweiterte Suche (#199): am Handy erst das Formular, nach „Suchen“ die Treffer.
  const istSuche = sicht === 'suche';
  const [formular, setFormular] = useState(() => !suche.toString());
  const leereSuche = istSuche && !suche.toString();
  useEffect(() => { if (leereSuche) setFormular(true); }, [leereSuche]);

  // Der eine Mappentyp der Sicht (für Trefferliste, Sortierung, „+ Neu“); bei mehreren Typen keiner.
  const verwaltet = d.sicht(sicht);
  const typ = d.typDerSicht(sicht);
  const ebene = dritt ? 'mappe' : istSuche ? (formular ? 'formular' : 'suchliste') : 'liste';
  // Spalten (#75): Trefferliste der Sicht, sonst Standard; bei mehreren Typen nur Gemeinsames.
  const sichtTypen = verwaltet ? wirksameTypen(d.sichten, verwaltet.id, d.typen.map((mappentyp) => mappentyp.id)).map((text) => d.typ(text)).filter((eintrag): eintrag is Mappentyp => !!eintrag) : typ ? [typ] : [];
  const wahl = verwaltet ? spaltenDerSicht(sichtTypen, verwaltet.trefferliste) : typ ? { key: 'standard', spalten: standardliste(typ).spalten } : { key: null, spalten: GEMISCHTE_SPALTEN };
  const papierkorb = usePapierkorb(false, sicht === 'papierkorb');
  // „Zu erledigen“ mit Liste · Monat · Jahr (#528, #725): Monat und Jahr nutzen Mitte und rechts, bis eine Mappe offen ist.
  const ansicht = useErledigenAnsicht();
  const kalender = sicht === 'eingang' && ansicht.ansicht !== 'liste';
  // Alte Adresse (#725): die feste Liste „Favoriten“ ist jetzt eine Ansicht.
  const favoritenSicht = d.zaehler.favoritenSicht && d.sicht(d.zaehler.favoritenSicht) ? d.zaehler.favoritenSicht : null;
  useEffect(() => { if (sicht === 'favoriten' && favoritenSicht) geheZu(`/ablage/${favoritenSicht}${dritt ? `/${dritt}` : ''}`, true); }, [sicht, dritt, favoritenSicht]);
  // Alte Adresse (#725): „Anstehend“ ist jetzt der Monat in „Zu erledigen“.
  useEffect(() => {
    if (sicht !== 'anstehend') return;
    if (ansicht.ansicht === 'liste') ansicht.setze('monat');
    geheZu(`/ablage/eingang${dritt ? `/${dritt}` : ''}`, true);
  }, [sicht, dritt, ansicht]);
  // Sprechender Link (#98): die Adresse ist der Link; beim Öffnen einer Mappe bleibt sie erhalten.
  const istLink = sicht === 'link';
  const anhang = istLink || istSuche ? `?${suche.toString()}` : '';
  const link = istLink ? liesDirektlink(suche, d.typen) : null;

  let rechts;
  if (dritt === 'neu' && !typ) {
    rechts = <div className="leer"><p>{t('ablage.ablage.diese-ansicht-zeigt-mehrere')}</p></div>;
  } else if (dritt === 'neu' && typ && verwaltet?.rechte?.C === false) {
    rechts = <div className="leer"><p>{t('ablage.ablage.in-der-ansicht-lassen', { name: sichtName(verwaltet) })}</p></div>;
  } else if (dritt === 'neu' && typ && istTeiltyp(typ) && !suche.get('verweis')) {
    // Teile (#1031) entstehen an ihrer übergeordneten Mappe („+ Position“ an der Rechnung).
    rechts = <div className="leer"><p>{t('ablage.teile.neu-an-uebergeordneter', { name: typName(typ), eltern: ((x) => (x ? typName(x) : '…'))(d.typ(uebergeordneterTyp(typ))) })}</p></div>;
  } else if (dritt === 'neu' && typ && !darfErstellen(typ)) {
    rechts = <div className="leer"><p>{t('ablage.ablage.von-lassen-sich-in', { name: typ.name, wert: typ.system === 'benutzer' ? t('ablage.ablage.benutzer-legt-in-der') : '' })}</p></div>;
  } else if (dritt === 'neu' && typ) {
    rechts = <NeueMappe key={`${typ.id}-${suche.get('verweis') ?? ''}-${suche.get('zuordnen') ?? ''}-${suche.get('vorbelegen') ?? ''}`} typ={typ} sicht={sicht} verweis={suche.get('verweis') ?? undefined} zuordnen={zuordnenAus(suche)} vorbelegen={suche.get('vorbelegen') ?? undefined} />;
  } else if (dritt === 'weitergeben' && sicht === 'eingang') {
    rechts = <AufgabenWeitergeben />;
  } else if (dritt && sicht === 'papierkorb') {
    rechts = <PapierkorbDetail key={dritt} id={dritt} werkbank={false} />;
  } else if (dritt) {
    rechts = <MappeLader key={dritt} id={dritt} sicht={sicht} anhang={anhang} alsPost={suche.get('als') === 'post'} />;
  } else {
    rechts = <div className="platzhalter"><p>{t('ablage.ablage.waehle-in-der-liste', { wert: typ ? t('ablage.ablage.oder-lege-eine-neue') : '' })}</p></div>;
  }

  // Feste Einträge links (#507, #725): Erweiterte Suche · Start · Zu erledigen · Neue Post · Favoriten · Papierkorb.
  const neuePost = d.zaehler.neuePost ? d.sicht(d.zaehler.neuePost) : undefined;
  const favSicht = d.zaehler.favoritenSicht ? d.sicht(d.zaehler.favoritenSicht) : undefined;
  // Zahlen kommen nach (#512): bis dahin ein Platzhalter (warte) bei den Einträgen, die aus dem Zähler kommen.
  const warte = !d.zahlenDa;
  // `anker` (#831): fester Ankerpunkt für Rundgänge und Tipps.
  const feste: Array<{ pfad: string; name: string; symbol: SymbolName; titel?: string; zahl?: number; warte?: boolean; hervor?: boolean; an: boolean; anker?: string }> = [
    { pfad: '/ablage/suche', name: t('ablage.ablage.erweiterte-suche'), symbol: 'suche', titel: t('ablage.ablage.mappentypen-waehlen-in-feldern'), an: istSuche, anker: 'navigation.erweiterte-suche' },
    // „Zuletzt geöffnet“ (#940) gehört zur Startseite: dort bleibt „Start“ markiert.
    ...(mitStart ? [{ pfad: '/ablage/start', name: t('ablage.ablage.start'), symbol: 'haus' as const, an: sicht === 'start' || sicht === 'zuletzt' }] : []),
    { pfad: '/ablage/eingang', name: t('ablage.ablage.zu-erledigen'), symbol: 'erledigen', zahl: d.zaehler.eingang, warte, hervor: true, an: sicht === 'eingang', anker: 'navigation.zu-erledigen' },
    ...(neuePost ? [{ pfad: `/ablage/${neuePost.id}`, name: sichtName(neuePost), symbol: 'posteingang' as const, titel: neuePost.beschreibung || undefined, zahl: d.zaehler.sichten?.[neuePost.id], warte, hervor: true, an: sicht === neuePost.id, anker: 'navigation.neue-post' }] : []),
    // Favoriten (#725): die mitgelieferte Ansicht oben wie „Neue Post“; die feste Liste nur, wenn der Administrator sie gelöscht hat.
    favSicht
      ? { pfad: `/ablage/${favSicht.id}`, name: sichtName(favSicht), symbol: 'stern', titel: favSicht.beschreibung || undefined, zahl: d.zaehler.sichten?.[favSicht.id] ?? d.zaehler.favoriten, warte, an: sicht === favSicht.id, anker: 'navigation.favoriten' }
      : { pfad: '/ablage/favoriten', name: t('ablage.ablage.favoriten'), symbol: 'stern', zahl: d.zaehler.favoriten, warte, an: sicht === 'favoriten', anker: 'navigation.favoriten' },
    // Papierkorb (#43): sichtbar, solange er an ist oder noch etwas darin liegt.
    ...(!!d.zaehler.papierkorbTage || !!d.zaehler.papierkorb ? [{ pfad: '/ablage/papierkorb', name: t('ablage.ablage.papierkorb'), symbol: 'geloescht' as const, zahl: d.zaehler.papierkorb, warte, an: sicht === 'papierkorb' }] : []),
  ];

  const links = (
      <aside className="spalte sichten" aria-label={t('ablage.ablage.ansichten')} data-anker="navigation.ansichten">
        {/* Handy (#498): ein Knopf „<Ansicht> ▾“ mit Suche und Gruppen statt der Reiterleiste. */}
        <AnsichtWahl aktiv={sicht} aktuell={sicht === 'start' ? t('ablage.ablage.start') : istSuche ? t('ablage.ablage.erweiterte-suche') : sicht === 'eingang' ? t('ablage.ablage.zu-erledigen') : sicht === 'favoriten' ? t('ablage.ablage.favoriten') : sicht === 'papierkorb' ? t('ablage.ablage.papierkorb') : sicht === 'zuletzt' ? t('ablage.startseite.zuletzt-geoeffnet') : verwaltet?.name ?? typ?.name ?? t('ablage.ablage.ansicht-waehlen')}
          feste={feste.map((f) => ({ pfad: f.pfad, name: <><Symbol name={f.symbol} /> {f.name}</>, text: f.name, zahl: f.zahl, warte: f.warte, hervor: f.hervor, an: f.an }))} ohne={[neuePost?.id, favSicht?.id].filter((x): x is string => !!x)} />
        <h2 className="ueber aw-breit">{t('ablage.ablage.ansichten')}</h2>
        <nav className="sichtliste">
          {/* Feste Einträge (#507): immer mit Symbol, in fester Reihenfolge; darunter nur die eingerichteten Ansichten. */}
          {feste.map((f) => (
            <Link key={f.pfad} to={f.pfad} className={`sicht ${f.an ? 'an' : ''}`} title={f.titel} anker={f.anker}>
              <span className="nm"><Symbol name={f.symbol} className="fest-sym" /> {f.name}</span>{f.warte ? <ZahlWarte /> : !!f.zahl && <span className={f.hervor ? 'zaehler' : 'zahl'}>{zahl(f.zahl)}</span>}
            </Link>
          ))}
          {d.sichten.length > 0 && <hr />}
          <AnsichtFilter aktiv={sicht} baum={<SichtBaum aktiv={sicht} ohne={[neuePost, favSicht].filter((x): x is Sicht => !!x && !kinderVon(d.sichten, x.id).length).map((x) => x.id)} />} />
        </nav>
        {!d.typen.length && <p className="leise klein">{tn('ablage.ablage.noch-keine-mappentypen', { wert: ich.rolle === 'admin' ? <Link to="/werkbank/typen" className="verweis">{t('ablage.ablage.zur-werkbank')}</Link> : t('ablage.ablage.wer-ablago-verwaltet-muss') })}</p>}
        {d.typen.length > 0 && !d.sichten.length && <p className="leise klein">{tn('ablage.ablage.noch-keine-ansichten', { wert: ich.rolle === 'admin' ? <Link to="/werkbank/sichten" className="verweis">{t('ablage.ablage.ansichten-einrichten')}</Link> : t('ablage.ablage.wer-ablago-verwaltet-muss') })}</p>}
      </aside>
  );
  // „Dokument übernehmen“ (#934): links die gewohnten Ansichten, in der Mitte das Dokument, rechts die Mappe.
  if (dritt && viert === 'uebernehmen' && sicht) return <UebernehmenSeite key={dritt} id={dritt} sicht={sicht} links={links} suche={suche} />;

  return (
    // Startseite ohne geöffnete Mappe (#429): ein großes Dashboard über Mitte und rechts. Ebenso die erweiterte
    // Suche (#426) und der Kalender in „Zu erledigen“ (#528, #725): Sie nutzen Mitte und rechts, bis ein Eintrag geöffnet wird.
    <Dreiteilung ort="ablage" ebene={ebene} offen={dritt} rechts={!((sicht === 'start' || istSuche || kalender) && !dritt)}>
      {links}

      <section className={`spalte liste${istSuche ? ` suchmitte${formular ? ' sm-formular' : ''}` : ''}${kalender ? ' ka-mitte' : ''}`} aria-label={t('ablage.ablage.mappen')} data-anker="liste">
        {istSuche
          ? <SuchListe suche={suche} offen={dritt} formular={formular} setFormular={setFormular} />
          : link
          ? link.ok
            ? <LinkListe key={`${link.link.typ.id}:${JSON.stringify(link.link.bedingungen)}`} link={link.link} suche={suche} offen={dritt} />
            : <>
                <Listenkopf titel={t('ablage.ablage.link')} />
                <div className="hinweis schlecht stapel" role="alert">
                  <p>{t('ablage.ablage.dieser-link-laesst-sich')}</p>
                  <ul>{link.fehler.map((f) => <li key={f}>{f}</li>)}</ul>
                </div>
              </>
          : sicht === 'start'
          ? <Startseite offen={dritt} breit={!dritt} />
          : sicht === 'zuletzt'
          ? <ZuletztListe offen={dritt} />
          : sicht === 'papierkorb'
          ? <PapierkorbListe z={papierkorb} werkbank={false} offen={dritt} />
          : sicht === 'eingang' && kalender
          ? <TermineSicht offen={dritt} a={ansicht} />
          : sicht === 'eingang'
          ? <Liste key="eingang" sicht="eingang" titel={t('ablage.ablage.zu-erledigen')} offen={dritt} hilfe="ablage.eingang"
              beschreibung={t('ablage.ablage.mappen-an-denen-du')}
              kopf={<div className="ka-leiste ka-liste"><ErledigenUmschalter a={ansicht} /><MeineAufgabenWeitergeben /></div>}
              leerText={t('ablage.ablage.nichts-zu-tun')} />
          : sicht === 'favoriten'
          ? <Liste key="favoriten" sicht="favoriten" titel={t('ablage.ablage.favoriten')} offen={dritt} hilfe="ablage.favoriten"
              beschreibung={t('ablage.ablage.mappen-die-du-mit')}
              leerText={t('ablage.ablage.noch-keine-favoriten-markiere')} />
          : !verwaltet && typ && istTeiltyp(typ) ? <TeilListe typ={typ} />
          : verwaltet || typ ? <Liste key={sicht} sicht={sicht!} typ={typ} spaltenTyp={typ ?? sichtTypen[0]} spalten={wahl.spalten} listenSpalten={wahl.key ? wahl.spalten : []} titel={verwaltet ? sichtName(verwaltet) : typName(typ!)} beschreibung={verwaltet ? sichtBeschreibung(verwaltet) : typ ? typBeschreibung(typ) : undefined}
              offen={dritt} neu={!!typ && darfErstellen(typ) && verwaltet?.rechte?.C !== false} post={!!typ && darfPostAnlegen(typ) && verwaltet?.rechte?.C !== false}
              leerText={typ?.system === 'post' ? t('ablage.ablage.keine-post-mit-post') : verwaltet?.bedingungen.some((x) => x.art === 'favorit') ? t('ablage.ablage.noch-keine-favoriten-markiere') : t('ablage.ablage.noch-keine-mappen-in')} hilfe={typ?.system === 'post' ? 'ablage.post' : 'ablage.sicht'} auswahl export={verwaltet ? verwaltet.rechte?.E !== false : exportOhneSicht(ich.rolle === 'admin', d.sichten)} />
          : sicht ? <div className="leer"><p>{t('ablage.ablage.diese-ansicht-gibt-es')}</p></div> : null}
      </section>

      <section className="spalte mappe" aria-label={t('ablage.ablage.mappe')} data-anker="mappe">
        <Link to={`/ablage/${sicht ?? 'eingang'}${anhang}`} className="verweis nur-schmal">{t('ablage.ablage.zur-liste')}</Link>
        {rechts}
      </section>
    </Dreiteilung>
  );
}

/** Zuordnen über eine neue Mappe (#192): ?zuordnen=<Post>&register=…&dokumente=a,b&kopieren=1&vorschlag={…} */
function zuordnenAus(q: URLSearchParams) {
  const post = q.get('zuordnen');
  if (!post) return undefined;
  let vorschlag: Record<string, Wert> = {};
  try { const v = JSON.parse(q.get('vorschlag') ?? '{}'); if (v && typeof v === 'object') vorschlag = v; } catch { /* ohne Vorschlag */ }
  return { post, register: q.get('register') ?? undefined, dokumente: (q.get('dokumente') ?? '').split(',').filter(Boolean), kopieren: q.get('kopieren') === '1', vorschlag };
}

/** Lädt eine Mappe mit Rückverweisen, Dokumenten und Bezügen und zeigt sie an. */
function MappeLader({ id, sicht, anhang = '', alsPost = false }: { id: string; sicht: string; anhang?: string; alsPost?: boolean }) {
  const d = useDaten();
  const [details, setDetails] = useState<MappeDetails | null | 'fehlt' | { verborgen: Aufgabe[] }>(null);
  const laden = useCallback(async () => {
    try { setDetails(await api.mappe(id)); } catch (x) { const v = verborgeneAufgaben(x); setDetails(v ? { verborgen: v } : 'fehlt'); }
  }, [id]);
  useEffect(() => { void laden(); }, [laden, d.stand]);
  // Neue Post aus allen Eingängen (#934) öffnet die Seite „Dokument übernehmen“ – unter „Neue Post“, damit links sie markiert ist.
  const weiter = details && details !== 'fehlt' && !('verborgen' in details) && !alsPost && oeffnetUebernehmen(details, d.typ(details.mappe.typId));
  useEffect(() => { if (weiter) geheZu(`/ablage/${d.zaehler.neuePost ?? sicht}/${id}/uebernehmen`, true); }, [weiter]); // eslint-disable-line react-hooks/exhaustive-deps -- nur weiter, wenn „weiter“ gesetzt wird; die Adresse gilt zu diesem Zeitpunkt
  if (details === null || weiter) return <p className="leise">{t('ablage.ablage.lade')}</p>;
  if (details === 'fehlt') return <div className="leer"><p>{t('ablage.ablage.diese-mappe-gibt-es')}</p></div>;
  // Ohne Leserecht (#124): nur die eigenen Aufgaben dazu – erledigen oder weitergeben.
  if ('verborgen' in details) return (
    <div className="einspaltig">
      <div className="mappenkopf"><p className="ueber">{t('ablage.ablage.mappe')}</p><h1 className="verborgen-titel">{t('ablage.ablage.nicht-sichtbare-mappe')}</h1></div>
      <div className="hinweis info"><p>{t('ablage.ablage.diese-mappe-darfst-du', { wert: details.verborgen.length ? t('ablage.ablage.deine-aufgabe-dazu-kannst') : t('ablage.ablage.du-hast-hier-keine') })}</p></div>
      <AufgabenHinweis aufgaben={details.verborgen} neuLaden={laden} />
    </div>
  );
  const eintrag = d.typ(details.mappe.typId);
  if (!eintrag) return <div className="leer"><p>{t('ablage.ablage.der-mappentyp-dieser-mappe')}</p></div>;
  return <MappeAnsicht key={details.mappe.id} typ={eintrag} details={details} sicht={sicht} anhang={anhang} neuLaden={laden} />;
}

/** Nebenzeile eines Listeneintrags: zwei Felder, die nicht schon im Titel stehen. */
function unterzeile(typ: Mappentyp, m: Mappe, bezuege: Bezuege) {
  const imTitel = new Set(vorlageFelder(wirksameVorlage(typ)));
  const aus = ausgeblendeteFelder(typ);
  const neben = typ.felder.filter((f) => !imTitel.has(f.key) && !aus.has(f.key) && f.typ !== 'langtext' && f.typ !== 'formatiert' && f.typ !== 'passwort').slice(0, 2);
  return neben.map((f) => formatiere(f, m.werte[f.key], (id) => titelOder(bezuege[id]?.titel), { felder: typ.felder, werte: m.werte })).filter(Boolean).join(' · ');
}

/**
 * Trefferliste eines sprechenden Links (#98): vorübergehende Sicht, nicht im Baum.
 * Die erste Mappe öffnet sich von selbst; die Sortierung steht in der Adresse.
 */
function LinkListe({ link, suche, offen }: { link: Direktlink; suche: URLSearchParams; offen?: string }) {
  const sortierung = link.sortierung;
  const setze = (n: Sortierung | null) => {
    const q = new URLSearchParams(suche);
    if (!n || (n.spalte === '_titel' && !n.absteigend)) q.delete('sortierung');
    else q.set('sortierung', `${n.absteigend ? '-' : ''}${n.spalte}`);
    geheZu(`/ablage/link${offen ? `/${offen}` : ''}?${q.toString()}`, true);
  };
  const bedingungen = link.bedingungen.map((b) => beschreibeBedingung(b, [link.typ]));
  return (
    <Liste sicht="link" link={suche.toString()} anhang={`?${suche.toString()}`} typ={link.typ} spaltenTyp={link.typ}
      spalten={standardliste(link.typ).spalten} listenSpalten={standardliste(link.typ).spalten}
      titel={t('ablage.ablage.link-2', { name: link.typ.name })} beschreibung={bedingungen.length ? bedingungen.join(' · ') : t('ablage.ablage.alle-mappen-dieses-mappentyps')}
      offen={offen} zuerstOeffnen sortierungFest={{ wert: sortierung, setze }} leerText={t('ablage.ablage.keine-mappe-passt-zu')} />
  );
}

/** Exportieren ohne Sicht (#294, Regel A): nur wer in mindestens einer Sicht das Recht E hat (Admins immer). */
const exportOhneSicht = (admin: boolean, sichten: Array<{ rechte?: { R?: boolean; E?: boolean } }>) =>
  admin || sichten.some((s) => s.rechte?.R !== false && s.rechte?.E !== false);

/**
 * Erweiterte Suche (#199, #426): oben das Formular (zuklappbar), darunter die Treffer mit der Zusammenfassung
 * der Bedingungen. Am Handy erst das Formular, nach „Suchen“ die Treffer.
 */
function SuchListe({ suche, offen, formular, setFormular }: { suche: URLSearchParams; offen?: string; formular: boolean; setFormular(an: boolean): void }) {
  const d = useDaten();
  const { ich } = useKonto();
  const fehler = suchFehler(suche, d.typen);
  const kopf = <Suchkopf suche={suche} offen={offen} formular={formular} setFormular={setFormular} />;
  if (fehler.length) return (
    <>
      <Listenkopf titel={t('suche.titel')} hilfe="ablage.erweitertesuche" />
      {kopf}
      <div className="hinweis schlecht stapel" role="alert"><p>{t('ablage.ablage.diese-suche-laesst-sich')}</p><ul>{fehler.map((f) => <li key={f}>{f}</li>)}</ul></div>
    </>
  );
  const typen = suchTypen(suche, d.typen);
  const typ = typen.length === 1 ? typen[0] : undefined;
  const wahl = typ ? { key: 'standard', spalten: standardliste(typ).spalten } : typen.length ? spaltenDerSicht(typen, null) : { key: null, spalten: GEMISCHTE_SPALTEN };
  const q = suche.toString();
  return (
    <Liste key={q} sicht="suche" link={q} anhang={`?${q}`} typ={typ} spaltenTyp={typ ?? typen[0]} spalten={wahl.spalten} listenSpalten={wahl.key ? wahl.spalten : []}
      titel={t('suche.titel')} offen={offen} hilfe="ablage.erweitertesuche" auswahl export={exportOhneSicht(ich.rolle === 'admin', d.sichten)} immerSuche
      kopf={<div className="suchkopf">{kopf}</div>}
      leerText={t('suche.keine')} />
  );
}

function Liste(p: {
  sicht: string; typ?: Mappentyp; spaltenTyp?: Mappentyp; spalten?: string[]; listenSpalten?: string[]; titel: string; beschreibung?: string; offen?: string; neu?: boolean; leerText: string;
  /** Post (#192): „+ Post“ statt „+ Neu“. */
  post?: boolean;
  /** Kontextbezogene Hilfe (#110). */
  hilfe?: Hilfeort;
  /** Sprechender Link (#98): seine Parameter, der Zusatz für Adressen, Sortierung aus der Adresse, erste Mappe öffnen. */
  link?: string; anhang?: string; sortierungFest?: { wert: Sortierung | null; setze(n: Sortierung | null): void }; zuerstOeffnen?: boolean;
  /** Mehrere Mappen auswählen (#149) – in Sichten, nicht im Eingang oder bei Favoriten. */
  auswahl?: boolean;
  /** Export erlaubt (#153: Recht E an der Sicht). */
  export?: boolean;
  /** Erweiterte Suche (#199): Chips unter dem Kopf; Suchfeld, sobald es Treffer gibt. */
  kopf?: ReactNode; immerSuche?: boolean;
}) {
  const d = useDaten();
  // Favoriten benachrichtigen (#506): ohne Freigabe der Werkbank kein Schalter an den Favoriten.
  const { favoritenBenachrichtigung } = useKonto();
  const anhang = p.anhang ?? '';
  const [eingabe, setEingabe] = useState('');
  const [suche, setSuche] = useState('');
  // Handy (#498): Haken, Erweiterte Suche und Exportieren hinter „Filter ▾“.
  const [filter, setFilter] = useState(false);
  // Suche erst nach einer kurzen Tipppause an den Server schicken.
  useEffect(() => { const timer = setTimeout(() => setSuche(eingabe.trim()), 250); return () => clearTimeout(timer); }, [eingabe]);

  // Sortierung je Benutzer und Mappentyp (bzw. Eingang), auf dem Server gespeichert.
  const sortSchluessel = `sortierung:${p.sicht}`;
  const sortierung = p.sortierungFest ? p.sortierungFest.wert : (d.einstellungen[sortSchluessel] as Sortierung | undefined) ?? null;
  const setzeSortierung = (n: Sortierung | null) => (p.sortierungFest ? p.sortierungFest.setze(n) : d.setzeEinstellung(sortSchluessel, n));
  const sortiere = (spalte: string) => {
    const n: Sortierung | null = sortierung?.spalte === spalte ? { spalte, absteigend: !sortierung.absteigend } : { spalte, absteigend: false };
    setzeSortierung(n.spalte === '_titel' && !n.absteigend ? null : n);
  };
  // Volltextsuche (#45): je Benutzer gemerkt.
  const volltext = d.einstellungen.suche_volltext === true;
  const inNotizen = d.einstellungen.suche_notizen === true;
  const s = useSeiten(p.sicht, suche, d.stand, sortierung, volltext, inNotizen, p.link);

  // Link (#98): die erste Mappe öffnen – einmal, nicht nach „Zur Liste“.
  const geoeffnet = useRef(false);
  useEffect(() => {
    if (p.offen) { geoeffnet.current = true; return; }
    if (p.zuerstOeffnen && !geoeffnet.current && s.mappen.length) {
      geoeffnet.current = true;
      geheZu(`/ablage/${p.sicht}/${s.mappen[0].id}${anhang}`, true);
    }
  }, [p.offen, p.zuerstOeffnen, s.mappen]); // eslint-disable-line react-hooks/exhaustive-deps -- erste Mappe nur öffnen, wenn sich Auswahl oder Liste ändern

  // Breite der Liste: schmal → kompakte Einträge, breit → Tabelle (#22).
  const mess = useRef<HTMLDivElement>(null);
  const [breite, setBreite] = useState(0);
  useEffect(() => {
    const el = mess.current;
    if (!el) return;
    const o = new ResizeObserver(([e]) => setBreite(e.contentRect.width));
    o.observe(el);
    return () => o.disconnect();
  }, []);
  // Feste Sichten (Eingang, Favoriten): Systemspalten.
  const spalten = p.spalten ?? GEMISCHTE_SPALTEN;
  const tabelle = spalten.length > 0 && breite >= Math.max(560, spalten.length * 120);

  // Ende der Liste erreicht → nächste Seite laden.
  const ende = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const el = ende.current;
    if (!el) return;
    const o = new IntersectionObserver((e) => { if (e.some((x) => x.isIntersecting)) s.mehr(); }, { rootMargin: '300px' });
    o.observe(el);
    return () => o.disconnect();
  }, [s.mehr, s.mappen.length, tabelle]); // eslint-disable-line react-hooks/exhaustive-deps -- Beobachter nur neu, wenn sich Liste oder Darstellung ändern

  // Solange die Zahlen der Ansichten nachkommen (#512), zählt die Liste selbst.
  const gesamtSicht = !d.zahlenDa ? s.gesamt ?? 0 : p.sicht === 'eingang' ? d.zaehler.eingang : p.sicht === 'favoriten' ? d.zaehler.favoriten ?? 0 : d.zaehler.sichten?.[p.sicht] ?? (p.typ ? d.anzahl(p.typ.id) : 0);
  // Suche immer, sobald es Mappen gibt (#160) – der Volltext lohnt auch bei wenigen.
  const zeigeSuche = gesamtSicht > 0 || !!eingabe || (!!p.immerSuche && !!s.gesamt);
  const anzahlText = s.gesamt === null ? '' : suche || p.sicht === 'suche'
    ? t('ablage.ablage.treffer', { zahl: zahl(s.gesamt) })
    : t('ablage.ablage.mappen-2', { anzahl: s.gesamt, zahl: zahl(s.gesamt) });
  const nachladen = !s.alle && (s.laedt ? t('ablage.ablage.lade') : <button type="button" className="textknopf" onClick={s.mehr}>{t('ablage.ablage.weitere-laden')}</button>);
  // Favorit = Abo (#422): Geöffnet = gesehen – Hervorhebung weg, Zähler (eine „Geändert“-Aufgabe erledigt sich) neu.
  useEffect(() => {
    if (!p.offen || !s.geaendert.has(p.offen)) return;
    const id = p.offen;
    s.gesehen([id]);
    void api.gesehen([id]).then(() => d.neuLaden()).catch(() => {});
  }, [p.offen, s.geaendert]); // eslint-disable-line react-hooks/exhaustive-deps -- als gesehen melden nur bei anderer Mappe oder neuen Änderungen
  const geaenderteHier = s.mappen.filter((m) => s.geaendert.has(m.id)).map((m) => m.id);
  async function alleGesehen() {
    s.gesehen(geaenderteHier);
    try { await api.gesehen(geaenderteHier); await d.neuLaden(); } catch { /* beim nächsten Laden wieder da */ }
  }
  const w = useAuswahl(s.mappen, s.gesamt, [p.sicht, suche, volltext, inNotizen, p.link ?? '']);
  const wahl = p.auswahl ? w : undefined;
  const [ergebnis, setErgebnis] = useState<{ text: string; liste: Array<{ id: string; titel: string; grund: string }> }>();
  const [exportOffen, setExportOffen] = useState(false);
  const [emailOffen, setEmailOffen] = useState(false);
  // Archivnummer (#345): Enter mit einer Nummer (auch vom Handscanner, „DMS-ASN:A-000123“) springt zum Dokument.
  async function zurArchivnummer(text: string) {
    const nr = text.trim();
    if (!nr || /\s/.test(nr) || !/\d/.test(nr) || nr.length > 50) return;
    try {
      const r = await api.archivnummer(nr);
      setEingabe('');
      geheZu(`/ablage/${r.typId}/${r.mappeId}?register=${encodeURIComponent(r.dokument.registerKey)}&dokument=${r.dokument.id}`);
    } catch { /* keine Archivnummer: normale Suche */ }
  }
  async function alleWaehlen() {
    try { const r = await api.auswahl(p.sicht, suche, volltext, inNotizen, p.link); w.setze(r.ids, true); }
    catch (x) { setErgebnis({ text: (x as Error).message, liste: [] }); }
  }
  // Mehrere Mappen löschen (#150): erst zählen und fragen, dann löschen; was nicht ging, mit Grund.
  async function loeschen() {
    setErgebnis(undefined);
    try {
      const ids = [...w.gewaehlt];
      const probe = await api.mappenLoeschen(ids, true);
      if (!probe.mappen) { setErgebnis({ text: t('ablage.ablage.keine-der-ausgewaehlten-mappen'), liste: probe.ausgelassen }); return; }
      const korb = (d.zaehler.papierkorbTage ?? 0) > 0;
      const titel = t('ablage.ablage.mappen-3', { anzahl: probe.mappen, zahl: zahl(probe.mappen), wert: probe.dokumente ? t('ablage.ablage.mit-dokumenten', { anzahl: probe.dokumente, zahl: zahl(probe.dokumente) }) : '', wert2: korb ? t('ablage.ablage.in-den-papierkorb-legen') : t('ablage.ablage.endgueltig-loeschen') });
      const text = [korb ? t('ablage.ablage.dort-lassen-sie-sich') : t('ablage.ablage.das-laesst-sich-nicht'),
        probe.ausgelassen.length ? t('ablage.ablage.mappen-werden-ausgelassen-kein', { anzahl: probe.ausgelassen.length, zahl: zahl(probe.ausgelassen.length) }) : ''].filter(Boolean).join('\n\n');
      const anlass = await mitGrund({ titel, text, ja: korb ? t('ablage.ablage.in-den-papierkorb') : t('ablage.ablage.endgueltig-loeschen-2'), gefahr: true });
      if (!anlass) return;
      const r = await api.mappenLoeschen(ids, false, anlass);
      w.leeren();
      await d.neuLaden();
      setErgebnis({ text: t('ablage.ablage.mappen-4', { anzahl: r.geloescht, zahl: zahl(r.geloescht), wert: korb ? t('ablage.ablage.in-den-papierkorb-gelegt') : t('ablage.ablage.geloescht'), wert2: r.ausgelassen.length ? t('ablage.ablage.ausgelassen', { zahl: zahl(r.ausgelassen.length) }) : '' }), liste: r.ausgelassen });
      if (p.offen && ids.includes(p.offen) && !r.ausgelassen.some((x) => x.id === p.offen)) geheZu(`/ablage/${p.sicht}${anhang}`);
    } catch (x) { setErgebnis({ text: (x as Error).message, liste: [] }); }
  }

  return (
    <>
      <div ref={mess} className="breitenmesser" aria-hidden="true" />
      <Listenkopf titel={p.titel} hilfe={p.hilfe} beschreibung={p.beschreibung}>
        {p.neu && <KnopfLink to={`/ablage/${p.sicht}/neu`} art="anlegen" groesse="klein">{t('ablage.ablage.neu')}</KnopfLink>}
        {p.post && p.typ && <div className="postknopf"><PostKnopf /></div>}
      </Listenkopf>
      {p.kopf}
      {zeigeSuche && (
        <div className={`suchzeile${filter ? '' : ' lk-zu'}`}>
          <label className="suche"><span className="sr">{t('ablage.ablage.suchen')}</span>
            <input type="search" placeholder={volltext ? t('ablage.ablage.suchen-in-titel-werten') : t('ablage.ablage.suchen-in-titel-und')} value={eingabe} onChange={(e) => setEingabe(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void zurArchivnummer(eingabe); }} />
          </label>
          <label className="haken klein" title={t('ablage.ablage.auch-im-text-der')}>
            <input type="checkbox" checked={volltext} onChange={(e) => d.setzeEinstellung('suche_volltext', e.target.checked || null)} /><span>{t('ablage.ablage.volltext-durchsuchen')}</span>
          </label>
          <label className="haken klein" title={t('ablage.ablage.auch-in-den-notizen')}>
            <input type="checkbox" checked={inNotizen} onChange={(e) => d.setzeEinstellung('suche_notizen', e.target.checked || null)} /><span>{t('ablage.ablage.notizen')}</span>
          </label>
          {p.sicht !== 'suche' && <Link to={`/ablage/suche${p.typ ? `?typ=${encodeURIComponent(p.typ.schluessel ?? p.typ.id)}` : ''}`} className="verweis klein" title={t('ablage.ablage.mappentypen-waehlen-in-feldern')}>{t('ablage.ablage.erweiterte-suche')}</Link>}
          {p.export && !wahl?.gewaehlt.size && !!s.gesamt && <button type="button" className="textknopf klein lk-nur-schmal" onClick={() => setExportOffen(true)}>{t('ablage.ablage.exportieren')}</button>}
          {/* In der erweiterten Suche (#426) heißt „Filter“ das Suchformular; die Haken stehen dort unter „Volltext“. */}
          {p.sicht !== 'suche' && <button type="button" className={`knopf klein lk-filterknopf ${filter ? 'an' : ''}`} aria-expanded={filter} onClick={() => setFilter(!filter)}>{tn('ablage.ablage.filter', { span: <span aria-hidden="true">▾</span>, wert: (volltext || inNotizen) && <span className="lk-punkt" aria-label={t('ablage.ablage.aktiv')} /> })}</button>}
        </div>
      )}
      {anzahlText && (
        <p className="listenzahl leise klein" aria-live="polite">
          {anzahlText}{s.mappen.length < (s.gesamt ?? 0) ? t('ablage.ablage.geladen', { zahl: zahl(s.mappen.length) }) : ''}
          {sortierung && <> {' '}{t('ablage.ablage.sortiert-nach', { spaltenName: spaltenName(sortierung.spalte, p.typ), wert: sortierung.absteigend ? '↓' : '↑' })}{' '}<button type="button" className="textknopf" onClick={() => setzeSortierung(null)}>{t('ablage.ablage.nach-titel')}</button></>}
          {p.export && !wahl?.gewaehlt.size && !!s.gesamt && <span className="lk-nur-breit"> · <button type="button" className="textknopf" onClick={() => setExportOffen(true)}>{t('ablage.ablage.exportieren')}</button></span>}
          {geaenderteHier.length > 0 && <> {' '}{tn('ablage.ablage.geaendert', { span: <span className="abo-punkt" aria-hidden="true" />, zahl: zahl(geaenderteHier.length) })}{' '}<button type="button" className="textknopf" onClick={() => void alleGesehen()}>{t('ablage.ablage.alle-als-gesehen-markieren')}</button></>}
        </p>
      )}
      {exportOffen && (
        <ExportDialog sicht={p.sicht} link={p.link} ids={wahl?.gewaehlt.size ? [...wahl.gewaehlt] : null} anzahl={wahl?.gewaehlt.size ?? 0} gesamt={s.gesamt ?? 0}
          suche={suche} volltext={volltext} notizen={inNotizen} sortierung={sortierung}
          fertig={(meldung) => { setExportOffen(false); if (meldung) setErgebnis({ text: meldung, liste: [] }); }} />
      )}
      {emailOffen && wahl && wahl.gewaehlt.size > 0 && (
        <EmailMehrere ids={[...wahl.gewaehlt]} fertig={(meldung) => { setEmailOffen(false); if (meldung) setErgebnis({ text: meldung, liste: [] }); }} />
      )}
      {s.fehler && <div className="hinweis schlecht"><p>{s.fehler}</p></div>}
      {/* Unscharfe Suche (#356): ohne genauen Treffer ähnliche Schreibweisen, „Meintest du …?“ sucht genau das Wort. */}
      {s.unscharf && <UnscharfHinweis u={s.unscharf} suchen={(x) => {
        if (suche || !p.link) { setEingabe(x); return; }
        const q = new URLSearchParams(p.link); q.set('volltext', x);
        geheZu(`/ablage/${p.sicht}${p.offen ? `/${p.offen}` : ''}?${q.toString()}`);
      }} />}
      {wahl && wahl.gewaehlt.size > 0 && (
        <div className="aktionsleiste" role="region" aria-label={t('ablage.ablage.auswahl')}>
          <span className="klein">{tn('ablage.ablage.von-ausgewaehlt', { b: <strong>{zahl(wahl.gewaehlt.size)}</strong>, zahl: zahl(s.gesamt ?? 0) })}</span>
          {!wahl.alle && (s.gesamt ?? 0) > wahl.gewaehlt.size && <button type="button" className="textknopf klein" onClick={() => void alleWaehlen()}>{t('ablage.ablage.alle-auswaehlen', { zahl: zahl(s.gesamt ?? 0) })}</button>}
          <span className="luecke" aria-hidden="true" />
          {p.export && <button type="button" className="knopf klein" onClick={() => setExportOffen(true)}>{t('ablage.ablage.exportieren')}</button>}
          {p.export && <button type="button" className="knopf klein" onClick={() => { setExportOffen(false); setEmailOffen(true); }}>{t('ablage.ablage.per-e-mail')}</button>}
          <button type="button" className="knopf klein gefahr" onClick={() => void loeschen()}>{t('ablage.ablage.loeschen')}</button>
          <button type="button" className="textknopf klein" onClick={wahl.leeren}>{t('ablage.ablage.auswahl-aufheben')}</button>
        </div>
      )}
      {ergebnis && (
        <div className={`hinweis ${ergebnis.liste.length ? 'warn' : 'info'}`} role="status">
          <p>{ergebnis.text}</p>
          {ergebnis.liste.length > 0 && <ul className="klein">{ergebnis.liste.slice(0, 50).map((x) => <li key={x.id}>{titelOder(x.titel)}: {x.grund}</li>)}{ergebnis.liste.length > 50 && <li>{t('ablage.ablage.und-weitere', { zahl: zahl(ergebnis.liste.length - 50) })}</li>}</ul>}
          <button type="button" className="textknopf klein" onClick={() => setErgebnis(undefined)}>{t('ablage.ablage.ausblenden')}</button>
        </div>
      )}
      <div className={`listenrumpf${wahl?.gewaehlt.size ? ' mit-auswahl' : ''}`}>
      {s.gesamt === 0
        ? <p className="leise leerliste">{suche && p.sicht !== 'suche' ? t('ablage.ablage.nichts-gefunden') : p.leerText}</p>
        : tabelle
          ? <Tabelle sicht={p.sicht} anhang={anhang} typ={p.typ} spaltenTyp={p.spaltenTyp} spalten={spalten} mappen={s.mappen} bezuege={s.bezuege} ausschnitte={s.ausschnitte} aufgaben={s.aufgaben} favoriten={s.favoriten} geaendert={s.geaendert} offen={p.offen} wahl={wahl}
              sortierung={sortierung} sortiere={sortiere} ende={nachladen ? (el) => { ende.current = el; } : undefined} nachladen={nachladen} />
          : <ul className="mappenliste">
              {s.mappen.map((m, i) => {
                const typ = d.typ(m.typId);
                const k = kompakt(p.listenSpalten ?? [], !!p.typ, typ, m, s.bezuege, d.person);
                return (
                  <li key={m.id} className={`mit-stern${wahl ? ' mit-haken' : ''}${wahl?.gewaehlt.has(m.id) ? ' gewaehlt' : ''}${s.geaendert.has(m.id) ? ' abo-geaendert' : ''}`} {...(wahl && !m.verborgen ? wahl.druck(i) : {})}>
                    {wahl && !m.verborgen && <Wahlhaken an={wahl.gewaehlt.has(m.id)} titel={k.titel} waehle={(an, bereich) => wahl.waehle(i, an, bereich)} />}
                    {m.verborgen ? <span /> : <Stern mappeId={m.id} an={s.favoriten.has(m.id)} titel={k.titel} klein />}
                    <Link to={`/ablage/${p.sicht}/${m.id}${anhang}`} className={`eintrag ${p.offen === m.id ? 'an' : ''}`}>
                      <span className={`titel ${m.verborgen ? 'verborgen-titel' : ''}`}>{s.geaendert.has(m.id) && <GeaendertPunkt />}{m.verborgen ? t('ablage.ablage.nicht-sichtbare-mappe') : <Ehemalig id={m.id}>{k.titel}</Ehemalig>}
                        {/* Archivmodus (#212): Hinweis, solange die Frist läuft – oder noch nicht begonnen hat (#1051). */}
                        {!m.verborgen && typ?.archiv && gesperrt(typ.archiv, m) && <> <span className="chip archiv klein" title={aufbewahrenBis(typ.archiv, m) ? t('ablage.ablage.archiv-aufbewahren-bis', { datumText: datumText(aufbewahrenBis(typ.archiv, m)!) }) : t('ablage.ablage.archiv-frist-beginnt-mit', { feld: stichtagName(typ) })}>{t('ablage.ablage.archiv')}</span></>}</span>
                      <Unter text={k.unter} />
                      {s.ausschnitte[m.id] && <Fundstelle a={s.ausschnitte[m.id]} />}
                      {p.sicht === 'eingang' && s.aufgaben[m.id]
                        ? <span className="problem">{s.aufgaben[m.id]}</span>
                        : m.passt === false && <span className="problem">{p.typ ? t('ablage.ablage.passt-nicht-zur-definition') : m.problem}</span>}
                    </Link>
                    {/* Favorit = Abo (#422): je Favorit „bei Änderungen benachrichtigen“ – nur in der Favoritenliste. */}
                    {(p.sicht === 'favoriten' || !!d.sicht(p.sicht)?.bedingungen.some((x) => x.art === 'favorit')) && !m.verborgen && favoritenBenachrichtigung && (
                      <label className="haken klein abo-schalter">
                        <input type="checkbox" checked={!s.stumm.has(m.id)} onChange={(e) => {
                          const an = e.target.checked; s.setzeStumm(m.id, !an);
                          void api.favoritBenachrichtigen(m.id, an).catch(() => s.setzeStumm(m.id, an));
                        }} /><span>{t('ablage.ablage.bei-aenderungen-benachrichtigen')}</span>
                      </label>
                    )}
                  </li>
                );
              })}
              {nachladen && <li ref={(el) => { ende.current = el; }} className="nachladen leise klein">{nachladen}</li>}
            </ul>}
      </div>
    </>
  );
}

/** Favorit = Abo (#422): Punkt vor geänderten Favoriten und eigenen Mappen – wie „ungelesen“ im E-Mail-Programm. */
function GeaendertPunkt() {
  return <><span className="abo-punkt" title={t('ablage.ablage.von-anderen-geaendert-seit')} aria-hidden="true" /><span className="sr">{t('ablage.ablage.geaendert-2')}{' '}</span></>;
}

/** Eingehende Post ohne „von“ (#494; bis #1042 „Absender“). */
const absenderFehlt = (typ: Mappentyp | undefined, m: Mappe) => typ?.system === 'post' && !m.werte.von && auswahlText(m.werte.richtung) === POST_RICHTUNG.eingehend;

/** Kompakter Eintrag: mit Trefferliste Spalte 1 fett, 2 und 3 darunter; sonst Titel und zwei Nebenfelder (bzw. der Typ). */
function kompakt(liste: string[], einTyp: boolean, typ: Mappentyp | undefined, m: Mappe, bezuege: Bezuege, person: (id: string | null) => string) {
  if (liste.length) {
    const [a, ...rest] = liste.slice(0, 3).map((k) => zelle(k, m, typ, bezuege, person));
    // Post ohne „von“ (#494): Hinweis zum Ergänzen beim Zuordnen, auch wenn die Spalte nicht unter den ersten drei ist.
    if (absenderFehlt(typ, m) && liste.includes('von')) rest.push(t('ablage.ablage.absender-fehlt'));
    return { titel: a || titelOder(m.titel), unter: rest.filter(Boolean).join(' · ') };
  }
  return { titel: titelOder(m.titel), unter: einTyp ? (typ ? unterzeile(typ, m, bezuege) : '') : typ ? typName(typ) : '' };
}

function Tabelle(p: {
  sicht: string; anhang?: string; typ?: Mappentyp; spaltenTyp?: Mappentyp; spalten: string[]; mappen: Mappe[]; bezuege: Bezuege; ausschnitte?: Record<string, Ausschnitt>; aufgaben?: Record<string, string>; favoriten: Set<string>; geaendert?: Set<string>; offen?: string;
  sortierung: Sortierung | null; sortiere(spalte: string): void; ende?: (el: HTMLElement | null) => void; nachladen: ReactNode;
  wahl?: Auswahl;
}) {
  const d = useDaten();
  const geladen = p.mappen.filter((m) => !m.verborgen);
  const alleGeladen = !!p.wahl && geladen.length > 0 && geladen.every((m) => p.wahl!.gewaehlt.has(m.id));
  const einige = !!p.wahl && !alleGeladen && geladen.some((m) => p.wahl!.gewaehlt.has(m.id));
  const aktiv = p.sortierung ?? { spalte: '_titel', absteigend: false };
  const rechts = (k: string) => rechtsbuendig(p.spaltenTyp?.felder.find((x) => x.key === k)?.typ);
  // Datum, Ja/Nein und Zeitstempel nicht umbrechen; Texte dürfen umbrechen, damit die Tabelle in die Liste passt.
  const kurz = (k: string) => { const f = p.spaltenTyp?.felder.find((x) => x.key === k); return k === '_erstellt' || k === '_geaendert' || f?.typ === 'datum' || f?.typ === 'janein'; };
  return (
    <div className="trefferliste">
      <table>
        <thead>
          <tr>
            {p.wahl && <th className="hakenspalte"><input type="checkbox" className="wahlhaken" aria-label={t('ablage.ablage.alle-geladenen-auswaehlen')} checked={alleGeladen}
              ref={(el) => { if (el) el.indeterminate = einige; }} onChange={(e) => p.wahl!.setze(e.target.checked ? [...new Set([...p.wahl!.gewaehlt, ...geladen.map((m) => m.id)])] : [], false)} /></th>}
            <th className="sternspalte"><span className="sr">{t('ablage.ablage.favorit')}</span></th>
            {p.spalten.map((k) => {
              const kann = sortierbar(k, p.typ);
              const an = aktiv.spalte === k;
              return (
                <th key={k} className={rechts(k) ? 'rechts' : ''} aria-sort={an ? (aktiv.absteigend ? 'descending' : 'ascending') : undefined}>
                  {kann
                    ? <button type="button" className="spaltenknopf" onClick={() => p.sortiere(k)} title={t('ablage.ablage.nach-sortieren', { spaltenName: spaltenName(k, p.spaltenTyp) })}>
                        {spaltenName(k, p.spaltenTyp)}<span className="pfeil" aria-hidden="true">{an ? (aktiv.absteigend ? '↓' : '↑') : '↕'}</span>
                      </button>
                    : spaltenName(k, p.spaltenTyp)}
                </th>
              );
            })}
            {p.sicht === 'eingang' && <th>{t('ablage.ablage.aufgabe')}</th>}
          </tr>
        </thead>
        <tbody>
          {p.mappen.map((m, i) => {
            const typ = d.typ(m.typId);
            const ziel = `/ablage/${p.sicht}/${m.id}${p.anhang ?? ''}`;
            return (
              <tr key={m.id} className={`${p.offen === m.id ? 'an' : ''} ${m.passt === false ? 'unpassend' : ''}${p.wahl?.gewaehlt.has(m.id) ? ' gewaehlt' : ''}${p.geaendert?.has(m.id) ? ' abo-geaendert' : ''}`} {...(p.wahl && !m.verborgen ? p.wahl.druck(i) : {})}
                onClick={(e) => { if (!(e.target as HTMLElement).closest('a, button, input')) geheZu(ziel); }}>
                {p.wahl && <td className="hakenspalte">{!m.verborgen && <Wahlhaken an={p.wahl.gewaehlt.has(m.id)} titel={titelOder(m.titel)} waehle={(an, bereich) => p.wahl!.waehle(i, an, bereich)} />}</td>}
                <td className="sternspalte"><Stern mappeId={m.id} an={p.favoriten.has(m.id)} titel={titelOder(m.titel)} klein /></td>
                {p.spalten.map((k, i) => {
                  const text = zelle(k, m, typ, p.bezuege, d.person);
                  // Post ohne Absender (#494): „–“ als Hinweis zum Ergänzen beim Zuordnen.
                  const fehlt = i > 0 && k === 'von' && absenderFehlt(typ, m);
                  return <td key={k} className={rechts(k) ? 'rechts' : kurz(k) ? 'kurz' : ''}>{i === 0 ? <>{p.geaendert?.has(m.id) && <GeaendertPunkt />}<Link to={ziel}><Ehemalig id={m.id}>{text || titelOder(m.titel)}</Ehemalig></Link>{p.ausschnitte?.[m.id] && <Fundstelle a={p.ausschnitte[m.id]} />}</> : fehlt ? <span className="leise" title={t('ablage.ablage.absender-fehlt-trag-ihn')}>–</span> : text}</td>;
                })}
                {p.sicht === 'eingang' && <td className="problemzelle">{p.aufgaben?.[m.id] ?? m.problem}</td>}
              </tr>
            );
          })}
          {p.nachladen && <tr ref={p.ende} className="nachladen"><td colSpan={p.spalten.length + 1 + (p.wahl ? 1 : 0) + (p.sicht === 'eingang' ? 1 : 0)} className="leise klein">{p.nachladen}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

const Unter = ({ text }: { text: string }) => (text ? <span className="unter">{text}</span> : null);

/* ---------- Auswahl mehrerer Mappen (#149) ---------- */

type Auswahl = ReturnType<typeof useAuswahl>;

/**
 * Auswahl in einer Liste: Haken je Zeile, Bereich mit Shift, „Alle Treffer“ über Seiten hinweg.
 * Am Handy wählt langes Drücken; solange etwas gewählt ist, schaltet Tippen um. Neue Sicht oder Suche → leer.
 */
function useAuswahl(mappen: Mappe[], gesamt: number | null, abhaengig: unknown[]) {
  const [gewaehlt, setGewaehlt] = useState<Set<string>>(new Set());
  const [alle, setAlle] = useState(false);
  const anker = useRef<number | null>(null);
  const lang = useRef<{ t?: number; ausgeloest?: boolean }>({});
  const schluessel = JSON.stringify(abhaengig);
  useEffect(() => { setGewaehlt(new Set()); setAlle(false); anker.current = null; }, [schluessel]);
  const waehle = (i: number, an: boolean, bereich: boolean) => {
    const von = bereich && anker.current !== null ? Math.min(anker.current, i) : i;
    const bis = bereich && anker.current !== null ? Math.max(anker.current, i) : i;
    setGewaehlt((x) => {
      const n = new Set(x);
      for (let j = von; j <= bis; j++) { const m = mappen[j]; if (m && !m.verborgen) { if (an) n.add(m.id); else n.delete(m.id); } }
      return n;
    });
    anker.current = i;
    setAlle(false);
  };
  const setze = (ids: string[], alleTreffer: boolean) => { setGewaehlt(new Set(ids)); setAlle(alleTreffer && ids.length >= (gesamt ?? 0)); };
  const leeren = () => { setGewaehlt(new Set()); setAlle(false); anker.current = null; };
  /** Langes Drücken (Handy) wählt; mit Auswahl schaltet Tippen um statt die Mappe zu öffnen. */
  const druck = (i: number) => ({
    onTouchStart: () => {
      window.clearTimeout(lang.current.t);
      lang.current = { t: window.setTimeout(() => { lang.current.ausgeloest = true; const m = mappen[i]; if (m) waehle(i, !gewaehlt.has(m.id), false); navigator.vibrate?.(20); }, 500) };
    },
    onTouchMove: () => window.clearTimeout(lang.current.t),
    onTouchEnd: () => window.clearTimeout(lang.current.t),
    onClickCapture: (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest('input, button')) return;
      const beruehrung = window.matchMedia?.('(pointer: coarse)').matches;
      if (lang.current.ausgeloest || (beruehrung && gewaehlt.size > 0)) {
        e.preventDefault(); e.stopPropagation();
        if (!lang.current.ausgeloest) { const m = mappen[i]; if (m) waehle(i, !gewaehlt.has(m.id), false); }
        lang.current.ausgeloest = false;
      }
    },
    onContextMenu: (e: React.MouseEvent) => { if (lang.current.ausgeloest) e.preventDefault(); },
  });
  return { gewaehlt, alle, waehle, setze, leeren, druck };
}

function Wahlhaken({ an, titel, waehle }: { an: boolean; titel: string; waehle(an: boolean, bereich: boolean): void }) {
  // onClick statt onChange: nur dort gibt es die Shift-Taste.
  return <input type="checkbox" className="wahlhaken" checked={an} aria-label={t('ablage.ablage.auswaehlen', { titel })}
    onClick={(e) => waehle((e.target as HTMLInputElement).checked, e.shiftKey)} onChange={() => {}} />;
}

/** Fundstelle im Volltext (#45): Dokumentname und Ausschnitt, Treffer hervorgehoben (ohne HTML vom Server). */
function Fundstelle({ a }: { a: Ausschnitt }) {
  const d = useDaten();
  const teile = a.text.split(TREFFER_ANFANG).flatMap((text, i) => {
    if (i === 0) return [<span key={`t${i}`}>{text}</span>];
    const [treffer, rest = ''] = text.split(TREFFER_ENDE);
    return [<mark key={`m${i}`}>{treffer}</mark>, <span key={`r${i}`}>{rest}</span>];
  });
  // Teile (#1031): „gefunden in Rechnungsposition „3. Bohrmaschine““ – ggf. mit dem Dokument des Teils.
  if (a.teil) {
    const teiltyp = d.typ(a.teil.typId);
    const wo = t('ablage.teile.gefunden-in', { typ: teiltyp ? typName(teiltyp) : '…', titel: titelOder(a.teil.titel) });
    return <span className="fundstelle"><span className="dok">{a.dokument ? `${wo} · ${a.dokument}:` : wo}</span>{a.text ? <> {teile}</> : null}</span>;
  }
  return <span className="fundstelle"><span className="dok" title={t('ablage.ablage.fundstelle-im-dokument')}>{a.dokument}:</span> {teile}</span>;
}

/**
 * Teile (#1031) haben keine eigene Ansicht: Wer über einen direkten Link bei einem Teil landet, sieht in der Mitte statt
 * aller Teile, wo sie stehen – an ihrer übergeordneten Mappe.
 */
function TeilListe({ typ }: { typ: Mappentyp }) {
  const d = useDaten();
  const eltern = d.typ(uebergeordneterTyp(typ));
  return (
    <>
      <Listenkopf titel={typName(typ)} hilfe="ablage.sicht" beschreibung={typBeschreibung(typ)} />
      <div className="leer"><p>{t('ablage.teile.keine-ansicht', { name: typName(typ), eltern: eltern ? typName(eltern) : '…' })}</p>
        {eltern && <p><Link to={`/ablage/${eltern.id}`} className="verweis">{t('ablage.teile.zu-den-uebergeordneten', { eltern: typName(eltern) })}</Link></p>}</div>
    </>
  );
}

/**
 * Verwaltete Sichten als Baum (#38). Untersichten lassen sich zuklappen; gemerkt je Gerät
 * und Benutzer. Die Vorfahren der geöffneten Sicht bleiben immer offen.
 */
function SichtBaum({ aktiv, ohne = [] }: { aktiv?: string; ohne?: string[] }) {
  const d = useDaten();
  const { ich } = useKonto();
  const schluessel = `dms:sichten-zu:${ich.id}`;
  const [zu, setZu] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(schluessel) ?? '[]') as string[]); } catch { return new Set(); }
  });
  const umschalten = (id: string) => {
    const n = new Set(zu);
    if (n.has(id)) n.delete(id); else n.add(id);
    setZu(n);
    try { localStorage.setItem(schluessel, JSON.stringify([...n])); } catch { /* nur für diese Sitzung */ }
  };
  const vorfahren = new Set<string>();
  for (let s = d.sicht(aktiv); s?.elternId && !vorfahren.has(s.elternId); s = d.sicht(s.elternId)) vorfahren.add(s.elternId);

  const zeilen: Array<{ s: Sicht; tiefe: number; kinder: boolean; offen: boolean }> = [];
  const gehe = (eltern: string | null, tiefe: number) => {
    for (const s of kinderVon(d.sichten, eltern)) {
      if (ohne.includes(s.id)) continue;
      const kinder = kinderVon(d.sichten, s.id).length > 0;
      const offen = kinder && (!zu.has(s.id) || vorfahren.has(s.id));
      zeilen.push({ s, tiefe, kinder, offen });
      if (offen) gehe(s.id, tiefe + 1);
    }
  };
  gehe(null, 0);

  return (
    <>
      {zeilen.map(({ s, tiefe, kinder, offen }) => {
        const n = d.zaehler.sichten?.[s.id];
        const unter = kinder ? mitNachkommen(d.sichten, s.id).length - 1 : 0;
        return (
          <div key={s.id} className="sichtzeile" style={{ '--tiefe': tiefe } as React.CSSProperties}>
            {kinder
              ? <button type="button" className="aufklapper" aria-expanded={offen} title={offen ? t('ablage.ablage.unteransichten-zuklappen') : t('ablage.ablage.unteransichten-aufklappen', { anzahl: unter })}
                  onClick={() => umschalten(s.id)}><span aria-hidden="true">{offen ? '▾' : '▸'}</span><span className="sr">{sichtName(s)} {offen ? t('ablage.ablage.zuklappen') : t('ablage.ablage.aufklappen')}</span></button>
              : null}
            <Link to={`/ablage/${s.id}`} className={`sicht ${aktiv === s.id ? 'an' : ''}`} title={s.beschreibung || undefined}>
              <span className="nm">{s.symbol && <><AnsichtSymbol name={s.symbol} className="fest-sym" /> </>}{sichtName(s)}</span>{!d.zahlenDa ? <ZahlWarte /> : n !== undefined && <span className={s.id === d.zaehler.neuePost && n > 0 ? 'zaehler' : 'zahl'}>{zahl(n)}</span>}
            </Link>
          </div>
        );
      })}
    </>
  );
}
