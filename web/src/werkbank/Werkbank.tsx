import type { InstalliertesPaket } from '../../../shared/src/pakete';
import { SuchePanel } from './SucheEinstellungen';
import { useWoerter, WoerterListe, WoerterRechts } from './Woerter';
import { Symbol } from '../Symbol';
import { AnmeldeschutzPanel, useAnmeldeschutz } from './Anmeldeschutz';
import { RegionPanel, useRegion } from './Region';
import { OrganisationPanel, useNutzung, useOrganisation } from './Organisation';
import { SprachenPanel, useSprachen } from './Sprachen';
import { NummernkreisEditor, NummernkreiseListe, useNummernkreise } from './Nummernkreise';
import { StempelEditor, StempelListe, useStempelVorlagenWerkbank } from './Stempel';
import { DarfWegPanel, useDarfWeg } from './Archiv';
import { AutomatischVerkleinern } from './Verkleinern';
import { AuskuenfteListe, AuskunftRechts, LoeschkonzeptPanel, useDatenschutz } from './Datenschutz';
import { PaketeListe, PaketLink, PaketePanel, usePakete } from './Pakete';
import { useVollexport, VollexportPanel } from './Vollexport';
import { PostfachEditor, PostfaecherListe, usePostfaecher } from './Postfaecher';
import { EingangsordnerPanel, useEingangsordner } from './Eingangsordner';
import { useWebdav, WebdavPanel } from './Webdav';
import { AutomatisierungEditor, AutomatisierungenListe, automatisierungWarnungen, useAutomatisierungen } from './Automatisierungen';
import { AussenZiele } from './AutomatisierungAussen';
import { AblaufvorlageEditor, AblaufvorlagenListe, useAblaufvorlagen } from './Ablaufvorlagen';
import { useEffect, type ReactNode } from 'react';
import { useKonto } from '../konto';
import { Dreiteilung } from '../bereiche';
import { useDaten } from '../daten';
import { TypEditor } from '../einrichtung/Einrichtung';
import { geheZu, Link } from '../ort';
import { bereichName, hatMitte, wartungsPlakette, werkbankEbene, werkbankUmleitung, werkbankZurueck } from '../../../shared/src/werkbankansicht';
import { t, tn } from '../sprache';
import { BenutzerDetail, BenutzerListe, BenutzerNeu, SystemkontoDetail, useBenutzer } from './Benutzer';
import { BetriebPanel, useBetrieb } from './Betrieb';
import { SichtEditor, SichtenListe } from './Sichten';
import { DatenbankAbschnitte, useDatenbank } from './Datenbank';
import { ExterneDiensteAbschnitt, KiKostenAbschnitt, useExtern } from './ExterneDienste';
import { DemoPanel } from './Demo';
import { DesignEditor, DesignListe } from './Designs';
import { ProtokollDetail, ProtokollListe, useProtokoll } from './Protokoll';
import { TechnikPanel, useTechnik } from './Technik';
import { TresorPanel, useTresor } from './Verschluesselung';
import { AufgabenListe, AufgabenPanel, useAufgaben } from './Aufgaben';
import { AufgabenEmpfaengerBlock, useAufgabenEmpfaenger } from './AufgabenEmpfaenger';
import { TexterkennungPanel, useTexterkennung, WartungPanel } from './Texterkennung';
import { useHandbuch } from '../Hilfe';
import { Listenkopf } from '../Listenkopf';
import { AnsichtPanel, useWerkbankAnsicht, type BereichZustand } from './Ansicht';
import { UebersichtListe, UebersichtPanel, useUebersicht, WerkbankNavigation, type WerkbankEintrag } from './Uebersicht';
import { useWartungsmodus, WartungsmodusPanel } from './Wartungsmodus';
import { SicherungPanel, useSicherung } from './Sicherung';
import { WiederherstellungPanel } from './Wiederherstellung';
import { FehlermeldungDetail, FehlermeldungenListe, useFehlermeldungen } from './Fehlermeldungen';
import { AnbindungPanel, useAnbindung } from './Anbindung';
import { SpeicherplatzPanel, useSpeicherplatz } from './Speicherplatz';
import { AuslastungAbschnitt, ErweiterungenHinweis, useSystemlast } from './Auslastung';
import { PapierkorbDetail, PapierkorbListe, usePapierkorb } from '../ablage/Papierkorb';
import { filterAusAdresse } from '../../../shared/src/aufgabenfilter';
import { istOffen } from '../../../shared/src/auskunft';
import { useBeiWiederErreichbar } from '../erreichbar';
import { gebietsschema } from '../../../shared/src/sprache';
import { GeloeschteEintraege, Fundstellen, Hervorgehoben, KeineTreffer, KnopfLink, ListenSuche, PaketChip, PaketFilter, useListenSuche } from '../bausteine';
import { paketHerkunft, paketVonTyp, paketWahl, quellenTyp } from './listensuche';
import { uebergeordneterTyp } from '../../../shared/src/teile';
import { typName } from '../../../shared/src/beschriftung';

/**
 * Umgezogen (#717, #725): /werkbank/darfweg → aufbewahrung, /werkbank/suche → texterkennung#suche,
 * /werkbank/wiederherstellung → sicherung#wiederherstellen, /werkbank/technik → systemzustand#version,
 * /werkbank/wartungsmodus → wartung#wartungsmodus (`UMGEZOGEN` in werkbankansicht.ts).
 *
 * Werkbank im Verwaltungsmodus (#819), aufgebaut wie die Ablage. Leiste und Seiten nur für die eigenen Bereiche (#818);
 * der Server prüft dasselbe je Schnittstelle (verwaltungsbereiche.ts):
 *   Bereiche  →  Elemente des Bereichs  →  Bearbeitung
 *
 * /werkbank                        Übersicht: was zu tun ist (#68)
 * /werkbank/typen[/:id|/neu]
 * /werkbank/benutzer[/:id|/neu]
 * /werkbank/sichten[/:id|/neu]       Sichten der Ablage (#38)
 * /werkbank/demo
 * /werkbank/protokoll[/:nr]
 * /werkbank/designs[/:id|/neu]
 * /werkbank/betrieb                 E-Mail-Versand und Adresse des DMS (#37)
 * /werkbank/verschluesselung        Schlüssel für Passwörter (#39)
 * /werkbank/papierkorb[/:id]        Papierkorb aller Benutzer und Aufbewahrung (#43)
 * /werkbank/texterkennung           Suche und Volltext: Texterkennung, automatisch verkleinern, Suche (#45, #356, #725)
 * /werkbank/woerter[/:id|/neu[?kopie=:id]]  Gleichbedeutende Wörter (#992), dreiteilig
 * /werkbank/aufgaben[/:id][?filter] Aufgaben aller Benutzer mit Filter (#54, #366, #354; seit #725 „Aufgaben“)
 * /werkbank/wartung                 Wartung: Wartungsmodus und Wartungsoperationen, z. B. Volltext neu erzeugen (#45, #458, #725)
 * /werkbank/fehlermeldungen[/:id]  Fehlermeldungen der Benutzer (#70)
 * /werkbank/organisation          Eigene Organisation, oben die Nutzung (#995, #1170; früher /werkbank/nutzung, leitet um)
 * /werkbank/sicherung              Sicherung, Zeitplan, Probe, darunter Wiederherstellen (#103–#109, #725)
 * /werkbank/verschluesselung#notfallblatt  Notfallblatt (#106), seit #993 nur hier
 * /werkbank/verschluesselung#notfallkontakte  Notfallkontakte (#812) für „Wen fragen?“ auf dem Notfallblatt
 * /werkbank/anbindung[?offen=:id] Datenbank-Anbindung (#119), darunter lange Zugriffe, aufklappbar,
 *                                 und was gerade läuft (#407; früher /werkbank/datenbank, leitet weiter)
 * /werkbank/systemzustand         Systemzustand: Warnschwelle und Grenze, darunter Speicherplatz je Ordner
 *                                 (#115, #116; #408, früher /werkbank/speicherplatz, leitet weiter)
 * /werkbank/webdav                WebDAV-Laufwerk an/aus, Stand, letzte Zugriffe (#346, rechts seit #366)
 * /werkbank/automatisierungen[/:id|/neu|/ziele]  Automatisierungen Wenn – Und – Dann (#675), dreiteilig; Ziele nach außen (#671)
 * /werkbank/stempel[/:id|/neu]     Vorlagen für Stempel beim Weitergeben (#394), dreiteilig seit #990
 * /werkbank/auskuenfte[/:id|/neu][?mappe=]  Datenschutz-Auskünfte (#396, #668), dreiteilig;
 *                                  früher /werkbank/datenschutz (leitet um); /einstellungen leitet seit #1183 auf
 *                                  /werkbank/organisation#auskunft-vorgaben
 * /werkbank/loeschkonzept          Löschkonzept, Personendaten in Mappentypen, Löschprotokoll (#469, #470, #668)
 *
 * Die Mitte bekommt jede Sammlung, in der man etwas anlegt und bearbeitet (#366, seit #990 auch kleine; `hatMitte`);
 * alle anderen Bereiche sind zweiteilig: links die Bereiche, rechts die ganze Seite.
 */
export function Werkbank({ teile }: { teile: string[] }) {
  const d = useDaten();
  const handbuch = useHandbuch();
  const [, bereich = 'uebersicht', id] = teile;
  const { verwaltungsmodus } = useKonto();
  /** Verwaltungsrecht (#818): eigener Bereich? `bereiche: null` = Gesamte Verwaltung; die Übersicht hat jeder. */
  const darf = (pfad: string) => verwaltungsmodus.bereiche === null || pfad === 'uebersicht' || pfad === 'ansicht' || verwaltungsmodus.bereiche.includes(pfad);
  const benutzer = useBenutzer();
  const protokoll = useProtokoll(bereich === 'protokoll');
  const datenbank = useDatenbank(bereich === 'systemzustand');
  const externeDienste = useExtern(bereich === 'systemzustand');
  const technik = useTechnik(bereich === 'systemzustand');
  const betrieb = useBetrieb();
  const tresor = useTresor(darf('verschluesselung'));
  const papierkorb = usePapierkorb(true, bereich === 'papierkorb');
  // Pakete: Installation über einen Link (?installieren=…) steht rechts, auch ohne gewähltes Paket.
  const installieren = bereich === 'pakete' && !id ? new URLSearchParams(location.search).get('installieren') : null;
  const aufgabenFilter = filterAusAdresse(new URLSearchParams(location.search));
  const aufgaben = useAufgaben(bereich === 'aufgaben', !!aufgabenFilter.erledigt);
  const aufgabenEmpfaenger = useAufgabenEmpfaenger(bereich === 'benutzer');
  const ocr = useTexterkennung(bereich === 'texterkennung' || bereich === 'wartung');
  const woerter = useWoerter(bereich === 'woerter');
  const uebersicht = useUebersicht();
  const meldungen = useFehlermeldungen(bereich === 'fehlermeldungen');
  const wartungsmodus = useWartungsmodus(bereich === 'wartung');
  const sicherung = useSicherung(bereich === 'sicherung');
  const speicherplatz = useSpeicherplatz(bereich === 'systemzustand');
  const systemlast = useSystemlast(bereich === 'systemzustand');
  const eingang = useEingangsordner(bereich === 'eingangsordner');
  const webdav = useWebdav(bereich === 'webdav');
  const automatisierungen = useAutomatisierungen(bereich === 'automatisierungen');
  const ablaufvorlagen = useAblaufvorlagen(bereich === 'ablaufvorlagen');
  const postfaecher = usePostfaecher(bereich === 'postfaecher');
  const nummernkreise = useNummernkreise(bereich === 'nummernkreise');
  const stempel = useStempelVorlagenWerkbank(bereich === 'stempel');
  const darfWeg = useDarfWeg(bereich === 'aufbewahrung');
  // Vorgaben der Auskünfte stehen seit #1183 auf „Eigene Organisation“ – dort nur mit Recht auf die Datenschutz-Bereiche.
  const datenschutzRecht = darf('auskuenfte') || darf('loeschkonzept');
  const datenschutz = useDatenschutz(bereich === 'auskuenfte' || bereich === 'loeschkonzept' || (bereich === 'organisation' && datenschutzRecht));
  const vollexport = useVollexport(bereich === 'vollexport');
  // Herkunft und Paketfilter (#978) in Mappentypen, Ansichten und Nummernkreisen – nur mit Recht auf die Pakete (#818),
  // sonst gilt die Kennung des Typs (`typ.paket`).
  const pakete = usePakete(bereich === 'pakete' || (['typen', 'sichten', 'nummernkreise', 'automatisierungen', 'ablaufvorlagen'].includes(bereich) && darf('pakete')));
  const anmeldeschutz = useAnmeldeschutz(bereich === 'anmeldeschutz');
  const region = useRegion(bereich === 'region');
  const nutzung = useNutzung(bereich === 'organisation');
  const organisation = useOrganisation(bereich === 'organisation');
  const sprachen = useSprachen(bereich === 'sprachen');
  const anbindung = useAnbindung(bereich === 'anbindung');
  const ansicht = useWerkbankAnsicht();
  // Zahlen links (#375): die des geladenen Bereichs, sonst die aus der Übersicht; nur > 0 anzeigen.
  const uz = uebersicht.stand?.zahlen;
  const zahl = (geladen: number | null | undefined, ersatz: number | null | undefined) => (geladen ?? ersatz) || undefined;
  // Wieder erreichbar nach Update oder Neustart (#122): Übersicht und offenen Bereich neu laden.
  useBeiWiederErreichbar(() => {
    void uebersicht.laden();
    const offen: Record<string, (() => Promise<unknown>) | undefined> = {
      protokoll: protokoll.neu, betrieb: betrieb.laden,
      verschluesselung: tresor.laden, papierkorb: papierkorb.laden, aufgaben: aufgaben.laden, texterkennung: ocr.laden, woerter: woerter.laden,
      wartung: async () => { await ocr.laden(); await wartungsmodus.laden(); }, fehlermeldungen: meldungen.laden, sicherung: sicherung.laden,
      systemzustand: async () => { await speicherplatz.laden(); await systemlast.laden(); await technik.laden(); await datenbank.laden(); }, anbindung: anbindung.laden, benutzer: benutzer.laden, webdav: webdav.laden, automatisierungen: automatisierungen.laden, ablaufvorlagen: ablaufvorlagen.laden,
      auskuenfte: datenschutz.laden, loeschkonzept: datenschutz.laden,
    };
    void offen[bereich]?.();
  });
  // Anmeldungen und Aktivität ändern sich laufend: beim Öffnen der Benutzer neu laden.
  useEffect(() => { if (bereich === 'benutzer') void benutzer.laden(); }, [bereich, id]); // eslint-disable-line react-hooks/exhaustive-deps -- neu laden nur beim Wechsel von Bereich oder Eintrag
  // Alte Direktlinks (#366): in Bereiche ohne Mitte → Seite, Eintrag aufgeklappt; /werkbank/stempel?offen=:id → /werkbank/stempel/:id (#990);
  // umgezogene Bereiche (#407: /werkbank/datenbank → /werkbank/anbindung) an die neue Stelle.
  const umleitung = werkbankUmleitung(bereich, id, location.search);
  useEffect(() => { if (umleitung) geheZu(umleitung, true); }, [umleitung]);
  // Sprungmarke (#725): Zusammengelegte Bereiche stehen als Abschnitt auf einer Seite (z. B. /werkbank/wartung#wartungsmodus).
  // Der Abschnitt erscheint oft erst nach dem Laden – kurz danach suchen.
  const marke = location.hash.slice(1);
  useEffect(() => {
    if (!marke) return;
    let n = 0;
    const iv = setInterval(() => {
      const el = document.getElementById(marke);
      if (el) { el.scrollIntoView({ block: 'start' }); clearInterval(iv); } else if (++n > 30) clearInterval(iv);
    }, 150);
    return () => clearInterval(iv);
  }, [bereich, marke]);
  // Hintergrundarbeit ruht nur im aktiven Wartungsmodus (#366: Hinweis bei Texterkennung und Volltext).
  const wartungAn = wartungsPlakette(wartungsmodus.stand?.stufe ?? 'aus', wartungsmodus.stand?.aktivAb ?? null) === 'an';

  let liste: ReactNode = null;
  let rechts: ReactNode = <div className="platzhalter"><p>{t('werkbank.werkbank.waehle-in-der-liste')}</p></div>;

  if (bereich === 'uebersicht') {
    liste = <UebersichtListe u={uebersicht} />;
    rechts = <UebersichtPanel u={uebersicht} />;
  } else if (bereich === 'fehlermeldungen') {
    liste = <FehlermeldungenListe z={meldungen} offen={id} />;
    rechts = id ? <FehlermeldungDetail key={id} id={id} z={meldungen} neuLaden={async () => { await meldungen.laden(); await uebersicht.laden(); }} /> : <div className="platzhalter"><p>{t('werkbank.werkbank.waehle-links-eine-meldung')}</p></div>;
  } else if (bereich === 'typen') {
    liste = <TypenListe offen={id} pakete={pakete.stand?.installiert ?? []} />;
    if (id === 'neu') {
      // Mappentyp kopieren (#147): /werkbank/typen/neu?kopie=<id>
      const kopie = new URLSearchParams(location.search).get('kopie');
      const vorlage = kopie ? d.typ(kopie) : undefined;
      rechts = <TypEditor key={`neu-${vorlage?.id ?? ''}`} vorlage={vorlage && !vorlage.system ? vorlage : undefined} />;
    }
    else if (id) {
      const eintrag = d.typ(id);
      rechts = eintrag ? <TypEditor key={eintrag.id} typ={eintrag} /> : <div className="leer"><p>{t('werkbank.werkbank.diesen-mappentyp-gibt-es')}</p></div>;
    } else if (!d.typen.length) {
      rechts = <div className="platzhalter"><p>{tn('werkbank.werkbank.noch-keine-mappentypen-lege', { link: <Link to="/werkbank/demo" className="verweis">{t('werkbank.werkbank.demo-daten')}</Link> })}</p></div>;
    }
  } else if (bereich === 'sichten') {
    liste = <SichtenListe offen={id} pakete={pakete.stand?.installiert ?? []} />;
    rechts = id ? <SichtEditor key={`${id}-${d.sicht(id)?.geaendert ?? ''}`} id={id} /> : <div className="platzhalter"><p>{t('werkbank.werkbank.waehle-links-eine-ansicht')}</p></div>;
  } else if (bereich === 'benutzer') {
    liste = <BenutzerListe liste={benutzer.liste} offen={id} alltag={aufgabenEmpfaenger.stand?.benutzerId ?? null} />;
    // Ohne Auswahl (#719): wer im Alltag die Aufgaben ohne Empfänger bekommt.
    if (!id) rechts = <AufgabenEmpfaengerBlock z={aufgabenEmpfaenger} benutzer={benutzer.liste} />;
    else if (id === 'neu') rechts = <BenutzerNeu key="neu" neuLaden={benutzer.laden} />;
    else if (id?.startsWith('konto-')) rechts = <SystemkontoDetail key={id} id={id.slice(6)} />;
    else if (id) {
      const b = benutzer.liste.find((x) => x.id === id);
      rechts = b ? <BenutzerDetail key={b.id} b={b} neuLaden={benutzer.laden} /> : benutzer.geladen ? <div className="leer"><p>{t('werkbank.werkbank.diesen-benutzer-gibt-es')}</p></div> : <p className="leise">{t('werkbank.werkbank.lade')}</p>;
    }
  } else if (bereich === 'demo') {
    rechts = <DemoPanel />;
  } else if (bereich === 'designs') {
    liste = <DesignListe offen={id} />;
    rechts = id ? <DesignEditor key={id} id={id} /> : <div className="platzhalter"><p>{t('werkbank.werkbank.waehle-ein-design-zum')}</p></div>;
  } else if (bereich === 'betrieb') {
    rechts = <BetriebPanel b={betrieb} />;
  } else if (bereich === 'aufgaben') {
    liste = <AufgabenListe z={aufgaben} filter={aufgabenFilter} offen={id} />;
    rechts = <AufgabenPanel z={aufgaben} id={id} />;
  } else if (bereich === 'texterkennung') {
    // Suche und Volltext (#725): Texterkennung, automatisch verkleinern, Tippfehler und gleichbedeutende Wörter.
    rechts = <><TexterkennungPanel t={ocr} wartungAn={wartungAn} /><div className="einspaltig"><AutomatischVerkleinern /></div><SuchePanel abschnitt /></>;
  } else if (bereich === 'woerter') {
    // Gleichbedeutende Wörter (#992): Gruppen in der Mitte, rechts die Wörter einer Gruppe.
    liste = <WoerterListe z={woerter} offen={id} />;
    rechts = <WoerterRechts z={woerter} id={id} />;
  } else if (bereich === 'wartung') {
    // Wartung (#725): Wartungsmodus und Wartungsoperationen auf einer Seite.
    rechts = <><WartungsmodusPanel w={wartungsmodus} /><WartungPanel t={ocr} wartungAn={wartungAn} abschnitt /></>;
  } else if (bereich === 'sicherung') {
    // Sicherung mit Wiederherstellen als Abschnitt (#725).
    rechts = <><SicherungPanel z={sicherung} /><WiederherstellungPanel abschnitt /></>;
  } else if (bereich === 'anbindung') {
    rechts = <AnbindungPanel z={anbindung} nachAenderung={() => void uebersicht.laden()} />;
  } else if (bereich === 'region') {
    rechts = <RegionPanel z={region} />;
  } else if (bereich === 'organisation') {
    // Nutzung und Eigene Organisation auf einer Seite (#1170).
    rechts = <OrganisationPanel z={organisation} nutzung={nutzung} datenschutz={datenschutzRecht ? datenschutz : null} />;
  } else if (bereich === 'sprachen') {
    rechts = <SprachenPanel z={sprachen} />;
  } else if (bereich === 'anmeldeschutz') {
    rechts = <AnmeldeschutzPanel z={anmeldeschutz} />;
  } else if (bereich === 'pakete') {
    liste = <PaketeListe z={pakete} offen={id} />;
    rechts = installieren ? <PaketLink key={installieren} z={pakete} wert={installieren} /> : <PaketePanel z={pakete} id={id} />;
  } else if (bereich === 'vollexport') {
    rechts = <VollexportPanel z={vollexport} />;
  } else if (bereich === 'aufbewahrung') {
    rechts = <DarfWegPanel z={darfWeg} />;
  } else if (bereich === 'auskuenfte') {
    // Datenschutz-Auskünfte (#668): Liste in der Mitte, rechts Auskunft, Assistent („neu“) oder Einstellungen.
    liste = <AuskuenfteListe z={datenschutz} offen={id} />;
    rechts = <AuskunftRechts z={datenschutz} id={id} />;
  } else if (bereich === 'loeschkonzept') {
    rechts = <LoeschkonzeptPanel z={datenschutz} />;
  } else if (bereich === 'nummernkreise') {
    liste = <NummernkreiseListe z={nummernkreise} offen={id} pakete={pakete.stand?.installiert ?? []} />;
    rechts = id ? <NummernkreisEditor key={`${id}-${nummernkreise.liste ? 1 : 0}`} z={nummernkreise} schluessel={id} /> : <div className="platzhalter"><p>{t('werkbank.werkbank.waehle-links-einen-nummernkreis')}</p></div>;
  } else if (bereich === 'automatisierungen') {
    liste = <AutomatisierungenListe z={automatisierungen} offen={id} pakete={pakete.stand?.installiert ?? []} />;
    // Ziele nach außen (#671): eigene Seite rechts, neben der Liste.
    rechts = id === 'ziele' ? <AussenZiele nachher={() => void automatisierungen.laden()} />
      : id ? <AutomatisierungEditor key={`${id}-${automatisierungen.stand ? 1 : 0}`} z={automatisierungen} id={id} /> : <div className="platzhalter"><p>{t('automatisierung.ui.waehlen')}</p></div>;
  } else if (bereich === 'ablaufvorlagen') {
    // Automatisierungsvorlagen (#1044): dreiteilig wie die Automatisierungen.
    const kennung = id ? decodeURIComponent(id) : undefined;
    liste = <AblaufvorlagenListe z={ablaufvorlagen} offen={kennung} pakete={pakete.stand?.installiert ?? []} />;
    rechts = kennung ? <AblaufvorlageEditor key={`${kennung}-${ablaufvorlagen.stand ? 1 : 0}`} z={ablaufvorlagen} kennung={kennung} /> : <div className="platzhalter"><p>{t('automatisierung.vorlage.ui.waehlen')}</p></div>;
  } else if (bereich === 'stempel') {
    // Dreiteilig seit #990: Vorlagen in der Mitte, rechts die gewählte mit Live-Vorschau (#799).
    liste = <StempelListe z={stempel} offen={id} />;
    rechts = id ? <StempelEditor key={`${id}-${stempel.liste ? 1 : 0}`} z={stempel} id={id} /> : <div className="platzhalter"><p>{t('werkbank.stempel.waehle')}</p></div>;
  } else if (bereich === 'postfaecher') {
    liste = <PostfaecherListe z={postfaecher} offen={id} />;
    rechts = id ? <PostfachEditor key={`${id}-${postfaecher.liste ? 1 : 0}`} z={postfaecher} id={id} /> : <div className="platzhalter"><p>{t('werkbank.werkbank.waehle-links-ein-postfach')}</p></div>;
  } else if (bereich === 'eingangsordner') {
    rechts = <EingangsordnerPanel z={eingang} />;
  } else if (bereich === 'webdav') {
    rechts = <WebdavPanel z={webdav} />;
  } else if (bereich === 'systemzustand') {
    // Systemzustand (#725) nimmt Version und Updates (früher „Technik“) und die Auslastung der Datenbank auf.
    rechts = <SpeicherplatzPanel z={speicherplatz} nachAenderung={() => { void uebersicht.laden(); void wartungsmodus.laden(); }} auslastung={<><ErweiterungenHinweis liste={systemlast.stand?.erweiterungen} /><AuslastungAbschnitt z={systemlast} /></>}
      unten={<><div id="datenbank"><DatenbankAbschnitte z={datenbank} offen={new URLSearchParams(location.search).get('offen') ?? undefined} /></div>
        {/* Externe Dienste und KI-Kosten (#565). */}
        <ExterneDiensteAbschnitt z={externeDienste} /><KiKostenAbschnitt sichtbar nachAenderung={() => void externeDienste.laden()} /><TechnikPanel t={technik} abschnitt /></>} />;
  } else if (bereich === 'papierkorb') {
    liste = <PapierkorbListe z={papierkorb} werkbank offen={id} />;
    rechts = id ? <PapierkorbDetail key={id} id={id} werkbank /> : <div className="platzhalter"><p>{t('werkbank.werkbank.waehle-links-eine-geloeschte')}</p></div>;
  } else if (bereich === 'verschluesselung') {
    rechts = <TresorPanel t={tresor} />;
  } else if (bereich === 'protokoll') {
    liste = <ProtokollListe p={protokoll} offen={id} />;
    rechts = <ProtokollDetail p={protokoll} nr={id} />;
  }

  // Reihenfolge und Gruppen wie in BEREICHE (#354); Namen aus der Sprachdatei (#473).
  const n = bereichName;
  const eintraege: WerkbankEintrag[] = [
    { pfad: 'uebersicht', name: n('uebersicht'), gruppe: null, warn: uebersicht.hinweise || undefined },
    // Ablage aufbauen (#717)
    { pfad: 'pakete', name: n('pakete'), gruppe: 'ablage', zahl: zahl(pakete.stand?.installiert.length, uz?.pakete) },
    { pfad: 'typen', name: n('typen'), gruppe: 'ablage', zahl: d.typen.length },
    { pfad: 'sichten', name: n('sichten'), gruppe: 'ablage', zahl: d.sichten.length || undefined },
    { pfad: 'nummernkreise', name: n('nummernkreise'), gruppe: 'ablage', zahl: zahl(nummernkreise.liste?.length, uz?.nummernkreise) },
    { pfad: 'automatisierungen', name: n('automatisierungen'), gruppe: 'ablage', zahl: automatisierungen.stand?.automatisierungen.length || undefined,
      warn: automatisierungWarnungen(automatisierungen.stand) || uebersicht.stand?.automatisierungen?.angehalten.length ? '!' : undefined, warnTitel: t('automatisierung.ui.leiste') },
    { pfad: 'ablaufvorlagen', name: n('ablaufvorlagen'), gruppe: 'ablage', zahl: ablaufvorlagen.stand?.vorlagen.length || undefined,
      warn: (ablaufvorlagen.stand?.angehalten.length ?? uebersicht.stand?.ablaeufe?.angehalten.length) ? '!' : undefined, warnTitel: t('automatisierung.vorlage.ui.leiste') },
    // Benutzer und Sicherheit
    { pfad: 'benutzer', name: n('benutzer'), gruppe: 'benutzer', zahl: zahl(benutzer.geladen ? benutzer.liste.filter((b) => b.aktiv).length : undefined, uz?.benutzer) },
    { pfad: 'verschluesselung', name: n('verschluesselung'), gruppe: 'benutzer', warn: tresor.stand && tresor.stand.zustand !== 'vorhanden' ? t('werkbank.leiste.fehlt') : undefined },
    { pfad: 'auskuenfte', name: n('auskuenfte'), gruppe: 'benutzer', zahl: datenschutz.stand?.verzeichnis.filter((e) => istOffen(e.zustand)).length || undefined },
    { pfad: 'loeschkonzept', name: n('loeschkonzept'), gruppe: 'benutzer', warn: datenschutz.stand?.loeschkonzept?.luecken.length ? '!' : undefined, warnTitel: t('werkbank.loeschkonzept.personendaten') },
    ...(d.typen.some((x) => x.archiv) ? [{ pfad: 'aufbewahrung', name: n('aufbewahrung'), gruppe: 'benutzer' as const, zahl: zahl(darfWeg.liste?.length, uz?.darfWeg) }] : []),
    { pfad: 'stempel', name: n('stempel'), gruppe: 'benutzer', zahl: stempel.liste?.length || undefined },
    // Post und Eingänge
    { pfad: 'postfaecher', name: n('postfaecher'), gruppe: 'post', zahl: zahl(postfaecher.liste?.length, uz?.postfaecher), warn: uebersicht.stand?.postfachAnmeldung?.length || postfaecher.liste?.some((p) => p.stand.fehlerFolge > 0 || (p.oauth && p.oauth.zustand !== 'ok')) ? '!' : undefined, warnTitel: uebersicht.stand?.postfachAnmeldung?.length ? t('werkbank.leiste.postfach.anmeldung') : t('werkbank.leiste.postfach.abruf') },
    ...(eingang.stand?.vorhanden ? [{ pfad: 'eingangsordner', name: n('eingangsordner'), gruppe: 'post' as const, warn: eingang.stand.fehler?.length ? String(eingang.stand.fehler.length) : undefined, warnTitel: t('werkbank.leiste.eingangsordner') }] : []),
    { pfad: 'webdav', name: n('webdav'), gruppe: 'post', warn: webdav.stand?.einstellung.aktiv ? t('werkbank.leiste.an') : undefined, warnTitel: t('werkbank.leiste.webdav') },
    { pfad: 'texterkennung', name: n('texterkennung'), gruppe: 'post', warn: uebersicht.stand?.texterkennung?.fehler ? String(uebersicht.stand.texterkennung.fehler) : undefined, warnTitel: t('werkbank.leiste.texterkennung') },
    { pfad: 'woerter', name: n('woerter'), gruppe: 'post', zahl: woerter.gruppen?.length || undefined },
    // Daten sichern
    { pfad: 'sicherung', name: n('sicherung'), gruppe: 'sichern', warn: uebersicht.stand?.sicherung && (uebersicht.stand.sicherung.fehler || (uebersicht.stand.sicherung.schluessel && uebersicht.stand.sicherung.zuAlt)) ? '!' : undefined, warnTitel: t('werkbank.leiste.sicherung') },
    { pfad: 'vollexport', name: n('vollexport'), gruppe: 'sichern' },
    { pfad: 'papierkorb', name: n('papierkorb'), gruppe: 'sichern', zahl: zahl(papierkorb.eintraege ? papierkorb.eintraege.length + papierkorb.dokumente.length : undefined, uebersicht.stand?.papierkorb.anzahl) },
    // Einstellungen
    { pfad: 'betrieb', name: n('betrieb'), gruppe: 'einstellungen', warn: uebersicht.stand && !uebersicht.stand.mail ? t('werkbank.leiste.aus') : undefined, warnTitel: t('werkbank.leiste.mail') },
    { pfad: 'region', name: n('region'), gruppe: 'einstellungen' },
    { pfad: 'sprachen', name: n('sprachen'), gruppe: 'einstellungen' },
    // Eigene Organisation (#995) mit der Nutzung (#1170): Notizen an die Verwaltung (Merkmal oder Verantwortliche geändert).
    { pfad: 'organisation', name: n('organisation'), gruppe: 'einstellungen', warn: organisation.stand?.neu ? String(organisation.stand.neu) : undefined, warnTitel: t('werkbank.organisation.notizen.titel') },
    { pfad: 'aufgaben', name: n('aufgaben'), gruppe: 'einstellungen', zahl: zahl(aufgaben.liste?.filter((a) => !a.erledigt).length, uebersicht.stand?.aufgaben.offen),
      // #798: Aufgaben bei Personen ohne Leserecht.
      warn: uebersicht.stand?.ohneLeserecht ? '!' : undefined, warnTitel: t('werkbank.ohne-leserecht.titel') },
    { pfad: 'anmeldeschutz', name: n('anmeldeschutz'), gruppe: 'einstellungen', zahl: anmeldeschutz.stand?.gesperrt.length || undefined },
    { pfad: 'designs', name: n('designs'), gruppe: 'einstellungen', zahl: d.designs.length || undefined },
    { pfad: 'anbindung', name: n('anbindung'), gruppe: 'einstellungen', warn: uebersicht.stand?.anbindung && (uebersicht.stand.anbindung.umgebung === 'abweichend' || uebersicht.stand.anbindung.neustartNoetig) ? '!' : undefined, warnTitel: t('werkbank.leiste.anbindung') },
    // Wartung und Fehlersuche
    { pfad: 'systemzustand', name: n('systemzustand'), gruppe: 'wartung', ...(uebersicht.stand?.speicherplatz && uebersicht.stand.speicherplatz.zustand !== 'ok'
      ? { warn: uebersicht.stand.speicherplatz.zustand === 'grenze' ? t('werkbank.leiste.speicher.voll') : t('werkbank.leiste.speicher.knapp'), warnTitel: t('werkbank.leiste.speicher') }
      // Auslastung (#409): CPU oder Arbeitsspeicher seit 5 Minuten über 90 %.
      : (systemlast.stand?.warnung.length || uebersicht.stand?.auslastung?.length) ? { warn: t('systemzustand.warnung.plakette'), warnTitel: t('systemzustand.warnung.leiste') } : {}) },
    { pfad: 'protokoll', name: n('protokoll'), gruppe: 'wartung', warn: protokoll.debug?.an ? t('werkbank.leiste.debug') : undefined, warnTitel: t('werkbank.leiste.debug.titel') },
    { pfad: 'fehlermeldungen', name: n('fehlermeldungen'), gruppe: 'wartung', warn: uebersicht.stand?.fehlermeldungen ? String(uebersicht.stand.fehlermeldungen) : undefined, warnTitel: t('werkbank.leiste.fehlermeldungen') },
    { pfad: 'wartung', name: n('wartung'), gruppe: 'wartung', warn: wartungsPlakette(wartungsmodus.stand?.stufe ?? 'aus', wartungsmodus.stand?.aktivAb ?? null), warnTitel: wartungAn ? t('werkbank.leiste.wartung.an') : t('werkbank.leiste.wartung.angekuendigt') },
    { pfad: 'demo', name: n('demo'), gruppe: 'wartung', zahl: Object.values(d.zaehler.typen).reduce((a, z) => a + z.demo, 0) || undefined },
  ];
  const zustand: Record<string, BereichZustand> = Object.fromEntries(eintraege.map((e) => [e.pfad, { warn: e.warn }]));
  if (bereich === 'ansicht') {
    rechts = <AnsichtPanel z={ansicht} zustand={zustand} />;
  }
  // Ohne Recht auf den Bereich (#818): weder Liste noch Seite – auch nicht über einen alten Link.
  if (!darf(bereich) && !umleitung) {
    liste = null;
    rechts = <div className="leer"><p>{t('konten.verwaltung.fehler.bereich')}</p></div>;
  }
  const eigene = eintraege.filter((e) => darf(e.pfad));

  return (
    <Dreiteilung ort="werkbank" ebene={werkbankEbene(bereich, id, !!installieren)} mitte={hatMitte(bereich)} offen={id}>
      <aside className="spalte sichten" aria-label={t('werkbank.werkbank.bereiche')}>
        <WerkbankNavigation bereich={bereich} eintraege={eigene} zeigen={ansicht.zeigen} benutzt={ansicht.stand?.benutzt} />
        {/* Freiwillig, ohne Gebühren für beide Seiten (GitHub Sponsors von persönlichen Konten). */}
        <a className="unterstuetzen" href="https://github.com/sponsors/motom001" target="_blank" rel="noreferrer">
          {tn('werkbank.werkbank.projekt-unterstuetzen', { symbol: <Symbol name="herz" />, span: <span className="leise klein">{t('werkbank.werkbank.freiwillig-betrag-frei-waehlbar')}</span> })}</a>
        <a className="unterstuetzen handbuchlink" href={handbuch('admin')} target="_blank" rel="noreferrer">{t('werkbank.handbuch.link')} <Symbol name="extern" /></a>
      </aside>
      <section className="spalte liste" aria-label={t('werkbank.werkbank.elemente')}>{liste}</section>
      <section className="spalte mappe" aria-label={t('werkbank.werkbank.bearbeitung')}>
        <Link to={werkbankZurueck(bereich)} className="verweis nur-schmal zur-liste"><Symbol name="pfeil-links" /> {hatMitte(bereich) ? t('werkbank.werkbank.zur-liste') : t('werkbank.werkbank.bereiche-2')}</Link>
        {rechts}
      </section>
    </Dreiteilung>
  );
}

/**
 * Mappentypen in der Mitte (#978): Suche wie in der Ablage (Baustein Suche) in Name, Beschreibung, Feldern, Trefferlisten,
 * Registern, Berechtigungen, Paket und übergeordnetem Typ; jeder Treffer zeigt, wo gefunden wurde. Filter nach Paket.
 */
function TypenListe({ offen, pakete }: { offen?: string; pakete: InstalliertesPaket[] }) {
  const d = useDaten();
  const z = useListenSuche(d.typen, {
    quellen: (typ) => quellenTyp(typ, { pakete, typen: d.typen, person: d.person }),
    herkunft: (typ) => paketVonTyp(typ, pakete),
  });
  return (
    <>
      <Listenkopf titel={t('werkbank.werkbank.mappentypen')} hilfe="werkbank.typen" beschreibung={t('werkbank.werkbank.welche-arten-von-mappen')}>
        <KnopfLink to="/werkbank/typen/neu" art="anlegen" groesse="klein">{t('werkbank.werkbank.neu')}</KnopfLink>
      </Listenkopf>
      {d.typen.length > 0 && (
        <ListenSuche wert={z.eingabe} setze={z.setEingabe} beschriftung={t('werkbank.listensuche.typen.beschriftung')} platzhalter={t('werkbank.listensuche.typen.platzhalter')} anker="werkbank.typen.suche"
          treffer={z.treffer.length} aktiv={z.aktiv} anzahl={t('werkbank.listensuche.typen.anzahl', { anzahl: d.typen.length })}
          filter={<PaketFilter wert={z.paket} setze={z.setPaket} pakete={paketWahl(z.paketeDa, pakete)} eigene={z.eigeneDa} />} />
      )}
      {!d.typen.length
        ? <p className="leise leerliste">{t('werkbank.werkbank.noch-keine-mappentypen')}</p>
        : !z.treffer.length && offen !== 'neu' ? <KeineTreffer zuruecksetzen={z.zuruecksetzen} />
        : <ul className="mappenliste">
            {offen === 'neu' && <li><span className="eintrag an werk"><span className="titel">{t('werkbank.werkbank.neuer-mappentyp')}</span><span className="unter">{t('werkbank.werkbank.noch-nicht-gespeichert')}</span></span></li>}
            {z.treffer.map(({ eintrag: mappentyp, funde, titel }) => {
              const zz = d.zaehler.typen[mappentyp.id];
              const anzahl = zz?.anzahl ?? 0;
              const unpassend = zz?.unpassend ?? 0;
              // Teile (#1031): „Teil von Rechnung“ – sie erscheinen in der Ablage nur an der übergeordneten Mappe.
              const eltern = d.typ(uebergeordneterTyp(mappentyp));
              return (
                <li key={mappentyp.id}>
                  <Link to={`/werkbank/typen/${mappentyp.id}`} className={`eintrag werk ${offen === mappentyp.id ? 'an' : ''}`}>
                    <span className="titel"><Hervorgehoben teile={titel} text={mappentyp.name} />{mappentyp.system && <span className="chip" title={t('werkbank.werkbank.systemmappentyp-laesst-sich')}>{t('werkbank.werkbank.system')}</span>}
                      <PaketChip paket={paketHerkunft(paketVonTyp(mappentyp, pakete), pakete)} inLink /></span>
                    <span className="unter">{t('werkbank.werkbank.felder-register', { felder: mappentyp.felder.length, register: mappentyp.register.length })}{d.zahlenDa && <> · {anzahl.toLocaleString(gebietsschema())} {t('werkbank.werkbank.mappen', { anzahl })}</>}
                      {eltern && <> · {t('werkbank.listensuche.teil-von', { name: typName(eltern) })}</>}</span>
                    {unpassend > 0 && <span className="problem">{t('werkbank.werkbank.passen-nicht-zur-definition', { unpassend })}</span>}
                    <Fundstellen funde={funde} />
                  </Link>
                </li>
              );
            })}
          </ul>}
      <GeloeschteEintraege art="typ" />
    </>
  );
}
